export const MAX_IMPORT_TRACKS = 500;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export function normalizeImportTrack(value, fallbackSource = 'metadata') {
  const track = value?.track || value?.item || value;
  if (!track || typeof track !== 'object') return null;
  const title = track.title || track.name;
  const artist = track.artist || track.metadata_artist || (Array.isArray(track.artists) ? track.artists.map(item => item?.name).filter(Boolean).join(', ') : null)
    || track.user?.username || track.user?.full_name;
  if (typeof title !== 'string' || !title.trim() || typeof artist !== 'string' || !artist.trim()) return null;
  const source = String(track.source || track.provider || fallbackSource).toLowerCase();
  const sourceId = track.sourceId ?? track.source_id ?? track.providerId ?? track.urn ?? track.id;
  const milliseconds = track.duration_ms ?? (source === 'soundcloud' && track.sourceId === undefined && track.source_id === undefined ? track.duration : undefined);
  const duration = Number(milliseconds !== undefined ? Number(milliseconds) / 1000 : track.duration);
  return {
    title: title.trim().slice(0, 200), artist: artist.trim().slice(0, 200), source,
    source_id: sourceId == null ? null : String(sourceId).slice(0, 300),
    duration: Number.isFinite(duration) ? Math.max(duration, 0) : 0,
    playable: track.playable === 0 || track.playable === false ? 0 : 1,
    unavailable_reason: track.unavailableReason || track.unavailable_reason || null,
    artwork_url: track.artworkUrl || track.artwork_url || track.album?.images?.[0]?.url || null,
    album_title: track.albumTitle || track.album_title || track.album?.name || null,
    source_url: track.sourceUrl || track.source_url || track.permalink_url || track.external_urls?.spotify || null,
  };
}

export function parsePlaylistMetadata(raw, { source = 'metadata', name = 'Imported playlist' } = {}) {
  if (typeof raw !== 'string' || raw.length > MAX_IMPORT_BYTES) throw new Error('Choose metadata smaller than 5 MB.');
  const input = raw.trim();
  if (!input) throw new Error('Paste a track list or choose a JSON file.');
  let entries;
  if (input.startsWith('{') || input.startsWith('[')) {
    let payload;
    try { payload = JSON.parse(input); } catch { throw new Error('This is not valid JSON.'); }
    if (payload?.format === 'luna-playlist' && payload.version !== 1) throw new Error('This LUNA playlist version is not supported.');
    name = typeof payload?.name === 'string' && payload.name.trim() ? payload.name : name;
    entries = Array.isArray(payload) ? payload : payload?.songs || payload?.tracks?.items || payload?.tracks || payload?.items;
    if (!Array.isArray(entries)) throw new Error('The JSON needs a songs, tracks, or items array with titles and artists.');
  } else {
    entries = input.split(/\r?\n/).filter(line => line.trim()).map(line => {
      const parts = line.split(/\s+[—–]\s+|\t|\s+-\s+/);
      return parts.length === 2 ? { title: parts[0], artist: parts[1] } : null;
    });
  }
  if (entries.length > MAX_IMPORT_TRACKS) throw new Error(`Import up to ${MAX_IMPORT_TRACKS} songs at a time. Split this list into smaller playlists.`);
  const tracks = entries.map(item => normalizeImportTrack(item, source)).filter(Boolean);
  if (!tracks.length) throw new Error('No song titles and artists found. Use one “Title — Artist” per line, or JSON metadata.');
  return { name: name.trim().slice(0, 80) || 'Imported playlist', tracks, skipped: entries.length - tracks.length };
}
