/* Lector: lee el resumen en voz alta y resalta lo que va leyendo.
   Motores del servidor (generan y guardan el audio): Microsoft (gratis), Piper (local, gratis)
   y Gemini (usa créditos). Y la voz del sistema (speechSynthesis del navegador). */
(function () {
  "use strict";
  const SY = window.speechSynthesis;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Preferencias de este dispositivo (las voces instaladas cambian de una compu a otra).
  let pref = {}; try { pref = JSON.parse(localStorage.getItem("subte-voz") || "{}"); } catch (e) { }
  const guardarPref = () => { try { localStorage.setItem("subte-voz", JSON.stringify(pref)); } catch (e) { } };

  let L = null, bar = null, toqueManual = 0;
  const audio = new Audio();
  const servidor = m => m && m !== "sistema";
  if (pref.vozGemini && !pref.voces) pref.voces = { gemini: pref.vozGemini };
  const vozDe = m => ((pref.voces || {})[m]) || (L.motores[m] || {}).def;

  /* ---------- texto a leer ---------- */
  function bloques(read) {
    return [...read.querySelectorAll("h2,h3,h4,h5,p,li,tr")].map(el => {
      let t;
      if (el.tagName === "LI") { const c = el.cloneNode(true); c.querySelectorAll("ul,ol").forEach(x => x.remove()); t = c.textContent; }
      else if (el.tagName === "TR") t = [...el.children].map(x => x.textContent.trim()).join(", ");
      else t = el.textContent;
      t = t.replace(/\s+/g, " ").trim();
      if (t && !/[.:;?!]$/.test(t)) t += ".";  // pausa al final de títulos e ítems
      return { el, t };
    }).filter(b => b.t.length > 1);
  }
  function cortar(t, max) {
    const os = t.match(/[^.!?;:]+[.!?;:]*\s*/g) || [t], out = [];
    let cur = "";
    for (const o of os) { if (cur && (cur + o).length > max) { out.push(cur.trim()); cur = ""; } cur += o; }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  /* Sistema: una oración por vez (Chrome corta las frases largas).
     Servidor: un párrafo por vez, para que el resaltado siga la lectura; los títulos e ítems
     cortos se pegan al párrafo siguiente para no hacer pedidos de una línea. */
  function piezas(bs, motor) {
    const out = [];
    if (!servidor(motor)) { for (const b of bs) for (const t of cortar(b.t, 220)) out.push({ els: [b.el], t }); return out; }
    let pend = null;
    for (const b of bs) {
      if (b.t.length < 120) {
        pend = pend ? { els: [...pend.els, b.el], t: pend.t + " " + b.t } : { els: [b.el], t: b.t };
        if (pend.t.length >= 400) { out.push(pend); pend = null; }
        continue;
      }
      cortar(b.t, 700).forEach((t, k) => {
        if (k === 0 && pend) { out.push({ els: [...pend.els, b.el], t: pend.t + " " + t }); pend = null; }
        else out.push({ els: [b.el], t });
      });
    }
    if (pend) out.push(pend);
    return out;
  }

  /* ---------- voces del sistema ---------- */
  function vocesEs() {
    const puntaje = v => (/premium|enhanced|mejorada|natural|neural/i.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 2 : 0)
      + (/es-AR/i.test(v.lang) ? 2 : /es-(MX|US|419)/i.test(v.lang) ? 1 : 0) + (/m[oó]nica|paulina|diego|isabela/i.test(v.name) ? 1 : 0);
    return (SY ? SY.getVoices() : []).filter(v => /^es/i.test(v.lang)).sort((a, b) => puntaje(b) - puntaje(a));
  }
  const vozSistema = () => { const vs = vocesEs(); return vs.find(v => v.name === pref.vozSistema) || vs[0] || null; };
  if (SY) SY.addEventListener("voiceschanged", () => bar && pintar());

  /* ---------- reproducción ---------- */
  function marcar() {
    document.querySelectorAll(".read .leyendo").forEach(e => e.classList.remove("leyendo"));
    const p = L.ps[L.i]; if (!p) return;
    p.els.forEach(e => e.classList.add("leyendo"));
    const r = p.els[0].getBoundingClientRect(), barH = bar ? bar.offsetHeight : 0;
    if (Date.now() - toqueManual > 4000 && (r.top < 70 || r.bottom > innerHeight - barH - 20))
      p.els[0].scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  }
  function cortarTodo() { L.gen++; if (SY) SY.cancel(); audio.pause(); audio.onended = null; }
  function decir() {
    const p = L.ps[L.i];
    if (!p) { L.sonando = false; L.i = 0; document.querySelectorAll(".read .leyendo").forEach(e => e.classList.remove("leyendo")); estado("Terminó el resumen."); pintar(); return; }
    marcar(); estado(""); pintar();
    if (servidor(L.motor)) return decirServidor(p);
    const g = L.gen, u = new SpeechSynthesisUtterance(p.t), v = vozSistema();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "es-AR";
    u.rate = L.vel;
    const fin = () => { if (g === L.gen && L.sonando) { L.i++; decir(); } };
    u.onend = fin;
    u.onerror = e => { if (e.error !== "interrupted" && e.error !== "canceled") fin(); };
    SY.cancel(); SY.speak(u);
  }
  function urlServidor(i) {
    const p = L.ps[i]; if (!p) return null;
    if (!L.cache.has(p.t)) {
      L.cache.set(p.t, fetch("/api/voz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ materia: L.slug, texto: p.t, motor: L.motor, voz: vozDe(L.motor) }) })
        .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "No se pudo generar la voz."); return d.url; })
        .catch(e => { L.cache.delete(p.t); throw e; }));
    }
    return L.cache.get(p.t);
  }
  function alternativa() {
    const m = Object.keys(L.motores).find(x => x !== L.motor && x !== "gemini") || (SY ? "sistema" : null);
    return m ? ` <button class="lk" data-lector="motor" data-m="${m}">Probar con: ${m === "sistema" ? "Voz del sistema" : esc(L.motores[m].nombre)}</button>` : "";
  }
  async function decirServidor(p) {
    const g = L.gen;
    let url;
    const espera = setTimeout(() => g === L.gen && estado("Generando la voz…"), 400);
    try { url = await urlServidor(L.i); }
    catch (e) {
      clearTimeout(espera); if (g !== L.gen) return;
      L.sonando = false; pintar();
      estado(esc(e.message) + alternativa());
      return;
    }
    clearTimeout(espera);
    if (g !== L.gen || !L.sonando) return;
    estado("");
    audio.src = url; audio.playbackRate = L.vel;
    audio.onended = () => { if (g === L.gen && L.sonando) { L.i++; decir(); } };
    audio.play().catch(() => { });
    urlServidor(L.i + 1)?.catch(() => { });  // la próxima se va generando mientras escuchás esta
  }
  function play() {
    L.sonando = true;
    // Audio del servidor en pausa a mitad de un fragmento: seguir desde ahí.
    if (servidor(L.motor) && audio.src && audio.paused && audio.currentTime > 0 && !audio.ended && L.enPausa === L.i) { audio.play(); pintar(); return; }
    cortarTodo(); decir();
  }
  function pausa() { L.sonando = false; L.enPausa = L.i; if (servidor(L.motor)) audio.pause(); else { L.gen++; SY.cancel(); } pintar(); }
  function ir(i) { cortarTodo(); L.enPausa = -1; L.i = Math.max(0, Math.min(L.ps.length - 1, i)); if (L.sonando) decir(); else { marcar(); pintar(); } }
  function bloque(dir) {
    const el = L.ps[L.i].els[0];
    let i = L.i;
    if (dir > 0) { while (i < L.ps.length && L.ps[i].els[0] === el) i++; }
    else { while (i > 0 && L.ps[i - 1].els[0] === el) i--; if (i > 0) { const prev = L.ps[i - 1].els[0]; i--; while (i > 0 && L.ps[i - 1].els[0] === prev) i--; } }
    ir(i);
  }
  function rearmar() {
    const el = L.ps[L.i] && L.ps[L.i].els[0];
    L.ps = piezas(L.bs, L.motor);
    const j = L.ps.findIndex(p => p.els.includes(el)); L.i = j < 0 ? 0 : j;
  }

  /* ---------- precarga del audio del servidor ----------
     Al empezar se le pide al servidor que genere todos los párrafos de la clase en segundo plano,
     empezando por donde estás. Sigue aunque cierres el lector, mientras el servidor esté prendido. */
  const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Error"); return d; });
  async function lote(textos, todas) {
    try { const d = await post("/api/voz/lote", { materia: L.slug, motor: L.motor, voz: vozDe(L.motor), textos }); L.lotes[d.id] = d; if (todas) L.todas = true; sondear(); }
    catch (e) { audioEstado(`No se pudo preparar el audio: ${esc(e.message)}`); }
  }
  function prepararClase() {
    if (!L || !servidor(L.motor)) return;
    lote([...L.ps.slice(L.i), ...L.ps.slice(0, L.i)].map(p => p.t), false);
  }
  async function prepararTodas() {
    if (!L || !servidor(L.motor)) return;
    const tmp = document.createElement("div");
    for (const c of L.clases) {
      if (!c.resumen_md) continue;
      tmp.innerHTML = L.md(c.resumen_md);
      await lote(piezas(bloques(tmp), L.motor).map(p => p.t), true);
    }
  }
  function cancelarLotes() {
    for (const id of Object.keys(L.lotes)) fetch(`/api/voz/lote/${id}/cancelar`, { method: "POST" }).catch(() => { });
    L.lotes = {}; L.todas = false; audioEstado("");
  }
  let sondeoT = null;
  function sondear() {
    clearTimeout(sondeoT);
    sondeoT = setTimeout(async () => {
      if (!L) return;
      const ids = Object.keys(L.lotes);
      await Promise.all(ids.map(id => fetch("/api/voz/lote/" + id).then(r => r.ok ? r.json() : null).then(d => { if (d && L && L.lotes[id]) L.lotes[id] = d; }).catch(() => { })));
      if (!L) return;
      const ls = Object.values(L.lotes), hechos = ls.reduce((a, x) => a + x.hechos, 0), total = ls.reduce((a, x) => a + x.total, 0);
      const err = ls.find(x => x.error), quien = L.todas ? "de todas las clases" : "de la clase";
      if (err) audioEstado(`No se pudo preparar todo el audio: ${esc(err.error)}`);
      else if (hechos >= total) audioEstado(`Audio ${quien} listo`, true);
      else audioEstado(`Preparando el audio ${quien}: ${hechos} de ${total}` + (ls.some(x => x.esperando) ? " · Gemini pidió esperar un poco, sigue solo" : ""));
      if (!err && hechos < total) sondear();
    }, 1500);
  }
  function audioEstado(txt, listo) {
    const s = bar && bar.querySelector(".l-audio"); if (!s) return;
    s.innerHTML = txt; s.classList.toggle("ok", !!listo);
  }

  /* ---------- barra ---------- */
  function estado(html) { const s = bar && bar.querySelector(".l-estado"); if (s) s.innerHTML = html; }
  function pintar() {
    if (!bar || !L) return;
    const vs = vocesEs(), sis = vozSistema();
    const p = L.ps[L.i], bloqueN = p ? L.bs.findIndex(b => b.el === p.els[p.els.length - 1]) + 1 : L.bs.length;
    bar.querySelector(".l-play").innerHTML = L.sonando ? "Pausa" : "Escuchar";
    bar.querySelector(".l-play").setAttribute("aria-label", L.sonando ? "Pausar" : "Escuchar");
    bar.querySelector(".l-pos").textContent = `${bloqueN} de ${L.bs.length}`;
    const mot = bar.querySelector(".l-motor");
    mot.innerHTML = Object.entries(L.motores).map(([m, x]) => `<option value="${m}" ${L.motor === m ? "selected" : ""}>${esc(x.nombre)}</option>`).join("")
      + (SY ? `<option value="sistema" ${L.motor === "sistema" ? "selected" : ""}>Voz del sistema</option>` : "");
    const td = bar.querySelector(".l-todas"); td.hidden = !servidor(L.motor) || L.todas || L.clases.length < 2;
    const vz = bar.querySelector(".l-voz");
    if (servidor(L.motor)) vz.innerHTML = L.motores[L.motor].voces.map(v => `<option value="${esc(v.id)}" ${v.id === vozDe(L.motor) ? "selected" : ""}>${esc(v.nombre)}</option>`).join("");
    else vz.innerHTML = vs.length ? vs.map(v => `<option value="${esc(v.name)}" ${sis && v.name === sis.name ? "selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("") : `<option>No hay voces en español instaladas</option>`;
  }
  function abrirBarra() {
    if (bar) return;
    bar = document.createElement("div");
    bar.className = "lector"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Lector del resumen");
    bar.innerHTML = `<div class="wrap gutter l-in">
      <button class="l-btn" data-lector="ant" aria-label="Párrafo anterior">&#9664;&#9664;</button>
      <button class="l-btn l-play primary" data-lector="play">Escuchar</button>
      <button class="l-btn" data-lector="sig" aria-label="Párrafo siguiente">&#9654;&#9654;</button>
      <span class="l-pos"></span>
      <label>Velocidad <select class="l-vel">${[0.8, 0.9, 1, 1.1, 1.25, 1.5].map(v => `<option value="${v}" ${v === L.vel ? "selected" : ""}>${String(v).replace(".", ",")}×</option>`).join("")}</select></label>
      <select class="l-motor" aria-label="Motor de voz"></select>
      <select class="l-voz" aria-label="Voz"></select>
      <button class="l-btn" data-lector="cerrar" aria-label="Cerrar el lector">Cerrar</button>
      <span class="l-audio" aria-live="polite"></span>
      <button class="lk l-todas" data-lector="todas">Preparar el audio de todas las clases</button>
      <span class="l-estado" aria-live="polite"></span>
      <span class="l-tip">Tocá cualquier párrafo para leer desde ahí.</span></div>`;
    document.body.appendChild(bar); document.body.classList.add("con-lector");
    bar.addEventListener("click", e => {
      const a = e.target.closest("[data-lector]"); if (!a) return;
      const k = a.dataset.lector;
      if (k === "play") L.sonando ? pausa() : play();
      if (k === "ant") bloque(-1);
      if (k === "sig") bloque(1);
      if (k === "cerrar") parar();
      if (k === "motor") { cambiarMotor(a.dataset.m); play(); }
      if (k === "todas") { a.hidden = true; prepararTodas(); }
    });
    bar.addEventListener("change", e => {
      if (e.target.matches(".l-vel")) { L.vel = pref.vel = +e.target.value; guardarPref(); audio.playbackRate = L.vel; if (L.sonando && !servidor(L.motor)) { cortarTodo(); decir(); } }
      if (e.target.matches(".l-motor")) { const s = L.sonando; cambiarMotor(e.target.value); if (s) play(); }
      if (e.target.matches(".l-voz")) {
        if (servidor(L.motor)) pref.voces = Object.assign(pref.voces || {}, { [L.motor]: e.target.value }); else pref.vozSistema = e.target.value;
        guardarPref(); L.cache.clear();
        if (servidor(L.motor)) { const todas = L.todas; cancelarLotes(); prepararClase(); if (todas) prepararTodas(); }
        if (L.sonando) { cortarTodo(); decir(); }
      }
    });
    pintar();
  }
  function cambiarMotor(m) {
    cortarTodo(); cancelarLotes(); L.cache.clear();  // no seguir generando (ni gastando) con el motor anterior
    L.sonando = false; L.enPausa = -1; L.motor = pref.motor = m; guardarPref(); rearmar(); marcar(); pintar(); estado("");
    prepararClase();
  }

  /* ---------- API ---------- */
  function parar() {
    clearTimeout(sondeoT);
    if (L) { cortarTodo(); L.read.classList.remove("lector-on"); }
    document.querySelectorAll(".read .leyendo").forEach(e => e.classList.remove("leyendo"));
    if (bar) { bar.remove(); bar = null; document.body.classList.remove("con-lector"); }
    L = null;
  }
  function empezar({ read, slug, motores, clases, md }) {
    parar();
    const bs = bloques(read); if (!bs.length) return;
    motores = motores || {};
    // La que elegiste la última vez; si no, la primera gratis que haya (el servidor las manda en orden).
    const motor = (pref.motor in motores || (pref.motor === "sistema" && SY)) ? pref.motor : Object.keys(motores)[0] || (SY ? "sistema" : null);
    if (!motor) { alert("Este navegador no puede leer en voz alta y no hay voces instaladas. Corré scripts/instalar_voces.sh."); return; }
    L = { read, slug, motores, bs, motor, ps: [], i: 0, gen: 0, sonando: false, enPausa: -1, vel: pref.vel || 1, cache: new Map(), lotes: {}, todas: false, clases: clases || [], md: md || (t => t) };
    L.ps = piezas(bs, motor);
    // Arranca desde el primer párrafo que estás viendo en pantalla.
    const vis = bs.findIndex(b => b.el.getBoundingClientRect().bottom > 90);
    if (vis > 0) L.i = L.ps.findIndex(p => p.els.includes(bs[vis].el));
    read.classList.add("lector-on");
    abrirBarra(); prepararClase(); play();
  }
  document.addEventListener("click", e => {
    if (!L || !L.read.contains(e.target) || e.target.closest("a,button") || String(getSelection()).trim()) return;
    const el = e.target.closest("h2,h3,h4,h5,p,li,tr"); if (!el) return;
    const j = L.ps.findIndex(p => p.els.includes(el)); if (j >= 0) { L.sonando = true; ir(j); }
  });
  ["wheel", "touchmove"].forEach(ev => addEventListener(ev, () => { toqueManual = Date.now(); }, { passive: true }));
  window.Lector = { empezar, parar, activo: () => !!L };
})();
