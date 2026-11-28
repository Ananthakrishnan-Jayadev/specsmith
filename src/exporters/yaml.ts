/**
 * Minimal YAML writer for plain data (objects, arrays, strings, numbers,
 * booleans, null). Strings are always double-quoted JSON strings, which are
 * valid YAML scalars, so no column name or description can break the file.
 */
export type YamlValue = string | number | boolean | null | YamlValue[] | { [k: string]: YamlValue | undefined };

const KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const key = (k: string) => (KEY.test(k) ? k : JSON.stringify(k));
const scalar = (v: string | number | boolean | null) => (typeof v === 'string' ? JSON.stringify(v) : v === null ? 'null' : String(v));
const isScalar = (v: unknown): v is string | number | boolean | null => v === null || ['string', 'number', 'boolean'].includes(typeof v);

function lines(v: YamlValue, indent: number): string[] {
  const pad = ' '.repeat(indent);
  if (Array.isArray(v)) {
    if (v.length === 0) return [`${pad}[]`];
    return v.flatMap((item) => {
      if (isScalar(item)) return [`${pad}- ${scalar(item)}`];
      const inner = lines(item, indent + 2);
      return [`${pad}- ${(inner[0] ?? '').trimStart()}`, ...inner.slice(1)];
    });
  }
  if (isScalar(v)) return [`${pad}${scalar(v)}`];
  const entries = Object.entries(v).filter((e): e is [string, YamlValue] => e[1] !== undefined);
  if (entries.length === 0) return [`${pad}{}`];
  return entries.flatMap(([k, val]) => {
    if (isScalar(val)) return [`${pad}${key(k)}: ${scalar(val)}`];
    if (Array.isArray(val) && val.length === 0) return [`${pad}${key(k)}: []`];
    if (!Array.isArray(val) && Object.keys(val).length === 0) return [`${pad}${key(k)}: {}`];
    return [`${pad}${key(k)}:`, ...lines(val, indent + 2)];
  });
}

export function toYaml(v: YamlValue): string {
  return `${lines(v, 0).join('\n')}\n`;
}
