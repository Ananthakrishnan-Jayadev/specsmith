/**
 * Builders for Confluence "storage format" (XHTML). Every piece of text that
 * comes from data MUST go through escapeXml: column names and descriptions are
 * untrusted input.
 */

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface Cell {
  text: string;
  /** Yellow highlight = not verified (tbd / ai / derived needing review). */
  highlight?: boolean;
}

/** One highlighted cell, in the markup the Confluence editor itself produces. */
function td(cell: Cell): string {
  const attrs = cell.highlight ? ' class="highlight-#fff0b3" data-highlight-colour="#fff0b3"' : '';
  return `<td${attrs}><p>${escapeXml(cell.text)}</p></td>`;
}

export function table(headers: string[], rows: Cell[][]): string {
  const head = `<tr>${headers.map((h) => `<th><p><strong>${escapeXml(h)}</strong></p></th>`).join('')}</tr>`;
  const body = rows.map((r) => `<tr>${r.map(td).join('')}</tr>`).join('');
  return `<table data-layout="default"><tbody>${head}${body}</tbody></table>`;
}

export function paragraph(text: string): string {
  return `<p>${escapeXml(text)}</p>`;
}

export function heading(level: 1 | 2 | 3, text: string): string {
  return `<h${level}>${escapeXml(text)}</h${level}>`;
}

/** Embeds an image attached to the same page. */
export function attachedImage(filename: string): string {
  return `<ac:image><ri:attachment ri:filename="${escapeXml(filename)}" /></ac:image>`;
}
