export type TrackSource = 'piped' | 'jamendo' | 'archive';

export interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  artwork: string;
  source: TrackSource;
}

export interface LunaStreamTrack {
  id: string;
  source: TrackSource;
  source_id: string;
  title: string;
  artist: string;
  artwork_url: string;
  source_url: string;
  uri: string;
  duration: number;
  playable: number;
  provider_label: string;
}

export function toLunaTrack(track: Track, duration = 0): LunaStreamTrack {
  return {
    id: `${track.source}:${track.id}`,
    source: track.source,
    source_id: track.id,
    title: track.title,
    artist: track.artist,
    artwork_url: track.artwork,
    source_url: track.source === 'piped' ? `https://www.youtube.com/watch?v=${track.id}`
      : track.source === 'jamendo' ? `https://www.jamendo.com/track/${track.id}`
        : `https://archive.org/details/${track.id.split('/')[0]}`,
    uri: track.url,
    duration,
    playable: track.url ? 1 : 0,
    provider_label: track.source === 'piped' ? 'Piped' : track.source === 'jamendo' ? 'Jamendo' : 'Internet Archive',
  };
}

export function toCloudTrack(track: { source?: string; source_id?: string; id?: string; title?: string; artist?: string; uri?: string; artwork_url?: string } | null): Track | null {
  if (!track) return null;
  if (!['piped', 'jamendo', 'archive'].includes(track.source || '') || !track.source_id || !track.title || !track.artist || !/^https:\/\//i.test(track.uri || '')) return null;
  return {
    id: track.source_id,
    title: track.title,
    artist: track.artist,
    url: track.uri || '',
    artwork: track.artwork_url || '',
    source: track.source as TrackSource,
  };
}
