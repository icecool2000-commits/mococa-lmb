// Mídias dos torneios: fotos e vídeos guardados no próprio Firestore (em pedaços), galeria, download
// e compartilhamento para o Instagram (perfis cadastrados). Enviar, apagar e postar: só organizador/editores.
// Coleções: midias_{app}/{id} (dados + miniatura) e midias_{app}/{id}/partes/{n} (arquivo em base64);
// midia_config/{app} = { perfis: [{ usuario, nome }] }.

const PARTE = 700000;                 // bytes por pedaço (vira ~933 KB em base64, abaixo do limite de 1 MB do Firestore)
const MAX_VIDEO = 50 * 1024 * 1024;   // 50 MB por vídeo
const MAX_FOTO_LADO = 2048;           // fotos são reduzidas para no máximo 2048 px no lado maior

const uid = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const tamanho = b => b > 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const dataTxt = ms => { const d = new Date(ms); return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear(); };
const limpo = s => (s || "midia").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "midia";
const extDe = mime => ({ "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" })[mime] || (mime || "").split("/")[1] || "bin";

function blobParaB64(blob) { return new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = erro; r.readAsDataURL(blob); }); }
function b64ParaBytes(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function carregarImg(url) { return new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url; }); }
function canvasBlob(c, q) { return new Promise(ok => c.toBlob(ok, "image/jpeg", q)); }

// foto: reduz e converte para JPEG; miniatura pequena para a galeria
async function prepararFoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await carregarImg(url), W = img.naturalWidth, H = img.naturalHeight;
    const k = Math.min(1, MAX_FOTO_LADO / Math.max(W, H)), c = document.createElement("canvas");
    c.width = Math.round(W * k); c.height = Math.round(H * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    let blob = file.type === "image/gif" ? file : await canvasBlob(c, 0.85);
    if (file.type === "image/jpeg" && file.size < blob.size && k === 1) blob = file;
    const kt = Math.min(1, 480 / Math.max(W, H)), t = document.createElement("canvas");
    t.width = Math.round(W * kt); t.height = Math.round(H * kt); t.getContext("2d").drawImage(img, 0, 0, t.width, t.height);
    return { blob, mime: blob.type || "image/jpeg", thumb: t.toDataURL("image/jpeg", 0.7), largura: c.width, altura: c.height };
  } finally { URL.revokeObjectURL(url); }
}
// vídeo: mantém o arquivo; tenta tirar uma miniatura do começo
async function prepararVideo(file) {
  let thumb = null, largura = null, altura = null;
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "metadata"; v.src = url;
    await new Promise((ok, erro) => { v.onloadeddata = ok; v.onerror = erro; setTimeout(erro, 8000); });
    v.currentTime = Math.min(1, (v.duration || 2) / 2);
    await new Promise(ok => { v.onseeked = ok; setTimeout(ok, 3000); });
    largura = v.videoWidth; altura = v.videoHeight;
    const k = Math.min(1, 480 / Math.max(largura, altura)), c = document.createElement("canvas");
    c.width = Math.round(largura * k); c.height = Math.round(altura * k); c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    thumb = c.toDataURL("image/jpeg", 0.7);
  } catch (e) { /* sem miniatura */ } finally { URL.revokeObjectURL(url); }
  return { blob: file, mime: file.type || "video/mp4", thumb, largura, altura };
}

export function montarMidias(ctx) {
  const { db, h, toast } = ctx, { collection, doc, onSnapshot, setDoc, deleteDoc } = ctx.fs;
  const COL = "midias_" + ctx.app, podeEditar = () => ctx.podeEditar();
  const render = () => ctx.render();
  let itens = [], carregou = false, perfis = null, filtro = "torneio", aberto = null, envio = null, post = null, editPerfis = false;
  const blobs = {}; // id -> { blob, url }

  onSnapshot(collection(db, COL), s => { itens = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.em || 0) - (a.em || 0)); carregou = true; render(); }, e => { console.error(e); carregou = true; render(); });
  onSnapshot(doc(db, "midia_config", ctx.app), s => { const d = s.exists() ? s.data() : null; perfis = d && Array.isArray(d.perfis) ? d.perfis : null; render(); }, e => console.error(e));
  const listaPerfis = () => perfis || ctx.perfisPadrao || [];

  async function baixarArquivo(m) {
    if (blobs[m.id]) return blobs[m.id];
    const partes = await new Promise((ok, erro) => {
      const fim = onSnapshot(collection(db, COL, m.id, "partes"), s => {
        if (s.docs.length >= m.partes) { fim(); ok(s.docs.map(d => ({ n: d.id, d: d.data().d })).sort((a, b) => a.n.localeCompare(b.n))); }
      }, e => { fim(); erro(e); });
      setTimeout(() => { fim(); erro(new Error("tempo esgotado")); }, 120000);
    });
    const blob = new Blob(partes.map(p => b64ParaBytes(p.d)), { type: m.mime });
    return (blobs[m.id] = { blob, url: URL.createObjectURL(blob) });
  }

  async function enviar(files) {
    const lista = [...files]; if (!lista.length) return;
    const T = ctx.torneio ? ctx.torneio() : null;
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i], video = (f.type || "").startsWith("video/");
      if (!video && !(f.type || "").startsWith("image/")) { toast(f.name + ": só fotos e vídeos."); continue; }
      if (video && f.size > MAX_VIDEO) { toast(f.name + " passa de 50 MB. Corte ou reduza o vídeo antes de enviar."); continue; }
      envio = { nome: f.name, pct: 0, atual: i + 1, total: lista.length }; render();
      try {
        const p = video ? await prepararVideo(f) : await prepararFoto(f);
        const id = uid(), n = Math.max(1, Math.ceil(p.blob.size / PARTE));
        const meta = { titulo: f.name.replace(/\.[^.]+$/, ""), tipo: video ? "video" : "foto", mime: p.mime, tamanho: p.blob.size, partes: n, thumb: p.thumb || null,
          largura: p.largura || null, altura: p.altura || null, torneio: T ? T.id : null, torneioNome: T ? T.nome : null, autor: ctx.autor ? ctx.autor() : null, em: Date.now(), completo: false };
        await setDoc(doc(db, COL, id), meta);
        for (let k = 0; k < n; k++) {
          const d = await blobParaB64(p.blob.slice(k * PARTE, (k + 1) * PARTE));
          await setDoc(doc(db, COL, id, "partes", String(k).padStart(4, "0")), { d });
          envio.pct = Math.round((k + 1) / n * 100); render();
        }
        await setDoc(doc(db, COL, id), { ...meta, completo: true });
      } catch (e) { console.error(e); toast("Não deu para enviar " + f.name + ". Confira a internet e se você entrou como editor."); }
    }
    envio = null; toast(lista.length > 1 ? "Mídias enviadas." : "Mídia enviada."); render();
  }

  async function apagar(m) {
    for (let k = 0; k < (m.partes || 0); k++) await deleteDoc(doc(db, COL, m.id, "partes", String(k).padStart(4, "0"))).catch(() => {});
    await deleteDoc(doc(db, COL, m.id));
    if (blobs[m.id]) { URL.revokeObjectURL(blobs[m.id].url); delete blobs[m.id]; }
    aberto = null; post = null; toast("Mídia apagada."); render();
  }

  async function baixar(m) {
    try {
      const { url } = await baixarArquivo(m), a = document.createElement("a");
      a.href = url; a.download = limpo(m.titulo) + "." + extDe(m.mime); document.body.append(a); a.click(); a.remove();
    } catch (e) { console.error(e); toast("Não deu para baixar. Confira a internet."); }
  }

  async function compartilhar(m) {
    const perfil = post.perfil, legenda = post.legenda || "";
    try { await navigator.clipboard.writeText(legenda); } catch (e) { /* sem área de transferência */ }
    try {
      const { blob } = await baixarArquivo(m), file = new File([blob], limpo(m.titulo) + "." + extDe(m.mime), { type: m.mime });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: legenda });
        toast("Escolha o Instagram e confira se está na conta @" + perfil + ". A legenda já foi copiada: é só colar.");
      } else {
        const a = document.createElement("a"), url = URL.createObjectURL(blob); a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        window.open("https://www.instagram.com/" + perfil + "/", "_blank", "noopener");
        toast("Arquivo baixado e Instagram aberto. Entre como @" + perfil + ", toque em Criar e cole a legenda (já copiada).");
      }
    } catch (e) { if (e && e.name === "AbortError") return; console.error(e); toast("Não deu para compartilhar. Tente baixar a mídia e postar pelo app do Instagram."); }
  }

  async function salvarPerfis(novos) {
    try { await setDoc(doc(db, "midia_config", ctx.app), { perfis: novos }); toast("Perfis salvos."); }
    catch (e) { console.error(e); toast("Não deu para salvar os perfis."); }
  }

  /* ---------- telas ---------- */
  function cartaoPerfis() {
    const ps = listaPerfis();
    const card = h("div", { class: "t-card t-form" }, h("h3", { text: "Perfis do Instagram" }),
      h("p", { class: "cap", text: "Contas cadastradas para postar. Na hora de postar você escolhe uma delas." }),
      h("ul", { class: "t-perfis" }, ps.map((p, i) => h("li", null, h("a", { href: "https://www.instagram.com/" + p.usuario + "/", target: "_blank", rel: "noopener", text: "@" + p.usuario }), p.nome ? h("span", { class: "cap", text: p.nome }) : null,
        editPerfis ? h("button", { type: "button", class: "ghost t-mini", "aria-label": "Remover @" + p.usuario, onclick: () => salvarPerfis(ps.filter((_, k) => k !== i)) }, "×") : null))));
    if (editPerfis) {
      const f = h("form", { class: "t-linha", onsubmit: e => {
        e.preventDefault(); const u = f.querySelector(".pu").value.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, ""), n = f.querySelector(".pn").value.trim();
        if (!/^[A-Za-z0-9._]{1,30}$/.test(u)) { toast("Usuário do Instagram inválido."); return; }
        if (ps.some(p => p.usuario.toLowerCase() === u.toLowerCase())) { toast("@" + u + " já está cadastrado."); return; }
        salvarPerfis([...ps, { usuario: u, nome: n }]);
      } }, h("input", { class: "pu", placeholder: "@usuario", maxlength: 60, "aria-label": "Usuário do Instagram" }), h("input", { class: "pn", placeholder: "Nome (opcional)", maxlength: 40, "aria-label": "Nome do perfil" }), h("button", { type: "submit", class: "t-mini" }, "+ Perfil"));
      card.append(f);
    }
    if (podeEditar()) card.append(h("button", { type: "button", class: "ghost t-mini", onclick: () => { editPerfis = !editPerfis; render(); } }, editPerfis ? "Concluir" : "Editar perfis"));
    return card;
  }

  function visualizador(m) {
    const box = h("div", { class: "t-midia-view", role: "dialog", "aria-modal": "true", "aria-label": m.titulo });
    const palco = h("div", { class: "t-midia-palco" }, m.thumb ? h("img", { src: m.thumb, alt: m.titulo, class: "borrado" }) : null, h("p", { class: "cap", text: "Carregando " + tamanho(m.tamanho) + "…" }));
    baixarArquivo(m).then(({ url }) => {
      if (aberto !== m.id) return;
      palco.textContent = "";
      palco.append(m.tipo === "video" ? h("video", { src: url, controls: true, playsinline: true, preload: "metadata" }) : h("img", { src: url, alt: m.titulo }));
    }).catch(e => { console.error(e); palco.textContent = ""; palco.append(h("p", { class: "cap", text: "Não deu para carregar esta mídia." })); });
    box.append(h("div", { class: "t-midia-bar" }, h("button", { type: "button", class: "ghost t-mini", onclick: () => { aberto = null; post = null; render(); } }, "← Voltar"),
      h("span", { class: "t-midia-tit", text: m.titulo })));
    box.append(palco);
    box.append(h("p", { class: "cap", text: [m.tipo === "video" ? "Vídeo" : "Foto", tamanho(m.tamanho), m.torneioNome, dataTxt(m.em)].filter(Boolean).join(" · ") }));
    box.append(h("div", { class: "t-linha" }, h("button", { type: "button", onclick: () => baixar(m) }, "⬇ Baixar"),
      podeEditar() && h("button", { type: "button", class: "t-insta", onclick: () => { post = post ? null : { perfil: (listaPerfis()[0] || {}).usuario || "", legenda: [m.titulo, m.torneioNome, ctx.hashtags].filter(Boolean).join("\n") }; render(); } }, "Postar no Instagram"),
      podeEditar() && h("button", { type: "button", class: "danger t-mini", onclick: () => ctx.perguntar("Apagar esta mídia para todos?", () => apagar(m), "Apagar") }, "Apagar")));
    if (post && podeEditar()) {
      const ps = listaPerfis();
      box.append(h("div", { class: "t-card t-form" }, h("h3", { text: "Postar no Instagram" }),
        ps.length ? h("div", { class: "t-lbl" }, "Em qual perfil?", h("div", { class: "chips" }, ps.map(p => h("button", { type: "button", "aria-pressed": String(post.perfil === p.usuario), onclick: () => { post.perfil = p.usuario; render(); } }, "@" + p.usuario))))
          : h("p", { class: "cap", text: "Nenhum perfil cadastrado. Cadastre em \"Perfis do Instagram\" na aba Mídias." }),
        h("label", { class: "t-lbl" }, "Legenda", h("textarea", { rows: 4, maxlength: 2200, oninput: e => { post.legenda = e.target.value; } }, post.legenda)),
        h("p", { class: "cap", text: "O app copia a legenda e abre o compartilhamento do celular: escolha o Instagram (Feed, Reels ou Stories) e confira se está logado em @" + (post.perfil || "…") + ". O Instagram não permite que outros apps publiquem sozinhos, então a última confirmação é feita por lá." }),
        h("button", { type: "button", class: "t-insta", disabled: !post.perfil, onclick: () => compartilhar(m) }, "Compartilhar com @" + (post.perfil || "…"))));
    }
    return box;
  }

  function tela() {
    const w = h("div", { class: "t-col" }), T = ctx.torneio ? ctx.torneio() : null;
    const m = aberto && itens.find(x => x.id === aberto); if (aberto && !m) aberto = null;
    if (m) { w.append(visualizador(m)); return w; }
    if (podeEditar()) {
      const inp = h("input", { type: "file", accept: "image/*,video/*", multiple: true, hidden: true, onchange: e => { enviar(e.target.files); e.target.value = ""; } });
      w.append(h("div", { class: "t-card t-form" }, h("h3", { text: "Enviar fotos e vídeos" }),
        h("p", { class: "cap", text: "Fotos são ajustadas para até 2048 px. Vídeos até 50 MB (vídeos curtos, de celular). " + (T ? "Ficam ligadas ao torneio \"" + T.nome + "\"." : "") }),
        inp, envio ? h("div", { class: "t-envio" }, h("span", { class: "cap", text: "Enviando " + envio.atual + " de " + envio.total + ": " + envio.nome + " · " + envio.pct + "%" }), h("progress", { max: 100, value: envio.pct }))
          : h("button", { type: "button", onclick: () => inp.click() }, "+ Escolher fotos e vídeos")));
    }
    const doTorneio = T ? itens.filter(x => x.torneio === T.id) : [];
    if (T && itens.length) w.append(h("div", { class: "chips" },
      h("button", { type: "button", "aria-pressed": String(filtro === "torneio"), onclick: () => { filtro = "torneio"; render(); } }, "Deste torneio (" + doTorneio.length + ")"),
      h("button", { type: "button", "aria-pressed": String(filtro === "todas"), onclick: () => { filtro = "todas"; render(); } }, "Todas (" + itens.length + ")")));
    const lista = (T && filtro === "torneio" ? doTorneio : itens).filter(x => x.completo || podeEditar());
    if (!carregou) w.append(h("p", { class: "cap", text: "Carregando…" }));
    else if (!lista.length) w.append(h("div", { class: "t-card" }, h("p", { class: "cap", text: "Ainda não há fotos ou vídeos" + (T && filtro === "torneio" ? " deste torneio." : ".") + (podeEditar() ? "" : " Quando o organizador ou um editor enviar, eles aparecem aqui para ver e baixar.") })));
    else w.append(h("div", { class: "t-galeria" }, lista.map(x => h("button", { type: "button", class: "t-mid" + (x.completo ? "" : " falhou"), "aria-label": (x.tipo === "video" ? "Vídeo " : "Foto ") + x.titulo, onclick: () => { aberto = x.id; post = null; render(); window.scrollTo(0, 0); } },
      x.thumb ? h("img", { src: x.thumb, alt: "", loading: "lazy" }) : h("span", { class: "t-mid-sem", text: x.tipo === "video" ? "🎬" : "🖼" }),
      x.tipo === "video" ? h("span", { class: "t-mid-play", text: "▶" }) : null, !x.completo ? h("span", { class: "t-mid-aviso", text: "envio incompleto" }) : null))));
    w.append(cartaoPerfis());
    return w;
  }
  return { tela };
}
