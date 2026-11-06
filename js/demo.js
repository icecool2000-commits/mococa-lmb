// Dados fictícios para conhecer o app: atletas de Mococa e duas temporadas de etapas da Liga.
import { SERIES } from "./calc.js";

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const ATLETAS = [["Raul", 7], ["Clayton", 10], ["Ricardo", 4], ["Antônio", 12], ["Marcelo", 9], ["Fábio", 3], ["Diego", 11], ["Gustavo", 5], ["Leandro", 8], ["Paulo", 2], ["Rafael", 14], ["Thiago", 6]];
const ADV = [["Tubarões de Casa Branca", 1.15], ["Piratas de Tambaú", 1.0], ["Golfinhos de Itobi", 0.85], ["Arraias de Vargem", 0.8], ["Marlins de São José", 1.1], ["Orcas de Guaxupé", 0.95], ["Lontras de Arceburgo", 0.7], ["Baleias de Caconde", 0.9],
  ["Barracudas de Mogi Mirim", 1.05], ["Moreias de Aguaí", 0.75], ["Tritões de Pirassununga", 1.2], ["Siris de Porto Ferreira", 0.8]];
const LOCAIS = ["Mococa – AEM", "Casa Branca", "Tambaú", "Itobi", "São José do Rio Pardo", "Guaxupé", "Vargem Grande do Sul", "Caconde", "Mogi Mirim"];
const AGENDA = [[2025, ["2025-03-15", "2025-05-24", "2025-08-09", "2025-10-18"]], [2026, ["2026-03-14", "2026-04-25", "2026-06-13", "2026-08-22", "2026-10-10"]]];

export function gerarDemo() {
  const R = rng(5150), int = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = a => a[Math.floor(R() * a.length)];
  const atletas = ATLETAS.map(([nome, num], i) => ({ id: "demo-a" + i, nome, num, ativo: true, demo: true, criado: Date.now() + i }));
  const freq = atletas.map((_, i) => 0.95 - i * 0.055);           // uns vão a quase todas, outros menos
  const peso = atletas.map((_, i) => i < 4 ? 3 + R() * 2 : i < 8 ? 1.5 + R() : 0.6 + R() * 0.6);
  const FORCA = 1.0;
  const etapas = [];
  let n = 0;

  function sets(vence) {
    const out = []; let sm = 0, sa = 0;
    while (sm < 2 && sa < 2) {
      const i = out.length, alvo = i < 2 ? 21 : 15;
      let meu = R() < (vence ? 0.72 : 0.28);
      if ((meu && sm === 1 && !vence) || (!meu && sa === 1 && vence)) meu = !meu;
      let w = alvo, l = int(i < 2 ? 9 : 6, alvo - 2);
      if (R() < 0.15) { w = alvo + int(1, 3); l = w - 2; }
      out.push(meu ? { m: w, a: l } : { m: l, a: w }); meu ? sm++ : sa++;
    }
    return out;
  }
  function stats(part, ss) {
    const st = {}, tot = part.reduce((s, aid) => s + peso[atletas.findIndex(a => a.id === aid)], 0);
    let resta = Math.round(ss.reduce((s, x) => s + x.m, 0) * 0.85);
    while (resta > 0) {
      let r = R() * tot, alvo = part[0];
      for (const aid of part) { r -= peso[atletas.findIndex(a => a.id === aid)]; if (r <= 0) { alvo = aid; break; } }
      (st[alvo] || (st[alvo] = { p: 0, b: 0, as: 0 })).p++; resta--;
    }
    part.forEach(aid => { const x = st[aid] || (st[aid] = { p: 0, b: 0, as: 0 }); if (R() < 0.35) x.b += int(1, 3); if (R() < 0.5) x.as += int(1, 4); });
    return st;
  }
  function partida(part, base, adv) {
    const f = ADV.find(a => a[0] === adv)[1], vence = R() < FORCA / (FORCA + f) + 0.05;
    const ss = sets(vence);
    return { id: "demo-p" + (n++), ...base, adversario: adv, sets: ss, stats: stats(part, ss) };
  }

  AGENDA.forEach(([ano, datas]) => datas.forEach((data, k) => {
    const part = atletas.filter((_, i) => R() < freq[i]).map(a => a.id).slice(0, 8);
    while (part.length < 6) { const a = pick(atletas).id; if (!part.includes(a)) part.push(a); }
    const advs = [...ADV.map(a => a[0])].sort(() => R() - 0.5);
    const grupo = "ABCDEFGH"[int(0, 7)], ps = [];
    ps.push(partida(part, { fase: "grupo", grupo, rodada: 1, ordem: 0 }, advs[0]));
    ps.push(partida(part, { fase: "grupo", grupo, rodada: 2, ordem: 1 }, advs[1]));
    const vit = ps.filter(p => { const s = p.sets; let a = 0; s.forEach(x => { if (x.m > x.a) a++; }); return a === 2; }).length;
    const posGrupo = vit === 2 ? 1 : vit === 0 ? 3 : (R() < 0.6 ? 2 : 1);
    const serie = posGrupo - 1;
    // série com 8 equipes: quartas, semifinal, final ou 3º lugar
    const ganhou = p => p.sets.filter(x => x.m > x.a).length === 2;
    const q = partida(part, { fase: "serie", serie, chave: "quartas", ordem: 2 }, advs[2]); ps.push(q);
    if (ganhou(q)) {
      const s = partida(part, { fase: "serie", serie, chave: "semi", ordem: 3 }, advs[3]); ps.push(s);
      ps.push(partida(part, { fase: "serie", serie, chave: ganhou(s) ? "final" : "terceiro", ordem: 4 }, advs[4]));
    }
    etapas.push({ id: "demo-e" + ano + "-" + k, demo: true, temporada: ano, nome: (k + 1) + "ª etapa " + ano, local: LOCAIS[(k * 2 + ano) % LOCAIS.length], data, hora: "09:00",
      status: "realizada", atletas: part, posGrupo, serie, partidas: ps, obs: k === 1 && ano === 2026 ? "Etapa disputada debaixo de chuva; a equipe virou dois sets no tiebreak." : "", criado: Date.now() });
  }));
  etapas.push({ id: "demo-prox", demo: true, temporada: 2026, nome: "6ª etapa 2026", local: "Mococa – AEM", data: "2026-12-05", hora: "09:00", status: "proxima", atletas: [], partidas: [], obs: "", criado: Date.now() });
  const confirmacoes = atletas.slice(0, 5).map((a, i) => ({ id: "demo-c" + i, nome: a.nome, aid: a.id, uid: "demo", em: Date.now() - (5 - i) * 3600e3 }));
  return { atletas, etapas, confirmacoes, SERIES };
}
