import { useRef, useState } from 'react';
import { Download, Eye, FileText, Paperclip, X, CloudOff, CloudDownload } from 'lucide-react';
import { Button } from './ui/Button';
import { getDownloadUrl, type FileKind } from '../lib/files';
import { validateFileMeta, FILE_RULES } from '../../supabase/functions/_shared/fileRules';
import { errorMessage } from '../lib/retry';
import { toast } from './ui/Toast';
import { formatBytes } from '../lib/format';

/** File chooser with immediate client-side validation (server re-validates). */
export function FileInput({
  kind,
  file,
  onChange,
  label = 'Attach file',
  existingName,
  required,
  error,
}: {
  kind: FileKind;
  file: File | null;
  onChange: (f: File | null) => void;
  label?: string;
  existingName?: string;
  required?: boolean;
  error?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const accept = [...new Set(Object.keys(FILE_RULES[kind].types).map((e) => '.' + e))].join(',');
  const pick = (f: File | undefined) => {
    if (!f) return;
    const check = validateFileMeta(kind, f.name, f.type, f.size);
    // big photos are compressed before upload, so only hard-fail on type errors
    if (!check.ok && !(f.type.startsWith('image/') && /too large/.test(check.error))) {
      setLocalError(check.error);
      onChange(null);
      return;
    }
    setLocalError(null);
    onChange(f);
  };
  const shownError = localError ?? error;
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <input ref={ref} type="file" accept={accept} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-label={label} />
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5">
          <FileText className="size-5 text-brand-700" />
          <span className="flex-1 truncate">{file.name}</span>
          <span className="text-xs text-slate-500">{formatBytes(file.size)}</span>
          <button type="button" aria-label="Remove file" onClick={() => onChange(null)} className="rounded-full p-1 hover:bg-white">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-5 text-slate-600 hover:border-brand-500 hover:text-brand-700"
        >
          <Paperclip className="size-5" />
          {existingName ? `Replace “${existingName}”` : 'Choose PDF or photo'}
        </button>
      )}
      <p className="mt-1 text-xs text-slate-500">
        {Object.keys(FILE_RULES[kind].types).map((e) => e.toUpperCase()).join(', ')} · max {Math.round(FILE_RULES[kind].maxBytes / 1024 / 1024)} MB
      </p>
      {shownError && <p className="mt-1 text-sm text-red-600" role="alert">{shownError}</p>}
    </div>
  );
}

/** Preview / download buttons backed by short-lived signed URLs. */
export function FileActions({ path, fileName, compact, offline }: { path: string; fileName: string; compact?: boolean; offline?: { saved: boolean; onSave: () => void; onRemove: () => void; busy?: boolean } }) {
  const [busy, setBusy] = useState<'view' | 'dl' | null>(null);
  if (!path) return null;
  const go = async (inline: boolean) => {
    setBusy(inline ? 'view' : 'dl');
    // Open the window synchronously (popup blockers), then point it at the signed URL.
    const w = inline ? window.open('', '_blank') : null;
    try {
      const url = await getDownloadUrl(path, { fileName, inline });
      if (w) {
        w.opener = null;
        w.location.href = url;
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.rel = 'noopener';
        a.click();
      }
    } catch (e) {
      w?.close();
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" icon={<Eye className="size-4" />} loading={busy === 'view'} onClick={() => go(true)}>
        {compact ? 'View' : 'Preview'}
      </Button>
      <Button size="sm" variant="secondary" icon={<Download className="size-4" />} loading={busy === 'dl'} onClick={() => go(false)}>
        Download
      </Button>
      {offline &&
        (offline.saved ? (
          <Button size="sm" variant="ghost" icon={<CloudOff className="size-4" />} onClick={offline.onRemove}>
            Remove offline copy
          </Button>
        ) : (
          <Button size="sm" variant="ghost" icon={<CloudDownload className="size-4" />} loading={offline.busy} onClick={offline.onSave}>
            Save for offline
          </Button>
        ))}
    </div>
  );
}
