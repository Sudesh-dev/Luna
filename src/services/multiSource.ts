import type { Track, TrackSource } from '../types/music';

const JAMENDO_CLIENT_ID = process.env.EXPO_PUBLIC_JAMENDO_CLIENT_ID || '';
const PIPED_API_BASES = (process.env.EXPO_PUBLIC_PIPED_API_BASE_URL
  ? [process.env.EXPO_PUBLIC_PIPED_API_BASE_URL]
  : ['https://pipedapi.kavin.rocks', 'https://pipedapi.leptons.xyz', 'https://pipedapi.adminforge.de'])
  .map(url => url.replace(/\/$/, ''));
const REQUEST_TIMEOUT_MS = 6500;
const CACHE_MS = 3 * 60 * 1000;
const cache = new Map<string, { expires: number; result: SearchResult }>();

export interface SearchResult {
  tracks: Track[];
  warnings: string[];
}

async function jsonRequest(url: string, signal?: AbortSignal): Promise<any> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

const isHttps = (url: unknown): url is string => typeof url === 'string' && /^https:\/\//i.test(url);

export async function searchJamendo(query: string, signal?: AbortSignal): Promise<Track[]> {
  if (!JAMENDO_CLIENT_ID) throw new Error('Jamendo needs a free developer client ID in EXPO_PUBLIC_JAMENDO_CLIENT_ID.');
  const params = new URLSearchParams({ client_id: JAMENDO_CLIENT_ID, format: 'json', search: query, limit: '18', audioformat: 'mp32', imagesize: '300', type: 'single albumtrack' });
  const response = await jsonRequest(`https://api.jamendo.com/v3.0/tracks/?${params}`, signal);
  if (response?.headers?.status !== 'success' || !Array.isArray(response.results)) throw new Error(response?.headers?.error_message || 'Jamendo returned an invalid response');
  return response.results.flatMap((item: any) => {
    if (!item.id || !item.name || !isHttps(item.audio)) return [];
    return [{ id: String(item.id), title: String(item.name), artist: String(item.artist_name || 'Jamendo artist'), url: item.audio, artwork: isHttps(item.image) ? item.image : '', source: 'jamendo' as const }];
  });
}

export async function resolvePipedStream(videoId: string, signal?: AbortSignal, preferredBase?: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid Piped video ID');
  const fromBase = async (base: string) => {
    const details = await jsonRequest(`${base}/streams/${videoId}`, signal);
    const audio = (Array.isArray(details.audioStreams) ? details.audioStreams : [])
      .filter((stream: any) => !stream.videoOnly && isHttps(stream.url) && /audio\/(mp4|mpeg|webm|ogg)/i.test(stream.mimeType || ''))
      .sort((a: any, b: any) => Number(b.bitrate || 0) - Number(a.bitrate || 0));
    if (!audio.length) throw new Error('No playable audio stream is available');
    return audio[0].url as string;
  };
  if (preferredBase) {
    try { return await fromBase(preferredBase); } catch { /* Try other public instances. */ }
  }
  try { return await Promise.any(PIPED_API_BASES.filter(base => base !== preferredBase).map(fromBase)); }
  catch { throw new Error('No public Piped instance has a playable audio stream for this song.'); }
}

export async function resolveProviderStream(source: TrackSource, sourceId: string, currentUrl = ''): Promise<string> {
  if (source === 'piped') return resolvePipedStream(sourceId);
  if (source === 'jamendo') {
    if (isHttps(currentUrl)) return currentUrl;
    if (!JAMENDO_CLIENT_ID) throw new Error('Jamendo needs a free developer client ID.');
    const params = new URLSearchParams({ client_id: JAMENDO_CLIENT_ID, format: 'json', id: sourceId, limit: '1' });
    const response = await jsonRequest(`https://api.jamendo.com/v3.0/tracks/?${params}`);
    const url = response?.results?.[0]?.audio;
    if (isHttps(url)) return url;
    throw new Error('Jamendo audio is unavailable for this track.');
  }
  if (isHttps(currentUrl)) return currentUrl;
  const slash = sourceId.indexOf('/');
  if (slash < 1 || slash === sourceId.length - 1) throw new Error('Internet Archive file is unavailable.');
  const identifier = sourceId.slice(0, slash);
  const name = sourceId.slice(slash + 1);
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${name.split('/').map(encodeURIComponent).join('/')}`;
}

export async function searchPiped(query: string, signal?: AbortSignal): Promise<Track[]> {
  const params = new URLSearchParams({ q: query, filter: 'music_songs' });
  let response: any;
  let base: string;
  try {
    ({ response, base } = await Promise.any(PIPED_API_BASES.map(base => jsonRequest(`${base}/search?${params}`, signal).then(payload => {
      if (!Array.isArray(payload?.items)) throw new Error('Piped returned an invalid response');
      return { response: payload, base };
    }))));
  } catch { throw new Error('Public Piped instances are currently unavailable.'); }
  if (!Array.isArray(response?.items)) throw new Error('Piped returned an invalid response');
  const items = response.items.filter((item: any) => item.type === 'stream' && item.title && /[?&]v=([A-Za-z0-9_-]{11})/.test(item.url || '')).slice(0, 6);
  const settled = await Promise.allSettled(items.map(async (item: any) => {
    const id = String(item.url).match(/[?&]v=([A-Za-z0-9_-]{11})/)![1];
    const url = await resolvePipedStream(id, signal, base);
    return { id, title: String(item.title), artist: String(item.uploaderName || 'Video artist'), url, artwork: isHttps(item.thumbnail) ? item.thumbnail : '', source: 'piped' as const };
  }));
  return settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
}

export async function searchArchive(query: string, signal?: AbortSignal): Promise<Track[]> {
  const escaped = query.replace(/["\\]/g, ' ').trim().slice(0, 80);
  const params = new URLSearchParams({ q: `mediatype:audio AND (title:("${escaped}") OR creator:("${escaped}"))`, output: 'json', rows: '6', page: '1' });
  params.append('fl[]', 'identifier');
  params.append('fl[]', 'title');
  params.append('fl[]', 'creator');
  const response = await jsonRequest(`https://archive.org/advancedsearch.php?${params}`, signal);
  const docs = response?.response?.docs;
  if (!Array.isArray(docs)) throw new Error('Internet Archive returned an invalid response');
  const settled = await Promise.allSettled(docs.map(async (item: any) => {
    if (!item.identifier) return [];
    const identifier = String(item.identifier);
    const metadata = await jsonRequest(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, signal);
    const files = (Array.isArray(metadata.files) ? metadata.files : [])
      .filter((file: any) => /\.(mp3|m4a|ogg)$/i.test(file.name || '') &&
        (file.source !== 'derivative' || /VBR MP3|64Kbps MP3|Ogg Vorbis|MPEG4 Audio/i.test(file.format || '')))
      .slice(0, 3);
    return files.map((file: any): Track => ({
      id: `${identifier}/${file.name}`,
      title: String(file.title || file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ')),
      artist: String(file.artist || (Array.isArray(item.creator) ? item.creator[0] : item.creator) || 'Internet Archive'),
      url: `https://archive.org/download/${encodeURIComponent(identifier)}/${file.name.split('/').map(encodeURIComponent).join('/')}`,
      artwork: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
      source: 'archive',
    }));
  }));
  return settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}

const searches: Record<TrackSource, (query: string, signal?: AbortSignal) => Promise<Track[]>> = {
  piped: searchPiped,
  jamendo: searchJamendo,
  archive: searchArchive,
};

export async function aggregateMusicSearch(query: string, sources: TrackSource[] = ['piped', 'jamendo', 'archive'], signal?: AbortSignal): Promise<SearchResult> {
  const term = query.trim();
  if (term.length < 2) return { tracks: [], warnings: [] };
  const uniqueSources = [...new Set(sources)];
  const key = `${term.toLocaleLowerCase()}:${uniqueSources.join(',')}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;
  const settled = await Promise.allSettled(uniqueSources.map(source => searches[source](term, signal)));
  if (signal?.aborted) throw Object.assign(new Error('Search cancelled'), { name: 'AbortError' });
  const tracks = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const warnings = settled.flatMap((result, index) => result.status === 'rejected'
    ? [`${uniqueSources[index]}: ${result.reason instanceof Error ? result.reason.message : 'search is unavailable'}`] : []);
  const result = { tracks: [...new Map(tracks.map(track => [`${track.source}:${track.id}`, track])).values()], warnings };
  if (warnings.length < uniqueSources.length) {
    cache.set(key, { expires: Date.now() + CACHE_MS, result });
    if (cache.size > 40) cache.delete(cache.keys().next().value!);
  }
  return result;
}
