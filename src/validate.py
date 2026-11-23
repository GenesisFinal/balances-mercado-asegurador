#!/usr/bin/env python3
"""Suite de conciliación automática contra PDFs SSN, Looker Studio e integridad contable."""

from __future__ import annotations

import csv
import json
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path("data/warehouse.sqlite")
CAT_DIR = Path("data/catalogos")
PROC_DIR = Path("data/processed")
DASHBOARD_JSON_PATH = PROC_DIR / "dashboard_data.json"
SSN_EXTRAS_JSON_PATH = PROC_DIR / "ssn_extras.json"
VALIDATION_JSON_PATH = PROC_DIR / "validation_report.json"

ALL_KNOWN_50104 = {
    "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
    "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22",
}

# Cifras oficiales extraídas de los 8 PDFs SSN al 30/09/2026 (2026-3), en miles de pesos
PDF_BENCHMARKS_2026_3 = {
    "0117": {
        "nombre": "La Segunda Personas",
        "bg": {
            "activo": 119509216, "disp": 1850827, "inv": 85334283, "inv_acc": 1706253,
            "prem_cob": 27494971, "otros_cred": 2329896, "inmuebles": 2391455,
            "pasivo": 52971354, "deudas_aseg": 23069465, "deudas_prod": 6633456,
            "deudas_fisc": 2105219, "otras_deudas": 1488066, "comp_tec": 19461845,
            "previsiones": 45011, "pn": 66537862,
        },
        "er": {
            "prim_dev": 17202344, "sin_dev": 6053811, "rescates": 3292, "rentas": 0, "otras_ind": 0,
            "g_tot": 9441825, "otros_ing": 70709, "otros_egr": 4030, "res_tec": 1770095,
            "res_fin": -498536, "res_ej": 2341906,
        },
        "anexos_sd": {"emit_sd": 17848048, "prim_dev_sd": 17202344, "sin_dev_sd": 6053811, "g_tot_sd": 9441825},
    },
    "0224": {
        "nombre": "Sancor Cooperativa",
        "bg": {"activo": 2308146517, "inv": 1058130914, "pasivo": 1112256816, "comp_tec": 248436718, "pn": 1195889701},
        "er": {
            "prim_dev": 412421168, "sin_dev": 193679382, "rescates": 0, "rentas": 0, "otras_ind": 895715,
            "g_tot": 201325063, "otros_ing": 182768, "otros_egr": 1124059, "res_tec": 15579716,
            "res_fin": -33517401, "res_ej": -17937685,
        },
        "anexos_sd": {"emit_sd": 509599008, "prim_dev_sd": 411036031, "sin_dev_sd": 193039831, "g_tot_sd": 201224788},
    },
    "0251": {
        "nombre": "Life Seguros",
        "bg": {"activo": 1006234522, "inv": 849328245, "pasivo": 857929112, "comp_tec": 661106990, "pn": 148305409},
        "er": {
            "prim_dev": 127329053, "sin_dev": 21297281, "rescates": 15895132, "rentas": 0, "otras_ind": 3588315,
            "g_tot": 77678473, "otros_ing": 154944, "otros_egr": 188357, "res_tec": 8836441,
            "res_fin": -24423097, "res_ej": -10055619,
        },
        "anexos_sd": {"emit_sd": 122903746, "prim_dev_sd": 127329053, "sin_dev_sd": 21297281, "g_tot_sd": 77678473},
    },
    "0317": {
        "nombre": "La Segunda Cooperativa",
        "bg": {"activo": 1322235665, "inv": 612075673, "pasivo": 714926980, "comp_tec": 168448824, "pn": 607308686},
        "er": {
            "prim_dev": 201395525, "sin_dev": 125164269, "rescates": 0, "rentas": 0, "otras_ind": 0,
            "g_tot": 112757683, "otros_ing": 5807562, "otros_egr": 0, "res_tec": -30718865,
            "res_fin": -19132698, "res_ej": -49851563,
        },
        "anexos_sd": {"emit_sd": 225333861, "prim_dev_sd": 201395525, "sin_dev_sd": 125164269, "g_tot_sd": 112757683},
    },
    "0423": {
        "nombre": "Orígenes Retiro",
        "bg": {"activo": 1236058314, "inv": 1228231403, "pasivo": 1143672855, "comp_tec": 960691754, "pn": 92385458},
        "er": {
            "prim_dev": 42739054, "sin_dev": 0, "rescates": 8468024, "rentas": 18892136, "otras_ind": 58066,
            "g_tot": 8568726, "otros_ing": 43352542, "otros_egr": 166558, "res_tec": 49938085,
            "res_fin": -62775692, "res_ej": -8178134,
        },
        "anexos_sd": {"emit_sd": 18765384, "prim_dev_sd": 42739054, "sin_dev_sd": 0, "g_tot_sd": 8568726},
    },
    "0436": {
        "nombre": "La Segunda Retiro",
        "bg": {"activo": 187514919, "inv": 178259747, "pasivo": 155895192, "comp_tec": 155682919, "pn": 31619728},
        "er": {
            "prim_dev": 6819433, "sin_dev": 0, "rescates": 2793531, "rentas": 1596526, "otras_ind": 0,
            "g_tot": 595565, "otros_ing": -2315441, "otros_egr": -797, "res_tec": -480833,
            "res_fin": -732737, "res_ej": -999693,
        },
        "anexos_sd": {"emit_sd": 7880791, "prim_dev_sd": 6819433, "sin_dev_sd": 0, "g_tot_sd": 595565},
    },
    "0618": {
        "nombre": "La Segunda ART",
        "bg": {"activo": 558221433, "inv": 457254960, "pasivo": 388729599, "comp_tec": 3363169, "pn": 169491832},
        "er": {
            "prim_dev": 155590075, "sin_dev": 128714473, "rescates": 0, "rentas": 0, "otras_ind": 0,
            "g_tot": 31565727, "otros_ing": -10870496, "otros_egr": 8343380, "res_tec": -23904002,
            "res_fin": -12055210, "res_ej": -28305551,
        },
        "anexos_sd": {"emit_sd": 159442124, "prim_dev_sd": 155590075, "sin_dev_sd": 128714473, "g_tot_sd": 31565727},
    },
    "0626": {
        "nombre": "Prevención ART",
        "bg": {"activo": 1461399858, "inv": 1131584164, "pasivo": 1223071879, "comp_tec": 0, "pn": 238327979},
        "er": {
            "prim_dev": 482287279, "sin_dev": 355601487, "rescates": 0, "rentas": 0, "otras_ind": 0,
            "g_tot": 87667771, "otros_ing": -26488429, "otros_egr": 5919102, "res_tec": 6610490,
            "res_fin": -7376530, "res_ej": 965157,
        },
        "anexos_sd": {"emit_sd": 483169950, "prim_dev_sd": 482287279, "sin_dev_sd": 355601487, "g_tot_sd": 87667771},
    },
}

# Looker Studio Personas & Retiro (pesos exactos, moneda de cada cierre)
LOOKER_TOTALS = [
    # (seg_id, ls_cod_cia, tot_26_pesos, tot_25_pesos, ls_26_pesos, ls_25_pesos)
    ("AP", "0117", 145994326915, 103157722729, 11338302012, 8271345991),
    ("VIDA_IND", "0117", 443145410539, 324611557104, 164161153, 204660817),
    ("VIDA_COL", "0117", 326379220532, 253320349917, 5515405265, 4099172788),
    ("VIDA_SD", "0117", 139417447993, 108314557692, 799990023, 589857295),
    ("SALUD_COL", "0117", 11984037885, 8925162996, 28506438, 4963354),
    ("SALUD_IND", "0117", 3855699714, 3076957065, 1682764, 460808),
    ("RET_IND", "0436", 21358578248, 12009998654, 3070129034, 502909402),
    ("RET_COL", "0436", 72267585205, 64902772076, 4810661485, 3480190920),
]

LOOKER_AP_RATIOS_2026_3 = [
    # (cod_cia, nombre, exp_sin_pct_or_None, exp_gto_pct)
    ("0224", "Sancor Seguros", 40.22, 59.84),
    ("0726", "Federación Patronal", 40.33, 51.11),
    ("0251", "Life Seguros", None, 86.64),
    ("0117", "La Segunda Personas", 40.02, 50.78),
    ("0692", "Zurich Santander", 5.64, 65.10),
]


def run_validation() -> dict[str, object]:
    if not DASHBOARD_JSON_PATH.exists():
        raise FileNotFoundError(f"Falta {DASHBOARD_JSON_PATH}. Ejecutá src/metrics.py primero.")

    data = json.loads(DASHBOARD_JSON_PATH.read_text(encoding="utf-8"))
    meta = data["meta"]
    p_idx_map = {p["id"]: p["idx"] for p in meta["periodos"]}
    c_idx_map = {c["cod"]: c["idx"] for c in meta["companias"]}
    seg_idx_map = {s["id"]: s["idx"] for s in meta["subramos_pr"]}

    cq_cols = {name: i for i, name in enumerate(data["cq_cols"])}
    rq_cols = {name: i for i, name in enumerate(data["rq_cols"])}
    prq_cols = {name: i for i, name in enumerate(data["prq_cols"])}

    cq_by_pc: dict[tuple[int, int], list[float]] = {(r[0], r[1]): r for r in data["cq"]}
    rq_sum_by_pc: dict[tuple[int, int], list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
    for r in data["rq"]:
        key = (r[0], r[1])
        rq_sum_by_pc[key][0] += r[rq_cols["emit_sd"]]
        rq_sum_by_pc[key][1] += r[rq_cols["prim_dev_sd"]]
        rq_sum_by_pc[key][2] += r[rq_cols["sin_dev_sd"]]
        rq_sum_by_pc[key][3] += r[rq_cols["g_tot_sd"]]

    prq_by_pcs: dict[tuple[int, int, int], list[float]] = {(r[0], r[1], r[2]): r for r in data["prq"]}

    latest_p_obj = meta["periodos"][-1]
    p_latest = latest_p_obj["idx"]
    latest_id = latest_p_obj["id"]
    has_26_3 = "2026-3" in p_idx_map
    has_25_3 = "2025-3" in p_idx_map
    failures: list[str] = []

    # 1. Validar 8 PDFs SSN (benchmark histórico 2026-3 mientras permanezca en la ventana)
    pdf_results = []
    if has_26_3:
        p26 = p_idx_map["2026-3"]
        for cod_cia, bench in PDF_BENCHMARKS_2026_3.items():
            ci = c_idx_map[cod_cia]
            row = cq_by_pc[(p26, ci)]
            max_diff_k = 0.0
            max_field = ""
            for sect in ("bg", "er"):
                for k, exp in bench[sect].items():
                    got = row[cq_cols[k]]
                    diff = abs(got - exp)
                    if diff > max_diff_k:
                        max_diff_k = diff
                        max_field = k
                    if diff > 2.0:
                        failures.append(f"PDF {cod_cia} ({bench['nombre']}) {k}: got={got:.2f} vs exp={exp}")
            rq_tot = rq_sum_by_pc[(p26, ci)]
            for i, k in enumerate(("emit_sd", "prim_dev_sd", "sin_dev_sd", "g_tot_sd")):
                exp = bench["anexos_sd"][k]
                got = rq_tot[i]
                diff = abs(got - exp)
                if diff > max_diff_k:
                    max_diff_k = diff
                    max_field = k
                if diff > 2.0:
                    failures.append(f"PDF {cod_cia} ({bench['nombre']}) Anexo {k}: got={got:.2f} vs exp={exp}")
            pdf_results.append({
                "cod_cia": cod_cia,
                "nombre": bench["nombre"],
                "max_diff_miles": round(max_diff_k, 3),
                "max_field": max_field,
                "ok": max_diff_k <= 2.0,
            })

    # 2. Validar 8 tablas Looker Studio (benchmark histórico 2026-3 y 2025-3)
    looker_results = []
    if has_26_3 and has_25_3:
        p26 = p_idx_map["2026-3"]
        p25 = p_idx_map["2025-3"]
        for seg_id, ls_cod, exp_t26, exp_t25, exp_ls26, exp_ls25 in LOOKER_TOTALS:
            si = seg_idx_map[seg_id]
            ci = c_idx_map[ls_cod]
            got_t26 = sum(r[prq_cols["emit_sd"]] for r in data["prq"] if r[0] == p26 and r[2] == si) * 1000.0
            got_t25 = sum(r[prq_cols["emit_sd"]] for r in data["prq"] if r[0] == p25 and r[2] == si) * 1000.0
            got_ls26 = (prq_by_pcs.get((p26, ci, si), [0] * 7)[prq_cols["emit_sd"]]) * 1000.0
            got_ls25 = (prq_by_pcs.get((p25, ci, si), [0] * 7)[prq_cols["emit_sd"]]) * 1000.0
            max_diff_pesos = max(
                abs(got_t26 - exp_t26),
                abs(got_t25 - exp_t25),
                abs(got_ls26 - exp_ls26),
                abs(got_ls25 - exp_ls25),
            )
            ok = max_diff_pesos <= 10.0
            if not ok:
                failures.append(f"Looker {seg_id}: max_diff_pesos={max_diff_pesos:,.2f}")
            looker_results.append({
                "segmento": seg_id,
                "tot_2026_3_pesos": round(got_t26),
                "tot_2025_3_pesos": round(got_t25),
                "ls_2026_3_pesos": round(got_ls26),
                "max_diff_pesos": round(max_diff_pesos, 2),
                "ok": ok,
            })

    # 3. Validar ratios AP Looker Studio (benchmark histórico 2026-3)
    ap_idx = seg_idx_map["AP"]
    ap_ratio_results = []
    if has_26_3:
        p26 = p_idx_map["2026-3"]
        for cod_cia, nombre, exp_sin, exp_gto in LOOKER_AP_RATIOS_2026_3:
            ci = c_idx_map[cod_cia]
            r = prq_by_pcs[(p26, ci, ap_idx)]
            dev = r[prq_cols["prim_dev_sd"]]
            sin_pct = (r[prq_cols["sin_dev_sd"]] / dev) * 100.0
            gto_pct = (r[prq_cols["g_tot_sd"]] / dev) * 100.0
            diff_sin = abs(sin_pct - exp_sin) if exp_sin is not None else 0.0
            diff_gto = abs(gto_pct - exp_gto)
            ok = diff_sin <= 0.02 and diff_gto <= 0.02
            if not ok:
                failures.append(f"Looker AP {nombre}: sin={sin_pct:.2f}% (exp {exp_sin}), gto={gto_pct:.2f}% (exp {exp_gto})")
            ap_ratio_results.append({
                "cod_cia": cod_cia,
                "nombre": nombre,
                "sin_pct": round(sin_pct, 2),
                "gto_pct": round(gto_pct, 2),
                "diff_max_pp": round(max(diff_sin, diff_gto), 4),
                "ok": ok,
            })

    # 4. Integridad global
    period_cnt = len(meta["periodos"])
    if period_cnt < 12:
        failures.append(f"Solo {period_cnt} períodos cargados (se esperaban >= 12).")

    p_by_id = {p["id"]: p for p in meta["periodos"]}
    ipc_ratio_26_25 = None
    ipc_diff = None
    if has_26_3 and has_25_3:
        ipc_ratio_26_25 = p_by_id["2026-3"]["ipc_idx"] / p_by_id["2025-3"]["ipc_idx"]
        ipc_diff = abs(ipc_ratio_26_25 - 1.333549)
        if ipc_diff > 0.0005:
            failures.append(f"IPC(2026-3)/IPC(2025-3) = {ipc_ratio_26_25:.6f} fuera de rango (exp 1.333549)")

    max_eq_diff_k = 0.0
    max_comp_diff_k = 0.0
    for r in data["cq"]:
        diff = abs(r[cq_cols["activo"]] - (r[cq_cols["pasivo"]] + r[cq_cols["pn"]]))
        if diff > max_eq_diff_k:
            max_eq_diff_k = diff
        d_act = abs((r[cq_cols["disp"]] + r[cq_cols["inv"]] + r[cq_cols["prem_cob"]] + r[cq_cols["cred_reas"]] + r[cq_cols["otros_cred"]] + r[cq_cols["inmuebles"]] + r[cq_cols["bienes_uso"]] + r[cq_cols["otros_act"]]) - r[cq_cols["activo"]])
        d_pas = abs((r[cq_cols["deudas_aseg"]] + r[cq_cols["deudas_reas"]] + r[cq_cols["deudas_prod"]] + r[cq_cols["deudas_fisc"]] + r[cq_cols["otras_deudas"]] + r[cq_cols["comp_tec"]] + r[cq_cols["previsiones"]]) - r[cq_cols["pasivo"]])
        d_inv = abs((r[cq_cols["inv_tp"]] + r[cq_cols["inv_acc"]] + r[cq_cols["inv_on"]] + r[cq_cols["inv_fci"]] + r[cq_cols["inv_fid"]] + r[cq_cols["inv_pf"]] + r[cq_cols["inv_otr"]]) - r[cq_cols["inv"]])
        d_fin = abs((r[cq_cols["fin_rentas"]] + r[cq_cols["fin_realiz"]] + r[cq_cols["fin_tenencia"]] + r[cq_cols["fin_otros"]] + r[cq_cols["recpam"]]) - r[cq_cols["res_fin"]])
        max_comp_diff_k = max(max_comp_diff_k, d_act, d_pas, d_inv, d_fin)
    if max_eq_diff_k > 1.0:
        failures.append(f"Descuadre Activo != Pasivo + PN detectado: {max_eq_diff_k:.3f} miles")
    if max_comp_diff_k > 2.0:
        failures.append(f"Descuadre descomposición BG/Inv/Fin detectado: {max_comp_diff_k:.3f} miles")

    # 4b. Validar Indicadores SSN C, D y E (0117 Personas y 0436 Retiro en benchmark 2026-3)
    if has_26_3:
        p26 = p_idx_map["2026-3"]
        def calc_ssn_inds(cod_c: str) -> tuple[float, float, float]:
            rc = cq_by_pc[(p26, c_idx_map[cod_c])]
            cred_t = rc[cq_cols["prem_cob"]] + rc[cq_cols["cred_reas"]] + rc[cq_cols["otros_cred"]]
            ind_c = (cred_t / rc[cq_cols["activo"]]) * 100.0
            ind_d = ((rc[cq_cols["disp"]] + rc[cq_cols["inv"]]) / rc[cq_cols["deudas_aseg"]]) * 100.0
            ind_e = ((rc[cq_cols["disp"]] + rc[cq_cols["inv"]] + rc[cq_cols["inmuebles"]]) / (rc[cq_cols["deudas_aseg"]] + rc[cq_cols["comp_tec"]])) * 100.0
            return ind_c, ind_d, ind_e

        c117, d117, e117 = calc_ssn_inds("0117")
        c436, _, e436 = calc_ssn_inds("0436")
        if abs(c117 - 24.96) > 0.05 or abs(d117 - 377.92) > 0.05 or abs(e117 - 210.61) > 0.05:
            failures.append(f"Indicadores SSN 0117 fuera de rango: C={c117:.2f}%, D={d117:.2f}%, E={e117:.2f}%")
        if abs(c436 - 4.59) > 0.05 or abs(e436 - 114.91) > 0.05:
            failures.append(f"Indicadores SSN 0436 fuera de rango: C={c436:.2f}%, E={e436:.2f}%")

    if DB_PATH.exists():
        conn = sqlite3.connect(str(DB_PATH))
        try:
            unk_50104 = [
                r[0]
                for r in conn.execute("SELECT DISTINCT cod_cuenta FROM balances WHERE cod_subramo != '' AND cod_cuenta LIKE '5.01.04.%'").fetchall()
                if r[0].split(".")[5] not in ALL_KNOWN_50104
            ]
            db_cias = {r[0] for r in conn.execute("SELECT DISTINCT cod_cia FROM companias_periodo").fetchall()}
        finally:
            conn.close()
    else:
        unk_50104 = []
        db_cias = {c["cod"] for c in meta["companias"]}

    with open(CAT_DIR / "companias.csv", "r", encoding="utf-8") as f:
        cat_cias = {r["cod_cia"] for r in csv.DictReader(f)}
    missing_cias = sorted(db_cias - cat_cias)
    if unk_50104:
        failures.append(f"Códigos 5.01.04 sin mapear: {unk_50104}")
    if missing_cias:
        failures.append(f"Compañías sin catálogo: {missing_cias}")

    # 5. Validar catálogo y consolidación VPP intragrupo (RT 21)
    vpp_path = CAT_DIR / "participaciones_vpp.csv"
    vpp_links = meta.get("vpp_links", [])
    vpp_graph: dict[str, list[str]] = defaultdict(list)
    vpp_nodes: set[str] = set()
    if vpp_path.exists():
        with open(vpp_path, "r", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                pc = r["cod_controlante"].strip()
                sc = r["cod_controlada"].strip()
                pct = float(r["pct_participacion"])
                if pc not in cat_cias:
                    failures.append(f"VPP controlante desconocido en catálogo: {pc}")
                if sc not in cat_cias:
                    failures.append(f"VPP controlada desconocida en catálogo: {sc}")
                if not (0.0 < pct <= 1.0):
                    failures.append(f"VPP porcentaje fuera de rango (0,1]: {pc}->{sc} = {pct}")
                if pc == sc:
                    failures.append(f"VPP autoreferencia inválida: {pc}")
                vpp_graph[pc].append(sc)
                vpp_nodes.update([pc, sc])

    # Kahn's topological sort to guarantee acyclic DAG
    in_deg = {n: 0 for n in vpp_nodes}
    for u, nbrs in vpp_graph.items():
        for v in nbrs:
            in_deg[v] = in_deg.get(v, 0) + 1
    queue = [n for n, d in in_deg.items() if d == 0]
    visited_cnt = 0
    while queue:
        u = queue.pop()
        visited_cnt += 1
        for v in vpp_graph.get(u, []):
            in_deg[v] -= 1
            if in_deg[v] == 0:
                queue.append(v)
    vpp_is_dag = visited_cnt == len(vpp_nodes)
    if not vpp_is_dag:
        failures.append("El grafo participaciones_vpp.csv contiene ciclos recíprocos.")

    # Calcular consolidación neta VPP de grupos en el período más reciente desde dashboard_data.json
    c_rows_by_cod = {c["cod"]: c for c in meta["companias"]}
    rows_latest_by_cod: dict[str, list[float]] = {}
    for c in meta["companias"]:
        row = cq_by_pc.get((p_latest, c["idx"]))
        if row is not None:
            rows_latest_by_cod[c["cod"]] = row

    def aggregate_vpp_group(cods: list[str], is_group: bool = True) -> dict[str, object]:
        sub_rows = {cod: rows_latest_by_cod[cod] for cod in cods if cod in rows_latest_by_cod}
        fields = [
            "activo", "pasivo", "pn", "inv", "inv_acc", "acc_ge",
            "res_tec", "res_fin", "res_extra", "imp_gan", "res_ej",
        ]
        tot = {k: sum(r[cq_cols[k]] for r in sub_rows.values()) for k in fields}
        raw_pn_by_parent: dict[str, float] = defaultdict(float)
        edges_active = []
        for lk in vpp_links:
            if not (lk["fromP"] <= p_latest <= lk["toP"]):
                continue
            pc, sc, pct = lk["pCod"], lk["sCod"], lk["pct"]
            if pc in sub_rows and sc in sub_rows:
                p_acc_ge = sub_rows[pc][cq_cols["acc_ge"]]
                if p_acc_ge > 0:
                    raw_pn = pct * sub_rows[sc][cq_cols["pn"]]
                    raw_re = pct * sub_rows[sc][cq_cols["res_ej"]]
                    raw_pn_by_parent[pc] += raw_pn
                    edges_active.append((pc, sc, pct, raw_pn, raw_re, p_acc_ge))

        elim_pn = 0.0
        elim_re = 0.0
        parent_cap_ok = True
        in_pct: dict[str, float] = defaultdict(float)
        in_elim_pn: dict[str, float] = defaultdict(float)
        for pc, sc, pct, raw_pn, raw_re, p_acc_ge in edges_active:
            sum_p = raw_pn_by_parent[pc]
            if sum_p > p_acc_ge * 1.005:
                parent_cap_ok = False
                failures.append(
                    f"VPP {latest_id} excede AccGE en {pc}: raw_elim_pn={sum_p/1000:.2f}M vs acc_ge={p_acc_ge/1000:.2f}M"
                )
            scale = min(1.0, p_acc_ge / sum_p) if sum_p > 0 else 1.0
            elim_pn_edge = raw_pn * scale
            elim_pn += elim_pn_edge
            elim_re += raw_re
            in_pct[sc] += pct
            in_elim_pn[sc] += elim_pn_edge

        activo_c = tot["activo"] - elim_pn
        inv_c = tot["inv"] - elim_pn
        pn_c = tot["pn"] - elim_pn
        res_fin_c = tot["res_fin"] - elim_re
        res_ej_c = tot["res_ej"] - elim_re

        controlled = {sc for sc, pct in in_pct.items() if pct > 0.5} if is_group else set()
        nci_re = sum((1.0 - min(1.0, in_pct[sc])) * sub_rows[sc][cq_cols["res_ej"]] for sc in controlled)
        nci_pn = sum(sub_rows[sc][cq_cols["pn"]] - in_elim_pn[sc] for sc in controlled)
        res_ej_madre = res_ej_c - nci_re
        pn_madre = pn_c - nci_pn

        diff_bg = abs(activo_c - (tot["pasivo"] + pn_c))
        diff_er = abs((tot["res_tec"] + res_fin_c + tot["res_extra"] + tot["imp_gan"]) - res_ej_c)
        diff_bg_madre = abs(activo_c - (tot["pasivo"] + nci_pn + pn_madre))
        diff_er_madre = abs((tot["res_tec"] + res_fin_c + tot["res_extra"] + tot["imp_gan"] - nci_re) - res_ej_madre)

        if controlled:
            non_ctrl = [c for c in sub_rows if c not in controlled]
            diff_madre_re = abs(res_ej_madre - sum(sub_rows[c][cq_cols["res_ej"]] for c in non_ctrl))
            diff_madre_pn = abs(pn_madre - sum(sub_rows[c][cq_cols["pn"]] for c in non_ctrl))
            if max(diff_madre_re, diff_madre_pn) > 0.05:
                failures.append(
                    f"Descuadre Empresa Madre RT 21: diff_re={diff_madre_re:.4f}k, diff_pn={diff_madre_pn:.4f}k"
                )
        else:
            diff_madre_re = 0.0
            diff_madre_pn = 0.0

        if diff_bg > 0.05:
            failures.append(f"Descuadre BG consolidado VPP: {diff_bg:.4f} miles")
        if diff_er > 0.05:
            failures.append(f"Descuadre ER consolidado VPP: {diff_er:.4f} miles")
        if diff_bg_madre > 0.05:
            failures.append(f"Descuadre BG Empresa Madre RT 21: {diff_bg_madre:.4f} miles")
        if diff_er_madre > 0.05:
            failures.append(f"Descuadre ER Empresa Madre RT 21: {diff_er_madre:.4f} miles")

        diff_madre_max = max(diff_madre_re, diff_madre_pn)
        return {
            "n_cias": len(sub_rows),
            "has_madre": bool(controlled),
            "res_ej_bruto_m": round(tot["res_ej"] / 1000.0, 2),
            "elim_vpp_re_m": round(-elim_re / 1000.0, 2),
            "res_ej_consol_m": round(res_ej_c / 1000.0, 2),
            "part_terc_re_m": round(-nci_re / 1000.0, 2),
            "res_ej_madre_m": round(res_ej_madre / 1000.0, 2),
            "pn_bruto_m": round(tot["pn"] / 1000.0, 2),
            "elim_vpp_pn_m": round(-elim_pn / 1000.0, 2),
            "pn_consol_m": round(pn_c / 1000.0, 2),
            "part_terc_pn_m": round(nci_pn / 1000.0, 2),
            "pn_madre_m": round(pn_madre / 1000.0, 2),
            "inv_consol_m": round(inv_c / 1000.0, 2),
            "parent_cap_ok": parent_cap_ok,
            "diff_bg_miles": round(max(diff_bg, diff_bg_madre), 4),
            "diff_er_miles": round(max(diff_er, diff_er_madre), 4),
            "diff_madre_miles": round(diff_madre_max, 4),
            "ok": (
                parent_cap_ok
                and diff_bg <= 0.05
                and diff_er <= 0.05
                and diff_bg_madre <= 0.05
                and diff_er_madre <= 0.05
                and diff_madre_max <= 0.05
            ),
        }

    vpp_groups_checked: list[dict[str, object]] = []
    affected_groups = sorted({lk["grupo"] for lk in vpp_links if not lk["grupo"].startswith("Intergrupo")})
    for gname in affected_groups:
        cods = [c["cod"] for c in meta["companias"] if c["grupo"] == gname]
        res = aggregate_vpp_group(cods, is_group=True)
        res["grupo"] = gname
        vpp_groups_checked.append(res)

    ls_vpp = next((x for x in vpp_groups_checked if x["grupo"] == "Grupo La Segunda"), None)
    if latest_id == "2026-3":
        if not ls_vpp or abs(ls_vpp["elim_vpp_re_m"] - 24774.3) > 5.0 or abs(ls_vpp["res_ej_consol_m"] - (-52040.6)) > 5.0:
            failures.append(f"Benchmark VPP Grupo La Segunda inesperado: {ls_vpp}")
        if not ls_vpp or abs(ls_vpp["elim_vpp_pn_m"] - (-234824.1)) > 5.0 or abs(ls_vpp["pn_consol_m"] - 640134.0) > 5.0:
            failures.append(f"Benchmark PN VPP Grupo La Segunda inesperado: {ls_vpp}")
        if not ls_vpp or not ls_vpp["has_madre"] or abs(ls_vpp["res_ej_madre_m"] - (-49851.56)) > 5.0 or abs(ls_vpp["pn_madre_m"] - 607308.69) > 5.0:
            failures.append(f"Benchmark Empresa Madre Grupo La Segunda inesperado: {ls_vpp}")

        sc_vpp = next((x for x in vpp_groups_checked if x["grupo"] == "Grupo San Cristóbal"), None)
        if not sc_vpp or not sc_vpp["has_madre"] or abs(sc_vpp["res_ej_madre_m"] - (-38239.73)) > 5.0 or abs(sc_vpp["pn_madre_m"] - 723284.91) > 5.0:
            failures.append(f"Benchmark Empresa Madre Grupo San Cristóbal inesperado: {sc_vpp}")

    for non_ctrl_g in ("Grupo Provincia", "Grupo Nación"):
        gv = next((x for x in vpp_groups_checked if x["grupo"] == non_ctrl_g), None)
        if gv and gv["has_madre"] is not False:
            failures.append(f"{non_ctrl_g} no debería tener deducción de terceros: {gv}")

    mkt_vpp = aggregate_vpp_group(list(rows_latest_by_cod.keys()), is_group=False)
    mkt_vpp["grupo"] = f"TOTAL MERCADO ({latest_id})"
    if mkt_vpp["has_madre"] or (latest_id == "2026-3" and abs(mkt_vpp["res_ej_consol_m"] - (-288848.08)) > 5.0):
        failures.append(f"Benchmark TOTAL MERCADO VPP inesperado: {mkt_vpp}")
    vpp_groups_checked.append(mkt_vpp)

    # 6. Validar cubo técnico por Gran Ramo gq en último período vs cq
    gq_cols = {name: i for i, name in enumerate(data.get("gq_cols", []))}
    gran_ramos = meta.get("gran_ramos", [])
    gq_sum_by_c: dict[int, list[float]] = defaultdict(lambda: [0.0, 0.0])
    gq_stats: dict[int, dict[str, object]] = {
        gi: {"gran_ramo": gname, "n_cias": 0, "emit_sd_m": 0.0, "res_tec_m": 0.0, "ok": True}
        for gi, gname in enumerate(gran_ramos)
    }
    for r in data.get("gq", []):
        if r[0] != p_latest:
            continue
        ci, gi = r[1], r[2]
        e_sd = r[gq_cols["emit_sd"]]
        r_tec = r[gq_cols["res_tec"]]
        p_dev = r[gq_cols["prim_dev"]]
        gq_sum_by_c[ci][0] += e_sd
        gq_sum_by_c[ci][1] += r_tec
        if abs(e_sd) >= 0.001 or abs(p_dev) >= 0.001 or abs(r_tec) >= 0.001:
            gq_stats[gi]["n_cias"] += 1
        gq_stats[gi]["emit_sd_m"] += e_sd / 1000.0
        gq_stats[gi]["res_tec_m"] += r_tec / 1000.0

    max_gq_emit_diff_k = 0.0
    max_gq_rt_diff_k = 0.0
    for c in meta["companias"]:
        row_cq = cq_by_pc.get((p_latest, c["idx"]))
        if row_cq is None:
            continue
        s_emit, s_rt = gq_sum_by_c.get(c["idx"], [0.0, 0.0])
        de = abs(s_emit - row_cq[cq_cols["emit_sd"]])
        dr = abs(s_rt - row_cq[cq_cols["res_tec"]])
        max_gq_emit_diff_k = max(max_gq_emit_diff_k, de)
        max_gq_rt_diff_k = max(max_gq_rt_diff_k, dr)
        if de > 0.5 or dr > 0.5:
            failures.append(f"Descuadre gq vs cq en {c['cod']} ({latest_id}): emit_sd={de:.3f}k, res_tec={dr:.3f}k")

    gran_ramos_summary = []
    for gi in range(len(gran_ramos)):
        st = gq_stats[gi]
        st["emit_sd_m"] = round(st["emit_sd_m"], 2)
        st["res_tec_m"] = round(st["res_tec_m"], 2)
        st["ok"] = max_gq_emit_diff_k <= 0.5 and max_gq_rt_diff_k <= 0.5
        gran_ramos_summary.append(st)

    # 7. Validar cubo srq (Subramos) vs rq y prq en último período
    srq_cols = {name: i for i, name in enumerate(data.get("srq_cols", []))}
    sr_meta = {s["idx"]: s for s in meta.get("subramos", [])}
    sr_by_cod = {s["cod"]: s["idx"] for s in meta.get("subramos", [])}
    rq_by_pcr: dict[tuple[int, int, int], list[float]] = {
        (r[0], r[1], r[2]): [
            r[rq_cols["emit_sd"]],
            r[rq_cols["prim_dev_sd"]],
            r[rq_cols["sin_dev_sd"]],
            r[rq_cols["g_prod_sd"]],
            r[rq_cols["g_expl_sd"]],
            r[rq_cols["g_tot_sd"]],
        ]
        for r in data["rq"]
    }
    srq_sum_by_pcr: dict[tuple[int, int, int], list[float]] = defaultdict(lambda: [0.0] * 6)
    srq_sum_latest_by_sr: dict[int, list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
    for r in data.get("srq", []):
        p_i, c_i, sr_i = r[0], r[1], r[2]
        r_i = sr_meta[sr_i]["r_idx"]
        vals = [
            r[srq_cols["emit_sd"]],
            r[srq_cols["prim_dev_sd"]],
            r[srq_cols["sin_dev_sd"]],
            r[srq_cols["g_prod_sd"]],
            r[srq_cols["g_expl_sd"]],
            r[srq_cols["g_tot_sd"]],
        ]
        for j in range(6):
            srq_sum_by_pcr[(p_i, c_i, r_i)][j] += vals[j]
        if p_i == p_latest:
            srq_sum_latest_by_sr[sr_i][0] += vals[0]
            srq_sum_latest_by_sr[sr_i][1] += vals[1]
            srq_sum_latest_by_sr[sr_i][2] += vals[2]
            srq_sum_latest_by_sr[sr_i][3] += vals[5]

    max_srq_rq_diff_k = 0.0
    max_srq_rq_key: tuple[int, int, int] | None = None
    for key in set(rq_by_pcr.keys()) | set(srq_sum_by_pcr.keys()):
        rv = rq_by_pcr.get(key, [0.0] * 6)
        sv = srq_sum_by_pcr.get(key, [0.0] * 6)
        d_cur = max(abs(rv[j] - sv[j]) for j in range(6))
        if d_cur > max_srq_rq_diff_k:
            max_srq_rq_diff_k = d_cur
            max_srq_rq_key = key
    if not data.get("srq"):
        failures.append("Falta cubo srq de subramos en dashboard_data.json.")
    elif max_srq_rq_diff_k > 0.5:
        failures.append(f"Descuadre srq vs rq en {max_srq_rq_key}: {max_srq_rq_diff_k:.3f} miles")

    prq_latest_by_seg: dict[int, list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
    for r in data["prq"]:
        if r[0] == p_latest:
            si = r[2]
            prq_latest_by_seg[si][0] += r[prq_cols["emit_sd"]]
            prq_latest_by_seg[si][1] += r[prq_cols["prim_dev_sd"]]
            prq_latest_by_seg[si][2] += r[prq_cols["sin_dev_sd"]]
            prq_latest_by_seg[si][3] += r[prq_cols["g_tot_sd"]]

    seg_to_sr_cods = {
        "AP": ["2.010.01", "2.010.02"],
        "VIDA_SD": ["2.030.05"],
        "RET_IND": ["2.060.01"],
        "RET_COL": ["2.060.02"],
    }
    max_srq_prq_diff_k = 0.0
    for seg_id, sr_cods in seg_to_sr_cods.items():
        si = seg_idx_map[seg_id]
        pv = prq_latest_by_seg.get(si, [0.0, 0.0, 0.0, 0.0])
        sv = [sum(srq_sum_latest_by_sr[sr_by_cod[c]][j] for c in sr_cods) for j in range(4)]
        d_seg = max(abs(pv[j] - sv[j]) for j in range(4))
        max_srq_prq_diff_k = max(max_srq_prq_diff_k, d_seg)
        if d_seg > 0.5:
            failures.append(f"Descuadre srq vs prq en {seg_id} ({latest_id}): {d_seg:.3f} miles")

    # 8. Validar cubo pr_subq (Subramos Personas y Retiro con stocks + flujos completos) en último período para 0117 y 0436
    pr_subq_cols = {name: i for i, name in enumerate(data.get("pr_subq_cols", []))}
    pr_sub_check_fields = ("emit_sd", "prim_dev", "sin_dev", "rescates", "rentas", "g_tot", "res_tec", "deudas_aseg", "comp_tec")
    max_pr_subq_diff_k = 0.0
    if not data.get("pr_subq"):
        failures.append("Falta cubo pr_subq en dashboard_data.json.")
    else:
        pr_sub_sum_latest: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
        for r in data["pr_subq"]:
            if r[0] != p_latest:
                continue
            ci = r[1]
            for fld in pr_sub_check_fields:
                pr_sub_sum_latest[ci][fld] += r[pr_subq_cols[fld]]
        for cod_chk in ("0117", "0436"):
            if cod_chk not in c_idx_map or (p_latest, c_idx_map[cod_chk]) not in cq_by_pc:
                continue
            ci = c_idx_map[cod_chk]
            rc = cq_by_pc[(p_latest, ci)]
            sums = pr_sub_sum_latest.get(ci, {})
            for fld in pr_sub_check_fields:
                d_fld = abs(sums.get(fld, 0.0) - rc[cq_cols[fld]])
                max_pr_subq_diff_k = max(max_pr_subq_diff_k, d_fld)
                if d_fld > 2.0:
                    failures.append(f"Descuadre pr_subq vs cq en {cod_chk} ({fld}, {latest_id}): {d_fld:.3f} miles")

        if all(k in pr_subq_cols for k in ("com_pas", "com_inst", "com_otros", "sp_admin", "sp_juic", "sp_med", "sp_ibnr", "cedidas", "g_reas")):
            pr_extra_latest: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
            for r in data["pr_subq"]:
                if r[0] != p_latest:
                    continue
                ci = r[1]
                for fld in ("g_prod", "com_pas", "com_inst", "com_otros", "cedidas", "g_reas", "sp_admin", "sp_juic", "sp_med", "sp_liq", "sp_ibnr", "sp_reas", "sin_rec_reas"):
                    pr_extra_latest[ci][fld] += r[pr_subq_cols[fld]]
            for cod_chk in ("0117", "0436"):
                if cod_chk not in c_idx_map:
                    continue
                ci = c_idx_map[cod_chk]
                ex = pr_extra_latest.get(ci, {})
                d_com = abs((ex.get("com_pas", 0.0) + ex.get("com_inst", 0.0) + ex.get("com_otros", 0.0)) - ex.get("g_prod", 0.0))
                max_pr_subq_diff_k = max(max_pr_subq_diff_k, d_com)
                if d_com > 1.0:
                    failures.append(f"Descuadre comisiones pr_subq en {cod_chk} ({latest_id}): {d_com:.3f} miles")

    # 9. Verificar estado y frescura de fuentes estadísticas externas SSN
    extras_summary: dict[str, object] = {"present": False}
    if SSN_EXTRAS_JSON_PATH.exists():
        try:
            ext = json.loads(SSN_EXTRAS_JSON_PATH.read_text(encoding="utf-8"))
            req_keys = ("retiro_est", "tasa_testigo_rv", "prod_mensual", "canales_venta", "polizas_sin_prim")
            missing_ext = [k for k in req_keys if not ext.get(k)]
            stale_sources = [s["id"] for s in ext.get("sources_status", []) if not s.get("ok")]
            extras_summary = {
                "present": True,
                "generated_at": ext.get("generated_at"),
                "missing": missing_ext,
                "stale_sources": stale_sources,
                "tasa_testigo_rv_latest": ext.get("tasa_testigo_rv", {}).get("latest_label"),
                "prod_mensual_latest": ext.get("prod_mensual", {}).get("latest_label"),
                "retiro_est_latest": ext.get("retiro_est", {}).get("as_of_label"),
                "canales_venta_latest": ext.get("canales_venta", {}).get("latest_year"),
                "polizas_sin_prim_latest": ext.get("polizas_sin_prim", {}).get("latest_label"),
            }
            if missing_ext:
                failures.append(f"Faltan secciones en ssn_extras.json: {missing_ext}")
            if stale_sources:
                failures.append(f"Fuentes externas SSN sin actualizar en última corrida: {stale_sources}")
        except Exception as exc:
            failures.append(f"Error leyendo ssn_extras.json: {exc}")

    report = {
        "validated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "passed": len(failures) == 0,
        "failures": failures,
        "global": {
            "latest_periodo": latest_id,
            "periodos": period_cnt,
            "companias_en_catalogo": len(cat_cias),
            "companias_sin_catalogo": len(missing_cias),
            "codigos_50104_sin_mapear": len(unk_50104),
            "max_descuadre_bg_miles": round(max_eq_diff_k, 4),
            "max_descuadre_gq_emit_miles": round(max_gq_emit_diff_k, 4),
            "max_descuadre_gq_rt_miles": round(max_gq_rt_diff_k, 4),
            "max_descuadre_srq_rq_miles": round(max_srq_rq_diff_k, 4),
            "max_descuadre_srq_prq_miles": round(max_srq_prq_diff_k, 4),
            "max_descuadre_pr_subq_miles": round(max_pr_subq_diff_k, 4),
            "ipc_ratio_2026_3_vs_2025_3": round(ipc_ratio_26_25, 6) if ipc_ratio_26_25 is not None else None,
            "ipc_pdf_esperado": 1.333549 if ipc_ratio_26_25 is not None else None,
            "ipc_diff": round(ipc_diff, 6) if ipc_diff is not None else None,
            "vpp_links": len(vpp_links),
            "vpp_dag_aciclico": vpp_is_dag,
        },
        "pdfs_2026_3": pdf_results,
        "looker_totals": looker_results,
        "looker_ap_ratios": ap_ratio_results,
        "vpp_consolidation": vpp_groups_checked,
        "gran_ramos_latest": gran_ramos_summary,
        "gran_ramos_2026_3": gran_ramos_summary,
        "ssn_extras": extras_summary,
    }

    PROC_DIR.mkdir(parents=True, exist_ok=True)
    with open(VALIDATION_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("=== REPORTE DE VALIDACIÓN ===")
    ipc_str = f" | IPC 26-3/25-3: {ipc_ratio_26_25:.6f}" if ipc_ratio_26_25 is not None else ""
    print(f"Estado global: {'PASS' if report['passed'] else 'FAIL'} | Períodos: {period_cnt} ({latest_id}) | MaxDesv BG: {max_eq_diff_k:.4f} miles{ipc_str}")
    if pdf_results:
        print("PDFs 2026-3:", [(x["cod_cia"], x["max_diff_miles"], x["ok"]) for x in pdf_results])
    if looker_results:
        print("Looker 8 tablas:", [(x["segmento"], x["max_diff_pesos"], x["ok"]) for x in looker_results])
    if ap_ratio_results:
        print("Looker AP ratios:", [(x["nombre"], x["sin_pct"], x["gto_pct"], x["ok"]) for x in ap_ratio_results])
    print(f"VPP DAG acíclico: {vpp_is_dag} | Grupos/Mkt {latest_id}:", [(x["grupo"], x["res_ej_bruto_m"], x["elim_vpp_re_m"], x["res_ej_consol_m"], x["res_ej_madre_m"], x["ok"]) for x in vpp_groups_checked])
    print(f"Gran Ramo {latest_id} (max_diff emit={max_gq_emit_diff_k:.4f}k, rt={max_gq_rt_diff_k:.4f}k):", [(x["gran_ramo"], x["n_cias"], x["emit_sd_m"], x["res_tec_m"], x["ok"]) for x in gran_ramos_summary])
    print(f"Subramos srq vs rq: max_diff={max_srq_rq_diff_k:.4f}k | srq vs prq ({latest_id}): max_diff={max_srq_prq_diff_k:.4f}k | pr_subq (0117/0436): max_diff={max_pr_subq_diff_k:.4f}k")
    if failures:
        print("FALLOS:", failures)
    return report


def main() -> int:
    report = run_validation()
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
