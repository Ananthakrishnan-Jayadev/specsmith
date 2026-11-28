/** What the Story Planner needs from Jira. Real impl: platform/jira.ts; tests: a fake. */
import type { AdfDoc } from '../render/adf';

export interface IssueTypeMeta {
  id: string;
  name: string;
  subtask?: boolean;
  hierarchyLevel?: number;
}

export interface IssueSnapshot {
  id: string;
  key: string;
  summary: string;
  /** ADF document as returned by Jira (any shape). */
  description: unknown;
  labels: string[];
}

export interface NewIssue {
  projectKey: string;
  issueTypeId: string;
  summary: string;
  description: AdfDoc;
  labels: string[];
  parentKey?: string;
  points?: { fieldId: string; value: number };
}

export interface JiraPort {
  getProject(key: string): Promise<{ id: string; key: string } | null>;
  getIssueTypes(projectKey: string): Promise<IssueTypeMeta[]>;
  /** Field ids and names available when creating this issue type. */
  getCreateFields(projectKey: string, issueTypeId: string): Promise<{ fieldId: string; name: string }[]>;
  /** null when the issue doesn't exist (or isn't visible). */
  getIssue(key: string): Promise<IssueSnapshot | null>;
  /** Issues in the project carrying ALL these labels. */
  findByLabels(projectKey: string, labels: string[]): Promise<IssueSnapshot[]>;
  createIssue(issue: NewIssue): Promise<{ id: string; key: string }>;
  updateIssue(key: string, fields: { summary: string; description: AdfDoc }): Promise<void>;
  linkBlocks(blockerKey: string, blockedKey: string): Promise<void>;
  /** Idempotent: same globalId updates the existing remote link. */
  upsertRemoteLink(issueKey: string, globalId: string, url: string, title: string): Promise<void>;
  browseUrl(key: string): string | undefined;
}
