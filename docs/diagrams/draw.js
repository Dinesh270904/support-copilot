const q = new URLSearchParams(location.search).get('d');
const W = 1800, H = q === 'arch' ? 1075 : 650;
const svg = document.getElementById('s'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
const rc = rough.svg(svg); const NS = 'http://www.w3.org/2000/svg';
const INK = '#2b2b2b';
let seed = 7; const nxt = () => (seed += 11);
const add = (n) => svg.appendChild(n);
function text(x, y, s, o = {}) { const t = document.createElementNS(NS, 'text'); t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('font-size', o.size || 26); t.setAttribute('font-weight', o.bold ? 700 : 500); t.setAttribute('fill', o.color || INK); t.setAttribute('text-anchor', o.anchor || 'start'); if (o.rot) t.setAttribute('transform', `rotate(${o.rot} ${x} ${y})`); t.textContent = s; add(t); }
function lines(x, y, arr, o = {}) { arr.forEach((s, i) => text(x, y + i * (o.lh || 28), s, o)); }
function box(x, y, w, h, o = {}) { add(rc.rectangle(x, y, w, h, { stroke: o.stroke || INK, strokeWidth: o.sw || 2.2, roughness: o.r || 1.5, bowing: 1.6, fill: o.fill, fillStyle: o.fillStyle || 'solid', seed: nxt() })); }
function cyl(x, y, w, h, o = {}) { const ry = 26; add(rc.ellipse(x + w / 2, y + ry, w, ry * 2, { stroke: INK, strokeWidth: 2.2, roughness: 1.4, fill: o.fill, fillStyle: 'solid', seed: nxt() })); add(rc.line(x, y + ry, x, y + h - ry, { stroke: INK, strokeWidth: 2.2, roughness: 1.4, seed: nxt() })); add(rc.line(x + w, y + ry, x + w, y + h - ry, { stroke: INK, strokeWidth: 2.2, roughness: 1.4, seed: nxt() })); add(rc.arc(x + w / 2, y + h - ry, w, ry * 2, 0, Math.PI, false, { stroke: INK, strokeWidth: 2.2, roughness: 1.4, fill: o.fill, fillStyle: 'solid', seed: nxt() })); }
function arrow(pts, o = {}) {
  const opt = { stroke: o.color || INK, strokeWidth: o.sw || 2.6, roughness: 1.3, seed: nxt(), strokeLineDash: o.dash ? [10, 9] : undefined };
  for (let i = 0; i < pts.length - 1; i++) add(rc.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], opt));
  const [x1, y1] = pts[pts.length - 2], [x2, y2] = pts[pts.length - 1]; const a = Math.atan2(y2 - y1, x2 - x1), L = 17;
  [0.45, -0.45].forEach((d) => add(rc.line(x2, y2, x2 - L * Math.cos(a - d), y2 - L * Math.sin(a - d), { stroke: o.color || INK, strokeWidth: o.sw || 2.6, roughness: 1, seed: nxt() })));
}
function note(x, y, w, h, arr, o = {}) { const g = document.createElementNS(NS, 'g'); if (o.rot) g.setAttribute('transform', `rotate(${o.rot} ${x + w / 2} ${y + h / 2})`); svg.appendChild(g); const keep = svg; const push = (n) => g.appendChild(n); const sv = (n) => push(n);
  g.appendChild(rc.rectangle(x, y, w, h, { stroke: '#8a7a1c', strokeWidth: 1.8, roughness: 1.2, fill: o.fill || '#fff3a6', fillStyle: 'solid', seed: nxt() }));
  arr.forEach((s, i) => { const t = document.createElementNS(NS, 'text'); t.setAttribute('x', x + 14); t.setAttribute('y', y + 34 + i * 29); t.setAttribute('font-size', 25); t.setAttribute('font-weight', 500); t.setAttribute('fill', '#4a4210'); t.textContent = s; g.appendChild(t); }); }
function squiggle(x, y, w) { let d = `M ${x} ${y}`; for (let i = 0; i < w; i += 20) d += ` q 5 -9 10 0 t 10 0`; const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('stroke', '#d2552b'); p.setAttribute('stroke-width', 3); p.setAttribute('fill', 'none'); add(p); }
const COL = { ui: '#dbeafe', api: '#dcfce7', mcp: '#ede9fe', db: '#ffe4cc', sub: '#ffffff' };

if (q === 'arch') {
  text(40, 62, 'Support Copilot: how the pieces fit', { size: 52, bold: true }); squiggle(42, 82, 640);
  text(40, 118, 'local · offline · no LLM · every answer quotes its sources', { size: 30, color: '#555' });
  // Browser
  box(30, 150, 400, 700, { fill: COL.ui }); text(50, 195, 'Browser', { size: 38, bold: true }); text(50, 228, 'React 19 · TypeScript · Vite', { size: 25, color: '#444' });
  [['Queue', 'views · filters · sort', 260], ['Ticket', 'description · timeline · review', 405], ['Copilot panel', 'brief · similar tickets · Ask', 550]].forEach(([a, b, y]) => { box(52, y, 356, 118, { fill: COL.sub, r: 1.3 }); text(70, y + 44, a, { size: 32, bold: true }); text(70, y + 80, b, { size: 25, color: '#555' }); });
  text(52, 718, 'answer cards: quoted sentences,', { size: 25, color: '#333' }); text(52, 746, '[KB-03#chunk-1] markers, scores,', { size: 25, color: '#333' }); text(52, 774, 'tool trace · editable draft: not sent', { size: 25, color: '#333' }); text(52, 822, 'tests: Vitest + Playwright', { size: 24, color: '#777' });
  // FastAPI
  box(560, 150, 470, 700, { fill: COL.api }); text(582, 195, 'FastAPI', { size: 38, bold: true }); text(582, 228, 'Pydantic contracts · :8000', { size: 25, color: '#444' });
  [['1  validate', 'enum · ids · ≤ 500 chars → 422', 258, 100], ['2  fixed tool plan', 'one plan per action; content never changes it', 378, 100], ['3  MCP client', 'official SDK · stdio · 15 s timeout', 498, 100], ['4  compose', 'quote sentences + chunk IDs, or', 618, 100]].forEach(([a, b, y, h]) => { const c = a.includes('compose'); box(582, y, 426, h, { fill: COL.sub, r: 1.3 }); text(600, y + (c ? 34 : 40), a, { size: 29, bold: true }); text(600, y + (c ? 62 : 76), b, { size: 23, color: '#555' }); if (c) text(600, y + 88, '"not enough evidence"', { size: 23, color: '#555' }); });
  text(582, 748, 'writes (the only ones):', { size: 25, bold: true }); text(582, 778, 'mark reviewed · run log (ids,', { size: 24, color: '#333' }); text(582, 806, 'durations, never ticket text)', { size: 24, color: '#333' });
  // MCP server
  box(1170, 150, 330, 700, { fill: COL.mcp }); text(1190, 195, 'MCP server', { size: 38, bold: true }); text(1190, 228, 'separate process · mcp SDK', { size: 25, color: '#444' });
  box(1190, 258, 290, 190, { fill: COL.sub, r: 1.3 }); text(1206, 296, '4 read-only tools', { size: 28, bold: true }); lines(1206, 330, ['get_ticket', 'search_knowledge', 'search_resolved_tickets', 'count_tickets'], { size: 23, color: '#444', lh: 27 });
  box(1190, 466, 290, 100, { fill: COL.sub, r: 1.3 }); text(1206, 504, '2 resource templates', { size: 27, bold: true }); text(1206, 536, 'tickets/{id} · knowledge/{id}', { size: 22, color: '#444' });
  box(1190, 584, 290, 112, { fill: COL.sub, r: 1.3 }); text(1206, 622, 'TF-IDF + cosine', { size: 28, bold: true }); lines(1206, 654, ['index in memory,', 'min score 0.15 + 2 rules'], { size: 22, color: '#444', lh: 26 });
  box(1190, 714, 290, 112, { fill: COL.sub, r: 1.3 }); text(1206, 752, 'FTS5 bm25', { size: 28, bold: true }); lines(1206, 784, ['similar resolved', 'tickets (relevance floor)'], { size: 22, color: '#444', lh: 26 });
  // SQLite
  cyl(1600, 330, 170, 330, { fill: COL.db }); text(1685, 438, 'SQLite', { size: 36, bold: true, anchor: 'middle' }); lines(1685, 478, ['tickets', 'messages', 'articles', 'chunks', 'FTS5 index', 'run log'], { size: 23, anchor: 'middle', color: '#444', lh: 27 });
  // arrows
  arrow([[432, 440], [558, 440]], { sw: 3.2 }); text(440, 410, 'HTTP · JSON', { size: 26, bold: true }); text(440, 478, 'assistant/run', { size: 21, color: '#555' }); text(440, 502, 'tickets', { size: 21, color: '#555' });
  arrow([[1032, 548], [1168, 548]], { sw: 3.2 }); text(1040, 518, 'stdio', { size: 28, bold: true }); text(1038, 584, 'tools/call', { size: 21, color: '#555' }); text(1038, 606, 'JSON-RPC', { size: 21, color: '#555' });
  arrow([[1502, 480], [1598, 480]], { sw: 3.2 }); text(1506, 452, 'read-only', { size: 24, bold: true }); text(1503, 516, 'mode=ro', { size: 21, color: '#555' }); text(1503, 538, 'query_only', { size: 21, color: '#555' });
  arrow([[800, 852], [800, 1010], [1685, 1010], [1685, 662]], { dash: true, color: '#b3501f' }); text(880, 1048, 'the only writes: reviewed_at + run log (FastAPI, never MCP)', { size: 27, color: '#b3501f', bold: true });
  // notes
  note(1180, 884, 360, 96, ['stdout = MCP frames only;', 'logs go to stderr'], { rot: -1.5 });
  note(40, 884, 440, 96, ['No LLM · no API keys · no network', 'after install. Runs offline.'], { rot: 1.2, fill: '#d9f5c8' });
  note(1560, 120, 215, 130, ['ticket text is', 'untrusted: flagged,', 'never followed'], { rot: 2, fill: '#ffd9d9' });
}

if (q === 'flow') {
  text(40, 62, 'One question, end to end', { size: 52, bold: true }); squiggle(42, 82, 520);
  text(40, 118, 'T-104 · "lost authenticator after replacing phone; backup code and enroll a new device"', { size: 30, color: '#555' });
  const steps = [
    ['1', 'You ask', ['POST /api/', 'assistant/run', 'ticket + query'], COL.ui],
    ['2', 'FastAPI', ['validate the body,', 'then pick the fixed', 'plan for the action'], COL.api],
    ['3', 'MCP client', ['tools/call over', 'stdio: get_ticket,', 'search_knowledge'], COL.api],
    ['4', 'MCP server', ['typed arguments,', 'read-only handle', 'on SQLite'], COL.mcp],
    ['5', 'Retrieve', ['TF-IDF cosine, top 3', 'min score 0.15', '+ coverage gates'], COL.mcp],
    ['6', 'Compose', ['quote sentences', '+ [chunk-id], or', '"not enough evidence"'], COL.api],
    ['7', 'Answer', ['sources + scores,', 'tool trace,', 'editable draft'], COL.ui],
  ];
  const bw = 200, gap = 44, x0 = 40, y0 = 190;
  steps.forEach(([n, a, ls, col], i) => {
    const x = x0 + i * (bw + gap); box(x, y0, bw, 250, { fill: col });
    add(rc.circle(x + 36, y0 + 36, 44, { stroke: INK, strokeWidth: 2.2, roughness: 1.2, fill: '#fff', fillStyle: 'solid', seed: nxt() })); text(x + 36, y0 + 46, n, { size: 30, bold: true, anchor: 'middle' });
    text(x + 68, y0 + 48, a, { size: 29, bold: true }); lines(x + 16, y0 + 118, ls, { size: 22, color: '#444', lh: 32 });
    if (i < steps.length - 1) arrow([[x + bw + 2, y0 + 125], [x + bw + gap - 3, y0 + 125]], { sw: 3 });
  });
  // return path
  arrow([[x0 + 6 * (bw + gap) + 100, y0 + 252], [x0 + 6 * (bw + gap) + 100, 520], [x0 + 100, 520], [x0 + 100, y0 + 254]], { dash: true, color: '#2f6fb5' });
  text(330, 506, 'answer, citations (source_id, title, excerpt, score), retrieval metadata, tool_calls, limitations', { size: 26, color: '#2f6fb5', bold: true });
  note(40, 548, 560, 70, ['Nothing is sent to a customer. The run is logged:', 'ids, tools, method, duration. Never the text.'], { rot: -0.8, fill: '#d9f5c8' });
  note(1000, 548, 760, 70, ['If nothing clears the gates the answer says so, with no citation.'], { rot: 0.8 });
}
document.fonts.ready.then(() => document.title = 'ready');
