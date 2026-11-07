// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDataOwnerGeneration } from '@/contexts/dataOwnerGeneration';
import { SidebarSpacesBoundary, useSidebarSpaces } from '../../hooks/useSidebarSpaces';
import { ProjectsSection, SpacePlaceholderHeaders, type ProjectsSectionProps } from '../sections/ProjectsSection';
import { resolveProjectFocusLocation, waitForSidebarProjectNode } from '../../lib/sidebarProjectFocus';
import { projectsOutsidePinnedSection } from '../../lib/sidebarSpaces';
import { beginProjectFocusObservation, consumePendingProjectFocus, getPendingProjectFocus, requestProjectFocus } from '@/state/pendingProjectFocus';
import type { SidebarSpacesState } from '../../../../../shared/sidebarSettings';
import type { ProjectNode } from '../../lib/projectGrouping';

vi.mock('react-i18next', async importOriginal => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string, values?: { count?: number }) => values?.count === undefined ? key : `${key}:${values.count}`, i18n: { language: 'en' } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ dataOwnerId: 'owner', dataOwnerGeneration: 1 }) }));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) => open ? <button onClick={onConfirm}>confirm</button> : null }));
vi.mock('../SpaceNameDialog', () => ({ SpaceNameDialog: () => null }));
vi.mock('@/components/ui/tooltip', () => ({ Tip: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const selected = vi.hoisted(() => ({ value: 'all' as 'all' | string[] }));
vi.mock('@/features/device-link/useMachineSwitcher', () => ({ useEffectiveSelectedMachineId: () => selected.value }));
vi.mock('@/features/device-link/remoteProjectsStore', () => ({ useRemoteDevices: () => [] }));
vi.mock('@/features/device-link/remoteSessionActivityStore', () => ({ useRemoteSessionActivityRevision: () => 0, getRemoteSessionActivity: () => null, isRemoteSessionActivityActive: () => false, subscribeRemoteSessionActivity: () => () => {} }));
vi.mock('../../hooks/useRemoteHostProjectOrders', () => ({ projectOrderWriteScopeForSelection: () => ({ kind: 'viewer' }), useLocalHostProjectOrder: () => ({ snapshot: { manualProjectOrder: [] } }), useRemoteHostProjectOrders: () => ({ orders: new Map() }), controllerManualOrderForDevice: () => [] }));
vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('@/hooks/useSidebarCardMode', () => ({ useSidebarMainViewMode: () => ({ mode: 'text' }) }));
vi.mock('../../hooks/useViewedPriorityHold', () => ({ useViewedPriorityHold: () => ({ heldPriorityRanks: new Map(), recentlyViewedAtMs: new Map() }) }));
vi.mock('../../lib/orcaLeadWorkerAttention', () => ({ useSessionAttentionKindsWithOrcaLeads: () => new Map() }));
vi.mock('../../contexts/SessionAttentionUrgencyContext', () => ({ useSessionAttentionUrgencySet: () => new Set() }));
vi.mock('../../hooks/useAutomationGroupCollapsed', () => ({ useAutomationGroupsCollapsed: () => [true, () => {}, () => true, () => {}] }));
vi.mock('../MainListScopeHeader', () => ({ MainListScopeHeader: ({ fold }: { fold: { label: string; onClick: () => void } | null }) => fold && <button onClick={fold.onClick}>{fold.label}</button> }));
vi.mock('../DeviceSectionHeader', () => ({ DeviceSectionHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../SectionCollapse', () => ({ SectionCollapse: ({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) => collapsed ? null : <div>{children}</div> }));
vi.mock('../sections/ProjectNode', () => ({ ProjectNode: ({ project, isCollapsed }: { project: ProjectNode; isCollapsed: boolean }) => <div>{project.displayName}:{isCollapsed ? 'collapsed' : 'open'}</div> }));
vi.mock('../sections/UnclassifiedSection', () => ({ UnclassifiedSection: () => null }));
vi.mock('@/components/sidebar/SortableList', () => ({ SortableList: ({ items, renderItem }: { items: unknown[]; renderItem: (item: unknown) => React.ReactNode }) => <>{items.map((item, index) => <React.Fragment key={index}>{renderItem(item)}</React.Fragment>)}</> }));

const project: ProjectNode = { projectKey: 'local:/a', displayName: 'Project A', workingDir: '/a', scope: 'local', remoteHostId: null, deviceLinkDeviceId: null, deviceLinkDeviceName: null, deviceLinkConnectionStatus: null, sessions: [], latestActivityAt: '', segments: 1, isPersistentLocal: true };
let state: SidebarSpacesState;
let listeners: Array<(state: SidebarSpacesState) => void>;
function publish(next: SidebarSpacesState) { state = next; for (const listener of [...listeners]) listener(next); return Promise.resolve(next); }
const emptySet = new Set<string>();
const noop = () => {};
function Operations() {
  const spaces = useSidebarSpaces()!;
  return <><button onClick={() => spaces.moveProject(project, null)}>remove project</button><button onClick={() => spaces.requestDelete(spaces.spaces[0])}>delete space</button></>;
}
function Fixture({ knownProjects = [project], visibleProjects = [project] }: { knownProjects?: ProjectNode[]; visibleProjects?: ProjectNode[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const filter = { status: 'active', groupBy: 'project', groupDevice: true, groupDialogue: false, sortBy: 'recency', projectOrder: 'activity', manualProjectOrder: [], projects: 'all', isFilterActive: false, setManualProjectOrder: noop, setProjectOrder: noop } as unknown as ProjectsSectionProps['filter'];
  const props = {
    unclassified: [], projects: visibleProjects, dialogues: [], allKnownProjects: knownProjects, allProjectKeysForOrder: knownProjects.map(item => item.projectKey), filter, collapsed, isAllCollapsed: collapsed.size > 0,
    runningSessionIds: emptySet, attachedSessionIds: emptySet, notifications: emptySet, scheduleSessionIndex: new Map(),
    onCollapseAll: () => setCollapsed(new Set(knownProjects.map(item => item.projectKey))), onExpandAll: () => setCollapsed(new Set()),
    remoteDeviceIndex: new Map([['remote', { name: 'Other', online: true }]]),
    onSessionClick: noop, onAction: noop, onRename: noop, onTogglePin: noop, onScheduleAction: noop, onToggleProject: noop, onToggleProjectPin: noop, onRenameProject: async () => {}, onRemoveFromSidebar: noop, onCreateProject: noop, onCreateInProject: noop, onOpenConversationSearch: noop, onOpenInExplorer: noop, onImportFromTools: noop, onBrowseFiles: noop, onArchiveAll: noop, onSearchDialogues: noop, onArchiveAllDialogues: noop, onCreateDialogue: noop,
  } as ProjectsSectionProps;
  return <SidebarSpacesBoundary><Operations /><ProjectsSection {...props} /></SidebarSpacesBoundary>;
}

beforeEach(() => {
  localStorage.clear();
  selected.value = 'all';
  setDataOwnerGeneration('owner', 1);
  listeners = [];
  state = { dataOwnerId: 'owner', ownerGeneration: 1, spaces: [{ id: 'space', name: 'Space A', order: 0, collapsed: false }], projectSpaceIds: { [project.projectKey]: 'space' }, showSpaces: true };
  const settings = {
    loadSnapshot: () => ({ ...state, pinnedOrder: [], pinnedOrderIsAuthoritative: false, hiddenProjectKeys: [], hiddenMainViewGhostIds: [] }),
    onSpacesChanged: (listener: (next: SidebarSpacesState) => void) => { listeners.push(listener); return () => { listeners = listeners.filter(item => item !== listener); }; },
    updateSpace: (_id: string, patch: object) => publish({ ...state, spaces: state.spaces.map(item => ({ ...item, ...patch })) }),
    setProjectSpace: () => publish({ ...state, projectSpaceIds: {} }),
    deleteSpace: () => publish({ ...state, spaces: [], projectSpaceIds: {} }),
    createSpace: vi.fn(), setShowSpaces: vi.fn(),
  };
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { platform: 'darwin', sidebarSettings: settings } });
});
afterEach(cleanup);

// Value: spaces.md P0 requires four fold phases even when every project is in
// a space; old sidebar tests only cover the unpartitioned list. Also protects
// the empty-space result after removal/deletion and orphan membership (unit).
describe('space sidebar integration', () => {
  // P1 / spaces.md: the production project projection previously removed pinned
  // projects before ProjectsSection could partition them. Existing section tests
  // supplied already-visible projects. Unit tier: one pinned, assigned project.
  it('keeps a pinned project in its space only while its membership is valid and spaces are shown', () => {
    const pinned = new Set([project.projectKey]);
    const visible = () => projectsOutsidePinnedSection([project], pinned, state, 'darwin');
    const view = render(<Fixture visibleProjects={visible()} />);
    expect(screen.getByText('Project A:open')).toBeTruthy();
    state = { ...state, showSpaces: false };
    view.rerender(<Fixture visibleProjects={visible()} />);
    expect(screen.queryByText('Project A:open')).toBeNull();
    state = { ...state, showSpaces: true, projectSpaceIds: { [project.projectKey]: 'missing' } };
    view.rerender(<Fixture visibleProjects={visible()} />);
    expect(screen.queryByText('Project A:open')).toBeNull();
  });

  it('cycles spaces, project groups, devices, then expands all when all projects belong to a space', async () => {
    render(<Fixture />);
    expect(screen.getByText('Project A:open')).toBeTruthy();
    fireEvent.click(screen.getByText('ccAgent.sidebar.spaces.collapseAll'));
    await waitFor(() => expect(state.spaces[0].collapsed).toBe(true));
    fireEvent.click(screen.getByText('ccAgent.sidebar.foldAll.collapseProjects'));
    fireEvent.click(screen.getByText('ccAgent.sidebar.foldAll.collapseDevices'));
    fireEvent.click(screen.getByText('ccAgent.sidebar.foldAll.expandAll'));
    await waitFor(() => expect(state.spaces[0].collapsed).toBe(false));
    expect(screen.getByText('Project A:open')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'ccAgent.sidebar.deviceGroup.collapse' }).length).toBeGreaterThan(0);
  });

  it('shows an empty space after confirmed removal and leaves the project visible after space deletion', async () => {
    render(<Fixture />);
    fireEvent.click(screen.getByText('remove project'));
    fireEvent.click(screen.getByText('confirm'));
    await waitFor(() => expect(screen.getByText('ccAgent.sidebar.spaces.empty')).toBeTruthy());
    expect(screen.getAllByText('Project A:open')).toHaveLength(1);
    fireEvent.click(screen.getByText('delete space'));
    fireEvent.click(screen.getByText('confirm'));
    await waitFor(() => expect(screen.queryByText('Space A')).toBeNull());
    expect(screen.getAllByText('Project A:open')).toHaveLength(1);
  });

  it('retains the space header and other-device count alongside a remote loading notice', () => {
    selected.value = ['remote'];
    render(<SidebarSpacesBoundary><SpacePlaceholderHeaders allKnownProjects={[project]} /><p>remote loading</p></SidebarSpacesBoundary>);
    expect(screen.getByText('Space A')).toBeTruthy();
    expect(screen.getByText('ccAgent.sidebar.spaces.otherDevices:1')).toBeTruthy();
    expect(screen.getByText('remote loading')).toBeTruthy();
  });

  it('waits for a revealed project node before scrolling and consuming a deep link', async () => {
    const frames: FrameRequestCallback[] = [];
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.push(callback); return frames.length; });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const root = document.createElement('div');
    document.body.append(root);
    const consume = vi.fn();
    const dispose = waitForSidebarProjectNode('local:/a', consume, root);
    frames.shift()?.(0);
    expect(consume).not.toHaveBeenCalled();
    const holder = document.createElement('div');
    holder.setAttribute('data-sidebar-section-collapsed', 'true');
    const node = document.createElement('div');
    node.setAttribute('data-project-workingdir', 'local:/a');
    node.scrollIntoView = vi.fn();
    holder.append(node);
    root.append(holder);
    await act(async () => { await Promise.resolve(); });
    frames.shift()?.(0);
    expect(consume).not.toHaveBeenCalled();
    holder.removeAttribute('data-sidebar-section-collapsed');
    await act(async () => { await Promise.resolve(); });
    frames.shift()?.(0);
    expect(node.scrollIntoView).toHaveBeenCalledOnce();
    expect(consume).toHaveBeenCalledOnce();
    dispose(); root.remove(); request.mockRestore(); cancel.mockRestore();
  });

  it('resolves a pinned project in flat or filtered views and rejects unrenderable project rows', () => {
    expect(resolveProjectFocusLocation(project.projectKey, [project], [], 'flat', 'darwin')).toBe('pinned');
    expect(resolveProjectFocusLocation(project.projectKey, [], [project], 'flat', 'darwin')).toBe('unavailable');
    expect(resolveProjectFocusLocation(project.projectKey, [], [], 'project', 'darwin')).toBe('unavailable');
    expect(resolveProjectFocusLocation(project.projectKey, [], [project], 'project', 'darwin')).toBe('project');
  });

  it('clears a pending focus and cancels its observer immediately on owner generation change', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    requestProjectFocus('/a');
    const focus = getPendingProjectFocus()!;
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const completed = vi.fn();
    const unavailable = vi.fn();
    const dispose = waitForSidebarProjectNode('local:/a', completed, root, unavailable, focus.owner);
    setDataOwnerGeneration('other-owner', 2);
    expect(getPendingProjectFocus()).toBeNull();
    expect(disconnect).toHaveBeenCalled();
    const node = document.createElement('div');
    node.setAttribute('data-project-workingdir', 'local:/a');
    node.scrollIntoView = vi.fn();
    root.append(node);
    await act(async () => { await Promise.resolve(); });
    expect(completed).not.toHaveBeenCalled();
    expect(unavailable).not.toHaveBeenCalled();
    dispose(); disconnect.mockRestore(); root.remove();
  });

  it('expires a missing-row request at its original deadline despite repeated effect restarts', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    const unavailable = vi.fn();
    requestProjectFocus('/missing');
    const focus = getPendingProjectFocus()!;
    const start = () => waitForSidebarProjectNode('local:/missing', vi.fn(), root, unavailable, focus.owner, beginProjectFocusObservation(focus)!);
    let dispose = start();
    vi.advanceTimersByTime(1000);
    dispose();
    dispose = start();
    vi.advanceTimersByTime(1000);
    dispose();
    dispose = start();
    vi.advanceTimersByTime(999);
    expect(unavailable).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(unavailable).toHaveBeenCalledOnce();
    dispose();
    consumePendingProjectFocus();
    vi.useRealTimers();
  });

  it('keeps the full observation budget when the sidebar mounts long after the request', () => {
    vi.useFakeTimers();
    requestProjectFocus('/a');
    const focus = getPendingProjectFocus()!;
    vi.advanceTimersByTime(5000);
    const root = document.createElement('div');
    const node = document.createElement('div');
    node.setAttribute('data-project-workingdir', 'local:/a');
    node.scrollIntoView = vi.fn();
    root.append(node);
    const completed = vi.fn();
    const unavailable = vi.fn();
    const dispose = waitForSidebarProjectNode('local:/a', completed, root, unavailable, focus.owner, beginProjectFocusObservation(focus)!);
    vi.advanceTimersByTime(20);
    expect(completed).toHaveBeenCalledOnce();
    expect(unavailable).not.toHaveBeenCalled();
    dispose();
    consumePendingProjectFocus();
    vi.useRealTimers();
  });

  it('treats orphaned membership as empty, but not a real project hidden by content filters', () => {
    const view = render(<Fixture knownProjects={[]} visibleProjects={[]} />);
    expect(screen.getByText('ccAgent.sidebar.spaces.empty')).toBeTruthy();
    view.rerender(<Fixture knownProjects={[project]} visibleProjects={[]} />);
    expect(screen.queryByText('ccAgent.sidebar.spaces.empty')).toBeNull();
    expect(screen.getByText('Space A')).toBeTruthy();
  });
});
