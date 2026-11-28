import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { buildStoryContent, feedFacts, fill, PLACEHOLDERS } from '../../src/stories/content';
import { adfText } from '../../src/render/adf';

const facts = { feedName: 'Retail', fileCount: 2, tables: 'a, b', columnCount: 1234, rowCount: 10, piiCount: 3, pciCount: 1, tbdCount: 7 };

describe('fill', () => {
  it('replaces placeholders and formats numbers', () => {
    expect(fill('{feedName}: {columnCount} cols', facts)).toBe('Retail: 1,234 cols');
  });
  it('throws on unknown placeholders', () => {
    expect(() => fill('{nope}', facts)).toThrow(/Unknown placeholder \{nope\}/);
  });
});

describe('story templates config', () => {
  it('uses only known placeholders and valid dependencies', () => {
    const cfg = defaultConfig.stories;
    const keys = new Set(cfg.stories.map((s) => s.key));
    for (const t of [cfg.epic, ...cfg.stories]) {
      for (const text of [t.summary, t.context, ...t.acceptanceCriteria]) expect(() => fill(text, facts)).not.toThrow();
      for (const b of t.blockedBy ?? []) expect(keys.has(b)).toBe(true);
    }
    expect(keys.size).toBe(cfg.stories.length);
    expect(PLACEHOLDERS).toContain('tbdCount');
  });
});

describe('buildStoryContent', () => {
  it('builds ADF with context, BDD criteria and a spec link', () => {
    const c = buildStoryContent(defaultConfig.stories.stories[0] as (typeof defaultConfig.stories.stories)[number], facts, 'https://x/wiki/p');
    expect(c.summary).toBe('Retail: requirements sign-off');
    expect(JSON.stringify(c.description)).toContain('"href":"https://x/wiki/p"');
    expect(adfText(c.description)).toMatch(/Acceptance criteria\nGiven the published spec/);
  });
  it('says when the spec is not published', () => {
    const c = buildStoryContent(defaultConfig.stories.epic, facts, null);
    expect(adfText(c.description)).toMatch(/not been published/);
  });
  it('derives facts from specs', () => {
    expect(feedFacts('X', []).tables).toBe('none');
  });
});
