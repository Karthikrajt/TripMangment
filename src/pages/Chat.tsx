import { useEffect, useRef, useState } from 'react';
import { Paperclip, Send, Trash2, FileText, Megaphone, ImageIcon, X } from 'lucide-react';
import { useSession, useIsAdmin } from '../store/session';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Feedback';
import { toast } from '../components/ui/Toast';
import { confirm } from '../components/ui/Confirm';
import { sendMessage, deleteMessage, loadOlder } from '../services/chat';
import { markRead } from '../services/users';
import { uploadFile } from '../lib/files';
import { viewFile } from '../components/DocViewer';
import { validateFileMeta } from '../../supabase/functions/_shared/fileRules';
import { formatClock, formatDateLong, todayIST, tsToDate } from '../lib/format';
import { errorMessage } from '../lib/retry';
import { useOnline } from '../hooks/useOnline';
import { CHAT_PAGE_SIZE } from '../config/constants';
import type { ChatMessage } from '../domain/types';

function Attachment({ m }: { m: ChatMessage }) {
  return (
    <button onClick={() => viewFile(m.filePath, m.fileName || 'Attachment', m.fileType)} className="mt-1 flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-left text-sm hover:bg-black/10">
      {m.kind === 'image' ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
      <span className="truncate">{m.fileName || 'Attachment'}</span>
    </button>
  );
}

export default function Chat() {
  const { messages, member, profile } = useSession();
  const admin = useIsAdmin();
  const online = useOnline();
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(messages.length >= CHAT_PAGE_SIZE);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const all = [...older, ...messages];
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
    if (member && messages.length) {
      const latest = messages[messages.length - 1]?.createdAt?.toMillis?.() ?? 0;
      if (latest > (profile?.chatLastReadAt?.toMillis?.() ?? 0)) markRead(member.uid, 'chatLastReadAt');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const fetchOlder = async () => {
    const oldest = all.find((m) => m.createdAt);
    if (!oldest?.createdAt) return;
    const page = await loadOlder(oldest.createdAt);
    const items = page.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage).reverse();
    setOlder((o) => [...items, ...o]);
    if (page.docs.length < CHAT_PAGE_SIZE) setHasMore(false);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member || sending || (!text.trim() && !file)) return;
    setSending(true);
    try {
      const uploaded = file ? await uploadFile('chat', file) : null;
      await sendMessage(text, { uid: member.uid, name: member.displayName, photo: member.photoURL }, uploaded);
      setText('');
      setFile(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const pick = (f?: File) => {
    if (!f) return;
    const c = validateFileMeta('chat', f.name, f.type, f.size);
    if (!c.ok && !(f.type.startsWith('image/') && /too large/.test(c.error))) return toast.error(c.error);
    setFile(f);
  };

  const remove = async (m: ChatMessage) => {
    if (!(await confirm({ title: 'Delete message?', message: 'This message will be removed for everyone.', danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteMessage(m);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  let lastDay = '';
  return (
    <div className="-mx-4 -mt-5 flex h-[calc(100dvh-8.5rem)] flex-col sm:-mx-6 lg:mx-0 lg:mt-0 lg:h-[calc(100dvh-4rem)] lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white">
      <div className="border-b border-slate-200 bg-white px-4 py-3 lg:rounded-t-2xl">
        <h1 className="text-xl font-bold">Group Chat</h1>
        <p className="text-sm text-slate-500">Everyone on the trip can see these messages.</p>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-3 py-4" aria-live="polite">
        {hasMore && all.length > 0 && (
          <div className="text-center"><Button size="sm" variant="secondary" onClick={fetchOlder}>Load older messages</Button></div>
        )}
        {all.length === 0 && <EmptyState title="No messages yet" message="Say hello to the group! 👋" />}
        {all.map((m) => {
          const mine = m.senderUid === member?.uid;
          const d = tsToDate(m.createdAt);
          const day = d ? todayIST(d) : todayIST();
          const showDay = day !== lastDay;
          lastDay = day;
          if (m.kind === 'announcement') {
            return (
              <div key={m.id}>
                {showDay && <DayDivider day={day} />}
                <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <p className="flex items-center gap-1 text-xs font-semibold uppercase text-amber-800"><Megaphone className="size-3" /> Announcement · {m.senderName}</p>
                  <p className="whitespace-pre-line text-slate-800">{m.text.replace(/^📢 /, '')}</p>
                  <p className="text-right text-xs text-slate-500">{formatClock(m.createdAt)}</p>
                </div>
              </div>
            );
          }
          return (
            <div key={m.id}>
              {showDay && <DayDivider day={day} />}
              <div className={`group flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                {!mine && <Avatar name={m.senderName} photo={m.senderPhoto} size={30} />}
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm ${mine ? 'rounded-br-sm bg-brand-700 text-white' : 'rounded-bl-sm bg-white text-slate-800'}`}>
                  {!mine && <p className="text-xs font-semibold text-brand-700">{m.senderName}</p>}
                  {m.text && <p className="whitespace-pre-line break-words">{m.text}</p>}
                  {m.filePath && <Attachment m={m} />}
                  <p className={`mt-0.5 text-right text-[11px] ${mine ? 'text-brand-100' : 'text-slate-400'}`}>{m.createdAt ? formatClock(m.createdAt) : 'sending…'}</p>
                </div>
                {(mine || admin) && (
                  <button onClick={() => remove(m)} className="rounded-full p-1.5 text-slate-400 opacity-0 hover:bg-slate-200 hover:text-red-600 focus:opacity-100 group-hover:opacity-100" aria-label="Delete message">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="border-t border-slate-200 bg-white p-3 lg:rounded-b-2xl">
        {file && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm">
            <Paperclip className="size-4" /> <span className="flex-1 truncate">{file.name}</span>
            <button type="button" onClick={() => setFile(null)} aria-label="Remove attachment"><X className="size-4" /></button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} aria-label="Attach file" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={!online} className="rounded-full p-3 text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="Attach image or document">
            <Paperclip className="size-5" />
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 1024px)').matches) {
                e.preventDefault();
                send(e as unknown as React.FormEvent);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Type a message…"
            aria-label="Message"
            className="max-h-32 flex-1 resize-none rounded-2xl border border-slate-300 px-4 py-2.5 focus:border-brand-600 focus:outline-none"
          />
          <Button type="submit" className="rounded-full !px-3" loading={sending} disabled={!text.trim() && !file} aria-label="Send">
            {!sending && <Send className="size-5" />}
          </Button>
        </div>
      </form>
    </div>
  );
}

function DayDivider({ day }: { day: string }) {
  return (
    <div className="my-3 text-center">
      <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">{day === todayIST() ? 'Today' : formatDateLong(day)}</span>
    </div>
  );
}
