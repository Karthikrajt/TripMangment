import { useEffect, useState } from 'react';
import { Bell, BellOff, CloudOff, HardDrive, LogOut, Pencil, Smartphone, Trash2, Download } from 'lucide-react';
import { useSession } from '../store/session';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { Badge, Notice } from '../components/ui/Feedback';
import { Checkbox } from '../components/ui/Field';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { EditMember } from './Members';
import { disablePush, enablePush, pushEnabledLocally, pushSupported } from '../lib/push';
import { clearOffline, listOffline, openBlob, removeOffline, type OfflineFile } from '../lib/offlineFiles';
import { isSharedDevice, setSharedDevice, db } from '../lib/firebase';
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';
import { clearSyncState } from '../lib/sync';
import { formatBytes } from '../lib/format';
import { errorMessage } from '../lib/retry';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { autoOfflineTickets, setAutoOfflineTickets, syncTicketFiles } from '../lib/offlineSync';
import { useTickets } from '../hooks/data';
import { useWhoAreYou } from '../components/WhoAreYou';

export default function Profile() {
  const { member, signOut } = useSession();
  const [editing, setEditing] = useState(false);
  const [pushOk, setPushOk] = useState(false);
  const [pushOn, setPushOn] = useState(pushEnabledLocally());
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState<OfflineFile[]>([]);
  const [autoTickets, setAutoTickets] = useState(autoOfflineTickets());
  const [syncing, setSyncing] = useState(false);
  const tickets = useTickets();
  const install = useInstallPrompt();
  const openWho = useWhoAreYou((s) => s.open);
  const members = useSession((s) => s.members);
  const linkedTo = member?.personId ? members.find((m) => m.uid === member.personId) : undefined;

  useEffect(() => {
    pushSupported().then(setPushOk);
    listOffline().then(setOffline).catch(() => undefined);
  }, []);

  async function downloadAll() {
    setSyncing(true);
    try {
      const r = await syncTicketFiles(tickets.data);
      setOffline(await listOffline());
      toast.success(r.failed ? `Saved ${r.downloaded} ticket(s); ${r.failed} could not be downloaded` : r.downloaded ? `Saved ${r.downloaded} ticket(s) on this phone` : 'All tickets are already on this phone');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSyncing(false);
    }
  }

  if (!member) return null;

  const togglePush = async () => {
    setBusy(true);
    try {
      if (pushOn) {
        await disablePush(member.uid);
        setPushOn(false);
        toast.info('Push notifications turned off on this device');
      } else {
        const r = await enablePush(member.uid);
        if (r === 'enabled') {
          setPushOn(true);
          toast.success('Push notifications enabled');
        } else toast.error(r === 'denied' ? 'Notifications are blocked in your browser settings.' : 'Push notifications are not supported on this device.');
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const wipeDevice = async () => {
    if (!(await confirm({ title: 'Remove trip data from this device?', message: 'Offline tickets and cached trip data will be deleted and you will be signed out.', danger: true, confirmLabel: 'Remove & sign out' }))) return;
    await disablePush(member.uid).catch(() => undefined);
    await clearOffline().catch(() => undefined);
    clearSyncState();
    await signOut();
    await terminate(db).catch(() => undefined);
    await clearIndexedDbPersistence(db).catch(() => undefined);
    window.location.href = '/';
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Profile" />
      <Card>
        <CardBody className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Avatar name={member.displayName} photo={member.photoURL} size={72} />
          <div className="flex-1">
            <p className="text-xl font-bold">{member.displayName}</p>
            <p className="text-slate-600">{member.email}</p>
            <div className="mt-1 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Badge tone={member.role === 'admin' ? 'violet' : 'brand'}>{member.role === 'admin' ? 'Trip admin' : 'Trip member'}</Badge>
              {member.relationship && <Badge>{member.relationship}</Badge>}
              {linkedTo && <Badge tone="sky">You are {linkedTo.displayName}</Badge>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Edit details</Button>
            {!member.personId && <Button variant="ghost" onClick={openWho}>Which traveller are you?</Button>}
          </div>
        </CardBody>
        <CardBody className="grid gap-3 border-t border-slate-100 sm:grid-cols-2">
          <div><p className="text-sm text-slate-500">Mobile</p><p className="font-medium">{member.phone || 'Not added'}</p></div>
          <div><p className="text-sm text-slate-500">Emergency contact</p><p className="font-medium">{member.emergencyContact || 'Not added'}</p></div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<Bell className="size-5" />} title="Notifications" />
        <CardBody className="space-y-3">
          <p className="text-slate-600">In-app notifications always work. Push notifications alert you even when the app is closed.</p>
          {pushOk ? (
            <Button variant={pushOn ? 'secondary' : 'primary'} loading={busy} onClick={togglePush} icon={pushOn ? <BellOff className="size-5" /> : <Bell className="size-5" />}>
              {pushOn ? 'Turn off push on this device' : 'Enable push notifications'}
            </Button>
          ) : (
            <Notice>Push notifications aren't available on this device/browser. On iPhone, add the app to your Home Screen first (iOS 16.4+).</Notice>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<Smartphone className="size-5" />} title="App & device" />
        <CardBody className="space-y-4">
          {install.canInstall && <Button icon={<Download className="size-5" />} onClick={install.prompt}>Install app on this device</Button>}
          {install.isIos && !install.standalone && <Notice>To install on iPhone: tap the Share button in Safari, then “Add to Home Screen”.</Notice>}
          <p className="text-sm text-slate-500">App version: {new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(__BUILD_TIME__))}</p>
          <Checkbox
            label="This is a shared or borrowed device"
            description="Keep trip data in memory only (requires reload). Offline access will not be available."
            checked={isSharedDevice()}
            onChange={(v) => {
              setSharedDevice(v);
              window.location.reload();
            }}
          />
          <Checkbox
            label="Keep tickets on this phone for offline use"
            description="All ticket PDFs and photos are downloaded and kept up to date, so they open without internet. Trip details (itinerary, hotel, transport, expenses) are always saved for offline use."
            checked={autoTickets}
            onChange={async (v) => {
              setAutoOfflineTickets(v);
              setAutoTickets(v);
              if (v) await downloadAll();
            }}
          />
          <div>
            <p className="mb-2 flex items-center gap-2 font-medium"><HardDrive className="size-4" /> Tickets saved on this phone ({offline.length} of {tickets.data.length})</p>
            {autoTickets && <Button size="sm" variant="secondary" className="mb-2" loading={syncing} onClick={downloadAll}>Update offline tickets now</Button>}
            {offline.length === 0 ? (
              <p className="text-sm text-slate-500">None. Use “Save for offline” on a ticket to keep a copy on this device.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {offline.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 px-3 py-2">
                    <button className="flex-1 truncate text-left text-brand-700" onClick={() => openBlob(f)}>{f.name}</button>
                    <span className="text-xs text-slate-500">{formatBytes(f.blob.size)}</span>
                    <button aria-label="Remove offline copy" className="rounded p-1 text-slate-500 hover:text-red-600" onClick={async () => { await removeOffline(f.id); setOffline((o) => o.filter((x) => x.id !== f.id)); }}>
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" icon={<CloudOff className="size-5" />} onClick={wipeDevice}>Remove trip data from this device</Button>
            <Button variant="ghost" icon={<LogOut className="size-5" />} onClick={signOut}>Sign out</Button>
          </div>
        </CardBody>
      </Card>
      {editing && <EditMember member={member} onClose={() => setEditing(false)} />}
    </div>
  );
}
