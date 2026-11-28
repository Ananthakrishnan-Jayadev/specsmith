/**
 * Typed access to config/*.json. Assigning each JSON import to a typed const
 * makes TypeScript check the file's shape at compile time.
 */
import typesJson from '../../config/types.json';
import namingJson from '../../config/naming.json';
import piiJson from '../../config/pii.json';
import lintJson from '../../config/lint.json';
import storyJson from '../../config/story-templates.json';
import type { PiiClass, Severity } from '../domain/spec';
import type { ValueSignals } from '../domain/profile';

export interface TypesConfig {
  nullTokens: string[];
  booleanTokens: string[];
  typeThreshold: number;
  lengthHeadroom: number;
  standardLengths: number[];
  decimalExtraIntegerDigits: number;
  maxDecimalPrecision: number;
  integerMaxPrecision: number;
}

export interface NamingConfig {
  maxLength: number;
  expandAbbreviations: boolean;
  abbreviations: Record<string, string>;
  reservedWords: string[];
  unclearNamePatterns: string[];
}

export interface PiiRule {
  category: string;
  classification: Exclude<PiiClass, 'NONE'>;
  keywords: string[];
  signal?: keyof ValueSignals;
  minShare?: number;
}

export interface PiiConfig {
  rules: PiiRule[];
}

export type LintRuleId =
  | 'header' | 'all-null' | 'no-primary-key' | 'key-nullable' | 'unclear-name' | 'reserved-word'
  | 'name-too-long' | 'name-collision' | 'ambiguous-date-format' | 'mixed-types' | 'untrimmed-values'
  | 'constant-column' | 'pii-review';

export interface LintConfig {
  rules: Record<LintRuleId, Severity | 'off'>;
}

export interface StoryTemplate {
  key: string;
  summary: string;
  context: string;
  acceptanceCriteria: string[];
  points?: number;
  blockedBy?: string[];
}

export interface StoryTemplatesConfig {
  issueTypes: { epic: string[]; story: string[] };
  storyPointFields: string[];
  labels: string[];
  epic: StoryTemplate;
  stories: StoryTemplate[];
}

export interface RulesConfig {
  types: TypesConfig;
  naming: NamingConfig;
  pii: PiiConfig;
  lint: LintConfig;
  stories: StoryTemplatesConfig;
}

const types: TypesConfig = typesJson;
const naming: NamingConfig = namingJson;
const pii: PiiConfig = piiJson as PiiConfig; // JSON infers strings; narrowed + validated in tests
const lint: LintConfig = lintJson as LintConfig;
const stories: StoryTemplatesConfig = storyJson;

export const defaultConfig: RulesConfig = { types, naming, pii, lint, stories };
