/**
 * In-app document viewer (tickets, hotel confirmations, chat attachments,
 * offline copies). Opening a document no longer leaves the app:
 * - PDFs are drawn page by page with pdf.js (works on Android, where
 *   Chrome cannot show PDFs inline)
 * - images are shown directly
 * Zoom, Download and Close; the phone's Back button also closes it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Download, Loader2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { fetchFileBlob } from '../lib/files';
import { listOffline } from '../lib/offlineFiles';

/** Use the copy saved on the phone when there is one (fast, works offline). */
async function offlineBlobFor(path: string): Promise<Blob | null> {
  try {
    return (await listOffline()).find((f) => f.path === path)?.blob ?? null;
  } catch {
    return null;
  }
}
import { errorMessage } from '../lib/retry';

type Source = { kind: 'path'; path: string; fileName: string; fileType?: string } | { kind: 'blob'; blob: Blob; fileName: string };

interface ViewerState {
  source: Source | null;
  open: (s: Source) => void;
  close: () => void;
}

export const useViewer = create<ViewerState>((set) => ({
  source: null,
  open: (source) => set({ source }),
  close: () => set({ source: null }),
}));

/** Open a stored trip file (fetched through a short-lived signed URL). */
export const viewFile = (path: string, fileName: string, fileType?: string) => useViewer.getState().open({ kind: 'path', path, fileName, fileType });
/** Open a file already on the device (offline copies). */
export const viewBlob = (blob: Blob, fileName: string) => useViewer.getState().open({ kind: 'blob', blob, fileName });

const isPdf = (type: string, name: string) => type === 'application/pdf' || /\.pdf$/i.test(name);

async function renderPdf(blob: Blob, host: HTMLElement, zoom: number, signal: { cancelled: boolean }) {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  host.replaceChildren();
  const width = Math.max(280, host.clientWidth - 16) * zoom;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  for (let n = 1; n <= doc.numPages; n++) {
    if (signal.cancelled) break;
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width / base.width) * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(width)}px`;
    canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
    canvas.className = 'mx-auto block rounded-lg bg-white shadow-lg';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Page ${n} of ${doc.numPages}`);
    host.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
  }
  await doc.destroy();
}

export function DocViewerHost() {
  const { source, close } = useViewer();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const pdfHost = useRef<HTMLDivElement>(null);

  const name = source?.fileName ?? '';
  const pdf = blob ? isPdf(blob.type, name) : false;

  // Load the document.
  useEffect(() => {
    if (!source) return;
    let alive = true;
    setBlob(null);
    setError(null);
    setZoom(1);
    setBusy(true);
    (source.kind === 'blob' ? Promise.resolve(source.blob) : offlineBlobFor(source.path).then((b) => b ?? fetchFileBlob(source.path)))
      .then((b) => {
        if (!alive) return;
        // Some storage responses come back as octet-stream; trust the known type.
        const type = b.type && b.type !== 'application/octet-stream' ? b.type : source.kind === 'path' ? source.fileType ?? '' : '';
        setBlob(type && type !== b.type ? new Blob([b], { type }) : b);
      })
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [source]);

  // Object URL for images and Download.
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  // Draw PDF pages.
  useEffect(() => {
    if (!blob || !pdf || !pdfHost.current) return;
    const signal = { cancelled: false };
    setBusy(true);
    renderPdf(blob, pdfHost.current, zoom, signal)
      .catch((e) => !signal.cancelled && setError(`Could not open this PDF. ${errorMessage(e)}`))
      .finally(() => !signal.cancelled && setBusy(false));
    return () => {
      signal.cancelled = true;
    };
  }, [blob, pdf, zoom]);

  // Back button / Escape close the viewer.
  const closeViewer = useCallback(() => {
    if (history.state?.docViewer) history.back();
    else close();
  }, [close]);
  useEffect(() => {
    if (!source) return;
    history.pushState({ ...(history.state ?? {}), docViewer: true }, '');
    const onPop = () => close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeViewer();
    window.addEventListener('popstate', onPop);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [source, close, closeViewer]);

  if (!source) return null;

  const download = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'document';
    a.click();
  };
  const iconBtn = 'grid size-11 place-items-center rounded-full text-white hover:bg-white/15 disabled:opacity-40';

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-900" role="dialog" aria-modal="true" aria-label={`Viewing ${name}`}>
      <div className="flex items-center gap-1 px-2 py-2 text-white safe-top">
        <button type="button" onClick={closeViewer} className={iconBtn} aria-label="Close">
          <X className="size-6" />
        </button>
        <p className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{name}</p>
        <button type="button" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className={iconBtn} aria-label="Zoom out" disabled={!blob || zoom <= 0.5}>
          <ZoomOut className="size-5" />
        </button>
        <span className="w-11 text-center text-xs tabular-nums text-white/80" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} className={iconBtn} aria-label="Zoom in" disabled={!blob || zoom >= 3}>
          <ZoomIn className="size-5" />
        </button>
        <button type="button" onClick={download} className={iconBtn} aria-label="Download" disabled={!url}>
          <Download className="size-5" />
        </button>
      </div>
      <div className="relative flex-1 overflow-auto px-2 pb-6 safe-bottom">
        {error ? (
          <div className="mx-auto mt-16 max-w-sm rounded-2xl bg-white p-5 text-center text-slate-800">
            <p className="font-semibold">Couldn’t open this file</p>
            <p className="mt-1 text-sm text-slate-600">{error}</p>
            <button type="button" onClick={closeViewer} className="mt-4 rounded-2xl bg-brand-700 px-4 py-2 font-semibold text-white">Close</button>
          </div>
        ) : (
          <>
            {busy && (
              <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
                <span className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-800"><Loader2 className="size-4 animate-spin" /> Opening…</span>
              </div>
            )}
            {pdf ? (
              <div ref={pdfHost} className="mx-auto flex flex-col gap-3 py-2" style={{ width: zoom > 1 ? `${zoom * 100}%` : '100%' }} />
            ) : url ? (
              <img src={url} alt={name} className="mx-auto block rounded-lg bg-white shadow-lg" style={{ width: `${zoom * 100}%`, maxWidth: zoom > 1 ? 'none' : '100%' }} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
