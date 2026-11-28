/**
 * Free group video call buttons:
 * - "Video call" → the trip's private Jitsi Meet room (browser, or the Jitsi app on phones)
 * - "WhatsApp group" → the family's WhatsApp group, to start a group video call there
 * After starting a Jitsi call the person can notify everyone (push + bell).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Video } from 'lucide-react';
import { useIsAdmin, useSession } from '../store/session';
import { jitsiUrl } from '../domain/call';
import { notify } from '../services/base';
import { buttonClass, Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { WhatsAppIcon } from './ShareWhatsApp';
import { toast } from './ui/Toast';

function MeetIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="m15 10 5-3v10l-5-3" />
      <path d="M6 10h5M6 14h3" />
    </svg>
  );
}

export function CallButtons({ size = 'md', className = '', askToNotify = true, explainIfMissing = false }: { size?: 'sm' | 'md' | 'lg'; className?: string; askToNotify?: boolean; explainIfMissing?: boolean }) {
  const trip = useSession((s) => s.trip);
  const me = useSession((s) => s.member);
  const admin = useIsAdmin();
  const [asking, setAsking] = useState(false);
  const room = trip?.callRoom;
  const group = trip?.whatsappGroupUrl;
  const meet = trip?.googleMeetUrl;
  const [link, setLink] = useState('/call');
  const icon = size === 'sm' ? 'size-4' : 'size-5';

  if (!room && !group && !meet) {
    if (admin) return <Link to="/admin/settings" className={buttonClass(explainIfMissing ? 'primary' : 'secondary', size, className)}><Video className={icon} /> Set up video calls</Link>;
    return explainIfMissing ? (
      <p className="rounded-2xl bg-amber-50 p-4 text-amber-900">Video calls aren’t set up yet. Ask the trip admin to open <b>Trip Settings → Video calls</b> and tap <b>Create call link</b>.</p>
    ) : null;
  }

  const tell = async () => {
    setAsking(false);
    const viaMeet = link.includes('meet');
    await notify({ type: 'video_call', title: `${me?.displayName ?? 'Someone'} started a ${viaMeet ? 'Google Meet' : 'video'} call`, body: `Tap to join the trip ${viaMeet ? 'Google Meet' : 'video'} call.`, link, target: 'all' });
    toast.success('Everyone has been notified');
  };

  return (
    <span className={`flex flex-wrap gap-2 ${className}`}>
      {room && (
        <a
          href={jitsiUrl(room, me?.displayName ?? '')}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            setLink('/call');
            if (askToNotify) setAsking(true);
          }}
          className={buttonClass('primary', size)}
        >
          <Video className={icon} /> Video call
        </a>
      )}
      {meet && (
        <a
          href={meet}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            setLink('/call?app=meet');
            if (askToNotify) setAsking(true);
          }}
          className={buttonClass('secondary', size, 'border-sky-200 text-sky-800 hover:border-sky-400 hover:bg-sky-50')}
        >
          <MeetIcon className={icon} /> Google Meet
        </a>
      )}
      {group && (
        <a href={group} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', size, 'border-emerald-200 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-50')}>
          <WhatsAppIcon className={icon} /> WhatsApp group
        </a>
      )}
      {asking && (
        <Modal
          open
          onClose={() => setAsking(false)}
          title="Let everyone know?"
          footer={<><Button variant="secondary" onClick={() => setAsking(false)}>No, just me</Button><Button icon={<BellRing className="size-5" />} onClick={tell}>Notify everyone</Button></>}
        >
          <p className="text-slate-700">Send a notification so the others can tap and join your call.</p>
        </Modal>
      )}
    </span>
  );
}
