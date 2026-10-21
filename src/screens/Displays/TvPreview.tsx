import React, { useEffect, useRef, useState } from 'react';
import type { DisplayFeed } from '../../display/types';

export interface TvPreviewProps {
  /** The feed to show (GET /displays/:id/preview, or the editor's draft). null = Connecting. */
  feed: DisplayFeed | null;
  /** Accessible name of the frame, e.g. "Live preview of Main entrance". */
  label: string;
  /** Shown on top of the preview, top-left (the "Override active" badge, AC-29). */
  badge?: React.ReactNode;
  className?: string;
}

/**
 * The real TV page in a 16:9 frame (03 "the console's live preview is the real TV page"): the
 * TV sizes everything from its viewport width, so the frame shows the exact TV layout at any
 * width, with no second copy of the TV styles. The page runs in ?preview=1 mode: no credential,
 * no polling, no storage; this component posts it the feed (same origin only). The text summary
 * next to it stays the accessible description (UX "Accessibility notes").
 */
export const TvPreview: React.FC<TvPreviewProps> = ({ feed, label, badge, className }) => {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string } | null;
      if (e.origin === window.location.origin && e.source === frame.current?.contentWindow && d && d.type === 'pf-tv-preview-ready') setReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    frame.current?.contentWindow?.postMessage({ type: 'pf-tv-preview', feed }, window.location.origin);
  }, [ready, feed]);

  return (
    <div className={['pf-tv-preview', className].filter(Boolean).join(' ')}>
      {badge && <div className="pf-tv-preview-badge">{badge}</div>}
      <iframe ref={frame} src="/tv?preview=1" title={label} tabIndex={-1} onLoad={() => setReady(true)} />
    </div>
  );
};
