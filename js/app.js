// Telas do app Biribol Mococa na Liga: História, Próxima etapa, Atletas e Estatísticas (+ edição de etapas e partidas).
import * as C from "./calc.js";
import { gerarDemo } from "./demo.js";
import * as I from "./importar.js";
import { montarTorneio } from "./torneio.js";

const COL_AT = "mococa_atletas", COL_ET = "mococa_etapas", COL_CONF = "confirmacoes";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const pct = v => Math.round(v * 100) + "%";

export function montarApp(ctx) {
  const { db, fs, toast, root } = ctx;
  const { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } = fs;
  const podeEditar = () => ctx.podeEditar();
  const ls = { get(k) { try { return localStorage.getItem("mococa-" + k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem("mococa-" + k, v); } catch (e) {} } };

  let atletas = [], etapas = [], confs = {}, carregou = { at: false, et: false };
  let aba = ls.get("aba") || "historia", temp = ls.get("temp") || "todas", atlSel = null, advSel = null;
  let edEtapa = null, edPartida = null, pergunta = null, ocupado = false, imp = null;
  const subsConf = {};
  const CASA = "Biribol Mococa";

  // torneios completos (mesmo módulo do app da Liga), guardados em mococa_torneios
  const torRoot = document.createElement("div"); torRoot.className = "t-col";
  const torneio = montarTorneio({ db, fs: { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch }, esporte: "biribol", col: "mococa_torneios", maxAtletas: 8, toast,
    root: torRoot, podeEditar, nomeDemo: "Liga Metropolitana (simulação)", formatoSeries: true, pontosSets: true, autor: ctx.autor,
    rodizio: true,
    aoVivo: { app: "mococa", canal: { id: "UCv2QFBwysAf_ochScxkfDmA", handle: "LMB-LigaMetropolitanaBiribol" }, canalDe: "lmb", instagram: "biribol_mococa" },
    midias: { app: "mococa", perfis: [{ usuario: "biribol_mococa", nome: "Biribol Mococa" }], hashtags: "#biribol #biribolmococa #ligametropolitana" },
    equipeCasa: () => ({ nome: CASA, atletas: [...ativos()].sort((a, b) => (a.num ?? 999) - (b.num ?? 999)) }),
    marca: { titulo: "Biribol Mococa na Liga", logo: "img/logo.jpg", escura: "#061535", cor: "#1a679f", destaque: "#e3b90f" } });

  /* ---------- utilitários ---------- */
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "style") e.style.cssText = v;
      else if (k === "value") e.value = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    kids.flat(9).forEach(c => { if (c == null || c === false) return; e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  const nomeAt = id => (atletas.find(a => a.id === id) || {}).nome || "";
  const ativos = () => atletas.filter(a => a.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const realizadas = () => etapas.filter(e => e.status !== "proxima");
  const temporadas = () => [...new Set(realizadas().map(C.temporadaDe).filter(Boolean))].sort((a, b) => b - a);
  const filtradas = () => realizadas().filter(e => temp === "todas" || String(C.temporadaDe(e)) === String(temp));
  const etapaRef = id => doc(db, COL_ET, id);
  const msDe = em => em && em.toMillis ? em.toMillis() : typeof em === "number" ? em : Date.now();
  const limpar = o => JSON.parse(JSON.stringify(o)); // tira undefined (o Firestore recusa)

  function perguntar(msg, fn, rot = "Confirmar") { pergunta = { msg, fn, rot }; render(); }
  function caixaPergunta() {
    if (!pergunta) return null;
    const p = pergunta;
    return h("div", { class: "conf", role: "dialog", "aria-modal": "true" }, h("div", { class: "card col" }, h("p", { text: p.msg, style: "margin:0" }),
      h("div", { class: "linha" }, h("button", { type: "button", class: "danger", onclick: async () => { pergunta = null; render(); try { await p.fn(); } catch (e) { console.error(e); toast("Não deu para salvar. Confira a conexão."); } } }, p.rot),
        h("button", { type: "button", class: "ghost", onclick: () => { pergunta = null; render(); } }, "Cancelar"))));
  }

  /* ---------- dados ---------- */
  let erroLeitura = null;
  const falhou = (k, e) => { console.error(e); erroLeitura = (e && e.code) || "erro"; carregou[k] = true; render(); };
  onSnapshot(collection(db, COL_AT), s => { atletas = s.docs.map(d => ({ id: d.id, ...d.data() })); carregou.at = true; erroLeitura = null; render(); }, e => falhou("at", e));
  onSnapshot(collection(db, COL_ET), s => {
    etapas = s.docs.map(d => ({ id: d.id, ...d.data() })).map(e => ({ ...e, partidas: e.partidas || [], atletas: e.atletas || [] }));
    carregou.et = true;
    const abertas = new Set(etapas.filter(e => e.status === "proxima").map(e => e.id));
    Object.keys(subsConf).forEach(id => { if (!abertas.has(id)) { subsConf[id](); delete subsConf[id]; delete confs[id]; } });
    abertas.forEach(id => { if (!subsConf[id]) subsConf[id] = onSnapshot(collection(db, COL_ET, id, COL_CONF), s2 => { confs[id] = s2.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => msDe(a.em) - msDe(b.em)); render(); }, e => console.error(e)); });
    render();
  }, e => falhou("et", e));

  /* ---------- tela principal ---------- */
  function render() {
    const y = window.scrollY;
    root.textContent = "";
    if (imp && podeEditar()) root.append(telaImportar());
    else if (edPartida && podeEditar()) root.append(telaPartida());
    else if (edEtapa && podeEditar()) root.append(telaEtapa());
    else {
      const abas = [["historia", "História"], ["proxima", "Próxima etapa"], ["torneios", "Torneios"], ["atletas", "Atletas"], ["stats", "Estatísticas"]];
      root.append(h("nav", { class: "abas", role: "tablist" }, abas.map(([k, t]) => h("button", { type: "button", role: "tab", "aria-selected": String(aba === k), onclick: () => { aba = k; ls.set("aba", k); atlSel = null; render(); window.scrollTo(0, 0); } }, t))));
      const ts = temporadas();
      if (aba !== "proxima" && aba !== "torneios" && ts.length > 1) root.append(h("div", { class: "chips", "aria-label": "Temporada" },
        [["todas", "Todas as temporadas"], ...ts.map(t => [String(t), "Temporada " + t])].map(([k, t]) => h("button", { type: "button", "aria-pressed": String(String(temp) === k), onclick: () => { temp = k; ls.set("temp", k); render(); } }, t))));
      if (erroLeitura) root.append(h("div", { class: "card" }, h("p", { class: "cap", style: "margin:0;color:var(--danger)", text: "Não deu para ler os dados (" + erroLeitura + "). Confira a internet e abra o app de novo; se continuar, avise o organizador." })));
      if (!carregou.at || !carregou.et) root.append(h("p", { class: "cap", text: "Carregando…" }));
      else if (aba === "torneios") {
        if (!podeEditar()) root.append(h("p", { class: "cap", text: "Para cadastrar torneios, equipes e placares, toque em \"Entrar como organizador\" ou \"Entrar como editor\" no fim da página." }));
        else if (!ativos().length) root.append(h("div", { class: "card linha entre" }, h("p", { class: "cap", style: "margin:0", text: "Cadastre primeiro o elenco de Mococa: assim a equipe já entra no torneio com nomes e números." }), h("button", { type: "button", class: "ghost mini", onclick: () => irPara("atletas") }, "Abrir Atletas")));
        root.append(torRoot);
      }
      else root.append(aba === "historia" ? telaHistoria() : aba === "proxima" ? telaProxima() : aba === "atletas" ? telaAtletas() : telaStats());
    }
    const cx = caixaPergunta(); if (cx) root.append(cx);
    if (!edEtapa && !edPartida && !imp) window.scrollTo(0, y);
  }

  /* ---------- História ---------- */
  function telaHistoria() {
    const w = h("div", { class: "col" }), ets = filtradas();
    const temDemo = atletas.some(a => a.demo) || etapas.some(e => e.demo);
    if (!realizadas().length) {
      w.append(h("div", { class: "card col" }, h("h3", { text: "A história começa aqui" }),
        h("p", { class: "cap", text: "Cada etapa da Liga vira um capítulo: quem foi, contra quem jogamos em cada fase, os placares set a set, os destaques e a colocação final. Os números de vitórias, adversários e atletas saem sozinhos daí." }),
        podeEditar() ? guiaInicio() : h("p", { class: "cap", text: "Ainda não há etapas registradas. Para cadastrar atletas, torneios e etapas, toque em \"Entrar como organizador\" ou \"Entrar como editor\" no fim da página." }),
        podeEditar() && h("div", { class: "linha" }, h("button", { type: "button", onclick: () => novaEtapa("realizada") }, "+ Registrar etapa"), h("button", { type: "button", class: "ghost", onclick: abrirImportar }, "Importar de torneio"),
          !temDemo && h("button", { type: "button", class: "ghost", onclick: () => perguntar("Criar dados de demonstração (12 atletas e 9 etapas fictícias de 2025 e 2026)? Dá para apagar tudo depois com um toque.", criarDemo, "Criar demonstração") }, "Ver com dados de demonstração"))));
      if (temDemo && podeEditar()) w.append(botaoApagarDemo());
      return w;
    }
    const S = C.statsEquipe(ets);
    w.append(h("div", { class: "card resumo col" },
      h("h3", { text: temp === "todas" ? "Nossa trajetória na Liga" : "Temporada " + temp }),
      h("div", { class: "tiles" },
        tile("Etapas", S.etapas, ""), tile("Partidas", S.j, S.v + (S.v === 1 ? " vitória · " : " vitórias · ") + S.d + (S.d === 1 ? " derrota" : " derrotas")), tile("Aproveitamento", pct(S.aprov), "das partidas", "y")),
      h("div", { class: "medalhas" }, [0, 1, 2].map(k => h("span", null, C.MEDALHA[k], h("b", { text: S.medalhas[k] }), " " + C.NOME_MEDALHA[k])))));
    if (podeEditar()) w.append(h("div", { class: "linha" }, h("button", { type: "button", onclick: () => novaEtapa("realizada") }, "+ Registrar etapa"), h("button", { type: "button", class: "ghost", onclick: abrirImportar }, "Importar de torneio"), temDemo && botaoApagarDemo()));
    const porAno = {};
    ets.forEach(e => (porAno[C.temporadaDe(e) || "Sem data"] ||= []).push(e));
    Object.keys(porAno).sort((a, b) => String(b).localeCompare(String(a))).forEach(ano => {
      const lista = porAno[ano].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
      const Sa = C.statsEquipe(lista);
      w.append(h("div", { class: "temporada" }, h("b", { text: ano }), h("small", { class: "cap", text: Sa.etapas + (Sa.etapas === 1 ? " etapa · " : " etapas · ") + Sa.v + "V " + Sa.d + "D · " + pct(Sa.aprov) }), h("span")));
      lista.forEach(e => w.append(cartaoEtapa(e)));
    });
    return w;
  }
  const irPara = k => { aba = k; ls.set("aba", k); atlSel = null; render(); window.scrollTo(0, 0); };
  function guiaInicio() {
    const passo = (n, tit, txt, bt, k) => h("div", { class: "passo" }, h("span", { class: "n", text: n }), h("div", null, h("b", { text: tit }), h("p", { class: "cap", text: txt }), bt ? h("button", { type: "button", class: "ghost mini", onclick: () => irPara(k) }, bt) : null));
    return h("div", { class: "passos" },
      passo(1, "Elenco de Mococa", atletas.length ? atletas.length + " atletas cadastrados." : "Cadastre os atletas com nome e número.", "Abrir Atletas", "atletas"),
      passo(2, "Torneio com os adversários", "Na aba Torneios: crie o torneio, cadastre as equipes adversárias, faça o sorteio e marque os placares. Mococa já entra com o elenco. Dá para gerar uma demonstração.", "Abrir Torneios", "torneios"),
      passo(3, "História", "Depois de cada etapa, use \"Importar de torneio\" para trazer tudo para cá — ou registre a etapa à mão em \"+ Registrar etapa\"."));
  }
  const tile = (rot, val, sub, cls) => h("div", { class: "tile" + (cls ? " " + cls : "") }, h("span", { text: rot }), h("b", { text: val }), sub ? h("small", { text: sub }) : null);
  function botaoApagarDemo() {
    return h("button", { type: "button", class: "danger", onclick: () => perguntar("Apagar todos os dados de demonstração (atletas e etapas fictícias)? Seus dados reais não são tocados.", apagarDemo, "Apagar demonstração") }, "Apagar demonstração");
  }
  function dataBox(s) {
    if (!s) return h("div", { class: "data" }, h("b", { text: "–" }), h("small", { text: "data" }));
    const [y, m, d] = s.split("-");
    return h("div", { class: "data" }, h("b", { text: d }), h("small", { text: MESES[+m - 1] + " " + y.slice(2) }));
  }
  function badgeColocacao(R) {
    if (!R.texto) return null;
    return h("span", { class: "badge" + (R.medalha ? " m" + R.medalha : "") }, R.medalha ? C.MEDALHA[R.medalha - 1] : null, R.texto);
  }
  function cartaoEtapa(e) {
    const R = C.resumoEtapa(e), ps = C.partidasOrdenadas(e);
    const card = h("article", { class: "card etapa" + (R.medalha ? " m" + R.medalha : "") });
    card.append(h("div", { class: "etapa-top" }, dataBox(e.data), h("div", { class: "col", style: "gap:2px;flex:1" },
      h("h3", { text: e.nome || "Etapa" }), h("p", { class: "cap", text: [e.local, e.hora, e.origem ? (e.origem.col === "mococa_torneios" ? "importada da aba Torneios" : "importada do app da Liga") : ""].filter(Boolean).join(" · ") }))));
    card.append(h("div", { class: "badges" }, badgeColocacao(R), R.j ? h("span", { class: "badge v", text: R.v + (R.v === 1 ? " vitória" : " vitórias") }) : null, R.j ? h("span", { class: "badge d", text: R.d + (R.d === 1 ? " derrota" : " derrotas") }) : null,
      R.serie != null && !(R.texto || "").includes(C.SERIES[R.serie]) ? h("span", { class: "badge serie" + R.serie, text: C.SERIES[R.serie] }) : null, (e.atletas || []).length ? h("span", { class: "badge", text: e.atletas.length + " atletas" }) : null));
    card.append(h("div", { class: "texto" }, C.narrativa(e, nomeAt).map(t => h("p", { text: t }))));
    if (ps.length || podeEditar()) {
      const det = h("details", { class: "partidas" }, h("summary", null, "Partidas da etapa (" + ps.length + ")"));
      let faseAnt = null;
      ps.forEach(p => {
        const f = C.faseGrande(p); if (f !== faseAnt) { det.append(h("div", { class: "fase-tit", text: f + (p.fase === "grupo" && p.grupo ? " · Grupo " + p.grupo : "") })); faseAnt = f; }
        det.append(cartaoJogo(e, p));
      });
      if (podeEditar()) det.append(h("div", { class: "linha", style: "margin-top:10px" }, h("button", { type: "button", onclick: () => novaPartida(e) }, "+ Partida"), h("button", { type: "button", class: "ghost", onclick: () => editarEtapa(e) }, "Editar etapa")));
      card.append(det);
    }
    return card;
  }
  function cartaoJogo(e, p) {
    const r = C.resultado(p), art = Object.entries(p.stats || {}).sort((a, b) => (b[1].p || 0) - (a[1].p || 0))[0];
    const cls = r.fim ? (r.venceu ? " v" : " d") : "";
    const det = [p.fase === "grupo" ? (p.rodada ? p.rodada + "ª rodada" : "") : (C.CHAVES[p.chave] || ""), C.parciais(p), art && art[1].p ? "destaque: " + nomeAt(art[0]) + " " + art[1].p + " pts" : ""].filter(Boolean).join(" · ");
    return h(podeEditar() ? "button" : "div", { type: podeEditar() ? "button" : null, class: "jogo" + cls, onclick: podeEditar() ? () => editarPartida(e, p) : null },
      h("div", { class: "adv" }, h("span", { class: "res", text: r.fim ? (r.venceu ? "Vitória" : "Derrota") + (r.wo ? " (W.O.)" : "") : "Sem resultado" }), h("div", { text: "x " + (p.adversario || "?") }), det ? h("small", { text: det }) : null),
      h("div", { class: "pl" }, h("b", { text: C.placar(p) }), h("small", { text: "Mococa x adv." })));
  }

  /* ---------- Próxima etapa (lista de confirmação) ---------- */
  function telaProxima() {
    const w = h("div", { class: "col" }), prox = etapas.filter(e => e.status === "proxima").sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    if (!prox.length) {
      w.append(h("div", { class: "card col" }, h("h3", { text: "Nenhuma etapa marcada" }), h("p", { class: "cap", text: "Quando a próxima etapa da Liga for marcada, ela aparece aqui para cada atleta confirmar presença, como na lista dos treinos." }),
        podeEditar() && h("button", { type: "button", onclick: () => novaEtapa("proxima") }, "+ Marcar próxima etapa")));
      return w;
    }
    prox.forEach(e => {
      const lista = confs[e.id] || [], confirmados = new Set(lista.map(c => c.aid).filter(Boolean)), meu = ctx.meuUid();
      const card = h("section", { class: "card col" });
      card.append(h("div", { class: "etapa-top" }, dataBox(e.data), h("div", { class: "col", style: "gap:2px;flex:1" },
        h("h3", { text: e.nome || "Próxima etapa" }), h("p", { class: "cap", text: [e.local, e.hora ? "às " + e.hora : ""].filter(Boolean).join(" · ") || "Local e horário a definir" }))));
      card.append(h("h3", { text: "Confirmados (" + lista.length + ")" }));
      card.append(lista.length ? h("ol", { class: "lista-conf" }, lista.map((c, i) => {
        const dt = new Date(msDe(c.em)), quando = String(dt.getDate()).padStart(2, "0") + "/" + String(dt.getMonth() + 1).padStart(2, "0") + " " + String(dt.getHours()).padStart(2, "0") + ":" + String(dt.getMinutes()).padStart(2, "0");
        return h("li", null, h("span", { class: "n", text: i + 1 }), h("div", null, h("b", { text: c.nome }), h("small", { text: "confirmou " + quando + (c.aid ? "" : " · não cadastrado") })),
          (podeEditar() || (meu && c.uid === meu)) ? h("button", { type: "button", class: "ghost mini", "aria-label": "Tirar " + c.nome, onclick: () => deleteDoc(doc(db, COL_ET, e.id, COL_CONF, c.id)).then(() => toast(c.nome + " saiu da lista.")).catch(() => toast("Não deu para tirar da lista.")) }, "×") : null);
      })) : h("p", { class: "vazio", text: "Ninguém confirmou ainda." }));
      const faltam = ativos().filter(a => !confirmados.has(a.id));
      card.append(h("h3", { text: "Vou nessa etapa" }), h("p", { class: "cap", text: "Toque no seu nome para confirmar. A ordem da lista é a ordem de confirmação." }));
      card.append(faltam.length ? h("div", { class: "sou" }, faltam.map(a => h("button", { type: "button", disabled: ocupado, onclick: () => confirmar(e, a.nome, a.id) }, (a.num != null ? "#" + a.num + " " : "") + a.nome))) : h("p", { class: "vazio", text: "Todos os atletas cadastrados já confirmaram." }));
      const f = h("form", { class: "linha", onsubmit: ev => { ev.preventDefault(); const nm = f.querySelector("input").value.trim(); if (nm.length < 2) { toast("Escreva o nome."); return; } confirmar(e, nm, null).then(() => { f.querySelector("input").value = ""; }); } },
        h("input", { placeholder: "Outro nome", maxlength: 40, "aria-label": "Nome de quem vai" }), h("button", { type: "submit", class: "ghost" }, "Confirmar"));
      card.append(f);
      const txt = "*Biribol Mococa – " + (e.nome || "Próxima etapa") + "*\n" + [C.fmtData(e.data), e.local, e.hora].filter(Boolean).join(" · ") + "\n\nConfirmados:\n" + (lista.length ? lista.map((c, i) => (i + 1) + ". " + c.nome).join("\n") : "(ninguém ainda)") + "\n\nConfirme no app: " + location.origin + location.pathname;
      card.append(h("a", { class: "btn wa", href: "https://wa.me/?text=" + encodeURIComponent(txt), target: "_blank", rel: "noopener" }, "Enviar lista no WhatsApp"));
      if (podeEditar()) card.append(h("div", { class: "linha" },
        h("button", { type: "button", onclick: () => perguntar("Marcar \"" + (e.nome || "a etapa") + "\" como realizada? Os atletas confirmados entram como participantes (dá para ajustar depois).", () => realizar(e, lista), "Marcar como realizada") }, "Etapa realizada"),
        h("button", { type: "button", class: "ghost", onclick: () => editarEtapa(e) }, "Editar")));
      w.append(card);
    });
    if (podeEditar()) w.append(h("button", { type: "button", class: "ghost", onclick: () => novaEtapa("proxima") }, "+ Marcar outra etapa"));
    return w;
  }
  async function confirmar(e, nome, aid) {
    if (ocupado) return; ocupado = true;
    try { await setDoc(doc(db, COL_ET, e.id, COL_CONF, C.uid("c")), { nome: nome.slice(0, 40), aid: aid || null, uid: ctx.meuUid(), em: serverTimestamp() }); toast(nome + " confirmado. Bom jogo!"); }
    catch (err) { console.error(err); toast("Não deu para confirmar. Confira a conexão."); }
    ocupado = false; render();
  }
  async function realizar(e, lista) {
    const ids = [...new Set(lista.map(c => c.aid).filter(Boolean))];
    await updateDoc(etapaRef(e.id), { status: "realizada", atletas: ids.length ? ids : (e.atletas || []) });
    toast("Etapa registrada. Agora é só lançar as partidas."); aba = "historia"; ls.set("aba", aba); render();
  }

  /* ---------- Atletas ---------- */
  function telaAtletas() {
    const w = h("div", { class: "col" }), ets = filtradas(), nEt = ets.length;
    const st = C.statsAtletas(atletas, ets).filter(a => a.ativo !== false || a.etapas > 0);
    if (atlSel) { const a = st.find(x => x.id === atlSel); if (a) w.append(detalheAtleta(a, nEt)); }
    if (!atletas.length) {
      w.append(h("div", { class: "card" }, h("h3", { text: "Elenco" }), h("p", { class: "cap", text: podeEditar() ? "Cadastre os atletas de Mococa abaixo (nome e número)." : "Os atletas ainda não foram cadastrados. Para cadastrar, toque em \"Entrar como organizador\" ou \"Entrar como editor\" no fim da página." })));
    } else {
      const rk = C.comPosicao([...st].sort((a, b) => b.etapas - a.etapas || b.p - a.p || a.nome.localeCompare(b.nome, "pt-BR")), "etapas");
      w.append(h("div", { class: "card col" }, h("h3", { text: "Ranking de participação" }), h("p", { class: "cap", text: "Quantas etapas cada atleta jogou" + (temp === "todas" ? "" : " em " + temp) + ", de " + nEt + (nEt === 1 ? " etapa" : " etapas") + ". Toque no nome para ver tudo do atleta." }),
        h("div", { class: "tablebox" }, h("table", { class: "tab" },
          h("thead", null, h("tr", null, ["#", "Atleta", "Etapas", "%", "Jogos", "Pts", "Méd."].map((t, i) => h("th", { class: i === 1 ? "l" : null, text: t })))),
          h("tbody", null, rk.map(a => h("tr", { class: "click" + (a.pos <= 3 && a.etapas ? " podio p" + a.pos : ""), tabindex: 0, onclick: () => { atlSel = a.id; render(); window.scrollTo(0, 0); }, onkeydown: ev => { if (ev.key === "Enter") { atlSel = a.id; render(); } } },
            h("td", { text: a.pos <= 3 && a.etapas ? C.MEDALHA[a.pos - 1] : a.pos + "º" }), h("td", { class: "l", text: (a.num != null ? "#" + a.num + " " : "") + a.nome }), h("td", { text: a.etapas }), h("td", { text: nEt ? pct(a.etapas / nEt) : "–" }),
            h("td", { text: a.j }), h("td", { text: a.p }), h("td", { text: a.j ? C.f1(a.med) : "–" }))))))));
      const jog = st.filter(a => a.j > 0);
      if (jog.length) {
        w.append(cardBarras("Maiores pontuadores", "Pontos de Mococa marcados por cada atleta", [...jog].sort((a, b) => b.p - a.p).slice(0, 10).map(a => ({ nome: a.nome, v: a.p, extra: a.etapas + " etapas" }))));
        w.append(cardBarras("Média de pontos por partida", "Pontos ÷ partidas jogadas nas etapas em que esteve", [...jog].sort((a, b) => b.med - a.med).slice(0, 10).map(a => ({ nome: a.nome, v: a.med, txt: C.f1(a.med), extra: a.j + " partidas" }))));
        w.append(cardBarras("Bloqueios", "Total de bloqueios", [...jog].sort((a, b) => b.b - a.b).slice(0, 10).filter(a => a.b).map(a => ({ nome: a.nome, v: a.b, extra: C.f1(a.b / a.j) + " por partida" }))));
        w.append(cardBarras("Assistências", "Total de assistências", [...jog].sort((a, b) => b.as - a.as).slice(0, 10).filter(a => a.as).map(a => ({ nome: a.nome, v: a.as, extra: C.f1(a.as / a.j) + " por partida" }))));
        const ap = jog.filter(a => a.j >= 5).sort((a, b) => b.aprov - a.aprov);
        if (ap.length) w.append(cardBarras("Aproveitamento com o atleta", "Vitórias da equipe nas etapas em que o atleta jogou (mínimo de 5 partidas)", ap.map(a => ({ nome: a.nome, v: a.aprov * 100, txt: pct(a.aprov), extra: a.v + "V " + (a.j - a.v) + "D" }))));
      }
    }
    w.append(cardElenco());
    return w;
  }
  function detalheAtleta(a, nEt) {
    return h("div", { class: "card col", style: "border-color:var(--accent-hi)" },
      h("div", { class: "atleta-top" }, h("div", { class: "camisa", text: a.num ?? "–" }), h("div", { style: "flex:1" }, h("h3", { text: a.nome }), h("p", { class: "cap", text: a.etapas + " de " + nEt + " etapas · " + a.j + " partidas" + (a.ativo === false ? " · inativo" : "") })),
        h("button", { type: "button", class: "ghost mini", onclick: () => { atlSel = null; render(); } }, "Fechar")),
      h("div", { class: "tiles" }, tile("Participação", nEt ? pct(a.etapas / nEt) : "–", a.etapas + " etapas", "y"), tile("Pontos", a.p, C.f1(a.med) + " por partida"), tile("Aproveitamento", a.j ? pct(a.aprov) : "–", a.v + "V " + (a.j - a.v) + "D"),
        tile("Bloqueios", a.b, a.j ? C.f1(a.b / a.j) + " por partida" : ""), tile("Assistências", a.as, a.j ? C.f1(a.as / a.j) + " por partida" : ""), tile("Medalhas", a.medalhas.reduce((s, x) => s + x, 0), a.medalhas.map((x, k) => x ? x + C.MEDALHA[k] : "").filter(Boolean).join(" ") || "–")),
      a.maior ? h("p", { class: "cap", text: "Maior pontuação numa partida: " + a.maior + " pontos " + a.maiorTxt + "." }) : null,
      a.etapasLista.length ? h("div", null, h("h3", { text: "Pontos por etapa" }), barras(a.etapasLista.map(x => ({ nome: x.nome, sub: C.fmtData(x.data), v: x.p })), false)) : h("p", { class: "vazio", text: "Ainda não jogou nenhuma etapa." }));
  }
  function cardElenco() {
    const card = h("div", { class: "card col" }, h("h3", { text: "Elenco de Mococa" }));
    if (!podeEditar()) {
      card.append(h("div", { class: "atl-chips" }, ativos().map(a => h("span", { text: (a.num != null ? "#" + a.num + " " : "") + a.nome }))));
      return card;
    }
    card.append(h("p", { class: "cap", text: "Só os atletas de Mococa entram aqui. Adversários são só nomes nas partidas. Atleta que saiu: desmarque \"ativo\" (o histórico continua)." }));
    const usados = new Set(etapas.flatMap(e => e.atletas || []));
    card.append(h("div", { class: "roster" }, [...atletas].sort((a, b) => (b.ativo !== false) - (a.ativo !== false) || a.nome.localeCompare(b.nome, "pt-BR")).map(a => h("div", { class: "r" },
      h("input", { type: "number", min: 0, max: 99, value: a.num ?? "", "aria-label": "Número de " + a.nome, onchange: ev => updateDoc(doc(db, COL_AT, a.id), { num: ev.target.value === "" ? null : +ev.target.value }) }),
      h("input", { value: a.nome, maxlength: 30, "aria-label": "Nome", onchange: ev => { const v = ev.target.value.trim(); if (v.length >= 2) updateDoc(doc(db, COL_AT, a.id), { nome: v }); } }),
      h("div", { class: "linha", style: "flex-wrap:nowrap" },
        h("button", { type: "button", class: "ghost mini", "aria-pressed": String(a.ativo !== false), onclick: () => updateDoc(doc(db, COL_AT, a.id), { ativo: a.ativo === false }) }, a.ativo === false ? "Inativo" : "Ativo"),
        !usados.has(a.id) && h("button", { type: "button", class: "danger mini", "aria-label": "Remover " + a.nome, onclick: () => perguntar("Remover " + a.nome + " do elenco?", () => deleteDoc(doc(db, COL_AT, a.id)), "Remover") }, "×"))))));
    const f = h("form", { class: "linha", onsubmit: async ev => {
      ev.preventDefault(); const nm = f.querySelector(".nn").value.trim(), nu = f.querySelector(".nu").value;
      if (nm.length < 2) { toast("Escreva o nome do atleta."); return; }
      if (atletas.some(a => C.chaveNome(a.nome) === C.chaveNome(nm))) { toast(nm + " já está no elenco."); return; }
      await setDoc(doc(db, COL_AT, C.uid("a")), { nome: nm, num: nu === "" ? null : +nu, ativo: true, criado: Date.now() });
      f.reset(); f.querySelector(".nn").focus(); toast(nm + " entrou no elenco.");
    } }, h("input", { class: "nu", type: "number", min: 0, max: 99, placeholder: "Nº", "aria-label": "Número", style: "flex:0 0 72px" }), h("input", { class: "nn", placeholder: "Nome do atleta", maxlength: 30, "aria-label": "Nome do novo atleta" }), h("button", { type: "submit" }, "+ Atleta"));
    card.append(f);
    return card;
  }

  /* ---------- gráficos simples ---------- */
  function barras(itens, ranking = true, tipo = "") {
    if (!itens.length) return h("p", { class: "vazio", text: "Sem dados ainda." });
    const max = Math.max(...itens.map(i => Math.abs(i.v)), 1);
    return h("div", { class: "hbars" }, itens.map((it, i) => h("div", { class: "hb" + (ranking && i === 0 ? " p1" : "") + (tipo ? " " + tipo : "") },
      h("span", { class: "pos", text: ranking ? i + 1 : "" }), h("span", { class: "nm" }, it.nome, it.sub ? h("small", { text: " · " + it.sub }) : null),
      h("span", { class: "trk" }, h("i", { style: "width:" + Math.max(2, Math.abs(it.v) / max * 100) + "%" })),
      h("span", { class: "q" }, h("b", { text: it.txt ?? it.v }), it.extra ? h("small", { text: it.extra }) : null))));
  }
  const cardBarras = (tit, sub, itens, tipo, ranking = true) => h("div", { class: "card" }, h("h3", { text: tit }), sub ? h("p", { class: "cap", text: sub }) : null, barras(itens, ranking, tipo));

  function graficoLinha(pts) {
    const W = 360, H = 190, L = 34, Rr = 10, T = 10, B = 28, n = pts.length;
    const x = i => L + (n === 1 ? (W - L - Rr) / 2 : i * (W - L - Rr) / (n - 1)), y = v => T + (1 - v) * (H - T - B);
    const ns = "http://www.w3.org/2000/svg", el = (t, a) => { const e = document.createElementNS(ns, t); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
    const svg = el("svg", { viewBox: "0 0 " + W + " " + H, class: "grafico", role: "img", "aria-label": "Aproveitamento por etapa e acumulado" });
    [0, 0.5, 1].forEach(v => { svg.append(el("line", { x1: L, x2: W - Rr, y1: y(v), y2: y(v), stroke: "#1b3158", "stroke-width": 1 })); const t = el("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end" }); t.textContent = Math.round(v * 100) + "%"; svg.append(t); });
    const passo = Math.ceil(n / 6);
    pts.forEach((p, i) => { if (i % passo && i !== n - 1) return; const t = el("text", { x: x(i), y: H - 10, "text-anchor": n > 1 && i === n - 1 ? "end" : i === 0 && n > 1 ? "start" : "middle" }); t.textContent = p.rot; svg.append(t); });
    svg.append(el("polyline", { points: pts.map((p, i) => x(i) + "," + y(p.acum)).join(" "), fill: "none", stroke: "#2b86c4", "stroke-width": 2.5, "stroke-linejoin": "round" }));
    pts.forEach((p, i) => { const c = el("circle", { cx: x(i), cy: y(p.etapa), r: 5, fill: "#e3b90f", stroke: "#0a1731", "stroke-width": 2 }); const tt = el("title", {}); tt.textContent = p.nome + ": " + Math.round(p.etapa * 100) + "% na etapa · " + Math.round(p.acum * 100) + "% acumulado"; c.append(tt); svg.append(c); });
    return svg;
  }

  /* ---------- Estatísticas ---------- */
  function telaStats() {
    const w = h("div", { class: "col" }), ets = filtradas();
    if (!ets.some(e => (e.partidas || []).length)) { w.append(h("div", { class: "card" }, h("p", { class: "vazio", text: "As estatísticas aparecem quando houver partidas registradas." }))); return w; }
    const S = C.statsEquipe(ets), med = (a, b) => b ? C.f1(a / b) : "–";
    w.append(h("h2", { class: "h2", text: "Desempenho da equipe" }));
    w.append(h("div", { class: "tiles" },
      tile("Etapas", S.etapas, ""), tile("Partidas", S.j, S.wo ? S.wo + " por W.O." : ""), tile("Aproveitamento", pct(S.aprov), "vitórias ÷ partidas", "y"),
      tile("Vitórias", S.v, pct(S.aprov) + " das partidas", "v"), tile("Derrotas", S.d, pct(1 - S.aprov) + " das partidas", "d"), tile("Medalhas", S.medalhas.reduce((s, x) => s + x, 0), S.medalhas.map((x, k) => x + C.MEDALHA[k]).join(" ")),
      tile("Sets", S.setsV + "–" + S.setsP, (S.setsV + S.setsP ? pct(S.setsV / (S.setsV + S.setsP)) : "–") + " dos sets vencidos"), tile("Pontos por partida", med(S.pf, S.jPts), "sofridos: " + med(S.pc, S.jPts)),
      tile("Saldo de pontos", (S.pf - S.pc > 0 ? "+" : "") + (S.pf - S.pc), S.pf + " feitos · " + S.pc + " sofridos"),
      tile("Tiebreaks", S.tb, S.tb ? S.tbV + " vencidos (" + pct(S.tbV / S.tb) + ")" : "nenhum"), tile("Vitórias por 2x0", S.v20, S.v ? pct(S.v20 / S.v) + " das vitórias" : ""), tile("Derrotas por 0x2", S.d02, S.d ? pct(S.d02 / S.d) + " das derrotas" : "")));

    // frequência de vitórias e derrotas
    const seq = S.seqAtual ? S.seqAtual.n + (S.seqAtual.v ? (S.seqAtual.n === 1 ? " vitória" : " vitórias") : (S.seqAtual.n === 1 ? " derrota" : " derrotas")) : "–";
    w.append(h("div", { class: "card col" }, h("h3", { text: "Frequência de vitórias e derrotas" }),
      h("p", { class: "cap", text: S.j ? "Vencemos " + pct(S.aprov) + " das partidas: uma vitória a cada " + (S.v ? C.f1(S.j / S.v) : "–") + " jogos e uma derrota a cada " + (S.d ? C.f1(S.j / S.d) : "–") + " jogos." : "" }),
      h("div", { class: "tiles" }, tile("Maior sequência de vitórias", S.maiorSeqV, "partidas seguidas", "v"), tile("Maior sequência de derrotas", S.maiorSeqD, "partidas seguidas", "d"), tile("Sequência atual", seq, "")),
      h("div", null, h("p", { class: "cap", text: "Últimas " + S.forma.length + " partidas (mais antiga → mais recente)" }),
        h("div", { class: "forma" }, S.forma.map(f => h("span", { class: f.v ? "v" : "d", title: (f.v ? "Vitória " : "Derrota ") + f.placar + " x " + f.adv + " – " + f.etapa, text: f.v ? "V" : "D" }))))));
    const pe = C.porEtapa(ets);
    const maxJ = Math.max(...pe.map(x => x.j), 1);
    w.append(h("div", { class: "card col" }, h("h3", { text: "Vitórias e derrotas por etapa" }),
      h("div", { class: "legenda" }, h("span", null, h("i", { style: "background:var(--win)" }), "Vitórias"), h("span", null, h("i", { style: "background:var(--loss)" }), "Derrotas")),
      h("div", { class: "vd" }, pe.map(x => h("div", { class: "vd-l", title: x.nome + ": " + x.v + " vitórias, " + x.d + " derrotas" }, h("span", { class: "nm", text: x.nome }),
        h("span", { class: "bar", style: "width:" + (x.j / maxJ * 100) + "%" }, x.v ? h("i", { class: "v", style: "flex:" + x.v }) : null, x.d ? h("i", { class: "d", style: "flex:" + x.d }) : null),
        h("span", { class: "q", text: x.v + "V " + x.d + "D" }))))));
    if (pe.length > 1) w.append(h("div", { class: "card col" }, h("h3", { text: "Aproveitamento ao longo das etapas" }),
      h("div", { class: "legenda" }, h("span", null, h("i", { style: "background:#e3b90f;border-radius:50%" }), "Na etapa"), h("span", null, h("i", { style: "background:#2b86c4;height:3px;vertical-align:3px" }), "Acumulado")),
      graficoLinha(pe.map(x => ({ nome: x.nome, rot: (x.nome || "").replace(/ etapa/i, "").replace(/ (20)?(\d\d)$/, "/$2"), etapa: x.aprovEtapa, acum: x.aprovAcum })))));

    // por fase
    const pf = C.porFase(ets);
    w.append(cardBarras("Aproveitamento por fase", "Vitórias ÷ partidas em cada fase (os jogos de quartas, semi, 3º lugar e final também contam na sua série)",
      pf.map(x => ({ nome: x.fase, v: x.v / x.j * 100, txt: pct(x.v / x.j), extra: x.v + "V " + x.d + "D" })), "", false));

    // adversários
    const adv = C.statsAdversarios(ets);
    w.append(h("h2", { class: "h2", text: "Adversários" }));
    const freg = [...adv].filter(a => a.v).sort((a, b) => b.v - a.v || b.aprov - a.aprov)[0], carr = [...adv].filter(a => a.d).sort((a, b) => b.d - a.d || a.aprov - b.aprov)[0];
    w.append(h("div", { class: "tiles" }, tile("Adversários diferentes", adv.length, ""), tile("Quem mais vencemos", freg ? freg.v + "x" : "–", freg ? freg.nome : "", "v"), tile("Para quem mais perdemos", carr ? carr.d + "x" : "–", carr ? carr.nome : "", "d")));
    w.append(cardBarras("De quem mais vencemos", "Número de vitórias de Mococa contra cada equipe", [...adv].filter(a => a.v).sort((a, b) => b.v - a.v || b.aprov - a.aprov).slice(0, 8).map(a => ({ nome: a.nome, v: a.v, extra: a.v + "V " + a.d + "D · " + pct(a.aprov) })), "win"));
    w.append(cardBarras("Para quem mais perdemos", "Número de derrotas de Mococa para cada equipe", [...adv].filter(a => a.d).sort((a, b) => b.d - a.d || a.aprov - b.aprov).slice(0, 8).map(a => ({ nome: a.nome, v: a.d, extra: a.v + "V " + a.d + "D · " + pct(a.aprov) })), "loss"));
    const tab = h("div", { class: "card col" }, h("h3", { text: "Confronto direto" }), h("p", { class: "cap", text: "Toque numa equipe para ver todos os jogos contra ela." }),
      h("div", { class: "tablebox" }, h("table", { class: "tab" },
        h("thead", null, h("tr", null, ["Adversário", "J", "V", "D", "%", "Sets", "Saldo"].map((t, i) => h("th", { class: i === 0 ? "l" : null, text: t })))),
        h("tbody", null, adv.map(a => h("tr", { class: "click", tabindex: 0, onclick: () => { advSel = advSel === a.nome ? null : a.nome; render(); } },
          h("td", { class: "l", text: (advSel === a.nome ? "▾ " : "") + a.nome }), h("td", { text: a.j }), h("td", { class: "v", text: a.v }), h("td", { class: "d", text: a.d }), h("td", { text: pct(a.aprov) }),
          h("td", { text: a.setsV + "–" + a.setsP }), h("td", { text: (a.saldo > 0 ? "+" : "") + a.saldo })))))));
    const sel = adv.find(a => a.nome === advSel);
    if (sel) tab.append(h("div", null, h("h3", { text: "Mococa x " + sel.nome }), sel.jogos.map(j => h("div", { class: "jogo " + (j.v ? "v" : "d") },
      h("div", { class: "adv" }, h("span", { class: "res", text: j.v ? "Vitória" : "Derrota" }), h("div", { text: j.etapa + " · " + C.fmtData(j.data) }), h("small", { text: j.fase + (j.parciais ? " · " + j.parciais : "") })),
      h("div", { class: "pl" }, h("b", { text: j.placar }))))));
    w.append(tab);

    // médias
    w.append(h("h2", { class: "h2", text: "Médias" }));
    w.append(h("div", { class: "tiles" },
      tile("Pontos por set", med(S.pf, S.sets), "sofridos: " + med(S.pc, S.sets)), tile("Margem nas vitórias", S.nV ? "+" + C.f1(S.margV / S.nV) : "–", "pontos por partida", "v"), tile("Margem nas derrotas", S.nD ? "−" + C.f1(S.margD / S.nD) : "–", "pontos por partida", "d"),
      tile("Partidas por etapa", med(S.j, S.etapas), ""), tile("Vitórias por etapa", med(S.v, S.etapas), "derrotas: " + med(S.d, S.etapas)), tile("Jogos no tiebreak", S.jPts ? pct(S.tb / S.jPts) : "–", "das partidas")));

    // colocações
    w.append(h("h2", { class: "h2", text: "Colocações" }));
    w.append(h("div", { class: "card col" }, h("div", { class: "tablebox" }, h("table", { class: "tab" },
      h("thead", null, h("tr", null, ["Etapa", "Série", "Resultado", "V", "D"].map((t, i) => h("th", { class: i === 0 || i === 2 ? "l" : null, text: t })))),
      h("tbody", null, [...pe].reverse().map(x => h("tr", null, h("td", { class: "l" }, x.nome, h("br"), h("small", { class: "cap", text: C.fmtData(x.data) })), h("td", { class: x.serie != null ? "serie" + x.serie : null, text: x.serie != null ? C.SERIES[x.serie].replace("Série ", "") : "–" }),
        h("td", { class: "l", text: (x.medalha ? C.MEDALHA[x.medalha - 1] + " " : "") + (x.texto || "–") }), h("td", { class: "v", text: x.v }), h("td", { class: "d", text: x.d })))))),
      h("div", { class: "tablebox" }, h("table", { class: "tab" }, h("thead", null, h("tr", null, h("th", { class: "l", text: "Medalhas por série" }), C.MEDALHA.map(m => h("th", { text: m })), h("th", { text: "Etapas" }))),
        h("tbody", null, C.SERIES.map((s, si) => h("tr", null, h("td", { class: "l serie" + si, text: s }), S.porSerie[si].map(x => h("td", { text: x })), h("td", { text: pe.filter(x => x.serie === si).length }))))))));

    // participação
    w.append(cardBarras("Atletas por etapa", "Quantos atletas de Mococa jogaram cada etapa", pe.map(x => ({ nome: x.nome, sub: C.fmtData(x.data), v: x.nAtletas })), "", false));
    return w;
  }

  /* ---------- edição de etapa ---------- */
  function novaEtapa(status) {
    const ano = new Date().getFullYear(), n = etapas.filter(e => C.temporadaDe(e) === ano).length + 1;
    edEtapa = { id: null, nome: n + "ª etapa " + ano, local: "", data: "", hora: "09:00", status, atletas: [], posGrupo: null, serie: null, posicao: null, obs: "", partidas: [] };
    render(); window.scrollTo(0, 0);
  }
  function editarEtapa(e) { edEtapa = JSON.parse(JSON.stringify(e)); render(); window.scrollTo(0, 0); }
  function telaEtapa() {
    const d = edEtapa, w = h("form", { class: "card form", onsubmit: ev => { ev.preventDefault(); salvarEtapa(); } });
    const inp = (rot, campo, extra = {}) => h("label", { class: "lbl" }, rot, h("input", { value: d[campo] ?? "", oninput: ev => { d[campo] = ev.target.value; }, ...extra }));
    const sel = (rot, campo, ops, num = true) => h("label", { class: "lbl" }, rot, h("select", { onchange: ev => { d[campo] = ev.target.value === "" ? null : num ? +ev.target.value : ev.target.value; render(); } },
      ops.map(([v, t]) => h("option", { value: v ?? "", selected: String(d[campo] ?? "") === String(v ?? "") }, t))));
    w.append(h("h3", { text: d.id ? "Editar etapa" : d.status === "proxima" ? "Marcar próxima etapa" : "Registrar etapa" }));
    w.append(inp("Nome da etapa", "nome", { maxlength: 40, required: true }));
    w.append(h("div", { class: "linha" }, inp("Data", "data", { type: "date" }), inp("Horário", "hora", { type: "time" })));
    w.append(inp("Local (cidade / ginásio)", "local", { maxlength: 50, placeholder: "Ex.: Casa Branca – Clube de Campo" }));
    w.append(h("div", { class: "lbl" }, "Situação", h("div", { class: "toggle" }, [["proxima", "Próxima (lista de confirmação aberta)"], ["realizada", "Realizada"]].map(([k, t]) =>
      h("button", { type: "button", "aria-pressed": String(d.status === k), onclick: () => { d.status = k; render(); } }, t)))));
    if (d.status !== "proxima") {
      const lista = [...ativos(), ...atletas.filter(a => a.ativo === false && d.atletas.includes(a.id))];
      w.append(h("div", { class: "lbl" }, "Atletas que jogaram a etapa (" + d.atletas.length + ")",
        lista.length ? h("div", { class: "toggle" }, lista.map(a => h("button", { type: "button", "aria-pressed": String(d.atletas.includes(a.id)), onclick: () => { d.atletas = d.atletas.includes(a.id) ? d.atletas.filter(x => x !== a.id) : [...d.atletas, a.id]; render(); } }, (a.num != null ? "#" + a.num + " " : "") + a.nome)))
          : h("p", { class: "cap", text: "Cadastre os atletas na aba Atletas." })));
      w.append(h("div", { class: "linha" },
        sel("Colocação no grupo", "posGrupo", [[null, "—"], [1, "1º"], [2, "2º"], [3, "3º"], [4, "4º"], [5, "5º"]]),
        sel("Série disputada", "serie", [[null, "Pelas partidas (automático)"], [0, "Série Ouro"], [1, "Série Prata"], [2, "Série Bronze"]])));
      w.append(sel("Colocação final", "posicao", [[null, "Pelas partidas (automático)"], ...Array.from({ length: 12 }, (_, i) => [i + 1, (i + 1) + "º lugar"])]));
      w.append(h("p", { class: "cap", text: "A colocação sai sozinha da final ou da disputa de 3º lugar. Use o campo acima só quando a série for de pontos corridos ou faltar algum jogo." }));
    }
    w.append(h("label", { class: "lbl" }, "Observações para a história (opcional)", h("textarea", { maxlength: 600, value: d.obs || "", placeholder: "Ex.: primeira etapa com o time completo; virada histórica no tiebreak…", oninput: ev => { d.obs = ev.target.value; } })));
    w.append(h("div", { class: "linha" }, h("button", { type: "submit" }, "Salvar"), h("button", { type: "button", class: "ghost", onclick: () => { edEtapa = null; render(); } }, "Cancelar")));
    if (d.id) w.append(h("button", { type: "button", class: "danger", onclick: () => perguntar("Apagar a etapa \"" + d.nome + "\" com todas as partidas? Isso não pode ser desfeito.", async () => { await deleteDoc(etapaRef(d.id)); edEtapa = null; toast("Etapa apagada."); render(); }, "Apagar etapa") }, "Apagar etapa"));
    return w;
  }
  async function salvarEtapa() {
    const d = edEtapa; if (!d.nome || d.nome.trim().length < 2) { toast("Dê um nome para a etapa."); return; }
    const id = d.id || C.uid("e");
    const obj = limpar({ nome: d.nome.trim(), temporada: d.data ? +d.data.slice(0, 4) : (d.temporada || new Date().getFullYear()), local: (d.local || "").trim(), data: d.data || "", hora: d.hora || "", status: d.status,
      atletas: d.atletas || [], posGrupo: d.posGrupo ?? null, serie: d.serie ?? null, posicao: d.posicao ?? null, obs: (d.obs || "").trim(), partidas: d.partidas || [], criado: d.criado || Date.now(), ...(d.demo ? { demo: true } : {}) });
    try { await setDoc(etapaRef(id), obj); edEtapa = null; toast("Etapa salva."); aba = obj.status === "proxima" ? "proxima" : "historia"; ls.set("aba", aba); render(); }
    catch (e) { console.error(e); toast("Não deu para salvar. Entre como organizador ou editor."); }
  }

  /* ---------- edição de partida ---------- */
  function novaPartida(e) {
    const ps = C.partidasOrdenadas(e), ult = ps[ps.length - 1];
    let base = { fase: "grupo", grupo: "", rodada: 1, serie: e.serie ?? 0, chave: "quartas" };
    if (ult) {
      if (ult.fase === "grupo") base = { ...base, grupo: ult.grupo || "", rodada: (ult.rodada || 0) + 1 };
      else { const prox = { oitavas: "quartas", quartas: "semi", semi: C.resultado(ult).venceu === false ? "terceiro" : "final", rr: "rr" }[ult.chave] || "final"; base = { ...base, fase: ult.fase, serie: ult.serie ?? 0, chave: prox }; }
    }
    edPartida = { eid: e.id, d: { id: null, ...base, adversario: "", wo: null, sets: [{ m: "", a: "" }, { m: "", a: "" }, { m: "", a: "" }], stats: {}, obs: "" } };
    render(); window.scrollTo(0, 0);
  }
  function editarPartida(e, p) {
    const d = JSON.parse(JSON.stringify(p)); while ((d.sets || (d.sets = [])).length < 3) d.sets.push({ m: "", a: "" });
    edPartida = { eid: e.id, d: { grupo: "", rodada: 1, serie: 0, chave: "quartas", wo: null, stats: {}, obs: "", ...d } }; render(); window.scrollTo(0, 0);
  }
  function telaPartida() {
    const e = etapas.find(x => x.id === edPartida.eid); if (!e) { edPartida = null; return h("div"); }
    const d = edPartida.d, w = h("form", { class: "card form", onsubmit: ev => { ev.preventDefault(); salvarPartida(e); } });
    w.append(h("h3", { text: (d.id ? "Editar partida" : "Nova partida") + " · " + (e.nome || "") }));
    w.append(h("div", { class: "lbl" }, "Fase", h("div", { class: "toggle" }, [["grupo", "Fase de grupos"], ["serie", "Série (Ouro/Prata/Bronze)"], ["mata", "Mata-mata"]].map(([k, t]) =>
      h("button", { type: "button", "aria-pressed": String(d.fase === k), onclick: () => { d.fase = k; render(); } }, t)))));
    if (d.fase === "grupo") w.append(h("div", { class: "linha" },
      h("label", { class: "lbl" }, "Grupo", h("input", { value: d.grupo || "", maxlength: 2, placeholder: "Ex.: C", oninput: ev => { d.grupo = ev.target.value.toUpperCase(); } })),
      h("label", { class: "lbl" }, "Rodada", h("select", { onchange: ev => { d.rodada = +ev.target.value; } }, [1, 2, 3, 4, 5].map(r => h("option", { value: r, selected: d.rodada === r }, r + "ª rodada"))))));
    else {
      if (d.fase === "serie") w.append(h("div", { class: "lbl" }, "Série", h("div", { class: "toggle" }, C.SERIES.map((s, si) => h("button", { type: "button", "aria-pressed": String(+d.serie === si), onclick: () => { d.serie = si; render(); } }, s)))));
      w.append(h("label", { class: "lbl" }, "Jogo", h("select", { onchange: ev => { d.chave = ev.target.value; } }, Object.entries(C.CHAVES).filter(([k]) => d.fase === "serie" || k !== "rr").map(([k, t]) => h("option", { value: k, selected: d.chave === k }, t)))));
    }
    const advs = [...new Set(etapas.flatMap(x => (x.partidas || []).map(p => (p.adversario || "").trim())).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    w.append(h("label", { class: "lbl" }, "Adversário", h("input", { value: d.adversario || "", list: "lista-adv", maxlength: 40, required: true, placeholder: "Nome da equipe adversária", oninput: ev => { d.adversario = ev.target.value; } }),
      h("datalist", { id: "lista-adv" }, advs.map(a => h("option", { value: a })))));
    w.append(h("div", { class: "lbl" }, "W.O.", h("div", { class: "toggle" }, [[null, "Jogo normal"], ["m", "Vitória de Mococa por W.O."], ["a", "Derrota por W.O."]].map(([k, t]) =>
      h("button", { type: "button", "aria-pressed": String(d.wo === k), onclick: () => { d.wo = k; render(); } }, t)))));
    const prev = h("p", { class: "res-prev" });
    const atualizarPrev = () => { const r = C.resultado(normalizar(d)); prev.className = "res-prev" + (r.fim ? (r.venceu ? " v" : " d") : ""); prev.textContent = r.fim ? (r.venceu ? "Vitória de Mococa " : "Derrota de Mococa ") + (r.wo ? "por W.O." : r.sm + " x " + r.sa) : "Placar incompleto (melhor de 3 sets: 21, 21 e tiebreak de 15, com 2 de vantagem)"; };
    if (!d.wo) {
      w.append(h("div", { class: "sets" }, h("span"), h("span", { class: "h", text: "Mococa" }), h("span", { class: "h", text: "Adversário" }),
        d.sets.map((s, i) => [h("span", { text: i < 2 ? (i + 1) + "º set" : "Tiebreak" }),
          ["m", "a"].map(k => h("input", { type: "number", inputmode: "numeric", min: 0, max: 60, value: s[k] ?? "", "aria-label": (i < 2 ? (i + 1) + "º set " : "Tiebreak ") + (k === "m" ? "Mococa" : "adversário"), oninput: ev => { s[k] = ev.target.value === "" ? "" : +ev.target.value; atualizarPrev(); } }))])));
    }
    w.append(prev); atualizarPrev();
    const part = (e.atletas || []).length ? e.atletas.map(id => atletas.find(a => a.id === id)).filter(Boolean) : ativos();
    if (!d.wo && part.length) {
      w.append(h("div", { class: "lbl" }, "Números dos atletas de Mococa (opcional)"));
      w.append(h("div", { class: "st" }, h("span", { class: "h", text: "Atleta" }), h("span", { class: "h", text: "Pontos" }), h("span", { class: "h", text: "Bloq." }), h("span", { class: "h", text: "Assist." }),
        part.map(a => { const s = d.stats[a.id] || (d.stats[a.id] = { p: 0, b: 0, as: 0 }); return [h("span", { text: (a.num != null ? "#" + a.num + " " : "") + a.nome }),
          ["p", "b", "as"].map(k => h("input", { type: "number", inputmode: "numeric", min: 0, max: 99, value: s[k] || "", "aria-label": a.nome + " " + ({ p: "pontos", b: "bloqueios", as: "assistências" })[k], oninput: ev => { s[k] = ev.target.value === "" ? 0 : +ev.target.value; } }))]; })));
      if (!(e.atletas || []).length) w.append(h("p", { class: "cap", text: "Dica: marque em \"Editar etapa\" quem jogou, para a lista ficar só com eles." }));
    }
    w.append(h("label", { class: "lbl" }, "Observação (opcional)", h("input", { value: d.obs || "", maxlength: 200, placeholder: "Ex.: virada no tiebreak", oninput: ev => { d.obs = ev.target.value; } })));
    w.append(h("div", { class: "linha" }, h("button", { type: "submit" }, "Salvar partida"), h("button", { type: "button", class: "ghost", onclick: () => { edPartida = null; render(); } }, "Cancelar")));
    if (d.id) w.append(h("button", { type: "button", class: "danger", onclick: () => perguntar("Apagar esta partida?", async () => { await updateDoc(etapaRef(e.id), { partidas: (e.partidas || []).filter(p => p.id !== d.id) }); edPartida = null; toast("Partida apagada."); render(); }, "Apagar partida") }, "Apagar partida"));
    return w;
  }
  function normalizar(d) {
    const p = { id: d.id || C.uid("p"), fase: d.fase, adversario: (d.adversario || "").trim(), wo: d.wo || null, obs: (d.obs || "").trim(), ordem: d.ordem ?? 0 };
    if (d.fase === "grupo") { p.grupo = (d.grupo || "").trim(); p.rodada = d.rodada || 1; }
    else { p.chave = d.chave || "final"; if (d.fase === "serie") p.serie = +d.serie || 0; }
    p.sets = d.wo ? [] : (d.sets || []).filter(s => s.m !== "" && s.a !== "" && s.m != null && s.a != null && (+s.m + +s.a) > 0).map(s => ({ m: +s.m, a: +s.a }));
    p.stats = {}; if (!d.wo) Object.entries(d.stats || {}).forEach(([aid, s]) => { if ((s.p || 0) + (s.b || 0) + (s.as || 0) > 0) p.stats[aid] = { p: s.p || 0, b: s.b || 0, as: s.as || 0 }; });
    return p;
  }
  async function salvarPartida(e) {
    const p = normalizar(edPartida.d);
    if (!p.adversario) { toast("Escreva o nome do adversário."); return; }
    const lista = [...(e.partidas || [])], i = lista.findIndex(x => x.id === p.id);
    if (i >= 0) { p.ordem = lista[i].ordem ?? i; lista[i] = p; } else { p.ordem = lista.length; lista.push(p); }
    try { await updateDoc(etapaRef(e.id), { partidas: limpar(lista) }); edPartida = null; toast("Partida salva."); render(); }
    catch (err) { console.error(err); toast("Não deu para salvar a partida."); }
  }

  /* ---------- importar do app da Liga ---------- */
  const FONTES = [["mococa_torneios", "Torneios deste app"], ["lmb_torneios", "App da Liga"]];
  function abrirImportar() {
    imp = { col: null, auto: true }; trocarFonte("mococa_torneios");
    render(); window.scrollTo(0, 0);
  }
  function trocarFonte(col) {
    if (imp.unsubT) imp.unsubT(); if (imp.unsubJ) imp.unsubJ();
    Object.assign(imp, { col, indisponivel: false, torneios: null, tid: null, T: null, jogos: null, ei: 0, eid: null, mapa: {}, unsubT: null, unsubJ: null, salvando: false });
    imp.unsubT = onSnapshot(collection(db, col), s => {
      if (!imp || imp.col !== col) return;
      if (!s.docs.length && imp.auto && col === "mococa_torneios") { imp.auto = false; trocarFonte("lmb_torneios"); return; }
      imp.torneios = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.criado || 0) - (a.criado || 0));
      if (!imp.tid && imp.torneios.length) escolherTorneio((imp.torneios.find(t => !t.demo && I.acharMococa(t)) || imp.torneios.find(t => I.acharMococa(t)) || imp.torneios[0]).id);
      else render();
    }, e => {
      // fonte indisponível (ex.: app da Liga fora de uso): segue sem ela, sem travar
      console.error(e); if (!imp || imp.col !== col) return;
      if (imp.auto && col === "mococa_torneios") { imp.auto = false; trocarFonte("lmb_torneios"); return; }
      imp.torneios = []; imp.indisponivel = true; render();
    });
    render();
  }
  function fecharImportar() { if (imp) { if (imp.unsubT) imp.unsubT(); if (imp.unsubJ) imp.unsubJ(); } imp = null; render(); }
  function escolherTorneio(tid) {
    if (imp.unsubJ) imp.unsubJ();
    const T = imp.torneios.find(t => t.id === tid); imp.tid = tid; imp.T = T; imp.jogos = null;
    T.equipes = T.equipes || []; T.etapas = T.etapas || [];
    escolherEquipe((I.acharMococa(T) || T.equipes[0] || {}).id || null, false);
    imp.unsubJ = onSnapshot(collection(db, imp.col, tid, "jogos"), s => {
      if (!imp || imp.tid !== tid) return;
      imp.jogos = s.docs.map(d => ({ id: d.id, ...d.data() }));
      const comJogo = imp.T.etapas.map((_, i) => imp.jogos.some(j => j.etapa === i && (j.a === imp.eid || j.b === imp.eid) && j.status === "encerrado"));
      if (!comJogo[imp.ei]) { const i = comJogo.lastIndexOf(true); if (i >= 0) imp.ei = i; }
      render();
    }, e => console.error(e));
    render();
  }
  function escolherEquipe(eid, rerender = true) {
    imp.eid = eid; const eq = imp.T.equipes.find(e => e.id === eid);
    imp.mapa = eq ? I.sugerirMapa(eq, atletas) : {};
    if (rerender) render();
  }
  function previa() {
    const ids = {}; Object.entries(imp.mapa).forEach(([k, v]) => ids[k] = v === "novo" ? "novo:" + k : v);
    return I.montarEtapa({ ...imp.T, id: imp.tid }, imp.jogos, imp.ei, imp.eid, ids);
  }
  function telaImportar() {
    const w = h("div", { class: "card form" }, h("h3", { text: "Importar etapa de um torneio" }),
      h("div", { class: "toggle" }, FONTES.map(([k, t]) => h("button", { type: "button", "aria-pressed": String(imp.col === k), onclick: () => { imp.auto = false; trocarFonte(k); } }, t))),
      h("p", { class: "cap", text: "Traz uma etapa de um torneio (da aba Torneios deste app ou do app da Liga Metropolitana): as partidas de Mococa (fase, adversário e placar set a set), o grupo, a série e os pontos, bloqueios e assistências dos nossos atletas. Importar de novo a mesma etapa só atualiza as partidas; o que você escreveu à mão continua." }));
    const voltar = h("button", { type: "button", class: "ghost", onclick: fecharImportar }, "Cancelar");
    if (!imp.torneios) { w.append(h("p", { class: "vazio", text: "Lendo os torneios…" }), voltar); return w; }
    if (!imp.torneios.length) {
      w.append(h("p", { class: "vazio", text: imp.col === "lmb_torneios" ? (imp.indisponivel ? "O app da Liga não está disponível agora." : "Não há torneios no app da Liga.") + " Sem problema: o Mococa LMB funciona sozinho." : "Ainda não há torneios na aba Torneios deste app." }),
        h("p", { class: "cap", text: "Para registrar por conta própria: crie o torneio na aba Torneios (equipes, sorteio e placares) e depois importe de \"Torneios deste app\", ou registre a etapa à mão em \"+ Registrar etapa\"." }),
        h("div", { class: "linha" }, h("button", { type: "button", onclick: () => { fecharImportar(); irPara("torneios"); } }, "Abrir Torneios"), h("button", { type: "button", class: "ghost", onclick: () => { fecharImportar(); novaEtapa("realizada"); } }, "+ Registrar etapa"), voltar));
      return w;
    }
    const T = imp.T, eq = T && T.equipes.find(e => e.id === imp.eid);
    w.append(h("label", { class: "lbl" }, "Torneio", h("select", { onchange: ev => escolherTorneio(ev.target.value) }, imp.torneios.map(t => h("option", { value: t.id, selected: t.id === imp.tid }, t.nome || "Torneio")))));
    w.append(h("label", { class: "lbl" }, "Etapa", h("select", { onchange: ev => { imp.ei = +ev.target.value; render(); } }, T.etapas.map((et, i) => {
      const n = (imp.jogos || []).filter(j => j.etapa === i && (j.a === imp.eid || j.b === imp.eid) && j.status === "encerrado" && !(j.wo && !j.b)).length;
      return h("option", { value: i, selected: i === imp.ei }, et.nome + (et.data ? " – " + C.fmtData(et.data) : "") + " (" + n + (n === 1 ? " jogo" : " jogos") + " de Mococa)");
    }))));
    w.append(h("label", { class: "lbl" }, "Nossa equipe no torneio", h("select", { onchange: ev => escolherEquipe(ev.target.value) }, T.equipes.map(e => h("option", { value: e.id, selected: e.id === imp.eid }, e.nome)))));
    if (!eq) { w.append(voltar); return w; }
    const ats = eq.atletas || [];
    if (ats.length) {
      w.append(h("div", { class: "lbl" }, "Atletas da equipe no torneio → elenco de Mococa"));
      w.append(h("div", { class: "roster" }, ats.map(a => h("div", { class: "r", style: "grid-template-columns:minmax(0,1fr) minmax(0,1.2fr)" },
        h("span", { text: (a.num != null ? "#" + a.num + " " : "") + a.nome }),
        h("select", { "aria-label": "Atleta do elenco para " + a.nome, onchange: ev => { imp.mapa[a.id] = ev.target.value; render(); } },
          h("option", { value: "novo", selected: imp.mapa[a.id] === "novo" }, "+ Novo no elenco: " + a.nome),
          ativos().map(x => h("option", { value: x.id, selected: imp.mapa[a.id] === x.id }, (x.num != null ? "#" + x.num + " " : "") + x.nome)),
          h("option", { value: "ignorar", selected: imp.mapa[a.id] === "ignorar" }, "Não importar"))))));
      w.append(h("p", { class: "cap", text: "Quem tem o mesmo nome já vem ligado ao elenco. Os novos entram no elenco ao importar." }));
    }
    if (!imp.jogos) { w.append(h("p", { class: "vazio", text: "Lendo os jogos…" }), voltar); return w; }
    const r = previa(), ex = etapas.find(e => e.id === r.id);
    const nomePrev = id => id.startsWith("novo:") ? (ats.find(a => a.id === id.slice(5)) || {}).nome : nomeAt(id);
    const e = { ...r.etapa, id: r.id, partidas: r.partidas, atletas: r.atletas, posicao: ex ? ex.posicao : null }, R = C.resumoEtapa(e);
    w.append(h("h3", { text: "Prévia" }));
    if (!r.partidas.length) w.append(h("p", { class: "vazio", text: "Nenhum jogo encerrado de " + eq.nome + " nesta etapa." }));
    else {
      w.append(h("div", { class: "badges" }, badgeColocacao(R), h("span", { class: "badge v", text: R.v + (R.v === 1 ? " vitória" : " vitórias") }), h("span", { class: "badge d", text: R.d + (R.d === 1 ? " derrota" : " derrotas") }), r.grupo ? h("span", { class: "badge", text: "Grupo " + r.grupo + (r.etapa.posGrupo ? " · " + r.etapa.posGrupo + "º" : "") }) : null, h("span", { class: "badge", text: r.atletas.length + " atletas" })));
      w.append(h("div", { class: "texto" }, C.narrativa(e, nomePrev).map(t => h("p", { text: t }))));
    }
    if (r.pendentes) w.append(h("p", { class: "cap", text: "⚠ " + r.pendentes + (r.pendentes === 1 ? " jogo ainda não foi encerrado" : " jogos ainda não foram encerrados") + " no app da Liga e fica de fora. Importe de novo depois que terminar." }));
    if (ex) w.append(h("p", { class: "cap", text: "Esta etapa já foi importada antes. Importar de novo atualiza as partidas que vieram da Liga e mantém observações, colocação manual e partidas lançadas à mão." }));
    w.append(h("div", { class: "linha" }, h("button", { type: "button", disabled: imp.salvando || !r.partidas.length, onclick: importar }, imp.salvando ? "Importando…" : ex ? "Atualizar etapa" : "Importar etapa"), voltar));
    return w;
  }
  async function importar() {
    imp.salvando = true; render();
    try {
      const b = writeBatch(db), eq = imp.T.equipes.find(e => e.id === imp.eid), ids = {};
      for (const a of eq.atletas || []) {
        const v = imp.mapa[a.id];
        if (v === "novo") {
          const ja = atletas.find(x => C.chaveNome(x.nome) === C.chaveNome(a.nome));
          if (ja) ids[a.id] = ja.id;
          else { const id = C.uid("a"); ids[a.id] = id; b.set(doc(db, COL_AT, id), { nome: a.nome, num: a.num ?? null, ativo: true, criado: Date.now() }); }
        } else ids[a.id] = v;
      }
      const r = I.montarEtapa({ ...imp.T, id: imp.tid }, imp.jogos, imp.ei, imp.eid, ids), ex = etapas.find(e => e.id === r.id);
      r.etapa.origem.col = imp.col;
      const obj = { ...r.etapa, atletas: [...new Set([...(ex ? ex.atletas || [] : []), ...r.atletas])], partidas: [...(ex ? (ex.partidas || []).filter(p => !p.importado) : []), ...r.partidas],
        obs: ex ? ex.obs || "" : "", posicao: ex ? ex.posicao ?? null : null, criado: ex ? ex.criado || Date.now() : Date.now(), importadoEm: Date.now() };
      if (ex && ex.posGrupo != null && obj.posGrupo == null) obj.posGrupo = ex.posGrupo;
      b.set(etapaRef(r.id), limpar(obj));
      await b.commit();
      toast((ex ? "Etapa atualizada: " : "Etapa importada: ") + r.partidas.length + " partidas.");
      fecharImportar(); aba = "historia"; ls.set("aba", aba); render(); window.scrollTo(0, 0);
    } catch (err) { console.error(err); toast("Não deu para importar. Entre como organizador ou editor."); imp.salvando = false; render(); }
  }

  /* ---------- demonstração ---------- */
  async function criarDemo() {
    const { atletas: at, etapas: et, confirmacoes } = gerarDemo(), b = writeBatch(db);
    at.forEach(({ id, ...a }) => b.set(doc(db, COL_AT, id), a));
    et.forEach(({ id, ...e }) => b.set(etapaRef(id), limpar(e)));
    confirmacoes.forEach(({ id, ...c }) => b.set(doc(db, COL_ET, "demo-prox", COL_CONF, id), c));
    await b.commit(); toast("Demonstração criada. Explore as abas!");
  }
  async function apagarDemo() {
    const b = writeBatch(db);
    atletas.filter(a => a.demo).forEach(a => b.delete(doc(db, COL_AT, a.id)));
    etapas.filter(e => e.demo).forEach(e => { (confs[e.id] || []).forEach(c => b.delete(doc(db, COL_ET, e.id, COL_CONF, c.id))); b.delete(etapaRef(e.id)); });
    await b.commit(); atlSel = null; toast("Demonstração apagada.");
  }

  render();
  return { atualizarPermissao: () => { torneio.atualizarPermissao(); render(); } };
}
