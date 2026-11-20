/**
 * Builds a multipart/form-data body by hand for text files (SVG, YAML, SQL).
 * We avoid FormData because Forge's product fetch doesn't document support for it.
 */
export interface MultipartFile {
  field: string;
  filename: string;
  contentType: string;
  content: string;
}

export function buildMultipart(
  files: MultipartFile[],
  fields: Record<string, string> = {},
  boundary = `specsmith-${Math.random().toString(36).slice(2)}`,
): { body: string; contentType: string } {
  const safe = (s: string) => s.replace(/["\r\n]/g, '_');
  const parts: string[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${safe(name)}"\r\n\r\n${value}\r\n`);
  }
  for (const f of files) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${safe(f.field)}"; filename="${safe(f.filename)}"\r\n` +
        `Content-Type: ${f.contentType}\r\n\r\n${f.content}\r\n`,
    );
  }
  parts.push(`--${boundary}--\r\n`);
  return { body: parts.join(''), contentType: `multipart/form-data; boundary=${boundary}` };
}
