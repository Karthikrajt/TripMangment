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

export function CallButtons({ size = 'md', className = '', askToNotify = true }: { size?: 'sm' | 'md' | 'lg'; className?: string; askToNotify?: boolean }) {
  const trip = useSession((s) => s.trip);
  const me = useSession((s) => s.member);
  const admin = useIsAdmin();
  const [asking, setAsking] = useState(false);
  const room = trip?.callRoom;
  const group = trip?.whatsappGroupUrl;
  const icon = size === 'sm' ? 'size-4' : 'size-5';

  if (!room && !group) {
    return admin ? (
      <Link to="/admin/settings" className={buttonClass('secondary', size, className)}><Video className={icon} /> Set up video calls</Link>
    ) : null;
  }

  const tell = async () => {
    setAsking(false);
    await notify({ type: 'video_call', title: `${me?.displayName ?? 'Someone'} started a video call`, body: 'Tap to join the trip video call.', link: '/call', target: 'all' });
    toast.success('Everyone has been notified');
  };

  return (
    <span className={`flex flex-wrap gap-2 ${className}`}>
      {room && (
        <a
          href={jitsiUrl(room, me?.displayName ?? '')}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => askToNotify && setAsking(true)}
          className={buttonClass('primary', size)}
        >
          <Video className={icon} /> Video call
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
