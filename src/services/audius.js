const API_BASE_URL = 'https://api.audius.co/v1';
const AUDIUS_WEB_URL = 'https://audius.co';
const REQUEST_TIMEOUT_MS = 12000;
const SEARCH_CACHE_MS = 5 * 60 * 1000;
const searchCache = new Map();

export function cachedAudiusSearch(query, limit = 24) {
  const key = `${String(query || '').trim().toLocaleLowerCase()}:${limit}`;
  const cached = searchCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return cached.tracks.map(track => ({ ...track }));
}

export class MusicServiceError extends Error {
  constructor(message, code = 'unknown') {
    super(message);
    this.name = 'MusicServiceError';
    this.code = code;
  }
}

const artworkUrl = artwork => artwork?.['480x480'] || artwork?.['1000x1000'] || artwork?.['150x150'] || null;

export function audiusStreamUrl(sourceId) {
  const id = String(sourceId || '').trim();
  return id ? `${API_BASE_URL}/tracks/${encodeURIComponent(id)}/stream` : '';
}

export function normalizeAudiusTrack(track) {
  const sourceId = String(track?.id || '').trim();
  if (!sourceId || !track?.title) return null;

  const streamable = track.is_streamable !== false && track.is_streamable !== 'false' && !track.is_stream_gated;
  const permalink = typeof track.permalink === 'string' ? track.permalink : '';

  return {
    id: `audius:${sourceId}`,
    source: 'audius',
    source_id: sourceId,
    title: String(track.title).trim(),
    artist: String(track.user?.name || track.user?.handle || 'Audius artist').trim(),
    album_title: track.album?.name || track.album_name || null,
    artwork_url: artworkUrl(track.artwork),
    duration: Number(track.duration) || 0,
    source_url: permalink ? (permalink.startsWith('http') ? permalink : `${AUDIUS_WEB_URL}${permalink}`) : null,
    uri: streamable ? audiusStreamUrl(sourceId) : '',
    playable: streamable ? 1 : 0,
    playback_type: 'full',
    unavailable_reason: streamable ? null : 'This Audius track is not available for streaming.',
    provider_label: 'Audius',
    genre: track.genre || null,
  };
}

function errorForStatus(status) {
  if (status === 429) return new MusicServiceError('Music search is busy. Wait a moment and try again.', 'rate_limit');
  if (status === 401 || status === 403) return new MusicServiceError('The music service rejected this request.', 'authentication');
  if (status >= 500) return new MusicServiceError('The music service is temporarily unavailable.', 'service_unavailable');
  return new MusicServiceError('Music search failed. Please try again.', 'request_failed');
}

export async function searchAudiusTracks(query, { limit = 24, signal, fresh = false } = {}) {
  const term = String(query || '').trim();
  if (!term) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 50);
  if (signal?.aborted) { const error = new Error('Search cancelled'); error.name = 'AbortError'; throw error; }
  const cached = !fresh && cachedAudiusSearch(term, safeLimit);
  if (cached) return cached;
  const url = `${API_BASE_URL}/tracks/search?query=${encodeURIComponent(term)}&limit=${safeLimit}`;
  const requestController = new AbortController();
  const abortRequest = () => requestController.abort();
  let timedOut = false;
  signal?.addEventListener('abort', abortRequest, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: requestController.signal });
    if (!response.ok) throw errorForStatus(response.status);
    let payload;
    try { payload = await response.json(); }
    catch (cause) { if (cause?.name === 'AbortError') throw cause; payload = null; }
    if (!Array.isArray(payload?.data)) throw new MusicServiceError('The music service returned an invalid response.', 'invalid_response');
    const tracks = payload.data.map(normalizeAudiusTrack).filter(Boolean);
    const key = `${term.toLocaleLowerCase()}:${safeLimit}`;
    searchCache.delete(key);
    searchCache.set(key, { tracks, expiresAt: Date.now() + SEARCH_CACHE_MS });
    if (searchCache.size > 60) searchCache.delete(searchCache.keys().next().value);
    return tracks.map(track => ({ ...track }));
  } catch (cause) {
    if (cause instanceof MusicServiceError) throw cause;
    if (cause?.name === 'AbortError' && signal?.aborted) throw cause;
    if (cause?.name === 'AbortError' && timedOut) throw new MusicServiceError('Music search took too long. Please try again.', 'timeout');
    throw new MusicServiceError('Connect to the internet to search for music.', 'network');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortRequest);
  }

}
