// Mesa do basquete (regras oficiais FIBA 2024, seguidas pela CBB): quinteto em quadra, substituições, faltas
// (pessoal, ofensiva, técnica, antidesportiva, desqualificante, dupla; técnica do técnico e do banco),
// faltas de equipe por quarto com penalidade, lances livres gerados pela falta, pedidos de tempo,
// seta de posse alternada e relógio de 24/14 s. Ligado com ctx.mesaBasquete no módulo de torneio.
//
// Dados no jogo (Firestore, sem lista dentro de lista):
//   j.mesa = { q: "1Q"|"2Q"|"3Q"|"4Q"|"P1"..., ini: { a:[5 aids], b:[5 aids] }, salto: "a"|"b",
//              ev: [ {t:"f", l, quem: aid|"tec"|"banco", tipo, arr, conv, sofreu, ll, q, dupla?, pts?}
//                    {t:"ll", l, aid, ok, q} · {t:"s", l, sai, entra, q} · {t:"to", l, q, u2} · {t:"pos", l, q} ],
//              pend: null | { l, aid, n, feitos, motivo, k } }   // lances livres a cobrar agora
//
// Regras usadas:
//  - Falta de jogador (P, O, T, U, D) conta para o atleta e para a equipe. 5 faltas = sai do jogo (art. 40).
//  - Desqualificação: falta desqualificante; ou 2 técnicas, 2 antidesportivas ou 1 técnica + 1 antidesportiva (art. 36–37).
//  - Técnico: desqualificado com 2 técnicas pessoais (C), 3 técnicas somadas com as do banco (B) ou 1 desqualificante (art. 36).
//  - Faltas de equipe (art. 41): só as dos jogadores (técnicas do técnico/banco não contam); zeram a cada quarto;
//    prorrogação conta como parte do 4º quarto. A partir da 5ª falta no quarto, falta pessoal defensiva sem arremesso = 2 lances livres.
//  - Lances livres: arremesso de 2 errado = 2; de 3 errado = 3; convertido = cesta + 1; sem arremesso = 0 (ou 2 na penalidade);
//    ofensiva = 0 e posse para o adversário; técnica = 1 + jogo segue com quem tinha a bola; antidesportiva e desqualificante =
//    2 (ou 3 / cesta + 1 no arremesso) + posse para quem sofreu; dupla = registro para ambos, sem lances livres.
//  - Tempos (art. 18): 2 no 1º tempo, 3 no 2º tempo (no máximo 2 nos últimos 2 min do 4º quarto), 1 em cada prorrogação.
//  - Posse alternada (art. 12): quem perde a bola ao alto inicial fica com a seta; a seta vira a cada reposição alternada
//    (bola presa e início do 2º, 3º, 4º quarto e das prorrogações).

export const TIPOS = {
  P: { rot: "Pessoal", curto: "P", jog: true },
  O: { rot: "Ofensiva", curto: "O", jog: true },
  T: { rot: "Técnica", curto: "T", jog: true },
  U: { rot: "Antidesportiva", curto: "U", jog: true },
  D: { rot: "Desqualificante", curto: "D", jog: true },
  C: { rot: "Técnica do técnico", curto: "C", jog: false },
  B: { rot: "Técnica do banco", curto: "B", jog: false },
  DT: { rot: "Desqualificante (técnico)", curto: "D", jog: false }
};
export const outro = l => (l === "a" ? "b" : "a");
export const nomeQ = n => !n ? "" : n === "BO" ? "Bola de ouro" : /^P/.test(n) ? "Prorrogação " + n.slice(1) : n.replace("Q", "º quarto");
export const qFaltas = q => (/^P/.test(q) || q === "BO" ? "4Q" : q); // prorrogação = 4º quarto para a penalidade
export const duracaoQ = q => (/^P/.test(q) ? 300 : 600);
const ORDEM_Q = ["1Q", "2Q", "3Q", "4Q"];
const metade = q => (q === "1Q" || q === "2Q" ? "1T" : q === "3Q" || q === "4Q" ? "2T" : q);

// estado da mesa depois de todos os lances
export function estado(j) {
  const m = j.mesa;
  if (!m || !m.ini) return null;
  const quadra = { a: [...(m.ini.a || [])], b: [...(m.ini.b || [])] };
  const faltas = {}, ll = {}, eqQ = { a: {}, b: {} }, tec = { a: { C: 0, B: 0, D: 0 }, b: { C: 0, B: 0, D: 0 } }, tempos = { a: [], b: [] };
  let seta = m.salto ? outro(m.salto) : null;
  const F = id => faltas[id] || (faltas[id] = { P: 0, O: 0, T: 0, U: 0, D: 0, n: 0 });
  (m.ev || []).forEach((e, k) => {
    if (!e) return;
    if (e.t === "f") {
      if (e.quem === "tec" || e.quem === "banco") { const t = tec[e.l]; if (e.tipo === "C") t.C++; else if (e.tipo === "B") t.B++; else t.D++; return; }
      const x = F(e.quem); x[e.tipo] = (x[e.tipo] || 0) + 1; x.n++;
      const qk = qFaltas(e.q); eqQ[e.l][qk] = (eqQ[e.l][qk] || 0) + 1;
    } else if (e.t === "ll") { const x = ll[e.aid] || (ll[e.aid] = { c: 0, t: 0 }); x.t++; if (e.ok) x.c++; }
    else if (e.t === "s") { const i = quadra[e.l].indexOf(e.sai); if (i >= 0) quadra[e.l][i] = e.entra; }
    else if (e.t === "to") tempos[e.l].push(e);
    else if (e.t === "pos") seta = outro(e.l);
  });
  const fora = {};
  Object.entries(faltas).forEach(([id, x]) => {
    if (x.D || x.T >= 2 || x.U >= 2 || (x.T >= 1 && x.U >= 1)) fora[id] = "desqualificado";
    else if (x.n >= 5) fora[id] = "5 faltas";
  });
  const tecFora = { a: tecDesq(tec.a), b: tecDesq(tec.b) };
  return { q: m.q || "1Q", quadra, faltas, ll, eqQ, tec, tecFora, tempos, seta, fora, pend: m.pend || null };
}
const tecDesq = t => t.D >= 1 || t.C >= 2 || t.C + t.B >= 3;
export const faltasEquipe = (est, l, q) => (est.eqQ[l][qFaltas(q || est.q)] || 0);
export const naPenalidade = (est, l, q) => faltasEquipe(est, l, q) >= 4; // a próxima falta já é a 5ª

// tempos disponíveis agora (rest = segundos que faltam no quarto)
export function temposDisponiveis(est, l, q, rest) {
  const usados = est.tempos[l];
  if (q === "1Q" || q === "2Q") return Math.max(0, 2 - usados.filter(e => metade(e.q) === "1T").length);
  if (q === "3Q" || q === "4Q") {
    const u2t = usados.filter(e => metade(e.q) === "2T").length;
    let d = 3 - u2t;
    if (q === "4Q" && rest != null && rest <= 120) d = Math.min(d, 2 - usados.filter(e => e.u2).length);
    return Math.max(0, d);
  }
  return Math.max(0, 1 - usados.filter(e => e.q === q).length);
}
export const temposMax = q => (q === "1Q" || q === "2Q" ? 2 : q === "3Q" || q === "4Q" ? 3 : 1);

// o que a regra manda para uma falta { tipo, l (quem cometeu), arr: 0|2|3, conv }
export function consequencia(est, f) {
  const sofre = outro(f.l), pen = naPenalidade(est, f.l);
  const ret = { ll: 0, posse: null, txt: "", fe: TIPOS[f.tipo] && TIPOS[f.tipo].jog };
  const arrLL = () => (f.arr && f.conv ? 1 : f.arr ? f.arr : 0);
  if (f.dupla) { ret.txt = "Falta dupla: registrada para os dois, sem lances livres. O jogo segue com quem tinha a bola (ou pela posse alternada)."; return ret; }
  switch (f.tipo) {
    case "P":
      if (f.arr) ret.ll = arrLL();
      else if (pen) ret.ll = 2;
      ret.txt = f.arr ? (f.conv ? "Cesta vale + 1 lance livre." : f.arr + " lances livres (arremesso de " + f.arr + " não convertido).")
        : pen ? "Equipe na penalidade (5ª falta ou mais no quarto): 2 lances livres." : "Sem lances livres: reposição lateral para quem sofreu a falta.";
      break;
    case "O": ret.posse = sofre; ret.txt = "Falta ofensiva: sem lances livres, posse para o adversário" + (pen ? " (mesmo na penalidade)." : "."); break;
    case "T": case "C": case "B": ret.ll = 1; ret.txt = "1 lance livre para o adversário (qualquer atleta em quadra). O jogo recomeça com quem tinha a bola."; break;
    case "U": case "D": case "DT":
      ret.ll = f.arr ? arrLL() : 2; ret.posse = sofre;
      ret.txt = (f.arr && f.conv ? "Cesta vale + 1 lance livre" : ret.ll + " lances livres") + " e posse de bola para quem sofreu (reposição na linha da quadra de ataque)." + (f.tipo !== "U" ? " O infrator sai imediatamente do jogo (vestiário)." : "");
      break;
  }
  return ret;
}

// estatísticas da mesa de um jogo: por atleta e por equipe
export function resumo(j) {
  const est = estado(j); if (!est) return null;
  const atl = {};
  Object.entries(est.faltas).forEach(([id, x]) => { atl[id] = { ...(atl[id] || {}), f: x.n, P: x.P, O: x.O, T: x.T, U: x.U, D: x.D }; });
  Object.entries(est.ll).forEach(([id, x]) => { atl[id] = { ...(atl[id] || {}), llc: x.c, llt: x.t }; });
  Object.entries(est.fora).forEach(([id, v]) => { atl[id] = { ...(atl[id] || {}), fora: v }; });
  const eq = {};
  ["a", "b"].forEach(l => {
    const ids = new Set(((j.mesa.ev || []).filter(e => e && e.l === l && e.t === "f" && e.quem !== "tec" && e.quem !== "banco")).map(e => e.quem));
    let f = 0, T = 0, U = 0, D = 0, llc = 0, llt = 0;
    (j.mesa.ev || []).forEach(e => { if (!e || e.l !== l) return;
      if (e.t === "f" && e.quem !== "tec" && e.quem !== "banco") { f++; if (e.tipo === "T") T++; if (e.tipo === "U") U++; if (e.tipo === "D") D++; }
      if (e.t === "ll") { llt++; if (e.ok) llc++; } });
    const porQ = {}; Object.entries(est.eqQ[l]).forEach(([q, n]) => porQ[q] = n);
    eq[l] = { f, T, U, D, llc, llt, tempos: est.tempos[l].length, tecC: est.tec[l].C, tecB: est.tec[l].B, tecD: est.tec[l].D, tecFora: est.tecFora[l], porQ, faltaram: ids.size };
  });
  return { atl, eq };
}

/* ---------------- relógio de posse (24/14 s), local da tela do mesário ---------------- */
const posse = { rest: 24, t: null, rodando: false };
const pad = n => String(n).padStart(2, "0");
function tick24(o) {
  posse.rest = Math.max(0, posse.rest - 1);
  const v = document.getElementById("bq-24-v"); if (v) { v.textContent = posse.rest; v.classList.toggle("alerta", posse.rest <= 5); }
  if (!posse.rest) { pararRelogios(o); o.toast("Violação de 24 segundos: posse para o adversário."); o.salvar(); }
}
function iniciarRelogios(o) { o.cron.iniciar(); if (!posse.rodando) { posse.rodando = true; posse.t = setInterval(() => tick24(o), 1000); } marcarRel(o); }
function pararRelogios(o) { o.cron.parar(); posse.rodando = false; clearInterval(posse.t); marcarRel(o); }
// guarda os relógios no jogo (só ao iniciar/parar/zerar) para a aba Ao vivo e o placar da live contarem sozinhos
function marcarRel(o) { if (o.j && o.j.mesa) o.j.mesa.rel = { rest: o.cron.rest, rod: !!o.cron.rodando, p: posse.rest, em: Date.now() }; }
// relógios agora (para quem só assiste): { rest, p, rod }
export function relogioAgora(m, agora) {
  const r = m && m.rel; if (!r) return null;
  const d = r.rod ? Math.floor(((agora || Date.now()) - r.em) / 1000) : 0;
  return { rest: Math.max(0, r.rest - d), p: Math.max(0, r.p - d), rod: !!r.rod && r.rest - d > 0 };
}
// ao abrir a súmula de novo (outro aparelho ou recarregou): relógios voltam ao valor salvo
export function restaurar(m) { const r = relogioAgora(m); if (r) posse.rest = r.p; return r; }
export const fmtRel = s => pad(Math.floor(s / 60)) + ":" + pad(s % 60);
export function pararTudo() { posse.rodando = false; clearInterval(posse.t); }

/* ---------------- desenho da quadra (SVG) ---------------- */
const NS = "http://www.w3.org/2000/svg";
function s(tag, at, ...kids) {
  const e = document.createElementNS(NS, tag);
  Object.entries(at || {}).forEach(([k, v]) => v != null && e.setAttribute(k, v));
  kids.flat().forEach(c => c != null && e.append(typeof c === "string" ? document.createTextNode(c) : c));
  return e;
}
export const CORES = { a: { c: "#ec6a2c", e: "#9b3d0f" }, b: { c: "#2b6fd6", e: "#163f86" } };
// posições (fração da quadra) de cada um dos 5 em quadra, na metade de cada equipe
const SLOTS = [[0.12, 0.47], [0.24, 0.16], [0.25, 0.71], [0.39, 0.3], [0.39, 0.6]];
export function quadra(o) {
  const { est, num, nomes, capitaes } = o, W = 560, H = 300, m = 10;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "bq-svg", role: "img", "aria-label": "Quadra com os jogadores em quadra, faltas e posse alternada" });
  // piso e linhas
  svg.append(s("rect", { x: 0, y: 0, width: W, height: H, rx: 14, fill: "#d9a066" }),
    s("rect", { x: m, y: m, width: W - 2 * m, height: H - 2 * m, fill: "#e6b47c", stroke: "#fff", "stroke-width": 3 }),
    s("line", { x1: W / 2, y1: m, x2: W / 2, y2: H - m, stroke: "#fff", "stroke-width": 3 }),
    s("circle", { cx: W / 2, cy: H / 2, r: 34, fill: "none", stroke: "#fff", "stroke-width": 3 }));
  [0, 1].forEach(lado => {
    const x0 = lado ? W - m : m, dir = lado ? -1 : 1;
    svg.append(s("rect", { x: lado ? x0 - 112 : x0, y: H / 2 - 48, width: 112, height: 96, fill: lado ? "rgb(43 111 214 / .25)" : "rgb(236 106 44 / .25)", stroke: "#fff", "stroke-width": 3 }),
      s("circle", { cx: x0 + dir * 112, cy: H / 2, r: 36, fill: "none", stroke: "#fff", "stroke-width": 3 }),
      s("path", { d: `M ${x0} ${H / 2 - 128} L ${x0 + dir * 30} ${H / 2 - 128} A 132 132 0 0 ${lado ? 0 : 1} ${x0 + dir * 30} ${H / 2 + 128} L ${x0} ${H / 2 + 128}`, fill: "none", stroke: "#fff", "stroke-width": 3 }),
      s("line", { x1: x0 + dir * 12, y1: H / 2 - 18, x2: x0 + dir * 12, y2: H / 2 + 18, stroke: "#333", "stroke-width": 3 }),
      s("circle", { cx: x0 + dir * 22, cy: H / 2, r: 8, fill: "none", stroke: "#e2541b", "stroke-width": 3 }));
  });
  // seta de posse alternada no círculo central
  if (est.seta) {
    const d = est.seta === "a" ? -1 : 1, c = CORES[est.seta].c;
    svg.append(s("g", { class: "bq-seta" }, s("path", { d: `M ${W / 2 - d * 18} ${H / 2 - 9} L ${W / 2 + d * 6} ${H / 2 - 9} L ${W / 2 + d * 6} ${H / 2 - 18} L ${W / 2 + d * 24} ${H / 2} L ${W / 2 + d * 6} ${H / 2 + 18} L ${W / 2 + d * 6} ${H / 2 + 9} L ${W / 2 - d * 18} ${H / 2 + 9} Z`, fill: c, stroke: "#fff", "stroke-width": 2 }),
      s("title", null, "Posse alternada: " + nomes[est.seta])));
  }
  // jogadores
  ["a", "b"].forEach((l, li) => {
    const cor = CORES[l];
    est.quadra[l].forEach((id, k) => {
      const [fx, fy] = SLOTS[k] || [0.3, 0.5], cx = li ? W - fx * W : fx * W, cy = fy * H;
      const f = (est.faltas[id] || {}).n || 0, fora = est.fora[id];
      const g = s("g", { class: "bq-jog" + (o.clicar ? " clicavel" : ""), "data-aid": id, tabindex: o.clicar ? 0 : null, role: o.clicar ? "button" : null, "aria-label": o.clicar ? "Falta de nº " + (num(id) ?? "") : null });
      g.append(s("circle", { cx, cy: cy + 2, r: 21, fill: "rgb(0 0 0 / .25)" }), s("circle", { cx, cy, r: 20, fill: cor.c, stroke: fora ? "#e0282e" : "#fff", "stroke-width": fora ? 4 : 2.5 }),
        s("text", { x: cx, y: cy + 6, "text-anchor": "middle", "font-size": 17, "font-weight": 800, fill: "#fff", "font-family": "system-ui,sans-serif" }, String(num(id) ?? "–")));
      if (capitaes && capitaes[l] === id) g.append(s("circle", { cx: cx + 16, cy: cy - 15, r: 8, fill: "#ffd84a", stroke: "#7a5b00", "stroke-width": 1.5 }), s("text", { x: cx + 16, y: cy - 11, "text-anchor": "middle", "font-size": 10, "font-weight": 900, fill: "#5a4300" }, "C"));
      // 5 bolinhas de falta
      for (let i = 0; i < 5; i++) g.append(s("circle", { cx: cx - 20 + i * 10, cy: cy + 31, r: 4, fill: i < f ? (f >= 4 ? "#e0282e" : "#fff") : "rgb(0 0 0 / .25)", stroke: "#fff", "stroke-width": i < f ? 0 : 0.8 }));
      if (fora) g.append(s("path", { d: `M ${cx - 12} ${cy - 12} L ${cx + 12} ${cy + 12} M ${cx + 12} ${cy - 12} L ${cx - 12} ${cy + 12}`, stroke: "#e0282e", "stroke-width": 4, "stroke-linecap": "round" }));
      g.append(s("title", null, "nº " + (num(id) ?? "–") + " · " + f + " falta(s)" + (fora ? " · " + fora : "")));
      if (o.clicar) { g.addEventListener("click", () => o.clicar(l, id)); g.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); o.clicar(l, id); } }); }
      svg.append(g);
    });
    // faltas de equipe no quarto (4 + penalidade) embaixo de cada metade
    const fe = faltasEquipe(est, l), bx = li ? W - 26 - 5 * 21 : 26;
    for (let i = 0; i < 5; i++) svg.append(s("rect", { "pointer-events": "none", x: bx + i * 21, y: H - 34, width: 17, height: 17, rx: 3, fill: i < fe ? (i >= 4 || fe >= 5 ? "#e0282e" : cor.c) : "rgb(255 255 255 / .55)", stroke: "#fff" }));
    svg.append(s("text", { "pointer-events": "none", x: li ? W - 26 : 26, y: H - 40, "text-anchor": li ? "end" : "start", "font-size": 15, "font-weight": 800, fill: fe >= 4 ? "#b3141a" : "#4a2a10", "font-family": "system-ui,sans-serif" }, (fe >= 4 ? "PENALIDADE · " : "Faltas · ") + fe));
  });
  return svg;
}

/* ---------------- painel da mesa (súmula) ---------------- */
// o = { h, j, ed, fim, nomeA, nomeB, atletas:{a,b}, capitaes, tecnicos, toast, render, salvar, pontoAtleta(aid, d), cron:{rest, rodando, iniciar, parar, definir(seg)}, irPeriodo(n, criar) }
let form = null, subF = null, iniF = null;
export function painel(o) {
  const { h, j } = o, nomes = { a: o.nomeA, b: o.nomeB };
  const w = h("section", { class: "rz bq" }, h("h3", { class: "rz-tit", text: "Mesa" + (j.mesa && j.mesa.q ? " · " + nomeQ(j.mesa.q) : "") }));
  const atl = l => [...(o.atletas[l] || [])].sort((x, y) => (x.num ?? 999) - (y.num ?? 999));
  const numDe = id => { for (const l of ["a", "b"]) { const a = (o.atletas[l] || []).find(x => x.id === id); if (a) return a.num; } return null; };
  const nm = id => { for (const l of ["a", "b"]) { const a = (o.atletas[l] || []).find(x => x.id === id); if (a) return "nº " + (a.num ?? "–") + " " + a.nome + (o.capitaes && o.capitaes[l] === id ? " (C)" : ""); } return "?"; };
  const est = estado(j);
  // ainda sem quinteto inicial
  if (!est) {
    if (!o.ed || o.fim) { w.append(h("p", { class: "cap", text: "A mesa (quinteto, faltas, tempos e posse) não foi usada neste jogo." })); return w; }
    if (!iniF || iniF.jid !== j.id) iniF = { jid: j.id, a: atl("a").slice(0, 5).map(x => x.id), b: atl("b").slice(0, 5).map(x => x.id), salto: "" };
    const okN = ["a", "b"].every(l => iniF[l].length === 5);
    w.append(h("p", { class: "cap", text: "Antes da bola ao alto: marque os 5 titulares de cada equipe e quem ganhou a bola ao alto. A partir daí a mesa controla faltas, lances livres, tempos, substituições e a posse alternada." }));
    ["a", "b"].forEach(l => w.append(h("div", { class: "bq-ini", style: "--c:" + CORES[l].c },
      h("b", { text: nomes[l] + " · titulares (" + iniF[l].length + "/5)" }),
      atl(l).length < 5 ? h("p", { class: "cap", text: "Cadastre pelo menos 5 atletas desta equipe na aba Equipes." }) :
      h("div", { class: "bq-chips" }, atl(l).map(a => h("button", { type: "button", class: "bq-chip", "aria-pressed": String(iniF[l].includes(a.id)), onclick: () => {
        const i = iniF[l].indexOf(a.id); if (i >= 0) iniF[l].splice(i, 1); else if (iniF[l].length < 5) iniF[l].push(a.id); else o.toast("Já são 5 titulares: desmarque um antes.");
        o.render(); } }, h("b", { text: a.num ?? "–" }), " " + a.nome))))));
    w.append(h("span", { class: "t-sub", text: "Quem ganhou a bola ao alto?" }),
      h("div", { class: "chips" }, ["a", "b"].map(l => h("button", { type: "button", "aria-pressed": String(iniF.salto === l), onclick: () => { iniF.salto = l; o.render(); } }, nomes[l]))),
      h("button", { type: "button", disabled: !okN || !iniF.salto, onclick: () => {
        j.mesa = { q: "1Q", ini: { a: [...iniF.a], b: [...iniF.b] }, salto: iniF.salto, ev: [], pend: null };
        iniF = null; o.cron.definir(600); o.irPeriodo("1Q"); posse.rest = 24; marcarRel(o); o.toast("Mesa pronta. A seta de posse alternada fica com " + nomes[outro(j.mesa.salto)] + "."); o.salvar();
      } }, "Começar o jogo"));
    return w;
  }
  const q = est.q, m = j.mesa, ed = o.ed && !o.fim;
  // quadra desenhada
  w.append(h("div", { class: "rz-box bq-box" }, quadra({ est, num: numDe, nomes, capitaes: o.capitaes, clicar: ed ? (l, id) => { form = { jid: j.id, l, quem: id, tipo: "P", arr: 0, conv: false, sofreu: "", dupla: "" }; subF = null; o.render(); } : null })));
  // placa das equipes: faltas no quarto, tempos, técnico
  w.append(h("div", { class: "bq-eqs" }, ["a", "b"].map(l => {
    const fe = faltasEquipe(est, l), disp = temposDisponiveis(est, l, q, o.cron.rest), mx = temposMax(q), usadosAqui = mx - temposDisponiveis(est, l, q, null);
    const t = est.tec[l];
    return h("div", { class: "bq-eq", style: "--c:" + CORES[l].c },
      h("b", { class: "bq-eqn", text: nomes[l] }),
      h("div", { class: "bq-lin" }, h("span", { text: "Faltas no quarto" }), h("span", { class: "bq-dots" }, [0, 1, 2, 3, 4].map(i => h("i", { class: i < fe ? (i >= 4 ? "on pen" : "on") : "" }))), h("b", { class: fe >= 4 ? "bq-pen" : "", text: fe >= 4 ? "PENALIDADE" : String(fe) })),
      h("div", { class: "bq-lin" }, h("span", { text: "Tempos " + (q === "1Q" || q === "2Q" ? "(1º tempo)" : q === "3Q" || q === "4Q" ? "(2º tempo)" : "(prorr.)") }),
        h("span", { class: "bq-dots tempos" }, Array.from({ length: mx }, (_, i) => h("i", { class: i < usadosAqui ? "on" : "" }))),
        ed && h("button", { type: "button", class: "ghost t-mini", disabled: !disp, onclick: () => {
          m.ev.push({ t: "to", l, q, u2: q === "4Q" && o.cron.rest <= 120 }); pararRelogios(o);
          o.toast("Tempo de " + nomes[l] + " (1 minuto). Restam " + (disp - 1) + " neste " + (/^P/.test(q) ? "período" : "tempo") + "."); o.salvar();
        } }, "Pedir tempo")),
      (t.C || t.B || t.D || (o.tecnicos && o.tecnicos[l])) && h("div", { class: "bq-lin" }, h("span", { text: "Técnico" + (o.tecnicos && o.tecnicos[l] ? " " + o.tecnicos[l] : "") }),
        h("b", { class: est.tecFora[l] ? "bq-pen" : "", text: (t.C ? t.C + " C " : "") + (t.B ? t.B + " B " : "") + (t.D ? "D " : "") + (est.tecFora[l] ? "· DESQUALIFICADO" : t.C || t.B || t.D ? "" : "sem faltas") })));
  })));
  if (q === "4Q" && o.cron.rest <= 120) w.append(h("p", { class: "cap", text: "Últimos 2 minutos do 4º quarto: cada equipe pode pedir no máximo 2 tempos." }));
  // alertas: jogador fora (5 faltas / desqualificado) ainda em quadra, técnico desqualificado
  ["a", "b"].forEach(l => {
    est.quadra[l].forEach(id => { if (est.fora[id]) w.append(h("div", { class: "rz-alerta erro", role: "alert" }, h("b", { text: "⚠ Substituição obrigatória" }),
      h("span", { text: nm(id) + " (" + nomes[l] + ") " + (est.fora[id] === "5 faltas" ? "cometeu a 5ª falta e não pode mais jogar." : "foi desqualificado: sai imediatamente para o vestiário.") }),
      ed && h("button", { type: "button", class: "t-mini", onclick: () => { subF = { l, sai: id, entra: "" }; form = null; o.render(); } }, "Substituir agora"))); });
    if (est.tecFora[l]) w.append(h("div", { class: "rz-alerta erro" }, h("b", { text: "⚠ Técnico desqualificado" }), h("span", { text: "O técnico de " + nomes[l] + " sai; o assistente (ou o capitão) assume." })));
    const aptos = atl(l).filter(a => !est.fora[a.id]).length;
    if (aptos < 2) w.append(h("div", { class: "rz-alerta erro" }, h("b", { text: "⚠ Art. 21" }), h("span", { text: nomes[l] + " ficou com menos de 2 jogadores em condição de jogo: perde por inferioridade." })));
  });
  // lances livres pendentes
  if (est.pend && ed) {
    const p = est.pend;
    w.append(h("div", { class: "bq-ll", role: "status" },
      h("b", { text: "Lance livre " + (p.feitos + 1) + " de " + p.n + " · " + nm(p.aid) + " (" + nomes[p.l] + ")" }),
      p.motivo && h("span", { class: "cap", text: p.motivo }),
      h("div", { class: "t-linha" },
        h("button", { type: "button", class: "bq-llbtn ok", onclick: () => cobrar(o, true) }, "✓ Convertido"),
        h("button", { type: "button", class: "bq-llbtn erro", onclick: () => cobrar(o, false) }, "✗ Errou")),
      h("label", { class: "t-lbl" }, "Quem cobra", h("select", { onchange: e => { m.pend.aid = e.target.value; o.salvar(); } }, est.quadra[p.l].map(id => h("option", { value: id, selected: id === p.aid }, nm(id))))),
      h("button", { type: "button", class: "ghost t-mini", onclick: () => { m.pend = null; o.toast("Lances livres cancelados."); o.salvar(); } }, "Cancelar lances livres")));
  }
  // relógios
  if (ed) {
    w.append(h("div", { class: "bq-rel" },
      h("div", { class: "bq-relj" }, h("small", { text: nomeQ(q) }), h("b", { id: "t-cron-v", text: pad(Math.floor(o.cron.rest / 60)) + ":" + pad(o.cron.rest % 60) })),
      h("div", { class: "bq-rel24" }, h("small", { text: "Posse" }), h("b", { id: "bq-24-v", class: posse.rest <= 5 ? "alerta" : "", text: posse.rest })),
      h("div", { class: "bq-relb" },
        h("button", { type: "button", onclick: () => { o.cron.rodando ? pararRelogios(o) : iniciarRelogios(o); o.salvar(); } }, o.cron.rodando ? "⏸ Parar" : "▶ Iniciar"),
        h("button", { type: "button", class: "ghost t-mini", onclick: () => { posse.rest = 24; marcarRel(o); o.salvar(); } }, "24"),
        h("button", { type: "button", class: "ghost t-mini", onclick: () => { posse.rest = 14; marcarRel(o); o.salvar(); } }, "14"))));
  }
  // posse alternada
  w.append(h("div", { class: "bq-seta" + (est.seta ? " " + est.seta : "") },
    h("span", null, "Posse alternada: ", h("b", { text: est.seta ? (est.seta === "a" ? "◀ " : "") + nomes[est.seta] + (est.seta === "b" ? " ▶" : "") : "–" })),
    ed && est.seta && h("button", { type: "button", class: "ghost t-mini", onclick: () => { m.ev.push({ t: "pos", l: est.seta, q }); o.toast("Reposição alternada para " + nomes[est.seta] + ". A seta vira para " + nomes[outro(est.seta)] + "."); o.salvar(); } }, "Usar (bola presa / início de quarto)")));
  if (!ed) { w.append(listaLances(o, est, nm, nomes)); return w; }
  // ações
  w.append(h("div", { class: "t-linha bq-acoes" },
    h("button", { type: "button", class: "danger", onclick: () => { form = form ? null : { jid: j.id, l: "a", quem: "", tipo: "P", arr: 0, conv: false, sofreu: "", dupla: "" }; subF = null; o.render(); } }, form ? "Fechar falta" : "Falta"),
    h("button", { type: "button", class: "ghost", onclick: () => { subF = subF ? null : { l: "a", sai: "", entra: "" }; form = null; o.render(); } }, subF ? "Fechar substituição" : "Substituição"),
    h("button", { type: "button", class: "ghost", onclick: () => fimDoQuarto(o, est) }, /^P/.test(q) || q === "4Q" ? "Fim do período" : "Fim do " + nomeQ(q))));
  if (form && form.jid === j.id) w.append(formFalta(o, est, nm, nomes, atl));
  if (subF) w.append(formSub(o, est, nm, nomes, atl));
  w.append(listaLances(o, est, nm, nomes));
  return w;
}

function cobrar(o, ok) {
  const m = o.j.mesa, p = m.pend; if (!p) return;
  m.ev.push({ t: "ll", l: p.l, aid: p.aid, ok, q: m.q });
  p.feitos++;
  const acabou = p.feitos >= p.n;
  if (acabou) m.pend = null;
  if (ok) o.pontoAtleta(p.aid, 1); // salva
  else o.salvar();
  if (acabou && p.depois) o.toast(p.depois);
}

function formFalta(o, est, nm, nomes, atl) {
  const { h, j } = o, f = form, m = j.mesa, sofre = outro(f.l);
  if (!f.quem) f.quem = est.quadra[f.l][0] || "tec";
  const ehTec = f.quem === "tec" || f.quem === "banco";
  if (ehTec && !["C", "B", "DT"].includes(f.tipo)) f.tipo = f.quem === "banco" ? "B" : "C";
  if (!ehTec && ["C", "B", "DT"].includes(f.tipo)) f.tipo = "P";
  const comArr = ["P", "U", "D"].includes(f.tipo) && !f.dupla;
  if (!comArr) { f.arr = 0; f.conv = false; }
  const cons = consequencia(est, { ...f, dupla: !!f.dupla });
  const opSofre = est.quadra[sofre];
  if (!opSofre.includes(f.sofreu)) f.sofreu = opSofre[0] || "";
  const fe = faltasEquipe(est, f.l), novaFe = cons.fe ? fe + 1 : fe;
  const fx = (est.faltas[f.quem] || { n: 0 });
  const tiposJog = ["P", "O", "T", "U", "D"], tiposTec = ["C", "B", "DT"];
  const w = h("div", { class: "rz-sub bq-form" },
    h("div", { class: "chips" }, ["a", "b"].map(l => h("button", { type: "button", "aria-pressed": String(f.l === l), onclick: () => { f.l = l; f.quem = ""; f.dupla = ""; o.render(); } }, nomes[l]))),
    h("label", { class: "t-lbl" }, "Quem cometeu",
      h("select", { onchange: e => { f.quem = e.target.value; o.render(); } },
        h("optgroup", { label: "Em quadra" }, est.quadra[f.l].map(id => h("option", { value: id, selected: f.quem === id }, nm(id) + " · " + ((est.faltas[id] || {}).n || 0) + " falta(s)"))),
        h("optgroup", { label: "Banco" }, atl(f.l).filter(a => !est.quadra[f.l].includes(a.id)).map(a => h("option", { value: a.id, selected: f.quem === a.id }, nm(a.id) + (est.fora[a.id] ? " – " + est.fora[a.id] : "")))),
        h("optgroup", { label: "Comissão" }, h("option", { value: "tec", selected: f.quem === "tec" }, "Técnico" + (o.tecnicos && o.tecnicos[f.l] ? " " + o.tecnicos[f.l] : "")), h("option", { value: "banco", selected: f.quem === "banco" }, "Banco (assistente, reservas, acompanhantes)")))),
    h("span", { class: "t-sub", text: "Tipo de falta" }),
    h("div", { class: "bq-tipos" }, (ehTec ? tiposTec : tiposJog).map(t => h("button", { type: "button", class: "bq-tipo t" + t, "aria-pressed": String(f.tipo === t && !f.dupla), onclick: () => { f.tipo = t; f.dupla = ""; o.render(); } }, TIPOS[t].rot)),
      !ehTec && h("button", { type: "button", class: "bq-tipo", "aria-pressed": String(!!f.dupla), onclick: () => { f.tipo = "P"; f.dupla = f.dupla || est.quadra[sofre][0] || ""; o.render(); } }, "Dupla")));
  if (f.dupla) w.append(h("label", { class: "t-lbl" }, "Falta dupla com", h("select", { onchange: e => { f.dupla = e.target.value; o.render(); } }, est.quadra[sofre].map(id => h("option", { value: id, selected: f.dupla === id }, nm(id) + " (" + nomes[sofre] + ")")))));
  if (comArr) w.append(h("span", { class: "t-sub", text: "No arremesso?" }),
    h("div", { class: "bq-tipos" }, [[0, false, "Sem arremesso"], [2, false, "Arremesso de 2 errado"], [3, false, "Arremesso de 3 errado"], [2, true, "Cesta de 2 convertida"], [3, true, "Cesta de 3 convertida"]].map(([a, c, t]) =>
      h("button", { type: "button", class: "bq-tipo", "aria-pressed": String(f.arr === a && f.conv === c), onclick: () => { f.arr = a; f.conv = c; o.render(); } }, t))));
  if (!f.dupla && (cons.ll || f.conv)) w.append(h("label", { class: "t-lbl" }, f.conv ? "Quem fez a cesta (e cobra o lance livre)" : "Quem cobra os lances livres",
    h("select", { onchange: e => { f.sofreu = e.target.value; o.render(); } }, opSofre.map(id => h("option", { value: id, selected: f.sofreu === id }, nm(id))))));
  // prévia pela regra
  const avisos = [];
  if (!ehTec && fx.n + 1 >= 5) avisos.push(nm(f.quem) + " chega a 5 faltas e sai do jogo.");
  if (!ehTec) { const x = { ...fx }; x[f.tipo] = (x[f.tipo] || 0) + 1; if (f.tipo === "D" || x.T >= 2 || x.U >= 2 || (x.T >= 1 && x.U >= 1)) avisos.push(nm(f.quem) + " fica DESQUALIFICADO" + (f.tipo === "D" ? "" : " (2ª falta técnica/antidesportiva)") + ": retirada imediata."); }
  if (ehTec) { const t = { ...est.tec[f.l] }; if (f.tipo === "C") t.C++; else if (f.tipo === "B") t.B++; else t.D++; if (tecDesq(t)) avisos.push("O técnico fica DESQUALIFICADO."); }
  if (f.dupla && (est.faltas[f.dupla] || { n: 0 }).n + 1 >= 5) avisos.push(nm(f.dupla) + " chega a 5 faltas e sai do jogo.");
  w.append(h("div", { class: "rz-alerta info" }, h("b", { text: "Pela regra" }),
    h("span", null, cons.txt, " ", cons.fe ? "Falta de equipe nº " + novaFe + " no " + nomeQ(qFaltas(est.q)) + (novaFe >= 5 ? " (penalidade)." : ".") : "Não conta como falta de equipe.", avisos.map(a => h("b", { class: "bq-av", text: " ⚠ " + a })))));
  w.append(h("button", { type: "button", class: "danger", onclick: () => {
    const base = { t: "f", l: f.l, quem: f.quem, tipo: f.tipo, arr: f.arr || 0, conv: !!f.conv, q: m.q };
    if (f.dupla) { m.ev.push({ ...base, tipo: "P", arr: 0, conv: false, dupla: f.dupla }, { t: "f", l: sofre, quem: f.dupla, tipo: "P", arr: 0, conv: false, q: m.q, dupla: f.quem }); }
    else {
      const ev = { ...base, ll: cons.ll, sofreu: (cons.ll || f.conv) ? f.sofreu : null };
      if (f.conv) ev.pts = f.arr;
      m.ev.push(ev);
      if (cons.ll) m.pend = { l: sofre, aid: f.sofreu, n: cons.ll, feitos: 0, motivo: TIPOS[f.tipo].rot + " de " + nm(f.quem), k: m.ev.length - 1,
        depois: cons.posse ? "Posse de bola para " + nomes[cons.posse] + "." : f.tipo === "T" || f.tipo === "C" || f.tipo === "B" ? "O jogo recomeça com quem tinha a bola." : "" };
    }
    pararRelogios(o);
    o.toast(TIPOS[f.tipo].rot + " registrada." + (cons.ll ? " " + cons.ll + " lance(s) livre(s)." : "") + (cons.posse && !cons.ll ? " Posse para " + nomes[cons.posse] + "." : "") + (avisos.length ? " " + avisos.join(" ") : ""));
    form = null;
    if (f.conv && !f.dupla) o.pontoAtleta(f.sofreu, f.arr); else o.salvar();
  } }, "Registrar falta"));
  return w;
}

function formSub(o, est, nm, nomes, atl) {
  const { h, j } = o, sf = subF, m = j.mesa;
  if (!est.quadra[sf.l].includes(sf.sai)) sf.sai = est.quadra[sf.l][0];
  const banco = atl(sf.l).filter(a => !est.quadra[sf.l].includes(a.id));
  const aptos = banco.filter(a => !est.fora[a.id]);
  if (!aptos.some(a => a.id === sf.entra)) sf.entra = aptos[0] ? aptos[0].id : "";
  return h("div", { class: "rz-sub" },
    h("div", { class: "chips" }, ["a", "b"].map(l => h("button", { type: "button", "aria-pressed": String(sf.l === l), onclick: () => { sf.l = l; sf.sai = ""; sf.entra = ""; o.render(); } }, nomes[l]))),
    h("label", { class: "t-lbl" }, "Sai", h("select", { onchange: e => { sf.sai = e.target.value; o.render(); } }, est.quadra[sf.l].map(id => h("option", { value: id, selected: sf.sai === id }, nm(id) + " · " + ((est.faltas[id] || {}).n || 0) + " falta(s)" + (est.fora[id] ? " – " + est.fora[id].toUpperCase() : ""))))),
    aptos.length ? h("label", { class: "t-lbl" }, "Entra", h("select", { onchange: e => { sf.entra = e.target.value; o.render(); } }, banco.map(a => h("option", { value: a.id, selected: sf.entra === a.id, disabled: !!est.fora[a.id] }, nm(a.id) + " · " + ((est.faltas[a.id] || {}).n || 0) + " falta(s)" + (est.fora[a.id] ? " – " + est.fora[a.id] : ""))))) : h("p", { class: "cap", text: "Não há atleta no banco em condição de jogo." }),
    h("p", { class: "cap", text: "Substituição só com a bola morta e o relógio parado (art. 19). Quem tem 5 faltas ou foi desqualificado não volta." }),
    h("button", { type: "button", disabled: !sf.entra, onclick: () => { m.ev.push({ t: "s", l: sf.l, sai: sf.sai, entra: sf.entra, q: m.q }); o.toast("Entra " + nm(sf.entra) + ", sai " + nm(sf.sai) + "."); subF = null; o.salvar(); } }, "Confirmar substituição"));
}

function fimDoQuarto(o, est) {
  const m = o.j.mesa, q = est.q, i = ORDEM_Q.indexOf(q);
  const pa = (o.j.periodos || []).reduce((t, p) => t + (p.a || 0), 0), pb = (o.j.periodos || []).reduce((t, p) => t + (p.b || 0), 0);
  pararRelogios(o); posse.rest = 24;
  if (i >= 0 && i < 3) {
    m.q = ORDEM_Q[i + 1]; o.cron.definir(600); o.irPeriodo(m.q); marcarRel(o);
    o.toast("Fim do " + nomeQ(q) + ". " + (q === "2Q" ? "Intervalo de 15 minutos." : "Intervalo de 2 minutos.") + " Faltas de equipe zeradas. " + (est.seta ? "O " + nomeQ(m.q) + " começa com reposição alternada para " + (est.seta === "a" ? o.nomeA : o.nomeB) + "." : ""));
    o.salvar(); return;
  }
  if (pa === pb) {
    const n = "P" + ((o.j.periodos || []).filter(p => /^P/.test(p.n)).length + 1);
    m.q = n; o.cron.definir(300); o.irPeriodo(n, true); marcarRel(o);
    o.toast("Empate: prorrogação de 5 minutos (intervalo de 2 min). As faltas de equipe continuam as do 4º quarto." + (est.seta ? " Reposição alternada para " + (est.seta === "a" ? o.nomeA : o.nomeB) + "." : ""));
    o.salvar(); return;
  }
  o.toast("Fim de jogo no tempo normal" + (/^P/.test(q) ? " (prorrogação)" : "") + ": toque em \"Encerrar jogo\".");
  o.render();
}

function listaLances(o, est, nm, nomes) {
  const { h, j } = o, m = j.mesa, ev = m.ev || [], ed = o.ed && !o.fim;
  const txt = e => e.t === "f" ? (e.quem === "tec" ? "Técnico" : e.quem === "banco" ? "Banco" : nm(e.quem)) + " · " + (e.dupla ? "falta dupla" : TIPOS[e.tipo].rot.toLowerCase()) + (e.arr ? (e.conv ? " (cesta de " + e.arr + " + 1)" : " (arremesso de " + e.arr + ")") : "") + (e.ll ? " · " + e.ll + " LL" : "")
    : e.t === "ll" ? "Lance livre de " + nm(e.aid) + (e.ok ? " ✓" : " ✗") : e.t === "s" ? "Entra " + nm(e.entra) + ", sai " + nm(e.sai)
    : e.t === "to" ? "Tempo de " + nomes[e.l] : e.t === "pos" ? "Posse alternada para " + nomes[e.l] : "";
  const ult = ev.slice(-8).map((e, i) => ({ e, k: ev.length - Math.min(8, ev.length) + i })).reverse();
  const w = h("details", { class: "bq-lances" }, h("summary", { text: "Lances da mesa (" + ev.length + ")" }));
  if (!ev.length) w.append(h("p", { class: "cap", text: "Nenhum lance registrado ainda." }));
  w.append(h("ol", { class: "bq-lista", reversed: true }, ult.map(({ e }) => h("li", { class: "bq-li " + (e.t === "f" ? "f t" + e.tipo : e.t), style: e.l ? "--c:" + CORES[e.l].c : null },
    h("small", { text: nomeQ(e.q) }), h("span", { text: txt(e) })))));
  if (ed && ev.length) w.append(h("button", { type: "button", class: "ghost t-mini", onclick: () => desfazer(o) }, "Desfazer último lance"));
  return w;
}

function desfazer(o) {
  const m = o.j.mesa, e = m.ev.pop(); if (!e) return;
  let pts = null;
  if (e.t === "ll") { if (m.pend && m.pend.aid === e.aid) m.pend.feitos = Math.max(0, m.pend.feitos - 1); else m.pend = null; if (e.ok) pts = [e.aid, -1]; }
  if (e.t === "f") {
    if (m.pend && m.pend.k === m.ev.length) m.pend = null;
    if (e.dupla) { const ant = m.ev[m.ev.length - 1]; if (ant && ant.t === "f" && ant.dupla === e.quem) m.ev.pop(); }
    if (e.pts) pts = [e.sofreu, -e.pts];
  }
  o.toast("Lance desfeito.");
  if (pts) o.pontoAtleta(pts[0], pts[1]); else o.salvar();
}

// bolinhas de falta para a lista de atletas da súmula
export function marcadorFaltas(h, j, aid) {
  const est = estado(j); if (!est) return null;
  const f = (est.faltas[aid] || {}).n || 0, fora = est.fora[aid], ll = est.ll[aid];
  return h("span", { class: "bq-mf", title: f + " falta(s)" + (fora ? " · " + fora : "") },
    h("span", { class: "bq-dots mini" }, [0, 1, 2, 3, 4].map(i => h("i", { class: i < f ? (f >= 4 ? "on pen" : "on") : "" }))),
    fora && h("span", { class: "t-fora", text: fora === "5 faltas" ? "5 faltas" : "desq." }),
    ll && h("small", { class: "bq-llat", text: "LL " + ll.c + "/" + ll.t }));
}
