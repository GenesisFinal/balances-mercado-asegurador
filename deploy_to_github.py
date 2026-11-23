#!/usr/bin/env python3
"""Publica el proyecto y el tablero offline en GitHub con GitHub Pages (/docs) y CI automático."""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent
REPO_NAME = "balances-mercado-asegurador"
REPO_DESC = "Monitor del Mercado Asegurador Argentino (SSN SINENSUP + Estadísticas Oficiales) — Tablero Ejecutivo 100% Offline"

ROOT_ALLOW_FILES = [
    "README.md",
    ".gitignore",
    "requirements.txt",
    "update_quarter.py",
    "deploy_to_github.py",
]
DIR_ALLOW_LIST = [
    ".github",
    "assets",
    "src",
    "data/catalogos",
    "data/processed",
    "docs",
]

FORBIDDEN_EXTS = {".pdf", ".zip", ".sqlite", ".sqlite3", ".db", ".pyc", ".env"}


def get_token() -> tuple[str | None, str]:
    """Obtiene el token GitHub desde GITHUB_TOKEN o GitHub token.txt (local o proyectos hermanos)."""
    env_tok = os.environ.get("GITHUB_TOKEN", "").strip()
    if env_tok:
        return env_tok, "GITHUB_TOKEN (env)"

    candidates: list[Path] = [BASE_DIR / "GitHub token.txt"]
    parent = BASE_DIR.parent
    preferred = [
        "Tablero de Seguros",
        "Tablero Retiro",
        "Tablero Personas",
        "Tablero-Economía",
        "Tablero-Economía",
        "Tablero General",
        "FAL",
        "Humor Social",
        "SIJUBARA",
    ]
    for name in preferred:
        p = parent / name / "GitHub token.txt"
        if p not in candidates:
            candidates.append(p)
    try:
        for d in sorted(parent.iterdir()):
            if d.is_dir():
                p = d / "GitHub token.txt"
                if p not in candidates:
                    candidates.append(p)
    except OSError:
        pass

    tok_re = re.compile(r"(gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)")
    for cand in candidates:
        try:
            if not cand.exists():
                continue
            txt = cand.read_text(encoding="utf-8", errors="ignore")
            m = tok_re.search(txt)
            if m:
                return m.group(1), cand.parent.name
        except OSError:
            continue
    return None, ""


def _git(cwd: Path, args: list[str], extraheader: str | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    cmd = ["git"]
    if extraheader:
        cmd.extend(["-c", f"http.https://github.com/.extraheader={extraheader}"])
    cmd.extend(args)
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    res = subprocess.run(cmd, cwd=str(cwd), env=env, text=True, capture_output=True)
    if check and res.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} falló ({res.returncode}): {res.stderr.strip() or res.stdout.strip()}")
    return res


def _default_commit_message() -> str:
    sin_per = ""
    ext_lbl = ""
    dash_p = BASE_DIR / "data/processed/dashboard_data.json"
    ext_p = BASE_DIR / "data/processed/ssn_extras.json"
    try:
        if dash_p.exists():
            meta = json.loads(dash_p.read_text(encoding="utf-8")).get("meta", {})
            sin_per = meta.get("latest_periodo") or ""
        if ext_p.exists():
            ext = json.loads(ext_p.read_text(encoding="utf-8"))
            pm = ext.get("prod_mensual", {}).get("latest_label", "")
            tt = ext.get("tasa_testigo_rv", {}).get("latest_label", "")
            if pm or tt:
                ext_lbl = f" · SSN Mensual {pm or '—'} / TT {tt or '—'}"
    except Exception:
        pass
    tag = f"SINENSUP {sin_per}" if sin_per else "actualización"
    return f"deploy: Monitor Mercado Asegurador ({tag}{ext_lbl})"


def _is_forbidden(rel_path: str, file_path: Path) -> str | None:
    name_l = file_path.name.lower()
    if name_l == ".ds_store" or "__pycache__" in Path(rel_path).parts:
        return "archivo temporal/sistema"
    if file_path.suffix.lower() in FORBIDDEN_EXTS:
        return f"extensión prohibida ({file_path.suffix})"
    if "token" in name_l or name_l.startswith(".env"):
        return "posible archivo de credenciales"
    sz = file_path.stat().st_size
    if sz > 50 * 1024 * 1024:
        return f"supera 50 MB ({sz / (1024 * 1024):.1f} MB)"
    return None


def _copy_allowlisted(stage_dir: Path) -> None:
    for item in stage_dir.iterdir():
        if item.name == ".git":
            continue
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()

    for rel in ROOT_ALLOW_FILES:
        src = BASE_DIR / rel
        if src.exists():
            shutil.copy2(src, stage_dir / rel)

    def _ignore(dirpath: str, names: list[str]) -> set[str]:
        ignored: set[str] = set()
        for nm in names:
            nl = nm.lower()
            if (
                nm == "__pycache__"
                or nm == ".DS_Store"
                or nl.endswith((".pyc", ".pdf", ".zip", ".sqlite", ".sqlite3", ".db"))
                or "token" in nl
                or nl.startswith(".env")
            ):
                ignored.add(nm)
        return ignored

    for rel_dir in DIR_ALLOW_LIST:
        src_dir = BASE_DIR / rel_dir
        if src_dir.exists():
            dst_dir = stage_dir / rel_dir
            shutil.copytree(src_dir, dst_dir, ignore=_ignore, dirs_exist_ok=True)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Publica el proyecto y GitHub Pages desde una copia temporal limpia.")
    p.add_argument("--repo", default=REPO_NAME, help=f"Nombre del repositorio en GitHub (default: {REPO_NAME}).")
    p.add_argument("--message", "-m", default="", help="Mensaje de commit personalizado.")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    os.chdir(BASE_DIR)

    docs_html = BASE_DIR / "docs/index.html"
    docs_nj = BASE_DIR / "docs/.nojekyll"
    dist_html = BASE_DIR / "dist/tablero_mercado_asegurador.html"
    if (
        not docs_html.exists()
        or not docs_nj.exists()
        or (dist_html.exists() and dist_html.stat().st_mtime > docs_html.stat().st_mtime)
    ):
        print("Sincronizando docs/index.html desde src/build_dashboard.py...")
        res = subprocess.run([sys.executable, str(BASE_DIR / "src/build_dashboard.py")], check=False)
        if res.returncode != 0:
            raise SystemExit(f"build_dashboard.py falló con código {res.returncode}.")

    token, tok_src = get_token()
    if not token:
        print("[ERROR] No se encontró token GitHub (GITHUB_TOKEN ni GitHub token.txt en carpetas hermanas).")
        return 1

    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "BalancesMercadoAsegurador-Deploy/1.0",
    }
    u_resp = requests.get("https://api.github.com/user", headers=headers, timeout=20)
    if u_resp.status_code != 200:
        print(f"[ERROR] Token inválido o rechazado por GitHub API ({u_resp.status_code}).")
        return 1
    user_login = u_resp.json()["login"]
    repo_slug = f"{user_login}/{args.repo}"
    print(f"[OK] Autenticado en GitHub como '{user_login}' (credencial: {tok_src})")

    # Crear repositorio si no existe
    r_check = requests.get(f"https://api.github.com/repos/{repo_slug}", headers=headers, timeout=20)
    if r_check.status_code == 404:
        print(f"[*] Creando repositorio público '{repo_slug}'...")
        r_create = requests.post(
            "https://api.github.com/user/repos",
            headers=headers,
            json={
                "name": args.repo,
                "description": REPO_DESC,
                "private": False,
                "auto_init": True,
            },
            timeout=20,
        )
        if r_create.status_code not in (200, 201):
            print(f"[ERROR] No se pudo crear {repo_slug}: {r_create.status_code} {r_create.text}")
            return 1
        time.sleep(2.5)
        print(f"[OK] Repositorio '{repo_slug}' creado.")
    elif r_check.status_code != 200:
        print(f"[ERROR] Error consultando {repo_slug}: {r_check.status_code}")
        return 1

    basic_tok = base64.b64encode(f"x-access-token:{token}".encode("utf-8")).decode("ascii")
    extraheader = f"AUTHORIZATION: basic {basic_tok}"
    clone_url = f"https://github.com/{repo_slug}.git"

    with tempfile.TemporaryDirectory(prefix="gh_stage_") as tmp:
        stage_dir = Path(tmp) / args.repo
        clone_res = _git(
            Path(tmp),
            ["clone", "--depth", "1", "--branch", "main", clone_url, str(stage_dir)],
            extraheader=extraheader,
            check=False,
        )
        if clone_res.returncode != 0:
            _git(Path(tmp), ["clone", clone_url, str(stage_dir)], extraheader=extraheader, check=True)
            _git(stage_dir, ["checkout", "-B", "main"])

        _copy_allowlisted(stage_dir)
        _git(stage_dir, ["config", "user.name", user_login])
        _git(stage_dir, ["config", "user.email", f"{user_login}@users.noreply.github.com"])
        _git(stage_dir, ["add", "-A"])

        tracked = [p for p in _git(stage_dir, ["ls-files"]).stdout.splitlines() if p.strip()]
        total_bytes = 0
        for rel in tracked:
            fp = stage_dir / rel
            if not fp.exists():
                continue
            reason = _is_forbidden(rel, fp)
            if reason:
                raise RuntimeError(f"Bloqueo de seguridad previo al push en '{rel}': {reason}")
            total_bytes += fp.stat().st_size

        print(f"[OK] Staging temporal verificado: {len(tracked)} archivos ({total_bytes / (1024 * 1024):.2f} MB), 0 archivos bloqueados.")

        st = _git(stage_dir, ["status", "--porcelain"]).stdout.strip()
        if st:
            msg = args.message.strip() or _default_commit_message()
            _git(stage_dir, ["commit", "-m", msg])
            _git(stage_dir, ["push", "-u", "origin", "main"], extraheader=extraheader)
            print(f"[OK] Push exitoso a {repo_slug} (branch main): {msg}")
        else:
            print("[OK] Sin cambios pendientes para subir a GitHub.")

    # Configurar / verificar GitHub Pages (main /docs)
    pages_url = f"https://api.github.com/repos/{repo_slug}/pages"
    r_pages = requests.get(pages_url, headers=headers, timeout=20)
    desired = {"source": {"branch": "main", "path": "/docs"}}
    if r_pages.status_code == 404:
        r_post = requests.post(pages_url, headers=headers, json=desired, timeout=20)
        if r_post.status_code in (200, 201):
            print("[OK] GitHub Pages habilitado en main -> /docs.")
        else:
            print(f"[AVISO] Respuesta activando Pages: {r_post.status_code} {r_post.text}")
    elif r_pages.status_code == 200:
        cur_src = r_pages.json().get("source", {})
        if cur_src.get("branch") != "main" or cur_src.get("path") != "/docs":
            r_put = requests.put(pages_url, headers=headers, json=desired, timeout=20)
            print(f"[OK] Origen GitHub Pages actualizado a main /docs ({r_put.status_code}).")
        else:
            print("[OK] GitHub Pages ya configurado en main -> /docs.")

    live_url = f"https://{user_login.lower()}.github.io/{args.repo}/"
    print(f"\nRepositorio:  https://github.com/{repo_slug}")
    print(f"GitHub Pages: {live_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
