// Optional live check. Reads public metadata and stream headers, without saving audio.
(async () => {
  const url = 'https://api.audius.co/v1/tracks/search?query=lofi&limit=3';
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Audius search returned HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.data) || !payload.data.length) throw new Error('Audius returned no tracks for the live check.');
  console.log(JSON.stringify(payload.data.map(track => ({ id: track.id, title: track.title, artist: track.user?.name, duration: track.duration, streamable: track.is_streamable !== false && !track.is_stream_gated })), null, 2));
  const track = payload.data.find(track => track.is_streamable !== false && !track.is_stream_gated);
  if (!track) throw new Error('No playable track available for the live stream check.');
  const stream = await fetch(`https://api.audius.co/v1/tracks/${encodeURIComponent(track.id)}/stream`, { signal: AbortSignal.timeout(15000) });
  await stream.body?.cancel();
  console.log(`Stream headers: HTTP ${stream.status}; ${stream.headers.get('content-type') || 'unknown content type'}`);
  if (!stream.ok) throw new Error('Audius stream could not be reached.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
