import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getDatabase, initializeDatabase, readLibrary } from '../lib/database';

const LunaContext = createContext(null);
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const clean = value => String(value || '').trim().toLocaleLowerCase();
const guessTitle = name => decodeURIComponent(name || 'Untitled').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
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
  const currentRef = useRef(null);
  const queueRef = useRef([]);
  const shuffleRef = useRef(false);
  const repeatRef = useRef(false);
  const nextRef = useRef(() => {});

  const refresh = useCallback(async () => setLibrary(await readLibrary()), []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await initializeDatabase();
        if (live) await refresh();
        try { await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }); }
        catch (cause) { console.warn('Audio session setup failed', cause); }
      } catch (cause) {
        if (live) setError(cause.message || 'Could not open your local library.');
      } finally { if (live) setReady(true); }
    })();
    const subscription = player.addListener('playbackStatusUpdate', nextStatus => {
      if (!live) return;
      setStatus(nextStatus);
      if (nextStatus.didJustFinish) nextRef.current();
    });
    return () => { live = false; subscription.remove(); player.release(); };
  }, [player, refresh]);

  const playTrack = useCallback(async (track, tracks = []) => {
    if (!track?.uri || track.source === 'unresolved') {
      Alert.alert('Audio unavailable', 'Add a local audio file to play this song on this device.');
      return false;
    }
    try {
      const nextQueue = tracks.length ? tracks : [track];
      queueRef.current = nextQueue;
      currentRef.current = track;
      setQueue(nextQueue);
      setCurrent(track);
      player.replace(track.uri);
      if (Platform.OS === 'android') player.setActiveForLockScreen(true, { title: track.title, artist: track.artist, albumTitle: 'LUNA' });
      player.play();
      const db = await getDatabase();
      await db.runAsync('INSERT INTO history (track_id, played_at) VALUES (?, ?)', track.id, Date.now());
      await refresh();
      return true;
    } catch (cause) {
      Alert.alert('Playback failed', cause.message || 'This file could not be played.');
      return false;
    }
  }, [player, refresh]);

  const next = useCallback(async (direction = 1) => {
    const list = queueRef.current;
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

  const togglePlay = () => status.playing ? player.pause() : player.play();
  const seek = seconds => player.seekTo(seconds);
  const toggleShuffle = () => { shuffleRef.current = !shuffleRef.current; setShuffle(shuffleRef.current); };
  const toggleRepeat = () => { repeatRef.current = !repeatRef.current; setRepeat(repeatRef.current); };

  const importAudio = async () => {
    if (mobileOnly()) return 0;
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return 0;
    const db = await getDatabase();
    const dir = `${FileSystem.documentDirectory}audio/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    let count = 0;
    for (const file of result.assets || []) {
      if (!file.uri) continue;
      const id = uid();
      const suffix = (file.name?.match(/\.[^.]+$/) || ['.mp3'])[0].toLowerCase();
      const destination = `${dir}${id}${suffix}`;
      try {
        await FileSystem.copyAsync({ from: file.uri, to: destination });
        await db.runAsync('INSERT INTO tracks (id, title, artist, uri, artwork) VALUES (?, ?, ?, ?, ?)',
          id, guessTitle(file.name), 'Local audio', destination, count % 3);
        count += 1;
      } catch (cause) { console.warn('Could not import audio', file.name, cause); }
    }
    await refresh();
    if (!count) Alert.alert('No audio imported', 'Choose audio files stored on your device.');
    return count;
  };

  const createPlaylist = async name => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const id = uid();
    const db = await getDatabase();
    await db.runAsync('INSERT INTO playlists (id, name, artwork, created_at) VALUES (?, ?, ?, ?)',
      id, trimmed, Math.floor(Math.random() * 3), Date.now());
    await refresh();
    return id;
  };
  const renamePlaylist = async (id, name) => {
    if (!name.trim()) return;
    const db = await getDatabase();
    await db.runAsync('UPDATE playlists SET name = ? WHERE id = ?', name.trim(), id);
    await refresh();
  };
  const deletePlaylist = async id => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM playlists WHERE id = ?', id);
    await refresh();
  };
  const addToPlaylist = async (playlistId, trackId) => {
    const db = await getDatabase();
    const row = await db.getFirstAsync('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM playlist_tracks WHERE playlist_id = ?', playlistId);
    await db.runAsync('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)', playlistId, trackId, row.next);
    await refresh();
  };
  const removeFromPlaylist = async (playlistId, trackId) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?', playlistId, trackId);
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
    });
    await refresh();
  };
  const toggleLike = async trackId => {
    const db = await getDatabase();
    if (library.liked.includes(trackId)) await db.runAsync('DELETE FROM liked_tracks WHERE track_id = ?', trackId);
    else await db.runAsync('INSERT OR IGNORE INTO liked_tracks (track_id, liked_at) VALUES (?, ?)', trackId, Date.now());
    await refresh();
  };
  const clearHistory = async () => { const db = await getDatabase(); await db.runAsync('DELETE FROM history'); await refresh(); };
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
    const tracks = library.playlistTracks.filter(row => row.playlist_id === playlistId)
      .map(row => library.tracks.find(track => track.id === row.track_id)).filter(Boolean)
      .map(({ title, artist, duration }) => ({ title, artist, duration }));
    const payload = { format: 'luna-playlist', version: 1, name: playlist.name, tracks };
    const file = `${FileSystem.cacheDirectory}luna-${Date.now()}.json`;
    await FileSystem.writeAsStringAsync(file, JSON.stringify(payload, null, 2));
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file, { mimeType: 'application/json', dialogTitle: 'Share LUNA playlist' });
    else Alert.alert('Sharing unavailable', 'This device does not support file sharing.');
  };
  const importPlaylist = async () => {
    if (mobileOnly()) return null;
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (result.canceled) return null;
    const raw = await FileSystem.readAsStringAsync(result.assets[0].uri);
    let payload;
    try { payload = JSON.parse(raw); } catch { throw new Error('This is not a valid JSON file.'); }
    if (payload?.format !== 'luna-playlist' || payload.version !== 1 || !Array.isArray(payload.tracks) || typeof payload.name !== 'string') {
      throw new Error('Choose a LUNA playlist file.');
    }
    const id = await createPlaylist(payload.name.slice(0, 80));
    const db = await getDatabase();
    const known = [...library.tracks];
    let matched = 0;
    for (let index = 0; index < Math.min(payload.tracks.length, 1000); index += 1) {
      const item = payload.tracks[index];
      if (typeof item?.title !== 'string' || typeof item?.artist !== 'string') continue;
      let track = known.find(entry => clean(entry.title) === clean(item.title) && clean(entry.artist) === clean(item.artist));
      if (!track) {
        const trackId = uid();
        await db.runAsync('INSERT INTO tracks (id, title, artist, uri, duration, source) VALUES (?, ?, ?, ?, ?, ?)',
          trackId, item.title.slice(0, 200), item.artist.slice(0, 200), '', Number(item.duration) || 0, 'unresolved');
        track = { id: trackId, title: item.title, artist: item.artist };
        known.push(track);
      } else matched += 1;
      await db.runAsync('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)', id, track.id, index);
    }
    await refresh();
    return { id, matched, total: payload.tracks.length };
  };

  const exportLibrary = async () => {
    if (mobileOnly()) return;
    const payload = {
      format: 'luna-library', version: 1, exportedAt: new Date().toISOString(),
      tracks: library.tracks.map(({ title, artist, duration }) => ({ title, artist, duration })),
      playlists: library.playlists.map(list => ({ name: list.name, tracks: library.playlistTracks
        .filter(row => row.playlist_id === list.id)
        .map(row => library.tracks.find(track => track.id === row.track_id))
        .filter(Boolean).map(({ title, artist }) => ({ title, artist })) })),
      liked: library.liked.map(id => library.tracks.find(track => track.id === id)).filter(Boolean)
        .map(({ title, artist }) => ({ title, artist })),
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
    let payload;
    try { payload = JSON.parse(await FileSystem.readAsStringAsync(result.assets[0].uri)); } catch { throw new Error('This is not a valid JSON file.'); }
    if (payload?.format !== 'luna-library' || payload.version !== 1 || !Array.isArray(payload.tracks) || !Array.isArray(payload.playlists)) {
      throw new Error('Choose a LUNA library backup file.');
    }
    const db = await getDatabase();
    const known = [...library.tracks];
    const findOrCreate = async item => {
      if (typeof item?.title !== 'string' || typeof item?.artist !== 'string') return null;
      const existing = known.find(track => clean(track.title) === clean(item.title) && clean(track.artist) === clean(item.artist));
      if (existing) return existing.id;
      const trackId = uid();
      await db.runAsync('INSERT INTO tracks (id, title, artist, uri, duration, source) VALUES (?, ?, ?, ?, ?, ?)',
        trackId, item.title.slice(0, 200), item.artist.slice(0, 200), '', Number(item.duration) || 0, 'unresolved');
      known.push({ id: trackId, title: item.title, artist: item.artist });
      return trackId;
    };
    for (const item of payload.tracks.slice(0, 5000)) await findOrCreate(item);
    for (const list of payload.playlists.slice(0, 500)) {
      if (typeof list?.name !== 'string' || !Array.isArray(list.tracks)) continue;
      const playlistId = uid();
      await db.runAsync('INSERT INTO playlists (id, name, artwork, created_at) VALUES (?, ?, ?, ?)', playlistId, list.name.slice(0, 80), 0, Date.now());
      for (let index = 0; index < Math.min(list.tracks.length, 1000); index += 1) {
        const trackId = await findOrCreate(list.tracks[index]);
        if (trackId) await db.runAsync('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)', playlistId, trackId, index);
      }
    }
    if (Array.isArray(payload.liked)) for (const item of payload.liked.slice(0, 5000)) {
      const trackId = await findOrCreate(item);
      if (trackId) await db.runAsync('INSERT OR IGNORE INTO liked_tracks (track_id, liked_at) VALUES (?, ?)', trackId, Date.now());
    }
    await refresh();
    return true;
  };

  const value = { ...library, ready, error, current, queue, status, shuffle, repeat, refresh,
    playTrack, next, togglePlay, seek, toggleShuffle, toggleRepeat, importAudio,
    createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist, moveInPlaylist,
    toggleLike, clearHistory, addToQueue, removeFromQueue, moveInQueue, exportPlaylist, importPlaylist, exportLibrary, importLibrary };
  return <LunaContext.Provider value={value}>{children}</LunaContext.Provider>;
}

export function useLuna() {
  const context = useContext(LunaContext);
  if (!context) throw new Error('useLuna must be used inside LunaProvider');
  return context;
}
