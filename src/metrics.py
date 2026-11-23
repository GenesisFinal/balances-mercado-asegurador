#!/usr/bin/env python3
"""Motor contable, derivación de IPC SSN y generación de cubos JSON para el tablero."""

from __future__ import annotations

import csv
import json
import sqlite3
import statistics
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path("data/warehouse.sqlite")
CAT_DIR = Path("data/catalogos")
PROC_DIR = Path("data/processed")
IPC_CSV_PATH = CAT_DIR / "ipc_ssn.csv"
DASHBOARD_JSON_PATH = PROC_DIR / "dashboard_data.json"

MONTH_LABELS = {"03": "Mar", "06": "Jun", "09": "Sep", "12": "Dic"}

GRAN_RAMOS = ["Patrimoniales", "ART", "Personas", "Retiro"]

PR_SEGMENTS = [
    ("AP", "Accidentes Personales", "Personas"),
    ("VIDA_IND", "Vida Individual", "Personas"),
    ("VIDA_COL", "Vida Colectivo (+Oblig.)", "Personas"),
    ("VIDA_PREV", "Vida Previsional", "Personas"),
    ("VIDA_SD", "Vida Saldo Deudor", "Personas"),
    ("SALUD_COL", "Salud Colectivo", "Personas"),
    ("SALUD_IND", "Salud Individual", "Personas"),
    ("SEPELIO", "Sepelio", "Personas"),
    ("RET_IND", "Retiro Individual", "Retiro"),
    ("RET_COL", "Retiro Colectivo", "Retiro"),
    ("RTAS_PREV", "Rentas Previsionales y RT", "Retiro"),
]

SUBRAMO_TO_PR_SEG = {
    "2.010.01": "AP",
    "2.010.02": "AP",
    "2.030.01": "VIDA_IND",
    "2.030.02": "VIDA_COL",
    "2.030.04": "VIDA_COL",
    "2.030.03": "VIDA_PREV",
    "2.030.05": "VIDA_SD",
    "2.020.02": "SALUD_COL",
    "2.020.01": "SALUD_IND",
    "2.050.01": "SEPELIO",
    "2.050.02": "SEPELIO",
    "2.060.01": "RET_IND",
    "2.060.02": "RET_COL",
    "2.070.01": "RTAS_PREV",
    "2.070.02": "RTAS_PREV",
}

KNOWN_50104_CT = {"11", "12", "13", "16", "18", "21"}
KNOWN_50104_CT_SD = {"11", "12", "16", "18", "21"}
KNOWN_50104_SIN = {"01", "02", "03", "04", "05", "06", "07", "09", "10", "14", "15", "17", "19", "20", "22"}
KNOWN_50104_SIN_SD = {"01", "02", "03", "05", "06", "09", "10", "14", "15", "17", "19", "20", "22"}
KNOWN_50104_OTH = {"08"}
ALL_KNOWN_50104 = KNOWN_50104_CT | KNOWN_50104_SIN | KNOWN_50104_OTH


def format_periodo_label(fecha_cierre: str) -> str:
    y, m, _ = fecha_cierre.split("-")
    return f"{MONTH_LABELS.get(m, m)} {y}"


def compute_ipc_series(conn: sqlite3.Connection, periodos: list[tuple[str, str, str, int, int]]) -> list[dict[str, object]]:
    """Deriva la serie exacta de IPC FACPCE/SSN a partir de las cifras comparativas de cierres."""
    pend_ej_rows = conn.execute(
        """
        SELECT periodo, cod_cia, SUM(importe)
        FROM balances
        WHERE cod_subramo != ''
          AND cod_cuenta IN ('4.01.01.01.06.01.00.00', '4.01.01.01.06.99.00.00')
        GROUP BY periodo, cod_cia
        HAVING SUM(importe) > 1e8
        """
    ).fetchall()
    pend_ant_rows = conn.execute(
        """
        SELECT periodo, cod_cia, SUM(importe)
        FROM balances
        WHERE cod_subramo != ''
          AND cod_cuenta IN ('5.01.04.04.04.06.01.00', '5.01.04.04.04.06.99.00')
        GROUP BY periodo, cod_cia
        HAVING SUM(importe) > 1e8
        """
    ).fetchall()

    pend_ej: dict[str, dict[str, float]] = defaultdict(dict)
    for per, cia, val in pend_ej_rows:
        pend_ej[per][cia] = val

    pend_ant: dict[str, dict[str, float]] = defaultdict(dict)
    for per, cia, val in pend_ant_rows:
        pend_ant[per][cia] = val

    first_ej_year = int(periodos[0][2].split("/")[0])
    anchor_june = f"{first_ej_year}-2"
    if anchor_june not in pend_ej:
        anchor_june = next(p[0] for p in periodos if p[3] == 4)

    ratios_to_base: dict[str, tuple[str, float, int, float]] = {}
    for per, fc, ej, tr, _ in periodos:
        y1 = int(ej.split("/")[0])
        base_june = f"{y1}-2"
        pa_p = pend_ant[per]
        if base_june in pend_ej:
            pe_b = pend_ej[base_june]
            rs = [pa_p[c] / pe_b[c] for c in pa_p if c in pe_b and pe_b[c] > 1e8]
            ref = base_june
        else:
            pa_b = pend_ant[anchor_june]
            rs = [pa_p[c] / pa_b[c] for c in pa_p if c in pa_b and pa_b[c] > 1e8]
            ref = anchor_june
        med = statistics.median(rs) if rs else 1.0
        mad = statistics.median([abs(x - med) for x in rs]) if rs else 0.0
        ratios_to_base[per] = (ref, med, len(rs), mad)

    raw_idx: dict[str, float] = {anchor_june: 1.0}
    june_periods = sorted([p[0] for p in periodos if p[3] == 4], key=lambda x: int(x.split("-")[0]))
    for jp in june_periods:
        if jp == anchor_june:
            continue
        base_j, ratio, _, _ = ratios_to_base[jp]
        if base_j in raw_idx:
            raw_idx[jp] = raw_idx[base_j] * ratio

    for per, _, _, _, _ in periodos:
        if per not in raw_idx:
            base_j, ratio, _, _ = ratios_to_base[per]
            raw_idx[per] = raw_idx[base_j] * ratio

    base_val = raw_idx[periodos[0][0]]
    latest_val = raw_idx[periodos[-1][0]]
    out = []
    for per, fc, ej, tr, meses in periodos:
        idx_norm = (raw_idx[per] / base_val) * 100.0
        factor_latest = latest_val / raw_idx[per]
        _, _, n_cias, mad = ratios_to_base[per]
        out.append(
            {
                "periodo": per,
                "fecha_cierre": fc,
                "ipc_idx": round(idx_norm, 6),
                "factor_to_latest": round(factor_latest, 8),
                "n_cias": n_cias,
                "mad": round(mad, 8),
            }
        )

    with open(IPC_CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["periodo", "fecha_cierre", "ipc_idx", "factor_to_latest", "n_cias", "mad"])
        writer.writeheader()
        writer.writerows(out)
    print(f"Generado {IPC_CSV_PATH} ({len(out)} períodos)")
    return out


def check_no_unknown_50104(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        "SELECT DISTINCT cod_cuenta FROM balances WHERE cod_subramo != '' AND cod_cuenta LIKE '5.01.04.%'"
    ).fetchall()
    unk = [r[0] for r in rows if r[0].split(".")[5] not in ALL_KNOWN_50104]
    if unk:
        raise RuntimeError(f"Se detectaron códigos desconocidos en 5.01.04: {unk}")


def build_cubes(conn: sqlite3.Connection) -> dict[str, object]:
    t0 = time.time()
    check_no_unknown_50104(conn)

    periodos_db = conn.execute(
        "SELECT periodo, fecha_cierre, ejercicio, trimestre_ej, meses_acum FROM periodos ORDER BY fecha_cierre ASC"
    ).fetchall()
    ipc_rows = compute_ipc_series(conn, periodos_db)
    ipc_map = {r["periodo"]: r for r in ipc_rows}

    with open(CAT_DIR / "companias.csv", "r", encoding="utf-8") as f:
        cia_rows = list(csv.DictReader(f))
    with open(CAT_DIR / "ramos.csv", "r", encoding="utf-8") as f:
        ramo_rows = list(csv.DictReader(f))

    db_cias = {r[0] for r in conn.execute("SELECT DISTINCT cod_cia FROM companias_periodo").fetchall()}
    cat_cias = {r["cod_cia"] for r in cia_rows}
    missing_cias = sorted(db_cias - cat_cias)
    if missing_cias:
        raise RuntimeError(f"Hay compañías en warehouse.sqlite sin registro en companias.csv: {missing_cias}")

    p_to_idx = {p[0]: i for i, p in enumerate(periodos_db)}
    cia_rows.sort(key=lambda r: r["cod_cia"])
    c_to_idx = {r["cod_cia"]: i for i, r in enumerate(cia_rows)}

    ramos_unique: dict[str, tuple[str, str]] = {}
    sr_to_gran: dict[str, str] = {}
    subramos_raw: list[tuple[str, str, str, str]] = []
    for rr in ramo_rows:
        ramos_unique[rr["cod_ramo"]] = (rr["desc_ramo"], rr["gran_ramo"])
        sr_to_gran[rr["cod_subramo"]] = rr["gran_ramo"]
        desc_sr = " ".join(rr["desc_subramo"].split()).replace("Secc. Admnin.", "Secc. Admin.")
        subramos_raw.append((rr["cod_subramo"], desc_sr, rr["cod_ramo"], rr["gran_ramo"]))
    ramos_list = sorted(ramos_unique.items(), key=lambda x: x[0])
    r_to_idx = {cod: i for i, (cod, _) in enumerate(ramos_list)}
    subramos_list = sorted(subramos_raw, key=lambda x: x[0])
    sr_to_idx = {cod_sr: i for i, (cod_sr, _, _, _) in enumerate(subramos_list)}

    seg_to_idx = {seg_id: i for i, (seg_id, _, _) in enumerate(PR_SEGMENTS)}
    gr_to_idx = {g: i for i, g in enumerate(GRAN_RAMOS)}

    # --- 1. Query Balance General & Estado de Resultados top accounts (cod_subramo = '') ---
    top_accounts = {
        "1.00.00.00.00.00.00.00": "activo",
        "1.01.00.00.00.00.00.00": "disp",
        "1.02.00.00.00.00.00.00": "inv",
        "1.02.01.01.00.00.00.00": "inv_tp_loc",
        "1.02.01.02.00.00.00.00": "inv_acc_loc",
        "1.02.01.02.01.02.00.00": "acc_ge_cc",
        "1.02.01.02.02.02.00.00": "acc_ge_sc",
        "1.02.01.03.00.00.00.00": "inv_on_loc",
        "1.02.01.04.00.00.00.00": "inv_fci_loc",
        "1.02.01.05.00.00.00.00": "inv_fid_loc",
        "1.02.01.06.00.00.00.00": "inv_pf_loc",
        "1.02.01.07.00.00.00.00": "inv_pres",
        "1.02.01.08.00.00.00.00": "inv_otras_loc",
        "1.02.02.01.00.00.00.00": "inv_ext",
        "1.02.02.01.01.00.00.00": "inv_tp_ext",
        "1.02.02.01.02.00.00.00": "inv_acc_ext",
        "1.02.02.01.02.02.00.00": "acc_ge_ext",
        "1.02.02.01.03.00.00.00": "inv_on_ext",
        "1.02.02.01.04.00.00.00": "inv_fci_ext",
        "1.02.02.01.05.00.00.00": "inv_fid_ext",
        "1.02.02.01.06.00.00.00": "inv_pf_ext",
        "1.02.02.01.07.00.00.00": "inv_otr_ext_7",
        "1.02.02.01.08.00.00.00": "inv_otr_ext_8",
        "1.03.00.00.00.00.00.00": "creditos",
        "1.03.01.00.00.00.00.00": "prem_cob",
        "1.03.02.00.00.00.00.00": "cred_reas",
        "1.03.03.00.00.00.00.00": "cred_coas",
        "1.03.04.00.00.00.00.00": "otros_cred_puro",
        "1.04.00.00.00.00.00.00": "inmuebles",
        "1.05.00.00.00.00.00.00": "bienes_uso",
        "1.06.00.00.00.00.00.00": "otros_act",
        "2.00.00.00.00.00.00.00": "pasivo",
        "2.01.01.00.00.00.00.00": "deudas_aseg",
        "2.01.02.00.00.00.00.00": "deudas_reas",
        "2.01.03.00.00.00.00.00": "deudas_coas",
        "2.01.04.00.00.00.00.00": "deudas_prod",
        "2.01.05.00.00.00.00.00": "deudas_fisc",
        "2.01.06.00.00.00.00.00": "otras_deudas",
        "2.02.00.00.00.00.00.00": "comp_tec",
        "2.03.00.00.00.00.00.00": "previsiones",
        "3.00.00.00.00.00.00.00": "pn",
        "4.00.00.00.00.00.00.00": "perdidas",
        "4.01.00.00.00.00.00.00": "perd_tec",
        "4.01.01.00.00.00.00.00": "sin_bruto",
        "4.01.02.00.00.00.00.00": "otras_ind_tot",
        "4.01.02.02.00.00.00.00": "rentas",
        "4.01.02.03.00.00.00.00": "otras_ind",
        "4.01.03.00.00.00.00.00": "ced_bruto",
        "4.01.04.00.00.00.00.00": "anul_emit",
        "4.01.05.00.00.00.00.00": "ct_perd",
        "4.01.06.00.00.00.00.00": "g_prod",
        "4.01.06.06.01.00.00.00": "g_prod_com",
        "4.01.07.00.00.00.00.00": "g_expl",
        "4.01.07.01.00.00.00.00": "g_sueldos",
        "4.01.07.02.00.00.00.00": "g_dir",
        "4.01.07.03.00.00.00.00": "g_hon",
        "4.01.07.04.00.00.00.00": "g_imp",
        "4.01.07.05.00.00.00.00": "g_pub",
        "4.01.50.00.00.00.00.00": "otros_egr_50",
        "4.01.60.00.00.00.00.00": "otros_egr_60",
        "4.02.00.00.00.00.00.00": "perd_fin",
        "4.04.00.00.00.00.00.00": "perd_extra",
        "4.05.00.00.00.00.00.00": "imp_gan_p",
        "5.00.00.00.00.00.00.00": "ganancias",
        "5.01.00.00.00.00.00.00": "gan_tec",
        "5.01.01.00.00.00.00.00": "emit_bruto",
        "5.01.02.00.00.00.00.00": "cred_anul_ced",
        "5.01.03.00.00.00.00.00": "g_reas",
        "5.01.05.00.00.00.00.00": "otros_ing_50105",
        "5.02.00.00.00.00.00.00": "gan_fin",
        "5.02.01.00.00.00.00.00": "fin_rentas",
        "5.02.02.00.00.00.00.00": "fin_realiz",
        "5.02.03.00.00.00.00.00": "fin_tenencia",
        "5.02.04.00.00.00.00.00": "fin_otros_ing",
        "5.02.05.00.00.00.00.00": "recpam",
        "5.03.00.00.00.00.00.00": "gan_extra",
    }

    placeholders = ",".join("?" for _ in top_accounts)
    cq_raw: dict[tuple[str, str], dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for per, cia, cta, imp in conn.execute(
        f"""
        SELECT periodo, cod_cia, cod_cuenta, importe
        FROM balances
        WHERE cod_subramo = '' AND cod_cuenta IN ({placeholders})
        """,
        list(top_accounts.keys()),
    ).fetchall():
        cq_raw[(per, cia)][top_accounts[cta]] = imp

    # --- 2. Query subramo detail (cod_subramo != '') in a single scan ---
    # Classify leaf accounts once into fast buckets
    ct_cred_all: dict[tuple[str, str], float] = defaultdict(float)
    sin_cred_all: dict[tuple[str, str], float] = defaultdict(float)
    oth_cred_all: dict[tuple[str, str], float] = defaultdict(float)
    emit_sd_cia: dict[tuple[str, str], float] = defaultdict(float)

    rq_acc: dict[tuple[str, str, str], list[float]] = defaultdict(lambda: [0.0] * 9)
    srq_acc: dict[tuple[str, str, str], list[float]] = defaultdict(lambda: [0.0] * 9)
    # 0:emit_sd, 1:ced_sd, 2:ct_loss_sd, 3:ct_cred_sd, 4:sin_loss_sd, 5:sin_cred_sd, 6:g_prod_sd, 7:g_expl_sd, 8:g_reas_sd

    prq_acc: dict[tuple[str, str, str], list[float]] = defaultdict(lambda: [0.0] * 9)
    # 0:emit_tot, 1:emit_sd, 2:cedidas, 3:ct_perd, 4:ct_cred, 5:sin_bruto, 6:sin_cred,
    # 7:rescates, 8:rentas, 9:otras_ind, 10:g_prod, 11:g_expl, 12:g_reas, 13:otros_ing, 14:otros_egr
    gq_acc: dict[tuple[str, str, str], list[float]] = defaultdict(lambda: [0.0] * 15)
    pr_subq_flow: dict[tuple[str, str, str], list[float]] = defaultdict(lambda: [0.0] * 20)
    pr_subq_stock: dict[tuple[str, str, str], list[float]] = defaultdict(lambda: [0.0] * 9)

    for per, cia, cod_sr, cta, imp in conn.execute(
        """
        SELECT periodo, cod_cia, cod_subramo, cod_cuenta, importe
        FROM balances
        WHERE cod_subramo != ''
          AND (cod_cuenta LIKE '4.01.%' OR cod_cuenta LIKE '5.01.%')
        """
    ).fetchall():
        if imp == 0.0:
            continue
        cod_r = cod_sr[:5]
        pr_seg = SUBRAMO_TO_PR_SEG.get(cod_sr)
        gran = sr_to_gran.get(cod_sr)
        ga = gq_acc[(per, cia, gran)] if gran in gr_to_idx else None
        ps = pr_subq_flow[(per, cia, cod_sr)] if gran in ("Personas", "Retiro") else None
        parts = cta.split(".")
        p2 = parts[2]
        p3 = parts[3]

        # 5.01.04 partition for both company total, Gran Ramo and SD ramo/subramo
        if cta.startswith("5.01.04."):
            xx = parts[5]
            if xx in KNOWN_50104_CT:
                ct_cred_all[(per, cia)] += imp
                if ga is not None:
                    ga[4] += imp
                if ps is not None:
                    ps[4] += imp
            elif xx in KNOWN_50104_SIN:
                sin_cred_all[(per, cia)] += imp
                if ga is not None:
                    ga[6] += imp
                if ps is not None:
                    ps[6] += imp
                if ps is not None and xx in ("01", "05", "15"):
                    ps[18] += imp
            elif xx in KNOWN_50104_OTH:
                oth_cred_all[(per, cia)] += imp
                if ga is not None:
                    ga[13] += imp
                if ps is not None:
                    ps[13] += imp
                    if xx == "08":
                        ps[19] += imp

            if xx in KNOWN_50104_CT_SD:
                rq_acc[(per, cia, cod_r)][3] += imp
                srq_acc[(per, cia, cod_sr)][3] += imp
                if pr_seg:
                    prq_acc[(per, cia, pr_seg)][3] += imp
            elif xx in KNOWN_50104_SIN_SD:
                rq_acc[(per, cia, cod_r)][5] += imp
                srq_acc[(per, cia, cod_sr)][5] += imp
                if pr_seg:
                    prq_acc[(per, cia, pr_seg)][5] += imp
            continue

        if ga is not None:
            if cta.startswith("5.01.01."):
                ga[0] += imp
                if ps is not None:
                    ps[0] += imp
                if cta.startswith(("5.01.01.01.01.01.", "5.01.01.01.01.02.", "5.01.01.01.01.03.")):
                    ga[1] += imp
                    if ps is not None:
                        ps[1] += imp
            elif cta.startswith("4.01.04."):
                ga[0] -= imp
                if ps is not None:
                    ps[0] -= imp
                if cta.startswith(("4.01.04.04.04.01.", "4.01.04.04.04.02.")):
                    ga[1] -= imp
                    if ps is not None:
                        ps[1] -= imp
            elif cta.startswith("4.01.03."):
                ga[2] += imp
                if ps is not None:
                    ps[2] += imp
            elif cta.startswith("5.01.02."):
                ga[2] -= imp
                if ps is not None:
                    ps[2] -= imp
            elif cta.startswith("4.01.05."):
                ga[3] += imp
                if ps is not None:
                    ps[3] += imp
            elif cta.startswith("4.01.01."):
                ga[5] += imp
                if ps is not None:
                    ps[5] += imp
                    if parts[4] in ("07", "14"):
                        ps[18] -= imp
            elif cta.startswith("4.01.02."):
                if p3 == "02":
                    ga[8] += imp
                    if ps is not None:
                        ps[8] += imp
                elif p3 == "03":
                    ga[9] += imp
                    if ps is not None:
                        ps[9] += imp
                else:
                    ga[7] += imp
                    if ps is not None:
                        ps[7] += imp
            elif cta.startswith("4.01.06."):
                ga[10] += imp
                if ps is not None:
                    ps[10] += imp
                    if cta.startswith("4.01.06.06.01.01."):
                        ps[15] += imp
                    elif cta.startswith("4.01.06.06.01.02."):
                        ps[16] += imp
                    elif cta.startswith("4.01.06.06.50."):
                        ps[17] += imp
            elif cta.startswith("4.01.07."):
                ga[11] += imp
                if ps is not None:
                    ps[11] += imp
            elif cta.startswith("5.01.03."):
                ga[12] += imp
                if ps is not None:
                    ps[12] += imp
            elif cta.startswith("5.01.05."):
                ga[13] += imp
                if ps is not None:
                    ps[13] += imp
            elif cta.startswith(("4.01.50.", "4.01.60.")):
                ga[14] += imp
                if ps is not None:
                    ps[14] += imp

        # Primas emitidas SD (5.01.01.01.01.{01,02,03}.* - 4.01.04.04.04.{01,02}.*)
        if cta.startswith(("5.01.01.01.01.01.", "5.01.01.01.01.02.", "5.01.01.01.01.03.")):
            emit_sd_cia[(per, cia)] += imp
            rq_acc[(per, cia, cod_r)][0] += imp
            srq_acc[(per, cia, cod_sr)][0] += imp
            if pr_seg:
                prq_acc[(per, cia, pr_seg)][0] += imp
        elif cta.startswith(("4.01.04.04.04.01.", "4.01.04.04.04.02.")):
            emit_sd_cia[(per, cia)] -= imp
            rq_acc[(per, cia, cod_r)][0] -= imp
            srq_acc[(per, cia, cod_sr)][0] -= imp
            if pr_seg:
                prq_acc[(per, cia, pr_seg)][0] -= imp
        elif cta.startswith("4.01.03.03.03.01."):
            rq_acc[(per, cia, cod_r)][1] += imp
            srq_acc[(per, cia, cod_sr)][1] += imp
            if pr_seg:
                prq_acc[(per, cia, pr_seg)][1] += imp
        elif cta.startswith("5.01.02.02.02.02."):
            rq_acc[(per, cia, cod_r)][1] -= imp
            srq_acc[(per, cia, cod_sr)][1] -= imp
            if pr_seg:
                prq_acc[(per, cia, pr_seg)][1] -= imp
        elif cta.startswith("4.01.05.") and parts[4] != "03":
            rq_acc[(per, cia, cod_r)][2] += imp
            srq_acc[(per, cia, cod_sr)][2] += imp
            if pr_seg:
                prq_acc[(per, cia, pr_seg)][2] += imp
        elif cta.startswith("4.01.01.") and parts[4] not in ("08", "09"):
            rq_acc[(per, cia, cod_r)][4] += imp
            srq_acc[(per, cia, cod_sr)][4] += imp
            if pr_seg:
                prq_acc[(per, cia, pr_seg)][4] += imp
        elif cta.startswith("4.01.06.") and not cta.startswith("4.01.06.06.01.03."):
            rq_acc[(per, cia, cod_r)][6] += imp
            srq_acc[(per, cia, cod_sr)][6] += imp
            if pr_seg:
                prq_acc[(per, cia, pr_seg)][6] += imp
        elif cta.startswith("4.01.07."):
            rq_acc[(per, cia, cod_r)][7] += imp
            srq_acc[(per, cia, cod_sr)][7] += imp
            if pr_seg:
                prq_acc[(per, cia, pr_seg)][7] += imp
        elif cta.startswith("5.01.03.03.03.01."):
            rq_acc[(per, cia, cod_r)][8] += imp
            srq_acc[(per, cia, cod_sr)][8] += imp
            if pr_seg:
                prq_acc[(per, cia, pr_seg)][8] += imp

    for per, cia, cod_sr, cta, imp in conn.execute(
        """
        SELECT periodo, cod_cia, cod_subramo, cod_cuenta, importe
        FROM balances
        WHERE cod_subramo != ''
          AND substr(cod_subramo, 1, 5) IN ('2.010','2.020','2.030','2.050','2.060','2.070')
          AND (cod_cuenta LIKE '1.03.01.%' OR cod_cuenta LIKE '2.01.01.%' OR cod_cuenta LIKE '2.02.%')
        """
    ).fetchall():
        if imp == 0.0:
            continue
        st = pr_subq_stock[(per, cia, cod_sr)]
        if cta.startswith("1.03.01."):
            st[0] += imp
        elif cta.startswith("2.01.01."):
            st[1] += imp
            if cta == "2.01.01.01.01.01.00.00":
                st[3] += imp
            elif cta == "2.01.01.01.01.02.00.00":
                st[4] += imp
            elif cta == "2.01.01.01.01.03.00.00":
                st[5] += imp
            elif cta in ("2.01.01.01.01.05.00.00", "2.01.01.01.01.06.00.00"):
                st[6] += imp
            elif cta == "2.01.01.01.01.08.00.00":
                st[7] += imp
            elif cta in ("2.01.01.01.01.04.01.00", "2.01.01.01.01.10.00.00"):
                st[8] -= imp  # magnitud positiva a/c reaseguradores
        elif cta.startswith("2.02."):
            st[2] += imp

    # --- 3. Assemble cq table ---
    cq_cols = [
        "p", "c",
        "activo", "disp", "inv", "prem_cob", "cred_reas", "otros_cred", "inmuebles", "bienes_uso", "otros_act",
        "pasivo", "deudas_aseg", "deudas_reas", "deudas_prod", "deudas_fisc", "otras_deudas", "comp_tec", "previsiones", "pn",
        "inv_tp", "inv_acc", "inv_on", "inv_fci", "inv_fid", "inv_pf", "inv_otr", "acc_ge",
        "emit_tot", "emit_sd", "cedidas", "prim_dev", "sin_dev",
        "rescates", "rentas", "otras_ind",
        "g_prod", "g_prod_com", "g_expl", "g_reas", "g_tot", "g_sueldos", "g_dir", "g_hon", "g_imp", "g_pub",
        "otros_ing", "otros_egr",
        "res_tec", "fin_rentas", "fin_realiz", "fin_tenencia", "fin_otros", "res_fin", "recpam", "res_extra", "imp_gan", "res_ej",
    ]
    cq_rows = []
    cia_pers = conn.execute(
        """
        SELECT cp.periodo, cp.cod_cia
        FROM companias_periodo cp
        JOIN periodos p ON p.periodo = cp.periodo
        ORDER BY p.fecha_cierre ASC, cp.cod_cia ASC
        """
    ).fetchall()

    k = 1000.0
    for per, cia in cia_pers:
        d = cq_raw[(per, cia)]
        cred_reas = d["cred_reas"] + d["cred_coas"]
        otros_cred = d["otros_cred_puro"]
        deudas_reas = d["deudas_reas"] + d["deudas_coas"]

        # Anexo 2 consolidando País + Exterior por instrumento
        inv_tp = d["inv_tp_loc"] + d["inv_tp_ext"]
        inv_acc = d["inv_acc_loc"] + d["inv_acc_ext"]
        inv_on = d["inv_on_loc"] + d["inv_on_ext"]
        inv_fci = d["inv_fci_loc"] + d["inv_fci_ext"]
        inv_fid = d["inv_fid_loc"] + d["inv_fid_ext"]
        inv_pf = d["inv_pf_loc"] + d["inv_pf_ext"]
        inv_otr = d["inv_pres"] + d["inv_otras_loc"] + d["inv_otr_ext_7"] + d["inv_otr_ext_8"]
        acc_ge = d["acc_ge_cc"] + d["acc_ge_sc"] + d["acc_ge_ext"]

        emit_tot = d["emit_bruto"] - d["anul_emit"]
        emit_sd = emit_sd_cia[(per, cia)]
        cedidas = d["ced_bruto"] - d["cred_anul_ced"]
        prim_dev = emit_tot - cedidas - d["ct_perd"] + ct_cred_all[(per, cia)]
        sin_dev = d["sin_bruto"] - sin_cred_all[(per, cia)]
        rentas = d["rentas"]
        otras_ind = d["otras_ind"]
        rescates = d["otras_ind_tot"] - rentas - otras_ind
        g_prod = d["g_prod"]
        g_expl = d["g_expl"]
        g_reas = d["g_reas"]
        g_tot = g_prod + g_expl - g_reas
        otros_ing = d["otros_ing_50105"] + oth_cred_all[(per, cia)]
        otros_egr = d["otros_egr_50"] + d["otros_egr_60"]
        res_tec = d["gan_tec"] - d["perd_tec"]
        fin_otros = d["fin_otros_ing"] - d["perd_fin"]
        res_fin = d["gan_fin"] - d["perd_fin"]
        res_extra = d["gan_extra"] - d["perd_extra"]
        imp_gan = -d["imp_gan_p"]
        res_ej = d["ganancias"] - d["perdidas"]

        # Assert P&L & Balance sheet component identities within $10 pesos
        diff_er = abs((res_tec + res_fin + res_extra + imp_gan) - res_ej)
        if diff_er > 10.0:
            raise AssertionError(f"Identidad ER rota en {per} {cia}: diff={diff_er}")
        diff_rt = abs((prim_dev - sin_dev - rescates - rentas - otras_ind - g_tot + otros_ing - otros_egr) - res_tec)
        if diff_rt > 10.0:
            raise AssertionError(f"Identidad RT rota en {per} {cia}: diff={diff_rt}")
        diff_act = abs((d["disp"] + d["inv"] + d["prem_cob"] + cred_reas + otros_cred + d["inmuebles"] + d["bienes_uso"] + d["otros_act"]) - d["activo"])
        if diff_act > 10.0:
            raise AssertionError(f"Identidad Activo rota en {per} {cia}: diff={diff_act}")
        diff_pas = abs((d["deudas_aseg"] + deudas_reas + d["deudas_prod"] + d["deudas_fisc"] + d["otras_deudas"] + d["comp_tec"] + d["previsiones"]) - d["pasivo"])
        if diff_pas > 10.0:
            raise AssertionError(f"Identidad Pasivo rota en {per} {cia}: diff={diff_pas}")
        diff_inv = abs((inv_tp + inv_acc + inv_on + inv_fci + inv_fid + inv_pf + inv_otr) - d["inv"])
        if diff_inv > 10.0:
            raise AssertionError(f"Identidad Inversiones Anexo 2 rota en {per} {cia}: diff={diff_inv}")
        diff_fin = abs((d["fin_rentas"] + d["fin_realiz"] + d["fin_tenencia"] + fin_otros + d["recpam"]) - res_fin)
        if diff_fin > 10.0:
            raise AssertionError(f"Identidad Estructura Financiera rota en {per} {cia}: diff={diff_fin}")

        vals = [
            d["activo"], d["disp"], d["inv"], d["prem_cob"], cred_reas, otros_cred, d["inmuebles"], d["bienes_uso"], d["otros_act"],
            d["pasivo"], d["deudas_aseg"], deudas_reas, d["deudas_prod"], d["deudas_fisc"], d["otras_deudas"], d["comp_tec"], d["previsiones"], d["pn"],
            inv_tp, inv_acc, inv_on, inv_fci, inv_fid, inv_pf, inv_otr, acc_ge,
            emit_tot, emit_sd, cedidas, prim_dev, sin_dev,
            rescates, rentas, otras_ind,
            g_prod, d["g_prod_com"], g_expl, g_reas, g_tot, d["g_sueldos"], d["g_dir"], d["g_hon"], d["g_imp"], d["g_pub"],
            otros_ing, otros_egr,
            res_tec, d["fin_rentas"], d["fin_realiz"], d["fin_tenencia"], fin_otros, res_fin, d["recpam"], res_extra, imp_gan, res_ej,
        ]
        cq_rows.append([p_to_idx[per], c_to_idx[cia]] + [round(v / k, 3) for v in vals])

    # --- 4. Assemble rq table ---
    rq_cols = ["p", "c", "r", "emit_sd", "ced_sd", "prim_dev_sd", "sin_dev_sd", "g_prod_sd", "g_expl_sd", "g_reas_sd", "g_tot_sd"]
    rq_rows = []
    for (per, cia, cod_r), acc in sorted(rq_acc.items(), key=lambda x: (p_to_idx[x[0][0]], c_to_idx[x[0][1]], x[0][2])):
        if cod_r not in r_to_idx:
            continue
        emit_sd, ced_sd, ct_l, ct_c, sin_l, sin_c, gp, ge, gr = acc
        prim_dev_sd = emit_sd - ced_sd - ct_l + ct_c
        sin_dev_sd = sin_l - sin_c
        g_tot_sd = gp + ge - gr
        vals = [emit_sd, ced_sd, prim_dev_sd, sin_dev_sd, gp, ge, gr, g_tot_sd]
        if any(abs(v) >= 10.0 for v in vals):
            rq_rows.append([p_to_idx[per], c_to_idx[cia], r_to_idx[cod_r]] + [round(v / k, 2) for v in vals])

    # --- 4b. Assemble srq table (Subramos SD) ---
    srq_cols = ["p", "c", "sr", "emit_sd", "prim_dev_sd", "sin_dev_sd", "g_prod_sd", "g_expl_sd", "g_tot_sd"]
    srq_rows = []
    for (per, cia, cod_sr), acc in sorted(srq_acc.items(), key=lambda x: (p_to_idx[x[0][0]], c_to_idx[x[0][1]], x[0][2])):
        if cod_sr not in sr_to_idx:
            continue
        emit_sd, ced_sd, ct_l, ct_c, sin_l, sin_c, gp, ge, gr = acc
        prim_dev_sd = emit_sd - ced_sd - ct_l + ct_c
        sin_dev_sd = sin_l - sin_c
        g_tot_sd = gp + ge - gr
        vals = [emit_sd, prim_dev_sd, sin_dev_sd, gp, ge, g_tot_sd]
        if any(abs(v) >= 1.0 for v in vals):
            srq_rows.append([p_to_idx[per], c_to_idx[cia], sr_to_idx[cod_sr]] + [round(v / k, 2) for v in vals])

    # --- 5. Assemble prq table (Personas & Retiro Looker Studio segments) ---
    prq_cols = ["p", "c", "s", "emit_sd", "prim_dev_sd", "sin_dev_sd", "g_tot_sd"]
    prq_rows = []
    for (per, cia, seg_id), acc in sorted(prq_acc.items(), key=lambda x: (p_to_idx[x[0][0]], c_to_idx[x[0][1]], seg_to_idx[x[0][2]])):
        emit_sd, ced_sd, ct_l, ct_c, sin_l, sin_c, gp, ge, gr = acc
        prim_dev_sd = emit_sd - ced_sd - ct_l + ct_c
        sin_dev_sd = sin_l - sin_c
        g_tot_sd = gp + ge - gr
        vals = [emit_sd, prim_dev_sd, sin_dev_sd, g_tot_sd]
        if any(abs(v) >= 1.0 for v in vals):
            prq_rows.append([p_to_idx[per], c_to_idx[cia], seg_to_idx[seg_id]] + [round(v / k, 3) for v in vals])

    # --- 6. Assemble gq table (Estructura Técnica completa por Gran Ramo) ---
    gq_cols = [
        "p", "c", "g",
        "emit_tot", "emit_sd", "cedidas", "prim_dev", "sin_dev",
        "rescates", "rentas", "otras_ind",
        "g_prod", "g_expl", "g_reas", "g_tot", "otros_ing", "otros_egr", "res_tec",
    ]
    gq_rows = []
    gq_rt_sum_by_pc: dict[tuple[str, str], float] = defaultdict(float)
    for (per, cia, gran), ga in sorted(gq_acc.items(), key=lambda x: (p_to_idx[x[0][0]], c_to_idx[x[0][1]], gr_to_idx[x[0][2]])):
        emit_tot, emit_sd, cedidas, ct_p, ct_c, sin_b, sin_c, resc, rent, oind, gp, ge, gr, oing, oegr = ga
        prim_dev = emit_tot - cedidas - ct_p + ct_c
        sin_dev = sin_b - sin_c
        g_tot = gp + ge - gr
        res_tec = prim_dev - sin_dev - resc - rent - oind - g_tot + oing - oegr
        gq_rt_sum_by_pc[(per, cia)] += res_tec
        vals = [
            emit_tot, emit_sd, cedidas, prim_dev, sin_dev,
            resc, rent, oind,
            gp, ge, gr, g_tot, oing, oegr, res_tec,
        ]
        if any(abs(v) >= 1.0 for v in vals):
            gq_rows.append([p_to_idx[per], c_to_idx[cia], gr_to_idx[gran]] + [round(v / k, 3) for v in vals])

    for per, cia in cia_pers:
        cq_rt = cq_raw[(per, cia)]["gan_tec"] - cq_raw[(per, cia)]["perd_tec"]
        diff_gq_rt = abs(gq_rt_sum_by_pc.get((per, cia), 0.0) - cq_rt)
        if diff_gq_rt > 10.0:
            raise AssertionError(f"Descuadre gq res_tec en {per} {cia}: diff={diff_gq_rt:.2f}")

    # --- 7. Assemble pr_subq table (Subramos Personas y Retiro con stocks + flujos completos) ---
    pr_subq_cols = [
        "p", "c", "sr",
        "prem_cob", "deudas_aseg", "comp_tec",
        "sp_admin", "sp_juic", "sp_med", "sp_liq", "sp_ibnr", "sp_reas",
        "emit_tot", "emit_sd", "cedidas", "prim_dev", "sin_dev",
        "rescates", "rentas", "otras_ind",
        "g_prod", "g_expl", "g_reas", "g_tot", "otros_ing", "otros_egr", "res_tec",
        "com_pas", "com_inst", "com_otros", "sin_rec_reas", "part_util_reas",
    ]
    pr_subq_rows = []
    pr_subq_rt_sum: dict[tuple[str, str, str], float] = defaultdict(float)
    pr_subq_gp_chk: dict[tuple[str, str], list[float]] = defaultdict(lambda: [0.0, 0.0])
    all_pr_keys = sorted(
        set(pr_subq_flow.keys()) | set(pr_subq_stock.keys()),
        key=lambda x: (p_to_idx[x[0]], c_to_idx[x[1]], x[2]),
    )
    for per, cia, cod_sr in all_pr_keys:
        if cod_sr not in sr_to_idx:
            continue
        gran = sr_to_gran.get(cod_sr)
        if gran not in ("Personas", "Retiro"):
            continue
        st = pr_subq_stock.get((per, cia, cod_sr), [0.0] * 9)
        prem_cob, deudas_aseg, comp_tec, sp_admin, sp_juic, sp_med, sp_liq, sp_ibnr, sp_reas = st
        fa = pr_subq_flow.get((per, cia, cod_sr), [0.0] * 20)
        emit_tot, emit_sd, cedidas, ct_p, ct_c, sin_b, sin_c, resc, rent, oind, gp, ge, gr, oing, oegr, com_pas, com_inst, com_otros, sin_rec_reas, part_util_reas = fa
        prim_dev = emit_tot - cedidas - ct_p + ct_c
        sin_dev = sin_b - sin_c
        g_tot = gp + ge - gr
        res_tec = prim_dev - sin_dev - resc - rent - oind - g_tot + oing - oegr
        pr_subq_rt_sum[(per, cia, gran)] += res_tec
        if cia in ("0117", "0436"):
            pr_subq_gp_chk[(per, cia)][0] += gp
            pr_subq_gp_chk[(per, cia)][1] += (com_pas + com_inst + com_otros)
        vals = [
            prem_cob, deudas_aseg, comp_tec,
            sp_admin, sp_juic, sp_med, sp_liq, sp_ibnr, sp_reas,
            emit_tot, emit_sd, cedidas, prim_dev, sin_dev,
            resc, rent, oind,
            gp, ge, gr, g_tot, oing, oegr, res_tec,
            com_pas, com_inst, com_otros, sin_rec_reas, part_util_reas,
        ]
        if any(abs(v) >= 1.0 for v in vals):
            pr_subq_rows.append([p_to_idx[per], c_to_idx[cia], sr_to_idx[cod_sr]] + [round(v / k, 3) for v in vals])

    for (per, cia), (gp_tot, com_tot) in pr_subq_gp_chk.items():
        if abs(gp_tot - com_tot) > 10.0:
            raise AssertionError(f"Descuadre comisiones pr_subq en {per} {cia}: gp={gp_tot:.2f} vs sum={com_tot:.2f}")

    for (per, cia, gran), ga in gq_acc.items():
        if gran not in ("Personas", "Retiro"):
            continue
        emit_tot, emit_sd, cedidas, ct_p, ct_c, sin_b, sin_c, resc, rent, oind, gp, ge, gr, oing, oegr = ga[:15]
        gq_rt = (emit_tot - cedidas - ct_p + ct_c) - (sin_b - sin_c) - resc - rent - oind - (gp + ge - gr) + oing - oegr
        diff_pr_sub = abs(pr_subq_rt_sum.get((per, cia, gran), 0.0) - gq_rt)
        if diff_pr_sub > 10.0:
            raise AssertionError(f"Descuadre pr_subq res_tec en {per} {cia} {gran}: diff={diff_pr_sub:.2f}")

    # Order groups by latest period emit_sd descending (Independientes last)
    latest_p = periodos_db[-1][0]
    grp_vol: dict[str, float] = defaultdict(float)
    for c_row in cia_rows:
        grp_vol[c_row["grupo_economico"]] += emit_sd_cia.get((latest_p, c_row["cod_cia"]), 0.0)
    grupos_sorted = sorted(
        [g for g in grp_vol.keys() if g != "Independientes"],
        key=lambda g: grp_vol[g],
        reverse=True,
    )
    if "Independientes" in grp_vol:
        grupos_sorted.append("Independientes")

    def period_key(pid: str) -> tuple[int, int]:
        y, q = pid.split("-")
        return (int(y), int(q))

    vpp_links: list[dict[str, object]] = []
    vpp_path = CAT_DIR / "participaciones_vpp.csv"
    if vpp_path.exists():
        with open(vpp_path, "r", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                pc = r["cod_controlante"].strip()
                sc = r["cod_controlada"].strip()
                if pc not in c_to_idx or sc not in c_to_idx:
                    continue
                desde = r.get("desde_periodo", "").strip()
                hasta = r.get("hasta_periodo", "").strip()
                if not desde:
                    from_p = 0
                elif desde in p_to_idx:
                    from_p = p_to_idx[desde]
                else:
                    dk = period_key(desde)
                    matches = [i for i, p in enumerate(periodos_db) if period_key(p[0]) >= dk]
                    from_p = matches[0] if matches else len(periodos_db)
                if not hasta:
                    to_p = len(periodos_db) - 1
                elif hasta in p_to_idx:
                    to_p = p_to_idx[hasta]
                else:
                    hk = period_key(hasta)
                    matches = [i for i, p in enumerate(periodos_db) if period_key(p[0]) <= hk]
                    to_p = matches[-1] if matches else -1
                vpp_links.append(
                    {
                        "pCod": pc,
                        "pIdx": c_to_idx[pc],
                        "pNom": r.get("nombre_controlante", "").strip() or cia_rows[c_to_idx[pc]]["nombre_corto"],
                        "sCod": sc,
                        "sIdx": c_to_idx[sc],
                        "sNom": r.get("nombre_controlada", "").strip() or cia_rows[c_to_idx[sc]]["nombre_corto"],
                        "grupo": r.get("grupo_economico", "").strip(),
                        "pct": float(r["pct_participacion"]),
                        "fromP": from_p,
                        "toP": to_p,
                        "desde": desde,
                        "hasta": hasta,
                        "fuente": r.get("fuente_verificacion", "").strip(),
                    }
                )

    payload = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "latest_periodo": latest_p,
            "periodos": [
                {
                    "idx": i,
                    "id": per,
                    "fecha": fc,
                    "label": format_periodo_label(fc),
                    "ej": ej,
                    "trim": tr,
                    "meses": meses,
                    "ipc_idx": ipc_map[per]["ipc_idx"],
                    "factor_latest": ipc_map[per]["factor_to_latest"],
                    "n_cias": ipc_map[per]["n_cias"],
                    "mad": ipc_map[per]["mad"],
                }
                for i, (per, fc, ej, tr, meses) in enumerate(periodos_db)
            ],
            "companias": [
                {
                    "idx": i,
                    "cod": r["cod_cia"],
                    "nombre": r["nombre_corto"],
                    "razon": r["razon_social"],
                    "tipo": r["tipo_cia"],
                    "const": r["constitucion"],
                    "grupo": r["grupo_economico"],
                    "multi": r["es_grupo_multicompania"] == "1",
                    "ls": r["es_la_segunda"] == "1",
                }
                for i, r in enumerate(cia_rows)
            ],
            "ramos": [
                {"idx": i, "cod": cod, "desc": desc, "gran": gran}
                for i, (cod, (desc, gran)) in enumerate(ramos_list)
            ],
            "subramos": [
                {
                    "idx": i,
                    "cod": cod_sr,
                    "desc": desc_sr,
                    "cod_ramo": cod_r,
                    "r_idx": r_to_idx[cod_r],
                    "desc_ramo": ramos_unique[cod_r][0],
                    "gran": gran,
                }
                for i, (cod_sr, desc_sr, cod_r, gran) in enumerate(subramos_list)
            ],
            "subramos_pr": [
                {"idx": i, "id": seg_id, "label": label, "gran": gran}
                for i, (seg_id, label, gran) in enumerate(PR_SEGMENTS)
            ],
            "grupos": grupos_sorted,
            "tipos": ["Patrimoniales y Mixtas", "ART", "Personas", "Retiro"],
            "gran_ramos": GRAN_RAMOS,
            "constituciones": ["SA", "SAU", "Cooperativa", "Mutual", "Sucursal Extranjera", "Organismo / Ente Oficial"],
            "vpp_links": vpp_links,
        },
        "cq_cols": cq_cols,
        "cq": cq_rows,
        "rq_cols": rq_cols,
        "rq": rq_rows,
        "srq_cols": srq_cols,
        "srq": srq_rows,
        "prq_cols": prq_cols,
        "prq": prq_rows,
        "gq_cols": gq_cols,
        "gq": gq_rows,
        "pr_subq_cols": pr_subq_cols,
        "pr_subq": pr_subq_rows,
    }

    PROC_DIR.mkdir(parents=True, exist_ok=True)
    with open(DASHBOARD_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    dt = time.time() - t0
    size_mb = DASHBOARD_JSON_PATH.stat().st_size / (1024 * 1024)
    print(
        f"Generado {DASHBOARD_JSON_PATH} ({size_mb:.2f} MB) en {dt:.2f}s | "
        f"cq={len(cq_rows):,}, rq={len(rq_rows):,}, srq={len(srq_rows):,}, prq={len(prq_rows):,}, gq={len(gq_rows):,}, pr_subq={len(pr_subq_rows):,}"
    )
    return payload


def main() -> int:
    conn = sqlite3.connect(str(DB_PATH))
    try:
        build_cubes(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
