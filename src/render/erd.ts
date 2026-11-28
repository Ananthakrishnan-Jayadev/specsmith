/**
 * ER diagram as a self-contained SVG (presentation attributes only, no CSS,
 * no scripts), so it renders identically in Confluence and in the app.
 * Shows each table's key columns; proposed relationships are dashed,
 * accepted ones solid; rejected ones are not drawn. Deterministic output.
 */
import type { FileSpec } from '../domain/spec';
import { isActive, type Relationship } from '../domain/relationship';
import { escapeXml } from './storage';

const W = 250, HEAD = 30, ROW = 20, PAD = 8, GAP_X = 90, GAP_Y = 50, MARGIN = 44;
const C = { border: '#0c66e4', head: '#e9f2ff', text: '#172b4d', muted: '#626f86', line: '#44546f', bg: '#ffffff' };
const clip = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

interface Box {
  file: FileSpec;
  x: number;
  y: number;
  h: number;
  rows: { name: string; tag: 'PK' | 'FK' | '' }[];
}

export function renderErd(files: FileSpec[], relationships: Relationship[]): string {
  const rels = relationships.filter(isActive);
  const incoming = (f: FileSpec) => rels.filter((r) => r.toFile === f.fileName).length;
  const order = [...files].sort((a, b) => incoming(b) - incoming(a) || a.fileName.localeCompare(b.fileName));
  const cols = Math.min(3, Math.max(1, order.length));

  const boxes: Box[] = order.map((file) => {
    const fkCols = new Set(rels.filter((r) => r.fromFile === file.fileName).map((r) => r.fromColumn));
    const keyed = [...file.columns].sort((a, b) => a.position - b.position).filter((c) => c.primaryKey.value || fkCols.has(c.sourceName));
    const rows: Box['rows'] = keyed.map((c) => ({ name: c.targetName.value, tag: c.primaryKey.value ? 'PK' : 'FK' }));
    const others = file.columns.length - keyed.length;
    if (others > 0) rows.push({ name: `+ ${others} more column${others > 1 ? 's' : ''}`, tag: '' });
    return { file, x: 0, y: 0, h: HEAD + rows.length * ROW + PAD, rows };
  });

  let y = MARGIN;
  for (let i = 0; i < boxes.length; i += cols) {
    const rowBoxes = boxes.slice(i, i + cols);
    rowBoxes.forEach((b, j) => Object.assign(b, { x: MARGIN + j * (W + GAP_X), y }));
    y += Math.max(...rowBoxes.map((b) => b.h)) + GAP_Y;
  }
  const width = MARGIN * 2 + cols * W + (cols - 1) * GAP_X;
  const height = Math.max(y - GAP_Y + MARGIN, MARGIN * 2 + HEAD);

  const byFile = new Map(boxes.map((b) => [b.file.fileName, b]));
  const rowY = (b: Box, column: string, file: FileSpec) => {
    const target = file.columns.find((c) => c.sourceName === column)?.targetName.value;
    const idx = Math.max(0, b.rows.findIndex((r) => r.name === target));
    return b.y + HEAD + idx * ROW + ROW / 2 + 2;
  };

  const edges = rels.flatMap((r) => {
    const from = byFile.get(r.fromFile);
    const to = byFile.get(r.toFile);
    if (!from || !to) return [];
    const y1 = rowY(from, r.fromColumn, from.file);
    const y2 = rowY(to, r.toColumn, to.file);
    let d: string, x1: number, x2: number;
    if (from.x === to.x) {
      x1 = from.x; x2 = to.x;
      const out = from.x - 24;
      d = `M${x1} ${y1} H${out} V${y2} H${x2}`;
    } else {
      const right = from.x < to.x;
      x1 = right ? from.x + W : from.x;
      x2 = right ? to.x : to.x + W;
      const mid = Math.round((x1 + x2) / 2);
      d = `M${x1} ${y1} H${mid} V${y2} H${x2}`;
    }
    const dash = r.decision.value === 'accepted' ? '' : ' stroke-dasharray="6 4"';
    const barX = x2 + (x2 > x1 || from.x === to.x ? -6 : 6);
    return [
      `<path d="${d}" fill="none" stroke="${C.line}" stroke-width="1.5"${dash}/>`,
      `<circle cx="${x1}" cy="${y1}" r="3.5" fill="${C.bg}" stroke="${C.line}" stroke-width="1.5"/>`,
      `<line x1="${barX}" y1="${y2 - 6}" x2="${barX}" y2="${y2 + 6}" stroke="${C.line}" stroke-width="1.5"/>`,
    ];
  });

  const nodes = boxes.flatMap((b) => [
    `<rect x="${b.x}" y="${b.y}" width="${W}" height="${b.h}" rx="6" fill="${C.bg}" stroke="${C.border}" stroke-width="1.5"/>`,
    `<path d="M${b.x} ${b.y + HEAD} V${b.y + 6} Q${b.x} ${b.y} ${b.x + 6} ${b.y} H${b.x + W - 6} Q${b.x + W} ${b.y} ${b.x + W} ${b.y + 6} V${b.y + HEAD} Z" fill="${C.head}"/>`,
    `<text x="${b.x + 12}" y="${b.y + 20}" font-family="sans-serif" font-size="13" font-weight="bold" fill="${C.text}">${escapeXml(clip(b.file.tableName.value))}</text>`,
    `<text x="${b.x + W - 12}" y="${b.y + 20}" font-family="sans-serif" font-size="11" text-anchor="end" fill="${C.muted}">${b.file.rowCount.toLocaleString('en-US')} rows</text>`,
    ...b.rows.map((r, i) => {
      const ty = b.y + HEAD + i * ROW + ROW / 2 + 6;
      const tag = r.tag ? `<text x="${b.x + 12}" y="${ty}" font-family="monospace" font-size="10" font-weight="bold" fill="${C.border}">${r.tag}</text>` : '';
      return `${tag}<text x="${b.x + 40}" y="${ty}" font-family="monospace" font-size="12" fill="${r.tag ? C.text : C.muted}">${escapeXml(clip(r.name))}</text>`;
    }),
  ]);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Entity relationship diagram">
<rect width="${width}" height="${height}" fill="${C.bg}"/>
${[...edges, ...nodes].join('\n')}
</svg>
`;
}
