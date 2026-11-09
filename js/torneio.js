// Modo Torneio: cadastro, equipes, etapas, chaveamento, súmula e estatísticas.
// Compartilhado pelos apps do Biribol e do Basquete (o esporte vem em ctx.esporte).
import * as C from "./torneio-core.js";
import { gerarDemo } from "./torneio-demo.js";
import * as X from "./exportar.js";
import { montarMidias } from "./midias.js";
import { montarAoVivo } from "./aovivo.js";
import * as R from "./rodizio.js";
import { montarEstatEquipe, botoesRelatorio } from "./estatequipe.js";

export function montarTorneio(ctx) {
  const { db, fs, esporte, col, maxAtletas, toast } = ctx;
  const { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch } = fs;
  const BIR = esporte === "biribol";
  const root = ctx.root;
  const podeEditar = () => ctx.podeEditar();
  const LS = k => "torneio-" + esporte + "-" + k;
  const ls = { get(k){ try { return localStorage.getItem(LS(k)); } catch(e){ return null; } }, set(k,v){ try { localStorage.setItem(LS(k), v); } catch(e){} } };

  let torneios = [], tid = ls.get("tid"), T = null, jogos = [], aba = ls.get("aba") || "geral", etapaSel = 0;
  let unsubJogos = null, sumulaJid = null, sumulaLocal = null, salvarTimer = null, filtroEtapa = "todas", filtroFase = "todas", equipeSel = null;
  let formNovo = false, editandoGeral = false, sorteioRascunho = null, confirmar = null, montagem = null;

  /* ---------- utilitários de tela ---------- */
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "style") e.style.cssText = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    kids.flat(9).forEach(c => { if (c == null || c === false) return; e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  const pad = n => String(n).padStart(2, "0");
  const fmtData = s => { if (!s) return ""; const [y, m, d] = s.split("-"); return d + "/" + m + "/" + y; };
  const eqNome = id => (T && T.equipes.find(e => e.id === id) || {}).nome || "—";
  const eqDe = id => T && T.equipes.find(e => e.id === id);
  // capitão de cada equipe (equipe.capitao = id do atleta) aparece como "(C)" em todo lugar; técnico = equipe.tecnico
  const capTag = (e, a) => e && a && e.capitao === a.id ? " (C)" : "";
  const atletaDe = aid => { for (const e of (T ? T.equipes : [])) { const a = (e.atletas || []).find(x => x.id === aid); if (a) return { ...a, nome: a.nome + capTag(e, a), eid: e.id, enome: e.nome }; } return null; };
  const ref = () => doc(db, col, T.id);
  const jogoRef = jid => doc(db, col, T.id, "jogos", jid);
  const jogosEtapa = i => jogos.filter(j => j.etapa === i);
  const res = j => C.resultado(esporte, j);
  const MED = ["🥇", "🥈", "🥉"];
  // aba Mídias (fotos e vídeos + Instagram), se o app configurar ctx.midias = { app, perfis, hashtags }
  let MID = null;
  if (ctx.midias) setTimeout(() => {
    MID = montarMidias({ db, fs: ctx.fs, h, toast, app: ctx.midias.app, perfisPadrao: ctx.midias.perfis, hashtags: ctx.midias.hashtags, podeEditar: () => podeEditar(),
      perguntar: (m, f, r) => perguntar(m, f, r), torneio: () => T ? { id: T.id, nome: T.nome } : null, autor: ctx.autor, render: () => render() });
    render();
  }, 0);
  // aba Ao vivo (YouTube + placar da súmula + Instagram), se o app configurar ctx.aoVivo = { app, canal:{ id, handle }, instagram }
  let AV = null;
  if (ctx.aoVivo) setTimeout(() => {
    AV = montarAoVivo({ db, fs: ctx.fs, h, toast, esporte, col, app: ctx.aoVivo.app, canal: ctx.aoVivo.canal, canalDe: ctx.aoVivo.canalDe, instagram: ctx.aoVivo.instagram, marca: ctx.marca, autor: ctx.autor,
      podeEditar: () => podeEditar(), perguntar: (m, f, r) => perguntar(m, f, r), torneio: () => T, jogos: () => jogos, torneioId: () => T && T.id,
      abrirSumula: jid => { if (jogos.find(j => j.id === jid)) abrirSumula(jid); }, mudouVivo: () => render() });
    render();
  }, 0);
  const SERIES_OK = !!ctx.formatoSeries;
  // aba "Estatísticas por Equipe" (ctx.statsEquipe): escolhe torneio (ou todos) e equipe
  let EQ = null;
  if (ctx.statsEquipe) setTimeout(() => { EQ = montarEstatEquipe({ db, fs: ctx.fs, esporte, fontes: [[col, "Este app"]], marca: ctx.marca, toast, render, X, torneioAtual: () => T && T.id, titulo: "Estatísticas por equipe" }); render(); }, 0);
  const ROD = !!ctx.rodizio && esporte === "biribol"; // rodízio dos jogadores na súmula (Liga)
  C.definirRegra({ pontosSets: !!ctx.pontosSets });
  const PTS = () => C.REGRA.pontosSets;
  const TXT_CRIT = () => PTS() ? "Pontos: 2x0 = 3 pts; 2x1 = 2 pts para quem vence e 1 pt para quem perde. Desempate: pontos marcados." : "Desempate: vitórias, " + (BIR ? "" : "empates, ") + "saldo de pontos e pontos feitos.";
  // equipe da casa (app do time): nome e atletas vêm do elenco
  const casa = () => { const c = ctx.equipeCasa ? ctx.equipeCasa() : null; return c && c.nome ? { nome: c.nome, atletas: (c.atletas || []).slice(0, maxAtletas).map(a => ({ id: a.id, nome: a.nome, num: a.num ?? null })), capitao: c.capitao || null, tecnico: c.tecnico || "" } : null; }; // Liga: 3 primeiros de cada grupo formam as séries Ouro, Prata e Bronze

  /* ---------- dados ---------- */
  onSnapshot(collection(db, col), snap => {
    torneios = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.criado || 0) - (a.criado || 0));
    if (!torneios.find(t => t.id === tid)) tid = torneios[0] ? torneios[0].id : null;
    escolher(tid, true);
  }, e => { console.error(e); });

  function escolher(id, doSnapshot) {
    const mudou = !T || !id || T.id !== id;
    tid = id; ls.set("tid", id || "");
    T = torneios.find(t => t.id === id) || null;
    if (T) { T.equipes = T.equipes || []; T.etapas = T.etapas || []; }
    if (etapaSel >= (T ? T.etapas.length : 0)) etapaSel = 0;
    if (mudou) {
      if (unsubJogos) unsubJogos(); jogos = []; unsubJogos = null;
      if (T) unsubJogos = onSnapshot(collection(db, col, T.id, "jogos"), s => {
        jogos = s.docs.map(d => ({ id: d.id, ...d.data() }));
        if (sumulaJid && sumulaLocal && podeEditar() && salvarTimer) { render(); return; }
        if (sumulaJid) sumulaLocal = JSON.parse(JSON.stringify(jogos.find(j => j.id === sumulaJid) || null));
        render();
      });
    }
    render();
  }

  function salvarTorneio(campos) { return updateDoc(ref(), campos).catch(e => { console.error(e); toast("Não deu para salvar. Verifique se você está logado como editor."); }); }

  /* ---------- tela principal ---------- */
  function render() {
    const foco = document.activeElement && document.activeElement.id;
    // a aba Ao vivo fica no lugar (o vídeo do YouTube não pode recarregar a cada ponto marcado)
    const fica = AV && aba === "aovivo" && T && !formNovo ? AV.elemento : null;
    [...root.childNodes].forEach(c => { if (c !== fica) c.remove(); });
    let antesDoFica = true;
    const pos = root.append.bind(root);
    root.append = (...ns) => ns.forEach(n => { if (n === fica) { antesDoFica = false; if (n.parentNode !== root) pos(n); } else if (antesDoFica && fica && fica.parentNode === root) root.insertBefore(n, fica); else pos(n); });
    try { renderCorpo(); } finally { delete root.append; }
    if (foco) { const f = document.getElementById(foco); if (f && f.tagName === "INPUT" && f !== document.activeElement) f.focus(); }
  }
  function renderCorpo() {
    root.append(barraTopo());
    if (formNovo) { root.append(telaNovo()); return; }
    if (!T && confirmar) root.append(caixaConfirmar());
    if (!T) {
      root.append(h("div", { class: "t-card t-vazio" },
        h("h3", { text: "Nenhum torneio ainda" }),
        h("p", { class: "cap", text: podeEditar() ? "Crie o primeiro torneio: nome, equipes e etapas." : "Quando o organizador criar um torneio, ele aparece aqui." }),
        podeEditar() && h("div", { class: "t-linha" }, h("button", { type: "button", onclick: () => { formNovo = true; render(); } }, "Criar torneio"), botaoDemo())));
      return;
    }
    const vivo = AV && AV.estado() && AV.estado().aoVivo;
    const abas = [["geral", "Torneio"], ["equipes", "Equipes"], ["chaves", "Chaves e jogos"], ["stats", ctx.rotuloStats || "Estatísticas"], ...(EQ ? [["equipe", "Estatísticas por Equipe"]] : []), ...(MID ? [["midias", "Mídias"]] : []), ...(AV ? [["aovivo", vivo ? "● Ao vivo" : "Ao vivo"]] : [])];
    root.append(h("div", { class: "t-abas" + (abas.length > 5 ? " t-abas6" : ""), role: "tablist" }, abas.map(([k, t]) =>
      h("button", { type: "button", role: "tab", class: k === "aovivo" && vivo ? "t-aba-vivo" : null, "aria-selected": String(aba === k), onclick: () => { aba = k; ls.set("aba", k); render(); } }, t))));
    const corpo = { geral: telaGeral, equipes: telaEquipes, chaves: telaChaves, stats: telaStats, equipe: EQ ? EQ.tela : null, midias: MID ? MID.tela : null, aovivo: AV ? AV.tela : null }[aba] || telaGeral;
    root.append(corpo());
    if (sumulaJid) root.append(telaSumula());
    document.body.style.overflow = sumulaJid ? "hidden" : "";
    if (confirmar) root.append(caixaConfirmar());
  }

  function barraTopo() {
    return h("div", { class: "t-topo" },
      torneios.length ? h("select", { "aria-label": "Torneio", onchange: e => { escolher(e.target.value); } },
        torneios.map(t => h("option", { value: t.id, selected: T && t.id === T.id }, t.nome))) : h("span", { class: "cap", text: "Modo Torneio" }),
      podeEditar() && !formNovo && h("button", { type: "button", class: "ghost", onclick: () => { formNovo = true; render(); } }, "+ Novo torneio"));
  }

  function caixaConfirmar() {
    return h("div", { class: "t-modal" }, h("div", { class: "t-card t-conf" },
      h("p", { text: confirmar.msg }),
      h("div", { class: "t-linha" },
        h("button", { type: "button", class: "danger", onclick: async () => { const f = confirmar.fn; confirmar = null; render(); await f(); } }, confirmar.ok || "Confirmar"),
        h("button", { type: "button", class: "ghost", onclick: () => { confirmar = null; render(); } }, "Cancelar"))));
  }
  const perguntar = (msg, fn, ok) => { confirmar = { msg, fn, ok }; render(); };

  /* ---------- novo torneio ---------- */
  function telaNovo() {
    const f = h("form", { class: "t-card t-form", onsubmit: async e => {
      e.preventDefault();
      const nome = f.querySelector("#tn-nome").value.trim();
      const nEq = Math.max(2, Math.min(32, +f.querySelector("#tn-eq").value || 0));
      const nEt = Math.max(1, Math.min(12, +f.querySelector("#tn-et").value || 1));
      if (!nome) { toast("Dê um nome ao torneio."); return; }
      const equipes = Array.from({ length: nEq }, (_, i) => ({ id: C.uid("e"), nome: (f.querySelector("#tn-e" + i) || {}).value?.trim() || "Equipe " + (i + 1), atletas: [] }));
      const cs = casa(); if (cs) { const e0 = equipes.find(e => e.nome === cs.nome); if (e0) Object.assign(e0, { atletas: cs.atletas, capitao: cs.capitao, tecnico: cs.tecnico }); }
      const etapas = Array.from({ length: nEt }, (_, i) => ({ id: C.uid("s"), nome: nEt > 1 ? (i + 1) + "ª etapa" : "Etapa única", local: f.querySelector("#tn-l" + i)?.value.trim() || "", data: f.querySelector("#tn-d" + i)?.value || "", hora: f.querySelector("#tn-h" + i)?.value || "" }));
      const id = C.uid("t");
      try {
        await setDoc(doc(db, col, id), { nome, equipes, etapas, criado: Date.now() });
        formNovo = false; tid = id; aba = "equipes"; ls.set("aba", aba); toast("Torneio criado. Agora cadastre os atletas.");
      } catch (err) { console.error(err); toast("Não deu para criar. Entre como organizador ou editor."); }
    } });
    const campoEq = h("div", { class: "t-grid2", id: "tn-eqs" });
    const campoEt = h("div", { class: "t-etapas", id: "tn-ets" });
    const desenharEq = () => { const n = Math.max(2, Math.min(32, +f.querySelector("#tn-eq").value || 0)); const ant = [...campoEq.querySelectorAll("input")].map(i => i.value);
      campoEq.textContent = ""; for (let i = 0; i < n; i++) campoEq.append(h("input", { id: "tn-e" + i, placeholder: "Equipe " + (i + 1), value: ant[i] || (i === 0 && casa() ? casa().nome : ""), "aria-label": "Nome da equipe " + (i + 1), maxlength: 30 }));
      dica.textContent = textoSugestao(n); };
    const desenharEt = () => { const n = Math.max(1, Math.min(12, +f.querySelector("#tn-et").value || 1)); campoEt.textContent = "";
      for (let i = 0; i < n; i++) campoEt.append(h("div", { class: "t-etapa-form" }, h("b", { text: n > 1 ? (i + 1) + "ª etapa" : "Etapa única" }),
        h("input", { id: "tn-l" + i, placeholder: "Local", value: "AEM", "aria-label": "Local da etapa " + (i + 1) }),
        h("div", { class: "t-linha" }, h("input", { id: "tn-d" + i, type: "date", "aria-label": "Data da etapa " + (i + 1) }), h("input", { id: "tn-h" + i, type: "time", value: BIR ? "19:00" : "10:00", "aria-label": "Horário da etapa " + (i + 1) })))); };
    const dica = h("p", { class: "cap" });
    f.append(
      h("h3", { text: "Novo torneio" }),
      h("label", { class: "t-lbl" }, "Nome do torneio", h("input", { id: "tn-nome", maxlength: 60, placeholder: BIR ? "Ex.: Copa Biribol Mococa 2026" : "Ex.: Copa Família Basquete 2026" })),
      h("div", { class: "t-linha" },
        h("label", { class: "t-lbl" }, "Nº de equipes", h("input", { id: "tn-eq", type: "number", min: 2, max: 32, value: 8, oninput: desenharEq })),
        h("label", { class: "t-lbl" }, "Nº de etapas", h("input", { id: "tn-et", type: "number", min: 1, max: 12, value: 1, oninput: desenharEt }))),
      dica, h("p", { class: "t-sub", text: "Nomes das equipes" }), casa() ? h("p", { class: "cap", text: "A equipe \"" + casa().nome + "\" já entra com os atletas do elenco (nome e número)." }) : null, campoEq,
      h("p", { class: "t-sub", text: "Etapas: local, data e horário" }), campoEt,
      h("div", { class: "t-linha" }, h("button", { type: "submit" }, "Criar torneio"), h("button", { type: "button", class: "ghost", onclick: () => { formNovo = false; render(); } }, "Cancelar")));
    setTimeout(() => { desenharEq(); desenharEt(); }, 0);
    return f;
  }

  function textoSugestao(n) {
    const g = C.sugerirGrupos(n), tam = C.tamanhosGrupos(n, g), q = C.sugerirClassificados(n, g);
    if (!g) return "Com 2 equipes: jogo único (final).";
    const tot = q * g, K = C.proxPot2(tot), byes = K - tot;
    let t = "Sugestão: " + (g === 1 ? "1 grupo (todos contra todos)" : g + " grupos de " + [...new Set(tam)].join(" e ") + " equipes");
    t += " · passam " + q + (g > 1 ? " de cada grupo" : "") + " → " + C.nomeFase(K / 2).toLowerCase();
    if (n % 2) t += " · número ímpar: " + (g > 1 ? "grupos de tamanhos diferentes e " : "") + "uma equipe folga em cada rodada";
    if (byes) t += " · " + byes + " melhor(es) campanha(s) passa(m) direto (bye)";
    if (K >= 4) t += " · com disputa de 3º lugar";
    if (SERIES_OK && n >= 6) { const g2 = Math.max(2, g), t2 = C.tamanhosGrupos(n, g2); return "Sugestão da Liga: " + g2 + " grupos de " + [...new Set(t2)].join(" e ") + " equipes · os 3 primeiros de cada grupo vão para as séries Ouro (1ºs), Prata (2ºs) e Bronze (3ºs)."; }
    return t + ".";
  }

  function botaoDemo() {
    return h("button", { type: "button", class: "ghost", onclick: () => perguntar("Criar um torneio de demonstração com equipes e atletas fictícios e todos os jogos já jogados? Depois você pode apagá-lo em Editar → Apagar torneio.", criarDemo, "Gerar demonstração") }, "Gerar torneio de demonstração");
  }
  async function criarDemo() {
    const id = "demo-" + Date.now().toString(36);
    try {
      const { torneio, jogos: js } = gerarDemo(esporte, ctx.nomeDemo, { series: SERIES_OK, casa: casa() });
      const b = writeBatch(db);
      b.set(doc(db, col, id), torneio);
      js.forEach(({ id: jid, ...d }) => b.set(doc(db, col, id, "jogos", jid), d));
      await b.commit(); tid = id; ls.set("tid", id); aba = "chaves"; ls.set("aba", aba); etapaSel = 0; toast("Torneio de demonstração criado."); }
    catch (e) { console.error(e); toast("Não deu para criar a demonstração. Entre como organizador ou editor."); }
  }

  /* ---------- aba Torneio (geral) ---------- */
  function telaGeral() {
    const w = h("div", { class: "t-col" });
    if (editandoGeral && podeEditar()) {
      const f = h("form", { class: "t-card t-form", onsubmit: async e => {
        e.preventDefault();
        const etapas = T.etapas.map((et, i) => ({ ...et, nome: f.querySelector("#ge-n" + i).value.trim() || et.nome, local: f.querySelector("#ge-l" + i).value.trim(), data: f.querySelector("#ge-d" + i).value, hora: f.querySelector("#ge-h" + i).value }));
        await salvarTorneio({ nome: f.querySelector("#ge-nome").value.trim() || T.nome, etapas }); editandoGeral = false; toast("Torneio salvo."); render();
      } },
        h("label", { class: "t-lbl" }, "Nome do torneio", h("input", { id: "ge-nome", value: T.nome, maxlength: 60 })),
        T.etapas.map((et, i) => h("div", { class: "t-etapa-form" },
          h("input", { id: "ge-n" + i, value: et.nome, "aria-label": "Nome da etapa" }),
          h("input", { id: "ge-l" + i, value: et.local || "", placeholder: "Local", "aria-label": "Local" }),
          h("div", { class: "t-linha" }, h("input", { id: "ge-d" + i, type: "date", value: et.data || "", "aria-label": "Data" }), h("input", { id: "ge-h" + i, type: "time", value: et.hora || "", "aria-label": "Horário" })))),
        h("div", { class: "t-linha" },
          h("button", { type: "submit" }, "Salvar"),
          h("button", { type: "button", class: "ghost", onclick: () => salvarTorneio({ etapas: [...T.etapas, { id: C.uid("s"), nome: (T.etapas.length + 1) + "ª etapa", local: "AEM", data: "", hora: BIR ? "19:00" : "10:00" }] }) }, "+ Etapa"),
          h("button", { type: "button", class: "ghost", onclick: () => { editandoGeral = false; render(); } }, "Cancelar")),
        h("button", { type: "button", class: "danger", onclick: () => perguntar("Apagar o torneio \"" + T.nome + "\" com todas as equipes, jogos e estatísticas? Isso não pode ser desfeito.", async () => {
          const b = writeBatch(db); jogos.forEach(j => b.delete(jogoRef(j.id))); b.delete(ref()); await b.commit(); editandoGeral = false; toast("Torneio apagado.");
        }, "Apagar torneio") }, "Apagar torneio"));
      w.append(f); return w;
    }
    w.append(h("div", { class: "t-card" },
      h("div", { class: "t-linha t-entre" }, h("h3", { class: "t-titulo", text: T.nome }), podeEditar() && h("button", { type: "button", class: "ghost", onclick: () => { editandoGeral = true; render(); } }, "Editar")),
      h("p", { class: "cap", text: T.equipes.length + " equipes · " + T.etapas.length + (T.etapas.length === 1 ? " etapa" : " etapas") + " · " + (BIR ? "melhor de 3 sets (21, 21, 15)" : "4 quartos de 10 min") })));
    const demoBtn = podeEditar() && !T.demo && !torneios.some(t => t.demo) ? botaoDemo() : null;
    T.etapas.forEach((et, i) => {
      const js = jogosEtapa(i), fin = js.filter(j => j.status === "encerrado" && !j.wo).length;
      const pods = podiosEtapa(i), camp = (pods[0] && pods[0].p[0]) || null;
      const acabou = pods.length && pods.every(x => x.p[0]) && js.every(j => j.status === "encerrado");
      w.append(h("button", { type: "button", class: "t-card t-etapa", onclick: () => { etapaSel = i; aba = "chaves"; ls.set("aba", aba); render(); } },
        h("div", { class: "t-linha t-entre" }, h("b", { text: et.nome }), h("span", { class: "t-pill" + (acabou ? " ok" : js.length ? " and" : ""), text: acabou ? "Encerrada" : js.length ? "Em andamento" : "Sem sorteio" })),
        h("span", { class: "cap", text: [et.local, fmtData(et.data), et.hora].filter(Boolean).join(" · ") || "Local, data e horário a definir" }),
        js.length ? h("span", { class: "cap", text: fin + " de " + js.filter(j => !j.wo).length + " jogos encerrados" }) : (podeEditar() ? h("span", { class: "cap", text: "Toque para montar os grupos, os jogos e as fases" }) : null),
        pods.filter(x => x.p.some(Boolean)).map(x => h("span", { class: "t-campeao" }, x.serie != null ? h("b", { text: x.titulo + ": " }) : null,
          x.p.map((id, k) => id ? (k ? " · " : "") + MED[k] + " " + eqNome(id) : null)))));
    });
    if (jogos.some(j => j.status === "encerrado" && !j.wo)) w.append(cartaoClassificacaoGeral());
    w.append(cartaoExportar());
    if (T.demo) w.append(h("p", { class: "cap", text: "Este é um torneio de demonstração, com equipes e atletas fictícios. Para apagar: Editar → Apagar torneio." }));
    if (demoBtn) w.append(demoBtn);
    return w;
  }

  /* ---------- classificação geral e final da etapa ---------- */
  const posTxt = x => x ? x.pos + "º" + (x.medalha ? " " + MED[x.medalha - 1] : "") + (x.completa ? "" : "*") : "–";
  function cartaoClassificacaoGeral() {
    const G = C.classificacaoGeral(esporte, T, jogos, eqNome, ctx.pontuacao || null), nE = T.etapas.length, temSerie = T.etapas.some(e => (e.series || []).length);
    const sv = (a, b) => (a > 0 ? "+" : "") + a;
    return h("div", { class: "card" }, h("h3", { text: "Classificação geral" }),
      h("p", { class: "cap", text: (ctx.pontuacao ? "Pela pontuação do ranking em cada etapa; desempate: " : PTS() ? "Critério: pontos (2x0 = 3; 2x1 = 2 e 1 para quem perde); desempate: pontos marcados, depois " : "Critério: ") + "vitórias, " + (BIR ? "" : "empates, ") + "saldo de pontos e pontos feitos, somando todas as etapas." + (nE > 1 ? " As colunas de etapa mostram a colocação final de cada equipe (* = etapa em andamento)." : "") }),
      h("div", { class: "tablebox" }, h("table", { class: "t-tab t-tab-lg t-geral" },
        h("thead", null, h("tr", null, h("th", { text: "#" }), h("th", { class: "l", text: "Equipe" }), ctx.pontuacao && h("th", { text: "Pts" }), PTS() && !ctx.pontuacao && h("th", { text: "Pts" }),
          T.etapas.map((et, i) => h("th", { text: nE > 1 ? "Et. " + (i + 1) : "Etapa", title: et.nome })), h("th", { text: "J" }), h("th", { text: "V" }), !BIR && h("th", { text: "E" }), h("th", { text: "D" }),
          BIR && h("th", { text: "Sets" }), h("th", { text: "Saldo" }), h("th", { text: "PF" }), h("th", { text: temSerie ? "Medalhas" : "Pódios" }))),
        h("tbody", null, G.linhas.map((r, i) => h("tr", { class: i < 3 && r.j ? "podio p" + (i + 1) : "" },
          h("td", { text: (i + 1) + "º" }), h("td", { class: "l", text: eqNome(r.eid) }), ctx.pontuacao && h("td", { text: r.pts }), PTS() && !ctx.pontuacao && h("td", { class: "t-pts", text: r.pg }),
          r.etapas.map(x => h("td", { text: posTxt(x), title: x && x.serie != null ? C.SERIES[x.serie] : null })), h("td", { text: r.j }), h("td", { text: r.v }), !BIR && h("td", { text: r.e }), h("td", { text: r.d }),
          BIR && h("td", { text: r.sv + "–" + r.sp }), h("td", { class: "saldo " + (r.saldo > 0 ? "pos" : r.saldo < 0 ? "neg" : ""), text: sv(r.saldo) }), h("td", { text: r.pf }),
          h("td", { text: r.medalhas.map((n, k) => n ? n + MED[k] : "").filter(Boolean).join(" ") || "–" })))))),
      SERIES_OK && !ctx.pontuacao ? h("p", { class: "cap", text: "Quando as regras de pontuação por ranking da Liga forem definidas, a classificação geral passa a somar esses pontos." }) : null);
  }
  function cartaoClassificacaoEtapa(ei) {
    const c = C.colocacaoEtapa(esporte, T.etapas[ei], jogosEtapa(ei), T.equipes.map(e => e.id), eqNome);
    if (!c.ordem.length) return null;
    return h("details", { class: "t-card t-jogos", open: c.completa },
      h("summary", null, "Classificação final da etapa" + (c.completa ? "" : " (parcial)")),
      !c.completa ? h("p", { class: "cap", text: "Parcial: a etapa ainda tem jogos em aberto." }) : null,
      h("div", { class: "tablebox" }, h("table", { class: "t-tab" },
        h("thead", null, h("tr", null, h("th", { text: "#" }), h("th", { class: "l", text: "Equipe" }), h("th", { class: "l", text: "Chegou até" }), h("th", { text: "V" }), h("th", { text: "D" }), h("th", { text: "Saldo" }))),
        h("tbody", null, c.ordem.map(x => h("tr", { class: x.pos <= 3 && c.completa ? "podio p" + x.pos : "" },
          h("td", { text: x.pos + "º" }), h("td", { class: "l", text: eqNome(x.eid) }),
          h("td", { class: "l", text: (x.medalha && c.completa ? MED[x.medalha - 1] + " " : "") + (x.serie != null && !String(x.rot).startsWith("Série") ? C.SERIES[x.serie] + " · " : "") + (x.rot || "") }),
          h("td", { text: x.v }), h("td", { text: x.d }), h("td", { text: (x.saldo > 0 ? "+" : "") + x.saldo })))))));
  }

  let exportando = null;
  function cartaoExportar() {
    const btn = (rot, desc, chave, fn) => h("button", { type: "button", class: "t-exp", disabled: !!exportando, onclick: async () => {
      exportando = chave; render();
      try { await fn(T, jogos, esporte, ctx.marca); toast("Arquivo gerado. Confira seus downloads."); }
      catch (e) { console.error(e); toast("Não deu para gerar o arquivo. Verifique a internet e tente de novo."); }
      exportando = null; render();
    } }, h("b", { text: exportando === chave ? "Gerando…" : rot }), h("small", { text: desc }));
    return h("div", { class: "t-card" },
      h("h3", { text: "Exportar e imprimir" }),
      h("p", { class: "cap", text: "Tabela de jogos: grupos, jogos e chave do mata-mata, com as fases seguintes em branco para preencher à mão. Relatório: resultados, classificação, estatísticas e gráficos." }),
      h("div", { class: "t-exps" },
        btn("Tabela de jogos · PDF", "Para imprimir", "tp", X.tabelaPDF),
        btn("Tabela de jogos · Excel", "Planilha para preencher", "tx", X.tabelaXLSX),
        btn("Relatório completo · PDF", "Estatísticas e gráficos", "rp", X.relatorioPDF),
        btn("Relatório completo · Excel", "Planilhas e gráficos", "rx", X.relatorioXLSX)));
  }

  /* ---------- aba Equipes ---------- */
  function telaEquipes() {
    const w = h("div", { class: "t-col" });
    if (podeEditar()) w.append(h("div", { class: "t-linha" },
      h("button", { type: "button", class: "ghost", onclick: () => salvarTorneio({ equipes: [...T.equipes, { id: C.uid("e"), nome: "Equipe " + (T.equipes.length + 1), atletas: [] }] }) }, "+ Equipe"),
      h("span", { class: "cap", text: "Até " + maxAtletas + " atletas por equipe" })));
    const cs = casa();
    if (podeEditar() && cs) {
      const eqCasa = T.equipes.find(e => e.nome.trim().toLowerCase() === cs.nome.trim().toLowerCase());
      w.append(h("div", { class: "t-card" }, h("p", { class: "cap", text: eqCasa ? "Atualize os atletas de " + eqCasa.nome + " com o elenco cadastrado (nome e número)." : "Coloque a equipe de " + cs.nome + " no torneio já com os atletas do elenco." }),
        h("button", { type: "button", onclick: () => {
          if (!cs.atletas.length) { toast("Cadastre o elenco na aba Atletas primeiro."); return; }
          if (eqCasa) { const tem = new Set((eqCasa.atletas || []).map(a => a.id)); const novos = [...(eqCasa.atletas || []), ...cs.atletas.filter(a => !tem.has(a.id))].slice(0, maxAtletas);
            salvarTorneio({ equipes: T.equipes.map(e => e.id === eqCasa.id ? { ...e, atletas: novos, capitao: cs.capitao && novos.some(a => a.id === cs.capitao) ? cs.capitao : e.capitao || null, tecnico: cs.tecnico || e.tecnico || "" } : e) }).then(() => toast("Elenco de " + eqCasa.nome + " atualizado.")); }
          else salvarTorneio({ equipes: [{ id: C.uid("e"), nome: cs.nome, atletas: cs.atletas, capitao: cs.capitao, tecnico: cs.tecnico }, ...T.equipes] }).then(() => toast(cs.nome + " entrou no torneio."));
        } }, eqCasa ? "Puxar elenco para " + eqCasa.nome : "+ " + cs.nome + " (com o elenco)")));
    }
    T.equipes.forEach((eq, ei) => {
      const card = h("div", { class: "t-card" });
      if (podeEditar()) {
        card.append(h("div", { class: "t-linha" },
          h("input", { id: "eq-n-" + eq.id, value: eq.nome, maxlength: 30, "aria-label": "Nome da equipe", class: "t-eqnome", onchange: e => { const eqs = T.equipes.map(x => x.id === eq.id ? { ...x, nome: e.target.value.trim() || x.nome } : x); salvarTorneio({ equipes: eqs }); } }),
          h("button", { type: "button", class: "danger t-mini", onclick: () => {
            if (jogos.some(j => j.a === eq.id || j.b === eq.id)) { toast("Essa equipe já tem jogos no chaveamento. Refaça o sorteio antes de remover."); return; }
            perguntar("Remover a equipe " + eq.nome + "?", () => salvarTorneio({ equipes: T.equipes.filter(x => x.id !== eq.id) }), "Remover"); } }, "Remover")));
        card.append(h("label", { class: "t-lbl t-tec" }, "Técnico (opcional)",
          h("input", { id: "eq-t-" + eq.id, value: eq.tecnico || "", maxlength: 40, placeholder: "Nome do técnico", onchange: e => salvarTorneio({ equipes: T.equipes.map(x => x.id === eq.id ? { ...x, tecnico: e.target.value.trim() } : x) }) })));
        const lista = h("div", { class: "t-atletas" });
        (eq.atletas || []).forEach(a => lista.append(h("div", { class: "t-atleta" },
          h("input", { type: "number", min: 0, max: 99, value: a.num ?? "", "aria-label": "Número", class: "t-num", onchange: e => mudarAtleta(eq.id, a.id, { num: e.target.value === "" ? null : +e.target.value }) }),
          h("input", { value: a.nome, maxlength: 30, "aria-label": "Nome do atleta", onchange: e => mudarAtleta(eq.id, a.id, { nome: e.target.value.trim() || a.nome }) }),
          h("button", { type: "button", class: "t-capbtn", "aria-pressed": String(eq.capitao === a.id), title: eq.capitao === a.id ? "Capitão (toque para tirar)" : "Marcar como capitão", "aria-label": "Capitão: " + a.nome,
            onclick: () => salvarTorneio({ equipes: T.equipes.map(x => x.id === eq.id ? { ...x, capitao: x.capitao === a.id ? null : a.id } : x) }) }, "C"),
          h("button", { type: "button", class: "ghost t-mini", "aria-label": "Tirar " + a.nome, onclick: () => mudarAtleta(eq.id, a.id, null) }, "×"))));
        if ((eq.atletas || []).length && !eq.capitao) card.append(h("p", { class: "cap", text: "Toque no C ao lado de um atleta para marcar o capitão." }));
        card.append(lista);
        if ((eq.atletas || []).length < maxAtletas) {
          const fa = h("form", { class: "t-atleta t-novo", onsubmit: e => {
            e.preventDefault(); const nm = fa.querySelector(".nn").value.trim(), nu = fa.querySelector(".nu").value;
            if (!nm) return; if (nu !== "" && (eq.atletas || []).some(x => x.num === +nu)) { toast("Número " + nu + " já está em uso nessa equipe."); return; }
            const eqs = T.equipes.map(x => x.id === eq.id ? { ...x, atletas: [...(x.atletas || []), { id: C.uid("a"), nome: nm, num: nu === "" ? null : +nu }] } : x);
            salvarTorneio({ equipes: eqs }).then(() => { const n = document.getElementById("na-" + eq.id); if (n) n.focus(); });
          } },
            h("input", { class: "nu t-num", type: "number", min: 0, max: 99, placeholder: "Nº", "aria-label": "Número do novo atleta" }),
            h("input", { class: "nn", id: "na-" + eq.id, placeholder: "Nome do atleta (" + ((eq.atletas || []).length + 1) + "/" + maxAtletas + ")", maxlength: 30, "aria-label": "Nome do novo atleta" }),
            h("button", { type: "submit", class: "t-mini" }, "+"));
          card.append(fa);
        } else card.append(h("p", { class: "cap", text: "Equipe completa (" + maxAtletas + " atletas)." }));
      } else {
        card.append(h("h3", { text: eq.nome }));
        if (eq.tecnico) card.append(h("p", { class: "cap t-tecro", text: "Técnico: " + eq.tecnico }));
        const at = [...(eq.atletas || [])].sort((x, y) => (x.num ?? 999) - (y.num ?? 999));
        card.append(at.length ? h("div", { class: "t-atletas ro" }, at.map(a => h("div", { class: "t-atleta" }, h("span", { class: "t-camisa", text: a.num ?? "–" }), h("span", { text: a.nome }), eq.capitao === a.id && h("span", { class: "t-capbadge", title: "Capitão", text: "C" })))) : h("p", { class: "cap", text: "Atletas ainda não cadastrados." }));
      }
      w.append(card);
    });
    return w;
  }
  function mudarAtleta(eid, aid, campos) {
    const eqs = T.equipes.map(x => x.id !== eid ? x : { ...x, ...(campos === null && x.capitao === aid ? { capitao: null } : {}), atletas: campos === null ? x.atletas.filter(a => a.id !== aid) : x.atletas.map(a => a.id === aid ? { ...a, ...campos } : a) });
    salvarTorneio({ equipes: eqs });
  }

  /* ---------- aba Chaves e jogos ---------- */
  function telaChaves() {
    const w = h("div", { class: "t-col" });
    if (T.etapas.length > 1) w.append(h("div", { class: "chips" }, T.etapas.map((et, i) => h("button", { type: "button", "aria-pressed": String(i === etapaSel), onclick: () => { etapaSel = i; sorteioRascunho = null; render(); } }, et.nome))));
    const et = T.etapas[etapaSel]; if (!et) return w;
    w.append(h("p", { class: "cap", text: [et.local, fmtData(et.data), et.hora].filter(Boolean).join(" · ") }));
    const js = jogosEtapa(etapaSel);
    if (montagem && montagem.ei === etapaSel && podeEditar()) { w.append(telaMontagem(et)); return w; }
    const grp = C.gruposDe(et), temGrupos = grp.length > 0, temMata = js.some(j => j.fase === "mata" && j.serie == null), series = et.series || [], temSeries = series.length > 0;
    if (!temGrupos && !temMata && !temSeries) { w.append(telaSorteio(et)); return w; }
    const emSeries = et.formato === "series";
    // grupos
    if (temGrupos) {
      w.append(h("h3", { class: "t-h", text: "Fase de classificação" }));
      const grade = h("div", { class: "t-grupos" });
      grp.forEach((g, gi) => {
        const jg = js.filter(j => j.fase === "grupo" && j.grupo === gi);
        const cl = C.classificacao(esporte, g, jg, eqNome), q = et.classificam || 2;
        grade.append(h("div", { class: "t-card t-grupo" },
          h("div", { class: "t-gtit" }, "Grupo " + C.letraGrupo(gi)),
          h("table", { class: "t-tab" },
            h("thead", null, h("tr", null, h("th", { text: "" }), h("th", { class: "l", text: "Equipe" }), PTS() && h("th", { text: "Pts" }), h("th", { text: "J" }), h("th", { text: "V" }), !BIR && h("th", { text: "E" }), h("th", { text: "D" }), h("th", { text: "Saldo" }))),
            h("tbody", null, cl.map((r, i) => h("tr", { class: i < q ? "passa" : "" },
              h("td", { text: (i + 1) + "º" }), h("td", { class: "l", text: eqNome(r.eid) }), PTS() && h("td", { class: "t-pts", text: r.pg }), h("td", { text: r.j }), h("td", { text: r.v }), !BIR && h("td", { text: r.e }), h("td", { text: r.d }), h("td", { text: (r.saldo > 0 ? "+" : "") + r.saldo })))))));
      });
      w.append(grade);
      w.append(h("p", { class: "cap", text: (emSeries ? "Em destaque, quem vai para as séries: " + C.SERIES.slice(0, et.classificam || 3).map((s, k) => (k + 1) + "º → " + s).join(", ") + ". " : "Em destaque, quem passa de fase (" + (et.classificam || 2) + (grp.length > 1 ? " por grupo" : "") + "). ") + TXT_CRIT() }));
      grp.forEach((g, gi) => {
        const jg = js.filter(j => j.fase === "grupo" && j.grupo === gi).sort((a, b) => a.rodada - b.rodada || a.ordem - b.ordem);
        const editar = podeEditar();
        w.append(h("details", { class: "t-card t-jogos", open: grp.length <= 2 || !jg.length },
          h("summary", null, "Jogos do grupo " + C.letraGrupo(gi) + " · " + jg.filter(j => j.status === "encerrado").length + "/" + jg.length),
          jg.map(j => editar && j.status === "agendado" ? h("div", { class: "t-jogo-ed" }, cartaoJogo(j), h("button", { type: "button", class: "ghost t-mini", "aria-label": "Apagar este jogo", title: "Apagar este jogo", onclick: () => perguntar("Apagar o jogo " + eqNome(j.a) + " x " + eqNome(j.b) + "?", () => deleteDoc(jogoRef(j.id)), "Apagar jogo") }, "×")) : cartaoJogo(j)),
          !jg.length ? h("p", { class: "cap", text: "Nenhum jogo ainda. Escolha os confrontos abaixo." }) : null,
          editar ? formNovoJogoGrupo(et, gi, g, jg) : null));
      });
      const faltam = js.filter(j => j.fase === "grupo" && j.status !== "encerrado").length;
      if (!temMata && !temSeries) w.append(previsaoFases(et, grp));
      if (!temMata && !temSeries && podeEditar()) {
        const oQue = emSeries ? "as séries" : "o mata-mata";
        w.append(h("div", { class: "t-card" },
          faltam ? h("p", { class: "cap", text: "Faltam " + faltam + (faltam === 1 ? " jogo" : " jogos") + " da classificação para gerar " + oQue + "." }) : h("p", { class: "cap", text: "Classificação encerrada. Gere " + oQue + " com os classificados." }),
          h("div", { class: "t-linha" },
            h("button", { type: "button", disabled: !!faltam, onclick: () => emSeries ? gerarSeries(et, etapaSel) : gerarMataMata(et, etapaSel) }, emSeries ? "Gerar séries pela classificação" : "Gerar mata-mata pela classificação"),
            h("button", { type: "button", class: "ghost", onclick: () => emSeries ? abrirMontagemSeries(et, etapaSel) : abrirMontagemMata(et, etapaSel, false) }, emSeries ? "Montar séries à mão" : "Montar mata-mata à mão"),
            !js.some(j => j.status === "encerrado" && !j.wo) && h("button", { type: "button", class: "ghost", onclick: () => perguntar("Desfazer o sorteio desta etapa? Os jogos criados serão apagados.", () => desfazerSorteio(etapaSel), "Desfazer sorteio") }, "Desfazer sorteio"))));
      }
    }
    if (temMata) {
      w.append(h("h3", { class: "t-h", text: "Mata-mata" }));
      const mj = js.filter(j => j.fase === "mata" && j.serie == null);
      w.append(chaveMata(mj));
      w.append(cartaoPodio("Pódio", C.podioMata(esporte, mj)));
      if (podeEditar() && !mj.some(j => j.status === "encerrado" && !j.wo)) w.append(h("button", { type: "button", class: "ghost", onclick: () => perguntar("Desfazer o mata-mata desta etapa?", async () => {
        const b = writeBatch(db); mj.forEach(j => b.delete(jogoRef(j.id))); await b.commit(); toast("Mata-mata desfeito.");
        if (!temGrupos) await desfazerSorteio(etapaSel);
      }, "Desfazer") }, "Desfazer mata-mata"));
    }
    if (temSeries) {
      series.forEach((s, si) => {
        const sj = js.filter(j => j.serie === si);
        const card = h("section", { class: "t-serie s" + si },
          h("h3", { class: "t-h t-serie-tit" }, h("span", { class: "t-medalha m" + si, text: MED[si] }), C.SERIES[si],
            h("small", { text: s.equipes.length + " equipes · " + (s.tipo === "todos" ? "todos contra todos" : s.tipo === "final" ? "final" : s.equipes.length <= 4 ? "semifinal, final e 3º lugar" : s.equipes.length <= 8 ? "quartas, semifinal, final e 3º lugar" : "mata-mata com 3º lugar") })));
        if (s.tipo === "todos") {
          const cl = C.classificacao(esporte, s.equipes, sj, eqNome);
          card.append(h("div", { class: "t-card t-grupo" }, h("table", { class: "t-tab" },
            h("thead", null, h("tr", null, h("th", { text: "" }), h("th", { class: "l", text: "Equipe" }), PTS() && h("th", { text: "Pts" }), h("th", { text: "J" }), h("th", { text: "V" }), !BIR && h("th", { text: "E" }), h("th", { text: "D" }), h("th", { text: "Saldo" }))),
            h("tbody", null, cl.map((r, i) => h("tr", { class: i < 3 ? "passa" : "" },
              h("td", { text: (i + 1) + "º" }), h("td", { class: "l", text: eqNome(r.eid) }), PTS() && h("td", { class: "t-pts", text: r.pg }), h("td", { text: r.j }), h("td", { text: r.v }), !BIR && h("td", { text: r.e }), h("td", { text: r.d }), h("td", { text: (r.saldo > 0 ? "+" : "") + r.saldo })))))));
          card.append(h("details", { class: "t-card t-jogos", open: true }, h("summary", null, "Jogos da " + C.SERIES[si] + " · " + sj.filter(j => j.status === "encerrado").length + "/" + sj.length),
            sj.sort((a, b) => a.rodada - b.rodada || a.ordem - b.ordem).map(j => cartaoJogo(j))));
        } else card.append(chaveMata(sj));
        card.append(cartaoPodio("Medalhas da " + C.SERIES[si], C.podioSerie(esporte, s, sj, eqNome)));
        w.append(card);
      });
      if (podeEditar() && !js.some(j => j.serie != null && j.status === "encerrado" && !j.wo)) w.append(h("button", { type: "button", class: "ghost", onclick: () => perguntar("Desfazer as séries desta etapa?", async () => {
        const b = writeBatch(db); js.filter(j => j.serie != null).forEach(j => b.delete(jogoRef(j.id)));
        b.update(ref(), { etapas: T.etapas.map((e, i) => i === etapaSel ? { ...e, series: [] } : e) }); await b.commit(); toast("Séries desfeitas.");
      }, "Desfazer") }, "Desfazer séries"));
    }
    if (js.some(j => j.status === "encerrado" && !j.wo)) w.append(cartaoClassificacaoEtapa(etapaSel));
    return w;
  }

  function cartaoPodio(titulo, p) {
    if (!p || !p.length) return null;
    const rot = ["1º lugar", "2º lugar", "3º lugar"];
    return h("div", { class: "t-card t-podio" }, h("div", { class: "t-gtit", text: titulo }),
      h("ol", { class: "t-podio-l" }, [0, 1, 2].map(k => h("li", { class: "p" + k + (p[k] ? "" : " vazio") }, h("span", { class: "t-medalha m" + k, text: MED[k] }), h("span", { class: "cap", text: rot[k] }), h("b", { text: p[k] ? eqNome(p[k]) : "A definir" })))));
  }
  function podiosEtapa(ei) {
    const js = jogosEtapa(ei), et = T.etapas[ei] || {}, out = [];
    const mj = js.filter(j => j.fase === "mata" && j.serie == null);
    if (mj.length) out.push({ titulo: "Mata-mata", p: C.podioMata(esporte, mj) });
    (et.series || []).forEach((s, si) => out.push({ titulo: C.SERIES[si], serie: si, p: C.podioSerie(esporte, s, js.filter(j => j.serie === si), eqNome) }));
    return out;
  }

  function cartaoJogo(j, compacto) {
    const r = res(j), fim = j.status === "encerrado";
    const placar = BIR ? ((j.sets || []).some(s => s.a || s.b) ? r.sa + " x " + r.sb : "x") : ((j.periodos || []).some(p => p.a || p.b) ? r.pa + " x " + r.pb : "x");
    const det = BIR && j.sets && j.sets.length ? j.sets.filter(s => s.a || s.b).map(s => s.a + "-" + s.b).join(" · ") : "";
    const cls = n => (fim && r.venc === n ? "venc" : fim && r.venc && r.venc !== n ? "perd" : "");
    return h("button", { type: "button", class: "t-jogo" + (compacto ? " compacto" : "") + (j.status === "andamento" ? " vivo" : "") + (j.wo ? " bye" : "") + (j.previsto ? " previsto" : ""), disabled: j.previsto || !j.a || !j.b, onclick: () => abrirSumula(j.id) },
      h("span", { class: "t-eq " + cls(j.a), text: j.a ? eqNome(j.a) : (j.rotA || "A definir") }),
      h("span", { class: "t-pl" }, h("b", { text: j.wo ? "bye" : placar }), det && h("small", { text: det }), j.status === "andamento" && h("small", { class: "vivo-txt", text: "ao vivo" }), r.empate && h("small", { text: "empate" })),
      h("span", { class: "t-eq dir " + cls(j.b), text: j.wo ? "—" : j.b ? eqNome(j.b) : (j.rotB || "A definir") }));
  }

  function chaveMata(todos) {
    const mj = todos.filter(j => !j.perd), terc = todos.find(j => j.perd);
    const rodadas = [...new Set(mj.map(j => j.rodada))].sort((a, b) => a - b);
    const box = h("div", { class: "t-chave" });
    rodadas.forEach(r => {
      const js = mj.filter(j => j.rodada === r).sort((a, b) => a.ordem - b.ordem);
      box.append(h("div", { class: "t-rod" }, h("div", { class: "t-rodtit", text: js[0].faseNome }), h("div", { class: "t-rodjogos" }, js.map(j => h("div", { class: "t-slot" }, cartaoJogo(j, true))))));
    });
    const campea = C.podioMata(esporte, todos)[0];
    if (campea) box.append(h("div", { class: "t-rod t-camp" }, h("div", { class: "t-rodtit", text: "Campeã" }), h("div", { class: "t-rodjogos" }, h("div", { class: "t-slot" }, h("div", { class: "t-trofeu" }, "🏆", h("b", { text: eqNome(campea) }))))));
    return h("div", { class: "t-col" }, h("div", { class: "t-chave-wrap" }, box),
      terc && h("div", { class: "t-terc" }, h("div", { class: "t-rodtit", text: terc.faseNome }), cartaoJogo(terc, true)));
  }

  /* ---------- sorteio ---------- */
  function telaSorteio(et) {
    const n = T.equipes.length, w = h("div", { class: "t-col" });
    if (!podeEditar()) { w.append(h("div", { class: "t-card" }, h("p", { class: "cap", text: "O sorteio desta etapa ainda não foi feito." }))); return w; }
    if (n < 2) { w.append(h("div", { class: "t-card" }, h("p", { class: "cap", text: "Cadastre pelo menos 2 equipes." }))); return w; }
    const sug = C.sugerirGrupos(n);
    const padrao = (ng, f) => f === "series" ? Math.min(3, ...C.tamanhosGrupos(n, ng)) : C.sugerirClassificados(n, ng);
    const sugG = SERIES_OK && sug < 2 && n >= 6 ? 2 : sug, fmt0 = SERIES_OK && sugG >= 2 ? "series" : "mata";
    const rs = sorteioRascunho || (sorteioRascunho = { nGrupos: sugG, formato: fmt0, disputaSeries: "auto", classificam: padrao(sugG, fmt0), modo: "auto", grupos: null });
    const series = rs.formato === "series" && rs.nGrupos >= 2;
    const maxG = Math.max(1, Math.floor(n / 2));
    w.append(h("div", { class: "t-card t-form" },
      h("h3", { text: "Montar o chaveamento" }),
      h("p", { class: "cap", text: textoSugestao(n) }),
      h("div", { class: "t-linha" },
        h("label", { class: "t-lbl" }, "Grupos", h("select", { onchange: e => { rs.nGrupos = +e.target.value; if (rs.nGrupos < 2) rs.formato = "mata"; else if (SERIES_OK && rs.formato !== "mata") rs.formato = "series"; rs.classificam = padrao(rs.nGrupos, rs.formato); rs.grupos = null; render(); } },
          h("option", { value: 0, selected: rs.nGrupos === 0 }, "Sem grupos (mata-mata direto)"),
          Array.from({ length: maxG }, (_, i) => h("option", { value: i + 1, selected: rs.nGrupos === i + 1 }, (i + 1) + (i ? " grupos (" + [...new Set(C.tamanhosGrupos(n, i + 1))].join(" e ") + " equipes)" : " grupo (todos contra todos)"))))),
        rs.nGrupos > 0 && h("label", { class: "t-lbl" }, series ? "Vão para as séries (por grupo)" : "Passam por grupo", h("select", { onchange: e => { rs.classificam = +e.target.value; render(); } },
          (series ? [1, 2, 3] : [1, 2, 3, 4]).filter(q => q <= Math.min(...C.tamanhosGrupos(n, rs.nGrupos))).map(q => h("option", { value: q, selected: rs.classificam === q }, q))))),
      SERIES_OK && rs.nGrupos >= 2 && h("div", { class: "t-lbl" }, "Depois dos grupos",
        h("div", { class: "chips" },
          h("button", { type: "button", "aria-pressed": String(series), onclick: () => { rs.formato = "series"; rs.classificam = padrao(rs.nGrupos, "series"); render(); } }, "Séries Ouro, Prata e Bronze"),
          h("button", { type: "button", "aria-pressed": String(!series), onclick: () => { rs.formato = "mata"; rs.classificam = padrao(rs.nGrupos, "mata"); render(); } }, "Mata-mata"))),
      series && h("p", { class: "cap", text: "Os 1ºs colocados de cada grupo formam a Série Ouro, os 2ºs a Série Prata e os 3ºs a Série Bronze. Cada série decide 1º, 2º e 3º lugar (medalhas de ouro, prata e bronze)." }),
      series && h("label", { class: "t-lbl" }, "Disputa dentro de cada série", h("select", { onchange: e => { rs.disputaSeries = e.target.value; render(); } },
        h("option", { value: "auto", selected: rs.disputaSeries !== "todos" }, "Automática: 2 equipes = final · 3 = todos contra todos · 4 ou mais = mata-mata (semifinal, final e 3º lugar)"),
        h("option", { value: "todos", selected: rs.disputaSeries === "todos" }, "Sempre todos contra todos (pontos corridos)"))),
      rs.nGrupos > 0 && h("div", { class: "t-lbl" }, "Quem fica em cada grupo", h("div", { class: "chips" },
        h("button", { type: "button", "aria-pressed": String(rs.modo === "auto"), onclick: () => { rs.modo = "auto"; rs.grupos = null; render(); } }, "Sorteio automático"),
        h("button", { type: "button", "aria-pressed": String(rs.modo === "manual"), onclick: () => { rs.modo = "manual"; rs.grupos = null; render(); } }, "Manual: eu escolho os grupos"))),
      rs.nGrupos > 0 && h("div", { class: "t-lbl" }, "Jogos dentro dos grupos", h("div", { class: "chips" },
        h("button", { type: "button", "aria-pressed": String(rs.confrontos !== "manual"), onclick: () => { rs.confrontos = "auto"; render(); } }, "Todos contra todos (automático)"),
        h("button", { type: "button", "aria-pressed": String(rs.confrontos === "manual"), onclick: () => { rs.confrontos = "manual"; render(); } }, "Eu escolho quem joga contra quem")))));
    if (rs.nGrupos === 0) {
      w.append(h("div", { class: "t-card" }, h("p", { class: "cap", text: "Mata-mata direto: no automático, a ordem de cadastro das equipes vira a ordem das cabeças de chave (1ª x última...) e quem sobra ganha bye. À mão, você escolhe cada confronto." }),
        h("div", { class: "t-linha" }, h("button", { type: "button", onclick: () => gerarMataDireto(etapaSel) }, "Gerar chave automática"), h("button", { type: "button", class: "ghost", onclick: () => abrirMontagemMata(et, etapaSel, true) }, "Montar chave à mão"),
          SERIES_OK && h("button", { type: "button", class: "ghost", onclick: () => abrirMontagemSeries(et, etapaSel) }, "Montar séries Ouro, Prata e Bronze à mão"))));
      return w;
    }
    if (rs.modo === "manual") {
      const atual = rs.manual || (rs.manual = {});
      const tam = C.tamanhosGrupos(n, rs.nGrupos);
      const cont = Array(rs.nGrupos).fill(0); Object.values(atual).forEach(g => { if (g != null && g !== "") cont[+g]++; });
      w.append(h("div", { class: "t-card" }, h("p", { class: "cap", text: "Escolha o grupo de cada equipe conforme o sorteio feito fora do app." }),
        h("div", { class: "t-manual" }, T.equipes.map(eq => h("label", { class: "t-man" }, h("span", { text: eq.nome }),
          h("select", { onchange: e => { atual[eq.id] = e.target.value === "" ? null : +e.target.value; render(); } },
            h("option", { value: "" }, "—"), tam.map((_, gi) => h("option", { value: gi, selected: atual[eq.id] === gi }, "Grupo " + C.letraGrupo(gi) + " (" + cont[gi] + "/" + tam[gi] + ")")))))),
        h("p", { class: "cap", text: "Grupos: " + tam.map((t, gi) => C.letraGrupo(gi) + " " + cont[gi] + "/" + t).join(" · ") })));
      const ok = T.equipes.every(e => atual[e.id] != null) && cont.every(c => c >= 2);
      if (ok) rs.grupos = tam.map((_, gi) => T.equipes.filter(e => atual[e.id] === gi).map(e => e.id)); else rs.grupos = null;
      if (!ok) w.append(h("p", { class: "cap", text: "Coloque todas as equipes em um grupo (mínimo 2 por grupo)." }));
    } else if (!rs.grupos) {
      w.append(h("button", { type: "button", class: "t-sortear", onclick: () => { rs.grupos = C.distribuir(C.embaralhar(T.equipes.map(e => e.id)), rs.nGrupos); render(); } }, "🎲 Sortear grupos"));
    }
    if (rs.grupos) {
      w.append(h("h3", { class: "t-h", text: rs.modo === "auto" ? "Resultado do sorteio" : "Grupos montados" }));
      w.append(h("div", { class: "t-grupos" }, rs.grupos.map((g, gi) => h("div", { class: "t-card t-grupo sorteado" }, h("div", { class: "t-gtit" }, "Grupo " + C.letraGrupo(gi)), h("ol", { class: "t-gl" }, g.map(id => h("li", { text: eqNome(id) })))))));
      w.append(h("div", { class: "t-linha" },
        h("button", { type: "button", onclick: () => confirmarSorteio(etapaSel, rs) }, rs.confrontos === "manual" ? "Confirmar grupos (escolho os jogos depois)" : "Confirmar e criar os jogos"),
        rs.modo === "auto" && h("button", { type: "button", class: "ghost", onclick: () => { rs.grupos = C.distribuir(C.embaralhar(T.equipes.map(e => e.id)), rs.nGrupos); render(); } }, "Sortear de novo")));
    }
    return w;
  }

  async function confirmarSorteio(ei, rs) {
    const b = writeBatch(db);
    if (rs.confrontos !== "manual") rs.grupos.forEach((g, gi) => C.todosContraTodos(g).forEach((par, r) => par.forEach(([a, bb], o) => {
      const id = C.uid("j"); b.set(jogoRef(id), novoJogo({ etapa: ei, fase: "grupo", grupo: gi, rodada: r + 1, ordem: o, a, b: bb, faseNome: "Grupo " + C.letraGrupo(gi) }));
    })));
    const etapas = T.etapas.map((e, i) => i === ei ? { ...e, grupos: C.gruposParaSalvar(rs.grupos), classificam: rs.classificam, sorteio: rs.modo, formato: rs.formato === "series" && rs.grupos.length >= 2 ? "series" : "mata", disputaSeries: rs.disputaSeries || "auto", series: [] } : e);
    b.update(ref(), { etapas });
    try { await b.commit(); sorteioRascunho = null; toast(rs.confrontos === "manual" ? "Grupos criados. Agora escolha os jogos de cada grupo." : "Grupos e jogos criados."); } catch (e) { console.error(e); toast("Não deu para salvar o sorteio."); }
  }

  /* ---------- montagem manual: jogos de grupo, mata-mata e séries ---------- */
  function formNovoJogoGrupo(et, gi, g, jg) {
    let a = "", b = "";
    const sel = (v, set, rot) => h("select", { "aria-label": rot, onchange: e => set(e.target.value) }, h("option", { value: "" }, rot), g.map(id => h("option", { value: id }, eqNome(id))));
    return h("div", { class: "t-novo-jogo" }, h("span", { class: "cap", text: "Novo jogo no grupo " + C.letraGrupo(gi) + ":" }),
      h("div", { class: "t-linha" }, sel(a, v => a = v, "Equipe A"), h("span", { text: "x" }), sel(b, v => b = v, "Equipe B"),
        h("button", { type: "button", class: "t-mini", onclick: async () => {
          if (!a || !b || a === b) { toast("Escolha duas equipes diferentes."); return; }
          const rod = Math.max(0, ...jg.map(j => j.rodada || 0)) + 1;
          await setDoc(jogoRef(C.uid("j")), novoJogo({ etapa: etapaSel, fase: "grupo", grupo: gi, rodada: rod, ordem: 0, a, b, faseNome: "Grupo " + C.letraGrupo(gi) }));
          toast("Jogo criado: " + eqNome(a) + " x " + eqNome(b) + ".");
        } }, "+ Jogo")));
  }

  // fases seguintes já visíveis antes de existirem (vagas "1º do grupo A"...)
  function previsaoFases(et, grp) {
    const emSeries = et.formato === "series", w = h("div", { class: "t-col t-prev" }, h("h3", { class: "t-h", text: "Próximas fases (previstas)" }),
      h("p", { class: "cap", text: "Estrutura que será disputada depois dos grupos. Os nomes entram quando a fase for gerada (pela classificação ou à mão)." }));
    let n = 0; const id = () => "prev-" + (n++);
    const chavePrev = (qual, pre) => {
      const est = C.estruturaChave(qual, id), js = [];
      est.rodadas.forEach((rod, ri) => rod.forEach(m => js.push({ id: m.id, previsto: true, rodada: m.rodada, ordem: m.ordem, faseNome: pre + C.nomeFase(rod.length), status: "agendado",
        rotA: ri === 0 ? (m.x || m.y || {}).rot : "Vencedor", rotB: ri === 0 ? (m.x && m.y ? m.y.rot : "passa direto") : "Vencedor" })));
      if (est.terceiro) js.push({ id: est.terceiro.id, previsto: true, perd: est.terceiro.perd, rodada: est.terceiro.rodada, ordem: 1, faseNome: pre ? pre + "3º lugar" : C.TERCEIRO, status: "agendado", rotA: "Perdedor semifinal", rotB: "Perdedor semifinal" });
      return chaveMata(js);
    };
    if (emSeries) {
      const q = Math.min(3, et.classificam || 3);
      for (let p = 0; p < q; p++) {
        const qual = grp.map((_, gi) => ({ rot: (p + 1) + "º do grupo " + C.letraGrupo(gi), grupo: null }));
        const tipo = et.disputaSeries === "todos" && qual.length >= 3 ? "todos" : C.tipoSerie(qual.length);
        const card = h("section", { class: "t-serie s" + p }, h("h3", { class: "t-h t-serie-tit" }, h("span", { class: "t-medalha m" + p, text: MED[p] }), C.SERIES[p], h("small", { text: qual.length + " vagas · " + (tipo === "todos" ? "todos contra todos" : tipo === "final" ? "final" : "mata-mata com 3º lugar") })));
        if (tipo === "todos") card.append(h("div", { class: "t-card" }, h("ol", { class: "t-gl" }, qual.map(x => h("li", { text: x.rot })))));
        else card.append(chavePrev(qual, C.SERIES[p] + " · "));
        w.append(card);
      }
    } else {
      const q = et.classificam || 2, qual = [];
      for (let p = 1; p <= q; p++) grp.forEach((_, gi) => qual.push({ rot: p + "º do grupo " + C.letraGrupo(gi), grupo: gi, pos: p }));
      if (qual.length >= 2) w.append(chavePrev(qual, ""));
    }
    return w;
  }

  const NJOGOS = [[1, "Final (2 equipes)"], [2, "Semifinal (até 4)"], [4, "Quartas de final (até 8)"], [8, "Oitavas de final (até 16)"], [16, "16 avos (até 32)"]];
  const paresDe = qual => C.primeiraRodada(qual).map(([x, y]) => [x ? x.eid : null, y ? y.eid : null]);
  function novaChave(eids) { const pares = eids.length >= 2 ? paresDe(eids.map(eid => ({ eid, grupo: null }))) : [[null, null]]; return { nJogos: pares.length, pares }; }
  function ajustarChave(ch, n) { while (ch.pares.length < n) ch.pares.push([null, null]); ch.pares = ch.pares.slice(0, n); ch.nJogos = n; }
  function errosChave(ch) {
    const usados = ch.pares.flat().filter(Boolean);
    if (usados.length < 2) return "Escolha pelo menos 2 equipes.";
    if (new Set(usados).size !== usados.length) return "Uma equipe aparece em mais de um jogo.";
    if (ch.pares.some(([a, b]) => !a && !b)) return "Todo jogo da 1ª rodada precisa ter pelo menos uma equipe (sem adversário = passa direto).";
    return "";
  }
  // todas as equipes ficam disponíveis em qualquer vaga; escolher uma equipe já usada a tira do lugar antigo
  // onde(id) -> texto de onde ela está agora (ex.: "Jogo 2", "Série Prata"); liberar(id) tira a equipe de todas as vagas
  function editorChave(ch, candidatos, onde, liberar) {
    const ondeAqui = id => { const i = ch.pares.findIndex(p => p.includes(id)); return i >= 0 ? "Jogo " + (i + 1) : ""; };
    const local = id => ondeAqui(id) || (onde ? onde(id) : "");
    const tirar = id => { ch.pares = ch.pares.map(p => p.map(x => x === id ? null : x)); if (liberar) liberar(id); };
    const sel = (pi, lado) => h("select", { "aria-label": "Jogo " + (pi + 1) + (lado ? " equipe B" : " equipe A"), onchange: e => { const id = e.target.value || null; if (id) tirar(id); ch.pares[pi][lado] = id; render(); } },
      h("option", { value: "" }, lado ? "— (passa direto)" : "—"), candidatos.map(id => { const l = ch.pares[pi][lado] === id ? "" : local(id); return h("option", { value: id, selected: ch.pares[pi][lado] === id }, eqNome(id) + (l ? " (" + l + ")" : "")); }));
    const err = errosChave(ch);
    return h("div", { class: "t-col" },
      h("label", { class: "t-lbl" }, "1ª rodada", h("select", { onchange: e => { ajustarChave(ch, +e.target.value); render(); } }, NJOGOS.map(([n, t]) => h("option", { value: n, selected: ch.nJogos === n }, t)))),
      ch.pares.map((p, pi) => h("div", { class: "t-par" }, h("span", { class: "cap", text: "Jogo " + (pi + 1) }), sel(pi, 0), h("span", { text: "x" }), sel(pi, 1))),
      h("p", { class: "cap" + (err ? " t-erro" : ""), text: err || "Todas as equipes aparecem em todas as vagas. Se escolher uma que já está em outro lugar (mostrado entre parênteses), ela sai de lá e vem para cá. As fases seguintes, a final e a disputa de 3º lugar são criadas sozinhas." }));
  }

  function classifAtual(et, ei, q) {
    const js = jogosEtapa(ei);
    return C.gruposDe(et).map((g, gi) => C.classificacao(esporte, g, js.filter(j => j.fase === "grupo" && j.grupo === gi), eqNome).slice(0, q));
  }
  function abrirMontagemMata(et, ei, direto) {
    const qual = direto ? T.equipes.map((e, i) => ({ eid: e.id, grupo: null, pos: i + 1 })) : C.ordenarQualificados(classifAtual(et, ei, et.classificam || 2));
    const pares = paresDe(qual);
    montagem = { ei, tipo: "mata", direto, chave: { nJogos: pares.length, pares } }; render();
  }
  function abrirMontagemSeries(et, ei) {
    const q = Math.min(3, et.classificam || 3), temG = C.gruposDe(et).length > 0;
    const base = temG ? C.montarSeries(classifAtual(et, ei, q), q, et.disputaSeries === "todos") : [];
    const nS = temG ? Math.max(1, base.length) : 3;
    montagem = { ei, tipo: "series", series: Array.from({ length: nS }, (_, si) => { const s = base[si] || { equipes: [], tipo: "mata" };
      return { tipo: s.tipo === "todos" ? "todos" : "mata", equipes: [...s.equipes], chave: novaChave(s.equipes) }; }) };
    render();
  }
  function telaMontagem(et) {
    const m = montagem, todos = T.equipes.map(e => e.id), w = h("div", { class: "t-col" });
    const cancelar = h("button", { type: "button", class: "ghost", onclick: () => { montagem = null; render(); } }, "Cancelar");
    if (m.tipo === "mata") {
      w.append(h("div", { class: "t-card t-form" }, h("h3", { text: "Montar o mata-mata à mão" }),
        h("p", { class: "cap", text: "Escolha quantos jogos tem a 1ª rodada e quem joga contra quem. Veio preenchido com a sugestão pela classificação; troque o que quiser." }),
        editorChave(m.chave, todos),
        h("div", { class: "t-linha" }, h("button", { type: "button", disabled: !!errosChave(m.chave), onclick: salvarMontagemMata }, "Criar mata-mata"), cancelar)));
      return w;
    }
    w.append(h("div", { class: "t-card t-form" }, h("h3", { text: "Montar as séries à mão" }),
      h("p", { class: "cap", text: "Escolha as equipes de cada série e como ela é disputada. Veio preenchido com a sugestão pela classificação dos grupos (1ºs na Ouro, 2ºs na Prata, 3ºs na Bronze)." }),
      h("label", { class: "t-lbl" }, "Quantas séries", h("select", { onchange: e => { const n = +e.target.value; while (m.series.length < n) m.series.push({ tipo: "mata", equipes: [], chave: novaChave([]) }); m.series = m.series.slice(0, n); render(); } },
        [1, 2, 3].map(n => h("option", { value: n, selected: m.series.length === n }, n + (n === 1 ? " série (Ouro)" : n === 2 ? " séries (Ouro e Prata)" : " séries (Ouro, Prata e Bronze)")))))));
    const membros = s => s.tipo === "todos" ? s.equipes : s.chave.pares.flat();
    const ondeSerie = (si, id) => { const k = m.series.findIndex((s, k2) => k2 !== si && membros(s).includes(id)); return k >= 0 ? C.SERIES[k] : ""; };
    const liberarOutras = (si, id) => m.series.forEach((s, k) => { if (k === si) return; s.equipes = s.equipes.filter(x => x !== id); s.chave.pares = s.chave.pares.map(p => p.map(x => x === id ? null : x)); });
    m.series.forEach((s, si) => {
      const card = h("section", { class: "t-serie s" + si }, h("h3", { class: "t-h t-serie-tit" }, h("span", { class: "t-medalha m" + si, text: MED[si] }), C.SERIES[si]));
      const corpo = h("div", { class: "t-card t-form" },
        h("div", { class: "chips" }, [["mata", "Mata-mata (com 3º lugar)"], ["todos", "Todos contra todos"]].map(([k, t]) => h("button", { type: "button", "aria-pressed": String(s.tipo === k), onclick: () => {
          if (k === s.tipo) return; if (k === "todos") s.equipes = s.chave.pares.flat().filter(Boolean); else s.chave = novaChave(s.equipes); s.tipo = k; render(); } }, t))));
      if (s.tipo === "todos") corpo.append(h("div", { class: "t-escolha" }, todos.map(id => { const l = s.equipes.includes(id) ? "" : ondeSerie(si, id);
        return h("button", { type: "button", "aria-pressed": String(s.equipes.includes(id)), title: l ? "Está na " + l + "; tocar move para cá" : null,
          onclick: () => { if (s.equipes.includes(id)) s.equipes = s.equipes.filter(x => x !== id); else { liberarOutras(si, id); s.equipes = [...s.equipes, id]; } render(); } }, eqNome(id) + (l ? " (" + l.replace("Série ", "") + ")" : "")); })),
        h("p", { class: "cap", text: s.equipes.length + " equipes" + (s.equipes.length < 2 ? " · escolha pelo menos 2" : "") + ". Todas as equipes aparecem; tocar numa que está em outra série a move para cá." }));
      else corpo.append(editorChave(s.chave, todos, id => ondeSerie(si, id), id => liberarOutras(si, id)));
      card.append(corpo); w.append(card);
    });
    const ok = m.series.every(s => s.tipo === "todos" ? s.equipes.length >= 2 : !errosChave(s.chave));
    w.append(h("div", { class: "t-linha" }, h("button", { type: "button", disabled: !ok, onclick: salvarMontagemSeries }, "Criar séries"), cancelar));
    return w;
  }
  async function salvarMontagemMata() {
    const m = montagem, b = writeBatch(db);
    jogosChave(m.ei, null, { pares: m.chave.pares }).forEach(j => { const { id, ...d } = j; b.set(jogoRef(id), d); });
    if (m.direto) b.update(ref(), { etapas: T.etapas.map((e, i) => i === m.ei ? { ...e, sorteio: "manual" } : e) });
    try { await b.commit(); montagem = null; toast("Mata-mata criado."); render(); } catch (e) { console.error(e); toast("Não deu para criar o mata-mata."); }
  }
  async function salvarMontagemSeries() {
    const m = montagem, b = writeBatch(db), series = [];
    m.series.forEach((s, si) => {
      if (s.tipo === "todos") {
        series.push({ equipes: s.equipes, tipo: "todos" });
        C.todosContraTodos(s.equipes).forEach((par, r) => par.forEach(([a, bb], o) => b.set(jogoRef(C.uid("j")), novoJogo({ etapa: m.ei, fase: "serie", serie: si, rodada: r + 1, ordem: o, a, b: bb, faseNome: C.SERIES[si] }))));
      } else {
        series.push({ equipes: s.chave.pares.flat().filter(Boolean), tipo: s.chave.nJogos === 1 ? "final" : "mata" });
        jogosChave(m.ei, null, { pares: s.chave.pares, serie: si, prefixo: C.SERIES[si] + " · " }).forEach(j => { const { id, ...d } = j; b.set(jogoRef(id), d); });
      }
    });
    b.update(ref(), { etapas: T.etapas.map((e, i) => i === m.ei ? { ...e, series, formato: "series" } : e) });
    try { await b.commit(); montagem = null; toast("Séries criadas."); render(); } catch (e) { console.error(e); toast("Não deu para criar as séries."); }
  }

  async function desfazerSorteio(ei) {
    const b = writeBatch(db); jogosEtapa(ei).forEach(j => b.delete(jogoRef(j.id)));
    b.update(ref(), { etapas: T.etapas.map((e, i) => i === ei ? { ...e, grupos: [], classificam: null, series: [] } : e) });
    await b.commit(); sorteioRascunho = null; toast("Sorteio desfeito.");
  }

  function novoJogo(o) {
    return { status: "agendado", stats: {}, ...(BIR ? { sets: [{ a: 0, b: 0 }] } : { periodos: [1, 2, 3, 4].map(n => ({ n: n + "Q", a: 0, b: 0 })) }), criado: Date.now(), ...o };
  }

  function gerarMataMata(et, ei) {
    const js = jogosEtapa(ei);
    const porGrupo = C.gruposDe(et).map((g, gi) => C.classificacao(esporte, g, js.filter(j => j.fase === "grupo" && j.grupo === gi), eqNome).slice(0, et.classificam || 2));
    return criarMata(ei, C.ordenarQualificados(porGrupo));
  }
  function gerarMataDireto(ei) {
    return criarMata(ei, T.equipes.map((e, i) => ({ eid: e.id, grupo: null, pos: i + 1 })));
  }
  // jogos de uma chave (com bye e disputa de 3º lugar). extra: { serie, prefixo }
  function jogosChave(ei, qual, extra = {}) {
    const novoId = () => C.uid("j");
    const est = extra.pares ? C.estruturaDePares(extra.pares.map(([a, b]) => [a ? { eid: a } : null, b ? { eid: b } : null]), novoId) : C.estruturaChave(qual, novoId);
    const pre = extra.prefixo || "", base = extra.serie != null ? { serie: extra.serie } : {};
    const lista = [];
    est.rodadas.forEach((rod, ri) => rod.forEach(m => {
      const fase = pre + C.nomeFase(rod.length);
      if (ri === 0) {
        const a = m.x ? m.x.eid : null, bb = m.y ? m.y.eid : null;
        const j = novoJogo({ id: m.id, etapa: ei, fase: "mata", ...base, rodada: 1, ordem: m.ordem, a: a || bb, b: a && bb ? bb : null, faseNome: fase });
        if (!a || !bb) { j.wo = a || bb; j.status = "encerrado"; }
        lista.push(j);
      } else lista.push(novoJogo({ id: m.id, etapa: ei, fase: "mata", ...base, rodada: m.rodada, ordem: m.ordem, a: null, b: null, de: m.de, faseNome: fase }));
    }));
    if (est.terceiro) { const t = est.terceiro; lista.push(novoJogo({ id: t.id, etapa: ei, fase: "mata", ...base, rodada: t.rodada, ordem: t.ordem, a: null, b: null, perd: t.perd, faseNome: pre ? pre + "3º lugar" : C.TERCEIRO })); }
    // byes já avançam
    lista.forEach(j => { if (!j.de) return; const [s1, s2] = j.de.map(id => lista.find(x => x.id === id)); if (s1.wo) j.a = s1.wo; if (s2.wo) j.b = s2.wo; });
    return lista;
  }
  async function criarMata(ei, qual) {
    const b = writeBatch(db);
    jogosChave(ei, qual).forEach(j => { const { id, ...d } = j; b.set(jogoRef(id), d); });
    try { await b.commit(); toast("Mata-mata gerado."); } catch (e) { console.error(e); toast("Não deu para gerar o mata-mata."); }
  }

  // Séries (Liga): 1ºs de cada grupo na Série Ouro, 2ºs na Prata, 3ºs na Bronze
  async function gerarSeries(et, ei) {
    const js = jogosEtapa(ei), q = Math.min(3, et.classificam || 3);
    const porGrupo = C.gruposDe(et).map((g, gi) => C.classificacao(esporte, g, js.filter(j => j.fase === "grupo" && j.grupo === gi), eqNome).slice(0, q));
    const series = C.montarSeries(porGrupo, q, et.disputaSeries === "todos");
    const b = writeBatch(db);
    series.forEach((s, si) => {
      if (s.tipo === "todos") C.todosContraTodos(s.equipes).forEach((par, r) => par.forEach(([a, bb], o) => {
        const id = C.uid("j"); b.set(jogoRef(id), novoJogo({ etapa: ei, fase: "serie", serie: si, rodada: r + 1, ordem: o, a, b: bb, faseNome: C.SERIES[si] }));
      }));
      else jogosChave(ei, s.equipes.map(eid => ({ eid, grupo: null })), { serie: si, prefixo: C.SERIES[si] + " · " }).forEach(j => { const { id, ...d } = j; b.set(jogoRef(id), d); });
    });
    b.update(ref(), { etapas: T.etapas.map((e, i) => i === ei ? { ...e, series } : e) });
    try { await b.commit(); toast("Séries geradas."); } catch (e) { console.error(e); toast("Não deu para gerar as séries."); }
  }

  // após encerrar/alterar um jogo do mata-mata, leva o vencedor para o próximo jogo e o perdedor da semifinal para o 3º lugar
  function propagar(j) {
    if (j.fase !== "mata") return;
    const r = res(j), venc = r.fim && !r.empate ? r.venc : null, perd = venc ? (venc === j.a ? j.b : j.a) : null;
    jogos.forEach(x => {
      [["de", venc], ["perd", perd]].forEach(([campo, quem]) => {
        if (!(x[campo] || []).includes(j.id)) return;
        const lado = x[campo][0] === j.id ? "a" : "b";
        if (x[lado] !== quem) updateDoc(jogoRef(x.id), { [lado]: quem }).catch(console.error);
      });
    });
  }

  /* ---------- súmula ---------- */
  function abrirSumula(jid) { sumulaJid = jid; sumulaLocal = JSON.parse(JSON.stringify(jogos.find(j => j.id === jid))); modoCorrigir = false; render(); }
  let modoCorrigir = false, ladoSel = "a", somaPlacar = true, periodoSel = null, cron = { rest: 600, rodando: false, t: null };

  function salvarSumula(imediato) {
    const j = sumulaLocal; clearTimeout(salvarTimer);
    const enviar = () => { salvarTimer = null; const { id, ...d } = j; setDoc(jogoRef(id), d).then(() => propagar(j)).catch(e => { console.error(e); toast("Não deu para salvar o placar."); }); };
    if (imediato) enviar(); else salvarTimer = setTimeout(enviar, 500);
    render();
  }

  async function gerarSumula(j, tipo) {
    toast("Gerando a súmula…");
    try { await (tipo === "pdf" ? X.sumulaPDF : X.sumulaXLSX)({ ...T }, j, esporte, ctx.marca || { titulo: "Torneio", logo: "logo.png", escura: "#1f1f23", cor: "#555", destaque: "#999" }); toast("Súmula pronta."); }
    catch (e) { console.error(e); toast("Não deu para gerar a súmula. Confira a internet."); }
  }
  function telaSumula() {
    const j = sumulaLocal; if (!j) { sumulaJid = null; return null; }
    const ed = podeEditar() && j.a && j.b, r = res(j), fim = j.status === "encerrado";
    const et = T.etapas[j.etapa] || {};
    const fechar = () => { if (salvarTimer) salvarSumula(true); sumulaJid = null; sumulaLocal = null; pararCron(); render(); };
    const painel = h("div", { class: "t-sumula", role: "dialog", "aria-label": "Súmula do jogo" });
    painel.append(h("div", { class: "t-sum-topo" },
      h("button", { type: "button", class: "ghost t-mini", onclick: fechar }, "← Voltar"),
      h("span", { class: "cap", text: j.faseNome + " · " + (et.nome || "") }),
      h("span", { class: "t-pill" + (fim ? " ok" : j.status === "andamento" ? " and" : ""), text: fim ? "Encerrado" : j.status === "andamento" ? "Em andamento" : "Agendado" })));
    // placar no topo: no biribol com rodízio, cada equipe aparece do lado em que está na piscina
    const ladoTopo = BIR && ROD ? R.ordemLados(j.rodizio, Math.max(0, (j.sets || []).length - 1)) : ["a", "b"];
    const peTopo = l => h("div", { class: "t-pe" + (fim && r.venc === j[l] ? " venc" : "") }, h("span", { text: eqNome(j[l]) }), h("b", { text: BIR ? (l === "a" ? r.sa : r.sb) : (l === "a" ? r.pa : r.pb) }));
    painel.append(h("div", { class: "t-placar" }, peTopo(ladoTopo[0]), h("div", { class: "t-x", text: "x" }), peTopo(ladoTopo[1])));
    if (fim) painel.append(h("p", { class: "t-res", text: r.empate ? "Empate" : "Vitória de " + eqNome(r.venc) + (j.periodos && j.periodos.some(p => p.n === "BO") ? " na bola de ouro" : j.periodos && j.periodos.some(p => /^P/.test(p.n)) ? " na prorrogação" : "") }));
    // rodízio (formação, saque, substituições e a piscina com os jogadores) logo abaixo do placar
    if (ROD && j.a && j.b && !j.wo) painel.append(R.painel({ h, j, nomeA: eqNome(j.a), nomeB: eqNome(j.b), ed, fim, toast, render,
      atletas: { a: ((eqDe(j.a) || {}).atletas || []), b: ((eqDe(j.b) || {}).atletas || []) }, capitaes: { a: (eqDe(j.a) || {}).capitao || null, b: (eqDe(j.b) || {}).capitao || null }, tecnicos: { a: (eqDe(j.a) || {}).tecnico || "", b: (eqDe(j.b) || {}).tecnico || "" },
      salvar: () => { if (j.status === "agendado") j.status = "andamento"; salvarSumula(true); }, ponto: (l, d) => pontoEquipe(l, d) }));
    // disciplina (advertência, amarelo, vermelho, demora) pelas regras oficiais
    if (ROD && j.a && j.b && !j.wo && (ed || (j.sancoes || []).length)) painel.append(R.painelDisciplina({ h, j, nomeA: eqNome(j.a), nomeB: eqNome(j.b), ed, fim, toast, render,
      atletas: { a: ((eqDe(j.a) || {}).atletas || []), b: ((eqDe(j.b) || {}).atletas || []) }, capitaes: { a: (eqDe(j.a) || {}).capitao || null, b: (eqDe(j.b) || {}).capitao || null }, tecnicos: { a: (eqDe(j.a) || {}).tecnico || "", b: (eqDe(j.b) || {}).tecnico || "" },
      salvar: () => { if (j.status === "agendado") j.status = "andamento"; salvarSumula(true); }, ponto: (l, d) => pontoEquipe(l, d) }));
    if (fim && !j.wo) painel.append(h("div", { class: "t-linha t-sum-exp" }, h("span", { class: "cap", text: "Gerar súmula:" }),
      h("button", { type: "button", class: "ghost t-mini", onclick: () => gerarSumula(j, "pdf") }, "PDF"), h("button", { type: "button", class: "ghost t-mini", onclick: () => gerarSumula(j, "xlsx") }, "Excel")));
    BIR ? sumulaBiribol(painel, j, ed, fim) : sumulaBasquete(painel, j, ed, fim);
    // atletas
    painel.append(h("div", { class: "chips t-lados" }, ["a", "b"].map(l => h("button", { type: "button", "aria-pressed": String(ladoSel === l), onclick: () => { ladoSel = l; render(); } }, eqNome(j[l])))));
    const eq = eqDe(j[ladoSel]);
    const ats = [...((eq && eq.atletas) || [])].sort((x, y) => (x.num ?? 999) - (y.num ?? 999));
    if (eq && (eq.tecnico || eq.capitao)) { const cp = (eq.atletas || []).find(a => a.id === eq.capitao);
      painel.append(h("p", { class: "cap t-comissao", text: [eq.tecnico && "Técnico: " + eq.tecnico, cp && "Capitão: nº " + (cp.num ?? "–") + " " + cp.nome].filter(Boolean).join(" · ") })); }
    const cartoes = aid => (j.sancoes || []).filter(x => x.quem === aid && (x.tipo === "amarelo" || x.tipo === "vermelho")).map(x => x.tipo);
    const st = aid => j.stats[aid] || { p: 0, b: 0, as: 0 };
    const top = maiorPontuador(j);
    if (top) painel.append(h("p", { class: "t-cest", text: (BIR ? "Maior pontuador" : "Cestinha") + ": " + top.nome + " (" + top.p + " pts)" }));
    if (ed && !fim) painel.append(h("div", { class: "t-linha t-opts" },
      h("label", { class: "t-chk" }, h("input", { type: "checkbox", checked: modoCorrigir, onchange: e => { modoCorrigir = e.target.checked; render(); } }), "Modo corrigir (−)"),
      BIR && h("label", { class: "t-chk" }, h("input", { type: "checkbox", checked: somaPlacar, onchange: e => { somaPlacar = e.target.checked; render(); } }), "Ponto do atleta soma no placar")));
    const lista = h("div", { class: "t-satl" });
    if (!ats.length) lista.append(h("p", { class: "cap", text: "Cadastre os atletas na aba Equipes para marcar pontos, " + (BIR ? "bloqueios" : "tocos") + " e assistências." }));
    ats.forEach(a => {
      const s = st(a.id);
      const btn = (rot, fn, cls) => h("button", { type: "button", class: "t-sb " + (cls || ""), disabled: !ed || fim, onclick: fn }, modoCorrigir ? rot.replace("+", "−") : rot);
      lista.append(h("div", { class: "t-sa" },
        h("div", { class: "t-sanome" }, h("span", { class: "t-camisa", text: a.num ?? "–" }), h("span", { text: a.nome }), eq.capitao === a.id && h("span", { class: "t-capbadge", title: "Capitão", text: "C" }),
          cartoes(a.id).map(t => h("span", { class: "t-cartao " + t, title: t === "amarelo" ? "Cartão amarelo" : "Cartão vermelho (expulso)" }))),
        h("div", { class: "t-sanum" }, h("span", null, h("b", { text: s.p }), " pts"), h("span", null, h("b", { text: s.b }), BIR ? " blq" : " toco"), h("span", null, h("b", { text: s.as }), " ast")),
        ed && !fim && h("div", { class: "t-sabtns" },
          BIR ? btn("+Ponto", () => marcarPonto(a.id, 1)) : [btn("+1", () => marcarPonto(a.id, 1)), btn("+2", () => marcarPonto(a.id, 2)), btn("+3", () => marcarPonto(a.id, 3))],
          btn(BIR ? "+Bloq" : "+Toco", () => marcarStat(a.id, "b"), "sec"), btn("+Assist", () => marcarStat(a.id, "as"), "sec"))));
    });
    painel.append(lista);
    if (ed) painel.append(h("div", { class: "t-linha t-sum-fim" },
      fim ? h("button", { type: "button", class: "ghost", onclick: () => { j.status = "andamento"; j.venc = null; salvarSumula(true); } }, "Reabrir jogo")
        : !BIR && h("button", { type: "button", onclick: () => encerrarBasquete(j) }, "Encerrar jogo")));
    return h("div", { class: "t-modal t-modal-sum" }, painel);
  }

  function maiorPontuador(j) {
    let best = null;
    Object.entries(j.stats || {}).forEach(([aid, s]) => { if ((s.p || 0) > 0 && (!best || s.p > best.p)) { const a = atletaDe(aid); if (a && (a.eid === j.a || a.eid === j.b)) best = { nome: a.nome + " (" + a.enome + ")", p: s.p }; } });
    return best;
  }

  function marcarStat(aid, k) {
    const j = sumulaLocal, s = j.stats[aid] || (j.stats[aid] = { p: 0, b: 0, as: 0 });
    s[k] = Math.max(0, (s[k] || 0) + (modoCorrigir ? -1 : 1));
    if (j.status === "agendado") j.status = "andamento";
    salvarSumula();
  }
  function marcarPonto(aid, v) {
    const j = sumulaLocal, a = atletaDe(aid), lado = a.eid === j.a ? "a" : "b";
    const s = j.stats[aid] || (j.stats[aid] = { p: 0, b: 0, as: 0 });
    const d = modoCorrigir ? -v : v;
    if (s.p + d < 0) return;
    if (BIR) { if (somaPlacar && !pontoEquipe(lado, d, true)) return; }
    else { if (!pontoEquipe(lado, d, true)) return; }
    s.p += d;
    if (j.status === "agendado") j.status = "andamento";
    salvarSumula();
  }

  // soma/subtrai pontos da equipe no set/período atual; retorna false se não pode
  function pontoEquipe(lado, d, semSalvar) {
    const j = sumulaLocal;
    if (BIR) {
      let i = j.sets.length - 1, s = j.sets[i];
      if (d < 0 && !(s.a || s.b) && i > 0) { j.sets.pop(); i--; s = j.sets[i]; j.status = "andamento"; j.venc = null; } // corrige o set anterior
      if (d > 0 && setFechado(s, i)) { toast("Set encerrado."); return false; }
      if (d < 0 && (s[lado] || 0) + d < 0) { toast("O placar do set já está zerado para essa equipe."); return false; }
      s[lado] = (s[lado] || 0) + d;
      if (ROD) R.registrarPonto(j, i, lado, d);
      if (i === 2 && d > 0 && s[lado] === 8 && s[lado === "a" ? "b" : "a"] < 8) toast("Tiebreak: 8 pontos! As equipes trocam de lado.");
      if (setFechado(s, i)) {
        const r = C.resultadoBiribol(j);
        if (r.fim) { j.status = "encerrado"; j.venc = r.venc; toast("Fim de jogo: vitória de " + eqNome(r.venc) + "!"); }
        else { toast("Set " + (i + 1) + " para " + eqNome(s.a > s.b ? j.a : j.b) + "."); j.sets.push({ a: 0, b: 0 }); }
      }
    } else {
      const p = j.periodos.find(x => x.n === (periodoSel || ultimoPeriodo(j)));
      if (d < 0 && (p[lado] || 0) + d < 0) { toast("O placar do período já está zerado."); return false; }
      p[lado] = (p[lado] || 0) + d;
      if (p.n === "BO" && d > 0) { j.status = "encerrado"; j.venc = j[lado]; toast("Bola de ouro: vitória de " + eqNome(j[lado]) + "!"); }
    }
    if (j.status === "agendado") j.status = "andamento";
    if (!semSalvar) salvarSumula();
    return true;
  }
  const setFechado = (s, i) => C.setFechado(s.a || 0, s.b || 0, i);
  const ultimoPeriodo = j => j.periodos[j.periodos.length - 1].n;

  function sumulaBiribol(painel, j, ed, fim) {
    const ia = j.sets.length - 1;
    painel.append(h("div", { class: "t-sets" }, j.sets.map((s, i) => h("div", { class: "t-set" + (i === ia && !fim ? " atual" : "") },
      h("small", { text: i < 2 ? "Set " + (i + 1) + " · 21" : "Tiebreak · 15" }), h("b", { text: (ROD && R.ordemLados(j.rodizio, ia)[0] === "b") ? s.b + " - " + s.a : s.a + " - " + s.b })))));
    if (ed && !fim) {
      const s = j.sets[ia];
      // a marcação acompanha o lado da piscina de cada equipe (rodízio)
      const ordem = ROD ? R.ordemLados(j.rodizio, ia) : ["a", "b"];
      painel.append(h("div", { class: "t-pontos" }, ordem.map(l => h("div", { class: "t-pcol" },
        h("span", { class: "cap", text: eqNome(j[l]) }),
        h("b", { class: "t-pnum", text: s[l] }),
        h("div", { class: "t-linha" }, h("button", { type: "button", class: "t-pbtn", onclick: () => pontoEquipe(l, 1) }, "+1"), h("button", { type: "button", class: "ghost t-pbtn", onclick: () => pontoEquipe(l, -1) }, "−1"))))));
      painel.append(h("p", { class: "cap t-centro", text: (ia < 2 ? "Set até 21" : "Tiebreak até 15") + ", com 2 pontos de vantagem. O placar de equipe (+1) serve para pontos sem atleta, como erro do adversário." }));
    }
  }

  function sumulaBasquete(painel, j, ed, fim) {
    const sel = periodoSel && j.periodos.some(p => p.n === periodoSel) ? periodoSel : ultimoPeriodo(j);
    const nomeP = n => n === "BO" ? "Bola de ouro" : /^P/.test(n) ? "Prorr. " + n.slice(1) : n.replace("Q", "º quarto");
    painel.append(h("div", { class: "t-sets" }, j.periodos.map(p => h("button", { type: "button", class: "t-set" + (p.n === sel ? " atual" : ""), onclick: () => { periodoSel = p.n; render(); } },
      h("small", { text: nomeP(p.n) }), h("b", { text: p.a + " - " + p.b })))));
    if (ed && !fim) {
      const p = j.periodos.find(x => x.n === sel);
      painel.append(h("div", { class: "t-cron" },
        h("b", { id: "t-cron-v", text: pad(Math.floor(cron.rest / 60)) + ":" + pad(cron.rest % 60) }),
        h("button", { type: "button", class: "ghost t-mini", onclick: () => cron.rodando ? pararCron() : iniciarCron() }, cron.rodando ? "Pausar" : "Iniciar"),
        h("button", { type: "button", class: "ghost t-mini", onclick: () => { pararCron(); cron.rest = /^P/.test(sel) ? 300 : 600; render(); } }, "Zerar")));
      painel.append(h("div", { class: "t-pontos" }, ["a", "b"].map(l => h("div", { class: "t-pcol" },
        h("span", { class: "cap", text: eqNome(j[l]) + " · " + nomeP(sel) }),
        h("b", { class: "t-pnum", text: p[l] }),
        h("div", { class: "t-linha" }, h("button", { type: "button", class: "ghost t-pbtn", onclick: () => { periodoSel = sel; pontoEquipe(l, 1); } }, "+1"), h("button", { type: "button", class: "ghost t-pbtn", onclick: () => { periodoSel = sel; pontoEquipe(l, -1); } }, "−1"))))));
      const r = res(j), mata = j.fase === "mata", empatado = r.pa === r.pb;
      const temQ4 = j.periodos.length >= 4;
      painel.append(h("div", { class: "t-linha" },
        h("button", { type: "button", class: "ghost t-mini", disabled: !(temQ4 && empatado) || j.periodos.some(x => x.n === "BO"), onclick: () => { const n = "P" + (j.periodos.filter(x => /^P/.test(x.n)).length + 1); j.periodos.push({ n, a: 0, b: 0 }); periodoSel = n; cron.rest = 300; salvarSumula(); } }, "+ Prorrogação"),
        mata && h("button", { type: "button", class: "ghost t-mini", disabled: !(temQ4 && empatado) || j.periodos.some(x => x.n === "BO"), onclick: () => { j.periodos.push({ n: "BO", a: 0, b: 0 }); periodoSel = "BO"; salvarSumula(); toast("Bola de ouro: um ataque para cada; quem pontuar primeiro vence."); } }, "Bola de ouro")));
      painel.append(h("p", { class: "cap", text: "Os pontos do atleta (+1, +2, +3) entram no placar do período selecionado. Use o +1 da equipe só para corrigir pontos sem atleta." }));
    }
  }
  function iniciarCron() { if (cron.rodando) return; cron.rodando = true; cron.t = setInterval(() => { cron.rest = Math.max(0, cron.rest - 1); const v = document.getElementById("t-cron-v"); if (v) v.textContent = pad(Math.floor(cron.rest / 60)) + ":" + pad(cron.rest % 60); if (!cron.rest) { pararCron(); toast("Fim do tempo do período."); render(); } }, 1000); render(); }
  function pararCron() { cron.rodando = false; clearInterval(cron.t); }

  function encerrarBasquete(j) {
    const r = C.resultadoBasquete({ ...j, status: "encerrado" });
    if (r.empate && j.fase === "mata") { toast("Empate no mata-mata: use prorrogação ou bola de ouro."); return; }
    perguntar(r.empate ? "Encerrar com empate (" + r.pa + " x " + r.pb + ")?" : "Encerrar o jogo com vitória de " + eqNome(r.venc) + " (" + r.pa + " x " + r.pb + ")?", () => {
      j.status = "encerrado"; j.venc = r.venc; pararCron(); salvarSumula(true);
    }, "Encerrar");
  }

  /* ---------- estatísticas ---------- */
  function telaStats() {
    const w = h("div", { class: "t-col" });
    // relatório (PDF/Excel) com os mesmos números desta tela
    const rel = { titulo: (ctx.rotuloStats || "Estatísticas") + " · " + T.nome, sub: "", blocos: [] };
    const relBar = (titulo, cap, itens, extra) => rel.blocos.push({ t: "barras", titulo, cap, itens: itens.map(i => ({ nome: i.nome, sub: i.sub, v: i.v, txt: i.fmt != null ? i.fmt : i.v, extra: i.extra, hi: i.hi })), ...(extra || {}) });
    const fases = [...new Set(jogos.map(C.faseEstat))];
    const ordemF = C.ORDEM_FASES;
    fases.sort((a, b) => ordemF.indexOf(a) - ordemF.indexOf(b));
    w.append(h("div", { class: "t-linha" },
      h("select", { "aria-label": "Etapa", onchange: e => { filtroEtapa = e.target.value; render(); } }, h("option", { value: "todas" }, "Todas as etapas"), T.etapas.map((et, i) => h("option", { value: i, selected: String(i) === String(filtroEtapa) }, et.nome))),
      h("select", { "aria-label": "Fase", onchange: e => { filtroFase = e.target.value; render(); } }, h("option", { value: "todas" }, "Todas as fases"), fases.map(f => h("option", { value: f, selected: f === filtroFase }, f)))));
    const faseDe = C.faseEstat;
    const js = jogos.filter(j => !j.wo && j.status === "encerrado" && (filtroEtapa === "todas" || j.etapa === +filtroEtapa) && (filtroFase === "todas" || faseDe(j) === filtroFase));
    rel.sub = (filtroEtapa === "todas" ? "Todas as etapas" : (T.etapas[+filtroEtapa] || {}).nome) + " · " + (filtroFase === "todas" ? "todas as fases" : filtroFase);
    w.append(botoesRelatorio(rel, { toast, marca: ctx.marca, X }));
    if (!js.length) { w.append(h("div", { class: "t-card" }, h("p", { class: "cap", text: "As estatísticas aparecem quando houver jogos encerrados." }))); }
    const sa = C.statsAtletas(js);
    const todosAtl = T.equipes.flatMap(e => (e.atletas || []).map(a => ({ ...a, nome: a.nome + capTag(e, a), eid: e.id, enome: e.nome, ...(sa[a.id] || { p: 0, b: 0, as: 0, jogos: 0 }) })));
    const jogaram = new Set(js.flatMap(j => [j.a, j.b]));
    // ===== estatísticas gerais =====
    if (js.length) {
      const fmt1 = v => (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
      let totPts = 0, maiorEq = { v: -1 }, maiorVit = { v: -1 }, maiorInd = { v: -1 }, extras = 0, decididos = 0;
      js.forEach(j => {
        const r = res(j); totPts += r.pa + r.pb;
        [[j.a, r.pa], [j.b, r.pb]].forEach(([e, v]) => { if (v > maiorEq.v) maiorEq = { v, e, j }; });
        const dif = Math.abs(r.pa - r.pb); if (!r.empate && dif > maiorVit.v) maiorVit = { v: dif, j, r };
        Object.entries(j.stats || {}).forEach(([aid, st]) => { if ((st.p || 0) > maiorInd.v) maiorInd = { v: st.p || 0, aid, j }; });
        if (BIR) { if ((j.sets || []).length >= 3) extras++; }
        else if ((j.periodos || []).some(p => /^P|BO/.test(p.n))) extras++;
        if (!r.empate) decididos++;
      });
      const totB = Object.values(sa).reduce((t, x) => t + x.b, 0), totA = Object.values(sa).reduce((t, x) => t + x.as, 0);
      const descJ = j => eqNome(j.a) + " x " + eqNome(j.b);
      const ind = maiorInd.aid ? atletaDe(maiorInd.aid) : null;
      const tiles = [
        ["Jogos", js.length, "encerrados no filtro"],
        ["Pontos", totPts, "somando as duas equipes"],
        ["Média por jogo", fmt1(totPts / js.length), "pontos (as duas equipes)"],
        ["Média por equipe", fmt1(totPts / js.length / 2), "pontos por jogo"],
        ["Maior pontuação", maiorEq.v, maiorEq.e ? eqNome(maiorEq.e) + " · " + descJ(maiorEq.j) : "—"],
        ["Maior vitória", maiorVit.v >= 0 ? "+" + maiorVit.v : "—", maiorVit.j ? eqNome(maiorVit.r.venc) + " · " + maiorVit.r.pa + " x " + maiorVit.r.pb : "—"],
        [BIR ? "Maior pontuador num jogo" : "Cestinha de um jogo", maiorInd.v > 0 ? maiorInd.v : "—", ind ? ind.nome + " (" + ind.enome + ")" : "—"],
        [BIR ? "Jogos no tiebreak" : "Jogos com prorrogação", extras, Math.round(extras / js.length * 100) + "% dos jogos"],
        [BIR ? "Bloqueios" : "Tocos", totB, "média " + fmt1(totB / js.length) + " por jogo"],
        ["Assistências", totA, "média " + fmt1(totA / js.length) + " por jogo"]];
      if (!BIR) tiles.push(["Empates", js.length - decididos, "na fase de classificação"]);
      rel.blocos.push({ t: "quadros", titulo: "Estatísticas gerais", itens: tiles.map(([a, b, c]) => [a, b, c]) });
      w.append(h("div", { class: "card" }, h("h3", { text: "Estatísticas gerais" }), h("p", { class: "cap", text: "Números do filtro escolhido acima" }),
        h("div", { class: "tiles" }, tiles.map(([a, b, c]) => h("div", { class: "tile" }, h("span", { text: a }), h("b", { text: b }), h("small", { text: c }))))));
      // média de pontos por fase
      const porFase = {};
      js.forEach(j => { const f = faseDe(j), r = res(j); const x = porFase[f] || (porFase[f] = { n: 0, p: 0 }); x.n++; x.p += r.pa + r.pb; });
      const fasesOrd = Object.keys(porFase).sort((a, b) => ordemF.indexOf(a) - ordemF.indexOf(b));
      if (fasesOrd.length > 1) {
        const mf = Math.max(...fasesOrd.map(f => porFase[f].p / porFase[f].n));
        relBar("Média de pontos por jogo, por fase", "Soma das duas equipes", fasesOrd.map(f => ({ nome: f, v: porFase[f].p / porFase[f].n, fmt: fmt1(porFase[f].p / porFase[f].n), extra: porFase[f].n + " jogos" })), { pos: false });
        w.append(h("div", { class: "card" }, h("h3", { text: "Média de pontos por jogo, por fase" }), h("p", { class: "cap", text: "Soma das duas equipes" }),
          barrasH(fasesOrd.map(f => ({ nome: f, v: Number(fmt1(porFase[f].p / porFase[f].n).replace(",", ".")), fmt: fmt1(porFase[f].p / porFase[f].n), extra: porFase[f].n + (porFase[f].n === 1 ? " jogo" : " jogos"), hi: porFase[f].p / porFase[f].n === mf })), "", false, true, true)));
      }
      // média de pontos de cada equipe (feitos e sofridos por jogo)
      const eqm = {};
      js.forEach(j => { const r = res(j); [[j.a, r.pa, r.pb], [j.b, r.pb, r.pa]].forEach(([e, pf, pc]) => { const x = eqm[e] || (eqm[e] = { n: 0, pf: 0, pc: 0 }); x.n++; x.pf += pf; x.pc += pc; }); });
      const eqOrd = Object.keys(eqm).sort((a, b) => eqm[b].pf / eqm[b].n - eqm[a].pf / eqm[a].n);
      relBar("Média de pontos de cada equipe", "Pontos feitos por jogo · ao lado, quantos sofre por jogo", eqOrd.map((e, i) => ({ nome: eqNome(e), v: eqm[e].pf / eqm[e].n, fmt: fmt1(eqm[e].pf / eqm[e].n), extra: "sofre " + fmt1(eqm[e].pc / eqm[e].n) + " · " + eqm[e].n + " jogos", hi: i === 0 })));
      w.append(h("div", { class: "card" }, h("h3", { text: "Média de pontos de cada equipe" }), h("p", { class: "cap", text: "Pontos feitos por jogo · ao lado, quantos sofre por jogo" }),
        barrasH(eqOrd.map((e, i) => ({ nome: eqNome(e), v: eqm[e].pf / eqm[e].n, fmt: fmt1(eqm[e].pf / eqm[e].n), extra: "sofre " + fmt1(eqm[e].pc / eqm[e].n) + " · " + eqm[e].n + (eqm[e].n === 1 ? " jogo" : " jogos"), hi: i === 0 })), "Sem dados ainda.", false, true)));
      // média de pontos de cada atleta (pontos ÷ jogos da equipe)
      const jogosEq = {}; js.forEach(j => { jogosEq[j.a] = (jogosEq[j.a] || 0) + 1; jogosEq[j.b] = (jogosEq[j.b] || 0) + 1; });
      const medAt = todosAtl.filter(a => jogosEq[a.eid]).map(a => ({ ...a, med: a.p / jogosEq[a.eid], nj: jogosEq[a.eid] })).sort((x, y) => y.med - x.med || x.nome.localeCompare(y.nome, "pt-BR"));
      relBar("Média de pontos de cada atleta", "Pontos por jogo da equipe", medAt.map((a, i) => ({ nome: a.nome, sub: a.enome, v: a.med, fmt: fmt1(a.med), extra: a.p + " pts em " + a.nj + " jogos", hi: i === 0 && a.med > 0 })), { limitePDF: 30 });
      const verTodos = ls.get("medias-todos") === "1";
      const lista = verTodos ? medAt : medAt.slice(0, 10);
      w.append(h("div", { class: "card" }, h("h3", { text: "Média de pontos de cada atleta" }),
        h("p", { class: "cap", text: "Pontos por jogo da equipe · " + (verTodos ? "todos os " + medAt.length + " atletas" : "os 10 melhores de " + medAt.length) }),
        barrasH(lista.map((a, i) => ({ nome: a.nome, sub: a.enome, v: a.med, fmt: fmt1(a.med), extra: a.p + " pts em " + a.nj + (a.nj === 1 ? " jogo" : " jogos"), hi: i === 0 && a.med > 0 })), "Sem atletas cadastrados.", false, true),
        medAt.length > 10 && h("button", { type: "button", class: "ghost t-mini", onclick: () => { ls.set("medias-todos", verTodos ? "0" : "1"); render(); } }, verTodos ? "Mostrar só os 10 melhores" : "Ver todos os atletas")));
    }
    // por equipe
    if (!equipeSel || !eqDe(equipeSel)) equipeSel = T.equipes[0] && T.equipes[0].id;
    const daEq = todosAtl.filter(a => a.eid === equipeSel).sort((x, y) => y.p - x.p || x.nome.localeCompare(y.nome, "pt-BR"));
    w.append(h("div", { class: "card" },
      h("h3", { text: "Pontuação por equipe" }),
      h("select", { "aria-label": "Equipe", class: "t-sel-eq", onchange: e => { equipeSel = e.target.value; render(); } }, T.equipes.map(e => h("option", { value: e.id, selected: e.id === equipeSel }, e.nome))),
      h("p", { class: "cap", text: "Do maior para o menor pontuador · " + (BIR ? "blq = bloqueios" : "toco") + ", ast = assistências" }),
      barrasH(daEq.map((a, i) => ({ nome: (a.num != null ? "#" + a.num + " " : "") + a.nome, v: a.p, extra: a.b + (BIR ? " blq · " : " toco · ") + a.as + " ast", hi: i === 0 && a.p > 0 })), "Sem atletas cadastrados.")));
    const comJogo = todosAtl.filter(a => jogaram.has(a.eid));
    const top10 = [...comJogo].sort((x, y) => y.p - x.p || x.nome.localeCompare(y.nome, "pt-BR")).slice(0, 10);
    const bot10 = [...comJogo].sort((x, y) => x.p - y.p || x.nome.localeCompare(y.nome, "pt-BR")).slice(0, 10);
    const lin = a => ({ nome: a.nome, sub: a.enome, v: a.p, extra: a.b + (BIR ? " blq · " : " toco · ") + a.as + " ast" });
    relBar("10 maiores pontuadores", "Geral do filtro escolhido", top10.map(lin)); relBar("10 menores pontuadores", "Entre atletas de equipes que jogaram", bot10.map(lin));
    w.append(h("div", { class: "card" }, h("h3", { text: "10 maiores pontuadores" }), h("p", { class: "cap", text: "Geral do filtro escolhido" }), barrasH(top10.map((a, i) => ({ ...lin(a), hi: i === 0 && a.p > 0 })), "Sem dados ainda.")));
    w.append(h("div", { class: "card" }, h("h3", { text: "10 menores pontuadores" }), h("p", { class: "cap", text: "Entre atletas de equipes que jogaram" }), barrasH(bot10.map(lin), "Sem dados ainda.", true)));
    // pontos das equipes por fase
    const fasesTab = [...new Set(js.map(faseDe))].sort((a, b) => ordemF.indexOf(a) - ordemF.indexOf(b));
    const pts = {}; T.equipes.forEach(e => pts[e.id] = { geral: { pf: 0, pc: 0 } });
    js.forEach(j => { const r = res(j), f = faseDe(j);
      [[j.a, r.pa, r.pb], [j.b, r.pb, r.pa]].forEach(([e, pf, pc]) => { if (!pts[e]) return; const x = pts[e][f] || (pts[e][f] = { pf: 0, pc: 0 }); x.pf += pf; x.pc += pc; pts[e].geral.pf += pf; pts[e].geral.pc += pc; }); });
    const ord = T.equipes.filter(e => jogaram.has(e.id)).sort((a, b) => (pts[b.id].geral.pf - pts[b.id].geral.pc) - (pts[a.id].geral.pf - pts[a.id].geral.pc));
    const sal = x => x ? x.pf - x.pc : null, fmtS = v => v == null ? "–" : (v > 0 ? "+" : "") + v;
    relBar("Saldo de pontos das equipes", "Pontos feitos menos pontos tomados · geral", ord.map(e => ({ nome: e.nome, v: sal(pts[e.id].geral), fmt: fmtS(sal(pts[e.id].geral)) })), { saldo: true });
    rel.blocos.push({ t: "tabela", titulo: "Pontos feitos, tomados e saldo", cap: "PF = feitos · PT = tomados · por fase e geral",
      cab: ["Equipe", ...[...fasesTab, "Geral"].flatMap(f => [f + " PF", f + " PT", f + " Saldo"])], linhas: ord.map(e => [e.nome, ...[...fasesTab, "geral"].flatMap(f => { const x = pts[e.id][f]; return [x ? x.pf : "–", x ? x.pc : "–", fmtS(sal(x))]; })]) });
    w.append(h("div", { class: "card" }, h("h3", { text: "Saldo de pontos das equipes" }), h("p", { class: "cap", text: "Pontos feitos menos pontos tomados · geral" }), barrasSaldo(ord.map(e => ({ nome: e.nome, v: sal(pts[e.id].geral) })))));
    w.append(h("div", { class: "card" }, h("h3", { text: "Pontos feitos, tomados e saldo" }), h("p", { class: "cap", text: "PF = feitos · PT = tomados · por fase e geral" }),
      h("div", { class: "tablebox" }, h("table", { class: "t-tab t-tab-lg" },
        h("thead", null, h("tr", null, h("th", { class: "l", text: "Equipe" }), fasesTab.map(f => h("th", { colspan: 3, text: f })), h("th", { colspan: 3, text: "Geral" })),
          h("tr", { class: "t-subrow" }, h("th", null), [...fasesTab, "geral"].map(() => [h("th", { text: "PF" }), h("th", { text: "PT" }), h("th", { text: "Saldo" })]))),
        h("tbody", null, ord.map(e => h("tr", null, h("td", { class: "l", text: e.nome }), [...fasesTab, "geral"].map(f => { const x = pts[e.id][f]; return [h("td", { text: x ? x.pf : "–" }), h("td", { text: x ? x.pc : "–" }), h("td", { class: "saldo " + (sal(x) > 0 ? "pos" : sal(x) < 0 ? "neg" : ""), text: fmtS(sal(x)) })]; }))))))));
    // painel V/D por etapa
    const todosJ = jogos.filter(j => !j.wo && j.status === "encerrado" && (filtroFase === "todas" || faseDe(j) === filtroFase));
    const vd = {}; T.equipes.forEach(e => vd[e.id] = {});
    todosJ.forEach(j => { const r = res(j); [j.a, j.b].forEach(e => { if (!vd[e]) return; const x = vd[e][j.etapa] || (vd[e][j.etapa] = { v: 0, d: 0, e: 0 }); if (r.empate) x.e++; else if (r.venc === e) x.v++; else x.d++; }); });
    const tot = e => Object.values(vd[e]).reduce((s, x) => ({ v: s.v + x.v, d: s.d + x.d, e: s.e + x.e }), { v: 0, d: 0, e: 0 });
    const ordVD = [...T.equipes].sort((a, b) => tot(b.id).v - tot(a.id).v || tot(a.id).d - tot(b.id).d);
    const txVD = x => x ? x.v + "V " + x.d + "D" + (x.e ? " " + x.e + "E" : "") : "–";
    rel.blocos.push({ t: "tabela", titulo: "Painel de vitórias e derrotas", cap: "Por etapa e no total", cab: ["Equipe", ...T.etapas.map(et => et.nome), "Total"], linhas: ordVD.map(e => [e.nome, ...T.etapas.map((_, i) => txVD(vd[e.id][i])), txVD(tot(e.id))]) });
    // pontuação por atleta de cada equipe (todas as equipes no relatório)
    rel.blocos.push({ t: "tabela", titulo: "Pontuação dos atletas por equipe", cab: ["Atleta", "Equipe", "Nº", "Pontos", BIR ? "Bloqueios" : "Tocos", "Assist."], esq: [0, 1],
      linhas: [...todosAtl].sort((x, y) => x.enome.localeCompare(y.enome, "pt-BR") || y.p - x.p).map(a => [a.nome, a.enome, a.num ?? "", a.p, a.b, a.as]) });
    const cel = x => x ? h("td", { class: "vd" }, h("span", { class: "v", text: x.v + "V" }), " ", h("span", { class: "d", text: x.d + "D" }), x.e ? h("span", { class: "e", text: " " + x.e + "E" }) : null) : h("td", { text: "–" });
    w.append(h("div", { class: "card" }, h("h3", { text: "Painel de vitórias e derrotas" }), h("p", { class: "cap", text: "Por etapa e no total" + (filtroFase !== "todas" ? " · fase: " + filtroFase : "") }),
      h("div", { class: "tablebox" }, h("table", { class: "t-tab t-tab-lg" },
        h("thead", null, h("tr", null, h("th", { class: "l", text: "Equipe" }), T.etapas.map(et => h("th", { text: et.nome })), h("th", { text: "Total" }))),
        h("tbody", null, ordVD.map(e => h("tr", null, h("td", { class: "l", text: e.nome }), T.etapas.map((_, i) => cel(vd[e.id][i])), cel(tot(e.id)))))))));
    // comissão: técnico e capitão de cada equipe
    const comissao = T.equipes.map(e => { const cp = (e.atletas || []).find(a => a.id === e.capitao); return [e.nome, e.tecnico || "–", cp ? "nº " + (cp.num ?? "–") + " " + cp.nome : "–"]; });
    if (comissao.some(l => l[1] !== "–" || l[2] !== "–")) {
      w.append(h("div", { class: "card" }, h("h3", { text: "Técnicos e capitães" }),
        h("div", { class: "tablebox" }, h("table", { class: "t-tab" }, h("thead", null, h("tr", null, h("th", { class: "l", text: "Equipe" }), h("th", { class: "l", text: "Técnico" }), h("th", { class: "l", text: "Capitão" }))),
          h("tbody", null, comissao.map(l => h("tr", null, l.map(v => h("td", { class: "l", text: v })))))))));
      rel.blocos.push({ t: "tabela", titulo: "Técnicos e capitães", cab: ["Equipe", "Técnico", "Capitão"], esq: [0, 1, 2], linhas: comissao });
    }
    // disciplina: cartões e sanções do filtro escolhido (biribol)
    if (BIR) {
      const jsF = jogos.filter(j => (filtroEtapa === "todas" || j.etapa === +filtroEtapa) && (filtroFase === "todas" || faseDe(j) === filtroFase));
      const porEq = {}, lista = [];
      jsF.forEach(j => (j.sancoes || []).forEach(x => {
        const eid = j[x.l], e = eqDe(eid); if (!e) return;
        const P = porEq[eid] || (porEq[eid] = { nome: e.nome, adv: 0, amarelo: 0, vermelho: 0, advDemora: 0, penDemora: 0 }); P[x.tipo] = (P[x.tipo] || 0) + 1;
        if (x.tipo === "amarelo" || x.tipo === "vermelho") { const a = (e.atletas || []).find(y => y.id === x.quem);
          lista.push([x.tipo === "amarelo" ? "Amarelo" : "Vermelho", x.quem === "tec" ? "Técnico" + (e.tecnico ? " " + e.tecnico : "") : x.quem === "com" ? "Comissão técnica" : a ? "nº " + (a.num ?? "–") + " " + a.nome + capTag(e, a) : "?", e.nome, eqNome(j[x.l === "a" ? "b" : "a"]), j.faseNome || "", (x.set < 2 ? (x.set + 1) + "º set" : "Tiebreak") + " · " + (x.placar || "")]); }
      }));
      const ordD = Object.values(porEq).sort((x, y) => y.vermelho - x.vermelho || y.amarelo - x.amarelo || x.nome.localeCompare(y.nome, "pt-BR"));
      w.append(h("div", { class: "card" }, h("h3", { text: "Cartões e disciplina" }), h("p", { class: "cap", text: "Advertências, cartões e sanções por demora do filtro escolhido" }),
        ordD.length ? [h("div", { class: "tablebox" }, h("table", { class: "t-tab" }, h("thead", null, h("tr", null, h("th", { class: "l", text: "Equipe" }), h("th", { text: "Advert." }), h("th", { text: "🟨" }), h("th", { text: "🟥" }), h("th", { text: "Demora" }))),
          h("tbody", null, ordD.map(x => h("tr", null, h("td", { class: "l", text: x.nome }), h("td", { text: x.adv }), h("td", { text: x.amarelo }), h("td", { text: x.vermelho }), h("td", { text: x.advDemora + x.penDemora })))))),
          lista.length && h("div", { class: "tablebox" }, h("table", { class: "t-tab" }, h("thead", null, h("tr", null, ["Cartão", "Quem", "Equipe", "Adversário", "Fase", "Momento"].map((c, i) => h("th", { class: i < 4 ? "l" : null, text: c })))),
            h("tbody", null, lista.map(l => h("tr", null, l.map((v, i) => h("td", { class: (i < 4 ? "l" : "") + (i === 0 ? (v === "Amarelo" ? " t-am" : " t-vm") : "") || null, text: v }))))))) ]
          : h("p", { class: "cap", text: "Nenhuma sanção registrada." })));
      rel.blocos.push({ t: "tabela", titulo: "Cartões por equipe", cab: ["Equipe", "Advertências", "Amarelos", "Vermelhos", "Demora"], linhas: ordD.map(x => [x.nome, x.adv, x.amarelo, x.vermelho, x.advDemora + x.penDemora]) });
      rel.blocos.push({ t: "tabela", titulo: "Cartões aplicados", cab: ["Cartão", "Quem", "Equipe", "Adversário", "Fase", "Momento"], esq: [0, 1, 2, 3, 4], linhas: lista });
    }
    return w;
  }

  function barrasH(itens, vazio, inverso, decimal, semPos) {
    const box = h("div", { class: "hbars" });
    if (!itens.length) { box.append(h("p", { class: "cap", text: vazio })); return box; }
    const max = Math.max(1, ...itens.map(i => i.v));
    itens.forEach((it, i) => box.append(h("div", { class: "hb" + (it.hi ? " p1" : ""), title: it.nome + ": " + (it.fmt != null ? it.fmt : it.v) + (decimal ? " de média" : " pontos") },
      h("span", { class: "pos", style: "grid-row:1/3", text: semPos ? "" : (i + 1) + "º" }),
      h("span", { class: "nm" }, it.nome, it.sub && h("small", { class: "t-subnm", text: " · " + it.sub })),
      h("div", { class: "q" }, h("b", { text: it.fmt != null ? it.fmt : it.v }), h("small", { text: it.extra || "" })),
      h("div", { class: "trk" }, h("i", { style: "width:" + (it.v / max * 100) + "%" + (inverso ? ";opacity:.55" : "") })))));
    return box;
  }
  function barrasSaldo(itens) {
    const box = h("div", { class: "t-saldos" });
    if (!itens.length) { box.append(h("p", { class: "cap", text: "Sem jogos encerrados ainda." })); return box; }
    const max = Math.max(1, ...itens.map(i => Math.abs(i.v || 0)));
    itens.forEach(it => box.append(h("div", { class: "t-sl", title: it.nome + ": saldo " + (it.v > 0 ? "+" : "") + it.v },
      h("span", { class: "nm", text: it.nome }),
      h("div", { class: "t-sltrk" }, h("div", { class: "neg" }, it.v < 0 && h("i", { style: "width:" + (-it.v / max * 100) + "%" })), h("div", { class: "pos" }, it.v > 0 && h("i", { style: "width:" + (it.v / max * 100) + "%" }))),
      h("b", { class: it.v > 0 ? "pos" : it.v < 0 ? "neg" : "", text: (it.v > 0 ? "+" : "") + it.v }))));
    return box;
  }

  return { render, atualizarPermissao: () => render() };
}
