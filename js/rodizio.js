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
  const pl = { a: 0, b: 0 }, rallies = [];
  let ladoA = st.ladoA || "esq", trocou = false;
  (st.ev || []).forEach((e, k) => {
    if (e === "a" || e === "b") {
      rallies.push({ k, sac: saque, aid: pos[saque][0], antes: pl.a + "-" + pl.b, ganhou: e });
      pl[e]++;
      pontos++;
      // tiebreak: quando uma equipe chega a 8 pontos, as equipes trocam de lado (uma vez)
      if (i === 2 && !trocou && (pl.a >= 8 || pl.b >= 8)) { trocou = true; ladoA = ladoA === "esq" ? "dir" : "esq"; }
      if (e !== saque) { pos[e] = girar(pos[e]); saque = e; ult = { tipo: "rodou", lado: e }; }
      else ult = { tipo: "manteve", lado: e };
    } else if (e && e.t === "s") {
      const k = pos[e.l].indexOf(e.sai); if (k >= 0) pos[e.l][k] = e.entra;
      ult = { tipo: "sub", lado: e.l, sai: e.sai, entra: e.entra };
    }
  });
  const reservas = l => ((rz.elenco && rz.elenco[l]) || []).filter(id => !pos[l].includes(id));
  return { pos, saque, ladoA, trocouTb: trocou, ult, pontos, rallies, reservas: { a: reservas("a"), b: reservas("b") } };
}
// equipes na ordem em que estão na piscina (esquerda, direita) no set i; sem formação = ["a","b"]
export function ordemLados(rz, i) {
  const e = rz && rz.sets && rz.sets[i] && rz.sets[i].pos ? estado(rz, i) : null;
  if (e) return e.ladoA === "dir" ? ["b", "a"] : ["a", "b"];
  // set novo ainda sem formação: as equipes já trocaram de lado em relação ao fim do set anterior
  const ant = i > 0 && rz && rz.sets && rz.sets[i - 1] && rz.sets[i - 1].pos ? estado(rz, i - 1) : null;
  if (ant) return ant.ladoA === "dir" ? ["a", "b"] : ["b", "a"];
  return ["a", "b"];
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
  else if (iMostra === iSet && !o.fim) alertas(j, iSet, est, nomes).forEach(a => w.append(h("div", { class: "rz-alerta " + a.nivel }, h("b", { text: "⚠ Regra " + a.regra }), h("span", { text: a.msg }))));
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
    ladoA: editar && atual ? atual.ladoA : ant && ant.pos ? (estado(rz, iSet - 1).ladoA === "esq" ? "dir" : "esq") : "esq",
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
  const antF = iSet > 0 && o.j.rodizio && o.j.rodizio.sets && o.j.rodizio.sets[iSet - 1];
  if (antF && antF.pos && r.ladoA === estado(o.j.rodizio, iSet - 1).ladoA)
    f.append(h("div", { class: "rz-alerta erro" }, h("b", { text: "⚠ Troca de lado" }), h("span", { text: "Ao fim de cada set as equipes trocam de lado. Aqui está igual ao fim do set anterior: confira \"Do lado esquerdo\"." })));
  // prévia
  if (ok) f.append(h("div", { class: "rz-box" }, piscina({ rz: rzPrev, est: { pos: r.pos, saque: r.saque, ladoA: r.ladoA, reservas: { a: [], b: [] } }, nomes, chave: "prev:" + j.id })));
  // por equipe: números e posições
  ["a", "b"].forEach(l => {
    const cor = CORES[l === "a" ? r.toucaA : r.toucaA === "azul" ? "vermelha" : "azul"], ats = elencoOrdenado(o.atletas[l]);
    const card = h("div", { class: "rz-eq", style: "--c:" + cor.cap }, h("b", { class: "rz-eqnome", text: nomes[l] + " · touca " + cor.nome.toLowerCase() }));
    if (ats.length < 4) { card.append(h("p", { class: "cap", text: "Cadastre pelo menos 4 atletas desta equipe na aba Equipes." })); f.append(card); return; }
    if (ats.length > 8) card.append(h("div", { class: "rz-alerta erro" }, h("b", { text: "⚠ Regra 12.1" }), h("span", { text: "A equipe pode ter no máximo 8 atletas na súmula; esta tem " + ats.length + "." })));
    const exJ = expulsos(o.j); r.pos[l].forEach(id => { if (exJ.has(id)) card.append(h("div", { class: "rz-alerta erro" }, h("b", { text: "⚠ Regra 46.3" }), h("span", { text: "Há atleta expulso na formação: troque por outro." }))); });
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
  const exJ = expulsos(j);
  if (["a", "b"].some(l => r.pos[l].some(id => exJ.has(id)))) { o.toast("Atleta expulso não pode estar na formação (regra 46.3)."); return; }
  const sets = [...(rz.sets || [])]; while (sets.length < iSet) sets.push(null);
  const ev = sets[iSet] && sets[iSet].ev ? sets[iSet].ev : [];
  sets[iSet] = { ladoA: r.ladoA, saque: r.saque, pos: { a: [...r.pos.a], b: [...r.pos.b] }, ev };
  j.rodizio = { toucaA: r.toucaA, atl: { ...(rz.atl || {}), ...rzPrev.atl }, elenco: rzPrev.elenco, sets };
  rasc = null; o.toast("Formação confirmada."); o.salvar();
}


/* ---------------- regras oficiais (CNBi): substituição, rodízio e disciplina ---------------- */
// Substituição (30): sem limite; quem já esteve na piscina no set só reentra na posição de saque;
//   o suplente entra a 1ª vez em qualquer posição. Excepcional por lesão (31): qualquer um entra e o lesionado não volta.
//   Expulso (32) deve ser substituído regularmente; sem como, a equipe fica INCOMPLETA (23.3).
//   Substituição irregular (32.1/32.2): perde o rally, corrige a substituição e anula os pontos da equipe feitos depois dela.
// Rodízio (29): falta de rotação = perde o rally; pontos da equipe a partir do momento da falta são anulados
//   (se o momento não puder ser determinado, só perde o rally).
// Disciplina (46–49): 1ª conduta = advertência verbal (sem ponto, não vai à súmula); 2ª conduta de qualquer integrante = amarelo
//   (perde o rally); quem já tem amarelo, na próxima = vermelho (expulsão até o fim da partida). Vermelho direto por ofensa/agressão.
//   Demora (41.2): 1ª = advertência por demora; a partir da 2ª = penalização por demora (perde o rally).
export const SANCOES = {
  adv: { rot: "Advertência verbal", curto: "Advertência", ponto: false, sumula: false, ic: "🗣️" },
  amarelo: { rot: "Cartão amarelo", curto: "Amarelo", ponto: true, sumula: true, ic: "🟨" },
  vermelho: { rot: "Cartão vermelho (expulsão)", curto: "Vermelho", ponto: false, sumula: true, ic: "🟥" },
  advDemora: { rot: "Advertência por demora", curto: "Adv. demora", ponto: false, sumula: true, ic: "⏱️" },
  penDemora: { rot: "Penalização por demora", curto: "Pen. demora", ponto: true, sumula: true, ic: "⏱️" }
};
export const MEMBROS_EXTRA = { tec: "Técnico", com: "Comissão técnica", eq: "Equipe" };
export const expulsos = j => new Set((j.sancoes || []).filter(x => x.tipo === "vermelho" && x.quem && !MEMBROS_EXTRA[x.quem]).map(x => x.quem));
export function lesionados(rz) {
  const r = new Set(); ((rz && rz.sets) || []).forEach(st => ((st && st.ev) || []).forEach(e => { if (e && e.t === "s" && e.ex) r.add(e.sai); })); return r;
}
export function jaJogouNoSet(rz, i, l) {
  const st = rz.sets[i], r = new Set(st.pos[l]);
  (st.ev || []).forEach(e => { if (e && e.t === "s" && e.l === l) r.add(e.entra); }); return r;
}
// devolve { ok, msg, regra }
export function validarSub(j, iSet, est, l, sai, entra, excepcional) {
  const rz = j.rodizio, at = id => (rz.atl && rz.atl[id]) || {}, nm = id => "nº " + (at(id).num ?? "–") + " " + (at(id).nome || "");
  if (!sai || est.pos[l].indexOf(sai) < 0) return { ok: false, msg: "Escolha quem sai da piscina." };
  if (!entra) return { ok: false, msg: "Escolha quem entra." };
  if (est.pos[l].includes(entra)) return { ok: false, msg: nm(entra) + " já está na piscina." };
  if (expulsos(j).has(entra)) return { ok: false, regra: "46.3", msg: nm(entra) + " foi expulso (vermelho) e não pode voltar a jogar nesta partida." };
  if (lesionados(rz).has(entra)) return { ok: false, regra: "31.2", msg: nm(entra) + " saiu por lesão (substituição excepcional) e não pode reentrar." };
  if (excepcional) return { ok: true, regra: "31", msg: "Substituição excepcional por lesão: " + nm(sai) + " não poderá reentrar na partida." };
  const k = est.pos[l].indexOf(sai);
  if (jaJogouNoSet(rz, iSet, l).has(entra) && k !== 0)
    return { ok: false, regra: "30.2–30.4", msg: nm(entra) + " já esteve na piscina neste set e só pode reentrar na posição de saque. Agora quem está no saque é " + nm(est.pos[l][0]) + "." };
  return { ok: true, msg: jaJogouNoSet(rz, iSet, l).has(entra) ? "Reentrada na posição de saque: permitida." : "Primeira entrada no set: pode ser em qualquer posição." };
}
// alguém de fora pode entrar no lugar de "sai" de forma regular?
export function temSubRegular(j, iSet, est, l, sai) {
  return (j.rodizio.elenco[l] || []).some(id => !est.pos[l].includes(id) && validarSub(j, iSet, est, l, sai, id, false).ok);
}
// alertas para mesário e árbitro
export function alertas(j, iSet, est, nomes) {
  const rz = j.rodizio, out = [], at = id => (rz.atl && rz.atl[id]) || {}, nm = id => "nº " + (at(id).num ?? "–") + " " + (at(id).nome || ""), ex = expulsos(j);
  ["a", "b"].forEach(l => {
    est.pos[l].forEach(id => {
      if (!ex.has(id)) return;
      const pode = temSubRegular(j, iSet, est, l, id);
      out.push({ nivel: "erro", l, tipo: "expulsoEmJogo", aid: id, regra: pode ? "32" : "32 / 23.3",
        msg: nm(id) + " (" + nomes[l] + ") foi expulso e está na piscina. " + (pode ? "Faça a substituição regular antes do próximo saque." : "Não há substituição regular possível: a equipe fica INCOMPLETA.") });
    });
    const st = rz.sets[iSet];
    (st.ev || []).forEach((e, k) => { if (e && e.t === "s" && e.irr && e.l === l) out.push({ nivel: "erro", l, tipo: "subIrregular", k, regra: "32.1 / 32.2",
      msg: "Substituição irregular em " + nomes[l] + " (sai " + nm(e.sai) + ", entra " + nm(e.entra) + "): " + (e.motivo || "fora da regra") + "." }); });
    const disp = (rz.elenco[l] || []).filter(id => !ex.has(id) && !lesionados(rz).has(id));
    if (disp.length < 4) out.push({ nivel: "erro", l, tipo: "incompleta", regra: "23.3", msg: nomes[l] + " tem só " + disp.length + " atleta(s) em condição de jogo: equipe INCOMPLETA." });
  });
  return out;
}
// anula os pontos da equipe l a partir do lance k (ev) no set i e devolve quantos foram anulados
function anularDesde(j, i, l, k) {
  const st = j.rodizio.sets[i]; let n = 0;
  st.ev = st.ev.filter((e, idx) => { if (idx >= k && e === l) { n++; return false; } return true; });
  j.sets[i][l] = Math.max(0, (j.sets[i][l] || 0) - n);
  return n;
}
// equipe incompleta: adversária recebe os pontos e sets que faltam (23.3)
export function declararIncompleta(j, l) {
  const op = outro(l), sets = j.sets; let ga = 0, gb = 0;
  const alvo = i => (i < 2 ? 21 : 15), venc = s => s.a > s.b ? "a" : "b";
  sets.forEach((s, i) => { if (i < sets.length - 1) venc(s) === "a" ? ga++ : gb++; });
  const ult = sets[sets.length - 1], i = sets.length - 1;
  ult[op] = Math.max(alvo(i), (ult[l] || 0) + 2); (op === "a" ? ga++ : gb++);
  while ((op === "a" ? ga : gb) < 2) { const s = { a: 0, b: 0 }; s[op] = alvo(sets.length); sets.push(s); op === "a" ? ga++ : gb++; }
  j.incompleta = l; j.status = "encerrado"; j.venc = j[op];
}

let discForm = null, faltaForm = null;
function controles(o, rz, est, iSet) {
  const { h, j } = o, nomes = { a: o.nomeA, b: o.nomeB }, at = id => (rz.atl && rz.atl[id]) || {}, nm = id => "nº " + (at(id).num ?? "–") + " " + (at(id).nome || "");
  const ev = (rz.sets[iSet].ev || []), ultimo = ev[ev.length - 1];
  const box = h("div", { class: "rz-ctl" });
  // alertas de regra
  const al = alertas(j, iSet, est, nomes);
  al.forEach(a => box.append(h("div", { class: "rz-alerta " + a.nivel, role: "alert" },
    h("b", { text: "⚠ Regra " + a.regra }), h("span", { text: a.msg }),
    a.tipo === "expulsoEmJogo" && temSubRegular(j, iSet, est, a.l, a.aid) && h("button", { type: "button", class: "t-mini", onclick: () => { subForm = { l: a.l, sai: a.aid, entra: "", ex: false }; o.render(); } }, "Substituir agora"),
    (a.tipo === "incompleta" || (a.tipo === "expulsoEmJogo" && !temSubRegular(j, iSet, est, a.l, a.aid))) && h("button", { type: "button", class: "danger t-mini", onclick: ev2 => armar(ev2, "Confirmar: equipe incompleta", () => { declararIncompleta(j, a.l); o.toast(nomes[a.l] + " declarada incompleta. Jogo encerrado."); o.salvar(); }) }, "Declarar equipe incompleta (23.3)"),
    a.tipo === "subIrregular" && h("div", { class: "t-linha" },
      h("button", { type: "button", class: "danger t-mini", onclick: () => {
        const n = anularDesde(j, iSet, a.l, a.k); rz.sets[iSet].ev.splice(a.k, 1);
        o.toast("Regra 32.2: substituição corrigida, " + n + " ponto(s) de " + nomes[a.l] + " anulado(s) e ponto para " + nomes[outro(a.l)] + ".");
        o.ponto(outro(a.l), 1);
      } }, "Aplicar 32.2 (perde o rally)"),
      h("button", { type: "button", class: "ghost t-mini", onclick: () => { rz.sets[iSet].ev.splice(a.k, 1); o.toast("Substituição desfeita (corrigida antes do jogo)."); o.salvar(); } }, "Corrigida antes do saque")))));
  if (iSet === 2 && est.trocouTb) {
    const e8 = (rz.sets[2].ev || []).filter(x => x === "a" || x === "b"), pa = e8.filter(x => x === "a").length, pb = e8.length - pa;
    if (Math.max(pa, pb) === 8 && Math.min(pa, pb) < 8 && (pa + pb) <= 15) box.append(h("div", { class: "rz-alerta info", role: "status" }, h("b", { text: "↔ Troca de lado" }), h("span", { text: "Tiebreak: uma equipe chegou aos 8 pontos. As equipes trocam de lado da piscina; a marcação de pontos já acompanhou." })));
  }
  // quem deve sacar agora
  const sac = est.pos[est.saque][0];
  box.append(h("div", { class: "rz-confere" }, h("span", { class: "rz-bola", "aria-hidden": "true" }),
    h("span", null, "Próximo saque: ", h("b", { text: nm(sac) }), " (" + nomes[est.saque] + "). Se outro atleta sacar, use \"Falta de rotação\".")));
  box.append(
    h("div", { class: "rz-pts" }, (est.ladoA === "dir" ? ["b", "a"] : ["a", "b"]).map((l, k) => { const c = CORES[corDe(rz, l)];
      return h("button", { type: "button", class: "rz-ponto", style: "--c:" + c.cap + ";--e:" + c.escuro, onclick: () => o.ponto(l, 1) },
        h("small", { text: (k === 0 ? "◀ esquerda · " : "direita ▶ · ") + (est.saque === l ? "sacando" : "recebendo") }), "Ponto " + nomes[l]); })),
    h("div", { class: "t-linha" },
      h("button", { type: "button", class: "ghost t-mini", disabled: !ultimo, onclick: () => {
        if (ultimo === "a" || ultimo === "b") o.ponto(ultimo, -1); else { ev.pop(); o.salvar(); }
      } }, "Desfazer último lance"),
      h("button", { type: "button", class: "ghost t-mini", onclick: () => { subForm = subForm ? null : { l: "a", sai: "", entra: "", ex: false }; faltaForm = null; o.render(); } }, subForm ? "Fechar substituição" : "Substituição"),
      h("button", { type: "button", class: "ghost t-mini", onclick: () => { faltaForm = faltaForm ? null : { l: "a", k: "" }; subForm = null; o.render(); } }, faltaForm ? "Fechar falta" : "Falta de rotação / posição")),
    h("p", { class: "cap", text: "Ponto de quem saca: não roda. Ponto de quem recebe: essa equipe roda e passa a sacar. Os +1 da súmula também contam." }));
  if (subForm) box.append(formSub(o, rz, est, iSet, nomes, nm));
  if (faltaForm) box.append(formFalta(o, rz, est, iSet, nomes, nm));
  return box;
}

// botão que pede um segundo toque para confirmar
function armar(ev, txt, fn) {
  const b = ev.currentTarget; if (b.dataset.armado) return fn();
  const antes = b.textContent; b.dataset.armado = "1"; b.textContent = txt; setTimeout(() => { delete b.dataset.armado; b.textContent = antes; }, 4000);
}

function formSub(o, rz, est, iSet, nomes, nm) {
  const { h, j } = o, sf = subForm;
  if (!est.pos[sf.l].includes(sf.sai)) sf.sai = est.pos[sf.l][0];
  const fora = (rz.elenco[sf.l] || []).filter(id => !est.pos[sf.l].includes(id));
  if (!fora.includes(sf.entra)) sf.entra = fora.find(id => validarSub(j, iSet, est, sf.l, sf.sai, id, sf.ex).ok) || fora[0] || "";
  const v = validarSub(j, iSet, est, sf.l, sf.sai, sf.entra, sf.ex);
  const posDe = id => est.pos[sf.l].indexOf(id) >= 0 ? " (" + POS_NOMES[est.pos[sf.l].indexOf(id)] + ")" : "";
  const marca = id => { const r = validarSub(j, iSet, est, sf.l, sf.sai, id, sf.ex); return r.ok ? "" : expulsos(j).has(id) ? " – expulso" : lesionados(rz).has(id) ? " – lesionado" : " – só no saque"; };
  return h("div", { class: "rz-sub" },
    h("div", { class: "chips" }, ["a", "b"].map(l => h("button", { type: "button", "aria-pressed": String(sf.l === l), onclick: () => { sf.l = l; sf.sai = ""; sf.entra = ""; o.render(); } }, nomes[l]))),
    h("label", { class: "t-lbl" }, "Sai da piscina", h("select", { onchange: e => { sf.sai = e.target.value; o.render(); } }, est.pos[sf.l].map(id => h("option", { value: id, selected: sf.sai === id }, nm(id) + posDe(id) + (expulsos(j).has(id) ? " – EXPULSO" : ""))))),
    fora.length ? h("label", { class: "t-lbl" }, "Entra", h("select", { onchange: e => { sf.entra = e.target.value; o.render(); } }, fora.map(id => h("option", { value: id, selected: sf.entra === id }, nm(id) + marca(id)))))
      : h("p", { class: "cap", text: "Essa equipe não tem atletas fora da piscina." }),
    h("label", { class: "t-chk" }, h("input", { type: "checkbox", checked: !!sf.ex, onchange: e => { sf.ex = e.target.checked; o.render(); } }), "Lesão: substituição excepcional (regra 31)"),
    fora.length > 0 && h("div", { class: "rz-alerta " + (v.ok ? "ok" : "erro") }, h("b", { text: v.ok ? "✓ Permitida" : "✗ Irregular" + (v.regra ? " (regra " + v.regra + ")" : "") }), h("span", { text: v.msg })),
    fora.length > 0 && h("div", { class: "t-linha" },
      h("button", { type: "button", disabled: !v.ok, onclick: () => {
        rz.sets[iSet].ev = [...(rz.sets[iSet].ev || []), sf.ex ? { t: "s", l: sf.l, sai: sf.sai, entra: sf.entra, ex: true } : { t: "s", l: sf.l, sai: sf.sai, entra: sf.entra }];
        o.toast("Substituição: entra " + nm(sf.entra) + "."); subForm = null; o.salvar();
      } }, "Confirmar substituição"),
      !v.ok && v.regra && h("button", { type: "button", class: "ghost t-mini", onclick: ev => armar(ev, "Toque de novo: registrar irregular", () => {
        rz.sets[iSet].ev = [...(rz.sets[iSet].ev || []), { t: "s", l: sf.l, sai: sf.sai, entra: sf.entra, irr: true, motivo: "regra " + v.regra }];
        o.toast("Registrada como irregular. O árbitro decide pela regra 32.2."); subForm = null; o.salvar();
      }) }, "Já aconteceu na piscina: registrar irregular")));
}

function formFalta(o, rz, est, iSet, nomes, nm) {
  const { h, j } = o, ff = faltaForm;
  const saques = est.rallies.filter(r => r.sac === ff.l);
  return h("div", { class: "rz-sub" },
    h("p", { class: "cap", text: "Falta de rotação (saque fora da ordem) ou de posição: a equipe perde o rally e a ordem é corrigida. Se o momento da falta for conhecido, os pontos da equipe a partir dele são anulados (regras 29.3, 29.4, 28.3)." }),
    h("div", { class: "chips" }, ["a", "b"].map(l => h("button", { type: "button", "aria-pressed": String(ff.l === l), onclick: () => { ff.l = l; ff.k = ""; o.render(); } }, nomes[l]))),
    h("label", { class: "t-lbl" }, "Momento da falta",
      h("select", { onchange: e => ff.k = e.target.value },
        h("option", { value: "", selected: ff.k === "" }, "Não dá para saber: só perde o rally"),
        saques.map(r => h("option", { value: String(r.k), selected: String(r.k) === ff.k }, "Saque com placar " + r.antes + " (devia sacar " + nm(r.aid) + ")")))),
    h("button", { type: "button", class: "danger", onclick: ev => armar(ev, "Toque de novo para aplicar", () => {
      let n = 0; if (ff.k !== "") n = anularDesde(j, iSet, ff.l, Number(ff.k));
      o.toast("Falta de " + nomes[ff.l] + ": " + (n ? n + " ponto(s) anulado(s) e " : "") + "ponto para " + nomes[outro(ff.l)] + ".");
      faltaForm = null; o.ponto(outro(ff.l), 1);
    }) }, "Aplicar falta (ponto para a outra equipe)"));
}

/* ---------------- disciplina: advertência, amarelo, vermelho, demora ---------------- */
export function sugerirSancao(j, l, quem) {
  const ss = (j.sancoes || []).filter(x => x.l === l && !/Demora$/.test(x.tipo));
  if (quem !== "eq" && ss.some(x => x.quem === quem && x.tipo === "vermelho")) return { tipo: null, msg: "Já foi expulso nesta partida." };
  if (quem !== "eq" && ss.some(x => x.quem === quem && x.tipo === "amarelo")) return { tipo: "vermelho", msg: "Já tem amarelo nesta partida: a próxima sanção é o vermelho (expulsão)." };
  if (ss.length) return { tipo: "amarelo", msg: "A equipe já teve conduta advertida/sancionada nesta partida: a próxima conduta é cartão amarelo (perde o rally)." };
  return { tipo: "adv", msg: "Primeira conduta da equipe: advertência verbal, sem perda de ponto e sem registro na súmula." };
}
export function sugerirDemora(j, l) { return (j.sancoes || []).some(x => x.l === l && /Demora$/.test(x.tipo)) ? "penDemora" : "advDemora"; }

// seção da súmula com os cartões; o = { h, j, nomeA, nomeB, atletas, ed, fim, ponto, salvar, toast, render }
export function painelDisciplina(o) {
  const { h, j, ed } = o, nomes = { a: o.nomeA, b: o.nomeB }, rz = j.rodizio || {};
  const numDe = (l, id) => { const a = (o.atletas[l] || []).find(x => x.id === id) || {}; const n = rz.atl && rz.atl[id] && rz.atl[id].num != null ? rz.atl[id].num : a.num; return (n ?? "–") + " " + (a.nome || (rz.atl && rz.atl[id] && rz.atl[id].nome) || ""); };
  const quemTxt = x => MEMBROS_EXTRA[x.quem] || "nº " + numDe(x.l, x.quem);
  const lista = j.sancoes || [];
  const w = h("section", { class: "rz rz-disc" }, h("h3", { class: "rz-tit", text: "Disciplina" }));
  if (lista.length) w.append(h("div", { class: "rz-sancs" }, lista.map((x, i) => h("div", { class: "rz-sanc " + x.tipo },
    h("span", { class: "rz-sanc-ic", text: SANCOES[x.tipo].ic }),
    h("span", null, h("b", { text: SANCOES[x.tipo].curto }), " · " + quemTxt(x) + " (" + nomes[x.l] + ") · " + (x.set < 2 ? "set " + (x.set + 1) : "tiebreak") + " · " + x.placar + (SANCOES[x.tipo].ponto ? " · ponto para " + nomes[outro(x.l)] : "")),
    ed && !o.fim && h("button", { type: "button", class: "ghost t-mini", "aria-label": "Retirar sanção", onclick: ev => armar(ev, "Retirar?", () => { j.sancoes.splice(i, 1); o.toast("Sanção retirada." + (SANCOES[x.tipo].ponto ? " Se o ponto dado já não vale, corrija o placar com −1." : "")); o.salvar(); }) }, "×")))));
  else w.append(h("p", { class: "cap", text: "Nenhuma sanção nesta partida." }));
  if (!ed || o.fim) return w;
  if (!discForm || discForm.jid !== j.id) discForm = { jid: j.id, aberto: false, l: "a", quem: "" };
  const df = discForm;
  w.append(h("button", { type: "button", class: "ghost t-mini", onclick: () => { df.aberto = !df.aberto; o.render(); } }, df.aberto ? "Fechar" : "Registrar sanção"));
  if (!df.aberto) return w;
  const ats = [...(o.atletas[df.l] || [])].sort((x, y) => (x.num ?? 999) - (y.num ?? 999));
  if (!df.quem) df.quem = ats[0] ? ats[0].id : "tec";
  const sug = sugerirSancao(j, df.l, df.quem), dem = sugerirDemora(j, df.l);
  const iSet = Math.max(0, (j.sets || []).length - 1), s = (j.sets || [])[iSet] || { a: 0, b: 0 };
  const aplicar = tipo => {
    j.sancoes = [...lista, { tipo, l: df.l, quem: /Demora$/.test(tipo) ? "eq" : df.quem, set: iSet, placar: (s.a || 0) + "-" + (s.b || 0), em: Date.now() }];
    const est = j.rodizio && setComFormacao(j.rodizio, iSet) === iSet ? estado(j.rodizio, iSet) : null;
    o.toast(SANCOES[tipo].rot + (SANCOES[tipo].ponto ? ": ponto para " + nomes[outro(df.l)] + "." : ".") + (tipo === "vermelho" && est && est.pos[df.l].includes(df.quem) ? " Substitua o expulso." : ""));
    df.aberto = false;
    if (SANCOES[tipo].ponto) o.ponto(outro(df.l), 1); else o.salvar();
  };
  const bt = (tipo, extra) => h("button", { type: "button", class: "rz-sbtn " + tipo + (sug.tipo === tipo ? " sug" : ""), onclick: () => aplicar(tipo) }, SANCOES[tipo].ic + " " + SANCOES[tipo].rot + (extra || ""));
  w.append(h("div", { class: "rz-sub" },
    h("div", { class: "chips" }, ["a", "b"].map(l => h("button", { type: "button", "aria-pressed": String(df.l === l), onclick: () => { df.l = l; df.quem = ""; o.render(); } }, nomes[l]))),
    h("label", { class: "t-lbl" }, "Quem",
      h("select", { onchange: e => { df.quem = e.target.value; o.render(); } },
        ats.map(a => h("option", { value: a.id, selected: df.quem === a.id }, "nº " + numDe(df.l, a.id) + (expulsos(j).has(a.id) ? " – expulso" : ""))),
        ["tec", "com"].map(k => h("option", { value: k, selected: df.quem === k }, MEMBROS_EXTRA[k])))),
    h("div", { class: "rz-alerta info" }, h("b", { text: "Sugestão pela regra" }), h("span", { text: sug.msg })),
    sug.tipo !== null && h("div", { class: "rz-sbtns" },
      bt("adv"), bt("amarelo", " – perde o rally"), bt("vermelho"),
      h("p", { class: "cap", text: "Vermelho direto é permitido em conduta ofensiva ou agressão (regra 47.3). O amarelo não tira o atleta da piscina por tempo, e o expulso pode ser substituído normalmente." })),
    h("span", { class: "t-sub", text: "Demora (sanção da equipe)" }),
    h("div", { class: "rz-sbtns" }, h("button", { type: "button", class: "rz-sbtn " + dem + " sug", onclick: () => aplicar(dem) }, SANCOES[dem].ic + " " + SANCOES[dem].rot + (SANCOES[dem].ponto ? " – perde o rally" : "")))));
  return w;
}
