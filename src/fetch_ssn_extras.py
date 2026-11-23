#!/usr/bin/env python3
"""Descarga incremental y parser de las 5 fuentes estadísticas oficiales externas de la SSN."""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, urljoin

import requests

BASE_URL = "https://www.argentina.gob.ar"
RAW_EXTRAS_DIR = Path("data/raw_ssn_extras")
CACHE_META_PATH = RAW_EXTRAS_DIR / "_cache_meta.json"
OUT_JSON_PATH = Path("data/processed/ssn_extras.json")

SOURCES = {
    "retiro_est": {
        "title": "Información Estadística de Seguros de Retiro",
        "frequency": "Trimestral (jun/sep/dic/mar)",
        "page": f"{BASE_URL}/superintendencia-de-seguros/estadisticas/retiro-asegurados-rentistas-y-reservas-matematicas",
        "fallback_sid": "1E4ZfDP0F1GWQaTMisJITlbN-P5-YNg5yalLkWskDEG0",
        "fallback_sheet": "Hoja 1",
    },
    "tasa_testigo_rv": {
        "title": "Tasa Testigo Retiro Voluntario (Res. SSN 38.428)",
        "frequency": "Mensual",
        "page": f"{BASE_URL}/superintendencia-de-seguros/estadisticas/conjunto-de-inversiones-en-retiro-voluntario-tasa-testigo",
        "fallback_sid": "1NOlwyFDIKi7kK6TcLOD2Zbf7N4tssFqoDepwL4hte1Y",
        "fallback_sheet": "Hoja 1",
    },
    "prod_mensual": {
        "title": "Evolución de la Producción Mensual del Mercado",
        "frequency": "Mensual",
        "page": f"{BASE_URL}/superintendencia-de-seguros/estadisticas/mensual",
        "fallback_sid": "1gsq2uKPxLCRF4hSVhEgbVrzEA0fo1cDB_G_iQqU47iU",
        "fallback_sheet": "Hoja 1",
    },
    "canales_venta": {
        "title": "Canales de Venta de Seguros",
        "frequency": "Anual",
        "page": f"{BASE_URL}/superintendencia-de-seguros/estadisticas/canales-de-venta",
        "fallback_sid": "1tpZztFw_S1_hX_yfSr9UYzTdO1VTFt8yWa0y36Ud900",
        "fallback_sheet": "Hoja 1",
    },
    "polizas_sin_prim": {
        "title": "Pólizas, Siniestros y Primas",
        "frequency": "Trimestral",
        "page": f"{BASE_URL}/superintendencia-de-seguros/estadisticas/polizas-siniestros-y-primas",
        "fallback_sid": "1sVvysIOJ2vIX1LascXKNlaTlZao9JUtxUKRDeyadhz0",
        "fallback_sheet": "Hoja 1",
    },
}

MESES_ES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}
MESES_CORTOS = {
    1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr", 5: "May", 6: "Jun",
    7: "Jul", 8: "Ago", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic",
}


def norm_txt(val: Any) -> str:
    if val is None:
        return ""
    s = unicodedata.normalize("NFKD", str(val))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return " ".join(s.lower().split())


def to_float(val: Any) -> float | None:
    if val is None or isinstance(val, bool):
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if not s or s in ("--", "-", "—", "s/d", "S/D"):
        return None
    s = s.replace("%", "").replace("\xa0", "").strip()
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def to_int(val: Any) -> int | None:
    f = to_float(val)
    return int(round(f)) if f is not None else None


def col_to_idx(ref: str) -> int:
    m = re.match(r"([A-Z]+)", ref)
    if not m:
        return 0
    n = 0
    for ch in m.group(1):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def read_xlsx_any(data: bytes) -> dict[str, list[list[Any]]]:
    """Lector puro Python para XLSX (soporta Strict OOXML y Transitional OOXML)."""
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        names = set(zf.namelist())
        sst: list[str] = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in root:
                if si.tag.endswith("}si") or si.tag == "si":
                    sst.append("".join(el.text or "" for el in si.iter() if el.tag.endswith("}t") or el.tag == "t"))
        rels: dict[str, str] = {}
        if "xl/_rels/workbook.xml.rels" in names:
            for rel in ET.fromstring(zf.read("xl/_rels/workbook.xml.rels")):
                rid = rel.attrib.get("Id")
                tgt = rel.attrib.get("Target", "")
                if rid:
                    if not tgt.startswith("xl/"):
                        tgt = "xl/" + tgt.lstrip("/")
                    rels[rid] = tgt
        sheets: dict[str, list[list[Any]]] = {}
        wroot = ET.fromstring(zf.read("xl/workbook.xml"))
        for sh in wroot.iter():
            if not (sh.tag.endswith("}sheet") or sh.tag == "sheet"):
                continue
            sname = sh.attrib.get("name")
            rid = next((v for k, v in sh.attrib.items() if k.endswith("}id") or k == "r:id"), None)
            path = rels.get(rid) if rid else None
            if not sname or not path or path not in names:
                continue
            rows: list[list[Any]] = []
            sroot = ET.fromstring(zf.read(path))
            for row_el in sroot.iter():
                if not (row_el.tag.endswith("}row") or row_el.tag == "row"):
                    continue
                r_dict: dict[int, Any] = {}
                max_c = -1
                for c_el in row_el:
                    if not (c_el.tag.endswith("}c") or c_el.tag == "c"):
                        continue
                    ref = c_el.attrib.get("r", "")
                    ci = col_to_idx(ref) if ref else (max_c + 1)
                    ctype = c_el.attrib.get("t", "")
                    val: Any = None
                    if ctype == "inlineStr":
                        val = "".join(el.text or "" for el in c_el.iter() if el.tag.endswith("}t") or el.tag == "t")
                    else:
                        v_el = next((el for el in c_el if el.tag.endswith("}v") or el.tag == "v"), None)
                        if v_el is not None and v_el.text is not None:
                            txt = v_el.text
                            if ctype == "s":
                                idx = int(txt)
                                val = sst[idx] if 0 <= idx < len(sst) else txt
                            elif ctype in ("str", "b", "e"):
                                val = txt
                            else:
                                try:
                                    f = float(txt)
                                    val = int(f) if f.is_integer() and "." not in txt and "e" not in txt.lower() else f
                                except ValueError:
                                    val = txt
                    if val is not None:
                        r_dict[ci] = val
                        if ci > max_c:
                            max_c = ci
                if max_c >= 0:
                    rows.append([r_dict.get(i) for i in range(max_c + 1)])
            sheets[sname] = rows
        return sheets


def discover_sheet_config(session: requests.Session, src_key: str) -> tuple[str, str, str | None]:
    cfg = SOURCES[src_key]
    sid, sheet, api_key = cfg["fallback_sid"], cfg["fallback_sheet"], None
    try:
        r = session.get(cfg["page"], timeout=20)
        r.raise_for_status()
        html = r.text
        m_id = re.search(r"(?:spreadsheetID\s*=\s*['\"]|\"idSpread\"\s*:\s*['\"])([^'\"]+)", html)
        m_sh = re.search(r"(?:encodeURIComponent\(['\"]|\"hojaNombre\"\s*:\s*['\"])([^'\"]+)", html)
        m_key = re.search(r"key=([A-Za-z0-9_\-]+)", html)
        if m_id:
            sid = m_id.group(1)
        if m_sh:
            sheet = m_sh.group(1)
        if m_key:
            api_key = m_key.group(1)
    except Exception:
        pass
    return sid, sheet, api_key


def fetch_google_sheet_rows(session: requests.Session, src_key: str) -> list[list[str]]:
    sid, sheet, api_key = discover_sheet_config(session, src_key)
    if api_key:
        try:
            url = f"https://sheets.googleapis.com/v4/spreadsheets/{sid}/values/{quote(sheet)}?alt=json&key={api_key}"
            r = session.get(url, timeout=25)
            r.raise_for_status()
            vals = r.json().get("values", [])
            if vals:
                return vals
        except Exception:
            pass
    # Fallback / public gviz CSV export (also works for PonchoTable without explicit key)
    csv_url = f"https://docs.google.com/spreadsheets/d/{sid}/gviz/tq?tqx=out:csv&sheet={quote(sheet)}"
    r = session.get(csv_url, timeout=25)
    r.raise_for_status()
    return list(csv.reader(io.StringIO(r.text)))


def is_valid_xlsx_file(path: Path) -> bool:
    if not path.exists() or path.stat().st_size < 1024:
        return False
    try:
        with zipfile.ZipFile(path, "r") as zf:
            return zf.testzip() is None and "xl/workbook.xml" in zf.namelist()
    except (zipfile.BadZipFile, OSError):
        return False


def _load_cache_meta() -> dict[str, Any]:
    if CACHE_META_PATH.exists():
        try:
            return json.loads(CACHE_META_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_cache_meta(meta: dict[str, Any]) -> None:
    CACHE_META_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def _head_url_meta(session: requests.Session, full_url: str) -> dict[str, Any] | None:
    try:
        hr = session.head(full_url, timeout=15, allow_redirects=True)
        if hr.status_code >= 400:
            return None
        cl_raw = hr.headers.get("Content-Length")
        cl = int(cl_raw) if cl_raw and cl_raw.strip().isdigit() else None
        return {
            "etag": hr.headers.get("ETag"),
            "last_modified": hr.headers.get("Last-Modified"),
            "content_length": cl,
        }
    except Exception:
        return None


def download_cached_xlsx(
    session: requests.Session,
    src_key: str,
    href: str,
    force: bool = False,
    cache_meta: dict[str, Any] | None = None,
) -> Path:
    href = href.strip()
    full_url = urljoin(BASE_URL, href)
    fname = Path(href.split("?")[0]).name
    dest_dir = RAW_EXTRAS_DIR / src_key
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / fname
    meta_key = f"{src_key}/{fname}"
    local_meta = cache_meta if cache_meta is not None else _load_cache_meta()
    prev_entry = local_meta.get(meta_key, {})
    had_valid = is_valid_xlsx_file(dest)
    was_rectified = False

    if not force and had_valid:
        head_info = _head_url_meta(session, full_url)
        if head_info is None:
            return dest
        local_sz = dest.stat().st_size
        cl_changed = head_info["content_length"] is not None and head_info["content_length"] != local_sz
        etag_changed = bool(head_info["etag"] and prev_entry.get("etag") and head_info["etag"] != prev_entry.get("etag"))
        lm_changed = bool(head_info["last_modified"] and prev_entry.get("last_modified") and head_info["last_modified"] != prev_entry.get("last_modified"))
        if not (cl_changed or etag_changed or lm_changed):
            local_meta[meta_key] = {
                "etag": head_info["etag"] or prev_entry.get("etag"),
                "last_modified": head_info["last_modified"] or prev_entry.get("last_modified"),
                "content_length": head_info["content_length"] if head_info["content_length"] is not None else local_sz,
                "url": full_url,
                "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            if cache_meta is None:
                _save_cache_meta(local_meta)
            return dest
        was_rectified = True

    part = dest_dir / f"{fname}.part"
    try:
        r = session.get(full_url, timeout=60)
        r.raise_for_status()
        part.write_bytes(r.content)
        if not is_valid_xlsx_file(part):
            raise RuntimeError(f"El archivo {fname} no es un .xlsx íntegro")
        os.replace(part, dest)
        cl_hdr = r.headers.get("Content-Length")
        local_meta[meta_key] = {
            "etag": r.headers.get("ETag"),
            "last_modified": r.headers.get("Last-Modified"),
            "content_length": int(cl_hdr) if cl_hdr and cl_hdr.strip().isdigit() else dest.stat().st_size,
            "url": full_url,
            "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        if cache_meta is None:
            _save_cache_meta(local_meta)
        tag = "[rectificado en SSN]" if was_rectified else "[nuevo]"
        print(f"    -> Descargado {src_key}/{fname} {tag} ({dest.stat().st_size / 1024:.1f} KB)")
        return dest
    except Exception:
        if part.exists():
            part.unlink()
        if had_valid and not force and was_rectified:
            print(f"  [aviso] Re-descarga de {fname} falló; usando caché local previo.")
            return dest
        raise


def parse_month_es(val: Any) -> int | None:
    s = norm_txt(val)
    for k, m in MESES_ES.items():
        if k in s:
            return m
    return None


def parse_trim_es(val: Any) -> int | None:
    s = norm_txt(val)
    m = re.search(r"([1-4])", s)
    if m:
        return int(m.group(1))
    return parse_month_es(s) // 3 if parse_month_es(s) else None


def parse_month_year_cell(val: Any, cur_year: int | None) -> tuple[int | None, int | None]:
    s = norm_txt(val)
    if not s:
        return cur_year, None
    my = re.search(r"\b(20\d{2})\b", s)
    y = int(my.group(1)) if my else cur_year
    m = parse_month_es(s)
    return y, m


# ==================== PARSER 1: TASA TESTIGO RETIRO VOLUNTARIO ====================
def parse_tasa_testigo_rv(rows: list[list[str]]) -> dict[str, Any]:
    if not rows:
        raise ValueError("Planilla tasa_testigo_rv vacía")
    hdr = [norm_txt(c) for c in rows[0]]
    i_y = next((i for i, c in enumerate(hdr) if c.startswith("ano") or "year" in c), 0)
    i_m = next((i for i, c in enumerate(hdr) if c == "mes"), 1)
    i_com = next((i for i, c in enumerate(hdr) if "comunic" in c), 2)
    i_t = next((i for i, c in enumerate(hdr) if "tasa" in c), 3)

    items: dict[tuple[int, int], dict[str, Any]] = {}
    for row in rows[1:]:
        if len(row) <= max(i_y, i_m, i_t):
            continue
        y = to_int(row[i_y])
        m = parse_month_es(row[i_m])
        tasa = to_float(row[i_t])
        if y is None or m is None or tasa is None:
            continue
        com = urljoin(BASE_URL, str(row[i_com]).strip()) if len(row) > i_com and str(row[i_com]).strip().startswith("/") else (str(row[i_com]).strip() if len(row) > i_com else "")
        items[(y, m)] = {
            "ym": f"{y:04d}-{m:02d}",
            "y": y,
            "m": m,
            "label": f"{MESES_CORTOS[m]} {y}",
            "tasa": round(tasa, 4),
            "tea": round(((1.0 + tasa / 100.0) ** 12 - 1.0) * 100.0, 2),
            "circular_url": com,
        }

    series = [items[k] for k in sorted(items.keys())]
    for idx, pt in enumerate(series):
        if idx >= 11:
            acc = 1.0
            for j in range(idx - 11, idx + 1):
                acc *= (1.0 + series[j]["tasa"] / 100.0)
            pt["ltm"] = round((acc - 1.0) * 100.0, 2)
        else:
            pt["ltm"] = None
    last = series[-1]
    return {
        "latest_ym": last["ym"],
        "latest_label": last["label"],
        "latest_tasa": last["tasa"],
        "latest_tea": last["tea"],
        "latest_ltm": last["ltm"],
        "count": len(series),
        "series": series,
    }


# ==================== PARSER 2: PRODUCCION MENSUAL ====================
def _parse_pm_sheet_series(rows: list[list[Any]], is_const: bool) -> dict[tuple[int, int], dict[str, float | None]]:
    # Localiza los 3 bloques paralelos por filas de encabezado "Meses"
    header_row_idx = next((i for i, r in enumerate(rows[:8]) if r and norm_txt(r[0]).startswith("meses")), 2)
    hrow = rows[header_row_idx]
    mes_cols = [i for i, c in enumerate(hrow) if norm_txt(c).startswith("meses")]
    if len(mes_cols) < 3:
        raise ValueError(f"No se detectaron los 3 cuadros de Producción Mensual (mes_cols={mes_cols})")
    c1, c2, c3 = mes_cols[0], mes_cols[1], mes_cols[2]

    # Buscar columnas de cada cuadro combinando filas header_row_idx .. header_row_idx+3
    def block_text(ci: int) -> str:
        return " ".join(norm_txt(rows[ri][ci]) for ri in range(header_row_idx, min(len(rows), header_row_idx + 4)) if ci < len(rows[ri]))

    if is_const:
        # En SERIE CONSTANTES cada serie tiene par (millones $, var. %). Buscar columnas "millones $"
        def val_cols(start: int, end: int | None) -> list[tuple[int, str]]:
            hi = end if end is not None else len(rows[min(header_row_idx + 3, len(rows) - 1)]) + 4
            out = []
            for ci in range(start + 1, hi):
                bt = block_text(ci)
                if "millones" in bt:
                    out.append((ci, bt))
            return out

        vc1 = val_cols(c1, c2)
        vc2 = val_cols(c2, c3)
        vc3 = val_cols(c3, None)
        col_tot, col_pat, col_vo, col_ret1 = vc1[0][0], vc1[1][0], vc1[2][0], vc1[3][0]
        col_auto = next((ci for ci, t in vc2 if "automotor" in t), vc2[1][0])
        col_tpp = next((ci for ci, t in vc2 if "transporte" in t), vc2[2][0])
        col_rc = next((ci for ci, t in vc2 if "responsabilidad" in t), vc2[3][0])
        col_art = next((ci for ci, t in vc2 if "riesgos" in t or "trabajo" in t), vc2[4][0])
        col_rpat = next((ci for ci, t in vc2 if "resto" in t), vc2[5][0])
        col_ptot = next((ci for ci, t in vc3 if "total" in t), vc3[0][0])
        col_vind = next((ci for ci, t in vc3 if "individual" in t), vc3[1][0])
        col_vcol = next((ci for ci, t in vc3 if "colectivo" in t), vc3[2][0])
        col_rpers = next((ci for ci, t in vc3 if "resto" in t), vc3[3][0])
        col_ret3 = next((ci for ci, t in vc3 if "retiro" in t), vc3[4][0])
    else:
        # En SERIE CORRIENTES Cuadro 1 tiene Mensual / Trimestral / Anual por grupo; Cuadros 2 y 3 son directos
        col_tot = next(ci for ci in range(c1 + 1, c2) if "total" in block_text(ci) and "mensual" in block_text(ci))
        col_pat = next(ci for ci in range(c1 + 1, c2) if "patrimoniales" in block_text(ci) and "mensual" in block_text(ci))
        col_vo = next(ci for ci in range(c1 + 1, c2) if "vida" in block_text(ci) and "mensual" in block_text(ci))
        col_ret1 = next(ci for ci in range(c1 + 1, c2) if "retiro" in block_text(ci) and "mensual" in block_text(ci))

        col_auto = next(ci for ci in range(c2 + 1, c3) if "automotor" in block_text(ci))
        col_tpp = next(ci for ci in range(c2 + 1, c3) if "transporte" in block_text(ci))
        col_rc = next(ci for ci in range(c2 + 1, c3) if "responsabilidad" in block_text(ci))
        col_art = next(ci for ci in range(c2 + 1, c3) if "trabajo" in block_text(ci))
        col_rpat = next(ci for ci in range(c2 + 1, c3) if "resto" in block_text(ci))

        max_c3 = max(len(r) for r in rows[header_row_idx:header_row_idx + 6])
        col_ptot = next(ci for ci in range(c3 + 1, max_c3) if "total" in block_text(ci))
        col_vind = next(ci for ci in range(c3 + 1, max_c3) if "individual" in block_text(ci))
        col_vcol = next(ci for ci in range(c3 + 1, max_c3) if "colectivo" in block_text(ci))
        col_rpers = next(ci for ci in range(c3 + 1, max_c3) if "resto" in block_text(ci))
        col_ret3 = next(ci for ci in range(c3 + 1, max_c3) if "retiro" in block_text(ci))

    def cell(row: list[Any], idx: int) -> float | None:
        return round(to_float(row[idx]), 2) if idx < len(row) and to_float(row[idx]) is not None else None

    out: dict[tuple[int, int], dict[str, float | None]] = {}
    cur_y: int | None = None
    prev_m: int | None = None
    for row in rows[header_row_idx + 1:]:
        if not row or c1 >= len(row):
            continue
        raw_cell = row[c1]
        txt0 = norm_txt(raw_cell)
        if not txt0 or txt0.startswith("(") or "datos ajustados" in txt0:
            continue
        has_explicit_yr = bool(re.search(r"\b20\d{2}\b", txt0))
        cur_y, m = parse_month_year_cell(raw_cell, cur_y)
        if cur_y is None or m is None:
            continue
        if not has_explicit_yr and prev_m is not None and m < prev_m:
            cur_y += 1
        prev_m = m
        tot_v = cell(row, col_tot)
        if tot_v is None:
            continue
        out[(cur_y, m)] = {
            "tot": tot_v,
            "pat": cell(row, col_pat),
            "pers_vida_otr": cell(row, col_vo),
            "retiro": cell(row, col_ret3) if cell(row, col_ret3) is not None else cell(row, col_ret1),
            "auto": cell(row, col_auto),
            "tpp": cell(row, col_tpp),
            "rc": cell(row, col_rc),
            "art": cell(row, col_art),
            "resto_pat": cell(row, col_rpat),
            "pers_tot": cell(row, col_ptot),
            "vida_ind": cell(row, col_vind),
            "vida_col": cell(row, col_vcol),
            "resto_pers": cell(row, col_rpers),
        }
    return out


def parse_prod_mensual(xlsx_path: Path) -> dict[str, Any]:
    sheets = read_xlsx_any(xlsx_path.read_bytes())
    sh_corr = next((k for k in sheets if "corriente" in norm_txt(k)), None)
    sh_const = next((k for k in sheets if "constante" in norm_txt(k)), None)
    if not sh_corr or not sh_const:
        raise ValueError(f"Hojas faltantes en {xlsx_path.name}: {list(sheets.keys())}")
    d_corr = _parse_pm_sheet_series(sheets[sh_corr], is_const=False)
    d_const = _parse_pm_sheet_series(sheets[sh_const], is_const=True)
    keys = sorted(set(d_corr.keys()) | set(d_const.keys()))
    series = []
    for y, m in keys:
        co = d_corr.get((y, m))
        ct = d_const.get((y, m))
        ipc_idx = None
        if co and ct and co.get("tot") and ct.get("tot") and ct["tot"] > 0:
            ipc_idx = round((co["tot"] / ct["tot"]) * 100.0, 4)
        series.append({
            "ym": f"{y:04d}-{m:02d}",
            "y": y,
            "m": m,
            "label": f"{MESES_CORTOS[m]} {y}",
            "ipc_idx": ipc_idx,
            "corr": co,
            "const": ct,
        })
    last = series[-1]
    return {
        "latest_ym": last["ym"],
        "latest_label": last["label"],
        "const_base_label": last["label"],
        "file_name": xlsx_path.name,
        "count": len(series),
        "series": series,
    }


# ==================== PARSER 3: ESTADISTICA RETIRO ====================
def _parse_retiro_demo_sheet(rows: list[list[Any]]) -> tuple[dict, dict[str, dict], dict[str, dict]]:
    def pack_row(r: list[Any]) -> dict[str, Any]:
        def tri(s: int) -> list[int]:
            return [to_int(r[s]) or 0, to_int(r[s + 1]) or 0, to_int(r[s + 2]) or 0]
        return {
            "tot": to_int(r[2]) or 0,
            "m": to_int(r[3]) or 0,
            "v": to_int(r[4]) or 0,
            "b1": tri(5),
            "b2": tri(8),
            "b3": tri(11),
            "b4": tri(14),
        }

    total_row: dict[str, Any] = {}
    ind_map: dict[str, dict] = {}
    col_map: dict[str, dict] = {}
    section = None
    for r in rows:
        if not r or len(r) < 3:
            continue
        joined = " ".join(norm_txt(x) for x in r if x is not None)
        if "retiro individual" in joined:
            section = "ind"
            continue
        if "retiro colectivo" in joined:
            section = "col"
            continue
        c0, c1 = r[0], norm_txt(r[1] if len(r) > 1 else "")
        if c1 == "total" and section is None and len(r) >= 17:
            total_row = pack_row(r)
        elif c0 is not None and to_int(c0) is not None and len(r) >= 17 and section in ("ind", "col"):
            cod = f"{to_int(c0):04d}"
            (ind_map if section == "ind" else col_map)[cod] = pack_row(r)
    return total_row, ind_map, col_map


def parse_retiro_est(xlsx_path: Path, year_hint: int | None, month_hint: int | None) -> dict[str, Any]:
    sheets = read_xlsx_any(xlsx_path.read_bytes())
    sh_rm = next((k for k in sheets if "res" in norm_txt(k) and "mat" in norm_txt(k) and "serie" not in norm_txt(k)), None)
    sh_pol = next((k for k in sheets if "pol" in norm_txt(k) and "cert" in norm_txt(k)), None)
    sh_aseg = next((k for k in sheets if "aseg" in norm_txt(k) and "serie" not in norm_txt(k)), None)
    sh_rent = next((k for k in sheets if "rentistas" in norm_txt(k) and "indiv" in norm_txt(k)), None)
    sh_prev = next((k for k in sheets if "rentistas" in norm_txt(k) and "previsional" in norm_txt(k)), None)
    sh_art = next((k for k in sheets if "rentistas" in norm_txt(k) and "art" in norm_txt(k)), None)
    sh_sc = next((k for k in sheets if "serie" in norm_txt(k) and "cantidad" in norm_txt(k)), None)
    sh_sr = next((k for k in sheets if "serie" in norm_txt(k) and "res" in norm_txt(k)), None)

    if not sh_rm or not sh_pol or not sh_aseg:
        raise ValueError(f"Hojas faltantes en {xlsx_path.name}: {list(sheets.keys())}")

    def gfloat(r: list[Any], idx: int) -> float:
        v = to_float(r[idx]) if idx < len(r) else None
        return round(v, 3) if v is not None else 0.0

    def gint(r: list[Any], idx: int) -> int:
        v = to_int(r[idx]) if idx < len(r) else None
        return v if v is not None else 0

    def pack_rm(r: list[Any]) -> dict[str, float]:
        return {
            "total": gfloat(r, 2),
            "ahorro_tot": gfloat(r, 3),
            "ahorro_ind": gfloat(r, 4),
            "ahorro_col": gfloat(r, 5),
            "renta_vol_tot": gfloat(r, 6),
            "renta_vol_ind": gfloat(r, 7),
            "renta_vol_col": gfloat(r, 8),
            "renta_prev": gfloat(r, 9),
            "renta_art": gfloat(r, 10),
            "otros": gfloat(r, 13),
        }

    rm_tot: dict[str, float] = {}
    entities_rm: dict[str, tuple[str, dict[str, float]]] = {}
    as_of_text = ""
    for r in sheets[sh_rm]:
        if not r:
            continue
        t0 = str(r[0] or "").strip()
        if t0.lower().startswith("al ") and not as_of_text:
            as_of_text = t0
        if len(r) > 2 and norm_txt(r[1]) == "total":
            rm_tot = pack_rm(r)
        elif to_int(r[0]) is not None and len(r) >= 10:
            cod = f"{to_int(r[0]):04d}"
            nom = re.sub(r"\s*\(\d+\)\s*$", "", str(r[1] or "").strip())
            entities_rm[cod] = (nom, pack_rm(r))

    def pack_pol(r: list[Any]) -> dict[str, int]:
        return {
            "ahorro_ind_pol": gint(r, 2),
            "ahorro_col_pol": gint(r, 3),
            "ahorro_col_cert": gint(r, 4),
            "renta_ind_pol": gint(r, 5),
            "renta_col_cert": gint(r, 6),
        }

    pol_tot: dict[str, int] = {}
    pol_by_cod: dict[str, dict[str, int]] = {}
    for r in sheets[sh_pol]:
        if not r or len(r) < 6:
            continue
        if norm_txt(r[1]) == "total":
            pol_tot = pack_pol(r)
        elif to_int(r[0]) is not None:
            pol_by_cod[f"{to_int(r[0]):04d}"] = pack_pol(r)

    aseg_tot, aseg_ind, aseg_col = _parse_retiro_demo_sheet(sheets[sh_aseg])
    rent_tot, rent_ind, rent_col = _parse_retiro_demo_sheet(sheets[sh_rent]) if sh_rent else ({}, {}, {})

    def parse_simple_tot(sh_name: str | None) -> tuple[int, dict[str, int]]:
        tot_v, mp = 0, {}
        if not sh_name:
            return tot_v, mp
        for r in sheets[sh_name]:
            if not r or len(r) < 3:
                continue
            if norm_txt(r[1]) == "total":
                tot_v = gint(r, 2)
            elif to_int(r[0]) is not None:
                mp[f"{to_int(r[0]):04d}"] = gint(r, 2)
        return tot_v, mp

    prev_tot, prev_by_cod = parse_simple_tot(sh_prev)
    art_tot, art_by_cod = parse_simple_tot(sh_art)

    entities = []
    for cod, (nom, rm_d) in entities_rm.items():
        entities.append({
            "cod": cod,
            "nombre": nom,
            "is_ls": cod == "0436",
            "rm": rm_d,
            "pol": pol_by_cod.get(cod, {}),
            "aseg_ind": aseg_ind.get(cod, {}),
            "aseg_col": aseg_col.get(cod, {}),
            "rent_vol_ind": rent_ind.get(cod, {}),
            "rent_vol_col": rent_col.get(cod, {}),
            "rent_prev_tot": prev_by_cod.get(cod, 0),
            "rent_art_tot": art_by_cod.get(cod, 0),
        })
    entities.sort(key=lambda e: e["rm"]["total"], reverse=True)

    # Series anuales (Hojas 7 y 8)
    serie_by_yr: dict[int, dict[str, Any]] = {}
    if sh_sc:
        rows_sc = sheets[sh_sc]
        ej_idx = next((i for i, r in enumerate(rows_sc) if r and norm_txt(r[0]) == "ejercicio"), None)
        if ej_idx is not None:
            yr_cols = [(ci, to_int(v)) for ci, v in enumerate(rows_sc[ej_idx]) if ci > 0 and to_int(v) and 2005 <= to_int(v) <= 2050]
            for _, yr in yr_cols:
                serie_by_yr.setdefault(yr, {"anio": yr})
            sec_mode = None
            for r in rows_sc[ej_idx + 1:]:
                if not r:
                    continue
                lbl_raw = str(r[0] or "")
                lbl = norm_txt(lbl_raw)
                if not lbl or lbl == "ejercicio":
                    continue
                if lbl == "asegurados":
                    sec_mode = "aseg"
                    continue
                if lbl == "rentistas":
                    sec_mode = "rent"
                    continue
                key = None
                if "entidades exclusivas" in lbl:
                    key = "entidades"
                elif "asegurados y rentistas" in lbl:
                    key = "tot_aseg_rent"
                elif lbl == "retiro":
                    key = "aseg_tot"
                elif lbl == "renta vitalicia":
                    key = "rent_vol_tot"
                elif "previsional" in lbl:
                    key = "rent_prev_tot"
                elif "riesgos" in lbl:
                    key = "rent_art_tot"
                elif lbl == "individual" and sec_mode == "aseg":
                    key = "aseg_ind"
                elif lbl == "colectivo" and sec_mode == "aseg":
                    key = "aseg_col"
                elif lbl == "individual" and sec_mode == "rent":
                    key = "rent_vol_ind"
                elif lbl == "colectivo" and sec_mode == "rent":
                    key = "rent_vol_col"
                if key:
                    for ci, yr in yr_cols:
                        if ci < len(r) and to_int(r[ci]) is not None:
                            serie_by_yr[yr][key] = to_int(r[ci])

    if sh_sr:
        rows_sr = sheets[sh_sr]
        ej_idx = next((i for i, r in enumerate(rows_sr) if r and norm_txt(r[0]) == "ejercicio"), None)
        if ej_idx is not None:
            yr_cols = [(ci, to_int(v)) for ci, v in enumerate(rows_sr[ej_idx]) if ci > 0 and to_int(v) and 2005 <= to_int(v) <= 2050]
            for _, yr in yr_cols:
                serie_by_yr.setdefault(yr, {"anio": yr})
            sec_mode = None
            for r in rows_sr[ej_idx + 1:]:
                if not r:
                    continue
                lbl = norm_txt(r[0])
                if not lbl or lbl == "ejercicio":
                    continue
                if lbl == "periodo de ahorro":
                    sec_mode = "ahorro"
                    continue
                if lbl == "periodo de renta":
                    sec_mode = "renta"
                    continue
                key = None
                if "total reservas" in lbl:
                    key = "rm_total"
                elif lbl == "retiro":
                    key = "rm_ahorro_tot"
                elif lbl == "individual" and sec_mode == "ahorro":
                    key = "rm_ahorro_ind"
                elif lbl == "colectivo" and sec_mode == "ahorro":
                    key = "rm_ahorro_col"
                elif lbl == "renta vitalicia":
                    key = "rm_renta_vol"
                elif lbl == "renta vitalicia previsional":
                    key = "rm_prev"
                elif lbl == "renta riesgos del trabajo":
                    key = "rm_art"
                elif lbl == "otros":
                    key = "rm_otros"
                if key:
                    for ci, yr in yr_cols:
                        if ci < len(r) and to_float(r[ci]) is not None:
                            serie_by_yr[yr][key] = round(to_float(r[ci]), 1)

    serie_anual = [serie_by_yr[y] for y in sorted(serie_by_yr.keys())]

    y_fin, m_fin = year_hint, month_hint
    if as_of_text:
        m_as = parse_month_es(as_of_text)
        y_as = re.search(r"(20\d{2})", as_of_text)
        if m_as and y_as:
            y_fin, m_fin = int(y_as.group(1)), m_as
    periodo_id = f"{y_fin}-{(m_fin // 3)}" if (y_fin and m_fin and m_fin in (3, 6, 9, 12)) else ""
    as_of_label = f"{MESES_CORTOS[m_fin]} {y_fin}" if (y_fin and m_fin) else as_of_text

    return {
        "as_of_label": as_of_label,
        "as_of_text": as_of_text,
        "periodo_id": periodo_id,
        "file_name": xlsx_path.name,
        "totals": {
            "rm": rm_tot,
            "pol": pol_tot,
            "aseg_tot": aseg_tot,
            "rent_vol_tot": rent_tot,
            "rent_prev_tot": prev_tot,
            "rent_art_tot": art_tot,
        },
        "entities": entities,
        "serie_anual": serie_anual,
    }


# ==================== PARSER 4: CANALES DE VENTA ====================
def _match_canal_key(lbl: str) -> str | None:
    s = norm_txt(lbl)
    if s == "total":
        return None
    if "venta directa" in s or s == "directa":
        return "directa"
    if "fisic" in s:
        return "pas_pf"
    if "sociedades" in s:
        return "soc_prod"
    if s.startswith("agentes institorios"):
        return "inst_tot"
    if "bancos" in s:
        return "inst_bancos"
    if "cooperativas" in s:
        return "inst_coop"
    if "otras personas" in s:
        return "inst_otras"
    return None


def _finalize_canal_bucket(b: dict[str, float]) -> dict[str, float]:
    out = {
        "directa": round(b.get("directa", 0.0), 2),
        "pas_pf": round(b.get("pas_pf", 0.0), 2),
        "soc_prod": round(b.get("soc_prod", 0.0), 2),
        "inst_tot": round(b.get("inst_tot", 0.0), 2),
        "inst_bancos": round(b.get("inst_bancos", 0.0), 2),
        "inst_coop": round(b.get("inst_coop", 0.0), 2),
        "inst_otras": round(b.get("inst_otras", 0.0), 2),
    }
    if out["inst_tot"] == 0.0:
        out["inst_tot"] = round(out["inst_bancos"] + out["inst_coop"] + out["inst_otras"], 2)
    return out


def parse_canales_venta_file(xlsx_path: Path, is_latest: bool) -> dict[str, Any]:
    sheets = read_xlsx_any(xlsx_path.read_bytes())
    sh12 = next((k for k in sheets if re.search(r"cuadro.*1.*2", norm_txt(k))), None)
    sh34 = next((k for k in sheets if re.search(r"cuadro.*3.*4", norm_txt(k))), None)
    sh_jur = next((k for k in sheets if "juris" in norm_txt(k) or "jurid" in norm_txt(k)), None)
    sh_c7 = next((k for k in sheets if re.search(r"cuadro.*7\b", norm_txt(k))), None)
    sh_c8 = next((k for k in sheets if re.search(r"cuadro.*8\b", norm_txt(k))), None)
    sh_c10 = next((k for k in sheets if re.search(r"cuadro.*10\b", norm_txt(k))), None)

    por_ramo: dict[str, dict[str, dict[str, float]]] = {}
    if sh12:
        rows = sheets[sh12]
        # Buscar la fila "Canales de Venta" correspondiente al Cuadro 2 (% sobre Agrupamiento de Ramos)
        hdr_indices = [i for i, r in enumerate(rows) if r and norm_txt(r[0]) == "canales de venta"]
        c2_idx = next((i for i in hdr_indices if i > 0 and any("agrupamiento" in norm_txt(rows[k][0]) for k in range(max(0, i - 4), i) if rows[k])), hdr_indices[-1] if hdr_indices else None)
        if c2_idx is not None:
            yrs_row = rows[c2_idx]
            yrs_cols = [(ci, to_int(re.search(r"(20\d{2})", str(v)).group(1))) for ci, v in enumerate(yrs_row) if v and re.search(r"20\d{2}", str(v))]
            sub_row = rows[c2_idx + 1] if c2_idx + 1 < len(rows) else []
            # Each year covers columns starting at ci until next year
            col_map_by_y: dict[int, dict[str, int]] = {}
            for idx_y, (ci_start, yr) in enumerate(yrs_cols):
                ci_end = yrs_cols[idx_y + 1][0] if idx_y + 1 < len(yrs_cols) else len(sub_row)
                mp: dict[str, int] = {}
                for ci in range(ci_start, ci_end):
                    if ci < len(sub_row):
                        t = norm_txt(sub_row[ci])
                        if "patrimonial" in t:
                            mp["patrimoniales"] = ci
                        elif "personas" in t:
                            mp["personas"] = ci
                        elif "total" in t:
                            mp["total"] = ci
                col_map_by_y[yr] = mp
                por_ramo[str(yr)] = {k: {} for k in ("patrimoniales", "personas", "total")}
            for r in rows[c2_idx + 2:]:
                if not r or not r[0]:
                    continue
                ck = _match_canal_key(r[0])
                if not ck:
                    continue
                for yr, mp in col_map_by_y.items():
                    for seg, ci in mp.items():
                        v = to_float(r[ci]) if ci < len(r) else None
                        if v is not None:
                            por_ramo[str(yr)][seg][ck] = v
            for yk in list(por_ramo.keys()):
                for seg in list(por_ramo[yk].keys()):
                    por_ramo[yk][seg] = _finalize_canal_bucket(por_ramo[yk][seg])

    por_act: dict[str, dict[str, dict[str, float]]] = {}
    if sh34:
        rows = sheets[sh34]
        for i, r in enumerate(rows):
            if not r or norm_txt(r[0]) != "canales de venta":
                continue
            yr = None
            for k in range(max(0, i - 3), i):
                if rows[k]:
                    joined = " ".join(str(x) for x in rows[k] if x is not None)
                    m_y = re.search(r"Ejercicio\s+(20\d{2})", joined, re.I)
                    if m_y:
                        yr = m_y.group(1)
                        break
            if not yr or i + 1 >= len(rows):
                continue
            cols_r = rows[i + 1]
            # Order of columns in Cuadro 3 & 4: ART, Pat Excl, Mixtas Pat, Mixtas Pers, Retiro Excl, Pers Excl, Total
            seg_cols: dict[str, int] = {}
            seen_pers = 0
            seen_pat = 0
            for ci, cell in enumerate(cols_r):
                t = norm_txt(cell)
                if not t:
                    continue
                if "trabajo" in t:
                    seg_cols["art"] = ci
                elif "danos" in t:
                    seg_cols["pat_excl"] = ci
                elif "patrimonial" in t:
                    seen_pat += 1
                    seg_cols["mix_pat"] = ci
                elif "personas" in t:
                    seen_pers += 1
                    seg_cols["mix_pers" if seen_pers == 1 else "pers_excl"] = ci
                elif "retiro" in t:
                    seg_cols["retiro_excl"] = ci
                elif "total" in t:
                    seg_cols["total"] = ci
            por_act[yr] = {seg: {} for seg in seg_cols}
            for rr in rows[i + 2:]:
                if not rr or not rr[0]:
                    continue
                t0 = norm_txt(rr[0])
                if "participacion" in t0 or "ejercicio" in t0 or t0.startswith("(*)"):
                    break
                ck = _match_canal_key(rr[0])
                if not ck:
                    continue
                for seg, ci in seg_cols.items():
                    v = to_float(rr[ci]) if ci < len(rr) else None
                    if v is not None:
                        por_act[yr][seg][ck] = v
            for seg in list(por_act[yr].keys()):
                por_act[yr][seg] = _finalize_canal_bucket(por_act[yr][seg])

    jurisdicciones: list[dict[str, Any]] = []
    red_prod: dict[str, Any] = {}
    if is_latest:
        def _norm_prov(raw: Any) -> str:
            pn = norm_txt(raw).replace(".", "").strip()
            if "ciudad aut" in pn or pn == "caba":
                return "caba"
            if pn.startswith("sgo del estero") or "santiago del estero" in pn:
                return "santiago del estero"
            return pn

        jur_money: dict[str, dict[str, float]] = {}
        if sh_jur:
            rows = sheets[sh_jur]
            h_i = next((i for i, r in enumerate(rows) if r and norm_txt(r[0]).startswith("jurisd")), None)
            if h_i is not None and h_i + 1 < len(rows):
                # Prefer latest year block (last 3 columns: Pat, Personas, Total)
                sub = rows[h_i + 1]
                pers_cols = [ci for ci, c in enumerate(sub) if "personas" in norm_txt(c)]
                pat_cols = [ci for ci, c in enumerate(sub) if "patrimonial" in norm_txt(c)]
                tot_cols = [ci for ci, c in enumerate(sub) if "total" in norm_txt(c)]
                c_pers = pers_cols[-1] if pers_cols else 4
                c_pat = pat_cols[-1] if pat_cols else 3
                c_tot = tot_cols[-1] if tot_cols else 5
                for r in rows[h_i + 2:]:
                    if not r or not r[0] or len(r) <= c_tot:
                        continue
                    p_raw = str(r[0]).strip()
                    p_norm = _norm_prov(p_raw)
                    if p_norm.startswith("total") or p_norm.startswith("(*)"):
                        continue
                    jur_money[p_norm] = {
                        "prov": p_raw.replace("Ciudad Aut.Bs.As.", "CABA").replace("Ciudad Aut. Bs.As.", "CABA").replace("Santa Fé", "Santa Fe"),
                        "prod_pat_k": round(to_float(r[c_pat]) or 0.0, 1),
                        "prod_pers_k": round(to_float(r[c_pers]) or 0.0, 1),
                        "prod_tot_k": round(to_float(r[c_tot]) or 0.0, 1),
                    }

        jur_pct: dict[str, dict[str, float]] = {}
        if sh_c10:
            rows = sheets[sh_c10]
            h_i = next((i for i, r in enumerate(rows) if r and norm_txt(r[0]).startswith("jurisd")), None)
            if h_i is not None and h_i + 1 < len(rows):
                sub = rows[h_i + 1]
                c_dir = next((ci for ci, c in enumerate(sub) if "directa" in norm_txt(c)), 1)
                c_pf = next((ci for ci, c in enumerate(sub) if "fisic" in norm_txt(c)), 2)
                c_soc = next((ci for ci, c in enumerate(sub) if "sociedades" in norm_txt(c)), 3)
                c_bco = next((ci for ci, c in enumerate(sub) if "bancos" in norm_txt(c)), 4)
                c_otr = next((ci for ci, c in enumerate(sub) if "otras" in norm_txt(c)), 5)
                need_len = max(c_dir, c_pf, c_soc, c_bco, c_otr) + 1
                for r in rows[h_i + 2:]:
                    if not r or not r[0] or len(r) < need_len:
                        continue
                    p_norm = _norm_prov(r[0])
                    if p_norm.startswith("total") or p_norm.startswith("(*)"):
                        continue
                    jur_pct[p_norm] = {
                        "directa": round(to_float(r[c_dir]) or 0.0, 1),
                        "pas_pf": round(to_float(r[c_pf]) or 0.0, 1),
                        "soc_prod": round(to_float(r[c_soc]) or 0.0, 1),
                        "inst_bancos": round(to_float(r[c_bco]) or 0.0, 1),
                        "inst_otras": round(to_float(r[c_otr]) or 0.0, 1),
                    }
        for pn, jm in jur_money.items():
            rec = dict(jm)
            rec.update(jur_pct.get(pn, {}))
            jurisdicciones.append(rec)
        jurisdicciones.sort(key=lambda x: x["prod_pers_k"], reverse=True)

        if sh_c7:
            for r in sheets[sh_c7]:
                if not r or not r[0]:
                    continue
                t0 = norm_txt(r[0])
                if t0 == "total":
                    red_prod["pas_cant"] = to_int(r[1])
                    red_prod["soc_cant"] = to_int(r[4])
                elif "mas de 10" in t0:
                    red_prod["pas_10plus_jur_pct"] = round(to_float(r[3]) or 0.0, 1)
                    red_prod["soc_10plus_jur_pct"] = round(to_float(r[6]) or 0.0, 1)
        if sh_c8:
            for r in sheets[sh_c8]:
                if r and norm_txt(r[0]) == "mas de 10":
                    red_prod["pas_10plus_cias_pct"] = round(to_float(r[3]) or 0.0, 1)
                    red_prod["soc_10plus_cias_pct"] = round(to_float(r[6]) or 0.0, 1)

    return {"por_ramo": por_ramo, "por_act": por_act, "jurisdicciones": jurisdicciones, "red_prod": red_prod}


def parse_canales_venta(files_by_year: list[tuple[int, Path]]) -> dict[str, Any]:
    # Sort ascending by report year so newest restated figures win
    files_by_year = sorted(files_by_year, key=lambda x: x[0])
    merged_ramo: dict[str, Any] = {}
    merged_act: dict[str, Any] = {}
    latest_jur: list[dict[str, Any]] = []
    latest_red: dict[str, Any] = {}
    latest_yr = files_by_year[-1][0]
    latest_file = files_by_year[-1][1].name

    for yr, path in files_by_year:
        parsed = parse_canales_venta_file(path, is_latest=(yr == latest_yr))
        merged_ramo.update(parsed["por_ramo"])
        merged_act.update(parsed["por_act"])
        if yr == latest_yr:
            latest_jur = parsed["jurisdicciones"]
            latest_red = parsed["red_prod"]

    years = sorted(int(y) for y in merged_ramo.keys())
    return {
        "latest_year": max(years) if years else latest_yr,
        "years": years,
        "file_name": latest_file,
        "por_ramo_pct": merged_ramo,
        "por_actividad_pct": merged_act,
        "jurisdicciones": latest_jur,
        "red_productores": latest_red,
    }


# ==================== PARSER 5: POLIZAS, SINIESTROS Y PRIMAS ====================
def _clean_entity_name(val: Any) -> str:
    return re.sub(r"\s+", " ", str(val or "")).strip()


def _parse_rank_sheet(rows: list[list[Any]]) -> list[tuple[str, list[dict[str, Any]]]]:
    """Extrae pares de tablas Ranking lado a lado de Cuadros 7..16."""
    results: list[tuple[str, list[dict[str, Any]]]] = []
    title_l, title_r = "", ""
    i = 0
    while i < len(rows):
        r = rows[i]
        if r:
            c0_norm = norm_txt(r[0])
            c6_norm = norm_txt(r[6]) if len(r) > 6 else ""
            # Capturar subtítulo de sección (ej. "Vida Individual", "Sepelio Individual", "Vida Colectivo (2)", "Salud (6)")
            if c0_norm and c0_norm not in ("orden", "por entidad") and not c0_norm.startswith("cantidad de polizas") and not c0_norm.startswith("cuadro") and not c0_norm.startswith("("):
                if to_int(r[0]) is None:
                    title_l = re.sub(r"\s*\(\d+\)", "", str(r[0]).strip())
                    title_r = ""
            if c6_norm and c6_norm not in ("orden",) and not c6_norm.startswith("cuadro") and to_int(r[6]) is None:
                title_r = re.sub(r"\s*\(\d+\)", "", str(r[6]).strip())

            if c0_norm == "orden":
                hdr_l = norm_txt(r[2]) if len(r) > 2 else "polizas"
                rows_l: list[dict[str, Any]] = []
                rows_r: list[dict[str, Any]] = []
                has_right = len(r) > 8 and norm_txt(r[6]) == "orden"
                hdr_r = norm_txt(r[8]) if has_right else ""
                j = i + 1
                while j < len(rows):
                    rr = rows[j]
                    if not rr:
                        j += 1
                        continue
                    t0 = norm_txt(rr[0])
                    if t0.startswith("cuadro") or t0.startswith("cantidad de polizas"):
                        break
                    ord_l = to_int(rr[0])
                    if ord_l is not None and 1 <= ord_l <= 30 and len(rr) > 4:
                        ent = _clean_entity_name(rr[1])
                        rows_l.append({
                            "orden": ord_l,
                            "entidad": ent,
                            "valor": to_int(rr[2]) or 0,
                            "pct": round(to_float(rr[3]) or 0.0, 2),
                            "pct_acum": round(to_float(rr[4]) or 0.0, 2),
                            "is_ls": "SEGUNDA" in ent.upper(),
                        })
                    if has_right and len(rr) > 10:
                        ord_r = to_int(rr[6])
                        if ord_r is not None and 1 <= ord_r <= 30:
                            ent_r = _clean_entity_name(rr[7])
                            rows_r.append({
                                "orden": ord_r,
                                "entidad": ent_r,
                                "valor": to_int(rr[8]) or 0,
                                "pct": round(to_float(rr[9]) or 0.0, 2),
                                "pct_acum": round(to_float(rr[10]) or 0.0, 2),
                                "is_ls": "SEGUNDA" in ent_r.upper(),
                            })
                    j += 1
                results.append((f"{title_l} — {'Certificados' if 'certif' in hdr_l else 'Pólizas'}", rows_l))
                if has_right and rows_r:
                    lbl_r = title_r if title_r else title_l
                    results.append((f"{lbl_r} — {'Certificados' if 'certif' in hdr_r else 'Pólizas'}", rows_r))
                i = j
                continue
        i += 1
    return results


def parse_polizas_sin_prim(xlsx_path: Path, year_hint: int | None, q_hint: int | None) -> dict[str, Any]:
    sheets = read_xlsx_any(xlsx_path.read_bytes())
    sh_c4 = next((k for k in sheets if norm_txt(k) == "cuadro 4"), None)
    sh_c56 = next((k for k in sheets if "cuadros 5 y 6" in norm_txt(k)), None)
    sh_r1 = next((k for k in sheets if "cuadros 7 al 12" in norm_txt(k)), None)
    sh_r2 = next((k for k in sheets if "cuadros 13 al 16" in norm_txt(k)), None)
    if not sh_c56 or not sh_c4:
        raise ValueError(f"Hojas faltantes en {xlsx_path.name}: {list(sheets.keys())}")

    # 1. Cuadro 5: Movimiento trimestral Personas
    rows56 = sheets[sh_c56]
    mov_items = []
    cur_ramo = ""
    c5_start = next((i for i, r in enumerate(rows56[:12]) if r and any(norm_txt(c) == "ramos" for c in r if c is not None)), 1)
    for r in rows56[c5_start + 1:]:
        if not r:
            continue
        joined = " ".join(norm_txt(c) for c in r if c is not None)
        if "cuadro n" in joined:
            break
        if len(r) > 2 and r[2] is not None and str(r[2]).strip():
            cur_ramo = re.sub(r"\s*\(\d+\)", "", str(r[2]).strip())
        conc = norm_txt(r[4]) if len(r) > 4 else ""
        if conc in ("polizas", "certificados") and len(r) >= 10:
            inicio = to_int(r[6]) or 0
            ent = to_int(r[7]) or 0
            sal = to_int(r[8]) or 0
            cie = to_int(r[9]) or 0
            var_pct = to_float(r[11]) if len(r) > 11 else None
            churn_pct = round((sal / inicio) * 100.0, 1) if inicio > 0 else None
            alta_pct = round((ent / inicio) * 100.0, 1) if inicio > 0 else None
            mov_items.append({
                "ramo": cur_ramo,
                "concepto": "Certificados" if "certif" in conc else "Pólizas",
                "inicio": inicio,
                "entradas": ent,
                "salidas": sal,
                "cierre": cie,
                "var_trim_pct": round(var_pct, 2) if var_pct is not None else None,
                "churn_pct": churn_pct,
                "alta_pct": alta_pct,
            })

    # 2. Cuadro 6: Serie trimestral Pólizas & Certificados Personas
    c6_hdr = next((i for i, r in enumerate(rows56) if r and norm_txt(r[0]) == "ano" and any("trim" in norm_txt(c) for c in r if c is not None)), None)
    serie_personas = []
    if c6_hdr is not None:
        cur_y = None
        for r in rows56[c6_hdr + 1:]:
            if not r:
                continue
            t0 = norm_txt(r[0])
            if t0.startswith("cuadro"):
                break
            if to_int(r[0]) is not None:
                cur_y = to_int(r[0])
            tr = parse_trim_es(r[1]) if len(r) > 1 else None
            if cur_y is None or tr is None or len(r) < 13:
                continue
            q_m = tr * 3
            serie_personas.append({
                "periodo": f"{cur_y}-{tr}",
                "y": cur_y,
                "tr": tr,
                "label": f"{MESES_CORTOS[q_m]} {cur_y}",
                "vida_ind_pol": to_int(r[2]) or 0,
                "vida_col_pol": to_int(r[3]) or 0,
                "vida_col_cert": to_int(r[4]) or 0,
                "salud_pol": to_int(r[5]) or 0,
                "salud_cert": to_int(r[6]) or 0,
                "sep_ind_pol": to_int(r[7]) or 0,
                "sep_col_pol": to_int(r[8]) or 0,
                "sep_col_cert": to_int(r[9]) or 0,
                "ap_pol": to_int(r[11]) or 0,
                "ap_cert": to_int(r[12]) or 0,
            })

    # 3. Cuadro 4: Serie trimestral Siniestros Pagados
    rows4 = sheets[sh_c4]
    c4_hdr = next((i for i, r in enumerate(rows4) if r and norm_txt(r[0]) == "ano"), 2)
    h_blk = [" ".join(norm_txt(rows4[ri][ci]) for ri in range(c4_hdr, min(len(rows4), c4_hdr + 4)) if ci < len(rows4[ri])) for ci in range(16)]
    c_tot = next((ci for ci, t in enumerate(h_blk) if "total" in t), 2)
    c_ap = next((ci for ci, t in enumerate(h_blk) if "accidentes" in t), 10)
    c_vind = next((ci for ci, t in enumerate(h_blk) if "vida individual" in t), 11)
    c_vcol = next((ci for ci, t in enumerate(h_blk) if "vida colectivo" in t), 12)
    c_op = next((ci for ci, t in enumerate(h_blk) if "otros" in t and "personas" in t), 13)

    serie_siniestros = []
    cur_y = None
    for r in rows4[c4_hdr + 1:]:
        if not r:
            continue
        if norm_txt(r[0]).startswith("cuadro"):
            break
        if to_int(r[0]) is not None:
            cur_y = to_int(r[0])
        tr = parse_trim_es(r[1]) if len(r) > 1 else None
        if cur_y is None or tr is None or len(r) <= c_op:
            continue
        tot = to_int(r[c_tot]) or 0
        ap = to_int(r[c_ap]) or 0
        vind = to_int(r[c_vind]) or 0
        vcol = to_int(r[c_vcol]) or 0
        op = to_int(r[c_op]) or 0
        pers_tot = ap + vind + vcol + op
        q_m = tr * 3
        serie_siniestros.append({
            "periodo": f"{cur_y}-{tr}",
            "y": cur_y,
            "tr": tr,
            "label": f"{MESES_CORTOS[q_m]} {cur_y}",
            "total": tot,
            "pat_tot": tot - pers_tot,
            "pers_tot": pers_tot,
            "ap": ap,
            "vida_ind": vind,
            "vida_col": vcol,
            "otros_pers": op,
        })

    # 4. Rankings Cuadros 7..16
    raw_ranks: list[tuple[str, list[dict[str, Any]]]] = []
    if sh_r1:
        raw_ranks.extend(_parse_rank_sheet(sheets[sh_r1]))
    if sh_r2:
        raw_ranks.extend(_parse_rank_sheet(sheets[sh_r2]))

    key_map = {
        "vida individual — polizas": ("vida_ind_pol", "Vida Individual — Pólizas"),
        "sepelio individual — polizas": ("sep_ind_pol", "Sepelio Individual — Pólizas"),
        "vida colectivo — polizas": ("vida_col_pol", "Vida Colectivo — Pólizas"),
        "vida colectivo — certificados": ("vida_col_cert", "Vida Colectivo — Certificados"),
        "sepelio colectivo — polizas": ("sep_col_pol", "Sepelio Colectivo — Pólizas"),
        "sepelio colectivo — certificados": ("sep_col_cert", "Sepelio Colectivo — Certificados"),
        "salud — polizas": ("salud_pol", "Salud — Pólizas"),
        "salud — certificados": ("salud_cert", "Salud — Certificados"),
        "accidentes personales — polizas": ("ap_pol", "Accidentes Personales — Pólizas"),
        "accidentes personales — certificados": ("ap_cert", "Accidentes Personales — Certificados"),
    }
    rankings: dict[str, Any] = {}
    for title_raw, rows_list in raw_ranks:
        t_norm = norm_txt(title_raw)
        if t_norm in key_map:
            kid, clean_title = key_map[t_norm]
            rankings[kid] = {"title": clean_title, "rows": rows_list}

    last_sp = serie_personas[-1] if serie_personas else {}
    latest_p = last_sp.get("periodo") or (f"{year_hint}-{q_hint}" if year_hint and q_hint else "")
    latest_lbl = f"{last_sp.get('tr', q_hint)}º Trim. {last_sp.get('y', year_hint)} ({last_sp.get('label', '')})" if last_sp else xlsx_path.name

    return {
        "latest_periodo": latest_p,
        "latest_label": latest_lbl,
        "file_name": xlsx_path.name,
        "movimiento_personas": mov_items,
        "serie_personas": serie_personas,
        "serie_siniestros": serie_siniestros,
        "rankings": rankings,
    }


# ==================== ORQUESTACIÓN FETCH + PARSE ====================
def _pick_latest_xlsx(rows: list[list[str]], ext_filter: str = ".xlsx") -> list[tuple[int, int, str]]:
    """Extrae filas válidas (año, mes/trim, href_xlsx) ordenadas de más nueva a más vieja."""
    if not rows:
        return []
    hdr = [norm_txt(c) for c in rows[0]]
    i_y = next((i for i, c in enumerate(hdr) if "ano" in c), 0)
    i_m = next((i for i, c in enumerate(hdr) if c == "mes" or "trim" in c), None)
    # Columna XLSX suele llamarse 'bd', 'xls' o 'btn-ver .xls'
    out: list[tuple[int, int, str]] = []
    for row in rows[1:]:
        if len(row) <= i_y:
            continue
        m_y = re.search(r"(20\d{2})", str(row[i_y]))
        if not m_y:
            continue
        yr = int(m_y.group(1))
        mo = 12
        if i_m is not None and len(row) > i_m:
            mo = parse_month_es(row[i_m]) or (parse_trim_es(row[i_m]) * 3 if parse_trim_es(row[i_m]) else 12)
        href = next((str(c).strip() for c in row if str(c).strip().lower().endswith(ext_filter)), None)
        if not href:
            href = next((str(c).strip() for c in row if ".xls" in str(c).lower()), None)
        if href and href != "--":
            out.append((yr, mo, href))
    out.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return out


def _pick_local_latest(src_key: str) -> list[Path]:
    d = RAW_EXTRAS_DIR / src_key
    if not d.exists():
        return []
    files = [p for p in d.glob("*.xlsx") if is_valid_xlsx_file(p)]
    files.sort(key=lambda p: p.name, reverse=True)
    return files


def run_fetch_extras(force: bool = False, check_only: bool = False, offline: bool = False) -> dict[str, Any]:
    prev_data: dict[str, Any] = {}
    if OUT_JSON_PATH.exists():
        try:
            prev_data = json.loads(OUT_JSON_PATH.read_text(encoding="utf-8"))
        except Exception:
            prev_data = {}

    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0"})
    cache_meta = _load_cache_meta()

    result: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    statuses: list[dict[str, Any]] = []

    if check_only:
        print("=== CHEQUEO DE FRESCURA — FUENTES EXTERNAS SSN ===")
        for skey, meta in SOURCES.items():
            try:
                rows = fetch_google_sheet_rows(session, skey)
                if skey == "tasa_testigo_rv":
                    parsed = parse_tasa_testigo_rv(rows)
                    on_lbl = f"{parsed['latest_label']} ({parsed['latest_tasa']:.2f}%)"
                    loc_tt = prev_data.get("tasa_testigo_rv", {})
                    up_to_date = (
                        loc_tt.get("latest_ym") == parsed["latest_ym"]
                        and loc_tt.get("latest_tasa") == parsed["latest_tasa"]
                        and loc_tt.get("count") == parsed["count"]
                    )
                    st_tag = "AL DÍA" if up_to_date else "NUEVO / ACTUALIZADO EN SSN"
                else:
                    picks = _pick_latest_xlsx(rows)
                    if not picks:
                        on_lbl, st_tag = "—", "SIN ARCHIVOS"
                    else:
                        href = picks[0][2]
                        fname = Path(href.split("?")[0]).name
                        on_lbl = f"{picks[0][0]}-{picks[0][1]:02d} ({fname})"
                        local_p = RAW_EXTRAS_DIR / skey / fname
                        if not is_valid_xlsx_file(local_p):
                            st_tag = "NUEVO EN SSN"
                        else:
                            head_info = _head_url_meta(session, urljoin(BASE_URL, href))
                            prev_e = cache_meta.get(f"{skey}/{fname}", {})
                            loc_sz = local_p.stat().st_size
                            changed = bool(
                                head_info
                                and (
                                    (head_info["content_length"] is not None and head_info["content_length"] != loc_sz)
                                    or (head_info["etag"] and prev_e.get("etag") and head_info["etag"] != prev_e.get("etag"))
                                    or (head_info["last_modified"] and prev_e.get("last_modified") and head_info["last_modified"] != prev_e.get("last_modified"))
                                )
                            )
                            st_tag = "RECTIFICADO EN SSN" if changed else "AL DÍA"
                loc_obj = prev_data.get(skey, {})
                loc_lbl = loc_obj.get("latest_label") or loc_obj.get("as_of_label") or str(loc_obj.get("latest_year", "—"))
                print(f"  - {skey:18s}: online={on_lbl} | local={loc_lbl} | {st_tag}")
            except Exception as exc:
                print(f"  - {skey:18s}: ERROR chequeo ({exc})")
        return prev_data

    # 1. Tasa Testigo RV
    try:
        if offline:
            if "tasa_testigo_rv" in prev_data:
                result["tasa_testigo_rv"] = prev_data["tasa_testigo_rv"]
            else:
                raise RuntimeError("Sin tasa_testigo_rv en caché para modo --offline")
        else:
            rows = fetch_google_sheet_rows(session, "tasa_testigo_rv")
            result["tasa_testigo_rv"] = parse_tasa_testigo_rv(rows)
        tt = result["tasa_testigo_rv"]
        statuses.append({"id": "tasa_testigo_rv", "title": SOURCES["tasa_testigo_rv"]["title"], "frequency": "Mensual", "latest_label": f"{tt['latest_label']} ({tt['latest_tasa']:.2f}%)", "count": tt["count"], "file_name": "Google Sheet SSN", "ok": True})
        print(f"  [OK] tasa_testigo_rv: {tt['count']} meses (último: {tt['latest_label']} = {tt['latest_tasa']:.2f}%)")
    except Exception as exc:
        if "tasa_testigo_rv" in prev_data:
            result["tasa_testigo_rv"] = prev_data["tasa_testigo_rv"]
            statuses.append({"id": "tasa_testigo_rv", "title": SOURCES["tasa_testigo_rv"]["title"], "frequency": "Mensual", "latest_label": prev_data["tasa_testigo_rv"].get("latest_label", "—"), "ok": False, "error": str(exc)})
            print(f"  [AVISO] tasa_testigo_rv falló ({exc}); preservado caché previo.")
        else:
            raise

    # 2. Producción Mensual
    try:
        if offline:
            locs = _pick_local_latest("prod_mensual")
            if not locs:
                raise RuntimeError("Sin .xlsx local en prod_mensual")
            p_path = locs[0]
        else:
            picks = _pick_latest_xlsx(fetch_google_sheet_rows(session, "prod_mensual"))
            p_path = download_cached_xlsx(session, "prod_mensual", picks[0][2], force=force, cache_meta=cache_meta)
        pm = parse_prod_mensual(p_path)
        result["prod_mensual"] = pm
        statuses.append({"id": "prod_mensual", "title": SOURCES["prod_mensual"]["title"], "frequency": "Mensual", "latest_label": pm["latest_label"], "count": pm["count"], "file_name": pm["file_name"], "ok": True})
        print(f"  [OK] prod_mensual: {pm['count']} meses (último: {pm['latest_label']}, {pm['file_name']})")
    except Exception as exc:
        if "prod_mensual" in prev_data:
            result["prod_mensual"] = prev_data["prod_mensual"]
            statuses.append({"id": "prod_mensual", "title": SOURCES["prod_mensual"]["title"], "frequency": "Mensual", "latest_label": prev_data["prod_mensual"].get("latest_label", "—"), "ok": False, "error": str(exc)})
            print(f"  [AVISO] prod_mensual falló ({exc}); preservado caché previo.")
        else:
            raise

    # 3. Retiro Estadística
    try:
        if offline:
            locs = _pick_local_latest("retiro_est")
            if not locs:
                raise RuntimeError("Sin .xlsx local en retiro_est")
            r_path, y_h, m_h = locs[0], None, None
        else:
            picks = _pick_latest_xlsx(fetch_google_sheet_rows(session, "retiro_est"))
            y_h, m_h, href = picks[0]
            r_path = download_cached_xlsx(session, "retiro_est", href, force=force, cache_meta=cache_meta)
        re_d = parse_retiro_est(r_path, y_h, m_h)
        result["retiro_est"] = re_d
        statuses.append({"id": "retiro_est", "title": SOURCES["retiro_est"]["title"], "frequency": "Trimestral", "latest_label": re_d["as_of_label"], "count": len(re_d["entities"]), "file_name": re_d["file_name"], "ok": True})
        print(f"  [OK] retiro_est: {len(re_d['entities'])} entidades (cierre: {re_d['as_of_label']}, {re_d['file_name']})")
    except Exception as exc:
        if "retiro_est" in prev_data:
            result["retiro_est"] = prev_data["retiro_est"]
            statuses.append({"id": "retiro_est", "title": SOURCES["retiro_est"]["title"], "frequency": "Trimestral", "latest_label": prev_data["retiro_est"].get("as_of_label", "—"), "ok": False, "error": str(exc)})
            print(f"  [AVISO] retiro_est falló ({exc}); preservado caché previo.")
        else:
            raise

    # 4. Canales de Venta (último + cada 2 años cubriendo hasta 2020)
    try:
        selected_canales: list[tuple[int, Path]] = []
        if offline:
            for p in _pick_local_latest("canales_venta"):
                m_y = re.search(r"(20\d{2})", p.name)
                if m_y:
                    selected_canales.append((int(m_y.group(1)), p))
            if not selected_canales:
                raise RuntimeError("Sin .xlsx local en canales_venta")
        else:
            picks = [p for p in _pick_latest_xlsx(fetch_google_sheet_rows(session, "canales_venta")) if p[0] >= 2021 and p[2].lower().endswith(".xlsx")]
            by_yr: dict[int, str] = {}
            for yr, _, href in picks:
                if yr not in by_yr:
                    by_yr[yr] = href
            max_yr = max(by_yr.keys())
            target_yrs = []
            cur_t = max_yr
            while cur_t >= 2021:
                if cur_t in by_yr:
                    target_yrs.append(cur_t)
                cur_t -= 2
            if 2021 in by_yr and 2021 not in target_yrs:
                target_yrs.append(2021)
            if not target_yrs:
                target_yrs = [max_yr]
            for yr in target_yrs:
                cp = download_cached_xlsx(session, "canales_venta", by_yr[yr], force=force, cache_meta=cache_meta)
                selected_canales.append((yr, cp))
        cv = parse_canales_venta(selected_canales)
        result["canales_venta"] = cv
        statuses.append({"id": "canales_venta", "title": SOURCES["canales_venta"]["title"], "frequency": "Anual", "latest_label": f"Ejercicio {cv['latest_year']}", "count": len(cv["years"]), "file_name": cv["file_name"], "ok": True})
        print(f"  [OK] canales_venta: años {cv['years']} (último: Ej. {cv['latest_year']}, {cv['file_name']})")
    except Exception as exc:
        if "canales_venta" in prev_data:
            result["canales_venta"] = prev_data["canales_venta"]
            statuses.append({"id": "canales_venta", "title": SOURCES["canales_venta"]["title"], "frequency": "Anual", "latest_label": f"Ejercicio {prev_data['canales_venta'].get('latest_year', '—')}", "ok": False, "error": str(exc)})
            print(f"  [AVISO] canales_venta falló ({exc}); preservado caché previo.")
        else:
            raise

    # 5. Pólizas, Siniestros y Primas
    try:
        if offline:
            locs = _pick_local_latest("polizas_sin_prim")
            if not locs:
                raise RuntimeError("Sin .xlsx local en polizas_sin_prim")
            ps_path, y_h, q_h = locs[0], None, None
        else:
            picks = _pick_latest_xlsx(fetch_google_sheet_rows(session, "polizas_sin_prim"))
            y_h, m_h, href = picks[0]
            q_h = m_h // 3 if m_h in (3, 6, 9, 12) else None
            ps_path = download_cached_xlsx(session, "polizas_sin_prim", href, force=force, cache_meta=cache_meta)
        psp = parse_polizas_sin_prim(ps_path, y_h, q_h)
        result["polizas_sin_prim"] = psp
        statuses.append({"id": "polizas_sin_prim", "title": SOURCES["polizas_sin_prim"]["title"], "frequency": "Trimestral", "latest_label": psp["latest_label"], "count": len(psp["serie_personas"]), "file_name": psp["file_name"], "ok": True})
        print(f"  [OK] polizas_sin_prim: {len(psp['serie_personas'])} trimestres, {len(psp['rankings'])} rankings (último: {psp['latest_label']}, {psp['file_name']})")
    except Exception as exc:
        if "polizas_sin_prim" in prev_data:
            result["polizas_sin_prim"] = prev_data["polizas_sin_prim"]
            statuses.append({"id": "polizas_sin_prim", "title": SOURCES["polizas_sin_prim"]["title"], "frequency": "Trimestral", "latest_label": prev_data["polizas_sin_prim"].get("latest_label", "—"), "ok": False, "error": str(exc)})
            print(f"  [AVISO] polizas_sin_prim falló ({exc}); preservado caché previo.")
        else:
            raise

    if not offline:
        _save_cache_meta(cache_meta)

    result["sources_status"] = statuses
    OUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = OUT_JSON_PATH.stat().st_size / 1024.0
    print(f"Generado {OUT_JSON_PATH} ({size_kb:.1f} KB)")
    return result


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Descarga y parsea las 5 fuentes estadísticas SSN externas.")
    p.add_argument("--force", action="store_true", help="Re-descargar .xlsx aunque ya existan en caché local.")
    p.add_argument("--check-only", action="store_true", help="Solo verifica fechas más recientes publicadas en SSN vs. caché local.")
    p.add_argument("--offline", action="store_true", help="Reparsea archivos cacheados en data/raw_ssn_extras/ sin consultar red.")
    return p.parse_args(argv)


def main() -> int:
    args = parse_args()
    print("Actualizando fuentes estadísticas oficiales externas SSN...")
    run_fetch_extras(force=args.force, check_only=args.check_only, offline=args.offline)
    return 0


if __name__ == "__main__":
    sys.exit(main())
