/* Subte Estudio: la ruta de una materia como una red de subte. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const md = s => window.renderMarkdown(s || "");
  const words = t => (String(t || "").trim().match(/\S+/g) || []).length;
  const plural = (n, s) => n + " " + s + (n === 1 ? "" : "s");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let M = null, S = {}, ST = {}, JUST = 0, KEY = "";
  const byN = n => M.clases.find(c => +c.n === +n);
  const fase = c => M.fases.find(f => +f.id === +c.fase) || M.fases[0];
  const stepIds = c => ["c" + c.n + "-v", "c" + c.n + "-a", "c" + c.n + "-r", "c" + c.n + "-q"];
  const done = c => stepIds(c).every(id => S[id]);
  const firstPending = () => (M.clases.find(c => !done(c)) || M.clases[M.clases.length - 1]).n;
  const current = () => (S.open && byN(S.open) ? S.open : firstPending());
  const fileUrl = u => (/^https?:/.test(u) ? u : "/materias/" + M.slug + "/" + u);
  const kq = k => { const [n, i] = k.slice(1).split("-").map(Number); const c = byN(n); return { c, i, q: c && (c.preguntas || [])[i] }; };
  /* Títulos comparables: el campo "donde" de cada pregunta es el título de una sección del resumen. */
  const norm = t => String(t || "").replace(/^#+\s*/, "").replace(/[*`_]/g, "").replace(/\s+/g, " ").trim().replace(/[.:]$/, "").toLowerCase();
  const dondeLink = (q, n) => q && q.donde ? `<button class="donde" data-donde="${esc(q.donde)}" data-donde-c="${n}">Dónde se explica: ${esc(q.donde)}</button>` : "";

  /* ---------- color de cada línea ---------- */
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  }
  function applyLines() {
    const root = document.documentElement;
    for (const f of M.fases) {
      root.style.setProperty(`--f${f.id}`, f.color);
      root.style.setProperty(`--f${f.id}-soft`, `color-mix(in srgb, ${f.color} 16%, var(--panel))`);
      root.style.setProperty(`--f${f.id}-ink`, `color-mix(in srgb, ${f.color} 62%, var(--ink))`);
      f.on = luminance(f.color) > 0.32 ? "#15191c" : "#ffffff";
    }
    if (M.fases[0]) { root.style.setProperty("--la", M.fases[0].color); }
  }
  const lc = c => `var(--f${fase(c).id})`;
  const roundel = (c, cls = "") => `<span class="roundel ${cls}" style="background:${lc(c)};color:${fase(c).on}" aria-hidden="true">${c.n}</span>`;
  const ICON = {
    video: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="1.5" y="3.5" width="17" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 7.2v5.6l4.6-2.8z" fill="currentColor"/></svg>',
    audio: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 11v-1a6 6 0 0 1 12 0v1" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="2.5" y="10.5" width="4" height="6" rx="1.5" fill="currentColor"/><rect x="13.5" y="10.5" width="4" height="6" rx="1.5" fill="currentColor"/></svg>',
    check: '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M7 13.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  /* ---------- estado guardado ---------- */
  /* Se guarda en el navegador y en el disco (progreso/<materia>.json, vía el servidor).
     Al arrancar gana la copia más nueva (S._t). */
  let saveT, diskT, pendiente = false, FOOT = "";
  const progresoUrl = () => "/api/progreso/" + M.slug;
  function save() {
    S._t = Date.now(); pendiente = true;
    clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }, 150);
    clearTimeout(diskT); diskT = setTimeout(saveDisk, 700);
  }
  async function saveDisk() {
    pendiente = false;
    try {
      const r = await fetch(progresoUrl(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(S) });
      if (!r.ok) throw new Error((await r.json()).error);
      $("foot").textContent = FOOT;
    } catch (e) { $("foot").textContent = "No se pudo guardar tu progreso en el disco: revisá que el servidor esté corriendo. Mientras tanto queda en este navegador."; }
  }
  addEventListener("pagehide", () => { if (pendiente && M) navigator.sendBeacon(progresoUrl(), new Blob([JSON.stringify(S)], { type: "application/json" })); });

  /* ---------- repaso espaciado ----------
     Una pregunta mal o a medias vuelve en 1 hora. Cada vez que sale bien cuando le toca,
     vuelve más tarde: 1 día, 3 días, 1 semana. Si sale bien en la última, queda aprendida.
     Si sale mal en cualquier momento, vuelve a empezar desde 1 hora. */
  const H = 36e5, INTERVALOS = [H, 24 * H, 72 * H, 168 * H];
  function marcar(k, v) {
    const sr = S["sr-" + k], now = Date.now();
    if (v === 0 || v === 1) S["sr-" + k] = { paso: 0, vence: now + INTERVALOS[0] };
    else if (v === 2 && sr && now >= sr.vence) {
      const paso = sr.paso + 1;
      if (paso >= INTERVALOS.length) { delete S["sr-" + k]; S["ok-" + k] = now; }
      else S["sr-" + k] = { paso, vence: now + INTERVALOS[paso] };
    }
  }
  const cuando = ms => { const m = Math.round(ms / 6e4); return m < 60 ? `en ${Math.max(1, m)} min` : m < 1440 ? `en ${Math.round(m / 60)} h` : `en ${Math.round(m / 1440)} ${Math.round(m / 1440) === 1 ? "día" : "días"}`; };

  /* ---------- diagrama ---------- */
  function diagram() {
    const box = $("diagram"), W = box.clientWidth || 900, vertical = W < 640, cur = current();
    const C = M.clases, nF = M.fases.length;
    const exam = M.examen || {}, examLabel = exam.fecha ? exam.fecha.slice(8, 10) + "/" + exam.fecha.slice(5, 7) : "Fin";
    let p = "";
    const station = (c, x, y, r, labelSvg) => {
      const d = done(c), on = +c.n === +cur, col = lc(c), anim = d && +c.n === JUST;
      let g = `<g class="st" tabindex="0" role="button" data-open="${c.n}" aria-label="Clase ${c.n}: ${esc(c.titulo)}${d ? ", completa" : ""}${on ? ", abierta" : ""}">`;
      if (on) g += `<circle cx="${x}" cy="${y}" r="${r + 7}" fill="none" stroke="var(--ink)" stroke-width="2.5"/>`;
      g += `<circle class="ring" cx="${x}" cy="${y}" r="${r}" fill="${d && !anim ? col : "var(--panel)"}" stroke="${d ? col : "var(--ink)"}" stroke-width="3.2"/>`;
      if (anim) g += `<circle class="fillin" cx="${x}" cy="${y}" r="${r}" fill="${col}"/>`;
      g += d ? `<path d="M${x - 5.5} ${y} l4 4 l7.5 -8" fill="none" stroke="${fase(c).on}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>` : `<text x="${x}" y="${y + 4.5}" text-anchor="middle" font-size="12.5" font-weight="800">${c.n}</text>`;
      return g + labelSvg(on) + "</g>";
    };
    const terminal = (x, y, lx, ly, anchor) => `<g class="st" tabindex="0" role="button" data-view-go="terminal" aria-label="Terminal: ${esc(exam.nombre || "el examen")}"><rect x="${x - 24}" y="${y - 20}" width="48" height="40" rx="10" fill="var(--sign)"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-size="12.5" font-weight="800" style="fill:var(--sign-ink)">${examLabel}</text><text x="${lx}" y="${ly}" text-anchor="${anchor}" font-size="13.5" font-weight="700">${esc(exam.nombre || "Examen")}</text></g>`;
    if (!vertical) {
      const w = 1120, gap = 0.35, step = Math.min(96, (w - 150) / (C.length + gap * (nF - 1)));
      const ys = f => (M.fases.findIndex(x => +x.id === +f) % 2 ? 98 : 62);
      const pos = c => { const fi = M.fases.findIndex(x => +x.id === +c.fase); return { x: 46 + (C.indexOf(c)) * step + fi * gap * step, y: ys(c.fase) }; };
      const maxY = 98, h = 158;
      for (const f of M.fases) { const cs = C.filter(c => +c.fase === +f.id); if (!cs.length) continue; const a = pos(cs[0]), b = pos(cs[cs.length - 1]); p += `<line x1="${a.x - 18}" y1="${a.y}" x2="${b.x + 18}" y2="${b.y}" stroke="var(--f${f.id})" stroke-width="12" stroke-linecap="round"/>`; }
      for (let k = 1; k < C.length; k++) if (+C[k].fase !== +C[k - 1].fase) { const a = pos(C[k - 1]), b = pos(C[k]); p += `<path d="M${a.x + 18} ${a.y} C ${a.x + 40} ${a.y}, ${b.x - 40} ${b.y}, ${b.x - 18} ${b.y}" fill="none" stroke="var(--ink)" stroke-width="3" stroke-dasharray="2 5" stroke-linecap="round" opacity=".55"/>`; }
      const last = pos(C[C.length - 1]), T = { x: Math.min(w - 46, last.x + Math.max(90, step * 1.2)), y: last.y };
      p += `<path d="M${last.x + 18} ${last.y} L ${T.x - 24} ${T.y}" stroke="var(--ink)" stroke-width="3" stroke-dasharray="2 5" stroke-linecap="round" opacity=".55"/>`;
      p += terminal(T.x, T.y, T.x, T.y + 42, "middle");
      for (const c of C) { const { x, y } = pos(c); const ly = y === maxY ? y + 42 : y + 40; p += station(c, x, y, 14, on => `<text x="${x}" y="${ly}" text-anchor="middle" font-size="13" font-weight="${on ? 800 : 600}" style="font-stretch:85%">${esc(c.corto || c.titulo)}</text>`); }
      box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="group" aria-label="Recorrido de ${C.length} clases hasta el examen">${p}</svg>`;
    } else {
      const w = 360, step = 48, P = {};
      C.forEach((c, i) => { const fi = M.fases.findIndex(x => +x.id === +c.fase); P[c.n] = { x: fi % 2 ? 64 : 40, y: 30 + i * step + fi * 16 }; });
      for (const f of M.fases) { const cs = C.filter(c => +c.fase === +f.id); if (!cs.length) continue; const a = P[cs[0].n], b = P[cs[cs.length - 1].n]; p += `<line x1="${a.x}" y1="${a.y - 16}" x2="${b.x}" y2="${b.y + 16}" stroke="var(--f${f.id})" stroke-width="10" stroke-linecap="round"/>`; }
      const last = P[C[C.length - 1].n], T = { x: 40, y: last.y + 60 };
      p += terminal(T.x, T.y, T.x + 36, T.y + 5, "start");
      for (const c of C) { const { x, y } = P[c.n]; p += station(c, x, y, 13, on => `<text x="${x + 30}" y="${y + 5}" font-size="15" font-weight="${on ? 800 : 600}">${esc(c.corto || c.titulo)}</text>`); }
      box.innerHTML = `<svg viewBox="0 0 ${w} ${T.y + 40}" style="max-width:${w}px" role="group" aria-label="Recorrido de ${C.length} clases hasta el examen">${p}</svg>`;
    }
    JUST = 0;
  }

  /* ---------- cartel y leyenda ---------- */
  function sign() {
    const c = byN(firstPending()), allDone = M.clases.every(done), exam = M.examen || {};
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (exam.fecha) {
      const [y, m, d] = exam.fecha.split("-").map(Number), days = Math.round((new Date(y, m - 1, d) - today) / 864e5);
      $("countdown").innerHTML = days > 0 ? `${esc(exam.nombre || "Examen")} ${d}/${m} · faltan <b>${days}</b> ${days === 1 ? "día" : "días"}` : days === 0 ? `<b>Hoy es el ${esc((exam.nombre || "examen").toLowerCase())}</b>` : esc(exam.nombre || "");
    } else $("countdown").textContent = "";
    $("nextSign").innerHTML = allDone
      ? `<span class="roundel" style="background:var(--sign-ink);color:var(--sign)" aria-hidden="true">${ICON.check}</span><h1><span class="nl">Recorriste las ${M.clases.length} estaciones</span>Seguí hasta la Terminal</h1><button class="go" data-view-go="terminal">Ir a la Terminal</button>`
      : `${roundel(c)}<h1><span class="nl">Próxima estación</span><span style="white-space:nowrap">Clase ${c.n}</span> · ${esc(c.titulo)}</h1><button class="go" data-open="${c.n}">Abrir estación</button>`;
    const all = M.clases.flatMap(stepIds), n = all.filter(id => S[id]).length;
    $("legend").innerHTML = M.fases.map(f => `<span><i style="background:var(--f${f.id})"></i>Línea ${esc(f.linea || f.id)} · ${esc(f.nombre)}</span>`).join("") + `<span>${M.clases.filter(done).length} de ${M.clases.length} estaciones · ${n} de ${all.length} pasos</span>`;
  }

  /* ---------- estación ---------- */
  function station() {
    if (window.Lector) Lector.parar();
    if (EX && +EX.n !== +current()) { EX = null; pintarEx(); }
    document.body.classList.remove("notas-abiertas");
    const c = byN(current()), f = fase(c), ids = stepIds(c);
    const qs = (c.preguntas || []).map((q, i) => question(c, q, i)).join("");
    $("view-ruta").innerHTML = `
    <div class="station" style="--lc:var(--f${f.id})">
      <article class="panel station-main">
        <div class="st-head">${roundel(c)}<div><h2>Clase ${c.n} · ${esc(c.titulo)}</h2>
          <div class="st-meta"><span class="chip">Línea ${esc(f.linea || f.id)} · ${esc(f.nombre)}</span>${c.prioridad === "alta" ? '<span class="chip hot">pesa mucho en el examen</span>' : '<span class="chip">peso medio</span>'}</div></div></div>
        ${c.por_que ? `<p class="why">${esc(c.por_que)}</p>` : ""}
        ${c.marco ? `<div class="dline">${esc(c.marco)}</div>` : ""}
        <div class="sec-row"><h3 class="sec">Resumen de la clase</h3>${c.resumen_md ? `<button class="btn escuchar" data-escuchar="1" aria-label="Escuchar el resumen en voz alta">Escuchar el resumen</button>` : ""}</div>
        <div class="read">${md(c.resumen_md) || '<p class="empty">Todavía no hay resumen para esta clase.</p>'}</div>
        <h3 class="sec">Autoevaluación · ${plural((c.preguntas || []).length, "pregunta")}</h3>
        <p class="qintro" id="qintro">${introText()}</p>
        ${qs}
        <div class="fin" id="fin-${c.n}" aria-live="polite"></div>
        <div class="nav-st">${c.n > M.clases[0].n ? `<button data-open="${c.n - 1}">Estación anterior · Clase ${c.n - 1}</button>` : "<span></span>"}${byN(c.n + 1) ? `<button data-open="${c.n + 1}">Próxima estación · Clase ${c.n + 1}</button>` : `<button data-view-go="terminal">Ir a la Terminal</button>`}</div>
      </article>
      <aside class="panel rail" aria-label="Pasos de la estación">
        <h3>Pasos en esta estación</h3>
        <ol class="stops">
          ${c.video ? `<li><input type="checkbox" id="${ids[0]}"><label for="${ids[0]}">Ver el video<small>${esc(c.video.duracion || "")}</small></label></li>` : `<li><input type="checkbox" id="${ids[0]}"><label for="${ids[0]}">Repasar las diapositivas</label></li>`}
          ${c.audio ? `<li><input type="checkbox" id="${ids[1]}"><label for="${ids[1]}">Escuchar el audio<small>${esc(c.audio.duracion || "")}</small></label></li>` : `<li><input type="checkbox" id="${ids[1]}"><label for="${ids[1]}">Leer el apunte</label></li>`}
          <li><input type="checkbox" id="${ids[2]}"><label for="${ids[2]}">Leer el resumen<small>en esta página</small></label></li>
          <li><input type="checkbox" id="${ids[3]}"><label for="${ids[3]}">Responder la autoevaluación<small>${plural((c.preguntas || []).length, "pregunta")}</small></label></li>
        </ol>
        <div class="media">
          ${c.video ? `<a href="${esc(c.video.url)}" target="_blank" rel="noopener">${ICON.video}<span>${esc(c.video.titulo)}<small>Video · ${esc(c.video.duracion || "")}</small></span></a>` : ""}
          ${c.audio ? `<a href="${esc(c.audio.url)}" target="_blank" rel="noopener">${ICON.audio}<span>${esc(c.audio.titulo)}<small>Audio · ${esc(c.audio.duracion || "")}</small></span></a>` : ""}
        </div>
        ${c.apunte ? `<a class="pdf" href="${esc(fileUrl(c.apunte))}" target="_blank" rel="noopener">Apunte completo de la clase (PDF)</a>` : ""}
        <section class="notas" aria-label="Mis apuntes de la clase ${c.n}">
          <div class="notas-head"><h3>Mis apuntes</h3><span class="notas-ok" id="notasOk" aria-live="polite"></span><button class="notas-x" data-notas="cerrar">Cerrar</button></div>
          <textarea id="nota-${c.n}" data-nota="${c.n}" aria-label="Mis apuntes de la clase ${c.n}" placeholder="Lo esencial de la clase, con tus palabras.&#10;&#10;- Seguridad: algo malo nunca pasa.&#10;- Progreso: algo bueno termina pasando.">${esc(S["nota-" + c.n] || "")}</textarea>
          <p class="notas-tip">Seleccioná texto del resumen y tocá <b>A mis apuntes</b> para traerlo acá. Todos tus apuntes juntos están en la pestaña "Mis apuntes".</p>
        </section>
      </aside>
      <button class="notas-fab" data-notas="abrir">Mis apuntes</button>
    </div>`;
    refreshChecks(); refreshQuestions(c); finRender(c);
  }
  function question(c, q, i) {
    const k = "h" + c.n + "-" + i, draft = S["a-" + k] || "";
    return `<div class="q" id="q-${k}"><div class="q-head"><span class="q-n">${i + 1}/${c.preguntas.length}</span><p class="q-text">${esc(q.pregunta)}</p></div>
    <div class="q-body">
      <textarea id="ta-${k}" data-draft="${k}" aria-label="Tu respuesta a la pregunta ${i + 1}" placeholder="Tu respuesta… (o dictala)">${esc(draft)}</textarea>
      <div class="q-actions">
        <button class="btn rec" data-rec="${k}" aria-pressed="false" ${ST.transcripcion ? "" : "hidden"}><span class="dot" aria-hidden="true"></span><span>Dictar</span></button>
        <button class="btn primary" data-grade="${k}" ${ST.corrector ? "" : "hidden"}>Corregir</button>
        <button class="btn" data-ref="${k}" aria-expanded="false" ${words(draft) < 8 && !S["u-" + k] ? "disabled" : ""}>Ver respuesta de referencia</button>
        <button class="btn ghost" data-dunno="${k}">No la sé</button>
        <span class="words" id="w-${k}"></span></div>
      <div id="out-${k}"></div>
      <div class="ref" id="ref-${k}" hidden><b>Respuesta de referencia</b>${esc(q.referencia)}${dondeLink(q, c.n)}</div>
      <div class="rate" role="group" aria-label="¿Cómo te fue?">¿Cómo te fue?<button data-rate="${k}" data-v="0" aria-pressed="false">No la sabía</button><button data-rate="${k}" data-v="1" aria-pressed="false">A medias</button><button data-rate="${k}" data-v="2" aria-pressed="false">Bien</button></div>
    </div></div>`;
  }
  function introText() {
    return ST.corrector
      ? "Escribí o dictá tu respuesta como en el examen. Después corregila: el corrector revisa punto por punto qué ideas cubriste y qué te faltó."
      : "Escribí o dictá tu respuesta como en el examen. Después comparala con la respuesta de referencia y calificate.";
  }
  function refreshQuestions(c) {
    (c.preguntas || []).forEach((q, i) => {
      const k = "h" + c.n + "-" + i, w = $("w-" + k);
      if (w) { const n = words(S["a-" + k]); w.textContent = n ? n + " palabras" : ""; }
      if (S["g-" + k]) renderVerdict(k, S["g-" + k]);
      document.querySelectorAll(`[data-rate="${k}"]`).forEach(b => b.setAttribute("aria-pressed", String(S["r-" + k] === +b.dataset.v)));
    });
  }
  function refreshChecks() { document.querySelectorAll(".stops input,.steps-plain input").forEach(i => { i.checked = !!S[i.id]; }); }

  /* ---------- corrección ---------- */
  async function grade(k, btn) {
    const [cn, i] = k.slice(1).split("-").map(Number), out = $("out-" + k), ans = (S["a-" + k] || "").trim();
    if (words(ans) < 8) { out.innerHTML = `<p class="thinking">Escribí una respuesta un poco más completa antes de corregirla.</p>`; return; }
    btn.disabled = true; out.innerHTML = `<p class="thinking">Corrigiendo…</p>`;
    try {
      const r = await fetch("/api/corregir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ materia: M.slug, clase: cn, i, respuesta: ans }) });
      const g = await r.json();
      if (!r.ok) throw new Error(g.error || "No se pudo corregir.");
      S["g-" + k] = g; S["r-" + k] = g.veredicto; marcar(k, g.veredicto); save(); renderVerdict(k, g);
      document.querySelectorAll(`[data-rate="${k}"]`).forEach(b => b.setAttribute("aria-pressed", String(g.veredicto === +b.dataset.v)));
      weakCount(); finRender(byN(cn));
    } catch (e) { out.innerHTML = `<p class="thinking">${esc(e.message)}</p>`; }
    finally { btn.disabled = false; }
  }
  const errList = g => (g.errores || []).map(e => (typeof e === "string" ? { dijiste: e, correcto: "" } : e));
  const faltaTxt = c => c.falta || c.comentario || c.texto;
  /* "Te faltó" y "Está mal" de una corrección; se usa en la corrección y en el resumen final. */
  function fallas(g) {
    const faltan = (g.claves || []).filter(x => x.estado !== "presente"), errs = errList(g);
    return (faltan.length ? `<span class="lab">Te faltó</span><ul class="claves">${faltan.map(x => `<li class="${x.estado}"><span class="mk">${x.estado === "parcial" ? "a medias" : "falta"}</span><span>${esc(faltaTxt(x))}</span></li>`).join("")}</ul>` : "")
      + (errs.length ? `<span class="lab">Está mal</span><ul class="mal">${errs.map(e => `<li><span>Dijiste: ${esc(e.dijiste)}</span>${e.correcto ? `<span class="ok-t">Es así: ${esc(e.correcto)}</span>` : ""}</li>`).join("")}</ul>` : "");
  }
  function renderVerdict(k, g) {
    const out = $("out-" + k); if (!out) return;
    const { c, q } = kq(k), T = ["Mal, repasala", "A medias", "Bien"];
    const cl = g.claves || [], faltan = cl.filter(x => x.estado !== "presente"), ok = cl.filter(x => x.estado === "presente"), errs = errList(g);
    let h = `<div class="verdict v${g.veredicto}"><h4>${T[g.veredicto]} · ${g.puntaje}/10</h4>` + fallas(g);
    if (!faltan.length && !errs.length) h += `<p>Cubriste todos los puntos clave, sin errores.</p>`;
    if (ok.length && (faltan.length || errs.length)) h += `<details class="cubiertos"><summary>Lo que sí cubriste (${ok.length})</summary><ul>${ok.map(x => `<li>${esc(x.texto)}</li>`).join("")}</ul></details>`;
    if (g.veredicto < 2) h += dondeLink(q, c && c.n);
    out.innerHTML = h + "</div>";
  }

  /* ---------- resumen de la autoevaluación ---------- */
  const ARMANDO = new Set();
  function rated(c) { return (c.preguntas || []).map((q, i) => ({ q, i, k: "h" + c.n + "-" + i, v: S["r-h" + c.n + "-" + i] })).filter(x => x.v === 0 || x.v === 1 || x.v === 2); }
  const firma = w => JSON.stringify(w.map(x => [x.i, x.v, (S["g-" + x.k] || {}).puntaje]));
  function finRender(c) {
    const box = $("fin-" + c.n); if (!box) return;
    const total = (c.preguntas || []).length, r = rated(c), weak = r.filter(x => x.v < 2), done = r.length === total;
    if (!r.length) { box.innerHTML = ""; return; }
    const cnt = v => r.filter(x => x.v === v).length, F = S["fin-" + c.n], fr = firma(weak);
    let h = `<h3 class="sec">Resumen de tu autoevaluación</h3><p class="fin-cnt">Respondiste ${r.length} de ${total}: <b class="t2">${cnt(2)} bien</b> · <b class="t1">${cnt(1)} a medias</b> · <b class="t0">${cnt(0)} mal o no la sabías</b>.</p>`;
    if (!done) h += `<p class="fin-note">Cuando califiques las ${total} preguntas se arma solo el resumen de tus errores. Una pregunta cuenta cuando la corregís, la calificás con "¿Cómo te fue?" o marcás "No la sé".</p>`;
    if (!weak.length) { box.innerHTML = h + (done ? `<p>No tenés preguntas mal ni a medias en esta clase.</p>` : ""); return; }
    // Resumen personalizado (lo arma el modelo)
    if (F && F.data) {
      h += `<div class="perso"><h4>Qué tenés que reforzar</h4>${F.data.diagnostico ? `<p class="diag">${esc(F.data.diagnostico)}</p>` : ""}<ol>${(F.data.reforzar || []).map(x => `<li><b>${esc(x.tema)}</b><span class="lab">Qué fallaste</span><p>${esc(x.que_fallo)}</p><span class="lab">Cómo es</span><p>${esc(x.como_es)}</p><span class="lab">Para fijarlo</span><p>${esc(x.practica)}</p></li>`).join("")}</ol>`;
      if (F.firma !== fr) h += `<p class="fin-note">Tus respuestas cambiaron desde que se armó este resumen.</p>`;
      h += ST.corrector ? `<button class="btn" data-fin="${c.n}">${F.firma !== fr ? "Rehacer con las respuestas nuevas" : "Rehacer el resumen"}</button>` : "";
      h += `</div>`;
    } else if (ARMANDO.has(c.n)) h += `<p class="thinking">Armando el resumen de tus errores…</p>`;
    else if (F && F.error) h += `<p class="thinking">${esc(F.error)}</p>${ST.corrector ? `<button class="btn" data-fin="${c.n}">Probar de nuevo</button>` : ""}`;
    else if (ST.corrector) h += `<button class="btn primary" data-fin="${c.n}">Armar el resumen de mis errores</button>`;
    // Lo que sale directo de las correcciones, sin modelo
    const secs = [...new Set(weak.map(x => x.q.donde).filter(Boolean))];
    if (secs.length) h += `<h4>Releé estas secciones del resumen</h4><ul class="releer">${secs.map(t => `<li><button class="donde" data-donde="${esc(t)}" data-donde-c="${c.n}">${esc(t)}</button></li>`).join("")}</ul>`;
    h += `<h4>Pregunta por pregunta</h4><ul class="weak fin-q">${weak.map(x => {
      const g = S["g-" + x.k];
      const det = g ? fallas(g) : `<span class="lab">Sin corrección. Lo que tenía que decir la respuesta</span><ul class="plain">${(x.q.claves || []).map(y => `<li>${esc(y)}</li>`).join("")}</ul>`;
      return `<li><span class="q-n">${x.i + 1}</span><div><span class="tag t${x.v}">${x.v === 1 ? "A medias" : g ? "Mal" : "No la sabías"}</span><b>${esc(x.q.pregunta)}</b><div class="det">${det}</div><div class="acts"><button data-goq="${x.k}">Responder de nuevo</button>${dondeLink(x.q, c.n)}</div></div></li>`;
    }).join("")}</ul>`;
    box.innerHTML = h;
    if (done && ST.corrector && !F && !ARMANDO.has(c.n)) armarFin(c);
  }
  async function armarFin(c) {
    if (ARMANDO.has(c.n)) return;
    const weak = rated(c).filter(x => x.v < 2);
    const items = weak.map(x => { const g = S["g-" + x.k]; return { i: x.i, veredicto: x.v, faltas: g ? (g.claves || []).filter(y => y.estado !== "presente").map(faltaTxt) : [], errores: g ? errList(g).map(y => y.dijiste + (y.correcto ? " (lo correcto: " + y.correcto + ")" : "")) : [] }; });
    ARMANDO.add(c.n); finRender(c);
    try {
      const r = await fetch("/api/repaso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ materia: M.slug, clase: c.n, items }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "No se pudo armar el resumen.");
      S["fin-" + c.n] = { firma: firma(weak), data: d };
    } catch (e) { S["fin-" + c.n] = { error: e.message }; }
    finally { ARMANDO.delete(c.n); save(); finRender(c); }
  }
  function irDonde(n, titulo) {
    if (+current() !== +n || $("view-ruta").hidden) open(n);
    const hs = [...document.querySelectorAll("#view-ruta .read h2,#view-ruta .read h3,#view-ruta .read h4,#view-ruta .read h5")];
    const t = hs.find(h => norm(h.textContent) === norm(titulo)) || hs.find(h => norm(h.textContent).includes(norm(titulo)));
    const el = t || document.querySelector("#view-ruta .read"); if (!el) return;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    if (t) { t.classList.remove("flash"); void t.offsetWidth; t.classList.add("flash"); }
  }

  /* ---------- dictado ---------- */
  let rec = null;
  async function toggleRec(k, btn) {
    if (rec && rec.k === k) { rec.mr.stop(); return; }
    if (rec) return;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { $("out-" + k).innerHTML = `<p class="thinking">No pude usar el micrófono. Revisá el permiso del navegador.</p>`; return; }
    const mr = new MediaRecorder(stream), chunks = [];
    rec = { k, mr };
    btn.setAttribute("aria-pressed", "true"); btn.lastElementChild.textContent = "Detener";
    mr.ondataavailable = e => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop()); rec = null;
      btn.setAttribute("aria-pressed", "false"); btn.lastElementChild.textContent = "Transcribiendo…"; btn.disabled = true;
      try {
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        const r = await fetch("/api/transcribir", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || "No se pudo transcribir.");
        const ta = $("ta-" + k); ta.value = (ta.value.trim() ? ta.value.trim() + " " : "") + d.texto.trim();
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (e) { $("out-" + k).innerHTML = `<p class="thinking">${esc(e.message)}</p>`; }
      finally { btn.disabled = false; btn.lastElementChild.textContent = "Dictar"; }
    };
    mr.start();
  }

  /* ---------- horario, terminal, repaso ---------- */
  function horario() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const label = s => { const [y, m, d] = s.split("-").map(Number), dt = new Date(y, m - 1, d); return { dt, txt: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][dt.getDay()] + " " + d + "/" + m }; };
    const rows = (M.plan || []).map(p => {
      const { dt, txt } = label(p.fecha), cls = dt.getTime() === today.getTime() ? "today" : dt < today ? "past" : "";
      const sts = (p.clases || []).map(n => { const c = byN(n); return c ? `<button data-open="${n}" class="${done(c) ? "done" : ""}">${roundel(c)}${esc(c.corto || c.titulo)}</button>` : ""; }).join("");
      return `<tr class="${cls} ${p.libre ? "off" : ""}"><td class="d">${txt}</td><td>${esc(p.texto)}${sts ? `<div class="sts">${sts}</div>` : ""}</td><td class="h">${esc(p.horas || "")}</td></tr>`;
    }).join("");
    $("view-horario").innerHTML = `<h2>Horario hasta el examen</h2>` + (rows ? `<div class="tt-wrap"><table class="tt"><thead><tr><th>Día</th><th>Qué hacer</th><th>Tiempo</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="empty">Esta materia todavía no tiene un plan por días. Agregalo en el campo "plan" de materia.json.</p>`);
  }
  function terminal() {
    const exam = M.examen || {};
    $("view-terminal").innerHTML = `<h2>Terminal: ${esc(exam.nombre || "el examen")}</h2><p class="lead">Cuando termines las estaciones, integrá todo con el material general y practicá en formato real.</p>
    <ul class="board">${(M.general || []).map(g => `<li><span class="k">${esc(g.etiqueta)}</span><div><a href="${esc(fileUrl(g.url))}" target="_blank" rel="noopener">${esc(g.titulo)}</a>${g.nota ? `<p>${esc(g.nota)}</p>` : ""}</div></li>`).join("")}
    ${M.cuaderno ? `<li><span class="k">Cuaderno completo</span><div><a href="${esc(M.cuaderno)}" target="_blank" rel="noopener">Abrir NotebookLM</a><p>Para hacerle preguntas al material.</p></div></li>` : ""}</ul>
    ${M.como_responder_md ? `<details class="howto" open><summary>Cómo responder el examen</summary><div class="read">${md(M.como_responder_md)}</div></details>` : ""}`;
  }
  const srList = () => { const w = []; for (const c of M.clases) (c.preguntas || []).forEach((q, i) => { const k = "h" + c.n + "-" + i, sr = S["sr-" + k]; if (sr) w.push({ c, q, i, k, sr, v: S["r-" + k] }); }); return w.sort((a, b) => a.sr.vence - b.sr.vence); };
  function weakCount() {
    const n = srList().filter(x => x.sr.vence <= Date.now()).length;
    $("weakCount").textContent = n ? `· ${n}` : "";
    if (M) document.title = (n ? `(${n}) ` : "") + M.titulo + " · Subte Estudio";
  }
  function repaso() {
    const now = Date.now(), w = srList(), ya = w.filter(x => x.sr.vence <= now), luego = w.filter(x => x.sr.vence > now);
    const fins = M.clases.filter(c => S["fin-" + c.n] && S["fin-" + c.n].data);
    const item = (x, ahora) => `<li>${roundel(x.c)}<div><span class="tag t${x.v === 1 ? 1 : 0}">Clase ${x.c.n} · repaso ${x.sr.paso + 1} de ${INTERVALOS.length}${ahora ? "" : " · " + cuando(x.sr.vence - now)}</span><b>${esc(x.q.pregunta)}</b><div class="acts">${ahora ? `<button data-goq="${x.k}" data-nuevo="1">Responder ahora</button>` : ""}${dondeLink(x.q, x.c.n)}${x.c.audio ? `<a href="${esc(x.c.audio.url)}" target="_blank" rel="noopener">Escuchar el audio</a>` : ""}</div></div></li>`;
    const aprendidas = Object.keys(S).filter(k => k.startsWith("ok-")).length;
    $("view-repaso").innerHTML = `<h2>Para repasar</h2>
      <p class="lead">Cada pregunta que te sale mal o a medias vuelve <b>1 hora</b> después. Si cuando vuelve te sale bien, la próxima vez vuelve al <b>día siguiente</b>, después a los <b>3 días</b> y después a la <b>semana</b>. Si te sale bien las cuatro veces, queda aprendida. Si te sale mal en cualquiera, vuelve a empezar desde 1 hora.</p>
      <h3 class="sec">Te toca ahora · ${ya.length}</h3>` +
      (ya.length ? `<ul class="weak">${ya.map(x => item(x, true)).join("")}</ul>` : `<p class="empty">No tenés repasos pendientes ahora.${luego.length ? ` El próximo es ${cuando(luego[0].sr.vence - now)}.` : ""}</p>`) +
      (luego.length ? `<h3 class="sec">Próximos repasos · ${luego.length}</h3><ul class="weak">${luego.map(x => item(x, false)).join("")}</ul>` : "") +
      (aprendidas ? `<p class="lead">Preguntas aprendidas: ${aprendidas}.</p>` : "") +
      (fins.length ? `<h3 class="sec">Resúmenes de tus errores</h3><ul class="weak">${fins.map(c => { const d = S["fin-" + c.n].data; return `<li>${roundel(c)}<div><span class="tag">Clase ${c.n} · ${esc(c.titulo)}</span><b>${esc(d.diagnostico)}</b><p class="temas">Reforzar: ${esc((d.reforzar || []).map(x => x.tema).join(" · "))}</p><div class="acts"><button data-gofin="${c.n}">Leer el resumen completo</button></div></div></li>`; }).join("")}</ul>` : "");
  }

  /* ---------- mis apuntes ---------- */
  function apuntes() {
    const cs = M.clases.filter(c => (S["nota-" + c.n] || "").trim());
    $("view-apuntes").innerHTML = `<div class="ap-head"><h2>Mis apuntes</h2>${cs.length ? `<button class="btn" data-notas="bajar">Descargar todo (.md)</button>` : ""}</div>
      <p class="lead">Lo que escribiste en cada estación, todo junto para repasar antes del examen.</p>` +
      (cs.length ? cs.map(c => `<section class="ap-clase"><div class="ap-t">${roundel(c)}<h3>Clase ${c.n} · ${esc(c.titulo)}</h3><button class="btn ghost" data-notas="editar" data-n="${c.n}">Editar</button></div><div class="read">${md(S["nota-" + c.n])}</div></section>`).join("")
        : `<p class="empty">Todavía no escribiste apuntes. En cada estación, a la derecha (o en el botón "Mis apuntes" en el celular), tenés dónde escribir lo esencial.</p>`);
  }
  function bajarApuntes() {
    const txt = `# Mis apuntes · ${M.titulo}\n\n` + M.clases.filter(c => (S["nota-" + c.n] || "").trim()).map(c => `## Clase ${c.n} · ${c.titulo}\n\n${S["nota-" + c.n].trim()}\n`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/markdown" })); a.download = `apuntes-${M.slug}.md`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function notas(accion, n) {
    if (accion === "abrir") { if (matchMedia("(max-width:980px)").matches) document.body.classList.add("notas-abiertas"); const ta = document.querySelector("[data-nota]"); if (ta) ta.focus(); }
    if (accion === "cerrar") document.body.classList.remove("notas-abiertas");
    if (accion === "bajar") bajarApuntes();
    if (accion === "editar") { open(n, "nota-" + n); notas("abrir"); }
  }
  /* Seleccionar texto del resumen muestra "Explicame" y "A mis apuntes" al lado de la selección. */
  const selBar = document.createElement("div");
  selBar.className = "sel-bar"; selBar.hidden = true;
  selBar.innerHTML = `<button data-sel="explicar">Explicame</button><button data-sel="nota">A mis apuntes</button>`;
  document.body.appendChild(selBar);
  const seleccionResumen = () => {
    const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0), box = document.querySelector("#view-ruta .read");
    return box && box.contains(r.commonAncestorContainer) && sel.toString().trim() ? r : null;
  };
  let selT;
  document.addEventListener("selectionchange", () => {
    clearTimeout(selT);
    selT = setTimeout(() => {
      const r = seleccionResumen(); if (!r) { selBar.hidden = true; return; }
      selBar.querySelector('[data-sel="explicar"]').hidden = !ST.corrector;
      const b = r.getBoundingClientRect();
      selBar.style.top = (b.bottom + scrollY + 8) + "px";
      selBar.style.left = Math.max(8, Math.min(innerWidth - 250, b.left + scrollX)) + "px";
      selBar.hidden = false;
    }, 120);
  });
  selBar.addEventListener("mousedown", e => e.preventDefault());  // no perder la selección
  function agregarNota(linea) {
    const ta = document.querySelector("[data-nota]"); if (!ta || !linea) return;
    const v = ta.value; ta.value = (v && !v.endsWith("\n") ? v + "\n" : v) + "- " + linea + "\n";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.scrollTop = ta.scrollHeight;
    ta.classList.remove("flash"); void ta.offsetWidth; ta.classList.add("flash");
    const ok = $("notasOk"); if (ok) ok.textContent = "Agregado";
  }
  selBar.addEventListener("click", e => {
    const b = e.target.closest("[data-sel]"); if (!b) return;
    const sel = getSelection(), txt = sel.toString().replace(/\s+/g, " ").trim();
    sel.removeAllRanges(); selBar.hidden = true;
    if (b.dataset.sel === "nota") agregarNota(txt);
    else explicar(txt);
  });

  /* ---------- explicame ---------- */
  let EX = null;  // { n, texto, hist: [{p, r, data}] }
  const exPanel = document.createElement("aside");
  exPanel.className = "explica"; exPanel.hidden = true; exPanel.setAttribute("aria-label", "Explicación");
  document.body.appendChild(exPanel);
  function pintarEx() {
    if (!EX) { exPanel.hidden = true; document.body.classList.remove("con-explica"); return; }
    const corto = EX.texto.length > 220 ? EX.texto.slice(0, 220) + "…" : EX.texto;
    const bloque = (h, k) => {
      if (h.error) return `<p class="thinking">${esc(h.error)}</p>`;
      if (!h.data) return `<p class="thinking">Pensando…</p>`;
      const d = h.data;
      return `<p class="ex-frase">${esc(d.en_una_frase)}</p>${d.explicacion ? `<div class="ex-txt">${md(d.explicacion)}</div>` : ""}${d.ejemplo ? `<p class="ex-ej"><b>Ejemplo.</b> ${esc(d.ejemplo)}</p>` : ""}<button class="lk" data-ex="nota" data-k="${k}">Agregar a mis apuntes</button>`;
    };
    exPanel.innerHTML = `<div class="ex-head"><h3>Explicame</h3><button class="ex-x" data-ex="cerrar">Cerrar</button></div>
      <blockquote>${esc(corto)}</blockquote>
      <div class="ex-body">${EX.hist.map((h, k) => (h.p ? `<p class="ex-q">${esc(h.p)}</p>` : "") + bloque(h, k)).join("")}</div>
      <form class="ex-form"><input type="text" placeholder="Preguntá algo más sobre esto…" aria-label="Otra pregunta sobre el fragmento" ${EX.hist.some(h => !h.data && !h.error) ? "disabled" : ""}><button class="btn" type="submit">Preguntar</button></form>`;
    exPanel.hidden = false; document.body.classList.add("con-explica");
    const body = exPanel.querySelector(".ex-body"); body.scrollTop = body.scrollHeight;
  }
  async function explicar(texto, pregunta) {
    if (!texto) return;
    if (!pregunta) EX = { n: current(), texto, hist: [] };
    const h = { p: pregunta || "", data: null }; EX.hist.push(h); pintarEx();
    const yo = EX;
    try {
      const historial = EX.hist.filter(x => x.data).map(x => ({ p: x.p || "(explicación inicial)", r: x.data.en_una_frase + " " + x.data.explicacion }));
      const r = await fetch("/api/explicar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ materia: M.slug, clase: EX.n, texto: EX.texto, pregunta: pregunta || "", historial }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "No se pudo explicar.");
      h.data = d;
    } catch (e) { h.error = e.message; }
    if (EX === yo) pintarEx();
  }
  exPanel.addEventListener("click", e => {
    const b = e.target.closest("[data-ex]"); if (!b) return;
    if (b.dataset.ex === "cerrar") { EX = null; pintarEx(); }
    if (b.dataset.ex === "nota") { const d = EX.hist[+b.dataset.k].data; agregarNota(d.en_una_frase); b.textContent = "Agregado a tus apuntes"; b.disabled = true; }
  });
  exPanel.addEventListener("submit", e => {
    e.preventDefault(); const i = exPanel.querySelector("input"), q = i.value.trim();
    if (q && EX) explicar(EX.texto, q);
  });

  async function ayuda() {
    const v = $("view-ayuda"); if (v.dataset.ok) return;
    try { const r = await fetch("/app/ayuda.md"); if (!r.ok) throw 0; v.innerHTML = `<div class="read">${md(await r.text())}</div>`; v.dataset.ok = 1; }
    catch (e) { v.innerHTML = `<p class="empty">No se pudo cargar la guía.</p>`; }
  }

  /* ---------- navegación ---------- */
  function show(view) {
    document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === view)));
    for (const v of ["ruta", "horario", "terminal", "repaso", "apuntes", "ayuda"]) $("view-" + v).hidden = v !== view;
    if (view === "horario") horario(); if (view === "terminal") terminal(); if (view === "repaso") repaso(); if (view === "apuntes") apuntes(); if (view === "ayuda") ayuda();
    S.view = view; save();
  }
  function open(n, to) {
    S.open = +n; save(); show("ruta"); station(); diagram();
    const t = to ? $(to) : document.querySelector(".tabs"); if (t) t.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }
  document.addEventListener("click", e => {
    const t = e.target.closest("button,[data-open],[data-view-go]"); if (!t || !M) return;
    if (t.dataset.view) return show(t.dataset.view);
    if (t.dataset.open) return open(t.dataset.open);
    if (t.dataset.viewGo) { show(t.dataset.viewGo); document.querySelector(".tabs").scrollIntoView({ block: "start" }); return; }
    if (t.dataset.ref) { const r = $("ref-" + t.dataset.ref); r.hidden = !r.hidden; t.setAttribute("aria-expanded", String(!r.hidden)); t.textContent = r.hidden ? "Ver respuesta de referencia" : "Ocultar respuesta de referencia"; return; }
    if (t.dataset.rate) { const k = "r-" + t.dataset.rate, v = +t.dataset.v; S[k] = S[k] === v ? undefined : v; if (S[k] === v) marcar(t.dataset.rate, v); save(); document.querySelectorAll(`[data-rate="${t.dataset.rate}"]`).forEach(b => b.setAttribute("aria-pressed", String(S[k] === +b.dataset.v))); weakCount(); finRender(kq(t.dataset.rate).c); return; }
    if (t.dataset.grade) return grade(t.dataset.grade, t);
    if (t.dataset.rec) return toggleRec(t.dataset.rec, t);
    if (t.dataset.dunno) {
      const k = t.dataset.dunno; S["r-" + k] = 0; S["u-" + k] = 1; marcar(k, 0); save(); $("ref-" + k).hidden = false;
      const rb = document.querySelector(`[data-ref="${k}"]`); if (rb) { rb.disabled = false; rb.setAttribute("aria-expanded", "true"); rb.textContent = "Ocultar respuesta de referencia"; }
      document.querySelectorAll(`[data-rate="${k}"]`).forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.v === 0))); weakCount(); finRender(kq(k).c); return;
    }
    if (t.dataset.notas) return notas(t.dataset.notas, t.dataset.n);
    if (t.dataset.escuchar) return Lector.empezar({ read: document.querySelector("#view-ruta .read"), slug: M.slug, motores: ST.voz_motores, clases: M.clases, md });
    if (t.dataset.donde) return irDonde(t.dataset.dondeC, t.dataset.donde);
    if (t.dataset.fin) return armarFin(byN(t.dataset.fin));
    if (t.dataset.gofin) return open(t.dataset.gofin, "fin-" + t.dataset.gofin);
    if (t.dataset.goq && t.dataset.nuevo) { const k = t.dataset.goq; delete S["a-" + k]; delete S["g-" + k]; delete S["u-" + k]; save(); }
    if (t.dataset.goq) { const n = +t.dataset.goq.slice(1).split("-")[0]; return open(n, "q-" + t.dataset.goq); }
  });
  document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".st")) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); } });
  document.addEventListener("change", e => {
    if (e.target.id === "materiaSel") { location.search = "?m=" + e.target.value; return; }
    if (e.target.matches(".stops input,.steps-plain input")) {
      const c = byN(+((e.target.id.match(/^c(\d+)-/) || [])[1] || 0)), was = c ? done(c) : false;
      S[e.target.id] = e.target.checked; save(); if (c && !was && done(c)) JUST = c.n; sign(); diagram();
    }
  });
  document.addEventListener("input", e => {
    if (e.target.dataset.nota) {
      const n = e.target.dataset.nota; S["nota-" + n] = e.target.value; save();
      const ok = $("notasOk"); if (ok) { ok.textContent = "Guardado"; clearTimeout(ok._t); ok._t = setTimeout(() => { ok.textContent = ""; }, 1500); }
      return;
    }
    const k = e.target.dataset.draft; if (!k) return;
    S["a-" + k] = e.target.value; save();
    const n = words(e.target.value), w = $("w-" + k); if (w) w.textContent = n ? n + " palabras" : "";
    const rb = document.querySelector(`[data-ref="${k}"]`); if (rb && !S["u-" + k]) rb.disabled = n < 8;
  });
  let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => M && diagram(), 120); });

  /* ---------- arranque ---------- */
  async function boot() {
    const [lista, estado] = await Promise.all([fetch("/api/materias").then(r => r.json()), fetch("/api/estado").then(r => r.json()).catch(() => ({}))]);
    ST = estado || {};
    if (!lista.length) { $("view-ruta").innerHTML = `<div class="panel station-main"><p>No hay materias en la carpeta <code>materias/</code>. Creá una con el flujo de agentes del README.</p></div>`; return; }
    const want = new URLSearchParams(location.search).get("m"), slug = (lista.find(m => m.slug === want) || lista.find(m => m.slug !== "ejemplo") || lista[0]).slug;
    if (lista.length > 1) { $("materiaSel").hidden = false; $("materiaSel").innerHTML = lista.map(m => `<option value="${m.slug}" ${m.slug === slug ? "selected" : ""}>${esc(m.titulo)}</option>`).join(""); }
    M = await fetch("/api/materia/" + slug).then(r => r.json());
    KEY = "subte-" + slug; try { S = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { S = {}; }
    const disco = await fetch("/api/progreso/" + slug).then(r => r.json()).then(d => d.datos).catch(() => null);
    const subir = !disco && Object.keys(S).length > 0;
    if (disco && (disco._t || 0) >= (S._t || 0)) S = disco;
    // Preguntas mal o a medias de antes del repaso espaciado: tocan ahora.
    for (const c of M.clases) (c.preguntas || []).forEach((q, i) => { const k = "h" + c.n + "-" + i; if ((S["r-" + k] === 0 || S["r-" + k] === 1) && !S["sr-" + k]) S["sr-" + k] = { paso: 0, vence: Date.now() }; });
    if (subir || (S._t || 0) > ((disco && disco._t) || 0)) save();
    $("brandName").textContent = "Red de estudio · " + M.titulo; $("disc").textContent = (M.titulo.match(/\p{L}+/gu) || ["S"]).map(w => w[0]).join("").slice(0, 2).toUpperCase();
    $("tabTerminal").textContent = "Terminal: " + ((M.examen && M.examen.nombre) || "examen").toLowerCase();
    FOOT = "Tu progreso se guarda solo en la carpeta progreso/ del proyecto, con una copia por día." + (ST.corrector ? ` Corrector: ${ST.proveedor === "gemini" ? "Gemini" : "Ollama · " + ST.modelo}.` : " Corrector apagado: revisá Ollama o la configuración.");
    $("foot").textContent = FOOT;
    applyLines(); sign(); station(); diagram(); weakCount();
    setInterval(() => { weakCount(); if (!$("view-repaso").hidden) repaso(); }, 6e4);
    if (S.view && S.view !== "ruta") show(S.view);
  }
  boot();
})();
