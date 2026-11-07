import { AppFrame, mountPage } from '../../ui-page/harness';
import { SidebarSpacesBoundary, useSidebarSpaces } from '../../../src/renderer/features/cc-agent/hooks/useSidebarSpaces';
import { SpaceSection } from '../../../src/renderer/features/cc-agent/sidebar/SpaceSection';
import { ProjectNode } from '../../../src/renderer/features/cc-agent/sidebar/sections/ProjectNode';
import type { SidebarSpacesState } from '../../../src/shared/sidebarSettings';
import type { ProjectNode as ProjectData } from '../../../src/renderer/features/cc-agent/lib/projectGrouping';

const project: ProjectData = { projectKey: 'local:/projects/orbit', displayName: 'Orbit Garden', workingDir: '/projects/orbit', scope: 'local', remoteHostId: null, deviceLinkDeviceId: null, deviceLinkDeviceName: null, deviceLinkConnectionStatus: null, sessions: [], latestActivityAt: '', segments: 1, isPersistentLocal: true };
const empty = new Set<string>();
const noop = () => {};
function Sidebar() {
  const controller = useSidebarSpaces()!;
  return <div className="flex flex-col gap-3 pt-6">
    {controller.spaces.map((space, index) => <SpaceSection key={space.id} space={space} projectCount={index === 0 ? 2 : 0} runningCount={index === 0 ? 1 : 0} otherDeviceCount={index === 0 ? 1 : 0} empty={index !== 0}>
      <div className="pl-3"><ProjectNode project={project} statusFilter="active" isCollapsed parentSectionCollapsed={false} runningSessionIds={empty} attachedSessionIds={empty} notifications={empty} scheduleSessionIndex={new Map()} disableSessionCollapse={false} onToggle={noop} isProjectPinned={false} onToggleProjectPin={noop} onRenameProject={async () => {}} onRemoveFromSidebar={noop} onSessionClick={noop} onAction={noop} onRename={noop} onTogglePin={noop} onScheduleAction={noop} onCreateInProject={noop} onOpenConversationSearch={noop} onOpenInExplorer={noop} onImportFromTools={noop} onBrowseFiles={noop} onArchiveAll={noop} /></div>
    </SpaceSection>)}
  </div>;
}

mountPage({
  host: ctx => {
    let state: SidebarSpacesState = { dataOwnerId: null, ownerGeneration: 0, spaces: [{ id: 'product', name: ctx.case === 'long-name' ? 'A very long project planning space name that needs truncation' : 'Product', order: 0, collapsed: false }, { id: 'empty', name: 'Research', order: 1, collapsed: false }], projectSpaceIds: { [project.projectKey]: 'product' }, showSpaces: true };
    const listeners = new Set<(value: SidebarSpacesState) => void>();
    const publish = (next: SidebarSpacesState) => { state = next; listeners.forEach(listener => listener(next)); return Promise.resolve(next); };
    return { platform: 'darwin', sidebarSettings: {
      loadSnapshot: () => ({ ...state, pinnedOrder: [], pinnedOrderIsAuthoritative: false, hiddenProjectKeys: [], hiddenMainViewGhostIds: [] }),
      onSpacesChanged: (listener: (value: SidebarSpacesState) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
      updateSpace: (id: string, patch: object) => publish({ ...state, spaces: state.spaces.map(space => space.id === id ? { ...space, ...patch } : space) }),
      deleteSpace: (id: string) => publish({ ...state, spaces: state.spaces.filter(space => space.id !== id), projectSpaceIds: {} }),
      setProjectSpace: (key: string, id: string | null) => publish({ ...state, projectSpaceIds: id ? { ...state.projectSpaceIds, [key]: id } : {} }),
      setShowSpaces: (showSpaces: boolean) => publish({ ...state, showSpaces }),
      createSpace: (name: string) => publish({ ...state, spaces: [...state.spaces, { id: 'new', name, order: state.spaces.length, collapsed: false }] }),
    } };
  },
  render: () => <SidebarSpacesBoundary><AppFrame sidebar={<Sidebar />} /></SidebarSpacesBoundary>,
});
