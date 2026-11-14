// Exportações do torneio: tabela de jogos (para imprimir/preencher) e relatório completo,
// em PDF (jsPDF + AutoTable) e Excel estilizado (ExcelJS). Bibliotecas carregadas só quando usadas.
import * as C from "./torneio-core.js";
import { resumo as resumoMesa } from "./basquete.js";
const PTS = () => C.REGRA.pontosSets;

const LIBS = {
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  autotable: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
  exceljs: "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js",
};
const carregados = {};
function script(url) {
  return carregados[url] || (carregados[url] = new Promise((ok, erro) => {
    const s = document.createElement("script"); s.src = url; s.onload = ok; s.onerror = () => { delete carregados[url]; erro(new Error("falha ao carregar " + url)); };
    document.head.append(s);
  }));
}
async function libPDF() { await script(LIBS.jspdf); await script(LIBS.autotable); return window.jspdf.jsPDF; }
async function libXLSX() { await script(LIBS.exceljs); return window.ExcelJS; }

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = nome; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const arquivo = (t, tipo) => (t.nome || "torneio").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() + "-" + tipo;
const fmtData = s => { if (!s) return ""; const [y, m, d] = s.split("-"); return d + "/" + m + "/" + y; };
const f1 = v => (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
const hoje = () => { const d = new Date(); return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear(); };
const hexArgb = h => "FF" + h.replace("#", "").toUpperCase();
const ORDEM_FASES = C.ORDEM_FASES;

// logo do app em data URL (para PDF e Excel)
async function logoDataUrl(url, fundo) {
  try {
    const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url; });
    const k = Math.min(1, 420 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext("2d"); if (fundo) { g.fillStyle = fundo; g.fillRect(0, 0, c.width, c.height); } g.drawImage(img, 0, 0, c.width, c.height);
    return { url: c.toDataURL("image/png"), w: c.width, h: c.height };
  } catch (e) { return null; }
}

/* ======================= DADOS ======================= */
export function montarDados(T, jogos, esporte) {
  const BIR = esporte === "biribol";
  const res = j => C.resultado(esporte, j);
  const eq = id => T.equipes.find(e => e.id === id);
  const PH = new Set(); // rótulos de vagas ainda não definidas ("1º do grupo A")
  const nome = id => (eq(id) || {}).nome || (PH.has(id) ? id : "");
  const faseDe = C.faseEstat;
  const reais = jogos.filter(j => !j.wo);
  const fim = reais.filter(j => j.status === "encerrado");
  // numeração dos jogos por etapa (classificação primeiro, depois mata-mata por rodada)
  const numero = {};
  T.etapas.forEach((et, ei) => {
    let n = 1;
    jogos.filter(j => j.etapa === ei && j.fase === "grupo").sort((a, b) => a.grupo - b.grupo || a.rodada - b.rodada || a.ordem - b.ordem).forEach(j => numero[j.id] = n++);
    jogos.filter(j => j.etapa === ei && j.fase === "mata" && j.serie == null).sort((a, b) => a.rodada - b.rodada || a.ordem - b.ordem).forEach(j => { if (!j.wo) numero[j.id] = n++; });
    jogos.filter(j => j.etapa === ei && j.serie != null).sort((a, b) => a.serie - b.serie || a.rodada - b.rodada || a.ordem - b.ordem).forEach(j => { if (!j.wo) numero[j.id] = n++; });
    jogos.filter(j => j.etapa === ei && j.fase === "livre").forEach(j => numero[j.id] = j.num || n++);
  });
  // estrutura de cada etapa
  const etapas = T.etapas.map((et, ei) => {
    const js = jogos.filter(j => j.etapa === ei);
    const grupos = C.gruposDe(et).map((g, gi) => {
      const jg = js.filter(j => j.fase === "grupo" && j.grupo === gi).sort((a, b) => a.rodada - b.rodada || a.ordem - b.ordem);
      return { letra: C.letraGrupo(gi), equipes: g, jogos: jg, classif: C.classificacao(esporte, g, jg, nome), completo: jg.length > 0 && jg.every(j => j.status === "encerrado") };
    });
    let n = Math.max(0, ...js.map(j => numero[j.id] || 0)) + 1, pid = 0;
    // chave real (jogos já criados)
    const chaveReal = (lista, titulo) => {
      const main = lista.filter(j => !j.perd), t = lista.find(j => j.perd);
      const item = j => {
        const r2 = res(j), fimJ = j.status === "encerrado";
        const rot = (lado, idx) => j[lado] ? nome(j[lado]) : j.de ? "Vencedor do jogo " + (numero[j.de[idx]] || "") : j.perd ? "Perdedor do jogo " + (numero[j.perd[idx]] || "") : "";
        return { id: j.id, num: numero[j.id], fase: j.faseNome, a: rot("a", 0), b: j.wo ? "(passa direto)" : rot("b", 1), bye: !!j.wo,
          pa: fimJ && !j.wo ? r2.pa : null, pb: fimJ && !j.wo ? r2.pb : null, sa: BIR && fimJ && !j.wo ? r2.sa : null, sb: BIR && fimJ && !j.wo ? r2.sb : null,
          venc: fimJ ? nome(r2.venc) : "", sets: BIR && fimJ ? (j.sets || []) : null };
      };
      const rs = [...new Set(main.map(j => j.rodada))].sort((a, b) => a - b);
      return { titulo, rodadas: rs.map(r => main.filter(j => j.rodada === r).sort((a, b) => a.ordem - b.ordem).map(item)), terceiro: t ? item(t) : null, podio: C.podioMata(esporte, lista).map(nome), previsto: false };
    };
    // chave prevista: "1º do grupo A x 2º do grupo B", resto em branco
    const chavePrevista = (qual, titulo, pre) => {
      qual.forEach(q => PH.add(q.rot));
      const est = C.estruturaChave(qual, () => "pv" + ei + "-" + (pid++)), by = {};
      const lbl = id => by[id].bye ? by[id].venc : "Vencedor do jogo " + by[id].num;
      const rodadas = est.rodadas.map((rod, ri) => rod.map(m => {
        const fase = pre + C.nomeFase(rod.length);
        const it = ri === 0 ? { num: m.bye ? null : n++, fase, a: m.x ? m.x.rot : m.y.rot, b: m.bye ? "(passa direto)" : m.y.rot, bye: m.bye, pa: null, pb: null, venc: m.bye ? (m.x || m.y).rot : "" }
          : { num: n++, fase, a: lbl(m.de[0]), b: lbl(m.de[1]), pa: null, pb: null, venc: "" };
        by[m.id] = it; return it;
      }));
      const t = est.terceiro;
      return { titulo, rodadas, terceiro: t ? { num: n++, fase: pre ? pre + "3º lugar" : C.TERCEIRO, a: "Perdedor do jogo " + by[t.perd[0]].num, b: "Perdedor do jogo " + by[t.perd[1]].num, pa: null, pb: null, venc: "" } : null, podio: [], previsto: true };
    };
    const rrSerie = (si, eqs, jg, previsto) => ({ titulo: C.SERIES[si], letra: C.SERIES[si], serie: si, equipes: eqs, jogos: jg, classif: C.classificacao(esporte, eqs, jg, nome), passam: 3, previsto,
      completo: jg.length > 0 && jg.every(j => j.status === "encerrado") });
    grupos.forEach(g => { g.titulo = "Grupo " + g.letra; g.passam = et.classificam || 2; });
    const chaves = [], seriesRR = [], podios = [];
    const mata = js.filter(j => j.fase === "mata" && j.serie == null), series = et.series || [];
    if (mata.length) chaves.push(chaveReal(mata, "Mata-mata"));
    const livre = js.filter(j => j.fase === "livre").sort((a, b) => (a.num || 0) - (b.num || 0));
    if (livre.length) {
      const rotL = cod => { const o = C.origLivre(cod); return o ? (o.t === "v" ? "Vencedor do jogo " : "Perdedor do jogo ") + (numero[o.id] || "") : ""; };
      const quando = j => [fmtData(j.data || et.data).slice(0, 5), j.hora || et.hora, et.localUnico === false && j.local ? j.local : ""].filter(Boolean).join(" ");
      const item = j => { const r2 = res(j), fimJ = j.status === "encerrado";
        return { id: j.id, num: numero[j.id], fase: j.faseNome + (quando(j) ? " · " + quando(j) : ""), a: j.a ? nome(j.a) : rotL(j.orig && j.orig.a), b: j.b ? nome(j.b) : rotL(j.orig && j.orig.b), bye: false,
          pa: fimJ ? r2.pa : null, pb: fimJ ? r2.pb : null, sa: BIR && fimJ ? r2.sa : null, sb: BIR && fimJ ? r2.sb : null, venc: fimJ ? nome(r2.venc) : "", sets: BIR && fimJ ? (j.sets || []) : null }; };
      chaves.push({ titulo: "Jogos", livre: true, rodadas: [livre.map(item)], terceiro: null, podio: livre.some(j => j.papel) ? C.podioLivre(esporte, livre).map(nome) : [], previsto: false });
    }
    series.forEach((sr, si) => {
      const sj = js.filter(j => j.serie === si).sort((a, b) => a.rodada - b.rodada || a.ordem - b.ordem);
      if (sr.tipo === "todos") seriesRR.push(rrSerie(si, sr.equipes, sj, false)); else chaves.push({ ...chaveReal(sj, C.SERIES[si]), serie: si });
    });
    const previsto = grupos.length > 0 && !mata.length && !series.length;
    if (previsto && et.formato === "series") {
      const q = Math.min(3, et.classificam || 3);
      for (let p = 0; p < q; p++) {
        const qual = grupos.map((g, gi) => ({ rot: (p + 1) + "º do grupo " + g.letra, grupo: null }));
        if (!qual.length) continue;
        const tipo = et.disputaSeries === "todos" && qual.length >= 3 ? "todos" : C.tipoSerie(qual.length);
        if (tipo === "todos") {
          qual.forEach(x => PH.add(x.rot));
          const jg = []; C.todosContraTodos(qual.map(x => x.rot)).forEach((par, r) => par.forEach(([a, b], o) => { const id = "pv" + ei + "-" + (pid++); numero[id] = n++; jg.push({ id, etapa: ei, fase: "serie", serie: p, rodada: r + 1, ordem: o, a, b, faseNome: C.SERIES[p], status: "agendado" }); }));
          seriesRR.push(rrSerie(p, qual.map(x => x.rot), jg, true));
        } else chaves.push({ ...chavePrevista(qual, C.SERIES[p], C.SERIES[p] + " · "), serie: p });
      }
    } else if (previsto) {
      const q = et.classificam || 2, qual = [];
      for (let p = 1; p <= q; p++) grupos.forEach((g, gi) => qual.push({ rot: p + "º do grupo " + g.letra, grupo: gi, pos: p }));
      chaves.push(chavePrevista(qual, "Mata-mata", ""));
    }
    chaves.sort((a, b) => (a.serie ?? -1) - (b.serie ?? -1));
    chaves.forEach(c => { if (!c.livre || c.podio.length) podios.push({ titulo: c.livre ? "Pódio" : c.titulo, serie: c.serie, p: c.podio }); });
    seriesRR.forEach(sr => podios.push({ titulo: sr.titulo, serie: sr.serie, p: sr.previsto ? [] : C.podioSerie(esporte, { tipo: "todos", equipes: sr.equipes }, sr.jogos, nome).map(nome) }));
    podios.sort((a, b) => (a.serie ?? -1) - (b.serie ?? -1));
    const campea = (podios[0] && podios[0].p[0]) || "";
    return { ...et, idx: ei, grupos, chaves, seriesRR, tabelas: [...grupos, ...seriesRR.sort((a, b) => a.serie - b.serie)], podios, campea, previsto, vazio: !grupos.length && !chaves.length && !seriesRR.length };
  });
  // estatísticas
  const sa = C.statsAtletas(fim);
  const jogosEq = {}; fim.forEach(j => { jogosEq[j.a] = (jogosEq[j.a] || 0) + 1; jogosEq[j.b] = (jogosEq[j.b] || 0) + 1; });
  const atletas = T.equipes.flatMap(e => (e.atletas || []).map(a => { const s = sa[a.id] || { p: 0, b: 0, as: 0 }; const nj = jogosEq[e.id] || 0; return { ...a, nome: a.nome + (e.capitao === a.id ? " (C)" : ""), equipe: e.nome, eid: e.id, p: s.p, b: s.b, as: s.as, c3: s.c3 || 0, c2: s.c2 || 0, c1: s.c1 || 0, nj, med: nj ? s.p / nj : 0 }; }));
  const pts = {}, vd = {}, medEq = {};
  T.equipes.forEach(e => { pts[e.id] = { geral: { pf: 0, pc: 0, n: 0 } }; vd[e.id] = {}; });
  fim.forEach(j => {
    const r = res(j), f = faseDe(j);
    [[j.a, r.pa, r.pb], [j.b, r.pb, r.pa]].forEach(([e, pf, pc]) => {
      if (!pts[e]) return; const x = pts[e][f] || (pts[e][f] = { pf: 0, pc: 0, n: 0 }); x.pf += pf; x.pc += pc; x.n++; pts[e].geral.pf += pf; pts[e].geral.pc += pc; pts[e].geral.n++;
      const v = vd[e][j.etapa] || (vd[e][j.etapa] = { v: 0, d: 0, e: 0 }); if (r.empate) v.e++; else if (r.venc === e) v.v++; else v.d++;
    });
  });
  const fases = [...new Set(fim.map(faseDe))].sort((a, b) => ORDEM_FASES.indexOf(a) - ORDEM_FASES.indexOf(b));
  const equipes = T.equipes.map(e => { const g = pts[e.id].geral, tv = Object.values(vd[e.id]).reduce((s, x) => ({ v: s.v + x.v, d: s.d + x.d, e: s.e + x.e }), { v: 0, d: 0, e: 0 });
    return { id: e.id, nome: e.nome, pf: g.pf, pc: g.pc, saldo: g.pf - g.pc, n: g.n, mpf: g.n ? g.pf / g.n : 0, mpc: g.n ? g.pc / g.n : 0, porFase: pts[e.id], vd: vd[e.id], tot: tv }; });
  // números gerais
  let totPts = 0, maiorEq = null, maiorVit = null, maiorInd = null, extras = 0, empates = 0;
  fim.forEach(j => { const r = res(j); totPts += r.pa + r.pb;
    [[j.a, r.pa], [j.b, r.pb]].forEach(([e, v]) => { if (!maiorEq || v > maiorEq.v) maiorEq = { v, txt: nome(e) + " (" + nome(j.a) + " x " + nome(j.b) + ")" }; });
    if (!r.empate && (!maiorVit || Math.abs(r.pa - r.pb) > maiorVit.v)) maiorVit = { v: Math.abs(r.pa - r.pb), txt: nome(r.venc) + " · " + r.pa + " x " + r.pb };
    Object.entries(j.stats || {}).forEach(([aid, s]) => { if (!maiorInd || (s.p || 0) > maiorInd.v) { const a = atletas.find(x => x.id === aid); if (a) maiorInd = { v: s.p || 0, txt: a.nome + " (" + a.equipe + ")" }; } });
    if (BIR ? (j.sets || []).length >= 3 : (j.periodos || []).some(p => /^P|BO/.test(p.n))) extras++;
    if (r.empate) empates++; });
  const totB = atletas.reduce((s, a) => s + a.b, 0), totA = atletas.reduce((s, a) => s + a.as, 0), nJ = fim.length;
  const numeros = [
    ["Jogos encerrados", nJ, "de " + reais.length + " programados"],
    ["Pontos marcados", totPts, "somando as duas equipes"],
    ["Média por jogo", nJ ? f1(totPts / nJ) : "–", "pontos (as duas equipes)"],
    ["Média por equipe", nJ ? f1(totPts / nJ / 2) : "–", "pontos por jogo"],
    ["Maior pontuação", maiorEq ? maiorEq.v : "–", maiorEq ? maiorEq.txt : ""],
    ["Maior vitória", maiorVit ? "+" + maiorVit.v : "–", maiorVit ? maiorVit.txt : ""],
    [BIR ? "Maior pontuador num jogo" : "Cestinha de um jogo", maiorInd ? maiorInd.v : "–", maiorInd ? maiorInd.txt : ""],
    [BIR ? "Jogos no tiebreak" : "Jogos com prorrogação", extras, nJ ? Math.round(extras / nJ * 100) + "% dos jogos" : ""],
    [BIR ? "Bloqueios" : "Tocos", totB, nJ ? "média " + f1(totB / nJ) + " por jogo" : ""],
    ["Assistências", totA, nJ ? "média " + f1(totA / nJ) + " por jogo" : ""]];
  if (!BIR) numeros.push(["Empates", empates, "na classificação"]);
  const porFase = fases.map(f => { const js = fim.filter(j => faseDe(j) === f); const p = js.reduce((s, j) => { const r = res(j); return s + r.pa + r.pb; }, 0); return { fase: f, n: js.length, med: js.length ? p / js.length : 0 }; });
  const jogados = fim.length ? new Set(fim.flatMap(j => [j.a, j.b])) : new Set();
  const geral = C.classificacaoGeral(esporte, T, jogos, nome);
  etapas.forEach((e, i) => { e.final = geral.porEtapa[i]; });
  return { T, BIR, etapas, numero, nome, res, faseDe, fim, reais, fases, equipes, atletas, numeros, porFase, jogados, geral, atletasLbl: BIR ? "Bloq." : "Tocos" };
}

/* ======================= GRÁFICOS (canvas → PNG, para o Excel) ======================= */
function graficoBarras(itens, cor, corHi, titulo, opts = {}) {
  const esc = 2, W = 900, linha = 34, topo = titulo ? 46 : 12, H = topo + itens.length * linha + 14;
  const c = document.createElement("canvas"); c.width = W * esc; c.height = H * esc;
  const g = c.getContext("2d"); g.scale(esc, esc); g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
  g.font = "600 18px Arial, sans-serif"; g.fillStyle = "#1a1a1a"; if (titulo) g.fillText(titulo, 14, 30);
  const nomeW = 260, valW = 90, bw = W - nomeW - valW - 30, max = Math.max(1e-9, ...itens.map(i => Math.abs(i.v)));
  itens.forEach((it, i) => {
    const y = topo + i * linha;
    g.font = "14px Arial, sans-serif"; g.fillStyle = "#333";
    g.fillText(((opts.pos === false ? "" : (i + 1) + "º  ") + it.nome).slice(0, 34), 14, y + 21);
    if (opts.saldo) {
      const meio = nomeW + bw / 2, w = Math.abs(it.v) / max * (bw / 2 - 4);
      g.fillStyle = "#e6e6e6"; g.fillRect(meio - 1, y + 6, 2, 22);
      g.fillStyle = it.v >= 0 ? "#2e9d5a" : "#d0453a"; g.fillRect(it.v >= 0 ? meio + 1 : meio - 1 - w, y + 9, w, 16);
    } else {
      g.fillStyle = "#eef1f4"; g.fillRect(nomeW, y + 9, bw, 16);
      g.fillStyle = it.hi ? corHi : cor; g.fillRect(nomeW, y + 9, Math.max(2, it.v / max * bw), 16);
    }
    g.font = "bold 15px Arial, sans-serif"; g.fillStyle = "#1a1a1a"; g.textAlign = "right";
    g.fillText(it.txt != null ? it.txt : String(it.v), W - 14, y + 22); g.textAlign = "left";
  });
  return { url: c.toDataURL("image/png"), w: W, h: H };
}

/* ======================= PDF ======================= */
function pdfBase(jsPDF, marca, D, subtitulo, orient) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: orient || "portrait", compress: true });
  doc.__marca = marca; doc.__D = D; doc.__sub = subtitulo;
  return doc;
}
function cabecalho(doc, logo, titulo, linha2) {
  const m = doc.__marca, W = doc.internal.pageSize.getWidth();
  doc.setFillColor(m.escura); doc.rect(0, 0, W, 26, "F");
  doc.setFillColor(m.destaque); doc.rect(0, 26, W, 1.6, "F");
  let x = 10;
  if (logo) { const h = 20, w = Math.min(34, h * logo.w / logo.h); doc.addImage(logo.url, "PNG", x, 3, w, h, "logo"); x += w + 5; }
  doc.setTextColor("#ffffff"); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text(titulo, x, 12, { maxWidth: W - x - 10 });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text(linha2 || "", x, 19.5, { maxWidth: W - x - 10 });
  doc.setTextColor("#1a1a1a");
  return 36;
}
function rodapes(doc) {
  const n = doc.getNumberOfPages(), m = doc.__marca;
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    doc.setDrawColor("#d6d6d6"); doc.setLineWidth(0.2); doc.line(10, H - 11, W - 10, H - 11);
    doc.setFontSize(8); doc.setTextColor("#777777"); doc.setFont("helvetica", "normal");
    doc.text(m.titulo + " · " + doc.__D.T.nome + " · " + doc.__sub + " · gerado em " + hoje(), 10, H - 6.5, { maxWidth: W - 40 });
    doc.text("Página " + i + " de " + n, W - 10, H - 6.5, { align: "right" });
  }
}
function secao(doc, y, texto, logo) {
  const H = doc.internal.pageSize.getHeight(), m = doc.__marca;
  if (y > H - 40) { doc.addPage(); y = cabecalho(doc, logo, doc.__D.T.nome, doc.__sub); }
  doc.setFillColor(m.cor); doc.rect(10, y - 4.2, 1.6, 6, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.setTextColor(m.escura); doc.text(texto, 14, y);
  doc.setTextColor("#1a1a1a"); doc.setFont("helvetica", "normal");
  return y + 5;
}
function tabela(doc, y, opts, logo) {
  const m = doc.__marca;
  doc.autoTable({
    startY: y, margin: { left: 10, right: 10, top: 34, bottom: 16 }, theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 1.8, lineColor: "#cfd6de", lineWidth: 0.15, textColor: "#1a1a1a", valign: "middle" },
    headStyles: { fillColor: m.escura, textColor: "#ffffff", fontStyle: "bold", halign: "center" },
    alternateRowStyles: { fillColor: "#f5f8fb" },
    didDrawPage: d => { if (d.pageNumber > 1 || doc.getNumberOfPages() > 1) { if (d.cursor && d.settings.startY !== d.cursor.y) {} } },
    willDrawPage: d => { if (d.pageNumber > 1) cabecalho(doc, logo, doc.__D.T.nome, doc.__sub); },
    ...opts,
  });
  return doc.lastAutoTable.finalY + 8;
}
function barrasPDF(doc, y, itens, opts, logo) {
  const m = doc.__marca, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const x0 = 12, nomeW = 62, valW = 34, bw = W - 20 - nomeW - valW, lin = 7.2;
  const max = Math.max(1e-9, ...itens.map(i => Math.abs(i.v)));
  if (!itens.length) { doc.setFontSize(9); doc.setTextColor("#777"); doc.text("Sem dados ainda.", x0, y + 4); doc.setTextColor("#1a1a1a"); return y + 10; }
  itens.forEach((it, i) => {
    if (y + lin > H - 16) { doc.addPage(); y = cabecalho(doc, logo, doc.__D.T.nome, doc.__sub); }
    doc.setFontSize(8.6); doc.setTextColor("#333333"); doc.setFont("helvetica", "normal");
    const rot = (opts.pos === false ? "" : (i + 1) + "º ") + it.nome;
    doc.text(doc.splitTextToSize(rot, nomeW - 2)[0], x0, y + 4.4);
    if (it.sub) { doc.setFontSize(6.8); doc.setTextColor("#888"); doc.text(doc.splitTextToSize(it.sub, nomeW - 2)[0], x0, y + 7.2); }
    const bx = x0 + nomeW;
    if (opts.saldo) {
      const meio = bx + bw / 2, w = Math.abs(it.v) / max * (bw / 2 - 1);
      doc.setFillColor("#cccccc"); doc.rect(meio - 0.2, y + 0.8, 0.4, 5, "F");
      doc.setFillColor(it.v >= 0 ? "#2e9d5a" : "#d0453a"); doc.rect(it.v >= 0 ? meio + 0.2 : meio - 0.2 - w, y + 1.6, w, 3.6, "F");
    } else {
      doc.setFillColor("#edf1f5"); doc.rect(bx, y + 1.6, bw, 3.6, "F");
      doc.setFillColor(it.hi ? m.destaque : m.cor); doc.rect(bx, y + 1.6, Math.max(0.6, it.v / max * bw), 3.6, "F");
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor("#1a1a1a");
    doc.text(it.txt != null ? String(it.txt) : String(it.v), W - 10, y + 4.4, { align: "right" });
    if (it.extra) { doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor("#888"); doc.text(it.extra, W - 10, y + 7.2, { align: "right" }); }
    y += lin + (it.sub || it.extra ? 1.6 : 0);
  });
  doc.setTextColor("#1a1a1a"); doc.setFont("helvetica", "normal");
  return y + 5;
}
function quadros(doc, y, numeros, logo) {
  const m = doc.__marca, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), col = 3, gap = 4, w = (W - 20 - gap * (col - 1)) / col, h = 21;
  numeros.forEach(([rot, v, sub], i) => {
    const c = i % col, r = Math.floor(i / col), x = 10 + c * (w + gap), yy = y + r * (h + gap);
    if (yy + h > H - 16) return;
    doc.setFillColor("#f3f6fa"); doc.setDrawColor("#d9e1ea"); doc.setLineWidth(0.2); doc.roundedRect(x, yy, w, h, 2, 2, "FD");
    doc.setFillColor(m.cor); doc.rect(x, yy + 3, 1.2, h - 6, "F");
    doc.setFontSize(7); doc.setTextColor("#6b7682"); doc.setFont("helvetica", "bold"); doc.text(rot.toUpperCase(), x + 4, yy + 5.5);
    doc.setFontSize(17); doc.setTextColor(m.escura); doc.text(String(v), x + 4, yy + 13.4);
    doc.setFontSize(6.8); doc.setTextColor("#6b7682"); doc.setFont("helvetica", "normal"); doc.text(doc.splitTextToSize(String(sub || ""), w - 7).slice(0, 2), x + 4, yy + 17.3);
  });
  doc.setTextColor("#1a1a1a");
  return y + Math.ceil(numeros.length / col) * (h + gap) + 4;
}

// chave do mata-mata desenhada (paisagem)
const COR_MED = ["#d4a514", "#9ea3a8", "#b8743a"];
function chavePDF(doc, et, ch, logo, comPlacar) {
  const m = doc.__marca, D = doc.__D;
  doc.addPage("a4", "landscape");
  let y = cabecalho(doc, logo, doc.__D.T.nome, et.nome + " · " + ch.titulo + (ch.serie != null ? " (1º, 2º e 3º lugar)" : "") + (ch.previsto ? " · chave prevista" : ""));
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const R = ch.rodadas, nCols = R.length + 1, gapX = 7, colW = Math.min(62, (W - 20 - gapX * (nCols - 1)) / nCols);
  const area = H - y - 18, boxH = Math.min(15, area / Math.max(R[0].length, ch.terceiro ? 3 : 1) - 3);
  doc.setFontSize(9);
  const centros = [];
  R.forEach((rod, ri) => {
    const x = 10 + ri * (colW + gapX), slot = area / rod.length;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(m.escura); doc.text(rod[0].fase.toUpperCase(), x + colW / 2, y + 1, { align: "center" });
    centros[ri] = [];
    rod.forEach((jg, i) => {
      const cy = y + 5 + slot * i + slot / 2, by = cy - boxH / 2;
      centros[ri].push(cy);
      doc.setDrawColor(jg.bye ? "#bfc7d0" : m.escura); doc.setLineWidth(0.35); doc.setFillColor("#ffffff");
      if (jg.bye) doc.setLineDashPattern([1, 1], 0);
      doc.roundedRect(x, by, colW, boxH, 1.2, 1.2, "FD"); doc.setLineDashPattern([], 0);
      doc.setDrawColor("#e1e6ec"); doc.line(x, cy, x + colW, cy);
      const sw = 11; doc.setDrawColor("#e1e6ec"); doc.line(x + colW - sw, by, x + colW - sw, by + boxH);
      doc.setFont("helvetica", jg.venc && jg.venc === jg.a ? "bold" : "normal"); doc.setFontSize(7.6); doc.setTextColor(jg.a ? "#1a1a1a" : "#999");
      doc.text(doc.splitTextToSize(jg.a || "", colW - sw - 3)[0], x + 2, cy - boxH / 4 + 1.2);
      doc.setFont("helvetica", jg.venc && jg.venc === jg.b ? "bold" : "normal"); doc.setTextColor(jg.bye ? "#999" : "#1a1a1a");
      doc.text(doc.splitTextToSize(jg.b || "", colW - sw - 3)[0], x + 2, cy + boxH / 4 + 1.2);
      if (comPlacar && jg.pa != null) { doc.setFont("helvetica", "bold"); doc.setTextColor("#1a1a1a"); doc.text(String(D.BIR ? jg.sa : jg.pa), x + colW - sw / 2, cy - boxH / 4 + 1.2, { align: "center" }); doc.text(String(D.BIR ? jg.sb : jg.pb), x + colW - sw / 2, cy + boxH / 4 + 1.2, { align: "center" }); }
      if (jg.num) { doc.setFont("helvetica", "normal"); doc.setFontSize(6.3); doc.setTextColor("#8a94a0"); doc.text("Jogo " + jg.num, x, by - 1); }
      if (ri > 0) { // linhas da chave
        const px = x - gapX, c1 = centros[ri - 1][i * 2], c2 = centros[ri - 1][i * 2 + 1];
        doc.setDrawColor("#9aa6b2"); doc.setLineWidth(0.3);
        doc.line(px, c1, px + gapX / 2, c1); doc.line(px, c2, px + gapX / 2, c2); doc.line(px + gapX / 2, c1, px + gapX / 2, c2); doc.line(px + gapX / 2, cy, x, cy);
      }
    });
  });
  // disputa de 3º lugar (abaixo da final)
  const xf = 10 + (R.length - 1) * (colW + gapX), cyF = centros[R.length - 1][0];
  if (ch.terceiro) {
    const jg = ch.terceiro, cy3 = Math.min(H - 22 - boxH / 2, cyF + boxH + 16), by = cy3 - boxH / 2, sw = 11;
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.6); doc.setTextColor(COR_MED[2]); doc.text(jg.fase.toUpperCase(), xf + colW / 2, by - 4.5, { align: "center" });
    doc.setDrawColor(COR_MED[2]); doc.setLineWidth(0.45); doc.setFillColor("#ffffff"); doc.roundedRect(xf, by, colW, boxH, 1.2, 1.2, "FD");
    doc.setDrawColor("#e1e6ec"); doc.line(xf, cy3, xf + colW, cy3); doc.line(xf + colW - sw, by, xf + colW - sw, by + boxH);
    [[jg.a, jg.sa, jg.pa, -1], [jg.b, jg.sb, jg.pb, 1]].forEach(([nm, s1, p1, k]) => {
      doc.setFont("helvetica", jg.venc && jg.venc === nm ? "bold" : "normal"); doc.setFontSize(7.6); doc.setTextColor("#1a1a1a");
      doc.text(doc.splitTextToSize(nm || "", colW - sw - 3)[0] || "", xf + 2, cy3 + k * boxH / 4 + 1.2);
      if (comPlacar && p1 != null) { doc.setFont("helvetica", "bold"); doc.text(String(D.BIR ? s1 : p1), xf + colW - sw / 2, cy3 + k * boxH / 4 + 1.2, { align: "center" }); }
    });
    if (jg.num) { doc.setFont("helvetica", "normal"); doc.setFontSize(6.3); doc.setTextColor("#8a94a0"); doc.text("Jogo " + jg.num, xf, by - 1); }
  }
  // pódio
  const x = 10 + R.length * (colW + gapX), cy = cyF, ph = 34;
  doc.setDrawColor("#9aa6b2"); doc.setLineWidth(0.3); doc.line(x - gapX, cy, x, cy);
  doc.setFillColor("#ffffff"); doc.setDrawColor(m.escura); doc.setLineWidth(0.5); doc.roundedRect(x, cy - ph / 2, colW, ph, 2, 2, "FD");
  doc.setFillColor(m.destaque); doc.roundedRect(x, cy - ph / 2, colW, 7, 2, 2, "F"); doc.rect(x, cy - ph / 2 + 4, colW, 3, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(m.escura); doc.text(ch.serie != null ? "MEDALHAS" : "PÓDIO", x + colW / 2, cy - ph / 2 + 5, { align: "center" });
  const rot = ch.serie != null ? ["Ouro", "Prata", "Bronze"] : ["Campeã", "Vice", "3º lugar"];
  [0, 1, 2].forEach(k => {
    const yy = cy - ph / 2 + 13 + k * 8;
    doc.setFillColor(COR_MED[k]); doc.circle(x + 5, yy - 1.2, 2.6, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor("#ffffff"); doc.text(String(k + 1), x + 5, yy, { align: "center" });
    doc.setFontSize(6); doc.setTextColor("#6b7480"); doc.text(rot[k].toUpperCase(), x + 9.5, yy - 2.6);
    const nm = (ch.podio || [])[k];
    doc.setFontSize(8.6); doc.setTextColor("#1a1a1a");
    if (nm) doc.text(doc.splitTextToSize(nm, colW - 12)[0], x + 9.5, yy + 1.2);
    else { doc.setDrawColor("#9aa6b2"); doc.setLineWidth(0.2); doc.line(x + 9.5, yy + 1.4, x + colW - 3, yy + 1.4); }
  });
  doc.setTextColor("#1a1a1a");
}

const rotTab = g => g.serie != null ? "da " + g.titulo : "do grupo " + g.letra;
// classificação geral (todas as etapas) e final da etapa, em linhas de tabela
const MED_TXT = ["Ouro", "Prata", "Bronze"];
function geralTabela(D) {
  const nE = D.T.etapas.length, serie = D.T.etapas.some(e => (e.series || []).length);
  const head = ["#", "Equipe", ...(PTS() ? ["Pts"] : []), ...D.T.etapas.map((e, i) => nE > 1 ? "Et. " + (i + 1) : "Etapa"), "J", "V", ...(D.BIR ? [] : ["E"]), "D", ...(D.BIR ? ["Sets"] : []), "Saldo", "PF", serie ? "Medalhas" : "Pódios"];
  const body = D.geral.linhas.map((r, i) => [(i + 1) + "º", D.nome(r.eid), ...(PTS() ? [r.pg] : []), ...r.etapas.map(x => x ? x.pos + "º" + (x.completa ? "" : "*") : "–"), r.j, r.v, ...(D.BIR ? [] : [r.e]), r.d,
    ...(D.BIR ? [r.sv + "–" + r.sp] : []), (r.saldo > 0 ? "+" : "") + r.saldo, r.pf, r.medalhas.map((n, k) => n ? n + " " + MED_TXT[k].toLowerCase() : "").filter(Boolean).join(", ") || "–"]);
  return { head, body };
}
const rotFinal = x => (x.medalha ? MED_TXT[x.medalha - 1] + " – " : "") + (x.serie != null && !String(x.rot).startsWith("Série") ? C.SERIES[x.serie] + " · " : "") + (x.rot || "");
function finalTabela(D, et) {
  const head = ["#", "Equipe", "Chegou até", "V", "D", "Saldo"];
  if (et.final && et.final.completa) return { head, body: et.final.ordem.map(x => [x.pos + "º", D.nome(x.eid), rotFinal(x), x.v, x.d, (x.saldo > 0 ? "+" : "") + x.saldo]), completa: true };
  return { head, body: D.T.equipes.map((_, i) => [(i + 1) + "º", "", "", "", "", ""]), completa: false };
}
function linhasJogos(D, jogos, preencher) {
  return jogos.map(j => {
    const fimJ = j.status === "encerrado", r = D.res(j), num = D.numero[j.id];
    const grupo = j.fase === "grupo" ? (j.faseNome || "").replace("Grupo ", "") : j.fase === "serie" ? (j.faseNome || "").replace("Série ", "") : "";
    if (D.BIR) {
      const set = i => fimJ && j.sets && j.sets[i] ? j.sets[i].a + " x " + j.sets[i].b : (preencher && !fimJ ? "____ x ____" : "");
      return [num, grupo, j.rodada || "", D.nome(j.a), set(0), set(1), set(2), D.nome(j.b), fimJ ? r.sa + " x " + r.sb : "", fimJ ? D.nome(r.venc) : ""];
    }
    const q = i => fimJ && j.periodos && j.periodos[i] ? j.periodos[i].a + "-" + j.periodos[i].b : "";
    const extra = fimJ ? (j.periodos || []).filter(p => /^P|BO/.test(p.n)).map(p => (p.n === "BO" ? "BO " : "P ") + p.a + "-" + p.b).join(" ") : "";
    return [num, grupo, j.rodada || "", D.nome(j.a), fimJ ? r.pa : "", q(0), q(1), q(2), q(3), extra, fimJ ? r.pb : "", D.nome(j.b), fimJ ? (r.empate ? "Empate" : D.nome(r.venc)) : ""];
  });
}
const cabJogos = BIR => BIR ? ["Jogo", "Grupo", "Rod.", "Equipe A", "Set 1", "Set 2", "Tiebreak", "Equipe B", "Sets", "Vencedor"] : ["Jogo", "Grupo", "Rod.", "Equipe A", "Pts A", "1ºQ", "2ºQ", "3ºQ", "4ºQ", "Prorr./BO", "Pts B", "Equipe B", "Vencedor"];

export async function tabelaPDF(T, jogos, esporte, marca) {
  const jsPDF = await libPDF(), D = montarDados(T, jogos, esporte), logo = await logoDataUrl(marca.logo, marca.fundoLogo);
  const doc = pdfBase(jsPDF, marca, D, "Tabela de jogos");
  let primeira = true;
  D.etapas.forEach(et => {
    if (!primeira) doc.addPage("a4", "portrait"); primeira = false;
    let y = cabecalho(doc, logo, T.nome, [et.nome, et.local, fmtData(et.data), et.hora].filter(Boolean).join(" · "));
    if (et.vazio) {
      y = secao(doc, y, "Equipes inscritas", logo);
      y = tabela(doc, y, { head: [["#", "Equipe", "Atletas"]], body: T.equipes.map((e, i) => [i + 1, e.nome + (e.tecnico ? "\nTécnico: " + e.tecnico : ""), (e.atletas || []).map(a => (a.num != null ? a.num + " " : "") + a.nome + (e.capitao === a.id ? " (C)" : "")).join(", ")]), columnStyles: { 0: { halign: "center", cellWidth: 10 }, 1: { fontStyle: "bold", cellWidth: 45 } } }, logo);
      doc.setFontSize(9); doc.setTextColor("#777"); doc.text("O sorteio desta etapa ainda não foi feito.", 10, y); doc.setTextColor("#1a1a1a");
      return;
    }
    if (et.tabelas.length) {
      y = secao(doc, y, et.seriesRR.length ? "Grupos, séries e classificação" : "Grupos e classificação", logo);
      const cols = et.tabelas.length > 1 ? 2 : 1, W = doc.internal.pageSize.getWidth(), gw = (W - 20 - 6 * (cols - 1)) / cols;
      let yLinha = y, maxY = y;
      et.tabelas.forEach((g, gi) => {
        const c = gi % cols; if (c === 0 && gi) { yLinha = maxY; }
        const body = g.classif.map((r, i) => { const temJogo = r.j > 0; return [i + 1 + "º", D.nome(r.eid), ...(PTS() ? [temJogo ? r.pg : ""] : []), temJogo ? r.j : "", temJogo ? r.v : "", ...(D.BIR ? [] : [temJogo ? r.e : ""]), temJogo ? r.d : "", temJogo ? r.pf : "", temJogo ? r.pc : "", temJogo ? (r.saldo > 0 ? "+" : "") + r.saldo : ""]; });
        doc.autoTable({ startY: yLinha, margin: { left: 10 + c * (gw + 6), right: W - (10 + c * (gw + 6) + gw), top: 34, bottom: 16 }, tableWidth: gw, theme: "grid",
          head: [[{ content: g.titulo.toUpperCase(), colSpan: (D.BIR ? 8 : 9) + (PTS() ? 1 : 0), styles: { halign: "left", fillColor: doc.__marca.cor, fontSize: 10 } }], ["", "Equipe", ...(PTS() ? ["Pts"] : []), "J", "V", ...(D.BIR ? [] : ["E"]), "D", "PF", "PT", "Saldo"]],
          body, didParseCell: d => { if (g.serie != null && !g.previsto && d.section === "body" && d.row.index < 3 && d.column.index === 0) { d.cell.styles.fillColor = COR_MED[d.row.index]; d.cell.styles.textColor = "#fff"; d.cell.styles.fontStyle = "bold"; } },
          styles: { fontSize: 8, cellPadding: 1.6, lineColor: "#cfd6de", lineWidth: 0.15, halign: "center", minCellHeight: 6.5 },
          headStyles: { fillColor: doc.__marca.escura, textColor: "#fff", halign: "center" }, columnStyles: { 1: { halign: "left", fontStyle: "bold", cellWidth: gw * 0.36 } },
          willDrawPage: d => { if (d.pageNumber > 1) cabecalho(doc, logo, T.nome, doc.__sub); } });
        maxY = Math.max(maxY, doc.lastAutoTable.finalY + 5);
      });
      y = maxY + 3;
      et.tabelas.forEach(g => {
        y = secao(doc, y, "Jogos " + rotTab(g), logo);
        const cab = cabJogos(D.BIR);
        y = tabela(doc, y, { head: [cab], body: linhasJogos(D, g.jogos, true), styles: { fontSize: D.BIR ? 8 : 7.3, cellPadding: 1.6, halign: "center", minCellHeight: 7, lineColor: "#cfd6de", lineWidth: 0.15 },
          columnStyles: D.BIR ? { 3: { halign: "right", fontStyle: "bold" }, 7: { halign: "left", fontStyle: "bold" } } : { 3: { halign: "right", fontStyle: "bold" }, 11: { halign: "left", fontStyle: "bold" } } }, logo);
      });
    }
    et.chaves.forEach(ch => {
      const lista = [...ch.rodadas.flat(), ch.terceiro].filter(j => j && !j.bye);
      y = secao(doc, y, ch.titulo + (ch.previsto ? " (chave prevista – preencha à mão)" : ""), logo);
      y = tabela(doc, y, { head: [D.BIR ? ["Jogo", "Fase", "Equipe A", "Set 1", "Set 2", "Tiebreak", "Equipe B", "Vencedor"] : ["Jogo", "Fase", "Equipe A", "Placar", "Equipe B", "Vencedor"]],
        body: lista.map(j => D.BIR ? [j.num, j.fase, j.a, ...(j.sets && j.sets.length ? [0, 1, 2].map(i => j.sets[i] ? j.sets[i].a + " x " + j.sets[i].b : "") : ["____ x ____", "____ x ____", "____ x ____"]), j.b, j.venc] : [j.num, j.fase, j.a, j.pa != null ? j.pa + " x " + j.pb : "____ x ____", j.b, j.venc]),
        styles: { fontSize: 8, cellPadding: 1.6, halign: "center", minCellHeight: 7, lineColor: "#cfd6de", lineWidth: 0.15 } }, logo);
    });
    if (et.podios.length) {
      y = secao(doc, y, et.podios.some(p => p.serie != null) ? "Medalhas (ouro, prata e bronze)" : "Pódio", logo);
      y = tabela(doc, y, { head: [["Disputa", "1º lugar", "2º lugar", "3º lugar"]], body: et.podios.map(p => [p.titulo, ...[0, 1, 2].map(k => p.p[k] || "")]),
        styles: { fontSize: 9, minCellHeight: 9, valign: "middle", lineColor: "#cfd6de", lineWidth: 0.15 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 38 } },
        didParseCell: d => { if (d.section === "head" && d.column.index > 0) d.cell.styles.fillColor = COR_MED[d.column.index - 1]; } }, logo);
    }
    if (!et.vazio) {
      const ft = finalTabela(D, et);
      y = secao(doc, y, "Classificação final da etapa" + (ft.completa ? "" : " (preencha à mão)"), logo);
      y = tabela(doc, y, { head: [ft.head], body: ft.body, styles: { fontSize: 8.4, minCellHeight: 7, halign: "center", lineColor: "#cfd6de", lineWidth: 0.15 }, columnStyles: { 1: { halign: "left", fontStyle: "bold", cellWidth: 60 }, 2: { halign: "left", cellWidth: 60 } } }, logo);
    }
    et.chaves.filter(ch => !ch.livre).forEach(ch => chavePDF(doc, et, ch, logo, true));
  });
  rodapes(doc);
  doc.save(arquivo(T, "tabela-de-jogos.pdf"));
}

export async function relatorioPDF(T, jogos, esporte, marca) {
  const jsPDF = await libPDF(), D = montarDados(T, jogos, esporte), logo = await logoDataUrl(marca.logo, marca.fundoLogo);
  const doc = pdfBase(jsPDF, marca, D, "Relatório do torneio"), m = marca;
  // capa
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  doc.setFillColor(m.escura); doc.rect(0, 0, W, H, "F");
  doc.setFillColor(m.cor); doc.rect(0, H * 0.62, W, 4, "F"); doc.setFillColor(m.destaque); doc.rect(0, H * 0.62 + 4, W, 2, "F");
  if (logo) { const lw = 90, lh = lw * logo.h / logo.w; doc.addImage(logo.url, "PNG", (W - lw) / 2, 40, lw, Math.min(lh, 90), "logo"); }
  doc.setTextColor("#ffffff"); doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.text(doc.splitTextToSize(T.nome, W - 40), W / 2, 150, { align: "center" });
  doc.setFontSize(13); doc.setFont("helvetica", "normal"); doc.text("Relatório completo de jogos e estatísticas", W / 2, 168, { align: "center" });
  doc.setFontSize(10); D.etapas.forEach((et, i) => doc.text([et.nome, et.local, fmtData(et.data), et.hora].filter(Boolean).join(" · ") + (et.campea ? "  —  " + (et.podios[0] && et.podios[0].serie != null ? "Ouro" : "Campeã") + ": " + et.campea : ""), W / 2, H * 0.62 + 20 + i * 7, { align: "center" }));
  doc.setFontSize(9); doc.text(m.titulo + " · gerado em " + hoje(), W / 2, H - 14, { align: "center" });
  // resumo
  doc.addPage(); let y = cabecalho(doc, logo, T.nome, "Resumo");
  y = secao(doc, y, "Números gerais", logo); y = quadros(doc, y, D.numeros, logo);
  const pods = D.etapas.flatMap(e => e.podios.filter(p => p.p.some(Boolean)).map(p => [e.nome, p.titulo, ...[0, 1, 2].map(k => p.p[k] || "–")]));
  if (pods.length) { y = secao(doc, y, "Pódios", logo); y = tabela(doc, y, { head: [["Etapa", "Disputa", "1º lugar", "2º lugar", "3º lugar"]], body: pods, columnStyles: { 2: { fontStyle: "bold" } },
    didParseCell: d => { if (d.section === "head" && d.column.index > 1) d.cell.styles.fillColor = COR_MED[d.column.index - 2]; } }, logo); }
  if (D.fim.length) {
    const gt = geralTabela(D);
    y = secao(doc, y, "Classificação geral", logo);
    y = tabela(doc, y, { head: [gt.head], body: gt.body, styles: { fontSize: gt.head.length > 12 ? 6.8 : 7.8, halign: "center", cellPadding: 1.3, lineColor: "#cfd6de", lineWidth: 0.15 }, columnStyles: { 1: { halign: "left", fontStyle: "bold" } },
      didParseCell: d => { if (d.section === "body" && d.row.index < 3 && d.column.index === 0) { d.cell.styles.fillColor = COR_MED[d.row.index]; d.cell.styles.textColor = "#fff"; d.cell.styles.fontStyle = "bold"; } } }, logo);
    doc.setFontSize(7.5); doc.setTextColor("#6b7480"); doc.text((PTS() ? "Critério: pontos (2x0 = 3; 2x1 = 2 e 1 ao perdedor); desempate: pontos marcados." : "Critério: vitórias, " + (D.BIR ? "" : "empates, ") + "saldo de pontos e pontos feitos.") + " Et. = colocação final em cada etapa (* = etapa em andamento).", 10, y - 2); doc.setTextColor("#1a1a1a"); y += 4;
  }
  y = secao(doc, y, "Média de pontos de cada equipe (por jogo)", logo);
  const eqs = D.equipes.filter(e => e.n).sort((a, b) => b.mpf - a.mpf);
  y = barrasPDF(doc, y, eqs.map((e, i) => ({ nome: e.nome, v: e.mpf, txt: f1(e.mpf), extra: "sofre " + f1(e.mpc) + " · " + e.n + " jogos", hi: i === 0 })), {}, logo);
  y = secao(doc, y, "Saldo de pontos das equipes", logo);
  y = barrasPDF(doc, y, [...eqs].sort((a, b) => b.saldo - a.saldo).map(e => ({ nome: e.nome, v: e.saldo, txt: (e.saldo > 0 ? "+" : "") + e.saldo })), { saldo: true, pos: false }, logo);
  if (D.porFase.length > 1) { y = secao(doc, y, "Média de pontos por jogo, por fase", logo); const mx = Math.max(...D.porFase.map(f => f.med)); y = barrasPDF(doc, y, D.porFase.map(f => ({ nome: f.fase, v: f.med, txt: f1(f.med), extra: f.n + " jogos", hi: f.med === mx })), { pos: false }, logo); }
  // atletas
  const comJogo = D.atletas.filter(a => a.nj);
  y = secao(doc, y, "10 maiores pontuadores", logo);
  y = barrasPDF(doc, y, [...comJogo].sort((a, b) => b.p - a.p).slice(0, 10).map((a, i) => ({ nome: a.nome, sub: a.equipe, v: a.p, extra: a.b + " " + D.atletasLbl.toLowerCase() + " · " + a.as + " ast.", hi: i === 0 })), {}, logo);
  y = secao(doc, y, "10 menores pontuadores", logo);
  y = barrasPDF(doc, y, [...comJogo].sort((a, b) => a.p - b.p).slice(0, 10).map(a => ({ nome: a.nome, sub: a.equipe, v: a.p, extra: a.b + " " + D.atletasLbl.toLowerCase() + " · " + a.as + " ast." })), {}, logo);
  y = secao(doc, y, "Média de pontos por atleta (10 melhores)", logo);
  y = barrasPDF(doc, y, [...comJogo].sort((a, b) => b.med - a.med).slice(0, 10).map((a, i) => ({ nome: a.nome, sub: a.equipe, v: a.med, txt: f1(a.med), extra: a.p + " pts em " + a.nj + " jogos", hi: i === 0 })), {}, logo);
  // tabelas
  doc.addPage(); y = cabecalho(doc, logo, T.nome, "Equipes");
  y = secao(doc, y, "Pontos feitos, tomados e saldo – por fase e geral", logo);
  const fs = D.fases;
  y = tabela(doc, y, { head: [["Equipe", ...fs.map(f => ({ content: f, colSpan: 3 })), { content: "Geral", colSpan: 3 }, "Méd. feita", "Méd. sofrida"], ["", ...[...fs, "Geral"].flatMap(() => ["PF", "PT", "S"]), "", ""]],
    body: eqs.map(e => [e.nome, ...[...fs, "geral"].flatMap(f => { const x = e.porFase[f]; return x ? [x.pf, x.pc, (x.pf - x.pc > 0 ? "+" : "") + (x.pf - x.pc)] : ["–", "–", "–"]; }), f1(e.mpf), f1(e.mpc)]),
    styles: { fontSize: fs.length > 3 ? 6.4 : 7.6, halign: "center", cellPadding: 1.2, lineColor: "#cfd6de", lineWidth: 0.15 }, columnStyles: { 0: { halign: "left", fontStyle: "bold" } } }, logo);
  y = secao(doc, y, "Vitórias e derrotas por etapa", logo);
  const vdc = x => x ? x.v + "V " + x.d + "D" + (x.e ? " " + x.e + "E" : "") : "–";
  y = tabela(doc, y, { head: [["Equipe", ...T.etapas.map(e => e.nome), "Total", "Aproveit."]], body: [...D.equipes].sort((a, b) => b.tot.v - a.tot.v || a.tot.d - b.tot.d).map(e => { const n = e.tot.v + e.tot.d + e.tot.e; return [e.nome, ...T.etapas.map((_, i) => vdc(e.vd[i])), vdc(e.tot), n ? Math.round(e.tot.v / n * 100) + "%" : "–"]; }),
    styles: { fontSize: 8, halign: "center", lineColor: "#cfd6de", lineWidth: 0.15 }, columnStyles: { 0: { halign: "left", fontStyle: "bold" } } }, logo);
  // classificação e resultados por etapa
  D.etapas.forEach(et => {
    if (et.vazio) return;
    doc.addPage(); y = cabecalho(doc, logo, T.nome, et.nome + " · Resultados");
    et.tabelas.forEach(g => {
      y = secao(doc, y, g.titulo + " – classificação", logo);
      y = tabela(doc, y, { head: [["", "Equipe", ...(PTS() ? ["Pts"] : []), "J", "V", ...(D.BIR ? [] : ["E"]), "D", "PF", "PT", "Saldo"]], body: g.classif.map((r, i) => [i + 1 + "º", D.nome(r.eid), ...(PTS() ? [r.pg] : []), r.j, r.v, ...(D.BIR ? [] : [r.e]), r.d, r.pf, r.pc, (r.saldo > 0 ? "+" : "") + r.saldo]),
        styles: { fontSize: 8.4, halign: "center", lineColor: "#cfd6de", lineWidth: 0.15 }, columnStyles: { 1: { halign: "left", fontStyle: "bold" } },
        didParseCell: d => { if (d.section === "body" && d.row.index < g.passam) d.cell.styles.fillColor = g.serie != null && d.column.index === 0 ? COR_MED[d.row.index] : "#e6f2fb"; } }, logo);
    });
    const todos = jogos.filter(j => j.etapa === et.idx && !j.wo).sort((a, b) => (D.numero[a.id] || 0) - (D.numero[b.id] || 0));
    y = secao(doc, y, "Todos os jogos", logo);
    y = tabela(doc, y, { head: [cabJogos(D.BIR)], body: linhasJogos(D, todos, false).map((l, i) => { if (todos[i].fase === "mata") l[1] = todos[i].faseNome; return l; }), styles: { fontSize: D.BIR ? 7.6 : 6.8, halign: "center", cellPadding: 1.3, lineColor: "#cfd6de", lineWidth: 0.15 } }, logo);
    if (et.final && et.final.ordem.length) {
      const ft = finalTabela(D, et);
      if (ft.completa) { y = secao(doc, y, "Classificação final da etapa", logo);
        y = tabela(doc, y, { head: [ft.head], body: ft.body, styles: { fontSize: 8.2, halign: "center", lineColor: "#cfd6de", lineWidth: 0.15 }, columnStyles: { 1: { halign: "left", fontStyle: "bold" }, 2: { halign: "left" } },
          didParseCell: d => { if (d.section === "body" && d.row.index < 3 && d.column.index === 0) { d.cell.styles.fillColor = COR_MED[d.row.index]; d.cell.styles.textColor = "#fff"; } } }, logo); }
    }
    et.chaves.filter(ch => !ch.livre).forEach(ch => chavePDF(doc, et, ch, logo, true));
  });
  // atletas por equipe
  doc.addPage("a4", "portrait"); y = cabecalho(doc, logo, T.nome, "Atletas");
  T.equipes.forEach(e => {
    const ats = D.atletas.filter(a => a.eid === e.id).sort((a, b) => b.p - a.p);
    if (!ats.length) return;
    y = secao(doc, y, e.nome + (e.tecnico ? " · Técnico: " + e.tecnico : ""), logo);
    const bq = !D.BIR;
    y = tabela(doc, y, { head: [["Nº", "Atleta", "Jogos", "Pontos", "Média", ...(bq ? ["De 3", "De 2", "LL"] : []), D.atletasLbl, "Assist."]], body: ats.map(a => [a.num ?? "", a.nome, a.nj, a.p, f1(a.med), ...(bq ? [a.c3, a.c2, a.c1] : []), a.b, a.as]),
      styles: { fontSize: 8.2, halign: "center", lineColor: "#cfd6de", lineWidth: 0.15 }, columnStyles: { 1: { halign: "left" } },
      didParseCell: d => { if (d.section === "body" && d.row.index === 0 && ats[0].p > 0) d.cell.styles.fontStyle = "bold"; } }, logo);
  });
  rodapes(doc);
  doc.save(arquivo(T, "relatorio.pdf"));
}

/* ======================= EXCEL ======================= */
function estilos(marca) {
  const borda = { style: "thin", color: { argb: "FFCFD6DE" } };
  return {
    borda: { top: borda, left: borda, bottom: borda, right: borda },
    cab: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: hexArgb(marca.escura) } }, font: { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 }, alignment: { horizontal: "center", vertical: "middle", wrapText: true } },
    sub: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: hexArgb(marca.cor) } }, font: { bold: true, color: { argb: hexArgb(marca.textoCor || "#FFFFFF") }, name: "Calibri", size: 12 } },
    zebra: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F8FB" } },
    destaque: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F2FB" } },
  };
}
function folha(wb, nome, marca, logo, titulo, sub, larguras, paisagem) {
  const ws = wb.addWorksheet(nome.slice(0, 31), { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: paisagem ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }, headerFooter: { oddFooter: "&L" + marca.titulo + "&RPágina &P de &N" } });
  ws.columns = larguras.map(w => ({ width: w }));
  const n = larguras.length, ult = String.fromCharCode(64 + Math.min(n, 26));
  for (let r = 1; r <= 3; r++) for (let c = 1; c <= n; c++) ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: hexArgb(marca.escura) } };
  for (let c = 1; c <= n; c++) ws.getCell(4, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: hexArgb(marca.destaque) } };
  ws.getRow(1).height = 26; ws.getRow(2).height = 20; ws.getRow(3).height = 14; ws.getRow(4).height = 4;
  const col0 = logo ? 3 : 1;
  ws.mergeCells(1, col0, 1, n); ws.mergeCells(2, col0, 2, n);
  const t = ws.getCell(1, col0); t.value = titulo; t.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" }, name: "Calibri" }; t.alignment = { vertical: "middle" };
  const s = ws.getCell(2, col0); s.value = sub; s.font = { size: 11, color: { argb: "FFDDE6EE" }, name: "Calibri" }; s.alignment = { vertical: "middle" };
  if (logo) { const id = wb.__logoId ?? (wb.__logoId = wb.addImage({ base64: logo.url, extension: "png" })); const h = 56; ws.addImage(id, { tl: { col: 0.15, row: 0.15 }, ext: { width: h * logo.w / logo.h, height: h }, editAs: "oneCell" }); }
  ws.__linha = 6; ws.__n = n; ws.__ult = ult;
  return ws;
}
function tituloSecao(ws, texto, E) {
  const r = ws.__linha; ws.mergeCells(r, 1, r, ws.__n);
  const c = ws.getCell(r, 1); c.value = texto; c.fill = E.sub.fill; c.font = E.sub.font; c.alignment = { vertical: "middle", indent: 1 }; ws.getRow(r).height = 20;
  ws.__linha = r + 1;
}
function tabelaXL(ws, cab, linhas, E, opts = {}) {
  let r = ws.__linha;
  (Array.isArray(cab[0]) ? cab : [cab]).forEach(linhaCab => {
    let c = 1;
    linhaCab.forEach(h => {
      const span = typeof h === "object" && h ? h.span : 1, txt = typeof h === "object" && h ? h.t : h;
      if (span > 1) ws.mergeCells(r, c, r, c + span - 1);
      const cell = ws.getCell(r, c); cell.value = txt; Object.assign(cell, { fill: E.cab.fill, font: E.cab.font, alignment: E.cab.alignment, border: E.borda });
      for (let k = 1; k < span; k++) ws.getCell(r, c + k).border = E.borda;
      c += span;
    });
    (opts.mesclas || []).forEach(([a, b]) => { try { ws.mergeCells(r, a + 1, r, b + 1); } catch (e) {} });
    ws.getRow(r).height = 20; r++;
  });
  linhas.forEach((l, i) => {
    l.forEach((v, ci) => {
      const cell = ws.getCell(r, ci + 1); cell.value = v === "" ? null : v; cell.border = E.borda;
      cell.alignment = { horizontal: (opts.esq || [1]).includes(ci) ? "left" : "center", vertical: "middle", wrapText: !!opts.quebra };
      cell.font = { name: "Calibri", size: 10.5, bold: (opts.negrito || []).includes(ci) };
      if (opts.destaque && opts.destaque(i)) cell.fill = E.destaque; else if (i % 2) cell.fill = E.zebra;
      if (typeof v === "number" && !Number.isInteger(v) && opts.decimal && opts.decimal.includes(ci)) cell.numFmt = "0.0";
    });
    (opts.mesclas || []).forEach(([a, b]) => { try { ws.mergeCells(r, a + 1, r, b + 1); } catch (e) {} });
    ws.getRow(r).height = opts.altura || 18; r++;
  });
  ws.__linha = r + 1;
}

export async function tabelaXLSX(T, jogos, esporte, marca) {
  const ExcelJS = await libXLSX(), D = montarDados(T, jogos, esporte), logo = await logoDataUrl(marca.logo, marca.fundoLogo), E = estilos(marca);
  const wb = new ExcelJS.Workbook(); wb.creator = marca.titulo; wb.created = new Date();
  D.etapas.forEach(et => {
    const cab = cabJogos(D.BIR);
    const ws = folha(wb, et.nome, marca, logo, T.nome, [et.nome, et.local, fmtData(et.data), et.hora].filter(Boolean).join(" · ") + " · Tabela de jogos", D.BIR ? [7, 13, 6, 24, 12, 12, 12, 24, 8, 22] : [7, 13, 6, 22, 7, 7, 7, 7, 7, 10, 7, 22, 18]);
    if (et.vazio) { tituloSecao(ws, "Equipes inscritas (sorteio ainda não feito)", E); tabelaXL(ws, ["#", "Equipe", "Técnico", "Atletas"], T.equipes.map((e, i) => [i + 1, e.nome, e.tecnico || "", (e.atletas || []).map(a => a.nome + (e.capitao === a.id ? " (C)" : "")).join(", ")]), E, { quebra: true }); return; }
    et.tabelas.forEach(g => {
      tituloSecao(ws, g.titulo + " – classificação", E);
      tabelaXL(ws, ["Pos.", "Equipe", "", "", ...(PTS() ? ["Pts"] : []), "J", "V", ...(D.BIR ? [] : ["E"]), "D", "PF", "PT", "Saldo"], g.classif.map((r, i) => [i + 1 + "º", D.nome(r.eid), "", "", ...(PTS() ? [r.j ? r.pg : ""] : []), r.j || "", r.j ? r.v : "", ...(D.BIR ? [] : [r.j ? r.e : ""]), r.j ? r.d : "", r.j ? r.pf : "", r.j ? r.pc : "", r.j ? r.saldo : ""]), E, { negrito: [1], altura: 20, mesclas: [[1, 3]] });
      tituloSecao(ws, "Jogos " + rotTab(g), E);
      tabelaXL(ws, cab, linhasJogos(D, g.jogos, false), E, { esq: [], negrito: D.BIR ? [3, 7] : [3, 11], altura: 22 });
    });
    et.chaves.forEach(ch => {
      tituloSecao(ws, ch.titulo + (ch.previsto ? " (chave prevista – preencha à mão)" : ""), E);
      tabelaXL(ws, D.BIR ? ["Jogo", "Fase", "", "Equipe A", "Set 1", "Set 2", "Tiebreak", "Equipe B", "Sets", "Vencedor"] : ["Jogo", "Fase", "", "Equipe A", "Pts A", "", "", "", "", "", "Pts B", "Equipe B", "Vencedor"],
        [...ch.rodadas.flat(), ch.terceiro].filter(j => j && !j.bye).map(j => D.BIR ? [j.num, j.fase, "", j.a, ...(j.sets && j.sets.length ? [0, 1, 2].map(i => j.sets[i] ? j.sets[i].a + " x " + j.sets[i].b : "") : ["", "", ""]), j.b, j.sa != null ? j.sa + " x " + j.sb : "", j.venc] : [j.num, j.fase, "", j.a, j.pa ?? "", "", "", "", "", "", j.pb ?? "", j.b, j.venc]), E, { esq: [], negrito: D.BIR ? [3, 7] : [3, 11], altura: 22 });
    });
    if (et.podios.length) {
      tituloSecao(ws, et.podios.some(p => p.serie != null) ? "Medalhas (ouro, prata e bronze)" : "Pódio", E);
      tabelaXL(ws, ["Disputa", "", "", "1º lugar", "", "", "2º lugar", "3º lugar"], et.podios.map(p => [p.titulo, "", "", p.p[0] || "", "", "", p.p[1] || "", p.p[2] || ""]), E, { esq: [0, 3, 6, 7], negrito: [0, 3], altura: 24, mesclas: [[0, 2], [3, 5]] });
    }
    { const ft = finalTabela(D, et);
      tituloSecao(ws, "Classificação final da etapa" + (ft.completa ? "" : " (preencha à mão)"), E);
      tabelaXL(ws, ["#", "Equipe", "", "", "Chegou até", "", "", "V", "D", "Saldo"], ft.body.map(r => [r[0], r[1], "", "", r[2], "", "", r[3], r[4], r[5]]), E, { esq: [1, 4], negrito: [1], altura: 20, mesclas: [[1, 3], [4, 6]] }); }
    et.chaves.filter(ch => !ch.livre).forEach(ch => chaveXL(wb, et, ch, D, marca, logo, E, T));
  });
  await salvarXL(wb, arquivo(T, "tabela-de-jogos.xlsx"));
}

// chave do mata-mata desenhada com células
function chaveXL(wb, et, ch, D, marca, logo, E, T) {
  const R = ch.rodadas, cols = [];
  R.forEach(() => cols.push(28, 7, 3)); cols.push(26);
  const ws = folha(wb, (et.nome + " " + (ch.serie != null ? ch.titulo : "chave")).slice(0, 31), marca, logo, T.nome, et.nome + " · " + (ch.serie != null ? ch.titulo + " (1º, 2º e 3º lugar)" : "Chave do mata-mata"), cols, true);
  const topo = 7, n0 = R[0].length;
  const linhaBox = (ri, i) => { const span = 4 * Math.pow(2, ri); return topo + 1 + i * span + span / 2 - 1; };
  R.forEach((rod, ri) => {
    const c = ri * 3 + 1;
    const h = ws.getCell(topo - 1, c); h.value = rod[0].fase.toUpperCase(); h.font = { bold: true, color: { argb: hexArgb(marca.escura) } };
    rod.forEach((j, i) => {
      const r = linhaBox(ri, i);
      [[r, j.a, D.BIR ? j.sa : j.pa], [r + 1, j.b, D.BIR ? j.sb : j.pb]].forEach(([rr, nomeE, pl], k) => {
        const n = ws.getCell(rr, c), p = ws.getCell(rr, c + 1);
        n.value = nomeE || ""; p.value = pl == null ? null : pl;
        const forte = { style: "medium", color: { argb: j.bye ? "FFBFC7D0" : hexArgb(marca.escura) } }, fina = { style: "thin", color: { argb: "FFCFD6DE" } };
        n.border = { left: forte, top: k === 0 ? forte : fina, bottom: k === 1 ? forte : fina, right: fina };
        p.border = { right: forte, top: k === 0 ? forte : fina, bottom: k === 1 ? forte : fina, left: fina };
        n.font = { bold: j.venc && j.venc === nomeE, color: { argb: j.bye && k === 1 ? "FF999999" : "FF1A1A1A" } }; p.font = { bold: true }; p.alignment = { horizontal: "center" };
        n.fill = p.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
      });
      if (j.num) { const t = ws.getCell(r - 1, c); if (!t.value) { t.value = "Jogo " + j.num; t.font = { size: 8, color: { argb: "FF8A94A0" } }; } }
      if (ri > 0) { // conector
        const prev = c - 1, a = linhaBox(ri - 1, i * 2), b = linhaBox(ri - 1, i * 2 + 1) + 1;
        for (let rr = a; rr <= b; rr++) ws.getCell(rr, prev).border = { right: { style: "thin", color: { argb: "FF9AA6B2" } } };
      }
    });
  });
  const c = R.length * 3 + 1, r = linhaBox(R.length - 1, 0), MEDX = ["FFD4A514", "FF9EA3A8", "FFB8743A"];
  const caixa = (rr, cc, j, cor) => [[rr, j.a, D.BIR ? j.sa : j.pa], [rr + 1, j.b, D.BIR ? j.sb : j.pb]].forEach(([r2, nomeE, pl], k) => {
    const n = ws.getCell(r2, cc), p = ws.getCell(r2, cc + 1), forte = { style: "medium", color: { argb: cor } }, fina = { style: "thin", color: { argb: "FFCFD6DE" } };
    n.value = nomeE || ""; p.value = pl == null ? null : pl;
    n.border = { left: forte, top: k === 0 ? forte : fina, bottom: k === 1 ? forte : fina, right: fina }; p.border = { right: forte, top: k === 0 ? forte : fina, bottom: k === 1 ? forte : fina, left: fina };
    n.font = { bold: j.venc && j.venc === nomeE }; p.font = { bold: true }; p.alignment = { horizontal: "center" };
  });
  // disputa de 3º lugar, abaixo da final
  if (ch.terceiro) {
    const c3 = (R.length - 1) * 3 + 1, r3 = r + 4, t = ws.getCell(r3 - 1, c3);
    t.value = ch.terceiro.fase.toUpperCase() + (ch.terceiro.num ? " · Jogo " + ch.terceiro.num : ""); t.font = { bold: true, size: 9, color: { argb: MEDX[2] } };
    caixa(r3, c3, ch.terceiro, MEDX[2]);
  }
  // pódio
  const tit = ws.getCell(r - 2, c); tit.value = ch.serie != null ? "MEDALHAS" : "PÓDIO"; tit.font = { bold: true, color: { argb: hexArgb(marca.escura) } };
  const rot = ch.serie != null ? ["OURO", "PRATA", "BRONZE"] : ["CAMPEÃ", "VICE", "3º LUGAR"];
  [0, 1, 2].forEach(k => {
    const cel = ws.getCell(r - 1 + k, c);
    cel.value = (k + 1) + "º " + rot[k] + ": " + ((ch.podio || [])[k] || "____________________");
    cel.font = { bold: true, size: k ? 10 : 12, color: { argb: k === 1 ? "FF1A1A1A" : "FFFFFFFF" } }; cel.alignment = { vertical: "middle", wrapText: true };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MEDX[k] } };
    cel.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "medium" }, right: { style: "medium" } };
  });
  for (let rr = topo; rr <= topo + 4 * n0 + 6; rr++) ws.getRow(rr).height = 17;
}

export async function relatorioXLSX(T, jogos, esporte, marca) {
  const ExcelJS = await libXLSX(), D = montarDados(T, jogos, esporte), logo = await logoDataUrl(marca.logo, marca.fundoLogo), E = estilos(marca);
  const wb = new ExcelJS.Workbook(); wb.creator = marca.titulo; wb.created = new Date();
  // Resumo
  let ws = folha(wb, "Resumo", marca, logo, T.nome, "Relatório completo · gerado em " + hoje(), [30, 16, 46]);
  tituloSecao(ws, "Números gerais", E);
  tabelaXL(ws, ["Indicador", "Valor", "Detalhe"], D.numeros.map(([a, b, c]) => [a, typeof b === "string" && /^[\d,]+$/.test(b) ? Number(b.replace(",", ".")) : b, c]), E, { esq: [0, 2], negrito: [1], decimal: [1], altura: 20 });
  tituloSecao(ws, "Etapas", E);
  tabelaXL(ws, ["Etapa", "Local · data · horário", "Campeã"], D.etapas.map(e => [e.nome, [e.local, fmtData(e.data), e.hora].filter(Boolean).join(" · "), e.campea || "–"]), E, { esq: [0, 1, 2], negrito: [2] });
  const podsX = D.etapas.flatMap(e => e.podios.filter(p => p.p.some(Boolean)).map(p => [e.nome + " · " + p.titulo, (p.p[0] || "–") + " / " + (p.p[1] || "–"), p.p[2] || "–"]));
  if (podsX.length) { tituloSecao(ws, "Pódios", E); tabelaXL(ws, ["Etapa · disputa", "1º / 2º lugar", "3º lugar"], podsX, E, { esq: [0, 1, 2], negrito: [1] }); }
  if (D.fim.length) {
    const gt = geralTabela(D);
    ws = folha(wb, "Classificação geral", marca, logo, T.nome, "Classificação geral · " + (PTS() ? "pontos (desempate: pontos marcados)" : "vitórias, " + (D.BIR ? "" : "empates, ") + "saldo e pontos feitos") + " · Et. = colocação final na etapa", [6, 26, ...gt.head.slice(2).map(() => 9)], true);
    tituloSecao(ws, "Classificação geral", E);
    tabelaXL(ws, gt.head, gt.body, E, { esq: [1], negrito: [0, 1], destaque: i => i < 3 });
  }
  // Equipes
  const eqs = D.equipes.filter(e => e.n).sort((a, b) => b.mpf - a.mpf), fs = D.fases;
  ws = folha(wb, "Equipes", marca, logo, T.nome, "Pontos feitos (PF), tomados (PT) e saldo – por fase e geral", [24, ...[...fs, "Geral"].flatMap(() => [7, 7, 8]), 11, 11, 10], true);
  tituloSecao(ws, "Pontuação das equipes", E);
  tabelaXL(ws, [[{ t: "Equipe", span: 1 }, ...[...fs, "Geral"].map(f => ({ t: f, span: 3 })), { t: "Média feita", span: 1 }, { t: "Média sofrida", span: 1 }, { t: "Jogos", span: 1 }], ["", ...[...fs, "Geral"].flatMap(() => ["PF", "PT", "Saldo"]), "", "", ""]],
    eqs.map(e => [e.nome, ...[...fs, "geral"].flatMap(f => { const x = e.porFase[f]; return x ? [x.pf, x.pc, x.pf - x.pc] : ["–", "–", "–"]; }), Math.round(e.mpf * 10) / 10, Math.round(e.mpc * 10) / 10, e.n]), E, { esq: [0], negrito: [0], decimal: [3 * (fs.length + 1) + 1, 3 * (fs.length + 1) + 2] });
  tituloSecao(ws, "Vitórias e derrotas por etapa", E);
  const vdc = x => x ? x.v + "V " + x.d + "D" + (x.e ? " " + x.e + "E" : "") : "–";
  tabelaXL(ws, ["Equipe", ...T.etapas.map(e => e.nome), "Total", "Aproveitamento"], [...D.equipes].sort((a, b) => b.tot.v - a.tot.v || a.tot.d - b.tot.d).map(e => { const n = e.tot.v + e.tot.d + e.tot.e; return [e.nome, ...T.etapas.map((_, i) => vdc(e.vd[i])), vdc(e.tot), n ? Math.round(e.tot.v / n * 100) + "%" : "–"]; }), E, { esq: [0], negrito: [0] });
  // Classificação e jogos
  D.etapas.forEach(et => {
    if (et.vazio) return;
    ws = folha(wb, et.nome + " jogos", marca, logo, T.nome, et.nome + " · Classificação e resultados", D.BIR ? [7, 14, 6, 24, 12, 12, 12, 24, 8, 22] : [7, 14, 6, 22, 7, 7, 7, 7, 7, 10, 7, 22, 18], true);
    et.tabelas.forEach(g => { tituloSecao(ws, g.titulo, E);
      tabelaXL(ws, ["Pos.", "Equipe", "", "", ...(PTS() ? ["Pts"] : []), "J", "V", ...(D.BIR ? [] : ["E"]), "D", "PF", "PT", "Saldo"], g.classif.map((r, i) => [i + 1 + "º", D.nome(r.eid), "", "", ...(PTS() ? [r.pg] : []), r.j, r.v, ...(D.BIR ? [] : [r.e]), r.d, r.pf, r.pc, r.saldo]), E, { negrito: [1], destaque: i => i < g.passam, mesclas: [[1, 3]] }); });
    const todos = jogos.filter(j => j.etapa === et.idx && !j.wo).sort((a, b) => (D.numero[a.id] || 0) - (D.numero[b.id] || 0));
    tituloSecao(ws, "Todos os jogos", E);
    tabelaXL(ws, cabJogos(D.BIR), linhasJogos(D, todos, false).map((l, i) => { if (todos[i].fase === "mata") l[1] = todos[i].faseNome; return l; }), E, { esq: [], negrito: D.BIR ? [3, 7] : [3, 11] });
    if (et.final && et.final.completa) { const ft = finalTabela(D, et);
      tituloSecao(ws, "Classificação final da etapa", E);
      tabelaXL(ws, ["#", "Equipe", "", "", "Chegou até", "", "", "V", "D", "Saldo"], ft.body.map(r => [r[0], r[1], "", "", r[2], "", "", r[3], r[4], r[5]]), E, { esq: [1, 4], negrito: [1], destaque: i => i < 3, mesclas: [[1, 3], [4, 6]] }); }
    et.chaves.filter(ch => !ch.livre).forEach(ch => chaveXL(wb, et, ch, D, marca, logo, E, T));
  });
  // Atletas
  ws = folha(wb, "Atletas", marca, logo, T.nome, "Estatísticas individuais", [24, 6, 26, 8, 9, 9, 9, 9]);
  tituloSecao(ws, "Todos os atletas (ordenado por pontos)", E);
  const bqX = !D.BIR;
  tabelaXL(ws, ["Equipe", "Nº", "Atleta", "Jogos", "Pontos", "Média", ...(bqX ? ["Cestas de 3", "Cestas de 2", "Lances livres"] : []), D.atletasLbl, "Assist."], [...D.atletas].sort((a, b) => b.p - a.p || a.nome.localeCompare(b.nome)).map(a => [a.equipe, a.num ?? "", a.nome, a.nj, a.p, Math.round(a.med * 10) / 10, ...(bqX ? [a.c3, a.c2, a.c1] : []), a.b, a.as]), E, { esq: [0, 2], negrito: [4], decimal: [5] });
  // Gráficos (imagens)
  ws = folha(wb, "Gráficos", marca, logo, T.nome, "Gráficos do torneio", Array(12).fill(10.5));
  const comJogo = D.atletas.filter(a => a.nj);
  const graficos = [
    graficoBarras(eqs.map((e, i) => ({ nome: e.nome, v: e.mpf, txt: f1(e.mpf), hi: i === 0 })), marca.cor, marca.destaqueGrafico || marca.destaque, "Média de pontos de cada equipe (por jogo)"),
    graficoBarras([...eqs].sort((a, b) => b.saldo - a.saldo).map(e => ({ nome: e.nome, v: e.saldo, txt: (e.saldo > 0 ? "+" : "") + e.saldo })), marca.cor, marca.destaque, "Saldo de pontos das equipes", { saldo: true, pos: false }),
    graficoBarras([...comJogo].sort((a, b) => b.p - a.p).slice(0, 10).map((a, i) => ({ nome: a.nome + " (" + a.equipe + ")", v: a.p, hi: i === 0 })), marca.cor, marca.destaqueGrafico || marca.destaque, "10 maiores pontuadores"),
    graficoBarras([...comJogo].sort((a, b) => a.p - b.p).slice(0, 10).map(a => ({ nome: a.nome + " (" + a.equipe + ")", v: a.p })), marca.cor, marca.destaque, "10 menores pontuadores"),
    graficoBarras([...comJogo].sort((a, b) => b.med - a.med).slice(0, 10).map((a, i) => ({ nome: a.nome + " (" + a.equipe + ")", v: a.med, txt: f1(a.med), hi: i === 0 })), marca.cor, marca.destaqueGrafico || marca.destaque, "Média de pontos por atleta (10 melhores)")];
  if (D.porFase.length > 1) graficos.push(graficoBarras(D.porFase.map(f => ({ nome: f.fase, v: f.med, txt: f1(f.med) })), marca.cor, marca.destaque, "Média de pontos por jogo, por fase", { pos: false }));
  let linha = 6;
  graficos.forEach(g => { const id = wb.addImage({ base64: g.url, extension: "png" }); const w = 760, h = w * g.h / g.w; ws.addImage(id, { tl: { col: 0.2, row: linha }, ext: { width: w, height: h } }); linha += Math.ceil(h / 20) + 2; });
  await salvarXL(wb, arquivo(T, "relatorio.xlsx"));
}

async function salvarXL(wb, nome) {
  const buf = await wb.xlsx.writeBuffer();
  baixar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nome);
}

/* ======================= SÚMULA DE UMA PARTIDA ======================= */
function dadosSumula(T, j, esporte) {
  const BIR = esporte === "biribol", r = C.resultado(esporte, j), et = (T.etapas || [])[j.etapa] || {};
  const eq = id => (T.equipes || []).find(e => e.id === id) || { nome: "?", atletas: [] };
  const MS = !BIR && j.mesa ? resumoMesa(j) : null;
  const lados = ["a", "b"].map(l => {
    const e = eq(j[l]), ats = [...(e.atletas || [])].sort((x, y) => (x.num ?? 999) - (y.num ?? 999));
    const cart = aid => (j.sancoes || []).filter(x => x.l === l && x.quem === aid && (x.tipo === "amarelo" || x.tipo === "vermelho" || x.tipo === "desq")).map(x => x.tipo === "amarelo" ? "Amarelo" : x.tipo === "desq" ? "Amarelo + Vermelho (fora da etapa)" : "Vermelho").join(" + ");
    const ma = id => (MS && MS.atl[id]) || {}, fTxt = x => x.f ? x.f + (x.T || x.U || x.D ? " (" + [x.T && x.T + "T", x.U && x.U + "U", x.D && "D"].filter(Boolean).join(" ") + ")" : "") + (x.fora === "5 faltas" ? " · fora" : x.fora ? " · desq." : "") : "0";
    const linhas = ats.map(a => { const s = (j.stats || {})[a.id] || {}, x = ma(a.id); return { num: a.num ?? "", nome: a.nome + (e.capitao === a.id ? " (C)" : ""), p: s.p || 0, b: s.b || 0, as: s.as || 0, cart: cart(a.id), f: fTxt(x), c3: s.c3 || 0, c2: s.c2 || 0, c1: s.c1 || 0, ll: x.llt ? (s.c1 || 0) + " (" + x.llc + "/" + x.llt + ")" : String(s.c1 || 0) }; });
    const tot = linhas.reduce((t, x) => ({ p: t.p + x.p, b: t.b + x.b, as: t.as + x.as, c3: t.c3 + x.c3, c2: t.c2 + x.c2, c1: t.c1 + x.c1 }), { p: 0, b: 0, as: 0, c3: 0, c2: 0, c1: 0 });
    const cp = (e.atletas || []).find(a => a.id === e.capitao);
    return { nome: e.nome, linhas, tot, venceu: r.venc === j[l], tecnico: e.tecnico || "", capitao: cp ? "nº " + (cp.num ?? "–") + " " + cp.nome : "" };
  });
  const parciais = BIR ? (j.sets || []).filter(s => s.a || s.b).map((s, i) => ({ n: i < 2 ? (i + 1) + "º set" : "Tiebreak", a: s.a, b: s.b }))
    : (j.periodos || []).map(p => ({ n: /^\d/.test(p.n) ? p.n.replace("Q", "º quarto") : p.n === "BO" ? "Bola de ouro" : "Prorrogação " + p.n.slice(1), a: p.a, b: p.b }));
  const placar = BIR ? r.sa + " x " + r.sb : r.pa + " x " + r.pb;
  const resultado = r.empate ? "Empate" : r.venc ? "Vitória de " + eq(r.venc).nome + (BIR ? " por " + Math.max(r.sa, r.sb) + " sets a " + Math.min(r.sa, r.sb) : "") : "Sem resultado";
  const destaque = [...lados[0].linhas.map(x => ({ ...x, eq: lados[0].nome })), ...lados[1].linhas.map(x => ({ ...x, eq: lados[1].nome }))].sort((x, y) => y.p - x.p)[0];
  // sanções que vão para a súmula (advertência verbal não vai: regra 46.1)
  const ROT = { amarelo: "Cartão amarelo", vermelho: "Cartão vermelho (expulsão)", advDemora: "Advertência por demora", penDemora: "Penalização por demora" };
  const quem = x => x.quem === "tec" ? "Técnico" + (eq(j[x.l]).tecnico ? " " + eq(j[x.l]).tecnico : "") : x.quem === "com" ? "Comissão técnica" : x.quem === "eq" ? "Equipe" : (() => { const a = (eq(j[x.l]).atletas || []).find(y => y.id === x.quem) || {}; const n = j.rodizio && j.rodizio.atl && j.rodizio.atl[x.quem] && j.rodizio.atl[x.quem].num != null ? j.rodizio.atl[x.quem].num : a.num; return "nº " + (n ?? "–") + " " + (a.nome || "") + (eq(j[x.l]).capitao === x.quem ? " (C)" : ""); })();
  ROT.desq = "Amarelo + vermelho juntos (fora da etapa)";
  const rotS = x => x.tipo === "vermelho" && x.regra === "liga" ? "Cartão vermelho (fora do set)" : ROT[x.tipo];
  const sancoes = (j.sancoes || []).filter(x => ROT[x.tipo]).map(x => [rotS(x), eq(j[x.l]).nome, quem(x), x.set < 2 ? (x.set + 1) + "º set" : "Tiebreak", x.placar || ""]);
  const incompleta = j.incompleta ? eq(j[j.incompleta]).nome + " declarada incompleta (regra 23.3)" : "";
  const temCart = lados.some(l => l.linhas.some(x => x.cart));
  // mesa do basquete: faltas de equipe por quarto (prorrogação = 4º), tempos, técnico, lances livres
  const mesa = MS ? ["a", "b"].map(l => { const e = MS.eq[l]; return [eq(j[l]).nome, e.porQ["1Q"] || 0, e.porQ["2Q"] || 0, e.porQ["3Q"] || 0, e.porQ["4Q"] || 0, e.f, e.tempos,
    [e.tecC && e.tecC + " C", e.tecB && e.tecB + " B", e.tecD && "D"].filter(Boolean).join(" ") + (e.tecFora ? " (desq.)" : "") || "0", e.llc + "/" + e.llt]; }) : null;
  const A = j.arbitros || {}, arbitros = [A.a1 && "1º árbitro: " + A.a1, A.a2 && "2º árbitro: " + A.a2].filter(Boolean).join("   ·   ");
  // assinaturas: dupla de arbitragem, mesário, capitães e técnicos
  const assinaturas = ["1º árbitro" + (A.a1 ? " – " + A.a1 : ""), "2º árbitro" + (A.a2 ? " – " + A.a2 : ""), "Mesário / anotador", ...lados.map(l => "Capitão – " + l.nome + (l.capitao ? " (" + l.capitao + ")" : "")), ...lados.filter(l => l.tecnico).map(l => "Técnico – " + l.nome + " (" + l.tecnico + ")")];
  return { BIR, et, lados, parciais, placar, sancoes, incompleta, temCart, mesa, resultado, arbitros, assinaturas, destaque: destaque && destaque.p ? destaque : null, info: [T.nome, et.nome, j.faseNome].filter(Boolean).join(" · "), quando: [(et.localUnico === false && j.local) || et.local || j.local, fmtData(j.data || et.data), j.hora || et.hora].filter(Boolean).join(" · "),
    escudos: ["a", "b"].map(l => eq(j[l]).escudo || null) };
}
const nomeSumula = (T, j, D, ext) => arquivo(T, "sumula-" + (D.lados[0].nome + "-x-" + D.lados[1].nome).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase() + "." + ext);

export async function sumulaPDF(T, j, esporte, marca) {
  const jsPDF = await libPDF(), logo = await logoDataUrl(marca.logo, marca.fundoLogo), D = dadosSumula(T, j, esporte);
  const esc = await Promise.all(D.escudos.map(u => u ? logoDataUrl(u, "#ffffff") : null));
  const doc = pdfBase(jsPDF, marca, { T }, "Súmula"), m = marca, W = doc.internal.pageSize.getWidth();
  let y = cabecalho(doc, logo, "Súmula da partida", D.info);
  doc.setFontSize(9.5); doc.setTextColor("#555"); doc.text(D.quando, 10, y - 3); doc.setTextColor("#1a1a1a");
  if (D.arbitros) { doc.setFontSize(9.5); doc.setFont("helvetica", "bold"); doc.setTextColor("#333"); doc.text("Arbitragem – " + D.arbitros, 10, y + 1.5); doc.setFont("helvetica", "normal"); doc.setTextColor("#1a1a1a"); y += 6; }
  // placar
  doc.setFillColor("#f3f6fa"); doc.setDrawColor("#cfd6de"); doc.roundedRect(10, y, W - 20, 30, 2, 2, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  [[D.lados[0], 10 + (W - 20) * 0.25, esc[0], 12, 8], [D.lados[1], 10 + (W - 20) * 0.75, esc[1], W - 12 - 20, -8]].forEach(([l, cx0, e, ex, dx], i) => {
    // escudo da equipe na ponta do quadro do placar; o nome anda um pouco para dentro
    if (e) doc.addImage(e.url, "PNG", ex, y + 5, 20, 20, "esc" + i);
    const cx = e ? cx0 + dx : cx0;
    doc.setTextColor(l.venceu ? m.escura : "#444"); doc.text(doc.splitTextToSize(l.nome, (W - 20) * (e ? 0.3 : 0.4))[0], cx, y + 11, { align: "center" });
    if (l.venceu) { doc.setFontSize(8); doc.setTextColor(m.cor); doc.text("VENCEDORA", cx, y + 17, { align: "center" }); doc.setFontSize(13); }
  });
  doc.setFontSize(24); doc.setTextColor(m.escura); doc.text(D.placar, W / 2, y + 14, { align: "center" });
  doc.setFontSize(9.5); doc.setFont("helvetica", "normal"); doc.setTextColor("#333"); doc.text(D.resultado, W / 2, y + 24, { align: "center" });
  y += 38;
  y = secao(doc, y, D.BIR ? "Sets" : "Períodos", logo);
  y = tabela(doc, y, { head: [["", D.lados[0].nome, D.lados[1].nome]], body: [...D.parciais.map(p => [p.n, p.a, p.b]), ["Total de pontos", D.parciais.reduce((s, p) => s + (p.a || 0), 0), D.parciais.reduce((s, p) => s + (p.b || 0), 0)]],
    styles: { halign: "center", fontSize: 9.5, cellPadding: 1.3 }, columnStyles: { 0: { halign: "left", fontStyle: "bold", cellWidth: 45 } },
    didParseCell: d => { if (d.section === "body" && d.row.index === D.parciais.length) { d.cell.styles.fontStyle = "bold"; d.cell.styles.fillColor = "#e6f2fb"; } } }, logo);
  const lbl = D.BIR ? "Bloqueios" : "Tocos";
  D.lados.forEach(l => {
    y = secao(doc, y, "Atletas – " + l.nome, logo);
    if (l.tecnico || l.capitao) { doc.setFontSize(8.5); doc.setTextColor("#444"); doc.text([l.tecnico && "Técnico: " + l.tecnico, l.capitao && "Capitão: " + l.capitao].filter(Boolean).join("   ·   "), 10, y); doc.setTextColor("#1a1a1a"); y += 4; }
    const cc = D.temCart, mm = !!D.mesa, bq = !D.BIR, body = l.linhas.length ? l.linhas.map(x => [x.num, x.nome, x.p, ...(bq ? [x.c3, x.c2, x.ll] : []), x.b, x.as, ...(mm ? [x.f] : []), ...(cc ? [x.cart] : [])]) : [["", "(atletas não cadastrados)", "", ...(bq ? ["", "", ""] : []), "", "", ...(mm ? [""] : []), ...(cc ? [""] : [])]];
    y = tabela(doc, y, { head: [["Nº", "Atleta", "Pontos", ...(bq ? ["Cestas de 3", "Cestas de 2", "Lances livres"] : []), lbl, "Assist.", ...(mm ? ["Faltas"] : []), ...(cc ? ["Cartões"] : [])]], body: [...body, ["", "Total", l.tot.p, ...(bq ? [l.tot.c3, l.tot.c2, l.tot.c1] : []), l.tot.b, l.tot.as, ...(mm ? [""] : []), ...(cc ? [""] : [])]],
      styles: { halign: "center", fontSize: 8.5, cellPadding: 1.1 }, columnStyles: { 0: { cellWidth: 14 }, 1: { halign: "left" } },
      didParseCell: d => { if (d.section === "body" && d.row.index === body.length) { d.cell.styles.fontStyle = "bold"; d.cell.styles.fillColor = "#e6f2fb"; } } }, logo);
  });
  if (D.mesa) {
    y = secao(doc, y, "Faltas de equipe por quarto, tempos e técnico", logo);
    y = tabela(doc, y, { head: [["Equipe", "1º Q", "2º Q", "3º Q", "4º Q + prorr.", "Faltas", "Tempos", "Técnico/banco", "Lances livres"]], body: D.mesa, styles: { halign: "center", fontSize: 8.5, cellPadding: 1.1 }, columnStyles: { 0: { halign: "left" } } }, logo);
    doc.setFontSize(7.5); doc.setTextColor("#666"); doc.text("Faltas: T = técnica, U = antidesportiva, D = desqualificante. Técnico: C = técnica do técnico, B = técnica do banco. A partir da 5ª falta de equipe no quarto: penalidade.", 10, y - 2, { maxWidth: W - 20 }); doc.setTextColor("#1a1a1a"); y += 5;
  }
  if (D.sancoes.length || D.incompleta) {
    y = secao(doc, y, "Sanções", logo);
    y = tabela(doc, y, { head: [["Sanção", "Equipe", "Quem", "Set", "Placar"]], body: [...D.sancoes, ...(D.incompleta ? [[D.incompleta, "", "", "", ""]] : [])], styles: { fontSize: 8.5, cellPadding: 1.1 } }, logo);
  }
  if (D.destaque) { doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text((D.BIR ? "Maior pontuador: " : "Cestinha: ") + D.destaque.nome + " (" + D.destaque.eq + ") – " + D.destaque.p + " pontos", 10, y); doc.setFont("helvetica", "normal"); y += 8; }
  // assinaturas
  if (y > doc.internal.pageSize.getHeight() - 36) { doc.addPage(); y = cabecalho(doc, logo, "Súmula da partida", D.info); }
  y += 8; doc.setDrawColor("#888"); doc.setLineWidth(0.3); doc.setFontSize(8.5); doc.setTextColor("#555");
  const ass = D.assinaturas, cw = (W - 30) / 2;
  if (y + Math.ceil(ass.length / 2) * 15 > doc.internal.pageSize.getHeight() - 12) { doc.addPage(); y = cabecalho(doc, logo, "Súmula da partida", D.info) + 8; }
  ass.forEach((t, i) => { const x = 10 + (i % 2) * (cw + 10), yy = y + Math.floor(i / 2) * 15; doc.line(x, yy, x + cw, yy); doc.text(doc.splitTextToSize(t, cw)[0], x, yy + 4.5); });
  rodapes(doc);
  doc.save(nomeSumula(T, j, D, "pdf"));
}

export async function sumulaXLSX(T, j, esporte, marca) {
  const ExcelJS = await libXLSX(), logo = await logoDataUrl(marca.logo, marca.fundoLogo), E = estilos(marca), D = dadosSumula(T, j, esporte);
  const wb = new ExcelJS.Workbook(); wb.creator = marca.titulo; wb.created = new Date();
  const ws = folha(wb, "Súmula", marca, logo, "Súmula da partida", D.info + (D.quando ? " · " + D.quando : ""), [8, 30, 12, 12, 12], false);
  if (D.arbitros) { tituloSecao(ws, "Arbitragem – " + D.arbitros, E); ws.__linha++; }
  tituloSecao(ws, "Placar", E);
  tabelaXL(ws, ["", D.lados[0].nome, "", D.lados[1].nome, ""], [["Placar", D.lados[0].venceu ? "VENCEDORA" : "", D.placar.split(" x ")[0], D.lados[1].venceu ? "VENCEDORA" : "", D.placar.split(" x ")[1]], ["Resultado", D.resultado, "", "", ""]], E, { esq: [0, 1], negrito: [2, 4], altura: 22 });
  tituloSecao(ws, D.BIR ? "Sets" : "Períodos", E);
  tabelaXL(ws, ["", D.lados[0].nome, "", D.lados[1].nome, ""], [...D.parciais.map(p => [p.n, "", p.a, "", p.b]), ["Total", "", D.parciais.reduce((s, p) => s + (p.a || 0), 0), "", D.parciais.reduce((s, p) => s + (p.b || 0), 0)]], E, { esq: [0], negrito: [0, 2, 4] });
  const lbl = D.BIR ? "Bloqueios" : "Tocos";
  D.lados.forEach(l => {
    tituloSecao(ws, "Atletas – " + l.nome + (l.tecnico ? " · Técnico: " + l.tecnico : "") + (l.capitao ? " · Capitão: " + l.capitao : ""), E);
    const cc = D.temCart, mm = !!D.mesa, bq = !D.BIR;
    tabelaXL(ws, ["Nº", "Atleta", "Pontos", ...(bq ? ["Cestas de 3", "Cestas de 2", "Lances livres"] : []), lbl, "Assist.", ...(mm ? ["Faltas"] : []), ...(cc ? ["Cartões"] : [])], [...l.linhas.map(x => [x.num, x.nome, x.p, ...(bq ? [x.c3, x.c2, x.ll] : []), x.b, x.as, ...(mm ? [x.f] : []), ...(cc ? [x.cart] : [])]), ["", "Total", l.tot.p, ...(bq ? [l.tot.c3, l.tot.c2, l.tot.c1] : []), l.tot.b, l.tot.as, ...(mm ? [""] : []), ...(cc ? [""] : [])]], E, { esq: [1], negrito: [2], destaque: i => i === l.linhas.length });
  });
  if (D.mesa) { tituloSecao(ws, "Faltas de equipe por quarto, tempos e técnico", E); tabelaXL(ws, ["Equipe", "1º Q", "2º Q", "3º Q", "4º Q + prorr.", "Faltas", "Tempos", "Técnico/banco", "Lances livres"], D.mesa, E, { esq: [0] }); }
  if (D.sancoes.length || D.incompleta) { tituloSecao(ws, "Sanções", E); tabelaXL(ws, ["Sanção", "Equipe", "Quem", "Set", "Placar"], [...D.sancoes, ...(D.incompleta ? [[D.incompleta, "", "", "", ""]] : [])], E, { esq: [0, 1, 2] }); }
  if (D.destaque) { tituloSecao(ws, (D.BIR ? "Maior pontuador: " : "Cestinha: ") + D.destaque.nome + " (" + D.destaque.eq + ") – " + D.destaque.p + " pontos", E); ws.__linha++; }
  tituloSecao(ws, "Assinaturas", E);
  D.assinaturas.forEach(t => {
    const r = ws.__linha; ws.getRow(r).height = 30; ws.getCell(r, 1).value = t; ws.getCell(r, 1).font = { name: "Calibri", size: 10, color: { argb: "FF555555" } };
    ws.mergeCells(r, 2, r, 5); ws.getCell(r, 2).border = { bottom: { style: "thin", color: { argb: "FF888888" } } }; ws.__linha = r + 1;
  });
  await salvarXL(wb, nomeSumula(T, j, D, "xlsx"));
}

/* ======================= RELATÓRIO DAS ABAS DE ESTATÍSTICAS ======================= */
// spec = { titulo, sub, arquivo, blocos: [
//   { t: "quadros", titulo, itens: [[rótulo, valor, detalhe]] },
//   { t: "barras", titulo, cap, itens: [{ nome, sub, v, txt, extra, hi }], pos, saldo },
//   { t: "tabela", titulo, cap, cab: [..], linhas: [[..]], esq: [índices alinhados à esquerda] } ] }
const nomeArq = s => (s || "estatisticas").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
// texto seguro para as fontes padrão do PDF (sem emoji e com sinal de menos comum)
const txtPDF = v => v == null ? "–" : typeof v === "number" ? v : String(v).replace(/−/g, "-").replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, "").replace(/\s{2,}/g, " ").trim();
export async function estatPDF(specIn, marca) {
  const jsPDF = await libPDF(), logo = await logoDataUrl(marca.logo, marca.fundoLogo);
  // limitePDF: listas longas só com os primeiros no PDF (o Excel leva tudo)
  const spec = { ...specIn, titulo: txtPDF(specIn.titulo), sub: txtPDF(specIn.sub || ""), blocos: specIn.blocos.map(b => b.t === "quadros" ? { ...b, itens: b.itens.map(i => i.map(txtPDF)) }
    : b.t === "barras" ? { ...b, cap: b.limitePDF && b.itens.length > b.limitePDF ? (b.cap ? b.cap + " · " : "") + "os " + b.limitePDF + " primeiros (lista completa no Excel)" : b.cap, itens: (b.limitePDF ? b.itens.slice(0, b.limitePDF) : b.itens).map(i => ({ ...i, nome: txtPDF(i.nome), sub: i.sub && txtPDF(i.sub), txt: txtPDF(i.txt != null ? i.txt : i.fmt != null ? i.fmt : i.v), extra: i.extra && txtPDF(i.extra) })) }
    : { ...b, linhas: b.linhas.map(l => l.map(txtPDF)) }) };
  const largo = spec.blocos.some(b => b.t === "tabela" && b.cab.length > 9);
  const doc = pdfBase(jsPDF, marca, { T: { nome: spec.titulo } }, spec.sub || "Estatísticas", largo ? "landscape" : "portrait");
  let y = cabecalho(doc, logo, spec.titulo, spec.sub || "");
  spec.blocos.forEach(b => {
    if (b.t === "quadros" && b.itens.length) { if (b.titulo) y = secao(doc, y, b.titulo, logo); y = quadros(doc, y, b.itens.map(([a, v, c]) => [a, v == null ? "–" : v, c || ""]), logo); }
    else if (b.t === "barras") {
      y = secao(doc, y, b.titulo, logo);
      if (b.cap) { doc.setFontSize(8.5); doc.setTextColor("#666"); doc.text(doc.splitTextToSize(b.cap, doc.internal.pageSize.getWidth() - 24)[0], 14, y); doc.setTextColor("#1a1a1a"); y += 4; }
      y = barrasPDF(doc, y, b.itens.map(i => ({ ...i, txt: i.txt != null ? i.txt : i.fmt })), { pos: b.pos, saldo: b.saldo }, logo);
    } else if (b.t === "tabela") {
      y = secao(doc, y, b.titulo, logo);
      if (b.cap) { doc.setFontSize(8.5); doc.setTextColor("#666"); doc.text(doc.splitTextToSize(b.cap, doc.internal.pageSize.getWidth() - 24)[0], 14, y); doc.setTextColor("#1a1a1a"); y += 4; }
      const cs = {}; (b.esq || [0]).forEach(i => cs[i] = { halign: "left" }); if ((b.esq || [0]).includes(0)) cs[0].fontStyle = "bold";
      const fs = b.cab.length > 12 ? 6.6 : b.cab.length > 8 ? 7.6 : 8.6;
      y = tabela(doc, y, { head: [b.cab], body: b.linhas.length ? b.linhas.map(l => l.map(v => v == null ? "–" : String(v))) : [[{ content: "Sem dados.", colSpan: b.cab.length }]],
        styles: { fontSize: fs, halign: "center", cellPadding: 1.3, lineColor: "#cfd6de", lineWidth: 0.15 }, columnStyles: cs }, logo);
    }
  });
  rodapes(doc);
  baixar(doc.output("blob"), (spec.arquivo || nomeArq(spec.titulo + " " + (spec.sub || ""))) + ".pdf");
}
export async function estatXLSX(spec, marca) {
  const ExcelJS = await libXLSX(), logo = await logoDataUrl(marca.logo, marca.fundoLogo), E = estilos(marca);
  const wb = new ExcelJS.Workbook(); wb.creator = marca.titulo; wb.created = new Date();
  const ws = folha(wb, "Resumo", marca, logo, spec.titulo, spec.sub || "", [8, 34, 16, 44]);
  const usados = new Set(["Resumo"]);
  spec.blocos.forEach(b => {
    if (b.t === "quadros" && b.itens.length) { tituloSecao(ws, b.titulo || "Números", E); tabelaXL(ws, ["", "Indicador", "Valor", "Detalhe"], b.itens.map(([a, v, c]) => ["", a, v == null ? "" : v, c || ""]), E, { esq: [1, 3], negrito: [2] }); }
    else if (b.t === "barras") {
      tituloSecao(ws, b.titulo, E);
      tabelaXL(ws, ["#", "Nome", "Valor", "Detalhe"], b.itens.map((i, k) => [b.pos === false ? "" : k + 1, i.nome + (i.sub ? " · " + i.sub : ""), i.txt != null ? i.txt : i.fmt != null ? i.fmt : i.v, i.extra || ""]), E, { esq: [1, 3], negrito: [2] });
    } else if (b.t === "tabela") {
      let nome = (b.titulo || "Tabela").replace(/[\\/?*[\]:]/g, " ").slice(0, 28), n = 2; while (usados.has(nome)) nome = nome.slice(0, 26) + " " + n++;
      usados.add(nome);
      const larg = b.cab.map((c, i) => (b.esq || [0]).includes(i) ? 30 : Math.max(9, String(c).length + 3));
      const wt = folha(wb, nome, marca, logo, spec.titulo, (spec.sub ? spec.sub + " · " : "") + b.titulo, larg, b.cab.length > 8);
      if (b.cap) { const r = wt.__linha; wt.mergeCells(r, 1, r, wt.__n); const c = wt.getCell(r, 1); c.value = b.cap; c.font = { italic: true, size: 10, color: { argb: "FF666666" } }; wt.__linha = r + 2; }
      tabelaXL(wt, b.cab, b.linhas.map(l => l.map(v => v == null ? "–" : v)), E, { esq: b.esq || [0], negrito: [0] });
    }
  });
  await salvarXL(wb, (spec.arquivo || nomeArq(spec.titulo + " " + (spec.sub || ""))) + ".xlsx");
}
