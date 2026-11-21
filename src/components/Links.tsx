import { MapPin, Phone, Navigation } from 'lucide-react';
import { isMapsUrl } from '../domain/validation';
import { mapsSearchUrl, telHref } from '../lib/format';
import { buttonClass } from './ui/Button';

/** Opens Google Maps (free URL scheme, no API key). Falls back to an address search. */
export function MapButton({ url, address, label = 'Open in Maps' }: { url?: string; address?: string; label?: string }) {
  const href = url && isMapsUrl(url) ? url : address ? mapsSearchUrl(address) : '';
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
      <Navigation className="size-4" /> {label}
    </a>
  );
}

export function CallButton({ phone, label }: { phone?: string; label?: string }) {
  if (!phone) return null;
  return (
    <a href={telHref(phone)} className={buttonClass('success', 'sm')}>
      <Phone className="size-4" /> {label ?? `Call ${phone}`}
    </a>
  );
}

export function AddressLine({ address }: { address: string }) {
  if (!address) return null;
  return (
    <p className="flex items-start gap-2 text-slate-700">
      <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
      <span>{address}</span>
    </p>
  );
}
