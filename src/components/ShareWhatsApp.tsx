/** "Share on WhatsApp" – opens WhatsApp with the text ready; the user picks the group. */
import { whatsappShareUrl } from '../domain/share';
import { buttonClass } from './ui/Button';

export function WhatsAppIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.5 5 5.2-1.4A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3a8.2 8.2 0 1 1 7 3.9Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.7-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

export function ShareWhatsApp({ text, label = 'Share on WhatsApp', size = 'md', className = '' }: { text: string | (() => string); label?: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <a
      href="https://wa.me/"
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        // Build the text on tap so it always has the latest details.
        e.currentTarget.href = whatsappShareUrl(typeof text === 'function' ? text() : text);
      }}
      className={buttonClass('secondary', size, `border-emerald-200 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-50 ${className}`)}
    >
      <WhatsAppIcon className={size === 'sm' ? 'size-4' : 'size-5'} />
      {label}
    </a>
  );
}
