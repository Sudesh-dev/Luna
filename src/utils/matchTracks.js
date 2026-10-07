export const MATCH = { EXACT: 'EXACT', PROBABLE: 'PROBABLE', NOT_FOUND: 'NOT_FOUND' };

export function normalizeMusicText(value) {
  return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/\b(featuring|ft)\.?\s/g, 'feat ')
    .replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function similarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const a = new Set(left.split(' '));
  const b = new Set(right.split(' '));
  return (2 * [...a].filter(word => b.has(word)).length) / (a.size + b.size);
}

export function matchTracks(original, candidates = []) {
  const title = normalizeMusicText(original.title);
  const artist = normalizeMusicText(original.artist);
  const ranked = candidates.filter(track => track.source === 'audius' && track.source_id && track.uri && track.playable !== 0)
    .map(track => {
      const titleScore = similarity(title, normalizeMusicText(track.title));
      const artistScore = similarity(artist, normalizeMusicText(track.artist));
      const durationMismatch = original.duration > 0 && track.duration > 0
        && Math.abs(original.duration - track.duration) > Math.max(10, original.duration * 0.1);
      const exact = titleScore === 1 && artistScore === 1 && !durationMismatch;
      return { track, titleScore, artistScore, exact, score: titleScore * 0.7 + artistScore * 0.3 };
    }).filter(item => item.titleScore >= 0.6 && item.artistScore >= 0.5)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score);
  const unique = ranked.filter((item, index, list) => list.findIndex(other => other.track.source_id === item.track.source_id) === index);
  if (!unique.length) return { status: MATCH.NOT_FOUND, candidates: [], selected: null };
  // Multiple exact uploads need review; names cannot prove a recording's identity.
  const exact = unique.filter(item => item.exact);
  const status = exact.length === 1 ? MATCH.EXACT : MATCH.PROBABLE;
  return { status, candidates: unique.slice(0, 4).map(item => item.track), selected: status === MATCH.EXACT ? exact[0].track : null };
}
