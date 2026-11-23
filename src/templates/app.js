(function () {
  "use strict";

  const DATA = window.__SSN_DATA__;
  const VAL = window.__SSN_VALIDATION__;
  const SSN_EXTRAS = window.__SSN_EXTRAS__ || {};
  const META = DATA.meta;
  const PERIODOS = META.periodos;
  const COMPANIAS = META.companias;
  const RAMOS = META.ramos;
  const SUBRAMOS = META.subramos || [];
  const SUBRAMOS_PR = META.subramos_pr;
  const GRAN_RAMOS = META.gran_ramos || ["Patrimoniales", "ART", "Personas", "Retiro"];
  const GRAN_LABELS = {
    Patrimoniales: "Patrimoniales",
    ART: "Riesgos de Trabajo (ART)",
    Personas: "Personas",
    Retiro: "Retiro",
  };
  const VPP_LINKS = META.vpp_links || [];

  const BRAND = {
    red: "#e20039",
    redDark: "#b91f38",
    redBright: "#f42c4b",
    redCoral: "#ff4c60",
    ink: "#30302d",
    muted: "#666661",
    green: "#3ac792",
    blue: "#4183ca",
    yellow: "#f8cc59",
    orange: "#ff593e",
    amber: "#d99b00",
    brown: "#512420",
  };
  const PALETTE = [BRAND.red, BRAND.blue, BRAND.green, BRAND.orange, BRAND.ink, BRAND.yellow, BRAND.brown, BRAND.redDark];

  if (window.Chart) {
    Chart.defaults.locale = "es-AR";
    Chart.defaults.font.family = "'Sora', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = BRAND.ink;
  }

  // Column index maps
  const CQ_IDX = {};
  DATA.cq_cols.forEach((c, i) => { CQ_IDX[c] = i; });
  const RQ_IDX = {};
  DATA.rq_cols.forEach((c, i) => { RQ_IDX[c] = i; });
  const SRQ_IDX = {};
  (DATA.srq_cols || []).forEach((c, i) => { SRQ_IDX[c] = i; });
  const PRQ_IDX = {};
  DATA.prq_cols.forEach((c, i) => { PRQ_IDX[c] = i; });
  const GQ_IDX = {};
  (DATA.gq_cols || []).forEach((c, i) => { GQ_IDX[c] = i; });
  const PR_SUBQ_IDX = {};
  (DATA.pr_subq_cols || []).forEach((c, i) => { PR_SUBQ_IDX[c] = i; });

  const LS_PERSONAS_COD = "0117";
  const LS_RETIRO_COD = "0436";
  const ZURICH_LIFE_COD = "0541";
  const PERSONAS_RAMO_ORDER = ["2.030", "2.010", "2.020", "2.050"];
  const PERSONAS_RAMO_LABELS = {
    "2.030": "Vida",
    "2.010": "Accidentes Personales",
    "2.020": "Salud",
    "2.050": "Sepelio",
  };
  const RETIRO_SUB_LABELS = {
    "2.060.01": "Retiro Individual",
    "2.060.02": "Retiro Colectivo",
    "2.070.01": "Rentas Previsionales",
    "2.070.02": "Rentas de RT",
  };
  const PERSONAS_SUBRAMOS = SUBRAMOS
    .filter((s) => s.gran === "Personas")
    .slice()
    .sort((a, b) => {
      const ra = PERSONAS_RAMO_ORDER.indexOf(a.cod_ramo);
      const rb = PERSONAS_RAMO_ORDER.indexOf(b.cod_ramo);
      if (ra !== rb) return ra - rb;
      return a.cod.localeCompare(b.cod);
    });
  const RETIRO_SUBRAMOS = SUBRAMOS
    .filter((s) => s.gran === "Retiro")
    .slice()
    .sort((a, b) => a.cod.localeCompare(b.cod));
  const PR_SUB_STOCK_KEYS = [
    "prem_cob", "deudas_aseg", "comp_tec",
    "sp_admin", "sp_juic", "sp_med", "sp_liq", "sp_ibnr", "sp_reas",
  ];
  const PR_SUB_FLOW_KEYS = [
    "emit_tot", "emit_sd", "cedidas", "prim_dev", "sin_dev",
    "rescates", "rentas", "otras_ind",
    "g_prod", "g_expl", "g_reas", "g_tot", "otros_ing", "otros_egr", "res_tec",
    "com_pas", "com_inst", "com_otros", "sin_rec_reas", "part_util_reas",
  ];

  const STOCK_KEYS = [
    "activo", "disp", "inv", "prem_cob", "cred_reas", "otros_cred", "inmuebles", "bienes_uso", "otros_act",
    "pasivo", "deudas_aseg", "deudas_reas", "deudas_prod", "deudas_fisc", "otras_deudas", "comp_tec", "previsiones", "pn",
    "inv_tp", "inv_acc", "inv_on", "inv_fci", "inv_fid", "inv_pf", "inv_otr", "acc_ge",
  ];
  const FLOW_KEYS = [
    "emit_tot", "emit_sd", "cedidas", "prim_dev", "sin_dev",
    "rescates", "rentas", "otras_ind",
    "g_prod", "g_prod_com", "g_expl", "g_reas", "g_tot", "g_sueldos", "g_dir", "g_hon", "g_imp", "g_pub",
    "otros_ing", "otros_egr",
    "res_tec", "fin_rentas", "fin_realiz", "fin_tenencia", "fin_otros", "res_fin", "recpam", "res_extra", "imp_gan", "res_ej",
  ];
  const GQ_FLOW_KEYS = [
    "emit_tot", "emit_sd", "cedidas", "prim_dev", "sin_dev",
    "rescates", "rentas", "otras_ind",
    "g_prod", "g_expl", "g_reas", "g_tot", "otros_ing", "otros_egr", "res_tec",
  ];

  // Fast lookup structures
  const nP = PERIODOS.length;
  const nC = COMPANIAS.length;
  const cqGrid = Array.from({ length: nP }, () => new Array(nC).fill(null));
  DATA.cq.forEach((r) => { cqGrid[r[0]][r[1]] = r; });

  const gqGrid = Array.from({ length: nP }, () => Array.from({ length: GRAN_RAMOS.length }, () => new Array(nC).fill(null)));
  (DATA.gq || []).forEach((r) => {
    if (gqGrid[r[0]] && gqGrid[r[0]][r[2]]) gqGrid[r[0]][r[2]][r[1]] = r;
  });

  const rqByPC = new Map();
  const rqByPR = new Map();
  DATA.rq.forEach((r) => {
    const kPC = r[0] + "|" + r[1];
    if (!rqByPC.has(kPC)) rqByPC.set(kPC, []);
    rqByPC.get(kPC).push(r);

    const kPR = r[0] + "|" + r[2];
    if (!rqByPR.has(kPR)) rqByPR.set(kPR, []);
    rqByPR.get(kPR).push(r);
  });

  const prqByPS = new Map();
  DATA.prq.forEach((r) => {
    const kPS = r[0] + "|" + r[2];
    if (!prqByPS.has(kPS)) prqByPS.set(kPS, []);
    prqByPS.get(kPS).push(r);
  });

  const srqByPS = new Map();
  (DATA.srq || []).forEach((r) => {
    const kPS = r[0] + "|" + r[2];
    if (!srqByPS.has(kPS)) srqByPS.set(kPS, []);
    srqByPS.get(kPS).push(r);
  });
  const prSubByPSR = new Map();
  (DATA.pr_subq || []).forEach((r) => {
    const kPSR = r[0] + "|" + r[2];
    if (!prSubByPSR.has(kPSR)) prSubByPSR.set(kPSR, []);
    prSubByPSR.get(kPSR).push(r);
  });
  const subramosByRamo = new Map();
  SUBRAMOS.forEach((sr) => {
    if (!subramosByRamo.has(sr.cod_ramo)) subramosByRamo.set(sr.cod_ramo, []);
    subramosByRamo.get(sr.cod_ramo).push(sr);
  });

  const ciaByCod = new Map();
  COMPANIAS.forEach((c) => { ciaByCod.set(c.cod, c); });

  // Global & view state
  const state = {
    pIdx: nP - 1, // 2026-3
    base: "acum",
    moneda: "cierre",
    tipo: "",
    granRamo: "",
    constitucion: "",
    grupo: "",
    consol: "madre",
    unidad: "M",
    activeTab: "panorama",
    // Tab 2: Grupo L2
    l2ShareBasis: "neto_vpp",
    l2EvoMetric: "emit_sd",
    l2EvoMode: "abs",
    // Tab 3: Rankings
    rkMode: "prod",
    rkSearch: "",
    rkLimit: 30,
    rkHighlightLS: true,
    rkExclZurichLife: false,
    rkSort: { key: "emit_sd", dir: "desc" },
    // Tab 3
    rmLevel: "ramo",
    rmGran: "",
    rmSort: { key: "emit_sd", dir: "desc" },
    rmSelectedCod: "1.030",
    rmSelectedSubCod: "",
    // Tab 4: Personas
    perView: "gestion",
    perUniverse: "all",
    perExclZurich: true,
    perScopeType: "all",
    perScopeCod: "",
    perEvoMetric: "comb_pct",
    perRkSort: { key: "emit_sd", dir: "desc" },
    perRkShowAll: false,
    perCanShowAll: false,
    perCanSort: { key: "g_prod", dir: "desc" },
    perJudSort: { key: "sp_bruto", dir: "desc" },
    perReasSort: { key: "cedidas", dir: "desc" },
    ssnCanSeg: "personas",
    ssnCanProvMode: "prod",
    perPolRamo: "vida_col_cert",
    perPolCruceMode: "freq",
    perPolRkKey: "vida_col_pol",
    lookerSort: {},
    lookerLimit: {},
    lookerSearch: {},
    lookerColWidths: {},
    // Tab 5: Retiro
    retView: "gestion",
    retTopBy: "emit_sd",
    retScopeCods: [],
    retScatterMode: "tec_fin",
    retEvoMetric: "share_dual",
    retRkSort: { key: "emit_sd", dir: "desc" },
    retRkShowAll: false,
    retFnoUnit: "pct",
    retFnoSort: { key: "flujo_neto_res_pct", dir: "desc" },
    retTtMode: "mensual",
    retTtHoriz: "24",
    retTicketMode: "ahorro_ind",
    retDemoSeg: "aseg_ind",
    retAsegSort: { key: "rm_total", dir: "desc" },
    // Tab 10: Pulso Mensual
    menUnitMode: "const",
    menHoriz: "24",
    // Tab 6
    grpMode: "multi",
    grpSort: { key: "emit_sd", dir: "desc" },
    grpSelected: "Grupo La Segunda",
    constSort: { key: "emit_sd", dir: "desc" },
    // Tab 5
    fichaEntity: "CIA:0317",
    fichaPeers: ["CIA:0224", "CIA:0726", "CIA:0192", "CIA:0222"],
    fichaEvoMetric: "emit_sd",
    fichaExclZurich: false,
    fichaTopCrit: "auto",
    fichaLastFilterSig: "|||",
    // Tab 9: Balance Contable
    balEntity: "CIA:0317",
    balStmt: "patrimonial",
    balSearch: "",
    balHideZero: true,
    balStrictLevels: false,
    balExpanded: new Set(),
    balDefaultInit: false,
  };

  const charts = {};
  function destroyChart(id) {
    if (charts[id]) {
      charts[id].destroy();
      delete charts[id];
    }
  }

  function isGranRamoTechOnly() {
    return Boolean(state.granRamo) && state.granRamo !== "Retiro";
  }

  function setChartEmptyState(canvasId, title, detail) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.parentElement) return;
    const box = canvas.parentElement;
    box.querySelectorAll(".chart-empty-state").forEach((el) => el.remove());
    if (!title) {
      canvas.style.display = "";
      return;
    }
    canvas.style.display = "none";
    const div = document.createElement("div");
    div.className = "chart-empty-state";
    div.innerHTML = `<strong>${esc(title)}</strong>${detail ? `<p>${esc(detail)}</p>` : ""}`;
    box.appendChild(div);
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Formatting helpers
  function unitDivisor() {
    if (state.unidad === "K") return 1;
    if (state.unidad === "MM") return 1e6;
    if (state.unidad === "B") return 1e9;
    return 1e3; // M
  }
  function unitSuffix() {
    if (state.unidad === "K") return "K";
    if (state.unidad === "MM") return "MM";
    if (state.unidad === "B") return "B";
    return "M";
  }
  function unitDecimals() {
    if (state.unidad === "MM") return 1;
    if (state.unidad === "B") return 2;
    return 0; // K y M sin decimales
  }
  function fmtMoney(valMiles, decimals) {
    if (valMiles == null || !Number.isFinite(valMiles)) return "—";
    const dec = decimals != null ? decimals : unitDecimals();
    let scaled = valMiles / unitDivisor();
    if (Math.abs(scaled) < 0.5 * Math.pow(10, -dec)) scaled = 0;
    return "$ " + scaled.toLocaleString("es-AR", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }) + " " + unitSuffix();
  }
  function fmtNumMiles(valMiles, decimals) {
    if (valMiles == null || !Number.isFinite(valMiles)) return "—";
    const dec = decimals != null ? decimals : unitDecimals();
    let scaled = valMiles / unitDivisor();
    if (Math.abs(scaled) < 0.5 * Math.pow(10, -dec)) scaled = 0;
    return scaled.toLocaleString("es-AR", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });
  }
  function fmtPesosExact(valMiles) {
    if (valMiles == null || !Number.isFinite(valMiles)) return "—";
    return "$ " + Math.round(valMiles * 1000).toLocaleString("es-AR");
  }
  function fmtPct(val, dec = 2) {
    if (val == null || !Number.isFinite(val)) return "—";
    return val.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + "%";
  }
  function fmtSolvLiq(val, dec = 2) {
    if (val == null || !Number.isFinite(val) || val > 9999) return "s/c%";
    return fmtPct(val, dec);
  }
  function fmtSignedPct(val, dec = 1) {
    if (val == null || !Number.isFinite(val)) return "—";
    const sign = val > 0 ? "+" : "";
    return sign + val.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + "%";
  }
  function fmtDec(val, dec = 2) {
    if (val == null || !Number.isFinite(val)) return "—";
    return val.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function fmtScaledVal(scaledVal, dec = unitDecimals()) {
    if (scaledVal == null || !Number.isFinite(scaledVal)) return "—";
    let v = scaledVal;
    if (Math.abs(v) < 0.5 * Math.pow(10, -dec)) v = 0;
    return v.toLocaleString("es-AR", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });
  }
  function chartMoneyTick(v) {
    if (v == null || !Number.isFinite(v)) return "";
    const dec = unitDecimals();
    const clean = Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(10));
    const isCleanAtDec = Math.abs(clean * Math.pow(10, dec) - Math.round(clean * Math.pow(10, dec))) < 1e-6;
    return clean.toLocaleString("es-AR", {
      minimumFractionDigits: dec,
      maximumFractionDigits: isCleanAtDec ? dec : Math.min(dec + 2, 4),
    });
  }
  function chartPctTick(v) {
    if (v == null || !Number.isFinite(v)) return "";
    const clean = Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(10));
    return clean.toLocaleString("es-AR") + "%";
  }
  function chartMoneyTooltipLabel(ctx) {
    const v = ctx.chart.options.indexAxis === "y" ? ctx.parsed.x : ctx.parsed.y;
    const rawLbl = (ctx.dataset.label || "").replace(/\s*\((?:K|M|MM|B)\)\s*$/, "");
    const prefix = rawLbl ? rawLbl + ": " : "";
    return ` ${prefix}$ ${fmtScaledVal(v)} ${unitSuffix()}`;
  }
  function chartPctTooltipLabel(ctx, dec = 2) {
    const v = ctx.chart.options.indexAxis === "y" ? ctx.parsed.x : ctx.parsed.y;
    const lbl = ctx.dataset.label ? ctx.dataset.label + ": " : "";
    return ` ${lbl}${fmtPct(v, dec)}`;
  }
  function pctClass(val, invertGoodBad = false) {
    if (val == null || !Number.isFinite(val) || Math.abs(val) < 0.005) return "neu";
    const good = invertGoodBad ? val < 0 : val > 0;
    return good ? "pos" : "neg";
  }

  // Effective temporal mode resolving availability edge cases
  function resolveBaseAndMeses(pIdx, reqBase) {
    if (reqBase === "ltm") {
      if (pIdx >= 4) return { base: "ltm", meses: 12, fallbackMsg: "" };
      const ltmStartLbl = PERIODOS[Math.min(4, nP - 1)]?.label || "";
      const ltmEndLbl = PERIODOS[nP - 1]?.label || "";
      return {
        base: "acum",
        meses: PERIODOS[pIdx].meses,
        fallbackMsg: `Últimos 12 Meses (LTM) completo requiere 4 trimestres previos y está disponible para los últimos ${Math.max(0, nP - 4)} trimestres (${ltmStartLbl} a ${ltmEndLbl}). Se muestra Acumulado Ejercicio para ${PERIODOS[pIdx].label}.`,
      };
    }
    if (reqBase === "estanco") {
      if (PERIODOS[pIdx].trim === 1 || pIdx >= 1) return { base: "estanco", meses: 3, fallbackMsg: "" };
      return {
        base: "acum",
        meses: PERIODOS[pIdx].meses,
        fallbackMsg: `Trimestre Estanco no disponible para ${PERIODOS[pIdx].label} (sin cierre previo en la serie de ${nP} trimestres). Se muestra Acumulado ${PERIODOS[pIdx].meses}m.`,
      };
    }
    return { base: "acum", meses: PERIODOS[pIdx].meses, fallbackMsg: "" };
  }

  // Generic standalone quarter flow computation for an array getter: getArr(qIdx) -> array of numbers (or null)
  function computeFlowVector(pIdx, base, moneda, getArr, len) {
    const out = new Array(len).fill(0);
    const ipcP = PERIODOS[pIdx].ipc_idx;
    const fLatest = moneda === "const" ? PERIODOS[pIdx].factor_latest : 1.0;

    function estancoAt(q) {
      const cur = getArr(q);
      if (PERIODOS[q].trim === 1) {
        return cur ? cur.slice() : new Array(len).fill(0);
      }
      if (q === 0) return new Array(len).fill(0);
      const prev = getArr(q - 1);
      const ratioIpc = PERIODOS[q].ipc_idx / PERIODOS[q - 1].ipc_idx;
      const res = new Array(len).fill(0);
      for (let i = 0; i < len; i++) {
        const a = cur ? cur[i] : 0;
        const b = prev ? prev[i] : 0;
        res[i] = a - b * ratioIpc;
      }
      return res;
    }

    if (base === "acum") {
      const arr = getArr(pIdx);
      if (!arr) return null;
      for (let i = 0; i < len; i++) out[i] = arr[i] * fLatest;
      return out;
    }
    if (base === "estanco") {
      const arr = estancoAt(pIdx);
      for (let i = 0; i < len; i++) out[i] = arr[i] * fLatest;
      return out;
    }
    // ltm: sum of 4 estanco quarters re-expressed to pIdx
    if (pIdx < 4) return null;
    for (let k = 0; k < 4; k++) {
      const q = pIdx - k;
      const est = estancoAt(q);
      const mult = (ipcP / PERIODOS[q].ipc_idx) * fLatest;
      for (let i = 0; i < len; i++) out[i] += est[i] * mult;
    }
    return out;
  }

  function enrichRatios(m, mesesBase) {
    const pd = m.prim_dev;
    const pasTec = (m.deudas_aseg != null && m.comp_tec != null) ? (m.deudas_aseg + m.comp_tec) : null;
    m.pas_tec = pasTec;
    m.sin_pct = pd > 0 && m.sin_dev != null ? (m.sin_dev / pd) * 100 : null;
    m.benef_pct = pd > 0 ? (((m.sin_dev || 0) + (m.rescates || 0) + (m.rentas || 0) + (m.otras_ind || 0)) / pd) * 100 : null;
    m.gprod_pct = pd > 0 && m.g_prod != null ? (m.g_prod / pd) * 100 : null;
    m.gexpl_pct = pd > 0 && m.g_expl != null ? (m.g_expl / pd) * 100 : null;
    m.gprod_emit_pct = m.emit_sd > 0 && m.g_prod != null ? (m.g_prod / m.emit_sd) * 100 : null;
    m.gexpl_pt_pct = pasTec != null && pasTec > 0 && m.g_expl != null ? (m.g_expl / pasTec) * 100 : null;
    m.greas_pct = pd > 0 && m.g_reas != null ? (m.g_reas / pd) * 100 : null;
    m.gto_pct = pd > 0 && m.g_tot != null ? (m.g_tot / pd) * 100 : null;
    m.comb_pct = pd > 0 && m.sin_dev != null && m.g_tot != null ? ((m.sin_dev + m.g_tot) / pd) * 100 : null;
    m.rt_pct = pd > 0 && m.res_tec != null ? (m.res_tec / pd) * 100 : null;
    m.rt_pas_tec_pct = pasTec != null && pasTec > 0 && m.res_tec != null ? (m.res_tec / pasTec) * 100 : null;
    m.rf_pct = pd > 0 && m.res_fin != null ? (m.res_fin / pd) * 100 : null;
    m.re_pct = pd > 0 && m.res_ej != null ? (m.res_ej / pd) * 100 : null;
    m.ret_inv_pct = m.inv != null && m.inv > 0 && m.res_fin != null ? (m.res_fin / m.inv) * 100 : null;
    m.ret_inv_sin_recpam_pct = m.inv != null && m.inv > 0 && m.res_fin != null && m.recpam != null ? ((m.res_fin - m.recpam) / m.inv) * 100 : null;
    m.ret_inv_anual_pct = m.inv != null && m.inv > 0 && m.res_fin != null && mesesBase ? (m.res_fin / m.inv) * (12 / mesesBase) * 100 : null;
    m.roe_pct = m.pn != null && m.pn > 0 && m.res_ej != null ? (m.res_ej / m.pn) * 100 : null;
    m.roa_pct = m.activo != null && m.activo > 0 && m.res_ej != null ? (m.res_ej / m.activo) * 100 : null;
    const creditosTot = m.prem_cob != null ? ((m.prem_cob || 0) + (m.cred_reas || 0) + (m.otros_cred || 0)) : null;
    m.creditos_tot = creditosTot;
    m.dep_pct = m.activo != null && m.activo > 0 && creditosTot != null ? (creditosTot / m.activo) * 100 : null;
    m.solv_liq_pct = m.deudas_aseg != null && m.deudas_aseg > 0 && m.disp != null && m.inv != null ? ((m.disp + m.inv) / m.deudas_aseg) * 100 : null;
    m.cobertura_pct = pasTec != null && pasTec > 0 && m.inv != null && m.disp != null ? ((m.disp + m.inv + (m.inmuebles || 0)) / pasTec) * 100 : null;
    m.apalanc = m.pn != null && m.pn > 0 && m.pasivo != null ? m.pasivo / m.pn : null;
    return m;
  }

  function getCompanyMetrics(pIdx, cIdx, reqBase, moneda) {
    const row = cqGrid[pIdx][cIdx];
    if (!row) return null;
    const { base, meses } = resolveBaseAndMeses(pIdx, reqBase);
    const fStock = moneda === "const" ? PERIODOS[pIdx].factor_latest : 1.0;

    const m = {};
    STOCK_KEYS.forEach((k) => {
      m[k] = row[CQ_IDX[k]] * fStock;
    });

    const fStart = CQ_IDX[FLOW_KEYS[0]];
    const fLen = FLOW_KEYS.length;
    const flowVec = computeFlowVector(
      pIdx,
      base,
      moneda,
      (q) => {
        const r = cqGrid[q][cIdx];
        return r ? r.slice(fStart, fStart + fLen) : null;
      },
      fLen
    );
    FLOW_KEYS.forEach((k, i) => {
      m[k] = flowVec ? flowVec[i] : 0;
    });
    m.isRamoScope = false;
    return enrichRatios(m, meses);
  }

  function getCompanyGranRamoMetrics(pIdx, cIdx, gIdx, reqBase, moneda) {
    if (gIdx < 0 || !gqGrid[pIdx] || !gqGrid[pIdx][gIdx]) return null;
    const { base, meses } = resolveBaseAndMeses(pIdx, reqBase);
    if (base === "acum" && !gqGrid[pIdx][gIdx][cIdx]) return null;

    const fLen = GQ_FLOW_KEYS.length;
    const flowVec = computeFlowVector(
      pIdx,
      base,
      moneda,
      (q) => {
        const r = gqGrid[q] && gqGrid[q][gIdx] ? gqGrid[q][gIdx][cIdx] : null;
        return r ? r.slice(3, 3 + fLen) : null;
      },
      fLen
    );
    if (!flowVec) return null;
    const [emit_tot, emit_sd, , prim_dev, , , , , , , , , , , res_tec] = flowVec;
    if (Math.abs(emit_tot) < 0.001 && Math.abs(emit_sd) < 0.001 && Math.abs(prim_dev) < 0.001 && Math.abs(res_tec) < 0.001) {
      return null;
    }

    const m = {};
    STOCK_KEYS.forEach((k) => { m[k] = null; });
    FLOW_KEYS.forEach((k) => { m[k] = null; });
    GQ_FLOW_KEYS.forEach((k, i) => { m[k] = flowVec[i]; });
    m.isRamoScope = true;
    return enrichRatios(m, meses);
  }

  function emptyMetricsObj(isRamoScope = false) {
    const m = {};
    STOCK_KEYS.forEach((k) => { m[k] = isRamoScope ? null : 0; });
    FLOW_KEYS.forEach((k) => { m[k] = (isRamoScope && !GQ_FLOW_KEYS.includes(k)) ? null : 0; });
    m.isRamoScope = isRamoScope;
    return m;
  }

  function addMetrics(acc, m) {
    if (!m) return;
    if (acc.isRamoScope) {
      GQ_FLOW_KEYS.forEach((k) => { acc[k] += (m[k] || 0); });
    } else {
      STOCK_KEYS.forEach((k) => { acc[k] += (m[k] || 0); });
      FLOW_KEYS.forEach((k) => { acc[k] += (m[k] || 0); });
    }
  }

  function getFilteredCompanies(pIdx, opts = {}) {
    const useGran = !opts.ignoreGranRamo && Boolean(state.granRamo);
    const useRetiroFull = useGran && state.granRamo === "Retiro";
    const gIdx = useGran && !useRetiroFull ? GRAN_RAMOS.indexOf(state.granRamo) : -1;
    return COMPANIAS.filter((c) => {
      if (useRetiroFull) {
        if (!cqGrid[pIdx][c.idx] || c.tipo !== "Retiro") return false;
      } else if (useGran) {
        if (!gqGrid[pIdx][gIdx] || !gqGrid[pIdx][gIdx][c.idx]) return false;
      } else {
        if (!cqGrid[pIdx][c.idx]) return false;
      }
      if (!opts.onlyGranRamo) {
        if (state.tipo && c.tipo !== state.tipo) return false;
        if (state.constitucion && c.const !== state.constitucion) return false;
        if (state.grupo && c.grupo !== state.grupo) return false;
      }
      return true;
    });
  }

  function calcYoY(cur, prev) {
    if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) return null;
    return ((cur / prev) - 1) * 100;
  }

  function canCompareYoY(pIdx, reqBase) {
    if (pIdx < 4) return false;
    const prevP = pIdx - 4;
    if (reqBase === "ltm") return prevP >= 4;
    if (reqBase === "estanco") return prevP >= 1 || PERIODOS[prevP].trim === 1;
    return true;
  }

  function getCompanyRowsForPeriod(pIdx, useFilters = true, opts = {}) {
    const applyOtherFilters = useFilters && !opts.onlyGranRamo;
    const applyGranScope = (useFilters || opts.onlyGranRamo) && Boolean(state.granRamo) && !opts.ignoreGranRamo;
    const applyRetiroFull = applyGranScope && state.granRamo === "Retiro";
    const applyGranCube = applyGranScope && state.granRamo !== "Retiro";
    const gIdx = applyGranCube ? GRAN_RAMOS.indexOf(state.granRamo) : -1;
    const cias = COMPANIAS.filter((c) => {
      if (applyRetiroFull && c.tipo !== "Retiro") return false;
      if (applyOtherFilters) {
        if (state.tipo && c.tipo !== state.tipo) return false;
        if (state.constitucion && c.const !== state.constitucion) return false;
        if (state.grupo && c.grupo !== state.grupo) return false;
      }
      return true;
    });
    const { meses } = resolveBaseAndMeses(pIdx, state.base);
    const hasYoY = canCompareYoY(pIdx, state.base);
    const rows = [];
    cias.forEach((c) => {
      const m = applyGranCube
        ? getCompanyGranRamoMetrics(pIdx, c.idx, gIdx, state.base, state.moneda)
        : getCompanyMetrics(pIdx, c.idx, state.base, state.moneda);
      if (!m) return;
      const mPrev = hasYoY
        ? (applyGranCube
          ? getCompanyGranRamoMetrics(pIdx - 4, c.idx, gIdx, state.base, state.moneda)
          : getCompanyMetrics(pIdx - 4, c.idx, state.base, state.moneda))
        : null;
      m.cod = c.cod;
      m.cIdx = c.idx;
      m.nombre = c.nombre;
      m.razon = c.razon;
      m.tipo = c.tipo;
      m.const = c.const;
      m.grupo = c.grupo;
      m.esLS = c.ls;
      m.multi = c.multi;
      m.emit_yoy = mPrev ? calcYoY(m.emit_sd, mPrev.emit_sd) : null;
      m.pn_yoy = mPrev && m.pn != null && mPrev.pn != null ? calcYoY(m.pn, mPrev.pn) : null;
      m.inv_yoy = mPrev && m.inv != null && mPrev.inv != null ? calcYoY(m.inv, mPrev.inv) : null;
      m.emit_prev = mPrev ? mPrev.emit_sd : null;
      m.meses = meses;
      rows.push(m);
    });
    return rows;
  }

  function estancoResEj(q, cIdx) {
    const resEjCol = CQ_IDX["res_ej"];
    const curR = cqGrid[q][cIdx];
    const cur = curR ? curR[resEjCol] : 0;
    if (PERIODOS[q].trim === 1) return cur;
    if (q === 0) return 0;
    const prevR = cqGrid[q - 1][cIdx];
    const prev = prevR ? prevR[resEjCol] : 0;
    return cur - prev * (PERIODOS[q].ipc_idx / PERIODOS[q - 1].ipc_idx);
  }

  function computeVppEdgesForRows(rows, pIdx, reqBase = state.base, moneda = state.moneda) {
    const emptyRes = { totElimPn: 0, totElimRe: 0, totNciPn: 0, totNciRe: 0, edgeMap: new Map(), details: [], nciDetails: [] };
    if (!VPP_LINKS.length || !rows || rows.length <= 1 || pIdx == null || pIdx < 0) return emptyRes;

    const byCod = new Map();
    rows.forEach((r) => {
      if (r && r.cod) byCod.set(r.cod, r);
    });
    if (byCod.size <= 1) return emptyRes;

    const { base } = resolveBaseAndMeses(pIdx, reqBase);
    const fLatest = moneda === "const" ? PERIODOS[pIdx].factor_latest : 1.0;
    const accGeCol = CQ_IDX["acc_ge"];
    const ipcP = PERIODOS[pIdx].ipc_idx;

    const activeEdges = [];
    const rawPnByParent = new Map();

    VPP_LINKS.forEach((lk, lkIdx) => {
      const parent = byCod.get(lk.pCod);
      const child = byCod.get(lk.sCod);
      if (!parent || !child) return;

      const stockInRange = pIdx >= lk.fromP && pIdx <= lk.toP && parent.acc_ge > 0;
      const rawPn = stockInRange ? lk.pct * child.pn : 0;
      if (stockInRange) {
        rawPnByParent.set(lk.pCod, (rawPnByParent.get(lk.pCod) || 0) + rawPn);
      }

      let elimRe = 0;
      let status = stockInRange ? "Activa" : (pIdx < lk.fromP || pIdx > lk.toP ? "Fuera de vigencia" : "Sin Acc. GE");
      if (base === "ltm" && pIdx >= 4) {
        let anyQ = false;
        for (let k = 0; k < 4; k++) {
          const q = pIdx - k;
          if (q < lk.fromP || q > lk.toP) continue;
          const prQ = cqGrid[q][lk.pIdx];
          const srQ = cqGrid[q][lk.sIdx];
          if (!prQ || !srQ || prQ[accGeCol] <= 0) continue;
          anyQ = true;
          const mult = (ipcP / PERIODOS[q].ipc_idx) * fLatest;
          elimRe += lk.pct * estancoResEj(q, lk.sIdx) * mult;
        }
        if (anyQ && !stockInRange) status = "Parcial LTM";
      } else if (stockInRange) {
        elimRe = lk.pct * child.res_ej;
      }

      if (stockInRange || Math.abs(elimRe) > 0.001) {
        activeEdges.push({ lkIdx, lk, parent, stockInRange, rawPn, elimRe, status });
      }
    });

    let totElimPn = 0;
    let totElimRe = 0;
    const edgeMap = new Map();
    const details = [];
    const inPctStock = new Map();
    const inElimPn = new Map();
    activeEdges.forEach((e) => {
      const sumP = rawPnByParent.get(e.lk.pCod) || 0;
      const scale = sumP > 0 ? Math.min(1.0, e.parent.acc_ge / sumP) : 1.0;
      const elimPn = e.rawPn * scale;
      totElimPn += elimPn;
      totElimRe += e.elimRe;
      if (e.stockInRange) {
        inPctStock.set(e.lk.sCod, (inPctStock.get(e.lk.sCod) || 0) + e.lk.pct);
        inElimPn.set(e.lk.sCod, (inElimPn.get(e.lk.sCod) || 0) + elimPn);
      }
      const det = { ...e.lk, elimPn, elimRe: e.elimRe, status: e.status };
      edgeMap.set(e.lkIdx, det);
      details.push(det);
    });

    // Participación de Terceros (otros accionistas) en sociedades controladas (> 50% intragrupo)
    let totNciPn = 0;
    let totNciRe = 0;
    const nciPnByChild = new Map();
    inPctStock.forEach((rawPct, sCod) => {
      if (rawPct <= 0.5) return;
      const child = byCod.get(sCod);
      if (!child) return;
      const cInfo = ciaByCod.get(sCod);
      const inPct = Math.min(1.0, rawPct);
      const nciPn = child.pn - (inElimPn.get(sCod) || 0);
      totNciPn += nciPn;
      nciPnByChild.set(sCod, {
        sCod,
        sNom: (cInfo && cInfo.nombre) || child.nombre || sCod,
        pctGrupo: inPct,
        pctTerc: 1 - inPct,
        nciPn,
        nciRe: 0,
      });
    });

    if (base === "ltm" && pIdx >= 4) {
      for (let k = 0; k < 4; k++) {
        const q = pIdx - k;
        const inPctQ = new Map();
        VPP_LINKS.forEach((lk) => {
          if (!byCod.has(lk.pCod) || !byCod.has(lk.sCod)) return;
          if (q < lk.fromP || q > lk.toP) return;
          const prQ = cqGrid[q][lk.pIdx];
          const srQ = cqGrid[q][lk.sIdx];
          if (!prQ || !srQ || prQ[accGeCol] <= 0) return;
          inPctQ.set(lk.sCod, (inPctQ.get(lk.sCod) || 0) + lk.pct);
        });
        inPctQ.forEach((rawPctQ, sCod) => {
          if (rawPctQ <= 0.5) return;
          const cInfo = ciaByCod.get(sCod);
          if (!cInfo) return;
          const inPct = Math.min(1.0, rawPctQ);
          const mult = (ipcP / PERIODOS[q].ipc_idx) * fLatest;
          const nciReQ = (1.0 - inPct) * estancoResEj(q, cInfo.idx) * mult;
          totNciRe += nciReQ;
          let rec = nciPnByChild.get(sCod);
          if (!rec) {
            rec = {
              sCod,
              sNom: cInfo.nombre || sCod,
              pctGrupo: inPct,
              pctTerc: 1 - inPct,
              nciPn: 0,
              nciRe: 0,
            };
            nciPnByChild.set(sCod, rec);
          }
          rec.nciRe += nciReQ;
        });
      }
    } else {
      nciPnByChild.forEach((rec, sCod) => {
        const child = byCod.get(sCod);
        if (!child) return;
        const nciRe = (1.0 - rec.pctGrupo) * child.res_ej;
        rec.nciRe = nciRe;
        totNciRe += nciRe;
      });
    }

    const nciDetails = Array.from(nciPnByChild.values());
    return { totElimPn, totElimRe, totNciPn, totNciRe, edgeMap, details, nciDetails };
  }

  function applyVppElimination(acc, rows, pIdx, reqBase = state.base, moneda = state.moneda, opts = {}) {
    acc.elim_vpp_pn = 0;
    acc.elim_vpp_re = 0;
    acc.part_terc_pn = 0;
    acc.part_terc_re = 0;
    acc.vpp_details = [];
    acc.nci_details = [];
    if (state.consol === "bruto" || !rows || rows.length <= 1 || pIdx == null) return acc;

    const { totElimPn, totElimRe, totNciPn, totNciRe, details, nciDetails } = computeVppEdgesForRows(rows, pIdx, reqBase, moneda);
    if (totElimPn > 0 || Math.abs(totElimRe) > 0) {
      acc.activo -= totElimPn;
      acc.inv -= totElimPn;
      acc.inv_acc = Math.max(0, acc.inv_acc - totElimPn);
      acc.pn -= totElimPn;
      acc.res_fin -= totElimRe;
      acc.res_ej -= totElimRe;
      acc.elim_vpp_pn = totElimPn;
      acc.elim_vpp_re = totElimRe;
      acc.vpp_details = details;
    }
    if (state.consol === "madre" && opts.scope === "group" && (Math.abs(totNciPn) > 0.001 || Math.abs(totNciRe) > 0.001)) {
      acc.pn -= totNciPn;
      acc.res_ej -= totNciRe;
      acc.part_terc_pn = totNciPn;
      acc.part_terc_re = totNciRe;
      acc.nci_details = nciDetails;
    }
    return acc;
  }

  function aggregateMetrics(rows, meses, pIdx = state.pIdx, reqBase = state.base, moneda = state.moneda, opts = {}) {
    const isRamoScope = rows.length > 0 ? Boolean(rows[0].isRamoScope) : isGranRamoTechOnly();
    const acc = emptyMetricsObj(isRamoScope);
    rows.forEach((r) => addMetrics(acc, r));
    if (!isRamoScope) {
      applyVppElimination(acc, rows, pIdx, reqBase, moneda, opts);
    } else {
      acc.elim_vpp_pn = 0;
      acc.elim_vpp_re = 0;
      acc.part_terc_pn = 0;
      acc.part_terc_re = 0;
      acc.vpp_details = [];
      acc.nci_details = [];
    }
    return enrichRatios(acc, meses);
  }

  // Generic sortable table renderer
  function renderSortableTable(container, columns, rows, sortState, onSort, opts = {}) {
    const sorted = rows.slice().sort((a, b) => {
      const va = a[sortState.key];
      const vb = b[sortState.key];
      const na = va == null || (typeof va === "number" && !Number.isFinite(va));
      const nb = vb == null || (typeof vb === "number" && !Number.isFinite(vb));
      if (na && nb) return 0;
      if (na) return 1;
      if (nb) return -1;
      let cmp = 0;
      if (typeof va === "string") cmp = va.localeCompare(vb, "es");
      else cmp = va - vb;
      return sortState.dir === "asc" ? cmp : -cmp;
    });

    const limit = opts.limit || sorted.length;
    const displayRows = sorted.slice(0, limit);

    let html = '<table class="data-table"><thead><tr>';
    columns.forEach((col) => {
      const cls = [];
      if (col.num) cls.push("num");
      if (col.sortable !== false) cls.push("sortable");
      if (sortState.key === col.key) cls.push(sortState.dir === "asc" ? "sorted-asc" : "sorted-desc");
      html += `<th class="${cls.join(" ")}" data-key="${esc(col.key)}"${col.title ? ` title="${esc(col.title)}"` : ""}>${esc(col.label)}</th>`;
    });
    html += "</tr></thead><tbody>";

    if (displayRows.length === 0) {
      html += `<tr><td colspan="${columns.length}" style="text-align:center;padding:20px;color:var(--ink-muted)">Sin datos para los filtros seleccionados</td></tr>`;
    } else {
      displayRows.forEach((r, idx) => {
        const trCls = [];
        if (opts.onRowClick) trCls.push("clickable");
        if (opts.highlightLS && r.esLS) trCls.push("row-ls");
        if (opts.selectedRowId != null && opts.rowIdKey && String(r[opts.rowIdKey]) === String(opts.selectedRowId)) trCls.push("row-selected");
        const rowIdAttr = opts.rowIdKey ? ` data-rowid="${esc(r[opts.rowIdKey])}"` : "";
        html += `<tr class="${trCls.join(" ")}"${rowIdAttr}>`;
        columns.forEach((col) => {
          const tdCls = col.num ? ' class="num"' : "";
          const content = col.render ? col.render(r, idx) : esc(r[col.key] ?? "—");
          html += `<td${tdCls}>${content}</td>`;
        });
        html += "</tr>";
      });
    }

    const fRows = opts.footerRows || (opts.footerRow ? [opts.footerRow] : []);
    if (fRows.length > 0) {
      html += "</tbody><tfoot>";
      fRows.forEach((fRow) => {
        const trCls = fRow._cls ? ` class="${esc(fRow._cls)}"` : "";
        html += `<tr${trCls}>`;
        columns.forEach((col) => {
          const tdCls = col.num ? ' class="num"' : "";
          const content = fRow[col.key] != null ? fRow[col.key] : "";
          html += `<td${tdCls}>${content}</td>`;
        });
        html += "</tr>";
      });
      html += "</tfoot></table>";
    } else {
      html += "</tbody></table>";
    }

    container.innerHTML = html;

    container.querySelectorAll("thead th.sortable").forEach((th) => {
      th.addEventListener("click", () => {
        if (th.dataset.justResized === "1") return;
        const k = th.dataset.key;
        if (sortState.key === k) sortState.dir = sortState.dir === "desc" ? "asc" : "desc";
        else {
          sortState.key = k;
          const colDef = columns.find((c) => c.key === k);
          sortState.dir = colDef && colDef.num === false ? "asc" : "desc";
        }
        onSort(sortState);
      });
    });

    if (opts.onRowClick) {
      container.querySelectorAll("tbody tr.clickable").forEach((tr) => {
        tr.addEventListener("click", () => {
          opts.onRowClick(tr.dataset.rowid);
        });
      });
    }
    return sorted;
  }

  function attachResizableColumns(container, savedWidths) {
    if (!container) return;
    container.classList.add("table-resizable");
    const table = container.querySelector("table.data-table");
    if (!table) return;
    const ths = Array.from(table.querySelectorAll("thead th"));
    if (ths.length === 0) return;

    const getKey = (th, i) => th.dataset.key || String(i);

    const applySaved = () => {
      if (!savedWidths || Object.keys(savedWidths).length === 0) return;
      let total = 0;
      let applied = false;
      ths.forEach((th, i) => {
        const w = savedWidths[getKey(th, i)];
        if (w && Number.isFinite(w) && w >= 40) {
          th.style.width = w + "px";
          th.style.minWidth = w + "px";
          total += w;
          applied = true;
        }
      });
      if (applied) {
        table.classList.add("is-resized");
        if (total > 0) table.style.width = total + "px";
      }
    };
    applySaved();

    ths.forEach((th, i) => {
      const handle = document.createElement("span");
      handle.className = "col-resizer";
      handle.title = "Arrastrá para ajustar ancho · Doble click para restablecer";
      handle.addEventListener("click", (e) => e.stopPropagation());
      handle.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (savedWidths) Object.keys(savedWidths).forEach((k) => delete savedWidths[k]);
        table.classList.remove("is-resized");
        table.style.width = "";
        ths.forEach((t) => {
          t.style.width = "";
          t.style.minWidth = "";
        });
      });
      handle.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const rectWidths = ths.map((t) => Math.max(48, Math.round(t.getBoundingClientRect().width)));
        let totalW = rectWidths.reduce((s, w) => s + w, 0);
        ths.forEach((t, idx) => {
          t.style.width = rectWidths[idx] + "px";
          t.style.minWidth = rectWidths[idx] + "px";
          if (savedWidths) savedWidths[getKey(t, idx)] = rectWidths[idx];
        });
        table.classList.add("is-resized");
        table.style.width = totalW + "px";

        const startX = e.clientX;
        const startW = rectWidths[i];
        let moved = false;
        handle.classList.add("is-dragging");
        document.body.style.cursor = "col-resize";

        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          if (Math.abs(dx) > 2) moved = true;
          const nextW = Math.max(52, startW + dx);
          const nextTotal = totalW - rectWidths[i] + nextW;
          th.style.width = nextW + "px";
          th.style.minWidth = nextW + "px";
          table.style.width = nextTotal + "px";
          rectWidths[i] = nextW;
          totalW = nextTotal;
          if (savedWidths) savedWidths[getKey(th, i)] = nextW;
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          handle.classList.remove("is-dragging");
          document.body.style.cursor = "";
          if (moved) {
            th.dataset.justResized = "1";
            setTimeout(() => { delete th.dataset.justResized; }, 50);
          }
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
      th.appendChild(handle);
    });
  }

  function exportToCSV(filename, headers, rows) {
    const csvEscape = (v) => {
      const s = v == null ? "" : String(v);
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.map(csvEscape).join(",")];
    rows.forEach((r) => lines.push(r.map(csvEscape).join(",")));
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Ramo computation helpers (Anexos 12-A / 13-A / 14-A Seguros Directos)
  // rq row: [p, c, r, emit_sd, ced_sd, prim_dev_sd, sin_dev_sd, g_prod_sd, g_expl_sd, g_reas_sd, g_tot_sd]
  function computeRamoAggregates(pIdx, allowedCiaSet) {
    const hasYoY = canCompareYoY(pIdx, state.base);
    const { base } = resolveBaseAndMeses(pIdx, state.base);

    function sumByRamoAt(qIdx) {
      const res = RAMOS.map(() => [0, 0, 0, 0, 0, 0, 0, 0]);
      RAMOS.forEach((rm, rIdx) => {
        const list = rqByPR.get(qIdx + "|" + rIdx);
        if (!list) return;
        list.forEach((row) => {
          if (allowedCiaSet && !allowedCiaSet.has(row[1])) return;
          const acc = res[rIdx];
          for (let j = 0; j < 8; j++) acc[j] += row[3 + j];
        });
      });
      return res;
    }

    // Precompute sums per period needed
    const cache = new Map();
    const getAt = (q) => {
      if (!cache.has(q)) cache.set(q, sumByRamoAt(q));
      return cache.get(q);
    };

    const out = [];
    RAMOS.forEach((rm, rIdx) => {
      const vec = computeFlowVector(pIdx, base, state.moneda, (q) => getAt(q)[rIdx], 8);
      const vecPrev = hasYoY ? computeFlowVector(pIdx - 4, base, state.moneda, (q) => getAt(q)[rIdx], 8) : null;
      const [emit_sd, ced_sd, prim_dev_sd, sin_dev_sd, g_prod_sd, g_expl_sd, g_reas_sd, g_tot_sd] = vec;
      if (Math.abs(emit_sd) < 0.01 && Math.abs(prim_dev_sd) < 0.01 && Math.abs(g_tot_sd) < 0.01) return;
      const emitPrev = vecPrev ? vecPrev[0] : null;
      const sin_pct = prim_dev_sd > 0 ? (sin_dev_sd / prim_dev_sd) * 100 : null;
      const gprod_pct = prim_dev_sd > 0 ? (g_prod_sd / prim_dev_sd) * 100 : null;
      const gexpl_pct = prim_dev_sd > 0 ? (g_expl_sd / prim_dev_sd) * 100 : null;
      const gto_pct = prim_dev_sd > 0 ? (g_tot_sd / prim_dev_sd) * 100 : null;
      const comb_pct = prim_dev_sd > 0 ? ((sin_dev_sd + g_tot_sd) / prim_dev_sd) * 100 : null;
      out.push({
        rIdx,
        cod: rm.cod,
        desc: rm.desc,
        gran: rm.gran,
        emit_sd,
        ced_sd,
        prim_dev_sd,
        sin_dev_sd,
        g_prod_sd,
        g_expl_sd,
        g_reas_sd,
        g_tot_sd,
        yoy: emitPrev != null ? calcYoY(emit_sd, emitPrev) : null,
        sin_pct,
        gprod_pct,
        gexpl_pct,
        gto_pct,
        comb_pct,
      });
    });
    return out;
  }

  function computeRamoLeaders(pIdx, rIdx, allowedCiaSet) {
    const hasYoY = canCompareYoY(pIdx, state.base);
    const { base } = resolveBaseAndMeses(pIdx, state.base);

    const cache = new Map();
    const getCiaMap = (q) => {
      if (!cache.has(q)) {
        const m = new Map();
        const list = rqByPR.get(q + "|" + rIdx) || [];
        list.forEach((row) => m.set(row[1], row.slice(3, 11)));
        cache.set(q, m);
      }
      return cache.get(q);
    };

    const curMap = getCiaMap(pIdx);
    const out = [];
    curMap.forEach((_, cIdx) => {
      if (allowedCiaSet && !allowedCiaSet.has(cIdx)) return;
      const c = COMPANIAS[cIdx];
      const vec = computeFlowVector(pIdx, base, state.moneda, (q) => getCiaMap(q).get(cIdx) || null, 8);
      const vecPrev = hasYoY ? computeFlowVector(pIdx - 4, base, state.moneda, (q) => getCiaMap(q).get(cIdx) || null, 8) : null;
      const [emit_sd, ced_sd, prim_dev_sd, sin_dev_sd, g_prod_sd, g_expl_sd, , g_tot_sd] = vec;
      if (Math.abs(emit_sd) < 0.01 && Math.abs(prim_dev_sd) < 0.01) return;
      out.push({
        cIdx,
        cod: c.cod,
        nombre: c.nombre,
        tipo: c.tipo,
        esLS: c.ls,
        emit_sd,
        prim_dev_sd,
        sin_dev_sd,
        g_prod_sd,
        g_expl_sd,
        g_tot_sd,
        yoy: vecPrev ? calcYoY(emit_sd, vecPrev[0]) : null,
        sin_pct: prim_dev_sd > 0 ? (sin_dev_sd / prim_dev_sd) * 100 : null,
        gprod_pct: prim_dev_sd > 0 ? (g_prod_sd / prim_dev_sd) * 100 : null,
        gexpl_pct: prim_dev_sd > 0 ? (g_expl_sd / prim_dev_sd) * 100 : null,
        gto_pct: prim_dev_sd > 0 ? (g_tot_sd / prim_dev_sd) * 100 : null,
        comb_pct: prim_dev_sd > 0 ? ((sin_dev_sd + g_tot_sd) / prim_dev_sd) * 100 : null,
      });
    });
    out.sort((a, b) => b.emit_sd - a.emit_sd);
    return out;
  }

  // SRQ computation for 54 SSN Subramos (Anexos 12-A / 13-A / 14-A Seguros Directos)
  // srq row: [p, c, sr, emit_sd, prim_dev_sd, sin_dev_sd, g_prod_sd, g_expl_sd, g_tot_sd]
  function computeSubramoAggregates(pIdx, allowedCiaSet, filterCodRamo = null) {
    const hasYoY = canCompareYoY(pIdx, state.base);
    const { base } = resolveBaseAndMeses(pIdx, state.base);
    const targetList = filterCodRamo ? (subramosByRamo.get(filterCodRamo) || []) : SUBRAMOS;
    if (targetList.length === 0) return [];

    function sumBySubAt(qIdx) {
      const res = targetList.map(() => [0, 0, 0, 0, 0, 0]);
      targetList.forEach((sr, i) => {
        const list = srqByPS.get(qIdx + "|" + sr.idx);
        if (!list) return;
        list.forEach((row) => {
          if (allowedCiaSet && !allowedCiaSet.has(row[1])) return;
          const acc = res[i];
          for (let j = 0; j < 6; j++) acc[j] += row[3 + j];
        });
      });
      return res;
    }

    const cache = new Map();
    const getAt = (q) => {
      if (!cache.has(q)) cache.set(q, sumBySubAt(q));
      return cache.get(q);
    };

    const out = [];
    targetList.forEach((sr, i) => {
      const vec = computeFlowVector(pIdx, base, state.moneda, (q) => getAt(q)[i], 6);
      const vecPrev = hasYoY ? computeFlowVector(pIdx - 4, base, state.moneda, (q) => getAt(q)[i], 6) : null;
      const [emit_sd, prim_dev_sd, sin_dev_sd, g_prod_sd, g_expl_sd, g_tot_sd] = vec;
      if (Math.abs(emit_sd) < 0.01 && Math.abs(prim_dev_sd) < 0.01 && Math.abs(g_tot_sd) < 0.01) return;
      const emitPrev = vecPrev ? vecPrev[0] : null;
      out.push({
        srIdx: sr.idx,
        cod: sr.cod,
        desc: sr.desc,
        cod_ramo: sr.cod_ramo,
        rIdx: sr.r_idx,
        desc_ramo: sr.desc_ramo,
        gran: sr.gran,
        emit_sd,
        prim_dev_sd,
        sin_dev_sd,
        g_prod_sd,
        g_expl_sd,
        g_tot_sd,
        yoy: emitPrev != null ? calcYoY(emit_sd, emitPrev) : null,
        sin_pct: prim_dev_sd > 0 ? (sin_dev_sd / prim_dev_sd) * 100 : null,
        gprod_pct: prim_dev_sd > 0 ? (g_prod_sd / prim_dev_sd) * 100 : null,
        gexpl_pct: prim_dev_sd > 0 ? (g_expl_sd / prim_dev_sd) * 100 : null,
        gto_pct: prim_dev_sd > 0 ? (g_tot_sd / prim_dev_sd) * 100 : null,
        comb_pct: prim_dev_sd > 0 ? ((sin_dev_sd + g_tot_sd) / prim_dev_sd) * 100 : null,
      });
    });
    return out;
  }

  function computeSubramoLeaders(pIdx, srIdx, allowedCiaSet) {
    const hasYoY = canCompareYoY(pIdx, state.base);
    const { base } = resolveBaseAndMeses(pIdx, state.base);

    const cache = new Map();
    const getCiaMap = (q) => {
      if (!cache.has(q)) {
        const m = new Map();
        const list = srqByPS.get(q + "|" + srIdx) || [];
        list.forEach((row) => m.set(row[1], row.slice(3, 9)));
        cache.set(q, m);
      }
      return cache.get(q);
    };

    const curMap = getCiaMap(pIdx);
    const out = [];
    curMap.forEach((_, cIdx) => {
      if (allowedCiaSet && !allowedCiaSet.has(cIdx)) return;
      const c = COMPANIAS[cIdx];
      const vec = computeFlowVector(pIdx, base, state.moneda, (q) => getCiaMap(q).get(cIdx) || null, 6);
      const vecPrev = hasYoY ? computeFlowVector(pIdx - 4, base, state.moneda, (q) => getCiaMap(q).get(cIdx) || null, 6) : null;
      const [emit_sd, prim_dev_sd, sin_dev_sd, g_prod_sd, g_expl_sd, g_tot_sd] = vec;
      if (Math.abs(emit_sd) < 0.01 && Math.abs(prim_dev_sd) < 0.01) return;
      out.push({
        cIdx,
        cod: c.cod,
        nombre: c.nombre,
        tipo: c.tipo,
        esLS: c.ls,
        emit_sd,
        prim_dev_sd,
        sin_dev_sd,
        g_prod_sd,
        g_expl_sd,
        g_tot_sd,
        yoy: vecPrev ? calcYoY(emit_sd, vecPrev[0]) : null,
        sin_pct: prim_dev_sd > 0 ? (sin_dev_sd / prim_dev_sd) * 100 : null,
        gprod_pct: prim_dev_sd > 0 ? (g_prod_sd / prim_dev_sd) * 100 : null,
        gexpl_pct: prim_dev_sd > 0 ? (g_expl_sd / prim_dev_sd) * 100 : null,
        gto_pct: prim_dev_sd > 0 ? (g_tot_sd / prim_dev_sd) * 100 : null,
        comb_pct: prim_dev_sd > 0 ? ((sin_dev_sd + g_tot_sd) / prim_dev_sd) * 100 : null,
      });
    });
    out.sort((a, b) => b.emit_sd - a.emit_sd);
    return out;
  }

  // PRQ computation for Looker Studio Personas & Retiro segments
  function computePrSegmentRows(pIdx, segId) {
    const seg = SUBRAMOS_PR.find((s) => s.id === segId);
    if (!seg) return { rows: [], totCur: 0, totPrev: null };
    const sIdx = seg.idx;
    const hasYoY = canCompareYoY(pIdx, state.base);
    const { base } = resolveBaseAndMeses(pIdx, state.base);

    const cache = new Map();
    const getCiaMap = (q) => {
      if (!cache.has(q)) {
        const m = new Map();
        const list = prqByPS.get(q + "|" + sIdx) || [];
        list.forEach((row) => m.set(row[1], row.slice(3, 7)));
        cache.set(q, m);
      }
      return cache.get(q);
    };

    const allCias = new Set();
    getCiaMap(pIdx).forEach((_, cIdx) => allCias.add(cIdx));
    if (hasYoY) getCiaMap(pIdx - 4).forEach((_, cIdx) => allCias.add(cIdx));

    const rows = [];
    let totCur = 0;
    let totPrev = 0;
    let totPrimDev = 0;
    let totSinDev = 0;
    let totGto = 0;
    allCias.forEach((cIdx) => {
      const c = COMPANIAS[cIdx];
      const vec = computeFlowVector(pIdx, base, state.moneda, (q) => getCiaMap(q).get(cIdx) || null, 4);
      const vecPrev = hasYoY ? computeFlowVector(pIdx - 4, base, state.moneda, (q) => getCiaMap(q).get(cIdx) || null, 4) : null;
      const emit_sd = vec ? vec[0] : 0;
      const prim_dev_sd = vec ? vec[1] : 0;
      const sin_dev_sd = vec ? vec[2] : 0;
      const g_tot_sd = vec ? vec[3] : 0;
      const emit_prev = hasYoY ? (vecPrev ? vecPrev[0] : 0) : null;
      totCur += emit_sd;
      totPrimDev += prim_dev_sd;
      totSinDev += sin_dev_sd;
      totGto += g_tot_sd;
      if (hasYoY) totPrev += emit_prev;
      if (Math.abs(emit_sd) < 0.001 && (!hasYoY || Math.abs(emit_prev) < 0.001)) return;
      rows.push({
        cIdx,
        cod: c.cod,
        nombre: c.nombre,
        esLS: c.ls,
        emit_sd,
        emit_prev,
        prim_dev_sd,
        yoy: hasYoY ? calcYoY(emit_sd, emit_prev) : null,
        sin_pct: prim_dev_sd > 0 ? (sin_dev_sd / prim_dev_sd) * 100 : null,
        gto_pct: prim_dev_sd > 0 ? (g_tot_sd / prim_dev_sd) * 100 : null,
        comb_pct: prim_dev_sd > 0 ? ((sin_dev_sd + g_tot_sd) / prim_dev_sd) * 100 : null,
      });
    });
    rows.sort((a, b) => b.emit_sd - a.emit_sd);
    rows.forEach((r, idx) => {
      r.rank = idx + 1;
      r.share = totCur > 0 ? (r.emit_sd / totCur) * 100 : null;
    });
    return {
      rows,
      totCur,
      totPrev: hasYoY ? totPrev : null,
      totSinPct: totPrimDev > 0 ? (totSinDev / totPrimDev) * 100 : null,
      totGtoPct: totPrimDev > 0 ? (totGto / totPrimDev) * 100 : null,
      totCombPct: totPrimDev > 0 ? ((totSinDev + totGto) / totPrimDev) * 100 : null,
    };
  }

  // Initialize Filter Dropdowns
  function initSelectors() {
    const hdrSub = document.getElementById("hdrSubtitle");
    if (hdrSub) {
      hdrSub.textContent = `Balances SSN · SINENSUP (${nP} trimestres · Edición ejecutiva 100% offline)`;
    }
    const fMonConst = document.getElementById("fMonedaConstOpt");
    if (fMonConst && PERIODOS[nP - 1]) {
      fMonConst.textContent = `Moneda constante ${PERIODOS[nP - 1].label} (IPC)`;
    }

    const fPer = document.getElementById("fPeriodo");
    PERIODOS.slice().reverse().forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.idx;
      opt.textContent = `${p.id} · ${p.label} (${p.fecha})`;
      fPer.appendChild(opt);
    });
    fPer.value = state.pIdx;

    const fTipo = document.getElementById("fTipo");
    META.tipos.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      fTipo.appendChild(opt);
    });

    const fConst = document.getElementById("fConst");
    META.constituciones.forEach((ct) => {
      const opt = document.createElement("option");
      opt.value = ct;
      opt.textContent = ct;
      fConst.appendChild(opt);
    });

    const fGrupo = document.getElementById("fGrupo");
    META.grupos.forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = g;
      fGrupo.appendChild(opt);
    });

    // Populate Ficha entity/peer/criteria selectors respecting active global filters
    syncFichaSelectors(state.pIdx, getFichaScope(state.pIdx), false);
  }

  function updateHeaderAndAlerts() {
    const p = PERIODOS[state.pIdx];
    const baseLabels = { acum: `Acumulado (${p.meses}m)`, estanco: "Trimestre Estanco (3m)", ltm: "Últimos 12 Meses (LTM)" };
    const monLabel = state.moneda === "const" ? `IPC ${PERIODOS[nP - 1].label}` : "Moneda cierre";
    const consolLabel = state.consol === "madre" ? "Empresa Madre" : (state.consol === "vpp" ? "Consolidado 100%" : "Suma simple");
    const isDedicatedTab = state.activeTab === "personas" || state.activeTab === "retiro";
    const isGrupoL2 = state.activeTab === "grupol2";
    const isBalanceTab = state.activeTab === "balance";
    const ramoLabel = isDedicatedTab
      ? ` · Sección ${state.activeTab === "personas" ? "Personas" : "Retiro"}`
      : (isGrupoL2 ? " · Sección Grupo L2" : (isBalanceTab ? " · Balance Contable SSN" : (state.granRamo ? ` · Ramo: ${GRAN_LABELS[state.granRamo]}` : "")));
    document.getElementById("hdrPeriodoPill").textContent = `Cierre: ${p.label} (${p.fecha})`;
    document.getElementById("hdrBasePill").textContent = (isDedicatedTab || isBalanceTab)
      ? `${baseLabels[state.base]} · ${monLabel}${ramoLabel}`
      : `${baseLabels[state.base]} · ${monLabel} · ${consolLabel}${ramoLabel}`;

    const res = resolveBaseAndMeses(state.pIdx, state.base);
    const alertEl = document.getElementById("globalAlert");
    const msgs = [];
    if (res.fallbackMsg) msgs.push(res.fallbackMsg);
    if (!isDedicatedTab && !isGrupoL2 && !isBalanceTab && isGranRamoTechOnly()) {
      msgs.push(
        `Filtro activo por Ramo (${GRAN_LABELS[state.granRamo]}): incluye la cartera del ramo tanto de aseguradoras exclusivas como de compañías mixtas (Estructura Técnica 4.01/5.01). Los rubros societarios de Balance General y Estructura Financiera se muestran como "—" porque no se abren por ramo en SINENSUP.`
      );
    } else if (!isDedicatedTab && !isGrupoL2 && !isBalanceTab && state.granRamo === "Retiro") {
      msgs.push(
        "Filtro activo por Ramo (Retiro): todas las aseguradoras que operan Retiro son exclusivas (monorama), por lo que se conservan el Balance General, la Estructura Financiera y los ratios específicos de Retiro."
      );
    }
    if (msgs.length > 0) {
      alertEl.textContent = msgs.join(" ");
      alertEl.className = "alert-banner visible" + (!res.fallbackMsg && !isDedicatedTab && !isGrupoL2 && !isBalanceTab && state.granRamo ? " info" : "");
    } else {
      alertEl.className = "alert-banner";
    }

    if (isDedicatedTab || isGrupoL2 || isBalanceTab) return;

    const allMktRows = getCompanyRowsForPeriod(state.pIdx, false);
    const filtRows = getCompanyRowsForPeriod(state.pIdx, true);
    const totMkt = allMktRows.reduce((s, r) => s + r.emit_sd, 0);
    const totFilt = filtRows.reduce((s, r) => s + r.emit_sd, 0);
    if (state.granRamo) {
      const allRamoRows = getCompanyRowsForPeriod(state.pIdx, false, { onlyGranRamo: true });
      const totRamo = allRamoRows.reduce((s, r) => s + r.emit_sd, 0);
      const pctRamo = totRamo > 0 ? (totFilt / totRamo) * 100 : 0;
      const pctMkt = totMkt > 0 ? (totFilt / totMkt) * 100 : 0;
      document.getElementById("liveCountPill").textContent =
        `Ramo ${GRAN_LABELS[state.granRamo]} · ${filtRows.length} de ${allRamoRows.length} cías · ${fmtPct(pctRamo, 1)} del ramo (${fmtPct(pctMkt, 1)} del mkt)`;
    } else {
      const pct = totMkt > 0 ? (totFilt / totMkt) * 100 : 0;
      document.getElementById("liveCountPill").textContent =
        `Mostrando ${filtRows.length} de ${allMktRows.length} cías · ${fmtPct(pct, 1)} del mercado`;
    }
  }

  // ==================== TAB 1: PANORAMA DEL MERCADO ====================
  function renderPanorama() {
    const pIdx = state.pIdx;
    const hasYoY = canCompareYoY(pIdx, state.base);
    const { meses } = resolveBaseAndMeses(pIdx, state.base);
    const panScope = (state.grupo && state.grupo !== "Independientes") ? "group" : "market";
    const rows = getCompanyRowsForPeriod(pIdx, true);
    const agg = aggregateMetrics(rows, meses, pIdx, state.base, state.moneda, { scope: panScope });

    const prevRows = hasYoY ? getCompanyRowsForPeriod(pIdx - 4, true) : [];
    const aggPrev = hasYoY ? aggregateMetrics(prevRows, meses, pIdx - 4, state.base, state.moneda, { scope: panScope }) : null;

    const emitYoY = aggPrev ? calcYoY(agg.emit_sd, aggPrev.emit_sd) : null;
    const invYoY = aggPrev ? calcYoY(agg.inv, aggPrev.inv) : null;
    const pnYoY = aggPrev ? calcYoY(agg.pn, aggPrev.pn) : null;

    const allFullMkt = getCompanyRowsForPeriod(pIdx, false, { ignoreGranRamo: true });
    const totFullMktEmit = allFullMkt.reduce((s, r) => s + r.emit_sd, 0);
    const granTechOnly = isGranRamoTechOnly();
    const isRetiroOnly = !granTechOnly && (state.tipo === "Retiro" || state.granRamo === "Retiro" || (rows.length > 0 && rows.every((r) => r.tipo === "Retiro")));

    let kpis;
    if (granTechOnly) {
      const mktPeso = totFullMktEmit > 0 ? (agg.emit_sd / totFullMktEmit) * 100 : 0;
      const mixCnt = rows.filter((r) => r.tipo === "Patrimoniales y Mixtas").length;
      const exclCnt = rows.length - mixCnt;
      kpis = [
        {
          label: `Primas Emitidas (${GRAN_LABELS[state.granRamo]})`,
          val: fmtMoney(agg.emit_sd),
          sub: `YoY: <span class="${pctClass(emitYoY)}">${fmtSignedPct(emitYoY)}</span> · Dev: ${fmtMoney(agg.prim_dev)}`,
          accent: "",
        },
        {
          label: "Siniestros Devengados",
          val: fmtMoney(agg.sin_dev),
          sub: `Sin. s/ Dev.: <strong>${fmtPct(agg.sin_pct)}</strong>`,
          accent: "accent-blue",
        },
        {
          label: "Gastos Prod. y Expl.",
          val: fmtMoney(agg.g_tot),
          sub: `Prod: <strong>${fmtPct(agg.gprod_pct, 1)}</strong> · Expl: <strong>${fmtPct(agg.gexpl_pct, 1)}</strong>`,
          accent: "accent-ink",
        },
        {
          label: "Resultado Técnico",
          val: fmtMoney(agg.res_tec),
          sub: `<span class="${pctClass(agg.rt_pct)}">${fmtPct(agg.rt_pct)} s/ Dev.</span>`,
          accent: "accent-green",
        },
        {
          label: "Ratio Combinado",
          val: fmtPct(agg.comb_pct),
          sub: `Sin: <strong>${fmtPct(agg.sin_pct, 1)}</strong> · Prod: <strong>${fmtPct(agg.gprod_pct, 1)}</strong> · Expl: <strong>${fmtPct(agg.gexpl_pct, 1)}</strong>`,
          accent: "accent-orange",
        },
        {
          label: "Peso s/ Mercado Total",
          val: fmtPct(mktPeso, 1),
          sub: `${rows.length} cías (${mixCnt} Mixtas · ${exclCnt} Excl.)`,
          accent: "accent-blue",
        },
      ];
    } else {
      kpis = [
        {
          label: "Primas Emitidas (SD)",
          val: fmtMoney(agg.emit_sd),
          sub: `YoY: <span class="${pctClass(emitYoY)}">${fmtSignedPct(emitYoY)}</span> · Dev: ${fmtMoney(agg.prim_dev)}`,
          accent: "",
        },
        {
          label: "Resultado Técnico",
          val: fmtMoney(agg.res_tec),
          sub: isRetiroOnly
            ? `<span class="${pctClass(agg.rt_pas_tec_pct)}">${fmtPct(agg.rt_pas_tec_pct)} s/ Pas. Téc.</span>`
            : `<span class="${pctClass(agg.rt_pct)}">${fmtPct(agg.rt_pct)} s/ Dev.</span>`,
          accent: "accent-ink",
        },
        {
          label: "Resultado Financiero",
          val: fmtMoney(agg.res_fin),
          sub: `${isRetiroOnly
            ? `<span class="${pctClass(agg.ret_inv_pct)}">${fmtPct(agg.ret_inv_pct)} s/ Inv.</span>`
            : `<span class="${pctClass(agg.rf_pct)}">${fmtPct(agg.rf_pct)} s/ Dev.</span>`} · RECPAM: ${fmtMoney(agg.recpam)}`,
          accent: "accent-blue",
        },
        {
          label: (panScope === "group" && state.consol === "madre" && (Math.abs(agg.part_terc_re || 0) > 0.1 || Math.abs(agg.part_terc_pn || 0) > 0.1))
            ? "Resultado del Ejercicio (Madre)"
            : "Resultado del Ejercicio",
          val: fmtMoney(agg.res_ej),
          sub: `ROE período: <span class="${pctClass(agg.roe_pct)}">${fmtPct(agg.roe_pct)}</span> · PN YoY: ${fmtSignedPct(pnYoY)}`,
          accent: "accent-green",
        },
        {
          label: "Inversiones Totales",
          val: fmtMoney(agg.inv),
          sub: `Cobertura: <strong>${fmtPct(agg.cobertura_pct)}</strong> · YoY: <span class="${pctClass(invYoY)}">${fmtSignedPct(invYoY)}</span>`,
          accent: "accent-blue",
        },
        isRetiroOnly ? {
          label: "Gastos Prod. y Expl.",
          val: fmtMoney(agg.g_tot),
          sub: `Prod s/Emit: <strong>${fmtPct(agg.gprod_emit_pct, 2)}</strong> · Expl s/PT: <strong>${fmtPct(agg.gexpl_pt_pct, 2)}</strong>`,
          accent: "accent-orange",
        } : {
          label: "Ratio Combinado",
          val: fmtPct(agg.comb_pct),
          sub: `Sin: <strong>${fmtPct(agg.sin_pct, 1)}</strong> · Prod: <strong>${fmtPct(agg.gprod_pct, 1)}</strong> · Expl: <strong>${fmtPct(agg.gexpl_pct, 1)}</strong>`,
          accent: "accent-orange",
        },
      ];
    }

    document.getElementById("panKpis").innerHTML = kpis.map((k) => `
      <div class="kpi-card ${k.accent}">
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-value num">${esc(k.val)}</div>
        <div class="kpi-sub">${k.sub}</div>
      </div>
    `).join("");
    attachExpandButtons(document.getElementById("panKpis"));

    // Chart 1: Composición por Tipo de Compañía (en Billones $ B y % del total)
    const divB = 1e9;
    const byTipo = {};
    META.tipos.forEach((t) => { byTipo[t] = 0; });
    rows.forEach((r) => { byTipo[r.tipo] = (byTipo[r.tipo] || 0) + r.emit_sd; });
    const tipoEntries = state.granRamo
      ? Object.entries(byTipo).filter(([, v]) => Math.abs(v) > 0.01)
      : Object.entries(byTipo);
    const tipoColors = { "Patrimoniales y Mixtas": BRAND.red, ART: BRAND.blue, Personas: BRAND.green, Retiro: BRAND.yellow };
    const tipoDataB = tipoEntries.map((x) => x[1] / divB);
    const tipoTotB = tipoDataB.reduce((s, v) => s + v, 0);
    const tipoMaxB = tipoDataB.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    const tipoDecB = tipoMaxB > 0 && tipoMaxB < 0.05 ? 3 : 2;
    const fmtBVal = (vB, dec) => fmtScaledVal(vB, dec) + " B";

    const panTipoPlugin = {
      id: "panTipoCenterAndPct",
      afterDatasetsDraw(chart) {
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || meta.data.length === 0) return;
        const { ctx } = chart;
        const firstArc = meta.data[0];
        const cx = firstArc.x;
        const cy = firstArc.y;

        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = BRAND.muted;
        ctx.font = "700 10px 'Sora', sans-serif";
        ctx.fillText("TOTAL", cx, cy - 9);
        ctx.fillStyle = BRAND.ink;
        ctx.font = "700 14px 'Sora', sans-serif";
        ctx.fillText("$ " + fmtBVal(tipoTotB, tipoDecB), cx, cy + 8);

        meta.data.forEach((arc, i) => {
          if (chart.getDataVisibility && !chart.getDataVisibility(i)) return;
          const vB = tipoDataB[i] || 0;
          const pct = tipoTotB > 0 ? (vB / tipoTotB) * 100 : 0;
          if (pct < 8) return;
          const midAngle = (arc.startAngle + arc.endAngle) / 2;
          const midR = (arc.innerRadius + arc.outerRadius) / 2;
          const px = arc.x + Math.cos(midAngle) * midR;
          const py = arc.y + Math.sin(midAngle) * midR;
          ctx.fillStyle = "#ffffff";
          ctx.font = "700 10.5px 'Sora', sans-serif";
          ctx.fillText(fmtPct(pct, 1), px, py);
        });
        ctx.restore();
      },
    };

    destroyChart("chPanTipo");
    charts.chPanTipo = new Chart(document.getElementById("chPanTipo"), {
      type: "doughnut",
      data: {
        labels: tipoEntries.map((x) => x[0]),
        datasets: [{
          data: tipoDataB,
          backgroundColor: tipoEntries.map((x) => tipoColors[x[0]] || BRAND.ink),
          borderWidth: 2,
          borderColor: "#ffffff",
        }],
      },
      plugins: [panTipoPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "56%",
        plugins: {
          legend: {
            position: "right",
            labels: {
              boxWidth: 12,
              padding: 12,
              font: { size: 11, weight: "600" },
              generateLabels(chart) {
                const baseGen = Chart.overrides.doughnut.plugins.legend.labels.generateLabels;
                return baseGen(chart).map((item) => {
                  const vB = tipoDataB[item.index] || 0;
                  const pct = tipoTotB > 0 ? (vB / tipoTotB) * 100 : 0;
                  item.text = `${chart.data.labels[item.index]}: $ ${fmtBVal(vB, tipoDecB)} (${fmtPct(pct, 1)})`;
                  return item;
                });
              },
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const vB = ctx.raw || 0;
                const pct = tipoTotB > 0 ? (vB / tipoTotB) * 100 : 0;
                return ` ${ctx.label}: $ ${fmtBVal(vB, tipoDecB)} (${fmtPct(pct, 1)} del total)`;
              },
            },
          },
        },
      },
    });

    // Chart 2: Composición por Gran Ramo (en Billones $ B y % del total)
    const allowedSet = new Set(rows.map((r) => r.cIdx));
    const ramoAggs = computeRamoAggregates(pIdx, allowedSet);
    const granTitleEl = document.getElementById("panGranTitle");
    const granSubEl = document.getElementById("panGranSub");
    let ch2Labels;
    let ch2DataB;
    let ch2Colors;
    let ch2TotB;
    if (state.granRamo) {
      granTitleEl.textContent = `Desglose por Ramo: ${GRAN_LABELS[state.granRamo]}`;
      granSubEl.textContent = "Ramos específicos (Seguros Directos) en Billones ($ B) y % del ramo";
      const allSub = ramoAggs.filter((rm) => rm.gran === state.granRamo).sort((a, b) => b.emit_sd - a.emit_sd);
      ch2TotB = allSub.reduce((s, rm) => s + rm.emit_sd, 0) / divB;
      const subRamos = allSub.slice(0, 8);
      ch2Labels = subRamos.map((x) => x.desc);
      ch2DataB = subRamos.map((x) => x.emit_sd / divB);
      ch2Colors = subRamos.map((_, i) => PALETTE[i % PALETTE.length]);
    } else {
      granTitleEl.textContent = "Composición por Gran Ramo";
      granSubEl.textContent = "Primas Emitidas SD en Billones ($ B) y % del total";
      const byGran = { Patrimoniales: 0, ART: 0, Personas: 0, Retiro: 0 };
      ramoAggs.forEach((rm) => {
        if (rm.gran in byGran) byGran[rm.gran] += rm.emit_sd;
      });
      ch2Labels = Object.keys(byGran);
      ch2DataB = Object.values(byGran).map((v) => v / divB);
      ch2TotB = ch2DataB.reduce((s, v) => s + v, 0);
      ch2Colors = [BRAND.red, BRAND.blue, BRAND.green, BRAND.orange];
    }
    const ch2MaxB = ch2DataB.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    const ch2DecB = ch2MaxB > 0 && ch2MaxB < 0.05 ? 3 : 2;

    const granRamoLabelsPlugin = {
      id: "panGranRamoBarLabels",
      afterDatasetsDraw(chart) {
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data) return;
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        ctx.save();
        ctx.font = "600 11px 'Sora', sans-serif";
        ctx.fillStyle = BRAND.ink;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        meta.data.forEach((bar, i) => {
          const vB = ch2DataB[i] || 0;
          const pct = ch2TotB > 0 ? (vB / ch2TotB) * 100 : 0;
          const lbl = `$ ${fmtBVal(vB, ch2DecB)} (${fmtPct(pct, 1)})`;
          ctx.fillText(lbl, bar.x + 8, bar.y);
        });
        ctx.restore();
      },
    };

    const div = unitDivisor();
    destroyChart("chPanGranRamo");
    charts.chPanGranRamo = new Chart(document.getElementById("chPanGranRamo"), {
      type: "bar",
      data: {
        labels: ch2Labels,
        datasets: [{
          label: "Primas Emitidas (B)",
          data: ch2DataB,
          backgroundColor: ch2Colors,
          borderRadius: 6,
          barPercentage: 0.64,
        }],
      },
      plugins: [granRamoLabelsPlugin],
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 128 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const vB = ctx.parsed.x || 0;
                const pct = ch2TotB > 0 ? (vB / ch2TotB) * 100 : 0;
                return ` Primas Emitidas: $ ${fmtBVal(vB, ch2DecB)} (${fmtPct(pct, 1)} del total)`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              callback: (v) => {
                const clean = Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(10));
                const tickDec = ch2MaxB > 0 && ch2MaxB < 0.5 ? 2 : (Math.abs(clean - Math.round(clean)) < 1e-6 ? 0 : 1);
                return clean.toLocaleString("es-AR", { minimumFractionDigits: tickDec, maximumFractionDigits: Math.max(tickDec, 2) }) + " B";
              },
            },
            grid: { color: "#f0f0f4" },
          },
          y: { grid: { display: false } },
        },
      },
    });

    // Chart 3 & 4: Evolución últimos 12 trimestres
    const evoStart = Math.max(0, pIdx - 11);
    const evoLabels = [];
    const evoEmit = [];
    const evoRT = [];
    const evoRF = [];
    const evoRE = [];
    const evoSin = [];
    const evoGProd = [];
    const evoGExpl = [];
    const evoComb = [];
    const evoRtPt = [];

    for (let q = evoStart; q <= pIdx; q++) {
      const qRows = getCompanyRowsForPeriod(q, true);
      const qRes = resolveBaseAndMeses(q, state.base);
      const qAgg = aggregateMetrics(qRows, qRes.meses, q, state.base, state.moneda, { scope: panScope });
      evoLabels.push(PERIODOS[q].label);
      evoEmit.push(qAgg.emit_sd / div);
      evoRT.push(qAgg.res_tec / div);
      evoRF.push(qAgg.res_fin != null ? qAgg.res_fin / div : null);
      evoRE.push(qAgg.res_ej != null ? qAgg.res_ej / div : null);
      evoSin.push(qAgg.sin_pct);
      evoGProd.push(isRetiroOnly ? qAgg.gprod_emit_pct : qAgg.gprod_pct);
      evoGExpl.push(isRetiroOnly ? qAgg.gexpl_pt_pct : qAgg.gexpl_pct);
      evoComb.push(qAgg.comb_pct);
      evoRtPt.push(qAgg.rt_pas_tec_pct);
    }

    const montosDatasets = [
      { type: "bar", label: `Primas Emitidas (${unitSuffix()})`, data: evoEmit, backgroundColor: "rgba(48,48,45,0.14)", borderRadius: 4, yAxisID: "y" },
      { type: "line", label: "Res. Técnico", data: evoRT, borderColor: BRAND.red, backgroundColor: BRAND.red, tension: 0.25, borderWidth: 2.5, yAxisID: "y1" },
    ];
    if (!granTechOnly) {
      montosDatasets.push(
        { type: "line", label: "Res. Financiero", data: evoRF, borderColor: BRAND.blue, backgroundColor: BRAND.blue, tension: 0.25, borderWidth: 2, yAxisID: "y1" },
        { type: "line", label: "Res. Ejercicio", data: evoRE, borderColor: BRAND.green, backgroundColor: BRAND.green, tension: 0.25, borderWidth: 2.5, yAxisID: "y1" },
      );
    }
    const montosFiltered = filterTimeSeriesOutliers(evoLabels, montosDatasets, {
      axisId: "y1",
      suffix: "$",
      extThreshold: 1.4,
      zThreshold: 4.0,
      maxDrops: 3,
    });
    updateOutlierNote(
      "panEvoMontosOutlierNote",
      montosFiltered.dropped,
      (d) => `${d.series} (${d.period}: ${fmtMoney(d.value * div)})`,
      { single: "El valor real se conserva en los datos.", plural: "Los valores reales se conservan en los datos." }
    );
    destroyChart("chPanEvoMontos");
    charts.chPanEvoMontos = new Chart(document.getElementById("chPanEvoMontos"), {
      data: {
        labels: evoLabels,
        datasets: montosFiltered.datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { tooltip: { callbacks: { label: chartMoneyTooltipLabel } } },
        scales: {
          y: { position: "left", title: { display: true, text: `Primas (${unitSuffix()})` }, ticks: { callback: chartMoneyTick }, grid: { color: "#f2f2f5" } },
          y1: { position: "right", title: { display: true, text: `Resultados (${unitSuffix()})` }, ticks: { callback: chartMoneyTick }, grid: { drawOnChartArea: false } },
        },
      },
    });

    const panEvoSub2 = document.getElementById("panEvoSub2");
    if (panEvoSub2) {
      panEvoSub2.textContent = isRetiroOnly
        ? "G. Producción % (s/ Primas Emitidas), G. Explotación % (s/ Pas. Téc.) y Res. Técnico % (s/ Pas. Téc.)"
        : "Siniestralidad %, G. Producción %, G. Explotación % y Ratio Combinado % (línea de referencia 100%)";
    }
    const ratioDatasets = isRetiroOnly ? [
      { label: "G. Producción % (s/ Emit.)", data: evoGProd, borderColor: BRAND.orange, tension: 0.25, borderWidth: 2.2 },
      { label: "G. Explotación % (s/ Pas. Téc.)", data: evoGExpl, borderColor: BRAND.amber, tension: 0.25, borderWidth: 2.2 },
      { label: "Res. Técnico % (s/ Pas. Téc.)", data: evoRtPt, borderColor: BRAND.red, tension: 0.25, borderWidth: 2.6 },
    ] : [
      { label: "Siniestralidad %", data: evoSin, borderColor: BRAND.blue, tension: 0.25, borderWidth: 2 },
      { label: "G. Producción %", data: evoGProd, borderColor: BRAND.orange, tension: 0.25, borderWidth: 2 },
      { label: "G. Explotación %", data: evoGExpl, borderColor: BRAND.amber, tension: 0.25, borderWidth: 2 },
      { label: "Ratio Combinado %", data: evoComb, borderColor: BRAND.red, tension: 0.25, borderWidth: 2.8 },
      { label: "Equilibrio 100%", data: evoLabels.map(() => 100), borderColor: "#999", borderDash: [5, 5], borderWidth: 1.2, pointRadius: 0 },
    ];
    const ratioFiltered = filterTimeSeriesOutliers(evoLabels, ratioDatasets, {
      suffix: "%",
      extThreshold: 0.85,
      zThreshold: 3.5,
      maxDrops: 4,
      excludeLabels: ["Equilibrio 100%"],
    });
    updateOutlierNote(
      "panEvoRatiosOutlierNote",
      ratioFiltered.dropped,
      (d) => `${d.series} (${d.period}: ${fmtPct(d.value, 1)})`,
      { single: "El valor real se conserva en los datos.", plural: "Los valores reales se conservan en los datos." }
    );
    destroyChart("chPanEvoRatios");
    charts.chPanEvoRatios = new Chart(document.getElementById("chPanEvoRatios"), {
      type: "line",
      data: {
        labels: evoLabels,
        datasets: ratioFiltered.datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { tooltip: { callbacks: { label: (ctx) => chartPctTooltipLabel(ctx, 2) } } },
        scales: { y: { ticks: { callback: chartPctTick }, grid: { color: "#f2f2f5" } } },
      },
    });

    // Concentración Top 5 / Top 10 / Top 20 / HHI
    const sortedByEmit = rows.slice().sort((a, b) => b.emit_sd - a.emit_sd);
    const posEmitTot = sortedByEmit.reduce((s, r) => s + Math.max(0, r.emit_sd), 0);
    const shareTopN = (n) => posEmitTot > 0 ? (sortedByEmit.slice(0, n).reduce((s, r) => s + Math.max(0, r.emit_sd), 0) / posEmitTot) * 100 : 0;
    const hhi = posEmitTot > 0 ? sortedByEmit.reduce((s, r) => {
      const sh = (Math.max(0, r.emit_sd) / posEmitTot) * 100;
      return s + sh * sh;
    }, 0) : 0;
    const hhiLabel = hhi < 1500 ? "Baja concentración (competitivo)" : hhi < 2500 ? "Concentración moderada" : "Alta concentración";
    document.getElementById("panConcentracionWrap").innerHTML = `
      <div class="grid-3" style="margin-bottom:10px">
        <div class="kpi-card" data-no-expand><div class="kpi-label">Top 5</div><div class="kpi-value num">${fmtPct(shareTopN(5), 1)}</div><div class="kpi-sub">de primas emitidas</div></div>
        <div class="kpi-card accent-blue" data-no-expand><div class="kpi-label">Top 10</div><div class="kpi-value num">${fmtPct(shareTopN(10), 1)}</div><div class="kpi-sub">de primas emitidas</div></div>
        <div class="kpi-card accent-ink" data-no-expand><div class="kpi-label">Top 20</div><div class="kpi-value num">${fmtPct(shareTopN(20), 1)}</div><div class="kpi-sub">de primas emitidas</div></div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <tbody>
            <tr><td><strong>Índice HHI (Primas Emitidas)</strong></td><td class="num"><strong>${Math.round(hhi).toLocaleString("es-AR")}</strong></td><td>${esc(hhiLabel)}</td></tr>
            <tr><td><strong>Líder del universo filtrado</strong></td><td class="num">${sortedByEmit[0] ? fmtMoney(sortedByEmit[0].emit_sd) : "—"}</td><td>${sortedByEmit[0] ? esc(sortedByEmit[0].nombre) : "—"}</td></tr>
            <tr><td><strong>Compañías con emisión > 0</strong></td><td class="num">${rows.filter((r) => r.emit_sd > 0).length}</td><td>de ${rows.length} ${state.granRamo ? `en ${GRAN_LABELS[state.granRamo]}` : "que presentaron balance"}</td></tr>
          </tbody>
        </table>
      </div>
    `;

    // Constitución Societaria
    const byConst = {};
    rows.forEach((r) => { byConst[r.const] = (byConst[r.const] || 0) + r.emit_sd; });
    const constSorted = Object.entries(byConst).sort((a, b) => b[1] - a[1]);
    destroyChart("chPanConst");
    charts.chPanConst = new Chart(document.getElementById("chPanConst"), {
      type: "bar",
      data: {
        labels: constSorted.map((x) => x[0]),
        datasets: [{
          label: `Primas (${unitSuffix()})`,
          data: constSorted.map((x) => x[1] / div),
          backgroundColor: constSorted.map((_, i) => PALETTE[i % PALETTE.length]),
          borderRadius: 5,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: chartMoneyTooltipLabel } },
        },
        scales: { x: { ticks: { callback: chartMoneyTick }, grid: { color: "#f0f0f4" } }, y: { grid: { display: false } } },
      },
    });
  }

  // ==================== TAB 2: GRUPO L2 ====================
  const L2_ORDER = ["0317", "0618", "0117", "0436"];
  const L2_SHORT = { "0317": "Cooperativa", "0618": "ART", "0117": "Personas", "0436": "Retiro" };
  const L2_COLORS = { "0317": BRAND.red, "0618": BRAND.blue, "0117": BRAND.green, "0436": BRAND.orange };

  function computeGrupoL2Snapshot(qIdx) {
    const allFull = getCompanyRowsForPeriod(qIdx, false, { ignoreGranRamo: true });
    const totMktEmit = allFull.reduce((s, r) => s + r.emit_sd, 0);
    const segTotals = {};
    allFull.forEach((r) => {
      segTotals[r.tipo] = (segTotals[r.tipo] || 0) + r.emit_sd;
    });
    const lsRows = L2_ORDER.map((cod) => allFull.find((x) => x.cod === cod)).filter(Boolean);
    const { meses } = resolveBaseAndMeses(qIdx, state.base);
    const vpp = computeVppEdgesForRows(lsRows, qIdx, state.base, state.moneda);
    const elimPnByParent = new Map();
    const elimReByParent = new Map();
    vpp.details.forEach((d) => {
      elimPnByParent.set(d.pCod, (elimPnByParent.get(d.pCod) || 0) + (d.elimPn || 0));
      elimReByParent.set(d.pCod, (elimReByParent.get(d.pCod) || 0) + (d.elimRe || 0));
    });
    const lsConsol = aggregateMetrics(lsRows, meses, qIdx, state.base, state.moneda, { scope: "group" });
    const isNetoVpp = state.l2ShareBasis === "neto_vpp";
    const displayRows = lsRows.map((r) => {
      if (!isNetoVpp) return { ...r, _elim_pn: 0, _elim_re: 0 };
      const epn = elimPnByParent.get(r.cod) || 0;
      const ere = elimReByParent.get(r.cod) || 0;
      return {
        ...r,
        activo: r.activo - epn,
        inv: r.inv - epn,
        pn: r.pn - epn,
        res_fin: r.res_fin - ere,
        res_ej: r.res_ej - ere,
        _elim_pn: epn,
        _elim_re: ere,
      };
    });
    return { allFull, totMktEmit, segTotals, lsRows, displayRows, lsConsol, vpp, elimPnByParent, elimReByParent };
  }

  function renderGrupoL2() {
    const pIdx = state.pIdx;
    const isNetoVpp = state.l2ShareBasis === "neto_vpp";
    document.querySelectorAll("#l2BasisTabs .seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.l2basis === state.l2ShareBasis);
    });

    const snap = computeGrupoL2Snapshot(pIdx);
    const { totMktEmit, segTotals, lsRows, displayRows, lsConsol, vpp } = snap;
    const prevStockSnap = pIdx >= 4 ? computeGrupoL2Snapshot(pIdx - 4) : null;
    const prevFlowSnap = canCompareYoY(pIdx, state.base) ? prevStockSnap : null;

    const lsMktShare = totMktEmit > 0 ? (lsConsol.emit_sd / totMktEmit) * 100 : 0;
    const lsConsolTag = state.consol === "madre" ? "Empresa Madre (RT 21)" : (state.consol === "vpp" ? "Consol. 100%" : "Suma simple");
    const lsConsolShort = state.consol === "madre" ? "Madre" : (state.consol === "vpp" ? "Consol. 100%" : "Suma simple");
    document.getElementById("liveCountPill").textContent =
      `Grupo L2 · ${lsRows.length} cías · ${isNetoVpp ? "Neto VPP (100%)" : "Suma Simple"}`;

    // 1. Spotlight Cards (movido desde Panorama + % dentro del Grupo)
    document.getElementById("lsGlobalShareBadge").textContent =
      `Grupo La Segunda · ${fmtPct(lsMktShare)} del mercado total`;

    const totDispEmit = displayRows.reduce((s, r) => s + (r.emit_sd || 0), 0);
    let lsHtml = `
      <div class="ls-mini-box consolidado" data-ent="GRP:Grupo La Segunda">
        <div class="m-title">Grupo La Segunda (${lsRows.length} cías · ${esc(lsConsolShort)})</div>
        <div class="m-val">${fmtMoney(lsConsol.emit_sd)}</div>
        <div class="m-sub">Mkt: <strong>${fmtPct(lsMktShare)}</strong> · Comb: ${fmtPct(lsConsol.comb_pct)}</div>
        <div class="m-sub">Res. Ej.: <span class="${pctClass(lsConsol.res_ej)}">${fmtMoney(lsConsol.res_ej)}</span></div>
      </div>
    `;
    displayRows.forEach((dRow, idx) => {
      const rawRow = lsRows[idx] || dRow;
      const segShare = segTotals[dRow.tipo] > 0 ? (dRow.emit_sd / segTotals[dRow.tipo]) * 100 : 0;
      const grpEmitShare = totDispEmit > 0 ? (dRow.emit_sd / totDispEmit) * 100 : 0;
      const combOrBen = dRow.tipo === "Retiro"
        ? `Resc/Rent: ${fmtMoney((dRow.rescates || 0) + (dRow.rentas || 0))}`
        : `Comb: ${fmtPct(dRow.comb_pct)}`;
      const resShow = isNetoVpp ? dRow.res_ej : rawRow.res_ej;
      lsHtml += `
        <div class="ls-mini-box" data-ent="CIA:${esc(dRow.cod)}">
          <div class="m-title">${esc(dRow.nombre)}</div>
          <div class="m-val">${fmtMoney(dRow.emit_sd)}</div>
          <div class="m-sub">Grupo: <strong>${fmtPct(grpEmitShare, 1)}</strong> · Seg. (${esc(dRow.tipo.split(" ")[0])}): <strong>${fmtPct(segShare)}</strong></div>
          <div class="m-sub">Res. Ej.: <span class="${pctClass(resShow)}">${fmtMoney(resShow)}</span> · ${combOrBen}</div>
        </div>
      `;
    });
    const lsGrid = document.getElementById("lsSpotlightGrid");
    lsGrid.innerHTML = lsHtml;
    lsGrid.querySelectorAll(".ls-mini-box").forEach((el) => {
      el.addEventListener("click", () => openFichaEntity(el.dataset.ent));
    });

    // 2. 6 KPIs Consolidados del Grupo L2
    const emitYoY = prevFlowSnap ? calcYoY(lsConsol.emit_sd, prevFlowSnap.lsConsol.emit_sd) : null;
    const actYoY = prevStockSnap ? calcYoY(lsConsol.activo, prevStockSnap.lsConsol.activo) : null;
    const pnYoY = prevStockSnap ? calcYoY(lsConsol.pn, prevStockSnap.lsConsol.pn) : null;
    const invDisp = (lsConsol.inv || 0) + (lsConsol.disp || 0);
    const invDispActPct = lsConsol.activo > 0 ? (invDisp / lsConsol.activo) * 100 : null;
    const solvRatio = lsConsol.pasivo > 0 ? lsConsol.activo / lsConsol.pasivo : null;

    const l2Kpis = [
      {
        label: "Primas Emitidas SD (Grupo L2)",
        val: fmtMoney(lsConsol.emit_sd),
        sub: `Share Mkt: <strong>${fmtPct(lsMktShare)}</strong>${emitYoY != null ? ` · YoY: <span class="${pctClass(emitYoY)}">${fmtSignedPct(emitYoY)}</span>` : ` · Dev.: ${fmtMoney(lsConsol.prim_dev)}`}`,
        accent: "",
      },
      {
        label: `Activo Total (${lsConsolShort})`,
        val: fmtMoney(lsConsol.activo),
        sub: `${actYoY != null ? `YoY: <span class="${pctClass(actYoY)}">${fmtSignedPct(actYoY)}</span> · ` : ""}Elim. VPP: ${fmtMoney(vpp.totElimPn)}`,
        accent: "accent-blue",
      },
      {
        label: "Inversiones + Disponibilidades",
        val: fmtMoney(invDisp),
        sub: `<strong>${fmtPct(invDispActPct, 1)}</strong> s/ Activo · Inv.: ${fmtMoney(lsConsol.inv)}`,
        accent: "accent-blue",
      },
      {
        label: "Pasivo Total (Grupo L2)",
        val: fmtMoney(lsConsol.pasivo),
        sub: `Comp. Téc.: ${fmtMoney(lsConsol.comp_tec)} · Deud. Aseg.: ${fmtMoney(lsConsol.deudas_aseg)}`,
        accent: "accent-ink",
      },
      {
        label: `Patrimonio Neto (${lsConsolShort})`,
        val: fmtMoney(lsConsol.pn),
        sub: `${pnYoY != null ? `YoY: <span class="${pctClass(pnYoY)}">${fmtSignedPct(pnYoY)}</span>` : `Act./Pas.: ${fmtDec(solvRatio)}x`}${state.consol === "madre" ? ` · Terc.: ${fmtMoney(lsConsol.part_terc_pn || 0)}` : ""}`,
        accent: "accent-green",
      },
      {
        label: `Resultado del Ejercicio (${lsConsolShort})`,
        val: fmtMoney(lsConsol.res_ej),
        sub: `Téc.: <span class="${pctClass(lsConsol.res_tec)}">${fmtMoney(lsConsol.res_tec)}</span> · Fin.: <span class="${pctClass(lsConsol.res_fin)}">${fmtMoney(lsConsol.res_fin)}</span> · ROE ${fmtPct(lsConsol.roe_pct, 1)}`,
        accent: "accent-orange",
      },
    ];
    const l2KpiEl = document.getElementById("l2Kpis");
    l2KpiEl.innerHTML = l2Kpis.map((k) => `
      <div class="kpi-card ${k.accent}">
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-value num">${esc(k.val)}</div>
        <div class="kpi-sub">${k.sub}</div>
      </div>
    `).join("");
    attachExpandButtons(l2KpiEl);

    // 3. Matriz de Composición % del Grupo L2
    document.getElementById("l2CompSub").textContent = isNetoVpp
      ? `Base Aporte Propio Neto VPP (100% = Consolidado 100% del Grupo L2 · ${PERIODOS[pIdx].label} · ${unitSuffix()})`
      : `Base Balances Individuales (100% = Suma simple sin eliminaciones VPP · ${PERIODOS[pIdx].label} · ${unitSuffix()})`;

    const sections = [
      {
        section: "Producción",
        rows: [
          { key: "emit_sd", label: "Primas Emitidas SD", signed: false },
          { key: "prim_dev", label: "Primas Devengadas", signed: false },
        ],
      },
      {
        section: "Activo e Inversiones",
        rows: [
          { key: "activo", label: isNetoVpp ? "Activo Total (neto VPP)" : "Activo Total (individual)", signed: false },
          { key: "disp", label: "Disponibilidades", signed: false },
          { key: "inv", label: isNetoVpp ? "Inversiones (neto VPP)" : "Inversiones (individuales)", signed: false },
          { key: "prem_cob", label: "Premios a Cobrar", signed: false },
        ],
      },
      {
        section: "Pasivo y Patrimonio Neto",
        rows: [
          { key: "pasivo", label: "Pasivo Total", signed: false },
          { key: "deudas_aseg", label: "Deudas con Asegurados", signed: false },
          { key: "comp_tec", label: "Compromisos Técnicos", signed: false },
          { key: "pn", label: isNetoVpp ? "Patrimonio Neto (neto VPP)" : "Patrimonio Neto (individual)", signed: false },
        ],
      },
      {
        section: "Resultados",
        rows: [
          { key: "res_tec", label: "Resultado Técnico", signed: true },
          { key: "res_fin", label: isNetoVpp ? "Resultado Financiero (neto VPP)" : "Resultado Financiero", signed: true },
          { key: "res_ej", label: isNetoVpp ? "Resultado del Ejercicio (neto VPP)" : "Resultado del Ejercicio", signed: true },
        ],
      },
    ];

    const uDec = unitDecimals();
    const rowByCod = new Map(displayRows.map((r) => [r.cod, r]));
    let tblHtml = `<table class="data-table table-compact"><thead>
      <tr>
        <th rowspan="2">Magnitud / Rubro</th>
        ${L2_ORDER.map((cod) => `<th colspan="2" class="num col-grp-sep">${esc(L2_SHORT[cod])}</th>`).join("")}
        <th colspan="2" class="num col-ls col-grp-sep">Total Grupo L2</th>
      </tr>
      <tr>
        ${L2_ORDER.map(() => `<th class="num col-grp-sep">Monto (${unitSuffix()})</th><th class="num">% Grp</th>`).join("")}
        <th class="num col-ls col-grp-sep">Total (${unitSuffix()})</th><th class="num col-ls">%</th>
      </tr>
    </thead><tbody>`;

    const csvExportRows = [];
    sections.forEach((sec) => {
      tblHtml += `<tr class="l2-sec-row"><td colspan="11">${esc(sec.section)}</td></tr>`;
      sec.rows.forEach((rm) => {
        const vals = L2_ORDER.map((cod) => (rowByCod.get(cod)?.[rm.key] || 0));
        const tot = vals.reduce((s, v) => s + v, 0);
        const sumAbs = vals.reduce((s, v) => s + Math.abs(v), 0);
        const canShare = rm.signed
          ? (Math.abs(tot) >= 0.15 * sumAbs && Math.abs(tot) > 0.01)
          : (tot > 0);
        const boldRow = ["emit_sd", "activo", "pasivo", "pn", "res_ej"].includes(rm.key);

        let cellsHtml = "";
        const csvLine = [sec.section, rm.label];
        vals.forEach((v) => {
          const valHtml = rm.signed ? `<span class="${pctClass(v)}">${fmtNumMiles(v)}</span>` : fmtNumMiles(v);
          let shareStr = "—";
          let shareCsv = "";
          if (canShare) {
            const pVal = (v / tot) * 100;
            shareStr = rm.signed ? fmtSignedPct(pVal, 1) : fmtPct(pVal, 1);
            shareCsv = pVal.toFixed(2);
          } else if (rm.signed && sumAbs > 0) {
            shareStr = `<span title="No calculable por compensación de signos opuestos">n/c</span>`;
          }
          cellsHtml += `<td class="num col-grp-sep">${boldRow ? `<strong>${valHtml}</strong>` : valHtml}</td>`;
          cellsHtml += `<td class="num l2-pct-cell" title="${rm.signed ? "Aporte porcentual sobre el resultado neto del Grupo" : "Participación sobre el total del Grupo L2"}">${shareStr}</td>`;
          csvLine.push((v / unitDivisor()).toFixed(uDec), shareCsv);
        });
        const totHtml = rm.signed ? `<span class="${pctClass(tot)}">${fmtNumMiles(tot)}</span>` : fmtNumMiles(tot);
        const totPctHtml = canShare ? "100,0%" : (rm.signed && sumAbs > 0 ? "n/c" : "—");
        cellsHtml += `<td class="num col-ls col-grp-sep"><strong>${totHtml}</strong></td>`;
        cellsHtml += `<td class="num col-ls"><strong>${totPctHtml}</strong></td>`;
        csvLine.push((tot / unitDivisor()).toFixed(uDec), canShare ? "100.00" : "");
        csvExportRows.push(csvLine);

        tblHtml += `<tr><td>${boldRow ? `<strong>${esc(rm.label)}</strong>` : esc(rm.label)}</td>${cellsHtml}</tr>`;
      });
    });
    tblHtml += "</tbody></table>";
    document.getElementById("l2CompTableWrap").innerHTML = tblHtml;

    // Conciliación VPP / RT 21
    const sumSimplePn = lsRows.reduce((s, r) => s + r.pn, 0);
    const sumSimpleRe = lsRows.reduce((s, r) => s + r.res_ej, 0);
    const consol100Pn = sumSimplePn - vpp.totElimPn;
    const consol100Re = sumSimpleRe - vpp.totElimRe;
    const madrePn = consol100Pn - vpp.totNciPn;
    const madreRe = consol100Re - vpp.totNciRe;
    const edgeTags = vpp.details
      .filter((d) => d.status === "Activa" || d.status === "Parcial LTM")
      .map((d) => `${L2_SHORT[d.pCod] || d.pCod}→${L2_SHORT[d.sCod] || d.sCod} (${(d.pct * 100).toFixed(2).replace(".", ",")}%)`)
      .join(", ");
    const vppNoteEl = document.getElementById("l2VppNote");
    if (vppNoteEl) {
      vppNoteEl.innerHTML =
        `<strong>Conciliación VPP y RT 21:</strong> ` +
        `Suma simple (PN ${fmtMoney(sumSimplePn)} · RE ${fmtMoney(sumSimpleRe)}) ` +
        `− Eliminación VPP [${esc(edgeTags || "sin enlaces activos")}] (PN ${fmtMoney(vpp.totElimPn)} · RE ${fmtMoney(vpp.totElimRe)}) ` +
        `= <strong>Consolidado 100%</strong> (PN ${fmtMoney(consol100Pn)} · RE ${fmtMoney(consol100Re)}) ` +
        `− Participación de Terceros (PN ${fmtMoney(vpp.totNciPn)} · RE ${fmtMoney(vpp.totNciRe)}) ` +
        `= <strong>Atribuible Empresa Madre RT 21</strong> (PN ${fmtMoney(madrePn)} · RE ${fmtMoney(madreRe)}).`;
      vppNoteEl.hidden = false;
    }

    document.getElementById("btnExportL2").onclick = () => {
      exportToCSV(
        `grupo_l2_composicion_${state.l2ShareBasis}_${PERIODOS[pIdx].id}.csv`,
        ["Sección", "Rubro", "Cooperativa ($)", "Cooperativa (%)", "ART ($)", "ART (%)", "Personas ($)", "Personas (%)", "Retiro ($)", "Retiro (%)", "Total Grupo L2 ($)", "Total (%)"],
        csvExportRows
      );
    };

    // 4. Chart 1: Participación % 100% Apilada (Horizontal)
    const mixSpecs = [
      { key: "emit_sd", label: "Primas Emitidas" },
      { key: "prim_dev", label: "Primas Devengadas" },
      { key: "activo", label: "Activo Total" },
      { key: "inv", label: "Inversiones" },
      { key: "pasivo", label: "Pasivo Total" },
      { key: "comp_tec", label: "Comp. Técnicos" },
      { key: "pn", label: "Patrimonio Neto" },
    ];
    document.getElementById("l2MixSub").textContent = isNetoVpp
      ? "Distribución porcentual por compañía (Base Neto VPP = 100% Consolidado)"
      : "Distribución porcentual por compañía (Base Suma Simple = 100%)";

    const mixDatasets = L2_ORDER.map((cod) => {
      const r = rowByCod.get(cod) || {};
      const dataPts = [];
      const rawPts = [];
      mixSpecs.forEach((sp) => {
        const tot = L2_ORDER.reduce((s, c) => s + Math.max(0, rowByCod.get(c)?.[sp.key] || 0), 0);
        const v = Math.max(0, r[sp.key] || 0);
        dataPts.push(tot > 0 ? (v / tot) * 100 : 0);
        rawPts.push(r[sp.key] || 0);
      });
      return {
        label: L2_SHORT[cod],
        data: dataPts,
        rawVals: rawPts,
        backgroundColor: L2_COLORS[cod],
        borderWidth: 1,
        borderColor: "#ffffff",
        borderRadius: 3,
      };
    });

    const l2MixLabelsPlugin = {
      id: "l2MixLabels",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.font = "700 10px 'Sora', sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        chart.data.datasets.forEach((ds, dsIdx) => {
          const meta = chart.getDatasetMeta(dsIdx);
          if (!meta || meta.hidden) return;
          meta.data.forEach((bar, i) => {
            const pct = ds.data[i] || 0;
            const segW = Math.abs(bar.x - (bar.base || bar.x));
            if (pct >= 7 && segW >= 24) {
              const cx = ((bar.base || bar.x) + bar.x) / 2;
              ctx.fillText(fmtPct(pct, 1), cx, bar.y);
            }
          });
        });
        ctx.restore();
      },
    };

    destroyChart("chL2Mix100");
    charts.chL2Mix100 = new Chart(document.getElementById("chL2Mix100"), {
      type: "bar",
      data: {
        labels: mixSpecs.map((s) => s.label),
        datasets: mixDatasets,
      },
      plugins: [l2MixLabelsPlugin],
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { boxWidth: 11, font: { size: 11, weight: "600" } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const raw = ctx.dataset.rawVals?.[ctx.dataIndex] || 0;
                return ` ${ctx.dataset.label}: ${fmtPct(ctx.parsed.x, 1)} (${fmtMoney(raw)})`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            min: 0,
            max: 100,
            ticks: { callback: (v) => v + "%" },
            grid: { color: "#f0f0f4" },
          },
          y: { stacked: true, grid: { display: false } },
        },
      },
    });

    // 5. Chart 2: Aporte al Resultado del Grupo L2
    const div = unitDivisor();
    const resEntities = L2_ORDER.map((cod) => ({
      label: L2_SHORT[cod],
      res_tec: rowByCod.get(cod)?.res_tec || 0,
      res_fin: rowByCod.get(cod)?.res_fin || 0,
      res_ej: rowByCod.get(cod)?.res_ej || 0,
    }));
    const totResObj = {
      label: isNetoVpp ? "Total Consol. 100%" : "Suma Simple",
      res_tec: resEntities.reduce((s, x) => s + x.res_tec, 0),
      res_fin: resEntities.reduce((s, x) => s + x.res_fin, 0),
      res_ej: resEntities.reduce((s, x) => s + x.res_ej, 0),
    };
    resEntities.push(totResObj);

    document.getElementById("l2ResSub").textContent = isNetoVpp
      ? "Resultado Técnico, Financiero y del Ejercicio (Neto de VPP intragrupo) vs. Consolidado 100%"
      : "Resultado Técnico, Financiero y del Ejercicio (Balances individuales) vs. Suma Simple";

    destroyChart("chL2ResBridge");
    charts.chL2ResBridge = new Chart(document.getElementById("chL2ResBridge"), {
      type: "bar",
      data: {
        labels: resEntities.map((x) => x.label),
        datasets: [
          { label: "Res. Técnico", data: resEntities.map((x) => x.res_tec / div), backgroundColor: BRAND.blue, borderRadius: 4 },
          { label: "Res. Financiero", data: resEntities.map((x) => x.res_fin / div), backgroundColor: BRAND.orange, borderRadius: 4 },
          { label: "Res. del Ejercicio", data: resEntities.map((x) => x.res_ej / div), backgroundColor: BRAND.red, borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { boxWidth: 11, font: { size: 11, weight: "600" } } },
          tooltip: { callbacks: { label: chartMoneyTooltipLabel } },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            ticks: { callback: chartMoneyTick },
            grid: { color: (c) => (c.tick && c.tick.value === 0 ? "#8e8e98" : "#f0f0f4") },
          },
        },
      },
    });

    // 5b. Charts 2b/2c: Composición por Gran Ramo — Grupo L2 vs Mercado Total
    const granKeys = ["Patrimoniales", "ART", "Personas", "Retiro"];
    const granColors = [BRAND.red, BRAND.blue, BRAND.green, BRAND.orange];
    const l2CiaSet = new Set(lsRows.map((r) => r.cIdx));
    const l2RamoAggs = computeRamoAggregates(pIdx, l2CiaSet);
    const mktRamoAggs = computeRamoAggregates(pIdx, null);
    const sumByGran = (aggs) => {
      const m = { Patrimoniales: 0, ART: 0, Personas: 0, Retiro: 0 };
      aggs.forEach((rm) => {
        if (rm.gran in m) m[rm.gran] += rm.emit_sd;
      });
      return m;
    };
    const l2ByGran = sumByGran(l2RamoAggs);
    const mktByGran = sumByGran(mktRamoAggs);

    const l2GranRaw = granKeys.map((k) => l2ByGran[k]);
    const l2GranTot = l2GranRaw.reduce((s, v) => s + v, 0);
    const l2GranScaled = l2GranRaw.map((v) => v / div);

    const divB = 1e9;
    const mktGranRaw = granKeys.map((k) => mktByGran[k]);
    const mktGranTot = mktGranRaw.reduce((s, v) => s + v, 0);
    const mktGranB = mktGranRaw.map((v) => v / divB);
    const mktGranTotB = mktGranTot / divB;
    const mktMaxB = mktGranB.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    const mktDecB = mktMaxB > 0 && mktMaxB < 0.05 ? 3 : 2;
    const fmtBVal = (vB, dec) => fmtScaledVal(vB, dec) + " B";

    const makeGranBarLabelsPlugin = (id, getLabel) => ({
      id,
      afterDatasetsDraw(chart) {
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data) return;
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        ctx.save();
        ctx.font = "600 11px 'Sora', sans-serif";
        ctx.fillStyle = BRAND.ink;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        meta.data.forEach((bar, i) => {
          ctx.fillText(getLabel(i), bar.x + 8, bar.y);
        });
        ctx.restore();
      },
    });

    document.getElementById("l2GranSub").textContent =
      `Primas Emitidas SD (${unitSuffix()}) y % del total del Grupo`;

    const l2BarLabels = l2GranRaw.map((v) => {
      const pct = l2GranTot > 0 ? (v / l2GranTot) * 100 : 0;
      return `${fmtMoney(v)} (${fmtPct(pct, 1)})`;
    });
    const l2PadRight = Math.max(142, Math.min(205, Math.max(...l2BarLabels.map((s) => s.length)) * 7.5 + 16));

    destroyChart("chL2GranRamo");
    charts.chL2GranRamo = new Chart(document.getElementById("chL2GranRamo"), {
      type: "bar",
      data: {
        labels: granKeys,
        datasets: [{
          label: `Primas Emitidas (${unitSuffix()})`,
          data: l2GranScaled,
          backgroundColor: granColors,
          borderRadius: 6,
          barPercentage: 0.64,
        }],
      },
      plugins: [makeGranBarLabelsPlugin("l2GranRamoBarLabels", (i) => l2BarLabels[i])],
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: l2PadRight } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const i = ctx.dataIndex;
                const raw = l2GranRaw[i] || 0;
                const mktRaw = mktGranRaw[i] || 0;
                const pctL2 = l2GranTot > 0 ? (raw / l2GranTot) * 100 : 0;
                const pctMkt = mktGranTot > 0 ? (mktRaw / mktGranTot) * 100 : 0;
                const shareInGran = mktRaw > 0 ? (raw / mktRaw) * 100 : 0;
                return [
                  ` Grupo L2: ${fmtMoney(raw)} (${fmtPct(pctL2, 1)} del Grupo)`,
                  ` Mercado Total: ${fmtPct(pctMkt, 1)} (Dif. mix: ${fmtSignedPct(pctL2 - pctMkt, 1).replace("%", " pp")})`,
                  ` Share Grupo L2 en ${granKeys[i]}: ${fmtPct(shareInGran, 2)}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { callback: (v) => chartMoneyTick(v) + " " + unitSuffix() },
            grid: { color: "#f0f0f4" },
          },
          y: { grid: { display: false } },
        },
      },
    });

    const mktBarLabels = mktGranB.map((vB) => {
      const pct = mktGranTotB > 0 ? (vB / mktGranTotB) * 100 : 0;
      return `$ ${fmtBVal(vB, mktDecB)} (${fmtPct(pct, 1)})`;
    });

    destroyChart("chL2GranRamoMkt");
    charts.chL2GranRamoMkt = new Chart(document.getElementById("chL2GranRamoMkt"), {
      type: "bar",
      data: {
        labels: granKeys,
        datasets: [{
          label: "Primas Emitidas (B)",
          data: mktGranB,
          backgroundColor: granColors,
          borderRadius: 6,
          barPercentage: 0.64,
        }],
      },
      plugins: [makeGranBarLabelsPlugin("l2GranRamoMktBarLabels", (i) => mktBarLabels[i])],
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 132 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const i = ctx.dataIndex;
                const vB = mktGranB[i] || 0;
                const raw = mktGranRaw[i] || 0;
                const l2Raw = l2GranRaw[i] || 0;
                const pctMkt = mktGranTotB > 0 ? (vB / mktGranTotB) * 100 : 0;
                const pctL2 = l2GranTot > 0 ? (l2Raw / l2GranTot) * 100 : 0;
                const shareInGran = raw > 0 ? (l2Raw / raw) * 100 : 0;
                return [
                  ` Mercado Total: $ ${fmtBVal(vB, mktDecB)} (${fmtPct(pctMkt, 1)} del total)`,
                  ` Grupo L2: ${fmtMoney(l2Raw)} (${fmtPct(pctL2, 1)} del Grupo · Share L2: ${fmtPct(shareInGran, 2)})`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              callback: (v) => {
                const clean = Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(10));
                const tickDec = mktMaxB > 0 && mktMaxB < 0.5 ? 2 : (Math.abs(clean - Math.round(clean)) < 1e-6 ? 0 : 1);
                return clean.toLocaleString("es-AR", { minimumFractionDigits: tickDec, maximumFractionDigits: Math.max(tickDec, 2) }) + " B";
              },
            },
            grid: { color: "#f0f0f4" },
          },
          y: { grid: { display: false } },
        },
      },
    });

    // 6. Chart 3: Evolución Histórica 12 Trimestres del Grupo L2
    const evoStart = Math.max(0, pIdx - 11);
    const metricKey = state.l2EvoMetric || "emit_sd";
    const evoMode = state.l2EvoMode || "abs";
    const isPctMode = evoMode === "pct";
    const evoEl = document.getElementById("l2EvoMetric");
    if (evoEl) evoEl.value = metricKey;
    const unitTabsEl = document.getElementById("l2EvoUnitTabs");
    if (unitTabsEl) {
      const hideUnitTabs = metricKey === "mkt_share";
      unitTabsEl.hidden = hideUnitTabs;
      unitTabsEl.style.display = hideUnitTabs ? "none" : "";
      unitTabsEl.querySelectorAll(".seg-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.l2evomode === evoMode);
      });
    }
    const metricLabels = {
      emit_sd: "Primas Emitidas SD",
      activo: isNetoVpp ? "Activo Total (neto VPP)" : "Activo Total (suma simple)",
      inv: isNetoVpp ? "Inversiones (neto VPP)" : "Inversiones (suma simple)",
      pasivo: "Pasivo Total",
      pn: isNetoVpp ? "Patrimonio Neto (neto VPP)" : "Patrimonio Neto (suma simple)",
      res_ej: isNetoVpp ? "Resultado del Ejercicio (neto VPP)" : "Resultado del Ejercicio",
      mkt_share: "Share del Grupo L2 en Mercado Total (% Primas Emitidas)",
    };
    const evoUnit = metricKey === "mkt_share"
      ? "% s/ Mercado Total"
      : (isPctMode
        ? (metricKey === "res_ej" ? "% aporte con signo s/ magnitud total Σ|Res.|" : "% de cada empresa sobre Total Grupo L2")
        : unitSuffix());
    document.getElementById("l2EvoSub").textContent =
      `${metricLabels[metricKey] || metricKey} · últimos ${pIdx - evoStart + 1} trimestres (${evoUnit})`;

    const evoLabels = [];
    const evoSnaps = [];
    for (let q = evoStart; q <= pIdx; q++) {
      evoLabels.push(PERIODOS[q].label);
      evoSnaps.push(computeGrupoL2Snapshot(q));
    }

    const l2EvoPctLabelsPlugin = {
      id: "l2EvoPctLabels",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.font = "700 10px 'Sora', sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        chart.data.datasets.forEach((ds, dsIdx) => {
          if (ds.type === "line") return;
          const meta = chart.getDatasetMeta(dsIdx);
          if (!meta || meta.hidden) return;
          meta.data.forEach((bar, i) => {
            const baseY = bar.base ?? bar.y;
            const segH = Math.abs(bar.y - baseY);
            const val = ds.data[i] || 0;
            if (Math.abs(val) >= 0.05 && segH >= 16) {
              const cy = (baseY + bar.y) / 2;
              const txt = metricKey === "res_ej" ? fmtSignedPct(val, 1) : fmtPct(val, 1);
              ctx.fillText(txt, bar.x, cy);
            }
          });
        });
        ctx.restore();
      },
    };

    destroyChart("chL2Evo");
    if (metricKey === "mkt_share") {
      const sharePts = evoSnaps.map((sn) => (sn.totMktEmit > 0 ? (sn.lsConsol.emit_sd / sn.totMktEmit) * 100 : 0));
      charts.chL2Evo = new Chart(document.getElementById("chL2Evo"), {
        type: "line",
        data: {
          labels: evoLabels,
          datasets: [{
            label: "Share Grupo L2 (% Mercado)",
            data: sharePts,
            borderColor: BRAND.red,
            backgroundColor: "rgba(228, 0, 43, 0.12)",
            fill: true,
            borderWidth: 2.6,
            pointRadius: 4,
            tension: 0.2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "top", labels: { boxWidth: 11, font: { size: 11, weight: "600" } } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const sn = evoSnaps[ctx.dataIndex];
                  return ` Share Mercado: ${fmtPct(ctx.parsed.y, 2)} (${fmtMoney(sn.lsConsol.emit_sd)})`;
                },
              },
            },
          },
          scales: {
            x: { grid: { display: false } },
            y: { ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } },
          },
        },
      });
    } else if (metricKey === "res_ej" && isPctMode) {
      const sumAbsByQ = evoSnaps.map((sn) =>
        L2_ORDER.reduce((s, c) => {
          const r = sn.displayRows.find((x) => x.cod === c);
          return s + Math.abs(r ? (r.res_ej || 0) : 0);
        }, 0)
      );
      const ds = L2_ORDER.map((cod) => {
        const rawVals = evoSnaps.map((sn) => {
          const r = sn.displayRows.find((x) => x.cod === cod);
          return r ? (r.res_ej || 0) : 0;
        });
        return {
          label: L2_SHORT[cod],
          stack: "l2_res_bars",
          data: rawVals.map((v, qi) => (sumAbsByQ[qi] > 0 ? (v / sumAbsByQ[qi]) * 100 : 0)),
          rawVals,
          backgroundColor: L2_COLORS[cod],
          borderWidth: 1,
          borderColor: "#ffffff",
          borderRadius: 2,
        };
      });
      const netRawVals = evoSnaps.map((sn) => sn.lsConsol.res_ej || 0);
      ds.push({
        type: "line",
        label: `Total Neto (${lsConsolShort}, % s/ Σ|Res.|)`,
        stack: "l2_res_net",
        data: netRawVals.map((v, qi) => (sumAbsByQ[qi] > 0 ? (v / sumAbsByQ[qi]) * 100 : 0)),
        rawVals: netRawVals,
        borderColor: BRAND.ink,
        backgroundColor: BRAND.ink,
        borderWidth: 2.4,
        pointRadius: 3.5,
        tension: 0.15,
      });
      charts.chL2Evo = new Chart(document.getElementById("chL2Evo"), {
        type: "bar",
        data: { labels: evoLabels, datasets: ds },
        plugins: [l2EvoPctLabelsPlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "top", labels: { boxWidth: 11, font: { size: 11, weight: "600" } } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const raw = ctx.dataset.rawVals?.[ctx.dataIndex] || 0;
                  return ` ${ctx.dataset.label}: ${fmtSignedPct(ctx.parsed.y, 1)} (${fmtMoney(raw)})`;
                },
                footer: (items) => {
                  if (!items || !items.length) return "";
                  const qi = items[0].dataIndex;
                  const sn = evoSnaps[qi];
                  const netPct = sumAbsByQ[qi] > 0 ? ((sn.lsConsol.res_ej || 0) / sumAbsByQ[qi]) * 100 : 0;
                  return `Total Grupo (${lsConsolShort}): ${fmtMoney(sn.lsConsol.res_ej)} (${fmtSignedPct(netPct, 1)} s/ Σ|Res.|)`;
                },
              },
            },
          },
          scales: {
            x: { stacked: true, grid: { display: false } },
            y: {
              stacked: true,
              afterDataLimits(scale) {
                if (scale.max > 99.9 && scale.max < 100.01) scale.max = 100;
                if (scale.min < -99.9 && scale.min > -100.01) scale.min = -100;
              },
              ticks: { callback: chartPctTick },
              grid: { color: (c) => (c.tick && c.tick.value === 0 ? "#8e8e98" : "#f0f0f4") },
            },
          },
        },
      });
    } else if (metricKey === "res_ej") {
      const ds = L2_ORDER.map((cod) => ({
        type: "bar",
        label: L2_SHORT[cod],
        data: evoSnaps.map((sn) => {
          const r = sn.displayRows.find((x) => x.cod === cod);
          return (r ? r.res_ej : 0) / div;
        }),
        backgroundColor: L2_COLORS[cod],
        borderRadius: 3,
      }));
      ds.push({
        type: "line",
        label: `Total Grupo (${lsConsolShort})`,
        data: evoSnaps.map((sn) => sn.lsConsol.res_ej / div),
        borderColor: BRAND.ink,
        backgroundColor: BRAND.ink,
        borderWidth: 2.4,
        pointRadius: 3.5,
        tension: 0.15,
      });
      charts.chL2Evo = new Chart(document.getElementById("chL2Evo"), {
        type: "bar",
        data: { labels: evoLabels, datasets: ds },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "top", labels: { boxWidth: 11, font: { size: 11, weight: "600" } } },
            tooltip: { callbacks: { label: chartMoneyTooltipLabel } },
          },
          scales: {
            x: { grid: { display: false } },
            y: {
              ticks: { callback: chartMoneyTick },
              grid: { color: (c) => (c.tick && c.tick.value === 0 ? "#8e8e98" : "#f0f0f4") },
            },
          },
        },
      });
    } else if (isPctMode) {
      const totByQ = evoSnaps.map((sn) =>
        sn.displayRows.reduce((s, r) => s + Math.max(0, r[metricKey] || 0), 0)
      );
      const ds = L2_ORDER.map((cod) => {
        const rawVals = evoSnaps.map((sn) => {
          const r = sn.displayRows.find((x) => x.cod === cod);
          return r ? (r[metricKey] || 0) : 0;
        });
        return {
          label: L2_SHORT[cod],
          data: rawVals.map((v, qi) => (totByQ[qi] > 0 ? (Math.max(0, v) / totByQ[qi]) * 100 : 0)),
          rawVals,
          backgroundColor: L2_COLORS[cod],
          borderWidth: 1,
          borderColor: "#ffffff",
          borderRadius: 2,
        };
      });
      charts.chL2Evo = new Chart(document.getElementById("chL2Evo"), {
        type: "bar",
        data: { labels: evoLabels, datasets: ds },
        plugins: [l2EvoPctLabelsPlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "top", labels: { boxWidth: 11, font: { size: 11, weight: "600" } } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const raw = ctx.dataset.rawVals?.[ctx.dataIndex] || 0;
                  return ` ${ctx.dataset.label}: ${fmtPct(ctx.parsed.y, 1)} (${fmtMoney(raw)})`;
                },
                footer: (items) => {
                  if (!items || !items.length) return "";
                  const tot = totByQ[items[0].dataIndex] || 0;
                  return `Total Grupo L2: ${fmtMoney(tot)} (100,0%)`;
                },
              },
            },
          },
          scales: {
            x: { stacked: true, grid: { display: false } },
            y: {
              stacked: true,
              beginAtZero: true,
              afterDataLimits(scale) {
                if (scale.max > 99.9 && scale.max < 100.01) scale.max = 100;
              },
              ticks: { callback: chartPctTick },
              grid: { color: "#f0f0f4" },
            },
          },
        },
      });
    } else {
      const ds = L2_ORDER.map((cod) => ({
        label: L2_SHORT[cod],
        data: evoSnaps.map((sn) => {
          const r = sn.displayRows.find((x) => x.cod === cod);
          return (r ? (r[metricKey] || 0) : 0) / div;
        }),
        backgroundColor: L2_COLORS[cod],
        borderRadius: 2,
      }));
      charts.chL2Evo = new Chart(document.getElementById("chL2Evo"), {
        type: "bar",
        data: { labels: evoLabels, datasets: ds },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "top", labels: { boxWidth: 11, font: { size: 11, weight: "600" } } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const sn = evoSnaps[ctx.dataIndex];
                  const tot = sn.displayRows.reduce((s, r) => s + (r[metricKey] || 0), 0);
                  const raw = (ctx.parsed.y || 0) * div;
                  const pct = tot > 0 ? (raw / tot) * 100 : null;
                  return ` ${ctx.dataset.label}: ${fmtMoney(raw)}${pct != null ? ` (${fmtPct(pct, 1)} grp)` : ""}`;
                },
                footer: (items) => {
                  if (!items || !items.length) return "";
                  const sn = evoSnaps[items[0].dataIndex];
                  const tot = sn.displayRows.reduce((s, r) => s + (r[metricKey] || 0), 0);
                  return `Total Grupo L2: ${fmtMoney(tot)}`;
                },
              },
            },
          },
          scales: {
            x: { stacked: true, grid: { display: false } },
            y: { stacked: true, ticks: { callback: chartMoneyTick }, grid: { color: "#f0f0f4" } },
          },
        },
      });
    }
  }

  // ==================== TAB 3: RANKINGS Y COMPARATIVOS ====================
  function quantileSorted(sortedArr, q) {
    if (!sortedArr.length) return 0;
    const pos = (sortedArr.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.min(sortedArr.length - 1, lo + 1);
    return sortedArr[lo] * (1 - (pos - lo)) + sortedArr[hi] * (pos - lo);
  }

  function fmtChartAxisVal(v, signed, suf, decOverride) {
    if (v == null || !Number.isFinite(v)) return "—";
    const dec = decOverride != null ? decOverride : (suf === "x" ? 2 : 1);
    const body = signed
      ? fmtSignedPct(v, dec).replace("%", "")
      : v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return body + suf;
  }

  /**
   * Robust scale summary (IQR + MAD with scale-proportional floor) for dynamic outlier detection.
   */
  function robustAxisStats(vals, suffix = "%") {
    if (!vals || vals.length === 0) return { q1: 0, med: 0, q3: 0, spread: 1 };
    const sv = vals.slice().sort((a, b) => a - b);
    const q1 = quantileSorted(sv, 0.25);
    const med = quantileSorted(sv, 0.5);
    const q3 = quantileSorted(sv, 0.75);
    const iqr = q3 - q1;
    const absDev = sv.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
    const mad = quantileSorted(absDev, 0.5) * 1.4826;
    const scaleRef = Math.max(Math.abs(med), Math.abs(q1), Math.abs(q3), 1e-6);
    let floor;
    if (suffix === "x") floor = 0.35;
    else if (suffix === "$") floor = Math.max(scaleRef * 0.05, 1e-6);
    else floor = Math.max(0.35, Math.min(2.5, scaleRef * 0.08));
    return { q1, med, q3, spread: Math.max(iqr, mad, floor) };
  }

  /**
   * 3-stage anti-masking outlier filter for ratio bars, stacked bars, and scatter charts.
   */
  function filterChartOutliers(candidates, universe, specs, opts = {}) {
    const valid = [];
    candidates.forEach((r) => {
      if (specs.every((s) => typeof r[s.key] === "number" && Number.isFinite(r[s.key]))) {
        valid.push({ row: r, idx: valid.length });
      }
    });
    const sizeKey = opts.sizeKey !== undefined ? opts.sizeKey : "emit_sd";
    const barLimit = opts.barLimit || null;
    const activeSearch = Boolean(opts.activeSearch);
    const weighted = opts.weighted !== false;
    const anchorZero = Boolean(opts.anchorZero);
    const minKeep = opts.minKeep || 3;
    const protectFn = typeof opts.protectFn === "function" ? opts.protectFn : null;

    const univSrc = universe != null ? universe : candidates;
    const uvalid = univSrc.filter((r) => specs.every((s) => typeof r[s.key] === "number" && Number.isFinite(r[s.key])));
    if (activeSearch || valid.length <= Math.max(4, minKeep + 1) || uvalid.length <= Math.max(4, minKeep + 1)) {
      return { kept: (barLimit ? valid.slice(0, barLimit) : valid).map((x) => x.row), dropped: [] };
    }

    let totW = 0;
    let cap = 0;
    let rawTotActual = 0;
    let core = uvalid;
    if (weighted && sizeKey) {
      const ws = uvalid.map((r) => Math.max(0, r[sizeKey] || 0)).sort((a, b) => b - a);
      rawTotActual = ws.reduce((s, w) => s + w, 0);
      cap = ws.length >= 4 ? (rawTotActual - ws[0]) * 0.35 : rawTotActual;
      totW = cap > 0 ? ws.reduce((s, w) => s + Math.min(w, cap), 0) : rawTotActual;
      const coreByShare = totW > 0
        ? uvalid.filter((r) => (Math.min(Math.max(0, r[sizeKey] || 0), cap) / totW) >= 0.0025)
        : [];
      const minCore = Math.max(Math.min(6, uvalid.length), Math.ceil(uvalid.length * 0.65));
      core = coreByShare.length < minCore
        ? uvalid.slice().sort((a, b) => (b[sizeKey] || 0) - (a[sizeKey] || 0)).slice(0, minCore)
        : coreByShare;
    }

    const coreStats = {};
    specs.forEach((s) => {
      coreStats[s.key] = robustAxisStats(core.map((r) => r[s.key]), s.suffix);
    });

    valid.forEach((it) => {
      const w = (weighted && sizeKey) ? Math.max(0, it.row[sizeKey] || 0) : 0;
      it.share = rawTotActual > 0 ? (w / rawTotActual) : (1 / valid.length);
      it.wShare = (weighted && totW > 0) ? (Math.min(w, cap) / totW) : it.share;
    });

    function getK(it) {
      if (!weighted || totW <= 0) return valid.length > 6 ? 2.4 : 2.8;
      const sh = Math.max(it.share, it.wShare);
      if (sh >= 0.025 || it.row.esLS) return 3.2;
      if (sh >= 0.005) return 2.5;
      if (sh >= 0.0005) return 1.9;
      return 1.5;
    }

    function getExtThr(it) {
      const base = (barLimit || anchorZero) ? 0.55 : 0.45;
      if (!weighted || totW <= 0) return base + 0.20;
      const sh = Math.max(it.share, it.wShare);
      if (sh >= 0.025 || it.row.esLS) return base + 0.25;
      if (sh >= 0.005) return base + 0.05;
      if (sh >= 0.0005) return base;
      return base * 0.75;
    }

    let working = [];
    let dropped = [];
    valid.forEach((it) => {
      const kf = getK(it);
      let maxZ = 0;
      specs.forEach((s) => {
        const st = coreStats[s.key];
        const v = it.row[s.key];
        const z = Math.max(0, (st.q1 - v) / st.spread, (v - st.q3) / st.spread);
        if (z > maxZ) maxZ = z;
      });
      it.coreZ = maxZ;
      if (!(protectFn && protectFn(it.row)) && maxZ > kf) {
        it.stage = 1;
        dropped.push(it);
      } else {
        working.push(it);
      }
    });

    if (working.length < minKeep) {
      const prot = valid.filter((it) => protectFn && protectFn(it.row));
      const oth = valid.filter((it) => !(protectFn && protectFn(it.row))).sort((a, b) => a.coreZ - b.coreZ);
      const keepTarget = Math.max(minKeep, Math.floor(valid.length / 2));
      const need = Math.max(0, keepTarget - prot.length);
      working = prot.concat(oth.slice(0, need));
      const wIds = new Set(working.map((x) => x.idx));
      dropped = valid.filter((x) => !wIds.has(x.idx));
      dropped.forEach((x) => { x.stage = 1; });
    }
    working.sort((a, b) => a.idx - b.idx);

    function calcExt(row, pool) {
      let maxExt = 0;
      let maxZ = 0;
      specs.forEach((s) => {
        const rv = pool.map((x) => x.row[s.key]);
        const st = robustAxisStats(rv, s.suffix);
        let lo = Math.min(...rv);
        let hi = Math.max(...rv);
        if (barLimit || anchorZero) {
          lo = Math.min(lo, 0);
          hi = Math.max(hi, 0);
        }
        const span = Math.max(hi - lo, st.spread * 1.5);
        const v = row[s.key];
        const ext = Math.max(0, lo - v, v - hi) / span;
        const z = Math.max(0, (st.q1 - v) / st.spread, (v - st.q3) / st.spread);
        if (ext > maxExt) {
          maxExt = ext;
          maxZ = z;
        }
      });
      return { ext: maxExt, z: maxZ };
    }

    while (working.length > minKeep && dropped.length < valid.length - minKeep) {
      const vis = barLimit ? working.slice(0, barLimit) : working;
      if (vis.length <= minKeep) break;
      let bestCand = null;
      let bestScore = 0;
      for (let i = 0; i < vis.length; i++) {
        const cand = vis[i];
        if (protectFn && protectFn(cand.row)) continue;
        const rem = vis.filter((x) => x.idx !== cand.idx);
        const { ext, z } = calcExt(cand.row, rem);
        if (ext >= getExtThr(cand) && z >= getK(cand)) {
          const sc = ext * z;
          if (sc > bestScore) {
            bestScore = sc;
            bestCand = cand;
          }
        }
      }
      if (!bestCand) break;
      bestCand.stage = 2;
      working = working.filter((x) => x.idx !== bestCand.idx);
      dropped.push(bestCand);
    }

    const baseVis = (barLimit ? working.slice(0, barLimit) : working).slice();
    const finalDrops = [];
    for (let i = 0; i < dropped.length; i++) {
      const d = dropped[i];
      const { ext } = calcExt(d.row, baseVis);
      const kf = getK(d);
      const zCap = kf * (barLimit ? 1.35 : 1.85);
      if (ext <= 1e-6 || (ext < getExtThr(d) && d.coreZ < zCap)) {
        working.push(d);
      } else {
        d.severity = Math.max(ext, d.coreZ * 0.15);
        finalDrops.push(d);
      }
    }
    working.sort((a, b) => a.idx - b.idx);
    dropped = finalDrops;

    const finalItems = barLimit ? working.slice(0, barLimit) : working;
    if (barLimit && finalItems.length > 0) {
      const cutIdx = finalItems[finalItems.length - 1].idx;
      dropped = dropped.filter((d) => d.stage === 2 || d.idx < cutIdx || working.length < barLimit);
    }
    dropped.sort((a, b) => ((b.severity || 0) - (a.severity || 0)) || (a.idx - b.idx));
    return {
      kept: finalItems.map((x) => x.row),
      dropped,
    };
  }

  /**
   * Filters extreme isolated monetary outliers on Top-N bar charts while keeping natural Pareto leaders intact.
   */
  function filterMonetaryBarOutliers(candidates, col, opts = {}) {
    const barLimit = opts.barLimit || 15;
    const activeSearch = Boolean(opts.activeSearch);
    const minKeep = opts.minKeep || 4;
    const maxDrops = opts.maxDrops || 3;
    const extThreshold = opts.extThreshold != null ? opts.extThreshold : 1.5;
    const zThreshold = opts.zThreshold != null ? opts.zThreshold : 3.0;

    const valid = [];
    candidates.forEach((r) => {
      if (typeof r[col] === "number" && Number.isFinite(r[col])) {
        valid.push({ row: r, idx: valid.length });
      }
    });
    if (activeSearch || valid.length <= 5) {
      return { kept: valid.slice(0, barLimit).map((x) => x.row), dropped: [] };
    }

    let working = valid.slice();
    let dropped = [];
    const dropCap = Math.min(maxDrops, valid.length - minKeep);
    while (dropped.length < dropCap) {
      const vis = working.slice(0, barLimit);
      if (vis.length <= minKeep) break;
      let bestCand = null;
      let bestExt = 0;
      for (let i = 0; i < vis.length; i++) {
        const cand = vis[i];
        const rv = vis.filter((x) => x.idx !== cand.idx).map((x) => x.row[col]);
        const lo = Math.min(Math.min(...rv), 0);
        const hi = Math.max(Math.max(...rv), 0);
        const span = Math.max(hi - lo, 1e-6);
        const v = cand.row[col];
        const ext = Math.max(0, lo - v, v - hi) / span;
        const st = robustAxisStats(rv, "$");
        const zRem = Math.max(0, (st.q1 - v) / st.spread, (v - st.q3) / st.spread);
        if (ext >= extThreshold && zRem >= zThreshold && ext > bestExt) {
          bestExt = ext;
          bestCand = cand;
        }
      }
      if (!bestCand) break;
      bestCand.severity = bestExt;
      working = working.filter((x) => x.idx !== bestCand.idx);
      dropped.push(bestCand);
    }

    const finalItems = working.slice(0, barLimit);
    if (finalItems.length > 0) {
      const cutIdx = finalItems[finalItems.length - 1].idx;
      dropped = dropped.filter((d) => d.idx < cutIdx || working.length < barLimit);
    }
    dropped.sort((a, b) => ((b.severity || 0) - (a.severity || 0)) || (a.idx - b.idx));
    return { kept: finalItems.map((x) => x.row), dropped };
  }

  /**
   * 3-stage anti-masking outlier filter for 12-quarter evolution charts (handles multi-series synchronous spikes).
   */
  function filterTimeSeriesOutliers(labels, datasets, opts = {}) {
    const axisId = opts.axisId || null;
    const suffix = opts.suffix || "%";
    const extThreshold = opts.extThreshold != null ? opts.extThreshold : 0.85;
    const zThreshold = opts.zThreshold != null ? opts.zThreshold : 3.5;
    const maxDrops = opts.maxDrops != null ? opts.maxDrops : 4;
    const maxFrac = opts.maxFrac != null ? opts.maxFrac : 0.18;
    const excludeSet = new Set(opts.excludeLabels || []);

    const outDatasets = datasets.map((ds) => ({
      ...ds,
      data: Array.isArray(ds.data) ? ds.data.slice() : [],
    }));

    const pts = [];
    outDatasets.forEach((ds, dsIdx) => {
      if (axisId && ds.yAxisID !== axisId) return;
      if (excludeSet.has(ds.label)) return;
      ds.data.forEach((v, qIdx) => {
        if (typeof v === "number" && Number.isFinite(v)) {
          pts.push({ id: pts.length, dsIdx, qIdx, val: v, coreZ: 0, severity: 0 });
        }
      });
    });

    const cap = Math.min(maxDrops, Math.floor(pts.length * maxFrac));
    if (pts.length < 6 || cap < 1) {
      return { datasets: outDatasets, dropped: [] };
    }

    const coreSt = robustAxisStats(pts.map((p) => p.val), suffix);
    let working = [];
    let dropped = [];
    pts.forEach((p) => {
      const z = Math.max(0, (coreSt.q1 - p.val) / coreSt.spread, (p.val - coreSt.q3) / coreSt.spread);
      p.coreZ = z;
      if (z > zThreshold) dropped.push(p);
      else working.push(p);
    });

    if (working.length < 5 || dropped.length > Math.floor(pts.length * 0.28)) {
      const byZ = pts.slice().sort((a, b) => a.coreZ - b.coreZ);
      const keepN = Math.max(5, pts.length - cap);
      working = byZ.slice(0, keepN);
      const wIds = new Set(working.map((x) => x.id));
      dropped = pts.filter((x) => !wIds.has(x.id));
    }

    while (dropped.length < cap && working.length >= 6) {
      let bestCand = null;
      let bestScore = 0;
      for (let i = 0; i < working.length; i++) {
        const cand = working[i];
        const remVals = [];
        for (let j = 0; j < working.length; j++) {
          if (j !== i) remVals.push(working[j].val);
        }
        const st = robustAxisStats(remVals, suffix);
        const lo = Math.min(...remVals);
        const hi = Math.max(...remVals);
        const span = Math.max(hi - lo, st.spread * 1.5);
        const v = cand.val;
        const ext = Math.max(0, lo - v, v - hi) / span;
        const zRem = Math.max(0, (st.q1 - v) / st.spread, (v - st.q3) / st.spread);
        if (ext >= extThreshold && zRem >= zThreshold) {
          const sc = ext * zRem;
          if (sc > bestScore) {
            bestScore = sc;
            bestCand = cand;
          }
        }
      }
      if (!bestCand) break;
      working = working.filter((x) => x.id !== bestCand.id);
      dropped.push(bestCand);
    }

    dropped.sort((a, b) => a.coreZ - b.coreZ);
    let restoredAny = true;
    while (restoredAny && dropped.length > 0) {
      restoredAny = false;
      const stillDropped = [];
      for (let i = 0; i < dropped.length; i++) {
        const d = dropped[i];
        const remVals = working.map((x) => x.val);
        const st = robustAxisStats(remVals, suffix);
        const lo = Math.min(...remVals);
        const hi = Math.max(...remVals);
        const span = Math.max(hi - lo, st.spread * 1.5);
        const ext = Math.max(0, lo - d.val, d.val - hi) / span;
        if (ext < extThreshold) {
          working.push(d);
          restoredAny = true;
        } else {
          d.severity = ext;
          stillDropped.push(d);
        }
      }
      dropped = stillDropped;
    }

    if (dropped.length > cap) {
      dropped.sort((a, b) => a.severity - b.severity);
      while (dropped.length > cap) {
        working.push(dropped.shift());
      }
    }

    dropped.sort((a, b) => b.severity - a.severity);
    const outDropped = dropped.map((d) => {
      const ds = outDatasets[d.dsIdx];
      ds.data[d.qIdx] = null;
      if (!ds.type || ds.type === "line") ds.spanGaps = true;
      return {
        series: ds.label || "Serie",
        period: labels[d.qIdx] || "",
        value: d.val,
        severity: d.severity,
      };
    });

    return { datasets: outDatasets, dropped: outDropped };
  }

  function updateOutlierNote(elId, dropped, fmtItemFn, footerOrIsBar) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!dropped || dropped.length === 0) {
      el.hidden = true;
      el.innerHTML = "";
      el.removeAttribute("title");
      return;
    }
    const fullItems = dropped.map(fmtItemFn);
    const maxInline = fullItems.length <= 5 ? fullItems.length : 4;
    const shown = fullItems.slice(0, maxInline);
    const extra = fullItems.length - shown.length;
    const single = fullItems.length === 1;
    const prefix = single
      ? "Outlier excluido de la escala:"
      : `Outliers excluidos de la escala (${fullItems.length}):`;
    const tail = extra > 0 ? ` y ${extra} más` : "";
    let footer;
    if (typeof footerOrIsBar === "string") {
      footer = footerOrIsBar;
    } else if (footerOrIsBar && typeof footerOrIsBar === "object") {
      footer = single ? footerOrIsBar.single : footerOrIsBar.plural;
    } else if (footerOrIsBar) {
      footer = single ? "Se mantiene en la tabla." : "Se mantienen en la tabla.";
    } else {
      footer = single ? "Se mantiene en promedios y tabla." : "Se mantienen en promedios y tabla.";
    }
    el.innerHTML = `<strong>${esc(prefix)}</strong> ${shown.map(esc).join(" · ")}${esc(tail)}. <span>${esc(footer)}</span>`;
    el.title = `${prefix}\n${fullItems.map((t) => "• " + t).join("\n")}\n(${footer})`;
    el.hidden = false;
  }

  /** Dibuja líneas punteadas de promedio de mercado (X vertical, Y horizontal) con píldoras de valor sin colisión. */
  function drawScatterAvgGuides(chart, { avgX, avgY, avgXTxt = "", avgYTxt = "" }) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.x || !scales.y) return;
    const { left, right, top, bottom } = chartArea;

    function measurePill(text) {
      ctx.save();
      ctx.font = "600 10.5px 'Sora', sans-serif";
      const w = ctx.measureText(text).width + 12;
      ctx.restore();
      return { w, h: 19 };
    }

    function drawPill(text, x, y, w, h, color) {
      ctx.save();
      ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, 4);
      else ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "600 10.5px 'Sora', sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(text, x + 6, y + h / 2 + 0.5);
      ctx.restore();
    }

    let vBox = null;
    if (avgX != null && Number.isFinite(avgX)) {
      const px = scales.x.getPixelForValue(avgX);
      if (px >= left && px <= right) {
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = "rgba(48, 48, 45, 0.85)";
        ctx.moveTo(px, top);
        ctx.lineTo(px, bottom);
        ctx.stroke();
        ctx.restore();

        if (avgXTxt) {
          const { w, h } = measurePill(avgXTxt);
          const rawLx = (px + w + 10 <= right) ? px + 6 : px - w - 6;
          const lx = Math.min(Math.max(left + 4, rawLx), Math.max(left + 4, right - w - 4));
          const ly = top + 6;
          vBox = { x: lx, y: ly, w, h };
          drawPill(avgXTxt, lx, ly, w, h, "#30302d");
        }
      }
    }

    if (avgY != null && Number.isFinite(avgY)) {
      const py = scales.y.getPixelForValue(avgY);
      if (py >= top && py <= bottom) {
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = "rgba(185, 31, 56, 0.85)";
        ctx.moveTo(left, py);
        ctx.lineTo(right, py);
        ctx.stroke();
        ctx.restore();

        if (avgYTxt) {
          const { w, h } = measurePill(avgYTxt);
          let lx = Math.max(left + 4, right - w - 6);
          let ly = (py - h - 5 >= top + 4) ? py - h - 5 : Math.min(bottom - h - 4, py + 5);
          if (vBox && !(lx + w < vBox.x || lx > vBox.x + vBox.w || ly + h < vBox.y || ly > vBox.y + vBox.h)) {
            const altLx = left + 6;
            if (altLx + w < vBox.x || altLx > vBox.x + vBox.w || ly + h < vBox.y || ly > vBox.y + vBox.h) {
              lx = altLx;
            } else {
              ly = Math.min(bottom - h - 4, vBox.y + vBox.h + 6);
            }
          }
          drawPill(avgYTxt, lx, ly, w, h, "#b91f38");
        }
      }
    }
  }

  function renderRankings() {
    const pIdx = state.pIdx;
    const isZurichLife = (r) => r.cod === "0541";
    const rawRows = getCompanyRowsForPeriod(pIdx, true);
    const rows = state.rkExclZurichLife ? rawRows.filter((r) => !isZurichLife(r)) : rawRows;
    const totEmit = rows.reduce((s, r) => s + r.emit_sd, 0);
    const granTechOnly = isGranRamoTechOnly();
    const isRetiroOnly = !granTechOnly && (state.tipo === "Retiro" || state.granRamo === "Retiro" || (rows.length > 0 && rows.every((r) => r.tipo === "Retiro")));

    // Compute previous year ranks for rank delta
    const rawPrevRows = canCompareYoY(pIdx, state.base) ? getCompanyRowsForPeriod(pIdx - 4, true) : [];
    const prevRows = state.rkExclZurichLife ? rawPrevRows.filter((r) => !isZurichLife(r)) : rawPrevRows;
    const rankKeyByMode = {
      prod: "emit_sd",
      res: granTechOnly ? "res_tec" : "res_ej",
      sin: "comb_pct",
      gto: isRetiroOnly ? "gexpl_pt_pct" : "gto_pct",
      fin: "ret_inv_pct",
      solv: "cobertura_pct",
    };
    const metricKey = rankKeyByMode[state.rkMode] || "emit_sd";
    const ascModes = new Set(["sin", "gto"]);
    if (granTechOnly && state.rkMode === "res" && ["res_ej", "res_fin", "roe_pct", "pas_tec", "rt_pas_tec_pct", "ret_inv_pct"].includes(state.rkSort.key)) {
      state.rkSort = { key: "res_tec", dir: "desc" };
    } else if (!granTechOnly && !isRetiroOnly && state.rkMode === "res" && ["pas_tec", "rt_pas_tec_pct", "rt_pct", "emit_yoy", "comb_pct", "ret_inv_pct"].includes(state.rkSort.key)) {
      state.rkSort = { key: "res_ej", dir: "desc" };
    } else if (isRetiroOnly && state.rkMode === "res" && ["rt_pct", "emit_yoy", "comb_pct"].includes(state.rkSort.key)) {
      state.rkSort = { key: "res_ej", dir: "desc" };
    } else if (isRetiroOnly && state.rkMode === "gto" && ["prim_dev", "gprod_pct", "gexpl_pct", "gto_pct", "g_reas"].includes(state.rkSort.key)) {
      state.rkSort = { key: "gexpl_pt_pct", dir: "asc" };
    } else if (isRetiroOnly && state.rkMode === "sin" && ["gprod_pct", "gexpl_pct"].includes(state.rkSort.key)) {
      state.rkSort = { key: state.rkSort.key === "gprod_pct" ? "gprod_emit_pct" : "gexpl_pt_pct", dir: state.rkSort.dir };
    } else if (!isRetiroOnly && ["pas_tec", "rt_pas_tec_pct", "gprod_emit_pct", "gexpl_pt_pct"].includes(state.rkSort.key)) {
      state.rkSort = { key: metricKey, dir: ascModes.has(state.rkMode) ? "asc" : "desc" };
    }
    const prevOrder = prevRows.slice().filter((r) => r[metricKey] != null).sort((a, b) => ascModes.has(state.rkMode) ? a[metricKey] - b[metricKey] : b[metricKey] - a[metricKey]);
    const prevRankMap = new Map();
    prevOrder.forEach((r, idx) => prevRankMap.set(r.cod, idx + 1));

    const curOrder = rows.slice().filter((r) => r[metricKey] != null).sort((a, b) => ascModes.has(state.rkMode) ? a[metricKey] - b[metricKey] : b[metricKey] - a[metricKey]);
    const curRankMap = new Map();
    curOrder.forEach((r, idx) => curRankMap.set(r.cod, idx + 1));

    rows.forEach((r) => {
      r.share = totEmit > 0 ? (r.emit_sd / totEmit) * 100 : null;
      r.rank = curRankMap.get(r.cod) || null;
      const pr = prevRankMap.get(r.cod);
      r.rank_delta = (r.rank && pr) ? (pr - r.rank) : null;
    });

    const q = state.rkSearch.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.nombre.toLowerCase().includes(q) || r.razon.toLowerCase().includes(q) || r.cod.includes(q) || r.grupo.toLowerCase().includes(q))
      : rows;

    const baseCols = [
      { key: "rank", label: "#", num: true, render: (r) => r.rank ? `${r.rank}` : "—" },
      {
        key: "rank_delta",
        label: "Δ YoY",
        num: true,
        render: (r) => {
          if (r.rank_delta == null) return '<span class="rank-delta-eq">—</span>';
          if (r.rank_delta > 0) return `<span class="rank-delta-up">▲ ${r.rank_delta}</span>`;
          if (r.rank_delta < 0) return `<span class="rank-delta-down">▼ ${Math.abs(r.rank_delta)}</span>`;
          return '<span class="rank-delta-eq">=</span>';
        },
      },
      {
        key: "nombre",
        label: "Compañía",
        num: false,
        render: (r) => `${esc(r.nombre)} ${r.esLS ? '<span class="badge badge-ls">LS</span>' : ""}`,
      },
      { key: "tipo", label: "Tipo", num: false, render: (r) => `<span class="badge badge-type">${esc(r.tipo.split(" ")[0])}</span>` },
      { key: "grupo", label: "Grupo", num: false },
    ];

    const modeCols = {
      prod: [
        { key: "emit_sd", label: `Primas Emit. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.emit_sd) },
        { key: "share", label: "Share %", num: true, render: (r) => fmtPct(r.share) },
        { key: "emit_yoy", label: "YoY %", num: true, render: (r) => `<span class="${pctClass(r.emit_yoy)}">${fmtSignedPct(r.emit_yoy)}</span>` },
        { key: "prim_dev", label: `Primas Dev. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.prim_dev) },
        { key: "comb_pct", label: "Combinado %", num: true, render: (r) => fmtPct(r.comb_pct) },
      ],
      res: isRetiroOnly ? [
        { key: "pas_tec", label: `Deud. Aseg. + CT (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.pas_tec) },
        { key: "res_tec", label: `Res. Técnico (${unitSuffix()})`, num: true, render: (r) => `<span class="${pctClass(r.res_tec)}">${fmtNumMiles(r.res_tec)}</span>` },
        { key: "rt_pas_tec_pct", label: "Res. Téc. % (s/ PT)", title: "Resultado Técnico / (Deudas con Asegurados + Compromisos Técnicos)", num: true, render: (r) => `<span class="${pctClass(r.rt_pas_tec_pct)}">${fmtPct(r.rt_pas_tec_pct)}</span>` },
        { key: "res_fin", label: `Res. Financ. (${unitSuffix()})`, num: true, render: (r) => `<span class="${pctClass(r.res_fin)}">${fmtNumMiles(r.res_fin)}</span>` },
        { key: "ret_inv_pct", label: "Res. Fin. % (s/ Inv.)", title: "Resultado Financiero (incl. RECPAM) / Inversiones al cierre", num: true, render: (r) => `<span class="${pctClass(r.ret_inv_pct)}">${fmtPct(r.ret_inv_pct)}</span>` },
        { key: "res_ej", label: `Res. Ejercicio (${unitSuffix()})`, num: true, render: (r) => `<span class="${pctClass(r.res_ej)}">${fmtNumMiles(r.res_ej)}</span>` },
        { key: "roe_pct", label: "ROE %", num: true, render: (r) => `<span class="${pctClass(r.roe_pct)}">${fmtPct(r.roe_pct)}</span>` },
      ] : (granTechOnly ? [
        { key: "prim_dev", label: `Primas Dev. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.prim_dev) },
        { key: "res_tec", label: `Res. Técnico (${unitSuffix()})`, num: true, render: (r) => `<span class="${pctClass(r.res_tec)}">${fmtNumMiles(r.res_tec)}</span>` },
        { key: "rt_pct", label: "Res. Téc. % (s/ Dev.)", num: true, render: (r) => `<span class="${pctClass(r.rt_pct)}">${fmtPct(r.rt_pct)}</span>` },
        { key: "emit_yoy", label: "YoY Emit. %", num: true, render: (r) => `<span class="${pctClass(r.emit_yoy)}">${fmtSignedPct(r.emit_yoy)}</span>` },
        { key: "comb_pct", label: "Combinado %", num: true, render: (r) => `<strong>${fmtPct(r.comb_pct)}</strong>` },
      ] : [
        { key: "prim_dev", label: `Primas Dev. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.prim_dev) },
        { key: "res_tec", label: `Res. Técnico (${unitSuffix()})`, num: true, render: (r) => `<span class="${pctClass(r.res_tec)}">${fmtNumMiles(r.res_tec)}</span>` },
        { key: "res_fin", label: `Res. Financ. (${unitSuffix()})`, num: true, render: (r) => `<span class="${pctClass(r.res_fin)}">${fmtNumMiles(r.res_fin)}</span>` },
        { key: "res_ej", label: `Res. Ejercicio (${unitSuffix()})`, num: true, render: (r) => `<span class="${pctClass(r.res_ej)}">${fmtNumMiles(r.res_ej)}</span>` },
        { key: "roe_pct", label: "ROE %", num: true, render: (r) => `<span class="${pctClass(r.roe_pct)}">${fmtPct(r.roe_pct)}</span>` },
      ]),
      sin: [
        { key: "prim_dev", label: `Primas Dev. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.prim_dev) },
        { key: "sin_dev", label: `Siniestros Dev. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.sin_dev) },
        { key: "sin_pct", label: "Siniestralidad %", num: true, render: (r) => fmtPct(r.sin_pct) },
        isRetiroOnly
          ? { key: "gprod_emit_pct", label: "G. Prod. % (s/ Emit.)", title: "Gastos de Producción / Primas Emitidas", num: true, render: (r) => fmtPct(r.gprod_emit_pct) }
          : { key: "gprod_pct", label: "G. Prod. %", title: "Gastos de Producción / Primas Devengadas", num: true, render: (r) => fmtPct(r.gprod_pct) },
        isRetiroOnly
          ? { key: "gexpl_pt_pct", label: "G. Expl. % (s/ PT)", title: "Gastos de Explotación / (Deudas con Asegurados + Compromisos Técnicos)", num: true, render: (r) => fmtPct(r.gexpl_pt_pct) }
          : { key: "gexpl_pct", label: "G. Expl. %", title: "Gastos de Explotación (brutos, antes de a/c Reaseguros) / Primas Devengadas", num: true, render: (r) => fmtPct(r.gexpl_pct) },
        { key: "gto_pct", label: "G. Neto %", title: "(G. Prod. + G. Expl. − G. a/c Reaseg.) / Primas Devengadas", num: true, render: (r) => fmtPct(r.gto_pct) },
        { key: "comb_pct", label: "Combinado %", num: true, render: (r) => `<strong>${fmtPct(r.comb_pct)}</strong>` },
      ],
      gto: isRetiroOnly ? [
        { key: "emit_sd", label: `Primas Emit. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.emit_sd) },
        { key: "pas_tec", label: `Deud. Aseg. + CT (${unitSuffix()})`, title: "Deudas con Asegurados + Compromisos Técnicos", num: true, render: (r) => fmtNumMiles(r.pas_tec) },
        { key: "g_prod", label: `G. Prod. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.g_prod) },
        { key: "gprod_emit_pct", label: "G. Prod. % (s/ Emit.)", title: "Gastos de Producción / Primas Emitidas", num: true, render: (r) => fmtPct(r.gprod_emit_pct) },
        { key: "g_expl", label: `G. Expl. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.g_expl) },
        { key: "gexpl_pt_pct", label: "G. Expl. % (s/ PT)", title: "Gastos de Explotación / (Deudas con Asegurados + Compromisos Técnicos)", num: true, render: (r) => `<strong>${fmtPct(r.gexpl_pt_pct)}</strong>` },
      ] : [
        { key: "prim_dev", label: `Primas Dev. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.prim_dev) },
        { key: "g_prod", label: `G. Prod. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.g_prod) },
        { key: "gprod_pct", label: "G. Prod. %", title: "Gastos de Producción / Primas Devengadas", num: true, render: (r) => fmtPct(r.gprod_pct) },
        { key: "g_expl", label: `G. Expl. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.g_expl) },
        { key: "gexpl_pct", label: "G. Expl. %", title: "Gastos de Explotación (brutos, antes de a/c Reaseguros) / Primas Devengadas", num: true, render: (r) => fmtPct(r.gexpl_pct) },
        { key: "g_reas", label: `G. a/c Reas. (${unitSuffix()})`, title: "Gastos de Gestión a cargo de Reaseguradores (deducibles)", num: true, render: (r) => fmtNumMiles(r.g_reas) },
        { key: "gto_pct", label: "G. Total Neto %", title: "(G. Prod. + G. Expl. − G. a/c Reaseg.) / Primas Devengadas", num: true, render: (r) => `<strong>${fmtPct(r.gto_pct)}</strong>` },
      ],
      fin: [
        { key: "inv", label: `Inversiones (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.inv) },
        { key: "res_fin", label: `Res. Financ. (${unitSuffix()})`, num: true, render: (r) => `<span class="${pctClass(r.res_fin)}">${fmtNumMiles(r.res_fin)}</span>` },
        { key: "recpam", label: `RECPAM (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.recpam) },
        { key: "ret_inv_pct", label: "Retorno Período %", title: "Resultado Financiero (incl. RECPAM) / Inversiones al cierre", num: true, render: (r) => `<span class="${pctClass(r.ret_inv_pct)}">${fmtPct(r.ret_inv_pct)}</span>` },
        { key: "ret_inv_anual_pct", label: "Retorno Anualiz. %", title: "Retorno del período anualizado linealmente (× 12 / meses de la base activa)", num: true, render: (r) => `<span class="${pctClass(r.ret_inv_anual_pct)}">${fmtPct(r.ret_inv_anual_pct)}</span>` },
        { key: "ret_inv_sin_recpam_pct", label: "Ret. sin RECPAM %", title: "(Resultado Financiero − RECPAM) / Inversiones al cierre: retorno financiero antes del ajuste por inflación (RECPAM)", num: true, render: (r) => `<span class="${pctClass(r.ret_inv_sin_recpam_pct)}">${fmtPct(r.ret_inv_sin_recpam_pct)}</span>` },
      ],
      solv: [
        { key: "activo", label: `Activo (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.activo) },
        { key: "pasivo", label: `Pasivo (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.pasivo) },
        { key: "pn", label: `Patrimonio Neto (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.pn) },
        { key: "dep_pct", label: "Dependencia % (C)", title: "Indicador C SSN: Créditos (Premios a Cobrar + Reaseg. + Otros Créd.) / Total Activo (Óptimo 0–40%)", num: true, render: (r) => fmtPct(r.dep_pct) },
        { key: "solv_liq_pct", label: "Solv. Líq. % (D)", title: "Indicador D SSN: (Disponibilidades + Inversiones) / Deudas con Asegurados (Óptimo +80%)", num: true, render: (r) => fmtSolvLiq(r.solv_liq_pct) },
        { key: "cobertura_pct", label: "Solv. / Cob. % (E)", title: "Indicador E SSN: (Disponibilidades + Inversiones + Inmuebles) / (Deudas c/ Asegurados + Compromisos Técnicos) (Óptimo +100%)", num: true, render: (r) => fmtPct(r.cobertura_pct) },
        { key: "apalanc", label: "Apalanc. (P/PN)", num: true, render: (r) => fmtDec(r.apalanc) },
      ],
    };

    const cols = baseCols.concat(modeCols[state.rkMode]);
    const { base: rkEffBase, meses: rkEffMeses } = resolveBaseAndMeses(pIdx, state.base);
    const rkBaseLabel = rkEffBase === "ltm"
      ? "Últimos 12 Meses (LTM)"
      : (rkEffBase === "estanco" ? "Trimestre Estanco (3m)" : `Acumulado (${rkEffMeses}m)`);
    const rkTitleEl = document.getElementById("rkTableTitle");
    if (rkTitleEl) {
      rkTitleEl.innerHTML = `Tabla de Ranking y Comparativo <span style="font-weight:500;color:var(--ink-muted);font-size:11px;margin-left:6px">(${esc(PERIODOS[pIdx].label)} · ${esc(rkBaseLabel)})</span>`;
    }
    const sorted = renderSortableTable(
      document.getElementById("rkTableWrap"),
      cols,
      filtered,
      state.rkSort,
      () => renderRankings(),
      {
        limit: state.rkLimit,
        highlightLS: state.rkHighlightLS,
        rowIdKey: "cod",
        onRowClick: (cod) => openFichaEntity("CIA:" + cod),
      }
    );

    // Chart 1: Top 15 Horizontal Bar of active sort column
    const nonMetricCols = new Set(["rank", "rank_delta", "nombre", "tipo", "grupo"]);
    const chartCol = nonMetricCols.has(state.rkSort.key) ? metricKey : state.rkSort.key;
    const validForBar = sorted.filter((r) => typeof r[chartCol] === "number" && Number.isFinite(r[chartCol]));
    const isPctCol = chartCol.endsWith("_pct") || chartCol === "share" || chartCol === "emit_yoy" || chartCol === "apalanc";
    const div = isPctCol ? 1 : unitDivisor();
    const colLabel = (cols.find((c) => c.key === chartCol) || { label: chartCol }).label;
    const exclZTag = state.rkExclZurichLife ? " (sin Zurich Life)" : "";
    const isCorpOnlyMode = granTechOnly && (state.rkMode === "fin" || state.rkMode === "solv");
    const corpEmptyTitle = "Rubros societarios no disponibles por ramo";
    const corpEmptyDetail = "En SINENSUP las Inversiones, el Resultado Financiero, el Activo y el Patrimonio Neto se informan a nivel compañía y no por ramo (salvo Retiro, que es monorama). Para analizarlos, cambiá «Ramo (Negocio)» a «Todos» y filtrá por «Tipo de Compañía».";

    const barSuffix = chartCol === "apalanc" ? "x" : "%";
    const barSizeKey = ["ret_inv_pct", "ret_inv_sin_recpam_pct", "ret_inv_anual_pct"].includes(chartCol)
      ? "inv"
      : (["rt_pas_tec_pct", "gexpl_pt_pct", "cobertura_pct", "solv_liq_pct"].includes(chartCol)
        ? "pas_tec"
        : (["roe_pct", "apalanc"].includes(chartCol)
          ? "pn"
          : (chartCol === "dep_pct" ? "activo" : "emit_sd")));
    const barSizeTagMap = { inv: "Inv.", pas_tec: "Pas. Téc.", pn: "PN", activo: "Act.", emit_sd: "Emit." };
    const barSizeTag = barSizeTagMap[barSizeKey] || "Emit.";
    let barFiltered;
    if (isCorpOnlyMode) {
      barFiltered = { kept: [], dropped: [] };
    } else if (isPctCol && chartCol !== "share") {
      barFiltered = filterChartOutliers(validForBar, filtered, [{ key: chartCol, suffix: barSuffix }], {
        sizeKey: barSizeKey,
        barLimit: 15,
        activeSearch: Boolean(q),
        weighted: true,
        anchorZero: true,
      });
    } else if (!isPctCol) {
      barFiltered = filterMonetaryBarOutliers(validForBar, chartCol, {
        barLimit: 15,
        activeSearch: Boolean(q),
      });
    } else {
      barFiltered = { kept: validForBar.slice(0, 15), dropped: [] };
    }
    const top15 = barFiltered.kept;

    document.getElementById("rkChartBarTitle").textContent = `Top 15 según: ${colLabel}${exclZTag}`;

    destroyChart("chRkBar");
    if (isCorpOnlyMode || top15.length === 0) {
      updateOutlierNote("rkBarOutlierNote", [], null, true);
      setChartEmptyState(
        "chRkBar",
        isCorpOnlyMode ? corpEmptyTitle : "Sin datos disponibles para graficar",
        isCorpOnlyMode ? corpEmptyDetail : "No hay compañías en el filtro actual con valores válidos para esta métrica."
      );
    } else {
      setChartEmptyState("chRkBar", null);
      updateOutlierNote(
        "rkBarOutlierNote",
        barFiltered.dropped,
        ({ row, share }) => {
          if (!isPctCol) return `${row.nombre} (${fmtMoney(row[chartCol])})`;
          const valStr = fmtChartAxisVal(row[chartCol], chartCol === "emit_yoy", barSuffix, chartCol === "apalanc" ? 2 : 1);
          const shStr = share < 0.0001 ? "<0,01%" : fmtPct(share * 100, share < 0.01 ? 2 : 1);
          return `${row.nombre} (${valStr} · ${shStr} ${barSizeTag})`;
        },
        true
      );
      charts.chRkBar = new Chart(document.getElementById("chRkBar"), {
        type: "bar",
        data: {
          labels: top15.map((r) => r.nombre),
          datasets: [{
            label: colLabel,
            data: top15.map((r) => r[chartCol] / div),
            backgroundColor: top15.map((r) => (r.esLS && state.rkHighlightLS ? BRAND.red : "rgba(48,48,45,0.72)")),
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const v = ctx.parsed.x;
                  if (chartCol === "apalanc") return ` ${colLabel}: ${fmtDec(v, 2)}x`;
                  if (isPctCol) return ` ${colLabel}: ${fmtPct(v, 2)}`;
                  return chartMoneyTooltipLabel(ctx);
                },
              },
            },
          },
          scales: {
            x: {
              ticks: {
                callback: (v) => {
                  if (chartCol === "apalanc") {
                    const clean = Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(10));
                    return clean.toLocaleString("es-AR") + "x";
                  }
                  return isPctCol ? chartPctTick(v) : chartMoneyTick(v);
                },
              },
              grid: { color: "#f0f0f4" },
            },
            y: { grid: { display: false } },
          },
        },
      });
    }

    // Chart 2: Scatter Positioning Map with dynamic filtered-universe average lines
    const { meses: rkMeses } = resolveBaseAndMeses(pIdx, state.base);
    const rkScope = (state.grupo && state.grupo !== "Independientes") ? "group" : "market";
    const mktAgg = aggregateMetrics(rows, rkMeses, pIdx, state.base, state.moneda, { scope: rkScope });
    const mktAggPrev = prevRows.length > 0 ? aggregateMetrics(prevRows, rkMeses, pIdx - 4, state.base, state.moneda, { scope: rkScope }) : null;
    mktAgg.emit_yoy = mktAggPrev ? calcYoY(mktAgg.emit_sd, mktAggPrev.emit_sd) : null;

    const scatterCfg = {
      prod: {
        x: "emit_yoy", y: "comb_pct",
        xl: "Crecimiento YoY %", yl: "Ratio Combinado %",
        xTag: "Prom. Crec.", yTag: "Prom. Comb.",
        xSigned: true, xSuffix: "%", ySigned: false, ySuffix: "%",
        title: "Posicionamiento: Crecimiento YoY % vs Combinado % (Top 40)",
      },
      res: isRetiroOnly ? {
        x: "rt_pas_tec_pct", y: "ret_inv_pct",
        xl: "Res. Técnico % (s/ Deudas Aseg. + Comp. Téc.)", yl: "Res. Financiero % (s/ Inversiones)",
        xTag: "Prom. Téc. s/ PT", yTag: "Prom. Fin. s/ Inv.",
        xSigned: false, xSuffix: "%", ySigned: false, ySuffix: "%",
        xDec: 2, yDec: 2,
        title: "Posicionamiento Retiro: Técnico % (s/ Pas. Téc.) vs Financiero % (s/ Inv.)",
      } : (granTechOnly ? (canCompareYoY(pIdx, state.base) ? {
        x: "rt_pct", y: "emit_yoy",
        xl: "Resultado Técnico % (s/ Primas Dev.)", yl: "Crecimiento YoY % (Primas Emitidas)",
        xTag: "Prom. Téc.", yTag: "Prom. Crec.",
        xSigned: false, xSuffix: "%", ySigned: true, ySuffix: "%",
        title: "Posicionamiento Técnico del Ramo: Res. Técnico % vs Crecimiento YoY % (Top 40)",
      } : {
        x: "rt_pct", y: "sin_pct",
        xl: "Resultado Técnico % (s/ Primas Dev.)", yl: "Siniestralidad %",
        xTag: "Prom. Téc.", yTag: "Prom. Sin.",
        xSigned: false, xSuffix: "%", ySigned: false, ySuffix: "%",
        title: "Posicionamiento Técnico del Ramo: Res. Técnico % vs Siniestralidad % (Top 40)",
      }) : {
        x: "rt_pct", y: "rf_pct",
        xl: "Resultado Técnico % (s/ Primas Dev.)", yl: "Resultado Financiero % (s/ Primas Dev.)",
        xTag: "Prom. Téc.", yTag: "Prom. Fin.",
        xSigned: false, xSuffix: "%", ySigned: false, ySuffix: "%",
        title: "Posicionamiento: Técnico % vs Financiero % (Top 40)",
      }),
      sin: {
        x: "sin_pct", y: "gto_pct",
        xl: "Siniestralidad %", yl: "Gastos %",
        xTag: "Prom. Sin.", yTag: "Prom. Gtos",
        xSigned: false, xSuffix: "%", ySigned: false, ySuffix: "%",
        title: "Eficiencia: Siniestralidad % vs Gastos % (Top 40)",
      },
      gto: isRetiroOnly ? {
        x: "gprod_emit_pct", y: "gexpl_pt_pct",
        xl: "Gastos Producción % (s/ Primas Emitidas)", yl: "Gastos Explotación % (s/ Deudas Aseg. + Comp. Téc.)",
        xTag: "Prom. Prod. s/Emit", yTag: "Prom. Expl. s/PT",
        xTip: "G. Prod. s/Emit", yTip: "G. Expl. s/PT",
        xSigned: false, xSuffix: "%", ySigned: false, ySuffix: "%",
        xDec: 2, yDec: 2,
        title: "Estructura de Gastos Retiro: Prod. % (s/ Emit.) vs Expl. % (s/ Pas. Téc.)",
      } : {
        x: "gprod_pct", y: "gexpl_pct",
        xl: "Gastos Producción %", yl: "Gastos Explotación %",
        xTag: "Prom. Prod.", yTag: "Prom. Expl.",
        xSigned: false, xSuffix: "%", ySigned: false, ySuffix: "%",
        title: "Estructura de Gastos: Prod. % vs Expl. % (Top 40)",
      },
      fin: {
        x: "ret_inv_pct", y: "ret_inv_sin_recpam_pct",
        xl: "Retorno Período s/ Inv. % (incl. RECPAM)", yl: "Retorno sin RECPAM s/ Inv. % (bruto)",
        xTag: "Prom. Real", yTag: "Prom. sin RECPAM",
        xTip: "Ret. Período", yTip: "Ret. sin RECPAM",
        xSigned: false, xSuffix: "%", ySigned: false, ySuffix: "%",
        xDec: 2, yDec: 2,
        title: isRetiroOnly
          ? "Finanzas Retiro: Retorno Período % vs Retorno sin RECPAM %"
          : "Finanzas: Retorno Período % vs Retorno sin RECPAM % (Top 40 por Inv.)",
      },
      solv: {
        x: "apalanc", y: "cobertura_pct",
        xl: "Apalancamiento (Pasivo/PN)", yl: "Solvencia / Cobertura % (Ind. E)",
        xTag: "Prom. Apal.", yTag: "Prom. Cob.",
        xSigned: false, xSuffix: "x", ySigned: false, ySuffix: "%",
        title: "Solvencia: Apalancamiento vs Cobertura Ind. E % (Top 40)",
      },
    }[state.rkMode];

    const avgX = mktAgg[scatterCfg.x];
    const avgY = mktAgg[scatterCfg.y];
    const fmtRef = fmtChartAxisVal;
    const avgXTxt = `${scatterCfg.xTag}: ${fmtRef(avgX, scatterCfg.xSigned, scatterCfg.xSuffix, scatterCfg.xDec)}`;
    const avgYTxt = `${scatterCfg.yTag}: ${fmtRef(avgY, scatterCfg.ySigned, scatterCfg.ySuffix, scatterCfg.yDec)}`;
    document.getElementById("rkChartScatterTitle").innerHTML = isCorpOnlyMode
      ? `${esc(scatterCfg.title)}${esc(exclZTag)}`
      : `${esc(scatterCfg.title)}${esc(exclZTag)} <span style="font-weight:500;color:var(--ink-muted);font-size:11px;margin-left:6px">(${esc(avgXTxt)} · ${esc(avgYTxt)})</span>`;

    const top40 = filtered.slice()
      .sort((a, b) => state.rkMode === "fin" ? ((b.inv || 0) - (a.inv || 0)) : (b.emit_sd - a.emit_sd))
      .slice(0, 40);
    filtered.filter((r) => r.esLS && !top40.some((x) => x.cod === r.cod)).forEach((r) => top40.push(r));
    const scSizeKey = state.rkMode === "fin"
      ? "inv"
      : (isRetiroOnly && (state.rkMode === "res" || state.rkMode === "gto") ? "pas_tec" : "emit_sd");
    const scSizeTag = scSizeKey === "inv" ? "Inv." : (scSizeKey === "pas_tec" ? "Pas. Téc." : "Emit.");
    const scFiltered = isCorpOnlyMode
      ? { kept: [], dropped: [] }
      : filterChartOutliers(
          top40,
          filtered,
          [{ key: scatterCfg.x, suffix: scatterCfg.xSuffix }, { key: scatterCfg.y, suffix: scatterCfg.ySuffix }],
          { sizeKey: scSizeKey, activeSearch: Boolean(q), weighted: true, anchorZero: false }
        );
    const scRows = scFiltered.kept;
    const lsPts = [];
    const mktPts = [];
    scRows.forEach((r) => {
      const pt = { x: r[scatterCfg.x], y: r[scatterCfg.y], name: r.nombre, cod: r.cod };
      if (r.esLS && state.rkHighlightLS) lsPts.push(pt);
      else mktPts.push(pt);
    });
    lsPts.sort((a, b) => L2_ORDER.indexOf(a.cod) - L2_ORDER.indexOf(b.cod));

    const avgLinesPlugin = {
      id: "rkAvgLines",
      afterDatasetsDraw(chart) {
        drawScatterAvgGuides(chart, { avgX, avgY, avgXTxt, avgYTxt });
      },
    };

    const xShort = (scatterCfg.xTag || scatterCfg.xl || "X").replace(/^Prom\.\s*/, "");
    const yShort = (scatterCfg.yTag || scatterCfg.yl || "Y").replace(/^Prom\.\s*/, "");
    const l2ChipShort = { "0317": "Coop.", "0618": "ART", "0117": "Pers.", "0436": "Ret." };

    function measureLsChipW(ctx, prefix, valText, fontSize) {
      ctx.font = `700 ${fontSize}px 'Sora', sans-serif`;
      const wPref = ctx.measureText(prefix).width;
      ctx.font = `600 ${fontSize}px 'Sora', sans-serif`;
      const wVal = ctx.measureText(valText).width;
      return { wPref, chipW: 16 + wPref + 4 + wVal + 8 };
    }

    function drawLsChip(ctx, prefix, valText, rightX, cy, fontSize) {
      ctx.save();
      const { wPref, chipW } = measureLsChipW(ctx, prefix, valText, fontSize);
      const chipH = 20;
      const x = rightX - chipW;
      const y = cy - chipH / 2;

      ctx.fillStyle = "rgba(226, 0, 57, 0.07)";
      ctx.strokeStyle = "rgba(226, 0, 57, 0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, chipW, chipH, 5);
      else ctx.rect(x, y, chipW, chipH);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = BRAND.red;
      ctx.beginPath();
      ctx.arc(x + 8.5, cy, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.font = `700 ${fontSize}px 'Sora', sans-serif`;
      ctx.fillStyle = BRAND.redDark;
      ctx.fillText(prefix, x + 16, cy + 0.5);
      ctx.font = `600 ${fontSize}px 'Sora', sans-serif`;
      ctx.fillStyle = BRAND.ink;
      ctx.fillText(valText, x + 16 + wPref + 4, cy + 0.5);
      ctx.restore();
      return chipW;
    }

    const rkLsBadgePlugin = {
      id: "rkLsBadge",
      beforeLayout(chart) {
        if (lsPts.length > 2 && chart.legend && !chart.legend._l2ExtraPatched) {
          chart.legend._l2ExtraPatched = true;
          const origFit = chart.legend.fit.bind(chart.legend);
          chart.legend.fit = function fitWithL2Rows() {
            origFit();
            this.height += 24;
          };
        }
      },
      afterDraw(chart) {
        if (!lsPts.length || !chart.isDatasetVisible(1)) return;
        const { ctx } = chart;
        const hitBoxes = chart.legend && chart.legend.legendHitBoxes ? chart.legend.legendHitBoxes : [];
        const legendLeft = hitBoxes.length ? hitBoxes[0].left : 12;
        const legendRight = hitBoxes.length
          ? Math.max(...hitBoxes.map((b) => b.left + b.width))
          : 210;
        const row1Cy = hitBoxes.length ? hitBoxes[0].top + hitBoxes[0].height / 2 : 16;
        const rightEdge = chart.width - 4;
        const availW = Math.max(80, rightEdge - (legendRight + 10));

        if (lsPts.length === 1) {
          const pt = lsPts[0];
          const vx = fmtRef(pt.x, scatterCfg.xSigned, scatterCfg.xSuffix, scatterCfg.xDec);
          const vy = fmtRef(pt.y, scatterCfg.ySigned, scatterCfg.ySuffix, scatterCfg.yDec);
          const prefix = `L2 ${L2_SHORT[pt.cod] || pt.name}:`;
          const fullVal = `${xShort} ${vx} · ${yShort} ${vy}`;
          const compactVal = `${vx} · ${vy}`;
          ctx.save();
          let chosenVal = fullVal;
          let chosenSize = 10.5;
          if (measureLsChipW(ctx, prefix, fullVal, 10.5).chipW > availW) {
            if (measureLsChipW(ctx, prefix, fullVal, 9.5).chipW <= availW) {
              chosenSize = 9.5;
            } else {
              chosenVal = compactVal;
              chosenSize = 9.5;
            }
          }
          ctx.restore();
          drawLsChip(ctx, prefix, chosenVal, rightEdge, row1Cy, chosenSize);
          return;
        }

        const items = lsPts.map((pt) => {
          const vx = fmtRef(pt.x, scatterCfg.xSigned, scatterCfg.xSuffix, scatterCfg.xDec);
          const vy = fmtRef(pt.y, scatterCfg.ySigned, scatterCfg.ySuffix, scatterCfg.yDec);
          return {
            prefix: `${l2ChipShort[pt.cod] || L2_SHORT[pt.cod] || "L2"}:`,
            val: `${vx} · ${vy}`,
          };
        });

        const row1 = items.slice(0, 2);
        const row2 = items.slice(2);
        const gap = 6;

        ctx.save();
        const row1W10 = row1.reduce((s, it) => s + measureLsChipW(ctx, it.prefix, it.val, 10).chipW, 0) + gap * (row1.length - 1);
        const fontRow1 = row1W10 <= availW ? 10 : 9;
        ctx.restore();

        let curRight = rightEdge;
        for (let i = row1.length - 1; i >= 0; i--) {
          const w = drawLsChip(ctx, row1[i].prefix, row1[i].val, curRight, row1Cy, fontRow1);
          curRight -= w + gap;
        }

        if (row2.length > 0) {
          const row2Cy = row1Cy + 23;
          let curRight2 = rightEdge;
          for (let i = row2.length - 1; i >= 0; i--) {
            const w = drawLsChip(ctx, row2[i].prefix, row2[i].val, curRight2, row2Cy, fontRow1);
            curRight2 -= w + gap;
          }
          const leftMostRow2X = curRight2 + gap;
          const refLabel = `Valores L2 (${xShort} · ${yShort}):`;
          ctx.save();
          ctx.font = "600 9.5px 'Sora', sans-serif";
          const refW = ctx.measureText(refLabel).width;
          if (legendLeft + refW <= leftMostRow2X - 10) {
            ctx.fillStyle = BRAND.muted;
            ctx.textBaseline = "middle";
            ctx.textAlign = "left";
            ctx.fillText(refLabel, legendLeft, row2Cy + 0.5);
          }
          ctx.restore();
        }
      },
    };

    destroyChart("chRkScatter");
    const rkScatterInfoEl = document.getElementById("rkScatterInfoNote");
    if (isCorpOnlyMode || scRows.length === 0) {
      updateOutlierNote("rkScatterOutlierNote", [], null, false);
      if (rkScatterInfoEl) {
        rkScatterInfoEl.hidden = true;
        rkScatterInfoEl.innerHTML = "";
      }
      setChartEmptyState(
        "chRkScatter",
        isCorpOnlyMode ? corpEmptyTitle : "Sin puntos disponibles para el mapa",
        isCorpOnlyMode ? corpEmptyDetail : "No hay compañías en el filtro actual con ambas métricas válidas dentro del rango del gráfico."
      );
    } else {
      setChartEmptyState("chRkScatter", null);
      updateOutlierNote(
        "rkScatterOutlierNote",
        scFiltered.dropped,
        ({ row, share }) => {
          const vx = fmtRef(row[scatterCfg.x], scatterCfg.xSigned, scatterCfg.xSuffix, scatterCfg.xDec);
          const vy = fmtRef(row[scatterCfg.y], scatterCfg.ySigned, scatterCfg.ySuffix, scatterCfg.yDec);
          const shStr = share < 0.0001 ? "<0,01%" : fmtPct(share * 100, share < 0.01 ? 2 : 1);
          return `${row.nombre} (${vx} / ${vy} · ${shStr} ${scSizeTag})`;
        },
        false
      );
      if (rkScatterInfoEl) {
        if (isRetiroOnly && state.rkMode === "fin") {
          rkScatterInfoEl.innerHTML = `<strong>Nota metodológica Retiro (exposición SSN):</strong> La brecha entre <em>Retorno sin RECPAM</em> y <em>Retorno Período</em> (<code>-RECPAM / Inv.</code>) puede diferir de la inflación del trimestre porque las compañías aplican criterios heterogéneos en SINENSUP: algunas absorben parte del RECPAM dentro de <em>Transferencia a Estructura Técnica</em> (<code>4.02.01.07</code>) en lugar de <code>5.02.05</code> (ej. Nación y Prevención Retiro), y otras no reexpresan las Reservas Matemáticas iniciales en <code>5.01.04</code>, neteando el RECPAM pasivo en <code>5.02.05</code> (ej. San Cristóbal, Credicoop y Fed. Patronal Retiro). Además, <code>Res. Financiero</code> incluye la transferencia hacia/desde Estructura Técnica (<code>4.02.01.07.07.01</code>), que desplaza por igual ambos retornos.`;
          rkScatterInfoEl.hidden = false;
        } else {
          rkScatterInfoEl.hidden = true;
          rkScatterInfoEl.innerHTML = "";
        }
      }
      charts.chRkScatter = new Chart(document.getElementById("chRkScatter"), {
        type: "scatter",
        data: {
          datasets: [
            { label: "Mercado", data: mktPts, backgroundColor: "rgba(65, 131, 202, 0.58)", pointRadius: 5 },
            { label: "Grupo La Segunda", data: lsPts, backgroundColor: BRAND.red, pointRadius: 7.5 },
          ],
        },
        plugins: [avgLinesPlugin, rkLsBadgePlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "top",
              align: "start",
              labels: {
                boxWidth: 10,
                boxHeight: 10,
                usePointStyle: true,
                pointStyle: "circle",
                padding: 12,
                font: { size: 11, weight: "600" },
              },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const vx = fmtRef(ctx.raw.x, scatterCfg.xSigned, scatterCfg.xSuffix, scatterCfg.xDec);
                  const vy = fmtRef(ctx.raw.y, scatterCfg.ySigned, scatterCfg.ySuffix, scatterCfg.yDec);
                  if (scatterCfg.xTip && scatterCfg.yTip) {
                    return ` ${ctx.raw.name}: ${scatterCfg.xTip} ${vx} · ${scatterCfg.yTip} ${vy}`;
                  }
                  return ` ${ctx.raw.name}: (${vx}, ${vy})`;
                },
              },
            },
          },
          scales: {
            x: {
              title: { display: true, text: scatterCfg.xl },
              ticks: { callback: (v) => (Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(10))).toLocaleString("es-AR") + scatterCfg.xSuffix },
              grid: { color: "#f0f0f4" },
            },
            y: {
              title: { display: true, text: scatterCfg.yl },
              ticks: { callback: (v) => (Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(10))).toLocaleString("es-AR") + scatterCfg.ySuffix },
              grid: { color: "#f0f0f4" },
            },
          },
        },
      });
    }

    document.getElementById("btnExportRk").onclick = () => {
      const headers = cols.map((c) => c.label);
      const uDec = unitDecimals();
      const dataOut = sorted.map((r) => cols.map((c) => {
        const v = r[c.key];
        return typeof v === "number" ? (c.key.endsWith("_pct") || c.key === "share" || c.key === "emit_yoy" || c.key === "apalanc" || c.key === "rank" || c.key === "rank_delta" ? v.toFixed(2) : (v / unitDivisor()).toFixed(uDec)) : (v ?? "");
      }));
      exportToCSV(`ranking_${state.rkMode}_${PERIODOS[pIdx].id}.csv`, headers, dataOut);
    };
  }

  // ==================== TAB 3: RAMOS Y SUBRAMOS ====================
  function renderRmMixAndRatios(displayRows, levelLabel) {
    const top12 = displayRows.slice().sort((a, b) => b.emit_sd - a.emit_sd).slice(0, 12);
    const div = unitDivisor();

    destroyChart("chRmMix");
    destroyChart("chRmRatios");
    if (top12.length === 0) {
      updateOutlierNote("rmRatiosOutlierNote", [], null, true);
      setChartEmptyState("chRmMix", `Sin datos de ${levelLabel.toLowerCase()}`, "No hay operaciones registradas para el filtro actual.");
      setChartEmptyState("chRmRatios", `Sin ratios de ${levelLabel.toLowerCase()}`, "No hay operaciones registradas para el filtro actual.");
      return;
    }
    setChartEmptyState("chRmMix", null);
    setChartEmptyState("chRmRatios", null);

    charts.chRmMix = new Chart(document.getElementById("chRmMix"), {
      type: "bar",
      data: {
        labels: top12.map((r) => r.desc),
        datasets: [{
          label: `Primas Emitidas SD (${unitSuffix()})`,
          data: top12.map((r) => r.emit_sd / div),
          backgroundColor: BRAND.red,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: chartMoneyTooltipLabel } },
        },
        scales: { x: { ticks: { callback: chartMoneyTick }, grid: { color: "#f0f0f4" } }, y: { grid: { display: false } } },
      },
    });

    const rmRatioRows = top12.map((r) => {
      const sp = r.sin_pct || 0;
      const gp = r.gto_pct || 0;
      return {
        ...r,
        _stackPos: Math.max(0, sp) + Math.max(0, gp),
        _stackNeg: Math.min(0, sp) + Math.min(0, gp),
      };
    });
    const rmRatiosFiltered = filterChartOutliers(
      rmRatioRows,
      rmRatioRows,
      [{ key: "_stackPos", suffix: "%" }, { key: "_stackNeg", suffix: "%" }],
      { weighted: false, anchorZero: true }
    );
    const rmRatiosKept = rmRatiosFiltered.kept;
    updateOutlierNote(
      "rmRatiosOutlierNote",
      rmRatiosFiltered.dropped,
      ({ row }) => `${row.desc} (Comb. ${fmtPct(row.comb_pct, 1)}: Sin. ${fmtPct(row.sin_pct, 1)} · Gtos ${fmtPct(row.gto_pct, 1)})`,
      true
    );

    charts.chRmRatios = new Chart(document.getElementById("chRmRatios"), {
      type: "bar",
      data: {
        labels: rmRatiosKept.map((r) => r.desc),
        datasets: [
          { label: "Siniestralidad %", data: rmRatiosKept.map((r) => r.sin_pct || 0), backgroundColor: BRAND.blue, borderRadius: 3 },
          { label: "Gastos Netos %", data: rmRatiosKept.map((r) => r.gto_pct || 0), backgroundColor: BRAND.orange, borderRadius: 3 },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => chartPctTooltipLabel(ctx, 2),
              afterLabel: (ctx) => {
                if (ctx.datasetIndex !== 1) return "";
                const r = rmRatiosKept[ctx.dataIndex];
                if (!r) return "";
                return `   G. Prod.: ${fmtPct(r.gprod_pct)} · G. Expl.: ${fmtPct(r.gexpl_pct)}`;
              },
            },
          },
        },
        scales: { x: { stacked: true, ticks: { callback: chartPctTick } }, y: { stacked: true } },
      },
    });
  }

  function renderRmDrillPanel({ pIdx, title, leadersTitle, evoTitle, leaders, evoPoints, csvFilename }) {
    document.getElementById("rmDrillTitle").textContent = title;
    const leadersTitleEl = document.getElementById("rmDrillLeadersTitle");
    if (leadersTitleEl) leadersTitleEl.textContent = leadersTitle;
    const evoTitleEl = document.getElementById("rmDrillEvoTitle");
    if (evoTitleEl) evoTitleEl.textContent = evoTitle;

    const tot = leaders.reduce((s, r) => s + r.emit_sd, 0);
    leaders.forEach((r, idx) => {
      r.rank = idx + 1;
      r.share = tot > 0 ? (r.emit_sd / tot) * 100 : null;
    });
    const top20 = leaders.slice(0, 20);
    leaders.filter((r) => r.esLS).forEach((ls) => {
      if (!top20.some((x) => x.cod === ls.cod)) top20.push(ls);
    });

    const dCols = [
      { key: "rank", label: "#", num: true },
      { key: "nombre", label: "Compañía", num: false, render: (r) => `${esc(r.nombre)} ${r.esLS ? '<span class="badge badge-ls">LS</span>' : ""}` },
      { key: "emit_sd", label: `Emit. SD (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.emit_sd) },
      { key: "share", label: "Share %", num: true, render: (r) => fmtPct(r.share) },
      { key: "yoy", label: "YoY %", num: true, render: (r) => `<span class="${pctClass(r.yoy)}">${fmtSignedPct(r.yoy)}</span>` },
      { key: "sin_pct", label: "Sin. %", num: true, render: (r) => fmtPct(r.sin_pct) },
      { key: "gprod_pct", label: "G. Prod. %", title: "Gastos de Producción / Primas Devengadas", num: true, render: (r) => fmtPct(r.gprod_pct) },
      { key: "gexpl_pct", label: "G. Expl. %", title: "Gastos de Explotación (brutos) / Primas Devengadas", num: true, render: (r) => fmtPct(r.gexpl_pct) },
      { key: "gto_pct", label: "G. Neto %", title: "(G. Prod. + G. Expl. − G. a/c Reaseg.) / Primas Devengadas", num: true, render: (r) => fmtPct(r.gto_pct) },
      { key: "comb_pct", label: "Comb. %", num: true, render: (r) => fmtPct(r.comb_pct) },
    ];
    renderSortableTable(
      document.getElementById("rmDrillTableWrap"),
      dCols,
      top20,
      { key: "rank", dir: "asc" },
      () => {},
      { highlightLS: true, rowIdKey: "cod", onRowClick: (cod) => openFichaEntity("CIA:" + cod) }
    );

    const div = unitDivisor();
    const rmEvoLabels = evoPoints.map((pt) => pt.label);
    const rmDrillDatasets = filterTimeSeriesOutliers(
      rmEvoLabels,
      [
        { type: "bar", label: `Emitidas (${unitSuffix()})`, data: evoPoints.map((pt) => pt.emit_sd / div), backgroundColor: "rgba(226,0,57,0.75)", borderRadius: 4, yAxisID: "y" },
        { type: "line", label: "Combinado %", data: evoPoints.map((pt) => pt.comb_pct), borderColor: BRAND.ink, tension: 0.25, borderWidth: 2.5, yAxisID: "y1" },
      ],
      { axisId: "y1", suffix: "%", extThreshold: 0.85, zThreshold: 3.5, maxDrops: 3 }
    );
    updateOutlierNote(
      "rmDrillEvoOutlierNote",
      rmDrillDatasets.dropped,
      (d) => `${d.series} (${d.period}: ${fmtPct(d.value, 1)})`,
      { single: "El valor real se conserva en los datos.", plural: "Los valores reales se conservan en los datos." }
    );
    destroyChart("chRmDrillEvo");
    setChartEmptyState("chRmDrillEvo", null);
    charts.chRmDrillEvo = new Chart(document.getElementById("chRmDrillEvo"), {
      data: {
        labels: rmEvoLabels,
        datasets: rmDrillDatasets.datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.yAxisID === "y1" ? chartPctTooltipLabel(ctx, 2) : chartMoneyTooltipLabel(ctx),
            },
          },
        },
        scales: {
          y: { position: "left", title: { display: true, text: `Emitidas (${unitSuffix()})` }, ticks: { callback: chartMoneyTick } },
          y1: { position: "right", title: { display: true, text: "Combinado %" }, grid: { drawOnChartArea: false }, ticks: { callback: chartPctTick } },
        },
      },
    });

    document.getElementById("btnExportRmDrill").onclick = () => {
      const uDec = unitDecimals();
      exportToCSV(
        csvFilename,
        dCols.map((c) => c.label),
        leaders.map((r) => dCols.map((c) => {
          const v = r[c.key];
          if (typeof v !== "number") return v ?? "";
          if (c.key === "rank" || c.key.endsWith("_pct") || c.key === "share" || c.key === "yoy") return v.toFixed(2);
          return (v / div).toFixed(uDec);
        }))
      );
    };
  }

  function renderSubramoDrill(pIdx, codSubramo, allowedCias, keepSubBlock) {
    const sr = SUBRAMOS.find((s) => s.cod === codSubramo);
    if (!sr) return;
    if (!keepSubBlock) {
      const subBlock = document.getElementById("rmSubDrillBlock");
      if (subBlock) subBlock.style.display = "none";
      const backBtn = document.getElementById("btnRmBackToRamo");
      if (backBtn) backBtn.style.display = "none";
    }
    const leaders = computeSubramoLeaders(pIdx, sr.idx, allowedCias);
    const evoStart = Math.max(0, pIdx - 11);
    const evoPoints = [];
    for (let q = evoStart; q <= pIdx; q++) {
      const qAllowed = new Set(getFilteredCompanies(q).map((c) => c.idx));
      const ag = computeSubramoAggregates(q, qAllowed, sr.cod_ramo).find((x) => x.cod === codSubramo);
      evoPoints.push({
        label: PERIODOS[q].label,
        emit_sd: ag ? ag.emit_sd : 0,
        comb_pct: ag ? ag.comb_pct : null,
      });
    }
    renderRmDrillPanel({
      pIdx,
      title: `Líderes del Subramo: ${sr.desc} (${sr.cod})`,
      leadersTitle: "Tabla de Líderes del Subramo",
      evoTitle: "Evolución 12 Trimestres del Subramo",
      leaders,
      evoPoints,
      csvFilename: `subramo_${codSubramo}_lideres_${PERIODOS[pIdx].id}.csv`,
    });
  }

  function renderRamoDrill(pIdx, codRamo, allowedCias) {
    const rm = RAMOS.find((r) => r.cod === codRamo);
    if (!rm) return;
    const subRows = computeSubramoAggregates(pIdx, allowedCias, codRamo).sort((a, b) => b.emit_sd - a.emit_sd);
    const subBlock = document.getElementById("rmSubDrillBlock");
    const backBtn = document.getElementById("btnRmBackToRamo");
    const hasMultiSub = subRows.length > 1;

    if (!hasMultiSub || !subRows.some((s) => s.cod === state.rmSelectedSubCod)) {
      state.rmSelectedSubCod = "";
    }

    if (hasMultiSub && subBlock) {
      subBlock.style.display = "block";
      document.getElementById("rmSubDrillTitle").textContent = `Subramos de ${rm.desc} (${rm.cod})`;
      const totRamo = subRows.reduce((s, x) => s + x.emit_sd, 0);
      subRows.forEach((s) => { s.ramo_share = totRamo > 0 ? (s.emit_sd / totRamo) * 100 : null; });

      const pillsEl = document.getElementById("rmSubPills");
      let pillsHtml = `<button type="button" class="rm-sub-pill ${state.rmSelectedSubCod === "" ? "active" : ""}" data-subcod="">Todos (${esc(rm.desc)})</button>`;
      subRows.forEach((s) => {
        pillsHtml += `<button type="button" class="rm-sub-pill ${state.rmSelectedSubCod === s.cod ? "active" : ""}" data-subcod="${esc(s.cod)}">${esc(s.desc)} (${fmtPct(s.ramo_share, 1)})</button>`;
      });
      pillsEl.innerHTML = pillsHtml;
      pillsEl.querySelectorAll("button[data-subcod]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.rmSelectedSubCod = btn.dataset.subcod;
          renderRamoDrill(pIdx, codRamo, allowedCias);
        });
      });

      const subCols = [
        { key: "cod", label: "Cód.", num: false },
        { key: "desc", label: "Subramo", num: false, render: (r) => `<strong>${esc(r.desc)}</strong>` },
        { key: "emit_sd", label: `Emit. SD (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.emit_sd) },
        { key: "ramo_share", label: "Share % Ramo", num: true, render: (r) => fmtPct(r.ramo_share) },
        { key: "yoy", label: "YoY %", num: true, render: (r) => `<span class="${pctClass(r.yoy)}">${fmtSignedPct(r.yoy)}</span>` },
        { key: "sin_pct", label: "Sin. %", num: true, render: (r) => fmtPct(r.sin_pct) },
        { key: "gprod_pct", label: "G. Prod. %", title: "Gastos de Producción / Primas Devengadas", num: true, render: (r) => fmtPct(r.gprod_pct) },
        { key: "gexpl_pct", label: "G. Expl. %", title: "Gastos de Explotación (brutos) / Primas Devengadas", num: true, render: (r) => fmtPct(r.gexpl_pct) },
        { key: "gto_pct", label: "G. Neto %", title: "(G. Prod. + G. Expl. − G. a/c Reaseg.) / Primas Devengadas", num: true, render: (r) => fmtPct(r.gto_pct) },
        { key: "comb_pct", label: "Comb. %", num: true, render: (r) => `<strong>${fmtPct(r.comb_pct)}</strong>` },
      ];
      renderSortableTable(
        document.getElementById("rmSubDrillTableWrap"),
        subCols,
        subRows,
        { key: "emit_sd", dir: "desc" },
        () => {},
        {
          rowIdKey: "cod",
          selectedRowId: state.rmSelectedSubCod || null,
          onRowClick: (subCod) => {
            state.rmSelectedSubCod = state.rmSelectedSubCod === subCod ? "" : subCod;
            renderRamoDrill(pIdx, codRamo, allowedCias);
          },
        }
      );
    } else if (subBlock) {
      subBlock.style.display = "none";
    }

    if (state.rmSelectedSubCod) {
      if (backBtn) {
        backBtn.style.display = "inline-flex";
        backBtn.onclick = () => {
          state.rmSelectedSubCod = "";
          renderRamoDrill(pIdx, codRamo, allowedCias);
        };
      }
      renderSubramoDrill(pIdx, state.rmSelectedSubCod, allowedCias, true);
      return;
    }

    if (backBtn) backBtn.style.display = "none";
    const leaders = computeRamoLeaders(pIdx, rm.idx, allowedCias);
    const evoStart = Math.max(0, pIdx - 11);
    const evoPoints = [];
    for (let q = evoStart; q <= pIdx; q++) {
      const qAllowed = new Set(getFilteredCompanies(q).map((c) => c.idx));
      const ag = computeRamoAggregates(q, qAllowed).find((x) => x.cod === codRamo);
      evoPoints.push({
        label: PERIODOS[q].label,
        emit_sd: ag ? ag.emit_sd : 0,
        comb_pct: ag ? ag.comb_pct : null,
      });
    }
    renderRmDrillPanel({
      pIdx,
      title: `Líderes del Ramo: ${rm.desc} (${rm.cod})`,
      leadersTitle: "Tabla de Líderes del Ramo",
      evoTitle: "Evolución 12 Trimestres del Ramo",
      leaders,
      evoPoints,
      csvFilename: `ramo_${codRamo}_lideres_${PERIODOS[pIdx].id}.csv`,
    });
  }

  function renderRamos() {
    const pIdx = state.pIdx;
    const allowedCias = new Set(getCompanyRowsForPeriod(pIdx, true).map((c) => c.cIdx));
    const monoTipoGran = (state.tipo === "Personas" || state.tipo === "Retiro" || state.tipo === "ART") ? state.tipo : "";
    const effGran = state.granRamo || state.rmGran || monoTipoGran;

    let ramoRows = computeRamoAggregates(pIdx, allowedCias);
    let subRows = computeSubramoAggregates(pIdx, allowedCias);
    if (effGran) {
      ramoRows = ramoRows.filter((r) => r.gran === effGran);
      subRows = subRows.filter((r) => r.gran === effGran);
    }

    const globalGranLocked = Boolean(state.granRamo);
    document.querySelectorAll("#rmGranFilterWrap .seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.gran === effGran);
      const disabled = globalGranLocked && b.dataset.gran !== effGran;
      b.disabled = disabled;
      b.title = disabled ? "Controlado por el filtro global «Ramo (Negocio)»" : "";
    });

    const btnLevelRamo = document.getElementById("btnRmLevelRamo");
    const btnLevelSub = document.getElementById("btnRmLevelSubramo");
    if (btnLevelRamo) {
      btnLevelRamo.textContent = `Por Ramo (${ramoRows.length})`;
      btnLevelRamo.classList.toggle("active", state.rmLevel === "ramo");
    }
    if (btnLevelSub) {
      btnLevelSub.textContent = `Por Subramo (${subRows.length})`;
      btnLevelSub.classList.toggle("active", state.rmLevel === "subramo");
    }

    const isSubMode = state.rmLevel === "subramo";
    const displayRows = isSubMode ? subRows : ramoRows;
    const totEmit = displayRows.reduce((s, r) => s + r.emit_sd, 0);
    displayRows.forEach((r) => {
      r.share = totEmit > 0 ? (r.emit_sd / totEmit) * 100 : null;
    });

    const granName = effGran ? (GRAN_LABELS[effGran] || effGran) : "Todo el Mercado";
    const hintEl = document.getElementById("rmLevelHint");
    if (hintEl) {
      hintEl.textContent = isSubMode
        ? `Mostrando ${subRows.length} subramos de ${granName}. Hacé click en cualquier subramo para ver líderes y evolución 12 trimestres.`
        : `Mostrando ${ramoRows.length} ramos de ${granName}. Cambiá a «Por Subramo» o hacé click en cualquier ramo para abrir sus subramos.`;
    }

    document.getElementById("rmMixTitle").textContent = isSubMode
      ? "Mix de Producción por Subramo (Top 12)"
      : "Mix de Producción por Ramo (Top 12)";
    document.getElementById("rmRatiosTitle").textContent = isSubMode
      ? "Siniestralidad vs Gastos por Subramo (Top 12)"
      : "Siniestralidad vs Gastos por Ramo (Top 12)";
    document.getElementById("rmTableTitle").textContent = isSubMode
      ? `Desglose del Mercado por Subramo (${subRows.length})`
      : `Desglose del Mercado por Ramo (${ramoRows.length})`;
    document.getElementById("rmTableSubtitle").textContent = isSubMode
      ? "Click en cualquier subramo de la tabla para ver el ranking de líderes y su evolución histórica abajo."
      : "Click en cualquier ramo de la tabla para ver sus subramos, el ranking de líderes y su evolución histórica abajo.";

    renderRmMixAndRatios(displayRows, isSubMode ? "Subramos" : "Ramos");
    const div = unitDivisor();

    if (isSubMode) {
      if (state.rmSort.key === "gran") state.rmSort = { key: "emit_sd", dir: "desc" };
      if (!subRows.some((r) => r.cod === state.rmSelectedSubCod)) {
        const matchRamo = subRows
          .filter((r) => r.cod_ramo === state.rmSelectedCod)
          .sort((a, b) => b.emit_sd - a.emit_sd);
        if (matchRamo.length > 0) {
          state.rmSelectedSubCod = matchRamo[0].cod;
        } else if (subRows.length > 0) {
          const topSub = subRows.slice().sort((a, b) => b.emit_sd - a.emit_sd)[0];
          state.rmSelectedSubCod = topSub.cod;
          state.rmSelectedCod = topSub.cod_ramo;
        } else {
          state.rmSelectedSubCod = "";
        }
      }

      const subCols = [
        { key: "cod", label: "Cód.", num: false },
        { key: "desc", label: "Subramo (Anexos 12-A/13-A/14-A)", num: false, render: (r) => `<strong>${esc(r.desc)}</strong>` },
        { key: "desc_ramo", label: "Ramo", num: false, render: (r) => `<span class="badge badge-type">${esc(r.desc_ramo)}</span>` },
        { key: "emit_sd", label: `Primas Emit. SD (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.emit_sd) },
        { key: "share", label: "Share %", num: true, render: (r) => fmtPct(r.share) },
        { key: "yoy", label: "YoY %", num: true, render: (r) => `<span class="${pctClass(r.yoy)}">${fmtSignedPct(r.yoy)}</span>` },
        { key: "prim_dev_sd", label: `Devengadas SD (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.prim_dev_sd) },
        { key: "sin_pct", label: "Siniestralidad %", num: true, render: (r) => fmtPct(r.sin_pct) },
        { key: "gprod_pct", label: "G. Prod. %", title: "Gastos de Producción / Primas Devengadas", num: true, render: (r) => fmtPct(r.gprod_pct) },
        { key: "gexpl_pct", label: "G. Expl. %", title: "Gastos de Explotación (brutos) / Primas Devengadas", num: true, render: (r) => fmtPct(r.gexpl_pct) },
        { key: "gto_pct", label: "G. Neto %", title: "(G. Prod. + G. Expl. − G. a/c Reaseg.) / Primas Devengadas", num: true, render: (r) => fmtPct(r.gto_pct) },
        { key: "comb_pct", label: "Combinado %", num: true, render: (r) => `<strong>${fmtPct(r.comb_pct)}</strong>` },
      ];

      const sortedSub = renderSortableTable(
        document.getElementById("rmTableWrap"),
        subCols,
        subRows,
        state.rmSort,
        () => renderRamos(),
        {
          rowIdKey: "cod",
          selectedRowId: state.rmSelectedSubCod || null,
          onRowClick: (cod) => {
            state.rmSelectedSubCod = cod;
            const srObj = SUBRAMOS.find((x) => x.cod === cod);
            if (srObj) state.rmSelectedCod = srObj.cod_ramo;
            document.querySelectorAll("#rmTableWrap tbody tr").forEach((tr) => {
              tr.classList.toggle("row-selected", tr.dataset.rowid === cod);
            });
            renderSubramoDrill(pIdx, cod, allowedCias, false);
          },
        }
      );

      if (sortedSub.length === 0) {
        document.getElementById("rmDrillTitle").textContent = "Sin subramos disponibles para el filtro actual";
        document.getElementById("rmSubDrillBlock").style.display = "none";
        document.getElementById("btnRmBackToRamo").style.display = "none";
        document.getElementById("rmDrillTableWrap").innerHTML = "";
        updateOutlierNote("rmDrillEvoOutlierNote", [], null);
        destroyChart("chRmDrillEvo");
        setChartEmptyState("chRmDrillEvo", "Sin evolución disponible", "No hay operaciones registradas para el filtro actual.");
      } else {
        renderSubramoDrill(pIdx, state.rmSelectedSubCod, allowedCias, false);
      }

      document.getElementById("btnExportRm").onclick = () => {
        const uDec = unitDecimals();
        exportToCSV(
          `subramos_${PERIODOS[pIdx].id}.csv`,
          subCols.map((c) => c.label),
          sortedSub.map((r) => subCols.map((c) => typeof r[c.key] === "number" ? (c.key.endsWith("_pct") || c.key === "share" || c.key === "yoy" ? r[c.key].toFixed(2) : (r[c.key] / div).toFixed(uDec)) : (r[c.key] ?? "")))
        );
      };
      return;
    }

    if (state.rmSort.key === "desc_ramo") state.rmSort = { key: "emit_sd", dir: "desc" };
    if (!ramoRows.some((r) => r.cod === state.rmSelectedCod) && ramoRows.length > 0) {
      state.rmSelectedCod = ramoRows.slice().sort((a, b) => b.emit_sd - a.emit_sd)[0].cod;
    }

    const cols = [
      { key: "cod", label: "Cód.", num: false },
      {
        key: "desc",
        label: "Ramo (Anexos 12-A/13-A/14-A)",
        num: false,
        render: (r) => {
          const nSub = (subramosByRamo.get(r.cod) || []).length;
          const badge = nSub > 1 ? `<span class="sub-count-badge">${nSub} subramos</span>` : "";
          return `<strong>${esc(r.desc)}</strong>${badge}`;
        },
      },
      { key: "gran", label: "Gran Ramo", num: false, render: (r) => `<span class="badge badge-type">${esc(r.gran)}</span>` },
      { key: "emit_sd", label: `Primas Emit. SD (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.emit_sd) },
      { key: "share", label: "Share %", num: true, render: (r) => fmtPct(r.share) },
      { key: "yoy", label: "YoY %", num: true, render: (r) => `<span class="${pctClass(r.yoy)}">${fmtSignedPct(r.yoy)}</span>` },
      { key: "prim_dev_sd", label: `Devengadas SD (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.prim_dev_sd) },
      { key: "sin_pct", label: "Siniestralidad %", num: true, render: (r) => fmtPct(r.sin_pct) },
      { key: "gprod_pct", label: "G. Prod. %", title: "Gastos de Producción / Primas Devengadas", num: true, render: (r) => fmtPct(r.gprod_pct) },
      { key: "gexpl_pct", label: "G. Expl. %", title: "Gastos de Explotación (brutos) / Primas Devengadas", num: true, render: (r) => fmtPct(r.gexpl_pct) },
      { key: "gto_pct", label: "G. Neto %", title: "(G. Prod. + G. Expl. − G. a/c Reaseg.) / Primas Devengadas", num: true, render: (r) => fmtPct(r.gto_pct) },
      { key: "comb_pct", label: "Combinado %", num: true, render: (r) => `<strong>${fmtPct(r.comb_pct)}</strong>` },
    ];

    const sortedRamos = renderSortableTable(
      document.getElementById("rmTableWrap"),
      cols,
      ramoRows,
      state.rmSort,
      () => renderRamos(),
      {
        rowIdKey: "cod",
        selectedRowId: state.rmSelectedCod || null,
        onRowClick: (cod) => {
          state.rmSelectedCod = cod;
          state.rmSelectedSubCod = "";
          document.querySelectorAll("#rmTableWrap tbody tr").forEach((tr) => {
            tr.classList.toggle("row-selected", tr.dataset.rowid === cod);
          });
          renderRamoDrill(pIdx, cod, allowedCias);
        },
      }
    );

    if (sortedRamos.length === 0) {
      document.getElementById("rmDrillTitle").textContent = "Sin ramos disponibles para el filtro actual";
      document.getElementById("rmSubDrillBlock").style.display = "none";
      document.getElementById("btnRmBackToRamo").style.display = "none";
      document.getElementById("rmDrillTableWrap").innerHTML = "";
      updateOutlierNote("rmDrillEvoOutlierNote", [], null);
      destroyChart("chRmDrillEvo");
      setChartEmptyState("chRmDrillEvo", "Sin evolución disponible", "No hay operaciones registradas para el filtro actual.");
    } else {
      renderRamoDrill(pIdx, state.rmSelectedCod, allowedCias);
    }

    document.getElementById("btnExportRm").onclick = () => {
      const uDec = unitDecimals();
      exportToCSV(
        `ramos_${PERIODOS[pIdx].id}.csv`,
        cols.map((c) => c.label),
        sortedRamos.map((r) => cols.map((c) => typeof r[c.key] === "number" ? (c.key.endsWith("_pct") || c.key === "share" || c.key === "yoy" ? r[c.key].toFixed(2) : (r[c.key] / div).toFixed(uDec)) : (r[c.key] ?? "")))
      );
    };
  }

  function renderLookerGrid(pIdx, segIds, gridId, exportBtnId, csvPrefix) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = "";
    const allExportRows = [];

    segIds.forEach((segId) => {
      const seg = SUBRAMOS_PR.find((s) => s.id === segId);
      if (!seg) return;
      const segData = computePrSegmentRows(pIdx, segId);
      const { rows, totCur, totPrev, totSinPct, totGtoPct, totCombPct } = segData;
      const totYoY = totPrev != null ? calcYoY(totCur, totPrev) : null;
      const showRatios = seg.gran === "Personas";

      if (!state.lookerSort[segId]) state.lookerSort[segId] = { key: "emit_sd", dir: "desc" };
      if (!state.lookerLimit[segId]) state.lookerLimit[segId] = 10;
      if (state.lookerSearch[segId] == null) state.lookerSearch[segId] = "";
      if (!state.lookerColWidths[segId]) state.lookerColWidths[segId] = {};

      rows.forEach((r) => {
        allExportRows.push([
          seg.label,
          r.rank,
          r.cod,
          r.nombre,
          r.emit_prev != null ? Math.round(r.emit_prev * 1000) : "",
          Math.round(r.emit_sd * 1000),
          r.yoy != null ? r.yoy.toFixed(2) : "",
          r.share != null ? r.share.toFixed(2) : "",
          r.sin_pct != null ? r.sin_pct.toFixed(2) : "",
          r.gto_pct != null ? r.gto_pct.toFixed(2) : "",
          r.comb_pct != null ? r.comb_pct.toFixed(2) : "",
        ]);
      });

      const cols = [
        { key: "rank", label: "#", num: true },
        { key: "nombre", label: "Empresa", num: false, render: (r) => `${esc(r.nombre)} ${r.esLS ? '<span class="badge badge-ls">LS</span>' : ""}` },
        { key: "emit_prev", label: "Prima Emit. Ej. Ant.", num: true, render: (r) => fmtPesosExact(r.emit_prev) },
        { key: "emit_sd", label: "Prima Emitida", num: true, render: (r) => fmtPesosExact(r.emit_sd) },
        { key: "yoy", label: "Crec. YoY", num: true, render: (r) => `<span class="${pctClass(r.yoy)}">${fmtSignedPct(r.yoy, 2)}</span>` },
        { key: "share", label: "Share %", num: true, render: (r) => fmtPct(r.share) },
      ];
      if (showRatios) {
        cols.push(
          { key: "sin_pct", label: "Sin. %", num: true, render: (r) => fmtPct(r.sin_pct) },
          { key: "gto_pct", label: "Gtos %", num: true, render: (r) => fmtPct(r.gto_pct) },
          { key: "comb_pct", label: "Comb. %", num: true, render: (r) => `<strong>${fmtPct(r.comb_pct)}</strong>` }
        );
      }

      const card = document.createElement("div");
      card.className = "card full-span";
      card.style.marginBottom = "0";
      card.innerHTML = `
        <div class="card-header">
          <div>
            <h4 class="card-title">${esc(seg.label)} (${esc(seg.gran)})</h4>
            <p class="card-subtitle">Total Mercado: <strong>${fmtPesosExact(totCur)}</strong> (YoY: <span class="${pctClass(totYoY)}">${fmtSignedPct(totYoY)}</span>) · ${rows.length} compañías operantes</p>
          </div>
          <div class="card-header-right">
            <div class="looker-card-controls">
              <input type="text" class="inline-input looker-search" placeholder="Filtrar empresa..." style="width:165px" value="${esc(state.lookerSearch[segId])}" />
              <select class="inline-input looker-limit">
                <option value="10" ${state.lookerLimit[segId] === 10 ? "selected" : ""}>Top 10 + LS</option>
                <option value="20" ${state.lookerLimit[segId] === 20 ? "selected" : ""}>Top 20 + LS</option>
                <option value="30" ${state.lookerLimit[segId] === 30 ? "selected" : ""}>Top 30 + LS</option>
                <option value="999" ${state.lookerLimit[segId] >= 999 ? "selected" : ""}>Todas (${rows.length})</option>
              </select>
            </div>
          </div>
        </div>
        <div class="table-wrap table-resizable"></div>
      `;
      grid.appendChild(card);

      const wrap = card.querySelector(".table-wrap");
      const searchEl = card.querySelector(".looker-search");
      const limitEl = card.querySelector(".looker-limit");

      const footerRow = {
        rank: "—",
        nombre: "TOTAL DE MERCADO",
        emit_prev: fmtPesosExact(totPrev),
        emit_sd: fmtPesosExact(totCur),
        yoy: `<span class="${pctClass(totYoY)}">${fmtSignedPct(totYoY, 2)}</span>`,
        share: "100,00%",
      };
      if (showRatios) {
        footerRow.sin_pct = fmtPct(totSinPct);
        footerRow.gto_pct = fmtPct(totGtoPct);
        footerRow.comb_pct = `<strong>${fmtPct(totCombPct)}</strong>`;
      }

      const renderSegTable = () => {
        const q = normSearch(state.lookerSearch[segId] || "");
        const lim = Number(state.lookerLimit[segId] || 10);
        let pool;
        if (q) {
          pool = rows.filter((r) => normSearch(r.nombre + " " + r.cod).includes(q));
        } else if (lim >= 999) {
          pool = rows.slice();
        } else {
          pool = rows.slice(0, lim);
          rows.filter((r) => r.esLS).forEach((lsRow) => {
            if (!pool.some((x) => x.cod === lsRow.cod)) pool.push(lsRow);
          });
        }
        renderSortableTable(
          wrap,
          cols,
          pool,
          state.lookerSort[segId],
          (nextSort) => {
            state.lookerSort[segId] = nextSort;
            renderSegTable();
          },
          {
            highlightLS: true,
            rowIdKey: "cod",
            onRowClick: (cod) => openFichaEntity("CIA:" + cod),
            footerRow,
          }
        );
        attachResizableColumns(wrap, state.lookerColWidths[segId]);
      };

      searchEl.addEventListener("input", (e) => {
        state.lookerSearch[segId] = e.target.value;
        renderSegTable();
      });
      limitEl.addEventListener("change", (e) => {
        state.lookerLimit[segId] = Number(e.target.value);
        renderSegTable();
      });

      renderSegTable();
    });

    attachExpandButtons(grid);
    const expBtn = document.getElementById(exportBtnId);
    if (expBtn) {
      expBtn.onclick = () => {
        exportToCSV(
          `${csvPrefix}_${PERIODOS[pIdx].id}.csv`,
          ["Segmento", "Ranking", "Cod", "Empresa", "Prima Ant ($)", "Prima Actual ($)", "Crec YoY %", "Share %", "Sin %", "Gtos %", "Comb %"],
          allExportRows
        );
      };
    }
  }

  // ==================== BENCHMARKS Y SUBRAMOS PERSONAS / RETIRO (pr_subq) ====================
  function enrichPrSubRatios(m) {
    const pasTec = (m.deudas_aseg || 0) + (m.comp_tec || 0);
    const pd = m.prim_dev || 0;
    const compTec = m.comp_tec || 0;
    m.pas_tec = pasTec;
    m.flujo_neto = (m.emit_sd || 0) - (m.rescates || 0) - (m.rentas || 0);
    m.egresos_ret = (m.rescates || 0) + (m.rentas || 0);

    m.sin_pct = pd > 0 ? (m.sin_dev / pd) * 100 : null;
    m.gprod_pct = pd > 0 ? (m.g_prod / pd) * 100 : null;
    m.gexpl_pct = pd > 0 ? (m.g_expl / pd) * 100 : null;
    m.gto_pct = pd > 0 ? (m.g_tot / pd) * 100 : null;
    m.comb_pct = pd > 0 ? ((m.sin_dev + m.g_tot) / pd) * 100 : null;
    m.rt_pct = pd > 0 ? (m.res_tec / pd) * 100 : null;

    m.calle_pct = m.emit_sd > 0 ? ((m.prem_cob || 0) / m.emit_sd) * 100 : null;
    m.sin_pend_pct = m.sin_dev > 0 ? ((m.deudas_aseg || 0) / m.sin_dev) * 100 : null;

    m.gprod_emit_pct = m.emit_sd > 0 ? ((m.g_prod || 0) / m.emit_sd) * 100 : null;
    m.gexpl_pt_pct = pasTec > 0 ? ((m.g_expl || 0) / pasTec) * 100 : null;
    m.gexpl_emit_pct = m.emit_sd > 0 ? ((m.g_expl || 0) / m.emit_sd) * 100 : null;
    m.rt_pas_tec_pct = pasTec > 0 ? ((m.res_tec || 0) / pasTec) * 100 : null;
    m.transf_pt_pct = pasTec > 0 ? ((m.otros_ing || 0) / pasTec) * 100 : null;

    m.primas_res_pct = compTec > 0 ? ((m.emit_sd || 0) / compTec) * 100 : null;
    m.resc_res_pct = compTec > 0 ? ((m.rescates || 0) / compTec) * 100 : null;
    m.resc_emit_pct = m.emit_sd > 0 ? ((m.rescates || 0) / m.emit_sd) * 100 : null;
    m.rentas_res_pct = compTec > 0 ? ((m.rentas || 0) / compTec) * 100 : null;
    m.egresos_res_pct = compTec > 0 ? (m.egresos_ret / compTec) * 100 : null;
    m.flujo_neto_res_pct = compTec > 0 ? (m.flujo_neto / compTec) * 100 : null;

    // SINENSUP #3: Canales implícitos vía Comisiones (4.01.06)
    const comPas = m.com_pas || 0;
    const comInst = m.com_inst || 0;
    const comOtros = m.com_otros || 0;
    const comTot = comPas + comInst + comOtros;
    m.com_tot = comTot;
    m.com_pas_share = comTot > 0 ? (comPas / comTot) * 100 : null;
    m.com_inst_share = comTot > 0 ? (comInst / comTot) * 100 : null;
    m.com_otros_share = comTot > 0 ? (comOtros / comTot) * 100 : null;
    m.tasa_com_pas = m.emit_sd > 0 ? (comPas / m.emit_sd) * 100 : null;
    m.tasa_com_inst = m.emit_sd > 0 ? (comInst / m.emit_sd) * 100 : null;
    m.tasa_com_tot = m.emit_sd > 0 ? ((comPas + comInst) / m.emit_sd) * 100 : null;

    // SINENSUP #4: Judicialización y Suficiencia de Reservas (2.01.01.01)
    const spAdmin = m.sp_admin || 0;
    const spJuic = m.sp_juic || 0;
    const spMed = m.sp_med || 0;
    const spLiq = m.sp_liq || 0;
    const spIbnr = m.sp_ibnr || 0;
    const spReas = m.sp_reas || 0;
    const spBruto = spAdmin + spJuic + spMed + spLiq + spIbnr;
    const spLitigio = spJuic + spMed;
    m.sp_bruto = spBruto;
    m.sp_litigio = spLitigio;
    m.sp_neto = spBruto - spReas;
    m.jud_pct = spBruto > 0 ? (spLitigio / spBruto) * 100 : null;
    m.juic_pct = spBruto > 0 ? (spJuic / spBruto) * 100 : null;
    m.med_pct = spBruto > 0 ? (spMed / spBruto) * 100 : null;
    m.ibnr_res_pct = spBruto > 0 ? (spIbnr / spBruto) * 100 : null;
    m.ibnr_sin_pct = (m.sin_dev || 0) > 0 ? (spIbnr / m.sin_dev) * 100 : null;
    m.reas_res_pct = spBruto > 0 ? (spReas / spBruto) * 100 : null;
    m.res_sin_dev_pct = (m.sin_dev || 0) > 0 ? (spBruto / m.sin_dev) * 100 : null;

    // SINENSUP #5: Política y Eficiencia de Reaseguro
    const ced = m.cedidas || 0;
    const sinRecReas = m.sin_rec_reas || 0;
    const partUtilReas = m.part_util_reas || 0;
    const recupTotReas = sinRecReas + (m.g_reas || 0) + partUtilReas;
    m.cesion_pct = m.emit_sd > 0 ? (ced / m.emit_sd) * 100 : null;
    m.retencion_pct = m.cesion_pct != null ? (100 - m.cesion_pct) : null;
    m.com_reas_pct = ced > 0 ? ((m.g_reas || 0) / ced) * 100 : null;
    m.lr_cedido_pct = ced > 0 ? (sinRecReas / ced) * 100 : null;
    m.recup_total_reas = recupTotReas;
    m.recup_total_reas_pct = ced > 0 ? (recupTotReas / ced) * 100 : null;
    m.saldo_neto_reas = recupTotReas - ced;
    return m;
  }

  function computePrSubCompanyRows(pIdx, srIdxList, opts = {}) {
    if (!srIdxList || srIdxList.length === 0) return { rows: [], prevMktEmit: null, prevMktRes: null };
    const includeYoY = opts.includeYoY !== false && canCompareYoY(pIdx, state.base);
    const mergeCorp = Boolean(opts.mergeCorp);
    const onlyTipo = opts.onlyTipo || null;
    const exclCods = opts.exclCods || null;
    const sOff = PR_SUBQ_IDX.prem_cob;
    const fOff = PR_SUBQ_IDX.emit_tot;
    const nSt = PR_SUB_STOCK_KEYS.length;
    const nFl = PR_SUB_FLOW_KEYS.length;

    const mapCache = new Map();
    function getMapAt(q) {
      if (mapCache.has(q)) return mapCache.get(q);
      const m = new Map();
      srIdxList.forEach((srIdx) => {
        const list = prSubByPSR.get(q + "|" + srIdx);
        if (!list) return;
        list.forEach((row) => {
          const cIdx = row[1];
          const c = COMPANIAS[cIdx];
          if (onlyTipo && c.tipo !== onlyTipo) return;
          if (exclCods && exclCods.has(c.cod)) return;
          let rec = m.get(cIdx);
          if (!rec) {
            rec = { stock: new Array(nSt).fill(0), flow: new Array(nFl).fill(0) };
            m.set(cIdx, rec);
          }
          for (let i = 0; i < nSt; i++) rec.stock[i] += row[sOff + i] || 0;
          for (let i = 0; i < nFl; i++) rec.flow[i] += row[fOff + i] || 0;
        });
      });
      mapCache.set(q, m);
      return m;
    }

    function activeCiasForWindow(qEnd, baseEff) {
      const s = new Set();
      getMapAt(qEnd).forEach((_, k) => s.add(k));
      if (baseEff === "estanco" && PERIODOS[qEnd].trim !== 1 && qEnd >= 1) {
        getMapAt(qEnd - 1).forEach((_, k) => s.add(k));
      } else if (baseEff === "ltm" && qEnd >= 4) {
        for (let k = 1; k < 4; k++) getMapAt(qEnd - k).forEach((_, id) => s.add(id));
      }
      return s;
    }

    function evalPeriodEmitAndRes(qEnd) {
      const { base } = resolveBaseAndMeses(qEnd, state.base);
      const fStock = state.moneda === "const" ? PERIODOS[qEnd].factor_latest : 1.0;
      const ciaIds = activeCiasForWindow(qEnd, base);
      const outMap = new Map();
      let totEmit = 0;
      let totRes = 0;
      ciaIds.forEach((cIdx) => {
        const stRaw = getMapAt(qEnd).get(cIdx)?.stock;
        const compTec = stRaw ? stRaw[2] * fStock : 0;
        const fv = computeFlowVector(qEnd, base, state.moneda, (q) => getMapAt(q).get(cIdx)?.flow || null, nFl);
        const emitSd = fv ? fv[1] : 0;
        if (Math.abs(emitSd) >= 0.01 || Math.abs(compTec) >= 0.01) {
          outMap.set(cIdx, { emit_sd: emitSd, comp_tec: compTec });
          totEmit += emitSd;
          totRes += compTec;
        }
      });
      return { outMap, totEmit, totRes };
    }

    let prevMap = null;
    let prevMktEmit = null;
    let prevMktRes = null;
    if (includeYoY) {
      const prevEval = evalPeriodEmitAndRes(pIdx - 4);
      prevMap = prevEval.outMap;
      prevMktEmit = prevEval.totEmit;
      prevMktRes = prevEval.totRes;
    }

    const { base } = resolveBaseAndMeses(pIdx, state.base);
    const fStock = state.moneda === "const" ? PERIODOS[pIdx].factor_latest : 1.0;
    const curCias = activeCiasForWindow(pIdx, base);
    const rows = [];

    curCias.forEach((cIdx) => {
      const stRaw = getMapAt(pIdx).get(cIdx)?.stock;
      const stockVec = stRaw ? stRaw.map((v) => v * fStock) : new Array(nSt).fill(0);
      const flowVec = computeFlowVector(pIdx, base, state.moneda, (q) => getMapAt(q).get(cIdx)?.flow || null, nFl) || new Array(nFl).fill(0);
      const hasStock = stockVec.some((v) => Math.abs(v) >= 0.01);
      const hasFlow = flowVec.some((v) => Math.abs(v) >= 0.01);
      if (!hasStock && !hasFlow) return;

      const c = COMPANIAS[cIdx];
      const rec = {
        cIdx,
        cod: c.cod,
        nombre: c.nombre,
        tipo: c.tipo,
        grupo: c.grupo,
        esLS: c.ls,
      };
      PR_SUB_STOCK_KEYS.forEach((k, i) => { rec[k] = stockVec[i]; });
      PR_SUB_FLOW_KEYS.forEach((k, i) => { rec[k] = flowVec[i]; });

      const prv = prevMap ? prevMap.get(cIdx) : null;
      rec.emit_prev = prv ? prv.emit_sd : null;
      rec.comp_tec_prev = prv ? prv.comp_tec : null;
      rec.emit_yoy = prv ? calcYoY(rec.emit_sd, prv.emit_sd) : null;
      rec.comp_tec_yoy = prv ? calcYoY(rec.comp_tec, prv.comp_tec) : null;

      if (mergeCorp) {
        const corp = getCompanyMetrics(pIdx, cIdx, state.base, state.moneda);
        rec._corp = corp;
        ["inv", "res_fin", "recpam", "res_ej", "pn", "ret_inv_pct", "ret_inv_sin_recpam_pct", "roe_pct", "dep_pct", "solv_liq_pct", "cobertura_pct", "apalanc"].forEach((k) => {
          rec[k] = corp ? corp[k] : null;
        });
      }

      rows.push(enrichPrSubRatios(rec));
    });

    return { rows, prevMktEmit, prevMktRes };
  }

  function aggregatePrSubRows(rows, prevOverride = null) {
    const acc = { n_cias: rows.length };
    PR_SUB_STOCK_KEYS.forEach((k) => { acc[k] = 0; });
    PR_SUB_FLOW_KEYS.forEach((k) => { acc[k] = 0; });
    let sumEmitPrev = 0;
    let hasEmitPrev = false;
    let sumResPrev = 0;
    let hasResPrev = false;

    rows.forEach((r) => {
      PR_SUB_STOCK_KEYS.forEach((k) => { acc[k] += (r[k] || 0); });
      PR_SUB_FLOW_KEYS.forEach((k) => { acc[k] += (r[k] || 0); });
      if (r.emit_prev != null) {
        sumEmitPrev += r.emit_prev;
        hasEmitPrev = true;
      }
      if (r.comp_tec_prev != null) {
        sumResPrev += r.comp_tec_prev;
        hasResPrev = true;
      }
    });

    acc.emit_prev = (prevOverride && prevOverride.emit_prev !== undefined)
      ? prevOverride.emit_prev
      : (hasEmitPrev ? sumEmitPrev : null);
    acc.comp_tec_prev = (prevOverride && prevOverride.comp_tec_prev !== undefined)
      ? prevOverride.comp_tec_prev
      : (hasResPrev ? sumResPrev : null);
    acc.emit_yoy = calcYoY(acc.emit_sd, acc.emit_prev);
    acc.comp_tec_yoy = calcYoY(acc.comp_tec, acc.comp_tec_prev);
    return enrichPrSubRatios(acc);
  }

  function buildThreeWayBenchmark(resObj, lsCod, topSortKey = "emit_sd") {
    const sorted = resObj.rows.slice().sort((a, b) => {
      const va = a[topSortKey] || 0;
      const vb = b[topSortKey] || 0;
      if (Math.abs(vb - va) > 1e-6) return vb - va;
      return ((b.emit_sd || 0) - (a.emit_sd || 0))
        || ((b.comp_tec || 0) - (a.comp_tec || 0))
        || ((b.deudas_aseg || 0) - (a.deudas_aseg || 0))
        || a.nombre.localeCompare(b.nombre, "es");
    });

    const totEmit = sorted.reduce((s, r) => s + (r.emit_sd || 0), 0);
    const totRes = sorted.reduce((s, r) => s + (r.comp_tec || 0), 0);
    sorted.forEach((r, idx) => {
      r.rank = idx + 1;
      r.share_emit = totEmit > 0 ? (r.emit_sd / totEmit) * 100 : null;
      r.share_res = totRes > 0 ? (r.comp_tec / totRes) * 100 : null;
    });

    const top10Rows = sorted.slice(0, Math.min(10, sorted.length));
    const mkt = aggregatePrSubRows(sorted, { emit_prev: resObj.prevMktEmit, comp_tec_prev: resObj.prevMktRes });
    const top10 = aggregatePrSubRows(top10Rows);
    const ls = sorted.find((r) => r.cod === lsCod) || null;

    top10.share_emit = totEmit > 0 ? (top10.emit_sd / totEmit) * 100 : null;
    top10.share_res = totRes > 0 ? (top10.comp_tec / totRes) * 100 : null;
    mkt.share_top10_emit = top10.share_emit;
    mkt.share_top10_res = top10.share_res;
    if (ls) {
      ls.share_emit = totEmit > 0 ? (ls.emit_sd / totEmit) * 100 : null;
      ls.share_res = totRes > 0 ? (ls.comp_tec / totRes) * 100 : null;
    }
    return { mkt, top10, ls, top10Rows, allRows: sorted, totEmit, totRes };
  }

  function fmtDeltaBadge(lsVal, refVal, invertGoodBad = false, unit = "pp", dec = 1, refTag = "Top 10") {
    if (lsVal == null || refVal == null || !Number.isFinite(lsVal) || !Number.isFinite(refVal)) return "";
    const diff = lsVal - refVal;
    const isNeutral = Math.abs(diff) < 0.05;
    const cls = isNeutral ? "" : ((invertGoodBad ? diff < 0 : diff > 0) ? "pos" : "neg");
    const sign = diff > 0 ? "+" : "";
    const valStr = diff.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return `<span class="bench-delta ${cls}" title="Brecha La Segunda vs ${esc(refTag)}">${sign}${valStr} ${esc(unit)} vs ${esc(refTag)}</span>`;
  }

  function renderBenchmarkKpiGrid(containerId, cards) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = cards.map((c) => `
      <div class="kpi-card bench-card ${c.accent || ""}">
        <div class="kpi-label">${esc(c.label)}</div>
        <div class="bench-hero">
          <div class="bench-hero-main">
            <span class="bench-ls-tag">${esc(c.lsTag || "La Segunda")}</span>
            <span class="kpi-value num">${esc(c.lsVal)}</span>
          </div>
          ${c.lsBadgeHtml || ""}
        </div>
        <div class="bench-hero-sub">${c.lsSub || ""}</div>
        <div class="bench-rows">
          <div class="bench-row">
            <span class="bench-row-lbl">${esc(c.top10Label || "Top 10")}</span>
            <span class="bench-row-val">
              <span>${esc(c.top10Val)}</span>
              ${c.top10Sub ? `<span class="bench-row-sub">(${c.top10Sub})</span>` : ""}
            </span>
          </div>
          <div class="bench-row">
            <span class="bench-row-lbl">${esc(c.mktLabel || "Mercado")}</span>
            <span class="bench-row-val">
              <span>${esc(c.mktVal)}</span>
              ${c.mktSub ? `<span class="bench-row-sub">(${c.mktSub})</span>` : ""}
            </span>
          </div>
        </div>
      </div>
    `).join("");
    attachExpandButtons(el);
  }

  function renderCorpBenchmarkTable(containerId, mktCorp, top10Corp, lsCorp, isRetiro, lsColLabel) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const fmtDelta = (lsV, t10V, kind, inv) => {
      if (lsV == null || t10V == null || !Number.isFinite(lsV) || !Number.isFinite(t10V)) return "—";
      if (kind === "money") return "—";
      if (kind === "solv_d" && (lsV > 9999 || t10V > 9999)) return "—";
      const d = lsV - t10V;
      const cls = Math.abs(d) < 0.01 ? "neu" : ((inv ? d < 0 : d > 0) ? "pos" : "neg");
      const sign = d > 0 ? "+" : "";
      const suf = kind === "x" ? "x" : " pp";
      const dec = kind === "x" || kind === "pp2" ? 2 : 1;
      return `<span class="${cls}">${sign}${d.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}${suf}</span>`;
    };
    const renderVal = (obj, key, kind, useSignedCls) => {
      if (!obj) return "—";
      const v = obj[key];
      if (v == null || !Number.isFinite(v)) return "—";
      let txt;
      if (kind === "money") txt = fmtMoney(v);
      else if (kind === "solv_d") txt = fmtSolvLiq(v, 1);
      else if (kind === "x") txt = fmtDec(v, 2) + "x";
      else txt = fmtPct(v, kind === "pp2" ? 2 : 1);
      return useSignedCls ? `<span class="${pctClass(v)}">${txt}</span>` : txt;
    };

    const gProdRatioKey = isRetiro ? "gprod_emit_pct" : "gprod_pct";
    const gExplRatioKey = isRetiro ? "gexpl_pt_pct" : "gexpl_pct";
    const prepExtras = (obj) => {
      if (!obj) return null;
      const den = isRetiro ? obj.pas_tec : obj.prim_dev;
      const gExplOtros = (obj.g_expl || 0) - (obj.g_sueldos || 0) - (obj.g_imp || 0) - (obj.g_hon || 0) - (obj.g_pub || 0) - (obj.g_dir || 0);
      return {
        ...obj,
        recpam_inv_pct: obj.inv > 0 ? (obj.recpam / obj.inv) * 100 : null,
        g_sueldos_r_pct: den > 0 ? (obj.g_sueldos / den) * 100 : null,
        g_imp_r_pct: den > 0 ? (obj.g_imp / den) * 100 : null,
        g_hon_r_pct: den > 0 ? (obj.g_hon / den) * 100 : null,
        g_pub_r_pct: den > 0 ? (obj.g_pub / den) * 100 : null,
        g_otros_r_pct: den > 0 ? (gExplOtros / den) * 100 : null,
      };
    };
    const mC = prepExtras(mktCorp);
    const tC = prepExtras(top10Corp);
    const lC = prepExtras(lsCorp);

    const gExplDenTag = isRetiro ? "% s/ PT" : "% s/ Dev.";
    const gProdDenTag = isRetiro ? "% s/ Emit." : "% s/ Dev.";

    const spec = [
      { type: "sec", label: "CARTERA FINANCIERA Y RENTABILIDAD (NIVEL ENTIDAD)" },
      { label: "Inversiones Totales (Anexo 2)", key: "inv", kind: "money" },
      { label: "Retorno s/ Inv. (incl. RECPAM) %", key: "ret_inv_pct", kind: "pp2", signed: true },
      { label: "Retorno s/ Inv. sin RECPAM %", key: "ret_inv_sin_recpam_pct", kind: "pp2", signed: true },
      { label: "RECPAM (% s/ Inversiones)", key: "recpam_inv_pct", kind: "pp2", signed: true },
      { label: "Resultado del Ejercicio", key: "res_ej", kind: "money", signed: true },
      { label: "ROE del Período % (Res. Ej. / PN)", key: "roe_pct", kind: "pp2", signed: true },
      { label: "Patrimonio Neto", key: "pn", kind: "money" },
      { type: "sec", label: "INDICADORES DE SOLVENCIA SSN (C, D, E)" },
      { label: "Ind. C — Grado Dependencia % (Créd./Act.)", key: "dep_pct", kind: "pp1", inv: true },
      { label: "Ind. D — Solvencia Líquida % (Disp.+Inv./Ds.Aseg.)", key: "solv_liq_pct", kind: "solv_d" },
      { label: "Ind. E — Cobertura % (Disp.+Inv.+Inm./Pas.Téc.)", key: "cobertura_pct", kind: "pp1" },
      { label: "Apalancamiento (Pasivo / PN)", key: "apalanc", kind: "x", inv: true },
      { type: "sec", label: `DESGLOSE DE GASTOS ANEXO 14 (${isRetiro ? "PROD. s/ EMIT. · EXPL. s/ PT" : "% s/ DEVENGADAS"})` },
      { label: `Total Gastos de Producción (${gProdDenTag})`, key: gProdRatioKey, kind: "pp2", inv: true, bold: true },
      { label: `Total Gastos de Explotación (${gExplDenTag})`, key: gExplRatioKey, kind: "pp2", inv: true, bold: true },
      { label: `  · Sueldos y Cargas Sociales (${gExplDenTag})`, key: "g_sueldos_r_pct", kind: "pp2", inv: true },
      { label: `  · Impuestos, Tasas y Contrib. (${gExplDenTag})`, key: "g_imp_r_pct", kind: "pp2", inv: true },
      { label: `  · Honorarios (${gExplDenTag})`, key: "g_hon_r_pct", kind: "pp2", inv: true },
      { label: `  · Publicidad y Propaganda (${gExplDenTag})`, key: "g_pub_r_pct", kind: "pp2", inv: true },
      { label: `  · Otros G. Explotación y Dir. (${gExplDenTag})`, key: "g_otros_r_pct", kind: "pp2", inv: true },
    ];

    let html = `<table class="data-table table-compact"><thead><tr>
      <th>Concepto</th><th class="num">Mercado</th><th class="num">Top 10</th><th class="num col-ls">${esc(lsColLabel || "La Segunda")}</th><th class="num">Δ vs Top 10</th>
    </tr></thead><tbody>`;
    spec.forEach((row) => {
      if (row.type === "sec") {
        html += `<tr class="stmt-row-section"><td colspan="5">${esc(row.label)}</td></tr>`;
        return;
      }
      const trC = row.bold ? "stmt-row-bold" : (row.label.startsWith("  ") ? "stmt-row-sub" : "");
      html += `<tr class="${trC}">
        <td>${esc(row.label.trim())}</td>
        <td class="num">${renderVal(mC, row.key, row.kind, row.signed)}</td>
        <td class="num">${renderVal(tC, row.key, row.kind, row.signed)}</td>
        <td class="num col-ls">${renderVal(lC, row.key, row.kind, row.signed)}</td>
        <td class="num">${fmtDelta(lC ? lC[row.key] : null, tC ? tC[row.key] : null, row.kind, row.inv)}</td>
      </tr>`;
    });
    html += "</tbody></table>";
    el.innerHTML = html;
  }

  function renderAnexo2InvMixChart(canvasId, mktCorp, top10Corp, lsCorp, labels3) {
    destroyChart(canvasId);
    const items = [mktCorp, top10Corp, lsCorp];
    const hasValid = items.some((x) => x && x.inv > 0);
    if (!hasValid) {
      setChartEmptyState(canvasId, "Sin cartera de inversiones", "No hay inversiones registradas para este segmento en el período.");
      return;
    }
    setChartEmptyState(canvasId, null);
    const instrSpecs = [
      { key: "inv_tp", label: "Títulos Públicos", color: BRAND.red },
      { key: "inv_fci", label: "FCI", color: BRAND.blue },
      { key: "inv_on", label: "Oblig. Negoc.", color: BRAND.green },
      { key: "inv_pf", label: "Plazos Fijos", color: BRAND.yellow },
      { key: "inv_acc", label: "Acciones", color: BRAND.ink },
      { key: "inv_fid", label: "Fideicomisos", color: BRAND.orange },
      { key: "inv_otr", label: "Otras Inv.", color: BRAND.brown },
    ];
    const datasets = instrSpecs.map((ins) => ({
      label: ins.label,
      data: items.map((o) => (o && o.inv > 0 ? ((o[ins.key] || 0) / o.inv) * 100 : 0)),
      rawMiles: items.map((o) => (o ? (o[ins.key] || 0) : 0)),
      backgroundColor: ins.color,
      borderRadius: 2,
    }));
    charts[canvasId] = new Chart(document.getElementById(canvasId), {
      type: "bar",
      data: { labels: labels3, datasets },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const pct = ctx.parsed.x || 0;
                const valM = ctx.dataset.rawMiles[ctx.dataIndex] || 0;
                return ` ${ctx.dataset.label}: ${fmtPct(pct, 1)} (${fmtMoney(valM)})`;
              },
            },
          },
        },
        scales: {
          x: { stacked: true, min: 0, max: 100, ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } },
          y: { stacked: true, grid: { display: false } },
        },
      },
    });
  }

  // ==================== HELPERS FUENTES EXTERNAS Y KPI SIMPLE ====================
  function renderSimpleKpiGrid(containerId, cards) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = cards.map((c) => `
      <div class="kpi-card ${c.accent || ""}">
        <div class="kpi-label">${esc(c.label)}</div>
        <div class="kpi-value num">${esc(c.value)}</div>
        <div class="kpi-sub">${c.sub || ""}</div>
      </div>
    `).join("");
    attachExpandButtons(el);
  }

  let _pmCache = null;
  function getProdMensualIndex() {
    if (_pmCache) return _pmCache;
    const pm = SSN_EXTRAS.prod_mensual || {};
    const series = pm.series || [];
    const byYm = new Map();
    series.forEach((pt, idx) => {
      const prev1 = idx > 0 ? series[idx - 1] : null;
      const prev12 = idx >= 12 ? series[idx - 12] : null;
      const momIpc = (pt.ipc_idx && prev1 && prev1.ipc_idx) ? ((pt.ipc_idx / prev1.ipc_idx) - 1) * 100 : null;
      const ltmIpc = (pt.ipc_idx && prev12 && prev12.ipc_idx) ? ((pt.ipc_idx / prev12.ipc_idx) - 1) * 100 : null;
      byYm.set(pt.ym, { ...pt, idx, mom_ipc: momIpc, ltm_ipc: ltmIpc });
    });
    _pmCache = { pm, series, byYm };
    return _pmCache;
  }

  function makeVerticalLinePlugin(xVal, labelText, color = "rgba(25, 135, 84, 0.72)") {
    return {
      id: "vLine_" + Math.round(xVal * 100),
      afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales.x) return;
        const px = scales.x.getPixelForValue(xVal);
        if (px < chartArea.left || px > chartArea.right) return;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.moveTo(px, chartArea.top);
        ctx.lineTo(px, chartArea.bottom);
        ctx.stroke();
        if (labelText) {
          ctx.fillStyle = color;
          ctx.font = "700 10px 'Sora', sans-serif";
          ctx.textAlign = px > chartArea.right - 90 ? "right" : "left";
          ctx.fillText(labelText, px + (px > chartArea.right - 90 ? -5 : 5), chartArea.top + 11);
        }
        ctx.restore();
      },
    };
  }

  // ==================== TAB 4: PERSONAS ====================
  function renderPersonas() {
    const pIdx = state.pIdx;
    const vMode = state.perView;
    const isLooker = vMode === "looker";
    const isPolizas = vMode === "polizas";
    const hideScope = isLooker || isPolizas;

    document.getElementById("perViewGestion").style.display = vMode === "gestion" ? "block" : "none";
    document.getElementById("perViewCanales").style.display = vMode === "canales" ? "block" : "none";
    document.getElementById("perViewJudReas").style.display = vMode === "judreas" ? "block" : "none";
    document.getElementById("perViewPolizas").style.display = isPolizas ? "block" : "none";
    document.getElementById("perViewLooker").style.display = isLooker ? "block" : "none";
    const scopeBar = document.getElementById("perScopeBar");
    if (scopeBar) scopeBar.style.display = hideScope ? "none" : "flex";

    document.querySelectorAll("#perViewTabs .seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === vMode);
    });
    document.querySelectorAll("#perUnivTabs .seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.univ === state.perUniverse);
      b.disabled = hideScope;
      b.title = isLooker ? "Looker Studio muestra el total oficial sin exclusiones" : (isPolizas ? "Estadística física agregada oficial SSN" : "");
    });
    const chkZ = document.getElementById("perExclZurich");
    if (chkZ) {
      chkZ.checked = state.perExclZurich;
      chkZ.disabled = hideScope;
    }

    if (isLooker) {
      document.getElementById("liveCountPill").textContent = "Personas · Rankings (6 segmentos)";
      document.getElementById("btnExportPer").onclick = () => {
        const exp = document.getElementById("btnExportPerLooker");
        if (exp) exp.click();
      };
      renderLookerGrid(pIdx, ["AP", "VIDA_IND", "VIDA_COL", "VIDA_SD", "SALUD_COL", "SALUD_IND"], "perLookerGrid", "btnExportPerLooker", "personas_looker");
      return;
    }

    if (isPolizas) {
      document.getElementById("liveCountPill").textContent = `Personas · Pólizas y Siniestros SSN (${SSN_EXTRAS.polizas_sin_prim?.latest_label || "SSN"})`;
      renderPersonasPolizas();
      document.getElementById("btnExportPer").onclick = () => {
        const b = document.getElementById("btnExportPerPolMov");
        if (b) b.click();
      };
      return;
    }

    const onlyTipo = state.perUniverse === "excl" ? "Personas" : null;
    const exclCods = state.perExclZurich ? new Set([ZURICH_LIFE_COD]) : null;
    const corpOpts = { onlyTipo, exclCods, includeYoY: true, mergeCorp: false };

    // Determine where La Segunda Personas (0117) operates at pIdx
    const lsActiveSubCods = new Set();
    PERSONAS_SUBRAMOS.forEach((sr) => {
      const list = prSubByPSR.get(pIdx + "|" + sr.idx) || [];
      const rLs = list.find((row) => COMPANIAS[row[1]].cod === LS_PERSONAS_COD);
      if (rLs && (Math.abs(rLs[PR_SUBQ_IDX.emit_sd]) >= 0.01 || Math.abs(rLs[PR_SUBQ_IDX.comp_tec]) >= 0.01 || Math.abs(rLs[PR_SUBQ_IDX.deudas_aseg]) >= 0.01)) {
        lsActiveSubCods.add(sr.cod);
      }
    });

    // Determine active ramo filter for pill highlight & subramo list
    let activeRamoCod = "";
    if (state.perScopeType === "ramo") activeRamoCod = state.perScopeCod;
    else if (state.perScopeType === "subramo") {
      const srObj = PERSONAS_SUBRAMOS.find((x) => x.cod === state.perScopeCod);
      if (srObj) activeRamoCod = srObj.cod_ramo;
    }

    const ramoPillsEl = document.getElementById("perRamoPills");
    let rHtml = `<button type="button" class="seg-btn ${state.perScopeType === "all" ? "active" : ""}" data-per-ramo="">Todo Personas (4 Ramos)</button>`;
    PERSONAS_RAMO_ORDER.forEach((rCod) => {
      const isAct = (state.perScopeType === "ramo" && state.perScopeCod === rCod) || (state.perScopeType === "subramo" && activeRamoCod === rCod);
      rHtml += `<button type="button" class="seg-btn ${isAct ? "active" : ""}" data-per-ramo="${esc(rCod)}">${esc(PERSONAS_RAMO_LABELS[rCod])}</button>`;
    });
    ramoPillsEl.innerHTML = rHtml;
    ramoPillsEl.querySelectorAll("button[data-per-ramo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rc = btn.dataset.perRamo;
        if (!rc) {
          state.perScopeType = "all";
          state.perScopeCod = "";
        } else {
          state.perScopeType = "ramo";
          state.perScopeCod = rc;
        }
        renderPersonas();
      });
    });

    const visibleSubPills = activeRamoCod
      ? PERSONAS_SUBRAMOS.filter((s) => s.cod_ramo === activeRamoCod)
      : PERSONAS_SUBRAMOS;
    const subPillsEl = document.getElementById("perSubramoPills");
    let sHtml = activeRamoCod
      ? `<button type="button" class="rm-sub-pill ${state.perScopeType === "ramo" ? "active" : ""}" data-per-sub="">Todos (${esc(PERSONAS_RAMO_LABELS[activeRamoCod])})</button>`
      : "";
    visibleSubPills.forEach((sr) => {
      const shortLbl = sr.desc.replace("Acc. Personales - ", "AP ").replace("Vida - ", "Vida ").replace("Salud - ", "Salud ").replace("Sepelio - ", "Sepelio ");
      const isAct = state.perScopeType === "subramo" && state.perScopeCod === sr.cod;
      const lsDot = lsActiveSubCods.has(sr.cod) ? '<span class="has-ls-dot" title="Con operatoria de La Segunda Personas"></span>' : "";
      sHtml += `<button type="button" class="rm-sub-pill ${isAct ? "active" : ""}" data-per-sub="${esc(sr.cod)}">${lsDot}${esc(shortLbl)}</button>`;
    });
    subPillsEl.innerHTML = sHtml;
    subPillsEl.querySelectorAll("button[data-per-sub]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sc = btn.dataset.perSub;
        if (!sc) {
          state.perScopeType = "ramo";
          state.perScopeCod = activeRamoCod;
        } else if (state.perScopeType === "subramo" && state.perScopeCod === sc) {
          state.perScopeType = activeRamoCod ? "ramo" : "all";
          state.perScopeCod = activeRamoCod || "";
        } else {
          state.perScopeType = "subramo";
          state.perScopeCod = sc;
        }
        renderPersonas();
      });
    });

    // Resolve target srIdxList & descriptive scope label
    let targetSubs = PERSONAS_SUBRAMOS;
    let scopeDesc = "Todo Personas (11 subramos)";
    if (state.perScopeType === "ramo" && state.perScopeCod) {
      targetSubs = PERSONAS_SUBRAMOS.filter((s) => s.cod_ramo === state.perScopeCod);
      scopeDesc = `Ramo ${PERSONAS_RAMO_LABELS[state.perScopeCod] || state.perScopeCod} (${targetSubs.length} subramos)`;
    } else if (state.perScopeType === "subramo" && state.perScopeCod) {
      const sr = PERSONAS_SUBRAMOS.find((s) => s.cod === state.perScopeCod);
      if (sr) {
        targetSubs = [sr];
        scopeDesc = `Subramo ${sr.desc} (${sr.cod})`;
      }
    }
    const targetSrIdxs = targetSubs.map((s) => s.idx);
    const univDesc = state.perUniverse === "excl" ? "Solo Exclusivas Personas" : "Todo el Ramo (Exclusivas + Mixtas)";
    const zurichNote = state.perExclZurich ? " · Excl. Zurich Int. Life (cierre dic-31 / 9m)" : " · Incl. Zurich Int. Life";

    const bench = buildThreeWayBenchmark(computePrSubCompanyRows(pIdx, targetSrIdxs, corpOpts), LS_PERSONAS_COD, "emit_sd");
    const { mkt, top10, ls, top10Rows, allRows } = bench;

    document.getElementById("perContextNote").innerHTML =
      `<span><strong>Alcance activo:</strong> ${esc(scopeDesc)}</span> · ` +
      `<span><strong>Universo:</strong> ${esc(univDesc)} (${allRows.length} cías${esc(zurichNote)})</span> · ` +
      `<span><span class="has-ls-dot" style="vertical-align:middle;margin-right:4px"></span>Subramo con presencia de La Segunda Personas</span>`;
    document.getElementById("liveCountPill").textContent =
      `Personas · ${allRows.length} cías · ${scopeDesc}`;

    if (vMode === "canales") {
      renderPersonasCanales(pIdx, bench, scopeDesc, univDesc, corpOpts);
      return;
    }
    if (vMode === "judreas") {
      renderPersonasJudReas(pIdx, bench, scopeDesc, univDesc, targetSrIdxs, corpOpts);
      return;
    }

    // Bloque 1: 8 KPIs Comparativos (La Segunda vs Top 10 vs Mercado)
    const noLsMsg = "No opera en este alcance";
    const cards = [
      {
        label: "Primas Emitidas SD",
        accent: "",
        lsVal: ls ? fmtMoney(ls.emit_sd) : "Sin op.",
        lsBadgeHtml: ls ? `<span class="bench-delta">${fmtPct(ls.share_emit, 2)} mkt</span>` : "",
        lsSub: ls
          ? `YoY: <span class="${pctClass(ls.emit_yoy)}">${fmtSignedPct(ls.emit_yoy)}</span> · Ranking #${ls.rank} de ${allRows.length}`
          : noLsMsg,
        top10Val: fmtMoney(top10.emit_sd),
        top10Sub: `Conc. ${fmtPct(mkt.share_top10_emit, 1)} · YoY <span class="${pctClass(top10.emit_yoy)}">${fmtSignedPct(top10.emit_yoy)}</span>`,
        mktVal: fmtMoney(mkt.emit_sd),
        mktSub: `YoY <span class="${pctClass(mkt.emit_yoy)}">${fmtSignedPct(mkt.emit_yoy)}</span> · ${mkt.n_cias} cías`,
      },
      {
        label: "Siniestralidad % (Sin. / Dev.)",
        accent: "accent-blue",
        lsVal: ls ? fmtPct(ls.sin_pct) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.sin_pct, top10.sin_pct, true) : "",
        lsSub: ls ? `Sin. Dev.: ${fmtMoney(ls.sin_dev)} ${fmtDeltaBadge(ls.sin_pct, mkt.sin_pct, true, "pp", 1, "Mkt")}` : noLsMsg,
        top10Val: fmtPct(top10.sin_pct),
        top10Sub: `Dev: ${fmtMoney(top10.prim_dev)}`,
        mktVal: fmtPct(mkt.sin_pct),
        mktSub: `Dev: ${fmtMoney(mkt.prim_dev)}`,
      },
      {
        label: "Gastos de Producción % (s/ Dev.)",
        accent: "accent-ink",
        lsVal: ls ? fmtPct(ls.gprod_pct) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.gprod_pct, top10.gprod_pct, true) : "",
        lsSub: ls ? `G. Prod.: ${fmtMoney(ls.g_prod)} ${fmtDeltaBadge(ls.gprod_pct, mkt.gprod_pct, true, "pp", 1, "Mkt")}` : noLsMsg,
        top10Val: fmtPct(top10.gprod_pct),
        top10Sub: `Monto: ${fmtMoney(top10.g_prod)}`,
        mktVal: fmtPct(mkt.gprod_pct),
        mktSub: `Monto: ${fmtMoney(mkt.g_prod)}`,
      },
      {
        label: "Gastos de Explotación % (s/ Dev.)",
        accent: "accent-ink",
        lsVal: ls ? fmtPct(ls.gexpl_pct) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.gexpl_pct, top10.gexpl_pct, true) : "",
        lsSub: ls ? `G. Expl.: ${fmtMoney(ls.g_expl)} ${fmtDeltaBadge(ls.gexpl_pct, mkt.gexpl_pct, true, "pp", 1, "Mkt")}` : noLsMsg,
        top10Val: fmtPct(top10.gexpl_pct),
        top10Sub: `Monto: ${fmtMoney(top10.g_expl)}`,
        mktVal: fmtPct(mkt.gexpl_pct),
        mktSub: `Monto: ${fmtMoney(mkt.g_expl)}`,
      },
      {
        label: "Gastos Netos % (Prod. + Expl.)",
        accent: "accent-ink",
        lsVal: ls ? fmtPct(ls.gto_pct) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.gto_pct, top10.gto_pct, true) : "",
        lsSub: ls ? `Prod: <strong>${fmtPct(ls.gprod_pct, 1)}</strong> · Expl: <strong>${fmtPct(ls.gexpl_pct, 1)}</strong>` : noLsMsg,
        top10Val: fmtPct(top10.gto_pct),
        top10Sub: `Prod ${fmtPct(top10.gprod_pct, 1)} · Expl ${fmtPct(top10.gexpl_pct, 1)}`,
        mktVal: fmtPct(mkt.gto_pct),
        mktSub: `Prod ${fmtPct(mkt.gprod_pct, 1)} · Expl ${fmtPct(mkt.gexpl_pct, 1)}`,
      },
      {
        label: "Ratio Combinado %",
        accent: "accent-orange",
        lsVal: ls ? fmtPct(ls.comb_pct) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.comb_pct, top10.comb_pct, true) : "",
        lsSub: ls ? `${fmtDeltaBadge(ls.comb_pct, mkt.comb_pct, true, "pp", 1, "Mkt")} · Equilibrio <100%` : noLsMsg,
        top10Val: fmtPct(top10.comb_pct),
        top10Sub: `Sin ${fmtPct(top10.sin_pct, 1)} + Gtos ${fmtPct(top10.gto_pct, 1)}`,
        mktVal: fmtPct(mkt.comb_pct),
        mktSub: `Sin ${fmtPct(mkt.sin_pct, 1)} + Gtos ${fmtPct(mkt.gto_pct, 1)}`,
      },
      {
        label: "Resultado Técnico (% s/ Dev.)",
        accent: "accent-green",
        lsVal: ls ? fmtPct(ls.rt_pct) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.rt_pct, top10.rt_pct, false) : "",
        lsSub: ls ? `Monto: <span class="${pctClass(ls.res_tec)}">${fmtMoney(ls.res_tec)}</span>` : noLsMsg,
        top10Val: fmtPct(top10.rt_pct),
        top10Sub: `<span class="${pctClass(top10.res_tec)}">${fmtMoney(top10.res_tec)}</span>`,
        mktVal: fmtPct(mkt.rt_pct),
        mktSub: `<span class="${pctClass(mkt.res_tec)}">${fmtMoney(mkt.res_tec)}</span>`,
      },
      {
        label: "Premios a Cobrar / Emitidas (Calle)",
        accent: "accent-blue",
        lsVal: ls ? fmtPct(ls.calle_pct, 1) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.calle_pct, top10.calle_pct, true) : "",
        lsSub: ls ? `Prem. Cob.: ${fmtMoney(ls.prem_cob)} · Comp. Téc.: ${fmtMoney(ls.comp_tec)}` : noLsMsg,
        top10Val: fmtPct(top10.calle_pct, 1),
        top10Sub: `Prem. Cob.: ${fmtMoney(top10.prem_cob)}`,
        mktVal: fmtPct(mkt.calle_pct, 1),
        mktSub: `Prem. Cob.: ${fmtMoney(mkt.prem_cob)}`,
      },
    ];
    renderBenchmarkKpiGrid("perBenchmarkKpis", cards);

    // Bloque 2: Matriz Comparativa de los 11 Subramos (Mercado | Top 10 | La Segunda)
    const subMatrixRows = [];
    PERSONAS_SUBRAMOS.forEach((sr) => {
      const sb = buildThreeWayBenchmark(computePrSubCompanyRows(pIdx, [sr.idx], corpOpts), LS_PERSONAS_COD, "emit_sd");
      subMatrixRows.push({
        cod: sr.cod,
        desc: sr.desc,
        ramo: PERSONAS_RAMO_LABELS[sr.cod_ramo] || sr.desc_ramo,
        mkt_emit: sb.mkt.emit_sd,
        mkt_yoy: sb.mkt.emit_yoy,
        mkt_comb: sb.mkt.comb_pct,
        mkt_calle: sb.mkt.calle_pct,
        t10_comb: sb.top10.comb_pct,
        t10_rt: sb.top10.rt_pct,
        ls_emit: sb.ls ? sb.ls.emit_sd : 0,
        ls_share: sb.ls ? sb.ls.share_emit : 0,
        ls_comb: sb.ls ? sb.ls.comb_pct : null,
        ls_rt: sb.ls ? sb.ls.rt_pct : null,
        ls_calle: sb.ls ? sb.ls.calle_pct : null,
      });
    });
    const totBench = state.perScopeType === "all"
      ? bench
      : buildThreeWayBenchmark(computePrSubCompanyRows(pIdx, PERSONAS_SUBRAMOS.map((s) => s.idx), corpOpts), LS_PERSONAS_COD, "emit_sd");

    const subMatEl = document.getElementById("perSubMatrixWrap");
    let matHtml = `<table class="data-table table-compact"><thead>
      <tr>
        <th rowspan="2">Subramo Personas</th>
        <th colspan="4" class="num col-grp-sep">Mercado (${esc(state.perUniverse === "excl" ? "Excl." : "Total Ramo")})</th>
        <th colspan="2" class="num col-grp-sep">Top 10 Subramo</th>
        <th colspan="5" class="num col-ls col-grp-sep">La Segunda Personas</th>
      </tr>
      <tr>
        <th class="num col-grp-sep">Emit. (${unitSuffix()})</th><th class="num">YoY %</th><th class="num">Comb. %</th><th class="num" title="Premios a Cobrar / Primas Emitidas">Calle %</th>
        <th class="num col-grp-sep">Comb. %</th><th class="num">Res. Téc.%</th>
        <th class="num col-ls col-grp-sep">Emit. (${unitSuffix()})</th><th class="num col-ls">Share %</th><th class="num col-ls">Comb. %</th><th class="num col-ls">Res. Téc.%</th><th class="num col-ls">Calle %</th>
      </tr>
    </thead><tbody>`;
    subMatrixRows.forEach((r) => {
      const sel = state.perScopeType === "subramo" && state.perScopeCod === r.cod;
      const hasLs = Math.abs(r.ls_emit) >= 0.01;
      matHtml += `<tr class="clickable ${sel ? "row-selected" : ""}" data-sr-cod="${esc(r.cod)}">
        <td title="${esc(r.desc)}"><strong>${esc(r.desc)}</strong></td>
        <td class="num col-grp-sep">${fmtNumMiles(r.mkt_emit)}</td>
        <td class="num"><span class="${pctClass(r.mkt_yoy)}">${fmtSignedPct(r.mkt_yoy)}</span></td>
        <td class="num">${fmtPct(r.mkt_comb, 1)}</td>
        <td class="num">${fmtPct(r.mkt_calle, 1)}</td>
        <td class="num col-grp-sep">${fmtPct(r.t10_comb, 1)}</td>
        <td class="num"><span class="${pctClass(r.t10_rt)}">${fmtPct(r.t10_rt, 1)}</span></td>
        <td class="num col-ls col-grp-sep">${hasLs ? fmtNumMiles(r.ls_emit) : "—"}</td>
        <td class="num col-ls">${hasLs ? fmtPct(r.ls_share, 2) : "—"}</td>
        <td class="num col-ls">${r.ls_comb != null ? fmtPct(r.ls_comb, 1) : "—"}</td>
        <td class="num col-ls">${r.ls_rt != null ? `<span class="${pctClass(r.ls_rt)}">${fmtPct(r.ls_rt, 1)}</span>` : "—"}</td>
        <td class="num col-ls">${r.ls_calle != null ? fmtPct(r.ls_calle, 1) : "—"}</td>
      </tr>`;
    });
    const tm = totBench.mkt;
    const tt = totBench.top10;
    const tl = totBench.ls;
    matHtml += `</tbody><tfoot><tr>
      <td>TOTAL PERSONAS (11 Subramos)</td>
      <td class="num col-grp-sep">${fmtNumMiles(tm.emit_sd)}</td>
      <td class="num"><span class="${pctClass(tm.emit_yoy)}">${fmtSignedPct(tm.emit_yoy)}</span></td>
      <td class="num">${fmtPct(tm.comb_pct, 1)}</td>
      <td class="num">${fmtPct(tm.calle_pct, 1)}</td>
      <td class="num col-grp-sep">${fmtPct(tt.comb_pct, 1)}</td>
      <td class="num"><span class="${pctClass(tt.rt_pct)}">${fmtPct(tt.rt_pct, 1)}</span></td>
      <td class="num col-grp-sep">${tl ? fmtNumMiles(tl.emit_sd) : "—"}</td>
      <td class="num">${tl ? fmtPct(tl.share_emit, 2) : "—"}</td>
      <td class="num">${tl ? fmtPct(tl.comb_pct, 1) : "—"}</td>
      <td class="num">${tl ? `<span class="${pctClass(tl.rt_pct)}">${fmtPct(tl.rt_pct, 1)}</span>` : "—"}</td>
      <td class="num">${tl ? fmtPct(tl.calle_pct, 1) : "—"}</td>
    </tr></tfoot></table>`;
    subMatEl.innerHTML = matHtml;
    subMatEl.querySelectorAll("tbody tr[data-sr-cod]").forEach((tr) => {
      tr.addEventListener("click", () => {
        const sc = tr.dataset.srCod;
        if (state.perScopeType === "subramo" && state.perScopeCod === sc) {
          state.perScopeType = "all";
          state.perScopeCod = "";
        } else {
          state.perScopeType = "subramo";
          state.perScopeCod = sc;
        }
        renderPersonas();
      });
    });

    // Bloque 3a Chart 1: Comparativa Ratios Técnicos (Mercado vs Top 10 vs La Segunda)
    document.getElementById("perRatiosSub").textContent = `${scopeDesc} · ${univDesc}${state.perExclZurich ? " (sin Zurich Int. Life)" : ""}`;
    const barEnts = [
      { label: "Mercado", obj: mkt, color: "rgba(48,48,45,0.72)" },
      { label: "Top 10", obj: top10, color: BRAND.blue },
      { label: "La Segunda", obj: ls, color: BRAND.red },
    ].filter((e) => e.obj && e.obj.prim_dev > 0);
    destroyChart("chPerRatios");
    updateOutlierNote("perRatiosOutlierNote", [], null);
    if (barEnts.length === 0) {
      setChartEmptyState("chPerRatios", "Sin primas devengadas en este alcance", "El subramo seleccionado no registra primas devengadas positivas para calcular ratios técnicos.");
    } else {
      setChartEmptyState("chPerRatios", null);
      charts.chPerRatios = new Chart(document.getElementById("chPerRatios"), {
        type: "bar",
        data: {
          labels: ["Siniestralidad %", "G. Producción %", "G. Explotación %", "Gastos Netos %", "Res. Técnico %"],
          datasets: barEnts.map((e) => ({
            label: e.label,
            data: [e.obj.sin_pct || 0, e.obj.gprod_pct || 0, e.obj.gexpl_pct || 0, e.obj.gto_pct || 0, e.obj.rt_pct || 0],
            backgroundColor: e.color,
            borderRadius: 4,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { tooltip: { callbacks: { label: (ctx) => chartPctTooltipLabel(ctx, 2) } } },
          scales: { y: { ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } }, x: { grid: { display: false } } },
        },
      });
    }

    // Bloque 3a Chart 2: Scatter Posicionamiento (Top 25 + LS: Sin % vs G. Netos %)
    document.getElementById("perScatterTitle").textContent = `Mapa de Posicionamiento: ${scopeDesc}`;
    document.getElementById("perScatterSub").textContent = `Siniestralidad % vs. Gastos Netos % (${mkt.sin_pct != null ? `Prom. Mkt: ${fmtPct(mkt.sin_pct, 1)} / ${fmtPct(mkt.gto_pct, 1)}` : "sin devengadas"} · línea diagonal = Combinado 100%)`;
    const perTop25 = allRows.filter((r) => r.prim_dev > 0).slice(0, 25);
    allRows.filter((r) => r.esLS && r.prim_dev > 0 && !perTop25.some((x) => x.cod === r.cod)).forEach((r) => perTop25.push(r));
    const perScFilt = filterChartOutliers(
      perTop25,
      allRows.filter((r) => r.prim_dev > 0),
      [{ key: "sin_pct", suffix: "%" }, { key: "gto_pct", suffix: "%" }],
      { sizeKey: "emit_sd", weighted: true, anchorZero: false }
    );
    destroyChart("chPerScatter");
    if (perScFilt.kept.length === 0) {
      updateOutlierNote("perScatterOutlierNote", [], null, false);
      setChartEmptyState("chPerScatter", "Sin datos para mapa de posicionamiento", "No hay entidades con primas devengadas positivas en el alcance actual.");
    } else {
      setChartEmptyState("chPerScatter", null);
      updateOutlierNote(
        "perScatterOutlierNote",
        perScFilt.dropped,
        ({ row, share }) => `${row.nombre} (Sin. ${fmtPct(row.sin_pct, 1)} · Gtos ${fmtPct(row.gto_pct, 1)} · ${fmtPct(share * 100, 1)} Emit.)`,
        false
      );
      const perScatterPlugin = {
        id: "perScatterGuides",
        afterDatasetsDraw(chart) {
          const { ctx, chartArea, scales } = chart;
          if (!chartArea || !scales.x || !scales.y) return;
          const { left, right, top, bottom } = chartArea;
          // Diagonal Combinado = 100% (x + y = 100)
          ctx.save();
          ctx.beginPath();
          ctx.rect(left, top, right - left, bottom - top);
          ctx.clip();
          const xMin = scales.x.min;
          const xMax = scales.x.max;
          ctx.beginPath();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = "rgba(25, 135, 84, 0.55)";
          ctx.lineWidth = 1.4;
          ctx.moveTo(scales.x.getPixelForValue(xMin), scales.y.getPixelForValue(100 - xMin));
          ctx.lineTo(scales.x.getPixelForValue(xMax), scales.y.getPixelForValue(100 - xMax));
          ctx.stroke();
          ctx.restore();

          drawScatterAvgGuides(chart, {
            avgX: mkt.sin_pct,
            avgY: mkt.gto_pct,
            avgXTxt: mkt.sin_pct != null ? `Prom. Sin.: ${fmtPct(mkt.sin_pct, 1)}` : "",
            avgYTxt: mkt.gto_pct != null ? `Prom. Gtos: ${fmtPct(mkt.gto_pct, 1)}` : "",
          });
        },
      };
      const perMktPts = [];
      const perT10Pts = [];
      const perLsPts = [];
      const t10Set = new Set(top10Rows.map((r) => r.cod));
      perScFilt.kept.forEach((r) => {
        const pt = { x: r.sin_pct, y: r.gto_pct, name: r.nombre, comb: r.comb_pct, emit: r.emit_sd };
        if (r.cod === LS_PERSONAS_COD) perLsPts.push(pt);
        else if (t10Set.has(r.cod)) perT10Pts.push(pt);
        else perMktPts.push(pt);
      });
      charts.chPerScatter = new Chart(document.getElementById("chPerScatter"), {
        type: "scatter",
        data: {
          datasets: [
            { label: "Resto Top 25", data: perMktPts, backgroundColor: "rgba(48,48,45,0.36)", pointRadius: 4.5 },
            { label: "Top 10", data: perT10Pts, backgroundColor: "rgba(65,131,202,0.75)", pointRadius: 6 },
            { label: "La Segunda Personas", data: perLsPts, backgroundColor: BRAND.red, pointRadius: 8 },
          ],
        },
        plugins: [perScatterPlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const r = ctx.raw;
                  return ` ${r.name}: Sin. ${fmtPct(r.x, 1)} · Gtos ${fmtPct(r.y, 1)} · Comb. ${fmtPct(r.comb, 1)}`;
                },
              },
            },
          },
          scales: {
            x: { title: { display: true, text: "Siniestralidad % (Sin. / Dev.)" }, ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } },
            y: { title: { display: true, text: "Gastos Netos % (s/ Dev.)" }, ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } },
          },
        },
      });
    }

    // Bloque 3b Chart 1: Evolución 12 Trimestres (Mercado vs Top 10 vs La Segunda)
    const evoStart = Math.max(0, pIdx - 11);
    const evoMetric = state.perEvoMetric;
    const isPerShare = evoMetric === "ls_share";
    const isPerMoney = evoMetric === "emit_sd";
    const div = unitDivisor();
    const evoLabels = [];
    const sMkt = [];
    const sT10 = [];
    const sLs = [];
    const sShareMkt = [];
    for (let q = evoStart; q <= pIdx; q++) {
      const qb = buildThreeWayBenchmark(computePrSubCompanyRows(q, targetSrIdxs, { ...corpOpts, includeYoY: false }), LS_PERSONAS_COD, "emit_sd");
      evoLabels.push(PERIODOS[q].label);
      if (isPerShare) {
        sShareMkt.push(qb.ls ? qb.ls.share_emit : 0);
      } else if (isPerMoney) {
        sMkt.push(qb.mkt.emit_sd / div);
        sT10.push(qb.top10.emit_sd / div);
        sLs.push(qb.ls ? qb.ls.emit_sd / div : 0);
      } else {
        sMkt.push(qb.mkt[evoMetric]);
        sT10.push(qb.top10[evoMetric]);
        sLs.push(qb.ls ? qb.ls[evoMetric] : null);
      }
    }
    document.getElementById("perEvoSub").textContent = `${scopeDesc} · ${univDesc}`;
    const rawEvoDs = isPerShare ? [
      { label: "Share La Segunda %", data: sShareMkt, borderColor: BRAND.red, backgroundColor: BRAND.red, borderWidth: 2.8, tension: 0.25 },
    ] : [
      { label: "Mercado", data: sMkt, borderColor: BRAND.ink, backgroundColor: BRAND.ink, borderWidth: 2, tension: 0.25 },
      { label: "Top 10", data: sT10, borderColor: BRAND.blue, backgroundColor: BRAND.blue, borderWidth: 2.2, tension: 0.25 },
      { label: "La Segunda Personas", data: sLs, borderColor: BRAND.red, backgroundColor: BRAND.red, borderWidth: 2.8, tension: 0.25 },
    ];
    const hasPerEvoData = rawEvoDs.some((ds) => ds.data.some((v) => typeof v === "number" && Number.isFinite(v)));
    destroyChart("chPerEvo");
    if (!hasPerEvoData) {
      updateOutlierNote("perEvoOutlierNote", [], null);
      setChartEmptyState("chPerEvo", "Sin serie histórica válida para esta métrica", "El subramo o alcance actual no registra primas devengadas o emisión suficiente en los últimos 12 trimestres.");
    } else {
      const perEvoFilt = filterTimeSeriesOutliers(evoLabels, rawEvoDs, {
        suffix: isPerMoney ? "$" : "%",
        extThreshold: isPerMoney ? 1.5 : 0.85,
        zThreshold: isPerMoney ? 4.0 : 3.5,
        maxDrops: 3,
      });
      updateOutlierNote(
        "perEvoOutlierNote",
        perEvoFilt.dropped,
        (d) => `${d.series} (${d.period}: ${isPerMoney ? fmtMoney(d.value * div) : fmtPct(d.value, 1)})`,
        { single: "El valor real se conserva en los datos.", plural: "Los valores reales se conservan en los datos." }
      );
      setChartEmptyState("chPerEvo", null);
      charts.chPerEvo = new Chart(document.getElementById("chPerEvo"), {
        type: "line",
        data: { labels: evoLabels, datasets: perEvoFilt.datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => isPerMoney ? chartMoneyTooltipLabel(ctx) : chartPctTooltipLabel(ctx, 2),
              },
            },
          },
          scales: { y: { ticks: { callback: (v) => isPerMoney ? chartMoneyTick(v) : chartPctTick(v) }, grid: { color: "#f0f0f4" } } },
        },
      });
    }

    // Bloque 3b Chart 2: Mix por Subramo (o Top 10 + LS en subramo único)
    destroyChart("chPerMix");
    if (targetSubs.length > 1) {
      document.getElementById("perMixTitle").textContent = "Mix de Cartera por Subramo: Mercado vs. Top 10 vs. La Segunda";
      document.getElementById("perMixSub").textContent = "Distribución % de Primas Emitidas SD dentro del alcance activo";
      const subSlices = targetSubs.map((sr) => {
        const resS = computePrSubCompanyRows(pIdx, [sr.idx], { ...corpOpts, includeYoY: false }).rows;
        const mktSum = resS.reduce((s, r) => s + Math.max(0, r.emit_sd), 0);
        const top10Set = new Set(top10Rows.map((x) => x.cod));
        const t10Sum = resS.filter((r) => top10Set.has(r.cod)).reduce((s, r) => s + Math.max(0, r.emit_sd), 0);
        const lsRow = resS.find((r) => r.cod === LS_PERSONAS_COD);
        return {
          cod: sr.cod,
          label: sr.desc.replace("Acc. Personales - ", "AP ").replace("Rtas. Prev. y Rs. Trab. - ", ""),
          mkt: mktSum,
          top10: t10Sum,
          ls: lsRow ? Math.max(0, lsRow.emit_sd) : 0,
        };
      }).filter((x) => x.mkt > 0 || x.top10 > 0 || x.ls > 0).sort((a, b) => b.mkt - a.mkt);

      const totM = subSlices.reduce((s, x) => s + x.mkt, 0);
      const totT = subSlices.reduce((s, x) => s + x.top10, 0);
      const totL = subSlices.reduce((s, x) => s + x.ls, 0);
      if (totM <= 0) {
        setChartEmptyState("chPerMix", "Sin emisión para componer cartera", "Las operaciones registradas en este alcance no informan primas emitidas.");
      } else {
        setChartEmptyState("chPerMix", null);
        charts.chPerMix = new Chart(document.getElementById("chPerMix"), {
          type: "bar",
          data: {
            labels: ["Mercado", "Top 10", "La Segunda"],
            datasets: subSlices.map((sl, i) => ({
              label: sl.label,
              data: [totM > 0 ? (sl.mkt / totM) * 100 : 0, totT > 0 ? (sl.top10 / totT) * 100 : 0, totL > 0 ? (sl.ls / totL) * 100 : 0],
              rawMiles: [sl.mkt, sl.top10, sl.ls],
              backgroundColor: PALETTE[i % PALETTE.length],
              borderRadius: 2,
            })),
          },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              tooltip: {
                callbacks: {
                  label: (ctx) => ` ${ctx.dataset.label}: ${fmtPct(ctx.parsed.x, 1)} (${fmtMoney(ctx.dataset.rawMiles[ctx.dataIndex] || 0)})`,
                },
              },
            },
            scales: {
              x: { stacked: true, min: 0, max: 100, ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } },
              y: { stacked: true, grid: { display: false } },
            },
          },
        });
      }
    } else {
      document.getElementById("perMixTitle").textContent = `Top 10 + La Segunda en ${scopeDesc}`;
      document.getElementById("perMixSub").textContent = `Primas Emitidas SD en ${unitSuffix()}`;
      const barList = top10Rows.slice();
      if (ls && !barList.some((x) => x.cod === ls.cod)) barList.push(ls);
      if (barList.length === 0 || barList.every((r) => Math.abs(r.emit_sd) < 0.01)) {
        setChartEmptyState("chPerMix", "Sin primas emitidas en este subramo", "El subramo seleccionado corresponde a cartera en run-off sin emisión nueva.");
      } else {
        setChartEmptyState("chPerMix", null);
        charts.chPerMix = new Chart(document.getElementById("chPerMix"), {
          type: "bar",
          data: {
            labels: barList.map((r) => r.nombre),
            datasets: [{
              label: `Emitidas SD (${unitSuffix()})`,
              data: barList.map((r) => r.emit_sd / div),
              backgroundColor: barList.map((r) => r.esLS ? BRAND.red : "rgba(48,48,45,0.72)"),
              borderRadius: 4,
            }],
          },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: chartMoneyTooltipLabel } } },
            scales: { x: { ticks: { callback: chartMoneyTick }, grid: { color: "#f0f0f4" } }, y: { grid: { display: false } } },
          },
        });
      }
    }

    // Bloque 4: Ranking Top 10 + La Segunda
    const rkRowsToShow = state.perRkShowAll ? allRows : (() => {
      const list = top10Rows.slice();
      if (ls && !list.some((r) => r.cod === ls.cod)) list.push(ls);
      return list;
    })();
    document.getElementById("perRkTitle").textContent = `${state.perRkShowAll ? `Todas las Compañías (${allRows.length})` : "Top 10 + La Segunda Personas"} · ${scopeDesc}`;
    const btnPerTog = document.getElementById("btnPerRkToggle");
    if (btnPerTog) btnPerTog.textContent = state.perRkShowAll ? "Ver Top 10 + LS" : `Ver Todas (${allRows.length})`;

    const perRkCols = [
      { key: "rank", label: "#", num: true },
      { key: "nombre", label: "Compañía", num: false, render: (r) => `${esc(r.nombre)} ${r.esLS ? '<span class="badge badge-ls">LS</span>' : ""}` },
      { key: "tipo", label: "Tipo", num: false, render: (r) => `<span class="badge badge-type">${esc(r.tipo.split(" ")[0])}</span>` },
      { key: "emit_sd", label: `Emit. SD (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.emit_sd) },
      { key: "share_emit", label: "Share %", num: true, render: (r) => fmtPct(r.share_emit) },
      { key: "emit_yoy", label: "YoY %", num: true, render: (r) => `<span class="${pctClass(r.emit_yoy)}">${fmtSignedPct(r.emit_yoy)}</span>` },
      { key: "sin_pct", label: "Sin. %", num: true, render: (r) => fmtPct(r.sin_pct, 1) },
      { key: "gprod_pct", label: "G. Prod.%", num: true, render: (r) => fmtPct(r.gprod_pct, 1) },
      { key: "gexpl_pct", label: "G. Expl.%", num: true, render: (r) => fmtPct(r.gexpl_pct, 1) },
      { key: "comb_pct", label: "Comb. %", num: true, render: (r) => `<strong>${fmtPct(r.comb_pct, 1)}</strong>` },
      { key: "rt_pct", label: "Téc. s/Dev%", num: true, render: (r) => `<span class="${pctClass(r.rt_pct)}">${fmtPct(r.rt_pct, 1)}</span>` },
      { key: "calle_pct", label: "Calle %", title: "Premios a Cobrar / Primas Emitidas SD", num: true, render: (r) => fmtPct(r.calle_pct, 1) },
      { key: "res_tec", label: `Res. Téc. (${unitSuffix()})`, num: true, render: (r) => `<span class="${pctClass(r.res_tec)}">${fmtNumMiles(r.res_tec)}</span>` },
    ];
    const perFooterRows = [
      {
        _cls: "tfoot-sub",
        rank: "—",
        nombre: `SUBTOTAL TOP 10 (${top10Rows.length} cías)`,
        tipo: "",
        emit_sd: fmtNumMiles(top10.emit_sd),
        share_emit: fmtPct(top10.share_emit),
        emit_yoy: `<span class="${pctClass(top10.emit_yoy)}">${fmtSignedPct(top10.emit_yoy)}</span>`,
        sin_pct: fmtPct(top10.sin_pct, 1),
        gprod_pct: fmtPct(top10.gprod_pct, 1),
        gexpl_pct: fmtPct(top10.gexpl_pct, 1),
        comb_pct: `<strong>${fmtPct(top10.comb_pct, 1)}</strong>`,
        rt_pct: `<span class="${pctClass(top10.rt_pct)}">${fmtPct(top10.rt_pct, 1)}</span>`,
        calle_pct: fmtPct(top10.calle_pct, 1),
        res_tec: `<span class="${pctClass(top10.res_tec)}">${fmtNumMiles(top10.res_tec)}</span>`,
      },
      {
        rank: "—",
        nombre: `TOTAL MERCADO (${allRows.length} cías)`,
        tipo: "",
        emit_sd: fmtNumMiles(mkt.emit_sd),
        share_emit: mkt.emit_sd > 0 ? "100,00%" : "—",
        emit_yoy: `<span class="${pctClass(mkt.emit_yoy)}">${fmtSignedPct(mkt.emit_yoy)}</span>`,
        sin_pct: fmtPct(mkt.sin_pct, 1),
        gprod_pct: fmtPct(mkt.gprod_pct, 1),
        gexpl_pct: fmtPct(mkt.gexpl_pct, 1),
        comb_pct: `<strong>${fmtPct(mkt.comb_pct, 1)}</strong>`,
        rt_pct: `<span class="${pctClass(mkt.rt_pct)}">${fmtPct(mkt.rt_pct, 1)}</span>`,
        calle_pct: fmtPct(mkt.calle_pct, 1),
        res_tec: `<span class="${pctClass(mkt.res_tec)}">${fmtNumMiles(mkt.res_tec)}</span>`,
      },
    ];
    const sortedPerRk = renderSortableTable(
      document.getElementById("perRkTableWrap"),
      perRkCols,
      rkRowsToShow,
      state.perRkSort,
      (nextSort) => { state.perRkSort = nextSort; renderPersonas(); },
      {
        highlightLS: true,
        rowIdKey: "cod",
        onRowClick: (cod) => openFichaEntity("CIA:" + cod),
        footerRows: perFooterRows,
      }
    );

    // Bloque 5: Societario y Financiero (Exclusivas Personas)
    const { meses } = resolveBaseAndMeses(pIdx, state.base);
    const allMktFull = getCompanyRowsForPeriod(pIdx, false, { ignoreGranRamo: true });
    const exclPerRows = allMktFull
      .filter((r) => r.tipo === "Personas" && (!state.perExclZurich || r.cod !== ZURICH_LIFE_COD))
      .sort((a, b) => b.emit_sd - a.emit_sd);
    const exclTop10Rows = exclPerRows.slice(0, Math.min(10, exclPerRows.length));
    const mktCorpExcl = aggregateMetrics(exclPerRows, meses, pIdx, state.base, state.moneda, { scope: "market" });
    const top10CorpExcl = aggregateMetrics(exclTop10Rows, meses, pIdx, state.base, state.moneda, { scope: "market" });
    const lsCorpExcl = exclPerRows.find((r) => r.cod === LS_PERSONAS_COD) || null;
    document.getElementById("perCorpSub").textContent =
      `Benchmark societario sobre ${exclPerRows.length} aseguradoras exclusivas de Personas (${state.perExclZurich ? "sin Zurich Int. Life" : "incl. Zurich Int. Life"}) — nivel entidad completa`;
    renderCorpBenchmarkTable("perCorpTableWrap", mktCorpExcl, top10CorpExcl, lsCorpExcl, false, "LS Personas");
    renderAnexo2InvMixChart("chPerInvMix", mktCorpExcl, top10CorpExcl, lsCorpExcl, ["Mercado Excl.", "Top 10 Excl.", "La Segunda"]);

    // Exports CSV
    const exportPerRankingFn = () => {
      const uDec = unitDecimals();
      exportToCSV(
        `personas_ranking_${state.perScopeCod || "todo"}_${PERIODOS[pIdx].id}.csv`,
        perRkCols.map((c) => c.label),
        allRows.map((r) => perRkCols.map((c) => {
          const v = r[c.key];
          if (typeof v !== "number") return v ?? "";
          if (c.key === "rank" || c.key.endsWith("_pct") || c.key.startsWith("share_") || c.key.endsWith("_yoy")) return v.toFixed(2);
          return (v / div).toFixed(uDec);
        }))
      );
    };
    document.getElementById("btnExportPer").onclick = exportPerRankingFn;
    document.getElementById("btnExportPerRk").onclick = exportPerRankingFn;
    document.getElementById("btnExportPerSub").onclick = () => {
      const uDec = unitDecimals();
      exportToCSV(
        `personas_subramos_${PERIODOS[pIdx].id}.csv`,
        ["Cód.", "Subramo", "Mkt Emit.", "Mkt YoY%", "Mkt Comb%", "Mkt Calle%", "Top10 Comb%", "Top10 Res.Téc%", "LS Emit.", "LS Share%", "LS Comb%", "LS Res.Téc%", "LS Calle%"],
        subMatrixRows.map((r) => [
          r.cod, r.desc, (r.mkt_emit / div).toFixed(uDec),
          r.mkt_yoy != null ? r.mkt_yoy.toFixed(2) : "",
          r.mkt_comb != null ? r.mkt_comb.toFixed(2) : "",
          r.mkt_calle != null ? r.mkt_calle.toFixed(2) : "",
          r.t10_comb != null ? r.t10_comb.toFixed(2) : "",
          r.t10_rt != null ? r.t10_rt.toFixed(2) : "",
          (r.ls_emit / div).toFixed(uDec),
          r.ls_share != null ? r.ls_share.toFixed(2) : "",
          r.ls_comb != null ? r.ls_comb.toFixed(2) : "",
          r.ls_rt != null ? r.ls_rt.toFixed(2) : "",
          r.ls_calle != null ? r.ls_calle.toFixed(2) : "",
        ])
      );
    };
    void sortedPerRk;
  }

  function renderPersonasCanales(pIdx, bench, scopeDesc, univDesc, corpOpts) {
    const { mkt, top10, ls, allRows } = bench;
    const div = unitDivisor();
    const noLsMsg = "No opera en este alcance";

    // 1. KPIs SINENSUP #3
    renderBenchmarkKpiGrid("perCanKpis", [
      {
        label: "% Comisiones vía PAS (4.01.06.01.01)",
        accent: "",
        lsVal: ls && ls.com_pas_share != null ? fmtPct(ls.com_pas_share, 1) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.com_pas_share, top10.com_pas_share, false, "pp", 1) : "",
        lsSub: ls ? `Com. PAS: ${fmtMoney(ls.com_pas)} ${fmtDeltaBadge(ls.com_pas_share, mkt.com_pas_share, false, "pp", 1, "Mkt")}` : noLsMsg,
        top10Val: fmtPct(top10.com_pas_share, 1),
        top10Sub: `Monto: ${fmtMoney(top10.com_pas)}`,
        mktVal: fmtPct(mkt.com_pas_share, 1),
        mktSub: `Monto: ${fmtMoney(mkt.com_pas)}`,
      },
      {
        label: "% Comisiones Ag. Institorios (4.01.06.01.02)",
        accent: "accent-blue",
        lsVal: ls && ls.com_inst_share != null ? fmtPct(ls.com_inst_share, 1) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.com_inst_share, top10.com_inst_share, false, "pp", 1) : "",
        lsSub: ls ? `Com. Inst.: ${fmtMoney(ls.com_inst)} · Otros: ${fmtPct(ls.com_otros_share, 1)}` : noLsMsg,
        top10Val: fmtPct(top10.com_inst_share, 1),
        top10Sub: `Monto: ${fmtMoney(top10.com_inst)}`,
        mktVal: fmtPct(mkt.com_inst_share, 1),
        mktSub: `Monto: ${fmtMoney(mkt.com_inst)}`,
      },
      {
        label: "Tasa Comisión PAS (% s/ Emitidas SD)",
        accent: "accent-ink",
        lsVal: ls && ls.tasa_com_pas != null ? fmtPct(ls.tasa_com_pas, 2) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.tasa_com_pas, top10.tasa_com_pas, true, "pp", 2) : "",
        lsSub: ls ? `Tasa Inst.: ${fmtPct(ls.tasa_com_inst, 2)} · Otros G.P.: ${fmtMoney(ls.com_otros)}` : noLsMsg,
        top10Val: fmtPct(top10.tasa_com_pas, 2),
        top10Sub: `Tasa Inst.: ${fmtPct(top10.tasa_com_inst, 2)}`,
        mktVal: fmtPct(mkt.tasa_com_pas, 2),
        mktSub: `Tasa Inst.: ${fmtPct(mkt.tasa_com_inst, 2)}`,
      },
      {
        label: "Carga Directa de Comisiones (PAS+Inst. s/ Em.)",
        accent: "accent-orange",
        lsVal: ls && ls.tasa_com_tot != null ? fmtPct(ls.tasa_com_tot, 2) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.tasa_com_tot, top10.tasa_com_tot, true, "pp", 2) : "",
        lsSub: ls ? `G. Prod. Tot.: ${fmtMoney(ls.g_prod)}` : noLsMsg,
        top10Val: fmtPct(top10.tasa_com_tot, 2),
        top10Sub: `G. Prod.: ${fmtMoney(top10.g_prod)}`,
        mktVal: fmtPct(mkt.tasa_com_tot, 2),
        mktSub: `G. Prod.: ${fmtMoney(mkt.g_prod)}`,
      },
    ]);

    // 2. Gráfico 1: Mix % Comisiones (Mkt, Top 10, LS y por Ramo)
    document.getElementById("perCanMixSub").textContent = `${scopeDesc} · ${univDesc} · Desglose de 4.01.06 (PAS / Ag. Institorios / Otros)`;
    const mixGroups = [
      { label: "Mercado (Alcance)", obj: mkt },
      { label: "Top 10", obj: top10 },
      { label: "La Segunda Personas", obj: ls },
    ];
    PERSONAS_RAMO_ORDER.forEach((rCod) => {
      const srIds = PERSONAS_SUBRAMOS.filter((s) => s.cod_ramo === rCod).map((s) => s.idx);
      const rb = buildThreeWayBenchmark(computePrSubCompanyRows(pIdx, srIds, { ...corpOpts, includeYoY: false }), LS_PERSONAS_COD, "emit_sd");
      mixGroups.push({ label: `Ramo: ${PERSONAS_RAMO_LABELS[rCod]}`, obj: rb.mkt });
    });
    const validMix = mixGroups.filter((g) => g.obj && g.obj.com_tot > 0);
    destroyChart("chPerCanalesMix");
    if (validMix.length === 0) {
      setChartEmptyState("chPerCanalesMix", "Sin gastos de producción registrados", "No hay comisiones positivas en este alcance.");
    } else {
      setChartEmptyState("chPerCanalesMix", null);
      charts.chPerCanalesMix = new Chart(document.getElementById("chPerCanalesMix"), {
        type: "bar",
        data: {
          labels: validMix.map((g) => g.label),
          datasets: [
            { label: "Productores Asesores (PAS)", data: validMix.map((g) => g.obj.com_pas_share || 0), rawMiles: validMix.map((g) => g.obj.com_pas || 0), backgroundColor: BRAND.red, borderRadius: 2 },
            { label: "Agentes Institorios / Bancos", data: validMix.map((g) => g.obj.com_inst_share || 0), rawMiles: validMix.map((g) => g.obj.com_inst || 0), backgroundColor: BRAND.blue, borderRadius: 2 },
            { label: "Otros G. Prod. (Contrat./Bonif.)", data: validMix.map((g) => g.obj.com_otros_share || 0), rawMiles: validMix.map((g) => g.obj.com_otros || 0), backgroundColor: BRAND.ink, borderRadius: 2 },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtPct(ctx.parsed.x, 1)} (${fmtMoney(ctx.dataset.rawMiles[ctx.dataIndex] || 0)})` } },
          },
          scales: {
            x: { stacked: true, min: 0, max: 100, ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } },
            y: { stacked: true, grid: { display: false } },
          },
        },
      });
    }

    // 3. Gráfico 2: Top 15 entidades + LS por G. Producción desagregado por canal (%)
    const canRanked = allRows.filter((r) => r.com_tot > 0).slice().sort((a, b) => b.g_prod - a.g_prod);
    const top15Can = canRanked.slice(0, 15);
    if (ls && ls.com_tot > 0 && !top15Can.some((x) => x.cod === ls.cod)) top15Can.push(ls);
    destroyChart("chPerCanalesTop");
    if (top15Can.length === 0) {
      setChartEmptyState("chPerCanalesTop", "Sin entidades con gastos de producción", "No se informan comisiones positivas.");
    } else {
      setChartEmptyState("chPerCanalesTop", null);
      charts.chPerCanalesTop = new Chart(document.getElementById("chPerCanalesTop"), {
        type: "bar",
        data: {
          labels: top15Can.map((r) => r.esLS ? `★ ${r.nombre}` : r.nombre),
          datasets: [
            { label: "PAS %", data: top15Can.map((r) => r.com_pas_share || 0), rawMiles: top15Can.map((r) => r.com_pas || 0), backgroundColor: BRAND.red, borderRadius: 2 },
            { label: "Ag. Institorios %", data: top15Can.map((r) => r.com_inst_share || 0), rawMiles: top15Can.map((r) => r.com_inst || 0), backgroundColor: BRAND.blue, borderRadius: 2 },
            { label: "Otros %", data: top15Can.map((r) => r.com_otros_share || 0), rawMiles: top15Can.map((r) => r.com_otros || 0), backgroundColor: "rgba(48,48,45,0.65)", borderRadius: 2 },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtPct(ctx.parsed.x, 1)} (${fmtMoney(ctx.dataset.rawMiles[ctx.dataIndex] || 0)})` } },
          },
          scales: {
            x: { stacked: true, min: 0, max: 100, ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } },
            y: { stacked: true, grid: { display: false } },
          },
        },
      });
    }

    // 4. Tabla Canales Implícitos SINENSUP
    const canShow = state.perCanShowAll ? canRanked : top15Can;
    const btnTog = document.getElementById("btnPerCanToggle");
    if (btnTog) btnTog.textContent = state.perCanShowAll ? "Ver Top 15 + LS" : `Ver Todas (${canRanked.length})`;
    const canCols = [
      { key: "rank", label: "#", num: true },
      { key: "nombre", label: "Compañía", num: false, render: (r) => `${esc(r.nombre)} ${r.esLS ? '<span class="badge badge-ls">LS</span>' : ""}` },
      { key: "emit_sd", label: `Emit. SD (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.emit_sd) },
      { key: "g_prod", label: `G. Prod. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.g_prod) },
      { key: "com_pas", label: `PAS (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.com_pas) },
      { key: "com_pas_share", label: "PAS %", num: true, render: (r) => fmtPct(r.com_pas_share, 1) },
      { key: "com_inst", label: `Ag. Inst. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.com_inst) },
      { key: "com_inst_share", label: "Inst. %", num: true, render: (r) => fmtPct(r.com_inst_share, 1) },
      { key: "com_otros_share", label: "Otros %", num: true, render: (r) => fmtPct(r.com_otros_share, 1) },
      { key: "tasa_com_pas", label: "PAS/Em.%", num: true, render: (r) => fmtPct(r.tasa_com_pas, 2) },
      { key: "tasa_com_inst", label: "Inst/Em.%", num: true, render: (r) => fmtPct(r.tasa_com_inst, 2) },
    ];
    renderSortableTable(
      document.getElementById("perCanTableWrap"),
      canCols,
      canShow,
      state.perCanSort,
      (ns) => { state.perCanSort = ns; renderPersonas(); },
      {
        highlightLS: true,
        rowIdKey: "cod",
        onRowClick: (cod) => openFichaEntity("CIA:" + cod),
        footerRows: [{
          rank: "—",
          nombre: `TOTAL ALCANCE (${canRanked.length} cías)`,
          emit_sd: fmtNumMiles(mkt.emit_sd),
          g_prod: fmtNumMiles(mkt.g_prod),
          com_pas: fmtNumMiles(mkt.com_pas),
          com_pas_share: fmtPct(mkt.com_pas_share, 1),
          com_inst: fmtNumMiles(mkt.com_inst),
          com_inst_share: fmtPct(mkt.com_inst_share, 1),
          com_otros_share: fmtPct(mkt.com_otros_share, 1),
          tasa_com_pas: fmtPct(mkt.tasa_com_pas, 2),
          tasa_com_inst: fmtPct(mkt.tasa_com_inst, 2),
        }],
      }
    );
    const expCanFn = () => {
      const uDec = unitDecimals();
      exportToCSV(
        `personas_canales_comisiones_${PERIODOS[pIdx].id}.csv`,
        canCols.map((c) => c.label),
        canRanked.map((r) => canCols.map((c) => {
          const v = r[c.key];
          if (typeof v !== "number") return v ?? "";
          if (c.key === "rank" || c.key.includes("share") || c.key.startsWith("tasa_")) return v.toFixed(2);
          return (v / div).toFixed(uDec);
        }))
      );
    };
    document.getElementById("btnExportPerCan").onclick = expCanFn;
    document.getElementById("btnExportPer").onclick = expCanFn;

    // 5. Bloque Externo SSN #4: Canales de Venta Oficiales
    const cv = SSN_EXTRAS.canales_venta;
    const badgeEl = document.getElementById("ssnCanalesBadge");
    if (!cv || !cv.years || cv.years.length === 0) {
      if (badgeEl) badgeEl.textContent = "Sin datos externos";
      return;
    }
    if (badgeEl) badgeEl.textContent = `Fuente SSN · Ej. ${cv.latest_year}`;
    const segKey = state.ssnCanSeg || "personas";
    const isRamoSeg = ["personas", "patrimoniales", "total"].includes(segKey);
    const yrs = cv.years;
    const srcDict = isRamoSeg ? (cv.por_ramo_pct || {}) : (cv.por_actividad_pct || {});
    const segLabelsMap = {
      personas: "Agrupamiento: Seguros de Personas",
      pers_excl: "Exclusivas de Personas (Vida)",
      mix_pers: "Mixtas — Cartera Personas",
      retiro_excl: "Exclusivas de Retiro",
      patrimoniales: "Agrupamiento: Daños Patrimoniales",
      total: "Mercado Asegurador Total",
    };
    document.getElementById("ssnCanEvoTitle").textContent = `Evolución Histórica Canales (${yrs[0]}–${yrs[yrs.length - 1]}) · ${segLabelsMap[segKey] || segKey}`;

    const canalSeriesDefs = [
      { key: "directa", label: "Venta Directa", color: BRAND.ink },
      { key: "pas_pf", label: "PAS (Personas Físicas)", color: BRAND.red },
      { key: "soc_prod", label: "Sociedades de Productores", color: BRAND.orange },
      { key: "inst_bancos", label: "Ag. Institorios — Bancos", color: BRAND.blue },
      { key: "inst_oth", label: "Ag. Institorios — Coop. y Otras PJ", color: BRAND.green, fn: (b) => (b.inst_coop || 0) + (b.inst_otras || 0) },
    ];
    destroyChart("chSsnCanalesEvo");
    charts.chSsnCanalesEvo = new Chart(document.getElementById("chSsnCanalesEvo"), {
      type: "bar",
      data: {
        labels: yrs.map((y) => `Ej. ${y}`),
        datasets: canalSeriesDefs.map((cd) => ({
          label: cd.label,
          data: yrs.map((y) => {
            const bk = (srcDict[String(y)] || {})[segKey] || {};
            return cd.fn ? cd.fn(bk) : (bk[cd.key] || 0);
          }),
          backgroundColor: cd.color,
          borderRadius: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: (ctx) => chartPctTooltipLabel(ctx, 1) } } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, min: 0, max: 100, ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } },
        },
      },
    });

    // Gráfico 4: Jurisdicciones Top 12 Personas
    document.querySelectorAll("#ssnCanProvTabs .seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.provmode === state.ssnCanProvMode);
    });
    const jursTop12 = (cv.jurisdicciones || []).filter((j) => j.prov !== "Sin clasificación").slice(0, 12);
    destroyChart("chSsnCanalesProv");
    if (state.ssnCanProvMode === "mix") {
      document.getElementById("ssnCanProvTitle").textContent = `Mix de Canales por Jurisdicción (Top 12 Personas · Ej. ${cv.latest_year})`;
      charts.chSsnCanalesProv = new Chart(document.getElementById("chSsnCanalesProv"), {
        type: "bar",
        data: {
          labels: jursTop12.map((j) => j.prov),
          datasets: [
            { label: "Directa", data: jursTop12.map((j) => j.directa || 0), backgroundColor: BRAND.ink },
            { label: "PAS PF", data: jursTop12.map((j) => j.pas_pf || 0), backgroundColor: BRAND.red },
            { label: "Soc. Prod.", data: jursTop12.map((j) => j.soc_prod || 0), backgroundColor: BRAND.orange },
            { label: "Inst. Bancos", data: jursTop12.map((j) => j.inst_bancos || 0), backgroundColor: BRAND.blue },
            { label: "Inst. Otras", data: jursTop12.map((j) => j.inst_otras || 0), backgroundColor: BRAND.green },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { tooltip: { callbacks: { label: (ctx) => chartPctTooltipLabel(ctx, 1) } } },
          scales: {
            x: { stacked: true, min: 0, max: 100, ticks: { callback: chartPctTick } },
            y: { stacked: true, grid: { display: false } },
          },
        },
      });
    } else {
      document.getElementById("ssnCanProvTitle").textContent = `Producción Seguros de Personas por Provincia (Top 12 · Ej. ${cv.latest_year})`;
      const totPersJ = (cv.jurisdicciones || []).reduce((s, j) => s + (j.prod_pers_k || 0), 0);
      charts.chSsnCanalesProv = new Chart(document.getElementById("chSsnCanalesProv"), {
        type: "bar",
        data: {
          labels: jursTop12.map((j) => j.prov),
          datasets: [{
            label: "Primas Personas ($ M Jun-2025)",
            data: jursTop12.map((j) => (j.prod_pers_k || 0) / 1000.0),
            sharePct: jursTop12.map((j) => totPersJ > 0 ? ((j.prod_pers_k || 0) / totPersJ) * 100 : 0),
            backgroundColor: BRAND.red,
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => ` $ ${(ctx.parsed.x || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })} M (${fmtPct(ctx.dataset.sharePct[ctx.dataIndex], 1)} del país)`,
              },
            },
          },
          scales: { x: { ticks: { callback: (v) => v.toLocaleString("es-AR") }, grid: { color: "#f0f0f4" } }, y: { grid: { display: false } } },
        },
      });
    }

    const rp = cv.red_productores || {};
    document.getElementById("ssnCanRedNote").innerHTML =
      `<strong>Red de Productores SSN (Ej. ${cv.latest_year}):</strong> ${(rp.pas_cant || 0).toLocaleString("es-AR")} Productores Asesores y ${(rp.soc_cant || 0).toLocaleString("es-AR")} Sociedades de Productores activos. ` +
      `El <strong>${fmtPct(rp.pas_10plus_cias_pct, 1)}</strong> de la producción de PAS PF y el <strong>${fmtPct(rp.soc_10plus_cias_pct, 1)}</strong> de Sociedades corresponden a operadores que trabajan con más de 10 aseguradoras.`;
  }

  function renderPersonasJudReas(pIdx, bench, scopeDesc, univDesc, targetSrIdxs, corpOpts) {
    const { mkt, top10, ls, allRows } = bench;
    const div = unitDivisor();
    const noLsMsg = "No opera en este alcance";

    // === SECCIÓN 1: JUDICIALIZACIÓN Y SUFICIENCIA DE RESERVAS (SINENSUP #4) ===
    renderBenchmarkKpiGrid("perJudKpis", [
      {
        label: "Índice de Judicialización (Juicios + Med.)",
        accent: "accent-orange",
        lsVal: ls ? fmtPct(ls.jud_pct, 1) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.jud_pct, top10.jud_pct, true, "pp", 1) : "",
        lsSub: ls ? `Juicios: ${fmtMoney(ls.sp_juic)} · Med.: ${fmtMoney(ls.sp_med)}` : noLsMsg,
        top10Val: fmtPct(top10.jud_pct, 1),
        top10Sub: `Juic ${fmtPct(top10.juic_pct, 1)} · Med ${fmtPct(top10.med_pct, 1)}`,
        mktVal: fmtPct(mkt.jud_pct, 1),
        mktSub: `Juic ${fmtPct(mkt.juic_pct, 1)} · Med ${fmtPct(mkt.med_pct, 1)}`,
      },
      {
        label: "Cobertura IBNR (% s/ Reserva Bruta)",
        accent: "accent-blue",
        lsVal: ls ? fmtPct(ls.ibnr_res_pct, 1) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.ibnr_res_pct, top10.ibnr_res_pct, false, "pp", 1) : "",
        lsSub: ls ? `IBNR: ${fmtMoney(ls.sp_ibnr)} · ${fmtPct(ls.ibnr_sin_pct, 1)} s/ Sin.Dev.` : noLsMsg,
        top10Val: fmtPct(top10.ibnr_res_pct, 1),
        top10Sub: `IBNR: ${fmtMoney(top10.sp_ibnr)}`,
        mktVal: fmtPct(mkt.ibnr_res_pct, 1),
        mktSub: `IBNR: ${fmtMoney(mkt.sp_ibnr)}`,
      },
      {
        label: "Reserva Siniestros Bruta / Sin. Devengados",
        accent: "accent-ink",
        lsVal: ls ? fmtPct(ls.res_sin_dev_pct, 1) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.res_sin_dev_pct, top10.res_sin_dev_pct, false, "pp", 1) : "",
        lsSub: ls ? `Rva. Bruta: ${fmtMoney(ls.sp_bruto)} · Admin: ${fmtMoney(ls.sp_admin)}` : noLsMsg,
        top10Val: fmtPct(top10.res_sin_dev_pct, 1),
        top10Sub: `Rva. Bruta: ${fmtMoney(top10.sp_bruto)}`,
        mktVal: fmtPct(mkt.res_sin_dev_pct, 1),
        mktSub: `Rva. Bruta: ${fmtMoney(mkt.sp_bruto)}`,
      },
      {
        label: "Reservas Siniestros a/c Reaseg. (%)",
        accent: "accent-green",
        lsVal: ls ? fmtPct(ls.reas_res_pct, 1) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.reas_res_pct, top10.reas_res_pct, false, "pp", 1) : "",
        lsSub: ls ? `a/c Reas.: ${fmtMoney(ls.sp_reas)} · Neto: ${fmtMoney(ls.sp_neto)}` : noLsMsg,
        top10Val: fmtPct(top10.reas_res_pct, 1),
        top10Sub: `a/c Reas.: ${fmtMoney(top10.sp_reas)}`,
        mktVal: fmtPct(mkt.reas_res_pct, 1),
        mktSub: `a/c Reas.: ${fmtMoney(mkt.sp_reas)}`,
      },
    ]);

    const judMixGroups = [
      { label: "Mercado (Alcance)", obj: mkt },
      { label: "Top 10", obj: top10 },
      { label: "La Segunda Personas", obj: ls },
    ];
    PERSONAS_RAMO_ORDER.forEach((rCod) => {
      const srIds = PERSONAS_SUBRAMOS.filter((s) => s.cod_ramo === rCod).map((s) => s.idx);
      const rb = buildThreeWayBenchmark(computePrSubCompanyRows(pIdx, srIds, { ...corpOpts, includeYoY: false }), LS_PERSONAS_COD, "emit_sd");
      judMixGroups.push({ label: `Ramo: ${PERSONAS_RAMO_LABELS[rCod]}`, obj: rb.mkt });
    });
    const validJud = judMixGroups.filter((g) => g.obj && g.obj.sp_bruto > 0);
    destroyChart("chPerJudMix");
    if (validJud.length === 0) {
      setChartEmptyState("chPerJudMix", "Sin reservas de siniestros", "No hay saldos en 2.01.01.01 en este alcance.");
    } else {
      setChartEmptyState("chPerJudMix", null);
      const pctOfBruto = (o, k) => (o && o.sp_bruto > 0 ? ((o[k] || 0) / o.sp_bruto) * 100 : 0);
      charts.chPerJudMix = new Chart(document.getElementById("chPerJudMix"), {
        type: "bar",
        data: {
          labels: validJud.map((g) => g.label),
          datasets: [
            { label: "Administrativo", data: validJud.map((g) => pctOfBruto(g.obj, "sp_admin")), rawMiles: validJud.map((g) => g.obj.sp_admin || 0), backgroundColor: BRAND.blue },
            { label: "En Juicios", data: validJud.map((g) => pctOfBruto(g.obj, "sp_juic")), rawMiles: validJud.map((g) => g.obj.sp_juic || 0), backgroundColor: BRAND.red },
            { label: "En Mediación", data: validJud.map((g) => pctOfBruto(g.obj, "sp_med")), rawMiles: validJud.map((g) => g.obj.sp_med || 0), backgroundColor: BRAND.orange },
            { label: "Liquidados a Pagar", data: validJud.map((g) => pctOfBruto(g.obj, "sp_liq")), rawMiles: validJud.map((g) => g.obj.sp_liq || 0), backgroundColor: BRAND.yellow },
            { label: "IBNR Bruto", data: validJud.map((g) => pctOfBruto(g.obj, "sp_ibnr")), rawMiles: validJud.map((g) => g.obj.sp_ibnr || 0), backgroundColor: BRAND.green },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtPct(ctx.parsed.x, 1)} (${fmtMoney(ctx.dataset.rawMiles[ctx.dataIndex] || 0)})` } } },
          scales: {
            x: { stacked: true, min: 0, max: 100, ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } },
            y: { stacked: true, grid: { display: false } },
          },
        },
      });
    }

    // Evolución 12 trimestres Jud % e IBNR %
    const evoStart = Math.max(0, pIdx - 11);
    const jEvoLbl = [];
    const jMkt = [], jLs = [], iMkt = [], iLs = [];
    for (let q = evoStart; q <= pIdx; q++) {
      const qb = buildThreeWayBenchmark(computePrSubCompanyRows(q, targetSrIdxs, { ...corpOpts, includeYoY: false }), LS_PERSONAS_COD, "emit_sd");
      jEvoLbl.push(PERIODOS[q].label);
      jMkt.push(qb.mkt.jud_pct);
      jLs.push(qb.ls ? qb.ls.jud_pct : null);
      iMkt.push(qb.mkt.ibnr_res_pct);
      iLs.push(qb.ls ? qb.ls.ibnr_res_pct : null);
    }
    destroyChart("chPerJudEvo");
    charts.chPerJudEvo = new Chart(document.getElementById("chPerJudEvo"), {
      type: "line",
      data: {
        labels: jEvoLbl,
        datasets: [
          { label: "LS Personas — Judicialización %", data: jLs, borderColor: BRAND.red, backgroundColor: BRAND.red, borderWidth: 2.8, tension: 0.25 },
          { label: "Mercado — Judicialización %", data: jMkt, borderColor: BRAND.ink, backgroundColor: BRAND.ink, borderWidth: 2, tension: 0.25 },
          { label: "LS Personas — IBNR %", data: iLs, borderColor: BRAND.blue, backgroundColor: BRAND.blue, borderDash: [5, 4], borderWidth: 2.2, tension: 0.25 },
          { label: "Mercado — IBNR %", data: iMkt, borderColor: BRAND.green, backgroundColor: BRAND.green, borderDash: [5, 4], borderWidth: 2, tension: 0.25 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { tooltip: { callbacks: { label: (ctx) => chartPctTooltipLabel(ctx, 1) } } },
        scales: { y: { min: 0, ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } } },
      },
    });

    const judRanked = allRows.filter((r) => r.sp_bruto > 0).slice().sort((a, b) => b.sp_bruto - a.sp_bruto);
    const judShow = judRanked.slice(0, 20);
    if (ls && ls.sp_bruto > 0 && !judShow.some((x) => x.cod === ls.cod)) judShow.push(ls);
    const judCols = [
      { key: "rank", label: "#", num: true },
      { key: "nombre", label: "Compañía", num: false, render: (r) => `${esc(r.nombre)} ${r.esLS ? '<span class="badge badge-ls">LS</span>' : ""}` },
      { key: "sp_bruto", label: `Rva. Bruta (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.sp_bruto) },
      { key: "sp_admin", label: `Admin. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.sp_admin) },
      { key: "sp_juic", label: `Juicios (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.sp_juic) },
      { key: "sp_med", label: `Mediac. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.sp_med) },
      { key: "jud_pct", label: "Jud. %", num: true, render: (r) => `<strong>${fmtPct(r.jud_pct, 1)}</strong>` },
      { key: "sp_ibnr", label: `IBNR (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.sp_ibnr) },
      { key: "ibnr_res_pct", label: "IBNR %", num: true, render: (r) => fmtPct(r.ibnr_res_pct, 1) },
      { key: "sp_reas", label: `a/c Reas. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.sp_reas) },
      { key: "reas_res_pct", label: "Reas. %", num: true, render: (r) => fmtPct(r.reas_res_pct, 1) },
    ];
    renderSortableTable(
      document.getElementById("perJudTableWrap"),
      judCols,
      judShow,
      state.perJudSort,
      (ns) => { state.perJudSort = ns; renderPersonas(); },
      {
        highlightLS: true,
        rowIdKey: "cod",
        onRowClick: (cod) => openFichaEntity("CIA:" + cod),
        footerRows: [{
          rank: "—",
          nombre: `TOTAL MERCADO (${judRanked.length} cías)`,
          sp_bruto: fmtNumMiles(mkt.sp_bruto),
          sp_admin: fmtNumMiles(mkt.sp_admin),
          sp_juic: fmtNumMiles(mkt.sp_juic),
          sp_med: fmtNumMiles(mkt.sp_med),
          jud_pct: `<strong>${fmtPct(mkt.jud_pct, 1)}</strong>`,
          sp_ibnr: fmtNumMiles(mkt.sp_ibnr),
          ibnr_res_pct: fmtPct(mkt.ibnr_res_pct, 1),
          sp_reas: fmtNumMiles(mkt.sp_reas),
          reas_res_pct: fmtPct(mkt.reas_res_pct, 1),
        }],
      }
    );
    document.getElementById("btnExportPerJud").onclick = () => {
      const uDec = unitDecimals();
      exportToCSV(
        `personas_judicializacion_reservas_${PERIODOS[pIdx].id}.csv`,
        judCols.map((c) => c.label),
        judRanked.map((r) => judCols.map((c) => {
          const v = r[c.key];
          if (typeof v !== "number") return v ?? "";
          if (c.key === "rank" || c.key.endsWith("_pct")) return v.toFixed(2);
          return (v / div).toFixed(uDec);
        }))
      );
    };

    // === SECCIÓN 2: POLÍTICA Y EFICIENCIA DE REASEGURO (SINENSUP #5) ===
    renderBenchmarkKpiGrid("perReasKpis", [
      {
        label: "Tasa de Cesión (% Cedidas / Emitidas)",
        accent: "",
        lsVal: ls ? fmtPct(ls.cesion_pct, 2) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.cesion_pct, top10.cesion_pct, false, "pp", 2) : "",
        lsSub: ls ? `Cedidas: ${fmtMoney(ls.cedidas)} ${fmtDeltaBadge(ls.cesion_pct, mkt.cesion_pct, false, "pp", 2, "Mkt")}` : noLsMsg,
        top10Val: fmtPct(top10.cesion_pct, 2),
        top10Sub: `Cedidas: ${fmtMoney(top10.cedidas)}`,
        mktVal: fmtPct(mkt.cesion_pct, 2),
        mktSub: `Cedidas: ${fmtMoney(mkt.cedidas)}`,
      },
      {
        label: "Tasa de Retención Neta (%)",
        accent: "accent-blue",
        lsVal: ls ? fmtPct(ls.retencion_pct, 2) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.retencion_pct, top10.retencion_pct, false, "pp", 2) : "",
        lsSub: ls ? `Primas Retenidas: ${fmtMoney(ls.emit_sd - ls.cedidas)}` : noLsMsg,
        top10Val: fmtPct(top10.retencion_pct, 2),
        top10Sub: `Ret.: ${fmtMoney(top10.emit_sd - top10.cedidas)}`,
        mktVal: fmtPct(mkt.retencion_pct, 2),
        mktSub: `Ret.: ${fmtMoney(mkt.emit_sd - mkt.cedidas)}`,
      },
      {
        label: "Comisión de Reaseguro (% G.Gest. / Ced.)",
        accent: "accent-ink",
        lsVal: ls && ls.com_reas_pct != null ? fmtPct(ls.com_reas_pct, 1) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.com_reas_pct, top10.com_reas_pct, false, "pp", 1) : "",
        lsSub: ls ? `G. Gest. Reas.: ${fmtMoney(ls.g_reas)} · LR Ced.: ${fmtPct(ls.lr_cedido_pct, 1)}` : noLsMsg,
        top10Val: fmtPct(top10.com_reas_pct, 1),
        top10Sub: `G. Gest.: ${fmtMoney(top10.g_reas)}`,
        mktVal: fmtPct(mkt.com_reas_pct, 1),
        mktSub: `G. Gest.: ${fmtMoney(mkt.g_reas)}`,
      },
      {
        label: "Recupero Total Reaseg. (% s/ Primas Ced.)",
        accent: "accent-green",
        lsVal: ls && ls.recup_total_reas_pct != null ? fmtPct(ls.recup_total_reas_pct, 1) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.recup_total_reas_pct, top10.recup_total_reas_pct, false, "pp", 1) : "",
        lsSub: ls ? `Saldo Cedente: <span class="${pctClass(ls.saldo_neto_reas)}">${fmtMoney(ls.saldo_neto_reas)}</span>` : noLsMsg,
        top10Val: fmtPct(top10.recup_total_reas_pct, 1),
        top10Sub: `Saldo: ${fmtMoney(top10.saldo_neto_reas)}`,
        mktVal: fmtPct(mkt.recup_total_reas_pct, 1),
        mktSub: `Saldo: ${fmtMoney(mkt.saldo_neto_reas)}`,
      },
    ]);

    // Gráfico 3: Cesión % por Ramo de Personas (Mercado vs Top 10 vs LS)
    const cesRamos = PERSONAS_RAMO_ORDER.map((rCod) => {
      const srIds = PERSONAS_SUBRAMOS.filter((s) => s.cod_ramo === rCod).map((s) => s.idx);
      const rb = buildThreeWayBenchmark(computePrSubCompanyRows(pIdx, srIds, { ...corpOpts, includeYoY: false }), LS_PERSONAS_COD, "emit_sd");
      return { label: PERSONAS_RAMO_LABELS[rCod], mkt: rb.mkt.cesion_pct || 0, t10: rb.top10.cesion_pct || 0, ls: rb.ls ? (rb.ls.cesion_pct || 0) : null };
    });
    destroyChart("chPerReasSub");
    charts.chPerReasSub = new Chart(document.getElementById("chPerReasSub"), {
      type: "bar",
      data: {
        labels: cesRamos.map((x) => x.label),
        datasets: [
          { label: "Mercado", data: cesRamos.map((x) => x.mkt), backgroundColor: "rgba(48,48,45,0.72)", borderRadius: 4 },
          { label: "Top 10", data: cesRamos.map((x) => x.t10), backgroundColor: BRAND.blue, borderRadius: 4 },
          { label: "La Segunda Personas", data: cesRamos.map((x) => x.ls), backgroundColor: BRAND.red, borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: (ctx) => chartPctTooltipLabel(ctx, 2) } } },
        scales: { y: { min: 0, ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } }, x: { grid: { display: false } } },
      },
    });

    // Gráfico 4: Eficiencia Reaseguro Top 15 cedentes + LS
    const reasRanked = allRows.filter((r) => r.cedidas > 1.0).slice().sort((a, b) => b.cedidas - a.cedidas);
    const reasTop15 = reasRanked.slice(0, 15);
    if (ls && ls.cedidas > 0.1 && !reasTop15.some((x) => x.cod === ls.cod)) reasTop15.push(ls);
    destroyChart("chPerReasEff");
    if (reasTop15.length === 0) {
      setChartEmptyState("chPerReasEff", "Sin primas cedidas relevantes", "No hay entidades cedentes en este alcance.");
    } else {
      const reasFilt = filterChartOutliers(
        reasTop15,
        reasRanked,
        [{ key: "recup_total_reas_pct", suffix: "%" }],
        { sizeKey: "cedidas", weighted: true, anchorZero: true }
      );
      setChartEmptyState("chPerReasEff", null);
      charts.chPerReasEff = new Chart(document.getElementById("chPerReasEff"), {
        type: "bar",
        data: {
          labels: reasFilt.kept.map((r) => r.esLS ? `★ ${r.nombre}` : r.nombre),
          datasets: [{
            label: "Recupero Total % (Sin.Reas + G.Gest + Part.Util / Cedidas)",
            data: reasFilt.kept.map((r) => r.recup_total_reas_pct || 0),
            rawCed: reasFilt.kept.map((r) => r.cedidas),
            backgroundColor: reasFilt.kept.map((r) => r.esLS ? BRAND.red : ((r.recup_total_reas_pct || 0) >= 100 ? BRAND.green : BRAND.blue)),
            borderRadius: 4,
          }],
        },
        plugins: [makeVerticalLinePlugin(100, "100% Breakeven")],
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ` Retorno: ${fmtPct(ctx.parsed.x, 1)} (Cedidas: ${fmtMoney(ctx.dataset.rawCed[ctx.dataIndex] || 0)})` } },
          },
          scales: { x: { min: 0, ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } }, y: { grid: { display: false } } },
        },
      });
    }

    const reasCols = [
      { key: "rank", label: "#", num: true },
      { key: "nombre", label: "Compañía", num: false, render: (r) => `${esc(r.nombre)} ${r.esLS ? '<span class="badge badge-ls">LS</span>' : ""}` },
      { key: "emit_sd", label: `Emit. SD (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.emit_sd) },
      { key: "cedidas", label: `Cedidas (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.cedidas) },
      { key: "cesion_pct", label: "Cesión %", num: true, render: (r) => fmtPct(r.cesion_pct, 1) },
      { key: "sin_rec_reas", label: `Sin. a/c Reas. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.sin_rec_reas) },
      { key: "g_reas", label: `G.Reas. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.g_reas) },
      { key: "com_reas_pct", label: "Com.Reas.%", num: true, render: (r) => fmtPct(r.com_reas_pct, 1) },
      { key: "recup_total_reas_pct", label: "Recupero %", num: true, render: (r) => `<strong>${fmtPct(r.recup_total_reas_pct, 1)}</strong>` },
      { key: "saldo_neto_reas", label: `Saldo Cedente (${unitSuffix()})`, num: true, render: (r) => `<span class="${pctClass(r.saldo_neto_reas)}">${fmtNumMiles(r.saldo_neto_reas)}</span>` },
    ];
    renderSortableTable(
      document.getElementById("perReasTableWrap"),
      reasCols,
      reasTop15,
      state.perReasSort,
      (ns) => { state.perReasSort = ns; renderPersonas(); },
      {
        highlightLS: true,
        rowIdKey: "cod",
        onRowClick: (cod) => openFichaEntity("CIA:" + cod),
        footerRows: [{
          rank: "—",
          nombre: `TOTAL ALCANCE (${reasRanked.length} cedentes)`,
          emit_sd: fmtNumMiles(mkt.emit_sd),
          cedidas: fmtNumMiles(mkt.cedidas),
          cesion_pct: fmtPct(mkt.cesion_pct, 1),
          sin_rec_reas: fmtNumMiles(mkt.sin_rec_reas),
          g_reas: fmtNumMiles(mkt.g_reas),
          com_reas_pct: fmtPct(mkt.com_reas_pct, 1),
          recup_total_reas_pct: `<strong>${fmtPct(mkt.recup_total_reas_pct, 1)}</strong>`,
          saldo_neto_reas: `<span class="${pctClass(mkt.saldo_neto_reas)}">${fmtNumMiles(mkt.saldo_neto_reas)}</span>`,
        }],
      }
    );
    const expReasFn = () => {
      const uDec = unitDecimals();
      exportToCSV(
        `personas_reaseguro_${PERIODOS[pIdx].id}.csv`,
        reasCols.map((c) => c.label),
        reasRanked.map((r) => reasCols.map((c) => {
          const v = r[c.key];
          if (typeof v !== "number") return v ?? "";
          if (c.key === "rank" || c.key.endsWith("_pct")) return v.toFixed(2);
          return (v / div).toFixed(uDec);
        }))
      );
    };
    document.getElementById("btnExportPerReas").onclick = expReasFn;
    document.getElementById("btnExportPer").onclick = expReasFn;
  }

  function renderPersonasPolizas() {
    const psp = SSN_EXTRAS.polizas_sin_prim;
    const badgeEl = document.getElementById("perPolBadge");
    if (!psp || !psp.serie_personas || psp.serie_personas.length === 0) {
      if (badgeEl) badgeEl.textContent = "Sin datos externos";
      return;
    }
    if (badgeEl) badgeEl.textContent = `Fuente SSN · ${psp.latest_label}`;
    const sp = psp.serie_personas;
    const ss = psp.serie_siniestros || [];
    const lastP = sp[sp.length - 1];
    const yoyP = sp.length >= 5 ? sp[sp.length - 5] : null;
    const lastS = ss[ss.length - 1] || {};
    const yoyS = ss.length >= 5 ? ss[ss.length - 5] : null;

    const totPol = (lastP.vida_ind_pol || 0) + (lastP.vida_col_pol || 0) + (lastP.salud_pol || 0) + (lastP.sep_ind_pol || 0) + (lastP.sep_col_pol || 0) + (lastP.ap_pol || 0);
    const prevTotPol = yoyP ? (yoyP.vida_ind_pol + yoyP.vida_col_pol + yoyP.salud_pol + yoyP.sep_ind_pol + yoyP.sep_col_pol + yoyP.ap_pol) : null;
    const totCert = (lastP.vida_col_cert || 0) + (lastP.salud_cert || 0) + (lastP.sep_col_cert || 0) + (lastP.ap_cert || 0);
    const prevTotCert = yoyP ? (yoyP.vida_col_cert + yoyP.salud_cert + yoyP.sep_col_cert + yoyP.ap_cert) : null;
    const polYoY = prevTotPol ? ((totPol / prevTotPol) - 1) * 100 : null;
    const certYoY = prevTotCert ? ((totCert / prevTotCert) - 1) * 100 : null;
    const sinPersYoY = yoyS && yoyS.pers_tot ? ((lastS.pers_tot / yoyS.pers_tot) - 1) * 100 : null;
    const vidIndYoY = yoyP && yoyP.vida_ind_pol ? ((lastP.vida_ind_pol / yoyP.vida_ind_pol) - 1) * 100 : null;

    renderSimpleKpiGrid("perPolKpis", [
      {
        label: `Pólizas Vigentes Personas (${lastP.label})`,
        accent: "",
        value: totPol.toLocaleString("es-AR"),
        sub: `YoY físico: <span class="${pctClass(polYoY)}">${fmtSignedPct(polYoY)}</span> · Vida Ind.: ${lastP.vida_ind_pol.toLocaleString("es-AR")}`,
      },
      {
        label: `Certificados Vigentes Colectivos (${lastP.label})`,
        accent: "accent-blue",
        value: totCert.toLocaleString("es-AR"),
        sub: `YoY físico: <span class="${pctClass(certYoY)}">${fmtSignedPct(certYoY)}</span> · Vida Col.: ${(lastP.vida_col_cert / 1e6).toFixed(2)} M`,
      },
      {
        label: `Siniestros Pagados Personas (${lastS.label || "—"})`,
        accent: "accent-orange",
        value: (lastS.pers_tot || 0).toLocaleString("es-AR"),
        sub: `YoY: <span class="${pctClass(sinPersYoY, true)}">${fmtSignedPct(sinPersYoY)}</span> · AP ${(lastS.ap || 0).toLocaleString("es-AR")} · Vida Col ${(lastS.vida_col || 0).toLocaleString("es-AR")}`,
      },
      {
        label: `Vida Individual Pólizas (${lastP.label})`,
        accent: "accent-green",
        value: lastP.vida_ind_pol.toLocaleString("es-AR"),
        sub: `YoY físico: <span class="${pctClass(vidIndYoY)}">${fmtSignedPct(vidIndYoY)}</span> · AP Cert.: ${(lastP.ap_cert / 1e6).toFixed(2)} M`,
      },
    ]);

    // Tabla Movimiento & Churn (Cuadro 5)
    document.getElementById("perPolMovSub").textContent = `${psp.latest_label} · Stock inicial, entradas, bajas (salidas) y rotación trimestral por ramo`;
    const movRows = psp.movimiento_personas || [];
    let movHtml = `<table class="data-table table-compact"><thead><tr>
      <th>Ramo Personas</th><th>Unidad</th><th class="num">Al Inicio</th><th class="num">Entradas (+)</th><th class="num">Salidas (−)</th><th class="num">Al Cierre</th><th class="num">Var. Trim. %</th><th class="num">Alta %</th><th class="num">Churn %</th>
    </tr></thead><tbody>`;
    movRows.forEach((m) => {
      movHtml += `<tr>
        <td><strong>${esc(m.ramo)}</strong></td>
        <td><span class="badge badge-type">${esc(m.concepto)}</span></td>
        <td class="num">${m.inicio.toLocaleString("es-AR")}</td>
        <td class="num pos">+${m.entradas.toLocaleString("es-AR")}</td>
        <td class="num neg">−${m.salidas.toLocaleString("es-AR")}</td>
        <td class="num"><strong>${m.cierre.toLocaleString("es-AR")}</strong></td>
        <td class="num"><span class="${pctClass(m.var_trim_pct)}">${fmtSignedPct(m.var_trim_pct, 2)}</span></td>
        <td class="num">${fmtPct(m.alta_pct, 1)}</td>
        <td class="num">${fmtPct(m.churn_pct, 1)}</td>
      </tr>`;
    });
    movHtml += "</tbody></table>";
    document.getElementById("perPolMovWrap").innerHTML = movHtml;

    // Serie histórica Cuadro 6
    const ramoKey = state.perPolRamo || "vida_col_cert";
    const ramoTitleMap = {
      vida_col_cert: "Vida Colectivo — Certificados",
      vida_ind_pol: "Vida Individual — Pólizas",
      ap_cert: "Accidentes Personales — Certificados",
      ap_pol: "Accidentes Personales — Pólizas",
      salud_cert: "Salud — Certificados",
      sep_col_cert: "Sepelio Colectivo — Certificados",
      sep_ind_pol: "Sepelio Individual — Pólizas",
    };
    document.getElementById("perPolSerieTitle").textContent = `Evolución Trimestral: ${ramoTitleMap[ramoKey] || ramoKey}`;
    const perPolSubEl = document.getElementById("perPolSerieSub");
    if (perPolSubEl && sp.length > 0) {
      perPolSubEl.textContent = `Serie trimestral oficial SSN (${sp[0].y}–${sp[sp.length - 1].y})`;
    }
    destroyChart("chPerPolSerie");
    charts.chPerPolSerie = new Chart(document.getElementById("chPerPolSerie"), {
      type: "line",
      data: {
        labels: sp.map((x) => x.label),
        datasets: [{
          label: ramoTitleMap[ramoKey] || ramoKey,
          data: sp.map((x) => x[ramoKey] || 0),
          borderColor: BRAND.red,
          backgroundColor: "rgba(226, 0, 57, 0.10)",
          fill: true,
          borderWidth: 2.4,
          tension: 0.25,
          pointRadius: 2.2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${(ctx.parsed.y || 0).toLocaleString("es-AR")}` } },
        },
        scales: {
          y: { ticks: { callback: (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + " M" : (v >= 1000 ? (v / 1000).toFixed(0) + " k" : v) }, grid: { color: "#f0f0f4" } },
        },
      },
    });

    // Cruce Físico + Contable (Frecuencia Siniestral ‰ vs Prima Promedio Real $)
    document.querySelectorAll("#perPolCruceTabs .seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.crucemode === state.perPolCruceMode);
    });
    const ssByPer = new Map(ss.map((x) => [x.periodo, x]));
    const { byYm } = getProdMensualIndex();
    destroyChart("chPerPolCruce");
    if (state.perPolCruceMode === "prima") {
      document.getElementById("perPolCruceTitle").textContent = "Prima Trimestral Real Promedio por Póliza/Asegurado";
      document.getElementById("perPolCruceSub").textContent = `Cruce Producción Constante SSN (${SSN_EXTRAS.prod_mensual?.const_base_label || "Sep 2026"}) ÷ Stock Vigente Personas`;
      const ptPrimas = sp.map((pRow) => {
        const qEndMonth = pRow.tr * 3;
        let qProdPers = 0;
        let has3 = true;
        for (let k = 0; k < 3; k++) {
          const mm = String(qEndMonth - k).padStart(2, "0");
          const recM = byYm.get(`${pRow.y}-${mm}`);
          if (recM && recM.const && recM.const.pers_vida_otr != null) qProdPers += recM.const.pers_vida_otr;
          else has3 = false;
        }
        const qVidInd = (() => {
          let sum = 0;
          for (let k = 0; k < 3; k++) {
            const rM = byYm.get(`${pRow.y}-${String(qEndMonth - k).padStart(2, "0")}`);
            if (rM && rM.const && rM.const.vida_ind != null) sum += rM.const.vida_ind;
          }
          return sum;
        })();
        const totUnits = (pRow.vida_ind_pol || 0) + (pRow.vida_col_cert || 0) + (pRow.salud_cert || 0) + (pRow.sep_ind_pol || 0) + (pRow.sep_col_cert || 0) + (pRow.ap_cert || 0);
        return {
          label: pRow.label,
          primaTotUnit: (has3 && totUnits > 0) ? (qProdPers * 1e6) / totUnits : null,
          primaVidaInd: (has3 && pRow.vida_ind_pol > 0) ? (qVidInd * 1e6) / pRow.vida_ind_pol : null,
        };
      });
      charts.chPerPolCruce = new Chart(document.getElementById("chPerPolCruce"), {
        type: "line",
        data: {
          labels: ptPrimas.map((x) => x.label),
          datasets: [
            { label: "Prima Real Trim. / Vida+Pers Total ($)", data: ptPrimas.map((x) => x.primaTotUnit), borderColor: BRAND.ink, borderWidth: 2.2, tension: 0.25, yAxisID: "y" },
            { label: "Prima Real Trim. / Póliza Vida Ind. ($)", data: ptPrimas.map((x) => x.primaVidaInd), borderColor: BRAND.red, borderWidth: 2.4, tension: 0.25, yAxisID: "y1" },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: $ ${(ctx.parsed.y || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}` } } },
          scales: {
            y: { position: "left", title: { display: true, text: "Total Personas ($)" }, ticks: { callback: (v) => "$ " + v.toLocaleString("es-AR", { maximumFractionDigits: 0 }) }, grid: { color: "#f0f0f4" } },
            y1: { position: "right", title: { display: true, text: "Vida Individual ($)" }, ticks: { callback: (v) => "$ " + v.toLocaleString("es-AR", { maximumFractionDigits: 0 }) }, grid: { drawOnChartArea: false } },
          },
        },
      });
    } else {
      document.getElementById("perPolCruceTitle").textContent = "Frecuencia Siniestral Trimestral (‰ sobre Certificados / Pólizas)";
      document.getElementById("perPolCruceSub").textContent = "Siniestros Pagados SSN (Cuadro 4) cada 1.000 asegurados o pólizas vigentes (Cuadro 6)";
      const freqs = sp.map((pRow) => {
        const sr = ssByPer.get(pRow.periodo);
        return {
          label: pRow.label,
          ap: (sr && pRow.ap_cert > 0) ? (sr.ap / pRow.ap_cert) * 1000 : null,
          vind: (sr && pRow.vida_ind_pol > 0) ? (sr.vida_ind / pRow.vida_ind_pol) * 1000 : null,
          vcol: (sr && pRow.vida_col_cert > 0) ? (sr.vida_col / pRow.vida_col_cert) * 1000 : null,
        };
      });
      charts.chPerPolCruce = new Chart(document.getElementById("chPerPolCruce"), {
        type: "line",
        data: {
          labels: freqs.map((x) => x.label),
          datasets: [
            { label: "Accidentes Personales (‰ cert.)", data: freqs.map((x) => x.ap), borderColor: BRAND.red, borderWidth: 2.5, tension: 0.25 },
            { label: "Vida Colectivo (‰ cert.)", data: freqs.map((x) => x.vcol), borderColor: BRAND.blue, borderWidth: 2.2, tension: 0.25 },
            { label: "Vida Individual (‰ pól.)", data: freqs.map((x) => x.vind), borderColor: BRAND.green, borderWidth: 2.0, tension: 0.25 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${(ctx.parsed.y || 0).toFixed(2)} ‰` } } },
          scales: { y: { min: 0, ticks: { callback: (v) => v.toFixed(1) + "‰" }, grid: { color: "#f0f0f4" } } },
        },
      });
    }

    // Rankings Top 15 (Cuadros 7..16)
    const rkKey = state.perPolRkKey || "vida_col_pol";
    const rkObj = (psp.rankings || {})[rkKey] || { title: rkKey, rows: [] };
    document.getElementById("perPolRkChartTitle").textContent = `Top 15 Entidades: ${rkObj.title}`;
    destroyChart("chPerPolRank");
    const rRows = rkObj.rows || [];
    charts.chPerPolRank = new Chart(document.getElementById("chPerPolRank"), {
      type: "bar",
      data: {
        labels: rRows.map((r) => `${r.orden}. ${r.entidad}`),
        datasets: [{
          label: rkObj.title,
          data: rRows.map((r) => r.valor),
          pcts: rRows.map((r) => r.pct),
          backgroundColor: rRows.map((r) => r.is_ls ? BRAND.red : "rgba(48,48,45,0.72)"),
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${(ctx.parsed.x || 0).toLocaleString("es-AR")} (${fmtPct(ctx.dataset.pcts[ctx.dataIndex], 2)})` } },
        },
        scales: { x: { ticks: { callback: (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + " M" : (v >= 1000 ? (v / 1000).toFixed(0) + " k" : v) }, grid: { color: "#f0f0f4" } }, y: { grid: { display: false } } },
      },
    });
    let rkTblHtml = `<table class="data-table table-compact"><thead><tr><th class="num">#</th><th>Entidad (SSN)</th><th class="num">Cantidad</th><th class="num">Share %</th><th class="num">% Acum.</th></tr></thead><tbody>`;
    rRows.forEach((r) => {
      rkTblHtml += `<tr class="${r.is_ls ? "row-ls" : ""}">
        <td class="num">${r.orden}</td>
        <td><strong>${esc(r.entidad)}</strong> ${r.is_ls ? '<span class="badge badge-ls">LS</span>' : ""}</td>
        <td class="num">${r.valor.toLocaleString("es-AR")}</td>
        <td class="num">${fmtPct(r.pct, 2)}</td>
        <td class="num">${fmtPct(r.pct_acum, 2)}</td>
      </tr>`;
    });
    rkTblHtml += "</tbody></table>";
    document.getElementById("perPolRkTableWrap").innerHTML = rkTblHtml;

    document.getElementById("btnExportPerPolMov").onclick = () => {
      exportToCSV(
        `personas_polizas_movimiento_${psp.latest_periodo || "ssn"}.csv`,
        ["Ramo", "Concepto", "Al Inicio", "Entradas", "Salidas", "Al Cierre", "Var. Trim %", "Alta %", "Churn %"],
        movRows.map((m) => [m.ramo, m.concepto, m.inicio, m.entradas, m.salidas, m.cierre, m.var_trim_pct ?? "", m.alta_pct ?? "", m.churn_pct ?? ""])
      );
    };
  }

  // ==================== TAB 5: RETIRO ====================
  function renderRetiro() {
    const pIdx = state.pIdx;
    const vMode = state.retView;
    const isLooker = vMode === "looker";
    const isAseg = vMode === "asegurados";
    const isFlujoTasa = vMode === "flujotasa";
    const hideScope = isLooker || isAseg;

    document.getElementById("retViewGestion").style.display = vMode === "gestion" ? "block" : "none";
    document.getElementById("retViewFlujoTasa").style.display = isFlujoTasa ? "block" : "none";
    document.getElementById("retViewAsegurados").style.display = isAseg ? "block" : "none";
    document.getElementById("retViewLooker").style.display = isLooker ? "block" : "none";
    const scopeBar = document.getElementById("retScopeBar");
    if (scopeBar) scopeBar.style.display = hideScope ? "none" : "flex";

    const isRentasScope = !hideScope && state.retScopeCods.length > 0 && state.retScopeCods.every((c) => c === "2.070.01" || c === "2.070.02");
    const effTopBy = isRentasScope ? "comp_tec" : state.retTopBy;

    document.querySelectorAll("#retViewTabs .seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === vMode);
    });
    document.querySelectorAll("#retTopByTabs .seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.topby === effTopBy);
      if (vMode !== "gestion") {
        b.disabled = true;
        b.title = isLooker ? "Rankings ordena por Primas Emitidas" : "Selector aplicable en Gestión (SINENSUP)";
      } else if (isRentasScope && b.dataset.topby === "emit_sd") {
        b.disabled = true;
        b.title = "Las Rentas Previsionales y de RT no registran nuevas primas emitidas ($ 0); el Top 10 se ordena automáticamente por Reservas Matemáticas";
      } else {
        b.disabled = false;
        b.title = "";
      }
    });

    if (isLooker) {
      document.getElementById("liveCountPill").textContent = "Retiro · Rankings (Retiro Ind. y Col.)";
      document.getElementById("btnExportRet").onclick = () => {
        const exp = document.getElementById("btnExportRetLooker");
        if (exp) exp.click();
      };
      renderLookerGrid(pIdx, ["RET_IND", "RET_COL"], "retLookerGrid", "btnExportRetLooker", "retiro_looker");
      return;
    }

    if (isAseg) {
      document.getElementById("liveCountPill").textContent =
        `Retiro · Asegurados y Demografía SSN (${SSN_EXTRAS.retiro_est?.as_of_label || "SSN"})`;
      renderRetiroAsegurados();
      document.getElementById("btnExportRet").onclick = () => {
        const exp = document.getElementById("btnExportRetAseg");
        if (exp) exp.click();
      };
      return;
    }

    if (isRentasScope && state.retRkSort.key === "emit_sd") {
      state.retRkSort = { key: "comp_tec", dir: "desc" };
    }

    const retQueryOpts = { onlyTipo: "Retiro", includeYoY: true, mergeCorp: true };
    const toggleRetiroSubramo = (cod) => {
      if (!cod) {
        state.retScopeCods = [];
        return;
      }
      const next = new Set(state.retScopeCods);
      if (next.has(cod)) next.delete(cod);
      else next.add(cod);
      if (next.size === 0 || next.size >= RETIRO_SUBRAMOS.length) {
        state.retScopeCods = [];
      } else {
        state.retScopeCods = RETIRO_SUBRAMOS.map((sr) => sr.cod).filter((c) => next.has(c));
      }
    };

    const subPillsEl = document.getElementById("retSubramoPills");
    let rpHtml = `<button type="button" class="rm-sub-pill ${state.retScopeCods.length === 0 ? "active" : ""}" data-ret-sub="">Todo Retiro (4 subramos · 15 cías)</button>`;
    RETIRO_SUBRAMOS.forEach((sr) => {
      const isAct = state.retScopeCods.includes(sr.cod);
      rpHtml += `<button type="button" class="rm-sub-pill ${isAct ? "active" : ""}" data-ret-sub="${esc(sr.cod)}" title="Click para activar/desactivar (permite selección múltiple)"><span class="has-ls-dot"></span>${esc(RETIRO_SUB_LABELS[sr.cod] || sr.desc)}</button>`;
    });
    subPillsEl.innerHTML = rpHtml;
    subPillsEl.querySelectorAll("button[data-ret-sub]").forEach((btn) => {
      btn.addEventListener("click", () => {
        toggleRetiroSubramo(btn.dataset.retSub);
        renderRetiro();
      });
    });

    let targetSubs = RETIRO_SUBRAMOS;
    let scopeDesc = "Todo Retiro (4 subramos)";
    if (state.retScopeCods.length > 0) {
      const picked = RETIRO_SUBRAMOS.filter((x) => state.retScopeCods.includes(x.cod));
      if (picked.length > 0) {
        targetSubs = picked;
        scopeDesc = picked.length === 1
          ? `${RETIRO_SUB_LABELS[picked[0].cod] || picked[0].desc} (${picked[0].cod})`
          : picked.map((sr) => RETIRO_SUB_LABELS[sr.cod] || sr.desc).join(" + ");
      }
    }
    const targetSrIdxs = targetSubs.map((s) => s.idx);
    const bench = buildThreeWayBenchmark(computePrSubCompanyRows(pIdx, targetSrIdxs, retQueryOpts), LS_RETIRO_COD, effTopBy);
    const { mkt, top10, ls, top10Rows, allRows } = bench;

    const topCritLbl = effTopBy === "comp_tec" ? "Reservas Matemáticas (2.02)" : "Primas Emitidas SD";
    document.getElementById("retContextNote").innerHTML =
      `<span><strong>Alcance activo:</strong> ${esc(scopeDesc)} (${allRows.length} cías exclusivas)</span> · ` +
      `<span><strong>Criterio Top 10:</strong> ${esc(topCritLbl)}${isRentasScope ? " <em>(automático en Rentas por emisión nula)</em>" : ""}</span>`;
    document.getElementById("liveCountPill").textContent =
      `Retiro · ${allRows.length} cías exclusivas · ${scopeDesc}`;

    if (isFlujoTasa) {
      document.getElementById("retContextNote").innerHTML =
        `<span><strong>Alcance activo:</strong> ${esc(scopeDesc)} (${allRows.length} cías exclusivas)</span> · ` +
        `<span><strong>Monitor:</strong> Flujo Neto Orgánico (Emitidas − Rescates − Rentas) y Tasa Testigo Retiro Voluntario</span>`;
      document.getElementById("liveCountPill").textContent =
        `Retiro · Flujo Neto Orgánico (${allRows.length} cías) & Tasa Testigo Vol. (${SSN_EXTRAS.tasa_testigo_rv?.latest_label || "SSN"})`;
      renderRetiroFlujoTasa(pIdx, bench, scopeDesc, targetSrIdxs, retQueryOpts, effTopBy);
      document.getElementById("btnExportRet").onclick = () => {
        const b = document.getElementById("btnExportRetFno");
        if (b) b.click();
      };
      return;
    }

    // Bloque 1: 7 KPIs Comparativos Retiro
    const noLsRet = "Sin saldo en este subramo";
    const cards = [
      {
        label: "Primas Emitidas SD",
        accent: "",
        lsVal: ls ? fmtMoney(ls.emit_sd) : "—",
        lsBadgeHtml: ls && mkt.emit_sd > 0 ? `<span class="bench-delta">${fmtPct(ls.share_emit, 2)} mkt</span>` : "",
        lsSub: ls
          ? (ls.emit_sd > 0 ? `YoY: <span class="${pctClass(ls.emit_yoy)}">${fmtSignedPct(ls.emit_yoy)}</span> · Ranking #${ls.rank} (${effTopBy === "emit_sd" ? "Emit." : "Res."})` : "Subramo sin emisión nueva ($ 0)")
          : noLsRet,
        top10Val: fmtMoney(top10.emit_sd),
        top10Sub: `Conc. ${fmtPct(mkt.share_top10_emit, 1)} · YoY <span class="${pctClass(top10.emit_yoy)}">${fmtSignedPct(top10.emit_yoy)}</span>`,
        mktVal: fmtMoney(mkt.emit_sd),
        mktSub: `YoY <span class="${pctClass(mkt.emit_yoy)}">${fmtSignedPct(mkt.emit_yoy)}</span> · ${mkt.n_cias} cías`,
      },
      {
        label: "Reservas Matemáticas (Comp. Téc. 2.02)",
        accent: "accent-blue",
        lsVal: ls ? fmtMoney(ls.comp_tec) : "—",
        lsBadgeHtml: ls ? `<span class="bench-delta">${fmtPct(ls.share_res, 2)} mkt</span>` : "",
        lsSub: ls ? `YoY: <span class="${pctClass(ls.comp_tec_yoy)}">${fmtSignedPct(ls.comp_tec_yoy)}</span> · Deud. Aseg.: ${fmtMoney(ls.deudas_aseg)}` : noLsRet,
        top10Val: fmtMoney(top10.comp_tec),
        top10Sub: `Conc. ${fmtPct(mkt.share_top10_res, 1)} · YoY <span class="${pctClass(top10.comp_tec_yoy)}">${fmtSignedPct(top10.comp_tec_yoy)}</span>`,
        mktVal: fmtMoney(mkt.comp_tec),
        mktSub: `YoY <span class="${pctClass(mkt.comp_tec_yoy)}">${fmtSignedPct(mkt.comp_tec_yoy)}</span>`,
      },
      {
        label: "Flujo Neto Técnico (% s/ Reservas)",
        accent: "accent-green",
        lsVal: ls ? fmtPct(ls.flujo_neto_res_pct, 2) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.flujo_neto_res_pct, top10.flujo_neto_res_pct, false, "pp", 2) : "",
        lsSub: ls ? `Primas − Rescates − Rentas: <span class="${pctClass(ls.flujo_neto)}">${fmtMoney(ls.flujo_neto)}</span>` : noLsRet,
        top10Val: fmtPct(top10.flujo_neto_res_pct, 2),
        top10Sub: `<span class="${pctClass(top10.flujo_neto)}">${fmtMoney(top10.flujo_neto)}</span>`,
        mktVal: fmtPct(mkt.flujo_neto_res_pct, 2),
        mktSub: `<span class="${pctClass(mkt.flujo_neto)}">${fmtMoney(mkt.flujo_neto)}</span>`,
      },
      {
        label: "Egresos de Fondos (Rescates + Rentas)",
        accent: "accent-orange",
        lsVal: ls ? fmtPct(ls.egresos_res_pct, 2) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.egresos_res_pct, top10.egresos_res_pct, true, "pp", 2) : "",
        lsSub: ls ? `Rescates: ${fmtMoney(ls.rescates)} (${fmtPct(ls.resc_res_pct, 2)}) · Rentas: ${fmtMoney(ls.rentas)} (${fmtPct(ls.rentas_res_pct, 2)})` : noLsRet,
        top10Val: fmtPct(top10.egresos_res_pct, 2),
        top10Sub: `Resc ${fmtPct(top10.resc_res_pct, 2)} · Rent ${fmtPct(top10.rentas_res_pct, 2)}`,
        mktVal: fmtPct(mkt.egresos_res_pct, 2),
        mktSub: `Resc ${fmtPct(mkt.resc_res_pct, 2)} · Rent ${fmtPct(mkt.rentas_res_pct, 2)}`,
      },
      {
        label: "Gastos de Producción (% s/ Emitidas)",
        accent: "accent-ink",
        lsVal: ls && ls.gprod_emit_pct != null ? fmtPct(ls.gprod_emit_pct, 2) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.gprod_emit_pct, top10.gprod_emit_pct, true, "pp", 2) : "",
        lsSub: ls
          ? (ls.emit_sd > 0
              ? `G. Prod.: ${fmtMoney(ls.g_prod)} ${fmtDeltaBadge(ls.gprod_emit_pct, mkt.gprod_emit_pct, true, "pp", 2, "Mkt")}`
              : `G. Prod.: ${fmtMoney(ls.g_prod)} · Sin emisión nueva`)
          : noLsRet,
        top10Val: top10.gprod_emit_pct != null ? fmtPct(top10.gprod_emit_pct, 2) : "—",
        top10Sub: `Monto: ${fmtMoney(top10.g_prod)}`,
        mktVal: mkt.gprod_emit_pct != null ? fmtPct(mkt.gprod_emit_pct, 2) : "—",
        mktSub: `Monto: ${fmtMoney(mkt.g_prod)}`,
      },
      {
        label: "Gastos de Explotación (% s/ Pas. Téc.)",
        accent: "accent-ink",
        lsVal: ls ? fmtPct(ls.gexpl_pt_pct, 2) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.gexpl_pt_pct, top10.gexpl_pt_pct, true, "pp", 2) : "",
        lsSub: ls
          ? `G. Expl.: ${fmtMoney(ls.g_expl)}${ls.gexpl_emit_pct != null ? ` · ${fmtPct(ls.gexpl_emit_pct, 2)} s/ Emit.` : ""}`
          : noLsRet,
        top10Val: fmtPct(top10.gexpl_pt_pct, 2),
        top10Sub: `Monto: ${fmtMoney(top10.g_expl)}`,
        mktVal: fmtPct(mkt.gexpl_pt_pct, 2),
        mktSub: `Monto: ${fmtMoney(mkt.g_expl)}`,
      },
      {
        label: "Resultado Técnico (% s/ Pas. Téc.)",
        accent: "accent-blue",
        lsVal: ls ? fmtPct(ls.rt_pas_tec_pct, 2) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.rt_pas_tec_pct, top10.rt_pas_tec_pct, false, "pp", 2) : "",
        lsSub: ls ? `Res. Téc.: <span class="${pctClass(ls.res_tec)}">${fmtMoney(ls.res_tec)}</span>` : noLsRet,
        top10Val: fmtPct(top10.rt_pas_tec_pct, 2),
        top10Sub: `<span class="${pctClass(top10.res_tec)}">${fmtMoney(top10.res_tec)}</span>`,
        mktVal: fmtPct(mkt.rt_pas_tec_pct, 2),
        mktSub: `<span class="${pctClass(mkt.res_tec)}">${fmtMoney(mkt.res_tec)}</span>`,
      },
    ];
    renderBenchmarkKpiGrid("retBenchmarkKpis", cards);

    // Bloque 2: Matriz de los 4 Subramos de Retiro
    const subMatRows = [];
    RETIRO_SUBRAMOS.forEach((sr) => {
      const sortKeySr = (sr.cod === "2.070.01" || sr.cod === "2.070.02") ? "comp_tec" : state.retTopBy;
      const sb = buildThreeWayBenchmark(computePrSubCompanyRows(pIdx, [sr.idx], { ...retQueryOpts, mergeCorp: false }), LS_RETIRO_COD, sortKeySr);
      subMatRows.push({
        cod: sr.cod,
        desc: RETIRO_SUB_LABELS[sr.cod] || sr.desc,
        mkt_emit: sb.mkt.emit_sd,
        mkt_res: sb.mkt.comp_tec,
        mkt_flujo_pct: sb.mkt.flujo_neto_res_pct,
        mkt_gexpl: sb.mkt.gexpl_pt_pct,
        t10_res: sb.top10.comp_tec,
        t10_flujo_pct: sb.top10.flujo_neto_res_pct,
        ls_emit: sb.ls ? sb.ls.emit_sd : 0,
        ls_sh_emit: sb.ls ? sb.ls.share_emit : null,
        ls_res: sb.ls ? sb.ls.comp_tec : 0,
        ls_sh_res: sb.ls ? sb.ls.share_res : null,
        ls_flujo_pct: sb.ls ? sb.ls.flujo_neto_res_pct : null,
        ls_gexpl: sb.ls ? sb.ls.gexpl_pt_pct : null,
      });
    });
    const totRetB = state.retScopeCods.length === 0
      ? bench
      : buildThreeWayBenchmark(computePrSubCompanyRows(pIdx, RETIRO_SUBRAMOS.map((s) => s.idx), { ...retQueryOpts, mergeCorp: false }), LS_RETIRO_COD, state.retTopBy);

    const retMatEl = document.getElementById("retSubMatrixWrap");
    let rMatHtml = `<table class="data-table table-compact"><thead>
      <tr>
        <th rowspan="2">Subramo Retiro</th>
        <th colspan="4" class="num col-grp-sep">Mercado Retiro</th>
        <th colspan="2" class="num col-grp-sep">Top 10 Subramo</th>
        <th colspan="6" class="num col-ls col-grp-sep">La Segunda Retiro</th>
      </tr>
      <tr>
        <th class="num col-grp-sep">Emit. (${unitSuffix()})</th><th class="num">Res. Mat. (${unitSuffix()})</th><th class="num">Flujo Neto %</th><th class="num">Expl. s/PT%</th>
        <th class="num col-grp-sep">Res. Mat. (${unitSuffix()})</th><th class="num">Flujo Neto %</th>
        <th class="num col-ls col-grp-sep">Emit. (${unitSuffix()})</th><th class="num col-ls">Sh. Em.%</th><th class="num col-ls">Res. Mat. (${unitSuffix()})</th><th class="num col-ls">Sh. Res.%</th><th class="num col-ls">Flujo Neto %</th><th class="num col-ls">Expl. s/PT%</th>
      </tr>
    </thead><tbody>`;
    subMatRows.forEach((r) => {
      const sel = state.retScopeCods.includes(r.cod);
      rMatHtml += `<tr class="clickable ${sel ? "row-selected" : ""}" data-ret-sr="${esc(r.cod)}">
        <td><strong>${esc(r.desc)}</strong></td>
        <td class="num col-grp-sep">${fmtNumMiles(r.mkt_emit)}</td>
        <td class="num">${fmtNumMiles(r.mkt_res)}</td>
        <td class="num"><span class="${pctClass(r.mkt_flujo_pct)}">${fmtPct(r.mkt_flujo_pct, 2)}</span></td>
        <td class="num">${fmtPct(r.mkt_gexpl, 2)}</td>
        <td class="num col-grp-sep">${fmtNumMiles(r.t10_res)}</td>
        <td class="num"><span class="${pctClass(r.t10_flujo_pct)}">${fmtPct(r.t10_flujo_pct, 2)}</span></td>
        <td class="num col-ls col-grp-sep">${fmtNumMiles(r.ls_emit)}</td>
        <td class="num col-ls">${fmtPct(r.ls_sh_emit, 2)}</td>
        <td class="num col-ls">${fmtNumMiles(r.ls_res)}</td>
        <td class="num col-ls">${fmtPct(r.ls_sh_res, 2)}</td>
        <td class="num col-ls"><span class="${pctClass(r.ls_flujo_pct)}">${fmtPct(r.ls_flujo_pct, 2)}</span></td>
        <td class="num col-ls">${fmtPct(r.ls_gexpl, 2)}</td>
      </tr>`;
    });
    const rm = totRetB.mkt;
    const rt10 = totRetB.top10;
    const rls = totRetB.ls;
    rMatHtml += `</tbody><tfoot><tr>
      <td>TOTAL RETIRO (4 Subramos)</td>
      <td class="num col-grp-sep">${fmtNumMiles(rm.emit_sd)}</td>
      <td class="num">${fmtNumMiles(rm.comp_tec)}</td>
      <td class="num"><span class="${pctClass(rm.flujo_neto_res_pct)}">${fmtPct(rm.flujo_neto_res_pct, 2)}</span></td>
      <td class="num">${fmtPct(rm.gexpl_pt_pct, 2)}</td>
      <td class="num col-grp-sep">${fmtNumMiles(rt10.comp_tec)}</td>
      <td class="num"><span class="${pctClass(rt10.flujo_neto_res_pct)}">${fmtPct(rt10.flujo_neto_res_pct, 2)}</span></td>
      <td class="num col-grp-sep">${rls ? fmtNumMiles(rls.emit_sd) : "—"}</td>
      <td class="num">${rls ? fmtPct(rls.share_emit, 2) : "—"}</td>
      <td class="num">${rls ? fmtNumMiles(rls.comp_tec) : "—"}</td>
      <td class="num">${rls ? fmtPct(rls.share_res, 2) : "—"}</td>
      <td class="num">${rls ? `<span class="${pctClass(rls.flujo_neto_res_pct)}">${fmtPct(rls.flujo_neto_res_pct, 2)}</span>` : "—"}</td>
      <td class="num">${rls ? fmtPct(rls.gexpl_pt_pct, 2) : "—"}</td>
    </tr></tfoot></table>`;
    retMatEl.innerHTML = rMatHtml;
    retMatEl.querySelectorAll("tbody tr[data-ret-sr]").forEach((tr) => {
      tr.addEventListener("click", () => {
        toggleRetiroSubramo(tr.dataset.retSr);
        renderRetiro();
      });
    });

    // Bloque 3a Chart 1: Dinámica de Flujo de Fondos (% s/ Reservas Matemáticas)
    document.getElementById("retFlujosSub").textContent = `${scopeDesc} · Captación vs. Egresos en % s/ Reservas Matemáticas (2.02)`;
    const flEnts = [
      { label: "Mercado Retiro", obj: mkt, color: "rgba(48,48,45,0.72)" },
      { label: "Top 10", obj: top10, color: BRAND.blue },
      { label: "La Segunda Retiro", obj: ls, color: BRAND.red },
    ].filter((e) => e.obj && e.obj.comp_tec > 0);
    destroyChart("chRetFlujos");
    updateOutlierNote("retFlujosOutlierNote", [], null);
    if (flEnts.length === 0) {
      setChartEmptyState("chRetFlujos", "Sin reservas matemáticas en este alcance", "No hay compromisos técnicos positivos para normalizar flujos.");
    } else {
      setChartEmptyState("chRetFlujos", null);
      charts.chRetFlujos = new Chart(document.getElementById("chRetFlujos"), {
        type: "bar",
        data: {
          labels: ["Primas Emitidas (+)", "Rescates (−)", "Rentas (−)", "Flujo Neto (=)"],
          datasets: flEnts.map((e) => ({
            label: e.label,
            data: [
              e.obj.primas_res_pct || 0,
              -(e.obj.resc_res_pct || 0),
              -(e.obj.rentas_res_pct || 0),
              e.obj.flujo_neto_res_pct || 0,
            ],
            rawMiles: [e.obj.emit_sd, -e.obj.rescates, -e.obj.rentas, e.obj.flujo_neto],
            backgroundColor: e.color,
            borderRadius: 4,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: ${fmtPct(ctx.parsed.y, 2)} (${fmtMoney(ctx.dataset.rawMiles[ctx.dataIndex] || 0)})`,
              },
            },
          },
          scales: { y: { ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } }, x: { grid: { display: false } } },
        },
      });
    }

    // Bloque 3a Chart 2: Mapa de Posicionamiento Retiro
    const isTecFinScatter = state.retScatterMode === "tec_fin";
    const retCorpRowsAll = getCompanyRowsForPeriod(pIdx, false, { ignoreGranRamo: true }).filter((r) => r.tipo === "Retiro");
    const retTop10CodSet = new Set(top10Rows.map((x) => x.cod));
    const retCorpTop10Agg = aggregateMetrics(
      retCorpRowsAll.filter((r) => retTop10CodSet.has(r.cod)),
      resolveBaseAndMeses(pIdx, state.base).meses, pIdx, state.base, state.moneda, { scope: "market" }
    );
    const retCorpMktAgg = aggregateMetrics(
      retCorpRowsAll,
      resolveBaseAndMeses(pIdx, state.base).meses, pIdx, state.base, state.moneda, { scope: "market" }
    );
    const rScCfg = isTecFinScatter ? {
      x: "rt_pas_tec_pct",
      y: "ret_inv_pct",
      xl: "Res. Técnico % (s/ Deudas Aseg. + Comp. Téc.)",
      yl: "Retorno Inversiones % (incl. RECPAM · nivel entidad)",
      xTag: "Prom. Res. Téc.",
      yTag: "Prom. Ret. Inv.",
      avgX: mkt.rt_pas_tec_pct,
      avgY: retCorpMktAgg.ret_inv_pct,
      t10X: top10.rt_pas_tec_pct,
      t10Y: retCorpTop10Agg.ret_inv_pct,
      title: `Posicionamiento Retiro: Técnico % vs. Retorno Inv. % (${scopeDesc})`,
      sub: state.retScopeCods.length > 0 ? "Eje X de subramo(s) activo(s) · Eje Y corporativo (entidad completa)" : "Comparativa integral técnica y financiera (15 compañías)",
    } : {
      x: "egresos_res_pct",
      y: "gexpl_pt_pct",
      xl: "Tasa de Egresos % ((Rescates + Rentas) / Res. Mat.)",
      yl: "Gastos de Explotación % (s/ Pas. Téc.)",
      xTag: "Prom. Egresos",
      yTag: "Prom. G. Expl.",
      avgX: mkt.egresos_res_pct,
      avgY: mkt.gexpl_pt_pct,
      t10X: top10.egresos_res_pct,
      t10Y: top10.gexpl_pt_pct,
      title: `Eficiencia y Egresos Retiro: Egresos % vs. G. Expl. % (${scopeDesc})`,
      sub: "Presión de rescates/rentas sobre reservas vs. eficiencia operativa en el subramo",
    };
    document.getElementById("retScatterTitle").textContent = rScCfg.title;
    document.getElementById("retScatterSub").textContent = rScCfg.sub;
    const retInfoEl = document.getElementById("retScatterInfoNote");
    if (retInfoEl) retInfoEl.hidden = !isTecFinScatter;

    const rScFilt = filterChartOutliers(
      allRows,
      allRows,
      [{ key: rScCfg.x, suffix: "%" }, { key: rScCfg.y, suffix: "%" }],
      { sizeKey: "pas_tec", weighted: true, anchorZero: false }
    );
    destroyChart("chRetScatter");
    if (rScFilt.kept.length === 0) {
      updateOutlierNote("retScatterOutlierNote", [], null, false);
      setChartEmptyState("chRetScatter", "Sin datos para mapa Retiro", "No hay entidades con ambas métricas válidas.");
    } else {
      setChartEmptyState("chRetScatter", null);
      updateOutlierNote(
        "retScatterOutlierNote",
        rScFilt.dropped,
        ({ row, share }) => `${row.nombre} (${fmtPct(row[rScCfg.x], 2)} / ${fmtPct(row[rScCfg.y], 2)} · ${fmtPct(share * 100, 1)} Pas.Téc.)`,
        false
      );
      const rOtherPts = [];
      const rT10Pts = [];
      const rLsPts = [];
      rScFilt.kept.forEach((r) => {
        const pt = { x: r[rScCfg.x], y: r[rScCfg.y], name: r.nombre };
        if (r.cod === LS_RETIRO_COD) rLsPts.push(pt);
        else if (retTop10CodSet.has(r.cod)) rT10Pts.push(pt);
        else rOtherPts.push(pt);
      });
      const retAvgPlugin = {
        id: "retAvgLines",
        afterDatasetsDraw(chart) {
          drawScatterAvgGuides(chart, {
            avgX: rScCfg.avgX,
            avgY: rScCfg.avgY,
            avgXTxt: rScCfg.avgX != null ? `${rScCfg.xTag}: ${fmtPct(rScCfg.avgX, 2)}` : "",
            avgYTxt: rScCfg.avgY != null ? `${rScCfg.yTag}: ${fmtPct(rScCfg.avgY, 2)}` : "",
          });
        },
      };
      charts.chRetScatter = new Chart(document.getElementById("chRetScatter"), {
        type: "scatter",
        data: {
          datasets: [
            { label: "Resto Retiro", data: rOtherPts, backgroundColor: "rgba(48,48,45,0.40)", pointRadius: 4.5 },
            { label: "Top 10", data: rT10Pts, backgroundColor: "rgba(65,131,202,0.78)", pointRadius: 6 },
            { label: "La Segunda Retiro", data: rLsPts, backgroundColor: BRAND.red, pointRadius: 8.5 },
          ],
        },
        plugins: [retAvgPlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw.name}: (${fmtPct(ctx.raw.x, 2)}, ${fmtPct(ctx.raw.y, 2)})` } },
          },
          scales: {
            x: { title: { display: true, text: rScCfg.xl }, ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } },
            y: { title: { display: true, text: rScCfg.yl }, ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } },
          },
        },
      });
    }

    // Bloque 3b Chart 1: Evolución 12 Trimestres Retiro
    const evoStart = Math.max(0, pIdx - 11);
    const evoMet = state.retEvoMetric;
    const isDualShare = evoMet === "share_dual";
    const evoLabels = [];
    const eShareEmit = [];
    const eShareRes = [];
    const eMkt = [];
    const eT10 = [];
    const eLs = [];
    for (let q = evoStart; q <= pIdx; q++) {
      const qb = buildThreeWayBenchmark(
        computePrSubCompanyRows(q, targetSrIdxs, { ...retQueryOpts, includeYoY: false, mergeCorp: evoMet === "ret_inv_pct" }),
        LS_RETIRO_COD,
        effTopBy
      );
      evoLabels.push(PERIODOS[q].label);
      if (isDualShare) {
        eShareEmit.push(qb.ls && qb.totEmit > 0 ? qb.ls.share_emit : null);
        eShareRes.push(qb.ls ? qb.ls.share_res : null);
      } else if (evoMet === "ret_inv_pct") {
        const qAllRet = getCompanyRowsForPeriod(q, false, { ignoreGranRamo: true }).filter((r) => r.tipo === "Retiro");
        const qT10Set = new Set(qb.top10Rows.map((x) => x.cod));
        const { meses: qMeses } = resolveBaseAndMeses(q, state.base);
        const qMktC = aggregateMetrics(qAllRet, qMeses, q, state.base, state.moneda, { scope: "market" });
        const qT10C = aggregateMetrics(qAllRet.filter((r) => qT10Set.has(r.cod)), qMeses, q, state.base, state.moneda, { scope: "market" });
        const qLsC = qAllRet.find((r) => r.cod === LS_RETIRO_COD);
        eMkt.push(qMktC.ret_inv_pct);
        eT10.push(qT10C.ret_inv_pct);
        eLs.push(qLsC ? qLsC.ret_inv_pct : null);
      } else {
        eMkt.push(qb.mkt[evoMet]);
        eT10.push(qb.top10[evoMet]);
        eLs.push(qb.ls ? qb.ls[evoMet] : null);
      }
    }
    document.getElementById("retEvoSub").textContent = evoMet === "ret_inv_pct"
      ? `Retorno sobre Inversiones (nivel entidad · ${scopeDesc})`
      : `${scopeDesc} · Trayectoria Mercado vs. Top 10 vs. La Segunda Retiro`;
    const retEvoRaw = isDualShare ? [
      ...(isRentasScope ? [] : [{ label: "Share LS en Primas %", data: eShareEmit, borderColor: BRAND.blue, backgroundColor: BRAND.blue, borderWidth: 2.2, tension: 0.25 }]),
      { label: "Share LS en Reservas Matemáticas %", data: eShareRes, borderColor: BRAND.red, backgroundColor: BRAND.red, borderWidth: 2.8, tension: 0.25 },
    ] : [
      { label: "Mercado Retiro", data: eMkt, borderColor: BRAND.ink, backgroundColor: BRAND.ink, borderWidth: 2, tension: 0.25 },
      { label: "Top 10", data: eT10, borderColor: BRAND.blue, backgroundColor: BRAND.blue, borderWidth: 2.2, tension: 0.25 },
      { label: "La Segunda Retiro", data: eLs, borderColor: BRAND.red, backgroundColor: BRAND.red, borderWidth: 2.8, tension: 0.25 },
    ];
    const hasRetEvoData = retEvoRaw.some((ds) => ds.data.some((v) => typeof v === "number" && Number.isFinite(v)));
    destroyChart("chRetEvo");
    if (!hasRetEvoData) {
      updateOutlierNote("retEvoOutlierNote", [], null);
      setChartEmptyState("chRetEvo", "Sin serie histórica válida para esta métrica", "No se registran valores históricos suficientes para el subramo o métrica seleccionada.");
    } else {
      const retEvoFilt = filterTimeSeriesOutliers(evoLabels, retEvoRaw, { suffix: "%", extThreshold: 0.85, zThreshold: 3.5, maxDrops: 3 });
      updateOutlierNote(
        "retEvoOutlierNote",
        retEvoFilt.dropped,
        (d) => `${d.series} (${d.period}: ${fmtPct(d.value, 2)})`,
        { single: "El valor real se conserva en los datos.", plural: "Los valores reales se conservan en los datos." }
      );
      setChartEmptyState("chRetEvo", null);
      charts.chRetEvo = new Chart(document.getElementById("chRetEvo"), {
        type: "line",
        data: { labels: evoLabels, datasets: retEvoFilt.datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { tooltip: { callbacks: { label: (ctx) => chartPctTooltipLabel(ctx, 2) } } },
          scales: { y: { ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } } },
        },
      });
    }

    // Bloque 3b Chart 2: Mix de Reservas por Subramo o Ranking de Reservas en subramo único
    const div = unitDivisor();
    destroyChart("chRetMix");
    if (targetSubs.length > 1) {
      document.getElementById("retMixTitle").textContent = "Mix de Reservas Matemáticas: Mercado vs. Top 10 vs. La Segunda";
      document.getElementById("retMixSub").textContent = "Distribución % del stock de Compromisos Técnicos (2.02) entre los 4 subramos";
      const resSlices = RETIRO_SUBRAMOS.map((sr) => {
        const resS = computePrSubCompanyRows(pIdx, [sr.idx], { onlyTipo: "Retiro", includeYoY: false }).rows;
        const mktSum = resS.reduce((s, r) => s + Math.max(0, r.comp_tec), 0);
        const t10Sum = resS.filter((r) => retTop10CodSet.has(r.cod)).reduce((s, r) => s + Math.max(0, r.comp_tec), 0);
        const lsR = resS.find((r) => r.cod === LS_RETIRO_COD);
        return { label: RETIRO_SUB_LABELS[sr.cod] || sr.desc, mkt: mktSum, top10: t10Sum, ls: lsR ? Math.max(0, lsR.comp_tec) : 0 };
      });
      const totM = resSlices.reduce((s, x) => s + x.mkt, 0);
      const totT = resSlices.reduce((s, x) => s + x.top10, 0);
      const totL = resSlices.reduce((s, x) => s + x.ls, 0);
      setChartEmptyState("chRetMix", null);
      charts.chRetMix = new Chart(document.getElementById("chRetMix"), {
        type: "bar",
        data: {
          labels: ["Mercado Retiro", "Top 10", "La Segunda Retiro"],
          datasets: resSlices.map((sl, i) => ({
            label: sl.label,
            data: [totM > 0 ? (sl.mkt / totM) * 100 : 0, totT > 0 ? (sl.top10 / totT) * 100 : 0, totL > 0 ? (sl.ls / totL) * 100 : 0],
            rawMiles: [sl.mkt, sl.top10, sl.ls],
            backgroundColor: [BRAND.blue, BRAND.red, BRAND.ink, BRAND.yellow][i % 4],
            borderRadius: 2,
          })),
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtPct(ctx.parsed.x, 1)} (${fmtMoney(ctx.dataset.rawMiles[ctx.dataIndex] || 0)})` } } },
          scales: { x: { stacked: true, min: 0, max: 100, ticks: { callback: chartPctTick } }, y: { stacked: true, grid: { display: false } } },
        },
      });
    } else {
      document.getElementById("retMixTitle").textContent = `Reservas Matemáticas Top 10 + La Segunda en ${scopeDesc}`;
      document.getElementById("retMixSub").textContent = `Compromisos Técnicos (2.02) en ${unitSuffix()}`;
      const barRes = allRows.slice().sort((a, b) => b.comp_tec - a.comp_tec).slice(0, 10);
      if (ls && !barRes.some((x) => x.cod === ls.cod)) barRes.push(ls);
      setChartEmptyState("chRetMix", null);
      charts.chRetMix = new Chart(document.getElementById("chRetMix"), {
        type: "bar",
        data: {
          labels: barRes.map((r) => r.nombre),
          datasets: [{
            label: `Reservas Matemáticas (${unitSuffix()})`,
            data: barRes.map((r) => r.comp_tec / div),
            backgroundColor: barRes.map((r) => r.esLS ? BRAND.red : "rgba(48,48,45,0.72)"),
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: chartMoneyTooltipLabel } } },
          scales: { x: { ticks: { callback: chartMoneyTick }, grid: { color: "#f0f0f4" } }, y: { grid: { display: false } } },
        },
      });
    }

    // Bloque 4: Ranking Top 10 + La Segunda Retiro (o 15 cías)
    const retShowRows = state.retRkShowAll ? allRows : (() => {
      const list = top10Rows.slice();
      if (ls && !list.some((r) => r.cod === ls.cod)) list.push(ls);
      return list;
    })();
    document.getElementById("retRkTitle").textContent =
      `${state.retRkShowAll ? `Todas las Compañías de Retiro (${allRows.length})` : "Top 10 + La Segunda Retiro"} · ${scopeDesc} (orden: ${effTopBy === "comp_tec" ? "Reservas" : "Emitidas"})`;
    const btnRetTog = document.getElementById("btnRetRkToggle");
    if (btnRetTog) btnRetTog.textContent = state.retRkShowAll ? "Ver Top 10 + LS" : `Ver Todas (${allRows.length})`;

    const retRkCols = [
      { key: "rank", label: "#", num: true },
      { key: "nombre", label: "Compañía", num: false, render: (r) => `${esc(r.nombre)} ${r.esLS ? '<span class="badge badge-ls">LS</span>' : ""}` },
      { key: "emit_sd", label: `Emit. SD (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.emit_sd) },
      { key: "share_emit", label: "Sh. Em.%", num: true, render: (r) => fmtPct(r.share_emit) },
      { key: "comp_tec", label: `Res. Mat. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.comp_tec) },
      { key: "share_res", label: "Sh. Res.%", num: true, render: (r) => fmtPct(r.share_res) },
      { key: "rescates", label: `Rescates (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.rescates) },
      { key: "rentas", label: `Rentas (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.rentas) },
      { key: "flujo_neto_res_pct", label: "Flujo % Res.", title: "(Primas − Rescates − Rentas) / Reservas Matemáticas", num: true, render: (r) => `<span class="${pctClass(r.flujo_neto_res_pct)}">${fmtPct(r.flujo_neto_res_pct, 2)}</span>` },
      { key: "gprod_emit_pct", label: "G.Prod s/Em%", num: true, render: (r) => fmtPct(r.gprod_emit_pct, 2) },
      { key: "gexpl_pt_pct", label: "G.Expl s/PT%", num: true, render: (r) => fmtPct(r.gexpl_pt_pct, 2) },
      { key: "rt_pas_tec_pct", label: "Téc. s/PT%", num: true, render: (r) => `<span class="${pctClass(r.rt_pas_tec_pct)}">${fmtPct(r.rt_pas_tec_pct, 2)}</span>` },
      { key: "ret_inv_pct", label: "Ret. Inv%", title: "Nivel entidad completa", num: true, render: (r) => `<span class="${pctClass(r.ret_inv_pct)}">${fmtPct(r.ret_inv_pct, 2)}</span>` },
      { key: "cobertura_pct", label: "Cob. E%", title: "Nivel entidad completa", num: true, render: (r) => fmtPct(r.cobertura_pct, 1) },
    ];
    const retFooterRows = [
      {
        _cls: "tfoot-sub",
        rank: "—",
        nombre: `SUBTOTAL TOP 10 (${top10Rows.length} cías)`,
        emit_sd: fmtNumMiles(top10.emit_sd),
        share_emit: fmtPct(top10.share_emit),
        comp_tec: fmtNumMiles(top10.comp_tec),
        share_res: fmtPct(top10.share_res),
        rescates: fmtNumMiles(top10.rescates),
        rentas: fmtNumMiles(top10.rentas),
        flujo_neto_res_pct: `<span class="${pctClass(top10.flujo_neto_res_pct)}">${fmtPct(top10.flujo_neto_res_pct, 2)}</span>`,
        gprod_emit_pct: fmtPct(top10.gprod_emit_pct, 2),
        gexpl_pt_pct: fmtPct(top10.gexpl_pt_pct, 2),
        rt_pas_tec_pct: `<span class="${pctClass(top10.rt_pas_tec_pct)}">${fmtPct(top10.rt_pas_tec_pct, 2)}</span>`,
        ret_inv_pct: `<span class="${pctClass(retCorpTop10Agg.ret_inv_pct)}">${fmtPct(retCorpTop10Agg.ret_inv_pct, 2)}</span>`,
        cobertura_pct: fmtPct(retCorpTop10Agg.cobertura_pct, 1),
      },
      {
        rank: "—",
        nombre: `TOTAL MERCADO RETIRO (${allRows.length} cías)`,
        emit_sd: fmtNumMiles(mkt.emit_sd),
        share_emit: mkt.emit_sd > 0 ? "100,00%" : "—",
        comp_tec: fmtNumMiles(mkt.comp_tec),
        share_res: mkt.comp_tec > 0 ? "100,00%" : "—",
        rescates: fmtNumMiles(mkt.rescates),
        rentas: fmtNumMiles(mkt.rentas),
        flujo_neto_res_pct: `<span class="${pctClass(mkt.flujo_neto_res_pct)}">${fmtPct(mkt.flujo_neto_res_pct, 2)}</span>`,
        gprod_emit_pct: fmtPct(mkt.gprod_emit_pct, 2),
        gexpl_pt_pct: fmtPct(mkt.gexpl_pt_pct, 2),
        rt_pas_tec_pct: `<span class="${pctClass(mkt.rt_pas_tec_pct)}">${fmtPct(mkt.rt_pas_tec_pct, 2)}</span>`,
        ret_inv_pct: `<span class="${pctClass(retCorpMktAgg.ret_inv_pct)}">${fmtPct(retCorpMktAgg.ret_inv_pct, 2)}</span>`,
        cobertura_pct: fmtPct(retCorpMktAgg.cobertura_pct, 1),
      },
    ];
    renderSortableTable(
      document.getElementById("retRkTableWrap"),
      retRkCols,
      retShowRows,
      state.retRkSort,
      (nextSort) => { state.retRkSort = nextSort; renderRetiro(); },
      {
        highlightLS: true,
        rowIdKey: "cod",
        onRowClick: (cod) => openFichaEntity("CIA:" + cod),
        footerRows: retFooterRows,
      }
    );

    // Bloque 5: Gestión Financiera, Solvencia e Inversiones Retiro
    const lsCorpRet = retCorpRowsAll.find((r) => r.cod === LS_RETIRO_COD) || null;
    document.getElementById("retCorpSub").textContent =
      `Benchmark financiero y solvencia de las ${retCorpRowsAll.length} exclusivas de Retiro (Top 10 según ${topCritLbl} en ${scopeDesc})`;
    renderCorpBenchmarkTable("retCorpTableWrap", retCorpMktAgg, retCorpTop10Agg, lsCorpRet, true, "LS Retiro");
    renderAnexo2InvMixChart("chRetInvMix", retCorpMktAgg, retCorpTop10Agg, lsCorpRet, ["Mercado Retiro", "Top 10", "La Segunda Retiro"]);

    // Exports CSV Retiro
    const exportRetRankingFn = () => {
      const uDec = unitDecimals();
      const retScopeSlug = state.retScopeCods.length > 0 ? state.retScopeCods.join("_") : "todo";
      exportToCSV(
        `retiro_ranking_${retScopeSlug}_${PERIODOS[pIdx].id}.csv`,
        retRkCols.map((c) => c.label),
        allRows.map((r) => retRkCols.map((c) => {
          const v = r[c.key];
          if (typeof v !== "number") return v ?? "";
          if (c.key === "rank" || c.key.endsWith("_pct") || c.key.startsWith("share_")) return v.toFixed(2);
          return (v / div).toFixed(uDec);
        }))
      );
    };
    document.getElementById("btnExportRet").onclick = exportRetRankingFn;
    document.getElementById("btnExportRetRk").onclick = exportRetRankingFn;
    document.getElementById("btnExportRetSub").onclick = () => {
      const uDec = unitDecimals();
      exportToCSV(
        `retiro_subramos_${PERIODOS[pIdx].id}.csv`,
        ["Cód.", "Subramo", "Mkt Emit.", "Mkt Res.Mat.", "Mkt Flujo%", "Mkt Expl.s/PT%", "Top10 Res.Mat.", "Top10 Flujo%", "LS Emit.", "LS Sh.Em%", "LS Res.Mat.", "LS Sh.Res%", "LS Flujo%", "LS Expl.s/PT%"],
        subMatRows.map((r) => [
          r.cod, r.desc, (r.mkt_emit / div).toFixed(uDec), (r.mkt_res / div).toFixed(uDec),
          r.mkt_flujo_pct != null ? r.mkt_flujo_pct.toFixed(2) : "",
          r.mkt_gexpl != null ? r.mkt_gexpl.toFixed(2) : "",
          (r.t10_res / div).toFixed(uDec),
          r.t10_flujo_pct != null ? r.t10_flujo_pct.toFixed(2) : "",
          (r.ls_emit / div).toFixed(uDec),
          r.ls_sh_emit != null ? r.ls_sh_emit.toFixed(2) : "",
          (r.ls_res / div).toFixed(uDec),
          r.ls_sh_res != null ? r.ls_sh_res.toFixed(2) : "",
          r.ls_flujo_pct != null ? r.ls_flujo_pct.toFixed(2) : "",
          r.ls_gexpl != null ? r.ls_gexpl.toFixed(2) : "",
        ])
      );
    };
  }

  function renderRetiroFlujoTasa(pIdx, bench, scopeDesc, targetSrIdxs, retQueryOpts, effTopBy) {
    const { mkt, top10, ls, top10Rows, allRows } = bench;
    const div = unitDivisor();
    const uDec = unitDecimals();
    const uSuf = unitSuffix();
    const fnoUnit = state.retFnoUnit || "pct";
    const isPctMode = fnoUnit === "pct";
    const noLsRet = "Sin saldo en este subramo";

    document.querySelectorAll("#retFnoUnitTabs .seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.fnounit === fnoUnit);
    });

    // 1. 4 KPIs Flujo Neto Orgánico (SINENSUP #1)
    renderBenchmarkKpiGrid("retFnoKpis", [
      {
        label: "Flujo Neto Orgánico (% s/ Res. Mat.)",
        accent: "accent-green",
        lsVal: ls ? fmtPct(ls.flujo_neto_res_pct, 2) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.flujo_neto_res_pct, top10.flujo_neto_res_pct, false, "pp", 2) : "",
        lsSub: ls ? `Emitidas − Rescates − Rentas: <span class="${pctClass(ls.flujo_neto)}">${fmtMoney(ls.flujo_neto)}</span>` : noLsRet,
        top10Val: fmtPct(top10.flujo_neto_res_pct, 2),
        top10Sub: `<span class="${pctClass(top10.flujo_neto)}">${fmtMoney(top10.flujo_neto)}</span>`,
        mktVal: fmtPct(mkt.flujo_neto_res_pct, 2),
        mktSub: `<span class="${pctClass(mkt.flujo_neto)}">${fmtMoney(mkt.flujo_neto)}</span>`,
      },
      {
        label: "Tasa de Captación (Emitidas / Res. Mat.)",
        accent: "",
        lsVal: ls ? fmtPct(ls.primas_res_pct, 2) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.primas_res_pct, top10.primas_res_pct, false, "pp", 2) : "",
        lsSub: ls ? `Primas Emitidas SD: ${fmtMoney(ls.emit_sd)} (Sh. ${fmtPct(ls.share_emit, 2)})` : noLsRet,
        top10Val: fmtPct(top10.primas_res_pct, 2),
        top10Sub: `Emitidas SD: ${fmtMoney(top10.emit_sd)}`,
        mktVal: fmtPct(mkt.primas_res_pct, 2),
        mktSub: `Emitidas SD: ${fmtMoney(mkt.emit_sd)}`,
      },
      {
        label: "Tasa de Rescate (Rescates / Res. Mat.)",
        accent: "accent-orange",
        lsVal: ls ? fmtPct(ls.resc_res_pct, 2) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.resc_res_pct, top10.resc_res_pct, true, "pp", 2) : "",
        lsSub: ls ? `Rescates: ${fmtMoney(ls.rescates)} (${fmtPct(ls.resc_emit_pct, 1)} s/ Emit.)` : noLsRet,
        top10Val: fmtPct(top10.resc_res_pct, 2),
        top10Sub: `Rescates: ${fmtMoney(top10.rescates)}`,
        mktVal: fmtPct(mkt.resc_res_pct, 2),
        mktSub: `Rescates: ${fmtMoney(mkt.rescates)}`,
      },
      {
        label: "Tasa de Salida Total ((Rescates + Rentas) / RM)",
        accent: "accent-ink",
        lsVal: ls ? fmtPct(ls.egresos_res_pct, 2) : "—",
        lsBadgeHtml: ls ? fmtDeltaBadge(ls.egresos_res_pct, top10.egresos_res_pct, true, "pp", 2) : "",
        lsSub: ls ? `Egresos: ${fmtMoney(ls.egresos_ret)} · Rentas ${fmtMoney(ls.rentas)} (${fmtPct(ls.rentas_res_pct, 2)})` : noLsRet,
        top10Val: fmtPct(top10.egresos_res_pct, 2),
        top10Sub: `Resc. ${fmtPct(top10.resc_res_pct, 2)} · Rent. ${fmtPct(top10.rentas_res_pct, 2)}`,
        mktVal: fmtPct(mkt.egresos_res_pct, 2),
        mktSub: `Resc. ${fmtPct(mkt.resc_res_pct, 2)} · Rent. ${fmtPct(mkt.rentas_res_pct, 2)}`,
      },
    ]);

    // 2. Ranking Flujo Neto Orgánico (15 Entidades de Retiro)
    const fnoValKey = isPctMode ? "flujo_neto_res_pct" : "flujo_neto";
    const fnoChartRowsAll = allRows
      .filter((r) => typeof r[fnoValKey] === "number" && Number.isFinite(r[fnoValKey]) && (!isPctMode || r.comp_tec > 0))
      .slice()
      .sort((a, b) => b[fnoValKey] - a[fnoValKey]);
    const fnoFiltered = isPctMode
      ? filterChartOutliers(fnoChartRowsAll, fnoChartRowsAll, [{ key: "flujo_neto_res_pct", suffix: "%" }], { sizeKey: "comp_tec", weighted: true, anchorZero: true })
      : { kept: fnoChartRowsAll, dropped: [] };
    const fnoBars = fnoFiltered.kept;
    const fnoDropStr = fnoFiltered.dropped.length > 0
      ? ` · Sin ${fnoFiltered.dropped.length} outlier(s) extremo(s) en gráfico: ${fnoFiltered.dropped.map((d) => `${d.row.nombre} (${fmtSignedPct(d.row.flujo_neto_res_pct, 1)})`).join(", ")}`
      : "";
    document.getElementById("retFnoRankTitle").textContent =
      `Ranking Flujo Neto Orgánico (${fnoUnit === "pct" ? "% s/ Reservas Matemáticas" : "Montos en " + uSuf}) · ${allRows.length} Cías`;
    document.getElementById("retFnoRankSub").textContent =
      `${scopeDesc} · Primas Emitidas SD − Rescates − Rentas Vitalicias (rojo sólido = La Segunda Retiro · verde = flujo neto positivo)${fnoDropStr}`;

    destroyChart("chRetFnoRank");
    if (fnoBars.length === 0) {
      setChartEmptyState("chRetFnoRank", "Sin reservas o flujos válidos en este subramo", "El alcance seleccionado no registra compromisos técnicos ni flujos orgánicos positivos.");
    } else {
      setChartEmptyState("chRetFnoRank", null);
      charts.chRetFnoRank = new Chart(document.getElementById("chRetFnoRank"), {
        type: "bar",
        data: {
          labels: fnoBars.map((r) => r.esLS ? `★ ${r.nombre}` : r.nombre),
          datasets: [{
            label: isPctMode ? "Flujo Neto Orgánico (% s/ RM)" : `Flujo Neto Orgánico (${uSuf})`,
            data: fnoBars.map((r) => isPctMode ? r.flujo_neto_res_pct : r.flujo_neto),
            backgroundColor: fnoBars.map((r) => r.esLS ? BRAND.red : (r[fnoValKey] >= 0 ? "rgba(58,199,146,0.82)" : "rgba(102,102,97,0.58)")),
            borderColor: fnoBars.map((r) => r.esLS ? BRAND.redDark : (r[fnoValKey] >= 0 ? BRAND.green : BRAND.ink)),
            borderWidth: fnoBars.map((r) => r.esLS ? 2 : 1),
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                afterBody: (items) => {
                  const idx = items[0]?.dataIndex;
                  const r = fnoBars[idx];
                  if (!r) return [];
                  return [
                    `Emitidas SD: ${fmtMoney(r.emit_sd)} (Capt. ${fmtPct(r.primas_res_pct, 2)})`,
                    `Rescates: −${fmtMoney(r.rescates)} (${fmtPct(r.resc_res_pct, 2)})`,
                    `Rentas: −${fmtMoney(r.rentas)} (${fmtPct(r.rentas_res_pct, 2)})`,
                    `Reservas Matemáticas: ${fmtMoney(r.comp_tec)}`,
                  ];
                },
                label: (ctx) => {
                  const r = fnoBars[ctx.dataIndex];
                  return isPctMode
                    ? ` Flujo Neto: ${fmtPct(r.flujo_neto_res_pct, 2)} (${fmtMoney(r.flujo_neto)})`
                    : ` Flujo Neto: ${fmtMoney(r.flujo_neto)} (${fmtPct(r.flujo_neto_res_pct, 2)} s/ RM)`;
                },
              },
            },
          },
          scales: {
            x: {
              ticks: { callback: isPctMode ? chartPctTick : chartMoneyTick },
              grid: { color: "#f0f0f4" },
            },
            y: { grid: { display: false } },
          },
        },
      });
    }

    // 3. Evolución 12 Trimestres Flujo Neto Orgánico (SINENSUP #1)
    const evoStart = Math.max(0, pIdx - 11);
    const evoLabels = [];
    const eLsFlujo = [];
    const eMktFlujo = [];
    const eLsCap = [];
    const eLsSal = [];
    const eLsFlujoAbs = [];
    const eMktFlujoAbs = [];
    for (let q = evoStart; q <= pIdx; q++) {
      const qb = buildThreeWayBenchmark(
        computePrSubCompanyRows(q, targetSrIdxs, { ...retQueryOpts, includeYoY: false, mergeCorp: false }),
        LS_RETIRO_COD,
        effTopBy
      );
      evoLabels.push(PERIODOS[q].label);
      eLsFlujo.push(qb.ls ? qb.ls.flujo_neto_res_pct : null);
      eMktFlujo.push(qb.mkt ? qb.mkt.flujo_neto_res_pct : null);
      eLsCap.push(qb.ls ? qb.ls.primas_res_pct : null);
      eLsSal.push(qb.ls ? qb.ls.egresos_res_pct : null);
      eLsFlujoAbs.push(qb.ls ? qb.ls.flujo_neto : null);
      eMktFlujoAbs.push(qb.mkt ? qb.mkt.flujo_neto : null);
    }
    document.getElementById("retFnoEvoTitle").textContent = isPctMode
      ? "Evolución 12 Trimestres: Captación, Salida Total y Flujo Neto (% s/ Reservas)"
      : `Evolución 12 Trimestres: Flujo Neto Orgánico en Montos (${uSuf})`;
    document.getElementById("retFnoEvoSub").textContent = isPctMode
      ? `${scopeDesc} · Trayectoria La Segunda Retiro vs. Flujo Neto del Mercado`
      : `${scopeDesc} · Eje izquierdo: La Segunda Retiro · Eje derecho: Mercado Retiro`;

    destroyChart("chRetFnoEvo");
    charts.chRetFnoEvo = new Chart(document.getElementById("chRetFnoEvo"), {
      type: "line",
      data: isPctMode ? {
        labels: evoLabels,
        datasets: [
          { label: "LS Flujo Neto (% RM)", data: eLsFlujo, borderColor: BRAND.red, backgroundColor: BRAND.red, borderWidth: 2.8, tension: 0.25 },
          { label: "Mercado Flujo Neto (% RM)", data: eMktFlujo, borderColor: BRAND.ink, backgroundColor: BRAND.ink, borderWidth: 2.2, borderDash: [5, 4], tension: 0.25 },
          { label: "LS Captación (Emit. % RM)", data: eLsCap, borderColor: BRAND.blue, backgroundColor: BRAND.blue, borderWidth: 1.8, tension: 0.25 },
          { label: "LS Salida (Resc.+Rent. % RM)", data: eLsSal, borderColor: BRAND.orange, backgroundColor: BRAND.orange, borderWidth: 1.8, borderDash: [3, 3], tension: 0.25 },
        ],
      } : {
        labels: evoLabels,
        datasets: [
          { label: `LS Flujo Neto (${uSuf})`, data: eLsFlujoAbs, borderColor: BRAND.red, backgroundColor: BRAND.red, borderWidth: 2.8, tension: 0.25, yAxisID: "y" },
          { label: `Mercado Flujo Neto (${uSuf})`, data: eMktFlujoAbs, borderColor: BRAND.ink, backgroundColor: BRAND.ink, borderWidth: 2.2, borderDash: [5, 4], tension: 0.25, yAxisID: "y1" },
        ],
      },
      options: isPctMode ? {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { tooltip: { callbacks: { label: (ctx) => chartPctTooltipLabel(ctx, 2) } } },
        scales: { y: { ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } } },
      } : {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { tooltip: { callbacks: { label: chartMoneyTooltipLabel } } },
        scales: {
          y: { position: "left", title: { display: true, text: `LS Retiro (${uSuf})` }, ticks: { callback: chartMoneyTick }, grid: { color: "#f0f0f4" } },
          y1: { position: "right", title: { display: true, text: `Mercado Retiro (${uSuf})` }, ticks: { callback: chartMoneyTick }, grid: { drawOnChartArea: false } },
        },
      },
    });

    // 4. Tabla Completa 15 Entidades Flujo Neto Orgánico
    document.getElementById("retFnoTableTitle").textContent =
      `Tabla Completa de Flujo Neto Orgánico — ${allRows.length} Entidades de Retiro (${scopeDesc})`;
    const fnoCols = [
      { key: "rank", label: "#", num: true },
      { key: "nombre", label: "Compañía", num: false, render: (r) => `${esc(r.nombre)} ${r.esLS ? '<span class="badge badge-ls">LS</span>' : ""}` },
      { key: "emit_sd", label: `Emit. SD (${uSuf})`, num: true, render: (r) => fmtNumMiles(r.emit_sd) },
      { key: "rescates", label: `Rescates (${uSuf})`, num: true, render: (r) => fmtNumMiles(r.rescates) },
      { key: "rentas", label: `Rentas (${uSuf})`, num: true, render: (r) => fmtNumMiles(r.rentas) },
      { key: "flujo_neto", label: `Flujo Neto (${uSuf})`, num: true, render: (r) => `<span class="${pctClass(r.flujo_neto)}"><strong>${fmtNumMiles(r.flujo_neto)}</strong></span>` },
      { key: "comp_tec", label: `Res. Mat. (${uSuf})`, num: true, render: (r) => fmtNumMiles(r.comp_tec) },
      { key: "primas_res_pct", label: "Captación %", title: "Primas Emitidas SD / Reservas Matemáticas", num: true, render: (r) => fmtPct(r.primas_res_pct, 2) },
      { key: "resc_res_pct", label: "Rescate %", title: "Rescates / Reservas Matemáticas", num: true, render: (r) => fmtPct(r.resc_res_pct, 2) },
      { key: "rentas_res_pct", label: "Rentas %", title: "Rentas Vitalicias / Reservas Matemáticas", num: true, render: (r) => fmtPct(r.rentas_res_pct, 2) },
      { key: "egresos_res_pct", label: "Salida Total %", title: "(Rescates + Rentas) / Reservas Matemáticas", num: true, render: (r) => fmtPct(r.egresos_res_pct, 2) },
      { key: "flujo_neto_res_pct", label: "Flujo Neto % RM", title: "Flujo Neto Orgánico / Reservas Matemáticas", num: true, render: (r) => `<span class="${pctClass(r.flujo_neto_res_pct)}"><strong>${fmtPct(r.flujo_neto_res_pct, 2)}</strong></span>` },
    ];
    const fnoSortedRows = allRows.slice().sort((a, b) => {
      const k = state.retFnoSort.key;
      const d = state.retFnoSort.dir === "asc" ? 1 : -1;
      const va = a[k] ?? -9e15;
      const vb = b[k] ?? -9e15;
      if (typeof va === "string") return va.localeCompare(vb, "es") * d;
      return (va - vb) * d;
    });
    const fnoFooter = [
      {
        _cls: "tfoot-sub",
        rank: "—",
        nombre: `SUBTOTAL TOP 10 (${top10Rows.length} cías)`,
        emit_sd: fmtNumMiles(top10.emit_sd),
        rescates: fmtNumMiles(top10.rescates),
        rentas: fmtNumMiles(top10.rentas),
        flujo_neto: `<span class="${pctClass(top10.flujo_neto)}">${fmtNumMiles(top10.flujo_neto)}</span>`,
        comp_tec: fmtNumMiles(top10.comp_tec),
        primas_res_pct: fmtPct(top10.primas_res_pct, 2),
        resc_res_pct: fmtPct(top10.resc_res_pct, 2),
        rentas_res_pct: fmtPct(top10.rentas_res_pct, 2),
        egresos_res_pct: fmtPct(top10.egresos_res_pct, 2),
        flujo_neto_res_pct: `<span class="${pctClass(top10.flujo_neto_res_pct)}">${fmtPct(top10.flujo_neto_res_pct, 2)}</span>`,
      },
      {
        rank: "—",
        nombre: `TOTAL MERCADO RETIRO (${allRows.length} cías)`,
        emit_sd: fmtNumMiles(mkt.emit_sd),
        rescates: fmtNumMiles(mkt.rescates),
        rentas: fmtNumMiles(mkt.rentas),
        flujo_neto: `<span class="${pctClass(mkt.flujo_neto)}">${fmtNumMiles(mkt.flujo_neto)}</span>`,
        comp_tec: fmtNumMiles(mkt.comp_tec),
        primas_res_pct: fmtPct(mkt.primas_res_pct, 2),
        resc_res_pct: fmtPct(mkt.resc_res_pct, 2),
        rentas_res_pct: fmtPct(mkt.rentas_res_pct, 2),
        egresos_res_pct: fmtPct(mkt.egresos_res_pct, 2),
        flujo_neto_res_pct: `<span class="${pctClass(mkt.flujo_neto_res_pct)}">${fmtPct(mkt.flujo_neto_res_pct, 2)}</span>`,
      },
    ];
    renderSortableTable(
      document.getElementById("retFnoTableWrap"),
      fnoCols,
      fnoSortedRows,
      state.retFnoSort,
      (ns) => { state.retFnoSort = ns; renderRetiro(); },
      { highlightLS: true, rowIdKey: "cod", onRowClick: (cod) => openFichaEntity("CIA:" + cod), footerRows: fnoFooter }
    );
    document.getElementById("btnExportRetFno").onclick = () => {
      const slug = state.retScopeCods.length > 0 ? state.retScopeCods.join("_") : "todo";
      exportToCSV(
        `retiro_flujo_neto_${slug}_${PERIODOS[pIdx].id}.csv`,
        fnoCols.map((c) => c.label),
        fnoSortedRows.map((r) => fnoCols.map((c) => {
          const v = r[c.key];
          if (typeof v !== "number") return v ?? "";
          if (c.key === "rank" || c.key.endsWith("_pct")) return v.toFixed(2);
          return (v / div).toFixed(uDec);
        }))
      );
    };

    // 5. Externa SSN #2: Tasa Testigo Retiro Voluntario en Pesos (Res. SSN 38.428) — SIN Rentas Previsionales
    const tt = SSN_EXTRAS.tasa_testigo_rv || {};
    const ttSeriesRaw = tt.series || [];
    const { byYm } = getProdMensualIndex();
    const ttSeries = ttSeriesRaw.map((pt) => {
      const pmRec = byYm.get(pt.ym);
      return {
        ...pt,
        mom_ipc: pmRec ? pmRec.mom_ipc : null,
        ltm_ipc: pmRec ? pmRec.ltm_ipc : null,
      };
    });
    const ttMode = state.retTtMode || "mensual";
    const ttHoriz = state.retTtHoriz || "24";
    const ttHorizEl = document.getElementById("retTtHoriz");
    if (ttHorizEl) {
      if (ttSeries.length > 0) {
        const optAll = ttHorizEl.querySelector('option[value="all"]');
        if (optAll) optAll.textContent = `Serie completa (${ttSeries[0].y}–${ttSeries[ttSeries.length - 1].y})`;
      }
      if (ttHorizEl.value !== ttHoriz) ttHorizEl.value = ttHoriz;
    }
    document.querySelectorAll("#retTtModeTabs .seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.ttmode === ttMode);
    });
    document.getElementById("retTtBadge").textContent =
      `Fuente SSN · ${tt.latest_label || "—"} · ${ttSeries.length} meses (Solo Retiro Voluntario en $)`;

    const lastTt = ttSeries[ttSeries.length - 1] || null;
    const withIpc = ttSeries.filter((x) => x.mom_ipc != null && x.ltm_ipc != null);
    const lastBoth = withIpc[withIpc.length - 1] || null;
    const fisherRealLtm = (lastBoth && lastBoth.ltm != null && lastBoth.ltm_ipc != null && (1 + lastBoth.ltm_ipc / 100) > 0)
      ? (((1 + lastBoth.ltm / 100) / (1 + lastBoth.ltm_ipc / 100)) - 1) * 100
      : null;

    renderSimpleKpiGrid("retTtKpis", [
      {
        label: `Tasa Testigo Mensual (${lastTt ? lastTt.label : "—"})`,
        accent: "accent-red",
        value: lastTt ? fmtPct(lastTt.tasa, 2) : "—",
        sub: lastTt ? `TEA equivalente: ${fmtPct(lastTt.tea, 2)} · Res. SSN 38.428 (Retiro Voluntario)` : "Sin datos",
      },
      {
        label: `Acumulada Últimos 12 Meses (${lastTt ? lastTt.label : "—"})`,
        accent: "accent-blue",
        value: lastTt && lastTt.ltm != null ? fmtPct(lastTt.ltm, 2) : "—",
        sub: `Capitalización compuesta 12m Retiro Voluntario en $`,
      },
      {
        label: `Inflación IPC 12m (${lastBoth ? lastBoth.label : "—"})`,
        accent: "accent-ink",
        value: lastBoth ? fmtPct(lastBoth.ltm_ipc, 1) : "—",
        sub: lastBoth ? `Var. mensual IPC ${lastBoth.label}: ${fmtPct(lastBoth.mom_ipc, 2)} (IPC implícito SSN)` : "Sin serie IPC",
      },
      {
        label: `Spread Real Tasa Testigo vs. IPC (${lastBoth ? lastBoth.label : "—"})`,
        accent: "accent-green",
        value: fisherRealLtm != null ? fmtSignedPct(fisherRealLtm, 1) : "—",
        sub: lastBoth ? `Tasa Test. 12m ${fmtPct(lastBoth.ltm, 1)} vs. IPC 12m ${fmtPct(lastBoth.ltm_ipc, 1)}` : "Sin cruce",
      },
    ]);

    let ttSlice = ttSeries;
    if (ttHoriz === "2020") ttSlice = ttSeries.filter((x) => x.y >= 2020);
    else if (ttHoriz === "24") ttSlice = ttSeries.slice(-24);
    else if (ttHoriz === "36") ttSlice = ttSeries.slice(-36);

    const isMensualTt = ttMode === "mensual";
    document.getElementById("retTtChartTitle").textContent = isMensualTt
      ? "Tasa Testigo Retiro Voluntario Mensual vs. Inflación IPC Mensual (%)"
      : "Tasa Testigo Retiro Voluntario Acumulada 12m vs. Inflación IPC 12m (%)";
    document.getElementById("retTtChartSub").textContent =
      `Resolución SSN 38.428 (Pesos) · ${ttSlice[0]?.label || ""} a ${ttSlice[ttSlice.length - 1]?.label || ""} (IPC SSN disponible hasta ${lastBoth?.label || "—"})`;

    destroyChart("chRetTasaTestigo");
    if (ttSlice.length === 0) {
      setChartEmptyState("chRetTasaTestigo", "Sin serie de Tasa Testigo", "No se encontraron observaciones en ssn_extras.json.");
    } else {
      setChartEmptyState("chRetTasaTestigo", null);
      charts.chRetTasaTestigo = new Chart(document.getElementById("chRetTasaTestigo"), {
        type: "line",
        data: {
          labels: ttSlice.map((x) => x.label),
          datasets: [
            {
              label: isMensualTt ? "Tasa Testigo Mensual (%)" : "Tasa Testigo Acum. 12m (%)",
              data: ttSlice.map((x) => isMensualTt ? x.tasa : x.ltm),
              borderColor: BRAND.red,
              backgroundColor: BRAND.red,
              borderWidth: 2.6,
              tension: 0.25,
              pointRadius: ttSlice.length > 48 ? 0 : 2.5,
            },
            {
              label: isMensualTt ? "Inflación IPC Mensual (%)" : "Inflación IPC 12m (%)",
              data: ttSlice.map((x) => isMensualTt ? x.mom_ipc : x.ltm_ipc),
              borderColor: BRAND.ink,
              backgroundColor: BRAND.ink,
              borderWidth: 2,
              borderDash: [5, 4],
              tension: 0.25,
              spanGaps: false,
              pointRadius: ttSlice.length > 48 ? 0 : 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { tooltip: { callbacks: { label: (ctx) => chartPctTooltipLabel(ctx, 2) } } },
          scales: { y: { ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } } },
        },
      });
    }

    // 6. Cruce Tasa Testigo Trimestral vs. Retorno Inversiones Retiro (12 Trimestres, ajustado a state.base)
    const { base: effBase } = resolveBaseAndMeses(pIdx, state.base);
    const baseTag = effBase === "ltm" ? "LTM 12m" : (effBase === "estanco" ? "Trimestre Estanco 3m" : "Acumulado Ejercicio");
    document.getElementById("retTtVsRetTitle").textContent =
      `Tasa Testigo Retiro Voluntario vs. Retorno Inversiones de Retiro (12 Trim. · Base: ${baseTag})`;

    const ttByYmIdx = new Map(ttSeries.map((pt, i) => [pt.ym, i]));
    const cmpLabels = [];
    const cmpLsRet = [];
    const cmpMktRet = [];
    const cmpLsSinRec = [];
    const cmpTt = [];
    for (let q = evoStart; q <= pIdx; q++) {
      const pObj = PERIODOS[q];
      const { base: qBase, meses: qMeses } = resolveBaseAndMeses(q, state.base);
      const qAllRet = getCompanyRowsForPeriod(q, false, { ignoreGranRamo: true }).filter((r) => r.tipo === "Retiro");
      const qMktC = aggregateMetrics(qAllRet, qMeses, q, state.base, state.moneda, { scope: "market" });
      const qLsC = qAllRet.find((r) => r.cod === LS_RETIRO_COD) || null;

      const endYm = (pObj.fecha || "").slice(0, 7);
      const endPos = ttByYmIdx.get(endYm);
      const nM = qBase === "ltm" ? 12 : (qBase === "estanco" ? 3 : pObj.meses);
      let ttComp = null;
      if (endPos != null && endPos >= nM - 1) {
        let acc = 1.0;
        for (let k = endPos - nM + 1; k <= endPos; k++) {
          acc *= 1 + (ttSeries[k].tasa / 100);
        }
        ttComp = (acc - 1) * 100;
      }
      cmpLabels.push(pObj.label);
      cmpLsRet.push(qLsC ? qLsC.ret_inv_pct : null);
      cmpMktRet.push(qMktC ? qMktC.ret_inv_pct : null);
      cmpLsSinRec.push(qLsC ? qLsC.ret_inv_sin_recpam_pct : null);
      cmpTt.push(ttComp);
    }
    destroyChart("chRetTasaVsRetorno");
    charts.chRetTasaVsRetorno = new Chart(document.getElementById("chRetTasaVsRetorno"), {
      type: "line",
      data: {
        labels: cmpLabels,
        datasets: [
          { label: "LS Retiro — Retorno Inv. c/ RECPAM %", data: cmpLsRet, borderColor: BRAND.red, backgroundColor: BRAND.red, borderWidth: 2.6, tension: 0.25 },
          { label: "Mercado Retiro — Retorno Inv. c/ RECPAM %", data: cmpMktRet, borderColor: BRAND.ink, backgroundColor: BRAND.ink, borderWidth: 2, tension: 0.25 },
          { label: "LS Retiro — Retorno sin RECPAM %", data: cmpLsSinRec, borderColor: BRAND.orange, backgroundColor: BRAND.orange, borderWidth: 1.8, borderDash: [4, 3], tension: 0.25 },
          { label: `Tasa Testigo Ret. Vol. (${baseTag}) %`, data: cmpTt, borderColor: BRAND.blue, backgroundColor: BRAND.blue, borderWidth: 2.4, borderDash: [6, 4], tension: 0.25 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { tooltip: { callbacks: { label: (ctx) => chartPctTooltipLabel(ctx, 2) } } },
        scales: { y: { ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } } },
      },
    });

    document.getElementById("btnExportRetTt").onclick = () => {
      exportToCSV(
        `tasa_testigo_retiro_voluntario_${tt.latest_ym || "ssn"}.csv`,
        ["YM", "Período", "Tasa Mensual %", "TEA %", "Acumulada LTM %", "IPC Mensual %", "IPC LTM %"],
        ttSeries.map((pt) => [
          pt.ym, pt.label,
          pt.tasa != null ? pt.tasa.toFixed(4) : "",
          pt.tea != null ? pt.tea.toFixed(4) : "",
          pt.ltm != null ? pt.ltm.toFixed(4) : "",
          pt.mom_ipc != null ? pt.mom_ipc.toFixed(4) : "",
          pt.ltm_ipc != null ? pt.ltm_ipc.toFixed(4) : "",
        ])
      );
    };
  }

  function renderRetiroAsegurados() {
    const re = SSN_EXTRAS.retiro_est || {};
    const ents = re.entities || [];
    const div = unitDivisor();
    const uDec = unitDecimals();
    const uSuf = unitSuffix();
    const fmtPesos = (v) => (typeof v === "number" && Number.isFinite(v))
      ? "$ " + Math.round(v).toLocaleString("es-AR")
      : "—";
    const fmtInt = (v) => (typeof v === "number" && Number.isFinite(v))
      ? Math.round(v).toLocaleString("es-AR")
      : "—";

    document.getElementById("retAsegBadge").textContent =
      `Fuente SSN · ${re.as_of_label || "—"} (${ents.length} entidades · Estadística Retiro)`;

    if (ents.length === 0) {
      document.getElementById("retAsegKpis").innerHTML = "";
      document.getElementById("retAsegTableWrap").innerHTML = '<p class="text-muted">Sin datos de Estadística de Retiro SSN cargados.</p>';
      return;
    }

    const lsEnt = ents.find((e) => e.cod === LS_RETIRO_COD || e.is_ls) || null;
    const sortedByRm = ents.slice().sort((a, b) => (b.rm?.total || 0) - (a.rm?.total || 0));
    const top10Ents = sortedByRm.slice(0, 10);

    const sumEnts = (list) => {
      const acc = {
        rm_total: 0, rm_ahorro_ind: 0, rm_ahorro_col: 0, rm_renta_vol: 0,
        aseg_ind: 0, aseg_col: 0, ahorro_ind_pol: 0, ahorro_col_pol: 0,
        rent_vol_tot: 0,
      };
      list.forEach((e) => {
        acc.rm_total += e.rm?.total || 0;
        acc.rm_ahorro_ind += e.rm?.ahorro_ind || 0;
        acc.rm_ahorro_col += e.rm?.ahorro_col || 0;
        acc.rm_renta_vol += e.rm?.renta_vol_tot || 0;
        acc.aseg_ind += e.aseg_ind?.tot || 0;
        acc.aseg_col += e.aseg_col?.tot || 0;
        acc.ahorro_ind_pol += e.pol?.ahorro_ind_pol || 0;
        acc.ahorro_col_pol += e.pol?.ahorro_col_pol || 0;
        acc.rent_vol_tot += (e.rent_vol_ind?.tot || 0) + (e.rent_vol_col?.tot || 0);
      });
      acc.prom_ind = acc.aseg_ind > 0 ? (acc.rm_ahorro_ind * 1000) / acc.aseg_ind : null;
      acc.prom_col = acc.aseg_col > 0 ? (acc.rm_ahorro_col * 1000) / acc.aseg_col : null;
      return acc;
    };
    const mktAgg = sumEnts(ents);
    const t10Agg = sumEnts(top10Ents);
    const lsInd = lsEnt?.aseg_ind?.tot || 0;
    const lsCol = lsEnt?.aseg_col?.tot || 0;
    const lsRentVol = (lsEnt?.rent_vol_ind?.tot || 0) + (lsEnt?.rent_vol_col?.tot || 0);
    const lsPromInd = lsInd > 0 ? ((lsEnt.rm?.ahorro_ind || 0) * 1000) / lsInd : null;
    const lsPromCol = lsCol > 0 ? ((lsEnt.rm?.ahorro_col || 0) * 1000) / lsCol : null;
    const lsPromVsT10 = (lsPromInd != null && t10Agg.prom_ind > 0) ? ((lsPromInd / t10Agg.prom_ind) - 1) * 100 : null;

    renderBenchmarkKpiGrid("retAsegKpis", [
      {
        label: `Asegurados Ahorro Individual (${re.as_of_label || ""})`,
        accent: "accent-red",
        lsVal: fmtInt(lsInd),
        lsBadgeHtml: mktAgg.aseg_ind > 0 ? `<span class="bench-delta">${fmtPct((lsInd / mktAgg.aseg_ind) * 100, 2)} mkt</span>` : "",
        lsSub: lsEnt ? `RM Ind.: ${fmtMoney(lsEnt.rm?.ahorro_ind || 0)} · Pólizas: ${fmtInt(lsEnt.pol?.ahorro_ind_pol)}` : "—",
        top10Val: fmtInt(t10Agg.aseg_ind),
        top10Sub: `Conc. ${fmtPct(mktAgg.aseg_ind > 0 ? (t10Agg.aseg_ind / mktAgg.aseg_ind) * 100 : 0, 1)} mkt`,
        mktVal: fmtInt(mktAgg.aseg_ind),
        mktSub: `${ents.length} entidades activas · RM ${fmtMoney(mktAgg.rm_ahorro_ind)}`,
      },
      {
        label: "Reserva Prom. / Asegurado Ahorro Ind.",
        accent: "accent-green",
        lsVal: fmtPesos(lsPromInd),
        lsBadgeHtml: lsPromVsT10 != null ? `<span class="bench-delta ${lsPromVsT10 >= 0 ? "good" : "bad"}">${fmtSignedPct(lsPromVsT10, 1)} vs Top 10</span>` : "",
        lsSub: `Ticket medio de ahorro individual en ARS (${re.as_of_label || ""})`,
        top10Val: fmtPesos(t10Agg.prom_ind),
        top10Sub: `Promedio ponderado Top 10 por RM`,
        mktVal: fmtPesos(mktAgg.prom_ind),
        mktSub: `Promedio ponderado mercado`,
      },
      {
        label: "Asegurados Ahorro Colectivo (Certificados)",
        accent: "accent-blue",
        lsVal: fmtInt(lsCol),
        lsBadgeHtml: mktAgg.aseg_col > 0 ? `<span class="bench-delta">${fmtPct((lsCol / mktAgg.aseg_col) * 100, 2)} mkt</span>` : "",
        lsSub: lsEnt ? `Pólizas maestras: ${fmtInt(lsEnt.pol?.ahorro_col_pol)} · Prom. ${fmtPesos(lsPromCol)}/cert.` : "—",
        top10Val: fmtInt(t10Agg.aseg_col),
        top10Sub: `Pól. maestras: ${fmtInt(t10Agg.ahorro_col_pol)} · ${fmtPesos(t10Agg.prom_col)}/cert.`,
        mktVal: fmtInt(mktAgg.aseg_col),
        mktSub: `Pól. maestras: ${fmtInt(mktAgg.ahorro_col_pol)} · ${fmtPesos(mktAgg.prom_col)}/cert.`,
      },
      {
        label: "Beneficiarios Rentas Vitalicias Voluntarias",
        accent: "accent-ink",
        lsVal: fmtInt(lsRentVol),
        lsBadgeHtml: mktAgg.rent_vol_tot > 0 ? `<span class="bench-delta">${fmtPct((lsRentVol / mktAgg.rent_vol_tot) * 100, 2)} mkt</span>` : "",
        lsSub: lsEnt ? `Ind.: ${fmtInt(lsEnt.rent_vol_ind?.tot)} · Col.: ${fmtInt(lsEnt.rent_vol_col?.tot)} · RM ${fmtMoney(lsEnt.rm?.renta_vol_tot || 0)}` : "—",
        top10Val: fmtInt(t10Agg.rent_vol_tot),
        top10Sub: `RM Rentas Vol.: ${fmtMoney(t10Agg.rm_renta_vol)}`,
        mktVal: fmtInt(mktAgg.rent_vol_tot),
        mktSub: `RM Rentas Vol.: ${fmtMoney(mktAgg.rm_renta_vol)} (solo voluntario)`,
      },
    ]);

    // 2. Ticket Promedio por Asegurado (#retTicketMode)
    const ticketMode = state.retTicketMode || "ahorro_ind";
    const tSel = document.getElementById("retTicketMode");
    if (tSel && tSel.value !== ticketMode) tSel.value = ticketMode;

    const sinPIdx = re.periodo_id ? PERIODOS.findIndex((p) => p.id === re.periodo_id) : -1;
    const sinEmitByCod = new Map();
    if (sinPIdx >= 0) {
      COMPANIAS.filter((c) => c.tipo === "Retiro").forEach((c) => {
        const m = getCompanyMetrics(sinPIdx, c.idx, "ltm", "cierre");
        if (m) sinEmitByCod.set(c.cod, m.emit_sd || 0);
      });
    }

    const entRows = ents.map((e) => {
      const asegInd = e.aseg_ind?.tot || 0;
      const asegCol = e.aseg_col?.tot || 0;
      const rentVol = (e.rent_vol_ind?.tot || 0) + (e.rent_vol_col?.tot || 0);
      const totVol = asegInd + asegCol + rentVol;
      const promInd = asegInd > 0 ? ((e.rm?.ahorro_ind || 0) * 1000) / asegInd : null;
      const promCol = asegCol > 0 ? ((e.rm?.ahorro_col || 0) * 1000) / asegCol : null;
      const emitLtm = sinEmitByCod.get(e.cod);
      const totAsegAhorro = asegInd + asegCol;
      const primaProm = (emitLtm != null && totAsegAhorro > 0) ? (emitLtm * 1000) / totAsegAhorro : null;
      return {
        cod: e.cod,
        nombre: e.nombre,
        esLS: Boolean(e.is_ls || e.cod === LS_RETIRO_COD),
        aseg_ind: asegInd,
        aseg_col: asegCol,
        tot_aseg_ahorro: totAsegAhorro,
        rent_vol: rentVol,
        tot_aseg_vol: totVol,
        ahorro_ind_pol: e.pol?.ahorro_ind_pol || 0,
        ahorro_col_pol: e.pol?.ahorro_col_pol || 0,
        rm_total: e.rm?.total || 0,
        rm_ahorro_ind: e.rm?.ahorro_ind || 0,
        rm_ahorro_col: e.rm?.ahorro_col || 0,
        rm_renta_vol: e.rm?.renta_vol_tot || 0,
        share_rm: mktAgg.rm_total > 0 ? ((e.rm?.total || 0) / mktAgg.rm_total) * 100 : 0,
        prom_ind: promInd,
        prom_col: promCol,
        prima_prom: primaProm,
        raw: e,
      };
    });

    const tKey = ticketMode === "ahorro_col" ? "prom_col" : (ticketMode === "prima_prom" ? "prima_prom" : "prom_ind");
    const tDenomMin = 50;
    const tDenomKey = ticketMode === "ahorro_col" ? "aseg_col" : (ticketMode === "prima_prom" ? "tot_aseg_ahorro" : "aseg_ind");
    const tEligible = entRows
      .filter((r) => typeof r[tKey] === "number" && r[tKey] > 0 && r[tDenomKey] >= tDenomMin)
      .sort((a, b) => b[tKey] - a[tKey]);
    const tFiltered = filterChartOutliers(tEligible, tEligible, [{ key: tKey, suffix: " $" }], { sizeKey: tDenomKey, weighted: true, anchorZero: true });
    const tBars = tFiltered.kept;
    const tOmitTiny = entRows.filter((r) => typeof r[tKey] === "number" && r[tKey] > 0 && r[tDenomKey] < tDenomMin).length;
    const mktPrimaTot = sinPIdx >= 0
      ? COMPANIAS.filter((c) => c.tipo === "Retiro").reduce((s, c) => s + (sinEmitByCod.get(c.cod) || 0), 0)
      : 0;
    const mktTicketAvg = ticketMode === "ahorro_col"
      ? mktAgg.prom_col
      : (ticketMode === "prima_prom"
        ? ((mktAgg.aseg_ind + mktAgg.aseg_col) > 0 ? (mktPrimaTot * 1000) / (mktAgg.aseg_ind + mktAgg.aseg_col) : null)
        : mktAgg.prom_ind);

    const tLabelMap = {
      ahorro_ind: { title: "Ticket Reserva Promedio — Ahorro Individual ($/Póliza)", sub: `SSN ${re.as_of_label || ""} · Compañías con >= ${tDenomMin} asegurados` },
      ahorro_col: { title: "Ticket Reserva Promedio — Ahorro Colectivo ($/Certificado)", sub: `SSN ${re.as_of_label || ""} · Compañías con >= ${tDenomMin} certificados` },
      prima_prom: { title: `Prima Emitida Anual LTM / Asegurado Total (${re.as_of_label || ""})`, sub: `Cruce Primas LTM SINENSUP (${re.periodo_id || "2026-2"} moneda cierre) ÷ Asegurados Ahorro Ind.+Col.` },
    };
    const tMeta = tLabelMap[ticketMode];
    const tDropTxt = tFiltered.dropped.length > 0 ? ` · Excl. ${tFiltered.dropped.length} outlier(s)` : "";
    const tTinyTxt = tOmitTiny > 0 ? ` (${tOmitTiny} con cartera < ${tDenomMin} omitidas)` : "";
    document.getElementById("retTicketTitle").textContent = tMeta.title;
    document.getElementById("retTicketSub").textContent = `${tMeta.sub}${tTinyTxt}${tDropTxt}`;

    destroyChart("chRetTicketComp");
    if (tBars.length === 0) {
      setChartEmptyState("chRetTicketComp", "Sin entidades con cartera suficiente", "No hay entidades comparables en esta vista.");
    } else {
      setChartEmptyState("chRetTicketComp", null);
      charts.chRetTicketComp = new Chart(document.getElementById("chRetTicketComp"), {
        type: "bar",
        data: {
          labels: tBars.map((r) => r.esLS ? `★ ${r.nombre}` : r.nombre),
          datasets: [{
            label: "Pesos ($)",
            data: tBars.map((r) => r[tKey]),
            backgroundColor: tBars.map((r) => r.esLS ? BRAND.red : "rgba(65,131,202,0.78)"),
            borderColor: tBars.map((r) => r.esLS ? BRAND.redDark : BRAND.blue),
            borderWidth: tBars.map((r) => r.esLS ? 2 : 1),
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const r = tBars[ctx.dataIndex];
                  return ` ${fmtPesos(ctx.parsed.x)} (Cartera: ${fmtInt(r[tDenomKey])})`;
                },
              },
            },
          },
          scales: {
            x: {
              ticks: { callback: (v) => "$ " + Math.round(v).toLocaleString("es-AR") },
              grid: { color: "#f0f0f4" },
            },
            y: { grid: { display: false } },
          },
        },
        plugins: mktTicketAvg ? [makeVerticalLinePlugin(mktTicketAvg, `Mkt: ${fmtPesos(mktTicketAvg)}`, BRAND.ink)] : [],
      });
    }

    // 3. Demografía Edad x Sexo: LS Retiro vs. Mercado (#retDemoSeg)
    const demoSeg = state.retDemoSeg || "aseg_ind";
    const dSel = document.getElementById("retDemoSeg");
    if (dSel && dSel.value !== demoSeg) dSel.value = demoSeg;
    const extractDemo = (ent) => {
      if (!ent) return { tot: 0, b1: [0, 0, 0], b2: [0, 0, 0], b3: [0, 0, 0], b4: [0, 0, 0] };
      if (demoSeg === "rent_vol") {
        const a = ent.rent_vol_ind || { tot: 0, b1: [0, 0, 0], b2: [0, 0, 0], b3: [0, 0, 0], b4: [0, 0, 0] };
        const b = ent.rent_vol_col || { tot: 0, b1: [0, 0, 0], b2: [0, 0, 0], b3: [0, 0, 0], b4: [0, 0, 0] };
        const addB = (x, y) => [0, 1, 2].map((i) => ((x?.[i] || 0) + (y?.[i] || 0)));
        return {
          tot: (a.tot || 0) + (b.tot || 0),
          b1: addB(a.b1, b.b1),
          b2: addB(a.b2, b.b2),
          b3: addB(a.b3, b.b3),
          b4: addB(a.b4, b.b4),
        };
      }
      return ent[demoSeg] || { tot: 0, b1: [0, 0, 0], b2: [0, 0, 0], b3: [0, 0, 0], b4: [0, 0, 0] };
    };
    const lsDemo = extractDemo(lsEnt);
    const mktDemo = { tot: 0, b1: [0, 0, 0], b2: [0, 0, 0], b3: [0, 0, 0], b4: [0, 0, 0] };
    ents.forEach((e) => {
      const d = extractDemo(e);
      mktDemo.tot += d.tot || 0;
      ["b1", "b2", "b3", "b4"].forEach((bk) => {
        for (let i = 0; i < 3; i++) mktDemo[bk][i] += d[bk]?.[i] || 0;
      });
    });
    const bKeys = ["b1", "b2", "b3", "b4"];
    const bLabels = ["Hasta 35 años", "36 a 50 años", "51 a 65 años", "66 y más"];
    const segTitleMap = {
      aseg_ind: "Asegurados Ahorro Individual",
      aseg_col: "Asegurados Ahorro Colectivo",
      rent_vol: "Rentistas Retiro Voluntario (Ind. + Col.)",
    };
    document.getElementById("retDemoTitle").textContent = `Distribución Demográfica Edad × Sexo: ${segTitleMap[demoSeg]}`;
    document.getElementById("retDemoSub").textContent =
      `LS Retiro (n=${fmtInt(lsDemo.tot)}) vs. Mercado (n=${fmtInt(mktDemo.tot)}) · % del total de cada cartera`;

    const toPctArr = (obj, sexIdx) => bKeys.map((bk) => obj.tot > 0 ? ((obj[bk]?.[sexIdx] || 0) / obj.tot) * 100 : 0);
    destroyChart("chRetDemoEdad");
    charts.chRetDemoEdad = new Chart(document.getElementById("chRetDemoEdad"), {
      type: "bar",
      data: {
        labels: bLabels,
        datasets: [
          { label: "LS Mujeres", data: toPctArr(lsDemo, 1), backgroundColor: BRAND.red, stack: "LS", borderRadius: 3 },
          { label: "LS Varones", data: toPctArr(lsDemo, 2), backgroundColor: "rgba(226,0,57,0.42)", stack: "LS", borderRadius: 3 },
          { label: "Mercado Mujeres", data: toPctArr(mktDemo, 1), backgroundColor: BRAND.ink, stack: "Mkt", borderRadius: 3 },
          { label: "Mercado Varones", data: toPctArr(mktDemo, 2), backgroundColor: "rgba(48,48,45,0.40)", stack: "Mkt", borderRadius: 3 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const isLsDs = ctx.dataset.stack === "LS";
                const src = isLsDs ? lsDemo : mktDemo;
                const sexIdx = ctx.dataset.label.includes("Mujeres") ? 1 : 2;
                const rawCnt = src[bKeys[ctx.dataIndex]]?.[sexIdx] || 0;
                return ` ${ctx.dataset.label}: ${fmtPct(ctx.parsed.y, 1)} (${fmtInt(rawCnt)})`;
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: { stacked: true, ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } },
        },
      },
    });

    // 4. Evolución Histórica Anual de Asegurados Voluntarios — SIN Rentas Previsionales
    const sAnual = re.serie_anual || [];
    const sAnualTitleEl = document.getElementById("retSerieAsegTitle");
    if (sAnualTitleEl) {
      sAnualTitleEl.textContent = sAnual.length > 0
        ? `Serie Histórica Anual de Asegurados y Rentistas de Retiro (${sAnual[0].anio}–${sAnual[sAnual.length - 1].anio})`
        : "Serie Histórica Anual de Asegurados y Rentistas de Retiro";
    }
    destroyChart("chRetSerieAseg");
    if (sAnual.length === 0) {
      setChartEmptyState("chRetSerieAseg", "Sin serie anual de Retiro", "No hay datos históricos en retiro_est.serie_anual.");
    } else {
      setChartEmptyState("chRetSerieAseg", null);
      charts.chRetSerieAseg = new Chart(document.getElementById("chRetSerieAseg"), {
        type: "line",
        data: {
          labels: sAnual.map((x) => String(x.anio)),
          datasets: [
            { label: "Asegurados Ahorro Individual", data: sAnual.map((x) => x.aseg_ind), borderColor: BRAND.red, backgroundColor: BRAND.red, borderWidth: 2.6, tension: 0.25, yAxisID: "y" },
            { label: "Rentistas Retiro Voluntario", data: sAnual.map((x) => x.rent_vol_tot), borderColor: BRAND.orange, backgroundColor: BRAND.orange, borderWidth: 2.2, borderDash: [4, 3], tension: 0.25, yAxisID: "y" },
            { label: "Asegurados Ahorro Colectivo", data: sAnual.map((x) => x.aseg_col), borderColor: BRAND.blue, backgroundColor: BRAND.blue, borderWidth: 2.4, tension: 0.25, yAxisID: "y1" },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: ${fmtInt(ctx.parsed.y)}`,
              },
            },
          },
          scales: {
            y: { position: "left", title: { display: true, text: "Aseg. Individual & Rentistas Vol." }, ticks: { callback: (v) => fmtInt(v) }, grid: { color: "#f0f0f4" } },
            y1: { position: "right", title: { display: true, text: "Aseg. Colectivo" }, ticks: { callback: (v) => fmtInt(v) }, grid: { drawOnChartArea: false } },
          },
        },
      });
    }

    // 5. Tabla 15 Entidades Retiro Físico & Reservas (SSN)
    document.getElementById("retAsegTableSub").textContent =
      `${re.as_of_label || "—"} · ${ents.length} compañías oficiales de Retiro · Click en una fila para abrir Ficha`;
    const asegCols = [
      { key: "nombre", label: "Entidad Retiro", num: false, render: (r) => `${esc(r.nombre)} ${r.esLS ? '<span class="badge badge-ls">LS</span>' : ""}` },
      { key: "aseg_ind", label: "Aseg. Ahorro Ind.", num: true, render: (r) => fmtInt(r.aseg_ind) },
      { key: "prom_ind", label: "RM Ind. ($/Aseg.)", num: true, render: (r) => fmtPesos(r.prom_ind) },
      { key: "aseg_col", label: "Aseg. Ahorro Col.", num: true, render: (r) => fmtInt(r.aseg_col) },
      { key: "prom_col", label: "RM Col. ($/Cert.)", num: true, render: (r) => fmtPesos(r.prom_col) },
      { key: "rent_vol", label: "Rentistas Vol.", title: "Beneficiarios de Rentas Vitalicias Voluntarias (Ind. + Col.)", num: true, render: (r) => fmtInt(r.rent_vol) },
      { key: "tot_aseg_vol", label: "Total Aseg. + Benef.", num: true, render: (r) => fmtInt(r.tot_aseg_vol) },
      { key: "rm_total", label: `Res. Mat. Total (${uSuf})`, num: true, render: (r) => fmtNumMiles(r.rm_total) },
      { key: "share_rm", label: "Sh. RM%", num: true, render: (r) => fmtPct(r.share_rm, 2) },
    ];
    const asegSorted = entRows.slice().sort((a, b) => {
      const k = state.retAsegSort.key;
      const d = state.retAsegSort.dir === "asc" ? 1 : -1;
      const va = a[k] ?? -9e15;
      const vb = b[k] ?? -9e15;
      if (typeof va === "string") return va.localeCompare(vb, "es") * d;
      return (va - vb) * d;
    });
    const asegFooter = [{
      nombre: `TOTAL MERCADO RETIRO (${ents.length} cías)`,
      aseg_ind: fmtInt(mktAgg.aseg_ind),
      prom_ind: fmtPesos(mktAgg.prom_ind),
      aseg_col: fmtInt(mktAgg.aseg_col),
      prom_col: fmtPesos(mktAgg.prom_col),
      rent_vol: fmtInt(mktAgg.rent_vol_tot),
      tot_aseg_vol: fmtInt(mktAgg.aseg_ind + mktAgg.aseg_col + mktAgg.rent_vol_tot),
      rm_total: fmtNumMiles(mktAgg.rm_total),
      share_rm: "100,00%",
    }];
    renderSortableTable(
      document.getElementById("retAsegTableWrap"),
      asegCols,
      asegSorted,
      state.retAsegSort,
      (ns) => { state.retAsegSort = ns; renderRetiro(); },
      { highlightLS: true, rowIdKey: "cod", onRowClick: (cod) => openFichaEntity("CIA:" + cod), footerRows: asegFooter }
    );
    document.getElementById("btnExportRetAseg").onclick = () => {
      exportToCSV(
        `retiro_asegurados_demografia_${re.periodo_id || "ssn"}.csv`,
        ["Cod", "Entidad", "Aseg. Ahorro Ind.", "RM Ind ($/Aseg)", "Aseg. Ahorro Col.", "RM Col ($/Cert)", "Rentistas Vol.", "RM Total (" + uSuf + ")", "Share RM%"],
        asegSorted.map((r) => [
          r.cod, r.nombre, r.aseg_ind,
          r.prom_ind != null ? Math.round(r.prom_ind) : "",
          r.aseg_col,
          r.prom_col != null ? Math.round(r.prom_col) : "",
          r.rent_vol,
          (r.rm_total / div).toFixed(uDec),
          r.share_rm.toFixed(2),
        ])
      );
    };
  }

  // ==================== TAB 6: GRUPOS ECONÓMICOS Y CONSTITUCIÓN ====================
  function renderGrupos() {
    const pIdx = state.pIdx;
    const hasYoY = canCompareYoY(pIdx, state.base);
    const { meses } = resolveBaseAndMeses(pIdx, state.base);
    const rows = getCompanyRowsForPeriod(pIdx, true);
    const prevRows = hasYoY ? getCompanyRowsForPeriod(pIdx - 4, true) : [];
    const totMktEmit = rows.reduce((s, r) => s + r.emit_sd, 0);

    const byGrp = new Map();
    rows.forEach((r) => {
      if (!byGrp.has(r.grupo)) byGrp.set(r.grupo, []);
      byGrp.get(r.grupo).push(r);
    });
    const prevByGrp = new Map();
    prevRows.forEach((r) => {
      if (!prevByGrp.has(r.grupo)) prevByGrp.set(r.grupo, []);
      prevByGrp.get(r.grupo).push(r);
    });

    let grpList = [];
    const grpAggByName = new Map();
    byGrp.forEach((members, gName) => {
      const gScope = gName !== "Independientes" ? "group" : "market";
      const agg = aggregateMetrics(members, meses, pIdx, state.base, state.moneda, { scope: gScope });
      grpAggByName.set(gName, agg);
      if (state.grpMode === "multi" && gName === "Independientes") return;
      const pMembers = prevByGrp.get(gName);
      const pAgg = pMembers ? aggregateMetrics(pMembers, meses, pIdx - 4, state.base, state.moneda, { scope: gScope }) : null;
      agg.grupo = gName;
      agg.n_cias = members.length;
      agg.esLS = gName === "Grupo La Segunda";
      agg.share = totMktEmit > 0 ? (agg.emit_sd / totMktEmit) * 100 : null;
      agg.yoy = pAgg ? calcYoY(agg.emit_sd, pAgg.emit_sd) : null;
      agg.members = members;
      grpList.push(agg);
    });

    const cols = [
      {
        key: "grupo",
        label: "Grupo Económico",
        num: false,
        render: (r) => {
          const hasNci = Math.abs(r.part_terc_re || 0) > 0.1 || Math.abs(r.part_terc_pn || 0) > 0.1;
          const hasVpp = r.elim_vpp_pn > 0.1 || Math.abs(r.elim_vpp_re) > 0.1;
          let badgeHtml = "";
          if (hasNci) {
            const tip = `Atribuible a Empresa Madre (RT 21): Elim. VPP Res. ${fmtMoney(-r.elim_vpp_re)} · Part. Terceros Res. ${fmtMoney(-r.part_terc_re)} · PN Terc. ${fmtMoney(-r.part_terc_pn)}`;
            badgeHtml = `<span class="badge badge-type" title="${esc(tip)}">Madre</span>`;
          } else if (hasVpp) {
            const vppTip = `Eliminación VPP (RT 21): Res. Ej. ${fmtMoney(-r.elim_vpp_re)} · PN/Inv. ${fmtMoney(-r.elim_vpp_pn)}`;
            badgeHtml = `<span class="badge badge-type" title="${esc(vppTip)}">VPP</span>`;
          }
          return `<strong>${esc(r.grupo)}</strong> ${r.esLS ? '<span class="badge badge-ls">LS</span>' : ""} ${badgeHtml}`;
        },
      },
      { key: "n_cias", label: "Cías", num: true },
      { key: "emit_sd", label: `Primas Emit. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.emit_sd) },
      { key: "share", label: "Share %", num: true, render: (r) => fmtPct(r.share) },
      { key: "yoy", label: "YoY %", num: true, render: (r) => `<span class="${pctClass(r.yoy)}">${fmtSignedPct(r.yoy)}</span>` },
      { key: "sin_pct", label: "Sin. %", num: true, render: (r) => fmtPct(r.sin_pct) },
      { key: "gprod_pct", label: "G. Prod. %", title: "Gastos de Producción / Primas Devengadas", num: true, render: (r) => fmtPct(r.gprod_pct) },
      { key: "gexpl_pct", label: "G. Expl. %", title: "Gastos de Explotación (brutos) / Primas Devengadas", num: true, render: (r) => fmtPct(r.gexpl_pct) },
      { key: "gto_pct", label: "G. Neto %", title: "(G. Prod. + G. Expl. − G. a/c Reaseg.) / Primas Devengadas", num: true, render: (r) => fmtPct(r.gto_pct) },
      { key: "comb_pct", label: "Comb. %", num: true, render: (r) => `<strong>${fmtPct(r.comb_pct)}</strong>` },
      { key: "res_tec", label: `Res. Téc. (${unitSuffix()})`, num: true, render: (r) => `<span class="${pctClass(r.res_tec)}">${fmtNumMiles(r.res_tec)}</span>` },
      { key: "res_fin", label: `Res. Fin. (${unitSuffix()})`, num: true, render: (r) => `<span class="${pctClass(r.res_fin)}">${fmtNumMiles(r.res_fin)}</span>` },
      { key: "res_ej", label: `Res. Ej. (${unitSuffix()})`, num: true, render: (r) => `<span class="${pctClass(r.res_ej)}">${fmtNumMiles(r.res_ej)}</span>` },
      { key: "inv", label: `Inversiones (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.inv) },
      { key: "pn", label: `PN (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.pn) },
    ];

    const sortedGrps = renderSortableTable(
      document.getElementById("grpTableWrap"),
      cols,
      grpList,
      state.grpSort,
      () => renderGrupos(),
      {
        highlightLS: true,
        rowIdKey: "grupo",
        onRowClick: (gName) => {
          state.grpSelected = gName;
          renderGrpDrill(gName, byGrp.get(gName) || [], grpAggByName.get(gName) || null);
        },
      }
    );

    const grpChartFiltered = filterMonetaryBarOutliers(
      sortedGrps.filter((g) => g.grupo !== "Independientes"),
      "emit_sd",
      { barLimit: 15 }
    );
    const top15G = grpChartFiltered.kept;
    updateOutlierNote(
      "grpTopOutlierNote",
      grpChartFiltered.dropped,
      ({ row }) => `${row.grupo} (${fmtMoney(row.emit_sd)})`,
      true
    );
    const div = unitDivisor();
    destroyChart("chGrpTop");
    charts.chGrpTop = new Chart(document.getElementById("chGrpTop"), {
      type: "bar",
      data: {
        labels: top15G.map((g) => g.grupo),
        datasets: [{
          label: `Primas Emitidas (${unitSuffix()})`,
          data: top15G.map((g) => g.emit_sd / div),
          backgroundColor: top15G.map((g) => (g.esLS ? BRAND.red : "rgba(48,48,45,0.74)")),
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: chartMoneyTooltipLabel } },
        },
        scales: { x: { ticks: { callback: chartMoneyTick }, grid: { color: "#f0f0f4" } }, y: { grid: { display: false } } },
      },
    });

    if (!byGrp.has(state.grpSelected) && sortedGrps.length > 0) state.grpSelected = sortedGrps[0].grupo;
    renderGrpDrill(state.grpSelected, byGrp.get(state.grpSelected) || [], grpAggByName.get(state.grpSelected) || null);

    document.getElementById("btnExportGrp").onclick = () => {
      const uDec = unitDecimals();
      exportToCSV(
        `grupos_${PERIODOS[pIdx].id}.csv`,
        cols.map((c) => c.label),
        sortedGrps.map((r) => cols.map((c) => {
          const v = r[c.key];
          if (typeof v !== "number") return v ?? "";
          if (c.key === "n_cias" || c.key.endsWith("_pct") || c.key === "share" || c.key === "yoy") return v.toFixed(2);
          return (v / div).toFixed(uDec);
        }))
      );
    };

    // Constitución Societaria comparative
    const byConst = new Map();
    rows.forEach((r) => {
      if (!byConst.has(r.const)) byConst.set(r.const, []);
      byConst.get(r.const).push(r);
    });
    const constList = [];
    byConst.forEach((members, ctName) => {
      const agg = aggregateMetrics(members, meses, pIdx, state.base, state.moneda, { scope: "market" });
      agg.const = ctName;
      agg.n_cias = members.length;
      agg.share = totMktEmit > 0 ? (agg.emit_sd / totMktEmit) * 100 : null;
      constList.push(agg);
    });

    const constCols = [
      { key: "const", label: "Constitución", num: false, render: (r) => `<strong>${esc(r.const)}</strong>` },
      { key: "n_cias", label: "Cías", num: true },
      { key: "emit_sd", label: `Primas (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.emit_sd) },
      { key: "share", label: "Share %", num: true, render: (r) => fmtPct(r.share) },
      { key: "sin_pct", label: "Sin. %", num: true, render: (r) => fmtPct(r.sin_pct) },
      { key: "gprod_pct", label: "G. Prod. %", title: "Gastos de Producción / Primas Devengadas", num: true, render: (r) => fmtPct(r.gprod_pct) },
      { key: "gexpl_pct", label: "G. Expl. %", title: "Gastos de Explotación (brutos) / Primas Devengadas", num: true, render: (r) => fmtPct(r.gexpl_pct) },
      { key: "gto_pct", label: "G. Neto %", title: "(G. Prod. + G. Expl. − G. a/c Reaseg.) / Primas Devengadas", num: true, render: (r) => fmtPct(r.gto_pct) },
      { key: "comb_pct", label: "Comb. %", num: true, render: (r) => `<strong>${fmtPct(r.comb_pct)}</strong>` },
      { key: "cobertura_pct", label: "Solv. / Cob. % (E)", title: "Indicador E SSN: (Disp. + Inv. + Inmuebles) / (Deudas c/ Aseg. + Comp. Técnicos)", num: true, render: (r) => fmtPct(r.cobertura_pct) },
    ];
    const sortedConst = renderSortableTable(
      document.getElementById("constTableWrap"),
      constCols,
      constList,
      state.constSort,
      () => renderGrupos()
    );

    const constChartRows = sortedConst.map((c) => {
      const vals = [c.sin_pct || 0, c.gprod_pct || 0, c.gexpl_pct || 0];
      return { ...c, _barPos: Math.max(0, ...vals), _barNeg: Math.min(0, ...vals) };
    });
    const constFiltered = filterChartOutliers(
      constChartRows,
      constChartRows,
      [{ key: "_barPos", suffix: "%" }, { key: "_barNeg", suffix: "%" }],
      { weighted: false, anchorZero: true }
    );
    const constKept = constFiltered.kept;
    updateOutlierNote(
      "constCompOutlierNote",
      constFiltered.dropped,
      ({ row }) => `${row.const} (Sin. ${fmtPct(row.sin_pct, 1)} · G.Prod ${fmtPct(row.gprod_pct, 1)} · G.Expl ${fmtPct(row.gexpl_pct, 1)})`,
      true
    );
    destroyChart("chConstComp");
    charts.chConstComp = new Chart(document.getElementById("chConstComp"), {
      type: "bar",
      data: {
        labels: constKept.map((c) => c.const),
        datasets: [
          { label: "Siniestralidad %", data: constKept.map((c) => c.sin_pct || 0), backgroundColor: BRAND.blue, borderRadius: 3 },
          { label: "G. Producción %", data: constKept.map((c) => c.gprod_pct || 0), backgroundColor: BRAND.orange, borderRadius: 3 },
          { label: "G. Explotación %", data: constKept.map((c) => c.gexpl_pct || 0), backgroundColor: BRAND.amber, borderRadius: 3 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: (ctx) => chartPctTooltipLabel(ctx, 2) } } },
        scales: { y: { ticks: { callback: chartPctTick } } },
      },
    });

    document.getElementById("btnExportConst").onclick = () => {
      const uDec = unitDecimals();
      exportToCSV(
        `constitucion_${PERIODOS[pIdx].id}.csv`,
        constCols.map((c) => c.label),
        sortedConst.map((r) => constCols.map((c) => {
          const v = r[c.key];
          if (typeof v !== "number") return v ?? "";
          if (c.key === "n_cias" || c.key.endsWith("_pct") || c.key === "share") return v.toFixed(2);
          return (v / div).toFixed(uDec);
        }))
      );
    };
  }

  function renderGrpDrill(gName, members, grpAgg) {
    const titleEl = document.getElementById("grpDrillTitle");
    titleEl.textContent = `Composición interna: ${gName} (${members.length} compañías)`;
    const subEl = titleEl.nextElementSibling;
    const hasVpp = grpAgg && (grpAgg.elim_vpp_pn > 0.1 || Math.abs(grpAgg.elim_vpp_re) > 0.1);
    const hasNci = grpAgg && (Math.abs(grpAgg.part_terc_re || 0) > 0.1 || Math.abs(grpAgg.part_terc_pn || 0) > 0.1);
    if (subEl) {
      if (hasNci) {
        subEl.textContent = `Aporte por compañía · Elim. VPP (RT 21): Res. ${fmtMoney(-grpAgg.elim_vpp_re)} / PN ${fmtMoney(-grpAgg.elim_vpp_pn)} · Part. Terceros (Madre): Res. ${fmtMoney(-grpAgg.part_terc_re)} / PN ${fmtMoney(-grpAgg.part_terc_pn)}`;
      } else if (hasVpp) {
        subEl.textContent = `Aporte de cada compañía · Ajuste VPP intragrupo (RT 21): Res. Ej. ${fmtMoney(-grpAgg.elim_vpp_re)} · PN/Inv. ${fmtMoney(-grpAgg.elim_vpp_pn)}`;
      } else {
        subEl.textContent = "Aporte de cada compañía al consolidado del grupo";
      }
    }

    const grpTot = members.reduce((s, m) => s + m.emit_sd, 0);
    const enriched = members.map((m) => ({
      ...m,
      aporte_pct: grpTot > 0 ? (m.emit_sd / grpTot) * 100 : null,
    }));
    const cols = [
      { key: "cod", label: "Cód.", num: false },
      { key: "nombre", label: "Compañía", num: false, render: (r) => `<strong>${esc(r.nombre)}</strong>` },
      { key: "tipo", label: "Tipo", num: false },
      { key: "emit_sd", label: `Primas Emit. (${unitSuffix()})`, num: true, render: (r) => fmtNumMiles(r.emit_sd) },
      { key: "aporte_pct", label: "% del Grupo", num: true, render: (r) => fmtPct(r.aporte_pct) },
      { key: "comb_pct", label: "Comb. %", num: true, render: (r) => fmtPct(r.comb_pct) },
      { key: "res_tec", label: `Res. Téc. (${unitSuffix()})`, num: true, render: (r) => `<span class="${pctClass(r.res_tec)}">${fmtNumMiles(r.res_tec)}</span>` },
      { key: "res_ej", label: `Res. Ej. (${unitSuffix()})`, num: true, render: (r) => `<span class="${pctClass(r.res_ej)}">${fmtNumMiles(r.res_ej)}</span>` },
    ];

    const footerRows = [];
    if (grpAgg) {
      const bruteResEj = grpAgg.res_ej + (grpAgg.elim_vpp_re || 0) + (grpAgg.part_terc_re || 0);
      if (hasVpp || hasNci) {
        footerRows.push({
          _cls: "tfoot-sub",
          cod: "",
          nombre: `Subtotal Suma Simple (${members.length} compañías)`,
          tipo: "",
          emit_sd: fmtNumMiles(grpAgg.emit_sd),
          aporte_pct: "100,00%",
          comb_pct: fmtPct(grpAgg.comb_pct),
          res_tec: fmtNumMiles(grpAgg.res_tec),
          res_ej: `<span class="${pctClass(bruteResEj)}">${fmtNumMiles(bruteResEj)}</span>`,
        });
      }
      if (hasVpp) {
        footerRows.push({
          _cls: "tfoot-vpp",
          cod: "",
          nombre: "Eliminación VPP Intragrupo (RT 21)",
          tipo: "Ajuste VPP",
          emit_sd: "—",
          aporte_pct: "—",
          comb_pct: "—",
          res_tec: "—",
          res_ej: `<span class="${pctClass(-grpAgg.elim_vpp_re)}">${fmtNumMiles(-grpAgg.elim_vpp_re)}</span>`,
        });
      }
      if (hasNci) {
        footerRows.push({
          _cls: "tfoot-nci",
          cod: "",
          nombre: "Participación de Terceros (Otros Accionistas)",
          tipo: "Minoritarios",
          emit_sd: "—",
          aporte_pct: "—",
          comb_pct: "—",
          res_tec: "—",
          res_ej: `<span class="${pctClass(-grpAgg.part_terc_re)}">${fmtNumMiles(-grpAgg.part_terc_re)}</span>`,
        });
      }
      const totLabel = hasNci
        ? "TOTAL ATRIBUIBLE A EMPRESA MADRE (RT 21)"
        : (hasVpp ? "TOTAL CONSOLIDADO 100% (Neto VPP)" : `TOTAL GRUPO (${members.length} compañías)`);
      footerRows.push({
        cod: "",
        nombre: totLabel,
        tipo: "",
        emit_sd: fmtNumMiles(grpAgg.emit_sd),
        aporte_pct: "100,00%",
        comb_pct: fmtPct(grpAgg.comb_pct),
        res_tec: `<span class="${pctClass(grpAgg.res_tec)}">${fmtNumMiles(grpAgg.res_tec)}</span>`,
        res_ej: `<span class="${pctClass(grpAgg.res_ej)}">${fmtNumMiles(grpAgg.res_ej)}</span>`,
      });
    }

    renderSortableTable(
      document.getElementById("grpDrillWrap"),
      cols,
      enriched,
      { key: "emit_sd", dir: "desc" },
      () => {},
      {
        highlightLS: true,
        rowIdKey: "cod",
        onRowClick: (cod) => openFichaEntity("CIA:" + cod),
        footerRows,
      }
    );
  }

  // ==================== TAB 5: FICHA DE ENTIDAD Y COMPARADOR ====================
  const FICHA_TOP_CRIT_OPTIONS = [
    { value: "auto", label: "Automático (según tipo / AP+Vida)", scope: "all" },
    { value: "ap_vida", label: "Top Primas en AP + Vida (Mercado)", scope: "personas" },
    { value: "ap", label: "Top Primas en Accidentes Personales (AP)", scope: "personas" },
    { value: "vida", label: "Top Primas en Vida (Total)", scope: "personas" },
    { value: "vida_col", label: "Top Primas en Vida Colectivo (+Oblig.)", scope: "personas" },
    { value: "vida_ind", label: "Top Primas en Vida Individual", scope: "personas" },
    { value: "retiro", label: "Top Primas en Retiro (Ind. + Col.)", scope: "retiro" },
    { value: "ramo_princ", label: "Top en Ramo Principal de la Entidad", scope: "all" },
    { value: "tipo_emit", label: "Top del Mismo Tipo (Primas Totales)", scope: "all" },
    { value: "res_ej", label: "Top por Resultado del Ejercicio", scope: "all" },
    { value: "pn", label: "Top por Patrimonio Neto", scope: "all" },
    { value: "inv", label: "Top por Inversiones", scope: "all" },
  ];

  function isZurichCompany(c) {
    if (!c) return false;
    return c.grupo === "Grupo Zurich"
      || (c.nombre && c.nombre.toLowerCase().includes("zurich"))
      || (c.razon && c.razon.toLowerCase().includes("zurich"));
  }

  function isZurichEntityKey(entityKey) {
    if (!entityKey) return false;
    if (entityKey.startsWith("GRP:")) return entityKey.slice(4).toLowerCase().includes("zurich");
    if (entityKey.startsWith("CIA:")) return isZurichCompany(ciaByCod.get(entityKey.slice(4)));
    return false;
  }

  function isPersonasNoZurichMain(main, entityKey = state.fichaEntity) {
    return Boolean(main && !entityKey.startsWith("GRP:") && main.segTipo === "Personas" && !isZurichEntityKey(entityKey));
  }

  function isFichaPersonasContext(main, entityKey = state.fichaEntity) {
    return isPersonasNoZurichMain(main, entityKey)
      || ((state.tipo === "Personas" || state.granRamo === "Personas") && !isZurichEntityKey(entityKey));
  }

  function isCritAllowedForScope(opt) {
    if (opt.scope === "all") return true;
    if (opt.scope === "personas") {
      return (!state.tipo && !state.granRamo)
        || state.tipo === "Personas"
        || state.tipo === "Patrimoniales y Mixtas"
        || state.granRamo === "Personas";
    }
    if (opt.scope === "retiro") {
      return (!state.tipo && !state.granRamo)
        || state.tipo === "Retiro"
        || state.granRamo === "Retiro";
    }
    return true;
  }

  function getFichaScope(pIdx) {
    const hasFilter = Boolean(state.tipo || state.granRamo || state.constitucion || state.grupo);
    const sig = [state.tipo, state.granRamo, state.constitucion, state.grupo].join("|");
    let allowedCias;
    if (!hasFilter) {
      const latestRows = getCompanyRowsForPeriod(pIdx, false).sort((a, b) => b.emit_sd - a.emit_sd);
      const seenC = new Set();
      allowedCias = [];
      latestRows.forEach((r) => {
        seenC.add(r.cod);
        const cObj = ciaByCod.get(r.cod);
        if (cObj) allowedCias.push(cObj);
      });
      COMPANIAS.forEach((c) => {
        if (!seenC.has(c.cod)) allowedCias.push(c);
      });
    } else {
      const filtEmitMap = new Map(getCompanyRowsForPeriod(pIdx, true).map((r) => [r.cod, r.emit_sd]));
      allowedCias = getFilteredCompanies(pIdx)
        .slice()
        .sort((a, b) => (filtEmitMap.get(b.cod) ?? -1e18) - (filtEmitMap.get(a.cod) ?? -1e18));
    }

    let allowedGroups = [];
    if (!hasFilter) {
      allowedGroups = META.grupos.filter((g) => g !== "Independientes");
    } else if (!state.tipo && !state.granRamo && !state.constitucion && state.grupo) {
      if (state.grupo !== "Independientes") allowedGroups = [state.grupo];
    }

    const allowedCodSet = new Set(allowedCias.map((c) => c.cod));
    const allowedKeys = new Set();
    allowedGroups.forEach((g) => allowedKeys.add("GRP:" + g));
    allowedCias.forEach((c) => allowedKeys.add("CIA:" + c.cod));

    const fParts = [];
    if (state.tipo) fParts.push(state.tipo);
    if (state.granRamo && state.granRamo !== state.tipo) {
      fParts.push(state.granRamo === "Retiro" ? "Retiro" : `Ramo ${GRAN_LABELS[state.granRamo]}`);
    }
    if (state.constitucion) fParts.push(state.constitucion);
    if (state.grupo) fParts.push(state.grupo);
    const filterLabel = fParts.join(" · ");

    return { hasFilter, sig, allowedCias, allowedGroups, allowedCodSet, allowedKeys, filterLabel };
  }

  function pickDefaultFichaEntity(scope) {
    if (state.grupo && state.grupo !== "Independientes" && scope.allowedKeys.has("GRP:" + state.grupo)) {
      return "GRP:" + state.grupo;
    }
    const lsMatch = scope.allowedCias.find((c) => c.ls);
    if (lsMatch) return "CIA:" + lsMatch.cod;
    if (scope.allowedCias.length > 0) return "CIA:" + scope.allowedCias[0].cod;
    if (scope.allowedGroups.length > 0) return "GRP:" + scope.allowedGroups[0];
    return "";
  }

  function normSearch(str) {
    return String(str || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function esAlphaCmp(a, b) {
    return String(a || "").localeCompare(String(b || ""), "es", { sensitivity: "base" });
  }

  function createSearchableCombobox({ wrapEl, inputEl, toggleEl, menuEl, clearOnSelect, placeholder, onSelect }) {
    if (!wrapEl || !inputEl || !toggleEl || !menuEl) {
      return { setOptions() {}, close() {} };
    }
    let items = [];
    let filtered = [];
    let activeIdx = -1;
    let selectedValue = "";
    let selectedLabel = "";
    let isOpen = false;
    let suppressFocusOpen = false;

    function updateActiveDom() {
      const optEls = menuEl.querySelectorAll(".combo-opt[data-idx]");
      optEls.forEach((el) => {
        const isAct = Number(el.dataset.idx) === activeIdx;
        el.classList.toggle("is-active", isAct);
        if (isAct) el.scrollIntoView({ block: "nearest" });
      });
    }

    function renderMenu(query) {
      const tokens = normSearch(query).split(/\s+/).filter(Boolean);
      filtered = tokens.length === 0
        ? items.slice()
        : items.filter((it) => tokens.every((tok) => it.searchText.includes(tok)));

      if (filtered.length === 0) {
        activeIdx = -1;
        menuEl.innerHTML = `<div class="combo-empty">Sin coincidencias para «${esc(query.trim())}»</div>`;
        return;
      }

      const groups = [];
      const byGrp = new Map();
      filtered.forEach((it, idx) => {
        const g = it.group || "";
        if (!byGrp.has(g)) {
          byGrp.set(g, []);
          groups.push(g);
        }
        byGrp.get(g).push({ it, idx });
      });

      activeIdx = 0;

      let html = "";
      groups.forEach((g) => {
        const arr = byGrp.get(g);
        if (g) html += `<div class="combo-group-hdr">${esc(g)} (${arr.length})</div>`;
        arr.forEach(({ it, idx }) => {
          const cls = ["combo-opt"];
          if (it.value === selectedValue) cls.push("is-selected");
          if (idx === activeIdx) cls.push("is-active");
          const titleTxt = it.sub ? `${it.label} (${it.sub})` : it.label;
          html += `<div class="${cls.join(" ")}" data-idx="${idx}" role="option" aria-selected="${it.value === selectedValue ? "true" : "false"}" title="${esc(titleTxt)}"><span class="combo-opt-lbl">${esc(it.label)}</span>${it.sub ? `<span class="combo-opt-sub">${esc(it.sub)}</span>` : ""}</div>`;
        });
      });
      menuEl.innerHTML = html;
      menuEl.scrollTop = 0;
    }

    function openMenu(query) {
      if (inputEl.disabled) return;
      isOpen = true;
      wrapEl.classList.add("open");
      inputEl.setAttribute("aria-expanded", "true");
      renderMenu(query != null ? query : inputEl.value);
    }

    function closeMenu(restoreValue = true) {
      isOpen = false;
      activeIdx = -1;
      wrapEl.classList.remove("open");
      inputEl.setAttribute("aria-expanded", "false");
      if (restoreValue) {
        inputEl.value = clearOnSelect ? "" : selectedLabel;
      }
    }

    function selectItem(item) {
      if (!item) return;
      if (clearOnSelect) {
        inputEl.value = "";
      } else {
        selectedValue = item.value;
        selectedLabel = item.label;
        inputEl.value = item.label;
      }
      closeMenu(false);
      onSelect(item);
    }

    inputEl.addEventListener("focus", () => {
      if (suppressFocusOpen || inputEl.disabled) return;
      inputEl.select();
      openMenu("");
    });

    inputEl.addEventListener("click", () => {
      if (inputEl.disabled || isOpen) return;
      inputEl.select();
      openMenu("");
    });

    inputEl.addEventListener("input", () => {
      if (inputEl.disabled) return;
      if (!isOpen) {
        isOpen = true;
        wrapEl.classList.add("open");
        inputEl.setAttribute("aria-expanded", "true");
      }
      renderMenu(inputEl.value);
    });

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!isOpen) {
          openMenu("");
        } else if (filtered.length > 0) {
          activeIdx = activeIdx < 0 ? 0 : Math.min(filtered.length - 1, activeIdx + 1);
          updateActiveDom();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!isOpen) {
          openMenu("");
        } else if (filtered.length > 0) {
          activeIdx = activeIdx <= 0 ? 0 : activeIdx - 1;
          updateActiveDom();
        }
      } else if (e.key === "Enter") {
        if (isOpen) {
          e.preventDefault();
          const chosen = (activeIdx >= 0 && filtered[activeIdx]) ? filtered[activeIdx] : (filtered.length === 1 ? filtered[0] : null);
          if (chosen) selectItem(chosen);
        }
      } else if (e.key === "Escape") {
        if (isOpen) {
          e.preventDefault();
          e.stopPropagation();
          closeMenu(true);
        }
      } else if (e.key === "Tab") {
        if (isOpen) closeMenu(true);
      }
    });

    toggleEl.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (inputEl.disabled) return;
      if (isOpen) {
        closeMenu(true);
      } else {
        suppressFocusOpen = true;
        inputEl.focus();
        suppressFocusOpen = false;
        inputEl.select();
        openMenu("");
      }
    });

    menuEl.addEventListener("mousedown", (e) => {
      const optEl = e.target.closest(".combo-opt[data-idx]");
      if (!optEl) return;
      e.preventDefault();
      const idx = Number(optEl.dataset.idx);
      if (filtered[idx]) selectItem(filtered[idx]);
    });

    menuEl.addEventListener("mousemove", (e) => {
      const optEl = e.target.closest(".combo-opt[data-idx]");
      if (!optEl) return;
      const idx = Number(optEl.dataset.idx);
      if (idx !== activeIdx) {
        activeIdx = idx;
        menuEl.querySelectorAll(".combo-opt[data-idx]").forEach((el) => {
          el.classList.toggle("is-active", Number(el.dataset.idx) === activeIdx);
        });
      }
    });

    document.addEventListener("mousedown", (e) => {
      if (isOpen && !wrapEl.contains(e.target)) {
        closeMenu(true);
      }
    });

    return {
      setOptions(nextItems, nextSelectedValue, disabled = false, disabledPlaceholder = "") {
        items = nextItems || [];
        selectedValue = nextSelectedValue || "";
        const found = items.find((it) => it.value === selectedValue);
        selectedLabel = found ? found.label : "";
        inputEl.disabled = Boolean(disabled);
        toggleEl.disabled = Boolean(disabled);
        inputEl.placeholder = disabled && disabledPlaceholder ? disabledPlaceholder : placeholder;
        if (isOpen) closeMenu(false);
        inputEl.value = clearOnSelect ? "" : selectedLabel;
      },
      close() {
        closeMenu(true);
      },
    };
  }

  const fichaEntityCombo = createSearchableCombobox({
    wrapEl: document.getElementById("fichaEntityCombo"),
    inputEl: document.getElementById("fichaEntityInput"),
    toggleEl: document.getElementById("fichaEntityToggle"),
    menuEl: document.getElementById("fichaEntityMenu"),
    clearOnSelect: false,
    placeholder: "Buscar compañía o grupo...",
    onSelect: (item) => {
      state.fichaEntity = item.value;
      autoSelectPeers();
      renderFicha();
    },
  });

  const fichaPeerCombo = createSearchableCombobox({
    wrapEl: document.getElementById("fichaPeerCombo"),
    inputEl: document.getElementById("fichaPeerInput"),
    toggleEl: document.getElementById("fichaPeerToggle"),
    menuEl: document.getElementById("fichaPeerMenu"),
    clearOnSelect: true,
    placeholder: "+ Buscar y agregar par...",
    onSelect: (item) => {
      const val = item.value;
      const scope = getFichaScope(state.pIdx);
      const curMain = state.fichaEntity ? resolveEntityMetrics(state.fichaEntity, state.pIdx) : null;
      const outOfScope = scope.hasFilter && !scope.allowedKeys.has(val);
      const blockZ = isFichaPersonasContext(curMain, state.fichaEntity) && isZurichEntityKey(val);
      if (val && !outOfScope && !blockZ && val !== state.fichaEntity && !state.fichaPeers.includes(val) && state.fichaPeers.length < 4) {
        state.fichaPeers.push(val);
        renderFicha();
      }
    },
  });

  function syncFichaSelectors(pIdx, scope, isPersonasCtx) {
    const sortedGroups = scope.allowedGroups.slice().sort(esAlphaCmp);
    const sortedCias = scope.allowedCias.slice().sort((a, b) => esAlphaCmp(a.nombre, b.nombre));

    const entityItems = [];
    sortedGroups.forEach((g) => {
      entityItems.push({
        value: "GRP:" + g,
        label: `${g} (Consolidado)`,
        sub: "Grupo",
        group: "Grupos Consolidados",
        searchText: normSearch(`${g} grupo consolidado`),
      });
    });
    sortedCias.forEach((c) => {
      entityItems.push({
        value: "CIA:" + c.cod,
        label: c.nombre,
        sub: c.cod,
        group: "Compañías Individuales",
        searchText: normSearch(`${c.nombre} ${c.razon} ${c.cod} ${c.grupo}`),
      });
    });
    const curEntVal = scope.allowedKeys.has(state.fichaEntity) ? state.fichaEntity : "";
    fichaEntityCombo.setOptions(entityItems, curEntVal, scope.allowedKeys.size === 0, "Sin entidades en el filtro global");

    const selectedPeerSet = new Set(state.fichaPeers);
    const peerItems = [];
    sortedGroups.forEach((g) => {
      const k = "GRP:" + g;
      if (k === state.fichaEntity || selectedPeerSet.has(k)) return;
      if (isPersonasCtx && isZurichEntityKey(k)) return;
      peerItems.push({
        value: k,
        label: `${g} (Consolidado)`,
        sub: "Grupo",
        group: "Grupos Consolidados",
        searchText: normSearch(`${g} grupo consolidado`),
      });
    });
    sortedCias.forEach((c) => {
      const k = "CIA:" + c.cod;
      if (k === state.fichaEntity || selectedPeerSet.has(k)) return;
      if (isPersonasCtx && isZurichCompany(c)) return;
      peerItems.push({
        value: k,
        label: c.nombre,
        sub: c.cod,
        group: "Compañías Individuales",
        searchText: normSearch(`${c.nombre} ${c.razon} ${c.cod} ${c.grupo}`),
      });
    });
    const peersFull = state.fichaPeers.length >= 4;
    const peerDisabled = peersFull || peerItems.length === 0;
    const peerDisPlaceholder = peersFull ? "Máximo 4 pares alcanzados" : "+ Sin otros pares en el filtro";
    fichaPeerCombo.setOptions(peerItems, "", peerDisabled, peerDisPlaceholder);

    const fCrit = document.getElementById("fichaTopCrit");
    if (fCrit) {
      const validCrits = FICHA_TOP_CRIT_OPTIONS.filter(isCritAllowedForScope);
      fCrit.innerHTML = "";
      validCrits.forEach((o) => {
        const opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.label;
        fCrit.appendChild(opt);
      });
      if (!validCrits.some((o) => o.value === state.fichaTopCrit)) {
        state.fichaTopCrit = "auto";
      }
      fCrit.value = state.fichaTopCrit;
    }

    document.querySelectorAll("[data-quick-ent]").forEach((btn) => {
      const allowed = scope.allowedKeys.has(btn.dataset.quickEnt);
      btn.disabled = !allowed;
      btn.classList.toggle("active", allowed && btn.dataset.quickEnt === state.fichaEntity);
      btn.title = allowed ? "" : "Fuera del filtro global activo";
    });
  }

  function resolveEntityMetrics(entityKey, pIdx) {
    const { meses } = resolveBaseAndMeses(pIdx, state.base);
    if (entityKey.startsWith("GRP:")) {
      const gName = entityKey.slice(4);
      const members = COMPANIAS.filter((c) => c.grupo === gName && cqGrid[pIdx][c.idx]);
      if (members.length === 0) return null;
      const mList = members.map((c) => {
        const gm = getCompanyMetrics(pIdx, c.idx, state.base, state.moneda);
        if (gm) gm.cod = c.cod;
        return gm;
      }).filter(Boolean);
      const agg = aggregateMetrics(mList, meses, pIdx, state.base, state.moneda, { scope: "group" });
      agg.key = entityKey;
      agg.nombre = gName + " (Consolidado)";
      agg.tipo = "Grupo (" + members.length + " cías)";
      agg.segTipo = members[0].tipo;
      agg.esLS = gName === "Grupo La Segunda";
      agg.cIdxs = new Set(members.map((c) => c.idx));
      return agg;
    }
    const cod = entityKey.slice(4);
    const c = ciaByCod.get(cod);
    if (!c) return null;
    const m = getCompanyMetrics(pIdx, c.idx, state.base, state.moneda);
    if (!m) return null;
    m.key = entityKey;
    m.nombre = c.nombre;
    m.tipo = c.tipo;
    m.segTipo = c.tipo;
    m.const = c.const;
    m.grupo = c.grupo;
    m.esLS = c.ls;
    m.cIdxs = new Set([c.idx]);
    return m;
  }

  function openFichaEntity(entityKey) {
    const scope = getFichaScope(state.pIdx);
    if (scope.hasFilter && !scope.allowedKeys.has(entityKey)) {
      entityKey = pickDefaultFichaEntity(scope);
    }
    state.fichaEntity = entityKey;
    state.fichaLastFilterSig = scope.sig;
    const validCrits = FICHA_TOP_CRIT_OPTIONS.filter(isCritAllowedForScope);
    if (!validCrits.some((o) => o.value === state.fichaTopCrit)) {
      state.fichaTopCrit = "auto";
    }
    autoSelectPeers(scope);
    switchTab("ficha");
  }

  function autoSelectPeers(scopeOverride) {
    const pIdx = state.pIdx;
    const scope = scopeOverride || getFichaScope(pIdx);
    const main = state.fichaEntity ? resolveEntityMetrics(state.fichaEntity, pIdx) : null;
    if (!main) {
      state.fichaPeers = [];
      return;
    }
    const isGrp = state.fichaEntity.startsWith("GRP:");
    let crit = state.fichaTopCrit || "auto";
    const validCrits = FICHA_TOP_CRIT_OPTIONS.filter(isCritAllowedForScope);
    if (!validCrits.some((o) => o.value === crit)) crit = "auto";
    if (crit === "auto") {
      if (isGrp) crit = "tipo_emit";
      else if (main.segTipo === "Personas") crit = "ap_vida";
      else if (main.segTipo === "Retiro") crit = "retiro";
      else crit = "tipo_emit";
    }
    const personasCrits = new Set(["ap", "vida", "ap_vida", "vida_col", "vida_ind"]);
    const exclZurichPeers = (!isGrp && main.segTipo === "Personas" && !isZurichEntityKey(state.fichaEntity))
      || ((state.tipo === "Personas" || state.granRamo === "Personas") && !isZurichEntityKey(state.fichaEntity))
      || (personasCrits.has(crit) && !isZurichEntityKey(state.fichaEntity));

    const prMap = {
      ap: ["AP"],
      vida: ["VIDA_IND", "VIDA_COL", "VIDA_PREV", "VIDA_SD"],
      ap_vida: ["AP", "VIDA_IND", "VIDA_COL", "VIDA_PREV", "VIDA_SD"],
      vida_col: ["VIDA_COL"],
      vida_ind: ["VIDA_IND"],
      retiro: ["RET_IND", "RET_COL"],
    };

    function topKeysFromScoreMap(scoreMap) {
      return Array.from(scoreMap.entries())
        .filter(([, val]) => val > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k]) => k);
    }

    function scoreByPrSegments(segIds) {
      const scores = new Map();
      segIds.forEach((sid) => {
        const { rows } = computePrSegmentRows(pIdx, sid);
        rows.forEach((r) => {
          const c = COMPANIAS[r.cIdx];
          if (exclZurichPeers && isZurichCompany(c)) return;
          if (isGrp) {
            if (!c.multi || c.grupo === "Independientes") return;
            const k = "GRP:" + c.grupo;
            if (k === state.fichaEntity) return;
            if (scope.hasFilter && !scope.allowedKeys.has(k)) return;
            if (exclZurichPeers && isZurichEntityKey(k)) return;
            scores.set(k, (scores.get(k) || 0) + r.emit_sd);
          } else {
            const k = "CIA:" + r.cod;
            if (k === state.fichaEntity) return;
            if (scope.hasFilter && !scope.allowedKeys.has(k)) return;
            scores.set(k, (scores.get(k) || 0) + r.emit_sd);
          }
        });
      });
      return topKeysFromScoreMap(scores);
    }

    if (prMap[crit]) {
      const picked = scoreByPrSegments(prMap[crit]);
      if (picked.length > 0) {
        state.fichaPeers = picked;
        return;
      }
      crit = "tipo_emit";
    }

    if (crit === "ramo_princ") {
      const rmMix = computeRamoAggregates(pIdx, main.cIdxs).sort((a, b) => b.emit_sd - a.emit_sd);
      if (rmMix.length > 0) {
        const leaders = computeRamoLeaders(pIdx, rmMix[0].rIdx, null);
        const scores = new Map();
        leaders.forEach((r) => {
          const c = COMPANIAS[r.cIdx];
          if (exclZurichPeers && isZurichCompany(c)) return;
          if (isGrp) {
            if (!c.multi || c.grupo === "Independientes") return;
            const k = "GRP:" + c.grupo;
            if (k === state.fichaEntity) return;
            if (scope.hasFilter && !scope.allowedKeys.has(k)) return;
            if (exclZurichPeers && isZurichEntityKey(k)) return;
            scores.set(k, (scores.get(k) || 0) + r.emit_sd);
          } else {
            const k = "CIA:" + r.cod;
            if (k === state.fichaEntity) return;
            if (scope.hasFilter && !scope.allowedKeys.has(k)) return;
            scores.set(k, (scores.get(k) || 0) + r.emit_sd);
          }
        });
        const picked = topKeysFromScoreMap(scores);
        if (picked.length > 0) {
          state.fichaPeers = picked;
          return;
        }
      }
      crit = "tipo_emit";
    }

    const field = crit === "tipo_emit" ? "emit_sd" : crit;
    if (isGrp) {
      const allGrps = scope.allowedGroups.filter((g) =>
        "GRP:" + g !== state.fichaEntity && (!exclZurichPeers || !isZurichEntityKey("GRP:" + g))
      );
      const scored = allGrps
        .map((g) => resolveEntityMetrics("GRP:" + g, pIdx))
        .filter((x) => x && Number.isFinite(x[field]))
        .sort((a, b) => b[field] - a[field]);
      state.fichaPeers = scored.slice(0, 4).map((x) => x.key);
    } else {
      const pool = getCompanyRowsForPeriod(pIdx, false).filter((r) =>
        (!scope.hasFilter || scope.allowedCodSet.has(r.cod))
        && "CIA:" + r.cod !== state.fichaEntity
        && (!exclZurichPeers || !isZurichCompany(r))
        && Number.isFinite(r[field])
      );
      const sameTipo = pool.filter((r) => r.tipo === main.segTipo);
      const candidates = (sameTipo.length > 0 ? sameTipo : pool).sort((a, b) => b[field] - a[field]);
      state.fichaPeers = candidates.slice(0, 4).map((r) => "CIA:" + r.cod);
    }
  }

  function renderFicha() {
    const pIdx = state.pIdx;
    const hasYoY = pIdx >= 4;
    const scope = getFichaScope(pIdx);
    const filterChanged = scope.sig !== state.fichaLastFilterSig;
    let entityChanged = false;

    if (!state.fichaEntity || (scope.hasFilter && !scope.allowedKeys.has(state.fichaEntity))) {
      state.fichaEntity = pickDefaultFichaEntity(scope);
      entityChanged = true;
    }

    const validCrits = FICHA_TOP_CRIT_OPTIONS.filter(isCritAllowedForScope);
    if (!validCrits.some((o) => o.value === state.fichaTopCrit)) {
      state.fichaTopCrit = "auto";
    }

    const main = state.fichaEntity ? resolveEntityMetrics(state.fichaEntity, pIdx) : null;
    const isPersonasFicha = isFichaPersonasContext(main, state.fichaEntity);

    if (filterChanged || entityChanged) {
      state.fichaLastFilterSig = scope.sig;
      autoSelectPeers(scope);
    }

    if (scope.hasFilter) {
      state.fichaPeers = state.fichaPeers.filter((pk) => scope.allowedKeys.has(pk) && pk !== state.fichaEntity);
    }
    if (isPersonasFicha) {
      state.fichaPeers = state.fichaPeers.filter((pk) => !isZurichEntityKey(pk));
    }

    syncFichaSelectors(pIdx, scope, isPersonasFicha);

    const effectiveExclZurich = isPersonasFicha || state.fichaExclZurich;
    const chkExclZ = document.getElementById("fichaExclZurich");
    if (chkExclZ) {
      chkExclZ.checked = effectiveExclZurich;
      chkExclZ.disabled = isPersonasFicha;
      const lbl = chkExclZ.closest("label");
      if (lbl) lbl.title = isPersonasFicha ? "En Personas se excluye siempre a Grupo Zurich de la comparativa" : "";
    }

    // Peer chips
    const chipsEl = document.getElementById("fichaPeerChips");
    chipsEl.innerHTML = state.fichaPeers.map((pk) => {
      const pm = resolveEntityMetrics(pk, pIdx);
      const label = pm ? pm.nombre : pk;
      return `<span class="peer-chip">${esc(label)} <button type="button" data-rmpeer="${esc(pk)}">×</button></span>`;
    }).join("");
    chipsEl.querySelectorAll("button[data-rmpeer]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.fichaPeers = state.fichaPeers.filter((x) => x !== btn.dataset.rmpeer);
        renderFicha();
      });
    });

    if (!main) {
      const emptyMsg = scope.hasFilter && scope.allowedKeys.size === 0
        ? "No hay entidades disponibles para la combinación de filtros globales seleccionados."
        : "La entidad seleccionada no presentó balance en este período.";
      document.getElementById("fichaKpis").innerHTML = `<div class="card" data-no-expand>${emptyMsg}</div>`;
      ["fichaPeerTableWrap", "fichaBgWrap", "fichaErWrap", "fichaIndWrap", "fichaGastosWrap", "fichaInvTableWrap"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = "";
      });
      updateOutlierNote("fichaPeerRatiosOutlierNote", [], null);
      updateOutlierNote("fichaEvoOutlierNote", [], null);
      ["chFichaPeerRatios", "chFichaEvo", "chFichaRamos", "chFichaInv"].forEach(destroyChart);
      return;
    }

    const mainPrev = canCompareYoY(pIdx, state.base) ? resolveEntityMetrics(state.fichaEntity, pIdx - 4) : null;
    const allMkt = getCompanyRowsForPeriod(pIdx, false);
    const isGrp = state.fichaEntity.startsWith("GRP:");
    const isRetiroFicha = !isGrp && main.segTipo === "Retiro";
    const segRows = scope.hasFilter
      ? allMkt.filter((r) => scope.allowedCodSet.has(r.cod))
      : (isGrp ? allMkt : allMkt.filter((r) => r.tipo === main.segTipo));
    const { meses } = resolveBaseAndMeses(pIdx, state.base);
    const segRowsAvg = effectiveExclZurich ? segRows.filter((r) => !isZurichCompany(r)) : segRows;
    const segScope = (state.grupo && state.grupo !== "Independientes") ? "group" : "market";
    const segAgg = aggregateMetrics(segRowsAvg, meses, pIdx, state.base, state.moneda, { scope: segScope });
    const exclTag = effectiveExclZurich ? " (sin Zurich)" : "";
    const baseSegLbl = scope.hasFilter
      ? `Promedio ${scope.filterLabel}`
      : (isGrp ? "Promedio Total Mercado" : `Promedio ${main.segTipo}`);
    segAgg.nombre = baseSegLbl + exclTag;

    const totMkt = allMkt.reduce((s, r) => s + r.emit_sd, 0);
    const segTot = segRows.reduce((s, r) => s + r.emit_sd, 0);
    const mktSh = totMkt > 0 ? (main.emit_sd / totMkt) * 100 : 0;
    const segSh = segTot > 0 ? (main.emit_sd / segTot) * 100 : 0;

    // 6 KPIs
    const kpis = [
      { label: "Primas Emitidas SD", val: fmtMoney(main.emit_sd), sub: `Mkt: ${fmtPct(mktSh)} · Seg.: ${fmtPct(segSh)}`, accent: "" },
      {
        label: "Resultado Técnico",
        val: fmtMoney(main.res_tec),
        sub: isRetiroFicha
          ? `<span class="${pctClass(main.rt_pas_tec_pct)}">${fmtPct(main.rt_pas_tec_pct)} s/ Pas. Téc.</span>`
          : `<span class="${pctClass(main.rt_pct)}">${fmtPct(main.rt_pct)} s/ Dev.</span>`,
        accent: "accent-ink",
      },
      { label: "Resultado Financiero", val: fmtMoney(main.res_fin), sub: `Ret. s/ Inv.: <span class="${pctClass(main.ret_inv_pct)}">${fmtPct(main.ret_inv_pct)}</span>`, accent: "accent-blue" },
      { label: "Resultado del Ejercicio", val: fmtMoney(main.res_ej), sub: `ROE período: <span class="${pctClass(main.roe_pct)}">${fmtPct(main.roe_pct)}</span>`, accent: "accent-green" },
      isRetiroFicha
        ? { label: "Gastos Prod. y Expl.", val: fmtMoney(main.g_tot), sub: `Prod s/Emit: <strong>${fmtPct(main.gprod_emit_pct, 2)}</strong> · Expl s/PT: <strong>${fmtPct(main.gexpl_pt_pct, 2)}</strong>`, accent: "accent-orange" }
        : { label: "Ratio Combinado", val: fmtPct(main.comb_pct), sub: `Sin: ${fmtPct(main.sin_pct, 1)} · Prod: ${fmtPct(main.gprod_pct, 1)} · Expl: ${fmtPct(main.gexpl_pct, 1)}`, accent: "accent-orange" },
      { label: "Patrimonio Neto", val: fmtMoney(main.pn), sub: `Cobertura: ${fmtPct(main.cobertura_pct)} · Inv: ${fmtMoney(main.inv)}`, accent: "accent-blue" },
    ];
    document.getElementById("fichaKpis").innerHTML = kpis.map((k) => `
      <div class="kpi-card ${k.accent}"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value num">${esc(k.val)}</div><div class="kpi-sub">${k.sub}</div></div>
    `).join("");
    attachExpandButtons(document.getElementById("fichaKpis"));

    // Peer-to-Peer Table
    const peerObjs = [main];
    state.fichaPeers.forEach((pk) => {
      const pm = resolveEntityMetrics(pk, pIdx);
      if (pm) peerObjs.push(pm);
    });
    peerObjs.push(segAgg);

    let pHtml = isRetiroFicha
      ? `<table class="data-table table-compact"><thead><tr>
        <th>Entidad</th><th class="num">Emit. (${unitSuffix()})</th><th class="num" title="Deudas con Asegurados + Compromisos Técnicos">Pas. Téc. (${unitSuffix()})</th><th class="num" title="Gastos de Producción / Primas Emitidas">G.Prod s/Emit%</th><th class="num" title="Gastos de Explotación / (Deudas c/ Asegurados + Compromisos Técnicos)">G.Expl s/PT%</th><th class="num" title="Resultado Técnico / (Deudas c/ Asegurados + Compromisos Técnicos)">Téc. s/PT%</th><th class="num">Ret.Inv%</th><th class="num">ROE%</th><th class="num">Cob.%</th>
      </tr></thead><tbody>`
      : `<table class="data-table table-compact"><thead><tr>
        <th>Entidad</th><th class="num">Emit. (${unitSuffix()})</th><th class="num">Sin.%</th><th class="num" title="Gastos de Producción / Primas Devengadas">G.Prod%</th><th class="num" title="Gastos de Explotación (brutos) / Primas Devengadas">G.Expl%</th><th class="num" title="Gastos Totales Netos (Prod. + Expl. − a/c Reaseg.) / Primas Devengadas">G.Neto%</th><th class="num">Comb.%</th><th class="num">Téc.%</th><th class="num">Ret.Inv%</th><th class="num">ROE%</th><th class="num">Cob.%</th>
      </tr></thead><tbody>`;
    peerObjs.forEach((o, i) => {
      const cls = i === 0 ? "row-ls" : (i === peerObjs.length - 1 ? "row-total" : "");
      const isTotRow = i === peerObjs.length - 1;
      if (isRetiroFicha) {
        pHtml += `<tr class="${cls}">
          <td class="td-ellipsis" title="${esc(o.nombre)}">${esc(o.nombre)}</td>
          <td class="num">${isTotRow ? "—" : fmtNumMiles(o.emit_sd)}</td>
          <td class="num">${isTotRow ? "—" : fmtNumMiles(o.pas_tec)}</td>
          <td class="num">${fmtPct(o.gprod_emit_pct)}</td>
          <td class="num">${fmtPct(o.gexpl_pt_pct)}</td>
          <td class="num"><span class="${pctClass(o.rt_pas_tec_pct)}">${fmtPct(o.rt_pas_tec_pct)}</span></td>
          <td class="num"><span class="${pctClass(o.ret_inv_pct)}">${fmtPct(o.ret_inv_pct)}</span></td>
          <td class="num"><span class="${pctClass(o.roe_pct)}">${fmtPct(o.roe_pct)}</span></td>
          <td class="num">${fmtPct(o.cobertura_pct)}</td>
        </tr>`;
      } else {
        pHtml += `<tr class="${cls}">
          <td class="td-ellipsis" title="${esc(o.nombre)}">${esc(o.nombre)}</td>
          <td class="num">${isTotRow ? "—" : fmtNumMiles(o.emit_sd)}</td>
          <td class="num">${fmtPct(o.sin_pct)}</td>
          <td class="num">${fmtPct(o.gprod_pct)}</td>
          <td class="num">${fmtPct(o.gexpl_pct)}</td>
          <td class="num">${fmtPct(o.gto_pct)}</td>
          <td class="num"><strong>${fmtPct(o.comb_pct)}</strong></td>
          <td class="num"><span class="${pctClass(o.rt_pct)}">${fmtPct(o.rt_pct)}</span></td>
          <td class="num"><span class="${pctClass(o.ret_inv_pct)}">${fmtPct(o.ret_inv_pct)}</span></td>
          <td class="num"><span class="${pctClass(o.roe_pct)}">${fmtPct(o.roe_pct)}</span></td>
          <td class="num">${fmtPct(o.cobertura_pct)}</td>
        </tr>`;
      }
    });
    pHtml += "</tbody></table>";
    document.getElementById("fichaPeerTableWrap").innerHTML = pHtml;

    const peerChartRows = peerObjs.map((o, idx) => {
      const vals = isRetiroFicha
        ? [o.gprod_emit_pct || 0, o.gexpl_pt_pct || 0, o.rt_pas_tec_pct || 0]
        : [o.sin_pct || 0, o.gprod_pct || 0, o.gexpl_pct || 0, o.rt_pct || 0];
      return {
        ...o,
        _isSegAvg: idx === peerObjs.length - 1,
        _barPos: Math.max(0, ...vals),
        _barNeg: Math.min(0, ...vals),
      };
    });
    const peerFiltered = filterChartOutliers(
      peerChartRows,
      peerChartRows,
      [{ key: "_barPos", suffix: "%" }, { key: "_barNeg", suffix: "%" }],
      { weighted: false, anchorZero: true, protectFn: (r) => Boolean(r._isSegAvg) }
    );
    const peerKept = peerFiltered.kept;
    updateOutlierNote(
      "fichaPeerRatiosOutlierNote",
      peerFiltered.dropped,
      ({ row }) => {
        const combStr = isRetiroFicha
          ? `Téc. s/PT ${fmtPct(row.rt_pas_tec_pct, 1)}`
          : `Sin. ${fmtPct(row.sin_pct, 1)} · Gtos ${fmtPct(row.gto_pct, 1)}`;
        return `${row.nombre} (${combStr})`;
      },
      { single: "Se mantiene en la tabla comparativa.", plural: "Se mantienen en la tabla comparativa." }
    );
    destroyChart("chFichaPeerRatios");
    charts.chFichaPeerRatios = new Chart(document.getElementById("chFichaPeerRatios"), {
      type: "bar",
      data: {
        labels: peerKept.map((o) => o.nombre),
        datasets: isRetiroFicha ? [
          { label: "G. Producción % (s/ Emit.)", data: peerKept.map((o) => o.gprod_emit_pct || 0), backgroundColor: BRAND.orange, borderRadius: 3 },
          { label: "G. Explotación % (s/ Pas. Téc.)", data: peerKept.map((o) => o.gexpl_pt_pct || 0), backgroundColor: BRAND.amber, borderRadius: 3 },
          { label: "Res. Técnico % (s/ Pas. Téc.)", data: peerKept.map((o) => o.rt_pas_tec_pct || 0), backgroundColor: BRAND.red, borderRadius: 3 },
        ] : [
          { label: "Siniestralidad %", data: peerKept.map((o) => o.sin_pct || 0), backgroundColor: BRAND.blue, borderRadius: 3 },
          { label: "G. Producción %", data: peerKept.map((o) => o.gprod_pct || 0), backgroundColor: BRAND.orange, borderRadius: 3 },
          { label: "G. Explotación %", data: peerKept.map((o) => o.gexpl_pct || 0), backgroundColor: BRAND.amber, borderRadius: 3 },
          { label: "Res. Técnico %", data: peerKept.map((o) => o.rt_pct || 0), backgroundColor: BRAND.red, borderRadius: 3 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: (ctx) => chartPctTooltipLabel(ctx, 2) } } },
        scales: { y: { ticks: { callback: chartPctTick } } },
      },
    });

    // Historical 12-quarter evolution
    const evoSelEl = document.getElementById("fichaEvoMetric");
    if (evoSelEl) {
      const gprodOpt = evoSelEl.querySelector('option[value="gprod_pct"]');
      const gexplOpt = evoSelEl.querySelector('option[value="gexpl_pct"]');
      if (gprodOpt) gprodOpt.textContent = isRetiroFicha ? "Gastos de Producción (% s/ Emit.)" : "Gastos de Producción (%)";
      if (gexplOpt) gexplOpt.textContent = isRetiroFicha ? "Gastos de Explotación (% s/ Pas. Téc.)" : "Gastos de Explotación (%)";
    }
    const evoMetricRaw = state.fichaEvoMetric;
    const evoMetric = isRetiroFicha
      ? (evoMetricRaw === "gprod_pct" ? "gprod_emit_pct" : (evoMetricRaw === "gexpl_pct" ? "gexpl_pt_pct" : evoMetricRaw))
      : evoMetricRaw;
    const isPct = evoMetric.endsWith("_pct");
    const div = isPct ? 1 : unitDivisor();
    const evoStart = Math.max(0, pIdx - 11);
    const evoLabels = [];
    for (let q = evoStart; q <= pIdx; q++) evoLabels.push(PERIODOS[q].label);
    const trackKeys = [state.fichaEntity].concat(state.fichaPeers);
    const datasets = trackKeys.map((ek, idx) => {
      const m0 = resolveEntityMetrics(ek, pIdx);
      const series = [];
      for (let q = evoStart; q <= pIdx; q++) {
        const mq = resolveEntityMetrics(ek, q);
        series.push(mq && mq[evoMetric] != null ? mq[evoMetric] / div : null);
      }
      return {
        label: m0 ? m0.nombre : ek,
        data: series,
        borderColor: PALETTE[idx % PALETTE.length],
        backgroundColor: PALETTE[idx % PALETTE.length],
        borderWidth: idx === 0 ? 3 : 2,
        tension: 0.25,
      };
    });

    const evoFiltered = filterTimeSeriesOutliers(evoLabels, datasets, {
      suffix: isPct ? "%" : "$",
      extThreshold: isPct ? 0.85 : 1.5,
      zThreshold: isPct ? 3.5 : 4.0,
      maxDrops: 4,
      maxFrac: 0.16,
    });
    updateOutlierNote(
      "fichaEvoOutlierNote",
      evoFiltered.dropped,
      (d) => `${d.series} (${d.period}: ${isPct ? fmtPct(d.value, 1) : fmtMoney(d.value * div)})`,
      { single: "El valor real se conserva en los datos.", plural: "Los valores reales se conservan en los datos." }
    );
    destroyChart("chFichaEvo");
    charts.chFichaEvo = new Chart(document.getElementById("chFichaEvo"), {
      type: "line",
      data: { labels: evoLabels, datasets: evoFiltered.datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => isPct ? chartPctTooltipLabel(ctx, 2) : chartMoneyTooltipLabel(ctx),
            },
          },
        },
        scales: { y: { ticks: { callback: (v) => isPct ? chartPctTick(v) : chartMoneyTick(v) } } },
      },
    });

    // Balance General Resumido + Estado de Resultados (alineado a Presentación SSN)
    const hasBgVpp = isGrp && ((main.elim_vpp_pn || 0) > 0.1 || (mainPrev && (mainPrev.elim_vpp_pn || 0) > 0.1));
    const hasBgNci = isGrp && (Math.abs(main.part_terc_pn || 0) > 0.1 || (mainPrev && Math.abs(mainPrev.part_terc_pn || 0) > 0.1));
    const hasErVpp = isGrp && (Math.abs(main.elim_vpp_re || 0) > 0.1 || (mainPrev && Math.abs(mainPrev.elim_vpp_re || 0) > 0.1));
    const hasErNci = isGrp && (Math.abs(main.part_terc_re || 0) > 0.1 || (mainPrev && Math.abs(mainPrev.part_terc_re || 0) > 0.1));

    const bgRows = [
      ["ACTIVO", null, null, "section"],
      ["Disponibilidades", main.disp, mainPrev ? mainPrev.disp : null, "sub"],
      [hasBgVpp ? "Inversiones (neto VPP)" : "Inversiones", main.inv, mainPrev ? mainPrev.inv : null, "sub"],
      ["Premios a Cobrar", main.prem_cob, mainPrev ? mainPrev.prem_cob : null, "sub"],
      ["Reaseguros y Coaseguros", main.cred_reas, mainPrev ? mainPrev.cred_reas : null, "sub"],
      ["Otros Créditos", main.otros_cred, mainPrev ? mainPrev.otros_cred : null, "sub"],
      ["Inmuebles", main.inmuebles, mainPrev ? mainPrev.inmuebles : null, "sub"],
      ["Bienes de Uso", main.bienes_uso, mainPrev ? mainPrev.bienes_uso : null, "sub"],
      ["Otros Activos", main.otros_act, mainPrev ? mainPrev.otros_act : null, "sub"],
      ["TOTAL ACTIVO", main.activo, mainPrev ? mainPrev.activo : null, "bold"],
      ["PASIVO Y PATRIMONIO NETO", null, null, "section"],
      ["Deudas con Asegurados (neto Reas.)", main.deudas_aseg, mainPrev ? mainPrev.deudas_aseg : null, "sub"],
      ["Con Reaseguradores y Coaseg.", main.deudas_reas, mainPrev ? mainPrev.deudas_reas : null, "sub"],
      ["Con Productores", main.deudas_prod, mainPrev ? mainPrev.deudas_prod : null, "sub"],
      ["Fiscales y Sociales", main.deudas_fisc, mainPrev ? mainPrev.deudas_fisc : null, "sub"],
      ["Otras Deudas", main.otras_deudas, mainPrev ? mainPrev.otras_deudas : null, "sub"],
      ["Compromisos Técnicos", main.comp_tec, mainPrev ? mainPrev.comp_tec : null, "sub"],
      ["Previsiones", main.previsiones, mainPrev ? mainPrev.previsiones : null, "sub"],
      ["TOTAL PASIVO", main.pasivo, mainPrev ? mainPrev.pasivo : null, "bold"],
    ];
    if (hasBgNci) {
      bgRows.push([
        "Participación de Terceros en Soc. Controladas",
        main.part_terc_pn || 0,
        mainPrev ? (mainPrev.part_terc_pn || 0) : null,
        "sub",
      ]);
    }
    const totPasivoPn = main.pasivo + (hasBgNci ? (main.part_terc_pn || 0) : 0) + main.pn;
    const prevTotPasivoPn = mainPrev ? (mainPrev.pasivo + (hasBgNci ? (mainPrev.part_terc_pn || 0) : 0) + mainPrev.pn) : null;
    bgRows.push(
      [hasBgNci ? "PATRIMONIO NETO (Atrib. Empresa Madre)" : (hasBgVpp ? "PATRIMONIO NETO (neto VPP)" : "PATRIMONIO NETO"), main.pn, mainPrev ? mainPrev.pn : null, "bold"],
      ["TOTAL PASIVO + PN", totPasivoPn, prevTotPasivoPn, "total"]
    );
    if (hasBgVpp) {
      bgRows.push([
        "Nota: Elim. VPP intragrupo (Acciones/PN)",
        -(main.elim_vpp_pn || 0),
        mainPrev ? -(mainPrev.elim_vpp_pn || 0) : null,
        "sub",
      ]);
    }
    let bgHtml = `<table class="data-table table-compact"><thead><tr><th>Rubro Balance General</th><th class="num">${esc(PERIODOS[pIdx].label)} (${unitSuffix()})</th><th class="num">% s/ Act.</th><th class="num">YoY Ant. (${unitSuffix()})</th><th class="num">Var. %</th></tr></thead><tbody>`;
    bgRows.forEach(([lbl, cur, prv, st]) => {
      if (st === "section") {
        bgHtml += `<tr class="stmt-row-section"><td colspan="5">${esc(lbl)}</td></tr>`;
        return;
      }
      const varP = prv != null ? calcYoY(cur, prv) : null;
      const pctAct = main.activo > 0 && !lbl.startsWith("Nota:") ? (cur / main.activo) * 100 : null;
      const trC = st === "total" ? "stmt-row-total" : (st === "bold" ? "stmt-row-bold" : "stmt-row-sub");
      bgHtml += `<tr class="${trC}"><td>${esc(lbl)}</td><td class="num">${fmtNumMiles(cur)}</td><td class="num">${pctAct != null ? fmtPct(pctAct) : "—"}</td><td class="num">${prv != null ? fmtNumMiles(prv) : "—"}</td><td class="num"><span class="${pctClass(varP)}">${fmtSignedPct(varP)}</span></td></tr>`;
    });
    bgHtml += "</tbody></table>";
    document.getElementById("fichaBgWrap").innerHTML = bgHtml;

    const hasResc = Math.abs(main.rescates || 0) > 0.01 || (mainPrev && Math.abs(mainPrev.rescates || 0) > 0.01);
    const hasRent = Math.abs(main.rentas || 0) > 0.01 || (mainPrev && Math.abs(mainPrev.rentas || 0) > 0.01);
    const hasOthInd = Math.abs(main.otras_ind || 0) > 0.01 || (mainPrev && Math.abs(mainPrev.otras_ind || 0) > 0.01);
    const hasExtra = Math.abs(main.res_extra || 0) > 0.01 || (mainPrev && Math.abs(mainPrev.res_extra || 0) > 0.01);
    const opOrd = main.res_tec + main.res_fin - (hasErNci ? (main.part_terc_re || 0) : 0);
    const prevOpOrd = mainPrev ? (mainPrev.res_tec + mainPrev.res_fin - (hasErNci ? (mainPrev.part_terc_re || 0) : 0)) : null;

    const erRows = [
      ["ESTRUCTURA TÉCNICA", null, null, "section"],
      ["Primas Emitidas Totales (SD + RA)", main.emit_tot, mainPrev ? mainPrev.emit_tot : null, "sub"],
      ["Primas y Recargos Devengados", main.prim_dev, mainPrev ? mainPrev.prim_dev : null, "bold"],
      ["Siniestros Devengados", -main.sin_dev, mainPrev ? -mainPrev.sin_dev : null, "sub"],
    ];
    if (hasResc) erRows.push(["Rescates", -main.rescates, mainPrev ? -mainPrev.rescates : null, "sub"]);
    if (hasRent) erRows.push(["Rentas Vitalicias y Periódicas", -main.rentas, mainPrev ? -mainPrev.rentas : null, "sub"]);
    if (hasOthInd) erRows.push(["Otras Indemnizaciones y Beneficios", -main.otras_ind, mainPrev ? -mainPrev.otras_ind : null, "sub"]);
    erRows.push(
      ["Gastos de Producción y Explotación (netos)", -main.g_tot, mainPrev ? -mainPrev.g_tot : null, "sub"],
      ["Otros Ingresos Técnicos", main.otros_ing, mainPrev ? mainPrev.otros_ing : null, "sub"],
      ["Otros Egresos Técnicos", -main.otros_egr, mainPrev ? -mainPrev.otros_egr : null, "sub"],
      ["RESULTADO TÉCNICO", main.res_tec, mainPrev ? mainPrev.res_tec : null, "bold"],
      ["ESTRUCTURA FINANCIERA", null, null, "section"],
      ["Rentas (Tít., Recargos Financieros, etc.)", main.fin_rentas, mainPrev ? mainPrev.fin_rentas : null, "sub"],
      ["Resultados por Realización", main.fin_realiz, mainPrev ? mainPrev.fin_realiz : null, "sub"],
      ["Resultados por Tenencia", main.fin_tenencia, mainPrev ? mainPrev.fin_tenencia : null, "sub"],
      ["Gastos y Otros Ing./Egr. Financieros", main.fin_otros, mainPrev ? mainPrev.fin_otros : null, "sub"],
    );
    if (hasErVpp) {
      erRows.push([
        "Eliminación VPP Intragrupo (RT 21)",
        -(main.elim_vpp_re || 0),
        mainPrev ? -(mainPrev.elim_vpp_re || 0) : null,
        "sub",
      ]);
    }
    erRows.push(
      ["RECPAM", main.recpam, mainPrev ? mainPrev.recpam : null, "sub"],
      ["RESULTADO ESTRUCTURA FINANCIERA", main.res_fin, mainPrev ? mainPrev.res_fin : null, "bold"]
    );
    if (hasErNci) {
      erRows.push([
        "Participación de Terceros en Soc. Controladas",
        -(main.part_terc_re || 0),
        mainPrev ? -(mainPrev.part_terc_re || 0) : null,
        "sub",
      ]);
    }
    erRows.push(["RESULTADO DE OPERACIONES ORDINARIAS", opOrd, prevOpOrd, "bold"]);
    if (hasExtra) erRows.push(["Resultados Operaciones Extraordinarias", main.res_extra, mainPrev ? mainPrev.res_extra : null, "sub"]);
    erRows.push(
      ["Impuesto a las Ganancias", main.imp_gan, mainPrev ? mainPrev.imp_gan : null, "sub"],
      [hasErNci ? "RESULTADO DEL PERÍODO (Atrib. Empresa Madre)" : "RESULTADO DEL PERÍODO", main.res_ej, mainPrev ? mainPrev.res_ej : null, "total"]
    );
    let erHtml = `<table class="data-table table-compact"><thead><tr><th>Estado de Resultados</th><th class="num">${esc(PERIODOS[pIdx].label)} (${unitSuffix()})</th><th class="num">YoY Ant. (${unitSuffix()})</th><th class="num">% s/ Dev.</th></tr></thead><tbody>`;
    erRows.forEach(([lbl, cur, prv, st]) => {
      if (st === "section") {
        erHtml += `<tr class="stmt-row-section"><td colspan="4">${esc(lbl)}</td></tr>`;
        return;
      }
      const pctDev = main.prim_dev > 0 ? (cur / main.prim_dev) * 100 : null;
      const trC = st === "total" ? "stmt-row-total" : (st === "bold" ? "stmt-row-bold" : "stmt-row-sub");
      const isStrong = st === "bold" || st === "total";
      erHtml += `<tr class="${trC}"><td>${esc(lbl)}</td><td class="num"><span class="${isStrong ? pctClass(cur) : ""}">${fmtNumMiles(cur)}</span></td><td class="num">${prv != null ? fmtNumMiles(prv) : "—"}</td><td class="num">${fmtPct(pctDev)}</td></tr>`;
    });
    erHtml += "</tbody></table>";
    document.getElementById("fichaErWrap").innerHTML = erHtml;

    // Indicadores y Relaciones Técnicas SSN (C, D y E)
    const indCards = [
      (() => {
        const v = main.dep_pct;
        const z = v == null ? { cls: "", lbl: "—" } : (v <= 40 ? { cls: "zone-opt", lbl: "Óptimo (0–40%)" } : (v <= 50 ? { cls: "zone-acc", lbl: "Aceptable (40–50%)" } : { cls: "zone-risk", lbl: "Riesgo (+50%)" }));
        return { tag: "Indicador C", title: "Grado de Dependencia", formula: "Créditos / Total del Activo", val: fmtPct(v), cls: z.cls, zLbl: z.lbl, ref: `Óptimo: 0–40% · Acept.: 40–50% · Riesgo: +50% · Seg.: ${fmtPct(segAgg.dep_pct)}` };
      })(),
      (() => {
        const v = main.solv_liq_pct;
        const sc = v == null || !Number.isFinite(v) || v > 9999;
        const z = sc ? { cls: "zone-opt", lbl: "Sin deuda aseg. signif." } : (v >= 80 ? { cls: "zone-opt", lbl: "Óptimo (+80%)" } : (v >= 65 ? { cls: "zone-acc", lbl: "Aceptable (65–80%)" } : { cls: "zone-risk", lbl: "Riesgo (0–65%)" }));
        return { tag: "Indicador D", title: "Solvencia Líquida", formula: "(Disp. + Inv.) / Deudas con Asegurados", val: fmtSolvLiq(v), cls: z.cls, zLbl: z.lbl, ref: `Óptimo: +80% · Acept.: 65–80% · Riesgo: 0–65% · Seg.: ${fmtSolvLiq(segAgg.solv_liq_pct)}` };
      })(),
      (() => {
        const v = main.cobertura_pct;
        const z = v == null ? { cls: "", lbl: "—" } : (v >= 100 ? { cls: "zone-opt", lbl: "Óptimo (+100%)" } : (v >= 80 ? { cls: "zone-acc", lbl: "Aceptable (80–100%)" } : { cls: "zone-risk", lbl: "Riesgo (0–80%)" }));
        return { tag: "Indicador E", title: "Solvencia (Cobertura)", formula: "(Disp. + Inv. + Inmuebles) / (Ds. Aseg. + Comp. Téc.)", val: fmtPct(v), cls: z.cls, zLbl: z.lbl, ref: `Óptimo: +100% · Acept.: 80–100% · Riesgo: 0–80% · Seg.: ${fmtPct(segAgg.cobertura_pct)}` };
      })(),
    ];
    document.getElementById("fichaIndWrap").innerHTML = `<div class="ind-grid">${indCards.map((c) => `
      <div class="ind-card ${c.cls}">
        <div>
          <div class="ind-tag">${esc(c.tag)}</div>
          <div class="ind-title">${esc(c.title)}</div>
          <div class="ind-formula">${esc(c.formula)}</div>
        </div>
        <div class="ind-val">${esc(c.val)}</div>
        <span class="ind-zone-badge">${esc(c.zLbl)}</span>
        <div class="ind-ref">${esc(c.ref)}</div>
      </div>
    `).join("")}</div>`;

    // Desglose de Gastos de Producción y Explotación (Anexo 14)
    const gProdOtros = (main.g_prod || 0) - (main.g_prod_com || 0);
    const gExplOtros = (main.g_expl || 0) - (main.g_sueldos || 0) - (main.g_imp || 0) - (main.g_pub || 0) - (main.g_hon || 0) - (main.g_dir || 0);
    const prevGProdOtros = mainPrev ? ((mainPrev.g_prod || 0) - (mainPrev.g_prod_com || 0)) : null;
    const prevGExplOtros = mainPrev ? ((mainPrev.g_expl || 0) - (mainPrev.g_sueldos || 0) - (mainPrev.g_imp || 0) - (mainPrev.g_pub || 0) - (mainPrev.g_hon || 0) - (mainPrev.g_dir || 0)) : null;
    const gRows = [
      ["Primas Devengadas (base %)", main.prim_dev, mainPrev ? mainPrev.prim_dev : null, "bold"],
      ["Comisiones (Seguros Directos)", main.g_prod_com || 0, mainPrev ? (mainPrev.g_prod_com || 0) : null, "sub"],
      ["Otros Gastos de Producción (y Reas. Act.)", gProdOtros, prevGProdOtros, "sub"],
      ["Total Gastos de Producción", main.g_prod || 0, mainPrev ? (mainPrev.g_prod || 0) : null, "bold"],
      ["Sueldos y Cargas Sociales", main.g_sueldos || 0, mainPrev ? (mainPrev.g_sueldos || 0) : null, "sub"],
      ["Impuestos, Tasas y Contribuciones", main.g_imp || 0, mainPrev ? (mainPrev.g_imp || 0) : null, "sub"],
      ["Publicidad y Propaganda", main.g_pub || 0, mainPrev ? (mainPrev.g_pub || 0) : null, "sub"],
      ["Honorarios", main.g_hon || 0, mainPrev ? (mainPrev.g_hon || 0) : null, "sub"],
      ["Retribución Adm. y Síndicos", main.g_dir || 0, mainPrev ? (mainPrev.g_dir || 0) : null, "sub"],
      ["Otros Gastos de Explotación (incl. Amort.)", gExplOtros, prevGExplOtros, "sub"],
      ["Total Gastos de Explotación", main.g_expl || 0, mainPrev ? (mainPrev.g_expl || 0) : null, "bold"],
      ["(-) Gastos de Gestión a/c Reaseguros", -(main.g_reas || 0), mainPrev ? -(mainPrev.g_reas || 0) : null, "sub"],
      ["TOTAL GASTOS NETOS DE GESTIÓN", main.g_tot || 0, mainPrev ? (mainPrev.g_tot || 0) : null, "total"],
    ];
    let gHtml = `<table class="data-table table-compact"><thead><tr><th>Concepto (Anexo 14)</th><th class="num">${esc(PERIODOS[pIdx].label)} (${unitSuffix()})</th><th class="num">% s/ Dev.</th><th class="num">YoY Ant. (${unitSuffix()})</th></tr></thead><tbody>`;
    gRows.forEach(([lbl, cur, prv, st], i) => {
      const pctDev = i === 0 ? (main.prim_dev > 0 ? 100 : null) : (main.prim_dev > 0 ? (cur / main.prim_dev) * 100 : null);
      const trC = st === "total" ? "stmt-row-total" : (st === "bold" ? "stmt-row-bold" : "stmt-row-sub");
      gHtml += `<tr class="${trC}"><td>${esc(lbl)}</td><td class="num">${fmtNumMiles(cur)}</td><td class="num">${fmtPct(pctDev)}</td><td class="num">${prv != null ? fmtNumMiles(prv) : "—"}</td></tr>`;
    });
    gHtml += "</tbody></table>";
    document.getElementById("fichaGastosWrap").innerHTML = gHtml;

    // Mix de Cartera por Ramo
    const rmMix = computeRamoAggregates(pIdx, main.cIdxs).sort((a, b) => b.emit_sd - a.emit_sd).slice(0, 10);
    const dM = unitDivisor();
    destroyChart("chFichaRamos");
    charts.chFichaRamos = new Chart(document.getElementById("chFichaRamos"), {
      type: "bar",
      data: {
        labels: rmMix.map((r) => r.desc),
        datasets: [{ label: `Emitidas SD (${unitSuffix()})`, data: rmMix.map((r) => r.emit_sd / dM), backgroundColor: BRAND.red, borderRadius: 4 }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: chartMoneyTooltipLabel } },
        },
        scales: { x: { ticks: { callback: chartMoneyTick }, grid: { color: "#f0f0f4" } }, y: { grid: { display: false } } },
      },
    });

    // Composición Inversiones Anexo 2 (País + Exterior por instrumento)
    const invAllRows = [
      ["Títulos Públicos de Renta", "inv_tp", main.inv_tp, mainPrev ? mainPrev.inv_tp : null],
      [hasBgVpp ? "Acciones (neto VPP)" : "Acciones", "inv_acc", main.inv_acc, mainPrev ? mainPrev.inv_acc : null],
      ["Obligaciones Negociables", "inv_on", main.inv_on, mainPrev ? mainPrev.inv_on : null],
      ["Fondos Comunes de Inversión", "inv_fci", main.inv_fci, mainPrev ? mainPrev.inv_fci : null],
      ["Fideicomisos Financieros", "inv_fid", main.inv_fid, mainPrev ? mainPrev.inv_fid : null],
      ["Depósitos a Plazo", "inv_pf", main.inv_pf, mainPrev ? mainPrev.inv_pf : null],
      ["Otras Inversiones (y Prést.)", "inv_otr", main.inv_otr, mainPrev ? mainPrev.inv_otr : null],
    ];
    const invItems = [
      ["Títulos Públicos", main.inv_tp],
      ["Acciones", main.inv_acc],
      ["Obligaciones Negoc.", main.inv_on],
      ["FCI", main.inv_fci],
      ["Fideicomisos", main.inv_fid],
      ["Plazos Fijos", main.inv_pf],
      ["Otras Inversiones", main.inv_otr],
    ].filter((x) => Math.abs(x[1]) > 0.1);
    destroyChart("chFichaInv");
    charts.chFichaInv = new Chart(document.getElementById("chFichaInv"), {
      type: "doughnut",
      data: {
        labels: invItems.map((x) => x[0]),
        datasets: [{ data: invItems.map((x) => x[1] / dM), backgroundColor: PALETTE, borderWidth: 2, borderColor: "#fff" }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right" },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const tot = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = tot > 0 ? (ctx.raw / tot) * 100 : 0;
                return ` ${ctx.label}: ${fmtMoney(ctx.raw * dM)} (${fmtPct(pct, 1)})`;
              },
            },
          },
        },
      },
    });
    const totDispInv = (main.disp || 0) + (main.inv || 0);
    const prevTotDispInv = mainPrev ? ((mainPrev.disp || 0) + (mainPrev.inv || 0)) : null;
    let invTblHtml = `<table class="data-table table-compact"><thead><tr><th>Detalle Anexo 1 y 2</th><th class="num">${esc(PERIODOS[pIdx].label)} (${unitSuffix()})</th><th class="num">% s/ Inv.</th><th class="num">YoY Ant. (${unitSuffix()})</th></tr></thead><tbody>`;
    invAllRows.forEach(([lbl, , cur, prv]) => {
      const shInv = main.inv > 0 ? (cur / main.inv) * 100 : null;
      invTblHtml += `<tr class="stmt-row-sub"><td>${esc(lbl)}</td><td class="num">${fmtNumMiles(cur)}</td><td class="num">${fmtPct(shInv, 1)}</td><td class="num">${prv != null ? fmtNumMiles(prv) : "—"}</td></tr>`;
    });
    invTblHtml += `<tr class="stmt-row-bold"><td>TOTAL INVERSIONES (Anexo 2)</td><td class="num">${fmtNumMiles(main.inv)}</td><td class="num">100,0%</td><td class="num">${mainPrev ? fmtNumMiles(mainPrev.inv) : "—"}</td></tr>`;
    invTblHtml += `<tr class="stmt-row-sub"><td>Disponibilidades (Anexo 1)</td><td class="num">${fmtNumMiles(main.disp)}</td><td class="num">—</td><td class="num">${mainPrev ? fmtNumMiles(mainPrev.disp) : "—"}</td></tr>`;
    invTblHtml += `<tr class="stmt-row-total"><td>TOTAL DISPONIBILIDADES + INVERSIONES</td><td class="num">${fmtNumMiles(totDispInv)}</td><td class="num">—</td><td class="num">${prevTotDispInv != null ? fmtNumMiles(prevTotDispInv) : "—"}</td></tr>`;
    invTblHtml += "</tbody></table>";
    document.getElementById("fichaInvTableWrap").innerHTML = invTblHtml;
  }

  // ==================== TAB 8: METODOLOGÍA Y AUDITORÍA ====================
  function renderMetodologia() {
    const badge = document.getElementById("audGlobalStatus");
    badge.textContent = VAL.passed ? "PASS — 100% Conciliado" : "FAIL — Revisar";
    badge.className = "badge " + (VAL.passed ? "badge-ok" : "badge-warn");

    const g = VAL.global;
    const firstPerLbl = PERIODOS[0]?.label || "Inicio";
    const lastPerLbl = PERIODOS[nP - 1]?.label || "Cierre";
    const ipcBenchRow = g.ipc_ratio_2026_3_vs_2025_3 != null
      ? `<tr><td><strong>Factor IPC 2026-3 / 2025-3 vs PDF</strong></td><td class="num">${g.ipc_ratio_2026_3_vs_2025_3.toFixed(6)} vs ${g.ipc_pdf_esperado} (diff ${g.ipc_diff.toFixed(6)})</td></tr>`
      : "";
    document.getElementById("audSummaryWrap").innerHTML = `
      <div class="table-wrap"><table class="data-table"><tbody>
        <tr><td><strong>Validación ejecutada</strong></td><td class="num">${esc(VAL.validated_at)}</td></tr>
        <tr><td><strong>Períodos históricos cargados</strong></td><td class="num">${g.periodos} trimestres (${esc(PERIODOS[0]?.id || "—")} a ${esc(META.latest_periodo)})</td></tr>
        <tr><td><strong>Compañías catalogadas</strong></td><td class="num">${g.companias_en_catalogo} (sin catálogo: ${g.companias_sin_catalogo})</td></tr>
        <tr><td><strong>Descuadre máx. Activo = Pasivo + PN</strong></td><td class="num">${g.max_descuadre_bg_miles.toFixed(4)} miles de pesos</td></tr>
        <tr><td><strong>Descuadre máx. subramos Personas/Retiro (0117/0436)</strong></td><td class="num">${(g.max_descuadre_pr_subq_miles || 0).toFixed(4)} miles de pesos</td></tr>
        ${ipcBenchRow}
        <tr><td><strong>Códigos 5.01.04 sin mapear</strong></td><td class="num">${g.codigos_50104_sin_mapear}</td></tr>
      </tbody></table></div>
    `;

    const formulas = [
      ["Base Contable Comparativa (Moneda Homogénea)", "SINENSUP publica los estados contables de todo el mercado ajustados por inflación (RT 6 / Moneda Homogénea de cada cierre). Los reportes ejecutivos internos pueden incluir además láminas nominales sin AXI no comparables entre aseguradoras."],
      ["Primas Emitidas SD", "Anexo 12-A: 5.01.01.01.01.{01,02,03}.* - 4.01.04.04.04.{01,02}.* (excl. Reaseguros Activos)"],
      ["Primas Emitidas Totales", "Estado Resultados: 5.01.01.00 - 4.01.04.00 (incl. Reaseguros Activos)"],
      ["Primas Devengadas", "Emitidas - Cedidas (4.01.03 - 5.01.02) - Comp. Téc. Pérd. (4.01.05) + Comp. Téc. Créd. (5.01.04.{11,12,13,16,18,21})"],
      ["Siniestros Devengados", "4.01.01.00 - 5.01.04.{01..07,09,10,14,15,17,19,20,22}"],
      ["Gastos Prod., Expl. y Reaseg. (Anexo 14)", "Gastos Prod. = 4.01.06 ; Gastos Expl. = 4.01.07 (Sueldos, Impuestos, Publicidad, Honorarios, Retrib. Adm. y Otros) ; Gastos Netos = 4.01.06 + 4.01.07 - 5.01.03 (Gastos de Gestión a/c Reaseg.)."],
      ["Indicadores de gestión por subramo (Personas y Retiro)", "A nivel subramo SINENSUP (2.010–2.070) se consolidan flujos técnicos completos (incl. Rescates 4.01.02.01, Rentas 4.01.02.02, Transferencia a Est. Técnica y Res. Técnico) junto con los saldos operativos de Premios a Cobrar (1.03.01), Deudas c/ Asegurados (2.01.01) y Compromisos Técnicos / Reservas Matemáticas (2.02). Flujo Neto Técnico Retiro = Primas Emitidas − Rescates − Rentas; Calle Personas = Premios a Cobrar / Primas Emitidas."],
      ["Siniestralidad % / Gastos % / Combinado %", "Siniestros Dev. / Primas Dev. ; Gastos Prod. % = 4.01.06 / Primas Dev. ; Gastos Expl. % = 4.01.07 / Primas Dev. ; Gastos Tot. Neto % = (4.01.06 + 4.01.07 - 5.01.03) / Primas Dev. ; Combinado % = (Sin. + Gtos Netos) / Primas Dev. (En Retiro: G. Producción % s/ Primas Emitidas y G. Explotación % s/ Pasivo Técnico)."],
      ["Indicadores SSN (C, D y E)", "Ind. C (Grado de Dependencia) = Créditos (1.03) / Activo (1.00). Ind. D (Solvencia Líquida) = (Disp. + Inv.) / Deudas c/ Asegurados (2.01.01). Ind. E (Solvencia / Cobertura) = (Disp. + Inv. + Inmuebles 1.04) / (Deudas c/ Asegurados + Comp. Técnicos 2.02)."],
      ["Inversiones Anexo 2 y Estructura Financiera", "Inversiones (1.02) consolida En el País (1.02.01) + Exterior (1.02.02.01) por instrumento (Títulos, Acciones, ON, FCI, Fideicomisos, Plazos Fijos, Otras). Estructura Financiera desglosa Rentas (5.02.01), Realización (5.02.02), Tenencia (5.02.03), Gastos/Otros (5.02.04 - 4.02) y RECPAM (5.02.05)."],
      ["Retorno Financiero s/ Inversiones", "Resultado Estructura Financiera (incl. RECPAM) / Inversiones al cierre (Anexo 2). También se informa anualizado y Retorno sin RECPAM ((Res. Fin. - RECPAM) / Inversiones)."],
      ["Ratios Técnicos, Gastos y Financieros en Retiro", "Cuando se analiza exclusivamente el segmento Retiro, Gastos de Producción % se mide sobre Primas Emitidas, mientras que Gastos de Explotación % y Resultado Técnico % se miden sobre Deudas con Asegurados + Compromisos Técnicos (2.01.01 + 2.02, incluyendo Reservas Matemáticas y Fondos de Fluctuación); Res. Financiero % se mide sobre el Total de Inversiones (1.02). En Finanzas de Retiro, la brecha entre retorno sin RECPAM y con RECPAM puede variar entre entidades según cómo cada balance SSN exponga el RECPAM y la Transferencia a Estructura Técnica (4.02.01.07 vs 5.02.05 y 5.01.04)."],
      ["Trimestre Estanco (3m)", "Para Q1 (Sep): Acum(T). Para Q2/Q3/Q4: Acum(T) - Acum(T-1) × (IPC(T) / IPC(T-1))."],
      ["Últimos 12 Meses (LTM)", `Suma de los 4 trimestres estancos (T-3..T) reexpresados homogéneamente a moneda del cierre T (o ${lastPerLbl} si IPC).`],
      ["Consolidación VPP y Empresa Madre (RT 21)", "En el modo predeterminado Atribuible a Empresa Madre (RT 21), al consolidar un Grupo Económico se elimina el VPP intragrupo (Acc. GE en Activo/Inv./PN y % × Res. Ej. en Res. Fin.) y se deduce además la Participación de Terceros (otros accionistas) en sociedades controladas (>50%), igualando Res. Ej., PN y ROE al de la empresa madre. En Total Mercado (todo el sistema) solo se elimina VPP intragrupo; el modo Consolidado 100% conserva minoritarios y Suma simple no ajusta VPP."],
      ["Exclusión dinámica de outliers en gráficos", "Para evitar que entidades o trimestres atípicos aplasten la escala de barras, gráficos de dispersión y evolutivos, el tablero detecta dinámicamente valores extremos en función de los filtros activos (criterio robusto IQR/MAD en 3 etapas con verificación iterativa anti-enmascaramiento y ponderación de tamaño cuando aplica) y los informa al pie del gráfico. Las tablas, los promedios de mercado/segmento y las exportaciones CSV conservan siempre el 100% de los datos."],
    ];
    document.getElementById("audFormulasWrap").innerHTML = `
      <table class="data-table"><thead><tr><th>Concepto</th><th>Definición contable SSN / PCU</th></tr></thead><tbody>
      ${formulas.map(([k, v]) => `<tr><td><strong>${esc(k)}</strong></td><td style="white-space:normal">${esc(v)}</td></tr>`).join("")}
      </tbody></table>
    `;

    let benchHtml = `<table class="data-table"><thead><tr><th>Referencia</th><th>Detalle / Muestra</th><th class="num">Desvío Máx.</th><th>Estado</th></tr></thead><tbody>`;
    (VAL.pdfs_2026_3 || []).forEach((p) => {
      benchHtml += `<tr><td>PDF SSN ${esc(p.cod_cia)}</td><td>${esc(p.nombre)} (BG + ER + Anexos)</td><td class="num">${p.max_diff_miles.toFixed(3)} k</td><td><span class="badge ${p.ok ? "badge-ok" : "badge-warn"}">${p.ok ? "OK" : "FAIL"}</span></td></tr>`;
    });
    (VAL.looker_totals || []).forEach((lk) => {
      benchHtml += `<tr><td>Looker Studio</td><td>${esc(lk.segmento)} (2026-3 & 2025-3)</td><td class="num">$ ${lk.max_diff_pesos.toFixed(2)}</td><td><span class="badge ${lk.ok ? "badge-ok" : "badge-warn"}">${lk.ok ? "OK" : "FAIL"}</span></td></tr>`;
    });
    (VAL.looker_ap_ratios || []).forEach((lr) => {
      benchHtml += `<tr><td>Looker AP Ratios</td><td>${esc(lr.nombre)} (${lr.sin_pct}% / ${lr.gto_pct}%)</td><td class="num">${lr.diff_max_pp.toFixed(4)} pp</td><td><span class="badge ${lr.ok ? "badge-ok" : "badge-warn"}">${lr.ok ? "OK" : "FAIL"}</span></td></tr>`;
    });
    if (VAL.vpp_consolidation) {
      VAL.vpp_consolidation.forEach((vp) => {
        const detStr = vp.has_madre
          ? `Res: ${vp.res_ej_bruto_m.toLocaleString("es-AR")} -> 100%: ${vp.res_ej_consol_m.toLocaleString("es-AR")} -> Madre: ${vp.res_ej_madre_m.toLocaleString("es-AR")} M`
          : `Res: ${vp.res_ej_bruto_m.toLocaleString("es-AR")} -> ${vp.res_ej_consol_m.toLocaleString("es-AR")} M`;
        benchHtml += `<tr><td>Consolidación VPP</td><td>${esc(vp.grupo)} (${detStr})</td><td class="num">BG ${vp.diff_bg_miles.toFixed(3)} k</td><td><span class="badge ${vp.ok ? "badge-ok" : "badge-warn"}">${vp.ok ? "OK" : "FAIL"}</span></td></tr>`;
      });
    }
    benchHtml += "</tbody></table>";
    document.getElementById("audBenchWrap").innerHTML = benchHtml;

    let ipcHtml = `<table class="data-table"><thead><tr><th>Período</th><th>Cierre</th><th>Ejercicio</th><th class="num">Índice IPC (${esc(firstPerLbl)}=100)</th><th class="num">Factor a ${esc(lastPerLbl)}</th><th class="num">Cías muestra</th></tr></thead><tbody>`;
    PERIODOS.slice().reverse().forEach((p) => {
      ipcHtml += `<tr><td><strong>${esc(p.id)}</strong></td><td>${esc(p.fecha)}</td><td>${esc(p.ej)}</td><td class="num">${p.ipc_idx.toFixed(2)}</td><td class="num">${p.factor_latest.toFixed(6)}</td><td class="num">${p.n_cias}</td></tr>`;
    });
    ipcHtml += "</tbody></table>";
    document.getElementById("audIpcWrap").innerHTML = ipcHtml;

    // Matriz de eliminaciones VPP en período activo
    const pIdx = state.pIdx;
    const allMkt = getCompanyRowsForPeriod(pIdx, false);
    const vppAudit = computeVppEdgesForRows(allMkt, pIdx, state.base, state.moneda);
    let vppHtml = `<table class="data-table table-compact"><thead><tr>
      <th>Controlante</th><th>Controlada</th><th>Grupo</th><th class="num">%</th><th>Vigencia</th>
      <th class="num">Elim. PN/Inv. (${unitSuffix()})</th><th class="num">Ajuste Res. Ej. (${unitSuffix()})</th><th>Estado (${esc(PERIODOS[pIdx].id)})</th><th>Fuente</th>
    </tr></thead><tbody>`;
    VPP_LINKS.forEach((lk, idx) => {
      const det = vppAudit.edgeMap.get(idx);
      const vig = (lk.desde || lk.hasta) ? `${lk.desde || "Inicio"}..${lk.hasta || "Actual"}` : "Todo el período";
      const elimPnVal = det ? -det.elimPn : 0;
      const adjReVal = det ? -det.elimRe : 0;
      const stLabel = det ? det.status : (pIdx < lk.fromP || pIdx > lk.toP ? "Fuera de vigencia" : "No aplica en cierre");
      vppHtml += `<tr>
        <td><strong>${esc(lk.pCod)}</strong> ${esc(lk.pNom)}</td>
        <td><strong>${esc(lk.sCod)}</strong> ${esc(lk.sNom)}</td>
        <td>${esc(lk.grupo)}</td>
        <td class="num">${(lk.pct * 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%</td>
        <td>${esc(vig)}</td>
        <td class="num">${det ? fmtNumMiles(elimPnVal) : "—"}</td>
        <td class="num"><span class="${det ? pctClass(adjReVal) : "neu"}">${det ? fmtNumMiles(adjReVal) : "—"}</span></td>
        <td><span class="badge ${det ? "badge-ok" : "badge-type"}">${esc(stLabel)}</span></td>
        <td style="white-space:normal;max-width:260px">${esc(lk.fuente)}</td>
      </tr>`;
    });
    const modeNote = state.consol === "madre"
      ? "Atribuible a Empresa Madre activo en grupos · Neto VPP en Total Mercado"
      : (state.consol === "vpp" ? "Consolidado 100% (neto VPP) activo" : "Modo Suma simple activo (sin ajustes)");
    vppHtml += `</tbody><tfoot><tr>
      <td colspan="5"><strong>TOTAL ELIMINACIÓN MERCADO (${esc(PERIODOS[pIdx].label)})</strong> · ${esc(modeNote)}</td>
      <td class="num">${fmtNumMiles(-vppAudit.totElimPn)}</td>
      <td class="num"><span class="${pctClass(-vppAudit.totElimRe)}">${fmtNumMiles(-vppAudit.totElimRe)}</span></td>
      <td colspan="2"></td>
    </tr></tfoot></table>`;

    const grpCtrlNames = Array.from(new Set(VPP_LINKS.filter((l) => !l.grupo.startsWith("Intergrupo")).map((l) => l.grupo)));
    let madreRowsHtml = "";
    grpCtrlNames.forEach((gName) => {
      const gRows = allMkt.filter((r) => r.grupo === gName);
      if (gRows.length <= 1) return;
      const vppG = computeVppEdgesForRows(gRows, pIdx, state.base, state.moneda);
      if (!vppG.nciDetails || vppG.nciDetails.length === 0) return;
      const sumRe = gRows.reduce((s, r) => s + r.res_ej, 0);
      const sumPn = gRows.reduce((s, r) => s + r.pn, 0);
      const resMadre = sumRe - vppG.totElimRe - vppG.totNciRe;
      const pnMadre = sumPn - vppG.totElimPn - vppG.totNciPn;
      madreRowsHtml += `<tr>
        <td><strong>${esc(gName)}</strong></td>
        <td class="num"><span class="${pctClass(sumRe)}">${fmtNumMiles(sumRe)}</span></td>
        <td class="num"><span class="${pctClass(-vppG.totElimRe)}">${fmtNumMiles(-vppG.totElimRe)}</span></td>
        <td class="num"><span class="${pctClass(-vppG.totNciRe)}">${fmtNumMiles(-vppG.totNciRe)}</span></td>
        <td class="num"><strong><span class="${pctClass(resMadre)}">${fmtNumMiles(resMadre)}</span></strong></td>
        <td class="num">${fmtNumMiles(vppG.totNciPn)}</td>
        <td class="num"><strong>${fmtNumMiles(pnMadre)}</strong></td>
      </tr>`;
    });
    if (madreRowsHtml) {
      vppHtml += `<div style="margin-top:16px">
        <h4 style="margin:0 0 8px 0;font-size:12px;font-weight:700;color:var(--ink)">Resumen por Grupo con Aseguradora Controlante (Atribuible a Empresa Madre — ${esc(PERIODOS[pIdx].label)})</h4>
        <table class="data-table table-compact"><thead><tr>
          <th>Grupo Económico</th>
          <th class="num">Suma Simple RE (${unitSuffix()})</th>
          <th class="num">Elim. VPP RE (${unitSuffix()})</th>
          <th class="num">Part. Terceros RE (${unitSuffix()})</th>
          <th class="num">Res. Ej. Madre (${unitSuffix()})</th>
          <th class="num">PN Terceros (${unitSuffix()})</th>
          <th class="num">PN Madre (${unitSuffix()})</th>
        </tr></thead><tbody>${madreRowsHtml}</tbody></table>
      </div>`;
    }
    document.getElementById("audVppWrap").innerHTML = vppHtml;

    const extrasWrap = document.getElementById("audExtrasWrap");
    if (extrasWrap) {
      const extRows = [
        {
          title: "SINENSUP Contable (Estados Patrimoniales y Resultados)",
          frequency: "Trimestral",
          latest_label: `${PERIODOS[nP - 1].label} (${PERIODOS[nP - 1].id})`,
          count: `${COMPANIAS.length} cías · ${PERIODOS.length} trim.`,
          file_name: "warehouse.sqlite",
          ok: true,
        },
        ...(SSN_EXTRAS.sources_status || []).map((s) => ({
          title: s.title || s.id,
          frequency: s.frequency || "—",
          latest_label: s.latest_label || "—",
          count: s.count != null ? String(s.count) : "—",
          file_name: s.file_name || "—",
          ok: Boolean(s.ok),
          error: s.error,
        })),
      ];
      extrasWrap.innerHTML = `
        <table class="data-table table-compact"><thead><tr>
          <th>Fuente Oficial SSN</th><th>Frecuencia</th><th>Último Período Cargado</th>
          <th class="num">Registros / Serie</th><th>Origen / Archivo</th><th>Estado</th>
        </tr></thead><tbody>
        ${extRows.map((r) => `<tr>
          <td><strong>${esc(r.title)}</strong></td>
          <td>${esc(r.frequency)}</td>
          <td>${esc(r.latest_label)}</td>
          <td class="num">${esc(r.count)}</td>
          <td style="font-family:var(--mono);font-size:11px">${esc(r.file_name)}</td>
          <td><span class="badge ${r.ok ? "badge-ok" : "badge-warn"}">${r.ok ? "OK" : esc(r.error || "Pendiente")}</span></td>
        </tr>`).join("")}
        </tbody></table>
      `;
    }
  }

  // ==================== TAB 10: PULSO MENSUAL SSN ====================
  function renderPulsoMensual() {
    const pm = SSN_EXTRAS.prod_mensual || {};
    const series = pm.series || [];
    const uMode = state.menUnitMode || "const";
    const horiz = state.menHoriz || "24";
    const isConst = uMode === "const";

    // Frescura de todas las fuentes oficiales (6 pills)
    const freshEl = document.getElementById("ssnFreshStrip");
    if (freshEl) {
      const pillLabelMap = {
        prod_mensual: "Prod. Mensual",
        tasa_testigo_rv: "Tasa Testigo Vol.",
        retiro_est: "Est. Retiro",
        polizas_sin_prim: "Pólizas y Sin.",
        canales_venta: "Canales Venta",
      };
      const pills = [
        { short: "SINENSUP", latest: `${PERIODOS[nP - 1].label} (${PERIODOS[nP - 1].id})`, ok: true },
        ...(SSN_EXTRAS.sources_status || []).map((s) => ({
          short: pillLabelMap[s.id] || s.id,
          latest: s.latest_label || "—",
          ok: Boolean(s.ok),
        })),
      ];
      freshEl.innerHTML = pills.map((p) =>
        `<span class="src-fresh-pill"><span class="src-fresh-dot ${p.ok ? "ok" : "warn"}"></span><strong>${esc(p.short)}:</strong> ${esc(p.latest)}</span>`
      ).join("");
    }

    document.querySelectorAll("#menUnitModeTabs .seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.menmode === uMode);
    });
    const horizEl = document.getElementById("menHoriz");
    if (horizEl) {
      if (series.length > 0) {
        const optAll = horizEl.querySelector('option[value="all"]');
        if (optAll) optAll.textContent = `Serie completa (${series[0].y}–${series[series.length - 1].y})`;
      }
      if (horizEl.value !== horiz) horizEl.value = horiz;
    }

    const unitDesc = isConst
      ? `Valores Constantes IPC (base ${pm.const_base_label || pm.latest_label || "Sep 2026"})`
      : "Valores Corrientes (Nominales)";
    document.getElementById("liveCountPill").textContent =
      `Pulso Mensual SSN · ${pm.latest_label || "—"} (${isConst ? "Constantes" : "Corrientes"})`;
    document.getElementById("menContextSub").textContent =
      `${pm.latest_label || "—"} · ${unitDesc} · Publicación oficial mensual SSN (${pm.file_name || "Excel SSN"})`;

    if (series.length === 0) {
      document.getElementById("menKpis").innerHTML = "";
      document.getElementById("menTableWrap").innerHTML = '<p class="text-muted">Sin datos de Producción Mensual SSN cargados.</p>';
      return;
    }

    const fmtMill = (v, dec = 0) => (typeof v === "number" && Number.isFinite(v))
      ? "$ " + v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + " M"
      : "—";
    const pctDelta = (cur, prev) => (typeof cur === "number" && typeof prev === "number" && prev > 0)
      ? ((cur / prev) - 1) * 100
      : null;

    // Calcular variaciones MoM y YoY sobre toda la serie ANTES de recortar el horizonte
    const enriched = series.map((pt, idx) => {
      const v = pt[uMode] || {};
      const p1 = idx >= 1 ? (series[idx - 1][uMode] || {}) : null;
      const p12 = idx >= 12 ? (series[idx - 12][uMode] || {}) : null;
      const p12Raw = idx >= 12 ? series[idx - 12] : null;
      const p1Raw = idx >= 1 ? series[idx - 1] : null;
      return {
        ym: pt.ym,
        y: pt.y,
        m: pt.m,
        label: pt.label,
        ipc_idx: pt.ipc_idx,
        v,
        sh_pers_ret: v.tot > 0 ? (v.pers_tot / v.tot) * 100 : null,
        sh_pers_vo: v.tot > 0 ? (v.pers_vida_otr / v.tot) * 100 : null,
        sh_ret: v.tot > 0 ? (v.retiro / v.tot) * 100 : null,
        mom_tot: p1 ? pctDelta(v.tot, p1.tot) : null,
        mom_pers_vo: p1 ? pctDelta(v.pers_vida_otr, p1.pers_vida_otr) : null,
        mom_ret: p1 ? pctDelta(v.retiro, p1.retiro) : null,
        yoy_tot: p12 ? pctDelta(v.tot, p12.tot) : null,
        yoy_pat: p12 ? pctDelta(v.pat, p12.pat) : null,
        yoy_pers_vo: p12 ? pctDelta(v.pers_vida_otr, p12.pers_vida_otr) : null,
        yoy_ret: p12 ? pctDelta(v.retiro, p12.retiro) : null,
        yoy_vida_ind: p12 ? pctDelta(v.vida_ind, p12.vida_ind) : null,
        yoy_vida_col: p12 ? pctDelta(v.vida_col, p12.vida_col) : null,
        mom_ipc: p1Raw ? pctDelta(pt.ipc_idx, p1Raw.ipc_idx) : null,
        yoy_ipc: p12Raw ? pctDelta(pt.ipc_idx, p12Raw.ipc_idx) : null,
      };
    });

    const last = enriched[enriched.length - 1];
    renderSimpleKpiGrid("menKpis", [
      {
        label: `Producción Total Mercado (${last.label})`,
        accent: "accent-ink",
        value: fmtMill(last.v.tot),
        sub: `MoM: <span class="${pctClass(last.mom_tot)}">${fmtSignedPct(last.mom_tot)}</span> · YoY: <span class="${pctClass(last.yoy_tot)}">${fmtSignedPct(last.yoy_tot)}</span>`,
      },
      {
        label: `Personas — Vida y Otros (${last.label})`,
        accent: "accent-red",
        value: fmtMill(last.v.pers_vida_otr),
        sub: `Vida Col. ${fmtMill(last.v.vida_col)} · Vida Ind. ${fmtMill(last.v.vida_ind)} · YoY <span class="${pctClass(last.yoy_pers_vo)}">${fmtSignedPct(last.yoy_pers_vo)}</span>`,
      },
      {
        label: `Seguros de Retiro (${last.label})`,
        accent: "accent-blue",
        value: fmtMill(last.v.retiro),
        sub: `MoM: <span class="${pctClass(last.mom_ret)}">${fmtSignedPct(last.mom_ret)}</span> · YoY: <span class="${pctClass(last.yoy_ret)}">${fmtSignedPct(last.yoy_ret)}</span>`,
      },
      {
        label: `Participación Personas + Retiro (${last.label})`,
        accent: "accent-green",
        value: fmtPct(last.sh_pers_ret, 2),
        sub: `Pers.+Ret.: ${fmtMill(last.v.pers_tot)} vs. Patrimoniales ${fmtMill(last.v.pat)}`,
      },
    ]);

    let sliced = enriched;
    if (horiz === "2020") sliced = enriched.filter((x) => x.y >= 2020);
    else if (horiz === "24") sliced = enriched.slice(-24);
    else if (horiz === "36") sliced = enriched.slice(-36);

    const spanStr = `${sliced[0]?.label || ""} a ${sliced[sliced.length - 1]?.label || ""} (${unitDesc})`;

    // Chart 1: Personas y Retiro detallado (stacked bar en Millones $)
    document.getElementById("menPersTitle").textContent =
      `Producción Mensual — Seguros de Personas y Retiro (Millones de $)`;
    document.getElementById("menPersSub").textContent = spanStr;
    destroyChart("chMenPersDetalle");
    charts.chMenPersDetalle = new Chart(document.getElementById("chMenPersDetalle"), {
      type: "bar",
      data: {
        labels: sliced.map((x) => x.label),
        datasets: [
          { label: "Vida Colectivo", data: sliced.map((x) => x.v.vida_col), backgroundColor: BRAND.red, stack: "p" },
          { label: "Vida Individual", data: sliced.map((x) => x.v.vida_ind), backgroundColor: BRAND.blue, stack: "p" },
          { label: "Resto Personas (AP/Salud/Sep.)", data: sliced.map((x) => x.v.resto_pers), backgroundColor: BRAND.green, stack: "p" },
          { label: "Seguros de Retiro", data: sliced.map((x) => x.v.retiro), backgroundColor: BRAND.orange, stack: "p" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${fmtMill(ctx.parsed.y, 1)}`,
              footer: (items) => {
                const idx = items[0]?.dataIndex;
                const pt = sliced[idx];
                return pt ? `Total Pers.+Retiro: ${fmtMill(pt.v.pers_tot, 1)} (${fmtPct(pt.sh_pers_ret, 2)} mkt)` : "";
              },
            },
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, ticks: { callback: (v) => "$ " + Math.round(v).toLocaleString("es-AR") + " M" }, grid: { color: "#f0f0f4" } },
        },
      },
    });

    // Chart 2: YoY Mensual (%)
    document.getElementById("menYoyTitle").textContent =
      `Crecimiento Interanual Mensual (YoY % · ${isConst ? "Real" : "Nominal"})`;
    document.getElementById("menYoySub").textContent =
      `${sliced[0]?.label || ""} a ${sliced[sliced.length - 1]?.label || ""} · Personas, Retiro, Patrimoniales y Total`;
    destroyChart("chMenYoY");
    charts.chMenYoY = new Chart(document.getElementById("chMenYoY"), {
      type: "line",
      data: {
        labels: sliced.map((x) => x.label),
        datasets: [
          { label: "Personas (Vida y Otros)", data: sliced.map((x) => x.yoy_pers_vo), borderColor: BRAND.red, backgroundColor: BRAND.red, borderWidth: 2.6, tension: 0.25, pointRadius: sliced.length > 48 ? 0 : 2 },
          { label: "Seguros de Retiro", data: sliced.map((x) => x.yoy_ret), borderColor: BRAND.blue, backgroundColor: BRAND.blue, borderWidth: 2.2, tension: 0.25, pointRadius: sliced.length > 48 ? 0 : 2 },
          { label: "Patrimoniales", data: sliced.map((x) => x.yoy_pat), borderColor: "rgba(102,102,97,0.8)", backgroundColor: BRAND.muted, borderWidth: 1.7, borderDash: [4, 3], tension: 0.25, pointRadius: 0 },
          { label: "Total Mercado", data: sliced.map((x) => x.yoy_tot), borderColor: BRAND.ink, backgroundColor: BRAND.ink, borderWidth: 2.2, tension: 0.25, pointRadius: 0 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { tooltip: { callbacks: { label: (ctx) => chartPctTooltipLabel(ctx, 1) } } },
        scales: { y: { ticks: { callback: chartPctTick }, grid: { color: "#f0f0f4" } } },
      },
    });

    // Chart 3: Total Mercado Patrimoniales vs Personas+Retiro + Share %
    document.getElementById("menMktTitle").textContent =
      `Producción Mensual Total del Mercado: Patrimoniales vs. Personas y Retiro`;
    document.getElementById("menMktSub").textContent =
      `${spanStr} · Eje izq.: Millones de $ · Eje der.: Participación % Personas + Retiro`;
    destroyChart("chMenMercado");
    charts.chMenMercado = new Chart(document.getElementById("chMenMercado"), {
      type: "bar",
      data: {
        labels: sliced.map((x) => x.label),
        datasets: [
          { label: "Personas + Retiro (M $)", data: sliced.map((x) => x.v.pers_tot), backgroundColor: BRAND.red, stack: "mkt", yAxisID: "y", order: 2 },
          { label: "Patrimoniales y ART (M $)", data: sliced.map((x) => x.v.pat), backgroundColor: "rgba(48,48,45,0.28)", stack: "mkt", yAxisID: "y", order: 3 },
          { type: "line", label: "Share Personas + Retiro %", data: sliced.map((x) => x.sh_pers_ret), borderColor: BRAND.blue, backgroundColor: BRAND.blue, borderWidth: 2.4, tension: 0.25, yAxisID: "y1", order: 1, pointRadius: sliced.length > 48 ? 0 : 2 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.yAxisID === "y1"
                ? chartPctTooltipLabel(ctx, 2)
                : ` ${ctx.dataset.label}: ${fmtMill(ctx.parsed.y, 1)}`,
            },
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, position: "left", title: { display: true, text: "Producción Total (M $)" }, ticks: { callback: (v) => "$ " + Math.round(v).toLocaleString("es-AR") + " M" }, grid: { color: "#f0f0f4" } },
          y1: { position: "right", title: { display: true, text: "Share Personas + Retiro %" }, ticks: { callback: chartPctTick }, grid: { drawOnChartArea: false } },
        },
      },
    });

    // Tabla cronológica descendente
    const revRows = sliced.slice().reverse();
    document.getElementById("menTableSub").textContent =
      `Mostrando ${revRows.length} meses (${revRows[revRows.length - 1]?.label || ""} a ${revRows[0]?.label || ""}) · ${unitDesc} · Millones de $`;
    document.getElementById("menTableWrap").innerHTML = `
      <table class="data-table table-compact">
        <thead><tr>
          <th>Mes</th>
          <th class="num">Total Mkt (M)</th>
          <th class="num">Patrimoniales (M)</th>
          <th class="num">Pers. Vida y Otr. (M)</th>
          <th class="num">Vida Ind. (M)</th>
          <th class="num">Vida Col. (M)</th>
          <th class="num">Resto Pers. (M)</th>
          <th class="num">Retiro (M)</th>
          <th class="num">Sh. Pers.+Ret.%</th>
          <th class="num">YoY Total %</th>
          <th class="num">YoY Pers. %</th>
          <th class="num">YoY Ret. %</th>
        </tr></thead>
        <tbody>
          ${revRows.map((r) => `<tr>
            <td><strong>${esc(r.label)}</strong></td>
            <td class="num">${fmtMill(r.v.tot, 1)}</td>
            <td class="num">${fmtMill(r.v.pat, 1)}</td>
            <td class="num"><strong>${fmtMill(r.v.pers_vida_otr, 1)}</strong></td>
            <td class="num">${fmtMill(r.v.vida_ind, 1)}</td>
            <td class="num">${fmtMill(r.v.vida_col, 1)}</td>
            <td class="num">${fmtMill(r.v.resto_pers, 1)}</td>
            <td class="num"><strong>${fmtMill(r.v.retiro, 1)}</strong></td>
            <td class="num">${fmtPct(r.sh_pers_ret, 2)}</td>
            <td class="num"><span class="${pctClass(r.yoy_tot)}">${fmtSignedPct(r.yoy_tot)}</span></td>
            <td class="num"><span class="${pctClass(r.yoy_pers_vo)}">${fmtSignedPct(r.yoy_pers_vo)}</span></td>
            <td class="num"><span class="${pctClass(r.yoy_ret)}">${fmtSignedPct(r.yoy_ret)}</span></td>
          </tr>`).join("")}
        </tbody>
      </table>
    `;

    document.getElementById("btnExportMen").onclick = () => {
      exportToCSV(
        `ssn_produccion_mensual_${uMode}_${pm.latest_ym || "ssn"}.csv`,
        ["YM", "Mes", "Modo", "Total Mkt (M)", "Patrimoniales (M)", "Pers. Vida y Otr (M)", "Vida Ind (M)", "Vida Col (M)", "Resto Pers (M)", "Retiro (M)", "Pers+Ret (M)", "Share Pers+Ret %", "YoY Total %", "YoY Personas %", "YoY Retiro %", "IPC Index"],
        enriched.map((r) => [
          r.ym, r.label, uMode,
          (r.v.tot ?? 0).toFixed(2), (r.v.pat ?? 0).toFixed(2), (r.v.pers_vida_otr ?? 0).toFixed(2),
          (r.v.vida_ind ?? 0).toFixed(2), (r.v.vida_col ?? 0).toFixed(2), (r.v.resto_pers ?? 0).toFixed(2),
          (r.v.retiro ?? 0).toFixed(2), (r.v.pers_tot ?? 0).toFixed(2),
          r.sh_pers_ret != null ? r.sh_pers_ret.toFixed(2) : "",
          r.yoy_tot != null ? r.yoy_tot.toFixed(2) : "",
          r.yoy_pers_vo != null ? r.yoy_pers_vo.toFixed(2) : "",
          r.yoy_ret != null ? r.yoy_ret.toFixed(2) : "",
          r.ipc_idx != null ? r.ipc_idx.toFixed(4) : "",
        ])
      );
    };
  }

  // ==================== TAB 9: BALANCE CONTABLE (ESTADO PATRIMONIAL Y RESULTADOS) ====================
  let balDecoded = null;

  function shortenPlanCode(cod) {
    const parts = cod.split(".");
    let end = parts.length - 1;
    while (end > 0 && parts[end] === "00") end--;
    return parts.slice(0, end + 1).join(".");
  }

  function ensureBalancesTreeDecoded() {
    if (balDecoded) return balDecoded;
    const raw = window.__SSN_BALANCES_TREE__;
    if (!raw || !Array.isArray(raw.accounts) || !raw.b64) {
      balDecoded = { nodes: [], byCode: new Map(), capIds: new Map(), nLeaves: 0, flowStart: 0, nFlow: 0, store: new Map() };
      return balDecoded;
    }

    const nodes = raw.accounts.map((a, i) => {
      const cod = a[0];
      const desc = a[1];
      const nivel = a[2];
      const parentIdx = a[3];
      const leafIdx = a[4];
      const shortCod = shortenPlanCode(cod);
      return {
        id: i,
        cod,
        shortCod,
        desc,
        normDesc: normSearch(desc),
        normText: normSearch(`${cod} ${shortCod} ${desc}`),
        nivel,
        parentIdx,
        leafIdx,
        cap: cod[0],
        children: [],
      };
    });

    const byCode = new Map();
    const capIds = new Map();
    let flowStart = raw.n_leaves;
    nodes.forEach((n) => {
      byCode.set(n.cod, n);
      if (n.nivel === 1) capIds.set(n.cap, n.id);
      if (n.parentIdx >= 0) nodes[n.parentIdx].children.push(n.id);
      if (n.leafIdx >= 0 && (n.cap === "4" || n.cap === "5") && n.leafIdx < flowStart) {
        flowStart = n.leafIdx;
      }
    });

    const binStr = atob(raw.b64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    let pos = 0;
    function readVarint() {
      let res = 0;
      let mult = 1;
      while (pos < bytes.length) {
        const b = bytes[pos++];
        res += (b & 0x7f) * mult;
        if (b < 0x80) return res;
        mult *= 128;
      }
      return res;
    }
    function unzigzag(zz) {
      return zz % 2 === 0 ? zz / 2 : -((zz + 1) / 2);
    }

    const store = new Map();
    const nGroups = readVarint();
    const scale = Number(raw.scale_miles) || 0.1;
    for (let g = 0; g < nGroups; g++) {
      const pi = readVarint();
      const ci = readVarint();
      const nEnt = readVarint();
      const idxArr = new Uint16Array(nEnt);
      const valArr = new Float64Array(nEnt);
      let curLeaf = 0;
      for (let e = 0; e < nEnt; e++) {
        const dl = readVarint();
        const zz = readVarint();
        curLeaf += dl;
        idxArr[e] = curLeaf;
        valArr[e] = unzigzag(zz) * scale;
      }
      store.set(`${pi}|${ci}`, { idx: idxArr, val: valArr });
    }

    balDecoded = {
      nodes,
      byCode,
      capIds,
      nLeaves: raw.n_leaves,
      flowStart,
      nFlow: Math.max(0, raw.n_leaves - flowStart),
      store,
    };
    return balDecoded;
  }

  const balEntityCombo = createSearchableCombobox({
    wrapEl: document.getElementById("balEntityCombo"),
    inputEl: document.getElementById("balEntityInput"),
    toggleEl: document.getElementById("balEntityToggle"),
    menuEl: document.getElementById("balEntityMenu"),
    clearOnSelect: false,
    placeholder: "Buscar compañía, grupo o mercado...",
    onSelect: (item) => {
      state.balEntity = item.value;
      renderBalanceContable();
    },
  });

  function openBalanceEntity(entityKey) {
    if (entityKey) state.balEntity = entityKey;
    switchTab("balance");
  }

  function syncBalanceEntitySelector(pIdx) {
    const allRows = getCompanyRowsForPeriod(pIdx, false, { ignoreGranRamo: true });
    const rowByCod = new Map(allRows.map((r) => [r.cod, r]));
    const allowedKeys = new Set(["MKT:ALL"]);
    const items = [];

    // Accesos Grupo La Segunda + Mercado
    ["0317", "0618", "0117", "0436"].forEach((cod) => {
      const r = rowByCod.get(cod);
      if (r) {
        const key = "CIA:" + cod;
        allowedKeys.add(key);
        items.push({
          value: key,
          label: `${cod} — ${r.nombre}`,
          sub: "La Segunda",
          group: "Grupo La Segunda y Mercado",
          searchText: normSearch(`${cod} ${r.nombre} ${r.razon} la segunda`),
        });
      }
    });
    const lsGrpRows = allRows.filter((r) => r.grupo === "Grupo La Segunda");
    if (lsGrpRows.length > 0) {
      allowedKeys.add("GRP:Grupo La Segunda");
      items.push({
        value: "GRP:Grupo La Segunda",
        label: `Grupo La Segunda (Suma simple · ${lsGrpRows.length} cías)`,
        sub: "Grupo L2",
        group: "Grupo La Segunda y Mercado",
        searchText: normSearch("grupo la segunda suma simple consolidado"),
      });
    }
    items.push({
      value: "MKT:ALL",
      label: `Total Mercado Asegurador (${allRows.length} cías)`,
      sub: "Mercado",
      group: "Grupo La Segunda y Mercado",
      searchText: normSearch("total mercado asegurador todas suma simple"),
    });

    const grpMap = new Map();
    allRows.forEach((r) => {
      if (r.grupo && r.grupo !== "Independientes") {
        grpMap.set(r.grupo, (grpMap.get(r.grupo) || 0) + 1);
      }
    });
    Array.from(grpMap.keys()).sort(esAlphaCmp).forEach((g) => {
      const key = "GRP:" + g;
      if (g === "Grupo La Segunda") return;
      allowedKeys.add(key);
      items.push({
        value: key,
        label: `${g} (Suma simple · ${grpMap.get(g)} cías)`,
        sub: "Grupo",
        group: "Grupos Económicos",
        searchText: normSearch(`${g} grupo economico suma simple`),
      });
    });

    allRows.slice().sort((a, b) => esAlphaCmp(a.nombre, b.nombre)).forEach((r) => {
      const key = "CIA:" + r.cod;
      allowedKeys.add(key);
      items.push({
        value: key,
        label: `${r.cod} — ${r.nombre}`,
        sub: r.tipo.split(" ")[0],
        group: "Todas las Compañías",
        searchText: normSearch(`${r.cod} ${r.nombre} ${r.razon} ${r.grupo} ${r.tipo}`),
      });
    });

    if (!allowedKeys.has(state.balEntity)) {
      state.balEntity = allowedKeys.has("CIA:0317") ? "CIA:0317" : (items[0] ? items[0].value : "MKT:ALL");
    }
    balEntityCombo.setOptions(items, state.balEntity, items.length === 0, "Sin entidades en el período");
  }

  function computeBalanceTreeData(entityKey, pIdx) {
    const dec = ensureBalancesTreeDecoded();
    const nNodes = dec.nodes.length;
    const { base, meses } = resolveBaseAndMeses(pIdx, state.base);

    function resolveEntityAt(qIdx) {
      const rows = getCompanyRowsForPeriod(qIdx, false, { ignoreGranRamo: true });
      if (entityKey === "MKT:ALL") {
        return {
          cIdxs: rows.map((r) => r.cIdx),
          rows,
          label: `Total Mercado Asegurador (${rows.length} cías)`,
          isAgg: true,
          count: rows.length,
        };
      }
      if (entityKey.startsWith("GRP:")) {
        const gName = entityKey.slice(4);
        const grpRows = rows.filter((r) => r.grupo === gName);
        return {
          cIdxs: grpRows.map((r) => r.cIdx),
          rows: grpRows,
          label: `${gName} (Suma simple · ${grpRows.length} cías)`,
          isAgg: true,
          count: grpRows.length,
        };
      }
      const cod = entityKey.slice(4);
      const r = rows.find((x) => x.cod === cod);
      const mc = ciaByCod.get(cod);
      return {
        cIdxs: r ? [r.cIdx] : (mc ? [mc.idx] : []),
        rows: r ? [r] : [],
        label: `${cod} — ${mc ? mc.nombre : cod}`,
        isAgg: false,
        count: r ? 1 : 0,
      };
    }

    const curEnt = resolveEntityAt(pIdx);
    const curVals = new Float64Array(nNodes);
    const prevVals = new Float64Array(nNodes);

    // 1. Stock (Capítulos 1, 2, 3)
    const fStockCur = state.moneda === "const" ? PERIODOS[pIdx].factor_latest : 1.0;
    const addStockLeavesAt = (qIdx, targetArr, mult) => {
      const ent = qIdx === pIdx ? curEnt : resolveEntityAt(qIdx);
      ent.cIdxs.forEach((ci) => {
        const pack = dec.store.get(`${qIdx}|${ci}`);
        if (!pack) return;
        const { idx, val } = pack;
        for (let k = 0; k < idx.length; k++) {
          const lIdx = idx[k];
          if (lIdx >= dec.flowStart) break;
          targetArr[lIdx] += val[k] * mult;
        }
      });
    };

    const stockCurLeaf = new Float64Array(dec.flowStart);
    addStockLeavesAt(pIdx, stockCurLeaf, fStockCur);
    const hasStockYoY = pIdx >= 4;
    const stockPrevLeaf = new Float64Array(dec.flowStart);
    if (hasStockYoY) {
      const fStockPrev = state.moneda === "const" ? PERIODOS[pIdx - 4].factor_latest : 1.0;
      addStockLeavesAt(pIdx - 4, stockPrevLeaf, fStockPrev);
    }

    // 2. Flujo (Capítulos 4, 5) via computeFlowVector
    const flowCache = new Map();
    const getFlowLeafVec = (qIdx) => {
      if (flowCache.has(qIdx)) return flowCache.get(qIdx);
      const ent = qIdx === pIdx ? curEnt : resolveEntityAt(qIdx);
      const arr = new Array(dec.nFlow).fill(0);
      let any = false;
      ent.cIdxs.forEach((ci) => {
        const pack = dec.store.get(`${qIdx}|${ci}`);
        if (!pack) return;
        const { idx, val } = pack;
        for (let k = 0; k < idx.length; k++) {
          const lIdx = idx[k];
          if (lIdx < dec.flowStart) continue;
          arr[lIdx - dec.flowStart] += val[k];
          any = true;
        }
      });
      const out = any ? arr : null;
      flowCache.set(qIdx, out);
      return out;
    };

    const flowCurVec = dec.nFlow > 0 ? computeFlowVector(pIdx, base, state.moneda, getFlowLeafVec, dec.nFlow) : [];
    const hasFlowYoY = dec.nFlow > 0 && canCompareYoY(pIdx, state.base);
    const flowPrevVec = hasFlowYoY ? computeFlowVector(pIdx - 4, base, state.moneda, getFlowLeafVec, dec.nFlow) : null;

    // Cargar hojas y acumular bottom-up a los 1.122 nodos
    for (let i = 0; i < nNodes; i++) {
      const lIdx = dec.nodes[i].leafIdx;
      if (lIdx < 0) continue;
      if (lIdx < dec.flowStart) {
        curVals[i] = stockCurLeaf[lIdx];
        if (hasStockYoY) prevVals[i] = stockPrevLeaf[lIdx];
      } else {
        const fi = lIdx - dec.flowStart;
        curVals[i] = flowCurVec ? (flowCurVec[fi] || 0) : 0;
        if (hasFlowYoY && flowPrevVec) prevVals[i] = flowPrevVec[fi] || 0;
      }
    }
    for (let i = nNodes - 1; i >= 0; i--) {
      const p = dec.nodes[i].parentIdx;
      if (p >= 0) {
        curVals[p] += curVals[i];
        prevVals[p] += prevVals[i];
      }
    }

    const valByCod = (cod) => {
      const nd = dec.byCode.get(cod);
      return nd ? curVals[nd.id] : 0;
    };
    const prevByCod = (cod) => {
      const nd = dec.byCode.get(cod);
      return nd ? prevVals[nd.id] : 0;
    };

    const activo = valByCod("1.00.00.00.00.00.00.00");
    const pasivo = valByCod("2.00.00.00.00.00.00.00");
    const pn = valByCod("3.00.00.00.00.00.00.00");
    const pasivoPrev = prevByCod("2.00.00.00.00.00.00.00");
    const activoPrev = prevByCod("1.00.00.00.00.00.00.00");
    const pnPrev = prevByCod("3.00.00.00.00.00.00.00");

    const per4 = valByCod("4.00.00.00.00.00.00.00");
    const gan5 = valByCod("5.00.00.00.00.00.00.00");
    const resTec = valByCod("5.01.00.00.00.00.00.00") - valByCod("4.01.00.00.00.00.00.00");
    const resFin = valByCod("5.02.00.00.00.00.00.00") - valByCod("4.02.00.00.00.00.00.00");
    const resEj = gan5 - per4;
    const resTecPrev = prevByCod("5.01.00.00.00.00.00.00") - prevByCod("4.01.00.00.00.00.00.00");
    const resEjPrev = prevByCod("5.00.00.00.00.00.00.00") - prevByCod("4.00.00.00.00.00.00.00");

    const primDevBase = curEnt.rows.reduce((s, r) => s + (r.prim_dev || 0), 0);

    return {
      dec,
      pIdx,
      meses,
      entityLabel: curEnt.label,
      isAgg: curEnt.isAgg,
      entityCount: curEnt.count,
      curVals,
      prevVals,
      hasStockYoY,
      hasFlowYoY,
      activo,
      pasivo,
      pn,
      activoPrev,
      pasivoPrev,
      pnPrev,
      per4,
      gan5,
      resTec,
      resFin,
      resEj,
      resTecPrev,
      resEjPrev,
      primDevBase,
    };
  }

  function unwrapAccountChain(dec, nodeId, strict) {
    let cur = dec.nodes[nodeId];
    const wrapped = [cur];
    if (!strict) {
      while (cur.children.length === 1 && dec.nodes[cur.children[0]].normDesc === cur.normDesc) {
        cur = dec.nodes[cur.children[0]];
        wrapped.push(cur);
      }
    }
    return {
      head: wrapped[0],
      tail: cur,
      wrapped,
      childIds: cur.children,
    };
  }

  function balCalcYoY(cur, prev, hasYoY) {
    if (!hasYoY || cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev)) return null;
    if (prev <= 10) return null; // evita porcentajes extremos cuando base <= $ 0,01 M o negativa
    return ((cur / prev) - 1) * 100;
  }

  function highlightBalMatch(text, queryRaw) {
    if (!queryRaw) return esc(text);
    const terms = queryRaw.trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return esc(text);
    const normSrc = normSearch(text);
    // Encontrar rangos aproximados en texto normalizado (longitud 1:1 en español salvo NFD)
    const cleanText = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const lower = cleanText.toLowerCase();
    const ranges = [];
    terms.forEach((t) => {
      const nt = normSearch(t);
      if (!nt) return;
      let start = 0;
      while (true) {
        const idx = lower.indexOf(nt, start);
        if (idx < 0) break;
        ranges.push([idx, idx + nt.length]);
        start = idx + nt.length;
      }
    });
    if (!ranges.length || cleanText.length !== text.length) return esc(text);
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach((r) => {
      if (!merged.length || r[0] > merged[merged.length - 1][1]) merged.push(r.slice());
      else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
    });
    let out = "";
    let pos = 0;
    merged.forEach(([s, e]) => {
      if (s > pos) out += esc(text.slice(pos, s));
      out += `<mark class="bal-hl">${esc(text.slice(s, e))}</mark>`;
      pos = e;
    });
    if (pos < text.length) out += esc(text.slice(pos));
    return out;
  }

  function renderBalanceContable() {
    const pIdx = state.pIdx;
    const dec = ensureBalancesTreeDecoded();
    syncBalanceEntitySelector(pIdx);

    const data = computeBalanceTreeData(state.balEntity, pIdx);
    const strict = Boolean(state.balStrictLevels);
    const hideZero = Boolean(state.balHideZero);
    const queryRaw = (state.balSearch || "").trim();
    const queryNorm = normSearch(queryRaw);

    if (!state.balDefaultInit) {
      state.balDefaultInit = true;
      [
        "ACC:1.00.00.00.00.00.00.00",
        "ACC:2.00.00.00.00.00.00.00",
        "ACC:3.00.00.00.00.00.00.00",
        "SYN:RES_TEC",
        "SYN:RES_FIN",
        "ACC:4.00.00.00.00.00.00.00",
        "ACC:5.00.00.00.00.00.00.00",
      ].forEach((k) => state.balExpanded.add(k));
    }

    document.querySelectorAll("#balStmtTabs .seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.balstmt === state.balStmt);
    });
    document.querySelectorAll("#balQuickLS .bal-quick-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.balEnt === state.balEntity);
    });
    const fBtn = document.getElementById("btnBalToFicha");
    if (fBtn) {
      const canFicha = state.balEntity !== "MKT:ALL";
      fBtn.disabled = !canFicha;
      fBtn.title = canFicha ? "Abrir esta entidad en 8. Ficha y Comparador" : "Seleccioná una compañía o grupo para abrir su Ficha";
    }
    document.getElementById("liveCountPill").textContent =
      `${data.entityLabel} · ${data.isAgg ? "Suma simple SINENSUP" : "Plan de Cuentas SSN"}`;

    // 1. KPIs Resumen Contable (6 tarjetas)
    const { activo, pasivo, pn, resTec, resFin, resEj } = data;
    const eqDiff = activo - pasivo - pn;
    const eqOk = Math.abs(eqDiff) < 1; // < $ 0,001 M
    const actYoY = balCalcYoY(activo, data.activoPrev, data.hasStockYoY);
    const pasYoY = balCalcYoY(pasivo, data.pasivoPrev, data.hasStockYoY);
    const pnYoY = balCalcYoY(pn, data.pnPrev, data.hasStockYoY);
    const pasActPct = activo > 0 ? (pasivo / activo) * 100 : null;
    const solvMult = pasivo > 0 ? activo / pasivo : null;
    const rtPdPct = data.primDevBase > 0 ? (resTec / data.primDevBase) * 100 : null;
    const roePct = pn > 0 ? (resEj / pn) * 100 : null;

    const kpis = [
      {
        label: "Activo Total (Cap. 1)",
        val: fmtMoney(activo),
        sub: actYoY != null ? `YoY: <span class="${pctClass(actYoY)}">${fmtSignedPct(actYoY)}</span>` : "Saldo al cierre",
        accent: "accent-blue",
      },
      {
        label: "Pasivo Total (Cap. 2)",
        val: fmtMoney(pasivo),
        sub: `${pasActPct != null ? `<strong>${fmtPct(pasActPct, 1)}</strong> s/ Activo` : "—"}${pasYoY != null ? ` · YoY: <span class="${pctClass(pasYoY)}">${fmtSignedPct(pasYoY)}</span>` : ""}`,
        accent: "accent-ink",
      },
      {
        label: "Patrimonio Neto (Cap. 3)",
        val: fmtMoney(pn),
        sub: `${solvMult != null ? `Act./Pas.: <strong>${fmtDec(solvMult)}x</strong>` : "—"}${pnYoY != null ? ` · YoY: <span class="${pctClass(pnYoY)}">${fmtSignedPct(pnYoY)}</span>` : ""}`,
        accent: "accent-green",
      },
      {
        label: "Control Ecuación (A − P − PN)",
        val: eqOk ? fmtMoney(0) : fmtMoney(eqDiff),
        sub: eqOk ? '<span class="pos">Conciliación exacta (cuadra a $0)</span>' : '<span class="neg">Revisar diferencia de redondeo</span>',
        accent: eqOk ? "accent-green" : "accent-orange",
      },
      {
        label: "Resultado Técnico (5.01 − 4.01)",
        val: fmtMoney(resTec),
        sub: `${rtPdPct != null ? `<strong>${fmtPct(rtPdPct, 2)}</strong> s/ Prim. Dev.` : `Primas Dev.: ${fmtMoney(data.primDevBase)}`}`,
        accent: "",
      },
      {
        label: "Resultado del Ejercicio (5 − 4)",
        val: fmtMoney(resEj),
        sub: `Fin.: <span class="${pctClass(resFin)}">${fmtMoney(resFin)}</span>${roePct != null ? ` · ROE <span class="${pctClass(roePct)}">${fmtPct(roePct, 1)}</span>` : ""}`,
        accent: "accent-orange",
      },
    ];
    const balKpiEl = document.getElementById("balSummaryKpis");
    balKpiEl.innerHTML = kpis.map((k) => `
      <div class="kpi-card ${k.accent}">
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-value num">${esc(k.val)}</div>
        <div class="kpi-sub">${k.sub}</div>
      </div>
    `).join("");
    attachExpandButtons(balKpiEl);

    // 2. Construcción del árbol contable según Estado seleccionado
    const nzMemo = new Map();
    function hasAccountNonZero(nodeId) {
      if (nzMemo.has(nodeId)) return nzMemo.get(nodeId);
      const nd = dec.nodes[nodeId];
      const hasYoY = nd.cap >= "4" ? data.hasFlowYoY : data.hasStockYoY;
      const cur = data.curVals[nodeId];
      const prev = hasYoY ? data.prevVals[nodeId] : 0;
      let res = Math.abs(cur) >= 0.05 || (hasYoY && Math.abs(prev) >= 0.05);
      if (!res && nd.children.length > 0) {
        for (let k = 0; k < nd.children.length; k++) {
          if (hasAccountNonZero(nd.children[k])) {
            res = true;
            break;
          }
        }
      }
      nzMemo.set(nodeId, res);
      return res;
    }

    function buildAccountItem(nodeId, sign, pctBaseKind) {
      const chain = unwrapAccountChain(dec, nodeId, strict);
      const nd = chain.head;
      const tail = chain.tail;
      const isFlow = nd.cap === "4" || nd.cap === "5";
      const hasYoY = isFlow ? data.hasFlowYoY : data.hasStockYoY;
      const cur = data.curVals[nd.id] * sign;
      const prev = hasYoY ? data.prevVals[nd.id] * sign : null;
      const childIds = chain.childIds;

      const wrappedMatches = (q) => chain.wrapped.some((w) => w.normText.includes(q));
      const subtreeMatchMemo = new Map();
      const matchesSubtree = (q, nid = tail.id, isHead = true) => {
        if (isHead && wrappedMatches(q)) return true;
        if (dec.nodes[nid].normText.includes(q)) return true;
        const ch = dec.nodes[nid].children;
        for (let i = 0; i < ch.length; i++) {
          if (matchesSubtree(q, ch[i], false)) return true;
        }
        return false;
      };

      const rawDisplayCod = strict ? nd.shortCod : (tail.leafIdx >= 0 ? tail.shortCod : nd.shortCod);
      const displayLvl = strict ? nd.nivel : nd.nivel;
      return {
        kind: "acc",
        key: "ACC:" + nd.cod,
        nodeId: nd.id,
        cod: rawDisplayCod,
        fullCod: nd.cod,
        desc: nd.desc,
        nivel: displayLvl,
        isCap: nd.nivel === 1,
        isLvl2: nd.nivel === 2,
        isTotal: false,
        isSubtotal: false,
        cur,
        prev,
        hasYoY,
        pctBaseKind: pctBaseKind || (isFlow ? "prim_dev" : "activo"),
        colorSigned: sign < 0 || nd.desc.includes("(-)"),
        hasNonZero: () => hasAccountNonZero(nd.id),
        matchesSelf: (q) => wrappedMatches(q),
        matchesAny: (q) => matchesSubtree(q),
        getChildren: () => childIds.map((cid) => buildAccountItem(cid, sign, pctBaseKind)),
      };
    }

    function makeSyntheticGroup(key, cod, desc, specs, pctBaseKind, styleClass) {
      const getChildren = () => specs
        .map((sp) => {
          const nd = dec.byCode.get(sp.cod);
          return nd ? buildAccountItem(nd.id, sp.sign, pctBaseKind) : null;
        })
        .filter(Boolean);
      const children = getChildren();
      const cur = children.reduce((s, c) => s + c.cur, 0);
      const hasYoY = children.some((c) => c.hasYoY);
      const prev = hasYoY ? children.reduce((s, c) => s + (c.prev || 0), 0) : null;
      return {
        kind: "syn",
        key,
        cod,
        desc,
        nivel: 1,
        isCap: styleClass === "cap",
        isSubtotal: styleClass === "subtotal",
        isTotal: false,
        cur,
        prev,
        hasYoY,
        pctBaseKind,
        colorSigned: true,
        hasNonZero: () => children.some((c) => c.hasNonZero()),
        matchesSelf: (q) => normSearch(`${cod} ${desc}`).includes(q),
        matchesAny: (q) => normSearch(`${cod} ${desc}`).includes(q) || children.some((c) => c.matchesAny(q)),
        getChildren,
      };
    }

    function makeTotalRow(key, cod, desc, cur, prev, hasYoY, pctBaseKind, colorSigned) {
      return {
        kind: "total",
        key,
        cod,
        desc,
        nivel: 1,
        isCap: false,
        isSubtotal: false,
        isTotal: true,
        cur,
        prev,
        hasYoY,
        pctBaseKind,
        colorSigned,
        hasNonZero: () => true,
        matchesSelf: (q) => normSearch(`${cod} ${desc}`).includes(q),
        matchesAny: (q) => normSearch(`${cod} ${desc}`).includes(q),
        getChildren: () => [],
      };
    }

    let rootItems = [];
    if (state.balStmt === "patrimonial") {
      [dec.capIds.get("1"), dec.capIds.get("2"), dec.capIds.get("3")].forEach((cid) => {
        if (cid != null) rootItems.push(buildAccountItem(cid, 1, "activo"));
      });
      rootItems.push(makeTotalRow(
        "TOT:PAS_PN",
        "2+3",
        "TOTAL PASIVO + PATRIMONIO NETO",
        pasivo + pn,
        data.hasStockYoY ? (data.pasivoPrev + data.pnPrev) : null,
        data.hasStockYoY,
        "activo",
        false
      ));
    } else if (state.balStmt === "resultados") {
      rootItems.push(makeSyntheticGroup(
        "SYN:RES_TEC",
        "5.01 − 4.01",
        "ESTRUCTURA TÉCNICA (Resultado Técnico)",
        [{ cod: "5.01.00.00.00.00.00.00", sign: 1 }, { cod: "4.01.00.00.00.00.00.00", sign: -1 }],
        "prim_dev",
        "subtotal"
      ));
      rootItems.push(makeSyntheticGroup(
        "SYN:RES_FIN",
        "5.02 − 4.02",
        "ESTRUCTURA FINANCIERA (Resultado Financiero)",
        [{ cod: "5.02.00.00.00.00.00.00", sign: 1 }, { cod: "4.02.00.00.00.00.00.00", sign: -1 }],
        "prim_dev",
        "subtotal"
      ));
      const nd403 = dec.byCode.get("4.03.00.00.00.00.00.00");
      if (nd403) rootItems.push(buildAccountItem(nd403.id, -1, "prim_dev"));
      rootItems.push(makeSyntheticGroup(
        "SYN:RES_EXT",
        "5.03 − 4.04",
        "RESULTADO OPERACIONES EXTRAORDINARIAS (Neto)",
        [{ cod: "5.03.00.00.00.00.00.00", sign: 1 }, { cod: "4.04.00.00.00.00.00.00", sign: -1 }],
        "prim_dev",
        "subtotal"
      ));
      const nd405 = dec.byCode.get("4.05.00.00.00.00.00.00");
      if (nd405) rootItems.push(buildAccountItem(nd405.id, -1, "prim_dev"));
      rootItems.push(makeTotalRow(
        "SYN:RES_EJ",
        "5 − 4",
        "RESULTADO DEL EJERCICIO",
        resEj,
        data.hasFlowYoY ? data.resEjPrev : null,
        data.hasFlowYoY,
        "prim_dev",
        true
      ));
    } else {
      ["1", "2", "3", "4", "5"].forEach((cap) => {
        const cid = dec.capIds.get(cap);
        if (cid != null) rootItems.push(buildAccountItem(cid, 1, cap <= "3" ? "activo" : "prim_dev"));
      });
      rootItems.push(makeTotalRow(
        "TOT:PAS_PN",
        "2+3",
        "TOTAL PASIVO + PATRIMONIO NETO",
        pasivo + pn,
        data.hasStockYoY ? (data.pasivoPrev + data.pnPrev) : null,
        data.hasStockYoY,
        "activo",
        false
      ));
      rootItems.push(makeTotalRow(
        "SYN:RES_EJ",
        "5 − 4",
        "RESULTADO DEL EJERCICIO (Ganancias − Pérdidas)",
        resEj,
        data.hasFlowYoY ? data.resEjPrev : null,
        data.hasFlowYoY,
        "prim_dev",
        true
      ));
    }

    // Recorrido DFS para render y exportación CSV
    const visibleRows = [];
    const expandableByDepth = []; // { key, visualDepth }

    function walkTree(item, visualDepth, parentForcedOpen) {
      if (hideZero && !item.isTotal && !item.hasNonZero()) return;
      if (queryNorm && !parentForcedOpen && !item.matchesAny(queryNorm)) return;

      const rawChildren = item.getChildren();
      const children = rawChildren.filter((c) => !hideZero || c.isTotal || c.hasNonZero());
      const hasChildren = children.length > 0;
      if (hasChildren) expandableByDepth.push({ key: item.key, visualDepth });

      let isExpanded = false;
      if (hasChildren) {
        if (queryNorm) {
          isExpanded = children.some((c) => c.matchesAny(queryNorm));
        } else {
          isExpanded = state.balExpanded.has(item.key);
        }
      }

      const selfMatched = queryNorm ? item.matchesSelf(queryNorm) : false;
      visibleRows.push({ item, visualDepth, hasChildren, isExpanded, selfMatched });

      if (isExpanded) {
        const passForce = parentForcedOpen || (selfMatched && !children.some((c) => c.matchesAny(queryNorm)));
        children.forEach((ch) => walkTree(ch, visualDepth + 1, passForce));
      }
    }

    rootItems.forEach((rt) => walkTree(rt, 0, false));

    // Títulos, subtítulos y notas metodológicas
    const stmtNames = {
      patrimonial: "Estado Patrimonial (Caps. 1–3)",
      resultados: "Estado de Resultados por Estructura (Caps. 4–5)",
      ambos: "Estados Contables Completos (Caps. 1–5)",
    };
    const prevLbl = pIdx >= 4 ? PERIODOS[pIdx - 4].label : "Año ant.";
    document.getElementById("balTreeTitle").textContent = `${stmtNames[state.balStmt]} — ${data.entityLabel}`;
    document.getElementById("balTreeSub").textContent =
      `Desagregación jerárquica del Plan de Cuentas SSN (niveles 1 a 8) · ${PERIODOS[pIdx].label} · ${data.isAgg ? "Suma simple SINENSUP" : "Balance individual SSN"}`;

    const signNoteEl = document.getElementById("balSignNote");
    if (signNoteEl) {
      if (state.balStmt === "resultados") {
        signNoteEl.innerHTML = `<strong>Criterio de exposición gerencial:</strong> Las cuentas de Ganancias (<code>5.x</code>) suman (<code>+</code>) y las de Pérdidas (<code>4.x</code>) se exponen restando (<code>−</code>) dentro de cada estructura (<code>5.01 − 4.01 = Res. Técnico</code>; <code>5.02 − 4.02 = Res. Financiero</code>) para que cada subtotal y el <strong>Resultado del Ejercicio</strong> cuadren por suma algebraica directa. Las cuentas regularizadoras negativas dentro de <code>4.x</code> (recuperos o créditos fiscales) quedan en positivo porque mejoran el resultado.`;
        signNoteEl.hidden = false;
      } else if (state.balStmt === "ambos") {
        signNoteEl.innerHTML = `<strong>Signo contable SINENSUP:</strong> Los capítulos 1 (Activo), 2 (Pasivo), 3 (Patrimonio Neto), 4 (Pérdidas) y 5 (Ganancias) mantienen su signo positivo natural del balance oficial; el control final calcula <code>Ganancias (5) − Pérdidas (4)</code>.${data.isAgg ? " En grupos económicos y Total Mercado se muestra suma simple directa sin eliminaciones VPP." : ""}`;
        signNoteEl.hidden = false;
      } else {
        signNoteEl.innerHTML = data.isAgg
          ? `<strong>Nota de consolidación:</strong> Para grupos económicos y Total Mercado, el árbol de cuentas analíticas muestra la <strong>suma simple</strong> directa de balances SINENSUP (sin eliminación VPP nivel cuenta). La base porcentual en Estado Patrimonial es <strong>Activo Total = 100%</strong>.`
          : `<strong>Base porcentual:</strong> En Estado Patrimonial todas las cuentas se expresan en <strong>% sobre Activo Total</strong> (A − P − PN = $ 0). Hacé click en cualquier fila con flecha para abrir hasta el nivel de detalle máximo del plan SSN.`;
        signNoteEl.hidden = false;
      }
    }

    const vColTitle = state.balStmt === "patrimonial"
      ? "% s/ Activo"
      : (state.balStmt === "resultados" ? "% s/ Prim. Dev." : "% Estr.");
    const anyYoY = state.balStmt === "patrimonial"
      ? data.hasStockYoY
      : (state.balStmt === "resultados" ? data.hasFlowYoY : (data.hasStockYoY || data.hasFlowYoY));

    let html = `<table class="data-table table-compact bal-tree-table">
      <thead><tr>
        <th>Cuenta / Descripción SSN</th>
        <th class="num">Importe (${unitSuffix()})</th>
        <th class="num">${esc(vColTitle)}</th>
        <th class="num">${anyYoY ? esc(prevLbl) : "Año Ant."} (${unitSuffix()})</th>
        <th class="num">Var. YoY %</th>
      </tr></thead><tbody>`;

    if (visibleRows.length === 0) {
      html += `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--ink-muted)">No se encontraron cuentas que coincidan con el filtro/búsqueda actual.</td></tr>`;
    } else {
      visibleRows.forEach(({ item, visualDepth, hasChildren, isExpanded }) => {
        const cls = ["bal-row"];
        if (hasChildren) cls.push("is-parent");
        if (item.isCap) cls.push("is-cap");
        if (item.isLvl2) cls.push("is-lvl2");
        if (item.isSubtotal) cls.push("is-subtotal");
        if (item.isTotal) cls.push("is-total");
        if (!hasChildren && !item.isTotal && !item.isSubtotal) cls.push("is-leaf");

        const indentPx = visualDepth * 18;
        const iconHtml = hasChildren
          ? `<span class="bal-chevron ${isExpanded ? "open" : ""}" aria-hidden="true">▸</span>`
          : `<span class="bal-leaf-dot" aria-hidden="true">${item.isTotal ? "=" : "•"}</span>`;
        const lvlBadge = (item.kind === "acc" && !item.isCap)
          ? `<span class="bal-lvl-badge" title="Nivel ${item.nivel} del Plan de Cuentas SSN">N${item.nivel}</span>`
          : "";
        const codHtml = item.cod ? `<span class="bal-code">${highlightBalMatch(item.cod, queryRaw)}</span>` : "";
        const descHtml = `<span class="bal-desc">${highlightBalMatch(item.desc, queryRaw)}</span>`;

        const valStr = fmtNumMiles(item.cur);
        const valCellHtml = (item.colorSigned || item.cur < -0.05)
          ? `<span class="${pctClass(item.cur)}">${valStr}</span>`
          : valStr;

        const baseDenom = item.pctBaseKind === "prim_dev" ? data.primDevBase : activo;
        const vPct = (baseDenom > 0) ? (item.cur / baseDenom) * 100 : null;
        let vCellHtml = "—";
        if (vPct != null && Number.isFinite(vPct)) {
          const barW = Math.min(100, Math.max(0, Math.abs(vPct)));
          const barCls = vPct < 0 ? "neg" : "";
          vCellHtml = `<span class="bal-vbar-wrap">
            <span class="bal-vbar-track" aria-hidden="true"><span class="bal-vbar-fill ${barCls}" style="width:${barW.toFixed(1)}%"></span></span>
            <span>${fmtPct(vPct, 1)}</span>
          </span>`;
        }

        const prevStr = item.hasYoY ? fmtNumMiles(item.prev) : "—";
        const yoy = balCalcYoY(item.cur, item.prev, item.hasYoY);
        const yoyHtml = yoy != null ? `<span class="${pctClass(yoy)}">${fmtSignedPct(yoy)}</span>` : "—";

        html += `<tr class="${cls.join(" ")}" ${hasChildren ? `data-bal-key="${esc(item.key)}" tabindex="0"` : ""}>
          <td><div class="bal-acct-cell" style="padding-left:${indentPx}px">${iconHtml}${codHtml}${descHtml}${lvlBadge}</div></td>
          <td class="num">${(item.isCap || item.isTotal || item.isSubtotal) ? `<strong>${valCellHtml}</strong>` : valCellHtml}</td>
          <td class="num">${vCellHtml}</td>
          <td class="num">${prevStr}</td>
          <td class="num">${yoyHtml}</td>
        </tr>`;
      });
    }
    html += `</tbody></table>`;

    const wrap = document.getElementById("balTreeWrap");
    wrap.innerHTML = html;

    wrap.querySelectorAll("tr.bal-row[data-bal-key]").forEach((tr) => {
      const toggleRow = () => {
        const key = tr.dataset.balKey;
        if (!key) return;
        if (state.balSearch.trim()) {
          state.balSearch = "";
          const sEl = document.getElementById("balSearch");
          if (sEl) sEl.value = "";
        }
        if (state.balExpanded.has(key)) state.balExpanded.delete(key);
        else state.balExpanded.add(key);
        renderBalanceContable();
      };
      tr.addEventListener("click", toggleRow);
      tr.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleRow();
        }
      });
    });

    // Botones de nivel de apertura rápida
    document.querySelectorAll("#balDepthBtns [data-bal-depth]").forEach((b) => {
      b.onclick = () => {
        const d = Number(b.dataset.balDepth);
        state.balExpanded.clear();
        state.balSearch = "";
        const sEl = document.getElementById("balSearch");
        if (sEl) sEl.value = "";
        const maxExpandVisualDepth = d <= 1 ? -1 : (d >= 8 ? 99 : d - 2);
        if (maxExpandVisualDepth >= 0) {
          // Recolección completa de nodos expandibles hasta profundidad solicitada
          function collectExpandable(item, vDepth) {
            if (hideZero && !item.isTotal && !item.hasNonZero()) return;
            const ch = item.getChildren().filter((c) => !hideZero || c.isTotal || c.hasNonZero());
            if (ch.length > 0 && vDepth <= maxExpandVisualDepth) {
              state.balExpanded.add(item.key);
              ch.forEach((c) => collectExpandable(c, vDepth + 1));
            }
          }
          rootItems.forEach((rt) => collectExpandable(rt, 0));
        }
        renderBalanceContable();
      };
    });

    document.getElementById("btnExportBal").onclick = () => {
      const uDec = unitDecimals();
      const csvRows = [];
      function exportWalk(item, vDepth) {
        if (hideZero && !item.isTotal && !item.hasNonZero()) return;
        const baseDenom = item.pctBaseKind === "prim_dev" ? data.primDevBase : activo;
        const vPct = (baseDenom > 0) ? (item.cur / baseDenom) * 100 : null;
        const yoy = balCalcYoY(item.cur, item.prev, item.hasYoY);
        csvRows.push([
          item.cod || "",
          "  ".repeat(vDepth) + item.desc,
          item.nivel,
          (item.cur / unitDivisor()).toFixed(uDec),
          vPct != null ? vPct.toFixed(2) : "",
          item.hasYoY && item.prev != null ? (item.prev / unitDivisor()).toFixed(uDec) : "",
          yoy != null ? yoy.toFixed(2) : "",
        ]);
        item.getChildren().forEach((c) => exportWalk(c, vDepth + 1));
      }
      rootItems.forEach((rt) => exportWalk(rt, 0));
      const slug = state.balEntity.replace(/[^A-Za-z0-9_-]+/g, "_");
      exportToCSV(
        `balance_contable_${state.balStmt}_${slug}_${PERIODOS[pIdx].id}.csv`,
        ["Código SSN", "Cuenta / Descripción", "Nivel", `Importe (${unitSuffix()})`, vColTitle, `${prevLbl} (${unitSuffix()})`, "Var. YoY %"],
        csvRows
      );
    };
  }

  // ==================== MODO PRESENTACIÓN & ARMADOR PDF (DECK BUILDER) ====================
  const EXPAND_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 2.5H13.5V6.5"/><path d="M13.5 2.5L9 7"/><path d="M6.5 13.5H2.5V9.5"/><path d="M2.5 13.5L7 9"/></svg>';
  const DECK_ADD_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>';
  const DECK_CHECK_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.2 8.5l3.1 3.1 6.5-6.8"/></svg>';
  const DECK_STORAGE_KEY = "ls_ssn_presentation_deck_v1";

  const focusState = { el: null, placeholder: null, triggerBtn: null };
  const deckState = {
    items: [],
    includeCover: true,
    coverTitle: "Informe Mercado Asegurador Argentino",
    coverSubtitle: "Balances SSN · La Segunda Seguros",
    kpiGroupSize: 4,
    previewIdx: 0,
  };
  let deckToastTimer = null;
  let deckDragSrcIdx = -1;

  function buildDeckContextText() {
    let baseCtx = buildFocusContextText();
    if (state.activeTab === "rankings") {
      const rkLabels = { prod: "Producción", res: "Resultado", sin: "Siniestralidad y Combinado", gto: "Gastos", fin: "Financiero e Inv.", solv: "Solvencia y PN" };
      baseCtx += ` · ${rkLabels[state.rkMode] || state.rkMode}`;
      const exclZ = document.getElementById("rkExclZurichLife");
      if (exclZ && exclZ.checked) baseCtx += " · Sin Zurich Life";
    } else if (state.activeTab === "ramos") {
      baseCtx += state.rmLevel === "subramo" ? " · Por Subramo" : " · Por Ramo";
    } else if (state.activeTab === "personas") {
      const pvMap = { canales: "Canales y Comisiones", judreas: "Judicialización y Reaseguro", polizas: "Pólizas y Siniestros SSN", looker: "Rankings" };
      if (pvMap[state.perView]) baseCtx += ` · ${pvMap[state.perView]}`;
    } else if (state.activeTab === "retiro") {
      const rvMap = { flujotasa: "Flujo Neto y Tasa Testigo", asegurados: "Asegurados y Demografía SSN", looker: "Rankings" };
      if (rvMap[state.retView]) baseCtx += ` · ${rvMap[state.retView]}`;
    } else if (state.activeTab === "mensual") {
      baseCtx += ` · Pulso Mensual SSN (${state.menUnitMode === "const" ? "Constantes" : "Corrientes"})`;
    } else if (state.activeTab === "grupos") {
      const gModeLbl = { multi: "Multiramo", mono: "Monorramo", solo: "Independientes", ls: "Grupo La Segunda" };
      if (gModeLbl[state.grpMode]) baseCtx += ` · ${gModeLbl[state.grpMode]}`;
    } else if (state.activeTab === "ficha") {
      const entName = document.getElementById("fichaEntityInput")?.value?.trim();
      if (entName) baseCtx += ` · Entidad: ${entName}`;
      if (state.fichaPeers && state.fichaPeers.length > 0) baseCtx += ` (+${state.fichaPeers.length} pares)`;
    } else if (state.activeTab === "balance") {
      const balName = document.getElementById("balEntityInput")?.value?.trim();
      const stmtMap = { patrimonial: "Estado Patrimonial", resultados: "Estado de Resultados", ambos: "Caps. 1–5" };
      if (balName) baseCtx += ` · ${balName}`;
      baseCtx += ` · ${stmtMap[state.balStmt] || state.balStmt}`;
    }
    return baseCtx;
  }

  function showDeckToast(message, showOpenAction = true) {
    const el = document.getElementById("deckToast");
    if (!el) return;
    if (deckToastTimer) clearTimeout(deckToastTimer);
    el.innerHTML = `<span>${esc(message)}</span>${showOpenAction ? '<button type="button" class="deck-toast-btn" id="deckToastOpenBtn">Ver lista</button>' : ""}`;
    el.hidden = false;
    const openBtn = document.getElementById("deckToastOpenBtn");
    if (openBtn) {
      openBtn.addEventListener("click", () => {
        el.hidden = true;
        openDeckDrawer();
      });
    }
    deckToastTimer = setTimeout(() => {
      el.hidden = true;
    }, 3400);
  }

  function saveDeckState() {
    try {
      const payload = {
        items: deckState.items,
        includeCover: deckState.includeCover,
        coverTitle: deckState.coverTitle,
        coverSubtitle: deckState.coverSubtitle,
        kpiGroupSize: deckState.kpiGroupSize,
      };
      localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {
      showDeckToast("Límite de almacenamiento local alcanzado: la lista sigue en memoria para exportar PDF.", false);
    }
  }

  function loadDeckState() {
    try {
      const raw = localStorage.getItem(DECK_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.items)) deckState.items = parsed.items;
      if (typeof parsed.includeCover === "boolean") deckState.includeCover = parsed.includeCover;
      if (typeof parsed.coverTitle === "string" && parsed.coverTitle.trim()) deckState.coverTitle = parsed.coverTitle;
      if (typeof parsed.coverSubtitle === "string") deckState.coverSubtitle = parsed.coverSubtitle;
      if ([1, 2, 4].includes(Number(parsed.kpiGroupSize))) deckState.kpiGroupSize = Number(parsed.kpiGroupSize);
    } catch (_) {
      deckState.items = [];
    }
    const covEl = document.getElementById("deckIncludeCover");
    const ttlEl = document.getElementById("deckTitleInput");
    const subEl = document.getElementById("deckSubtitleInput");
    const grpEl = document.getElementById("deckKpiGroup");
    if (covEl) covEl.checked = deckState.includeCover;
    if (ttlEl) ttlEl.value = deckState.coverTitle;
    if (subEl) subEl.value = deckState.coverSubtitle;
    if (grpEl) grpEl.value = String(deckState.kpiGroupSize);
  }

  function canvasToWhitePng(canvas) {
    const w = canvas.width || Math.max(1, Math.round((canvas.clientWidth || 640) * 2));
    const h = canvas.height || Math.max(1, Math.round((canvas.clientHeight || 320) * 2));
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(canvas, 0, 0, w, h);
    return tmp.toDataURL("image/png");
  }

  function extractElementNotesHtml(el) {
    const notes = Array.from(el.querySelectorAll(".chart-outlier-note, .chart-info-note")).filter(
      (n) => !n.hidden && n.textContent.trim().length > 0 && getComputedStyle(n).display !== "none"
    );
    return notes.map((n) => {
      const c = n.cloneNode(true);
      c.removeAttribute("id");
      c.removeAttribute("hidden");
      return c.outerHTML;
    }).join("");
  }

  function stripInteractiveClassesAndWidths(root) {
    root.querySelectorAll(".col-resize-handle, .focus-btn, .deck-add-btn, .card-action-group").forEach((n) => n.remove());
    root.querySelectorAll(".sortable, .clickable, .resizing").forEach((n) => {
      n.classList.remove("sortable", "clickable", "resizing");
    });
    root.querySelectorAll("table, colgroup, col, thead, tbody, tfoot, tr, th, td").forEach((n) => {
      n.removeAttribute("width");
      if (n.style) {
        n.style.width = "";
        n.style.minWidth = "";
        n.style.maxWidth = "";
        if (n.tagName === "TABLE") n.style.tableLayout = "";
      }
    });
  }

  function sanitizeClonedTable(tableEl) {
    const clone = tableEl.cloneNode(true);
    stripInteractiveClassesAndWidths(clone);
    const rowCount = clone.querySelectorAll("tbody tr").length;
    const firstBodyRow = clone.querySelector("tbody tr");
    let colCount = 0;
    if (firstBodyRow) {
      colCount = Array.from(firstBodyRow.children).reduce((s, td) => s + (Number(td.getAttribute("colspan")) || 1), 0);
    } else {
      const headTrs = Array.from(clone.querySelectorAll("thead tr"));
      colCount = headTrs.reduce((mx, tr) => Math.max(mx, Array.from(tr.children).reduce((s, th) => s + (Number(th.getAttribute("colspan")) || 1), 0)), 0);
    }
    return { html: clone.outerHTML, rowCount, colCount };
  }

  function sanitizeClonedKpiCardHtml(kpiEl) {
    const clone = kpiEl.cloneNode(true);
    clone.classList.remove("is-focused");
    clone.querySelectorAll(".focus-btn, .deck-add-btn").forEach((n) => n.remove());
    return clone.outerHTML;
  }

  function sanitizeClonedContainerHtml(rootEl) {
    const liveCanvases = Array.from(rootEl.querySelectorAll("canvas"));
    const pngs = liveCanvases.map((c) => (c.width > 0 && c.height > 0 ? canvasToWhitePng(c) : ""));
    const clone = rootEl.cloneNode(true);
    clone.classList.remove("is-focused");
    clone.querySelectorAll(
      ".card-header, .focus-block-hdr, .focus-btn, .deck-add-btn, .card-action-group, .seg-bar, .looker-card-controls, .chart-empty-state, .chart-outlier-note, .chart-info-note, button, select, input, .col-resize-handle"
    ).forEach((n) => n.remove());
    stripInteractiveClassesAndWidths(clone);
    const clonedCanvases = Array.from(clone.querySelectorAll("canvas"));
    clonedCanvases.forEach((c, i) => {
      if (pngs[i]) {
        const img = document.createElement("img");
        img.src = pngs[i];
        img.className = "deck-inline-canvas";
        img.alt = "";
        c.replaceWith(img);
      } else {
        c.remove();
      }
    });
    return clone.innerHTML;
  }

  function flashAddedBtn(btn) {
    if (!btn || btn.dataset.flashing === "1") return;
    btn.dataset.flashing = "1";
    const prevHtml = btn.innerHTML;
    btn.classList.add("added");
    if (btn.classList.contains("deck-add-btn")) {
      btn.innerHTML = DECK_CHECK_SVG;
    } else if (btn.classList.contains("deck-panel-add-btn")) {
      btn.textContent = "✓ Panel agregado";
    } else if (btn.id === "focusAddDeckBtn") {
      btn.textContent = "✓ Agregado";
    }
    setTimeout(() => {
      if (!btn.isConnected) return;
      btn.classList.remove("added");
      delete btn.dataset.flashing;
      if (btn.classList.contains("deck-add-btn")) btn.innerHTML = DECK_ADD_SVG;
      else btn.innerHTML = prevHtml;
    }, 1400);
  }

  function captureDeckElement(targetEl, opts = {}) {
    if (!targetEl) return;
    const emptyState = Array.from(targetEl.querySelectorAll(".chart-empty-state")).find(
      (n) => getComputedStyle(n).display !== "none"
    );
    if (emptyState) {
      showDeckToast("No hay datos visibles en este componente para agregar.", false);
      return;
    }

    const ctxText = buildDeckContextText();
    const notesHtml = extractElementNotesHtml(targetEl);
    let kind = "card";
    let title = "";
    let subtitle = "";
    let imageDataUrl = "";
    let htmlContent = "";
    let kpiGridCols = 3;
    let tableRowCount = 0;
    let tableColCount = 0;

    if (opts.forceKind === "kpi-panel") {
      const kpiCards = Array.from(targetEl.querySelectorAll(":scope > .kpi-card"));
      if (kpiCards.length === 0) {
        showDeckToast("El panel KPI no tiene tarjetas visibles en este momento.", false);
        return;
      }
      kind = "kpi-panel";
      title = opts.panelTitle || "Panel de Indicadores Clave";
      if (state.activeTab === "ficha") {
        const entName = document.getElementById("fichaEntityInput")?.value?.trim();
        if (entName) subtitle = entName;
      } else if (state.activeTab === "personas") {
        const srEl = document.querySelector("#perContextNote");
        if (srEl) subtitle = srEl.textContent.replace(/[·\s]*Subramo con presencia de La Segunda Personas.*$/, "").trim();
      } else if (state.activeTab === "retiro") {
        const srEl = document.querySelector("#retContextNote");
        if (srEl) subtitle = srEl.textContent.trim();
      }
      if (targetEl.id === "perBenchmarkKpis" || targetEl.id === "retBenchmarkKpis" || kpiCards.length >= 7 || kpiCards.length === 4) kpiGridCols = 4;
      else if (kpiCards.length <= 2) kpiGridCols = kpiCards.length;
      else kpiGridCols = 3;
      htmlContent = kpiCards.map(sanitizeClonedKpiCardHtml).join("");
    } else if (targetEl.classList.contains("kpi-card")) {
      kind = "kpi";
      title = targetEl.querySelector(".kpi-label")?.textContent?.trim() || "Indicador KPI";
      htmlContent = sanitizeClonedKpiCardHtml(targetEl);
    } else {
      const titleEl = targetEl.querySelector(".card-title, .focus-block-title");
      const subEl = targetEl.querySelector(".card-subtitle");
      title = titleEl ? titleEl.textContent.trim().replace(/\s+/g, " ") : "Vista del Tablero";
      subtitle = subEl ? subEl.textContent.trim().replace(/\s+/g, " ") : "";

      const tables = Array.from(targetEl.querySelectorAll("table.data-table"));
      const canvases = Array.from(targetEl.querySelectorAll("canvas")).filter((c) => {
        const box = c.closest(".chart-box") || c.parentElement;
        return c.width > 0 && c.height > 0 && (!box || getComputedStyle(box).display !== "none");
      });

      if (canvases.length >= 1 && tables.length === 0) {
        kind = "chart";
        imageDataUrl = canvasToWhitePng(canvases[0]);
      } else if (tables.length === 1) {
        kind = "table";
        const tblInfo = sanitizeClonedTable(tables[0]);
        htmlContent = tblInfo.html;
        tableRowCount = tblInfo.rowCount;
        tableColCount = tblInfo.colCount;
      } else {
        kind = "card";
        htmlContent = sanitizeClonedContainerHtml(targetEl);
      }
    }

    const item = {
      id: "di_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      kind,
      title,
      subtitle,
      contextText: ctxText,
      note: "",
      imageDataUrl,
      htmlContent,
      notesHtml,
      kpiGridCols,
      tableRowCount,
      tableColCount,
    };

    deckState.items.push(item);
    saveDeckState();
    updateDeckUi();
    flashAddedBtn(opts.triggerBtn, opts.triggerBtn?.classList?.contains("deck-btn-corner"));
    showDeckToast(`Agregado a la presentación (${deckState.items.length})`);
  }

  function chunkTableItemToSlides(item) {
    const tmp = document.createElement("div");
    tmp.innerHTML = item.htmlContent || "";
    const table = tmp.querySelector("table");
    if (!table) {
      return [{
        type: "table",
        title: item.title,
        subtitle: item.subtitle,
        contextText: item.contextText,
        note: item.note,
        notesHtml: item.notesHtml,
        htmlContent: item.htmlContent,
        denseCols: (item.tableColCount || 0) >= 9,
        itemId: item.id,
      }];
    }

    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    const tfoot = table.querySelector("tfoot");
    const theadRows = thead ? thead.querySelectorAll("tr").length : 0;
    const tbodyRows = tbody ? Array.from(tbody.querySelectorAll("tr")) : [];
    const hasTfoot = Boolean(tfoot && tfoot.querySelector("tr"));
    const hasExtraNote = Boolean((item.note || "").trim() || (item.notesHtml || "").trim());

    const maxRows = Math.max(
      9,
      15 - (theadRows > 1 ? 2 : 0) - (hasExtraNote ? 2 : 0) - (hasTfoot ? 1 : 0)
    );
    const denseCols = (item.tableColCount || 0) >= 9;

    if (tbodyRows.length <= maxRows) {
      return [{
        type: "table",
        title: item.title,
        subtitle: item.subtitle,
        contextText: item.contextText,
        note: item.note,
        notesHtml: item.notesHtml,
        htmlContent: table.outerHTML,
        denseCols,
        itemId: item.id,
      }];
    }

    const chunks = [];
    for (let i = 0; i < tbodyRows.length; i += maxRows) {
      chunks.push(tbodyRows.slice(i, i + maxRows));
    }
    const totalParts = chunks.length;
    return chunks.map((rowsSlice, partIdx) => {
      const tblClone = table.cloneNode(false);
      if (thead) tblClone.appendChild(thead.cloneNode(true));
      const newBody = document.createElement("tbody");
      rowsSlice.forEach((tr) => newBody.appendChild(tr.cloneNode(true)));
      tblClone.appendChild(newBody);
      if (tfoot && partIdx === totalParts - 1) tblClone.appendChild(tfoot.cloneNode(true));
      return {
        type: "table",
        title: `${item.title} (parte ${partIdx + 1}/${totalParts})`,
        subtitle: item.subtitle,
        contextText: item.contextText,
        note: partIdx === totalParts - 1 ? item.note : "",
        notesHtml: partIdx === totalParts - 1 ? item.notesHtml : "",
        htmlContent: tblClone.outerHTML,
        denseCols,
        itemId: item.id,
      };
    });
  }

  function countKpiCardsInHtml(html, fallback = 3) {
    if (!html) return fallback;
    const matches = html.match(/class="[^"]*\bkpi-card\b/g);
    return matches && matches.length ? matches.length : fallback;
  }

  function kpiLayoutClassForCount(count) {
    const n = Number(count) || 3;
    if (n <= 1) return "kpi-layout-1";
    if (n === 2) return "kpi-layout-2";
    if (n === 3) return "kpi-layout-3";
    if (n === 4) return "kpi-layout-4";
    return "kpi-layout-6";
  }

  function chunkKpiPanelItemToSlides(item, maxPerSlide) {
    const tmp = document.createElement("div");
    tmp.innerHTML = item.htmlContent || "";
    const cards = Array.from(tmp.querySelectorAll(":scope > .kpi-card"));
    if (cards.length === 0) {
      return [{
        type: "kpi-panel",
        title: item.title,
        note: item.note,
        notesHtml: item.notesHtml,
        htmlContent: item.htmlContent,
        cardCount: item.kpiGridCols || 4,
        itemId: item.id,
      }];
    }
    const limit = Math.max(1, Number(maxPerSlide) || 4);
    const nSlides = Math.max(1, Math.ceil(cards.length / limit));
    const perSlide = Math.ceil(cards.length / nSlides);
    const chunks = [];
    for (let k = 0; k < cards.length; k += perSlide) {
      chunks.push(cards.slice(k, k + perSlide));
    }
    return chunks.map((ch, idx) => ({
      type: "kpi-panel",
      title: chunks.length > 1 ? `${item.title} (${idx + 1}/${chunks.length})` : item.title,
      note: idx === chunks.length - 1 ? item.note : "",
      notesHtml: idx === chunks.length - 1 ? item.notesHtml : "",
      htmlContent: ch.map((c) => c.outerHTML).join(""),
      cardCount: ch.length,
      itemId: item.id,
    }));
  }

  function buildDeckSlides() {
    const slides = [];
    const itemSlideMap = new Map();

    if (deckState.includeCover) {
      const p = PERIODOS[state.pIdx];
      slides.push({
        type: "cover",
        title: deckState.coverTitle || "Informe Mercado Asegurador Argentino",
        subtitle: deckState.coverSubtitle || "",
        periodoLabel: p ? p.label : "",
      });
    }

    const grpSize = Number(deckState.kpiGroupSize) || 4;
    let i = 0;
    while (i < deckState.items.length) {
      const item = deckState.items[i];
      if (item.kind === "kpi" && grpSize > 1) {
        const group = [];
        while (i < deckState.items.length && deckState.items[i].kind === "kpi" && group.length < grpSize) {
          group.push(deckState.items[i]);
          i++;
        }
        const slideNumber = slides.length + 1;
        group.forEach((g) => {
          itemSlideMap.set(g.id, {
            startSlide: slideNumber,
            totalParts: 1,
            groupedCount: group.length,
          });
        });
        if (group.length === 1) {
          const single = group[0];
          slides.push({
            type: "kpi",
            title: single.title,
            note: single.note,
            htmlContent: single.htmlContent,
            cardCount: 1,
          });
        } else {
          const combinedNotes = group
            .map((g) => (g.note && g.note.trim() ? `${g.title}: ${g.note.trim()}` : ""))
            .filter(Boolean)
            .join(" · ");
          slides.push({
            type: "kpi-group",
            title: group.map((g) => g.title).join(" · "),
            note: combinedNotes,
            htmlContent: group.map((g) => g.htmlContent).join(""),
            cardCount: group.length,
          });
        }
      } else if (item.kind === "kpi-panel") {
        const startSlide = slides.length + 1;
        const kSlides = chunkKpiPanelItemToSlides(item, grpSize);
        kSlides.forEach((ks) => slides.push(ks));
        itemSlideMap.set(item.id, { startSlide, totalParts: kSlides.length, groupedCount: 1 });
        i++;
      } else if (item.kind === "table") {
        const startSlide = slides.length + 1;
        const tSlides = chunkTableItemToSlides(item);
        tSlides.forEach((ts) => slides.push(ts));
        itemSlideMap.set(item.id, { startSlide, totalParts: tSlides.length, groupedCount: 1 });
        i++;
      } else {
        const slideNumber = slides.length + 1;
        slides.push({
          type: item.kind,
          title: item.title,
          note: item.note,
          imageDataUrl: item.imageDataUrl,
          htmlContent: item.htmlContent,
          notesHtml: item.notesHtml,
          cardCount: item.kind === "kpi" ? 1 : (item.kpiGridCols || 3),
        });
        itemSlideMap.set(item.id, { startSlide: slideNumber, totalParts: 1, groupedCount: 1 });
        i++;
      }
    }

    return { slides, itemSlideMap };
  }

  function getDeckLogoSvg() {
    return document.querySelector(".brand-logo-lockup")?.innerHTML || "";
  }

  function renderDeckSlideHtml(slide, idx, total) {
    const logoSvg = getDeckLogoSvg();
    if (slide.type === "cover") {
      return `
        <section class="deck-slide deck-slide-cover">
          <div class="deck-cover-main">
            <div class="deck-cover-logo">${logoSvg}</div>
            <div class="deck-cover-kicker">Monitor del Mercado Asegurador Argentino</div>
            <h1 class="deck-cover-title">${esc(slide.title)}</h1>
            ${slide.subtitle ? `<p class="deck-cover-subtitle">${esc(slide.subtitle)}</p>` : ""}
            ${slide.periodoLabel ? `<div class="deck-cover-meta-row"><span class="deck-cover-pill">Último cierre en tablero: ${esc(slide.periodoLabel)}</span></div>` : ""}
          </div>
          <div class="deck-cover-ftr">
            <span>Fuente: Superintendencia de Seguros de la Nación (SINENSUP)</span>
            <span>Diapositiva 1 / ${total}</span>
          </div>
          <div class="mosaic-strip" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
        </section>`;
    }

    let bodyHtml = "";
    if (slide.type === "chart") {
      bodyHtml = `<div class="deck-chart-stage">
        <img src="${slide.imageDataUrl}" alt="${esc(slide.title)}" />
        ${slide.notesHtml ? `<div class="deck-slide-notes">${slide.notesHtml}</div>` : ""}
      </div>`;
    } else if (slide.type === "kpi" || slide.type === "kpi-group" || slide.type === "kpi-panel") {
      const count = Number(slide.cardCount) || countKpiCardsInHtml(slide.htmlContent, 3);
      bodyHtml = `<div class="deck-kpi-stage ${kpiLayoutClassForCount(count)}">${slide.htmlContent}</div>`;
    } else if (slide.type === "table") {
      bodyHtml = `<div class="deck-table-stage ${slide.denseCols ? "dense-cols" : ""}">${slide.htmlContent}</div>
        ${slide.notesHtml ? `<div class="deck-slide-notes">${slide.notesHtml}</div>` : ""}`;
    } else {
      bodyHtml = `<div class="deck-card-stage">${slide.htmlContent}</div>
        ${slide.notesHtml ? `<div class="deck-slide-notes">${slide.notesHtml}</div>` : ""}`;
    }

    return `
      <section class="deck-slide deck-slide-content">
        <header class="deck-slide-hdr">
          <div class="deck-slide-hdr-left">
            <div class="deck-slide-logo">${logoSvg}</div>
            <div class="deck-slide-title-wrap">
              <h2 class="deck-slide-title">${esc(slide.title)}</h2>
            </div>
          </div>
        </header>
        <div class="deck-slide-body">
          ${bodyHtml}
          ${slide.note && slide.note.trim() ? `<div class="deck-slide-exec-note"><strong>Nota:</strong> ${esc(slide.note.trim())}</div>` : ""}
        </div>
        <footer class="deck-slide-ftr">
          <span>La Segunda Seguros · Monitor del Mercado Asegurador (Fuente: SSN SINENSUP)</span>
          <span>Diapositiva ${idx + 1} / ${total}</span>
        </footer>
      </section>`;
  }

  function updateDeckSummaryOnly() {
    const nItems = deckState.items.length;
    const { slides, itemSlideMap } = buildDeckSlides();
    const nSlides = nItems === 0 ? 0 : slides.length;
    const sumPill = document.getElementById("deckSummaryPill");
    if (sumPill) {
      sumPill.textContent = `${nItems} ${nItems === 1 ? "ítem" : "ítems"} · ${nSlides} ${nSlides === 1 ? "slide" : "slides"}`;
    }
    const listEl = document.getElementById("deckList");
    if (listEl) {
      listEl.querySelectorAll(".deck-item[data-id]").forEach((row) => {
        const info = itemSlideMap.get(row.dataset.id);
        const pill = row.querySelector(".deck-slide-num-pill");
        if (pill && info) {
          if (info.totalParts > 1) pill.textContent = `Slides ${info.startSlide}–${info.startSlide + info.totalParts - 1}`;
          else if (info.groupedCount > 1) pill.textContent = `Slide ${info.startSlide} (×${info.groupedCount})`;
          else pill.textContent = `Slide ${info.startSlide}`;
        }
      });
    }
  }

  function renderDeckDrawer() {
    const listEl = document.getElementById("deckList");
    if (!listEl) return;
    const { slides, itemSlideMap } = buildDeckSlides();
    const nItems = deckState.items.length;
    const nSlides = nItems === 0 ? 0 : slides.length;

    const sumPill = document.getElementById("deckSummaryPill");
    if (sumPill) {
      sumPill.textContent = `${nItems} ${nItems === 1 ? "ítem" : "ítems"} · ${nSlides} ${nSlides === 1 ? "slide" : "slides"}`;
    }

    const hasItems = nItems > 0;
    const btnPrev = document.getElementById("btnDeckPreview");
    const btnPrn = document.getElementById("btnDeckPrint");
    const btnClr = document.getElementById("btnDeckClear");
    if (btnPrev) btnPrev.disabled = !hasItems;
    if (btnPrn) btnPrn.disabled = !hasItems;
    if (btnClr) btnClr.disabled = !hasItems;

    if (!hasItems) {
      listEl.innerHTML = `<div class="deck-empty">
        <strong>Tu presentación está vacía</strong>
        Hacé click en el botón <strong>+</strong> de cualquier tarjeta KPI, gráfico o tabla (o en <em>+ Agregar panel KPI</em>) desde cualquier pestaña y filtro.<br /><br />
        Cada ítem se guarda como instantánea fija del filtro activo para que puedas combinar vistas de Personas, Retiro, Rankings o Ficha en un único PDF 16:9.
      </div>`;
      return;
    }

    listEl.innerHTML = deckState.items.map((item, idx) => {
      const info = itemSlideMap.get(item.id) || { startSlide: idx + 1, totalParts: 1, groupedCount: 1 };
      let slideBadge;
      if (info.totalParts > 1) slideBadge = `Slides ${info.startSlide}–${info.startSlide + info.totalParts - 1}`;
      else if (info.groupedCount > 1) slideBadge = `Slide ${info.startSlide} (×${info.groupedCount})`;
      else slideBadge = `Slide ${info.startSlide}`;

      let thumbHtml;
      if (item.kind === "chart" && item.imageDataUrl) {
        thumbHtml = `<img class="deck-thumb-img" src="${item.imageDataUrl}" alt="" />`;
      } else {
        let innerStage;
        if (item.kind === "kpi" || item.kind === "kpi-panel") {
          const thumbCount = item.kind === "kpi"
            ? 1
            : countKpiCardsInHtml(item.htmlContent, item.kpiGridCols || 3);
          innerStage = `<div class="deck-kpi-stage ${kpiLayoutClassForCount(thumbCount)}">${item.htmlContent}</div>`;
        } else if (item.kind === "table") {
          innerStage = `<div class="deck-table-stage ${item.tableColCount >= 9 ? "dense-cols" : ""}">${item.htmlContent}</div>`;
        } else {
          innerStage = `<div class="deck-card-stage">${item.htmlContent}</div>`;
        }
        thumbHtml = `<div class="deck-thumb-html-inner">${innerStage}</div>`;
      }

      return `
        <div class="deck-item" data-idx="${idx}" data-id="${esc(item.id)}" draggable="true">
          <div class="deck-drag-handle" title="Arrastrar para reordenar">⋮⋮</div>
          <div class="deck-thumb-col">
            <div class="deck-thumb-frame">${thumbHtml}</div>
            <span class="deck-slide-num-pill">${esc(slideBadge)}</span>
          </div>
          <div class="deck-item-body">
            <input type="text" class="deck-item-title-input" value="${esc(item.title)}" title="Editar título de la diapositiva" aria-label="Título de diapositiva" />
            <div class="deck-item-ctx">${esc(item.contextText)}</div>
            <textarea rows="1" class="deck-item-note-input" placeholder="Agregar nota ejecutiva opcional para la diapositiva...">${esc(item.note || "")}</textarea>
          </div>
          <div class="deck-item-actions">
            <button type="button" class="deck-mini-btn up" ${idx === 0 ? "disabled" : ""} title="Subir en el orden">↑</button>
            <button type="button" class="deck-mini-btn down" ${idx === nItems - 1 ? "disabled" : ""} title="Bajar en el orden">↓</button>
            <button type="button" class="deck-mini-btn del" title="Quitar de la presentación">×</button>
          </div>
        </div>
      `;
    }).join("");

    listEl.querySelectorAll(".deck-item").forEach((row) => {
      const idx = Number(row.dataset.idx);
      const item = deckState.items[idx];
      if (!item) return;

      row.querySelector(".deck-item-title-input").addEventListener("input", (e) => {
        item.title = e.target.value;
        saveDeckState();
      });
      row.querySelector(".deck-item-note-input").addEventListener("input", (e) => {
        item.note = e.target.value;
        saveDeckState();
        updateDeckSummaryOnly();
      });

      row.querySelector(".deck-mini-btn.up").addEventListener("click", () => {
        if (idx <= 0) return;
        const [moved] = deckState.items.splice(idx, 1);
        deckState.items.splice(idx - 1, 0, moved);
        saveDeckState();
        updateDeckUi();
      });
      row.querySelector(".deck-mini-btn.down").addEventListener("click", () => {
        if (idx >= deckState.items.length - 1) return;
        const [moved] = deckState.items.splice(idx, 1);
        deckState.items.splice(idx + 1, 0, moved);
        saveDeckState();
        updateDeckUi();
      });
      row.querySelector(".deck-mini-btn.del").addEventListener("click", () => {
        deckState.items.splice(idx, 1);
        saveDeckState();
        updateDeckUi();
      });

      // Drag & Drop reordering
      row.addEventListener("dragstart", (e) => {
        if (e.target.closest("input, textarea, button")) {
          e.preventDefault();
          return;
        }
        deckDragSrcIdx = idx;
        row.classList.add("dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(idx));
        }
      });
      row.addEventListener("dragover", (e) => {
        if (deckDragSrcIdx < 0 || deckDragSrcIdx === idx) return;
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        const isTop = (e.clientY - rect.top) < rect.height / 2;
        row.classList.toggle("drag-over-top", isTop);
        row.classList.toggle("drag-over-bottom", !isTop);
      });
      row.addEventListener("dragleave", () => {
        row.classList.remove("drag-over-top", "drag-over-bottom");
      });
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("drag-over-top", "drag-over-bottom");
        if (deckDragSrcIdx < 0 || deckDragSrcIdx === idx) return;
        const rect = row.getBoundingClientRect();
        const isTop = (e.clientY - rect.top) < rect.height / 2;
        let targetIdx = isTop ? idx : idx + 1;
        const [moved] = deckState.items.splice(deckDragSrcIdx, 1);
        if (deckDragSrcIdx < targetIdx) targetIdx -= 1;
        deckState.items.splice(targetIdx, 0, moved);
        deckDragSrcIdx = -1;
        saveDeckState();
        updateDeckUi();
      });
      row.addEventListener("dragend", () => {
        deckDragSrcIdx = -1;
        listEl.querySelectorAll(".deck-item").forEach((r) => r.classList.remove("dragging", "drag-over-top", "drag-over-bottom"));
      });
    });
  }

  function updateDeckUi() {
    const n = deckState.items.length;
    const hdrBtn = document.getElementById("btnOpenDeck");
    const hdrCount = document.getElementById("hdrDeckCount");
    const fab = document.getElementById("deckFab");
    const fabCount = document.getElementById("fabDeckCount");
    if (hdrCount) hdrCount.textContent = String(n);
    if (hdrBtn) hdrBtn.classList.toggle("has-items", n > 0);
    if (fabCount) fabCount.textContent = String(n);
    if (fab) fab.hidden = n === 0;
    renderDeckDrawer();
  }

  function openDeckDrawer() {
    renderDeckDrawer();
    const drawer = document.getElementById("deckDrawer");
    const backdrop = document.getElementById("deckBackdrop");
    if (drawer) {
      drawer.classList.add("open");
      drawer.setAttribute("aria-hidden", "false");
    }
    if (backdrop) backdrop.classList.add("open");
  }

  function closeDeckDrawer() {
    const drawer = document.getElementById("deckDrawer");
    const backdrop = document.getElementById("deckBackdrop");
    if (drawer) {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
    }
    if (backdrop) backdrop.classList.remove("open");
  }

  function resizePreviewSlide() {
    const modal = document.getElementById("deckPreviewModal");
    if (!modal || !modal.classList.contains("open")) return;
    const wrap = document.getElementById("deckPreviewStageWrap");
    const stage = document.getElementById("deckPreviewStage");
    const slideEl = stage?.querySelector(":scope > .deck-slide");
    if (!wrap || !stage || !slideEl) return;

    slideEl.style.transform = "none";
    const natW = slideEl.offsetWidth || 1122.5;
    const natH = slideEl.offsetHeight || 629.3;
    const availW = Math.max(200, wrap.clientWidth - 36);
    const availH = Math.max(150, wrap.clientHeight - 36);
    const scale = Math.min(availW / natW, availH / natH, 1.45);
    stage.style.width = Math.floor(natW * scale) + "px";
    stage.style.height = Math.floor(natH * scale) + "px";
    slideEl.style.transform = `scale(${scale})`;
  }

  function renderDeckPreview() {
    const { slides } = buildDeckSlides();
    if (slides.length === 0) {
      closeDeckPreview();
      return;
    }
    if (deckState.previewIdx >= slides.length) deckState.previewIdx = slides.length - 1;
    if (deckState.previewIdx < 0) deckState.previewIdx = 0;
    const idx = deckState.previewIdx;
    const stage = document.getElementById("deckPreviewStage");
    const counter = document.getElementById("deckPreviewCounter");
    const prevBtn = document.getElementById("btnDeckPrevSlide");
    const nextBtn = document.getElementById("btnDeckNextSlide");
    const strip = document.getElementById("deckPreviewStrip");

    if (counter) counter.textContent = `Slide ${idx + 1} de ${slides.length}`;
    if (prevBtn) prevBtn.disabled = idx === 0;
    if (nextBtn) nextBtn.disabled = idx >= slides.length - 1;
    if (stage) stage.innerHTML = renderDeckSlideHtml(slides[idx], idx, slides.length);
    if (strip) {
      strip.innerHTML = slides.map((s, sIdx) => `
        <button type="button" class="deck-strip-pill ${sIdx === idx ? "active" : ""}" data-sidx="${sIdx}">
          ${s.type === "cover" ? "Portada" : `Slide ${sIdx + 1}`}
        </button>
      `).join("");
      strip.querySelectorAll(".deck-strip-pill").forEach((b) => {
        b.addEventListener("click", () => {
          deckState.previewIdx = Number(b.dataset.sidx);
          renderDeckPreview();
        });
      });
    }
    resizePreviewSlide();
    requestAnimationFrame(resizePreviewSlide);
  }

  function openDeckPreview(startIdx = 0) {
    if (deckState.items.length === 0) {
      showDeckToast("Agregá al menos un elemento antes de abrir la vista previa.", false);
      return;
    }
    deckState.previewIdx = startIdx;
    const modal = document.getElementById("deckPreviewModal");
    if (modal) {
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
    }
    renderDeckPreview();
  }

  function closeDeckPreview() {
    const modal = document.getElementById("deckPreviewModal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function buildDeckPrintDom() {
    const printRoot = document.getElementById("deckPrintRoot");
    if (!printRoot) return 0;
    const { slides } = buildDeckSlides();
    if (slides.length === 0) return 0;
    printRoot.innerHTML = slides.map((s, idx) => renderDeckSlideHtml(s, idx, slides.length)).join("");
    return slides.length;
  }

  function cleanupDeckPrint() {
    document.body.classList.remove("printing-deck");
    const st = document.getElementById("deckPageStyle");
    if (st) st.remove();
    const printRoot = document.getElementById("deckPrintRoot");
    if (printRoot) printRoot.innerHTML = "";
  }

  async function printPresentationDeck() {
    if (deckState.items.length === 0) {
      showDeckToast("Agregá al menos un elemento antes de generar el PDF.", false);
      return;
    }
    const count = buildDeckPrintDom();
    if (!count) return;

    let styleEl = document.getElementById("deckPageStyle");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "deckPageStyle";
      styleEl.textContent = "@media print { @page { size: 297mm 167mm; margin: 0; } }";
      document.head.appendChild(styleEl);
    }

    const printRoot = document.getElementById("deckPrintRoot");
    const imgs = Array.from(printRoot.querySelectorAll("img"));
    await Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())));

    document.body.classList.add("printing-deck");
    const onDone = () => cleanupDeckPrint();
    window.addEventListener("afterprint", onDone, { once: true });
    requestAnimationFrame(() => {
      window.print();
    });
  }

  function resizeChartsInside(root) {
    if (!root) return;
    const doResize = () => {
      root.querySelectorAll("canvas").forEach((c) => {
        if (c.id && charts[c.id]) {
          try { charts[c.id].resize(); } catch (_) {}
        }
      });
    };
    requestAnimationFrame(() => {
      doResize();
      setTimeout(doResize, 80);
      setTimeout(doResize, 200);
    });
  }

  function buildFocusContextText() {
    const p = PERIODOS[state.pIdx];
    const res = resolveBaseAndMeses(state.pIdx, state.base);
    const baseMap = { acum: `Acumulado (${res.meses}m)`, estanco: "Trimestre Estanco (3m)", ltm: "Últimos 12 Meses (LTM)" };
    const monMap = { cierre: "Moneda de cierre", const: `IPC ${PERIODOS[nP - 1]?.label || ""}` };
    const consolMap = { madre: "Empresa Madre (RT 21)", vpp: "Consolidado 100%", bruto: "Suma simple" };
    const parts = [
      p ? p.label : "",
      baseMap[res.base] || res.base,
      monMap[state.moneda] || state.moneda,
      `Unidad ${unitSuffix()}`,
    ];
    if (state.activeTab === "grupol2") {
      parts.splice(3, 0, consolMap[state.consol] || state.consol);
      parts.push("Sección: Grupo L2");
      parts.push(state.l2ShareBasis === "neto_vpp" ? "Composición: Aporte Neto VPP" : "Composición: Suma Simple");
    } else if (state.activeTab === "personas") {
      parts.push("Sección: Personas");
      parts.push(state.perUniverse === "excl" ? "Solo Exclusivas" : "Todo el Ramo");
      if (state.perScopeType === "ramo" && state.perScopeCod) parts.push(`Ramo: ${PERSONAS_RAMO_LABELS[state.perScopeCod] || state.perScopeCod}`);
      else if (state.perScopeType === "subramo" && state.perScopeCod) {
        const sr = PERSONAS_SUBRAMOS.find((s) => s.cod === state.perScopeCod);
        parts.push(`Subramo: ${sr ? sr.desc : state.perScopeCod}`);
      }
      if (state.perExclZurich) parts.push("Sin Zurich Int. Life");
    } else if (state.activeTab === "retiro") {
      parts.push("Sección: Retiro");
      if (state.retScopeCods.length > 0) {
        const srNames = state.retScopeCods.map((c) => RETIRO_SUB_LABELS[c] || c);
        parts.push(`${srNames.length > 1 ? "Subramos" : "Subramo"}: ${srNames.join(" + ")}`);
      }
      const isRent = state.retScopeCods.length > 0 && state.retScopeCods.every((c) => c === "2.070.01" || c === "2.070.02");
      parts.push(`Top 10 por: ${(isRent || state.retTopBy === "comp_tec") ? "Reservas Mat." : "Primas Emit."}`);
    } else if (state.activeTab === "balance") {
      parts.push("Sección: Balance Contable SSN");
    } else {
      parts.splice(3, 0, consolMap[state.consol] || state.consol);
      if (state.tipo) parts.push(`Tipo: ${state.tipo}`);
      if (state.granRamo) parts.push(`Ramo: ${GRAN_LABELS[state.granRamo] || state.granRamo}`);
      if (state.constitucion) parts.push(`Const.: ${state.constitucion}`);
      if (state.grupo) parts.push(`Grupo: ${state.grupo}`);
    }
    return parts.filter(Boolean).join(" · ");
  }

  function openFocusModal(el, triggerBtn) {
    if (!el || !el.parentNode) return;
    if (focusState.el === el) return;
    if (focusState.el) closeFocusModal();

    const modal = document.getElementById("focusModal");
    const stage = document.getElementById("focusStage");
    const body = document.getElementById("focusBody");
    const ctxPill = document.getElementById("focusContextPill");
    if (!modal || !stage || !body) return;

    const placeholder = document.createComment("focus-placeholder");
    el.parentNode.insertBefore(placeholder, el);
    focusState.el = el;
    focusState.placeholder = placeholder;
    focusState.triggerBtn = triggerBtn || null;

    el.classList.add("is-focused");
    stage.classList.toggle("focus-stage-compact", el.classList.contains("kpi-card"));
    body.appendChild(el);
    if (ctxPill) ctxPill.textContent = buildFocusContextText();

    document.body.classList.add("focus-open");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    resizeChartsInside(el);

    const closeBtn = document.getElementById("focusCloseBtn");
    if (closeBtn) {
      requestAnimationFrame(() => closeBtn.focus({ preventScroll: true }));
    }
  }

  function closeFocusModal() {
    if (!focusState.el) return;
    const { el, placeholder, triggerBtn } = focusState;
    focusState.el = null;
    focusState.placeholder = null;
    focusState.triggerBtn = null;

    const modal = document.getElementById("focusModal");
    const stage = document.getElementById("focusStage");

    el.classList.remove("is-focused");
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(el, placeholder);
      placeholder.remove();
    } else if (el.parentNode) {
      el.parentNode.removeChild(el);
    }

    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
    if (stage) stage.classList.remove("focus-stage-compact");
    document.body.classList.remove("focus-open");

    if (el.isConnected) resizeChartsInside(el);
    if (triggerBtn && triggerBtn.isConnected) {
      requestAnimationFrame(() => triggerBtn.focus({ preventScroll: true }));
    }
  }

  function makeDeckAddBtn(targetEl, isCorner) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "deck-add-btn" + (isCorner ? " deck-btn-corner" : "");
    btn.title = "Agregar a la presentación PDF";
    btn.setAttribute("aria-label", "Agregar a la presentación PDF");
    btn.innerHTML = DECK_ADD_SVG;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      captureDeckElement(targetEl, { triggerBtn: btn });
    });
    return btn;
  }

  function makeFocusBtn(targetEl, isCorner) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "focus-btn" + (isCorner ? " focus-btn-corner" : "");
    btn.title = "Ampliar a pantalla completa (Modo Presentación)";
    btn.setAttribute("aria-label", "Ampliar a pantalla completa");
    btn.innerHTML = EXPAND_SVG;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openFocusModal(targetEl, btn);
    });
    return btn;
  }

  function attachExpandButtons(root) {
    const scope = root || document;
    scope.querySelectorAll(".card:not([data-no-expand])").forEach((card) => {
      const hdr = Array.from(card.children).find((el) => el.classList && el.classList.contains("card-header"));
      if (!hdr) return;
      const targetSlot = Array.from(hdr.children).find((el) => el.classList && el.classList.contains("card-header-right")) || hdr;
      let actionGrp = targetSlot.querySelector(":scope > .card-action-group");
      if (!actionGrp) {
        actionGrp = document.createElement("div");
        actionGrp.className = "card-action-group";
        targetSlot.appendChild(actionGrp);
      }
      if (!actionGrp.querySelector(":scope > .deck-add-btn")) {
        actionGrp.appendChild(makeDeckAddBtn(card, false));
      }
      if (!actionGrp.querySelector(":scope > .focus-btn")) {
        actionGrp.appendChild(makeFocusBtn(card, false));
      }
    });
    scope.querySelectorAll(".focus-block:not([data-no-expand])").forEach((block) => {
      const hdr = Array.from(block.children).find((el) => el.classList && el.classList.contains("focus-block-hdr"));
      if (!hdr) return;
      let actionGrp = hdr.querySelector(":scope > .card-action-group");
      if (!actionGrp) {
        actionGrp = document.createElement("div");
        actionGrp.className = "card-action-group";
        hdr.appendChild(actionGrp);
      }
      if (!actionGrp.querySelector(":scope > .deck-add-btn")) {
        actionGrp.appendChild(makeDeckAddBtn(block, false));
      }
      if (!actionGrp.querySelector(":scope > .focus-btn")) {
        actionGrp.appendChild(makeFocusBtn(block, false));
      }
    });
    scope.querySelectorAll(".kpi-card:not([data-no-expand])").forEach((kpi) => {
      if (!kpi.querySelector(":scope > .deck-btn-corner")) {
        kpi.appendChild(makeDeckAddBtn(kpi, true));
      }
      if (!kpi.querySelector(":scope > .focus-btn-corner")) {
        kpi.appendChild(makeFocusBtn(kpi, true));
      }
    });
  }

  // ==================== NAVIGATION & EVENTS ====================
  function renderActiveTab() {
    updateHeaderAndAlerts();
    if (state.activeTab === "panorama") renderPanorama();
    else if (state.activeTab === "grupol2") renderGrupoL2();
    else if (state.activeTab === "rankings") renderRankings();
    else if (state.activeTab === "ramos") renderRamos();
    else if (state.activeTab === "personas") renderPersonas();
    else if (state.activeTab === "retiro") renderRetiro();
    else if (state.activeTab === "grupos") renderGrupos();
    else if (state.activeTab === "ficha") renderFicha();
    else if (state.activeTab === "balance") renderBalanceContable();
    else if (state.activeTab === "mensual") renderPulsoMensual();
    else if (state.activeTab === "metodologia") renderMetodologia();
  }

  function switchTab(tabId) {
    closeFocusModal();
    state.activeTab = tabId;
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tabId);
    });
    document.querySelectorAll(".tab-pane").forEach((p) => {
      p.classList.toggle("active", p.id === "tab-" + tabId);
    });
    renderActiveTab();
    if (window.scrollY > 90) {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }

  function bindEvents() {
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.addEventListener("click", () => switchTab(b.dataset.tab));
    });

    document.getElementById("fPeriodo").addEventListener("change", (e) => { state.pIdx = Number(e.target.value); renderActiveTab(); });
    document.getElementById("fBase").addEventListener("change", (e) => { state.base = e.target.value; renderActiveTab(); });
    document.getElementById("fMoneda").addEventListener("change", (e) => { state.moneda = e.target.value; renderActiveTab(); });
    document.getElementById("fTipo").addEventListener("change", (e) => { state.tipo = e.target.value; renderActiveTab(); });
    document.getElementById("fGranRamo").addEventListener("change", (e) => { state.granRamo = e.target.value; renderActiveTab(); });
    document.getElementById("fConst").addEventListener("change", (e) => { state.constitucion = e.target.value; renderActiveTab(); });
    document.getElementById("fGrupo").addEventListener("change", (e) => { state.grupo = e.target.value; renderActiveTab(); });
    document.getElementById("fConsol").addEventListener("change", (e) => { state.consol = e.target.value; renderActiveTab(); });
    document.getElementById("fUnidad").addEventListener("change", (e) => { state.unidad = e.target.value; renderActiveTab(); });

    document.getElementById("btnResetFilters").addEventListener("click", () => {
      state.pIdx = nP - 1;
      state.base = "acum";
      state.moneda = "cierre";
      state.tipo = "";
      state.granRamo = "";
      state.constitucion = "";
      state.grupo = "";
      state.consol = "madre";
      state.unidad = "M";
      document.getElementById("fPeriodo").value = state.pIdx;
      document.getElementById("fBase").value = state.base;
      document.getElementById("fMoneda").value = state.moneda;
      document.getElementById("fTipo").value = "";
      document.getElementById("fGranRamo").value = "";
      document.getElementById("fConst").value = "";
      document.getElementById("fGrupo").value = "";
      document.getElementById("fConsol").value = state.consol;
      document.getElementById("fUnidad").value = state.unidad;
      renderActiveTab();
    });

    // Tab 2: Grupo L2 events
    document.querySelectorAll("#l2BasisTabs .seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        state.l2ShareBasis = b.dataset.l2basis;
        renderGrupoL2();
      });
    });
    const l2EvoEl = document.getElementById("l2EvoMetric");
    if (l2EvoEl) {
      l2EvoEl.addEventListener("change", (e) => {
        state.l2EvoMetric = e.target.value;
        renderGrupoL2();
      });
    }
    document.querySelectorAll("#l2EvoUnitTabs .seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        state.l2EvoMode = b.dataset.l2evomode;
        renderGrupoL2();
      });
    });

    // Tab 3 events (Rankings)
    document.querySelectorAll("#rkMetricTabs .seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll("#rkMetricTabs .seg-btn").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        state.rkMode = b.dataset.mode;
        const defaultSorts = {
          prod: { key: "emit_sd", dir: "desc" },
          res: { key: isGranRamoTechOnly() ? "res_tec" : "res_ej", dir: "desc" },
          sin: { key: "comb_pct", dir: "asc" },
          gto: { key: "gto_pct", dir: "asc" },
          fin: { key: "ret_inv_pct", dir: "desc" },
          solv: { key: "pn", dir: "desc" },
        };
        state.rkSort = defaultSorts[state.rkMode];
        renderRankings();
      });
    });
    document.getElementById("rkSearch").addEventListener("input", (e) => { state.rkSearch = e.target.value; renderRankings(); });
    document.getElementById("rkLimit").addEventListener("change", (e) => { state.rkLimit = Number(e.target.value); renderRankings(); });
    document.getElementById("rkHighlightLS").addEventListener("change", (e) => { state.rkHighlightLS = e.target.checked; renderRankings(); });
    document.getElementById("rkExclZurichLife").addEventListener("change", (e) => { state.rkExclZurichLife = e.target.checked; renderRankings(); });

    // Tab 3 events
    document.querySelectorAll("#rmLevelTabs .seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        state.rmLevel = b.dataset.level;
        renderRamos();
      });
    });
    document.querySelectorAll("#rmGranFilterWrap .seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        if (b.disabled) return;
        document.querySelectorAll("#rmGranFilterWrap .seg-btn").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        state.rmGran = b.dataset.gran;
        state.rmSelectedSubCod = "";
        renderRamos();
      });
    });

    // Tab 4: Personas events
    document.querySelectorAll("#perViewTabs .seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        state.perView = b.dataset.view;
        renderPersonas();
      });
    });
    document.querySelectorAll("#perUnivTabs .seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        if (b.disabled) return;
        state.perUniverse = b.dataset.univ;
        renderPersonas();
      });
    });
    document.getElementById("perExclZurich").addEventListener("change", (e) => {
      state.perExclZurich = e.target.checked;
      renderPersonas();
    });
    document.getElementById("perEvoMetric").addEventListener("change", (e) => {
      state.perEvoMetric = e.target.value;
      renderPersonas();
    });
    document.getElementById("btnPerRkToggle").addEventListener("click", () => {
      state.perRkShowAll = !state.perRkShowAll;
      renderPersonas();
    });
    document.getElementById("btnPerCanToggle")?.addEventListener("click", () => {
      state.perCanShowAll = !state.perCanShowAll;
      renderPersonas();
    });
    document.getElementById("ssnCanalesSeg")?.addEventListener("change", (e) => {
      state.ssnCanSeg = e.target.value;
      renderPersonas();
    });
    document.querySelectorAll("#ssnCanProvTabs .seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        state.ssnCanProvMode = b.dataset.provmode;
        renderPersonas();
      });
    });
    document.getElementById("perPolRamoSel")?.addEventListener("change", (e) => {
      state.perPolRamo = e.target.value;
      renderPersonas();
    });
    document.querySelectorAll("#perPolCruceTabs .seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        state.perPolCruceMode = b.dataset.crucemode;
        renderPersonas();
      });
    });
    document.getElementById("perPolRkSel")?.addEventListener("change", (e) => {
      state.perPolRkKey = e.target.value;
      renderPersonas();
    });

    // Tab 5: Retiro events
    document.querySelectorAll("#retViewTabs .seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        state.retView = b.dataset.view;
        renderRetiro();
      });
    });
    document.querySelectorAll("#retTopByTabs .seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        if (b.disabled) return;
        state.retTopBy = b.dataset.topby;
        renderRetiro();
      });
    });
    document.getElementById("retScatterMode").addEventListener("change", (e) => {
      state.retScatterMode = e.target.value;
      renderRetiro();
    });
    document.getElementById("retEvoMetric").addEventListener("change", (e) => {
      state.retEvoMetric = e.target.value;
      renderRetiro();
    });
    document.getElementById("btnRetRkToggle").addEventListener("click", () => {
      state.retRkShowAll = !state.retRkShowAll;
      renderRetiro();
    });
    document.querySelectorAll("#retFnoUnitTabs .seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        state.retFnoUnit = b.dataset.fnounit;
        renderRetiro();
      });
    });
    document.querySelectorAll("#retTtModeTabs .seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        state.retTtMode = b.dataset.ttmode;
        renderRetiro();
      });
    });
    document.getElementById("retTtHoriz")?.addEventListener("change", (e) => {
      state.retTtHoriz = e.target.value;
      renderRetiro();
    });
    document.getElementById("retTicketMode")?.addEventListener("change", (e) => {
      state.retTicketMode = e.target.value;
      renderRetiro();
    });
    document.getElementById("retDemoSeg")?.addEventListener("change", (e) => {
      state.retDemoSeg = e.target.value;
      renderRetiro();
    });

    // Tab 10: Pulso Mensual events
    document.querySelectorAll("#menUnitModeTabs .seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        state.menUnitMode = b.dataset.menmode;
        renderPulsoMensual();
      });
    });
    document.getElementById("menHoriz")?.addEventListener("change", (e) => {
      state.menHoriz = e.target.value;
      renderPulsoMensual();
    });

    // Tab 6 events
    document.querySelectorAll("#tab-grupos [data-gmode]").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll("#tab-grupos [data-gmode]").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        state.grpMode = b.dataset.gmode;
        renderGrupos();
      });
    });

    // Tab 7 events (fichaEntityCombo y fichaPeerCombo gestionan sus propios eventos)
    document.getElementById("fichaTopCrit").addEventListener("change", (e) => {
      state.fichaTopCrit = e.target.value;
      autoSelectPeers();
      renderFicha();
    });
    document.getElementById("btnAutoPeers").addEventListener("click", () => { autoSelectPeers(); renderFicha(); });
    document.getElementById("btnClearPeers").addEventListener("click", () => { state.fichaPeers = []; renderFicha(); });
    const btnFichaToBal = document.getElementById("btnFichaToBalance");
    if (btnFichaToBal) {
      btnFichaToBal.addEventListener("click", () => {
        if (state.fichaEntity) openBalanceEntity(state.fichaEntity);
      });
    }
    document.getElementById("fichaEvoMetric").addEventListener("change", (e) => { state.fichaEvoMetric = e.target.value; renderFicha(); });
    document.getElementById("fichaExclZurich").addEventListener("change", (e) => { state.fichaExclZurich = e.target.checked; renderFicha(); });
    document.querySelectorAll("[data-quick-ent]").forEach((b) => {
      b.addEventListener("click", () => openFichaEntity(b.dataset.quickEnt));
    });

    // Tab 9 events: Balance Contable (Plan de Cuentas SSN)
    document.querySelectorAll("#balStmtTabs .seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        state.balStmt = b.dataset.balstmt;
        renderBalanceContable();
      });
    });
    document.querySelectorAll("#balQuickLS .bal-quick-btn").forEach((b) => {
      b.addEventListener("click", () => {
        state.balEntity = b.dataset.balEnt;
        renderBalanceContable();
      });
    });
    const btnBalToFicha = document.getElementById("btnBalToFicha");
    if (btnBalToFicha) {
      btnBalToFicha.addEventListener("click", () => {
        if (state.balEntity && state.balEntity !== "MKT:ALL") openFichaEntity(state.balEntity);
      });
    }
    const balSearchEl = document.getElementById("balSearch");
    if (balSearchEl) {
      balSearchEl.addEventListener("input", (e) => {
        state.balSearch = e.target.value;
        renderBalanceContable();
      });
    }
    const balHideZeroEl = document.getElementById("balHideZero");
    if (balHideZeroEl) {
      balHideZeroEl.addEventListener("change", (e) => {
        state.balHideZero = e.target.checked;
        renderBalanceContable();
      });
    }
    const balStrictEl = document.getElementById("balStrictLevels");
    if (balStrictEl) {
      balStrictEl.addEventListener("change", (e) => {
        state.balStrictLevels = e.target.checked;
        renderBalanceContable();
      });
    }

    // Focus Modal (Modo Presentación)
    const focusCloseBtn = document.getElementById("focusCloseBtn");
    const focusBackdrop = document.getElementById("focusBackdrop");
    const focusAddDeckBtn = document.getElementById("focusAddDeckBtn");
    if (focusCloseBtn) focusCloseBtn.addEventListener("click", closeFocusModal);
    if (focusBackdrop) focusBackdrop.addEventListener("click", closeFocusModal);
    if (focusAddDeckBtn) {
      focusAddDeckBtn.addEventListener("click", () => {
        if (focusState.el) captureDeckElement(focusState.el, { triggerBtn: focusAddDeckBtn });
      });
    }

    // Deck Builder events
    document.querySelectorAll(".deck-panel-add-btn").forEach((b) => {
      b.addEventListener("click", () => {
        const target = document.getElementById(b.dataset.deckPanelFor);
        if (target) {
          captureDeckElement(target, {
            forceKind: "kpi-panel",
            panelTitle: b.dataset.deckPanelTitle,
            triggerBtn: b,
          });
        }
      });
    });
    const btnOpenDeck = document.getElementById("btnOpenDeck");
    const btnFabOpenDeck = document.getElementById("btnFabOpenDeck");
    const fabQuickPdf = document.getElementById("fabQuickPdf");
    const btnDeckClose = document.getElementById("btnDeckClose");
    const deckBackdrop = document.getElementById("deckBackdrop");
    const btnDeckClear = document.getElementById("btnDeckClear");
    const deckIncludeCover = document.getElementById("deckIncludeCover");
    const deckTitleInput = document.getElementById("deckTitleInput");
    const deckSubtitleInput = document.getElementById("deckSubtitleInput");
    const deckKpiGroup = document.getElementById("deckKpiGroup");
    const btnDeckPreview = document.getElementById("btnDeckPreview");
    const btnDeckPrint = document.getElementById("btnDeckPrint");
    const btnDeckPreviewClose = document.getElementById("btnDeckPreviewClose");
    const btnDeckPrevSlide = document.getElementById("btnDeckPrevSlide");
    const btnDeckNextSlide = document.getElementById("btnDeckNextSlide");
    const btnDeckPreviewPrint = document.getElementById("btnDeckPreviewPrint");

    if (btnOpenDeck) btnOpenDeck.addEventListener("click", openDeckDrawer);
    if (btnFabOpenDeck) btnFabOpenDeck.addEventListener("click", openDeckDrawer);
    if (fabQuickPdf) fabQuickPdf.addEventListener("click", printPresentationDeck);
    if (btnDeckClose) btnDeckClose.addEventListener("click", closeDeckDrawer);
    if (deckBackdrop) deckBackdrop.addEventListener("click", closeDeckDrawer);
    if (btnDeckClear) {
      btnDeckClear.addEventListener("click", () => {
        if (deckState.items.length === 0) return;
        deckState.items = [];
        saveDeckState();
        updateDeckUi();
        showDeckToast("Lista de presentación vaciada.", false);
      });
    }
    if (deckIncludeCover) {
      deckIncludeCover.addEventListener("change", (e) => {
        deckState.includeCover = e.target.checked;
        saveDeckState();
        updateDeckUi();
      });
    }
    if (deckTitleInput) {
      deckTitleInput.addEventListener("input", (e) => {
        deckState.coverTitle = e.target.value;
        saveDeckState();
      });
    }
    if (deckSubtitleInput) {
      deckSubtitleInput.addEventListener("input", (e) => {
        deckState.coverSubtitle = e.target.value;
        saveDeckState();
      });
    }
    if (deckKpiGroup) {
      deckKpiGroup.addEventListener("change", (e) => {
        deckState.kpiGroupSize = Number(e.target.value) || 4;
        saveDeckState();
        updateDeckUi();
      });
    }
    if (btnDeckPreview) btnDeckPreview.addEventListener("click", () => openDeckPreview(0));
    if (btnDeckPrint) btnDeckPrint.addEventListener("click", printPresentationDeck);
    if (btnDeckPreviewClose) btnDeckPreviewClose.addEventListener("click", closeDeckPreview);
    if (btnDeckPrevSlide) {
      btnDeckPrevSlide.addEventListener("click", () => {
        if (deckState.previewIdx > 0) {
          deckState.previewIdx -= 1;
          renderDeckPreview();
        }
      });
    }
    if (btnDeckNextSlide) {
      btnDeckNextSlide.addEventListener("click", () => {
        const { slides } = buildDeckSlides();
        if (deckState.previewIdx < slides.length - 1) {
          deckState.previewIdx += 1;
          renderDeckPreview();
        }
      });
    }
    if (btnDeckPreviewPrint) btnDeckPreviewPrint.addEventListener("click", printPresentationDeck);
    window.addEventListener("resize", resizePreviewSlide);

    document.addEventListener("keydown", (e) => {
      const prevModal = document.getElementById("deckPreviewModal");
      const previewOpen = prevModal && prevModal.classList.contains("open");
      if (previewOpen) {
        if (e.key === "Escape") { closeDeckPreview(); return; }
        if (e.key === "ArrowLeft" && deckState.previewIdx > 0) {
          deckState.previewIdx -= 1;
          renderDeckPreview();
          return;
        }
        if (e.key === "ArrowRight") {
          const { slides } = buildDeckSlides();
          if (deckState.previewIdx < slides.length - 1) {
            deckState.previewIdx += 1;
            renderDeckPreview();
          }
          return;
        }
      }
      const drawerEl = document.getElementById("deckDrawer");
      if (e.key === "Escape" && drawerEl && drawerEl.classList.contains("open")) {
        closeDeckDrawer();
        return;
      }
      if (e.key === "Escape" && focusState.el) closeFocusModal();
    });
  }

  initSelectors();
  loadDeckState();
  bindEvents();
  attachExpandButtons(document);
  updateDeckUi();
  renderActiveTab();
})();
