// Importa uma etapa de um torneio do app da Liga (coleção lmb_torneios) para a história de Mococa.
// Pega só os jogos da equipe escolhida; os números individuais só dos atletas dessa equipe.
import * as T from "./torneio-core.js";
import { chaveNome } from "./calc.js";

export const acharMococa = torneio => (torneio.equipes || []).find(e => chaveNome(e.nome).includes("mococa")) || null;

// sugestão de correspondência: atleta do torneio -> atleta do elenco (mesmo nome, ou mesmo primeiro nome se for único)
export function sugerirMapa(equipe, elenco) {
  const mapa = {};
  (equipe.atletas || []).forEach(a => {
    const mesmoId = elenco.find(x => x.id === a.id);
    if (mesmoId) { mapa[a.id] = mesmoId.id; return; }
    const k = chaveNome(a.nome), igual = elenco.find(x => chaveNome(x.nome) === k);
    const pn = k.split(" ")[0], mesmos = elenco.filter(x => chaveNome(x.nome).split(" ")[0] === pn);
    mapa[a.id] = igual ? igual.id : mesmos.length === 1 ? mesmos[0].id : "novo";
  });
  return mapa;
}

function chaveDoJogo(j) {
  if (j.perd) return "terceiro";
  if (j.fase === "serie") return "rr";
  const n = (j.faseNome || "").toLowerCase();
  if (n.endsWith("final") && !n.includes("semi") && !n.includes("quartas") && !n.includes("oitavas") && !n.includes("avos")) return "final";
  if (n.includes("semifinal")) return "semi";
  if (n.includes("quartas")) return "quartas";
  if (n.includes("oitavas")) return "oitavas";
  if (n.includes("16 avos")) return "dezesseis";
  return "final";
}

// mapaIds: atleta do torneio -> id do elenco de Mococa (já resolvido, sem "novo"); "ignorar" fica de fora
export function montarEtapa(torneio, jogos, ei, eid, mapaIds) {
  const et = torneio.etapas[ei], nome = id => ((torneio.equipes || []).find(e => e.id === id) || {}).nome || "?";
  const eq = torneio.equipes.find(e => e.id === eid), meus = new Set((eq.atletas || []).map(a => a.id));
  const js = jogos.filter(j => j.etapa === ei && (j.a === eid || j.b === eid));
  const grupos = T.gruposDe(et), gi = grupos.findIndex(g => g.includes(eid));
  let posGrupo = null;
  if (gi >= 0) {
    const jg = jogos.filter(j => j.etapa === ei && j.fase === "grupo" && j.grupo === gi);
    if (jg.length && jg.every(j => j.status === "encerrado")) posGrupo = T.classificacao("biribol", grupos[gi], jg, nome).findIndex(r => r.eid === eid) + 1 || null;
  }
  const si = (et.series || []).findIndex(s => (s.equipes || []).includes(eid));
  const partidas = [], usados = new Set();
  let pendentes = 0;
  js.forEach(j => {
    if (j.wo && !j.b) return;                         // folga (bye): não é partida
    if (j.status !== "encerrado") { pendentes++; return; }
    const ladoA = j.a === eid, adv = ladoA ? j.b : j.a;
    const p = { id: "lmb-" + j.id, importado: true, adversario: nome(adv), wo: null, obs: "", ordem: (j.rodada || 0) * 10 + (j.ordem || 0) };
    if (j.fase === "grupo") { p.fase = "grupo"; p.grupo = T.letraGrupo(j.grupo); p.rodada = j.rodada || 1; }
    else { p.chave = chaveDoJogo(j); if (j.serie != null) { p.fase = "serie"; p.serie = j.serie; } else p.fase = "mata"; if (p.chave === "rr") p.rodada = j.rodada || 1; }
    p.sets = (j.sets || []).filter(s => (s.a || 0) + (s.b || 0) > 0).map(s => ({ m: ladoA ? s.a || 0 : s.b || 0, a: ladoA ? s.b || 0 : s.a || 0 }));
    p.stats = {};
    Object.entries(j.stats || {}).forEach(([aid, s]) => {
      if (!meus.has(aid)) return;                     // só atletas de Mococa
      const alvo = mapaIds[aid]; if (!alvo || alvo === "ignorar") return;
      usados.add(alvo);
      const x = p.stats[alvo] || (p.stats[alvo] = { p: 0, b: 0, as: 0 }); x.p += s.p || 0; x.b += s.b || 0; x.as += s.as || 0;
    });
    Object.keys(p.stats).forEach(k => { const x = p.stats[k]; if (!x.p && !x.b && !x.as) delete p.stats[k]; });
    partidas.push(p);
  });
  // colocação final pela classificação da própria Liga (resolve série em pontos corridos, onde só os jogos de Mococa não bastam)
  let posAuto = null, posAutoTxt = null;
  try {
    T.definirRegra({ pontosSets: true }); // regra de pontos da Liga (2x0 = 3, 2x1 = 2 e 1)
    const jsEt = jogos.filter(j => j.etapa === ei && !(j.wo && !j.b));
    const ids = (torneio.equipes || []).map(e => e.id), col = T.colocacaoEtapa("biribol", et, jsEt, ids, nome);
    const linha = col.ordem.find(r => r.eid === eid);
    if (linha && si >= 0) {
      const daSerie = jsEt.filter(j => j.serie === si);
      if (daSerie.length && daSerie.every(j => j.status === "encerrado")) { posAuto = col.ordem.filter(r => r.serie === si).findIndex(r => r.eid === eid) + 1 || null; posAutoTxt = linha.rot || null; }
    } else if (linha && col.completa && linha.medalha) { posAuto = linha.pos; posAutoTxt = linha.rot || null; }
  } catch (e) { console.error(e); }
  const doTime = [...new Set(Object.values(mapaIds).filter(v => v && v !== "ignorar" && v !== "novo"))];
  return {
    id: "lmb-" + torneio.id + "-" + ei,
    etapa: { nome: (et.nome || "Etapa") + " · " + (torneio.nome || "Liga"), temporada: et.data ? +et.data.slice(0, 4) : new Date().getFullYear(), local: et.local || "", data: et.data || "", hora: et.hora || "",
      status: "realizada", posGrupo, serie: si >= 0 ? si : null, posAuto, posAutoTxt, origem: { torneio: torneio.id, etapa: ei, equipe: eid, nomeTorneio: torneio.nome || "" } },
    partidas, pendentes, atletas: usados.size ? [...usados] : doTime, grupo: gi >= 0 ? T.letraGrupo(gi) : null
  };
}
