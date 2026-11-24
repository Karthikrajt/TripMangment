/** Start a "Who's on board?" head count for a train or vehicle, then open it. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck } from 'lucide-react';
import { useRollCalls } from '../hooks/data';
import { useSession } from '../store/session';
import { startRollCall } from '../services/checklist';
import { Button } from './ui/Button';
import { toast } from './ui/Toast';
import { errorMessage } from '../lib/retry';

export function RollCallButton({ title, personIds, size = 'md' }: { title: string; personIds: string[]; size?: 'sm' | 'md' }) {
  const me = useSession((s) => s.member);
  const rolls = useRollCalls();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const key = [...personIds].sort().join(',');
  const running = rolls.data.find((r) => r.open && [...r.personIds].sort().join(',') === key);

  const go = async () => {
    if (running) return navigate(`/checklist?roll=${running.id}`);
    if (!me) return;
    setBusy(true);
    try {
      const id = await startRollCall(title, personIds, me);
      toast.success('Roll call started – everyone has been notified');
      navigate(`/checklist?roll=${id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="secondary" size={size} loading={busy} icon={<UserCheck className="size-5" />} onClick={go}>
      {running ? 'Open roll call' : 'Who’s on board?'}
    </Button>
  );
}
