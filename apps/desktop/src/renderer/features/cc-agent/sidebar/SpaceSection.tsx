import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, EllipsisVertical, Layers, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tip } from '@/components/ui/tooltip';
import type { SidebarSpace } from '../../../../shared/sidebarSettings';
import { useSidebarSpaces } from '../hooks/useSidebarSpaces';
import { projectSpaceId } from '../lib/sidebarSpaces';
import { SectionCollapse } from './SectionCollapse';
import { MENU_ITEM_CLASS } from './menuStyles';

/** A space precedes devices; even an empty or out-of-scope space keeps its header. */
export function SpaceSection({ space, projectCount, runningCount, otherDeviceCount, empty, children }: { space: SidebarSpace; projectCount: number; runningCount: number; otherDeviceCount: number; empty: boolean; children: ReactNode }) {
  const { t } = useTranslation();
  const controller = useSidebarSpaces();
  return <section data-space-drop-id={space.id} className="flex min-w-0 flex-col gap-1">
    <div className="group/space flex min-w-0 items-center pr-1 pl-2">
      <button type="button" aria-expanded={!space.collapsed} onClick={() => { void controller?.update(space.id, { collapsed: !space.collapsed }); }} className="flex min-h-8 min-w-0 flex-1 items-center gap-1 rounded-full px-1 text-sm font-medium text-[var(--sidebar-nav-text)] hover:bg-sidebar-item-hover focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]">
        {space.collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        <span className="min-w-0 flex-1 truncate text-left" title={space.name}>{space.name}</span>
        <span className="shrink-0 text-xs font-normal text-[var(--text-tertiary)]" title={t('ccAgent.sidebar.spaces.projectCount', { count: projectCount })} aria-label={t('ccAgent.sidebar.spaces.projectCount', { count: projectCount })}>{projectCount}</span>
        {runningCount > 0 && <span className="inline-flex shrink-0 items-center gap-1 text-xs font-normal text-[var(--status-bar-accent)]" title={t('ccAgent.sidebar.spaces.runningCount', { count: runningCount })} aria-label={t('ccAgent.sidebar.spaces.runningCount', { count: runningCount })}><span className="inline-flex session-status-breathing"><Sparkles size={12} aria-hidden /></span>{runningCount}</span>}
        {otherDeviceCount > 0 && <span className="shrink-0 text-xs font-normal text-[var(--text-tertiary)]">{t('ccAgent.sidebar.spaces.otherDevices', { count: otherDeviceCount })}</span>}
      </button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t('ccAgent.sidebar.spaces.menu')} className="flex size-6 shrink-0 items-center justify-center rounded-full text-[var(--sidebar-list-muted)] opacity-0 hover:bg-sidebar-item-hover focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] group-hover/space:opacity-100 data-[state=open]:opacity-100"><EllipsisVertical size={14} aria-hidden /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => controller?.requestRename(space)}>{t('ccAgent.sidebar.spaces.rename')}</DropdownMenuItem>
          <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => controller?.requestDelete(space)}>{t('ccAgent.sidebar.spaces.delete')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <SectionCollapse collapsed={space.collapsed}>
      {empty && otherDeviceCount === 0 ? <p className="px-7 py-1 text-xs text-[var(--text-tertiary)]">{t('ccAgent.sidebar.spaces.empty')}</p> : children}
    </SectionCollapse>
  </section>;
}

/** Lives inside MountedMenuContent so closed project menus add no row subscriptions. */
export function ProjectSpaceMenu({ project, onAction }: { project: { projectKey: string; displayName: string }; onAction: () => void }) {
  const { t } = useTranslation();
  const controller = useSidebarSpaces();
  if (!controller) return null;
  const current = projectSpaceId(project.projectKey, controller, window.electronAPI.platform);
  return <>
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={MENU_ITEM_CLASS}>{t('ccAgent.sidebar.spaces.moveTo')}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-w-[280px]">
        {controller.spaces.map(space => <DropdownMenuItem key={space.id} disabled={space.id === current} className={MENU_ITEM_CLASS} onSelect={() => { controller.moveProject(project, space.id); onAction(); }}><span className="truncate" title={space.name}>{space.name}</span></DropdownMenuItem>)}
        <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => { controller.requestCreate(); onAction(); }}>{t('ccAgent.sidebar.spaces.create')}</DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
    {current && <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => { controller.moveProject(project, null); onAction(); }}>{t('ccAgent.sidebar.spaces.remove')}</DropdownMenuItem>}
  </>;
}

export function SpaceDisplayMenuItems() {
  const { t } = useTranslation();
  const controller = useSidebarSpaces();
  if (!controller) return null;
  return <>
    <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={event => { event.preventDefault(); void controller.setShow(!controller.showSpaces); }} role="menuitemcheckbox" aria-checked={controller.showSpaces}>
      <Layers size={14} aria-hidden /><span className="flex-1">{t('ccAgent.sidebar.spaces.show')}</span><span aria-hidden>{controller.showSpaces ? '✓' : ''}</span>
    </DropdownMenuItem>
    <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => controller.requestCreate()}>{t('ccAgent.sidebar.spaces.create')}</DropdownMenuItem>
  </>;
}

/** Only present during a project drag; unassigned projects keep their usual device sections. */
export function SpaceExitDropTarget() {
  const { t } = useTranslation();
  return <Tip text={t('ccAgent.sidebar.spaces.remove')}><div data-space-drop-id="" className="mx-3 flex min-h-8 items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] px-3 text-xs text-[var(--text-secondary)]">{t('ccAgent.sidebar.spaces.unassigned')}</div></Tip>;
}
