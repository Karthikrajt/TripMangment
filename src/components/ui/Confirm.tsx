import { create } from 'zustand';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}
interface ConfirmState extends Partial<ConfirmOptions> {
  open: boolean;
  resolve?: (v: boolean) => void;
}
const useConfirmStore = create<ConfirmState>(() => ({ open: false }));

/** Promise-based confirmation dialog: `if (await confirm({...})) ...` */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ ...opts, open: true, resolve }));
}

export function ConfirmHost() {
  const s = useConfirmStore();
  const close = (v: boolean) => {
    s.resolve?.(v);
    useConfirmStore.setState({ open: false, resolve: undefined });
  };
  return (
    <Modal
      open={s.open}
      onClose={() => close(false)}
      title={s.title ?? 'Are you sure?'}
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant={s.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {s.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      <p className="text-slate-700">{s.message}</p>
    </Modal>
  );
}
