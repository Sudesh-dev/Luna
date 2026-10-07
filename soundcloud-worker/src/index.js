const SOUNDCLOUD_API_URL = 'https://api.soundcloud.com';
const SOUNDCLOUD_TOKEN_URL = 'https://secure.soundcloud.com/oauth/token';
const TOKEN_CACHE_URL = 'https://luna.internal/soundcloud-token';
const TOKEN_SAFETY_SECONDS = 60;

let memoryToken = null;
let tokenRequest = null;

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
});

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (allowed.includes('*') || allowed.includes(origin)) return origin;
  return false;
}

function corsHeaders(request, env) {
  const origin = allowedOrigin(request, env);
  return origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, X-Luna-Key',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  } : {};
}

function authorized(request, env, url) {
  if (!env.LUNA_CLIENT_KEY) return false;
  const supplied = request.headers.get('X-Luna-Key') || url.searchParams.get('key');
  return supplied === env.LUNA_CLIENT_KEY;
}

function tokenCacheKey(env) {
  return new Request(`${TOKEN_CACHE_URL}/${encodeURIComponent(env.SOUNDCLOUD_CLIENT_ID)}`);
}

async function readCachedToken(env) {
  if (memoryToken?.expiresAt > Date.now()) return memoryToken.accessToken;
  const cache = globalThis.caches?.default;
  if (!cache) return null;
  const response = await cache.match(tokenCacheKey(env));
  if (!response) return null;
  const payload = await response.json().catch(() => null);
  if (!payload?.accessToken || payload.expiresAt <= Date.now()) return null;
  memoryToken = payload;
  return payload.accessToken;
}

async function requestAccessToken(env, context) {
  if (!env.SOUNDCLOUD_CLIENT_ID || !env.SOUNDCLOUD_CLIENT_SECRET) {
    throw new Error('SoundCloud credentials are not configured.');
  }

  const basicCredentials = btoa(`${env.SOUNDCLOUD_CLIENT_ID}:${env.SOUNDCLOUD_CLIENT_SECRET}`);
  const response = await fetch(SOUNDCLOUD_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${basicCredentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new Error(`SoundCloud authentication failed with status ${response.status}.`);

  const payload = await response.json();
  if (!payload?.access_token) throw new Error('SoundCloud returned an invalid token response.');
  const lifetimeSeconds = Math.max(Number(payload.expires_in) || 3600, 120);
  const cacheSeconds = Math.max(lifetimeSeconds - TOKEN_SAFETY_SECONDS, 60);
  memoryToken = { accessToken: payload.access_token, expiresAt: Date.now() + cacheSeconds * 1000 };

  const cache = globalThis.caches?.default;
  if (cache) {
    const responseToCache = json(memoryToken, 200, { 'Cache-Control': `public, max-age=${cacheSeconds}` });
    context.waitUntil(cache.put(tokenCacheKey(env), responseToCache));
  }
  return memoryToken.accessToken;
}

async function getAccessToken(env, context, refresh = false) {
  if (refresh) {
    memoryToken = null;
    const cache = globalThis.caches?.default;
    if (cache) context.waitUntil(cache.delete(tokenCacheKey(env)));
  } else {
    const cached = await readCachedToken(env);
    if (cached) return cached;
  }

  if (!tokenRequest) tokenRequest = requestAccessToken(env, context).finally(() => { tokenRequest = null; });
  return tokenRequest;
}

async function soundCloudFetch(path, env, context) {
  let accessToken = await getAccessToken(env, context);
  let response = await fetch(`${SOUNDCLOUD_API_URL}${path}`, {
    headers: { Accept: 'application/json', Authorization: `OAuth ${accessToken}` },
  });
  if (response.status === 401) {
    accessToken = await getAccessToken(env, context, true);
    response = await fetch(`${SOUNDCLOUD_API_URL}${path}`, {
      headers: { Accept: 'application/json', Authorization: `OAuth ${accessToken}` },
    });
  }
  return response;
}

function publicTrack(track) {
  const urn = String(track?.urn || '').trim();
  if (!urn || !track?.title) return null;
  return {
    urn,
    title: track.title,
    duration: Number(track.duration) || 0,
    artwork_url: track.artwork_url || null,
    permalink_url: track.permalink_url || null,
    access: track.access || null,
    streamable: track.streamable !== false,
    genre: track.genre || null,
    album_title: track.publisher_metadata?.album_title || null,
    user: {
      username: track.user?.username || track.user?.full_name || 'SoundCloud artist',
      permalink_url: track.user?.permalink_url || null,
    },
  };
}

async function searchTracks(url, env, context, headers) {
  const query = String(url.searchParams.get('q') || '').trim();
  if (query.length < 2) return json({ tracks: [] }, 200, headers);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);
  const params = new URLSearchParams({
    q: query.slice(0, 200),
    access: 'playable,preview',
    limit: String(limit),
    linked_partitioning: 'true',
  });
  const response = await soundCloudFetch(`/tracks?${params}`, env, context);
  if (!response.ok) return json({ error: 'SoundCloud search is temporarily unavailable.' }, response.status, headers);
  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload?.collection)) return json({ error: 'SoundCloud returned an invalid response.' }, 502, headers);
  return json({ tracks: payload.collection.map(publicTrack).filter(Boolean) }, 200, headers);
}

async function redirectToPlayback(trackUrn, env, context) {
  if (!trackUrn.startsWith('soundcloud:tracks:')) return json({ error: 'Invalid SoundCloud track identifier.' }, 400);
  const response = await soundCloudFetch(`/tracks/${encodeURIComponent(trackUrn)}/streams`, env, context);
  if (!response.ok) return json({ error: 'This SoundCloud track is not available for playback.' }, response.status);
  const streams = await response.json().catch(() => null);
  const candidates = [
    streams?.hls_aac_160_url,
    streams?.hls_mp3_128_url,
    streams?.preview_mp3_128_url,
  ];
  const streamUrl = candidates.find(value => typeof value === 'string' && value.startsWith('https://'));
  if (!streamUrl) return json({ error: 'No supported stream is available for this track.' }, 404);
  return Response.redirect(streamUrl, 302);
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);
    if (origin === false) return json({ error: 'Origin not allowed.' }, 403);
    const headers = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, headers);
    if (url.pathname === '/health') return json({ ok: true, service: 'luna-soundcloud-broker' }, 200, headers);
    if (!authorized(request, env, url)) return json({ error: 'Unauthorized.' }, 401, headers);

    try {
      if (url.pathname === '/v1/search/tracks') return await searchTracks(url, env, context, headers);
      const playbackMatch = url.pathname.match(/^\/v1\/tracks\/(.+)\/play$/);
      if (playbackMatch) return await redirectToPlayback(decodeURIComponent(playbackMatch[1]), env, context);
      return json({ error: 'Not found.' }, 404, headers);
    } catch (cause) {
      console.error('SoundCloud broker request failed', cause?.message || cause);
      return json({ error: 'The SoundCloud service is temporarily unavailable.' }, 502, headers);
    }
  },
};
