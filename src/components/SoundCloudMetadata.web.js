import React, { useEffect, useMemo, useRef } from 'react';
import { soundCloudWidgetHtml } from './soundCloudWidgetHtml';

export default function SoundCloudMetadata({ url, onData, onError }) {
  const frame = useRef(null);
  const callbacks = useRef({ onData, onError });
  callbacks.current = { onData, onError };
  const channel = useMemo(() => `luna-sc-${Math.random().toString(36).slice(2)}`, [url]);
  const html = useMemo(() => soundCloudWidgetHtml(url, channel), [url, channel]);
  useEffect(() => {
    const listener = event => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== channel) return;
      if (event.data.error) callbacks.current.onError(event.data.error);
      else callbacks.current.onData(event.data.sounds);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [channel]);
  return <iframe ref={frame} title="SoundCloud playlist metadata" credentialless="" srcDoc={html} sandbox="allow-scripts allow-same-origin" style={{ height: 166, width: '100%', border: 0, borderRadius: 12 }} />;
}
