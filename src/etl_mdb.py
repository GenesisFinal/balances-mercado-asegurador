#!/usr/bin/env python3
"""Parser Jet4 puro en Python y ETL incremental hacia data/warehouse.sqlite."""

from __future__ import annotations

import argparse
import hashlib
import os
import sqlite3
import struct
import sys
import tempfile
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from access_parser import AccessParser

TYPE_LONG = 4
TYPE_DOUBLE = 7
TYPE_TEXT = 10
TYPE_MEMO = 12


def parse_periodo_meta(periodo: str) -> tuple[str, str, int, int]:
    """Devuelve (fecha_cierre, ejercicio, trimestre_ej, meses_acum) según calendario fiscal SSN."""
    parts = periodo.strip().split("-")
    if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
        raise ValueError(f"Formato de período inválido: {periodo!r} (esperado YYYY-Q)")
    year = int(parts[0])
    q = int(parts[1])
    if q == 3:
        return f"{year}-09-30", f"{year}/{year + 1}", 1, 3
    if q == 4:
        return f"{year}-12-31", f"{year}/{year + 1}", 2, 6
    if q == 1:
        return f"{year}-03-31", f"{year - 1}/{year}", 3, 9
    if q == 2:
        return f"{year}-06-30", f"{year - 1}/{year}", 4, 12
    raise ValueError(f"Trimestre SSN desconocido en período {periodo!r}")


def decode_jet4_text(raw: bytes) -> str:
    """Decodifica texto Jet4 (compressed unicode 0xFF 0xFE o UTF-16-LE)."""
    if not raw:
        return ""
    if len(raw) >= 2 and raw[0] == 0xFF and raw[1] == 0xFE:
        out = bytearray()
        compressed = True
        i = 2
        n = len(raw)
        while i < n:
            b = raw[i]
            if b == 0x00:
                compressed = not compressed
                i += 1
            elif compressed:
                out.append(b)
                out.append(0)
                i += 1
            else:
                if i + 1 < n:
                    out.append(b)
                    out.append(raw[i + 1])
                i += 2
        return out.decode("utf-16-le", errors="replace")
    return raw.decode("utf-16-le", errors="replace")


def read_lval(buf: bytes, page_size: int, ptr: int) -> bytes:
    """Lee un bloque LVAL de una página de datos Jet4."""
    row_idx = ptr & 0xFF
    page_num = ptr >> 8
    off = page_num * page_size
    if off + page_size > len(buf):
        return b""
    page = buf[off:off + page_size]
    num_rows = struct.unpack_from("<H", page, 12)[0]
    if row_idx >= num_rows:
        return b""
    start = struct.unpack_from("<H", page, 14 + row_idx * 2)[0]
    if start & 0x4000:
        return b""
    start &= 0x0FFF
    if row_idx == 0:
        end = page_size
    else:
        prev = struct.unpack_from("<H", page, 14 + (row_idx - 1) * 2)[0]
        end = prev & 0x0FFF
    return page[start:end]


def decode_memo(buf: bytes, page_size: int, raw: bytes) -> str:
    """Decodifica campo MEMO Jet4 (inline, LVAL simple o LVAL multipágina)."""
    if len(raw) < 12:
        return ""
    memo_len, lval_ptr, _ = struct.unpack_from("<III", raw, 0)
    flags = memo_len >> 30
    length = memo_len & 0x3FFFFFFF
    if length == 0:
        return ""
    if flags == 2:  # 0x80000000: inline
        data = raw[12:12 + length]
    elif flags == 1:  # 0x40000000: single-page LVAL
        data = read_lval(buf, page_size, lval_ptr)
    else:  # multi-page LVAL
        chunks = []
        ptr = lval_ptr
        while ptr:
            chunk = read_lval(buf, page_size, ptr)
            if len(chunk) < 4:
                break
            ptr = struct.unpack_from("<I", chunk, 0)[0]
            chunks.append(chunk[4:])
        data = b"".join(chunks)
    return decode_jet4_text(data)


def read_mdb_balance(mdb_path: Path) -> tuple[list[dict[str, object]], int]:
    """Extrae todas las filas de la tabla Balance de un .mdb Jet4 usando metadatos de AccessParser."""
    db = AccessParser(str(mdb_path))
    if db.version != 4:
        raise RuntimeError(f"{mdb_path.name}: versión Jet no soportada ({db.version}); solo Jet4.")

    user_tables = [t for t in db.catalog.keys() if not t.startswith("MSys")]
    if not user_tables:
        raise RuntimeError(f"{mdb_path.name}: no se encontraron tablas de usuario.")
    if "Balance" in db.catalog:
        table_name = "Balance"
    else:
        table_name = max(user_tables, key=lambda t: db.get_table(t).table_header.number_of_rows)

    tdef_page = db.catalog[table_name]
    tdef = db.get_table(table_name)
    page_size = tdef.page_size
    if page_size != 4096:
        raise RuntimeError(f"{mdb_path.name}: page_size inesperado ({page_size}); esperado 4096.")

    declared_rows = int(tdef.table_header.number_of_rows)
    columns = list(tdef.table_header.column)

    fixed_cols = []
    var_cols = []
    for c in columns:
        cname = str(c.col_name_str)
        if c.column_flags.fixed_length:
            fixed_cols.append((cname, int(c.column_index), int(c.type), int(c.fixed_offset), int(c.length)))
        else:
            var_cols.append((cname, int(c.column_index), int(c.type), int(c.variable_column_number)))
    var_cols.sort(key=lambda item: item[3])

    buf = mdb_path.read_bytes()
    num_pages = len(buf) // page_size
    rows: list[dict[str, object]] = []

    def decode_fixed(ctype: int, data: bytes, offset: int) -> object:
        if ctype == TYPE_DOUBLE:
            return struct.unpack_from("<d", data, offset)[0]
        if ctype == TYPE_LONG:
            return struct.unpack_from("<i", data, offset)[0]
        raise RuntimeError(f"Tipo de columna fija no soportado: {ctype}")

    def parse_record(rec: bytes) -> dict[str, object] | None:
        if len(rec) < 4:
            return None
        col_count = struct.unpack_from("<H", rec, 0)[0]
        nbm_len = (col_count + 7) // 8
        if len(rec) < 2 + nbm_len + 2:
            return None
        nbm = rec[-nbm_len:]
        pos_vcc = len(rec) - nbm_len - 2
        var_count = struct.unpack_from("<H", rec, pos_vcc)[0]
        tbl_start = pos_vcc - (var_count + 1) * 2
        if tbl_start < 2:
            return None
        offs = struct.unpack_from(f"<{var_count + 1}H", rec, tbl_start)

        row: dict[str, object] = {}
        for cname, cidx, ctype, foff, flen in fixed_cols:
            is_nn = bool(nbm[cidx // 8] & (1 << (cidx % 8)))
            if is_nn and 2 + foff + flen <= tbl_start:
                row[cname] = decode_fixed(ctype, rec, 2 + foff)
            else:
                row[cname] = None

        for cname, cidx, ctype, vnum in var_cols:
            is_nn = bool(nbm[cidx // 8] & (1 << (cidx % 8)))
            if not is_nn or vnum >= var_count:
                row[cname] = ""
                continue
            s = offs[var_count - vnum]
            e = offs[var_count - 1 - vnum]
            if e <= s or e > tbl_start:
                row[cname] = ""
                continue
            raw_val = rec[s:e]
            if ctype == TYPE_MEMO:
                row[cname] = decode_memo(buf, page_size, raw_val).strip()
            elif ctype == TYPE_TEXT:
                row[cname] = decode_jet4_text(raw_val).strip()
            else:
                row[cname] = raw_val
        return row

    for p in range(num_pages):
        off = p * page_size
        if buf[off] != 0x01 or buf[off + 1] != 0x01:
            continue
        if struct.unpack_from("<I", buf, off + 4)[0] != tdef_page:
            continue
        page = buf[off:off + page_size]
        nrows = struct.unpack_from("<H", page, 12)[0]
        prev_end = page_size
        for r in range(nrows):
            ro = struct.unpack_from("<H", page, 14 + r * 2)[0]
            start = ro & 0x0FFF
            end = prev_end
            prev_end = start
            if ro & 0x4000 or ro & 0x8000:
                continue
            rec = page[start:end]
            parsed = parse_record(rec)
            if parsed is not None:
                rows.append(parsed)

    if len(rows) != declared_rows:
        raise AssertionError(
            f"{mdb_path.name}: filas extraídas ({len(rows)}) != filas declaradas ({declared_rows})"
        )
    return rows, declared_rows


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def init_db(conn: sqlite3.Connection) -> None:
    """Crea el esquema normalizado en warehouse.sqlite si no existe."""
    conn.executescript(
        """
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;

        CREATE TABLE IF NOT EXISTS periodos (
            periodo TEXT PRIMARY KEY,
            fecha_cierre TEXT NOT NULL,
            ejercicio TEXT NOT NULL,
            trimestre_ej INTEGER NOT NULL,
            meses_acum INTEGER NOT NULL,
            filas INTEGER NOT NULL,
            companias INTEGER NOT NULL,
            fuente_zip TEXT NOT NULL,
            cargado_en TEXT NOT NULL,
            zip_sha256 TEXT
        );

        CREATE TABLE IF NOT EXISTS companias_periodo (
            periodo TEXT NOT NULL,
            cod_cia TEXT NOT NULL,
            razon_social TEXT NOT NULL,
            PRIMARY KEY (periodo, cod_cia)
        );

        CREATE TABLE IF NOT EXISTS plan_cuentas (
            cod_cuenta TEXT PRIMARY KEY,
            desc_cuenta TEXT NOT NULL,
            nivel INTEGER NOT NULL,
            id_padre TEXT
        );

        CREATE TABLE IF NOT EXISTS subramos (
            cod_subramo TEXT PRIMARY KEY,
            desc_subramo TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS balances (
            periodo TEXT NOT NULL,
            cod_cia TEXT NOT NULL,
            cod_cuenta TEXT NOT NULL,
            cod_subramo TEXT NOT NULL,
            nivel INTEGER NOT NULL,
            importe REAL NOT NULL
        );
        """
    )
    cols = {r[1] for r in conn.execute("PRAGMA table_info(periodos)").fetchall()}
    if "zip_sha256" not in cols:
        conn.execute("ALTER TABLE periodos ADD COLUMN zip_sha256 TEXT")


def create_indexes(conn: sqlite3.Connection) -> None:
    """Crea índices analíticos sobre la tabla balances."""
    conn.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_bal_p_cia ON balances(periodo, cod_cia);
        CREATE INDEX IF NOT EXISTS idx_bal_p_cta ON balances(periodo, cod_cuenta);
        CREATE INDEX IF NOT EXISTS idx_bal_p_sr ON balances(periodo, cod_subramo) WHERE cod_subramo != '';
        """
    )


def load_zip_into_db(conn: sqlite3.Connection, zip_path: Path, expected_periodo: str | None = None) -> tuple[str, int, int, int]:
    """Extrae el .mdb del ZIP, valida fila a fila e inserta de forma idempotente en SQLite."""
    t0 = time.time()
    with zipfile.ZipFile(zip_path, "r") as zf:
        mdb_names = [n for n in zf.namelist() if n.lower().endswith(".mdb")]
        if not mdb_names:
            raise RuntimeError(f"{zip_path.name}: no contiene archivo .mdb")
        with tempfile.TemporaryDirectory() as td:
            mdb_file = Path(zf.extract(mdb_names[0], td))
            rows, declared_rows = read_mdb_balance(mdb_file)

    periodo_file = expected_periodo or zip_path.stem
    fecha_cierre, ejercicio, trimestre_ej, meses_acum = parse_periodo_meta(periodo_file)

    cias: dict[str, str] = {}
    cuentas: dict[str, tuple[str, int, str]] = {}
    subramos_map: dict[str, str] = {}
    bal_rows: list[tuple[str, str, str, str, int, float]] = []
    seen_keys: set[tuple[str, str, str]] = set()
    dup_count = 0

    for row in rows:
        cod_cia = str(row.get("cod_cia") or "").strip()
        razon_social = str(row.get("razon_social") or "").strip()
        row_per = str(row.get("periodo") or "").strip() or periodo_file
        if row_per != periodo_file:
            raise RuntimeError(f"{zip_path.name}: fila con periodo={row_per!r} != {periodo_file!r}")
        cod_subramo = str(row.get("cod_subramo") or "").strip()
        desc_subramo = str(row.get("desc_subramo") or "").strip()
        cod_cuenta = str(row.get("cod_cuenta") or "").strip()
        desc_cuenta = str(row.get("desc_cuenta") or "").strip()
        nivel = int(row.get("nivel") or 0)
        id_padre = str(row.get("id_padre") or "").strip()
        importe = float(row.get("importe") or 0.0)

        if cod_cia and (cod_cia not in cias or len(razon_social) > len(cias[cod_cia])):
            cias[cod_cia] = razon_social
        if cod_cuenta:
            cuentas[cod_cuenta] = (desc_cuenta, nivel, id_padre)
        if cod_subramo and desc_subramo:
            subramos_map[cod_subramo] = desc_subramo

        key = (cod_cia, cod_cuenta, cod_subramo)
        if key in seen_keys:
            dup_count += 1
        else:
            seen_keys.add(key)

        bal_rows.append((periodo_file, cod_cia, cod_cuenta, cod_subramo, nivel, importe))

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    zip_sha = file_sha256(zip_path)
    with conn:
        conn.execute("DELETE FROM balances WHERE periodo = ?", (periodo_file,))
        conn.execute("DELETE FROM companias_periodo WHERE periodo = ?", (periodo_file,))
        conn.execute("DELETE FROM periodos WHERE periodo = ?", (periodo_file,))

        conn.execute(
            """
            INSERT INTO periodos (periodo, fecha_cierre, ejercicio, trimestre_ej, meses_acum, filas, companias, fuente_zip, cargado_en, zip_sha256)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (periodo_file, fecha_cierre, ejercicio, trimestre_ej, meses_acum, declared_rows, len(cias), zip_path.name, now_iso, zip_sha),
        )
        conn.executemany(
            "INSERT INTO companias_periodo (periodo, cod_cia, razon_social) VALUES (?, ?, ?)",
            [(periodo_file, c, rs) for c, rs in sorted(cias.items())],
        )
        conn.executemany(
            """
            INSERT INTO plan_cuentas (cod_cuenta, desc_cuenta, nivel, id_padre)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(cod_cuenta) DO UPDATE SET
                desc_cuenta = excluded.desc_cuenta,
                nivel = excluded.nivel,
                id_padre = excluded.id_padre
            """,
            [(k, v[0], v[1], v[2]) for k, v in cuentas.items()],
        )
        conn.executemany(
            """
            INSERT INTO subramos (cod_subramo, desc_subramo)
            VALUES (?, ?)
            ON CONFLICT(cod_subramo) DO UPDATE SET
                desc_subramo = excluded.desc_subramo
            """,
            list(subramos_map.items()),
        )
        conn.executemany(
            "INSERT INTO balances (periodo, cod_cia, cod_cuenta, cod_subramo, nivel, importe) VALUES (?, ?, ?, ?, ?, ?)",
            bal_rows,
        )

    dt = time.time() - t0
    print(f"Cargado {periodo_file} ({fecha_cierre}, {ejercicio}): {declared_rows:,} filas, {len(cias)} cías, dups={dup_count} en {dt:.2f}s")
    return periodo_file, declared_rows, len(cias), dup_count


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Carga incremental de ZIPs SINENSUP (.mdb) en warehouse.sqlite.")
    parser.add_argument("--raw-dir", default="data/raw_zips", help="Carpeta con los ZIPs descargados.")
    parser.add_argument("--db", default="data/warehouse.sqlite", help="Ruta al archivo SQLite destino.")
    parser.add_argument("--periodos", nargs="+", help="Períodos específicos a cargar (ej. 2026-3 2026-2).")
    parser.add_argument("--force", action="store_true", help="Recargar períodos aunque ya estén en la base.")
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()
    raw_dir = Path(args.raw_dir)
    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    zip_files = sorted(
        raw_dir.glob("*.zip"),
        key=lambda p: parse_periodo_meta(p.stem)[0],
    )
    if args.periodos:
        wanted = {item.strip() for arg in args.periodos for item in arg.split(",") if item.strip()}
        zip_files = [p for p in zip_files if p.stem in wanted]
        missing = wanted - {p.stem for p in zip_files}
        if missing:
            raise FileNotFoundError(f"No se encontraron ZIPs para: {sorted(missing)}")

    conn = sqlite3.connect(str(db_path))
    try:
        init_db(conn)
        existing = {r[0]: r[1] for r in conn.execute("SELECT periodo, zip_sha256 FROM periodos").fetchall()}
        total_dups = 0
        loaded = 0
        for zp in zip_files:
            per = zp.stem
            cur_sha = file_sha256(zp)
            if not args.force and not args.periodos and per in existing:
                stored_sha = existing[per]
                if stored_sha is None:
                    with conn:
                        conn.execute("UPDATE periodos SET zip_sha256 = ? WHERE periodo = ?", (cur_sha, per))
                    print(f"Omitiendo {per}: ya cargado en {db_path.name} (SHA registrado).")
                    continue
                if stored_sha == cur_sha:
                    print(f"Omitiendo {per}: ya cargado en {db_path.name} (SHA sin cambios).")
                    continue
                print(f"Recargando {per}: el archivo ZIP cambió en disco (rectificación SSN)...")
            _, _, _, dups = load_zip_into_db(conn, zp, expected_periodo=per)
            total_dups += dups
            loaded += 1

        create_indexes(conn)
        print(f"\nETL completado. Períodos procesados: {loaded}. Duplicados de clave detectados: {total_dups}.")
    finally:
        conn.close()

    size_mb = db_path.stat().st_size / (1024 * 1024)
    print(f"Tamaño de {db_path}: {size_mb:.2f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
