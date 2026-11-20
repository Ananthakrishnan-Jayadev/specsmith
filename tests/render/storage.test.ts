import { describe, expect, it } from 'vitest';
import { attachedImage, escapeXml, table } from '../../src/render/storage';

describe('escapeXml', () => {
  it('escapes markup and quotes so data cannot inject storage-format tags', () => {
    expect(escapeXml(`<ac:macro x="1">'&'</ac:macro>`)).toBe(
      '&lt;ac:macro x=&quot;1&quot;&gt;&#39;&amp;&#39;&lt;/ac:macro&gt;',
    );
  });
});

describe('table', () => {
  it('renders headers, escapes cells and highlights unverified cells', () => {
    const xml = table(['Column', 'Type'], [[{ text: 'cust_id' }, { text: 'string<9>', highlight: true }]]);
    expect(xml).toContain('<th><p><strong>Column</strong></p></th>');
    expect(xml).toContain('<td><p>cust_id</p></td>');
    expect(xml).toContain('data-highlight-colour="#fff0b3"><p>string&lt;9&gt;</p></td>');
  });
});

describe('attachedImage', () => {
  it('references the attachment by escaped filename', () => {
    expect(attachedImage('a"b.svg')).toBe('<ac:image><ri:attachment ri:filename="a&quot;b.svg" /></ac:image>');
  });
});
