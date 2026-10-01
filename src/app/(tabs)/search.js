import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Cover, EmptyState, Screen, SectionTitle, TrackRow, ui } from '../../components/UI';
import { useLuna } from '../../context/LunaContext';
import { colors } from '../../lib/theme';

export default function SearchScreen() {
  const { q } = useLocalSearchParams();
  const router = useRouter();
  const { tracks, playlists, importAudio, addToQueue } = useLuna();
  const [query, setQuery] = useState(typeof q === 'string' ? q : '');
  const [filter, setFilter] = useState('Songs');
  const search = query.trim().toLocaleLowerCase();
  const results = useMemo(() => tracks.filter(track => !search || `${track.title} ${track.artist}`.toLocaleLowerCase().includes(search)), [tracks, search]);
  const artistNames = [...new Set(results.map(track => track.artist))];
  const playlistResults = playlists.filter(list => !search || list.name.toLocaleLowerCase().includes(search));
  return <Screen><Text style={ui.eyebrow}>DISCOVER YOUR COLLECTION</Text><Text style={[ui.heading, { marginTop: 5, marginBottom: 22 }]}>Search</Text>
    <View style={styles.searchBox}><Ionicons name="search" size={20} color={colors.lavender} /><TextInput value={query} onChangeText={setQuery} placeholder="Songs, artists, playlists..." placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" returnKeyType="search" />
      {!!query && <Pressable onPress={() => setQuery('')}><Ionicons name="close-circle" size={19} color={colors.muted} /></Pressable>}</View>
    <View style={styles.filters}>{['Songs', 'Artists', 'Playlists'].map(item => <Pressable key={item} style={[styles.chip, filter === item && styles.activeChip]} onPress={() => setFilter(item)}><Text style={[styles.chipText, filter === item && styles.activeText]}>{item}</Text></Pressable>)}</View>
    {filter === 'Songs' && (results.length ? <><SectionTitle title={search ? `${results.length} results` : 'All songs'} />{results.map(track => <TrackRow key={track.id} track={track} tracks={results} onMore={() => addToQueue(track)} />)}</>
      : <EmptyState icon="musical-notes-outline" title={search ? 'No songs found' : 'Your music starts here'} detail={search ? 'Try a different title or artist, or import audio from your device.' : 'Import audio from your device to build a collection you can search and play offline.'} action="Import audio" onPress={importAudio} />)}
    {filter === 'Artists' && (artistNames.length ? <><SectionTitle title="Artists" />{artistNames.map((artist, index) => <Pressable key={artist} style={styles.artistRow} onPress={() => { setFilter('Songs'); setQuery(artist); }}><Cover index={index} size={52} radius={26} /><Text style={styles.artistName}>{artist}</Text><Ionicons name="chevron-forward" size={19} color={colors.muted} /></Pressable>)}</>
      : <EmptyState icon="person-outline" title="No artists found" detail="Artists from your imported audio will appear here." />)}
    {filter === 'Playlists' && (playlistResults.length ? <><SectionTitle title="Playlists" />{playlistResults.map(list => <Pressable key={list.id} style={styles.artistRow} onPress={() => router.push(`/playlist/${list.id}`)}><Cover index={list.artwork} size={52} /><Text style={styles.artistName}>{list.name}</Text><Ionicons name="chevron-forward" size={19} color={colors.muted} /></Pressable>)}</>
      : <EmptyState icon="albums-outline" title="No playlists found" detail="Create one in your Library to see it here." action="Open Library" onPress={() => router.push('/library')} />)}
    <View style={styles.sourceNote}><Ionicons name="information-circle-outline" color={colors.muted} size={18} /><Text style={styles.sourceText}>Search currently covers your device library. SoundCloud discovery needs approved API access.</Text></View>
  </Screen>;
}

const styles = StyleSheet.create({
  searchBox: { height: 52, borderRadius: 15, backgroundColor: '#25202D', borderWidth: 1, borderColor: '#443153', flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14 },
  input: { flex: 1, color: colors.white, fontSize: 14 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 12 }, chip: { borderRadius: 20, backgroundColor: colors.surface, paddingHorizontal: 15, paddingVertical: 9, borderWidth: 1, borderColor: colors.line }, activeChip: { backgroundColor: colors.lavender, borderColor: colors.lavender }, chipText: { color: colors.muted, fontSize: 12, fontWeight: '600' }, activeText: { color: '#201429' },
  artistRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 8 }, artistName: { color: colors.white, fontWeight: '600', flex: 1 },
  sourceNote: { flexDirection: 'row', gap: 8, backgroundColor: '#1B1622', padding: 15, borderRadius: 12, marginTop: 28 }, sourceText: { color: colors.muted, fontSize: 11, flex: 1, lineHeight: 16 },
});
