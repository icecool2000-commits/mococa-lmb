// Estatísticas por Equipe: escolhe torneio (ou todos) e uma equipe e mostra campanha, jogos, confrontos,
// desempenho por fase e por etapa, colocações/medalhas e atletas. Relatório em PDF ou Excel.
// A Liga cria um torneio por etapa: em "Todos os torneios" a equipe é reconhecida pelo nome (sem acento/maiúsculas).
// ctx = { db, fs: { collection, onSnapshot }, esporte, fontes: [[col, rótulo]], marca, toast, render, preferir?: /regex/, torneioAtual?: () => id, X (exportar.js) }
import * as C from "./torneio-core.js";
import { resumo as resumoMesa } from "./basquete.js";

function h(tag, props, ...kids) {
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
export const chaveNome = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const f1 = v => (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
const pct = v => Math.round(v * 100) + "%";
const sinal = v => (v > 0 ? "+" : "") + v;
const MED = ["🥇", "🥈", "🥉"];

// ---------- cálculo (puro) ----------
// dados = [{ T, jogos }]; chave = nome normalizado da equipe
export function calcular(esporte, dados, chave) {
  const BIR = esporte === "biribol";
  const S = { nome: "", torneios: 0, j: 0, v: 0, d: 0, e: 0, wo: 0, pts: 0, sv: 0, sp: 0, pf: 0, pc: 0, jp: 0, tb: 0, tbV: 0, v20: 0, d02: 0,
    maiorV: null, piorD: null, jogos: [], fases: {}, adv: {}, etapas: [], atl: {}, medalhas: [0, 0, 0], tecnico: "", capitao: "", cart: { adv: 0, amarelo: 0, vermelho: 0, demora: 0, tec: 0 },
    mesa: { jogos: 0, f: 0, T: 0, U: 0, D: 0, llc: 0, llt: 0, tempos: 0, tec: 0, exc: 0 } };
  const ordemT = [...dados].sort((a, b) => (a.T.criado || 0) - (b.T.criado || 0) || String(a.T.nome).localeCompare(String(b.T.nome)));
  ordemT.forEach(({ T, jogos }) => {
    const eq = (T.equipes || []).find(e => chaveNome(e.nome) === chave); if (!eq) return;
    S.torneios++; S.nome = eq.nome; if (eq.tecnico) S.tecnico = eq.tecnico;
    const cpA = (eq.atletas || []).find(a => a.id === eq.capitao); if (cpA) S.capitao = cpA.nome;
    const nome = id => ((T.equipes || []).find(e => e.id === id) || {}).nome || "?";
    const meus = new Set((eq.atletas || []).map(a => a.id));
    (eq.atletas || []).forEach(a => { const k = chaveNome(a.nome); const x = S.atl[k] || (S.atl[k] = { nome: a.nome, num: a.num, j: 0, p: 0, b: 0, as: 0, jEq: 0, am: 0, vm: 0, cap: false, f: 0, llc: 0, llt: 0 }); x.num = a.num ?? x.num; if (eq.capitao === a.id) x.cap = true; });
    const contaEq = new Set();
    (T.etapas || []).forEach((et, ei) => {
      const js = jogos.filter(j => j.etapa === ei);
      const meusJ = js.filter(j => (j.a === eq.id || j.b === eq.id) && j.status === "encerrado" && j.a && j.b);
      // colocação na etapa (pela própria classificação do torneio)
      let col = null;
      try { const c = C.colocacaoEtapa(esporte, et, js.filter(j => !(j.wo && !j.b)), (T.equipes || []).map(e => e.id), nome); col = c.ordem.find(r => r.eid === eq.id) || null; if (col) col = { ...col, completa: c.completa }; } catch (e) { col = null; }
      const lin = { tnome: T.nome, enome: et.nome || "Etapa " + (ei + 1), data: et.data || "", j: 0, v: 0, d: 0, pf: 0, pc: 0, pts: 0, col };
      meusJ.forEach(j => {
        const r = C.resultado(esporte, j), lado = j.a === eq.id ? "a" : "b", adv = lado === "a" ? j.b : j.a;
        const mp = lado === "a" ? r.pa : r.pb, op = lado === "a" ? r.pb : r.pa, ms = lado === "a" ? r.sa : r.sb, os = lado === "a" ? r.sb : r.sa;
        const venceu = r.venc === eq.id, emp = !!r.empate, wo = !!j.wo;
        const pp = C.pontosDaPartida(esporte, j); const ptsJ = pp ? pp[eq.id] || 0 : 0;
        S.j++; lin.j++; if (wo) S.wo++;
        if (emp) S.e++; else if (venceu) { S.v++; lin.v++; } else { S.d++; lin.d++; }
        S.pts += ptsJ; lin.pts += ptsJ;
        const fase = C.faseEstat(j) || "—";
        const F = S.fases[fase] || (S.fases[fase] = { j: 0, v: 0, d: 0, pf: 0, pc: 0 }); F.j++; if (venceu) F.v++; else if (!emp) F.d++;
        const an = nome(adv), ak = chaveNome(an), A = S.adv[ak] || (S.adv[ak] = { nome: an, j: 0, v: 0, d: 0, sv: 0, sp: 0, pf: 0, pc: 0 }); A.j++; if (venceu) A.v++; else if (!emp) A.d++;
        if (!wo) {
          S.jp++; S.pf += mp; S.pc += op; lin.pf += mp; lin.pc += op; F.pf += mp; F.pc += op; A.pf += mp; A.pc += op;
          if (BIR) { S.sv += ms; S.sp += os; A.sv += ms; A.sp += os; if ((j.sets || []).filter(s => (s.a || 0) + (s.b || 0) > 0).length >= 3) { S.tb++; if (venceu) S.tbV++; } if (venceu && os === 0) S.v20++; if (!venceu && !emp && ms === 0) S.d02++; }
          const dif = mp - op;
          if (venceu && (!S.maiorV || dif > S.maiorV.dif)) S.maiorV = { dif, adv: an, placar: mp + " x " + op, onde: T.nome };
          if (!venceu && !emp && (!S.piorD || -dif > S.piorD.dif)) S.piorD = { dif: -dif, adv: an, placar: mp + " x " + op, onde: T.nome };
        }
        Object.entries(j.stats || {}).forEach(([aid, st]) => {
          if (!meus.has(aid)) return;
          const a = (eq.atletas || []).find(x => x.id === aid); const x = S.atl[chaveNome(a.nome)];
          x.p += st.p || 0; x.b += st.b || 0; x.as += st.as || 0; if ((st.p || 0) + (st.b || 0) + (st.as || 0) > 0) x.j++;
        });
        // basquete: mesa (faltas, lances livres, tempos)
        const MS = !BIR && j.mesa ? resumoMesa(j) : null;
        if (MS) { const e = MS.eq[lado], M = S.mesa; M.jogos++; M.f += e.f; M.T += e.T; M.U += e.U; M.D += e.D; M.llc += e.llc; M.llt += e.llt; M.tempos += e.tempos; M.tec += e.tecC + e.tecB + e.tecD;
          Object.entries(MS.atl).forEach(([aid, x]) => { if (!meus.has(aid)) return; const a = (eq.atletas || []).find(y => y.id === aid); const A3 = S.atl[chaveNome(a.nome)];
            A3.f += x.f || 0; A3.llc += x.llc || 0; A3.llt += x.llt || 0; if (x.fora) M.exc++; }); }
        (j.sancoes || []).forEach(x => { if (x.l !== lado) return;
          if (x.tipo === "advDemora" || x.tipo === "penDemora") S.cart.demora++; else S.cart[x.tipo] = (S.cart[x.tipo] || 0) + 1;
          if (x.quem === "tec" || x.quem === "com") { if (x.tipo === "amarelo" || x.tipo === "vermelho" || x.tipo === "desq") S.cart.tec++; return; }
          const a = (eq.atletas || []).find(y => y.id === x.quem); if (!a) return; const A2 = S.atl[chaveNome(a.nome)]; if (x.tipo === "amarelo" || x.tipo === "desq") A2.am++; if (x.tipo === "vermelho" || x.tipo === "desq") A2.vm++; });
        contaEq.add(j.id);
        const parciais = BIR ? (j.sets || []).filter(s => (s.a || 0) + (s.b || 0) > 0).map(s => lado === "a" ? s.a + "-" + s.b : s.b + "-" + s.a).join(" ") : "";
        S.jogos.push({ ordem: S.jogos.length, tnome: T.nome, enome: lin.enome, data: et.data || "", fase, adv: an, venceu, emp, wo,
          placar: wo ? "W.O." : BIR ? ms + " x " + os : mp + " x " + op, parciais, pts: ptsJ });
      });
      if (lin.j) { S.etapas.push(lin); if (col && col.medalha && col.completa) S.medalhas[col.medalha - 1]++; }
    });
    (eq.atletas || []).forEach(a => { S.atl[chaveNome(a.nome)].jEq += contaEq.size; });
  });
  // sequências
  let seq = null, mV = 0, mD = 0, cV = 0, cD = 0;
  S.jogos.forEach(g => { if (g.emp) { cV = cD = 0; return; } if (g.venceu) { cV++; cD = 0; mV = Math.max(mV, cV); } else { cD++; cV = 0; mD = Math.max(mD, cD); } });
  const ult = [...S.jogos].reverse().filter(g => !g.emp); if (ult.length) { let n = 0; for (const g of ult) { if (g.venceu === ult[0].venceu) n++; else break; } seq = { v: ult[0].venceu, n }; }
  Object.assign(S, { maiorSeqV: mV, maiorSeqD: mD, seq, aprov: S.j ? S.v / S.j : 0 });
  return S;
}

// lista de equipes (nome) presentes nos dados
export function equipesDe(dados) {
  const m = new Map(); dados.forEach(({ T }) => (T.equipes || []).forEach(e => { const k = chaveNome(e.nome); if (k && !m.has(k)) m.set(k, e.nome); }));
  return [...m.entries()].map(([k, nome]) => ({ k, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// ---------- relatório (mesmos números da tela) ----------
export function spec(esporte, S, titulo) {
  const BIR = esporte === "biribol", ok = S.j > 0;
  const quad = [...(S.tecnico ? [["Técnico", S.tecnico, ""]] : []), ...(S.capitao ? [["Capitão", S.capitao, ""]] : []), ["Jogos", S.j, S.torneios + (S.torneios === 1 ? " torneio" : " torneios")], ["Vitórias", S.v, ok ? pct(S.aprov) + " de aproveitamento" : ""], ["Derrotas", S.d, S.e ? S.e + " empates" : ""]];
  if (BIR && S.pts) quad.push(["Pontos (regra da Liga)", S.pts, ok ? f1(S.pts / S.j) + " por jogo" : ""]);
  if (BIR) quad.push(["Sets", S.sv + "–" + S.sp, S.sv + S.sp ? pct(S.sv / (S.sv + S.sp)) + " vencidos" : ""]);
  quad.push(["Pontos feitos", S.pf, S.jp ? f1(S.pf / S.jp) + " por jogo" : ""], ["Pontos sofridos", S.pc, S.jp ? f1(S.pc / S.jp) + " por jogo" : ""], ["Saldo de pontos", sinal(S.pf - S.pc), ""]);
  if (BIR) quad.push(["Tiebreaks", S.tb, S.tb ? S.tbV + " vencidos" : ""], ["Vitórias por 2x0", S.v20, ""], ["Derrotas por 0x2", S.d02, ""]);
  if (BIR) { const dq = S.cart.desq || 0; quad.push(["Cartões", S.cart.amarelo + S.cart.vermelho + dq, S.cart.amarelo + " amarelo(s) · " + S.cart.vermelho + " vermelho(s) · " + (dq ? dq + " amarelo + vermelho · " : "") + S.cart.adv + " advertência(s)"]); }
  const M = S.mesa, MM = !BIR && M.jogos > 0;
  if (MM) quad.push(["Faltas", M.f, f1(M.f / M.jogos) + " por jogo" + (M.T + M.U + M.D ? " · " + [M.T && M.T + " técnica(s)", M.U && M.U + " antidesportiva(s)", M.D && M.D + " desqualificante(s)"].filter(Boolean).join(" · ") : "")],
    ["Lances livres", M.llc + "/" + M.llt, M.llt ? pct(M.llc / M.llt) + " de aproveitamento" : ""], ["Tempos pedidos", M.tempos, f1(M.tempos / M.jogos) + " por jogo"],
    ["Técnico/banco", M.tec, "faltas técnicas" + (M.exc ? " · " + M.exc + " atleta(s) fora por 5 faltas/desq." : "")]);
  quad.push(["Medalhas", S.medalhas.reduce((a, b) => a + b, 0), S.medalhas.map((x, k) => x + " " + ["ouro", "prata", "bronze"][k]).join(" · ")],
    ["Maior vitória", S.maiorV ? "+" + S.maiorV.dif : "–", S.maiorV ? S.maiorV.placar + " x " + S.maiorV.adv : ""], ["Pior derrota", S.piorD ? "−" + S.piorD.dif : "–", S.piorD ? S.piorD.placar + " x " + S.piorD.adv : ""],
    ["Maior sequência de vitórias", S.maiorSeqV, ""], ["Sequência atual", S.seq ? S.seq.n + (S.seq.v ? " V" : " D") : "–", ""]);
  const colTxt = c => !c ? "–" : (c.medalha && c.completa ? MED[c.medalha - 1] + " " : "") + (c.serie != null ? C.SERIES[c.serie] + " · " + (c.rot || "") : (c.rot && c.rot !== "Fase de grupos" ? c.rot : c.pos + "º lugar")) + (c.completa ? "" : " (em andamento)");
  const fases = Object.entries(S.fases).sort((a, b) => C.ORDEM_FASES.indexOf(a[0]) - C.ORDEM_FASES.indexOf(b[0]));
  const advs = Object.values(S.adv).sort((a, b) => b.j - a.j || b.v - a.v || a.nome.localeCompare(b.nome, "pt-BR"));
  const atl = Object.values(S.atl).sort((a, b) => b.p - a.p || a.nome.localeCompare(b.nome, "pt-BR"));
  return { titulo: titulo || "Estatísticas por equipe", sub: S.nome, blocos: [
    { t: "quadros", titulo: "Campanha", itens: quad },
    { t: "tabela", titulo: "Etapas e colocações", cab: ["Torneio · etapa", "Data", "J", "V", "D", ...(BIR && S.pts ? ["Pts"] : []), "PF", "PT", "Saldo", "Colocação"], esq: [0, BIR && S.pts ? 9 : 8],
      linhas: S.etapas.map(l => [l.tnome + " · " + l.enome, l.data ? l.data.split("-").reverse().join("/") : "", l.j, l.v, l.d, ...(BIR && S.pts ? [l.pts] : []), l.pf, l.pc, sinal(l.pf - l.pc), colTxt(l.col)]) },
    { t: "tabela", titulo: "Desempenho por fase", cab: ["Fase", "J", "V", "D", "%", "PF", "PT", "Saldo"], linhas: fases.map(([f, x]) => [f, x.j, x.v, x.d, pct(x.j ? x.v / x.j : 0), x.pf, x.pc, sinal(x.pf - x.pc)]) },
    { t: "tabela", titulo: "Confrontos", cab: ["Adversário", "J", "V", "D", ...(BIR ? ["Sets"] : []), "PF", "PT", "Saldo"], linhas: advs.map(a => [a.nome, a.j, a.v, a.d, ...(BIR ? [a.sv + "–" + a.sp] : []), a.pf, a.pc, sinal(a.pf - a.pc)]) },
    { t: "tabela", titulo: "Atletas", cab: ["Atleta", "Nº", "Jogos c/ estat.", "Pontos", BIR ? "Bloqueios" : "Tocos", "Assist.", "Média (pts/jogo da equipe)", ...(BIR ? ["Amarelos", "Vermelhos"] : []), ...(MM ? ["Faltas", "Lances livres"] : [])],
      linhas: atl.map(a => [a.nome + (a.cap ? " (C)" : ""), a.num ?? "", a.j, a.p, a.b, a.as, a.jEq ? f1(a.p / a.jEq) : "–", ...(BIR ? [a.am, a.vm] : []), ...(MM ? [a.f, a.llt ? a.llc + "/" + a.llt + " (" + pct(a.llc / a.llt) + ")" : "–"] : [])]) },
    { t: "tabela", titulo: "Jogos", cab: ["Torneio · etapa", "Fase", "Adversário", "Resultado", "Placar", ...(BIR ? ["Sets"] : [])], esq: [0, 2],
      linhas: S.jogos.map(g => [g.tnome + " · " + g.enome, g.fase, g.adv, g.emp ? "Empate" : g.venceu ? "Vitória" : "Derrota", g.placar, ...(BIR ? [g.parciais] : [])]) }
  ] };
}

// ---------- tela ----------
export function montarEstatEquipe(ctx) {
  const { db, esporte } = ctx, { collection, onSnapshot } = ctx.fs, BIR = esporte === "biribol";
  const st = { col: ctx.fontes[0][0], torneios: null, erro: false, selT: null, selEq: null, jogos: {}, subs: {}, unsubT: null, gerando: false };
  const render = () => ctx.render();
  function trocarFonte(col) {
    if (st.unsubT) st.unsubT(); Object.values(st.subs).forEach(u => u()); Object.assign(st, { col, torneios: null, erro: false, selT: null, jogos: {}, subs: {} });
    st.unsubT = onSnapshot(collection(db, col), s => { st.torneios = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.criado || 0) - (a.criado || 0)); render(); },
      e => { console.error(e); st.torneios = []; st.erro = true; render(); });
  }
  function seguir(tid) {
    if (st.subs[tid]) return;
    st.subs[tid] = onSnapshot(collection(db, st.col, tid, "jogos"), s => { st.jogos[tid] = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, e => { console.error(e); st.jogos[tid] = []; render(); });
  }
  let iniciado = false;
  function tela() {
    if (!iniciado) { iniciado = true; trocarFonte(st.col); }
    const w = h("section", { class: "t-col eqx" });
    if (ctx.fontes.length > 1) w.append(h("div", { class: "eqx-fontes" }, ctx.fontes.map(([c, t]) => h("button", { type: "button", "aria-pressed": String(st.col === c), onclick: () => { trocarFonte(c); render(); } }, t))));
    if (!st.torneios) { w.append(h("div", { class: "t-card" }, h("p", { class: "cap", text: "Lendo os torneios…" }))); return w; }
    if (!st.torneios.length) { w.append(h("div", { class: "t-card" }, h("p", { class: "cap", text: st.erro ? "Não deu para ler os torneios desta fonte agora." : "Ainda não há torneios aqui." }))); return w; }
    const reais = st.torneios.filter(t => !t.demo), base = reais.length ? reais : st.torneios;
    if (!st.selT) { const at = ctx.torneioAtual && ctx.torneioAtual(); st.selT = at && st.torneios.some(t => t.id === at) ? at : "todos"; }
    const lista = st.selT === "todos" ? base : st.torneios.filter(t => t.id === st.selT);
    lista.forEach(t => seguir(t.id));
    const dados = lista.filter(t => st.jogos[t.id]).map(t => ({ T: { ...t, equipes: t.equipes || [], etapas: t.etapas || [] }, jogos: st.jogos[t.id] }));
    const eqs = equipesDe(lista.map(t => ({ T: { equipes: t.equipes || [] } })));
    if (!st.selEq || !eqs.some(e => e.k === st.selEq)) st.selEq = ((ctx.preferir && eqs.find(e => ctx.preferir.test(e.nome))) || eqs[0] || {}).k || null;
    w.append(h("div", { class: "t-card eqx-filtros" },
      h("label", { class: "t-lbl" }, "Torneio", h("select", { onchange: e => { st.selT = e.target.value; render(); } },
        h("option", { value: "todos", selected: st.selT === "todos" }, "Todos os torneios" + (reais.length && reais.length < st.torneios.length ? " (sem demonstração)" : "") + " · " + base.length),
        st.torneios.map(t => h("option", { value: t.id, selected: st.selT === t.id }, t.nome || "Torneio")))),
      h("label", { class: "t-lbl" }, "Equipe", h("select", { onchange: e => { st.selEq = e.target.value; render(); } }, eqs.map(e => h("option", { value: e.k, selected: st.selEq === e.k }, e.nome))))));
    if (dados.length < lista.length) { w.append(h("div", { class: "t-card" }, h("p", { class: "cap", text: "Lendo os jogos… (" + dados.length + " de " + lista.length + " torneios)" }))); return w; }
    if (!st.selEq) { w.append(h("div", { class: "t-card" }, h("p", { class: "cap", text: "Nenhuma equipe cadastrada." }))); return w; }
    const S = calcular(esporte, dados, st.selEq), R = spec(esporte, S, ctx.titulo);
    const tNome = st.selT === "todos" ? "Todos os torneios" : (st.torneios.find(t => t.id === st.selT) || {}).nome;
    R.sub = S.nome + " · " + tNome;
    w.append(botoesRelatorio(R, ctx, st));
    if (!S.j) { w.append(h("div", { class: "t-card" }, h("p", { class: "cap", text: S.nome + " ainda não tem jogos encerrados neste filtro." }))); return w; }
    // campanha
    w.append(h("div", { class: "t-card" }, h("h3", { text: S.nome }), h("p", { class: "cap", text: tNome }),
      h("div", { class: "eqx-tiles" }, R.blocos[0].itens.map(([a, b, c]) => h("div", { class: "eqx-tile" }, h("span", { text: a }), h("b", { text: b }), c && h("small", { text: c }))))));
    // forma
    w.append(h("div", { class: "t-card" }, h("h3", { text: "Últimos jogos" }), h("p", { class: "cap", text: "Do mais antigo ao mais recente · maior sequência: " + S.maiorSeqV + " vitórias e " + S.maiorSeqD + " derrotas" }),
      h("div", { class: "eqx-forma" }, S.jogos.slice(-15).map(g => h("span", { class: g.emp ? "e" : g.venceu ? "v" : "d", title: (g.venceu ? "Vitória " : g.emp ? "Empate " : "Derrota ") + g.placar + " x " + g.adv, text: g.emp ? "E" : g.venceu ? "V" : "D" })))));
    // tabelas
    R.blocos.slice(1).forEach(b => w.append(h("div", { class: "t-card" }, h("h3", { text: b.titulo }),
      b.linhas.length ? h("div", { class: "eqx-tab" }, h("table", { class: "t-tab t-tab-lg" },
        h("thead", null, h("tr", null, b.cab.map((c, i) => h("th", { class: (b.esq || [0]).includes(i) ? "l" : null, text: c })))),
        h("tbody", null, b.linhas.map(l => h("tr", null, l.map((v, i) => h("td", { class: ((b.esq || [0]).includes(i) ? "l" : "") + (String(v) === "Vitória" ? " v" : String(v) === "Derrota" ? " d" : "") || null, text: v == null ? "–" : v }))))))) : h("p", { class: "cap", text: "Sem dados." }))));
    return w;
  }
  return { tela };
}

// botões de relatório (também usados pelas outras abas de estatísticas)
export function botoesRelatorio(R, ctx, st = {}) {
  const gerar = async (fn, tipo) => {
    if (st.gerando) return; st.gerando = true;
    try { ctx.toast("Gerando " + tipo + "…"); await fn(R, ctx.marca); }
    catch (e) { console.error(e); ctx.toast("Não deu para gerar o " + tipo + ". Confira a internet."); }
    finally { st.gerando = false; }
  };
  return h("div", { class: "eqx-rel" }, h("span", { class: "cap", text: "Relatório desta aba:" }),
    h("button", { type: "button", class: "ghost t-mini", onclick: () => gerar(ctx.X.estatPDF, "PDF") }, "📄 PDF"),
    h("button", { type: "button", class: "ghost t-mini", onclick: () => gerar(ctx.X.estatXLSX, "Excel") }, "📊 Excel"));
}
