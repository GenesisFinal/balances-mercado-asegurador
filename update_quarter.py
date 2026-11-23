#!/usr/bin/env python3
"""Orquestador unificado para incorporar balances SINENSUP, estadísticas oficiales SSN y regenerar el tablero."""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path


def run_step(label: str, cmd: list[str]) -> None:
    print(f"\n>>> [{label}] {' '.join(cmd)}")
    res = subprocess.run(cmd, check=False)
    if res.returncode != 0:
        raise SystemExit(f"Paso '{label}' falló con código {res.returncode}.")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Actualiza datos SINENSUP + fuentes estadísticas SSN externas y reconstruye el tablero offline."
    )
    parser.add_argument(
        "--periodos",
        nargs="+",
        help="Períodos SINENSUP específicos a descargar/cargar (ej. 2026-4). Por defecto auto-descubre los 16 más recientes.",
    )
    parser.add_argument(
        "--extras-only",
        action="store_true",
        help="Actualización rápida: solo descarga/parsea las 5 fuentes estadísticas SSN externas (mensuales/trimestrales) y recompila el HTML.",
    )
    parser.add_argument(
        "--skip-extras",
        action="store_true",
        help="Omite la consulta a fuentes externas SSN y reutiliza data/processed/ssn_extras.json.",
    )
    parser.add_argument(
        "--rebuild-only",
        action="store_true",
        help="Omite descarga SINENSUP y ETL; recalcula métricas, árbol contable, valida y regenera el HTML desde warehouse.sqlite y catalogos/.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Solo verifica en vivo si hay nuevos períodos en SINENSUP o en las 5 fuentes SSN externas, sin modificar archivos.",
    )
    parser.add_argument("--force", action="store_true", help="Fuerza re-descarga y recarga ETL.")
    parser.add_argument(
        "--no-refresh-latest",
        action="store_true",
        help="No re-verifica por SHA-256 el último trimestre SINENSUP si el ZIP ya existe localmente.",
    )
    parser.add_argument("--skip-validate", action="store_true", help="Omite el bloqueo si alguna validación no pasa.")
    parser.add_argument("--deploy", action="store_true", help="Publica los cambios en GitHub y GitHub Pages al finalizar.")
    return parser.parse_args(argv)


def main() -> int:
    t0 = time.time()
    args = parse_args()
    py = sys.executable

    if args.check:
        run_step("Check SINENSUP", [py, "src/fetch_ssn.py", "--check-only", "--check-latest-hash"])
        run_step("Check Fuentes SSN Externas", [py, "src/fetch_ssn_extras.py", "--check-only"])
        return 0

    if args.extras_only:
        ext_cmd = [py, "src/fetch_ssn_extras.py"]
        if args.force:
            ext_cmd.append("--force")
        run_step("1/3 Fuentes estadísticas SSN externas", ext_cmd)
        if not args.skip_validate:
            run_step("2/3 Suite de conciliación", [py, "src/validate.py"])
        run_step("3/3 Generación tablero HTML offline", [py, "src/build_dashboard.py"])
        if args.deploy:
            run_step("Deploy GitHub + Pages", [py, "deploy_to_github.py"])
        out_html = Path("dist/tablero_mercado_asegurador.html")
        dt = time.time() - t0
        print(f"\nActualización mensual/estadística finalizada en {dt:.1f}s -> {out_html} ({out_html.stat().st_size / (1024 * 1024):.2f} MB)")
        return 0

    if not args.rebuild_only:
        fetch_cmd = [py, "src/fetch_ssn.py"]
        etl_cmd = [py, "src/etl_mdb.py"]
        if args.periodos:
            fetch_cmd += ["--periodos", *args.periodos]
            etl_cmd += ["--periodos", *args.periodos]
        if args.force:
            fetch_cmd.append("--force")
            etl_cmd.append("--force")
        if args.no_refresh_latest:
            fetch_cmd.append("--no-refresh-latest")
        run_step("1/9 Descarga SINENSUP (auto-discovery)", fetch_cmd)
        run_step("2/9 ETL MDB -> SQLite", etl_cmd)
        run_step("3/9 Auditoría base y semillas", [py, "src/audit_fase1.py"])

    run_step("4/9 Catálogo de compañías", [py, "src/build_catalogs.py"])
    run_step("5/9 Motor contable e IPC", [py, "src/metrics.py"])
    run_step("6/9 Árbol contable Plan de Cuentas", [py, "src/build_balances_tree.py"])

    extras_json = Path("data/processed/ssn_extras.json")
    if args.skip_extras and extras_json.exists():
        print("\n>>> [7/9 Fuentes estadísticas SSN externas] Omitido (--skip-extras)")
    elif args.rebuild_only and extras_json.exists():
        print("\n>>> [7/9 Fuentes estadísticas SSN externas] Preservado ssn_extras.json (--rebuild-only)")
    else:
        ext_cmd = [py, "src/fetch_ssn_extras.py"]
        if args.rebuild_only:
            ext_cmd.append("--offline")
        elif args.force:
            ext_cmd.append("--force")
        run_step("7/9 Fuentes estadísticas SSN externas", ext_cmd)

    if not args.skip_validate:
        run_step("8/9 Suite de conciliación", [py, "src/validate.py"])
    else:
        print("\n>>> [8/9 Suite de conciliación] Omitido (--skip-validate)")

    run_step("9/9 Generación tablero HTML offline", [py, "src/build_dashboard.py"])
    if args.deploy:
        run_step("Deploy GitHub + Pages", [py, "deploy_to_github.py"])

    out_html = Path("dist/tablero_mercado_asegurador.html")
    dt = time.time() - t0
    print(f"\nPipeline finalizado en {dt:.1f}s -> {out_html} ({out_html.stat().st_size / (1024 * 1024):.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
