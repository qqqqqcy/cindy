import type { SidebarSpace, SidebarSpacesState } from '../../../../shared/sidebarSettings';
import { MACHINE_ALL, MACHINE_LOCAL, type MachineSelection } from '@/features/device-link/selectedMachineStore';
import { projectKeyComparisonKey, type ProjectNode } from './projectGrouping';
import { projectKeyComparisonSetHas } from './sidebarProjectVisibility';

/** Space membership uses the same project identity as pinning and hidden projects. */
export function projectSpaceId(projectKey: string, state: Pick<SidebarSpacesState, 'spaces' | 'projectSpaceIds'>, platform: string): string | null {
  const comparison = projectKeyComparisonKey(projectKey, platform) ?? projectKey;
  const match = Object.entries(state.projectSpaceIds).find(([key]) => (projectKeyComparisonKey(key, platform) ?? key) === comparison);
  return match && state.spaces.some(space => space.id === match[1]) ? match[1] : null;
}

/** Pinned projects also appear in their space when that space is visible. */
export function projectsOutsidePinnedSection(projects: readonly ProjectNode[], pinnedKeys: ReadonlySet<string>, state: Pick<SidebarSpacesState, 'spaces' | 'projectSpaceIds' | 'showSpaces'> | null, platform: string): ProjectNode[] {
  return projects.filter(project =>
    !projectKeyComparisonSetHas(pinnedKeys, project.projectKey, platform) ||
    Boolean(state?.showSpaces && projectSpaceId(project.projectKey, state, platform)),
  );
}

export interface SpaceProjectsPartition {
  space: SidebarSpace | null;
  projects: ProjectNode[];
  otherDeviceCount: number;
}

/** Split before grouping so flat tasks and automation groups cannot merge across
 * spaces. Counts use the pre-scope catalogue, never the filtered visible rows. */
export function partitionProjectsBySpace(projects: readonly ProjectNode[], state: Pick<SidebarSpacesState, 'spaces' | 'projectSpaceIds' | 'showSpaces'> | null, allProjects: readonly ProjectNode[], selection: MachineSelection, platform: string): SpaceProjectsPartition[] {
  if (!state?.showSpaces || state.spaces.length === 0) return [{ space: null, projects: [...projects], otherDeviceCount: 0 }];
  const membership = new Map<string, string>();
  const validIds = new Set(state.spaces.map(space => space.id));
  for (const [key, id] of Object.entries(state.projectSpaceIds)) {
    if (validIds.has(id)) membership.set(projectKeyComparisonKey(key, platform) ?? key, id);
  }
  const spaceOf = (project: ProjectNode) => membership.get(projectKeyComparisonKey(project.projectKey, platform) ?? project.projectKey) ?? null;
  const projectsBySpace = new Map<string | null, ProjectNode[]>();
  for (const project of projects) {
    const id = spaceOf(project);
    const list = projectsBySpace.get(id) ?? [];
    list.push(project);
    projectsBySpace.set(id, list);
  }
  const hiddenCounts = new Map<string, number>();
  const seen = new Set<string>();
  for (const project of allProjects) {
    const key = projectKeyComparisonKey(project.projectKey, platform) ?? project.projectKey;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = spaceOf(project);
    const inScope = selection === MACHINE_ALL || selection.includes(project.deviceLinkDeviceId ?? MACHINE_LOCAL);
    if (id && !inScope) hiddenCounts.set(id, (hiddenCounts.get(id) ?? 0) + 1);
  }
  const partitions: SpaceProjectsPartition[] = [...state.spaces].sort((a, b) => a.order - b.order).map(space => ({ space, projects: projectsBySpace.get(space.id) ?? [], otherDeviceCount: hiddenCounts.get(space.id) ?? 0 }));
  partitions.push({ space: null, projects: projectsBySpace.get(null) ?? [], otherDeviceCount: 0 });
  return partitions;
}
