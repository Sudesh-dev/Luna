import { searchAudiusTracks, audiusStreamUrl } from './audius';
import { matchTracks, MATCH } from '../utils/matchTracks';

export function throwIfCancelled(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Import cancelled');
  error.name = 'AbortError';
  throw error;
}

export async function matchPlaylist(metadata, { signal, onProgress = () => {}, knownTracks = [] } = {}) {
  const results = new Array(metadata.tracks.length);
  let completed = 0;
  for (let start = 0; start < metadata.tracks.length; start += 3) {
    throwIfCancelled(signal);
    await Promise.all(metadata.tracks.slice(start, start + 3).map(async (original, offset) => {
      let result;
      const known = knownTracks.find(track => track.source === original.source && track.source_id === original.source_id);
      if (original.source === 'local' && known?.uri && known.playable !== 0) {
        result = { status: MATCH.EXACT, candidates: [known], selected: known };
      } else if (original.source === 'audius' && original.source_id && original.playable !== 0 && /^[a-zA-Z0-9_-]+$/.test(original.source_id)) {
        const track = { ...original, id: `audius:${original.source_id}`, uri: audiusStreamUrl(original.source_id), playable: 1 };
        result = { status: MATCH.EXACT, candidates: [track], selected: track };
      } else {
        try {
          const candidates = await searchAudiusTracks(`${original.title} ${original.artist}`, { limit: 12, signal });
          result = matchTracks(original, candidates);
        } catch (cause) {
          if (signal?.aborted || cause.name === 'AbortError') throw cause;
          result = { status: MATCH.NOT_FOUND, candidates: [], selected: null, error: cause.message || 'Audius could not be reached. Retry this song later.' };
        }
      }
      throwIfCancelled(signal);
      results[start + offset] = { original, ...result, accepted: !!result.selected };
      onProgress(++completed, metadata.tracks.length);
    }));
    if (start + 3 < metadata.tracks.length) await new Promise(resolve => setTimeout(resolve, 350));
  }
  return results;
}
