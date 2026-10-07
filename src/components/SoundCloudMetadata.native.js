import React, { useMemo } from 'react';
import { WebView } from 'react-native-webview';
import { soundCloudWidgetHtml } from './soundCloudWidgetHtml';

export default function SoundCloudMetadata({ url, onData, onError }) {
  const channel = useMemo(() => `luna-sc-${Math.random().toString(36).slice(2)}`, [url]);
  const html = useMemo(() => soundCloudWidgetHtml(url, channel), [url, channel]);
  return <WebView style={{ height: 166, backgroundColor: '#15111E' }} scrollEnabled={false}
    source={{ html, baseUrl: 'https://w.soundcloud.com' }} originWhitelist={['https://*']}
    javaScriptEnabled allowsInlineMediaPlayback mediaPlaybackRequiresUserAction
    onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url === 'https://w.soundcloud.com' || request.url.startsWith('https://w.soundcloud.com/')}
    onMessage={event => {
      try {
        const message = JSON.parse(event.nativeEvent.data);
        if (message.channel !== channel) return;
        if (message.error) onError(message.error); else onData(message.sounds);
      } catch { onError('SoundCloud returned invalid metadata.'); }
    }} onError={() => onError('SoundCloud could not be reached. Use pasted metadata instead.')} />;
}
