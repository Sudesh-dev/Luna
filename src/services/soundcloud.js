import { normalizeImportTrack, MAX_IMPORT_TRACKS } from '../utils/playlistMetadata';

export function soundCloudPlaylistUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('Paste a full SoundCloud playlist link.'); }
  if (url.protocol !== 'https:' || !['soundcloud.com', 'www.soundcloud.com'].includes(url.hostname)
    || url.username || url.password || !/^\/[^/]+\/sets\/[^/]+\/?$/.test(url.pathname)) {
    throw new Error('Use an https://soundcloud.com/artist/sets/playlist link. Open shortened links in SoundCloud first.');
  }
  return `https://soundcloud.com${url.pathname.replace(/\/$/, '')}`;
}

export function soundCloudWidgetTracks(sounds) {
  if (!Array.isArray(sounds) || !sounds.length) throw new Error('SoundCloud did not expose this playlist’s track metadata. Use a pasted track list or metadata JSON instead.');
  if (sounds.length > MAX_IMPORT_TRACKS) throw new Error(`Import up to ${MAX_IMPORT_TRACKS} tracks at a time.`);
  const tracks = sounds.map(sound => normalizeImportTrack(sound, 'soundcloud')).filter(Boolean);
  if (!tracks.length) throw new Error('No titles and artists were available from this SoundCloud playlist.');
  return { tracks, skipped: sounds.length - tracks.length };
}
