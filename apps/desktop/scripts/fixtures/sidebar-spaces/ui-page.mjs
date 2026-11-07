import assert from 'node:assert/strict';

export default {
  name: 'sidebar-spaces',
  entry: './spaces-fixture.tsx',
  viewport: { width: 680, height: 540 },
  real: 'SpaceSection, ProjectNode, SpaceNameDialog, sidebar menus and themed controls',
  notCovered: 'Desktop IPC persistence, cross-device loading, drag gestures and complete sidebar grouping',
  stubs: {
    'src/renderer/contexts/AuthContext': { partial: 'export const useAuth = () => ({ dataOwnerId: null, dataOwnerGeneration: 0 });' },
  },
  cases: {
    default: { about: 'Two spaces, running projects, remote count and an empty space' },
    'long-name': { about: 'Long space name alongside counts in the sidebar' },
  },
  async check(page, ui) {
    const title = ui.case === 'long-name' ? 'A very long project planning space name that needs truncation' : 'Product';
    await page.getByText(title, { exact: true }).waitFor();
    const menu = page.getByRole('button', { name: await ui.t('ccAgent.sidebar.spaces.menu') }).first();
    await menu.click();
    await page.getByRole('menuitem', { name: await ui.t('ccAgent.sidebar.spaces.rename') }).click();
    await page.getByLabel(await ui.t('ccAgent.sidebar.spaces.name')).fill('Studio');
    await ui.capture('rename');
    await page.getByRole('button', { name: await ui.t('ccAgent.sidebar.spaces.save') }).click();
    await page.getByText('Studio', { exact: true }).waitFor();
    assert.equal(await page.getByText('Studio', { exact: true }).count(), 1);
    await ui.capture('renamed');
  },
};
