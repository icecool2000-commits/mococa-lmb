// Regras do torneio (sem tela): grupos, jogos, placar, classificação e mata-mata.
// Usado pelos apps do Biribol e do Basquete.

export const uid = (p = "") => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export function embaralhar(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const LETRAS = "ABCDEFGHIJKLMNOP";
export const letraGrupo = i => LETRAS[i] || String(i + 1);

// Quantos grupos sugerir para n equipes (grupos de 3 a 5, ideal 4)
export function sugerirGrupos(n) {
  if (n <= 2) return 0;          // final direta
  if (n <= 5) return 1;          // todos contra todos
  if (n <= 8) return 2;
  if (n <= 11) return 3;
  if (n <= 16) return 4;
  return Math.ceil(n / 4);
}

// Quantos passam por grupo, por padrão
export function sugerirClassificados(nEquipes, nGrupos) {
  if (nGrupos <= 0) return 0;
  if (nGrupos === 1) return nEquipes >= 5 ? 4 : 2;   // 1 grupo: semifinal (5) ou final (3-4)
  return 2;
}

// Distribui equipes em grupos o mais equilibrado possível (ex.: 7 -> 4 + 3)
export function distribuir(ids, nGrupos) {
  const g = Array.from({ length: nGrupos }, () => []);
  ids.forEach((id, i) => {
    // vai preenchendo em "serpentina" para equilibrar
    const volta = Math.floor(i / nGrupos), pos = i % nGrupos;
    g[volta % 2 === 0 ? pos : nGrupos - 1 - pos].push(id);
  });
  return g;
}

export function tamanhosGrupos(n, nGrupos) {
  if (!nGrupos) return [];
  const base = Math.floor(n / nGrupos), resto = n % nGrupos;
  return Array.from({ length: nGrupos }, (_, i) => base + (i < resto ? 1 : 0));
}

// Todos contra todos (método do círculo). Retorna rodadas de pares; se ímpar, uma equipe folga por rodada.
export function todosContraTodos(ids) {
  const t = [...ids];
  if (t.length < 2) return [];
  if (t.length % 2) t.push(null);
  const n = t.length, rodadas = [];
  for (let r = 0; r < n - 1; r++) {
    const pares = [];
    for (let i = 0; i < n / 2; i++) {
      const a = t[i], b = t[n - 1 - i];
      if (a && b) pares.push(r % 2 ? [b, a] : [a, b]);
    }
    rodadas.push(pares);
    t.splice(1, 0, t.pop()); // gira mantendo o primeiro fixo
  }
  return rodadas;
}

/* ---------- placar ---------- */
export const BIRIBOL = { alvo: [21, 21, 15], setsParaVencer: 2 };

export function setFechado(a, b, idx) {
  const alvo = BIRIBOL.alvo[idx] ?? 15;
  return Math.max(a, b) >= alvo && Math.abs(a - b) >= 2;
}

export function resultadoBiribol(jogo) {
  const sets = (jogo.sets || []);
  let sa = 0, sb = 0, pa = 0, pb = 0;
  sets.forEach((s, i) => {
    pa += s.a || 0; pb += s.b || 0;
    if (setFechado(s.a || 0, s.b || 0, i)) { if (s.a > s.b) sa++; else sb++; }
  });
  const fim = sa >= 2 || sb >= 2;
  return { sa, sb, pa, pb, fim, venc: fim ? (sa > sb ? jogo.a : jogo.b) : null, empate: false };
}

// Basquete: periodos = [{n:"1Q",a,b},...,{n:"P1",a,b},{n:"BO",a,b}]
export function resultadoBasquete(jogo) {
  let pa = 0, pb = 0;
  (jogo.periodos || []).forEach(p => { pa += p.a || 0; pb += p.b || 0; });
  const encerrado = jogo.status === "encerrado";
  let venc = null, empate = false;
  if (encerrado) {
    if (pa > pb) venc = jogo.a; else if (pb > pa) venc = jogo.b; else empate = true;
  }
  return { pa, pb, fim: encerrado, venc, empate };
}

export function resultado(esporte, jogo) {
  const r = esporte === "biribol" ? resultadoBiribol(jogo) : resultadoBasquete(jogo);
  if (jogo.wo) return { ...r, fim: true, venc: jogo.wo, empate: false }; // vitória sem jogo (bye)
  return r;
}

/* ---------- regra de pontos (Liga Metropolitana) ---------- */
// pontosSets: vitória por 2x0 = 3 pts; 2x1 = 2 pts para quem vence e 1 pt para quem perde (ganhou um set); 0x2 = 0
export const REGRA = { pontosSets: false };
export function definirRegra(o) { Object.assign(REGRA, o || {}); }
export function pontosDaPartida(esporte, j) {
  if (esporte !== "biribol" || !REGRA.pontosSets || j.status !== "encerrado") return null;
  const r = resultado(esporte, j); if (!r.venc) return null;
  if (j.wo) return { [r.venc]: 3 };
  const ladoA = r.venc === j.a, sv = ladoA ? r.sb : r.sa; // sets do perdedor
  return { [r.venc]: sv === 0 ? 3 : 2, [ladoA ? j.b : j.a]: sv > 0 ? 1 : 0 };
}

/* ---------- classificação do grupo ---------- */
// critérios: vitórias, empates (basquete), saldo de pontos, pontos feitos, nome
export function classificacao(esporte, equipesIds, jogos, nomeDe = id => id) {
  const t = {};
  equipesIds.forEach(id => t[id] = { eid: id, j: 0, v: 0, e: 0, d: 0, pf: 0, pc: 0, saldo: 0, pg: 0 });
  jogos.forEach(j => {
    if (j.status !== "encerrado" || !t[j.a] || !t[j.b]) return;
    const r = resultado(esporte, j), A = t[j.a], B = t[j.b];
    A.j++; B.j++; A.pf += r.pa; A.pc += r.pb; B.pf += r.pb; B.pc += r.pa;
    if (r.empate) { A.e++; B.e++; }
    else if (r.venc === j.a) { A.v++; B.d++; } else if (r.venc === j.b) { B.v++; A.d++; }
    const pg = pontosDaPartida(esporte, j); if (pg) { A.pg += pg[j.a] || 0; B.pg += pg[j.b] || 0; }
  });
  const rows = Object.values(t);
  rows.forEach(r => r.saldo = r.pf - r.pc);
  rows.sort((x, y) => (REGRA.pontosSets ? y.pg - x.pg : 0) || y.v - x.v || y.e - x.e || y.saldo - x.saldo || y.pf - x.pf || String(nomeDe(x.eid)).localeCompare(String(nomeDe(y.eid)), "pt-BR"));
  return rows;
}

/* ---------- mata-mata ---------- */
export const proxPot2 = n => { let k = 1; while (k < n) k *= 2; return k; };

// ordem padrão das cabeças de chave num chaveamento de K vagas (1 x K, 2 x K-1 ... cruzadas)
export function ordemCabecas(K) {
  let o = [1];
  while (o.length < K) {
    const m = o.length * 2;
    o = o.flatMap(s => [s, m + 1 - s]);
  }
  return o;
}

export function nomeFase(jogosNaRodada) {
  return ({ 1: "Final", 2: "Semifinal", 4: "Quartas de final", 8: "Oitavas de final", 16: "16 avos de final" })[jogosNaRodada] || ("Rodada de " + jogosNaRodada * 2);
}

// qualificados: [{eid, grupo, pos, v, e, saldo, pf}] já na ordem de campanha (cabeça 1 = melhor)
// retorna pares da 1ª rodada: [[A|null, B|null], ...] (null = bye)
export function primeiraRodada(qualificados) {
  const Q = qualificados.length, K = proxPot2(Math.max(2, Q));
  const ordem = ordemCabecas(K);
  const vaga = ordem.map(s => qualificados[s - 1] || null);
  const pares = [];
  for (let i = 0; i < K; i += 2) pares.push([vaga[i], vaga[i + 1]]);
  // evita confronto do mesmo grupo na 1ª rodada: troca o 2º de um par com o 2º de outro
  for (let i = 0; i < pares.length; i++) {
    const [x, y] = pares[i];
    if (!x || !y || x.grupo == null || x.grupo !== y.grupo) continue;
    for (let j = 0; j < pares.length; j++) {
      if (j === i) continue;
      const [x2, y2] = pares[j];
      if (!y2 || !x2) continue;
      if (y2.grupo !== x.grupo && y.grupo !== x2.grupo) { pares[i][1] = y2; pares[j][1] = y; break; }
    }
  }
  return pares;
}

// ranking dos classificados: 1º colocados primeiro (por campanha), depois 2º, etc.
export function ordenarQualificados(porGrupo /* [[rows classificados do grupo]] */) {
  const out = [];
  const maxPos = Math.max(0, ...porGrupo.map(g => g.length));
  for (let p = 0; p < maxPos; p++) {
    const nivel = porGrupo.map((g, gi) => g[p] ? { ...g[p], grupo: gi, pos: p + 1 } : null).filter(Boolean);
    nivel.sort((x, y) => (REGRA.pontosSets ? (y.pg || 0) - (x.pg || 0) : 0) || y.v - x.v || y.e - x.e || y.saldo - x.saldo || y.pf - x.pf);
    out.push(...nivel);
  }
  return out;
}

/* ---------- estatísticas ---------- */
export function statsAtletas(jogos) {
  const s = {};
  jogos.forEach(j => Object.entries(j.stats || {}).forEach(([aid, v]) => {
    const x = s[aid] || (s[aid] = { p: 0, b: 0, as: 0, jogos: 0 });
    x.p += v.p || 0; x.b += v.b || 0; x.as += v.as || 0; x.jogos++;
  }));
  return s;
}

// Firestore não aceita lista dentro de lista: os grupos ficam salvos como [{equipes:[...]}]
export const gruposDe = et => ((et && et.grupos) || []).map(g => Array.isArray(g) ? g : (g.equipes || []));
export const gruposParaSalvar = gs => gs.map(g => ({ equipes: g }));

/* ---------- chave completa (com disputa de 3º lugar) ---------- */
export const SERIES = ["Série Ouro", "Série Prata", "Série Bronze"];
export const MEDALHAS = ["Ouro", "Prata", "Bronze"];
export const TERCEIRO = "Disputa de 3º lugar";
export const ORDEM_FASES = ["Classificação", "Série Ouro", "Série Prata", "Série Bronze", "16 avos de final", "Oitavas de final", "Quartas de final", "Semifinal", TERCEIRO, "Final"];
export const faseEstat = j => j.fase === "grupo" ? "Classificação" : j.serie != null ? SERIES[j.serie] : j.faseNome;

// Estrutura do mata-mata a partir dos classificados (qualquer objeto com .grupo).
// rodadas: [[{id, rodada, ordem, x, y, bye, de}]]; terceiro: jogo dos perdedores das semifinais (se houver semifinal real)
export function estruturaChave(qual, novoId) { return estruturaDePares(primeiraRodada(qual), novoId); }
// mesma estrutura a partir de confrontos escolhidos à mão: pares = [[x|null, y|null]] (quantidade potência de 2)
export function estruturaDePares(pares, novoId) {
  const rodadas = [];
  let ant = pares.map(([x, y], o) => ({ id: novoId(), rodada: 1, ordem: o, x, y, bye: !(x && y) }));
  rodadas.push(ant);
  let r = 1;
  while (ant.length > 1) {
    r++; const prox = [];
    for (let i = 0; i < ant.length; i += 2) prox.push({ id: novoId(), rodada: r, ordem: i / 2, de: [ant[i].id, ant[i + 1].id] });
    rodadas.push(prox); ant = prox;
  }
  let terceiro = null;
  if (rodadas.length >= 2) {
    const semis = rodadas[rodadas.length - 2];
    if (semis.length === 2 && semis.every(s => !s.bye)) terceiro = { id: novoId(), rodada: r, ordem: 1, perd: [semis[0].id, semis[1].id] };
  }
  return { rodadas, terceiro };
}

// tipo de disputa dentro de uma série, conforme o número de equipes
export const tipoSerie = n => n <= 2 ? "final" : n === 3 ? "todos" : "mata";

// pódio de uma chave de mata-mata (lista de jogos já com resultado)
export function podioMata(esporte, js) {
  const fin = js.filter(j => !j.perd);
  if (!fin.length) return [];
  const maxR = Math.max(...fin.map(j => j.rodada));
  const final = fin.find(j => j.rodada === maxR), t = js.find(j => j.perd);
  const p = [null, null, null];
  if (final && final.status === "encerrado") { const r = resultado(esporte, final); if (r.venc) { p[0] = r.venc; p[1] = r.venc === final.a ? final.b : final.a; } }
  if (t && t.status === "encerrado") { const r = resultado(esporte, t); if (r.venc) p[2] = r.venc; }
  return p;
}

// pódio de uma série: todos contra todos -> classificação (quando todos os jogos acabarem); senão, chave
export function podioSerie(esporte, serie, js, nomeDe) {
  if (serie.tipo === "todos") {
    if (!js.length || js.some(j => j.status !== "encerrado")) return [];
    return classificacao(esporte, serie.equipes, js, nomeDe).slice(0, 3).map(r => r.eid);
  }
  return podioMata(esporte, js);
}

// classificados de cada série: posição p (0 = 1º) de cada grupo, já na ordem de campanha
export function montarSeries(porGrupo /* [[rows classificados]] */, nSeries, todosSempre) {
  const ord = ordenarQualificados(porGrupo), out = [];
  for (let p = 0; p < nSeries; p++) {
    const eqs = ord.filter(r => r.pos === p + 1).map(r => r.eid);
    if (!eqs.length) continue;
    out.push({ equipes: eqs, tipo: todosSempre && eqs.length >= 3 ? "todos" : tipoSerie(eqs.length) });
  }
  return out;
}

/* ---------- classificação final da etapa e classificação geral ---------- */
// faixas de colocação de uma chave de mata-mata: campeã, vice, 3º, 4º, depois os eliminados de cada rodada
function faixasChave(esporte, js, cmp) {
  const main = js.filter(j => !j.perd), terc = js.find(j => j.perd), out = [];
  if (!main.length) return out;
  const maxR = Math.max(...main.map(j => j.rodada));
  const perdedor = j => { const r = resultado(esporte, j); return r.venc && !j.wo ? (r.venc === j.a ? j.b : j.a) : null; };
  const final = main.find(j => j.rodada === maxR);
  const rf = resultado(esporte, final);
  if (final.status === "encerrado" && rf.venc) { out.push({ eqs: [rf.venc], rot: "Campeã" }); const p = perdedor(final); if (p) out.push({ eqs: [p], rot: "Vice" }); }
  else out.push({ eqs: [final.a, final.b].filter(Boolean).sort(cmp), rot: "Final" });
  if (terc) {
    const rt = resultado(esporte, terc);
    if (terc.status === "encerrado" && rt.venc) { out.push({ eqs: [rt.venc], rot: "3º lugar" }); out.push({ eqs: [rt.venc === terc.a ? terc.b : terc.a], rot: "4º lugar" }); }
    else out.push({ eqs: [terc.a, terc.b].filter(Boolean).sort(cmp), rot: "Semifinal" });
  }
  for (let r = maxR - 1; r >= 1; r--) {
    if (terc && r === maxR - 1) continue; // perdedores da semifinal já estão no 3º/4º lugar
    const eqs = main.filter(j => j.rodada === r).map(perdedor).filter(Boolean).sort(cmp);
    if (eqs.length) out.push({ eqs, rot: (main.find(j => j.rodada === r) || {}).faseNome || "" });
  }
  return out;
}

// Colocação de cada equipe na etapa. completa = todos os jogos encerrados.
export function colocacaoEtapa(esporte, et, js, equipeIds, nomeDe = id => id) {
  if (!js.length) return { completa: false, ordem: [] };
  const completa = js.every(j => j.status === "encerrado");
  const camp = classificacao(esporte, equipeIds, js, nomeDe), ic = {}; camp.forEach((r, i) => ic[r.eid] = i);
  const cmp = (a, b) => (ic[a] ?? 999) - (ic[b] ?? 999);
  const faixas = [], usados = new Set();
  const add = (eqs, rot, extra = {}) => { const f = eqs.filter(e => e && !usados.has(e)); f.forEach(e => usados.add(e)); if (f.length) faixas.push({ eqs: f, rot, ...extra }); };
  const mj = js.filter(j => j.fase === "mata" && j.serie == null);
  if (mj.length) faixasChave(esporte, mj, cmp).forEach(f => add(f.eqs, f.rot));
  (et.series || []).forEach((s, si) => {
    const sj = js.filter(j => j.serie === si);
    if (s.tipo === "todos") classificacao(esporte, s.equipes, sj, nomeDe).forEach((r, k) => add([r.eid], (k + 1) + "º", { serie: si, posSerie: k + 1 }));
    else faixasChave(esporte, sj, cmp).forEach((f, k) => add(f.eqs, f.rot, { serie: si }));
  });
  // quem não passou dos grupos: pela colocação no grupo e depois pela campanha
  const grupos = gruposDe(et), posG = {};
  grupos.forEach((g, gi) => classificacao(esporte, g, js.filter(j => j.fase === "grupo" && j.grupo === gi), nomeDe).forEach((r, k) => posG[r.eid] = k));
  const resto = equipeIds.filter(e => !usados.has(e) && (posG[e] != null || js.some(j => j.a === e || j.b === e)));
  const porPos = {}; resto.forEach(e => (porPos[posG[e] ?? 99] ||= []).push(e));
  Object.keys(porPos).sort((a, b) => a - b).forEach(p => add(porPos[p].sort(cmp), grupos.length ? "Fase de grupos" : ""));
  // posição sequencial; nas séries, a posição dentro da série dá a medalha
  const ordem = []; let pos = 0;
  const contSerie = {};
  faixas.forEach(f => f.eqs.forEach(eid => {
    pos++;
    let med = null;
    if (f.serie != null) { contSerie[f.serie] = (contSerie[f.serie] || 0) + 1; const ps = f.posSerie || contSerie[f.serie]; if (ps <= 3 && (f.rot === "Campeã" || f.rot === "Vice" || f.rot === "3º lugar" || f.posSerie)) med = ps; }
    else if (pos <= 3 && ["Campeã", "Vice", "3º lugar"].includes(f.rot)) med = pos;
    ordem.push({ eid, pos, rot: f.rot, serie: f.serie ?? null, medalha: med, ...camp[ic[eid]] });
  }));
  return { completa, ordem };
}

// Classificação geral do torneio (todas as etapas). Critério padrão: vitórias, empates, saldo, pontos feitos.
// pontuacao (opcional, para regras de ranking da Liga): lista de pontos por colocação na etapa [1º, 2º, 3º, ...]
export function classificacaoGeral(esporte, T, jogos, nomeDe = id => id, pontuacao = null) {
  const ids = (T.equipes || []).map(e => e.id), tab = classificacao(esporte, ids, jogos.filter(j => !j.wo), nomeDe);
  const sets = {}; ids.forEach(id => sets[id] = { sv: 0, sp: 0 });
  if (esporte === "biribol") jogos.filter(j => j.status === "encerrado" && !j.wo).forEach(j => { const r = resultadoBiribol(j); if (sets[j.a]) { sets[j.a].sv += r.sa; sets[j.a].sp += r.sb; } if (sets[j.b]) { sets[j.b].sv += r.sb; sets[j.b].sp += r.sa; } });
  const porEtapa = (T.etapas || []).map((et, ei) => colocacaoEtapa(esporte, et, jogos.filter(j => j.etapa === ei), ids, nomeDe));
  const linhas = tab.map(r => {
    const etapas = porEtapa.map(c => { const x = c.ordem.find(o => o.eid === r.eid); return x ? { pos: x.pos, completa: c.completa, medalha: x.medalha, serie: x.serie } : null; });
    const fechadas = etapas.filter(x => x && x.completa);
    const medalhas = [0, 0, 0]; fechadas.forEach(x => { if (x.medalha) medalhas[x.medalha - 1]++; });
    const pts = pontuacao ? fechadas.reduce((s, x) => s + (pontuacao[x.pos - 1] || 0), 0) : null;
    return { ...r, ...sets[r.eid], etapas, medalhas, melhor: fechadas.length ? Math.min(...fechadas.map(x => x.pos)) : null, pts };
  });
  if (pontuacao) linhas.sort((a, b) => b.pts - a.pts || b.v - a.v || b.e - a.e || b.saldo - a.saldo || b.pf - a.pf);
  return { linhas, porEtapa };
}

export const potencia2 = n => n >= 1 && (n & (n - 1)) === 0;
