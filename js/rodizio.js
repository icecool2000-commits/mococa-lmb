// Rodízio do biribol: formação inicial de cada set, quem saca, substituições e a piscina desenhada
// com os jogadores (touca azul / vermelha, número e nome) girando ponto a ponto.
//
// Posições (do ponto de vista de cada equipe, olhando para a rede):
//   0 = Saque (fundo, à direita) · 1 = Fundo (à esquerda) · 2 = Rede esquerda · 3 = Rede direita
// Rodar: Saque → Fundo → Rede esq. → Rede dir. → Saque.
// Regra: ponto de quem está sacando = não roda; ponto de quem recebe = essa equipe roda e passa a sacar.
//
// Dados no jogo (Firestore, sem lista dentro de lista):
//   j.rodizio = { toucaA: "azul"|"vermelha", atl: { aid: { nome, num } }, elenco: { a:[aid], b:[aid] },
//                 sets: [ { ladoA: "esq"|"dir", saque: "a"|"b", pos: { a:[4 aids], b:[4 aids] }, ev: [ "a" | "b" | { t:"s", l, sai, entra } ] } ] }

export const POS_NOMES = ["Saque", "Fundo", "Rede esq.", "Rede dir."];
export const CORES = { azul: { cap: "#1f5fd1", escuro: "#123b8a", nome: "Azul" }, vermelha: { cap: "#d8262d", escuro: "#8f1218", nome: "Vermelha" } };
export const girar = p => [p[3], p[0], p[1], p[2]];
export const outro = l => (l === "a" ? "b" : "a");
export const corDe = (rz, l) => (l === "a" ? rz.toucaA || "azul" : (rz.toucaA || "azul") === "azul" ? "vermelha" : "azul");

// estado depois de todos os lances do set i
export function estado(rz, i) {
  const st = rz && rz.sets && rz.sets[i];
  if (!st || !st.pos || !st.pos.a || !st.pos.b) return null;
  const pos = { a: [...st.pos.a], b: [...st.pos.b] };
  let saque = st.saque || "a", ult = null, pontos = 0;
  (st.ev || []).forEach(e => {
    if (e === "a" || e === "b") {
      pontos++;
      if (e !== saque) { pos[e] = girar(pos[e]); saque = e; ult = { tipo: "rodou", lado: e }; }
      else ult = { tipo: "manteve", lado: e };
    } else if (e && e.t === "s") {
      const k = pos[e.l].indexOf(e.sai); if (k >= 0) pos[e.l][k] = e.entra;
      ult = { tipo: "sub", lado: e.l, sai: e.sai, entra: e.entra };
    }
  });
  const reservas = l => ((rz.elenco && rz.elenco[l]) || []).filter(id => !pos[l].includes(id));
  return { pos, saque, ladoA: st.ladoA || "esq", ult, pontos, reservas: { a: reservas("a"), b: reservas("b") } };
}
// último set (até o índice "ate") que tem formação
export function setComFormacao(rz, ate) {
  for (let i = Math.min(ate, ((rz && rz.sets) || []).length - 1); i >= 0; i--) if (rz.sets[i] && rz.sets[i].pos) return i;
  return -1;
}
// chamado pela súmula a cada ponto de equipe (d = +1 ou −1) no set i
export function registrarPonto(j, i, lado, d) {
  const st = j.rodizio && j.rodizio.sets && j.rodizio.sets[i];
  if (!st || !st.pos) return;
  st.ev = st.ev || [];
  if (d > 0) st.ev.push(lado);
  else { for (let k = st.ev.length - 1; k >= 0; k--) if (st.ev[k] === lado) { st.ev.splice(k, 1); break; } }
}

/* ---------------- desenho da piscina (SVG) ---------------- */
const NS = "http://www.w3.org/2000/svg";
function s(tag, at, ...kids) {
  const e = document.createElementNS(NS, tag);
  if (at) for (const [k, v] of Object.entries(at)) if (v != null && v !== false) e.setAttribute(k, v);
  kids.flat(9).forEach(c => { if (c == null || c === false) return; e.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return e;
}
const W = 1000, H = 600;
// lugares da equipe que está à esquerda (olhando para a direita): saque embaixo no fundo
const LUG_ESQ = [[160, 420], [160, 180], [385, 180], [385, 420]];
const lugar = (lado, k) => { const [x, y] = LUG_ESQ[k]; return lado === "esq" ? [x, y] : [W - x, H + 35 - y]; };
const ultimos = new Map(); // chave do desenho -> Map(aid -> [x, y]) para animar o movimento

function boneco(cor, num, nome, olhaDireita, sacando) {
  const c = CORES[cor] || CORES.azul, d = olhaDireita ? 1 : -1;
  return [
    s("ellipse", { cx: 0, cy: 62, rx: 74, ry: 17, fill: "none", stroke: sacando ? "#ffd84a" : "rgba(255,255,255,.55)", "stroke-width": sacando ? 6 : 3, class: sacando ? "rz-anel" : null }),
    s("ellipse", { cx: 0, cy: 62, rx: 52, ry: 11, fill: "none", stroke: "rgba(255,255,255,.35)", "stroke-width": 2 }),
    s("path", { d: "M-52,64 Q-50,30 -20,26 L20,26 Q50,30 52,64 Z", fill: "#f0ad78", stroke: "#b8774a", "stroke-width": 2 }),
    s("path", { d: "M-56,64 Q0,74 56,64 L56,70 Q0,80 -56,70 Z", fill: "rgba(120,200,255,.55)" }),
    s("circle", { cx: 0, cy: 0, r: 27, fill: "#f0ad78", stroke: "#b8774a", "stroke-width": 2 }),
    s("circle", { cx: d * 13, cy: 3, r: 3.2, fill: "#2b1a10" }),
    s("path", { d: `M${d * 5},14 Q${d * 13},19 ${d * 20},12`, fill: "none", stroke: "#7a3b20", "stroke-width": 2.4, "stroke-linecap": "round" }),
    s("path", { d: "M-30,6 A30,30 0 0 1 30,6 L30,-1 Q0,-6 -30,-1 Z", fill: c.cap, stroke: c.escuro, "stroke-width": 2.5 }),
    s("path", { d: "M-30,6 C-30,-24 -16,-33 0,-33 C16,-33 30,-24 30,6 Q0,-4 -30,6 Z", fill: c.cap, stroke: c.escuro, "stroke-width": 2.5 }),
    s("circle", { cx: -d * 17, cy: 9, r: 10, fill: c.escuro }),
    [[-3, -2], [3, -2], [0, 3], [-3, 4], [3, 4]].map(([x, y]) => s("circle", { cx: -d * 17 + x, cy: 9 + y, r: 1.4, fill: "rgba(255,255,255,.55)" })),
    s("circle", { cx: d * -1, cy: -16, r: 13.5, fill: "#fff", stroke: c.escuro, "stroke-width": 1.5 }),
    s("text", { x: d * -1, y: -10.5, "text-anchor": "middle", "font-size": 17, "font-weight": 800, fill: "#111", "font-family": "Arial, sans-serif" }, num == null ? "–" : String(num)),
    s("rect", { x: -74, y: 76, width: 148, height: 30, rx: 15, fill: "rgba(4,18,40,.8)" }),
    s("text", { x: 0, y: 97.5, "text-anchor": "middle", "font-size": 20, "font-weight": 700, fill: "#fff", "font-family": "Arial, sans-serif" }, (nome || "").length > 12 ? nome.slice(0, 11) + "…" : nome || ""),
    sacando && s("g", { transform: `translate(${-d * 46},-34)` },
      s("circle", { r: 13, fill: "#ffd84a", stroke: "#a57c00", "stroke-width": 2 }),
      s("path", { d: "M-12,-3 Q0,4 12,-3 M-6,-11 Q-2,0 -6,11 M6,-11 Q2,0 6,11", fill: "none", stroke: "#a57c00", "stroke-width": 1.6 }))
  ];
}

// desenha a piscina. o: { rz, est, nomes:{a,b}, chave, titulo }
export function piscina(o) {
  const { rz, est } = o, chave = o.chave || "x", antes = ultimos.get(chave) || new Map(), agora = new Map();
  const ladoDe = l => (l === "a" ? est.ladoA : est.ladoA === "esq" ? "dir" : "esq");
  const svg = s("svg", { viewBox: `0 0 ${W} ${H + 35}`, class: "rz-svg", role: "img", "aria-label": "Posição dos jogadores na piscina" });
  const defs = s("defs", null,
    s("linearGradient", { id: "rzag", x1: 0, y1: 0, x2: 0, y2: 1 }, s("stop", { offset: "0", "stop-color": "#4fc3f7" }), s("stop", { offset: "1", "stop-color": "#1e88e5" })),
    s("pattern", { id: "rzaz", width: 60, height: 60, patternUnits: "userSpaceOnUse" }, s("path", { d: "M0,30 Q15,22 30,30 T60,30", fill: "none", stroke: "rgba(255,255,255,.18)", "stroke-width": 3 })),
    s("pattern", { id: "rzrede", width: 10, height: 10, patternUnits: "userSpaceOnUse" }, s("path", { d: "M0,0 L10,10 M10,0 L0,10", stroke: "rgba(30,40,60,.6)", "stroke-width": 1 })),
    s("marker", { id: "rzseta", viewBox: "0 0 10 10", refX: 6, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto" }, s("path", { d: "M0,0 L10,5 L0,10 Z", fill: "rgba(255,255,255,.75)" })));
  svg.append(defs,
    s("rect", { x: 0, y: 0, width: W, height: H + 35, fill: "#e9cfa4" }),
    s("rect", { x: 14, y: 40, width: W - 28, height: H - 40, rx: 6, fill: "url(#rzag)", stroke: "#2a6fb8", "stroke-width": 4 }),
    s("rect", { x: 14, y: 40, width: W - 28, height: H - 40, rx: 6, fill: "url(#rzaz)" }));
  // nomes das equipes no deck
  ["a", "b"].forEach(l => {
    const lado = ladoDe(l), cor = CORES[corDe(rz, l)], x = lado === "esq" ? 30 : W - 30, saca = est.saque === l;
    svg.append(s("g", null,
      s("circle", { cx: lado === "esq" ? x + 12 : x - 12, cy: 20, r: 11, fill: cor.cap, stroke: cor.escuro, "stroke-width": 2 }),
      s("text", { x: lado === "esq" ? x + 32 : x - 32, y: 27, "text-anchor": lado === "esq" ? "start" : "end", "font-size": 21, "font-weight": 800, fill: "#3a2a12", "font-family": "Arial, sans-serif" },
        (o.nomes[l] || "").slice(0, 26) + (saca ? "  • SAQUE" : ""))));
  });
  // caminho do rodízio (setas)
  ["a", "b"].forEach(l => {
    const lado = ladoDe(l);
    for (let k = 0; k < 4; k++) {
      const [x1, y1] = lugar(lado, k), [x2, y2] = lugar(lado, (k + 1) % 4), dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), m = 105 / L;
      svg.append(s("line", { x1: x1 + dx * m, y1: y1 + 30 + dy * m, x2: x2 - dx * m, y2: y2 + 30 - dy * m, stroke: "rgba(255,255,255,.45)", "stroke-width": 3, "stroke-dasharray": "8 8", "marker-end": "url(#rzseta)" }));
    }
    const [sx, sy] = lugar(lado, 0);
    svg.append(s("text", { x: sx, y: sy + (lado === "esq" ? 158 : -62), "text-anchor": "middle", "font-size": 15, "font-weight": 800, fill: est.saque === l ? "#ffe680" : "rgba(255,255,255,.7)", "letter-spacing": 2, "font-family": "Arial, sans-serif" }, "POSIÇÃO DE SAQUE"));
  });
  // rede
  svg.append(s("rect", { x: 492, y: 30, width: 16, height: H - 20, fill: "url(#rzrede)" }),
    s("line", { x1: 500, y1: 30, x2: 500, y2: H + 10, stroke: "#eef2f6", "stroke-width": 5 }),
    s("rect", { x: 488, y: 24, width: 24, height: 18, rx: 5, fill: "#cfd6de", stroke: "#7b8794", "stroke-width": 2 }),
    s("rect", { x: 488, y: H + 4, width: 24, height: 18, rx: 5, fill: "#cfd6de", stroke: "#7b8794", "stroke-width": 2 }));
  // jogadores
  const anim = [];
  ["a", "b"].forEach(l => {
    const lado = ladoDe(l), cor = corDe(rz, l);
    est.pos[l].forEach((aid, k) => {
      const [x, y] = lugar(lado, k), at = (rz.atl && rz.atl[aid]) || {};
      const g = s("g", { class: "rz-jog" }, s("g", { transform: "scale(1.32)" }, boneco(cor, at.num, at.nome, lado === "esq", est.saque === l && k === 0)));
      const prev = antes.get(aid);
      g.style.transform = `translate(${(prev || [x, y])[0]}px,${(prev || [x, y])[1]}px)`;
      if (!prev) g.style.opacity = "0";
      agora.set(aid, [x, y]); anim.push([g, x, y]);
      svg.append(g);
    });
  });
  ultimos.set(chave, agora);
  requestAnimationFrame(() => requestAnimationFrame(() => anim.forEach(([g, x, y]) => { g.style.transform = `translate(${x}px,${y}px)`; g.style.opacity = "1"; })));
  return svg;
}

// faixa de texto com quem saca e o último lance
export function legenda(h, rz, est, nomes) {
  const at = aid => (rz.atl && rz.atl[aid]) || {};
  const sac = at(est.pos[est.saque][0]), cor = CORES[corDe(rz, est.saque)];
  const ult = est.ult;
  const txtUlt = !ult ? "Início do set: ninguém rodou ainda." :
    ult.tipo === "rodou" ? nomes[ult.lado] + " fez o ponto, ganhou o saque e rodou." :
    ult.tipo === "manteve" ? nomes[ult.lado] + " pontuou no próprio saque e não rodou." :
    "Substituição em " + nomes[ult.lado] + ": sai " + (at(ult.sai).nome || "?") + ", entra " + (at(ult.entra).nome || "?") + ((at(ult.entra).nome || "").endsWith(".") ? "" : ".");
  return h("div", { class: "rz-leg" },
    h("div", { class: "rz-saque" }, h("span", { class: "rz-bola", "aria-hidden": "true" }), h("b", { text: "Saque: " + nomes[est.saque] }),
      h("span", { class: "rz-chip", style: "--c:" + cor.cap }, (sac.num ?? "–") + " " + (sac.nome || ""))),
    h("p", { class: "cap", text: txtUlt }),
    h("div", { class: "rz-res" }, ["a", "b"].map(l => h("div", null,
      h("span", { class: "cap", text: "Reservas " + nomes[l] + ":" }),
      est.reservas[l].length ? est.reservas[l].map(id => h("span", { class: "rz-chip", style: "--c:" + CORES[corDe(rz, l)].cap }, (at(id).num ?? "–") + " " + (at(id).nome || ""))) : h("span", { class: "cap", text: " nenhum" })))));
}

/* ---------------- painel da súmula (mesário) ---------------- */
// o = { h, j, nomeA, nomeB, atletas: { a:[{id,nome,num}], b:[...] }, ed, fim, salvar(), ponto(l, d), toast, render() }
let rasc = null, subForm = null;
export function painel(o) {
  const { h, j, ed } = o, rz = j.rodizio || null, nomes = { a: o.nomeA, b: o.nomeB };
  const iSet = Math.max(0, (j.sets || []).length - 1);
  const temForm = !!(rz && rz.sets && rz.sets[iSet] && rz.sets[iSet].pos);
  const w = h("section", { class: "rz" }, h("div", { class: "t-linha t-entre" }, h("h3", { class: "rz-tit", text: "Rodízio · " + (iSet < 2 ? "Set " + (iSet + 1) : "Tiebreak") }),
    ed && temForm && !o.fim && h("button", { type: "button", class: "ghost t-mini", onclick: () => { rasc = novoRasc(o, iSet, true); o.render(); } }, "Editar formação")));
  if (rasc && (rasc.jid !== j.id || rasc.set !== iSet)) rasc = null;
  if (ed && !o.fim && (rasc || !temForm)) {
    if (!rasc) rasc = novoRasc(o, iSet, false);
    w.append(formFormacao(o, iSet));
    return w;
  }
  const iMostra = temForm ? iSet : setComFormacao(rz, iSet);
  if (iMostra < 0) { w.append(h("p", { class: "cap", text: "O mesário ainda não cadastrou a formação inicial." })); return w; }
  const est = estado(rz, iMostra);
  if (iMostra !== iSet) w.append(h("p", { class: "cap", text: "Mostrando como terminou o " + (iMostra < 2 ? "set " + (iMostra + 1) : "tiebreak") + ". Aguardando a formação do próximo set." }));
  w.append(h("div", { class: "rz-box" }, piscina({ rz, est, nomes, chave: j.id + ":" + iMostra })), legenda(h, rz, est, nomes));
  if (ed && !o.fim && iMostra === iSet) w.append(controles(o, rz, est, iSet));
  return w;
}

function elencoOrdenado(lista) { return [...(lista || [])].sort((x, y) => (x.num ?? 999) - (y.num ?? 999) || String(x.nome).localeCompare(String(y.nome))); }
function novoRasc(o, iSet, editar) {
  const rz = o.j.rodizio || {}, ant = rz.sets && rz.sets[iSet - 1], atual = rz.sets && rz.sets[iSet];
  const num = {}; ["a", "b"].forEach(l => (o.atletas[l] || []).forEach(a => { num[a.id] = rz.atl && rz.atl[a.id] && rz.atl[a.id].num != null ? rz.atl[a.id].num : a.num ?? ""; }));
  const base = l => elencoOrdenado(o.atletas[l]).slice(0, 4).map(a => a.id);
  const src = editar && atual ? atual : ant;
  return {
    jid: o.j.id, set: iSet, toucaA: rz.toucaA || "azul", num,
    ladoA: editar && atual ? atual.ladoA : ant ? (ant.ladoA === "esq" ? "dir" : "esq") : "esq",
    saque: editar && atual ? atual.saque : ant ? outro(ant.saque) : "a",
    pos: { a: src && src.pos ? [...src.pos.a] : base("a"), b: src && src.pos ? [...src.pos.b] : base("b") }
  };
}

function formFormacao(o, iSet) {
  const { h, j } = o, r = rasc, nomes = { a: o.nomeA, b: o.nomeB };
  const rzPrev = { toucaA: r.toucaA, atl: {}, elenco: { a: (o.atletas.a || []).map(a => a.id), b: (o.atletas.b || []).map(a => a.id) } };
  ["a", "b"].forEach(l => (o.atletas[l] || []).forEach(a => { const v = r.num[a.id]; rzPrev.atl[a.id] = { nome: a.nome, num: v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v) }; }));
  const ok = ["a", "b"].every(l => r.pos[l].length === 4 && r.pos[l].every(Boolean) && new Set(r.pos[l]).size === 4);
  const f = h("div", { class: "rz-form" });
  f.append(h("p", { class: "cap", text: iSet === 0 ? "Antes do jogo: confira os números das toucas, quem começa em cada lado, quem saca e onde cada atleta começa." : "Novo set: as equipes trocam de lado. Confira quem saca e, se quiserem, mude a formação." }));
  // touca, lado e saque
  const chip = (txt, ativo, fn) => h("button", { type: "button", "aria-pressed": String(!!ativo), onclick: () => { fn(); o.render(); } }, txt);
  f.append(
    h("div", { class: "rz-opc" }, h("span", { class: "t-sub", text: "Touca azul" }), h("div", { class: "chips" }, ["a", "b"].map(l => chip(nomes[l], (l === "a") === (r.toucaA === "azul"), () => { r.toucaA = l === "a" ? "azul" : "vermelha"; })))),
    h("div", { class: "rz-opc" }, h("span", { class: "t-sub", text: "Do lado esquerdo" }), h("div", { class: "chips" }, ["a", "b"].map(l => chip(nomes[l], (l === "a") === (r.ladoA === "esq"), () => { r.ladoA = l === "a" ? "esq" : "dir"; })))),
    h("div", { class: "rz-opc" }, h("span", { class: "t-sub", text: "Começa sacando" }), h("div", { class: "chips" }, ["a", "b"].map(l => chip("🏐 " + nomes[l], r.saque === l, () => { r.saque = l; })))));
  // prévia
  if (ok) f.append(h("div", { class: "rz-box" }, piscina({ rz: rzPrev, est: { pos: r.pos, saque: r.saque, ladoA: r.ladoA, reservas: { a: [], b: [] } }, nomes, chave: "prev:" + j.id })));
  // por equipe: números e posições
  ["a", "b"].forEach(l => {
    const cor = CORES[l === "a" ? r.toucaA : r.toucaA === "azul" ? "vermelha" : "azul"], ats = elencoOrdenado(o.atletas[l]);
    const card = h("div", { class: "rz-eq", style: "--c:" + cor.cap }, h("b", { class: "rz-eqnome", text: nomes[l] + " · touca " + cor.nome.toLowerCase() }));
    if (ats.length < 4) { card.append(h("p", { class: "cap", text: "Cadastre pelo menos 4 atletas desta equipe na aba Equipes." })); f.append(card); return; }
    card.append(h("span", { class: "cap", text: "Número da touca de cada atleta neste jogo:" }));
    card.append(h("div", { class: "rz-nums" }, ats.map(a => h("label", { class: "rz-num" },
      h("input", { type: "number", min: 0, max: 99, inputmode: "numeric", value: r.num[a.id], id: "rzn-" + a.id, "aria-label": "Número da touca de " + a.nome, onchange: e => { r.num[a.id] = e.target.value; o.render(); } }),
      h("span", { text: a.nome })))));
    card.append(h("div", { class: "rz-poss" }, POS_NOMES.map((pn, k) => h("label", { class: "t-lbl" }, pn + (k === 0 ? " 🏐" : ""),
      h("select", { onchange: e => { const v = e.target.value, outra = r.pos[l].indexOf(v); if (outra >= 0 && outra !== k) r.pos[l][outra] = r.pos[l][k]; r.pos[l][k] = v; o.render(); } },
        ats.map(a => h("option", { value: a.id, selected: r.pos[l][k] === a.id }, (r.num[a.id] !== "" && r.num[a.id] != null ? r.num[a.id] + " · " : "") + a.nome)))))));
    const res = ats.filter(a => !r.pos[l].includes(a.id));
    card.append(h("p", { class: "cap", text: "Reservas: " + (res.length ? res.map(a => (r.num[a.id] !== "" ? r.num[a.id] + " " : "") + a.nome).join(", ") : "nenhum") }));
    f.append(card);
  });
  f.append(h("div", { class: "t-linha" },
    h("button", { type: "button", disabled: !ok, onclick: () => confirmar(o, iSet, rzPrev) }, "Confirmar formação"),
    o.j.rodizio && o.j.rodizio.sets && o.j.rodizio.sets[iSet] && h("button", { type: "button", class: "ghost", onclick: () => { rasc = null; o.render(); } }, "Cancelar")));
  if (!ok) f.append(h("p", { class: "cap", text: "Escolha 4 atletas diferentes para cada equipe." }));
  return f;
}

function confirmar(o, iSet, rzPrev) {
  const j = o.j, r = rasc, rz = j.rodizio || { sets: [] };
  for (const l of ["a", "b"]) {
    const ns = r.pos[l].map(id => rzPrev.atl[id].num).filter(n => n != null && !Number.isNaN(n));
    if (new Set(ns).size !== ns.length) { o.toast("Há números de touca repetidos em " + (l === "a" ? o.nomeA : o.nomeB) + "."); return; }
  }
  const sets = [...(rz.sets || [])]; while (sets.length < iSet) sets.push(null);
  const ev = sets[iSet] && sets[iSet].ev ? sets[iSet].ev : [];
  sets[iSet] = { ladoA: r.ladoA, saque: r.saque, pos: { a: [...r.pos.a], b: [...r.pos.b] }, ev };
  j.rodizio = { toucaA: r.toucaA, atl: { ...(rz.atl || {}), ...rzPrev.atl }, elenco: rzPrev.elenco, sets };
  rasc = null; o.toast("Formação confirmada."); o.salvar();
}

function controles(o, rz, est, iSet) {
  const { h, j } = o, nomes = { a: o.nomeA, b: o.nomeB }, at = id => (rz.atl && rz.atl[id]) || {};
  const ev = (rz.sets[iSet].ev || []), ultimo = ev[ev.length - 1];
  const box = h("div", { class: "rz-ctl" },
    h("div", { class: "rz-pts" }, ["a", "b"].map(l => { const c = CORES[corDe(rz, l)];
      return h("button", { type: "button", class: "rz-ponto", style: "--c:" + c.cap + ";--e:" + c.escuro, onclick: () => o.ponto(l, 1) },
        h("small", { text: est.saque === l ? "sacando" : "recebendo" }), "Ponto " + nomes[l]); })),
    h("div", { class: "t-linha" },
      h("button", { type: "button", class: "ghost t-mini", disabled: !ultimo, onclick: () => {
        if (ultimo === "a" || ultimo === "b") o.ponto(ultimo, -1); else { ev.pop(); o.salvar(); }
      } }, "Desfazer último lance"),
      h("button", { type: "button", class: "ghost t-mini", onclick: () => { subForm = subForm ? null : { l: "a", sai: "", entra: "" }; o.render(); } }, subForm ? "Fechar substituição" : "Substituição")),
    h("p", { class: "cap", text: "Ponto de quem saca: não roda. Ponto de quem recebe: essa equipe roda e passa a sacar. Os +1 da súmula também contam." }));
  if (subForm) {
    const sf = subForm;
    if (!est.pos[sf.l].includes(sf.sai)) sf.sai = est.pos[sf.l][0];
    if (!est.reservas[sf.l].includes(sf.entra)) sf.entra = est.reservas[sf.l][0] || "";
    const lbl = id => (at(id).num ?? "–") + " · " + (at(id).nome || "") + (est.pos[sf.l].indexOf(id) >= 0 ? " (" + POS_NOMES[est.pos[sf.l].indexOf(id)] + ")" : "");
    box.append(h("div", { class: "rz-sub" },
      h("div", { class: "chips" }, ["a", "b"].map(l => h("button", { type: "button", "aria-pressed": String(sf.l === l), onclick: () => { sf.l = l; sf.sai = ""; sf.entra = ""; o.render(); } }, nomes[l]))),
      h("label", { class: "t-lbl" }, "Sai da piscina", h("select", { onchange: e => sf.sai = e.target.value }, est.pos[sf.l].map(id => h("option", { value: id, selected: sf.sai === id }, lbl(id))))),
      est.reservas[sf.l].length ? h("label", { class: "t-lbl" }, "Entra (reserva)", h("select", { onchange: e => sf.entra = e.target.value }, est.reservas[sf.l].map(id => h("option", { value: id, selected: sf.entra === id }, lbl(id)))))
        : h("p", { class: "cap", text: "Essa equipe não tem reservas cadastrados." }),
      est.reservas[sf.l].length > 0 && h("button", { type: "button", onclick: () => {
        rz.sets[iSet].ev = [...ev, { t: "s", l: sf.l, sai: sf.sai, entra: sf.entra }];
        o.toast("Substituição: entra " + (at(sf.entra).nome || "") + "."); subForm = null; o.salvar();
      } }, "Confirmar substituição")));
  }
  return box;
}
