import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Cover, IconButton, Screen, SectionTitle, ui } from '../components/UI';
import SoundCloudMetadata from '../components/SoundCloudMetadata';
import { useLuna } from '../context/LunaContext';
import { colors } from '../lib/theme';
import { spotifyPlaylistUrl, SPOTIFY_IMPORT_LIMITATION } from '../services/spotify';
import { soundCloudPlaylistUrl, soundCloudWidgetTracks } from '../services/soundcloud';
import { matchPlaylist } from '../services/playlistImport';
import { parsePlaylistMetadata, MAX_IMPORT_BYTES } from '../utils/playlistMetadata';

export default function ImportScreen() {
  const router = useRouter();
  const { playlistId } = useLocalSearchParams();
  const { tracks, playlists, playTrack, saveImportedPlaylist, readImportReview, saveReviewedImport } = useLuna();
  const [provider, setProvider] = useState('spotify');
  const [name, setName] = useState('Imported playlist');
  const [link, setLink] = useState('');
  const [sourceUrl, setSourceUrl] = useState(null);
  const [text, setText] = useState('');
  const [widgetUrl, setWidgetUrl] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [entries, setEntries] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState([0, 0]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const controller = useRef(null);
  const operation = useRef(0);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; operation.current += 1; controller.current?.abort(); }; }, []);
  useEffect(() => {
    if (!playlistId) return;
    let active = true;
    const list = playlists.find(item => item.id === playlistId);
    setName(list?.name || 'Imported playlist');
    readImportReview(playlistId).then(rows => { if (active) setEntries(rows); }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [playlistId]);

  const match = async value => {
    setWidgetUrl(null);
    controller.current?.abort();
    const token = ++operation.current;
    const request = new AbortController();
    controller.current = request;
    setBusy(true); setError(''); setProgress([0, value.tracks.length]);
    try {
      const matched = await matchPlaylist(value, { signal: request.signal, knownTracks: tracks,
        onProgress: (done, total) => { if (alive.current && operation.current === token) setProgress([done, total]); } });
      if (!alive.current || operation.current !== token) return;
      setEntries(matched); setMetadata(value); setName(value.name);
    } catch (cause) {
      if (alive.current && operation.current === token && cause.name !== 'AbortError') setError(cause.message);
    } finally { if (alive.current && operation.current === token) setBusy(false); }
  };

  const readLink = () => {
    setError(''); setMessage(''); setWidgetUrl(null);
    try {
      if (provider === 'spotify') {
        const url = spotifyPlaylistUrl(link); setSourceUrl(url); setMessage(SPOTIFY_IMPORT_LIMITATION);
      } else {
        const url = soundCloudPlaylistUrl(link); setSourceUrl(url); setWidgetUrl(url);
        setMessage('Reading the track metadata SoundCloud makes available. Only Audius matches will play in LUNA.');
      }
    } catch (cause) { setError(cause.message); }
  };

  const readFile = async () => {
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (Number(asset.size) > MAX_IMPORT_BYTES) throw new Error('Choose metadata smaller than 5 MB.');
      const raw = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
      const value = parsePlaylistMetadata(raw, { source: provider === 'luna' ? 'metadata' : provider, name });
      await match(value);
    } catch (cause) { setError(cause.message || 'This file could not be read.'); }
  };

  const choose = (index, candidate) => setEntries(rows => rows.map((row, at) => at === index ? { ...row, selected: candidate, accepted: !!candidate } : row));
  const retryEntry = async index => {
    if (busy) return;
    const request = new AbortController(); controller.current = request;
    const token = ++operation.current;
    const row = entries[index];
    setBusy(true); setProgress([0, 1]); setError('');
    try {
      const [result] = await matchPlaylist({ tracks: [row.original] }, { signal: request.signal, knownTracks: tracks });
      if (alive.current && token === operation.current) setEntries(rows => rows.map((item, at) => at === index ? { ...item, ...result } : item));
    } catch (cause) { if (alive.current && cause.name !== 'AbortError') setError(cause.message); }
    finally { if (alive.current && token === operation.current) setBusy(false); }
  };

  const save = async () => {
    if (saving || busy || !entries?.length || !name.trim()) return;
    setSaving(true); setError('');
    try {
      if (playlistId) {
        await saveReviewedImport(playlistId, entries);
        router.replace(`/playlist/${playlistId}`);
      } else {
        const result = await saveImportedPlaylist({ name, source: provider, sourceUrl, entries });
        Alert.alert('Playlist saved', `${result.added} songs added\n${result.pending} entries kept for review${metadata?.skipped ? `\n${metadata.skipped} invalid entries skipped` : ''}`);
        router.replace(`/playlist/${result.id}`);
      }
    } catch (cause) { if (alive.current) { setError(cause.message || 'Could not save the playlist.'); setSaving(false); } }
  };

  const matchedCount = entries?.filter(row => row.accepted && row.selected).length || 0;
  const possibleCount = entries?.filter(row => !row.accepted && row.candidates.length).length || 0;
  const unavailableCount = entries?.filter(row => !row.accepted && !row.candidates.length).length || 0;

  return <Screen><View style={styles.header}><IconButton name="arrow-back" onPress={() => router.back()} /><Text style={[ui.heading, { flex: 1, fontSize: 26 }]}>{playlistId ? 'Review matches' : 'Import Playlist'}</Text></View>
    <Text style={ui.body}>Bring your music lists under one moon. Play matched tracks through Audius.</Text>
    {!playlistId && !entries && <>
      <View style={styles.tabs}>{[['spotify', 'Spotify'], ['soundcloud', 'SoundCloud'], ['luna', 'LUNA / file']].map(([id, label]) => <Pressable key={id} accessibilityRole="button" disabled={busy} accessibilityState={{ selected: provider === id }} style={[styles.tab, provider === id && styles.activeTab]} onPress={() => { setProvider(id); setSourceUrl(null); setLink(''); setWidgetUrl(null); setMessage(''); setMetadata(null); }}><Text style={[styles.tabText, provider === id && styles.activeText]}>{label}</Text></Pressable>)}</View>
      {provider !== 'luna' && <View style={styles.card}><Text style={styles.cardTitle}>{provider === 'spotify' ? 'Spotify playlist' : 'SoundCloud playlist'}</Text><TextInput accessibilityLabel="Playlist link" value={link} onChangeText={setLink} placeholder="Paste playlist link" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" autoCorrect={false} maxLength={2000} /><Pressable accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={readLink}><Text style={styles.link}>{provider === 'spotify' ? 'Check import options' : 'Read playlist metadata'}</Text></Pressable></View>}
      {!!message && <Text style={styles.notice}>{message}</Text>}
      {!!sourceUrl && provider === 'spotify' && <Pressable onPress={() => Linking.openURL(sourceUrl).catch(() => setError('Could not open Spotify.'))}><Text style={styles.link}>Open playlist in Spotify ↗</Text></Pressable>}
      {!!widgetUrl && <View style={styles.card}><SoundCloudMetadata key={widgetUrl} url={widgetUrl} onData={sounds => {
        try { const value = { name, ...soundCloudWidgetTracks(sounds) }; setMetadata(value); setWidgetUrl(null); setMessage(`${value.tracks.length} tracks read. Match them to Audius below.`); }
        catch (cause) { setError(cause.message); setWidgetUrl(null); }
      }} onError={value => { setError(value); setWidgetUrl(null); }} /></View>}
      <SectionTitle title="Playlist name" /><TextInput accessibilityLabel="Playlist name" value={name} onChangeText={setName} style={styles.input} maxLength={80} editable={!busy} />
      {metadata ? <View style={styles.card}><Text style={styles.cardTitle}>{metadata.tracks.length} tracks ready to match</Text><Pressable disabled={busy} style={styles.primary} onPress={() => match({ ...metadata, name })}><Text style={styles.primaryText}>Find Audius matches</Text></Pressable></View> : <>
        <SectionTitle title="Track list or metadata file" /><Text style={styles.help}>One Title — Artist per line, or JSON containing songs with title and artist. Existing LUNA playlist files also work.</Text>
        <TextInput accessibilityLabel="Track metadata" multiline value={text} onChangeText={setText} placeholder="Title — Artist" placeholderTextColor={colors.muted} style={[styles.input, styles.textarea]} editable={!busy} maxLength={100000} />
        <Pressable disabled={busy} style={styles.primary} onPress={() => { try { match(parsePlaylistMetadata(text, { source: provider === 'luna' ? 'metadata' : provider, name })); } catch (cause) { setError(cause.message); } }}><Text style={styles.primaryText}>Find Audius matches</Text></Pressable>
        <Pressable disabled={busy} style={styles.secondary} onPress={readFile}><Text style={styles.link}>Choose JSON or text file</Text></Pressable>
      </>}
    </>}
    {busy && <View style={styles.card}><ActivityIndicator color={colors.lavender} /><Text style={[ui.body, { textAlign: 'center', marginTop: 12 }]}>Matching {progress[0]} of {progress[1]}…</Text><Pressable style={styles.secondary} onPress={() => { operation.current += 1; controller.current?.abort(); setBusy(false); }}><Text style={styles.link}>Cancel</Text></Pressable></View>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!entries && <>
      <View style={styles.summary}><Text style={styles.summaryNumber}>{entries.length}</Text><Text style={ui.body}>tracks reviewed</Text><Text style={styles.summaryText}>{matchedCount} matched · {possibleCount} possible · {unavailableCount} unavailable</Text></View>
      {!playlistId && <TextInput accessibilityLabel="Playlist name" value={name} onChangeText={setName} style={styles.input} maxLength={80} editable={!saving} />}
      <Text style={styles.notice}>Possible matches are suggestions. Listen and select one yourself. Songs without accepted matches stay available for later review.</Text>
      {entries.map((row, index) => <View key={row.id || index} style={styles.card} pointerEvents={busy || saving ? 'none' : 'auto'}><Text style={styles.cardTitle}>{row.original.title}</Text><Text style={styles.help}>{row.original.artist}</Text><Text style={styles.badge}>{row.accepted ? 'MATCHED' : row.candidates.length ? 'POSSIBLE MATCH' : row.error ? 'SEARCH UNAVAILABLE' : 'NOT FOUND'}</Text>
        {!!row.error && <Text style={styles.help}>{row.error}</Text>}
        {row.candidates.map(candidate => <View key={candidate.id} style={styles.candidate}><Cover uri={candidate.artwork_url} size={40} radius={8} /><View style={{ flex: 1 }}><Text style={styles.candidateTitle} numberOfLines={2}>{candidate.title}</Text><Text style={styles.help}>{candidate.artist}</Text></View><IconButton name="play-outline" accessibilityLabel={`Listen to ${candidate.title}`} onPress={() => playTrack(candidate)} /><IconButton name={row.selected?.id === candidate.id && row.accepted ? 'checkmark-circle' : 'ellipse-outline'} color={colors.lavender} accessibilityLabel={`Select ${candidate.title} as match`} onPress={() => choose(index, row.selected?.id === candidate.id && row.accepted ? null : candidate)} /></View>)}
        {!row.accepted && <Pressable disabled={busy || saving} style={styles.secondary} onPress={() => retryEntry(index)}><Text style={styles.link}>Retry Audius search</Text></Pressable>}
      </View>)}
      <Pressable accessibilityRole="button" disabled={busy || saving || !entries.length || !name.trim()} style={[styles.primary, (busy || saving || !entries.length || !name.trim()) && styles.disabled]} onPress={save}><Text style={styles.primaryText}>{saving ? 'Saving…' : playlistId ? 'Save reviewed matches' : `Create playlist · ${matchedCount} matched`}</Text></Pressable>
      {!playlistId && <Pressable disabled={busy || saving} style={styles.secondary} onPress={() => { setEntries(null); setMetadata(null); }}><Text style={styles.link}>Edit track list</Text></Pressable>}
      {playlistId && !entries.length && <Text style={ui.body}>All imported songs have been reviewed.</Text>}
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 24 }, tab: { paddingHorizontal: 15, paddingVertical: 12, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }, activeTab: { backgroundColor: colors.lavender }, tabText: { color: colors.muted, fontSize: 12 }, activeText: { color: colors.background, fontWeight: '700' },
  card: { padding: 17, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#3E2B4F', marginTop: 17 }, cardTitle: { color: colors.white, fontSize: 16, fontWeight: '700', marginBottom: 7 },
  input: { color: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.raised, padding: 14, fontSize: 14, minHeight: 50 }, textarea: { minHeight: 135, textAlignVertical: 'top', marginTop: 12 },
  primary: { minHeight: 48, padding: 14, borderRadius: 24, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center', marginTop: 17 }, primaryText: { color: '#1B1025', fontWeight: '800', fontSize: 13 },
  secondary: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 7 }, link: { color: colors.lavender, fontSize: 13, fontWeight: '600' },
  help: { color: colors.muted, fontSize: 12, lineHeight: 19 }, notice: { color: colors.muted, fontSize: 12, lineHeight: 20, marginVertical: 15 }, error: { color: '#FFB7C9', backgroundColor: '#2A1722', padding: 15, borderRadius: 14, fontSize: 13, lineHeight: 20, marginTop: 15 },
  summary: { alignItems: 'center', padding: 24, marginVertical: 18, borderRadius: 20, borderWidth: 1, borderColor: '#5F417A', backgroundColor: '#251A32' }, summaryNumber: { fontSize: 34, fontWeight: '300', color: colors.rose }, summaryText: { color: colors.lavender, fontSize: 12, marginTop: 9 }, badge: { color: colors.lavender, fontWeight: '700', fontSize: 10, letterSpacing: 1.5, marginVertical: 12 },
  candidate: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.line }, candidateTitle: { color: colors.white, fontSize: 12 }, disabled: { opacity: 0.45 },
});
