import { describe, expect, it } from 'vitest';
import { partitionProjectsBySpace, projectSpaceId } from '../sidebarSpaces';
import { buildMainListEntries, getMainListEntrySessions } from '../mainListModel';
import type { ProjectNode } from '../projectGrouping';
import type { Session } from '@/lib/ccAgent.types';
import type { SidebarSpacesState } from '../../../../../shared/sidebarSettings';
import { MACHINE_ALL, MACHINE_LOCAL } from '@/features/device-link/selectedMachineStore';

// Test value: spaces.md P0 requires single ownership before device/group/sort
// projection. Existing projectGrouping tests have no space/scope input. The
// minimum counterexample is one assigned and one unassigned project (unit tier).
const space = { id: 'work', name: 'Work', order: 0, collapsed: false };
const empty = { id: 'empty', name: 'Empty', order: 1, collapsed: true };
const task = (id: string, updatedAt: string): Session => ({ id, title: id, status: 'active', updatedAt, createdAt: updatedAt, userSendAt: updatedAt, workingDir: `/projects/${id}`, workspaceKind: 'project', _count: { messages: 1 } } as Session);
const project = (key: string, sessions: Session[] = [], deviceLinkDeviceId: string | null = null): ProjectNode => ({ projectKey: key, displayName: key, workingDir: key, scope: deviceLinkDeviceId ? 'remote' : 'local', remoteHostId: null, deviceLinkDeviceId, deviceLinkDeviceName: null, deviceLinkConnectionStatus: null, segments: 1, latestActivityAt: sessions[0]?.updatedAt ?? '', sessions });
const a = project('local:/projects/a', [task('a', '2026-01-01T00:00:00Z')]);
const b = project('local:/projects/b', [task('b', '2026-02-01T00:00:00Z')]);
const remote = project('device:remote:/projects/c', [], 'remote');
const state: SidebarSpacesState = { dataOwnerId: 'owner', ownerGeneration: 1, spaces: [empty, space], projectSpaceIds: { [a.projectKey]: space.id, [remote.projectKey]: space.id }, showSpaces: true };

describe('space project partition', () => {
  it('keeps empty spaces and places each project in exactly one partition, retaining the incoming sort order', () => {
    const result = partitionProjectsBySpace([b, a], state, [a, b], MACHINE_ALL, 'darwin');
    expect(result.map(partition => [partition.space?.id ?? null, partition.projects.map(item => item.projectKey)])).toEqual([['work', [a.projectKey]], ['empty', []], [null, [b.projectKey]]]);
    expect(result[0].projects[0]).toBe(a);
  });

  it('counts other devices from the complete catalogue even when no visible project matches a content filter', () => {
    const result = partitionProjectsBySpace([], state, [a, remote, remote], [MACHINE_LOCAL], 'darwin');
    expect(result[0].otherDeviceCount).toBe(1);
    expect(result[0].projects).toEqual([]);
    expect(partitionProjectsBySpace([], state, [a, remote], MACHINE_ALL, 'darwin')[0].otherDeviceCount).toBe(0);
    expect(partitionProjectsBySpace([], state, [a, remote], ['remote'], 'darwin')[0].otherDeviceCount).toBe(1);
  });

  it('restores the ordinary list with saved membership intact when spaces are hidden', () => {
    const result = partitionProjectsBySpace([b, a], { ...state, showSpaces: false }, [a, b], MACHINE_ALL, 'darwin');
    expect(result).toEqual([{ space: null, projects: [b, a], otherDeviceCount: 0 }]);
    expect(state.projectSpaceIds[a.projectKey]).toBe(space.id);
    const stale = { ...state, projectSpaceIds: { [a.projectKey]: 'deleted-space' } };
    expect(partitionProjectsBySpace([a], stale, [a], MACHINE_ALL, 'darwin').at(-1)?.projects).toEqual([a]);
  });

  it('uses Windows local identity without merging device-scoped or SSH projects', () => {
    const windows = { ...state, projectSpaceIds: { 'local:C:/Projects/Work': space.id } };
    expect(projectSpaceId('local:c:/projects/work', windows, 'win32')).toBe(space.id);
    expect(projectSpaceId('device:other:C:/Projects/Work', windows, 'win32')).toBeNull();
    expect(projectSpaceId('remote:ssh:C:/Projects/Work', windows, 'win32')).toBeNull();
  });

  it.each(['project', 'flat'] as const)('applies %s grouping and task sorting independently inside each space', groupBy => {
    const newer = task('newer', '2026-03-01T00:00:00Z');
    const assigned = { ...a, sessions: [...a.sessions, newer] };
    const partitions = partitionProjectsBySpace([assigned, b], state, [assigned, b], MACHINE_ALL, 'darwin');
    const lists = partitions.map(partition => buildMainListEntries({ projects: partition.projects, dialogues: [], groupBy, groupDialogue: false, sortBy: 'recency', manualProjectOrder: [] }));
    expect(lists[0].flatMap(getMainListEntrySessions).map(item => item.id)).toEqual(['newer', 'a']);
    expect(lists.at(-1)?.flatMap(getMainListEntrySessions).map(item => item.id)).toEqual(['b']);
    expect(lists[0][0].kind).toBe(groupBy === 'project' ? 'project' : 'session');
  });
});
