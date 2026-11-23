#!/usr/bin/env python3
"""Auditoría de integridad Fase 1 y generación de catálogos semilla (ramos y compañías)."""

from __future__ import annotations

import csv
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

DB_PATH = Path("data/warehouse.sqlite")
CAT_DIR = Path("data/catalogos")

RAMO_NAMES = {
    "1.010": "Incendio",
    "1.020": "Combinado Familiar e Integral",
    "1.030": "Automotores",
    "1.040": "Transporte Público de Pasajeros",
    "1.050": "Riesgos del Trabajo",
    "1.070": "Riesgos Agropecuarios y Forestales",
    "1.080": "Responsabilidad Civil",
    "1.090": "Robo y Riesgos Similares",
    "1.100": "Caución",
    "1.110": "Créditos",
    "1.120": "Accidentes a Pasajeros",
    "1.130": "Aeronavegación",
    "1.140": "Transportes - Cascos",
    "1.150": "Transporte de Mercaderías",
    "1.160": "Técnico",
    "1.170": "Otros Riesgos de Daños Patrimoniales",
    "1.180": "Motovehículos",
    "2.010": "Accidentes Personales",
    "2.020": "Salud",
    "2.030": "Vida",
    "2.050": "Sepelio",
    "2.060": "Retiro",
    "2.070": "Rentas Previsionales y de Riesgos del Trabajo",
    "3.000": "Sección Administración",
}


def get_gran_ramo(cod_subramo: str) -> str:
    cod_ramo = cod_subramo[:5]
    if cod_ramo == "1.050":
        return "ART"
    if cod_ramo in ("2.060", "2.070"):
        return "Retiro"
    if cod_subramo.startswith("1."):
        return "Patrimoniales"
    if cod_subramo.startswith("2."):
        return "Personas"
    if cod_subramo.startswith("3."):
        return "Administración"
    return "Otros"


def classify_constitucion(razon_social: str) -> str:
    u = " ".join(razon_social.upper().split())
    if "SUCURSAL" in u:
        return "Sucursal Extranjera"
    if "COOPERATIVA" in u or re.search(r"\bCOOP\.?\b", u):
        return "Cooperativa"
    if "MUTUAL" in u or "SEGUROS MUTUOS" in u:
        return "Mutual"
    if (
        "SOCIEDAD DEL ESTADO" in u
        or "CAJA DE PREVISI" in u
        or "CAJA POPULAR" in u
        or ("INSTITUTO AUT" in u and "SOCIEDAD AN" not in u and "S.A" not in u)
    ):
        return "Organismo / Ente Oficial"
    if (
        "SOCIEDAD ANONIMA UNIPERSONAL" in u
        or "SOCIEDAD ANÓNIMA UNIPERSONAL" in u
        or re.search(r"\bS\.?\s*A\.?\s*U\.?\b", u)
    ):
        return "SAU"
    if (
        "SOCIEDAD ANONIMA" in u
        or "SOCIEDAD ANÓNIMA" in u
        or re.search(r"\bS\.?\s*A\.?(?:\s|$)", u)
    ):
        return "SA"
    if "INSTITUTO" in u:
        return "Organismo / Ente Oficial"
    return "Otra"


def classify_tipo_cia(ramos: set[str], razon_social: str) -> str:
    u = razon_social.upper()
    core = ramos - {"Administración", "Otros"}
    if not core:
        if "RIESGOS DEL TRABAJO" in u or " ART" in u:
            return "ART"
        if "RETIRO" in u:
            return "Retiro"
        if "VIDA" in u or "PERSONAS" in u or "SEPELIO" in u:
            return "Personas"
        return "Patrimoniales y Mixtas"
    if core == {"ART"}:
        return "ART"
    if core == {"Retiro"}:
        return "Retiro"
    if core == {"Personas"}:
        return "Personas"
    if "Patrimoniales" in core:
        return "Patrimoniales y Mixtas"
    if core == {"Personas", "Retiro"}:
        return "Retiro" if "RETIRO" in u else "Personas"
    return "Patrimoniales y Mixtas"


def generate_ramos_csv(conn: sqlite3.Connection) -> list[dict[str, str]]:
    rows = conn.execute("SELECT cod_subramo, desc_subramo FROM subramos ORDER BY cod_subramo").fetchall()
    out = []
    for cod_sr, desc_sr in rows:
        cod_ramo = cod_sr[:5]
        desc_ramo = RAMO_NAMES.get(cod_ramo, desc_sr.split(" - ")[0].strip())
        gran_ramo = get_gran_ramo(cod_sr)
        out.append(
            {
                "cod_subramo": cod_sr,
                "desc_subramo": desc_sr,
                "cod_ramo": cod_ramo,
                "desc_ramo": desc_ramo,
                "gran_ramo": gran_ramo,
            }
        )
    out_path = CAT_DIR / "ramos.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["cod_subramo", "desc_subramo", "cod_ramo", "desc_ramo", "gran_ramo"])
        writer.writeheader()
        writer.writerows(out)
    print(f"Generado {out_path} ({len(out)} subramos)")
    return out


def generate_companias_seed(conn: sqlite3.Connection) -> list[dict[str, object]]:
    cia_hist = conn.execute(
        """
        SELECT cp.cod_cia, cp.razon_social, cp.periodo, p.fecha_cierre
        FROM companias_periodo cp
        JOIN periodos p ON p.periodo = cp.periodo
        ORDER BY p.fecha_cierre ASC, cp.cod_cia ASC
        """
    ).fetchall()

    meta: dict[str, dict[str, object]] = {}
    for cod_cia, rs, per, fc in cia_hist:
        if cod_cia not in meta:
            meta[cod_cia] = {
                "cod_cia": cod_cia,
                "razon_social": rs,
                "primer_periodo": per,
                "ultimo_periodo": per,
                "cant_trimestres": 1,
            }
        else:
            meta[cod_cia]["razon_social"] = rs
            meta[cod_cia]["ultimo_periodo"] = per
            meta[cod_cia]["cant_trimestres"] = int(meta[cod_cia]["cant_trimestres"]) + 1

    # Ramos activos en el último período de cada compañía (por 5.01.01 > 0, fallback cualquier cuenta != 0 con subramo)
    ramos_primas = defaultdict(set)
    for cod_cia, cod_sr in conn.execute(
        """
        SELECT b.cod_cia, b.cod_subramo
        FROM balances b
        JOIN (
            SELECT cp.cod_cia, MAX(p.fecha_cierre) AS max_fc
            FROM companias_periodo cp
            JOIN periodos p ON p.periodo = cp.periodo
            GROUP BY cp.cod_cia
        ) u ON u.cod_cia = b.cod_cia
        JOIN periodos p2 ON p2.periodo = b.periodo AND p2.fecha_cierre = u.max_fc
        WHERE b.cod_subramo != ''
          AND b.cod_cuenta LIKE '5.01.01.%'
          AND ABS(b.importe) > 0
        """
    ).fetchall():
        ramos_primas[cod_cia].add(get_gran_ramo(cod_sr))

    ramos_any = defaultdict(set)
    for cod_cia, cod_sr in conn.execute(
        """
        SELECT DISTINCT b.cod_cia, b.cod_subramo
        FROM balances b
        WHERE b.cod_subramo != ''
          AND ABS(b.importe) > 0
        """
    ).fetchall():
        ramos_any[cod_cia].add(get_gran_ramo(cod_sr))

    rows_out = []
    for cod_cia in sorted(meta.keys()):
        m = meta[cod_cia]
        rs = str(m["razon_social"])
        rset = ramos_primas.get(cod_cia) or ramos_any.get(cod_cia) or set()
        const = classify_constitucion(rs)
        tipo = classify_tipo_cia(rset, rs)
        rows_out.append(
            {
                "cod_cia": cod_cia,
                "razon_social": rs,
                "primer_periodo": m["primer_periodo"],
                "ultimo_periodo": m["ultimo_periodo"],
                "cant_trimestres": m["cant_trimestres"],
                "constitucion_sugerida": const,
                "ramos_activos": "|".join(sorted(rset - {"Administración"})),
                "tipo_cia_sugerido": tipo,
                "grupo_economico": "",
            }
        )

    out_path = CAT_DIR / "companias_seed.csv"
    fields = [
        "cod_cia",
        "razon_social",
        "primer_periodo",
        "ultimo_periodo",
        "cant_trimestres",
        "constitucion_sugerida",
        "ramos_activos",
        "tipo_cia_sugerido",
        "grupo_economico",
    ]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows_out)
    print(f"Generado {out_path} ({len(rows_out)} compañías distintas)")
    return rows_out


def audit_integrity(conn: sqlite3.Connection) -> None:
    print("\n=== RESUMEN DE PERÍODOS Y CUADRE CONTABLE (ACTIVO = PASIVO + PN) ===")
    periodos = conn.execute(
        """
        SELECT periodo, fecha_cierre, ejercicio, trimestre_ej, filas, companias
        FROM periodos
        ORDER BY fecha_cierre ASC
        """
    ).fetchall()

    balances_top = conn.execute(
        """
        SELECT periodo, cod_cia,
               SUM(CASE WHEN cod_cuenta = '1.00.00.00.00.00.00.00' THEN importe ELSE 0 END) AS activo,
               SUM(CASE WHEN cod_cuenta = '2.00.00.00.00.00.00.00' THEN importe ELSE 0 END) AS pasivo,
               SUM(CASE WHEN cod_cuenta = '3.00.00.00.00.00.00.00' THEN importe ELSE 0 END) AS pn
        FROM balances
        WHERE cod_subramo = ''
          AND cod_cuenta IN ('1.00.00.00.00.00.00.00', '2.00.00.00.00.00.00.00', '3.00.00.00.00.00.00.00')
        GROUP BY periodo, cod_cia
        """
    ).fetchall()

    diffs_by_per: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for per, cia, act, pas, pn in balances_top:
        diff = abs(act - (pas + pn))
        diffs_by_per[per].append((cia, diff))

    header = f"{'Período':<8} {'Cierre':<10} {'Ejercicio':<10} {'T':>2} {'Filas':>9} {'Cías':>5} {'Ok(<$1k)':>9} {'Desv>$1k':>9} {'MaxDesv($)':>12}"
    print(header)
    print("-" * len(header))
    desvios_grandes = []
    for per, fc, ej, tr, filas, cias in periodos:
        dlist = diffs_by_per[per]
        ok_cnt = sum(1 for _, d in dlist if d < 1000.0)
        bad = [(c, d) for c, d in dlist if d >= 1000.0]
        max_d = max((d for _, d in dlist), default=0.0)
        print(f"{per:<8} {fc:<10} {ej:<10} {tr:>2} {filas:>9,} {cias:>5} {ok_cnt:>9} {len(bad):>9} {max_d:>12,.2f}")
        for c, d in bad:
            desvios_grandes.append((per, c, d))

    if desvios_grandes:
        print("\nDetalle desvíos >= $1.000:")
        for per, c, d in desvios_grandes[:20]:
            print(f"  {per} cia={c}: diff={d:,.2f}")

    first_per = periodos[0][0] if periodos else ""
    latest_per = periodos[-1][0] if periodos else ""
    n_periodos = len(periodos)

    # Verificar empresas clave en el período más reciente
    print(f"\n=== EMPRESAS CLAVE EN {latest_per} (en miles de pesos) ===")
    target_rows = conn.execute(
        """
        SELECT cp.cod_cia, cp.razon_social,
               SUM(CASE WHEN b.cod_cuenta = '1.00.00.00.00.00.00.00' THEN b.importe ELSE 0 END) / 1000.0 AS activo,
               SUM(CASE WHEN b.cod_cuenta = '3.00.00.00.00.00.00.00' THEN b.importe ELSE 0 END) / 1000.0 AS pn,
               (SUM(CASE WHEN b.cod_cuenta = '5.01.01.00.00.00.00.00' THEN b.importe ELSE 0 END)
                - SUM(CASE WHEN b.cod_cuenta = '4.01.04.00.00.00.00.00' THEN b.importe ELSE 0 END)) / 1000.0 AS emitidas,
               (SUM(CASE WHEN b.cod_cuenta = '5.01.00.00.00.00.00.00' THEN b.importe ELSE 0 END)
                - SUM(CASE WHEN b.cod_cuenta = '4.01.00.00.00.00.00.00' THEN b.importe ELSE 0 END)) / 1000.0 AS res_tec,
               (SUM(CASE WHEN b.cod_cuenta = '5.02.00.00.00.00.00.00' THEN b.importe ELSE 0 END)
                - SUM(CASE WHEN b.cod_cuenta = '4.02.00.00.00.00.00.00' THEN b.importe ELSE 0 END)) / 1000.0 AS res_fin,
               (SUM(CASE WHEN b.cod_cuenta = '5.00.00.00.00.00.00.00' THEN b.importe ELSE 0 END)
                - SUM(CASE WHEN b.cod_cuenta = '4.00.00.00.00.00.00.00' THEN b.importe ELSE 0 END)) / 1000.0 AS res_ej
        FROM companias_periodo cp
        JOIN balances b ON b.periodo = cp.periodo AND b.cod_cia = cp.cod_cia AND b.cod_subramo = ''
        WHERE cp.periodo = ?
          AND (cp.cod_cia IN ('0117','0317','0436','0618','0224','0251')
               OR UPPER(cp.razon_social) LIKE '%ORIGENES%RETIRO%'
               OR UPPER(cp.razon_social) LIKE '%ORÍGENES%RETIRO%'
               OR UPPER(cp.razon_social) LIKE '%PREVENCION%RIESGOS%'
               OR UPPER(cp.razon_social) LIKE '%PREVENCIÓN%RIESGOS%')
        GROUP BY cp.cod_cia, cp.razon_social
        ORDER BY cp.cod_cia
        """,
        (latest_per,),
    ).fetchall()
    for r in target_rows:
        print(f"  {r[0]} {r[1][:42]:<42} | Act={r[2]:>14,.0f} | PN={r[3]:>13,.0f} | Emit={r[4]:>13,.0f} | RT={r[5]:>12,.0f} | RF={r[6]:>12,.0f} | RE={r[7]:>12,.0f}")

    # Verificar estabilidad de códigos PCU nivel 1-3 entre primer y último período
    print(f"\n=== ESTABILIDAD PCU NIVEL 1-3 ({first_per} vs {latest_per}) ===")
    pcu_first = {
        r[0]
        for r in conn.execute(
            "SELECT DISTINCT cod_cuenta FROM balances WHERE periodo = ? AND nivel <= 3",
            (first_per,),
        ).fetchall()
    }
    pcu_latest = {
        r[0]
        for r in conn.execute(
            "SELECT DISTINCT cod_cuenta FROM balances WHERE periodo = ? AND nivel <= 3",
            (latest_per,),
        ).fetchall()
    }
    only_first = sorted(pcu_first - pcu_latest)
    only_latest = sorted(pcu_latest - pcu_first)
    print(f"Cuentas nivel<=3 en {first_per}: {len(pcu_first)} | en {latest_per}: {len(pcu_latest)}")
    print(f"Solo en {first_per}: {only_first}")
    print(f"Solo en {latest_per}: {only_latest}")

    # Chequeo de todos los períodos para cuentas nivel 1-3 nuevas/desaparecidas
    all_pers = [p[0] for p in periodos]
    per_sets = {}
    for p in all_pers:
        per_sets[p] = {
            r[0] for r in conn.execute("SELECT DISTINCT cod_cuenta FROM balances WHERE periodo = ? AND nivel <= 3", (p,)).fetchall()
        }
    union_all = set().union(*per_sets.values())
    inter_all = set.intersection(*per_sets.values())
    diff_any = sorted(union_all - inter_all)
    if diff_any:
        print(f"Cuentas nivel<=3 no presentes en los {n_periodos} períodos ({len(diff_any)}):")
        for cta in diff_any:
            desc = conn.execute("SELECT desc_cuenta, nivel FROM plan_cuentas WHERE cod_cuenta = ?", (cta,)).fetchone()
            present = [p for p in all_pers if cta in per_sets[p]]
            print(f"  N{desc[1] if desc else '?'} {cta} ({desc[0] if desc else ''}): presente en {len(present)}/{n_periodos} ({present[0]}..{present[-1]})")
    else:
        print(f"Todas las cuentas nivel 1-3 están presentes en los {n_periodos} períodos.")


def main() -> int:
    conn = sqlite3.connect(str(DB_PATH))
    try:
        CAT_DIR.mkdir(parents=True, exist_ok=True)
        generate_ramos_csv(conn)
        rows = generate_companias_seed(conn)
        # Resumen rápido de compañías clasificadas
        from collections import Counter
        print("Distribución constitucion_sugerida:", Counter(r["constitucion_sugerida"] for r in rows))
        print("Distribución tipo_cia_sugerido:", Counter(r["tipo_cia_sugerido"] for r in rows))
        print("Compañías con constitucion_sugerida == 'Otra' o 'Organismo / Ente Oficial':")
        for r in rows:
            if r["constitucion_sugerida"] in ("Otra", "Organismo / Ente Oficial"):
                print(f"  {r['cod_cia']}: {r['razon_social']} -> {r['constitucion_sugerida']}")
        audit_integrity(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
