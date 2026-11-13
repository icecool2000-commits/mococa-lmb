/* biribol-anim.js – logos animados e abertura "cortada na piscina" (Biribol Mococa e Liga Metropolitana).
   Mesmo arquivo nos dois apps (fonte em torneio-src). Script clássico: expõe window.BiribolAnim = {logo, abertura}.
   - logo(el, tipo, {entrada, ciclo}): monta o logo em camadas (imagens em anim/) e anima com Web Animations
     (só transform/opacity/clip-path: roda no compositor). tipo "bm" = Biribol Mococa, "lmb" = Liga Metropolitana.
   - abertura(cfg) com cfg.video: vídeo de lances reais (60 fps) que termina num clarão branco e se desfaz no logo
     (logo em camadas/Lottie, ou cfg.logoImg = imagem simples); se o vídeo falhar, cai na cena em SVG.
   - abertura(cfg) sem vídeo: tela cheia com uma cena em SVG numa piscina de biribol (levantamento, atacante salta e corta,
     bola explode na água, PONTO!), uma onda cobre a tela e revela o logo animado; final parado 2 s; some suave.
     Linha do tempo própria em requestAnimationFrame (tudo calculado pelo relógio, sem passos soltos). */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const reduz = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- estilos ----------
  const CSS = `
.ba-logo{position:relative;isolation:isolate;user-select:none;-webkit-user-select:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.ba-logo img{position:absolute;left:0;top:0;width:100%;height:auto;display:block;will-change:transform,opacity;backface-visibility:hidden;pointer-events:none}
.ba-logo .ba-cam,.ba-logo .ba-corpo{position:absolute;inset:0;will-change:transform,opacity}
.ba-logo .ba-clipbola{position:absolute;left:0;top:0;width:100%;overflow:hidden}
.ba-logo .ba-brilho{position:absolute;inset:0;overflow:hidden;pointer-events:none;-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
.ba-logo .ba-brilho i{position:absolute;top:-10%;bottom:-10%;left:0;width:45%;transform:translateX(-140%) skewX(-18deg);opacity:0;
  background:linear-gradient(90deg,transparent,rgb(255 255 255 / .15) 30%,rgb(255 255 255 / .85) 50%,rgb(255 255 255 / .15) 70%,transparent);will-change:transform,opacity}
.ba-logo .ba-choque{position:absolute;border-radius:50%;border:3px solid rgb(255 255 255 / .9);box-shadow:0 0 18px rgb(255 255 255 / .6);opacity:0;pointer-events:none;transform:translate(-50%,-50%) scale(.2);will-change:transform,opacity}
.ba-logo .ba-aura{position:absolute;inset:-6%;border-radius:50%;opacity:0;pointer-events:none;will-change:opacity,transform}
.ba-ab{position:fixed;inset:0;z-index:9999;overflow:hidden;background:#000;touch-action:manipulation}
.ba-ab svg.ba-cena{position:absolute;inset:0;width:100%;height:100%;display:block}
.ba-ab .ba-final{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;opacity:0;
  padding:max(16px,env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) max(16px,env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}
.ba-ab .ba-final .ba-logo{cursor:default}
.ba-ab .ba-sub{font-family:"Anton",Impact,"Arial Narrow Bold",sans-serif;text-transform:uppercase;letter-spacing:.08em;color:#fff;font-size:clamp(14px,4.2vw,20px);text-align:center;opacity:0;margin:0;text-wrap:balance}
.ba-ab-video{background:#000}
.ba-ab-video video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
@media (min-aspect-ratio:4/5){.ba-ab-video video{object-fit:contain}}
.ba-ab .ba-branco{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
.ba-logoimg{position:relative;aspect-ratio:1;border-radius:22%;overflow:hidden;box-shadow:0 0 0 2px rgb(255 255 255 / .18),0 18px 60px rgb(0 0 0 / .55);opacity:0}
.ba-logoimg img{width:100%;height:100%;display:block}
.ba-logoimg .ba-reflexo{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.ba-logoimg .ba-reflexo i{position:absolute;top:-10%;bottom:-10%;left:0;width:40%;opacity:0;background:linear-gradient(90deg,transparent,rgb(255 255 255 / .12) 30%,rgb(255 255 255 / .7) 50%,rgb(255 255 255 / .12) 70%,transparent)}
.ba-ab .ba-pular{position:absolute;left:50%;bottom:max(18px,env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:3;background:rgb(0 0 0 / .35);color:#ddd;border:1px solid rgb(255 255 255 / .3);border-radius:999px;padding:6px 16px;font:500 13px system-ui,sans-serif;min-height:0;cursor:pointer}
`;
  let estilo = false;
  function injetarCSS() { if (estilo) return; estilo = true; const s = document.createElement("style"); s.textContent = CSS; document.head.append(s); }
  const elx = (tag, attrs, pai) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (pai) pai.append(e); return e; };
  const div = (cls, pai) => { const d = document.createElement("div"); if (cls) d.className = cls; if (pai) pai.append(d); return d; };
  const img = (src, pai, cls) => { const i = new Image(); i.src = src; i.alt = ""; i.decoding = "async"; i.draggable = false; if (cls) i.className = cls; if (pai) pai.append(i); return i; };

  // ---------- LOGOS ----------
  // bm: 1129 x 589 (bola atrás do BIRIBOL, corte em y=174; centro da bola ~ (593, 261)); lmb: 800 x 800 (bola em (402.5, 250), anel centrado em (400, 392))
  const LOGO = {
    bm: { w: 1129, h: 589, pasta: "anim/bm-" },
    lmb: { w: 800, h: 800, pasta: "anim/lmb-", lottie: "anim/lmb-logo.json" },
  };
  const E = { saida: "cubic-bezier(.16,1,.3,1)", suave: "cubic-bezier(.45,0,.25,1)", mola: "cubic-bezier(.34,1.56,.64,1)" };

  // logo vetorial em Lottie (SVG vetorizado no Recraft e animado em camadas): usado quando o app tem o arquivo e o player lottie
  function logoLottie(el, tipo, op, L) {
    el.classList.add("ba-logo", "ba-" + tipo);
    el.style.aspectRatio = L.w + " / " + L.h;
    el.textContent = "";
    const box = div("", el); Object.assign(box.style, { position: "absolute", inset: "0" });
    const an = window.lottie.loadAnimation({ container: box, renderer: "svg", loop: false, autoplay: false, path: L.lottie, rendererSettings: { preserveAspectRatio: "xMidYMid meet", progressiveLoad: false } });
    let falhou = false;
    const pronto = new Promise(ok => { an.addEventListener("DOMLoaded", ok); an.addEventListener("data_failed", () => { falhou = true; ok(); }); setTimeout(ok, 4000); });
    const fim = () => an.goToAndStop(an.totalFrames - 1, true);
    function entrada() { if (falhou) return 0; an.goToAndPlay(0, true); return Math.round(an.getDuration() * 1000); }
    const api = { entrada, pulso() {}, ciclo() {}, parar() { an.stop(); }, pronto, el, lottie: an };
    if (reduz()) { pronto.then(fim); return api; }
    const comecar = () => pronto.then(() => { if (op.entrada) entrada(); else fim(); });
    api.comecar = comecar;
    if (op.auto !== false) { if (op.depoisDe) window.addEventListener(op.depoisDe, () => setTimeout(comecar, op.atraso || 0), { once: true }); else setTimeout(comecar, op.atraso || 0); }
    if (op.toque !== false) el.addEventListener("click", () => pronto.then(entrada));
    return api;
  }

  function logo(el, tipo, op) {
    op = op || {};
    injetarCSS();
    const L = LOGO[tipo]; if (!L) return null;
    if (L.lottie && window.lottie && op.lottie !== false) return logoLottie(el, tipo, op, L);
    el.classList.add("ba-logo", "ba-" + tipo);
    el.style.aspectRatio = L.w + " / " + L.h;
    el.textContent = "";
    const cam = div("ba-cam", el);
    const P = n => L.pasta + n + ".webp";
    const R = {}; // referências
    let anims = [];
    if (tipo === "bm") {
      const clip = div("ba-clipbola", cam); clip.style.height = (174 / 589 * 100) + "%";
      R.bola = img(P("bola"), clip); R.bola.style.transformOrigin = "52.5% 44.3%";
      R.eco = img(P("biribol"), cam); R.eco.style.opacity = "0";
      R.palavra = img(P("biribol"), cam);
      R.script = img(P("mococa"), cam);
    } else {
      R.aura = div("ba-aura", cam); R.aura.style.background = "radial-gradient(circle,rgb(246 210 11 / .45),rgb(21 151 220 / .25) 45%,transparent 70%)";
      R.corpo = div("ba-corpo", cam);
      R.base = img(P("base"), R.corpo);
      R.anel = img(P("anel"), R.corpo); R.anel.style.transformOrigin = "50% 49%";
      R.letras = img(P("letras"), R.corpo); R.letras.style.opacity = "0"; R.letras.style.transformOrigin = "51% 61.6%";
      R.rastro = [img(P("bola"), cam), img(P("bola"), cam)]; R.rastro.forEach(r => { r.style.opacity = "0"; r.style.transformOrigin = "50.3% 31.25%"; });
      R.bola = img(P("bola"), cam); R.bola.style.transformOrigin = "50.3% 31.25%";
      R.choque = div("ba-choque", cam); Object.assign(R.choque.style, { left: "50.3%", top: "31.25%", width: "27%", height: "27%" });
    }
    const brilho = div("ba-brilho", cam), faixa = document.createElement("i"); brilho.append(faixa);
    const masc = "url(" + P("tudo") + ")"; brilho.style.webkitMaskImage = masc; brilho.style.maskImage = masc;

    const a = (alvo, k, o) => { const x = alvo.animate(k, Object.assign({ fill: "both" }, o)); anims.push(x); return x; };
    function limpar() { anims.forEach(x => x.cancel()); anims = []; }
    function reflexo(atraso) {
      a(faixa, [{ transform: "translateX(-140%) skewX(-18deg)", opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .85 }, { transform: "translateX(320%) skewX(-18deg)", opacity: 0 }],
        { duration: 1100, delay: atraso || 0, easing: E.suave });
    }
    function entrada() {
      limpar();
      if (tipo === "bm") {
        // BIRIBOL entra rasgando da esquerda com rastro; a bola sobe por trás como um saque; Mococa é escrito à mão
        a(R.palavra, [{ transform: "translateX(-62%) skewX(-24deg) scaleX(1.15)", opacity: 0 }, { opacity: 1, offset: .35 },
          { transform: "translateX(2.5%) skewX(7deg) scaleX(.98)", offset: .62 }, { transform: "translateX(-.8%) skewX(-2deg)", offset: .82 }, { transform: "none", opacity: 1 }],
          { duration: 720, easing: "cubic-bezier(.2,.75,.25,1)" });
        a(R.eco, [{ transform: "translateX(-75%) skewX(-24deg) scaleX(1.25)", opacity: 0 }, { opacity: .45, offset: .3 }, { transform: "translateX(-4%) skewX(-8deg)", opacity: .25, offset: .62 }, { transform: "translateX(0)", opacity: 0 }],
          { duration: 760, delay: 40, easing: "cubic-bezier(.2,.75,.25,1)" });
        a(R.bola, [{ transform: "translateY(112%) rotate(-55deg)" }, { transform: "translateY(112%) rotate(-55deg)", offset: .01 },
          { transform: "translateY(-9%) rotate(8deg)", offset: .62 }, { transform: "translateY(2%) rotate(-2deg)", offset: .82 }, { transform: "none" }],
          { duration: 820, delay: 380, easing: "cubic-bezier(.22,.9,.3,1)" });
        a(R.script, [{ clipPath: "inset(0 100% 0 0)", transform: "translateY(4%)", opacity: 1 }, { clipPath: "inset(0 0% 0 0)", transform: "none", opacity: 1 }],
          { duration: 820, delay: 820, easing: "cubic-bezier(.55,.05,.35,1)" });
        a(cam, [{ transform: "none" }, { transform: "none", offset: .55 }, { transform: "scale(1.035)", offset: .7 }, { transform: "none" }], { duration: 1100, delay: 0, easing: E.suave });
        reflexo(1600);
        return 2700;
      }
      // LMB: a bola chega cortada do alto, explode no centro, o escudo abre, o anel gira e o LMB bate
      const T = 520;
      const kb = [{ transform: "translate(150%,-175%) scale(.45) rotate(-620deg)", opacity: 0 }, { opacity: 1, offset: .12 },
        { transform: "translate(-3%,3%) scale(1.1) rotate(-12deg)", offset: .8 }, { transform: "none", opacity: 1 }];
      a(R.bola, kb, { duration: T, easing: "cubic-bezier(.5,0,.75,.35)" });
      R.rastro.forEach((r, i) => a(r, kb.map((k, j) => Object.assign({}, k, { opacity: j === 0 ? 0 : j === 3 ? 0 : (.38 - i * .16) })), { duration: T, delay: 45 * (i + 1), easing: "cubic-bezier(.5,0,.75,.35)" }));
      a(R.choque, [{ transform: "translate(-50%,-50%) scale(.3)", opacity: 0 }, { opacity: 1, offset: .08 }, { transform: "translate(-50%,-50%) scale(2.6)", opacity: 0 }],
        { duration: 650, delay: T - 40, easing: "cubic-bezier(.1,.7,.3,1)" });
      a(R.corpo, [{ transform: "scale(.55) rotate(-14deg)", opacity: 0 }, { transform: "scale(1.06) rotate(2deg)", opacity: 1, offset: .55 }, { transform: "scale(.985)", offset: .8 }, { transform: "none", opacity: 1 }],
        { duration: 720, delay: T - 80, easing: "cubic-bezier(.2,.8,.25,1)" });
      a(R.anel, [{ transform: "rotate(-95deg)" }, { transform: "rotate(7deg)", offset: .72 }, { transform: "rotate(-2deg)", offset: .88 }, { transform: "none" }],
        { duration: 1100, delay: T - 80, easing: "cubic-bezier(.2,.75,.25,1)" });
      a(R.letras, [{ transform: "scale(1.9)", opacity: 0 }, { opacity: .9, offset: .25 }, { transform: "scale(1)", opacity: .9, offset: .7 }, { transform: "scale(1)", opacity: 0 }],
        { duration: 560, delay: T + 420, easing: "cubic-bezier(.3,.7,.3,1)" });
      a(cam, [{ transform: "none" }, { transform: "translate(1.2%,-.8%) rotate(.6deg)", offset: .2 }, { transform: "translate(-1%,.6%) rotate(-.5deg)", offset: .45 }, { transform: "translate(.4%,-.2%)", offset: .7 }, { transform: "none" }],
        { duration: 420, delay: T + 650 });
      a(R.aura, [{ opacity: 0, transform: "scale(.8)" }, { opacity: 1, transform: "scale(1)", offset: .3 }, { opacity: 0, transform: "scale(1.15)" }], { duration: 1200, delay: T - 40, easing: E.suave });
      reflexo(T + 1050);
      return T + 2150;
    }
    // ciclo discreto (a cada ~7 s): reflexo + a bola dá um giro/quique
    let tCiclo = null;
    function pulso() {
      if (document.hidden) return;
      if (tipo === "bm") {
        a(R.bola, [{ transform: "none" }, { transform: "translateY(-10%) rotate(-14deg)", offset: .35, easing: "cubic-bezier(.3,0,.7,1)" }, { transform: "translateY(1.5%) rotate(3deg)", offset: .7 }, { transform: "none" }],
          { duration: 900, easing: E.suave });
        a(R.palavra, [{ transform: "none" }, { transform: "scale(1.025)", offset: .55 }, { transform: "none" }], { duration: 700, delay: 520, easing: E.suave });
        reflexo(700);
      } else {
        a(R.bola, [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg) scale(1.06)", offset: .7 }, { transform: "rotate(360deg)" }], { duration: 1100, easing: E.suave });
        a(R.letras, [{ transform: "scale(1.25)", opacity: 0 }, { opacity: .55, offset: .35 }, { transform: "scale(1)", opacity: 0 }], { duration: 650, delay: 700, easing: E.suave });
        reflexo(900);
      }
    }
    function ciclo() { clearInterval(tCiclo); tCiclo = setInterval(pulso, 7000); }
    function parar() { clearInterval(tCiclo); limpar(); }
    const pronto = Promise.all([...el.querySelectorAll("img")].map(i => i.decode ? i.decode().catch(() => {}) : 0));
    const api = { entrada, pulso, ciclo, parar, pronto, el };
    if (reduz()) return api;
    if (op.estado0 !== false && op.entrada) {
      // esconde as camadas até a entrada começar (evita ver o logo pronto antes da animação)
      if (tipo === "bm") { R.palavra.style.opacity = "0"; R.script.style.clipPath = "inset(0 100% 0 0)"; R.bola.style.transform = "translateY(112%)"; }
      else { R.corpo.style.opacity = "0"; R.bola.style.opacity = "0"; }
    }
    const comecar = () => pronto.then(() => {
      if (tipo === "bm") { R.palavra.style.opacity = ""; R.script.style.clipPath = ""; R.bola.style.transform = ""; }
      else { R.corpo.style.opacity = ""; R.bola.style.opacity = ""; }
      const d = op.entrada ? entrada() : 0; if (op.ciclo !== false) setTimeout(ciclo, d);
    });
    if (op.auto !== false) { if (op.depoisDe) window.addEventListener(op.depoisDe, () => setTimeout(comecar, op.atraso || 0), { once: true }); else setTimeout(comecar, op.atraso || 0); }
    api.comecar = comecar;
    if (op.toque !== false) el.addEventListener("click", () => { pronto.then(() => { entrada(); }); });
    return api;
  }

  // ---------- ABERTURA: cortada na piscina de biribol ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const EZ = {
    lin: t => t,
    in: t => t * t * t,
    out: t => 1 - Math.pow(1 - t, 3),
    io: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    outQ: t => 1 - (1 - t) * (1 - t),
    back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };
  // trilha: [[t, valor, easing-do-trecho-seguinte], ...]
  function trilha(pontos) {
    return t => {
      if (t <= pontos[0][0]) return pontos[0][1];
      for (let i = 0; i < pontos.length - 1; i++) {
        const [t0, v0, e] = pontos[i], [t1, v1] = pontos[i + 1];
        if (t <= t1) { const u = (EZ[e || "io"])((t - t0) / (t1 - t0)); return lerp(v0, v1, u); }
      }
      return pontos[pontos.length - 1][1];
    };
  }

  function abertura(cfg) {
    injetarCSS();
    const chave = cfg.chave || ("ab-" + cfg.tipo);
    let ja = false; try { ja = sessionStorage.getItem(chave) === "1"; sessionStorage.setItem(chave, "1"); } catch (e) {}
    if (ja || reduz() || !document.body.animate) { window.__semAbertura = true; return null; }
    return cfg.video ? aberturaVideo(cfg) : aberturaSVG(cfg);
  }

  // ================= abertura em vídeo (cenas reais, 60 fps) =================
  // O vídeo termina num clarão branco; o clarão se desfaz sobre o logo animado, que fica parado 2 s e some com o app subindo.
  function aberturaVideo(cfg) {
    const C = cfg.cores || {};
    const ov = document.createElement("div"); ov.className = "ba-ab ba-ab-video"; ov.id = "abertura";
    ov.setAttribute("role", "img"); ov.setAttribute("aria-label", cfg.rotulo || "Abertura do app: lances reais de biribol na piscina e o logo animado");
    document.body.prepend(ov);
    const v = document.createElement("video");
    v.muted = true; v.defaultMuted = true; v.playsInline = true; v.autoplay = true; v.preload = "auto";
    v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", ""); v.setAttribute("aria-hidden", "true");
    if (cfg.poster) v.poster = cfg.poster;
    v.src = cfg.video; ov.append(v);
    const fim = div("ba-final", ov);
    fim.style.background = `radial-gradient(70% 50% at 50% 45%, ${C.finalCor || "#15418a"}, ${(C.fundo || ["#040c1b"])[0]} 75%)`;
    const caixa = div("", fim);
    let L;
    if (cfg.logoImg) {
      caixa.className = "ba-logoimg"; caixa.style.width = "min(68vw, 340px, 42vh)";
      const im = img(cfg.logoImg, caixa); im.alt = "";
      const br = div("ba-reflexo", caixa), faixa = document.createElement("i"); br.append(faixa);
      const pronto = (im.decode ? im.decode() : Promise.resolve()).catch(() => {});
      L = { pronto, entrada() {
        caixa.animate([{ opacity: 0, transform: "scale(.72) rotate(-6deg)" }, { opacity: 1, offset: .45, transform: "scale(1.05) rotate(1deg)" }, { opacity: 1, transform: "none" }], { duration: 1100, easing: E.saida, fill: "both" });
        faixa.animate([{ transform: "translateX(-160%) skewX(-18deg)", opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .8 }, { transform: "translateX(320%) skewX(-18deg)", opacity: 0 }], { duration: 1000, delay: 750, easing: E.suave, fill: "both" });
        return 1800;
      } };
    } else {
      caixa.style.width = cfg.tipo === "lmb" ? "min(72vw, 360px, 46vh)" : "min(86vw, 520px)";
      L = logo(caixa, cfg.tipo, { entrada: true, auto: false, ciclo: false, toque: false });
    }
    const sub = document.createElement("p"); sub.className = "ba-sub"; sub.textContent = cfg.legenda || ""; fim.append(sub);
    const branco = div("ba-branco", ov);
    const pular = document.createElement("button"); pular.type = "button"; pular.className = "ba-pular"; pular.textContent = "Pular abertura"; ov.append(pular);

    let acabou = false, comecou = false, final = false, tFim = 0;
    function irFinal() {
      if (final || acabou) return; final = true;
      branco.style.opacity = "1"; fim.style.opacity = "1";
      // o clarão branco do fim do vídeo continua e se desfaz por cima do logo
      branco.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 750, easing: "cubic-bezier(.3,0,.2,1)", fill: "forwards" });
      requestAnimationFrame(() => { v.style.visibility = "hidden"; });
      const durLogo = L.entrada();
      sub.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 600, delay: Math.max(150, durLogo - 900), easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" });
      tFim = setTimeout(sair, durLogo + 2000);
    }
    // acompanha o vídeo quadro a quadro para emendar no clarão sem esperar o "ended"
    function vigia() {
      if (acabou || final) return;
      if (v.duration && v.currentTime >= v.duration - .06) { irFinal(); return; }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(vigia); else requestAnimationFrame(vigia);
    }
    v.addEventListener("ended", irFinal);
    v.addEventListener("playing", () => { if (comecou) return; comecou = true; ov.classList.add("rodando"); vigia(); });
    const falhou = () => {
      if (comecou || acabou) return;
      if (cfg.cores && cfg.placar) { acabou = true; ov.remove(); aberturaSVG(cfg); } else sair();
    };
    v.addEventListener("error", falhou);
    const p = v.play(); if (p && p.catch) p.catch(falhou);
    function sair() {
      if (acabou) return; acabou = true; clearTimeout(tFim); ov.style.pointerEvents = "none";
      window.dispatchEvent(new Event("abertura-fim"));
      ov.animate([{ opacity: getComputedStyle(ov).opacity }, { opacity: 0 }], { duration: 900, easing: "cubic-bezier(.45,0,.2,1)", fill: "forwards" }).onfinish = () => { v.removeAttribute("src"); v.load(); ov.remove(); };
      if (final) caixa.animate([{ transform: "none" }, { transform: "scale(.94)" }], { duration: 900, easing: "cubic-bezier(.45,0,.2,1)", fill: "forwards", composite: "add" });
      document.querySelectorAll(cfg.app || ".wrap").forEach(app => app.animate([{ opacity: 0, transform: "translateY(14px) scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 900, delay: 150, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" }));
    }
    ov.addEventListener("click", sair);
    // internet lenta: se o vídeo não começar em 3,5 s, o app abre direto
    setTimeout(() => { if (!comecou) sair(); }, 3500);
    return { sair };
  }

  function aberturaSVG(cfg) {
    const C = cfg.cores;
    const ov = document.createElement("div"); ov.className = "ba-ab"; ov.id = "abertura";
    ov.setAttribute("role", "img"); ov.setAttribute("aria-label", cfg.rotulo || "Abertura do app: atacante corta e marca o ponto na piscina de biribol");
    document.body.prepend(ov);
    ov.style.background = C.fundo[0];

    // ================= cena (SVG 400 x 720) =================
    const svg = elx("svg", { class: "ba-cena", viewBox: "0 0 400 720", "aria-hidden": "true" }, ov);
    svg.style.opacity = "0";
    const ajusta = () => svg.setAttribute("preserveAspectRatio", innerWidth / innerHeight < .62 ? "xMidYMid slice" : "xMidYMid meet");
    ajusta(); addEventListener("resize", ajusta);
    const defs = elx("defs", {}, svg);
    let nId = 0; const uid = p => "ba" + p + (++nId);
    const lin = (stops, at) => { const id = uid("g"); const g = elx("linearGradient", Object.assign({ id }, at || { x1: 0, y1: 0, x2: 0, y2: 1 }), defs); stops.forEach(([o, c, op]) => elx("stop", { offset: o, "stop-color": c, "stop-opacity": op == null ? 1 : op }, g)); return "url(#" + id + ")"; };
    const rad = (stops, at) => { const id = uid("r"); const g = elx("radialGradient", Object.assign({ id }, at || {}), defs); stops.forEach(([o, c, op]) => elx("stop", { offset: o, "stop-color": c, "stop-opacity": op == null ? 1 : op }, g)); return "url(#" + id + ")"; };
    const tom = (hex, k) => { const n = parseInt(hex.slice(1), 16); return "#" + [n >> 16, (n >> 8) & 255, n & 255].map(v => clamp(Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k), 0, 255).toString(16).padStart(2, "0")).join(""); };
    // ondulação da água (refração dos corpos submersos e do reflexo)
    const fl = elx("filter", { id: "ba-onda", x: "-10%", y: "-10%", width: "120%", height: "130%" }, defs);
    elx("feTurbulence", { type: "fractalNoise", baseFrequency: "0.012 0.09", numOctaves: 2, seed: 4, result: "n", stitchTiles: "stitch" }, fl);
    const flOff = elx("feOffset", { in: "n", dx: 0, dy: 0, result: "m" }, fl);
    elx("feDisplacementMap", { in: "SourceGraphic", in2: "m", scale: 7, xChannelSelector: "R", yChannelSelector: "G" }, fl);
    const cpCima = uid("c"), cpBaixo = uid("c");
    elx("rect", { x: -400, y: -2000, width: 800, height: 2470 }, elx("clipPath", { id: cpCima, clipPathUnits: "userSpaceOnUse" }, defs));
    elx("rect", { x: -400, y: 470, width: 800, height: 1000 }, elx("clipPath", { id: cpBaixo, clipPathUnits: "userSpaceOnUse" }, defs));

    const cam = elx("g", {}, svg);
    // ---- ginásio: teto com treliças, janelas com luz do dia, refletores ----
    elx("rect", { x: -220, y: -120, width: 840, height: 980, fill: lin([[0, C.fundo[0]], [.45, C.fundo[1]], [1, C.fundo[0]]]) }, cam);
    const teto = elx("g", { stroke: tom(C.fundo[1], 1.35), "stroke-width": 1.3, opacity: .55 }, cam);
    for (let i = -4; i < 14; i++) { elx("line", { x1: i * 40 - 20, y1: 0, x2: i * 40 + 20, y2: 46 }, teto); elx("line", { x1: i * 40 + 20, y1: 0, x2: i * 40 - 20, y2: 46 }, teto); }
    elx("line", { x1: -220, y1: 0, x2: 620, y2: 0, "stroke-width": 3 }, teto); elx("line", { x1: -220, y1: 46, x2: 620, y2: 46, "stroke-width": 3 }, teto);
    const janelas = elx("g", {}, cam);
    for (let i = -3; i < 10; i++) {
      const x = i * 62 + 6;
      elx("rect", { x, y: 64, width: 54, height: 120, fill: lin([[0, "#dff3ff"], [.6, "#a9d3ee"], [1, "#7fb4d8"]]), opacity: .55 }, janelas);
      elx("path", { d: `M${x + 27} 64V184M${x} 104H${x + 54}M${x} 144H${x + 54}`, stroke: C.fundo[0], "stroke-width": 2.2, opacity: .7 }, janelas);
    }
    elx("rect", { x: -220, y: 184, width: 840, height: 8, fill: "#000", opacity: .35 }, cam);
    // feixes de luz das janelas sobre a quadra
    for (let i = 0; i < 6; i++) { const x = -40 + i * 90; elx("polygon", { points: `${x},184 ${x + 54},184 ${x + 150},470 ${x + 70},470`, fill: lin([[0, "#fff", .16], [1, "#fff", 0]]) }, cam); }
    // placar eletrônico do ginásio
    const pg = elx("g", { transform: "translate(200 212)" }, cam);
    elx("rect", { x: -46, y: -15, width: 92, height: 30, rx: 3, fill: "#0b0b0d", stroke: "#3a3a3f", "stroke-width": 2 }, pg);
    const pgTxt = elx("text", { x: 0, y: 6, "text-anchor": "middle", "font-family": "'Courier New',monospace", "font-weight": 700, "font-size": 15, fill: "#ffb020", "letter-spacing": 1 }, pg);
    // arquibancada com torcida
    const arq = elx("g", {}, cam);
    const torcida = [];
    let sd = 11; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
    const coresTorcida = [C.casa.touca, C.fora.sunga, "#e8e8e8", "#3b3b40", "#6b4b3a", C.destaque, "#2c5f8a", "#8a2c2c", "#d8c8a8"];
    for (let r = 0; r < 6; r++) {
      const y = 246 + r * 26;
      elx("rect", { x: -220, y: y + 12, width: 840, height: 14, fill: tom(C.fundo[1], .7 + r * .05) }, arq);
      elx("rect", { x: -220, y: y + 12, width: 840, height: 2, fill: "#fff", opacity: .08 }, arq);
      const fila = elx("g", {}, arq); torcida.push(fila);
      for (let x = -210 + rnd() * 8; x < 610; x += 9 + rnd() * 6) {
        if (rnd() < .12) continue;
        const c = coresTorcida[Math.floor(rnd() * coresTorcida.length)], pele = ["#e0ac69", "#c68642", "#8d5524", "#f1c27d", "#5c3a21"][Math.floor(rnd() * 5)];
        elx("path", { d: `M${x - 4.5} ${y + 13} Q${x} ${y + 3} ${x + 4.5} ${y + 13} Z`, fill: c, opacity: .9 }, fila);
        elx("circle", { cx: x, cy: y + 1, r: 3, fill: pele, opacity: .9 }, fila);
      }
    }
    // faixa da equipe na mureta e névoa de profundidade
    const faixaY = 404;
    C.faixa.forEach((c, i) => elx("rect", { x: -220, y: faixaY + i * 8, width: 840, height: 8, fill: c }, cam));
    const txt = elx("text", { x: 200, y: faixaY + 15.6, "text-anchor": "middle", "font-family": "Anton,Impact,sans-serif", "font-size": 9.5, fill: C.faixaTexto || "#fff", "letter-spacing": 3 }, cam);
    txt.textContent = (cfg.faixaTexto + "   •   ").repeat(4);
    elx("rect", { x: -220, y: 40, width: 840, height: 400, fill: lin([[0, "#cfe6f5", .0], [.6, "#cfe6f5", .1], [1, "#cfe6f5", .16]]) }, cam);
    // ---- piscina: deck do fundo, borda, água em perspectiva ----
    const WY = 470, BORDA_F = 452, BORDA_P = 676;
    elx("rect", { x: -220, y: 428, width: 840, height: 24, fill: lin([[0, tom(C.azulejo[1], .8)], [1, C.azulejo[0]]]) }, cam);
    const deckF = elx("g", { stroke: tom(C.azulejo[1], .85), "stroke-width": .6, opacity: .7 }, cam);
    for (let x = -220; x < 620; x += 14) elx("line", { x1: x, y1: 428, x2: x + (x - 200) * .06, y2: 452 }, deckF);
    elx("rect", { x: -220, y: 449, width: 840, height: 5, rx: 2, fill: "#f4f7f9" }, cam);
    elx("rect", { x: -220, y: 454, width: 840, height: 3, fill: "#000", opacity: .25 }, cam);
    const agua = elx("rect", { x: -220, y: 456, width: 840, height: 240, fill: lin([[0, C.agua[0]], [.12, C.agua[1]], [.7, C.agua[2]], [1, tom(C.agua[2], .7)]]) }, cam);
    // reflexo das janelas na água do fundo
    elx("rect", { x: -220, y: 456, width: 840, height: 22, fill: lin([[0, "#fff", .45], [1, "#fff", 0]]) }, cam);

    // ---- rede (vista em perspectiva: poste do fundo pequeno, poste da frente grande) ----
    const P_F = { x: 208, top: 330, base: 454 }, P_N = { x: 244, top: 300, base: 690 };
    const redeTras = elx("g", {}, cam);
    elx("rect", { x: P_F.x - 2, y: P_F.top, width: 4, height: P_F.base - P_F.top, fill: lin([[0, "#9aa4ae"], [.5, "#eef2f5"], [1, "#8a949e"]], { x1: 0, y1: 0, x2: 1, y2: 0 }) }, redeTras);

    // ---- atletas (4 x 4), corpos em <defs> e desenhados por <use> em 3 camadas ----
    const camReflexo = elx("g", { filter: "url(#ba-onda)", opacity: .2 }, cam);
    const camSub = elx("g", { filter: "url(#ba-onda)", opacity: .32 }, cam);
    const superficie = elx("g", {}, cam);
    const camCima = elx("g", {}, cam);
    const camEspuma = elx("g", {}, cam);

    function grad(pele) {
      return {
        lado: lin([[0, tom(pele, .62)], [.3, pele], [.55, tom(pele, 1.18)], [.78, pele], [1, tom(pele, .68)]], { x1: 0, y1: 0, x2: 1, y2: 0 }),
        tras: lin([[0, tom(pele, .5)], [.45, tom(pele, .78)], [1, tom(pele, .55)]], { x1: 0, y1: 0, x2: 1, y2: 0 }),
        tronco: lin([[0, tom(pele, .58)], [.35, tom(pele, .9)], [.7, tom(pele, 1.12)], [1, tom(pele, .85)]], { x1: 0, y1: 0, x2: 1, y2: 0 }),
        rosto: lin([[0, tom(pele, .8)], [1, tom(pele, 1.1)]], { x1: 0, y1: 0, x2: 1, y2: 0 }),
      };
    }
    // segmento de membro (afunilado, com "músculo")
    const seg = (L, w0, w1, b) => `M${-w0 / 2} 0 C${-w0 / 2 - b} ${L * .32} ${-w1 / 2 - b * .3} ${L * .7} ${-w1 / 2} ${L} A${w1 / 2} ${w1 / 2} 0 0 0 ${w1 / 2} ${L} C${w1 / 2 + b * .2} ${L * .7} ${w0 / 2 + b * .6} ${L * .3} ${w0 / 2} 0 A${w0 / 2} ${w0 / 2 * .7} 0 0 0 ${-w0 / 2} 0 Z`;
    const MAO = "M-3.6 -1 C-6 4 -5.6 9 -2.4 12.5 C-.6 14 2.4 14 3.8 12 C5.8 9 5.6 4 3.8 -1 Z M3.6 2 C6.8 2.6 8 5 7.2 7 C6.4 8 5 7.2 4.4 6 Z";
    function braco(pai, G, frente) {
      const g1 = elx("g", {}, pai);
      elx("path", { d: seg(30, 10.5, 8, 2.4), fill: frente ? G.lado : G.tras }, g1);
      if (frente) elx("path", { d: "M-2 4 C-1 12 -1 20 -2 26", stroke: "#fff", "stroke-opacity": .28, "stroke-width": 1.4, fill: "none", "stroke-linecap": "round" }, g1);
      const g2 = elx("g", {}, g1);
      elx("path", { d: seg(28, 8, 5.6, 1.6), fill: frente ? G.lado : G.tras }, g2);
      const g3 = elx("g", {}, g2);
      elx("path", { d: MAO, fill: frente ? G.lado : G.tras }, g3);
      return { set(x, y, a, b, c) { g1.setAttribute("transform", `translate(${x} ${y}) rotate(${a})`); g2.setAttribute("transform", `translate(0 29) rotate(${b})`); g3.setAttribute("transform", `translate(0 27.5) rotate(${c || 0})`); } };
    }
    function perna(pai, G, frente) {
      const g1 = elx("g", {}, pai);
      elx("path", { d: seg(44, 15, 10, 2.6), fill: frente ? G.lado : G.tras }, g1);
      const g2 = elx("g", {}, g1);
      elx("path", { d: seg(42, 10.5, 6.5, 2.4), fill: frente ? G.lado : G.tras }, g2);
      elx("path", { d: "M-3.5 40 C-2 44 6 45 13 44 C14 42 12 40 4 38 Z", fill: frente ? G.lado : G.tras }, g2);
      return { set(x, y, a, b) { g1.setAttribute("transform", `translate(${x} ${y}) rotate(${a})`); g2.setAttribute("transform", `translate(0 43) rotate(${b})`); } };
    }
    let nAtl = 0;
    const claro = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * .299 + ((n >> 8) & 255) * .587 + (n & 255) * .114) > 170; };
    function atleta(x, yAgua, s, f, time, pele, num) {
      const id = uid("a"), G = grad(pele);
      const corpo = elx("g", { id }, defs);
      const pT = perna(corpo, G, false), bT = braco(corpo, G, false), pF = perna(corpo, G, true);
      // tronco de perfil (peito à direita), sombra das costas, abdômen
      elx("path", { d: "M7 433 C10 440 18 446 19.5 456 C20.5 466 15.5 472 14 481 C13 493 13 507 12 521 L-13 521 C-12 508 -11 496 -12 486 C-14 472 -20.5 458 -16.5 446 C-13.5 440 -9 436 -7 432 Z", fill: G.tronco }, corpo);
      elx("path", { d: "M-16.5 446 C-20.5 458 -14 472 -12 486 C-11 496 -12 508 -13 521 L-7 521 C-7 504 -7 490 -9 478 C-12 466 -14 456 -11 446 Z", fill: "#000", opacity: .18 }, corpo);
      elx("path", { d: "M9 452 C14 456 16 463 13 469 M10 478 C11 486 11 494 10 502", stroke: tom(pele, .6), "stroke-width": 1, fill: "none", opacity: .55 }, corpo);
      elx("path", { d: "M12 446 C17 450 19 456 19 462", stroke: "#fff", "stroke-opacity": .3, "stroke-width": 1.4, fill: "none", "stroke-linecap": "round" }, corpo);
      // sunga
      elx("path", { d: "M12.6 505 L13.8 528 C6 532.5 -6 532.5 -14.4 527 L-12.8 505 Z", fill: lin([[0, tom(time.sunga, .7)], [.6, time.sunga], [1, tom(time.sunga, .8)]], { x1: 0, y1: 0, x2: 1, y2: 0 }) }, corpo);
      elx("rect", { x: -12.8, y: 505, width: 25.4, height: 2.6, fill: time.detalhe, opacity: .9 }, corpo);
      // pescoço, cabeça de perfil, orelha, olho, touca com número
      elx("path", { d: "M-6.5 426 L7 427 L7.5 437 L-7.5 437 Z", fill: G.tras }, corpo);
      elx("path", { d: "M-9 418 C-10 407 -2 400 6 401 C12 402 15 407 14.5 412 L17 418.5 L14.4 419.6 L14.8 422 L13.4 423 L13.8 425.5 C12.5 429 9 430.5 5 430 L1 429 C-4 429 -8.5 424 -9 418 Z", fill: G.rosto }, corpo);
      elx("path", { d: "M8 412.5 L12.6 412", stroke: tom(pele, .4), "stroke-width": 1.1, "stroke-linecap": "round" }, corpo);
      elx("ellipse", { cx: 10.4, cy: 415, rx: 1.3, ry: .9, fill: "#1b1b1b" }, corpo);
      elx("path", { d: "M10.5 425.6 L13.2 425", stroke: tom(pele, .45), "stroke-width": .9, "stroke-linecap": "round" }, corpo);
      elx("ellipse", { cx: -1, cy: 418, rx: 2.4, ry: 3.6, fill: tom(pele, .75) }, corpo);
      elx("path", { d: "M-9.6 420 C-11 407 -3 399.5 5.5 400.5 C11.5 401.5 14.6 405.5 14 410.5 C9 409 3 409.4 -1 411 C-3 414 -3.5 420 -2 425 C-5 426 -8 424.5 -9.6 420 Z", fill: lin([[0, tom(time.touca, 1.25)], [.5, time.touca], [1, tom(time.touca, .7)]]) }, corpo);
      elx("path", { d: "M-6 405 C-2 401.6 4 401 8 402.4", stroke: "#fff", "stroke-opacity": .55, "stroke-width": 1.6, fill: "none", "stroke-linecap": "round" }, corpo);
      const tn = elx("text", { x: -5.4, y: 418.5, "text-anchor": "middle", "font-family": "Arial,sans-serif", "font-weight": 700, "font-size": 6.5, fill: time.numero || (claro(time.touca) ? "#1b1b1b" : "#fff") }, corpo); tn.textContent = num;
      const bF = braco(corpo, G, true);
      // rastro do braço de ataque (borrão de movimento)
      const fant = [braco(corpo, G, true), braco(corpo, G, true)];
      const fantG = [corpo.lastChild.previousSibling, corpo.lastChild]; fantG[0].setAttribute("opacity", 0); fantG[1].setAttribute("opacity", 0);
      // instâncias
      const T = `translate(${x} ${yAgua}) scale(${f * s} ${s}) translate(0 -470)`;
      const usar = (pai, extra, clip) => elx("use", { href: "#" + id, transform: T + (extra || ""), "clip-path": `url(#${clip})` }, pai);
      usar(camReflexo, " translate(0 940) scale(1 -1)", cpCima);
      usar(camSub, "", cpBaixo);
      usar(camCima, "", cpCima);
      // espuma na linha d'água em volta do corpo
      const esp = elx("ellipse", { cx: x, cy: yAgua + 1, rx: 20 * s, ry: 3.2 * s, fill: "none", stroke: "#fff", "stroke-width": 1.4, opacity: .55 }, camEspuma);
      const st = { dy: 0, lean: 0, f1: 8, f2: -8, f3: 0, t1: -6, t2: -10, h1: 6, k1: 8, h2: -4, k2: 10, cab: 0, fx: [0, 0] };
      const hist = [];
      const idx = nAtl++;
      return {
        st, x, yAgua, s, f,
        aplicar(t) {
          const bob = Math.sin(t * 2.2 + idx * 1.7) * 1.2 * (st.dy > -4 && st.dy < 6 ? 1 : 0);
          corpo.setAttribute("transform", `translate(0 ${(st.dy + bob).toFixed(2)}) rotate(${st.lean.toFixed(2)} 0 520)`);
          bT.set(-3, 446, st.t1, st.t2, 0); bF.set(3, 447, st.f1, st.f2, st.f3);
          pT.set(-4, 520, st.h2, st.k2); pF.set(4, 520, st.h1, st.k1);
          hist.push([st.f1, st.f2]); if (hist.length > 6) hist.shift();
          const v = Math.abs(hist[hist.length - 1][0] - hist[0][0]);
          [[2, .26], [4, .13]].forEach(([k, op], i) => { const h = hist[Math.max(0, hist.length - 1 - k)]; fant[i].set(3, 447, h[0], h[1], 0); fantG[i].setAttribute("opacity", v > 40 ? op : 0); });
          const sub = clamp(1 - (-st.dy - 30) / 40, 0, 1);
          esp.setAttribute("rx", (20 * s * (.7 + .3 * sub) + Math.sin(t * 3 + idx) * 1.2).toFixed(1)); esp.setAttribute("opacity", (.55 * sub).toFixed(2));
        },
      };
    }
    // fundo -> frente (ordem de desenho): 2 de cada lado mais longe, depois os principais
    const atletas = [
      atleta(46, 462, .74, 1, C.casa, "#d9a273", 3), atleta(352, 462, .74, -1, C.fora, "#8d5524", 5),
      atleta(110, 466, .84, 1, C.casa, "#f1c27d", 8), atleta(300, 466, .84, -1, C.fora, "#e0ac69", 2),
    ];
    const levant = atleta(78, 476, .95, 1, C.casa, "#8d5a3b", 10);
    const fundoDef = atleta(338, 480, 1.0, -1, C.fora, "#c68642", 7);
    const bloq = atleta(256, 474, .93, -1, C.fora, "#b97a4f", 4);
    const atac = atleta(162, 478, 1.04, 1, C.casa, "#a8693f", 9);

    // poste e rede da frente (por cima dos atletas)
    const redeF = elx("g", {}, cam);
    const malha = elx("g", { stroke: "#fff", "stroke-opacity": .6, "stroke-width": .7 }, redeF);
    // faixa da rede: do poste do fundo (topo 334..364) ao da frente (topo 306..352)
    const topoF = [P_F.x, 334], baseF = [P_F.x, 362], topoN = [P_N.x, 308], baseN = [P_N.x, 354];
    for (let i = 0; i <= 14; i++) { const u = i / 14, w = Math.pow(u, 1.15); elx("line", { x1: lerp(topoF[0], topoN[0], w), y1: lerp(topoF[1], topoN[1], w), x2: lerp(baseF[0], baseN[0], w), y2: lerp(baseF[1], baseN[1], w) }, malha); }
    for (let i = 1; i < 6; i++) { const u = i / 6; elx("line", { x1: P_F.x, y1: lerp(topoF[1], baseF[1], u), x2: P_N.x, y2: lerp(topoN[1], baseN[1], u) }, malha); }
    elx("line", { x1: topoF[0], y1: topoF[1], x2: topoN[0], y2: topoN[1], stroke: "#fff", "stroke-width": 3.2, "stroke-linecap": "round" }, redeF);
    elx("line", { x1: baseF[0], y1: baseF[1], x2: baseN[0], y2: baseN[1], stroke: "#fff", "stroke-width": 1.6, "stroke-linecap": "round", opacity: .85 }, redeF);
    elx("line", { x1: P_F.x + 3, y1: 318, x2: P_F.x + 3, y2: 336, stroke: C.destaque, "stroke-width": 1.8 }, redeF);
    elx("rect", { x: P_N.x - 2.5, y: P_N.top, width: 5, height: P_N.base - P_N.top, rx: 3, fill: lin([[0, "#8f99a3"], [.45, "#f4f7f9"], [1, "#7d8791"]], { x1: 0, y1: 0, x2: 1, y2: 0 }) }, redeF);
    elx("rect", { x: P_N.x - 5, y: P_N.top - 4, width: 10, height: 6, rx: 2, fill: "#5b6570" }, redeF);

    // superfície: ondulações em perspectiva e brilhos
    const linhasAgua = []; for (let i = 0; i < 16; i++) linhasAgua.push(elx("path", { fill: "none", stroke: "#fff", "stroke-linecap": "round" }, superficie));
    const brilhos = []; for (let i = 0; i < 26; i++) brilhos.push(elx("ellipse", { rx: 2.5, ry: .6, fill: "#fff", opacity: 0 }, superficie));
    // borda da frente da piscina (canaleta + deck)
    const frente = elx("g", {}, cam);
    elx("rect", { x: -220, y: BORDA_P, width: 840, height: 7, rx: 3, fill: "#f2f5f7" }, frente);
    elx("rect", { x: -220, y: BORDA_P + 7, width: 840, height: 7, fill: "#2b3036" }, frente);
    const grade = elx("g", { stroke: "#5c636b", "stroke-width": 1.2 }, frente);
    for (let x = -220; x < 620; x += 5) elx("line", { x1: x, y1: BORDA_P + 8, x2: x, y2: BORDA_P + 13 }, grade);
    elx("rect", { x: -220, y: BORDA_P + 14, width: 840, height: 60, fill: lin([[0, C.azulejo[0]], [1, tom(C.azulejo[1], .8)]]) }, frente);
    const deckP = elx("g", { stroke: tom(C.azulejo[1], .8), "stroke-width": .8, opacity: .8 }, frente);
    for (let x = -220; x < 620; x += 22) elx("line", { x1: x, y1: BORDA_P + 14, x2: x + (x - 200) * .25, y2: BORDA_P + 74 }, deckP);
    for (let i = 0; i < 4; i++) elx("line", { x1: -220, y1: BORDA_P + 22 + i * 15, x2: 620, y2: BORDA_P + 22 + i * 15 }, deckP);

    // ---- bola (esfera com gomos girando e sombreamento fixo) ----
    const rastro = elx("g", { "stroke-linecap": "round" }, cam);
    const segsR = []; for (let i = 0; i < 10; i++) segsR.push(elx("line", { stroke: "#fff" }, rastro));
    const bola = elx("g", {}, cam);
    const cpB = uid("c"); elx("circle", { r: 8.6 }, elx("clipPath", { id: cpB }, defs));
    elx("circle", { r: 8.6, fill: C.bola[0] }, bola);
    const gomos = elx("g", { "clip-path": `url(#${cpB})` }, bola);
    const gomosR = elx("g", {}, gomos);
    elx("path", { d: "M-12 -4 C-5 -9 4 -9 12 -5 L12 -1 C4 -5 -5 -5 -12 0 Z", fill: C.bola[1] }, gomosR);
    elx("path", { d: "M-12 5 C-4 1 5 2 12 5 L12 9 C5 6 -4 5 -12 9 Z", fill: C.bola[2] }, gomosR);
    elx("path", { d: "M-2 -12 C-6 -4 -6 4 -2 12", stroke: tom(C.bola[1], .7), "stroke-width": 1, fill: "none" }, gomosR);
    elx("circle", { r: 8.6, fill: rad([[0, "#fff", .0], [.55, "#000", 0], [1, "#000", .45]], { cx: .38, cy: .34, r: .75 }) }, bola);
    elx("ellipse", { cx: -3, cy: -3.6, rx: 3, ry: 2, fill: "#fff", opacity: .7 }, bola);
    const sombraBola = elx("ellipse", { rx: 7, ry: 1.8, fill: "#000", opacity: 0 }, cam);
    // estouro de luz no contato
    const estrela = elx("g", { opacity: 0 }, cam);
    elx("circle", { r: 26, fill: rad([[0, "#fff", .95], [.35, "#fff8dc", .55], [1, "#fff", 0]]) }, estrela);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, r1 = i % 2 ? 14 : 30; elx("line", { x1: Math.cos(a) * 7, y1: Math.sin(a) * 7, x2: Math.cos(a) * r1, y2: Math.sin(a) * r1, stroke: "#fff", "stroke-width": 1.6, "stroke-linecap": "round" }, estrela); }
    // respingos realistas: gotas com rastro, coroa de espuma, névoa e anéis em perspectiva
    const respingos = elx("g", {}, cam);
    function criaRespingo(x, y, n, forca, seed, escala) {
      let s0 = seed; const r = () => (s0 = (s0 * 9301 + 49297) % 233280) / 233280;
      const k = escala || 1;
      const gotas = []; for (let i = 0; i < n; i++) {
        const ang = -Math.PI / 2 + (r() - .5) * 2.4, v = forca * (.4 + r() * .8);
        gotas.push({ el: elx("line", { stroke: "#f2fbff", "stroke-linecap": "round", "stroke-width": (1 + r() * 2.4) * k, opacity: 0 }, respingos), vx: Math.cos(ang) * v, vy: Math.sin(ang) * v * (.8 + r() * .5) });
      }
      const nevoa = elx("ellipse", { cx: x, cy: y - 6, fill: rad([[0, "#fff", .7], [1, "#fff", 0]]), opacity: 0 }, respingos);
      const coroa = elx("path", { fill: lin([[0, "#fff", .95], [1, "#bfe6fa", .7]]), opacity: 0 }, respingos);
      const aneis = [0, 1, 2, 3].map(() => elx("ellipse", { cx: x, cy: y + 1, fill: "none", stroke: "#fff", "stroke-width": 1.2, opacity: 0 }, respingos));
      const espuma = elx("ellipse", { cx: x, cy: y + 1, fill: "#fff", opacity: 0 }, respingos);
      return {
        at(dt) {
          const vivo = dt >= 0 && dt <= 1.8;
          gotas.forEach(g => {
            if (!vivo) { g.el.setAttribute("opacity", 0); return; }
            const px = x + g.vx * dt, py = y + g.vy * dt + 560 * dt * dt, qx = x + g.vx * (dt - .03), qy = y + g.vy * (dt - .03) + 560 * (dt - .03) * (dt - .03);
            g.el.setAttribute("x1", px.toFixed(1)); g.el.setAttribute("y1", Math.min(py, y + 3).toFixed(1)); g.el.setAttribute("x2", qx.toFixed(1)); g.el.setAttribute("y2", Math.min(qy, y + 3).toFixed(1));
            g.el.setAttribute("opacity", py > y + 2 ? 0 : clamp(1.05 - dt / 1.1, 0, .95).toFixed(2));
          });
          const h = forca * .26 * k * Math.sin(clamp(dt / .6, 0, 1) * Math.PI), w = forca * .15 * k * (.6 + EZ.out(clamp(dt / .55, 0, 1)) * .7);
          if (vivo && h > .6) {
            let d = `M${x - w} ${y}`; const n2 = 9;
            for (let i = 0; i <= n2; i++) { const u = i / n2, xx = x - w + 2 * w * u; const alt = i % 2 ? h * (.6 + .4 * Math.sin(i * 1.7 + 1)) : h * .3 * Math.sin(u * Math.PI); d += ` Q${(xx - w / n2).toFixed(1)} ${(y - alt * .6).toFixed(1)} ${xx.toFixed(1)} ${(y - alt).toFixed(1)}`; }
            d += ` L${x + w} ${y} Z`; coroa.setAttribute("d", d); coroa.setAttribute("opacity", .9);
          } else coroa.setAttribute("opacity", 0);
          const nv = clamp(dt / 1.2, 0, 1);
          nevoa.setAttribute("rx", (forca * .25 * k * (.5 + nv)).toFixed(1)); nevoa.setAttribute("ry", (forca * .16 * k * (.5 + nv)).toFixed(1));
          nevoa.setAttribute("opacity", vivo ? (.55 * Math.sin(nv * Math.PI)).toFixed(2) : 0);
          aneis.forEach((a, i) => { const u = clamp((dt - i * .14) / 1.4, 0, 1); a.setAttribute("rx", (5 + u * forca * .6 * k).toFixed(1)); a.setAttribute("ry", (1.5 + u * forca * .05 * k).toFixed(1)); a.setAttribute("opacity", u > 0 && u < 1 ? (.75 * (1 - u)).toFixed(2) : 0); });
          const ue = clamp(dt / 1.6, 0, 1); espuma.setAttribute("rx", (forca * .12 * k * (.4 + ue)).toFixed(1)); espuma.setAttribute("ry", (forca * .02 * k * (.4 + ue)).toFixed(1)); espuma.setAttribute("opacity", vivo ? (.6 * (1 - ue)).toFixed(2) : 0);
        },
      };
    }

    // ================= placar de TV, PONTO!, vinheta =================
    elx("rect", { x: -220, y: -120, width: 840, height: 980, fill: rad([[0, "#000", 0], [.62, "#000", 0], [1, "#000", .55]], { cx: .5, cy: .5, r: .75 }), "pointer-events": "none" }, svg);
    const hud = elx("g", { opacity: 0 }, svg);
    elx("rect", { x: 36, y: 62, width: 328, height: 40, rx: 6, fill: lin([[0, "#1d1f24"], [1, "#0b0c0f"]]), opacity: .88 }, hud);
    elx("rect", { x: 36, y: 62, width: 328, height: 1.5, fill: "#fff", opacity: .25 }, hud);
    elx("rect", { x: 36, y: 62, width: 6, height: 40, rx: 2, fill: C.casa.touca }, hud);
    elx("rect", { x: 358, y: 62, width: 6, height: 40, rx: 2, fill: C.fora.touca }, hud);
    const fonte = "Anton,Impact,sans-serif";
    elx("text", { x: 52, y: 88, "font-family": fonte, "font-size": 15, fill: "#fff", "letter-spacing": .5 }, hud).textContent = cfg.placar.a;
    elx("text", { x: 348, y: 88, "text-anchor": "end", "font-family": fonte, "font-size": 15, fill: "#fff", "letter-spacing": .5 }, hud).textContent = cfg.placar.b;
    elx("text", { x: 214, y: 90, "font-family": fonte, "font-size": 22, fill: "#fff" }, hud).textContent = cfg.placar.sb;
    elx("text", { x: 200, y: 89, "text-anchor": "middle", "font-family": fonte, "font-size": 16, fill: "#fff", opacity: .6 }, hud).textContent = "×";
    const sA0 = elx("text", { x: 186, y: 90, "text-anchor": "end", "font-family": fonte, "font-size": 22, fill: "#fff" }, hud); sA0.textContent = cfg.placar.sa;
    const sA1 = elx("text", { x: 186, y: 90, "text-anchor": "end", "font-family": fonte, "font-size": 22, fill: C.destaque, opacity: 0 }, hud); sA1.textContent = cfg.placar.sa + 1;
    const tSet = elx("text", { x: 200, y: 116, "text-anchor": "middle", "font-family": "system-ui,sans-serif", "font-size": 9, "font-weight": 700, fill: "#fff", opacity: .75, "letter-spacing": 2 }, hud); tSet.textContent = cfg.placar.set;
    const aoVivo = elx("g", { transform: "translate(318 118)" }, hud);
    elx("rect", { x: -16, y: -8, width: 46, height: 13, rx: 2, fill: "#d0021b" }, aoVivo);
    const piscaVivo = elx("circle", { cx: -10, cy: -1.5, r: 2.4, fill: "#fff" }, aoVivo);
    elx("text", { x: 9, y: 2, "text-anchor": "middle", "font-family": "system-ui,sans-serif", "font-size": 7.5, "font-weight": 800, fill: "#fff" }, aoVivo).textContent = "AO VIVO";
    const ponto = elx("g", { opacity: 0 }, svg);
    const linhasVel = elx("g", { stroke: C.destaque, "stroke-width": 3, "stroke-linecap": "round", opacity: .8 }, ponto);
    for (let i = 0; i < 8; i++) elx("line", { x1: 60 - i * 6, y1: 168 + i * 9, x2: 120 - i * 4, y2: 168 + i * 9 }, linhasVel);
    const pTxt = elx("text", { x: 200, y: 214, "text-anchor": "middle", "font-family": fonte, "font-size": 64, fill: "#fff", stroke: C.destaque, "stroke-width": 3, "paint-order": "stroke", transform: "skewX(-10)", "letter-spacing": 1 }, ponto);
    pTxt.textContent = cfg.ponto || "PONTO!";
    const flash = elx("rect", { x: -220, y: -120, width: 840, height: 980, fill: "#fff", opacity: 0, "pointer-events": "none" }, svg);
    // onda de transição
    const onda = elx("path", { fill: C.onda[0] }, svg), onda2 = elx("path", { fill: C.onda[1] }, svg);

    // ================= final: logo animado + legenda =================
    const fim = div("ba-final", ov);
    fim.style.background = `radial-gradient(70% 50% at 50% 45%, ${C.finalCor}, ${C.fundo[0]} 75%)`;
    const caixa = div("", fim); caixa.style.width = cfg.tipo === "lmb" ? "min(72vw, 360px, 46vh)" : "min(86vw, 520px)";
    const L = logo(caixa, cfg.tipo, { entrada: true, auto: false, ciclo: false, toque: false });
    const sub = document.createElement("p"); sub.className = "ba-sub"; sub.textContent = cfg.legenda || ""; fim.append(sub);
    const pular = document.createElement("button"); pular.type = "button"; pular.className = "ba-pular"; pular.textContent = "Pular abertura"; ov.append(pular);

    // ================= coreografia (s) =================
    // contato: mão do atacante (x 162 + braço) a ~ (192, 300); bola cruza a rede e cai em (322, 478)
    const tc = 1.86, ti = 2.12, PC = [194, 296], PI = [324, 482];
    const bolaSet = t => { const u = clamp((t - .62) / (tc - .62), 0, 1); const p0 = [92, 384], p1 = [168, 120], p2 = PC; return [(1 - u) * (1 - u) * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0], (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1]]; };
    const bolaCorte = t => { const v = clamp((t - tc) / (ti - tc), 0, 1), u = EZ.in(v) * .5 + v * .5; return [lerp(PC[0], PI[0], u), lerp(PC[1], PI[1], u) - Math.sin(u * Math.PI) * 10]; };
    const A = {
      dy: trilha([[0, 0], [.95, 0, "io"], [1.15, 8, "out"], [1.55, -98, "outQ"], [1.9, -92, "in"], [2.42, 2, "out"], [2.6, 0, "io"], [2.95, -12, "io"], [3.3, 0]]),
      lean: trilha([[0, 0], [1.15, 7, "io"], [1.45, -4, "io"], [1.76, -14, "in"], [1.9, 13, "out"], [2.3, 6, "io"], [2.9, -4, "io"], [3.3, 0]]),
      f1: trilha([[0, 8], [.95, 8, "io"], [1.15, 48, "outQ"], [1.42, -178, "io"], [1.74, -214, "in"], [1.88, -150, "out"], [2.2, -42, "io"], [2.75, -10, "io"], [3.0, -176, "io"], [3.3, -168]]),
      f2: trilha([[0, -8], [1.42, -10, "io"], [1.74, -84, "in"], [1.86, -4, "out"], [2.2, 20, "io"], [2.75, 8, "io"], [3.0, -12]]),
      f3: trilha([[0, 0], [1.74, -20, "io"], [1.88, 25, "out"], [2.3, 10]]),
      t1: trilha([[0, -6], [.95, -6, "io"], [1.15, 42, "outQ"], [1.42, -162, "io"], [1.7, -142, "io"], [1.95, -18, "io"], [2.6, 10, "io"], [3.3, 6]]),
      t2: trilha([[0, -10], [1.42, -6, "io"], [1.95, -32, "io"], [2.6, -10]]),
      h1: trilha([[0, 6], [1.0, 10, "io"], [1.15, -18, "out"], [1.45, 16, "io"], [1.85, -24, "io"], [2.3, 2, "io"], [2.7, 6]]),
      k1: trilha([[0, 8], [1.0, 30, "io"], [1.15, 2, "out"], [1.45, 70, "io"], [1.85, 40, "io"], [2.3, 12, "io"], [2.7, 8]]),
      h2: trilha([[0, -4], [1.0, 2, "io"], [1.15, -10, "out"], [1.45, 28, "io"], [1.85, 6, "io"], [2.3, -4]]),
      k2: trilha([[0, 10], [1.0, 34, "io"], [1.15, 4, "out"], [1.45, 82, "io"], [1.85, 50, "io"], [2.3, 14, "io"], [2.7, 10]]),
    };
    const LV = {
      dy: trilha([[0, 0], [.35, 0, "io"], [.55, -16, "out"], [.85, 0]]),
      f1: trilha([[0, 10], [.2, 10, "io"], [.5, -170, "io"], [.75, -165, "io"], [1.3, 5]]), f2: trilha([[0, -10], [.5, -30, "io"], [.7, 0, "io"], [1.3, -8]]), f3: trilha([[0, 0], [.5, -40, "io"], [.75, 10, "io"], [1.3, 0]]),
      t1: trilha([[0, -4], [.2, -4, "io"], [.5, -168, "io"], [.75, -160, "io"], [1.3, 0]]), t2: trilha([[0, -10], [.5, -30, "io"], [.7, 0, "io"], [1.3, -8]]),
      lean: trilha([[0, 0], [.5, -6, "io"], [.8, 2, "io"], [1.2, 0]]),
      k1: trilha([[0, 8], [.35, 24, "io"], [.6, 4, "io"], [1, 8]]), k2: trilha([[0, 10], [.35, 26, "io"], [.6, 6, "io"], [1, 10]]),
    };
    const BQ = {
      dy: trilha([[0, 0], [1.88, 0, "io"], [2.0, 6, "out"], [2.3, -58, "outQ"], [2.45, -55, "in"], [2.8, 0]]),
      f1: trilha([[0, 6], [1.9, 6, "io"], [2.15, -176, "io"], [2.5, -170, "io"], [2.9, 8]]), f2: trilha([[0, -6], [2.1, -4], [2.9, -6]]), f3: trilha([[0, 0], [2.15, -10], [2.9, 0]]),
      t1: trilha([[0, -6], [1.9, -6, "io"], [2.15, -170, "io"], [2.5, -165, "io"], [2.9, -6]]), t2: trilha([[0, -6], [2.9, -6]]),
      h1: trilha([[0, 6], [2.0, 14, "io"], [2.3, -4, "io"], [2.8, 6]]), k1: trilha([[0, 8], [2.0, 40, "io"], [2.3, 30, "io"], [2.8, 8]]),
      h2: trilha([[0, -4], [2.0, 10, "io"], [2.3, 10, "io"], [2.8, -4]]), k2: trilha([[0, 10], [2.0, 44, "io"], [2.3, 36, "io"], [2.8, 10]]),
      lean: trilha([[0, 0], [2.3, -4, "io"], [2.8, 0]]),
    };
    const FD = {
      dy: trilha([[0, 0], [1.95, 0, "io"], [2.1, 5, "out"], [2.32, -6, "in"], [2.62, 48, "out"], [3.1, 40]]),
      lean: trilha([[0, 0], [1.95, 0, "io"], [2.15, 18, "io"], [2.45, 64, "in"], [2.7, 74, "out"], [3.1, 72]]),
      f1: trilha([[0, 6], [1.98, 6, "io"], [2.3, -105, "io"], [2.7, -122]]), f2: trilha([[0, -8], [2.3, -4]]), f3: trilha([[0, 0], [2.3, -10]]),
      t1: trilha([[0, -6], [1.98, -6, "io"], [2.3, -86, "io"], [2.7, -96]]), t2: trilha([[0, -8], [2.3, -6]]),
      h1: trilha([[0, 6], [2.2, -20, "io"], [2.6, -50]]), k1: trilha([[0, 8], [2.2, 20, "io"], [2.6, 10]]),
      h2: trilha([[0, -4], [2.2, 30, "io"], [2.6, 50]]), k2: trilha([[0, 10], [2.2, 30, "io"], [2.6, 40]]),
    };
    // os 4 do fundo: só balançam e reagem ao ponto (casa comemora, visitante lamenta)
    const reac = (casa) => ({
      f1: trilha(casa ? [[0, 8], [2.25, 8, "io"], [2.55, -172, "io"], [3.2, -166]] : [[0, -6], [2.3, -6, "io"], [2.7, -120, "io"], [3.2, -110]]),
      f2: trilha(casa ? [[0, -8], [2.55, -12]] : [[0, -8], [2.7, -120]]),
      dy: trilha(casa ? [[0, 0], [2.25, 0, "io"], [2.5, -18, "out"], [2.85, 0]] : [[0, 0], [3.2, 0]]),
    });
    const cena = [[atac, A], [levant, LV], [bloq, BQ], [fundoDef, FD], [atletas[0], reac(true)], [atletas[2], reac(true)], [atletas[1], reac(false)], [atletas[3], reac(false)]];
    const camS = trilha([[0, 1.12, "io"], [.95, 1.0, "io"], [1.65, 1.45, "io"], [1.95, 1.52, "out"], [2.3, 1.32, "io"], [2.9, 1.05, "io"], [3.3, 1.08]]);
    const camX = trilha([[0, 200, "io"], [.95, 196, "io"], [1.65, 190, "io"], [1.95, 206, "out"], [2.3, 276, "io"], [2.9, 215, "io"], [3.3, 210]]);
    const camY = trilha([[0, 440, "io"], [.95, 430, "io"], [1.65, 350, "io"], [1.95, 345, "out"], [2.3, 420, "io"], [2.9, 440, "io"], [3.3, 430]]);
    const spAtq = criaRespingo(166, 478, 22, 120, 7, 1), spEnt = criaRespingo(170, 478, 18, 100, 19, 1), spBola = criaRespingo(PI[0], PI[1], 46, 240, 3, 1), spDef = criaRespingo(352, 480, 26, 150, 11, 1);
    const T_ONDA = 3.25, T_REVELA = 3.8, T_LOGO = 3.95;
    let PARADO = 0, FIM = 0; const SEGURA = 2.0;
    pgTxt.textContent = cfg.placar.sa + "-" + cfg.placar.sb;

    function ondaPath(baseY, amp, fase) {
      let d = `M-220 ${baseY}`;
      for (let x = -220; x <= 620; x += 20) d += ` L${x} ${(baseY + Math.sin(x / 38 + fase) * amp + Math.sin(x / 17 - fase * 1.7) * amp * .35).toFixed(1)}`;
      return d;
    }
    const hist = [];
    let t0 = null, raf = 0, acabou = false, logoIniciado = false;
    function quadro(agora) {
      if (t0 == null) t0 = agora;
      const t = (agora - t0) / 1000;
      // água: refração andando, ondulações em perspectiva e brilhos
      flOff.setAttribute("dx", (t * 22 % 400).toFixed(1)); flOff.setAttribute("dy", (Math.sin(t * .8) * 6).toFixed(1));
      linhasAgua.forEach((p, i) => {
        const u = i / linhasAgua.length, y = 458 + Math.pow(u, 1.7) * 215, amp = .6 + u * 3.2, comp = 18 + u * 40;
        let d = ""; for (let x = -220; x <= 620; x += 16) d += (x === -220 ? "M" : " L") + x + " " + (y + Math.sin(x / comp + t * (1.4 + u) + i * 2.1) * amp).toFixed(1);
        p.setAttribute("d", d); p.setAttribute("stroke-width", (.5 + u * 1.6).toFixed(2)); p.setAttribute("stroke-opacity", (.1 + .14 * (1 - u)).toFixed(2));
      });
      brilhos.forEach((b, i) => {
        const u = ((i * .37) % 1), ph = t * 1.3 + i * 2.7, y = 462 + Math.pow(u, 1.6) * 205;
        b.setAttribute("cx", ((i * 53.3) % 600 - 100 + Math.sin(ph) * 6).toFixed(1)); b.setAttribute("cy", y.toFixed(1));
        b.setAttribute("rx", (1.5 + u * 5).toFixed(1)); b.setAttribute("opacity", Math.max(0, Math.sin(ph * 1.7)).toFixed(2) * .8);
      });
      // atletas
      for (const [ob, tr] of cena) { for (const k in tr) ob.st[k] = tr[k](t); ob.aplicar(t); }
      // torcida levanta no ponto
      torcida.forEach((fila, i) => { const u = clamp((t - 2.2 - i * .04) / .25, 0, 1) * clamp(1 - (t - 2.9) / .4, 0, 1); fila.setAttribute("transform", `translate(0 ${(-u * 3 + Math.sin(t * 9 + i) * u).toFixed(2)})`); });
      // bola
      let bx, by, rot, sc = 1;
      if (t < .62) { bx = 92; by = 384 + Math.sin(t * 5) * 1; rot = 0; }
      else if (t < tc) { [bx, by] = bolaSet(t); rot = (t - .62) * 300; }
      else if (t < ti) { [bx, by] = bolaCorte(t); rot = 360 + (t - tc) * 3000; }
      else { const dt = t - ti; bx = PI[0] + dt * 26; by = PI[1] + 14 + Math.min(dt * 50, 30); rot = 0; }
      if (t > tc - .02 && t < tc + .08) sc = 1.28 - Math.abs(t - tc - .03) * 4;
      bola.setAttribute("transform", `translate(${bx.toFixed(1)} ${by.toFixed(1)}) scale(${sc.toFixed(3)} ${(2 - sc).toFixed(3)})`);
      gomosR.setAttribute("transform", `rotate(${(rot % 360).toFixed(0)})`);
      bola.setAttribute("opacity", t >= ti ? clamp(1 - (t - ti) * 3, 0, 1).toFixed(2) : 1);
      // sombra da bola na água
      const alt = WY + 8 - by; sombraBola.setAttribute("cx", bx.toFixed(1)); sombraBola.setAttribute("cy", (WY + 10).toFixed(1));
      sombraBola.setAttribute("opacity", t < ti && alt > 0 ? clamp(.35 - alt / 700, 0, .3).toFixed(2) : 0); sombraBola.setAttribute("rx", (5 + alt / 40).toFixed(1));
      hist.push([bx, by, t]); while (hist.length && t - hist[0][2] > .15) hist.shift();
      segsR.forEach((s, i) => {
        const a = hist[Math.floor(i / segsR.length * hist.length)], b = hist[Math.min(hist.length - 1, Math.floor((i + 1) / segsR.length * hist.length))];
        const vis = t > tc && t < ti + .02 && a && b;
        s.setAttribute("opacity", vis ? (.06 + .45 * i / segsR.length).toFixed(2) : 0);
        if (vis) { s.setAttribute("x1", a[0]); s.setAttribute("y1", a[1]); s.setAttribute("x2", b[0]); s.setAttribute("y2", b[1]); s.setAttribute("stroke-width", (2 + 13 * i / segsR.length).toFixed(1)); }
      });
      const ec = (t - tc + .02) / .3;
      estrela.setAttribute("opacity", ec > 0 && ec < 1 ? (1 - ec).toFixed(2) : 0);
      estrela.setAttribute("transform", `translate(${PC[0]} ${PC[1]}) scale(${(.5 + ec * 1.4).toFixed(2)}) rotate(${(ec * 30).toFixed(0)})`);
      flash.setAttribute("opacity", ec > 0 && ec < 1 ? (.22 * (1 - ec)).toFixed(3) : 0);
      spAtq.at(t - 1.18); spEnt.at(t - 2.38); spBola.at(t - ti); spDef.at(t - 2.55);
      // câmera com tremor no impacto
      const tr = t - ti, amp = tr > 0 && tr < .45 ? 6 * Math.pow(1 - tr / .45, 2) : 0;
      const sx = amp * Math.sin(tr * 70), sy = amp * Math.cos(tr * 57) * .7;
      cam.setAttribute("transform", `translate(${200 + sx} ${380 + sy}) scale(${camS(t).toFixed(4)}) translate(${-camX(t).toFixed(2)} ${-camY(t).toFixed(2)})`);
      // placar
      hud.setAttribute("opacity", clamp((t - .25) / .4, 0, 1) * clamp(1 - (t - T_ONDA) / .3, 0, 1));
      piscaVivo.setAttribute("opacity", Math.sin(t * 6) > 0 ? 1 : .25);
      const fl2 = clamp((t - 2.22) / .3, 0, 1);
      sA0.setAttribute("opacity", 1 - fl2); sA0.setAttribute("transform", `translate(0 ${(-fl2 * 12).toFixed(1)})`);
      sA1.setAttribute("opacity", fl2); sA1.setAttribute("transform", `translate(0 ${((1 - fl2) * 12).toFixed(1)})`);
      if (t > 2.22) pgTxt.textContent = (cfg.placar.sa + 1) + "-" + cfg.placar.sb;
      const pt = t - 2.18, pin = clamp(pt / .22, 0, 1), pout = clamp((t - (T_ONDA - .1)) / .3, 0, 1);
      ponto.setAttribute("opacity", pt > 0 ? (pin * (1 - pout)).toFixed(2) : 0);
      ponto.setAttribute("transform", `translate(200 200) scale(${(pt > 0 ? (pt < .22 ? 2.2 - EZ.back(pin) * 1.2 : 1 + Math.max(0, .05 - (pt - .22) * .05)) : 2.2).toFixed(3)}) translate(-200 -200)`);
      linhasVel.setAttribute("transform", `translate(${(EZ.out(clamp(pt / .5, 0, 1)) * 30).toFixed(1)} 0)`);
      // onda de transição e revelação do logo
      const ou = clamp((t - T_ONDA) / (T_REVELA - T_ONDA), 0, 1), os = clamp((t - T_REVELA) / .6, 0, 1);
      const yOnda = 760 - EZ.io(ou) * 820 - EZ.in(os) * 900;
      onda.setAttribute("d", ondaPath(yOnda, 10, t * 5) + " L620 1700 L-220 1700 Z");
      onda2.setAttribute("d", ondaPath(yOnda + 26, 8, t * 4 + 2) + " L620 1700 L-220 1700 Z");
      onda.setAttribute("opacity", t > T_ONDA ? 1 : 0); onda2.setAttribute("opacity", t > T_ONDA ? 1 : 0);
      svg.style.opacity = t < T_REVELA ? clamp(t / .45, 0, 1) : (os < 1 ? 1 : 0);
      if (t >= T_REVELA) { fim.style.opacity = 1; cam.setAttribute("opacity", 0); }
      if (t >= T_LOGO && !logoIniciado) {
        logoIniciado = true;
        const durLogo = L.entrada();
        sub.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 600, delay: Math.max(0, durLogo - 900), easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" });
        PARADO = T_LOGO + durLogo / 1000; FIM = PARADO + SEGURA;
      }
      if (FIM && t >= FIM) { sair(); return; }
      raf = requestAnimationFrame(quadro);
    }
    function sair() {
      if (acabou) return; acabou = true; cancelAnimationFrame(raf); ov.style.pointerEvents = "none";
      window.dispatchEvent(new Event("abertura-fim"));
      ov.animate([{ opacity: getComputedStyle(ov).opacity }, { opacity: 0 }], { duration: 900, easing: "cubic-bezier(.45,0,.2,1)", fill: "forwards" }).onfinish = () => ov.remove();
      if (logoIniciado) caixa.animate([{ transform: "none" }, { transform: "scale(.94)" }], { duration: 900, easing: "cubic-bezier(.45,0,.2,1)", fill: "forwards" });
      document.querySelectorAll(cfg.app || ".wrap").forEach(app => app.animate([{ opacity: 0, transform: "translateY(14px) scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 900, delay: 150, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" }));
      removeEventListener("resize", ajusta);
    }
    ov.addEventListener("click", sair);
    let comecou = false;
    const iniciar = () => { if (comecou || acabou) return; comecou = true; raf = requestAnimationFrame(quadro); };
    L.pronto.then(iniciar); setTimeout(iniciar, 2500);
    setTimeout(() => { if (!comecou) sair(); }, 3500);
    return { sair };
  }

  window.BiribolAnim = { logo, abertura };
})();
