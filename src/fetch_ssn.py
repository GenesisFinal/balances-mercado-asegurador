#!/usr/bin/env python3
"""Descarga incremental de balances ZIP y catálogos PCU/Ramos desde SINENSUP (SSN)."""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
import time
import zipfile
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://sinensup.ssn.gob.ar"
MENU_URL = f"{BASE_URL}/Sinensup/menu.faces?idSession=reportes"
MENU2_URL = f"{BASE_URL}/Sinensup/menu2.faces"
ZIP_PAGE_URL = f"{BASE_URL}/Sinensup/facelets/archivoZipBalances.faces"
PCU_RAMOS_PAGE_URL = f"{BASE_URL}/Sinensup/facelets/listadosPCURamos.faces"

DEFAULT_PERIODOS = [
    "2026-3", "2026-2", "2026-1", "2025-4",
    "2025-3", "2025-2", "2025-1", "2024-4",
    "2024-3", "2024-2", "2024-1", "2023-4",
    "2023-3", "2023-2", "2023-1", "2022-4",
]


def is_valid_zip(path: Path) -> bool:
    """Verifica que el archivo exista, sea ZIP íntegro y contenga al menos un .mdb/.accdb."""
    if not path.exists() or path.stat().st_size < 1024:
        return False
    try:
        with zipfile.ZipFile(path, "r") as zf:
            if zf.testzip() is not None:
                return False
            names = [n.lower() for n in zf.namelist()]
            return any(n.endswith(".mdb") or n.endswith(".accdb") for n in names)
    except (zipfile.BadZipFile, OSError):
        return False


def init_session() -> requests.Session:
    """Inicializa una sesión HTTP con JSESSIONID válido en SINENSUP."""
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0"})
    resp = session.get(MENU_URL, timeout=30)
    resp.raise_for_status()
    return session


def _extract_zip_form(html: str) -> tuple[str, dict[str, str], str]:
    """Extrae action, campos hidden/submit y nombre del select :periodo del form JSF."""
    soup = BeautifulSoup(html, "html.parser")
    for form in soup.find_all("form"):
        select = form.find("select", attrs={"name": lambda v: bool(v and v.endswith(":periodo"))})
        if not select:
            continue
        action = form.get("action") or "/Sinensup/facelets/archivoZipBalances.faces"
        payload: dict[str, str] = {}
        for inp in form.find_all("input"):
            itype = (inp.get("type") or "").lower()
            name = inp.get("name")
            if not name:
                continue
            if itype == "hidden":
                payload[name] = inp.get("value", "")
        submit_btn = None
        for inp in form.find_all("input", attrs={"type": "submit"}):
            val = inp.get("value", "")
            if "descargar" in val.lower():
                submit_btn = inp
                break
        if submit_btn is None:
            submit_btn = form.find("input", attrs={"type": "submit"})
        if submit_btn and submit_btn.get("name"):
            payload[submit_btn["name"]] = submit_btn.get("value", "Descargar")
        return urljoin(BASE_URL, action), payload, select["name"]
    raise RuntimeError("No se encontró el formulario JSF de Archivo Zip Balances (:periodo).")


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def download_periodo(
    session: requests.Session,
    periodo: str,
    dest_dir: Path,
    force: bool = False,
    refresh_if_changed: bool = False,
) -> tuple[requests.Session, str]:
    """Descarga y valida el ZIP de un período con hasta 3 reintentos renovando sesión."""
    dest_path = dest_dir / f"{periodo}.zip"
    has_valid_local = is_valid_zip(dest_path)
    if not force and has_valid_local and not refresh_if_changed:
        size_mb = dest_path.stat().st_size / (1024 * 1024)
        return session, f"ya existente ({size_mb:.2f} MB)"

    part_path = dest_dir / f"{periodo}.zip.part"
    last_err: Exception | None = None

    for attempt in range(1, 4):
        try:
            page_resp = session.get(ZIP_PAGE_URL, timeout=30)
            page_resp.raise_for_status()
            action_url, payload, select_name = _extract_zip_form(page_resp.text)
            payload[select_name] = periodo

            with session.post(action_url, data=payload, stream=True, timeout=120) as resp:
                resp.raise_for_status()
                chunks = resp.iter_content(chunk_size=65536)
                first_chunk = b""
                for chunk in chunks:
                    if chunk:
                        first_chunk = chunk
                        break

                if not first_chunk.startswith(b"PK"):
                    raise RuntimeError(
                        f"Respuesta inesperada para {periodo} (no comienza con PK, content-type={resp.headers.get('Content-Type')})"
                    )

                with open(part_path, "wb") as f:
                    f.write(first_chunk)
                    for chunk in chunks:
                        if chunk:
                            f.write(chunk)

            if not is_valid_zip(part_path):
                raise RuntimeError(f"El archivo descargado para {periodo} falló validación ZIP/.mdb.")

            if has_valid_local and not force and file_sha256(part_path) == file_sha256(dest_path):
                part_path.unlink()
                size_mb = dest_path.stat().st_size / (1024 * 1024)
                return session, f"sin cambios en origen ({size_mb:.2f} MB, SHA verificado)"

            os.replace(part_path, dest_path)
            size_mb = dest_path.stat().st_size / (1024 * 1024)
            tag = "ACTUALIZADO en origen (rectificado)" if has_valid_local and not force else "descargado"
            return session, f"{tag} ({size_mb:.2f} MB)"
        except Exception as exc:
            last_err = exc
            if part_path.exists():
                part_path.unlink()
            if attempt < 3:
                wait_s = 2 * attempt
                print(f"  [reintento {attempt}/3 para {periodo}] {exc}; renovando sesión en {wait_s}s...")
                time.sleep(wait_s)
                session = init_session()

    if has_valid_local and not force and refresh_if_changed:
        size_mb = dest_path.stat().st_size / (1024 * 1024)
        print(f"  [aviso] No se pudo re-verificar {periodo} online ({last_err}); se conserva copia local válida.")
        return session, f"local conservado ({size_mb:.2f} MB)"

    raise RuntimeError(f"Error descargando {periodo} tras 3 intentos: {last_err}") from last_err


def _open_pcu_ramos_page(session: requests.Session) -> tuple[str, str]:
    """Obtiene el HTML de listadosPCURamos.faces, navegando desde menu2.faces si hiciera falta."""
    resp = session.get(PCU_RAMOS_PAGE_URL, timeout=30)
    if resp.status_code == 200 and 'id="listado"' in resp.text:
        return resp.text, resp.url

    m2 = session.get(MENU2_URL, timeout=30)
    m2.raise_for_status()
    soup = BeautifulSoup(m2.text, "html.parser")
    form = soup.find("form", id="j_id6") or soup.find("form")
    if not form:
        raise RuntimeError("No se encontró formulario de navegación en menu2.faces")
    data = {
        inp["name"]: inp.get("value", "")
        for inp in form.find_all("input")
        if inp.get("name")
    }
    data["jscook_action"] = "j_id6_j_id19_menu:A]listadospcuramos"
    post_url = urljoin(BASE_URL, form.get("action") or "/Sinensup/menu2.faces")
    r4 = session.post(post_url, data=data, timeout=30)
    r4.raise_for_status()
    if 'id="listado"' not in r4.text:
        raise RuntimeError("No se pudo acceder a listadosPCURamos.faces")
    return r4.text, r4.url


def _detect_excel_ext(content: bytes) -> str:
    """Detecta extensión real según magic bytes del reporte descargado."""
    if content.startswith(b"PK"):
        return ".xlsx"
    if content.startswith(b"\xd0\xcf\x11\xe0"):
        return ".xls"
    return ".xls"


def download_catalogs(session: requests.Session, cat_dir: Path) -> requests.Session:
    """Descarga los listados oficiales de Ramos y PCU desde SINENSUP."""
    targets = [
        ("Generar Excel Ramos", "sinensup_ramos"),
        ("Generar Excel PCU", "sinensup_pcu"),
    ]
    for btn_label, base_name in targets:
        last_err: Exception | None = None
        for attempt in range(1, 4):
            try:
                html, _ = _open_pcu_ramos_page(session)
                soup = BeautifulSoup(html, "html.parser")
                form = soup.find("form", id="listado")
                if not form:
                    raise RuntimeError("No se encontró el form id='listado' en listadosPCURamos.faces")

                payload: dict[str, str] = {}
                for inp in form.find_all("input", attrs={"type": "hidden"}):
                    if inp.get("name"):
                        payload[inp["name"]] = inp.get("value", "")

                btn = form.find("input", attrs={"type": "submit", "value": lambda v: bool(v and btn_label.lower() in v.lower())})
                if not btn or not btn.get("name"):
                    raise RuntimeError(f"No se encontró el botón '{btn_label}'")
                payload[btn["name"]] = btn.get("value", btn_label)

                action_url = urljoin(BASE_URL, form.get("action") or "/Sinensup/facelets/listadosPCURamos.faces")
                resp = session.post(action_url, data=payload, timeout=60)
                resp.raise_for_status()
                content = resp.content
                if len(content) < 256 or (b"<html" in content[:512].lower() and b"<table" not in content.lower()):
                    raise RuntimeError(f"Respuesta inesperada al descargar {base_name} (len={len(content)})")

                ext = _detect_excel_ext(content)
                for old in cat_dir.glob(f"{base_name}.*"):
                    old.unlink()
                out_path = cat_dir / f"{base_name}{ext}"
                out_path.write_bytes(content)
                print(f"Catálogo {out_path.name}: descargado ({len(content):,} bytes)")
                time.sleep(0.6)
                last_err = None
                break
            except Exception as exc:
                last_err = exc
                if attempt < 3:
                    wait_s = 2 * attempt
                    print(f"  [reintento {attempt}/3 catálogo {base_name}] {exc}; renovando sesión en {wait_s}s...")
                    time.sleep(wait_s)
                    session = init_session()
        if last_err is not None:
            raise RuntimeError(f"Error descargando catálogo {base_name}: {last_err}") from last_err
    return session


def discover_available_periodos(session: requests.Session, limit: int = 16) -> list[str]:
    """Descubre dinámicamente los períodos publicados en el selector de SINENSUP."""
    try:
        resp = session.get(ZIP_PAGE_URL, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        sel = soup.find("select", attrs={"name": lambda v: bool(v and v.endswith(":periodo"))}) or soup.find("select")
        if not sel:
            raise RuntimeError("No se encontró el selector :periodo en archivoZipBalances.faces")
        found: list[str] = []
        seen: set[str] = set()
        for opt in sel.find_all("option"):
            val = (opt.get("value") or opt.get_text(strip=True) or "").strip()
            if re.match(r"^\d{4}-[1-4]$", val) and val not in seen:
                seen.add(val)
                found.append(val)
        if not found:
            raise RuntimeError("Selector :periodo sin opciones válidas YYYY-Q")
        found.sort(key=lambda p: tuple(int(x) for x in p.split("-")), reverse=True)
        return found[:limit]
    except Exception as exc:
        print(f"[aviso] No se pudo auto-descubrir períodos en SINENSUP ({exc}); usando lista por defecto.")
        return DEFAULT_PERIODOS[:limit]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Descarga ZIPs de balances y catálogos desde SINENSUP (SSN).")
    parser.add_argument(
        "--periodos",
        nargs="+",
        help="Lista de períodos a descargar (ej. 2026-3 2026-2 o separados por coma).",
    )
    parser.add_argument("--ventana", type=int, default=16, help="Cantidad de últimos períodos a mantener si no se indica --periodos (default: 16).")
    parser.add_argument("--check-only", action="store_true", help="Solo consulta períodos disponibles en SINENSUP vs. locales.")
    parser.add_argument("--check-latest-hash", action="store_true", help="Con --check-only, compara además el SHA-256 remoto vs. local del último cierre.")
    parser.add_argument("--no-refresh-latest", action="store_true", help="No re-descarga el último cierre para verificar rectificaciones si ya existe localmente.")
    parser.add_argument("--force", action="store_true", help="Re-descargar aunque ya exista un ZIP válido.")
    parser.add_argument("--skip-catalogs", action="store_true", help="Omitir descarga de Excel Ramos y PCU.")
    parser.add_argument("--raw-dir", default="data/raw_zips", help="Carpeta destino para los ZIPs.")
    parser.add_argument("--cat-dir", default="data/catalogos", help="Carpeta destino para catálogos.")
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()
    raw_dir = Path(args.raw_dir)
    cat_dir = Path(args.cat_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)
    cat_dir.mkdir(parents=True, exist_ok=True)

    session = init_session()

    if args.periodos:
        periodos: list[str] = []
        for item in args.periodos:
            for p in item.split(","):
                p = p.strip()
                if p:
                    periodos.append(p)
    else:
        periodos = discover_available_periodos(session, limit=args.ventana)

    if args.check_only:
        locales = {p.stem for p in raw_dir.glob("*.zip") if is_valid_zip(p)}
        faltantes = [p for p in periodos if p not in locales]
        ultimo_online = periodos[0] if periodos else "—"
        ultimo_local = sorted(locales, key=lambda x: tuple(int(v) for v in x.split("-")) if re.match(r"^\d{4}-[1-4]$", x) else (0, 0), reverse=True)
        hash_note = ""
        if args.check_latest_hash and periodos and periodos[0] in locales:
            try:
                p0 = periodos[0]
                loc_p = raw_dir / f"{p0}.zip"
                loc_sha = file_sha256(loc_p)
                page_resp = session.get(ZIP_PAGE_URL, timeout=30)
                page_resp.raise_for_status()
                action_url, payload, select_name = _extract_zip_form(page_resp.text)
                payload[select_name] = p0
                h = hashlib.sha256()
                with session.post(action_url, data=payload, stream=True, timeout=120) as resp:
                    resp.raise_for_status()
                    for chunk in resp.iter_content(chunk_size=65536):
                        if chunk:
                            h.update(chunk)
                hash_note = f" | hash({p0})={'OK' if h.hexdigest() == loc_sha else 'RECTIFICADO EN SSN'}"
            except Exception as exc:
                hash_note = f" | hash({periodos[0]})=error ({exc})"
        print(f"SINENSUP últimos {len(periodos)} disponibles: más reciente={ultimo_online} | Locales válidos={ultimo_local[0] if ultimo_local else 'ninguno'} | Faltantes={faltantes or 'ninguno'}{hash_note}")
        return 0

    print(f"Iniciando descarga SINENSUP para {len(periodos)} períodos (último: {periodos[0] if periodos else '—'})...")

    for idx, periodo in enumerate(periodos, start=1):
        refresh_latest = (idx == 1 and not args.no_refresh_latest)
        session, status = download_periodo(
            session,
            periodo,
            raw_dir,
            force=args.force,
            refresh_if_changed=refresh_latest,
        )
        print(f"[{idx:02d}/{len(periodos):02d}] {periodo}: {status}")
        if (status.startswith("descargado") or status.startswith("ACTUALIZADO")) and idx < len(periodos):
            time.sleep(0.75)

    if not args.skip_catalogs:
        session = download_catalogs(session, cat_dir)

    print("Descarga SINENSUP finalizada.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
