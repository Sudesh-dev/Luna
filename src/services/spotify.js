export function spotifyPlaylistUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('Paste a full Spotify playlist link.'); }
  const match = url.pathname.match(/^\/(?:intl-[a-z]+\/)?playlist\/([a-zA-Z0-9]{22})\/?$/);
  if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || url.username || url.password || !match) {
    throw new Error('Use an https://open.spotify.com/playlist/… link.');
  }
  return `https://open.spotify.com/playlist/${match[1]}`;
}

export const SPOTIFY_IMPORT_LIMITATION = 'Spotify does not provide a playlist track list through its public embed. LUNA stays login-free: paste titles and artists below, or choose a metadata JSON file you already have.';
