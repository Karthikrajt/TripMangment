import { useState } from 'react';
import { Megaphone, Plus, Trash2 } from 'lucide-react';
import { useAnnouncements } from '../hooks/data';
import { useIsAdmin, useSession } from '../store/session';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge, EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { Checkbox, FormError, TextArea, TextField } from '../components/ui/Field';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { deleteAnnouncement, postAnnouncement } from '../services/content';
import { formatDateTime } from '../lib/format';
import { errorMessage } from '../lib/retry';
import type { Announcement } from '../domain/types';

export default function Announcements() {
  const { data, loading, error } = useAnnouncements(100);
  const admin = useIsAdmin();
  const [open, setOpen] = useState(false);

  const remove = async (a: Announcement) => {
    if (!(await confirm({ title: 'Delete announcement?', message: `“${a.title}” will be removed.`, danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteAnnouncement(a);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <PageHeader title={admin ? 'Group Announcements' : 'Announcements'} subtitle="Important updates from the trip admin." actions={admin && <Button icon={<Plus className="size-5" />} onClick={() => setOpen(true)}>New announcement</Button>} />
      {loading ? <Spinner /> : error ? <ErrorState message={error} /> : data.length === 0 ? (
        <EmptyState icon={<Megaphone className="size-7" />} title="No announcements yet" />
      ) : (
        <ul className="space-y-4">
          {data.map((a) => (
            <Card as="li" key={a.id} className={`p-5 ${a.priority === 'important' ? 'border-amber-300 bg-amber-50' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{a.title}</h2>
                    {a.priority === 'important' && <Badge tone="amber">Important</Badge>}
                  </div>
                  <p className="text-sm text-slate-500">{a.createdByName} · {formatDateTime(a.createdAt)}</p>
                </div>
                {admin && <Button size="sm" variant="ghost" className="text-red-700" aria-label="Delete" icon={<Trash2 className="size-4" />} onClick={() => remove(a)} />}
              </div>
              <p className="mt-3 whitespace-pre-line text-slate-800">{a.body}</p>
            </Card>
          ))}
        </ul>
      )}
      {open && <NewAnnouncement onClose={() => setOpen(false)} />}
    </div>
  );
}

function NewAnnouncement({ onClose }: { onClose: () => void }) {
  const me = useSession((s) => s.member)!;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [important, setImportant] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const post = async () => {
    if (!title.trim() || !body.trim()) return setError('Title and message are required.');
    setBusy(true);
    try {
      await postAnnouncement({ title, body, priority: important ? 'important' : 'normal' }, { uid: me.uid, name: me.displayName, photo: me.photoURL });
      toast.success('Announcement posted and sent to everyone');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="New announcement" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={post}>Post</Button></>}>
      <div className="space-y-4">
        <TextField label="Title" required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bus leaves at 7 AM sharp" />
        <TextArea label="Message" required rows={5} maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} />
        <Checkbox label="Mark as important" checked={important} onChange={setImportant} />
        <FormError message={error} />
      </div>
    </Modal>
  );
}
