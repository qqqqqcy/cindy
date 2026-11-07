import { isDataOwnerGenerationCurrent, subscribeDataOwnerGeneration, type DataOwnerGeneration } from '@/contexts/dataOwnerGeneration';
import { projectKeyComparisonKey, type ProjectNode } from './projectGrouping';

/** Pinned rows remain available even while the main list is filtered or flat. */
export function resolveProjectFocusLocation(projectKey: string, pinned: readonly ProjectNode[], visible: readonly ProjectNode[], groupBy: 'project' | 'flat', platform: string): 'pinned' | 'project' | 'unavailable' {
  const target = projectKeyComparisonKey(projectKey, platform) ?? projectKey;
  const contains = (projects: readonly ProjectNode[]) => projects.some(project => (projectKeyComparisonKey(project.projectKey, platform) ?? project.projectKey) === target);
  if (contains(pinned)) return 'pinned';
  return groupBy === 'project' && contains(visible) ? 'project' : 'unavailable';
}

/** Wait for a deep-linked project to be mounted after revealing its space and
 * device. The pending navigation survives asynchronous UI/IPC updates; the
 * caller disposes this observer when the intent or owner changes. */
export function waitForSidebarProjectNode(projectKey: string, onVisible: () => void, root: Document | HTMLElement = document, onUnavailable?: () => void, owner?: DataOwnerGeneration, deadline: number = Date.now() + 3000): () => void {
  let disposed = false;
  let frame: number | null = null;
  const dispose = () => {
    disposed = true;
    observer.disconnect();
    unsubscribeOwner();
    clearTimeout(timeout);
    if (frame !== null) cancelAnimationFrame(frame);
  };
  const inspect = () => {
    frame = null;
    if (disposed) return;
    if (owner && !isDataOwnerGenerationCurrent(owner)) { dispose(); return; }
    const node = [...root.querySelectorAll<HTMLElement>('[data-project-workingdir]')].find(element => element.getAttribute('data-project-workingdir') === projectKey && !element.closest('[hidden], [data-sidebar-section-collapsed="true"]'));
    if (!node) return;
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    dispose();
    onVisible();
  };
  const schedule = () => { if (!disposed && frame === null) frame = requestAnimationFrame(inspect); };
  const observer = new MutationObserver(schedule);
  const unsubscribeOwner = subscribeDataOwnerGeneration(() => {
    if (owner && !isDataOwnerGenerationCurrent(owner)) dispose();
  });
  const timeout = setTimeout(() => { if (!disposed) { dispose(); onUnavailable?.(); } }, Math.max(0, deadline - Date.now()));
  observer.observe(root instanceof Document ? root.documentElement : root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'data-sidebar-section-collapsed'] });
  schedule();
  return dispose;
}
