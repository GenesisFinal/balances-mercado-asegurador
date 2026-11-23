# Monitor del Mercado Asegurador Argentino (Balances SSN · SINENSUP)

Proyecto escalable para descargar balances trimestrales y estadísticas oficiales de la Superintendencia de Seguros de la Nación (SINENSUP y Portal Estadístico SSN), consolidarlos en SQLite, validarlos contablemente y generar un **tablero HTML 100 % offline autocontenido** siguiendo la identidad visual de **La Segunda Seguros**.

## Estructura del proyecto

```text
├── data/
│   ├── raw_zips/             # ZIPs oficiales SINENSUP (ventana auto-descubierta de 16 trimestres)
│   ├── raw_ssn_extras/       # Caché incremental de .xlsx oficiales SSN (Retiro, Mensual, Canales, Pólizas)
│   ├── catalogos/            # Catálogos editables y trazables:
│   │   ├── companias.csv     # Maestro de compañías, tipo, constitución y grupo económico
│   │   ├── participaciones_vpp.csv # Participaciones accionarias intragrupo (RT 21 / VPP)
│   │   ├── ramos.csv         # 54 subramos -> 24 ramos -> 4 grandes ramos
│   │   ├── ipc_ssn.csv       # Serie IPC FACPCE/SSN autoderivada de balances
│   │   ├── sinensup_pcu.xls  # Plan de Cuentas Único oficial
│   │   └── sinensup_ramos.xls
│   ├── processed/            # dashboard_data.json, balances_tree.json, ssn_extras.json y validation_report.json
│   └── warehouse.sqlite      # Base consolidada normalizada
├── assets/                   # Chart.js 4.4.7 UMD y fuente Sora .woff2 embebidos offline
├── src/
│   ├── fetch_ssn.py          # Descarga incremental JSF con auto-descubrimiento de períodos en SINENSUP
│   ├── fetch_ssn_extras.py   # Scraper + caché + parser de 5 fuentes oficiales SSN externas
│   ├── etl_mdb.py            # Parser Jet4 puro Python -> warehouse.sqlite
│   ├── audit_fase1.py        # Cuadre contable y semillas
│   ├── build_catalogs.py     # Generación y preservación de ediciones en companias.csv
│   ├── metrics.py            # Motor contable, IPC y cubos pre-agregados (incl. pr_subq Personas/Retiro)
│   ├── build_balances_tree.py# Compresor binario LEB128 del árbol contable completo para Balance Contable
│   ├── validate.py           # Conciliación automática vs PDFs SSN, Looker Studio e integridad contable
│   ├── build_dashboard.py    # Ensamblador HTML 100 % offline
│   └── templates/            # index.html, styles.css, app.js
├── dist/
│   └── tablero_mercado_asegurador.html   # Copia local 100 % offline
├── docs/
│   ├── index.html                        # Copia publicada en GitHub Pages
│   └── .nojekyll
├── .github/workflows/
│   └── update_ssn_extras.yml             # Actualización semanal automática (fuentes SSN)
├── deploy_to_github.py                   # Publicación segura a GitHub + Pages (sin .git en Drive)
└── update_quarter.py                     # Orquestador único de actualización y compilado
```

## Operación habitual (para tener siempre los últimos datos)

1. **Consultar sin modificar si la SSN publicó nuevos cierres o estadísticas**:
   ```bash
   python3 update_quarter.py --check
   ```

2. **Actualización mensual rápida (Producción Mensual, Tasa Testigo Retiro Voluntario, Retiro Estadístico, Canales y Pólizas/Siniestros)**:
   ```bash
   python3 update_quarter.py --extras-only
   ```
   *(Consulta en vivo los índices Google Sheets de `argentina.gob.ar/superintendencia-de-seguros/estadisticas`, verifica cambios vía `HTTP HEAD` y recompila `dist/` y `docs/` en segundos).*

3. **Actualización completa (nuevo cierre trimestral SINENSUP + todas las fuentes estadísticas SSN)**:
   ```bash
   python3 update_quarter.py --deploy
   ```
   *(Auto-descubre los últimos 16 trimestres disponibles en SINENSUP, re-verifica por SHA-256 el último cierre, ingesta balances faltantes o rectificados, regenera cubos, árbol contable y estadísticas externas, valida y republica en GitHub + Pages. Para forzar un período puntual: `python3 update_quarter.py --periodos 2026-4 --deploy`).*

4. **Recompilación local tras editar catálogos o interfaz sin tocar la red**:
   - Editá [companias.csv](data/catalogos/companias.csv) o [participaciones_vpp.csv](data/catalogos/participaciones_vpp.csv) y ejecutá:
     ```bash
     python3 update_quarter.py --rebuild-only
     ```

5. **Acceso local u online**:
   - **Local (100 % offline):** abrí `dist/tablero_mercado_asegurador.html` en cualquier navegador moderno.
   - **Web (GitHub Pages):** https://genesisfinal.github.io/balances-mercado-asegurador/
   - **Repositorio:** https://github.com/GenesisFinal/balances-mercado-asegurador
   - **Publicación manual a GitHub + Pages:** `python3 deploy_to_github.py` (sincroniza mediante clon temporal sin crear `.git/` dentro de Google Drive). Además, el workflow semanal `.github/workflows/update_ssn_extras.yml` actualiza automáticamente los lunes las 5 fuentes estadísticas SSN.

## Criterios metodológicos clave

- **Consolidación VPP intragrupo (RT 21)**: por defecto, los totales consolidados de grupos económicos y del mercado eliminan el Valor Patrimonial Proporcional entre aseguradoras locales (`Acciones Grupo Económico` en Activo/Inversiones/PN capado a `acc_ge` y `% × Resultado del Ejercicio` de cada controlada en Resultado Financiero / del Ejercicio), evitando duplicar pérdidas o patrimonio cuando la controlante consolida por VPP. Puede alternarse con *Suma simple* desde el filtro global del tablero.
- **Moneda**: permite alternar entre **Moneda de cada cierre (SSN)** (idéntico a los PDFs oficiales y al comparativo Looker Studio de Personas y Retiro) y **Moneda constante** usando los coeficientes IPC autoderivados de los cierres oficiales.
- **Base temporal**:
  - **Acumulado Ejercicio**: cifras acumuladas desde el `01/07` de cada ejercicio contable.
  - **Trimestre Estanco (3m)**: desacumulación real `Acum(T) - Acum(T-1) * (IPC(T)/IPC(T-1))`.
  - **Últimos 12 Meses (LTM)**: suma móvil de 4 trimestres estancos homogéneos (disponible en los últimos 12 trimestres).
- **Seguros Directos vs Totales**: los rankings por ramo/subramo reflejan **Seguros Directos** (Anexos 12-A, 13-A y 14-A, excluyendo Reaseguros Activos); la Ficha de Entidad incluye además el Estado de Resultados completo y la pestaña **9. Balance Contable** permite abrir la totalidad del Plan de Cuentas Único hasta el máximo nivel informado.
- **Fuentes Estadísticas SSN Integradas**:
  1. *Información Estadística de Seguros de Retiro* (pólizas, certificados, demografía edad × sexo, ticket de reserva promedio).
  2. *Tasa Testigo Retiro Voluntario en Pesos* (Res. SSN 38.428, comparación real vs. IPC y retorno de inversiones).
  3. *Evolución de la Producción Mensual SSN* (series nominal y constante por ramo de Personas, Retiro y Patrimoniales).
  4. *Canales de Venta SSN* (mix histórico PAS / Agentes Institorios / Bancaseguros / Venta Directa y apertura provincial).
  5. *Pólizas, Siniestros y Primas SSN* (movimiento trimestral/churn, volumen físico, frecuencia siniestral y rankings Top 15 por entidad).
