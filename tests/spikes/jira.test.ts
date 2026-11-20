import { describe, expect, it } from 'vitest';
import { pickIssueTypes } from '../../src/spikes/jira';

describe('pickIssueTypes', () => {
  it('prefers hierarchy level 1 for epic and Story over Task', () => {
    const r = pickIssueTypes([
      { id: '1', name: 'Task', hierarchyLevel: 0 },
      { id: '2', name: 'Story', hierarchyLevel: 0 },
      { id: '3', name: 'Epic', hierarchyLevel: 1 },
      { id: '4', name: 'Subtask', hierarchyLevel: -1, subtask: true },
    ]);
    expect(r.epic?.id).toBe('3');
    expect(r.story?.id).toBe('2');
  });

  it('falls back to Task and reports a missing epic', () => {
    const r = pickIssueTypes([{ id: '1', name: 'Task', hierarchyLevel: 0 }]);
    expect(r.epic).toBeUndefined();
    expect(r.story?.name).toBe('Task');
  });
});
