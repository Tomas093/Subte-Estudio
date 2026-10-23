/* Markdown mínimo para los resúmenes: encabezados, párrafos, listas anidadas,
   tablas, negrita, cursiva, código y enlaces. Escapa todo el HTML de entrada. */
(function () {
  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }
  function render(md) {
    const lines = String(md || "").replace(/\r/g, "").split("\n");
    let out = "", i = 0;
    const listItem = l => l.match(/^(\s*)([-*]|\d+[.)])\s+(.*)$/);
    function list(indent) {
      const first = listItem(lines[i]);
      const ordered = /\d/.test(first[2]);
      let html = ordered ? "<ol>" : "<ul>";
      while (i < lines.length) {
        const m = listItem(lines[i]);
        if (!m || m[1].length < indent) break;
        if (m[1].length > indent) { html = html.replace(/<\/li>$/, "") + list(m[1].length) + "</li>"; continue; }
        let text = m[3]; i++;
        while (i < lines.length && lines[i].trim() && !listItem(lines[i]) && /^\s+/.test(lines[i])) { text += " " + lines[i].trim(); i++; }
        html += "<li>" + inline(text) + "</li>";
        while (i < lines.length && !lines[i].trim() && listItem(lines[i + 1] || "")) i++;
      }
      return html + (ordered ? "</ol>" : "</ul>");
    }
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { i++; continue; }
      const h = l.match(/^(#{1,4})\s+(.*)$/);
      if (h) { const n = Math.min(4, h[1].length + 1); out += `<h${n}>${inline(h[2])}</h${n}>`; i++; continue; }
      if (/^\s*([-*]|\d+[.)])\s+/.test(l)) { out += list(l.match(/^\s*/)[0].length); continue; }
      if (/^\|.*\|\s*$/.test(l) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
        const row = r => r.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
        let t = "<table><thead><tr>" + row(l).map(c => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>";
        i += 2;
        while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { t += "<tr>" + row(lines[i]).map(c => `<td>${inline(c)}</td>`).join("") + "</tr>"; i++; }
        out += t + "</tbody></table>"; continue;
      }
      if (/^---+\s*$/.test(l)) { i++; continue; }
      let p = l.trim(); i++;
      while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s|^\s*([-*]|\d+[.)])\s+|^\|/.test(lines[i])) { p += " " + lines[i].trim(); i++; }
      out += "<p>" + inline(p) + "</p>";
    }
    return out;
  }
  window.renderMarkdown = render;
})();
