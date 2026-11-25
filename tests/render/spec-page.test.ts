import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { profileRows } from '../../src/profile/profiler';
import { buildFileSpec } from '../../src/spec/build';
import { editField } from '../../src/spec/edit';
import { fileTitle, parentTitle, renderFilePage, renderParentPage } from '../../src/render/spec-page';
import { COLOURS } from '../../src/render/storage';

const spec = () => buildFileSpec(profileRows('customers.csv', [['cust_id', 'email', '<b>x</b>'], ['C1', 'a@x.io', '1'], ['C2', 'b@x.io', '2']]), defaultConfig);

describe('renderFilePage', () => {
  it('is deterministic for the same spec', () => {
    expect(renderFilePage('Retail', spec())).toBe(renderFilePage('Retail', spec()));
  });

  it('colours cells by source and escapes data', () => {
    const html = renderFilePage('Retail', spec());
    expect(html).toContain(`data-highlight-colour="${COLOURS.grey}"><p><code>customer_id</code>`); // derived
    expect(html).toContain(`data-highlight-colour="${COLOURS.yellow}"><p>TBD</p>`); // description tbd
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('shows reviewer values without colour', () => {
    const edited = editField(spec(), 'cust_id', 'description', 'Customer identifier');
    expect(renderFilePage('Retail', edited)).toContain('<td><p>Customer identifier</p></td>');
  });
});

describe('renderParentPage', () => {
  it('summarises files and lists children', () => {
    const html = renderParentPage('Retail', [spec()]);
    expect(html).toContain('ac:name="children"');
    expect(html).toContain('<code>customers.csv</code>');
  });

  it('builds titles', () => {
    expect(parentTitle('Retail')).toBe('Retail: Feed Spec');
    expect(fileTitle('Retail', spec())).toBe('Retail: customers');
  });
});
