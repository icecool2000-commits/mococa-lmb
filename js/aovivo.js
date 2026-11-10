// Ao vivo: transmissão do YouTube dentro do app, placar ao vivo do jogo em destaque (vem da súmula),
// live do Instagram e lista das transmissões passadas. Marcar "ao vivo" e cadastrar o canal: só organizador/editores.
// Firestore: ao_vivo/{app} = estado da transmissão + canal; ao_vivo/{app}/historico/{id} = transmissões encerradas.
// placar.html?app={app} é o placar transparente para OBS / Streamlabs / Prism (lê o mesmo documento).
import * as C from "./torneio-core.js";
import * as R from "./rodizio.js";
import * as BQ from "./basquete.js";

const dataHora = ms => { if (!ms) return ""; const d = new Date(ms), p = n => String(n).padStart(2, "0"); return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes()); };

// aceita ID (UC...), link /channel/UC..., @handle ou link youtube.com/@handle
export function lerCanal(txt) {
  const s = String(txt || "").trim(); if (!s) return { id: "", handle: "" };
  const id = (s.match(/(UC[\w-]{22})/) || [])[1] || "";
  const handle = (s.match(/@([\w.-]{3,})/) || [])[1] || "";
  return { id, handle };
}
// aceita link do vídeo/live (watch?v=, youtu.be/, /live/, /shorts/, /embed/) ou só o código
export function lerVideo(txt) {
  const s = String(txt || "").trim(); if (!s) return "";
  const m = s.match(/(?:v=|youtu\.be\/|\/live\/|\/shorts\/|\/embed\/)([\w-]{11})/); if (m) return m[1];
  return /^[\w-]{11}$/.test(s) ? s : "";
}
export function rotuloJogo(T, j) {
  if (!T || !j) return "";
  const et = (T.etapas || [])[j.etapa] || {};
  const fase = j.fase === "grupo" ? "Grupo " + C.letraGrupo(j.grupo ?? 0) : C.faseEstat(j) || "";
  return [et.nome, fase].filter(Boolean).join(" · ");
}
// placar para mostrar (biribol: sets + pontos do set atual; basquete: total + período)
export function placarVivo(esporte, j) {
  if (!j) return null;
  const r = C.resultado(esporte, j);
  if (esporte === "biribol") {
    const sets = (j.sets || []).map((s, i) => ({ a: s.a || 0, b: s.b || 0, fechado: C.setFechado(s.a || 0, s.b || 0, i) }));
    let i = sets.findIndex(s => !s.fechado); if (i < 0) i = Math.max(0, sets.length - 1);
    const at = sets[i] || { a: 0, b: 0 };
    return { grande: [r.sa, r.sb], atual: [at.a, at.b], rotAtual: r.fim ? "Final" : (i === 2 ? "Tiebreak" : (i + 1) + "º set"), parciais: sets.filter(s => s.a || s.b).map(s => s.a + "-" + s.b), fim: r.fim || j.status === "encerrado", venc: r.venc, wo: !!j.wo, rotGrande: "Sets" };
  }
  const ps = j.periodos || []; let i = ps.length - 1; while (i > 0 && !(ps[i].a || ps[i].b)) i--;
  if (j.qAtual) { const k = ps.findIndex(x => x.n === j.qAtual); if (k >= 0) i = k; }
  const p = ps[i] || { n: "1Q", a: 0, b: 0 };
  return { grande: [r.pa, r.pb], atual: [p.a || 0, p.b || 0], rotAtual: r.fim ? "Final" : BQ.nomeQ(p.n), parciais: ps.filter(x => x.a || x.b).map(x => x.n + " " + (x.a || 0) + "-" + (x.b || 0)), fim: r.fim, venc: r.venc, wo: !!j.wo, rotGrande: "Pontos" };
}

function hLocal(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "style") e.style.cssText = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  kids.flat(9).forEach(c => { if (c == null || c === false) return; e.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return e;
}
// placar marcado à mão (modo treino/rachão, sem súmula): vira um "jogo" para as mesmas contas
// basquete: periodos (quartos), q = quarto atual, rel = relógio {rest, rod, em}, fim = encerrado
const Q4 = () => ["1Q", "2Q", "3Q", "4Q"].map(n => ({ n, a: 0, b: 0 }));
export function jogoManual(m) { return m ? { id: "manual", a: "A", b: "B", sets: (m.sets || []).map(x => ({ a: x.a || 0, b: x.b || 0 })), periodos: m.periodos || Q4(), qAtual: m.q || null, mrel: m.rel || null, status: m.fim ? "encerrado" : "andamento" } : null; }

/* ---------- simulação do BASQUETE: jogo completo pelo relógio (app e placar.html calculam igual) ----------
   E.simBq = { inicio, seed, parado (segundos reais já jogados, quando pausado) }.
   Relógio acelerado: 1 s real = 10 s de jogo (quarto de 10 min ≈ 1 min real; intervalo de 5 s).
   Cestas de 2 e de 3, faltas (com penalidade e lances livres), ofensivas, técnicas, substituições (5 faltas = sai),
   tempos e posse alternada — tudo na mesa (j.mesa), então quadra, faltas de equipe, BÔNUS e tempos aparecem na live. */
const BQ_LAR = [[4, "Thiago"], [5, "Bruno"], [7, "Caio"], [8, "Diego"], [9, "Enzo"], [10, "Fábio"], [11, "Gabriel"], [12, "Heitor"], [13, "Igor"], [14, "João"]];
const BQ_AZU = [[4, "Lucas"], [6, "Mateus"], [7, "Nicolas"], [8, "Otávio"], [9, "Paulo"], [10, "Rafael"], [11, "Samuel"], [12, "Túlio"], [13, "Vitor"], [15, "William"]];
const SEG_Q = 600, VEL = 10, PAUSA = 5; // segundos de jogo por quarto, velocidade, intervalo real entre quartos
const rngDe = seed => { let x = (seed >>> 0) || 7; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
const cacheBq = {};
function linhaDoTempoBq(seed) {
  if (cacheBq[seed]) return cacheBq[seed];
  const rnd = rngDe(seed), pick = a => a[Math.floor(rnd() * a.length)];
  const ids = { a: BQ_LAR.map(x => "sbq-a" + x[0]), b: BQ_AZU.map(x => "sbq-b" + x[0]) }, quadra = { a: ids.a.slice(0, 5), b: ids.b.slice(0, 5) };
  const ini = { a: [...quadra.a], b: [...quadra.b] }, salto = rnd() < 0.5 ? "a" : "b", fal = {}, ev = [], pts = { a: 0, b: 0 };
  const out = []; // { t (s reais), q, dt (s de jogo no quarto), e: evento da mesa | {pts:[aid, v, l]} }
  let seta = salto === "a" ? "b" : "a", q = 0, quartos = ["1Q", "2Q", "3Q", "4Q"], tempos = { a: [], b: [] };
  const push = (qi, g, e) => out.push({ t: qi * (SEG_Q / VEL + PAUSA) + g / VEL, q: quartos[qi], g, e });
  for (q = 0; q < quartos.length; q++) {
    const Q = quartos[q], dur = /^P/.test(Q) ? 300 : SEG_Q, base = q;
    if (q > 0) { push(base, 0, { t: "pos", l: seta, q: Q }); seta = seta === "a" ? "b" : "a"; }
    const feQ = { a: 0, b: 0 }; if (/^P/.test(Q) || Q === "4Q") ["a", "b"].forEach(l => feQ[l] = ev.filter(e => e.t === "f" && e.l === l && (e.q === "4Q" || /^P/.test(e.q)) && e.quem !== "tec").length);
    let g = 3, ataque = rnd() < 0.5 ? "a" : "b";
    while (true) {
      g += 9 + Math.floor(rnd() * 16); if (g >= dur - 2) break;
      const l = ataque, d = l === "a" ? "b" : "a", x = rnd(), at = pick(quadra[l]), df = pick(quadra[d]);
      const cesta = (aid, lado, v) => { pts[lado] += v; push(base, g, { pts: [aid, v, lado] }); };
      const falta = (quem, ld, tipo, extra) => { const fx = fal[quem] || (fal[quem] = 0); fal[quem] = fx + 1; feQ[ld]++; const e = { t: "f", l: ld, quem, tipo, arr: 0, conv: false, q: Q, ...extra }; ev.push(e); push(base, g, e);
        if (fal[quem] >= 5) { const banco = ids[ld].filter(i => !quadra[ld].includes(i) && (fal[i] || 0) < 5); if (banco.length) { const entra = pick(banco), s = { t: "s", l: ld, sai: quem, entra, q: Q }; quadra[ld][quadra[ld].indexOf(quem)] = entra; ev.push(s); push(base, g + 1, s); } } };
      const lances = (lado, aid, n) => { for (let i = 0; i < n; i++) { const ok = rnd() < 0.74, e = { t: "ll", l: lado, aid, ok, q: Q }; ev.push(e); push(base, g + 1 + i, e); if (ok) cesta(aid, lado, 1); } };
      if (x < 0.40) cesta(at, l, 2);
      else if (x < 0.55) cesta(at, l, 3);
      else if (x < 0.66) { /* erro / rebote do adversário */ }
      else if (x < 0.86) { // falta da defesa
        const arr = rnd() < 0.35 ? (rnd() < 0.2 ? 3 : 2) : 0, pen = feQ[d] >= 4, n = arr || (pen ? 2 : 0);
        falta(df, d, "P", { arr, ll: n, sofreu: n ? at : null }); if (n) lances(l, at, n);
      }
      else if (x < 0.90) falta(at, l, "O", {});
      else if (x < 0.95) { const banco = ids[l].filter(i => !quadra[l].includes(i) && (fal[i] || 0) < 5); if (banco.length) { const k = Math.floor(rnd() * 5), sai = quadra[l][k], entra = pick(banco), s = { t: "s", l, sai, entra, q: Q }; quadra[l][k] = entra; ev.push(s); push(base, g, s); } }
      else if (x < 0.975) { const met = q < 2 ? "1" : q < 4 ? "2" : Q, lim = q < 2 ? 2 : q < 4 ? 3 : 1; if (tempos[d].filter(t => t === met).length < lim) { tempos[d].push(met); const e = { t: "to", l: d, q: Q, u2: false }; ev.push(e); push(base, g, e); } }
      else if (x < 0.985) { falta(df, d, "T", { ll: 1, sofreu: at }); lances(l, at, 1); }
      ataque = d; // posse troca
    }
    if (q === quartos.length - 1 && pts.a === pts.b && quartos.length < 7) quartos.push("P" + (quartos.length - 3)); // empate: prorrogação
  }
  const fimT = (quartos.length) * (SEG_Q / VEL + PAUSA);
  return (cacheBq[seed] = { out, ini, salto, quartos, fimT, ids });
}
export const simBqSegundos = (E, agora) => !E || !E.simBq ? 0 : E.simBq.parado != null ? E.simBq.parado : Math.max(0, (agora - E.simBq.inicio) / 1000);
export function simBqNoTempo(E, agora) {
  if (!E || !E.simBq) return null;
  const L = linhaDoTempoBq(E.simBq.seed), t = simBqSegundos(E, agora);
  const atl = {}; BQ_LAR.forEach(([n, nome], i) => atl["sbq-a" + n] = { nome, num: n, cap: i === 0 }); BQ_AZU.forEach(([n, nome], i) => atl["sbq-b" + n] = { nome, num: n, cap: i === 0 });
  const periodos = L.quartos.map(n => ({ n, a: 0, b: 0 })), stats = {}, ev = [];
  const qi = Math.min(L.quartos.length - 1, Math.floor(t / (SEG_Q / VEL + PAUSA))), dentro = t - qi * (SEG_Q / VEL + PAUSA);
  let ultimo = 0;
  L.out.forEach(o => { if (o.t > t) return; ultimo = Math.max(ultimo, o.t);
    if (o.e.pts) { const [aid, v, l] = o.e.pts, p = periodos.find(x => x.n === o.q); p[l] += v; const st = stats[aid] || (stats[aid] = { p: 0, b: 0, as: 0 }); st.p += v; st["c" + v] = (st["c" + v] || 0) + 1; }
    else ev.push(o.e); });
  const fim = t >= L.fimT - PAUSA, dur = /^P/.test(L.quartos[qi]) ? 300 : SEG_Q;
  const rest = fim ? 0 : Math.max(0, Math.round(dur - dentro * VEL)), p24 = Math.max(0, 24 - Math.round((t - ultimo) * VEL) % 25);
  const pausa = E.simBq.parado != null;
  return { id: "simbq", a: "A", b: "B", status: fim ? "encerrado" : "andamento", periodos, stats, simAtl: atl, capitaes: { a: "sbq-a4", b: "sbq-b4" },
    mesa: { q: L.quartos[qi], ini: L.ini, salto: L.salto, ev, pend: null, rel: { rest, rod: false, p: p24, em: agora } }, simPausado: pausa, simFim: fim };
}

/* ---------- simulação: funções puras (usadas pelo app e pelo placar.html) ---------- */
const SIM_AZUL = [["4", "Marcos"], ["3", "Paulo"], ["1", "Diego"], ["2", "Rafael"], ["5", "Lucas"], ["6", "Bruno"], ["7", "Caio"], ["8", "Tiago"]];
const SIM_VERM = [["3", "André"], ["4", "Felipe"], ["2", "Gustavo"], ["1", "Renato"], ["5", "Vitor"], ["6", "Igor"], ["7", "Murilo"], ["8", "Otávio"]];
export function novaSim() {
  const atl = {}, el = { a: [], b: [] };
  [["a", SIM_AZUL], ["b", SIM_VERM]].forEach(([l, lista]) => lista.forEach(([n, nome]) => { const id = "sim-" + l + n; atl[id] = { nome, num: Number(n), ...(n === (l === "a" ? "4" : "3") ? { cap: true } : {}) }; el[l].push(id); }));
  // formação igual à ilustração: azul 4 no saque, 3 fundo, 1 rede esq., 2 rede dir.; vermelha 3 no saque, 4 fundo, 2 rede esq., 1 rede dir.
  return { id: "sim", a: "A", b: "B", status: "andamento", sets: [{ a: 0, b: 0 }],
    rodizio: { toucaA: "azul", atl, elenco: el, sets: [{ ladoA: "esq", saque: "a", pos: { a: el.a.slice(0, 4), b: el.b.slice(0, 4) }, ev: [] }] } };
}
// um ponto para o lado l; devolve { sim (novo) | null, msg }
export function simPonto(esporte, simIn, l) {
  if (C.resultado(esporte, simIn).fim) return { sim: null, msg: "Fim da simulação. Toque em Recomeçar para jogar de novo." };
  const sim = JSON.parse(JSON.stringify(simIn)), i = sim.sets.length - 1, st = sim.sets[i];
  let msg = "";
  st[l] = (st[l] || 0) + 1;
  R.registrarPonto(sim, i, l, 1);
  if (C.setFechado(st.a, st.b, i)) {
    const r = C.resultado(esporte, sim);
    if (r.fim) { sim.status = "encerrado"; msg = "Fim da simulação: vitória da " + (r.venc === "A" ? "Equipe Azul" : "Equipe Vermelha") + "."; }
    else { // novo set: trocam de lado, saca quem não sacou no início do set anterior, mesma formação inicial
      const ant = sim.rodizio.sets[i];
      sim.sets.push({ a: 0, b: 0 });
      sim.rodizio.sets.push({ ladoA: R.estado(sim.rodizio, i).ladoA === "esq" ? "dir" : "esq", saque: R.outro(ant.saque), pos: { a: [...ant.pos.a], b: [...ant.pos.b] }, ev: [] });
      msg = "Fim do set " + (i + 1) + ". As equipes trocaram de lado.";
    }
  } else if (i === 2 && st[l] === 8 && st[R.outro(l)] < 8) msg = "Tiebreak: 8 pontos! As equipes trocaram de lado.";
  return { sim, msg };
}
export const simPassos = (E, agora) => E && E.simAuto ? Math.max(0, Math.floor((agora - E.simAuto.inicio) / (E.simAuto.intervalo || 3000))) : 0;
// estado da simulação agora: com automático ligado, aplica os pontos sorteados desde o início (mesmo sorteio em todas as telas)
export function simNoTempo(esporte, E, agora) {
  if (!E || !E.sim) return null;
  if (!E.simAuto || !E.simAuto.base) return E.sim;
  let sim = E.simAuto.base, seed = (E.simAuto.seed >>> 0) || 1;
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const n = Math.min(simPassos(E, agora), 400);
  for (let k = 0; k < n; k++) {
    const est = R.estado(sim.rodizio, sim.rodizio.sets.length - 1), sac = est ? est.saque : "a";
    const r = simPonto(esporte, sim, rnd() < 0.55 ? sac : R.outro(sac));
    if (!r.sim) break; sim = r.sim;
  }
  return sim;
}

// placar para o histórico: sets (ou pontos) e, se o jogo não terminou, o set em andamento
const txtPlacar = p => !p ? null : p.grande.join(" x ") + (!p.fim && p.rotGrande === "Sets" && (p.atual[0] || p.atual[1]) ? " (" + p.atual.join("-") + " no " + p.rotAtual + ")" : "");

export function montarAoVivo(ctx) {
  const h = ctx.h || hLocal, MANUAL = !!ctx.placarManual;
  const { db, toast, esporte, col } = ctx, { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc } = ctx.fs;
  const APP = ctx.app, refEstado = doc(db, "ao_vivo", APP), podeEditar = () => ctx.podeEditar();
  const padrao = { ...(ctx.canal || {}) };
  let E = null, carregou = false, hist = [], jogo = null, unsubJogo = null, jogoChave = "";
  let rasc = null, verCanal = false, histAberto = null, editHist = null, editCanal = false, ytPlayer = null;
  let srcAtual = "", painelSujo = true, chaveEditor = "";

  // elementos persistentes: o player não pode ser recriado a cada ponto (o vídeo recarregaria)
  const sec = h("section", { class: "t-col av" });
  const boxTopo = h("div", { class: "t-col" });
  const boxPlayer = h("div", { class: "av-player", hidden: true });
  const boxDin = h("div", { class: "t-col" });
  const boxEditor = h("div", { class: "t-col" });
  sec.append(boxTopo, boxPlayer, boxDin, boxEditor);

  const canalId = () => (E && E.canalId) || padrao.id || "";
  const canalHandle = () => (E && E.canalHandle != null ? E.canalHandle : padrao.handle) || "";
  const linkCanal = () => canalHandle() ? "https://www.youtube.com/@" + canalHandle() : canalId() ? "https://www.youtube.com/channel/" + canalId() : "";
  const linkLive = () => E && E.videoId ? "https://www.youtube.com/watch?v=" + E.videoId : canalHandle() ? "https://www.youtube.com/@" + canalHandle() + "/live" : canalId() ? "https://www.youtube.com/channel/" + canalId() + "/live" : "";
  const igUser = () => ((E && E.igUsuario) || ctx.instagram || "").replace(/^@/, "");
  const urlPlacar = () => { try { return new URL("placar.html?app=" + APP, location.href).href; } catch (e) { return "placar.html?app=" + APP; } };

  onSnapshot(refEstado, s => { const antes = !!(E && E.aoVivo); E = s.exists() ? s.data() : null; if (antes !== !!(E && E.aoVivo) && ctx.mudouVivo) setTimeout(ctx.mudouVivo, 0); carregou = true; painelSujo = true; seguirJogo(); atualizar(); }, e => { console.error(e); carregou = true; atualizar(); });
  // outro app com o mesmo canal (ex.: Mococa LMB usa o canal da Liga): se aqui não tiver canal, usa o de lá
  if (ctx.canalDe) onSnapshot(doc(db, "ao_vivo", ctx.canalDe), s => { const d = s.exists() ? s.data() : {}; if (d.canalId) padrao.id = d.canalId; if (d.canalHandle) padrao.handle = d.canalHandle; painelSujo = true; atualizar(); }, () => {});
  onSnapshot(collection(db, "ao_vivo", APP, "historico"), s => { hist = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.inicio || 0) - (a.inicio || 0)); atualizar(); }, e => console.error(e));

  function seguirJogo() {
    const k = E && E.torneioId && E.jogoId ? (E.col || col) + "/" + E.torneioId + "/" + E.jogoId : "";
    if (k === jogoChave) return;
    jogoChave = k; if (unsubJogo) unsubJogo(); unsubJogo = null; jogo = null;
    if (k) unsubJogo = onSnapshot(doc(db, E.col || col, E.torneioId, "jogos", E.jogoId), s => { jogo = s.exists() ? { id: s.id, ...s.data() } : null; atualizar(); }, e => console.error(e));
  }

  /* ---------- player do YouTube ---------- */
  function srcDesejado() {
    if (!E || !E.aoVivo) return verCanal && canalId() ? "https://www.youtube.com/embed/live_stream?channel=" + canalId() + "&enablejsapi=1&playsinline=1" : "";
    if (E.videoId) return "https://www.youtube.com/embed/" + E.videoId + "?enablejsapi=1&playsinline=1&autoplay=1&mute=1";
    return canalId() ? "https://www.youtube.com/embed/live_stream?channel=" + canalId() + "&enablejsapi=1&playsinline=1&autoplay=1&mute=1" : "";
  }
  // a chave inclui o início da transmissão: começar uma nova transmissão sempre recarrega o player
  const chavePlayer = src => src ? src + "|" + ((E && E.aoVivo && E.inicio) || "") + "|" + recarregas : "";
  let recarregas = 0, tentativa = null;
  function recarregarPlayer() { recarregas++; srcAtual = "-"; atualizarPlayer(); }
  function atualizarPlayer() {
    const src = srcDesejado(), k = chavePlayer(src);
    if (k === srcAtual) return;
    srcAtual = k; ytPlayer = null; boxPlayer.textContent = ""; clearTimeout(tentativa);
    boxPlayer.hidden = !src;
    if (!src) return;
    const fr = h("iframe", { src, title: "Transmissão no YouTube", allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: true, referrerpolicy: "strict-origin-when-cross-origin" });
    boxPlayer.append(fr);
    if (E && E.aoVivo && !E.videoId) vigiarLive(fr, k);
  }
  // "live atual do canal": o YouTube decide o vídeo quando o player carrega. Se ainda não havia live,
  // o player fica vazio; então conferimos e recarregamos a cada 20 s até a live aparecer.
  // O editor também guarda o código do vídeo (vai para o histórico).
  function vigiarLive(fr, k) {
    const usar = () => { try {
      ytPlayer = new window.YT.Player(fr, { events: { onReady: ev => { let n = 0; const t = setInterval(() => {
        n++; let vid = ""; try { vid = (ev.target.getVideoData() || {}).video_id || ""; } catch (e) {}
        if (srcAtual !== k) { clearInterval(t); return; }
        if (vid) { clearInterval(t); if (E && E.aoVivo && !E.videoId && !E.videoIdAuto && podeEditar()) updateDoc(refEstado, { videoIdAuto: vid }).catch(() => {}); return; }
        if (n >= 4) { clearInterval(t); tentativa = setTimeout(() => { if (srcAtual === k && sec.isConnected && E && E.aoVivo && !E.videoId) recarregarPlayer(); }, 20000); }
      }, 1500); } } });
    } catch (e) {} };
    if (window.YT && window.YT.Player) return usar();
    const ant = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { if (ant) ant(); usar(); };
    if (!document.getElementById("yt-api")) document.head.append(h("script", { id: "yt-api", src: "https://www.youtube.com/iframe_api" }));
  }

  /* ---------- telas ---------- */
  function tela() { atualizar(true); return sec; }
  function atualizar(forcar) {
    if (!forcar && !sec.isConnected) return;
    boxTopo.textContent = ""; boxDin.textContent = "";
    if (!carregou) { boxTopo.append(h("div", { class: "t-card" }, h("p", { class: "cap", text: "Carregando…" }))); return; }
    boxTopo.append(cabecalho());
    atualizarPlayer();
    if (E && E.aoVivo && !srcAtual) boxDin.append(h("div", { class: "t-card" }, h("p", { class: "cap", text: "O canal do YouTube ainda não foi cadastrado no app." }), linkLive() && h("a", { class: "av-btn", href: linkLive(), target: "_blank", rel: "noopener" }, "Assistir no YouTube")));
    if (E && E.aoVivo && E.simBq) { jogo = simBqNoTempo(E, Date.now()); boxDin.append(cartaoPlacar()); if (podeEditar()) boxDin.append(controlesSimBq()); }
    else if (!MANUAL && E && E.aoVivo && E.sim) { jogo = simAtual(); boxDin.append(cartaoPlacar()); if (podeEditar()) boxDin.append(controlesSim()); }
    else if (MANUAL && E && E.aoVivo && E.manual) { jogo = jogoManual(E.manual); boxDin.append(cartaoPlacar()); if (podeEditar()) boxDin.append(controlesPlacar()); }
    else if (E && E.jogoId) boxDin.append(cartaoPlacar());
    if (E && E.aoVivo && E.igAtivo && igUser()) boxDin.append(h("a", { class: "av-btn av-ig", href: "https://www.instagram.com/" + igUser() + "/live/", target: "_blank", rel: "noopener" }, "● Ao vivo também no Instagram @" + igUser()));
    boxDin.append(cartaoHistorico());
    const { T: tA, js: jA } = jogosDisponiveis(), chave = podeEditar() + "|" + (tA ? tA.id : "") + "|" + jA.map(j => j.id).join(",");
    if (chave !== chaveEditor) { chaveEditor = chave; painelSujo = true; }
    if (painelSujo) { painelSujo = false; boxEditor.textContent = ""; if (podeEditar()) boxEditor.append(E && E.aoVivo && (E.sim || E.simBq) ? null : painelEditor(), !MANUAL && esporte === "biribol" && !(E && E.aoVivo && E.sim) ? cartaoSim() : null, esporte !== "biribol" && !(E && E.aoVivo && E.simBq) ? cartaoSimBq() : null, cartaoCanal(), cartaoOverlay()); }
  }

  function cabecalho() {
    const vivo = E && E.aoVivo;
    return h("div", { class: "t-card av-cab" + (vivo ? " on" : "") },
      h("div", { class: "t-linha t-entre" },
        h("span", { class: "av-sinal" + (vivo ? " on" : "") }, vivo ? "● AO VIVO" : "Fora do ar"),
        vivo && E.inicio && h("span", { class: "cap", text: "desde " + dataHora(E.inicio).slice(11) })),
      h("h3", { text: vivo ? (E.titulo || "Transmissão ao vivo") : "Nenhuma transmissão agora" }),
      !vivo && h("p", { class: "cap", text: "Quando o organizador começar uma transmissão, o vídeo e o placar aparecem aqui. As transmissões passadas ficam na lista abaixo." }),
      h("div", { class: "t-linha" },
        linkCanal() && h("a", { class: "av-btn ghost", href: vivo ? linkLive() : linkCanal(), target: "_blank", rel: "noopener" }, vivo ? "Abrir no YouTube" : "Canal no YouTube"),
        !vivo && canalId() && h("button", { type: "button", class: "ghost", onclick: () => { verCanal = !verCanal; atualizar(); } }, verCanal ? "Fechar player" : "Ver se o canal está ao vivo"),
        vivo && srcAtual && h("button", { type: "button", class: "ghost", onclick: () => { recarregarPlayer(); toast("Recarregando o vídeo…"); } }, "↻ Recarregar vídeo"),
        !vivo && igUser() && h("a", { class: "av-btn ghost", href: "https://www.instagram.com/" + igUser() + "/", target: "_blank", rel: "noopener" }, "Instagram @" + igUser())));
  }

  function cartaoPlacar() {
    const p = placarVivo(esporte, jogo);
    const nA = E.nomeA || "Equipe A", nB = E.nomeB || "Equipe B";
    if (!p) return h("div", { class: "t-card" }, h("p", { class: "cap", text: "Jogo em destaque: " + nA + " x " + nB + " (ainda sem placar)." }));
    const cls = lado => p.fim && p.venc ? (p.venc === (lado ? jogo.b : jogo.a) ? " venc" : " perd") : "";
    return h("div", { class: "t-card av-placar" },
      h("div", { class: "t-linha t-entre" }, h("span", { class: "t-sub", text: E.rotulo || "Placar" }), h("span", { class: "av-st" + (p.fim ? "" : " on"), text: p.fim ? "Encerrado" : jogo.status === "andamento" ? "Em andamento" : "Aguardando" })),
      h("div", { class: "av-pl" },
        h("b", { class: "av-eq" + cls(0), text: nA }),
        h("div", { class: "av-num" }, h("span", { text: p.grande[0] }), h("small", { text: p.rotGrande }), h("span", { text: p.grande[1] })),
        h("b", { class: "av-eq dir" + cls(1), text: nB })),
      !p.fim && !p.wo && h("div", { class: "av-atual" }, h("span", { text: p.atual[0] }), h("small", { text: p.rotAtual }), h("span", { text: p.atual[1] })),
      jogo.mrel && !p.fim && h("p", { class: "t-centro av-relm" }, "⏱ ", h("b", { class: "av-rel", "data-r": "j", text: BQ.fmtRel((BQ.relogioAgora({ rel: jogo.mrel }) || { rest: 0 }).rest) })),
      p.parciais.length > 0 && h("p", { class: "cap t-centro", text: (esporte === "biribol" ? "Sets: " : "") + p.parciais.join(" · ") }),
      rodizioVivo(nA, nB),
      mesaVivo(nA, nB),
      !MANUAL && ctx.abrirSumula && ctx.torneioId && ctx.torneioId() === E.torneioId && h("button", { type: "button", class: "ghost", onclick: () => ctx.abrirSumula(E.jogoId) }, podeEditar() ? "Abrir súmula (marcar pontos)" : "Ver súmula"));
  }

  // basquete: quadra com quem está em quadra, faltas, posse alternada, relógios e tempos (vem da mesa da súmula)
  function mesaVivo(nA, nB) {
    if (esporte === "biribol" || !jogo || !jogo.mesa) return null;
    const est = BQ.estado(jogo); if (!est) return null;
    const T = ctx.torneio ? ctx.torneio() : null, eqs = (T && T.equipes) || [], eq = id => eqs.find(e => e.id === id) || {};
    const num = id => { if (jogo.simAtl && jogo.simAtl[id]) return jogo.simAtl[id].num; for (const e of eqs) { const a = (e.atletas || []).find(x => x.id === id); if (a) return a.num; } return null; };
    const ra = BQ.relogioAgora(jogo.mesa), nomes = { a: nA, b: nB };
    const linha = l => { const fe = BQ.faltasEquipe(est, l), td = BQ.temposDisponiveis(est, l, est.q, ra ? ra.rest : null);
      return h("div", { class: "bq-lin", style: "--c:" + BQ.CORES[l].c }, h("span", { text: nomes[l] }), h("span", { class: "bq-dots" }, [0, 1, 2, 3, 4].map(i => h("i", { class: i < fe ? (i >= 4 ? "on pen" : "on") : "" }))),
        h("b", { class: fe >= 4 ? "bq-pen" : "", text: fe >= 4 ? "PENALIDADE" : fe + " falta(s)" }), h("small", { text: "· " + td + " tempo(s)" })); };
    return h("div", { class: "rz bq rz-vivo" },
      h("div", { class: "bq-rel" }, h("div", { class: "bq-relj" }, h("small", { text: BQ.nomeQ(est.q) }), h("b", { class: "av-rel", "data-r": "j", text: ra ? BQ.fmtRel(ra.rest) : "–" })),
        h("div", { class: "bq-rel24" }, h("small", { text: "Posse" }), h("b", { class: "av-rel", "data-r": "p", text: ra ? ra.p : "–" }))),
      h("div", { class: "rz-box bq-box" }, BQ.quadra({ est, num, nomes, capitaes: jogo.capitaes || { a: eq(jogo.a).capitao, b: eq(jogo.b).capitao } })),
      h("div", { class: "bq-eq" }, linha("a"), linha("b"), est.seta && h("p", { class: "cap", text: "Posse alternada: " + nomes[est.seta] })));
  }
  // relógios da mesa andando na tela de quem assiste
  setInterval(() => { if (!jogo || !(jogo.mesa || jogo.mrel)) return; const els = document.querySelectorAll(".av-rel"); if (!els.length) return; const ra = BQ.relogioAgora(jogo.mesa || { rel: jogo.mrel }); if (!ra) return;
    els.forEach(e => { e.textContent = e.dataset.r === "j" ? BQ.fmtRel(ra.rest) : ra.p; }); }, 1000);
  // piscina com o rodízio (quando o mesário cadastrou a formação na súmula)
  function rodizioVivo(nA, nB) {
    const rz = jogo && jogo.rodizio; if (!rz || esporte !== "biribol") return null;
    const iSet = Math.max(0, (jogo.sets || []).length - 1), i = R.setComFormacao(rz, iSet); if (i < 0) return null;
    const est = R.estado(rz, i), nomes = { a: nA, b: nB };
    return h("div", { class: "rz rz-vivo" }, h("div", { class: "rz-box" }, R.piscina({ rz, est, nomes, chave: "vivo:" + jogo.id + ":" + i })), R.legenda(h, rz, est, nomes));
  }

  function cartaoHistorico() {
    const w = h("div", { class: "t-card" }, h("h3", { text: "Transmissões passadas" }));
    if (!hist.length) { w.append(h("p", { class: "cap", text: "Nenhuma ainda. Ao encerrar uma transmissão, ela entra aqui com o placar final." })); return w; }
    const lista = h("div", { class: "av-hist" });
    hist.forEach(x => {
      const aberto = histAberto === x.id && x.videoId;
      const item = h("div", { class: "av-hi" },
        aberto ? h("div", { class: "av-player" }, h("iframe", { src: "https://www.youtube.com/embed/" + x.videoId + "?playsinline=1&autoplay=1", title: x.titulo || "Transmissão", allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: true }))
          : h("button", { type: "button", class: "av-thumb", disabled: !x.videoId, onclick: () => { histAberto = x.id; atualizar(); } },
            x.videoId ? h("img", { src: "https://i.ytimg.com/vi/" + x.videoId + "/hqdefault.jpg", alt: "", loading: "lazy" }) : h("span", { class: "cap", text: "sem vídeo" }),
            x.videoId && h("span", { class: "av-play", text: "▶" })),
        h("div", { class: "av-hi-txt" },
          h("b", { text: x.titulo || "Transmissão" }),
          h("span", { class: "cap", text: dataHora(x.inicio) + (x.rotulo ? " · " + x.rotulo : "") }),
          x.nomeA && h("span", { text: x.nomeA + " " + (x.placar || "x") + " " + x.nomeB }),
          h("div", { class: "t-linha" },
            x.videoId && h("a", { class: "av-link", href: "https://www.youtube.com/watch?v=" + x.videoId, target: "_blank", rel: "noopener" }, "YouTube"),
            podeEditar() && h("button", { type: "button", class: "ghost mini", onclick: () => { editHist = editHist === x.id ? null : x.id; atualizar(); } }, "Editar"),
            podeEditar() && h("button", { type: "button", class: "ghost mini", onclick: ev => { const tirar = () => deleteDoc(doc(db, "ao_vivo", APP, "historico", x.id)).catch(() => toast("Não deu para apagar."));
              if (ctx.perguntar) return ctx.perguntar("Tirar \"" + (x.titulo || "Transmissão") + "\" da lista? O vídeo continua no YouTube.", tirar, "Tirar da lista");
              const b = ev.currentTarget; if (b.dataset.armado) return tirar(); b.dataset.armado = "1"; b.textContent = "Confirmar"; setTimeout(() => { delete b.dataset.armado; b.textContent = "Tirar"; }, 4000); } }, "Tirar")),
          editHist === x.id && formHist(x)));
      lista.append(item);
    });
    w.append(lista); return w;
  }
  function formHist(x) {
    const f = h("form", { class: "t-form t-col", onsubmit: async e => {
      e.preventDefault();
      const link = f.querySelector(".hv").value, vid = lerVideo(link);
      if (link.trim() && !vid) { toast("Não reconheci esse link do YouTube."); return; }
      try { await updateDoc(doc(db, "ao_vivo", APP, "historico", x.id), { titulo: f.querySelector(".ht").value.trim() || "Transmissão", videoId: vid || null }); editHist = null; atualizar(); }
      catch (er) { console.error(er); toast("Não deu para salvar."); }
    } },
      h("label", { class: "t-lbl" }, "Título", h("input", { class: "ht", value: x.titulo || "" })),
      h("label", { class: "t-lbl" }, "Link do vídeo no YouTube", h("input", { class: "hv", value: x.videoId ? "https://youtu.be/" + x.videoId : "", placeholder: "https://youtu.be/…" })),
      h("button", { type: "submit" }, "Salvar"));
    return f;
  }

  /* ---------- organizador / editores ---------- */
  function jogosDisponiveis() {
    const T = ctx.torneio(), js = (ctx.jogos() || []).filter(j => j.a && j.b && !j.wo && !j.previsto);
    const ordem = j => j.status === "andamento" ? 0 : j.status === "encerrado" ? 2 : 1;
    return { T, js: js.sort((a, b) => ordem(a) - ordem(b) || (a.etapa || 0) - (b.etapa || 0) || (a.ordem || 0) - (b.ordem || 0)) };
  }
  function painelEditor() {
    const vivo = E && E.aoVivo, { T, js } = jogosDisponiveis();
    if (!rasc || rasc.vivo !== !!vivo) rasc = { vivo: !!vivo, titulo: vivo ? E.titulo || "" : (T ? T.nome : ""), jogoId: E && E.jogoId && E.torneioId === (T && T.id) ? E.jogoId : (js[0] && js[0].status === "andamento" ? js[0].id : ""), link: vivo && E.videoId ? "https://youtu.be/" + E.videoId : "", ig: vivo ? !!E.igAtivo : false, igUser: igUser(),
      nomeA: E && E.manual && E.manual.nomeA || "Time A", nomeB: E && E.manual && E.manual.nomeB || "Time B", rotulo: vivo && E.rotulo || ctx.rotuloManual || "Rachão" };
    const nome = id => (T && T.equipes.find(e => e.id === id) || {}).nome || "—";
    const f = h("form", { class: "t-card t-form", onsubmit: e => { e.preventDefault(); iniciar(T, js); } },
      h("h3", { text: vivo ? "Transmissão no ar" : "Começar transmissão" }),
      !vivo && h("p", { class: "cap", text: "1) Comece a live no YouTube (celular, Streamlabs, Prism ou OBS). 2) Aqui, escolha o jogo e toque em Começar: todos veem o vídeo e o placar da súmula no app." }),
      h("label", { class: "t-lbl" }, "Título", h("input", { id: "av-tit", value: rasc.titulo, oninput: e => rasc.titulo = e.target.value, placeholder: "Ex.: 5ª etapa · Final" })),
      MANUAL && ctx.rotulosManual && h("div", { class: "chips" }, ctx.rotulosManual.map(r => h("button", { type: "button", "aria-pressed": String(rasc.rotulo === r), onclick: () => { rasc.rotulo = r; painelSujo = true; atualizar(); } }, r))),
      MANUAL && ctx.sugestoes && rasc.rotulo === "Amistoso" && (() => { const sg = ctx.sugestoes() || []; return sg.length ? h("div", { class: "t-linha" }, sg.map(x => h("button", { type: "button", class: "ghost t-mini", onclick: () => { rasc.nomeA = x.nomeA; rasc.nomeB = x.nomeB; rasc.titulo = x.titulo || rasc.titulo; painelSujo = true; atualizar(); } }, "🆚 " + x.nomeB + (x.quando ? " · " + x.quando : "")))) : h("p", { class: "cap", text: "Nenhum amistoso cadastrado: crie a lista do amistoso na aba Treino ou digite os times abaixo." }); })(),
      MANUAL && h("div", { class: "av-times" },
        h("label", { class: "t-lbl" }, "Time A", h("input", { id: "av-na", value: rasc.nomeA, oninput: e => rasc.nomeA = e.target.value, placeholder: "Time A", maxlength: 30 })),
        h("label", { class: "t-lbl" }, "Time B", h("input", { id: "av-nb", value: rasc.nomeB, oninput: e => rasc.nomeB = e.target.value, placeholder: "Time B", maxlength: 30 }))),
      MANUAL && h("p", { class: "cap", text: "O placar é marcado aqui mesmo, com os botões que aparecem acima quando a transmissão está no ar" + (esporte === "biribol" ? "." : " (+1, +2, +3, quartos e relógio).") }),
      !MANUAL && h("label", { class: "t-lbl" }, "Jogo em destaque (placar ao vivo)",
        h("select", { id: "av-jogo", onchange: e => rasc.jogoId = e.target.value },
          h("option", { value: "", selected: !rasc.jogoId }, "Nenhum (só o vídeo)"),
          js.map(j => h("option", { value: j.id, selected: rasc.jogoId === j.id }, (j.status === "andamento" ? "● " : j.status === "encerrado" ? "✓ " : "") + nome(j.a) + " x " + nome(j.b) + " — " + rotuloJogo(T, j))))),
      h("label", { class: "t-lbl" }, "Link da live no YouTube (opcional)", h("input", { id: "av-link", value: rasc.link, oninput: e => rasc.link = e.target.value, placeholder: "Vazio = live atual do canal" })),
      h("label", { class: "t-chk" }, h("input", { type: "checkbox", checked: rasc.ig, onchange: e => { rasc.ig = e.target.checked; painelSujo = true; atualizar(); } }), "Também ao vivo no Instagram"),
      rasc.ig && h("label", { class: "t-lbl" }, "Perfil do Instagram", h("input", { id: "av-ig", value: rasc.igUser, oninput: e => rasc.igUser = e.target.value, placeholder: "usuario" })),
      h("div", { class: "t-linha" },
        h("button", { type: "submit" }, vivo ? "Atualizar" : "Começar transmissão"),
        vivo && h("button", { type: "button", class: "danger", onclick: ev => { if (ctx.perguntar) return ctx.perguntar("Encerrar a transmissão? Ela vai para a lista de transmissões passadas.", encerrar, "Encerrar");
          const b = ev.currentTarget; if (b.dataset.armado) return encerrar(); b.dataset.armado = "1"; b.textContent = "Toque de novo para encerrar"; setTimeout(() => { delete b.dataset.armado; b.textContent = "Encerrar transmissão"; }, 4000); } }, "Encerrar transmissão")),
      vivo && !E.videoId && h("p", { class: "cap", text: E.videoIdAuto ? "Vídeo da live identificado: ele entra no histórico ao encerrar." : "Dica: cole o link da live para o histórico guardar o vídeo certo (ou abra esta aba durante a live para o app identificar sozinho)." }));
    return f;
  }
  async function iniciar(T, js) {
    const link = rasc.link.trim(), vid = lerVideo(link);
    if (link && !vid) { toast("Não reconheci esse link do YouTube."); return; }
    if (!canalId() && !vid) toast("Cadastre o canal do YouTube (abaixo) ou cole o link da live para o vídeo aparecer.");
    const j = js.find(x => x.id === rasc.jogoId), nome = id => (T && T.equipes.find(e => e.id === id) || {}).nome || "";
    const vivoAntes = E && E.aoVivo;
    const d = {
      aoVivo: true, titulo: rasc.titulo.trim() || (T ? T.nome : MANUAL ? (ctx.rotuloManual || "Rachão") + " " + dataHora(Date.now()).slice(0, 5) : "Transmissão ao vivo"), videoId: vid || null,
      inicio: vivoAntes && E.inicio ? E.inicio : Date.now(), igAtivo: !!rasc.ig, igUsuario: (rasc.igUser || "").replace(/^@/, "").trim(),
      col, torneioId: j && T ? T.id : null, torneioNome: j && T ? T.nome : null, jogoId: j ? j.id : null,
      nomeA: j ? nome(j.a) : null, nomeB: j ? nome(j.b) : null, rotulo: j ? rotuloJogo(T, j) : null, esporte,
      marca: ctx.marca || null, autor: ctx.autor ? ctx.autor() || null : null, atualizado: Date.now()
    };
    if (!vivoAntes) d.videoIdAuto = null;
    d.sim = null; d.simBq = null;
    if (MANUAL) {
      const nA = (rasc.nomeA || "").trim() || "Time A", nB = (rasc.nomeB || "").trim() || "Time B", rot = rasc.rotulo || ctx.rotuloManual || "Rachão";
      const ant = vivoAntes && E.manual ? E.manual : null;
      Object.assign(d, { nomeA: nA, nomeB: nB, rotulo: rot, torneioId: null, jogoId: null,
        manual: esporte === "biribol" ? { nomeA: nA, nomeB: nB, sets: ant && ant.sets ? ant.sets : [{ a: 0, b: 0 }] }
          : { nomeA: nA, nomeB: nB, periodos: ant && ant.periodos ? ant.periodos : Q4(), q: ant && ant.q || "1Q", rel: ant && ant.rel || { rest: 600, rod: false, em: Date.now() }, fim: false } });
      if (!rasc.titulo.trim()) d.titulo = rot + (rot === "Amistoso" ? " · " + nA + " x " + nB : " " + dataHora(Date.now()).slice(0, 5));
    }
    try { await setDoc(refEstado, d, { merge: true }); toast(vivoAntes ? "Transmissão atualizada." : "Transmissão no ar no app."); rasc = null; painelSujo = true; }
    catch (e) { console.error(e); toast("Não deu para salvar. Verifique se você está logado como editor."); }
  }
  async function encerrar() {
    if (!E) return;
    const p = placarVivo(esporte, MANUAL && E.manual ? jogoManual(E.manual) : jogo);
    const item = { titulo: E.titulo || "Transmissão", videoId: E.videoId || E.videoIdAuto || null, inicio: E.inicio || Date.now(), fim: Date.now(),
      rotulo: E.rotulo || null, nomeA: E.nomeA || null, nomeB: E.nomeB || null, placar: txtPlacar(p), torneioNome: E.torneioNome || null, canalId: canalId() || null };
    try {
      await setDoc(doc(db, "ao_vivo", APP, "historico", "v" + item.inicio), item);
      await updateDoc(refEstado, { aoVivo: false, videoId: null, videoIdAuto: null, igAtivo: false, fim: Date.now() });
      rasc = null; painelSujo = true; toast("Transmissão encerrada e guardada na lista.");
    } catch (e) { console.error(e); toast("Não deu para encerrar. Verifique se você está logado como editor."); }
  }

  /* ---------- simulação (teste do placar e do rodízio sem jogo real) ---------- */
  // O automático não depende deste aparelho ficar aberto: grava só { inicio, seed, base } e cada tela
  // (app e placar da live) calcula sozinha os pontos pelo relógio (simNoTempo).
  const simAtual = () => (E && E.sim ? simNoTempo(esporte, E, Date.now()) : null);
  let simN = -1;
  setInterval(() => { if (!E || !E.aoVivo || !E.simAuto || !sec.isConnected) return; const n = simPassos(E, Date.now()); if (n !== simN) { simN = n; atualizar(); } }, 1000);
  function cartaoSim() {
    return h("div", { class: "t-card t-form" },
      h("h3", { text: "Testar sem jogo real" }),
      E && E.aoVivo && h("p", { class: "cap", text: "Há uma transmissão marcada como no ar: a simulação toma o lugar dela (o jogo em destaque sai do ar até você começar de novo)." }),
      h("p", { class: "cap", text: "Cria uma partida de simulação (Equipe Azul x Equipe Vermelha, já com a formação confirmada) e coloca no ar aqui e no placar da live (Prism/Streamlabs/OBS). Nada entra no torneio nem no histórico." }),
      h("button", { type: "button", onclick: async () => {
        try { await setDoc(refEstado, { aoVivo: true, titulo: "Teste de transmissão", inicio: Date.now(), videoId: null, videoIdAuto: null, igAtivo: false, col, torneioId: null, jogoId: null, torneioNome: null,
          nomeA: "Equipe Azul", nomeB: "Equipe Vermelha", rotulo: "Simulação", esporte, marca: ctx.marca || null, manual: null, sim: novaSim(), simAuto: null, atualizado: Date.now() }, { merge: true });
          rasc = null; painelSujo = true; toast("Simulação no ar. Marque pontos ou ligue o automático."); }
        catch (e) { console.error(e); toast("Não deu para começar. Verifique se você está logado como editor."); }
      } }, "Simular partida"));
  }
  // ----- simulação do basquete -----
  setInterval(() => { if (!E || !E.aoVivo || !E.simBq || E.simBq.parado != null || !sec.isConnected) return; atualizar(); }, 1000);
  function cartaoSimBq() {
    return h("div", { class: "t-card t-form" },
      h("h3", { text: "Testar sem jogo real" }),
      E && E.aoVivo && h("p", { class: "cap", text: "Há uma transmissão marcada como no ar: a simulação toma o lugar dela até você começar outra." }),
      h("p", { class: "cap", text: "Simula um jogo completo (Equipe Laranja x Equipe Azul) em tempo acelerado: cada quarto dura cerca de 1 minuto, com cestas de 2 e de 3, faltas, lances livres, BÔNUS, tempos, substituições e posse alternada. Aparece aqui e no placar da live (Prism/Streamlabs/OBS). Nada entra no torneio." }),
      h("button", { type: "button", onclick: async () => {
        try { await setDoc(refEstado, { aoVivo: true, titulo: "Teste de transmissão", inicio: Date.now(), videoId: null, videoIdAuto: null, igAtivo: false, col, torneioId: null, jogoId: null, torneioNome: null,
          nomeA: "Equipe Laranja", nomeB: "Equipe Azul", rotulo: "Simulação", esporte, marca: ctx.marca || null, manual: null, sim: null, simAuto: null,
          simBq: { inicio: Date.now(), seed: Math.floor(Math.random() * 1e9), parado: null }, atualizado: Date.now() }, { merge: true });
          rasc = null; painelSujo = true; toast("Simulação no ar: o jogo anda sozinho (1 quarto ≈ 1 minuto)."); }
        catch (e) { console.error(e); toast("Não deu para começar. Verifique se você está logado como editor."); }
      } }, "Simular partida"));
  }
  async function salvarSimBq(simBq) { E.simBq = simBq; atualizar(); try { await setDoc(refEstado, { simBq, atualizado: Date.now() }, { merge: true }); } catch (e) { console.error(e); toast("Não deu para salvar a simulação."); } }
  function controlesSimBq() {
    const sb = E.simBq, parado = sb.parado != null, j = jogo, fim = j && j.simFim;
    return h("div", { class: "t-card av-ctl" },
      h("span", { class: "t-sub", text: "Simulação · " + (fim ? "fim de jogo" : parado ? "pausada" : "rodando (1 s = 10 s de jogo)") }),
      h("div", { class: "t-linha" },
        !fim && h("button", { type: "button", class: parado ? "" : "ghost", onclick: () => salvarSimBq(parado ? { ...sb, inicio: Date.now() - sb.parado * 1000, parado: null } : { ...sb, parado: simBqSegundos(E, Date.now()) }) }, parado ? "▶ Continuar" : "⏸ Pausar"),
        h("button", { type: "button", class: "ghost", onclick: () => salvarSimBq({ ...sb, parado: null, inicio: Date.now() - Math.min(simBqSegundos(E, Date.now()) + 65, 9999) * 1000 }) }, "Pular quarto ⏭"),
        h("button", { type: "button", class: "ghost", onclick: () => salvarSimBq({ inicio: Date.now(), seed: Math.floor(Math.random() * 1e9), parado: null }) }, "Recomeçar"),
        h("button", { type: "button", class: "danger", onclick: async () => {
          const p = placarVivo(esporte, jogo);
          const item = { titulo: E.titulo || "Teste de transmissão", videoId: E.videoId || E.videoIdAuto || null, inicio: E.inicio || Date.now(), fim: Date.now(), simulacao: true,
            rotulo: "Simulação", nomeA: E.nomeA || "Equipe Laranja", nomeB: E.nomeB || "Equipe Azul", placar: txtPlacar(p), torneioNome: null, canalId: canalId() || null };
          try {
            await setDoc(doc(db, "ao_vivo", APP, "historico", "v" + item.inicio), item);
            await setDoc(refEstado, { aoVivo: false, simBq: null, videoId: null, videoIdAuto: null, fim: Date.now() }, { merge: true });
            rasc = null; painelSujo = true; toast("Simulação encerrada e guardada nas transmissões passadas.");
          } catch (e) { console.error(e); toast("Não deu para encerrar."); }
        } }, "Encerrar simulação")),
      h("label", { class: "t-lbl" }, "Link da live no YouTube (opcional, para testar com live não listada)",
        h("div", { class: "t-linha av-linkrow" },
          h("input", { id: "av-simlinkbq", value: E.videoId ? "https://youtu.be/" + E.videoId : "", placeholder: "Vazio = live pública atual do canal" }),
          h("button", { type: "button", class: "ghost", onclick: async () => { const v = document.getElementById("av-simlinkbq").value.trim(), vid = lerVideo(v); if (v && !vid) { toast("Não reconheci esse link do YouTube."); return; }
            try { await setDoc(refEstado, { videoId: vid || null }, { merge: true }); srcAtual = "-"; toast(vid ? "Link da live salvo." : "Voltou para a live atual do canal."); } catch (e) { toast("Não deu para salvar."); } } }, "Usar link"))));
  }
  async function salvarSim(sim, extra) {
    E.sim = sim; E.simAuto = extra && "simAuto" in extra ? extra.simAuto : null; atualizar();
    try { await setDoc(refEstado, { sim, simAuto: E.simAuto, atualizado: Date.now() }, { merge: true }); } catch (e) { console.error(e); toast("Não deu para salvar a simulação."); }
  }
  function pontoSim(l) {
    const r = simPonto(esporte, simAtual(), l);
    if (r.msg) toast(r.msg);
    if (r.sim) salvarSim(r.sim); // marcar à mão para o automático
  }
  function desfazerSim() {
    const sim = JSON.parse(JSON.stringify(simAtual()));
    let i = sim.sets.length - 1;
    if (!(sim.sets[i].a || sim.sets[i].b) && i > 0) { sim.sets.pop(); sim.rodizio.sets.pop(); i--; }
    const ev = sim.rodizio.sets[i].ev, l = ev.pop(); if (!l) return;
    sim.sets[i][l] = Math.max(0, sim.sets[i][l] - 1); sim.status = "andamento";
    salvarSim(sim);
  }
  function controlesSim() {
    const sim = simAtual(), auto = !!E.simAuto, fim = C.resultado(esporte, sim).fim;
    const est = R.estado(sim.rodizio, sim.rodizio.sets.length - 1) || { saque: "a" };
    const bt = (l, nome, cor) => h("button", { type: "button", class: "rz-ponto", style: "--c:" + cor[0] + ";--e:" + cor[1], onclick: () => pontoSim(l) }, h("small", { text: est.saque === l ? "sacando" : "recebendo" }), "Ponto " + nome);
    return h("div", { class: "t-card av-ctl" },
      h("span", { class: "t-sub", text: "Simulação · marcar pontos" }),
      fim && h("p", { class: "cap", text: "Fim da simulação. Toque em Recomeçar para jogar de novo." }),
      h("div", { class: "rz-pts" }, (est.ladoA === "dir" ? [bt("b", "Vermelha", ["#d8262d", "#8f1218"]), bt("a", "Azul", ["#1f5fd1", "#123b8a"])] : [bt("a", "Azul", ["#1f5fd1", "#123b8a"]), bt("b", "Vermelha", ["#d8262d", "#8f1218"])])),
      h("div", { class: "t-linha" },
        h("button", { type: "button", class: auto ? "" : "ghost", onclick: () => {
          const atual = simAtual();
          if (auto) salvarSim(atual);
          else salvarSim(atual, { simAuto: { inicio: Date.now(), seed: Math.floor(Math.random() * 1e9), intervalo: 3000, base: atual } });
        } }, auto ? "⏸ Parar automático" : "▶ Pontos automáticos (a cada 3 s)"),
        h("button", { type: "button", class: "ghost", onclick: desfazerSim }, "Desfazer"),
        h("button", { type: "button", class: "ghost", onclick: () => salvarSim(novaSim()) }, "Recomeçar"),
        h("button", { type: "button", class: "danger", onclick: async () => {
          const p = placarVivo(esporte, simAtual());
          const item = { titulo: E.titulo || "Teste de transmissão", videoId: E.videoId || E.videoIdAuto || null, inicio: E.inicio || Date.now(), fim: Date.now(), simulacao: true,
            rotulo: "Simulação", nomeA: E.nomeA || "Equipe Azul", nomeB: E.nomeB || "Equipe Vermelha", placar: txtPlacar(p), torneioNome: null, canalId: canalId() || null };
          try {
            await setDoc(doc(db, "ao_vivo", APP, "historico", "v" + item.inicio), item);
            await setDoc(refEstado, { aoVivo: false, sim: null, simAuto: null, videoId: null, videoIdAuto: null, fim: Date.now() }, { merge: true });
            rasc = null; painelSujo = true; toast("Simulação encerrada e guardada nas transmissões passadas.");
          } catch (e) { console.error(e); toast("Não deu para encerrar."); }
        } }, "Encerrar simulação")),
      h("label", { class: "t-lbl" }, "Link da live no YouTube (opcional, para testar com live não listada)",
        h("div", { class: "t-linha av-linkrow" },
          h("input", { id: "av-simlink", value: E.videoId ? "https://youtu.be/" + E.videoId : "", placeholder: "Vazio = live pública atual do canal" }),
          h("button", { type: "button", class: "ghost", onclick: async () => {
            const txt = document.getElementById("av-simlink").value, vid = lerVideo(txt);
            if (txt.trim() && !vid) { toast("Não reconheci esse link do YouTube."); return; }
            try { await setDoc(refEstado, { videoId: vid || null }, { merge: true }); toast(vid ? "Vídeo da live atualizado." : "Usando a live atual do canal."); }
            catch (e) { console.error(e); toast("Não deu para salvar o link."); }
          } }, "Usar link"))),
      h("p", { class: "cap", text: auto ? "Automático ligado: os pontos continuam saindo na live mesmo com o app fechado ou em segundo plano." : "Ponto de quem saca: não roda. Ponto de quem recebe: roda e passa a sacar. Deixe o Prism aberto com o link do placar para ver tudo mudando na live." }));
  }

  // botões do placar manual (biribol: sets de 21/21/15 com 2 de vantagem, como na súmula)
  function controlesPlacar() {
    if (esporte !== "biribol") return controlesBasquete();
    const sets = () => (E.manual.sets || []).map(x => ({ a: x.a || 0, b: x.b || 0 }));
    const salvar = async novo => {
      E.manual = { ...E.manual, sets: novo }; atualizar();
      try { await setDoc(refEstado, { manual: { ...E.manual, sets: novo }, atualizado: Date.now() }, { merge: true }); } catch (e) { console.error(e); toast("Não deu para salvar o placar."); }
    };
    const mais = (lado, n) => {
      let ss = sets(); if (!ss.length) ss = [{ a: 0, b: 0 }];
      const r = C.resultado(esporte, { a: "A", b: "B", sets: ss });
      let i = ss.findIndex((x, k) => !C.setFechado(x.a, x.b, k));
      if (n > 0) {
        if (r.fim) { toast("Jogo encerrado. Toque em Novo jogo para começar outro."); return; }
        if (i < 0) { ss.push({ a: 0, b: 0 }); i = ss.length - 1; }
      } else {
        if (i < 0 || (!ss[i].a && !ss[i].b && i > 0)) { if (i > 0 && !ss[i].a && !ss[i].b) ss.splice(i, 1); i = ss.length - 1; }
        if (!ss[i][lado]) return;
      }
      ss[i] = { ...ss[i], [lado]: ss[i][lado] + n }; salvar(ss);
    };
    const nA = E.manual.nomeA || "Time A", nB = E.manual.nomeB || "Time B";
    return h("div", { class: "t-card av-ctl" },
      h("span", { class: "t-sub", text: "Marcar pontos" }),
      h("div", { class: "av-ctl-g" },
        h("button", { type: "button", class: "av-mais", onclick: () => mais("a", 1) }, "+1 " + nA),
        h("button", { type: "button", class: "av-mais", onclick: () => mais("b", 1) }, "+1 " + nB),
        h("button", { type: "button", class: "ghost", onclick: () => mais("a", -1) }, "−1 " + nA),
        h("button", { type: "button", class: "ghost", onclick: () => mais("b", -1) }, "−1 " + nB)),
      h("button", { type: "button", class: "ghost", onclick: ev => { const b = ev.currentTarget; if (!b.dataset.armado) { b.dataset.armado = "1"; b.textContent = "Toque de novo para zerar"; setTimeout(() => { delete b.dataset.armado; b.textContent = "Novo jogo (zerar placar)"; }, 4000); return; } salvar([{ a: 0, b: 0 }]); } }, "Novo jogo (zerar placar)"));
  }

  // basquete à mão (rachão/amistoso): +1/+2/+3, quartos de 10 min (prorrogação de 5), relógio que anda sozinho na live
  function controlesBasquete() {
    const m = E.manual, ps = (m.periodos || Q4()).map(x => ({ ...x })), q = m.q || "1Q", nA = m.nomeA || "Time A", nB = m.nomeB || "Time B";
    const ra = BQ.relogioAgora({ rel: m.rel || { rest: BQ.duracaoQ(q), rod: false, em: Date.now() } }) || { rest: BQ.duracaoQ(q), rod: false };
    const salvar = async novo => { E.manual = { ...m, ...novo }; atualizar(); try { await setDoc(refEstado, { manual: E.manual, atualizado: Date.now() }, { merge: true }); } catch (e) { console.error(e); toast("Não deu para salvar o placar."); } };
    const relAgora = (rod, rest) => ({ rest: rest != null ? rest : ra.rest, rod, em: Date.now(), p: 24 });
    const pts = (l, n) => { if (m.fim) { toast("Jogo encerrado. Toque em Novo jogo."); return; } const i = ps.findIndex(x => x.n === q); if (i < 0) return; if (n < 0 && !(ps[i][l] > 0)) return; ps[i] = { ...ps[i], [l]: (ps[i][l] || 0) + n }; salvar({ periodos: ps }); };
    const ta = ps.reduce((t, x) => t + (x.a || 0), 0), tb = ps.reduce((t, x) => t + (x.b || 0), 0), iq = ps.findIndex(x => x.n === q), ultimo = iq === ps.length - 1;
    const proximo = () => {
      if (!ultimo) { const n = ps[iq + 1].n; salvar({ q: n, rel: relAgora(false, BQ.duracaoQ(n)) }); toast(BQ.nomeQ(n) + " — relógio em " + BQ.fmtRel(BQ.duracaoQ(n)) + "."); return; }
      if (ta === tb) { const n = "P" + (ps.filter(x => /^P/.test(x.n)).length + 1); ps.push({ n, a: 0, b: 0 }); salvar({ periodos: ps, q: n, rel: relAgora(false, 300) }); toast("Empate: " + BQ.nomeQ(n) + " de 5 minutos."); return; }
      toast("Fim do tempo normal: toque em Encerrar jogo.");
    };
    const lado = (l, nome) => h("div", { class: "avb-lado" }, h("b", { text: nome }),
      h("div", { class: "avb-bts" }, [1, 2, 3].map(n => h("button", { type: "button", class: "av-mais", onclick: () => pts(l, n) }, "+" + n))),
      h("button", { type: "button", class: "ghost t-mini", onclick: () => pts(l, -1) }, "−1 (corrigir)"));
    return h("div", { class: "t-card av-ctl" },
      h("span", { class: "t-sub", text: "Marcar pontos · " + BQ.nomeQ(q) + (m.fim ? " · ENCERRADO" : "") }),
      h("div", { class: "avb" }, lado("a", nA), lado("b", nB)),
      h("div", { class: "bq-rel" }, h("div", { class: "bq-relj" }, h("small", { text: BQ.nomeQ(q) }), h("b", { class: "av-rel", "data-r": "j", text: BQ.fmtRel(ra.rest) })),
        h("div", { class: "bq-relb" },
          h("button", { type: "button", onclick: () => salvar({ rel: relAgora(!ra.rod) }) }, ra.rod ? "⏸ Parar" : "▶ Iniciar"),
          h("button", { type: "button", class: "ghost t-mini", onclick: () => salvar({ rel: relAgora(false, BQ.duracaoQ(q)) }) }, "Zerar " + BQ.fmtRel(BQ.duracaoQ(q))))),
      h("div", { class: "t-linha" },
        h("button", { type: "button", class: "ghost", disabled: iq <= 0, onclick: () => salvar({ q: ps[iq - 1].n }) }, "◀ Quarto anterior"),
        h("button", { type: "button", class: "ghost", onclick: proximo }, ultimo ? (ta === tb ? "Prorrogação ▶" : "Fim do jogo?") : "Próximo quarto ▶")),
      h("div", { class: "t-linha" },
        !m.fim && h("button", { type: "button", class: "ghost", onclick: () => salvar({ fim: true, rel: relAgora(false) }) }, "Encerrar jogo"),
        m.fim && h("button", { type: "button", class: "ghost", onclick: () => salvar({ fim: false }) }, "Reabrir jogo"),
        h("button", { type: "button", class: "ghost", onclick: ev => { const b = ev.currentTarget; if (!b.dataset.armado) { b.dataset.armado = "1"; b.textContent = "Toque de novo para zerar"; setTimeout(() => { delete b.dataset.armado; b.textContent = "Novo jogo (zerar placar)"; }, 4000); return; } salvar({ periodos: Q4(), q: "1Q", rel: relAgora(false, 600), fim: false }); } }, "Novo jogo (zerar placar)")));
  }

  function cartaoCanal() {
    const w = h("div", { class: "t-card t-form" }, h("h3", { text: "Canal do YouTube" }));
    if (!editCanal) {
      w.append(h("p", { class: "cap", text: canalId() || canalHandle() ? (canalHandle() ? "@" + canalHandle() : "") + (canalId() ? " · ID " + canalId() : " · falta o ID do canal (precisa dele para o vídeo abrir dentro do app)") : "Nenhum canal cadastrado." }),
        h("div", { class: "t-linha" }, h("button", { type: "button", class: "ghost", onclick: () => { editCanal = true; painelSujo = true; atualizar(); } }, canalId() ? "Trocar canal" : "Cadastrar canal")));
      return w;
    }
    const iId = h("input", { id: "av-cid", value: canalId(), placeholder: "UC… ou link youtube.com/channel/UC…" });
    const iH = h("input", { id: "av-ch", value: canalHandle() ? "@" + canalHandle() : "", placeholder: "@nomedocanal" });
    w.append(h("label", { class: "t-lbl" }, "ID do canal", iId), h("label", { class: "t-lbl" }, "Nome de usuário (@)", iH),
      h("p", { class: "cap", text: "O ID está no YouTube em Configurações › Configurações avançadas (começa com UC). Também vale colar o link do canal." }),
      h("div", { class: "t-linha" },
        h("button", { type: "button", onclick: async () => {
          const a = lerCanal(iId.value), b = lerCanal(iH.value), id = a.id || b.id, handle = b.handle || a.handle;
          if (iId.value.trim() && !id) { toast("O ID do canal começa com UC e tem 24 caracteres."); return; }
          try { await setDoc(refEstado, { canalId: id || "", canalHandle: handle || "" }, { merge: true }); editCanal = false; painelSujo = true; srcAtual = "-"; toast("Canal salvo."); }
          catch (e) { console.error(e); toast("Não deu para salvar."); }
        } }, "Salvar canal"),
        h("button", { type: "button", class: "ghost", onclick: () => { editCanal = false; painelSujo = true; atualizar(); } }, "Cancelar")));
    return w;
  }

  function cartaoOverlay() {
    const url = urlPlacar();
    const campo = h("input", { readonly: true, value: url, onfocus: e => e.target.select() });
    return h("details", { class: "t-card av-ov" },
      h("summary", { text: "Placar na transmissão (OBS, Streamlabs, Prism)" }),
      h("p", { class: "cap", text: "Página de placar com fundo transparente que acompanha a súmula em tempo real. Adicione como fonte de navegador (Browser Source / Web) na live:" }),
      campo,
      h("div", { class: "t-linha" },
        h("button", { type: "button", onclick: () => { navigator.clipboard && navigator.clipboard.writeText(url).then(() => toast("Link copiado."), () => { campo.select(); toast("Copie o link selecionado."); }); } }, "Copiar link"),
        h("a", { class: "av-btn ghost", href: url, target: "_blank", rel: "noopener" }, "Abrir o placar"),
        esporte === "biribol" && !MANUAL && h("button", { type: "button", class: "ghost", onclick: () => { const u = url + "&so=rodizio"; navigator.clipboard && navigator.clipboard.writeText(u).then(() => toast("Link do rodízio copiado."), () => toast(u)); } }, "Copiar link do rodízio")),
      h("ul", { class: "cap av-dicas" },
        h("li", { text: "OBS / Streamlabs Desktop: Fontes › + › Navegador (Browser). Cole o link, largura 1280 e altura 200, e posicione no topo do vídeo." }),
        h("li", { text: "Prism Live (celular): Widget › Web (ou Navegador) e cole o link." }),
        h("li", { text: "Para placar embaixo, use o link com &pos=baixo; para só os números, &compacto=1." }),
        esporte === "biribol" && h("li", null, "Rodízio na live: placar + piscina juntos com ", h("code", { text: "&rodizio=1" }), "; só a piscina, num widget separado, com ", h("code", { text: "&so=rodizio" }), " (tamanho com &largura=600). Aparece quando o mesário cadastrou a formação na súmula do jogo em destaque."),
        h("li", { text: "O placar mostra o jogo em destaque escolhido em \"Transmissão no ar\". Troque o jogo aqui e ele muda na live." }),
        h("li", { text: "Sem transmissão começada aqui no app, ou sem jogo escolhido, aparece só a faixa com a logo e o título. Os números entram quando você toca em Começar transmissão com um jogo escolhido." })));
  }

  return { tela, elemento: sec, estado: () => E };
}
