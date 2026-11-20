import { describe, expect, it } from 'vitest';
import { buildMultipart } from '../../src/platform/multipart';

describe('buildMultipart', () => {
  it('builds a well-formed body with fields and a file', () => {
    const { body, contentType } = buildMultipart(
      [{ field: 'file', filename: 'erd.svg', contentType: 'image/svg+xml', content: '<svg/>' }],
      { minorEdit: 'true' },
      'B',
    );
    expect(contentType).toBe('multipart/form-data; boundary=B');
    expect(body).toBe(
      '--B\r\nContent-Disposition: form-data; name="minorEdit"\r\n\r\ntrue\r\n' +
        '--B\r\nContent-Disposition: form-data; name="file"; filename="erd.svg"\r\nContent-Type: image/svg+xml\r\n\r\n<svg/>\r\n' +
        '--B--\r\n',
    );
  });

  it('neutralises quotes and newlines in filenames', () => {
    const { body } = buildMultipart([{ field: 'file', filename: 'a"\r\nb.svg', contentType: 'text/plain', content: '' }], {}, 'B');
    expect(body).toContain('filename="a___b.svg"');
  });
});
