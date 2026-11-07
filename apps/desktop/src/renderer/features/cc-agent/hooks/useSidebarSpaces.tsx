import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { getDataOwnerGeneration, isDataOwnerPushStampCurrent } from '@/contexts/dataOwnerGeneration';
import { toast } from '@/lib/toast';
import { extractIpcError, mapIpcErrorToI18nKey } from '@/utils/ipcError';
import type { DataOwnerPushStamp } from '../../../../shared/dataOwnerPush';
import type { SidebarSpace, SidebarSpacesState } from '../../../../shared/sidebarSettings';
import type { ProjectNode } from '../lib/projectGrouping';
import { projectSpaceId } from '../lib/sidebarSpaces';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SpaceNameDialog } from '../sidebar/SpaceNameDialog';

/** Main owns space membership and preferences; this context is a window-local projection. */
export function useSidebarSpacesState() {
  const { dataOwnerGeneration } = useAuth();
  const { t } = useTranslation();
  const [mountedOwner] = useState(getDataOwnerGeneration);
  const initial = useMemo<SidebarSpacesState>(() => {
    const owner = getDataOwnerGeneration();
    const snapshot = window.electronAPI.sidebarSettings.loadSnapshot();
    if (snapshot.dataOwnerId === mountedOwner.dataOwnerId && isDataOwnerPushStampCurrent(snapshot)) {
      return { ...snapshot, spaces: snapshot.spaces ?? [], projectSpaceIds: snapshot.projectSpaceIds ?? {}, showSpaces: snapshot.showSpaces ?? true };
    }
    return { dataOwnerId: mountedOwner.dataOwnerId, ownerGeneration: owner.generation, spaces: [], projectSpaceIds: {}, showSpaces: true };
  }, [mountedOwner, dataOwnerGeneration]);
  const [received, setReceived] = useState(initial);
  const stamp = useMemo<DataOwnerPushStamp>(() => ({ dataOwnerId: initial.dataOwnerId, ownerGeneration: initial.ownerGeneration }), [initial.dataOwnerId, initial.ownerGeneration]);
  const accepts = useCallback((value: SidebarSpacesState) => value.dataOwnerId === stamp.dataOwnerId && value.ownerGeneration === stamp.ownerGeneration && isDataOwnerPushStampCurrent(value), [stamp]);
  const reconcile = useCallback((value: SidebarSpacesState) => { if (accepts(value)) setReceived(value); }, [accepts]);
  useLayoutEffect(() => {
    const api = window.electronAPI.sidebarSettings;
    const unsubscribe = api.onSpacesChanged?.(reconcile);
    const snapshot = api.loadSnapshot();
    reconcile({ ...snapshot, spaces: snapshot.spaces ?? [], projectSpaceIds: snapshot.projectSpaceIds ?? {}, showSpaces: snapshot.showSpaces ?? true });
    return unsubscribe;
  }, [reconcile]);
  const state = accepts(received) ? received : initial;
  const mutate = useCallback(async (write: (owner: DataOwnerPushStamp) => Promise<SidebarSpacesState>) => {
    // The callback keeps the stamp that opened a dialog or started a drag. Never
    // rebind a pending user action to a newly signed-in account.
    if (!isDataOwnerPushStampCurrent(stamp)) return false;
    try {
      const next = await write(stamp);
      if (!accepts(next)) return false;
      reconcile(next);
      return true;
    } catch (error) {
      if (isDataOwnerPushStampCurrent(stamp)) {
        const code = extractIpcError(error);
        const key = code ? mapIpcErrorToI18nKey(error) : 'ccAgent.sidebar.spaces.updateFailed';
        toast.error(t(key, { defaultValue: t('ccAgent.sidebar.spaces.updateFailed') }));
      }
      return false;
    }
  }, [stamp, accepts, reconcile, t]);
  const api = window.electronAPI.sidebarSettings;
  return useMemo(() => ({
    ...state,
    create: (name: string) => mutate(owner => api.createSpace(name, owner)),
    update: (id: string, patch: { name?: string; collapsed?: boolean }) => mutate(owner => api.updateSpace(id, patch, owner)),
    delete: (id: string) => mutate(owner => api.deleteSpace(id, owner)),
    assign: (projectKey: string, spaceId: string | null) => mutate(owner => api.setProjectSpace(projectKey, spaceId, owner)),
    setShow: (show: boolean) => mutate(owner => api.setShowSpaces(show, owner)),
  }), [state, mutate, api]);
}

export type SidebarSpacesController = ReturnType<typeof useSidebarSpacesState>;

/** A new account/generation gets a fresh projection and fresh dialog callbacks. */
export function SidebarSpacesBoundary({ children }: { children: ReactNode }) {
  const { dataOwnerId, dataOwnerGeneration } = useAuth();
  return <SidebarSpacesProvider key={JSON.stringify([dataOwnerId, dataOwnerGeneration])}>{children}</SidebarSpacesProvider>;
}
type SidebarSpacesActions = SidebarSpacesController & {
  requestCreate: () => void;
  requestRename: (space: SidebarSpace) => void;
  requestDelete: (space: SidebarSpace) => void;
  moveProject: (project: Pick<ProjectNode, 'projectKey' | 'displayName'>, spaceId: string | null) => void;
};
const SidebarSpacesContext = createContext<SidebarSpacesActions | null>(null);

export function SidebarSpacesProvider({ children }: { children: ReactNode }) {
  const value = useSidebarSpacesState();
  const { t } = useTranslation();
  const [edit, setEdit] = useState<{ name: string | null; save: (name: string) => Promise<boolean> } | null>(null);
  const [confirmation, setConfirmation] = useState<{ title: string; description: string; action: string; run: () => Promise<boolean> } | null>(null);
  const [busy, setBusy] = useState(false);
  const actions = useMemo<SidebarSpacesActions>(() => ({
    ...value,
    requestCreate: () => setEdit({ name: null, save: value.create }),
    requestRename: space => setEdit({ name: space.name, save: name => value.update(space.id, { name }) }),
    requestDelete: space => setConfirmation({
      title: t('ccAgent.sidebar.spaces.deleteTitle'),
      description: t('ccAgent.sidebar.spaces.deleteDescription', { name: space.name }),
      action: t('ccAgent.sidebar.spaces.delete'), run: () => value.delete(space.id),
    }),
    moveProject: (project, spaceId) => {
      const current = projectSpaceId(project.projectKey, value, window.electronAPI.platform);
      if (current === spaceId) return;
      if (spaceId !== null) { void value.assign(project.projectKey, spaceId); return; }
      setConfirmation({ title: t('ccAgent.sidebar.spaces.removeTitle'), description: t('ccAgent.sidebar.spaces.removeDescription', { project: project.displayName }), action: t('ccAgent.sidebar.spaces.remove'), run: () => value.assign(project.projectKey, null) });
    },
  }), [value, t]);
  // Dialog callbacks keep the original owner fence; a late result cannot write
  // into another account even if it outlives this UI.
  useLayoutEffect(() => { setEdit(null); setConfirmation(null); }, [value.dataOwnerId, value.ownerGeneration]);
  return <SidebarSpacesContext.Provider value={actions}>
    {children}
    {edit && <SpaceNameDialog key={`${value.dataOwnerId}:${value.ownerGeneration}:${edit.name}`} name={edit.name} onSave={edit.save} onClose={() => setEdit(null)} />}
    <ConfirmDialog open={confirmation !== null} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }} title={confirmation?.title ?? ''} description={confirmation?.description} confirmText={confirmation?.action} loading={busy} onConfirm={() => {
      if (!confirmation || busy) return;
      setBusy(true);
      void confirmation.run().then(saved => { if (saved) setConfirmation(null); }).finally(() => setBusy(false));
    }} />
  </SidebarSpacesContext.Provider>;
}

/** Optional for isolated project consumers outside the sidebar. */
export function useSidebarSpaces() { return useContext(SidebarSpacesContext); }
