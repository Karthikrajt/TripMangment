/** Opened from "… started a video call" notifications, and from the menu. */
import { Video } from 'lucide-react';
import { useSession } from '../store/session';
import { Card, CardBody } from '../components/ui/Card';
import { CallButtons } from '../components/CallButtons';

export default function Call() {
  const trip = useSession((s) => s.trip);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card>
        <CardBody className="space-y-5 py-8 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-brand-700 text-white"><Video className="size-8" /></span>
          <div>
            <h1 className="text-2xl font-extrabold text-ink">Trip video call</h1>
            <p className="mt-1 text-slate-600">Free group call for {trip?.name ?? 'the trip'}. Allow camera and microphone when asked.</p>
          </div>
          <CallButtons size="lg" className="justify-center" askToNotify={false} explainIfMissing />
          <ul className="space-y-1 text-left text-sm text-slate-500">
            <li>• <b>Video call</b> opens the trip’s private room (Jitsi Meet) – in the browser, or the Jitsi Meet app on phones if installed.</li>
            <li>• The first person to open the room signs in once with Google; everyone else just joins.</li>
            <li>• <b>WhatsApp group</b> opens your trip group – tap the video icon there for a WhatsApp group call (up to 32 people).</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
