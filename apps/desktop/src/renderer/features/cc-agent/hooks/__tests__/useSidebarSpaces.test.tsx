// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDataOwnerGeneration, setDataOwnerGeneration } from '@/contexts/dataOwnerGeneration';
import type { SidebarSpacesState } from '../../../../../shared/sidebarSettings';
import { SidebarSpacesBoundary, useSidebarSpaces } from '../useSidebarSpaces';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ dataOwnerId: getDataOwnerGeneration().dataOwnerId, dataOwnerGeneration: getDataOwnerGeneration().generation }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn() } }));
// These primitives isolate the test from portals/animation, while all intent,
// owner fencing and confirmation decisions run through the real provider.
vi.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: ({ open, title, onConfirm, onOpenChange }: { open: boolean; title: string; onConfirm: () => void; onOpenChange: (open: boolean) => void }) => open ? <div role="dialog"><span>{title}</span><button onClick={onConfirm}>confirm</button><button onClick={() => onOpenChange(false)}>cancel</button></div> : null }));
vi.mock('../../sidebar/SpaceNameDialog', () => ({ SpaceNameDialog: () => null }));

type Listener = (state: SidebarSpacesState) => void;
let current: SidebarSpacesState;
let listeners: Listener[];
let api: { loadSnapshot: ReturnType<typeof vi.fn>; onSpacesChanged: (listener: Listener) => () => void; setProjectSpace: ReturnType<typeof vi.fn>; updateSpace: ReturnType<typeof vi.fn>; deleteSpace: ReturnType<typeof vi.fn>; createSpace: ReturnType<typeof vi.fn>; setShowSpaces: ReturnType<typeof vi.fn> };
const snapshot = (owner: string, generation: number, spaceName = 'Work'): SidebarSpacesState => ({ dataOwnerId: owner, ownerGeneration: generation, spaces: [{ id: 'work', name: spaceName, order: 0, collapsed: false }], projectSpaceIds: { 'local:/a': 'work' }, showSpaces: true });
const withSidebarFields = (state: SidebarSpacesState) => ({ ...state, pinnedOrder: [], pinnedOrderIsAuthoritative: false, hiddenProjectKeys: [], hiddenMainViewGhostIds: [] });
function push(state: SidebarSpacesState) { current = state; for (const listener of [...listeners]) listener(state); }
function Probe() {
  const spaces = useSidebarSpaces()!;
  return <div>
    <output data-testid="state">{JSON.stringify({ owner: spaces.dataOwnerId, names: spaces.spaces.map(space => space.name), collapsed: spaces.spaces[0]?.collapsed, membership: spaces.projectSpaceIds, show: spaces.showSpaces })}</output>
    <button onClick={() => void spaces.update('work', { collapsed: true })}>collapse</button>
    <button onClick={() => void spaces.setShow(false)}>hide</button>
    <button onClick={() => spaces.moveProject({ projectKey: 'local:/a', displayName: 'A' }, null)}>remove</button>
    <button onClick={() => spaces.requestDelete(spaces.spaces[0])}>delete</button>
  </div>;
}
function View() { return <SidebarSpacesBoundary><Probe /></SidebarSpacesBoundary>; }
function shown() { return JSON.parse(screen.getByTestId('state').textContent!); }

beforeEach(() => {
  setDataOwnerGeneration('owner-a', 1);
  current = snapshot('owner-a', 1);
  listeners = [];
  const write = (next: SidebarSpacesState) => { push(next); return Promise.resolve(next); };
  api = {
    loadSnapshot: vi.fn(() => withSidebarFields(current)),
    onSpacesChanged: listener => { listeners.push(listener); return () => { listeners = listeners.filter(item => item !== listener); }; },
    setProjectSpace: vi.fn((_key, _id, _stamp) => write({ ...current, projectSpaceIds: {} })),
    updateSpace: vi.fn((_id, patch, _stamp) => write({ ...current, spaces: current.spaces.map(space => ({ ...space, ...patch })) })),
    deleteSpace: vi.fn((_id, _stamp) => write({ ...current, spaces: [], projectSpaceIds: {} })),
    createSpace: vi.fn(),
    setShowSpaces: vi.fn((show, _stamp) => write({ ...current, showSpaces: show })),
  };
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { platform: 'darwin', sidebarSettings: api } });
});
afterEach(cleanup);

// Test value: spaces.md P0 and owner-scoped writes: old account dialogs and
// late replies must never change the new account. Existing hidden-project tests
// do not exercise the spaces provider, confirmed removals, or its live stream.
// Minimal input: one owner, one assigned project, then switch owner (unit tier).
describe('space settings provider', () => {
  it('hydrates before paint and follows durable collapse/show changes from another window', async () => {
    const view = render(<View />);
    expect(shown()).toMatchObject({ owner: 'owner-a', names: ['Work'], collapsed: false });
    fireEvent.click(screen.getByText('collapse'));
    await waitFor(() => expect(shown().collapsed).toBe(true));
    expect(api.updateSpace).toHaveBeenCalledWith('work', { collapsed: true }, { dataOwnerId: 'owner-a', ownerGeneration: 1 });
    view.unmount();
    render(<View />);
    expect(shown().collapsed).toBe(true);
    act(() => push({ ...current, showSpaces: false }));
    expect(shown()).toMatchObject({ show: false, membership: { 'local:/a': 'work' } });
  });

  it('captures the initiating owner and ignores an old reply after an account switch', async () => {
    let resolveWrite!: (state: SidebarSpacesState) => void;
    api.updateSpace.mockImplementationOnce(() => new Promise<SidebarSpacesState>(resolve => { resolveWrite = resolve; }));
    const view = render(<View />);
    fireEvent.click(screen.getByText('collapse'));
    expect(api.updateSpace).toHaveBeenCalledWith('work', { collapsed: true }, { dataOwnerId: 'owner-a', ownerGeneration: 1 });
    const oldReply = snapshot('owner-a', 1, 'Old');
    act(() => { setDataOwnerGeneration('owner-b', 2); current = snapshot('owner-b', 2, 'New'); view.rerender(<View />); });
    expect(shown()).toMatchObject({ owner: 'owner-b', names: ['New'] });
    await act(async () => { resolveWrite(oldReply); await Promise.resolve(); });
    expect(shown()).toMatchObject({ owner: 'owner-b', names: ['New'] });
    act(() => { for (const listener of listeners) listener(oldReply); });
    expect(shown().names).toEqual(['New']);
  });

  it('remounts on the same owner generation change and cancels a pending removal', () => {
    const view = render(<View />);
    fireEvent.click(screen.getByText('remove'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    act(() => { setDataOwnerGeneration('owner-a', 2); current = snapshot('owner-a', 2, 'Repaired'); view.rerender(<View />); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(shown().names).toEqual(['Repaired']);
    expect(api.setProjectSpace).not.toHaveBeenCalled();
  });

  it('keeps membership on cancel and removes it only after confirmation', async () => {
    render(<View />);
    fireEvent.click(screen.getByText('remove'));
    fireEvent.click(screen.getByText('cancel'));
    expect(api.setProjectSpace).not.toHaveBeenCalled();
    expect(shown().membership).toEqual({ 'local:/a': 'work' });
    fireEvent.click(screen.getByText('remove'));
    fireEvent.click(screen.getByText('confirm'));
    await waitFor(() => expect(shown().membership).toEqual({}));
    expect(api.setProjectSpace).toHaveBeenCalledWith('local:/a', null, { dataOwnerId: 'owner-a', ownerGeneration: 1 });
  });

  it('only clears the space and membership after confirming deletion', async () => {
    render(<View />);
    fireEvent.click(screen.getByText('delete'));
    fireEvent.click(screen.getByText('cancel'));
    expect(shown()).toMatchObject({ names: ['Work'], membership: { 'local:/a': 'work' } });
    fireEvent.click(screen.getByText('delete'));
    fireEvent.click(screen.getByText('confirm'));
    await waitFor(() => expect(shown()).toMatchObject({ names: [], membership: {} }));
    expect(api.deleteSpace).toHaveBeenCalledWith('work', { dataOwnerId: 'owner-a', ownerGeneration: 1 });
  });
});
