#!/usr/bin/env python3
"""Genera y actualiza data/catalogos/companias.csv preservando ediciones manuales."""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

CAT_DIR = Path("data/catalogos")
SEED_PATH = CAT_DIR / "companias_seed.csv"
OUT_PATH = CAT_DIR / "companias.csv"
VPP_PATH = CAT_DIR / "participaciones_vpp.csv"

# Semilla inicial de participaciones accionarias entre aseguradoras SINENSUP (RT 21 / VPP)
# Formato: (cod_controlante, cod_controlada, grupo_economico, pct_participacion, desde_periodo, hasta_periodo, fuente)
VPP_SEED: list[tuple[str, str, str, str, str, str, str]] = [
    ("0317", "0618", "Grupo La Segunda", "0.9056", "", "", "Memoria/Balances SSN; verificado 16Q vs AccGE y 5.02.03.03.02.01"),
    ("0317", "0117", "Grupo La Segunda", "0.7717", "", "", "Memoria/Balances SSN; verificado 16Q vs AccGE y 5.02.03.03.02.01"),
    ("0317", "0436", "Grupo La Segunda", "0.8966", "", "", "Memoria/Balances SSN; verificado 16Q vs AccGE y 5.02.03.03.02.01"),
    ("0117", "0436", "Grupo La Segunda", "0.0517", "", "", "Composición accionaria La Segunda Retiro (5,17%); verificado AccGE(0117)/PN(0436)=5,40%"),
    ("0224", "0626", "Grupo Sancor", "0.9900", "", "", "Informes FIX SCR (99% Sancor Coop., 1% Alianza Inversora S.A.)"),
    ("0224", "0930", "Grupo Sancor", "0.9900", "", "", "Grupo Sancor / FIX SCR (controlada directa de Sancor Coop.)"),
    ("0192", "0620", "Grupo San Cristóbal", "0.7173", "", "", "Moody's Local / Balances consolidados Grupo San Cristóbal (71,73%)"),
    ("0192", "0442", "Grupo San Cristóbal", "0.9993", "", "", "Moody's Local / Balances consolidados Grupo San Cristóbal (99,93%)"),
    ("0121", "0624", "Grupo Berkley", "0.8818", "", "", "Regresión 16Q AccGE(0121) vs PN(0624) y BARSA (R2=0.999999; AM Best ~90%)"),
    ("0726", "0425", "Grupo Federación Patronal", "0.9900", "", "", "Balances SSN Federación Patronal (valuación VPP controlante)"),
    ("0254", "0437", "Grupo IAPS Entre Ríos", "0.9900", "", "", "Balances IAPSER / Contaduría Entre Ríos (Acciones Grupo Económico)"),
    ("0499", "0621", "Grupo Provincia", "0.09335", "2026-1", "", "Capitalización 2026 Provincia ART (AccGE/PN = 9,335% exacto en 2026-1..3; 0% previo)"),
    ("0515", "0534", "Grupo Nación", "0.0010", "", "", "Composición oficial nacion-retiro.com.ar (99,90% BNA, 0,10% Nación Seguros)"),
    ("0216", "0576", "Intergrupo (Segurcoop -> CNP)", "0.1103", "", "", "Composición oficial CNP Seguros (11,03% Segurcoop; solo impacta agregados donde estén ambas)"),
]

GROUPS: dict[str, tuple[str, ...]] = {
    "Grupo La Segunda": ("0317", "0618", "0117", "0436"),
    "Grupo Sancor": ("0224", "0626", "0930"),
    "Grupo Federación Patronal": ("0726", "0425"),
    "Grupo San Cristóbal": ("0192", "0620", "0442"),
    "Grupo Provincia": ("0621", "0499", "0532"),
    "Grupo Zurich": ("0541", "0228", "0692", "0039", "0422"),
    "Grupo Galicia": ("0025", "0589", "0516", "0443", "0426"),
    "Grupo Swiss Medical": ("0605", "0002", "0580", "0710"),
    "Grupo Werthein / Experta": ("0616", "0880", "0433"),
    "Grupo Rivadavia": ("0222", "0678"),
    "Grupo Nación": ("0515", "0534"),
    "Grupo GST (Life / Orígenes)": ("0251", "0423", "0694"),
    "Grupo Mapfre": ("0213", "0699"),
    "Grupo Berkley": ("0121", "0624"),
    "Grupo IAPS Entre Ríos": ("0254", "0437"),
    "Grupo Paraná": ("0330", "0972"),
    "Grupo Binaria (OSDE)": ("0517", "0530"),
    "Grupo BHN": ("0695", "0696"),
    "Grupo Credicoop": ("0216", "0604"),
    "Grupo Galeno": ("0878", "0619"),
    "Grupo Argos": ("0241", "0680"),
    "Grupo Metropol": ("0334", "0682"),
    "Grupo Serena": ("0862", "0975"),
}

CIA_TO_GROUP = {cia: grp for grp, cias in GROUPS.items() for cia in cias}

SHORT_NAMES: dict[str, str] = {
    "0317": "La Segunda Cooperativa",
    "0618": "La Segunda ART",
    "0117": "La Segunda Personas",
    "0436": "La Segunda Retiro",
    "0726": "Federación Patronal",
    "0425": "Fed. Patronal Retiro",
    "0224": "Sancor Seguros",
    "0626": "Prevención ART",
    "0930": "Prevención Retiro",
    "0501": "Caja de Seguros",
    "0621": "Provincia ART",
    "0499": "Provincia Seguros",
    "0532": "Provincia Vida",
    "0541": "Zurich Int. Life",
    "0228": "Zurich Argentina",
    "0692": "Zurich Santander",
    "0039": "Zurich Aseguradora",
    "0422": "Zurich Retiro",
    "0192": "San Cristóbal",
    "0620": "Asociart ART",
    "0442": "San Cristóbal Retiro",
    "0116": "La Mercantil Andina",
    "0616": "Experta ART",
    "0880": "Experta Seguros",
    "0433": "Experta Patrimoniales",
    "0222": "Rivadavia Seguros",
    "0678": "Mutual Rivadavia TPP",
    "0515": "Nación Seguros",
    "0534": "Nación Retiro",
    "0036": "Allianz",
    "0605": "Swiss Medical ART",
    "0002": "SMG Seguros",
    "0580": "SMG Life",
    "0710": "SMG Life Retiro",
    "0244": "La Meridional",
    "0025": "Seguros Galicia",
    "0589": "Galicia Seguros",
    "0516": "GGAL Seguros",
    "0443": "Galicia Seg. Retiro",
    "0426": "Galicia Retiro",
    "0251": "Life Seguros",
    "0423": "Orígenes Retiro",
    "0694": "Life Group",
    "0213": "Mapfre",
    "0699": "Mapfre Vida",
    "0402": "Triunfo Cooperativa",
    "0360": "Río Uruguay (RUS)",
    "0959": "Andina ART",
    "0254": "IAPS Entre Ríos",
    "0437": "IAPS Retiro",
    "0812": "ATM Seguros",
    "0261": "Horizonte Seguros",
    "0275": "Chubb Seguros",
    "0829": "Starr Indemnity",
    "0141": "El Norte Seguros",
    "0862": "Serena ART",
    "0975": "Serena Patrimoniales",
    "0196": "Cooperación Mutual",
    "0079": "La Holando",
    "0879": "Qualia Seguros",
    "0396": "BBVA Seguros",
    "0121": "Berkley Seguros",
    "0624": "Berkley ART",
    "0335": "Barbuss Risk",
    "0419": "La Estrella Retiro",
    "0406": "Caruso Seguros",
    "0330": "Paraná Seguros",
    "0972": "Paraná ART",
    "0720": "Intégrity Seguros",
    "0157": "La Perseverancia",
    "0209": "Assurant Argentina",
    "0661": "Instituto de Salta",
    "0216": "Segurcoop",
    "0604": "Credicoop Retiro",
    "0040": "Prudencia Seguros",
    "0286": "Segurometal",
    "0888": "Stellantis Insurance",
    "0595": "Supervielle Seguros",
    "0869": "Opción Seguros",
    "0006": "El Surco",
    "0576": "CNP Assurances",
    "0236": "Evolución Seguros",
    "0686": "Coface Argentina",
    "0574": "Sol Naciente",
    "0044": "La Equitativa del Plata",
    "0064": "Victoria Seguros",
    "0227": "Euroamérica",
    "0517": "Binaria Vida",
    "0530": "Binaria Retiro",
    "0695": "BHN Vida",
    "0696": "BHN Seguros Generales",
    "0747": "SMSV Seguros",
    "0962": "ART Mutual San Francisco",
    "0679": "Protección Mutual TPP",
    "0890": "ART Mutual Petroleros",
    "0878": "Galeno Seguros",
    "0619": "Galeno ART",
    "0680": "Argos Mutual TPP",
    "0241": "Argos Seguros",
    "0334": "Metropol Seguros",
    "0682": "Metropol Mutual",
    "0721": "Caja Prev. Médica PBA",
    "0259": "Caja Popular Tucumán",
    "0822": "Jujuy Seguros S.E.",
    "0932": "ART Mutual Rural",
}

LOWER_WORDS = {"de", "del", "la", "las", "los", "y", "e", "en", "para", "por", "a", "al"}
KEEP_UPPER = {"ART", "SA", "SAU", "S.A.", "S.A.U.", "S.E.", "BHN", "SMSV", "SMG", "BBVA", "CNP", "ATM", "GGAL", "IAM", "NRE", "NSA", "RCI", "TPC", "TPP", "OSDE", "IAPS"}


def clean_short_name(cod_cia: str, razon_social: str) -> str:
    if cod_cia in SHORT_NAMES:
        return SHORT_NAMES[cod_cia]
    s = " ".join(razon_social.strip().split())
    # Remover sufijos legales largos para nombres compactos
    patterns = [
        r",?\s*SUCURSAL\s+ARGENTINA.*$",
        r"\s+SOCIEDAD\s+AN[ÓO]NIMA\s+UNIPERSONAL.*$",
        r"\s+SOCIEDAD\s+AN[ÓO]NIMA.*$",
        r"\s+S\.?\s*A\.?\s*U\.?\.?$",
        r"\s+S\.?\s*A\.?\.?$",
        r"\s+COOPERATIVA\s+LIMITADA\s+DE\s+SEGUROS.*$",
        r"\s+COOPERATIVA\s+DE\s+SEGUROS\s+LIMITADA$",
        r"\s+SOCIEDAD\s+MUTUAL\s+DE\s+SEGUROS.*$",
        r"\s+ASOCIACI[ÓO]N\s+MUTUAL\s+DE\s+SEGUROS$",
        r"\s+COMPA[ÑN][ÍI]A\s+ARGENTINA\s+DE\s+SEGUROS.*$",
        r"\s+COMPA[ÑN][ÍI]A\s+DE\s+SEGUROS.*$",
        r"\s+ASEGURADORA\s+DE\s+RIESGOS\s+DEL\s+TRABAJO.*$",
    ]
    base = s
    for pat in patterns:
        candidate = re.sub(pat, "", base, flags=re.IGNORECASE).strip(" ,.-")
        if len(candidate) >= 4:
            base = candidate
    if "ASEGURADORA DE RIESGOS DEL TRABAJO" in s.upper() and "ART" not in base.upper():
        base = f"{base} ART"
    if "SEGUROS DE RETIRO" in s.upper() and "RETIRO" not in base.upper():
        base = f"{base} Retiro"
    words = base.split()
    out_words = []
    for i, w in enumerate(words):
        wu = w.upper().rstrip(".,")
        if wu in KEEP_UPPER:
            out_words.append(w.upper())
        elif i > 0 and w.lower() in LOWER_WORDS:
            out_words.append(w.lower())
        else:
            out_words.append(w.capitalize())
    res = " ".join(out_words)
    return res[:38].rstrip()


def main() -> int:
    if not SEED_PATH.exists():
        raise FileNotFoundError(f"Falta {SEED_PATH}. Ejecutá src/audit_fase1.py primero.")

    with open(SEED_PATH, "r", encoding="utf-8") as f:
        seed_rows = list(csv.DictReader(f))

    existing: dict[str, dict[str, str]] = {}
    if OUT_PATH.exists():
        with open(OUT_PATH, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                existing[row["cod_cia"]] = row

    fields = [
        "cod_cia",
        "razon_social",
        "nombre_corto",
        "tipo_cia",
        "constitucion",
        "grupo_economico",
        "es_grupo_multicompania",
        "es_la_segunda",
        "primer_periodo",
        "ultimo_periodo",
        "cant_trimestres",
    ]

    out_rows = []
    for sr in seed_rows:
        cod = sr["cod_cia"].strip()
        rs = sr["razon_social"].strip()
        prev = existing.get(cod)
        if prev:
            row = {
                "cod_cia": cod,
                "razon_social": rs,
                "nombre_corto": prev.get("nombre_corto") or clean_short_name(cod, rs),
                "tipo_cia": prev.get("tipo_cia") or sr["tipo_cia_sugerido"],
                "constitucion": prev.get("constitucion") or sr["constitucion_sugerida"],
                "grupo_economico": prev.get("grupo_economico") or CIA_TO_GROUP.get(cod, "Independientes"),
                "es_grupo_multicompania": prev.get("es_grupo_multicompania")
                or ("1" if cod in CIA_TO_GROUP else "0"),
                "es_la_segunda": prev.get("es_la_segunda") or ("1" if CIA_TO_GROUP.get(cod) == "Grupo La Segunda" else "0"),
                "primer_periodo": sr["primer_periodo"],
                "ultimo_periodo": sr["ultimo_periodo"],
                "cant_trimestres": sr["cant_trimestres"],
            }
        else:
            grp = CIA_TO_GROUP.get(cod, "Independientes")
            row = {
                "cod_cia": cod,
                "razon_social": rs,
                "nombre_corto": clean_short_name(cod, rs),
                "tipo_cia": sr["tipo_cia_sugerido"],
                "constitucion": sr["constitucion_sugerida"],
                "grupo_economico": grp,
                "es_grupo_multicompania": "1" if grp != "Independientes" else "0",
                "es_la_segunda": "1" if grp == "Grupo La Segunda" else "0",
                "primer_periodo": sr["primer_periodo"],
                "ultimo_periodo": sr["ultimo_periodo"],
                "cant_trimestres": sr["cant_trimestres"],
            }
        out_rows.append(row)

    with open(OUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(out_rows)

    multi = {r["grupo_economico"] for r in out_rows if r["es_grupo_multicompania"] == "1"}
    ls_cnt = sum(1 for r in out_rows if r["es_la_segunda"] == "1")
    print(f"Generado {OUT_PATH}: {len(out_rows)} compañías | {len(multi)} grupos multicompañía | La Segunda={ls_cnt}")

    cod_to_name = {r["cod_cia"]: r["nombre_corto"] for r in out_rows}
    vpp_fields = [
        "cod_controlante",
        "nombre_controlante",
        "cod_controlada",
        "nombre_controlada",
        "grupo_economico",
        "pct_participacion",
        "desde_periodo",
        "hasta_periodo",
        "fuente_verificacion",
    ]
    if VPP_PATH.exists():
        with open(VPP_PATH, "r", encoding="utf-8") as f:
            vpp_rows = list(csv.DictReader(f))
        for r in vpp_rows:
            if not r.get("nombre_controlante"):
                r["nombre_controlante"] = cod_to_name.get(r["cod_controlante"], r["cod_controlante"])
            if not r.get("nombre_controlada"):
                r["nombre_controlada"] = cod_to_name.get(r["cod_controlada"], r["cod_controlada"])
        print(f"Preservado {VPP_PATH}: {len(vpp_rows)} relaciones VPP")
    else:
        vpp_rows = []
        for pc, sc, grp, pct, desde, hasta, fuente in VPP_SEED:
            vpp_rows.append(
                {
                    "cod_controlante": pc,
                    "nombre_controlante": cod_to_name.get(pc, pc),
                    "cod_controlada": sc,
                    "nombre_controlada": cod_to_name.get(sc, sc),
                    "grupo_economico": grp,
                    "pct_participacion": pct,
                    "desde_periodo": desde,
                    "hasta_periodo": hasta,
                    "fuente_verificacion": fuente,
                }
            )
        with open(VPP_PATH, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=vpp_fields)
            writer.writeheader()
            writer.writerows(vpp_rows)
        print(f"Generado {VPP_PATH}: {len(vpp_rows)} relaciones VPP")
    return 0


if __name__ == "__main__":
    sys.exit(main())
