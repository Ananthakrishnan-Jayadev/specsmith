import { route } from '@forge/api';
import type { Targets } from '../shared/api';
import { callProduct, describeError } from '../platform/product-api';

interface SpaceList { results: { id: string; key: string; name: string }[] }
interface ProjectPage { values: { id: string; key: string; name: string; style?: string }[] }

/** Lists Confluence spaces and Jira projects the user can see, for the spike pickers. */
export async function listTargets(): Promise<Targets> {
  const errors: string[] = [];
  const [spaces, projects] = await Promise.all([
    callProduct<SpaceList>('confluence', route`/wiki/api/v2/spaces?limit=50`),
    callProduct<ProjectPage>('jira', route`/rest/api/3/project/search?maxResults=50`),
  ]);
  if (!spaces.ok) errors.push(`spaces: ${describeError(spaces)}`);
  if (!projects.ok) errors.push(`projects: ${describeError(projects)}`);
  return {
    spaces: (spaces.data?.results ?? []).map(({ id, key, name }) => ({ id, key, name })),
    projects: (projects.data?.values ?? []).map(({ id, key, name, style }) => ({ id, key, name, style: style ?? 'unknown' })),
    errors,
  };
}
