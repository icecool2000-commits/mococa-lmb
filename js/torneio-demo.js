// Gera um torneio fictício completo (equipes, atletas, sorteio, jogos e estatísticas) para demonstração.
import * as C from "./torneio-core.js";

// gerador aleatório com semente: a mesma demo sai igual sempre
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const NOMES = ["Adriano","Bruno","Caio","Danilo","Eduardo","Fábio","Gustavo","Heitor","Igor","João","Kauã","Leandro","Marcelo","Nícolas","Otávio","Paulo","Rafael","Sérgio","Tiago","Vinícius","Wagner","Yuri","André","Beto","Cláudio","Diego","Émerson","Felipe","Gabriel","Hugo","Ivan","Júlio","Lucas","Mateus","Nelson","Osmar","Pedro","Renato","Samuel","Túlio","Ulisses","Vitor","Willian","Alex","Breno","César","Davi","Enzo","Flávio","Guilherme","Henrique","Isaque","Jonas","Léo","Murilo","Nando","Orlando","Pietro","Ronaldo","Saulo","Teo","Valter","Xande","Zeca","Álvaro","Bento","Cristiano","Douglas","Elias","Fernando","Geraldo","Hélio","Ítalo","Jairo","Kleber","Luan","Márcio","Natan","Oscar","Paulinho","Rodrigo","Silvio","Thiago","Vagner"];
const TECNICOS = ["Carlos Mendes", "Rogério Lima", "Sandra Alves", "Marcos Paiva", "Luciana Costa", "Edson Ramos", "Patrícia Souza", "Valdir Nogueira", "Renata Prado", "Wilson Faria", "Ana Paula Reis", "Jorge Matos"];
const SOBRE = ["Silva","Souza","Oliveira","Santos","Lima","Pereira","Costa","Ribeiro","Alves","Carvalho","Gomes","Martins","Rocha","Barbosa","Moreira","Teixeira","Freitas","Mendes","Cardoso","Nunes"];
const EQ_BIRIBOL = ["Tubarões da AEM","Piratas do Lago","Golfinhos Mococa","Arraias FC","Marlins","Orcas","Lontras","Baleias Azuis","Focas","Polvos","Tritões","Moreias","Siris","Peixe-Espada","Barracudas","Cavalos-Marinhos","Pinguins","Ariranhas","Jacarés","Garoupas","Pirarucus","Dourados","Lambaris","Tilápias"];
const EQ_LIGA = ["Tubarões da AEM","Piratas de Casa Branca","Golfinhos de Itapira","Arraias de Itobi","Marlins de Tambaú","Orcas de Vargem","Lontras de São José","Baleias Azuis","Peixe-Espada Caconde","Barracudas de Guaxupé","Moreias de Arceburgo","Tritões de Santa Cruz","Focas de Mogi Mirim","Polvos de Aguaí","Siris de Pirassununga","Garoupas de Porto Ferreira","Ariranhas de Guaranésia","Jacarés de São João","Dourados de Santa Rosa","Pirarucus de Divinolândia","Cavalos-Marinhos de Mogi Guaçu","Pinguins de Tapiratiba","Lambaris de Muzambinho","Tilápias de Leme"];
const EQ_BASQUETE = ["Dinos","Raptors Mococa","Trovões","Falcões","Lobos da AEM","Panteras","Gaviões","Tigres","Corujas","Leões do Vale"];

export function gerarDemo(esporte, nomeDemo, opts = {}) {
  const SER = !!opts.series;
  const BIR = esporte === "biribol", R = rng(BIR ? 2026 : 1977);
  const int = (a, b) => a + Math.floor(R() * (b - a + 1));
  // Liga e Biribol: 24 equipes em 8 grupos de 3 -> todas as fases completas (Biribol: oitavas, quartas, semi, 3º e final;
  // Liga: séries de 8 equipes com quartas, semi, 3º lugar e final)
  const nEq = BIR ? 24 : 10, nAt = BIR ? 8 : 10;
  let ni = 0;
  const casa = opts.casa || null; // app do time: a 1ª equipe é a da casa, com o elenco
  const nomesEq = (SER ? EQ_LIGA : BIR ? EQ_BIRIBOL : EQ_BASQUETE).slice(0, nEq); if (casa) nomesEq[0] = casa.nome;
  const equipes = nomesEq.map((nome, e) => {
    if (casa && e === 0 && casa.atletas.length) return { id: "demo-e0", nome, atletas: casa.atletas.slice(0, nAt).map(a => ({ id: a.id, nome: a.nome, num: a.num ?? null })), capitao: casa.capitao || null, tecnico: casa.tecnico || "" };
    const nums = C.embaralhar(Array.from({ length: 30 }, (_, i) => i + 1), R).slice(0, nAt).sort((a, b) => a - b);
    return { id: "demo-e" + e, nome, atletas: nums.map((num, k) => ({ id: "demo-e" + e + "a" + k, num, nome: NOMES[(ni++ * 7) % NOMES.length] + " " + SOBRE[(e * 3 + k) % SOBRE.length][0] + "." })) };
  });
  // força de cada equipe e de cada atleta (para os resultados fazerem sentido)
  const forca = {}; equipes.forEach((e, i) => forca[e.id] = 1 - i * 0.05 + R() * 0.25);
  const peso = {}; equipes.forEach(e => e.atletas.forEach((a, k) => peso[a.id] = k < 3 ? 3 + R() * 3 : k < 6 ? 1 + R() * 2 : 0.2 + R()));

  const etapas = [
    { id: "demo-s1", nome: "1ª etapa", local: "AEM", data: "2026-11-21", hora: BIR ? "19:00" : "10:00", grupos: [], classificam: 2, sorteio: "auto", ...(SER ? { formato: "series", disputaSeries: "auto", series: [] } : {}) },
    { id: "demo-s2", nome: "2ª etapa", local: "AEM", data: "2026-12-12", hora: BIR ? "19:00" : "10:00", grupos: [], classificam: null, sorteio: "direto" }];
  if (BIR) Object.assign(etapas[1], { classificam: 2, sorteio: "auto" }, SER ? { formato: "series", disputaSeries: "auto", series: [] } : {});

  const jogos = [];
  let extremosFeitos = { max: false, min: false };
  const vence = (a, b) => R() < forca[a] / (forca[a] + forca[b]);

  // distribui os pontos de uma equipe entre os atletas
  function distribuir(eq, pontos, st, valores) {
    const ats = eq.atletas, tot = ats.reduce((s, a) => s + peso[a.id], 0);
    let resta = pontos;
    while (resta > 0) {
      let r = R() * tot, alvo = ats[0];
      for (const a of ats) { r -= peso[a.id]; if (r <= 0) { alvo = a; break; } }
      const v = valores ? Math.min(resta, valores[Math.floor(R() * valores.length)]) : 1;
      const x = st[alvo.id] || (st[alvo.id] = { p: 0, b: 0, as: 0 });
      x.p += v; resta -= v;
      if (!BIR) x["c" + v] = (x["c" + v] || 0) + 1; // cestas de 3, de 2 e lances livres
    }
  }
  const eqDe = id => equipes.find(e => e.id === id);

  function jogarBiribol(j, forcarVencedor) {
    const sets = []; let sa = 0, sb = 0;
    const venceJogo = forcarVencedor ? forcarVencedor === j.a : vence(j.a, j.b);
    while (sa < 2 && sb < 2) {
      const i = sets.length, alvo = i < 2 ? 21 : 15;
      // quem leva o set: tende ao vencedor do jogo, mas pode virar
      let ladoA = R() < (venceJogo ? 0.7 : 0.3);
      if ((ladoA && sa === 1 && !venceJogo) || (!ladoA && sb === 1 && venceJogo)) ladoA = !ladoA;
      let w = alvo, l = int(i < 2 ? 8 : 6, alvo - 2);
      if (R() < 0.18) { w = alvo + int(1, 3); l = w - 2; } // disputa na vantagem (20x20 ou 14x14)
      if (!extremosFeitos.min && i === 0) { w = 21; l = 5; extremosFeitos.min = true; } // menor pontuação: 5
      if (!extremosFeitos.max && i === 2) { w = 30; l = 28; extremosFeitos.max = true; } // tiebreak até 30
      sets.push(ladoA ? { a: w, b: l } : { a: l, b: w });
      ladoA ? sa++ : sb++;
    }
    j.sets = sets; j.status = "encerrado";
    const st = {}; const pa = sets.reduce((s, x) => s + x.a, 0), pb = sets.reduce((s, x) => s + x.b, 0);
    distribuir(eqDe(j.a), Math.round(pa * 0.85), st); distribuir(eqDe(j.b), Math.round(pb * 0.85), st); // ~15% vêm de erro do adversário
    extrasStats(j, st); j.stats = st;
    j.venc = C.resultadoBiribol(j).venc;
  }

  function jogarBasquete(j, mata) {
    let ta = Math.round(50 + forca[j.a] * 22 + (R() - 0.5) * 26), tb = Math.round(50 + forca[j.b] * 22 + (R() - 0.5) * 26);
    ta = Math.max(24, Math.min(97, ta)); tb = Math.max(24, Math.min(97, tb));
    if (!extremosFeitos.max) { ta = 100; extremosFeitos.max = true; }          // maior pontuação: 100
    else if (!extremosFeitos.min) { tb = 20; extremosFeitos.min = true; }      // menor pontuação: 20
    else if (!mata && R() < 0.15) tb = ta;                                      // empate na classificação
    let forcaExtra = null;
    if (mata && !extremosFeitos.prorrog) { tb = ta; forcaExtra = "P"; extremosFeitos.prorrog = true; }   // um jogo com prorrogação
    else if (mata && !extremosFeitos.bo) { tb = ta; forcaExtra = "BO"; extremosFeitos.bo = true; }        // um jogo na bola de ouro
    const quartos = t => { const q = [0, 0, 0, 0]; for (let p = 0; p < t; p++) q[Math.floor(R() * 4)]++; return q; };
    const qa = quartos(ta), qb = quartos(tb);
    j.periodos = [0, 1, 2, 3].map(i => ({ n: (i + 1) + "Q", a: qa[i], b: qb[i] }));
    if (mata && ta === tb) {
      if (forcaExtra === "P" || (!forcaExtra && R() < 0.6)) { const pa = int(4, 10); j.periodos.push({ n: "P1", a: pa, b: pa + (R() < 0.5 ? 2 : -2) }); }
      else { j.periodos.push({ n: "P1", a: 6, b: 6 }); j.periodos.push(R() < 0.5 ? { n: "BO", a: 2, b: 0 } : { n: "BO", a: 0, b: 2 }); }
    }
    const A = j.periodos.reduce((s, p) => s + p.a, 0), B = j.periodos.reduce((s, p) => s + p.b, 0);
    j.status = "encerrado";
    const st = {}; distribuir(eqDe(j.a), A, st, [1, 2, 2, 2, 3]); distribuir(eqDe(j.b), B, st, [1, 2, 2, 2, 3]);
    extrasStats(j, st); j.stats = st;
    j.venc = C.resultadoBasquete(j).venc;
    if (opts.mesa) mesaBasquete(j, st);
  }

  // mesa do basquete (regras FIBA): titulares, substituições, faltas por quarto com penalidade, lances livres, tempos e posse
  function mesaBasquete(j, st) {
    const ats = { a: eqDe(j.a).atletas.map(a => a.id), b: eqDe(j.b).atletas.map(a => a.id) };
    const ini = { a: ats.a.slice(0, 5), b: ats.b.slice(0, 5) }, quadra = { a: [...ini.a], b: [...ini.b] };
    const salto = R() < 0.5 ? "a" : "b", ev = [], F = {}, llUsado = {}, pick = arr => arr[int(0, arr.length - 1)];
    const fora = id => { const x = F[id]; return x && (x.n >= 5 || x.D || x.T + x.U >= 2); };
    const qs = j.periodos.map(p => p.n).filter(n => n !== "BO");
    let seta = salto === "a" ? "b" : "a";
    qs.forEach(q => {
      if (q !== "1Q") { ev.push({ t: "pos", l: seta, q }); seta = seta === "a" ? "b" : "a"; }
      const eqF = { a: 0, b: 0 }, ot = /^P/.test(q);
      if (q === "4Q" || ot) ["a", "b"].forEach(l => eqF[l] = ev.filter(e => e.t === "f" && e.l === l && (e.q === "4Q" || /^P/.test(e.q)) && e.quem !== "tec").length);
      const lances = [];
      ["a", "b"].forEach(l => { const n = ot ? int(1, 3) : int(3, 6); for (let i = 0; i < n; i++) lances.push(["f", l]); const tos = ot ? (R() < 0.4 ? 1 : 0) : q === "1Q" || q === "3Q" ? int(0, 1) : int(0, q === "4Q" ? 2 : 1); for (let i = 0; i < tos; i++) lances.push(["to", l]); if (!ot && R() < 0.6) lances.push(["s", l]); });
      lances.sort(() => R() - 0.5);
      lances.forEach(([t, l]) => {
        const op = l === "a" ? "b" : "a";
        if (t === "to") { const usados = ev.filter(e => e.t === "to" && e.l === l && (ot ? e.q === q : (q < "3Q" ? e.q < "3Q" : e.q >= "3Q" && !/^P/.test(e.q)))).length; if (usados < (ot ? 1 : q < "3Q" ? 2 : 3)) ev.push({ t: "to", l, q, u2: false }); return; }
        if (t === "s") { const banco = ats[l].filter(id => !quadra[l].includes(id) && !fora(id)); if (!banco.length) return; const k = int(0, 4), sai = quadra[l][k], entra = pick(banco); quadra[l][k] = entra; ev.push({ t: "s", l, sai, entra, q }); return; }
        // falta
        if (R() < 0.04) { ev.push({ t: "f", l, quem: "tec", tipo: R() < 0.7 ? "C" : "B", arr: 0, conv: false, q, ll: 1, sofreu: quadra[op][0] }); llLances(op, quadra[op][0], 1, q); return; }
        const quem = pick(quadra[l].filter(id => !fora(id)).concat(quadra[l]).slice(0, 5)); if (fora(quem)) return;
        const x = R(), tipo = x < 0.84 ? "P" : x < 0.92 ? "O" : x < 0.96 ? "T" : x < 0.995 ? "U" : "D";
        let arr = 0, conv = false;
        if ((tipo === "P" || tipo === "U") && R() < 0.38) { const y = R(); arr = y < 0.12 ? 3 : 2; conv = y > 0.8; }
        const pen = eqF[l] >= 4;
        const ll = tipo === "O" ? 0 : tipo === "T" ? 1 : tipo === "U" || tipo === "D" ? (arr ? (conv ? 1 : arr) : 2) : arr ? (conv ? 1 : arr) : pen ? 2 : 0;
        const sofreu = pick(quadra[op]);
        const fx = F[quem] || (F[quem] = { n: 0, T: 0, U: 0, D: 0 }); fx.n++; if (fx[tipo] != null) fx[tipo]++;
        eqF[l]++;
        ev.push({ t: "f", l, quem, tipo, arr, conv, q, ll, sofreu: ll || conv ? sofreu : null, ...(conv ? { pts: arr } : {}) });
        if (ll) llLances(op, sofreu, ll, q);
        if (fora(quem)) { const banco = ats[l].filter(id => !quadra[l].includes(id) && !fora(id)); if (banco.length) { const entra = pick(banco); quadra[l][quadra[l].indexOf(quem)] = entra; ev.push({ t: "s", l, sai: quem, entra, q }); } }
      });
    });
    function llLances(l, aid, n, q) { for (let i = 0; i < n; i++) { const pode = (st[aid] ? st[aid].c1 || 0 : 0) - (llUsado[aid] || 0) > 0, ok = pode && R() < 0.72; if (ok) llUsado[aid] = (llUsado[aid] || 0) + 1; ev.push({ t: "ll", l, aid, ok, q }); } }
    // lances livres convertidos que ainda não apareceram na mesa (a súmula e a mesa ficam iguais)
    Object.entries(st).forEach(([aid, x]) => { let falta = (x.c1 || 0) - (llUsado[aid] || 0); const l = ats.a.includes(aid) ? "a" : "b"; while (falta-- > 0) ev.push({ t: "ll", l, aid, ok: true, q: pick(qs) }); });
    j.mesa = { q: qs[qs.length - 1] || "4Q", ini, salto, ev, pend: null };
  }

  function extrasStats(j, st) {
    [j.a, j.b].forEach(id => eqDe(id).atletas.forEach(a => {
      const x = st[a.id] || (st[a.id] = { p: 0, b: 0, as: 0 });
      x.b += R() < 0.35 ? int(1, BIR ? 3 : 2) : 0; x.as += R() < 0.5 ? int(1, BIR ? 4 : 5) : 0;
    }));
  }
  const jogar = (j, mata) => BIR ? jogarBiribol(j) : jogarBasquete(j, mata);

  const nomeDe = id => eqDe(id).nome;
  let ordem = 0;
  // etapa com grupos: todos contra todos, depois séries (Liga) ou mata-mata
  function etapaGrupos(ei, nG, q) {
    const grupos = C.distribuir(C.embaralhar(equipes.map(e => e.id), R), nG);
    etapas[ei].grupos = C.gruposParaSalvar(grupos); etapas[ei].classificam = q;
    grupos.forEach((g, gi) => C.todosContraTodos(g).forEach((par, r) => par.forEach(([a, b], o) => {
      const j = { id: "demo-j" + (ordem++), etapa: ei, fase: "grupo", grupo: gi, rodada: r + 1, ordem: o, a, b, faseNome: "Grupo " + C.letraGrupo(gi), stats: {} };
      jogar(j, false); jogos.push(j);
    })));
    const porGrupo = grupos.map((g, gi) => C.classificacao(esporte, g, jogos.filter(j => j.etapa === ei && j.grupo === gi), nomeDe).slice(0, q));
    if (SER) {
      // Liga: 1ºs na Série Ouro, 2ºs na Prata, 3ºs na Bronze
      const series = C.montarSeries(porGrupo, 3, false);
      etapas[ei].series = series;
      series.forEach((s, si) => mataMata(ei, s.equipes.map(eid => ({ eid, grupo: null })), { serie: si, prefixo: C.SERIES[si] + " · " }));
    } else mataMata(ei, C.ordenarQualificados(porGrupo));
  }
  if (BIR) { etapaGrupos(0, 8, SER ? 3 : 2); etapaGrupos(1, 8, SER ? 3 : 2); }
  else {
    // Basquete: 1ª etapa com grupos; 2ª etapa mata-mata direto (ordem de campanha da 1ª)
    etapaGrupos(0, C.sugerirGrupos(nEq), C.sugerirClassificados(nEq, C.sugerirGrupos(nEq)));
    const camp = C.classificacao(esporte, equipes.map(e => e.id), jogos, nomeDe);
    mataMata(1, camp.map((r, i) => ({ eid: r.eid, grupo: null, pos: i + 1 })));
  }

  function mataMata(ei, qual, extra = {}) {
    const est = C.estruturaChave(qual, () => "demo-j" + (ordem++)), pre = extra.prefixo || "", base = extra.serie != null ? { serie: extra.serie } : {};
    const porId = {};
    est.rodadas.forEach((rod, ri) => rod.forEach(m => {
      const j = { id: m.id, etapa: ei, fase: "mata", ...base, rodada: m.rodada, ordem: m.ordem, faseNome: pre + C.nomeFase(rod.length), stats: {} };
      if (ri === 0) {
        const a = m.x ? m.x.eid : null, b = m.y ? m.y.eid : null;
        j.a = a || b; j.b = a && b ? b : null;
        if (!a || !b) { j.wo = a || b; j.status = "encerrado"; j.venc = j.wo; if (BIR) j.sets = []; else j.periodos = []; porId[j.id] = j; jogos.push(j); return; }
      } else { j.de = m.de; j.a = porId[m.de[0]].venc; j.b = porId[m.de[1]].venc; }
      jogar(j, true); porId[j.id] = j; jogos.push(j);
    }));
    if (est.terceiro) {
      const t = est.terceiro, perd = id => { const x = porId[id]; return x.venc === x.a ? x.b : x.a; };
      const j = { id: t.id, etapa: ei, fase: "mata", ...base, rodada: t.rodada, ordem: t.ordem, perd: t.perd, a: perd(t.perd[0]), b: perd(t.perd[1]), faseNome: pre ? pre + "3º lugar" : C.TERCEIRO, stats: {} };
      jogar(j, true); jogos.push(j);
    }
  }

  // comissão: capitão em todas as equipes (um dos 3 melhores) e técnico em quase todas
  equipes.forEach((e, i) => {
    if (!e.capitao && e.atletas.length) e.capitao = e.atletas[int(0, Math.min(2, e.atletas.length - 1))].id;
    if (e.tecnico == null || e.tecnico === "") e.tecnico = R() < 0.85 ? "Prof. " + TECNICOS[(i * 5) % TECNICOS.length] : "";
  });
  // disciplina (biribol): advertências, cartões e sanções por demora seguindo a escala oficial
  if (BIR) jogos.filter(j => j.a && j.b && !j.wo && j.status === "encerrado").forEach(j => {
    const x = R(); if (x > 0.32) return;
    const sets = (j.sets || []).filter(s2 => s2.a || s2.b), si = int(0, Math.max(0, sets.length - 1)), st = sets[si] || { a: 0, b: 0 };
    const pl = () => Math.max(0, Math.round(st.a * (0.2 + R() * 0.7))) + "-" + Math.max(0, Math.round(st.b * (0.2 + R() * 0.7)));
    const l = R() < 0.5 ? "a" : "b", eq = eqDe(j[l]), atl = () => eq.atletas[int(0, eq.atletas.length - 1)].id;
    const sc = []; const add = (tipo, quem) => sc.push({ tipo, l, quem, set: si, placar: pl(), em: 0, ...(opts.cartoesLiga ? { regra: "liga" } : {}) });
    if (x < 0.14) add("adv", atl());                                      // só advertência verbal
    else if (x < 0.22) { const q = atl(); add("adv", atl()); add("amarelo", q); }   // advertência e depois amarelo
    else if (x < 0.26) add("advDemora", "eq");                            // demora
    else if (x < 0.28) { add("advDemora", "eq"); add("penDemora", "eq"); }
    else if (x < 0.30) { const q = atl(); add("adv", atl()); add("amarelo", q); add("vermelho", q); } // amarelo e depois vermelho
    else if (x < 0.31) add(opts.cartoesLiga ? "desq" : "vermelho", atl()); // vermelho direto / Liga: amarelo + vermelho juntos (fora da etapa)
    else { add("adv", "tec"); add("amarelo", "tec"); }                    // técnico advertido e punido
    // placares em ordem crescente (a advertência vem antes do cartão)
    const pls = sc.map(x => x.placar).sort((p1, p2) => p1.split("-").reduce((t, v) => t + +v, 0) - p2.split("-").reduce((t, v) => t + +v, 0));
    sc.forEach((x, i) => { x.placar = pls[i]; x.em = i; });
    j.sancoes = sc;
  });

  const torneio = { nome: "[DEMO] " + (nomeDemo || (BIR ? "Copa Biribol Mococa" : "Copa Família Basquete Mococa")), demo: true, equipes, etapas, criado: Date.now() };
  return { torneio, jogos: jogos.map(j => ({ ...j, criado: Date.now() })) };
}
