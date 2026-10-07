import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { clearPlayHistory, getDatabase, initializeDatabase, readLibrary, recordPlay, saveProviderTrack, saveMatchedPlaylist, readImportReview, saveImportReview } from '../lib/database';
import { audiusStreamUrl } from '../services/audius';

const LunaContext = createContext(null);
const MAX_AUDIO_IMPORT_BYTES = 50 * 1024 * 1024;
const MAX_JSON_IMPORT_BYTES = 5 * 1024 * 1024;
const SUPPORTED_AUDIO_EXTENSIONS = new Set(['.aac', '.amr', '.flac', '.m4a', '.mid', '.midi', '.mp3', '.mp4', '.ogg', '.opus', '.wav', '.webm', '.3gp']);
const AUDIO_MIME_EXTENSIONS = {
  'audio/aac': '.aac', 'audio/amr': '.amr', 'audio/flac': '.flac', 'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/opus': '.opus', 'audio/wav': '.wav',
  'audio/x-wav': '.wav', 'audio/webm': '.webm', 'audio/3gpp': '.3gp',
};
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const clean = value => String(value || '').trim().toLocaleLowerCase();
const decodeFileName = name => {
  try { return decodeURIComponent(name); } catch { return name; }
};
const guessTitle = name => decodeFileName(String(name || 'Untitled')).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled';
const audioExtension = file => {
  const extension = String(file?.name || '').match(/\.[a-z0-9]{1,8}$/i)?.[0]?.toLocaleLowerCase() || '';
  if (SUPPORTED_AUDIO_EXTENSIONS.has(extension)) return extension;
  return AUDIO_MIME_EXTENSIONS[String(file?.mimeType || '').toLocaleLowerCase()] || '';
};
const localFileIdentity = file => `file:${clean(file?.name).slice(0, 220)}:${Math.max(Number(file?.size) || 0, 0)}`;
async function writePickedAudio(sourceFile, destinationFile) {
  try {
    const bytes = await sourceFile.bytes();
    if (!bytes.length) throw new Error('The selected audio file is empty.');
    destinationFile.create();
    await destinationFile.write(bytes);
  } catch (cause) {
    if (destinationFile.exists) {
      try { destinationFile.delete(); } catch {}
    }
    throw cause;
  }
}
async function persistPickedAudio(pickedFile, destinationFile) {
  const sourceFile = pickedFile.nativeFile || new File(pickedFile.uri);
  if (Platform.OS === 'android') {
    await writePickedAudio(sourceFile, destinationFile);
    return;
  }
  try {
    await sourceFile.copy(destinationFile);
  } catch (copyError) {
    try {
      if (destinationFile.exists) destinationFile.delete();
      await writePickedAudio(sourceFile, destinationFile);
    } catch (readError) {
      console.warn('Audio copy and byte fallback failed', copyError, readError);
      throw readError;
    }
  }
}
async function pickAudioFiles() {
  if (Platform.OS === 'android') {
    const result = await File.pickFileAsync({ multipleFiles: true, mimeTypes: 'audio/*' });
    if (result.canceled) return null;
    return result.result.map(file => ({
      uri: file.uri,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      nativeFile: file,
    }));
  }
  const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
  return result.canceled ? null : result.assets;
}
const portableTrack = track => ({
  source: track.source || 'local',
  sourceId: track.source_id || null,
  title: track.title,
  artist: track.artist,
  albumTitle: track.album_title || null,
  artworkUrl: track.artwork_url || null,
  duration: Number(track.duration) || 0,
  sourceUrl: track.source_url || null,
  playable: track.playable === 0 ? 0 : 1,
  unavailableReason: track.unavailable_reason || null,
});
const sourceIdentity = item => ({
  source: typeof item?.source === 'string' ? item.source.trim().toLocaleLowerCase() : '',
  sourceId: typeof item?.sourceId === 'string' ? item.sourceId.trim() : typeof item?.source_id === 'string' ? item.source_id.trim() : '',
});
const findKnownTrack = (known, item) => {
  const identity = sourceIdentity(item);
  if (identity.source && identity.source !== 'local' && identity.sourceId) {
    return known.find(track => track.source === identity.source && track.source_id === identity.sourceId) || null;
  }
  return known.find(track => clean(track.title) === clean(item?.title) && clean(track.artist) === clean(item?.artist));
};
const sameTrack = (left, right) => left?.id === right?.id || (
  left?.source && left.source === right?.source && left?.source_id && left.source_id === right?.source_id
);
const optionalText = (value, limit = 2000) => typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null;
const providerPlayback = (source, sourceId) => {
  if (source === 'audius') {
    return { uri: audiusStreamUrl(sourceId), playable: 1, unavailable_reason: null };
  }
  if (source === 'soundcloud') {
    return {
      uri: '', playable: 0,
      unavailable_reason: 'SoundCloud is an import source. Match this song to Audius from Import Playlist.',
    };
  }
  return { uri: '', playable: 0, unavailable_reason: 'Reconnect this music provider to play the imported track.' };
};
const restoreProviderPlayback = track => {
  if (track?.source && !['audius', 'local', 'unresolved'].includes(track.source)) return { ...track, ...providerPlayback(track.source, track.source_id) };
  if (track?.source === 'audius' && track.playable === 0) return track;
  if (!track?.source_id || track.source === 'local' || track.source === 'unresolved' || (track.uri && track.playable !== 0)) return track;
  return { ...track, ...providerPlayback(track.source, track.source_id) };
};

async function createImportedTrack(db, item) {
  const identity = sourceIdentity(item);
  const hasProviderIdentity = identity.source && identity.source !== 'local' && identity.sourceId;
  const source = hasProviderIdentity ? identity.source : 'unresolved';
  const sourceId = hasProviderIdentity ? identity.sourceId.slice(0, 300) : null;
  const playback = hasProviderIdentity
    ? providerPlayback(source, sourceId)
    : { uri: '', playable: 0, unavailable_reason: 'Add the original local audio file to play this song.' };
  const now = Date.now();
  const track = {
    id: uid(),
    source,
    source_id: sourceId,
    title: item.title.trim().slice(0, 200),
    artist: item.artist.trim().slice(0, 200),
    album_title: optionalText(item.albumTitle ?? item.album_title, 200),
    artwork_url: optionalText(item.artworkUrl ?? item.artwork_url),
    duration: Number(item.duration) || 0,
    source_url: optionalText(item.sourceUrl ?? item.source_url),
    ...playback,
    ...(source === 'audius' && item.playable === 0 ? { uri: '', playable: 0, unavailable_reason: optionalText(item.unavailableReason ?? item.unavailable_reason) || 'This Audius track is not available for streaming.' } : {}),
  };
  await db.runAsync(`INSERT INTO tracks (
    id, source, source_id, title, artist, album_title, uri, duration,
    artwork_url, source_url, playable, unavailable_reason, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  track.id, track.source, track.source_id, track.title, track.artist, track.album_title, track.uri, track.duration,
  track.artwork_url, track.source_url, track.playable, track.unavailable_reason, now, now);
  return track;
}
async function repairStoredProviderPlayback(db, track) {
  const restored = restoreProviderPlayback(track);
  if (restored === track || (restored.uri === track.uri && restored.playable === track.playable
    && restored.unavailable_reason === track.unavailable_reason)) return track;
  await db.runAsync('UPDATE tracks SET uri = ?, playable = ?, unavailable_reason = ?, updated_at = ? WHERE id = ?',
    restored.uri, restored.playable, restored.unavailable_reason, Date.now(), track.id);
  return restored;
}
async function readJsonDocument(result) {
  const asset = result?.assets?.[0];
  if (!asset?.uri) throw new Error('The selected file could not be opened.');
  if (Number(asset.size) > MAX_JSON_IMPORT_BYTES) throw new Error('Choose a LUNA JSON file smaller than 5 MB.');
  const raw = await FileSystem.readAsStringAsync(asset.uri);
  if (raw.length > MAX_JSON_IMPORT_BYTES) throw new Error('Choose a LUNA JSON file smaller than 5 MB.');
  try { return JSON.parse(raw); } catch { throw new Error('This is not a valid JSON file.'); }
}
const mobileOnly = () => {
  if (Platform.OS !== 'web') return false;
  if (typeof window !== 'undefined') window.alert('File import and sharing are available in the Android and iOS app.');
  return true;
};

export function LunaProvider({ children }) {
  const player = useMemo(() => createAudioPlayer(null, { updateInterval: 500 }), []);
  const [library, setLibrary] = useState({ tracks: [], playlists: [], playlistTracks: [], liked: [], history: [] });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(null);
  const [queue, setQueue] = useState([]);
  const [status, setStatus] = useState({ playing: false, currentTime: 0, duration: 0 });
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const currentRef = useRef(null);
  const queueRef = useRef([]);
  const shuffleRef = useRef(false);
  const repeatRef = useRef(false);
  const nextRef = useRef(() => {});
  const importInProgressRef = useRef(false);
  const playbackRequestRef = useRef(0);
  const pendingHistoryRef = useRef(null);

  const refresh = useCallback(async () => setLibrary(await readLibrary()), []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await initializeDatabase();
        if (live) await refresh();
        if (live) setReady(true);
        try { await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }); }
        catch (cause) { console.warn('Audio session setup failed', cause); }
      } catch (cause) {
        if (live) setError(cause.message || 'Could not open your local library.');
      } finally { if (live) setReady(true); }
    })();
    const subscription = player.addListener('playbackStatusUpdate', nextStatus => {
      if (!live) return;
      setStatus(nextStatus);
      if (nextStatus.error) {
        setPlaybackError('This track could not be played. Check your connection or choose another Audius track.');
        pendingHistoryRef.current = null;
      }
      if (nextStatus.playing && pendingHistoryRef.current) {
        const playedId = pendingHistoryRef.current;
        pendingHistoryRef.current = null;
        recordPlay(playedId).then(refresh).catch(cause => console.warn('Could not save listening history', cause));
      }
      if (nextStatus.didJustFinish) nextRef.current();
    });
    return () => { live = false; subscription.remove(); player.release(); };
  }, [player, refresh]);

  const playTrack = useCallback(async (track, tracks = []) => {
    const requestId = ++playbackRequestRef.current;
    const resolvedTrack = restoreProviderPlayback(track);
    if (!resolvedTrack?.uri || resolvedTrack.playable === 0 || resolvedTrack.source === 'unresolved') {
      const message = resolvedTrack?.unavailable_reason || (resolvedTrack?.source === 'unresolved'
        ? 'Add a local audio file to play this song on this device.'
        : 'This song cannot be played from its current source.');
      Alert.alert('Track unavailable', message);
      return false;
    }
    try {
      const storedTrack = await saveProviderTrack(resolvedTrack);
      if (requestId !== playbackRequestRef.current) return false;
      player.pause();
      pendingHistoryRef.current = null;
      setPlaybackError('');
      const nextQueue = (tracks.length ? tracks : [resolvedTrack]).map(item => sameTrack(item, resolvedTrack) ? storedTrack : item);
      queueRef.current = nextQueue;
      currentRef.current = storedTrack;
      setQueue(nextQueue);
      setCurrent(storedTrack);
      setStatus({ playing: false, currentTime: 0, duration: storedTrack.duration || 0, isLoaded: false, isBuffering: true });
      player.replace(storedTrack.uri);
      pendingHistoryRef.current = storedTrack.id;
      if (Platform.OS === 'android') player.setActiveForLockScreen(true, { title: storedTrack.title, artist: storedTrack.artist, albumTitle: storedTrack.album_title || 'LUNA' });
      player.play();
      await refresh();
      return true;
    } catch (cause) {
      Alert.alert('Playback failed', cause.message || 'This file could not be played.');
      return false;
    }
  }, [player, refresh]);

  const next = useCallback(async (direction = 1) => {
    const list = queueRef.current.filter(track => ['local', 'audius'].includes(track.source) && track.playable !== 0 && track.uri);
    if (!list.length) return;
    const at = list.findIndex(track => track.id === currentRef.current?.id);
    let index = at + direction;
    if (shuffleRef.current && list.length > 1 && direction > 0) {
      index = Math.floor(Math.random() * (list.length - 1));
      if (index >= at) index += 1;
    }
    if (index < 0) index = list.length - 1;
    if (index >= list.length) {
      if (!repeatRef.current) { player.pause(); return; }
      index = 0;
    }
    await playTrack(list[index], list);
  }, [playTrack, player]);
  nextRef.current = next;

  const togglePlay = () => playbackError ? playTrack(currentRef.current, queueRef.current) : status.playing ? player.pause() : player.play();
  const seek = async seconds => {
    try { await player.seekTo(Math.max(Number(seconds) || 0, 0)); }
    catch { setPlaybackError('The player could not seek in this track. Try playing it again.'); }
  };
  const toggleShuffle = () => { shuffleRef.current = !shuffleRef.current; setShuffle(shuffleRef.current); };
  const toggleRepeat = () => { repeatRef.current = !repeatRef.current; setRepeat(repeatRef.current); };
  const startPlaylist = async (tracks, shuffled = false) => {
    const playable = tracks.filter(track => (track.source === 'local' || track.source === 'audius') && track.playable !== 0 && track.uri);
    if (!playable.length) { Alert.alert('No playable songs', 'Search Audius or review imported matches to add playable songs.'); return; }
    shuffleRef.current = shuffled; setShuffle(shuffled);
    const first = shuffled ? playable[Math.floor(Math.random() * playable.length)] : playable[0];
    await playTrack(first, playable);
  };

  const importAudio = async () => {
    if (mobileOnly() || importInProgressRef.current) return null;
    importInProgressRef.current = true;
    try {
      const pickedFiles = await pickAudioFiles();
      if (!pickedFiles) return null;
      if (!FileSystem.documentDirectory) throw new Error('LUNA cannot access its local music folder.');

      const db = await getDatabase();
      const directory = `${FileSystem.documentDirectory}audio/`;
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      let imported = 0;
      let duplicates = 0;
      let unsupported = 0;
      let tooLarge = 0;
      let failed = 0;

      for (const file of pickedFiles) {
        const extension = audioExtension(file);
        if (!file?.uri || !extension) {
          unsupported += 1;
          continue;
        }
        if (Number(file.size) > MAX_AUDIO_IMPORT_BYTES) {
          tooLarge += 1;
          continue;
        }

        const sourceId = localFileIdentity(file);
        const existing = await db.getFirstAsync('SELECT id FROM tracks WHERE source = ? AND source_id = ?', 'local', sourceId);
        if (existing) {
          duplicates += 1;
          continue;
        }

        const id = uid();
        const destination = `${directory}${id}${extension}`;
        const destinationFile = new File(destination);
        let copied = false;
        try {
          await persistPickedAudio(file, destinationFile);
          copied = true;
          const now = Date.now();
          await db.runAsync(`INSERT INTO tracks (
            id, source, source_id, title, artist, uri, artwork, playable, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, 'local', sourceId, guessTitle(file.name), 'Local audio', destination, imported % 3, 1, now, now);
          imported += 1;
        } catch (cause) {
          failed += 1;
          console.warn('Could not import audio', file.name, cause);
          if (copied) {
            try { destinationFile.delete(); } catch {}
          }
        }
      }

      if (imported) await refresh();
      const notes = [
        imported ? `${imported} ${imported === 1 ? 'song' : 'songs'} imported.` : 'No songs were imported.',
        duplicates ? `${duplicates} duplicate ${duplicates === 1 ? 'file was' : 'files were'} skipped.` : null,
        unsupported ? `${unsupported} unsupported ${unsupported === 1 ? 'file was' : 'files were'} skipped.` : null,
        tooLarge ? `${tooLarge} ${tooLarge === 1 ? 'file was' : 'files were'} larger than 50 MB.` : null,
        failed ? `${failed} ${failed === 1 ? 'file' : 'files'} could not be copied.` : null,
      ].filter(Boolean).join('\n');
      Alert.alert(imported ? 'Import complete' : 'Nothing imported', notes);
      return { imported, duplicates, unsupported, tooLarge, failed };
    } catch (cause) {
      console.warn('Audio import failed', cause);
      Alert.alert('Import failed', cause?.message || 'LUNA could not import the selected audio.');
      return null;
    } finally {
      importInProgressRef.current = false;
    }
  };

  const createPlaylist = async name => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const id = uid();
    const db = await getDatabase();
    const now = Date.now();
    await db.runAsync('INSERT INTO playlists (id, name, artwork, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      id, trimmed, Math.floor(Math.random() * 3), now, now);
    await refresh();
    return id;
  };
  const renamePlaylist = async (id, name) => {
    if (!name.trim()) return;
    const db = await getDatabase();
    await db.runAsync('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?', name.trim(), Date.now(), id);
    await refresh();
  };
  const deletePlaylist = async id => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM playlists WHERE id = ?', id);
    await refresh();
  };
  const addToPlaylist = async (playlistId, trackOrId) => {
    const storedTrack = typeof trackOrId === 'object' ? await saveProviderTrack(trackOrId) : null;
    const trackId = storedTrack?.id || trackOrId;
    if (!trackId) return;
    const db = await getDatabase();
    const row = await db.getFirstAsync('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM playlist_tracks WHERE playlist_id = ?', playlistId);
    await db.withTransactionAsync(async () => {
      await db.runAsync('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, ?)', playlistId, trackId, row.next, Date.now());
      await db.runAsync('UPDATE playlists SET updated_at = ? WHERE id = ?', Date.now(), playlistId);
    });
    await refresh();
  };
  const removeFromPlaylist = async (playlistId, trackId) => {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?', playlistId, trackId);
      await db.runAsync('UPDATE playlists SET updated_at = ? WHERE id = ?', Date.now(), playlistId);
    });
    await refresh();
  };
  const moveInPlaylist = async (playlistId, trackId, direction) => {
    const rows = library.playlistTracks.filter(row => row.playlist_id === playlistId);
    const index = rows.findIndex(row => row.track_id === trackId);
    const other = rows[index + direction];
    if (!other) return;
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?', other.position, playlistId, trackId);
      await db.runAsync('UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?', rows[index].position, playlistId, other.track_id);
      await db.runAsync('UPDATE playlists SET updated_at = ? WHERE id = ?', Date.now(), playlistId);
    });
    await refresh();
  };
  const toggleLike = async trackOrId => {
    const storedTrack = typeof trackOrId === 'object' ? await saveProviderTrack(trackOrId) : null;
    const trackId = storedTrack?.id || trackOrId;
    if (!trackId) return;
    const db = await getDatabase();
    if (library.liked.includes(trackId)) await db.runAsync('DELETE FROM liked_tracks WHERE track_id = ?', trackId);
    else await db.runAsync('INSERT OR IGNORE INTO liked_tracks (track_id, liked_at) VALUES (?, ?)', trackId, Date.now());
    await refresh();
  };
  const clearHistory = async () => { await clearPlayHistory(); await refresh(); };
  const addToQueue = track => { const nextQueue = [...queueRef.current, track]; queueRef.current = nextQueue; setQueue(nextQueue); };
  const removeFromQueue = index => { const nextQueue = queueRef.current.filter((_, at) => at !== index); queueRef.current = nextQueue; setQueue(nextQueue); };
  const moveInQueue = (index, direction) => {
    const other = index + direction;
    if (other < 0 || other >= queueRef.current.length) return;
    const nextQueue = [...queueRef.current];
    [nextQueue[index], nextQueue[other]] = [nextQueue[other], nextQueue[index]];
    queueRef.current = nextQueue; setQueue(nextQueue);
  };

  const exportPlaylist = async playlistId => {
    if (mobileOnly()) return;
    const playlist = library.playlists.find(item => item.id === playlistId);
    if (!playlist) return;
    const exported = library.playlistTracks.filter(row => row.playlist_id === playlistId)
      .map(row => ({ position: row.position, track: library.tracks.find(track => track.id === row.track_id) })).filter(row => row.track)
      .map(row => ({ position: row.position, song: portableTrack(row.track) }));
    const db = await getDatabase();
    const unresolved = await db.getAllAsync('SELECT original_json, position FROM import_entries WHERE playlist_id = ? AND matched_track_id IS NULL ORDER BY position', playlistId);
    const songs = [...exported, ...unresolved.map(row => ({ position: row.position, song: portableTrack(JSON.parse(row.original_json)) }))]
      .sort((a, b) => a.position - b.position).map(row => row.song);
    const payload = { format: 'luna-playlist', version: 1, name: playlist.name, songs };
    const file = `${FileSystem.cacheDirectory}luna-${Date.now()}.json`;
    await FileSystem.writeAsStringAsync(file, JSON.stringify(payload, null, 2));
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file, { mimeType: 'application/json', dialogTitle: 'Share LUNA playlist' });
    else Alert.alert('Sharing unavailable', 'This device does not support file sharing.');
  };

  const exportLibrary = async () => {
    if (mobileOnly()) return;
    const db = await getDatabase();
    const pendingImports = await db.getAllAsync('SELECT playlist_id, original_json, match_status, candidates_json, position, last_error FROM import_entries WHERE matched_track_id IS NULL ORDER BY position');
    const payload = {
      format: 'luna-library', version: 1, exportedAt: new Date().toISOString(),
      tracks: library.tracks.map(portableTrack),
      playlists: library.playlists.map(list => ({ name: list.name, importedFrom: list.imported_from || null, sourceUrl: list.source_url || null,
        pendingImports: pendingImports.filter(row => row.playlist_id === list.id).map(row => ({ original: JSON.parse(row.original_json), status: row.match_status, candidates: JSON.parse(row.candidates_json), position: row.position, error: row.last_error })),
        tracks: library.playlistTracks
        .filter(row => row.playlist_id === list.id)
        .map(row => library.tracks.find(track => track.id === row.track_id))
        .filter(Boolean).map(portableTrack) })),
      liked: library.liked.map(id => library.tracks.find(track => track.id === id)).filter(Boolean)
        .map(portableTrack),
    };
    const file = `${FileSystem.cacheDirectory}luna-library-${Date.now()}.json`;
    await FileSystem.writeAsStringAsync(file, JSON.stringify(payload, null, 2));
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file, { mimeType: 'application/json', dialogTitle: 'Export LUNA library' });
    else Alert.alert('Sharing unavailable', 'This device does not support file sharing.');
  };
  const importLibrary = async () => {
    if (mobileOnly()) return null;
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (result.canceled) return null;
    const payload = await readJsonDocument(result);
    if (payload?.format !== 'luna-library' || payload.version !== 1 || !Array.isArray(payload.tracks) || !Array.isArray(payload.playlists)) {
      throw new Error('Choose a LUNA library backup file.');
    }
    const db = await getDatabase();
    const known = [...library.tracks];
    const findOrCreate = async item => {
      if (typeof item?.title !== 'string' || !item.title.trim() || typeof item?.artist !== 'string' || !item.artist.trim()) return null;
      const existing = findKnownTrack(known, item);
      if (existing) return (await repairStoredProviderPlayback(db, existing)).id;
      const track = await createImportedTrack(db, item);
      known.push(track);
      return track.id;
    };
    await db.withTransactionAsync(async () => {
      for (const item of payload.tracks.slice(0, 5000)) await findOrCreate(item);
      for (const list of payload.playlists.slice(0, 500)) {
        if (typeof list?.name !== 'string' || !list.name.trim() || !Array.isArray(list.tracks)) continue;
        const playlistId = uid();
        const now = Date.now();
        await db.runAsync('INSERT INTO playlists (id, name, artwork, created_at, updated_at, imported_from, source_url) VALUES (?, ?, ?, ?, ?, ?, ?)', playlistId, list.name.trim().slice(0, 80), 0, now, now, optionalText(list.importedFrom, 30), optionalText(list.sourceUrl));
        for (let index = 0; index < Math.min(list.tracks.length, 1000); index += 1) {
          const trackId = await findOrCreate(list.tracks[index]);
          if (trackId) await db.runAsync('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, ?)', playlistId, trackId, index, now);
        }
        if (Array.isArray(list.pendingImports)) for (let index = 0; index < Math.min(list.pendingImports.length, 500); index += 1) {
          const entry = list.pendingImports[index];
          if (!entry?.original || typeof entry.original.title !== 'string' || typeof entry.original.artist !== 'string') continue;
          await db.runAsync('INSERT INTO import_entries (id, playlist_id, position, original_json, match_status, candidates_json, last_error) VALUES (?, ?, ?, ?, ?, ?, ?)',
            `${playlistId}:${index}`, playlistId, Math.max(Number(entry.position) || 0, 0), JSON.stringify(entry.original), ['EXACT', 'PROBABLE', 'NOT_FOUND'].includes(entry.status) ? entry.status : 'NOT_FOUND', JSON.stringify(Array.isArray(entry.candidates) ? entry.candidates.slice(0, 4) : []), optionalText(entry.error));
        }
      }
      if (Array.isArray(payload.liked)) for (const item of payload.liked.slice(0, 5000)) {
        const trackId = await findOrCreate(item);
        if (trackId) await db.runAsync('INSERT OR IGNORE INTO liked_tracks (track_id, liked_at) VALUES (?, ?)', trackId, Date.now());
      }
    });
    await refresh();
    return true;
  };

  const saveImportedPlaylist = async input => { const result = await saveMatchedPlaylist(input); await refresh(); return result; };
  const saveReviewedImport = async (id, entries) => { await saveImportReview(id, entries); await refresh(); return id; };

  const value = { ...library, ready, error, current, queue, status, shuffle, repeat, refresh, playbackError,
    saveImportedPlaylist, readImportReview, saveReviewedImport,
    playTrack, next, togglePlay, seek, toggleShuffle, toggleRepeat, importAudio, startPlaylist,
    createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist, moveInPlaylist,
    toggleLike, clearHistory, addToQueue, removeFromQueue, moveInQueue, exportPlaylist, exportLibrary, importLibrary };
  return <LunaContext.Provider value={value}>{children}</LunaContext.Provider>;
}

export function useLuna() {
  const context = useContext(LunaContext);
  if (!context) throw new Error('useLuna must be used inside LunaProvider');
  return context;
}
