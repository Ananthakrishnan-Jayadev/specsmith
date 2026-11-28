import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultConfig } from '../../src/config';
import { createProfiler } from '../../src/profile/profiler';
import { buildFileSpec } from '../../src/spec/build';
import type { FileSpec } from '../../src/domain/spec';
import { parseCsv } from './csv';

export const DEMO_FILES = ['accounts.csv', 'cards.csv', 'customers.csv', 'transactions.csv'];

export function demoSpec(version: 'v1' | 'v2', file: string): FileSpec {
  const text = readFileSync(join(__dirname, '../../demo-data/retail-accounts', version, file), 'utf8');
  const [header = [], ...rows] = parseCsv(text);
  const p = createProfiler(header, { nullTokens: defaultConfig.types.nullTokens, booleanTokens: defaultConfig.types.booleanTokens });
  for (const r of rows) p.addRow(r);
  return buildFileSpec(p.finish(file), defaultConfig);
}

export const demoFeed = (version: 'v1' | 'v2' = 'v1') => DEMO_FILES.map((f) => demoSpec(version, f));
