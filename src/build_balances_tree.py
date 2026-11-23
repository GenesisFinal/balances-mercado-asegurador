#!/usr/bin/env python3
"""Construye data/processed/balances_tree.json con las 1.122 cuentas SSN (niveles 1..8)."""

from __future__ import annotations

import base64
import json
import sqlite3
import time
from collections import defaultdict
from pathlib import Path

DB_PATH = Path("data/warehouse.sqlite")
DASHBOARD_JSON_PATH = Path("data/processed/dashboard_data.json")
OUT_JSON_PATH = Path("data/processed/balances_tree.json")

SCALE_MILES = 0.1  # 1 unidad entera = $100 ARS = 0,1 miles de $
SCALE_PESOS = 100.0


def parent_code(code: str) -> str:
    """Devuelve el código de cuenta padre según los segmentos del plan SSN."""
    parts = code.split(".")
    idx = len(parts) - 1
    while idx > 0 and parts[idx] == "00":
        idx -= 1
    if idx == 0:
        return ""
    parts[idx] = "00"
    return ".".join(parts)


def encode_varint(buf: bytearray, n: int) -> None:
    """Codifica un entero no negativo en LEB128 sin signo."""
    while n >= 0x80:
        buf.append((n & 0x7F) | 0x80)
        n >>= 7
    buf.append(n)


def decode_varint(data: bytes, pos: int) -> tuple[int, int]:
    """Decodifica LEB128 sin signo usando el mismo algoritmo exacto que el cliente JS."""
    res = 0
    mult = 1
    while True:
        b = data[pos]
        pos += 1
        res += (b & 0x7F) * mult
        if b < 0x80:
            return res, pos
        mult *= 128


def zigzag(v: int) -> int:
    """Codifica un entero con signo mediante ZigZag."""
    return (v << 1) if v >= 0 else ((-v) << 1) - 1


def unzigzag(zz: int) -> int:
    """Decodifica ZigZag sin operadores bitwise sobre 64 bits."""
    return (zz // 2) if (zz % 2 == 0) else -((zz + 1) // 2)


def main() -> int:
    t0 = time.time()
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Falta {DB_PATH}")
    if not DASHBOARD_JSON_PATH.exists():
        raise FileNotFoundError(f"Falta {DASHBOARD_JSON_PATH}")

    dash = json.loads(DASHBOARD_JSON_PATH.read_text(encoding="utf-8"))
    p_map = {p["id"]: int(p["idx"]) for p in dash["meta"]["periodos"]}
    c_map = {c["cod"]: int(c["idx"]) for c in dash["meta"]["companias"]}

    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    raw_accounts = cur.execute(
        "SELECT cod_cuenta, desc_cuenta, nivel FROM plan_cuentas ORDER BY cod_cuenta"
    ).fetchall()

    idx_by_code = {cod: i for i, (cod, _, _) in enumerate(raw_accounts)}
    has_child = set()
    parent_idx_list: list[int] = []
    for i, (cod, _, _) in enumerate(raw_accounts):
        pc = parent_code(cod)
        if pc:
            if pc not in idx_by_code:
                raise ValueError(f"Cuenta padre ausente para {cod}: {pc}")
            p_i = idx_by_code[pc]
            if p_i >= i:
                raise ValueError(f"Orden topológico inválido: {cod} ({i}) <= padre ({p_i})")
            has_child.add(p_i)
            parent_idx_list.append(p_i)
        else:
            parent_idx_list.append(-1)

    accounts_meta = []
    leaf_idx_by_code: dict[str, int] = {}
    leaf_to_cap: list[str] = []
    next_leaf = 0
    for i, (cod, desc, nivel) in enumerate(raw_accounts):
        if i not in has_child:
            leaf_idx = next_leaf
            leaf_idx_by_code[cod] = leaf_idx
            leaf_to_cap.append(cod[0])
            next_leaf += 1
        else:
            leaf_idx = -1
        accounts_meta.append([cod, desc, int(nivel), parent_idx_list[i], leaf_idx])

    grouped: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    stored_caps: dict[tuple[int, int, str], float] = {}

    sql = """
        SELECT periodo, cod_cia, cod_cuenta, SUM(importe) AS total_imp
        FROM balances
        GROUP BY periodo, cod_cia, cod_cuenta
        HAVING ABS(SUM(importe)) > 0.5
    """
    for per, cia, cod, imp in cur.execute(sql):
        pi = p_map.get(per)
        ci = c_map.get(cia)
        if pi is None or ci is None:
            continue
        if cod in leaf_idx_by_code:
            iv = int(round(float(imp) / SCALE_PESOS))
            if iv != 0:
                grouped[(pi, ci)].append((leaf_idx_by_code[cod], iv))
        if cod.endswith(".00.00.00.00.00.00.00"):
            stored_caps[(pi, ci, cod[0])] = float(imp) / 1000.0  # miles de $

    conn.close()

    buf = bytearray()
    sorted_groups = sorted(grouped.items())
    encode_varint(buf, len(sorted_groups))
    for (pi, ci), entries in sorted_groups:
        entries.sort(key=lambda x: x[0])
        encode_varint(buf, pi)
        encode_varint(buf, ci)
        encode_varint(buf, len(entries))
        prev_l = 0
        for l_idx, iv in entries:
            encode_varint(buf, l_idx - prev_l)
            prev_l = l_idx
            encode_varint(buf, zigzag(iv))

    b64 = base64.b64encode(bytes(buf)).decode("ascii")

    # Verificación round-trip decodificando desde b64 y conciliando capítulos 1..5
    dec_bytes = base64.b64decode(b64)
    pos = 0
    n_groups, pos = decode_varint(dec_bytes, pos)
    if n_groups != len(sorted_groups):
        raise AssertionError(f"Round-trip nGroups mismatch: {n_groups} != {len(sorted_groups)}")

    max_err_miles = 0.0
    worst_ctx = None
    decoded_entries = 0
    for _ in range(n_groups):
        pi, pos = decode_varint(dec_bytes, pos)
        ci, pos = decode_varint(dec_bytes, pos)
        n_ent, pos = decode_varint(dec_bytes, pos)
        cur_l = 0
        cap_sums = {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0, "5": 0.0}
        for _ in range(n_ent):
            dl, pos = decode_varint(dec_bytes, pos)
            zz, pos = decode_varint(dec_bytes, pos)
            cur_l += dl
            val_miles = unzigzag(zz) * SCALE_MILES
            cap_sums[leaf_to_cap[cur_l]] += val_miles
            decoded_entries += 1
        for cap, sum_m in cap_sums.items():
            ref_m = stored_caps.get((pi, ci, cap), 0.0)
            err = abs(sum_m - ref_m)
            if err > max_err_miles:
                max_err_miles = err
                worst_ctx = (pi, ci, cap, sum_m, ref_m)

    if pos != len(dec_bytes):
        raise AssertionError(f"Round-trip pos mismatch: {pos} != {len(dec_bytes)}")
    if max_err_miles / 1000.0 > 0.01:
        raise AssertionError(
            f"Error de reconciliación excede 0.01 M: {max_err_miles / 1000.0:.4f} M ({worst_ctx})"
        )

    payload = {
        "scale_miles": SCALE_MILES,
        "n_leaves": next_leaf,
        "accounts": accounts_meta,
        "b64": b64,
    }
    OUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    elapsed = time.time() - t0
    print(
        f"Generado {OUT_JSON_PATH} ({OUT_JSON_PATH.stat().st_size / 1e6:.2f} MB) | "
        f"cuentas={len(accounts_meta)}, hojas={next_leaf}, grupos={n_groups:,}, entradas={decoded_entries:,} | "
        f"round-trip OK (max_err={max_err_miles / 1000.0:.5f} M) en {elapsed:.2f}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
