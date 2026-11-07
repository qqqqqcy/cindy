import { useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Creation and rename share the existing modal and form primitives. */
export function SpaceNameDialog({ name, onSave, onClose }: { name: string | null; onSave: (name: string) => Promise<boolean>; onClose: () => void }) {
  const { t } = useTranslation();
  const inputId = useId();
  const [value, setValue] = useState(name ?? '');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!value.trim() || saving) return;
    setSaving(true);
    const saved = await onSave(value.trim());
    setSaving(false);
    if (saved) onClose();
  };
  return (
    <Dialog.Root open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-scrim fixed inset-0 z-[10000]" />
        <Dialog.Content aria-describedby={undefined} onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} className="modal-panel fixed left-1/2 top-1/2 z-[10000] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 p-4">
          <Dialog.Title className="text-sm font-medium text-[var(--confirm-title)]">{t(name === null ? 'ccAgent.sidebar.spaces.create' : 'ccAgent.sidebar.spaces.rename')}</Dialog.Title>
          <form onSubmit={event => { event.preventDefault(); void submit(); }} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor={inputId} className="text-xs text-[var(--text-secondary)]">{t('ccAgent.sidebar.spaces.name')}</label>
              <Input id={inputId} autoFocus value={value} maxLength={120} disabled={saving} onChange={setValue} />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="submit" disabled={!value.trim() || saving}>{t(name === null ? 'ccAgent.sidebar.spaces.create' : 'ccAgent.sidebar.spaces.save')}</Button>
              <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>{t('commonUi.confirmDialog.cancel')}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
