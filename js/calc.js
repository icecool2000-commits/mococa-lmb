// Cálculos do app (sem tela): resultado das partidas, colocação na etapa, história narrada
// e estatísticas da equipe de Mococa, dos adversários e dos atletas.

export const SERIES = ["Série Ouro", "Série Prata", "Série Bronze"];
export const MEDALHA = ["🥇", "🥈", "🥉"];
export const NOME_MEDALHA = ["ouro", "prata", "bronze"];
export const CHAVES = { rr: "Todos contra todos", oitavas: "Oitavas de final", quartas: "Quartas de final", semi: "Semifinal", terceiro: "Disputa de 3º lugar", final: "Final" };
const ORDEM_CHAVE = { rr: 10, oitavas: 20, quartas: 30, semi: 40, terceiro: 50, final: 60 };

export const uid = (p = "") => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const fmtData = s => { if (!s) return ""; const [y, m, d] = s.split("-"); return d + "/" + m + "/" + y; };
export const chaveNome = s => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
export const temporadaDe = e => e.temporada || (e.data ? +e.data.slice(0, 4) : null);
const f1 = v => (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
export { f1 };

/* ---------- partida ---------- */
// Biribol: melhor de 3 sets (21, 21, tiebreak 15), 2 pontos de vantagem
const ALVO = [21, 21, 15];
export const setFechado = (m, a, i) => Math.max(m, a) >= (ALVO[i] ?? 15) && Math.abs(m - a) >= 2;

export function resultado(p) {
  if (p.wo) return { fim: true, venceu: p.wo === "m", wo: true, sm: p.wo === "m" ? 2 : 0, sa: p.wo === "a" ? 2 : 0, pm: 0, pa: 0, tiebreak: false, sets: [] };
  const sets = (p.sets || []).filter(s => (s.m || 0) + (s.a || 0) > 0);
  let sm = 0, sa = 0, pm = 0, pa = 0;
  sets.forEach((s, i) => { pm += s.m || 0; pa += s.a || 0; if (setFechado(s.m || 0, s.a || 0, i)) { if (s.m > s.a) sm++; else sa++; } });
  const fim = sm === 2 || sa === 2;
  return { fim, venceu: fim ? sm > sa : null, wo: false, sm, sa, pm, pa, tiebreak: sets.length >= 3, sets };
}
export const placar = p => { const r = resultado(p); return r.wo ? "W.O." : r.sm + " x " + r.sa; };
export const parciais = p => resultado(p).sets.map(s => s.m + "-" + s.a).join(", ");

export function rotulo(p) {
  if (p.fase === "grupo") return "Grupo" + (p.grupo ? " " + p.grupo : "") + (p.rodada ? " · " + p.rodada + "ª rodada" : "");
  const k = CHAVES[p.chave] || "";
  if (p.fase === "serie") return SERIES[p.serie] + (k ? " · " + k : "");
  return k || "Mata-mata";
}
export const faseGrande = p => p.fase === "grupo" ? "Fase de grupos" : p.fase === "serie" ? SERIES[p.serie] : "Mata-mata";
export const ordemPartida = p => (p.fase === "grupo" ? 0 : 100 + (p.fase === "serie" ? 0 : 1000) + (ORDEM_CHAVE[p.chave] || 0)) * 100 + (p.rodada || 0) * 10 + (p.ordem || 0) / 1000;
export const partidasOrdenadas = e => [...(e.partidas || [])].sort((x, y) => ordemPartida(x) - ordemPartida(y));

/* ---------- colocação na etapa ---------- */
export function colocacao(e) {
  const ps = partidasOrdenadas(e).filter(p => resultado(p).fim);
  const ko = ps.filter(p => p.fase !== "grupo");
  const serie = e.serie != null && e.serie !== "" ? +e.serie : (ko.find(p => p.fase === "serie") || {}).serie ?? null;
  const naSerie = serie != null ? " da " + SERIES[serie] : "";
  let pos = null, texto = "";
  const man = e.posicao != null && e.posicao !== "" ? +e.posicao : null;
  if (man) { pos = man; texto = pos + "º lugar" + naSerie; }
  else {
    const fin = ko.find(p => p.chave === "final"), ter = ko.find(p => p.chave === "terceiro");
    if (fin) { pos = resultado(fin).venceu ? 1 : 2; texto = pos + "º lugar" + naSerie; }
    else if (ter) { pos = resultado(ter).venceu ? 3 : 4; texto = pos + "º lugar" + naSerie; }
    else {
      const ult = [...ko].reverse().find(p => p.chave && p.chave !== "rr" && resultado(p).venceu === false);
      if (ult) texto = "Parou " + ({ semi: "na semifinal", quartas: "nas quartas de final", oitavas: "nas oitavas de final" })[ult.chave] + naSerie;
      else if (serie != null) texto = "Disputou a " + SERIES[serie];
      else if (ps.length) texto = "Fase de grupos";
    }
  }
  const medalha = pos && pos <= 3 ? pos : null;
  return { serie, pos, texto, medalha };
}

/* ---------- resumo e história de uma etapa ---------- */
export function resumoEtapa(e) {
  let v = 0, d = 0, sm = 0, sa = 0, pm = 0, pa = 0;
  (e.partidas || []).forEach(p => { const r = resultado(p); if (!r.fim) return; r.venceu ? v++ : d++; sm += r.sm; sa += r.sa; pm += r.pm; pa += r.pa; });
  return { v, d, j: v + d, sm, sa, pm, pa, ...colocacao(e) };
}

const listaPt = arr => arr.length <= 1 ? arr.join("") : arr.slice(0, -1).join(", ") + " e " + arr[arr.length - 1];
function frase(p) {
  const r = resultado(p), adv = p.adversario || "adversário";
  if (!r.fim) return "jogo com " + adv + " sem resultado registrado";
  if (r.wo) return r.venceu ? "vitória por W.O. sobre " + adv : "derrota por W.O. para " + adv;
  return (r.venceu ? "vitória sobre " : "derrota para ") + adv + " por " + r.sm + " x " + r.sa + " (" + parciais(p) + ")";
}
// texto corrido da etapa, para "contar a história"
export function narrativa(e, nomeAt) {
  const ps = partidasOrdenadas(e), out = [], R = resumoEtapa(e);
  const quem = (e.atletas || []).map(nomeAt).filter(Boolean);
  const onde = [e.local, fmtData(e.data)].filter(Boolean).join(", ");
  out.push((e.nome || "Etapa") + (onde ? " – " + onde : "") + "." + (quem.length ? " Mococa foi com " + quem.length + " atletas: " + listaPt(quem) + "." : ""));
  const gr = ps.filter(p => p.fase === "grupo");
  if (gr.length) {
    const g = gr.find(p => p.grupo) || {};
    const gv = gr.filter(p => resultado(p).venceu === true).length, gd = gr.filter(p => resultado(p).venceu === false).length;
    let t = "Na fase de grupos" + (g.grupo ? " (Grupo " + g.grupo + ")" : "") + ": " + listaPt(gr.map(frase)) + ".";
    t += " Campanha no grupo: " + gv + (gv === 1 ? " vitória" : " vitórias") + " e " + gd + (gd === 1 ? " derrota" : " derrotas");
    if (e.posGrupo) t += ", " + e.posGrupo + "º lugar no grupo";
    t += R.serie != null ? " – vaga na " + SERIES[R.serie] + "." : ".";
    out.push(t);
  }
  const ko = ps.filter(p => p.fase !== "grupo");
  if (ko.length) {
    const pref = R.serie != null ? "Na " + SERIES[R.serie] + ": " : "No mata-mata: ";
    const em = { oitavas: "nas oitavas", quartas: "nas quartas", semi: "na semifinal", terceiro: "na disputa do 3º lugar", final: "na final" };
    out.push(pref + listaPt(ko.map(p => (em[p.chave] ? em[p.chave] + ", " : "") + frase(p))) + ".");
  }
  if (R.texto && R.j) {
    let t = "Resultado final: " + R.texto + (R.medalha ? " – medalha de " + NOME_MEDALHA[R.medalha - 1] + " " + MEDALHA[R.medalha - 1] : "") + ".";
    t += " Na etapa foram " + R.v + (R.v === 1 ? " vitória" : " vitórias") + " e " + R.d + (R.d === 1 ? " derrota" : " derrotas") + ", " + R.pm + " pontos feitos e " + R.pa + " sofridos.";
    out.push(t);
  }
  const art = artilheiros(e).slice(0, 3);
  if (art.length && art[0].p > 0) out.push("Destaques: " + listaPt(art.filter(a => a.p > 0).map(a => nomeAt(a.aid) + " (" + a.p + " pts)")) + ".");
  if (e.obs) out.push(e.obs);
  return out;
}
export function artilheiros(e) {
  const t = {};
  (e.partidas || []).forEach(p => Object.entries(p.stats || {}).forEach(([aid, s]) => { const x = t[aid] || (t[aid] = { aid, p: 0, b: 0, as: 0 }); x.p += s.p || 0; x.b += s.b || 0; x.as += s.as || 0; }));
  return Object.values(t).sort((a, b) => b.p - a.p || b.b - a.b);
}

/* ---------- estatísticas da equipe ---------- */
// lista cronológica de partidas encerradas de etapas realizadas
export function linhaDoTempo(etapas) {
  const out = [];
  [...etapas].filter(e => e.status !== "proxima").sort((a, b) => (a.data || "").localeCompare(b.data || "")).forEach(e =>
    partidasOrdenadas(e).forEach(p => { const r = resultado(p); if (r.fim) out.push({ e, p, r }); }));
  return out;
}

export function statsEquipe(etapas) {
  const tl = linhaDoTempo(etapas), real = etapas.filter(e => e.status !== "proxima" && (e.partidas || []).length);
  const S = { etapas: real.length, j: 0, v: 0, d: 0, setsV: 0, setsP: 0, pf: 0, pc: 0, jPts: 0, sets: 0, tb: 0, tbV: 0, v20: 0, d02: 0, wo: 0,
    margV: 0, margD: 0, nV: 0, nD: 0, maiorSeqV: 0, maiorSeqD: 0, seqAtual: null, forma: [], medalhas: [0, 0, 0], porSerie: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] };
  let seq = 0, tipo = null;
  tl.forEach(({ r }) => {
    S.j++; r.venceu ? S.v++ : S.d++;
    if (r.wo) S.wo++;
    else {
      S.setsV += r.sm; S.setsP += r.sa; S.pf += r.pm; S.pc += r.pa; S.jPts++; S.sets += r.sets.length;
      if (r.tiebreak) { S.tb++; if (r.venceu) S.tbV++; }
      if (r.venceu && r.sa === 0) S.v20++; if (!r.venceu && r.sm === 0) S.d02++;
      if (r.venceu) { S.margV += r.pm - r.pa; S.nV++; } else { S.margD += r.pa - r.pm; S.nD++; }
    }
    if (tipo === r.venceu) seq++; else { tipo = r.venceu; seq = 1; }
    if (tipo) S.maiorSeqV = Math.max(S.maiorSeqV, seq); else S.maiorSeqD = Math.max(S.maiorSeqD, seq);
  });
  S.seqAtual = tipo == null ? null : { v: tipo, n: seq };
  S.forma = tl.slice(-10).map(x => ({ v: x.r.venceu, adv: x.p.adversario, placar: x.r.wo ? "W.O." : x.r.sm + "x" + x.r.sa, etapa: x.e.nome }));
  S.aprov = S.j ? S.v / S.j : 0;
  real.forEach(e => { const c = colocacao(e); if (c.medalha) { S.medalhas[c.medalha - 1]++; if (c.serie != null) S.porSerie[c.serie][c.medalha - 1]++; } });
  return S;
}

// desempenho por fase (grupos, cada série, mata-mata) e por tipo de jogo decisivo
export function porFase(etapas) {
  const m = {}, ordem = ["Fase de grupos", "Série Ouro", "Série Prata", "Série Bronze", "Mata-mata", "Quartas de final", "Semifinal", "Disputa de 3º lugar", "Final"];
  const add = (k, r) => { const x = m[k] || (m[k] = { fase: k, j: 0, v: 0, d: 0, pf: 0, pc: 0 }); x.j++; r.venceu ? x.v++ : x.d++; x.pf += r.pm; x.pc += r.pa; };
  linhaDoTempo(etapas).forEach(({ p, r }) => { add(faseGrande(p), r); if (["quartas", "semi", "terceiro", "final"].includes(p.chave)) add(CHAVES[p.chave], r); });
  return Object.values(m).sort((a, b) => ordem.indexOf(a.fase) - ordem.indexOf(b.fase));
}

// por etapa, em ordem de data (para os gráficos de frequência)
export function porEtapa(etapas) {
  let v = 0, j = 0;
  return [...etapas].filter(e => e.status !== "proxima" && (e.partidas || []).length).sort((a, b) => (a.data || "").localeCompare(b.data || "")).map(e => {
    const R = resumoEtapa(e); v += R.v; j += R.j;
    return { id: e.id, nome: e.nome, data: e.data, temporada: temporadaDe(e), ...R, aprovEtapa: R.j ? R.v / R.j : 0, aprovAcum: j ? v / j : 0, nAtletas: (e.atletas || []).length };
  });
}

/* ---------- adversários ---------- */
export function statsAdversarios(etapas) {
  const m = {};
  linhaDoTempo(etapas).forEach(({ e, p, r }) => {
    const k = chaveNome(p.adversario); if (!k) return;
    const x = m[k] || (m[k] = { nome: p.adversario.trim(), j: 0, v: 0, d: 0, setsV: 0, setsP: 0, pf: 0, pc: 0, jogos: [] });
    x.j++; r.venceu ? x.v++ : x.d++; x.setsV += r.sm; x.setsP += r.sa; x.pf += r.pm; x.pc += r.pa;
    x.jogos.push({ etapa: e.nome, data: e.data, fase: rotulo(p), v: r.venceu, placar: r.wo ? "W.O." : r.sm + " x " + r.sa, parciais: parciais(p) });
  });
  return Object.values(m).map(x => ({ ...x, aprov: x.j ? x.v / x.j : 0, saldo: x.pf - x.pc })).sort((a, b) => b.j - a.j || b.v - a.v || a.nome.localeCompare(b.nome, "pt-BR"));
}

/* ---------- atletas ---------- */
export function statsAtletas(atletas, etapas) {
  const real = etapas.filter(e => e.status !== "proxima");
  return atletas.map(a => {
    const ets = real.filter(e => (e.atletas || []).includes(a.id)).sort((x, y) => (x.data || "").localeCompare(y.data || ""));
    let p = 0, b = 0, as = 0, j = 0, v = 0, maior = 0, maiorTxt = "", medalhas = [0, 0, 0];
    const porEt = ets.map(e => {
      let pe = 0;
      (e.partidas || []).forEach(pt => {
        const r = resultado(pt); if (!r.fim || r.wo) return;
        j++; if (r.venceu) v++;
        const s = (pt.stats || {})[a.id]; if (!s) return;
        p += s.p || 0; b += s.b || 0; as += s.as || 0; pe += s.p || 0;
        if ((s.p || 0) > maior) { maior = s.p; maiorTxt = "contra " + pt.adversario + " (" + e.nome + ")"; }
      });
      const c = colocacao(e); if (c.medalha) medalhas[c.medalha - 1]++;
      return { id: e.id, nome: e.nome, data: e.data, p: pe };
    });
    return { ...a, etapas: ets.length, etapasLista: porEt, j, v, aprov: j ? v / j : 0, p, b, as, med: j ? p / j : 0, maior, maiorTxt, medalhas };
  });
}

// posição com empate (1, 1, 3...)
export function comPosicao(lista, chave) {
  let ult = null, pos = 0;
  return lista.map((x, i) => { if (x[chave] !== ult) { pos = i + 1; ult = x[chave]; } return { ...x, pos }; });
}
