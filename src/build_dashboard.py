#!/usr/bin/env python3
"""Ensambla el tablero HTML 100% autocontenido y offline en dist/tablero_mercado_asegurador.html."""

from __future__ import annotations

import base64
import re
import sys
import urllib.request
from pathlib import Path

ASSETS_DIR = Path("assets")
BRAND_LOGO_SVG_PATH = ASSETS_DIR / "brand" / "logo-la-segunda-negativo.svg"
CHART_JS_PATH = ASSETS_DIR / "vendor" / "chart.umd.min.js"
FONT_LATIN_PATH = ASSETS_DIR / "fonts" / "sora-latin.woff2"
FONT_LATIN_EXT_PATH = ASSETS_DIR / "fonts" / "sora-latin-ext.woff2"

TPL_DIR = Path("src/templates")
DATA_JSON_PATH = Path("data/processed/dashboard_data.json")
VAL_JSON_PATH = Path("data/processed/validation_report.json")
BALANCES_TREE_JSON_PATH = Path("data/processed/balances_tree.json")
SSN_EXTRAS_JSON_PATH = Path("data/processed/ssn_extras.json")
OUT_HTML_PATH = Path("dist/tablero_mercado_asegurador.html")
DOCS_HTML_PATH = Path("docs/index.html")
DOCS_NOJEKYLL_PATH = Path("docs/.nojekyll")

CHART_JS_URL = "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"


def ensure_assets() -> None:
    """Asegura que los assets locales offline existan en assets/."""
    CHART_JS_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not CHART_JS_PATH.exists():
        print(f"Descargando {CHART_JS_URL} -> {CHART_JS_PATH}...")
        urllib.request.urlretrieve(CHART_JS_URL, str(CHART_JS_PATH))


def build_fonts_css() -> str:
    """Construye bloques @font-face con Sora embebida en Base64 para operación 100% offline."""
    blocks = []
    font_specs = [
        (
            FONT_LATIN_EXT_PATH,
            "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
        ),
        (
            FONT_LATIN_PATH,
            "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        ),
    ]
    for path, urange in font_specs:
        if path.exists():
            b64 = base64.b64encode(path.read_bytes()).decode("ascii")
            blocks.append(
                f"""@font-face {{
  font-family: 'Sora';
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
  src: url(data:font/woff2;base64,{b64}) format('woff2');
  unicode-range: {urange};
}}"""
            )
    return "\n".join(blocks)


def safe_inline_json(raw_json: str) -> str:
    """Escapa secuencias </script> para incrustación segura dentro de <script>."""
    return raw_json.replace("</", "<\\/")


def verify_offline(html: str) -> None:
    """Verifica que el HTML generado no contenga ninguna referencia externa."""
    if re.search(r"<script[^>]+src=", html, re.IGNORECASE):
        raise AssertionError("Se encontró <script src=...> en el HTML offline.")
    if re.search(r"<link[^>]+href=[\"']https?://", html, re.IGNORECASE):
        raise AssertionError("Se encontró <link href='http...'> en el HTML offline.")
    if re.search(r"@import\s+url\([\"']?https?://", html, re.IGNORECASE):
        raise AssertionError("Se encontró @import externo en el HTML offline.")
    if "Chart" not in html:
        raise AssertionError("Chart.js no parece estar embebido en el HTML.")


def main() -> int:
    ensure_assets()
    if not DATA_JSON_PATH.exists():
        raise FileNotFoundError(f"Falta {DATA_JSON_PATH}. Ejecutá src/metrics.py.")
    if not VAL_JSON_PATH.exists():
        raise FileNotFoundError(f"Falta {VAL_JSON_PATH}. Ejecutá src/validate.py.")
    if not BALANCES_TREE_JSON_PATH.exists():
        raise FileNotFoundError(f"Falta {BALANCES_TREE_JSON_PATH}. Ejecutá src/build_balances_tree.py.")
    if not SSN_EXTRAS_JSON_PATH.exists():
        raise FileNotFoundError(f"Falta {SSN_EXTRAS_JSON_PATH}. Ejecutá src/fetch_ssn_extras.py.")

    if not BRAND_LOGO_SVG_PATH.exists():
        raise FileNotFoundError(f"Falta {BRAND_LOGO_SVG_PATH}.")

    template_html = (TPL_DIR / "index.html").read_text(encoding="utf-8")
    brand_logo_svg = BRAND_LOGO_SVG_PATH.read_text(encoding="utf-8").strip()
    styles_css = (TPL_DIR / "styles.css").read_text(encoding="utf-8")
    app_js = (TPL_DIR / "app.js").read_text(encoding="utf-8")
    chart_js = CHART_JS_PATH.read_text(encoding="utf-8")
    # Evitar que comentarios o strings dentro de librerías minificadas rompan </script>
    chart_js = chart_js.replace("</script>", "<\\/script>")
    fonts_css = build_fonts_css()

    data_json = safe_inline_json(DATA_JSON_PATH.read_text(encoding="utf-8"))
    val_json = safe_inline_json(VAL_JSON_PATH.read_text(encoding="utf-8"))
    balances_tree_json = safe_inline_json(BALANCES_TREE_JSON_PATH.read_text(encoding="utf-8"))
    ssn_extras_json = safe_inline_json(SSN_EXTRAS_JSON_PATH.read_text(encoding="utf-8"))

    html = template_html
    html = html.replace("{{BRAND_LOGO_SVG}}", brand_logo_svg)
    html = html.replace("{{FONTS_CSS}}", fonts_css)
    html = html.replace("{{STYLES_CSS}}", styles_css)
    html = html.replace("{{CHART_JS}}", chart_js)
    html = html.replace("{{DATA_JSON}}", data_json)
    html = html.replace("{{VALIDATION_JSON}}", val_json)
    html = html.replace("{{BALANCES_TREE_JSON}}", balances_tree_json)
    html = html.replace("{{SSN_EXTRAS_JSON}}", ssn_extras_json)
    html = html.replace("{{APP_JS}}", app_js)

    verify_offline(html)

    OUT_HTML_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_HTML_PATH.write_text(html, encoding="utf-8")
    DOCS_HTML_PATH.parent.mkdir(parents=True, exist_ok=True)
    DOCS_HTML_PATH.write_text(html, encoding="utf-8")
    DOCS_NOJEKYLL_PATH.write_text("", encoding="utf-8")
    size_mb = OUT_HTML_PATH.stat().st_size / (1024 * 1024)
    print(f"Generado {OUT_HTML_PATH} y {DOCS_HTML_PATH} ({size_mb:.2f} MB) — Verificación 100% offline: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
