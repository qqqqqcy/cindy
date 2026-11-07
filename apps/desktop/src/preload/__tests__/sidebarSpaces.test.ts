import { describe, expect, it, vi } from 'vitest';

// Unit: exercise the actual context bridge. Existing sidebar store tests cannot detect
// preload dropping new snapshot fields, owner stamps or Electron events.
const mocks = vi.hoisted(() => ({
  expose: vi.fn(),
  sendSync: vi.fn(),
  invoke: vi.fn(),
  listeners: new Map<string, (...args: unknown[]) => void>(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  webUtils: { getPathForFile: vi.fn() },
  ipcRenderer: {
    sendSync: mocks.sendSync,
    invoke: mocks.invoke,
    send: vi.fn(),
    on: (channel: string, listener: (...args: unknown[]) => void) => mocks.listeners.set(channel, listener),
    removeListener: vi.fn(),
  },
}));

describe('sidebar spaces preload bridge', () => {
  it('reads legacy snapshots and forwards stamped mutations and validated events', async () => {
    const stamp = { dataOwnerId: 'owner-a', ownerGeneration: 4 };
    const legacy = { ...stamp, pinnedOrderIsAuthoritative: false, pinnedOrder: [], hiddenProjectKeys: [], hiddenMainViewGhostIds: [] };
    const state = { ...stamp, spaces: [{ id: 'id', name: 'Work', order: 0, collapsed: false }], projectSpaceIds: {}, showSpaces: true };
    mocks.sendSync.mockImplementation((channel) => channel === 'sidebar-settings:load-snapshot-sync' ? legacy : {});
    mocks.invoke.mockResolvedValue(state);
    await import('../preload');
    const bridge = mocks.expose.mock.calls.find(([name]) => name === 'electronAPI')![1].sidebarSettings;
    expect(bridge.loadSnapshot()).toMatchObject({ ...legacy, spaces: [], projectSpaceIds: {}, showSpaces: true });
    expect(await bridge.createSpace('Work', stamp)).toEqual(state);
    expect(mocks.invoke).toHaveBeenCalledWith('sidebar-settings:spaces-create', { ...stamp, name: 'Work' });
    const callback = vi.fn();
    bridge.onSpacesChanged(callback);
    const listener = mocks.listeners.get('sidebar-settings:spaces-changed')!;
    listener({ privileged: true }, state);
    listener({ privileged: true }, { ...state, spaces: null });
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(state);
  });
});
