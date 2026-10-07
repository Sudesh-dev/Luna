import React, { useState } from 'react';
import { Alert, ImageBackground, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Cover, EmptyState, IconButton, NameModal, Screen, TrackRow, ui } from '../../components/UI';
import { useLuna } from '../../context/LunaContext';
import { artFor, colors } from '../../lib/theme';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { playlists, playlistTracks, tracks, playTrack, addToPlaylist, removeFromPlaylist, moveInPlaylist, renamePlaylist, deletePlaylist, exportPlaylist, startPlaylist } = useLuna();
  const [showAdd, setShowAdd] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const playlist = playlists.find(item => item.id === id);
  const ordered = playlistTracks.filter(row => row.playlist_id === id).map(row => tracks.find(track => track.id === row.track_id)).filter(Boolean);
  const addable = tracks.filter(track => !ordered.some(item => item.id === track.id));
  if (!playlist) return <Screen><IconButton name="arrow-back" onPress={() => router.back()} /><Text style={ui.heading}>Playlist not found</Text></Screen>;
  const confirmDelete = () => Alert.alert('Delete playlist?', `Delete “${playlist.name}” from this device? The songs stay in your library.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deletePlaylist(id); router.back(); } }]);
  return <Screen safeTop={false}><ImageBackground source={artFor(playlist.artwork)} style={styles.hero} imageStyle={{ borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}><View style={[styles.heroShade, { paddingTop: insets.top + 12 }]}><IconButton name="arrow-back" onPress={() => router.back()} style={styles.back} /><View><Text style={ui.eyebrow}>YOUR PLAYLIST</Text><Text style={styles.title} numberOfLines={2}>{playlist.name}</Text><Text style={styles.count}>{ordered.length} songs</Text></View></View></ImageBackground>
    <View style={styles.actions}><Pressable style={styles.playAll} onPress={() => startPlaylist(ordered)}><Ionicons name="play" color="#1B1025" size={21} /><Text style={styles.playText}>Play all</Text></Pressable><IconButton accessibilityLabel="Shuffle playlist" name="shuffle" color={colors.lavender} onPress={() => startPlaylist(ordered, true)} /><IconButton name="add" color={colors.lavender} size={26} onPress={() => setShowAdd(true)} /><IconButton name="pencil-outline" color={colors.muted} onPress={() => setShowRename(true)} /><IconButton name="share-outline" color={colors.muted} onPress={() => exportPlaylist(id).catch(cause => Alert.alert('Share failed', cause.message))} /><IconButton name="trash-outline" color={colors.muted} onPress={confirmDelete} /></View>
    {!!playlist.pending_count && <Pressable style={{ padding: 16, borderRadius: 15, backgroundColor: '#251A32', marginBottom: 16 }} onPress={() => router.push({ pathname: '/import', params: { playlistId: id } })}><Text style={{ color: colors.lavender, fontWeight: '700' }}>{playlist.pending_count} imported tracks need review →</Text><Text style={[ui.body, { fontSize: 12, marginTop: 5 }]}>Keep originals here while you find an Audius match.</Text></Pressable>}
    {ordered.length ? ordered.map((track, index) => <View key={track.id} style={styles.songRow}><Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text><View style={{ flex: 1 }}><TrackRow track={track} tracks={ordered} trailing={false} /></View><IconButton name="chevron-up" size={16} color={colors.muted} onPress={() => moveInPlaylist(id, track.id, -1)} /><IconButton name="chevron-down" size={16} color={colors.muted} onPress={() => moveInPlaylist(id, track.id, 1)} /><IconButton name="close" size={17} color={colors.muted} onPress={() => removeFromPlaylist(id, track.id)} /></View>)
      : <EmptyState icon="musical-notes-outline" title="This playlist is waiting" detail="Add songs from your library to make it yours." action="Add songs" onPress={() => setShowAdd(true)} />}
    <NameModal visible={showRename} title="Rename playlist" value={playlist.name} onCancel={() => setShowRename(false)} onSave={async name => { await renamePlaylist(id, name); setShowRename(false); }} />
    <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}><View style={styles.scrim}><View style={styles.sheet}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Add songs</Text><IconButton name="close" onPress={() => setShowAdd(false)} /></View><ScrollView>{addable.length ? addable.map(track => <Pressable key={track.id} style={styles.addRow} onPress={() => addToPlaylist(id, track.id)}><Cover index={track.artwork} uri={track.artwork_url} size={48} /><View style={{ flex: 1 }}><Text style={styles.addTitle}>{track.title}</Text><Text style={styles.addArtist}>{track.artist}</Text></View><Ionicons name="add-circle-outline" color={colors.lavender} size={22} /></Pressable>) : <Text style={styles.noSongs}>Import audio in your Library, then add it here.</Text>}</ScrollView></View></View></Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: -22, height: 290, justifyContent: 'flex-end' }, heroShade: { flex: 1, backgroundColor: '#09070D66', justifyContent: 'space-between', padding: 22, paddingTop: 32, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }, back: { alignSelf: 'flex-start' }, title: { color: colors.white, fontSize: 32, fontWeight: '700', marginTop: 7 }, count: { color: '#E6D8EE', fontSize: 12, marginTop: 5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginTop: 20, marginBottom: 20 }, playAll: { minWidth: 105, flexGrow: 1, backgroundColor: colors.lavender, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 46, borderRadius: 25, gap: 5 }, playText: { color: '#1B1025', fontWeight: '800' },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 2 }, number: { color: colors.muted, fontSize: 11, width: 24 },
  scrim: { flex: 1, backgroundColor: '#000A', justifyContent: 'flex-end' }, sheet: { backgroundColor: colors.surface, height: '70%', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 22 }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, sheetTitle: { color: colors.white, fontSize: 21, fontWeight: '700' }, addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }, addTitle: { color: colors.white, fontWeight: '600' }, addArtist: { color: colors.muted, fontSize: 11, marginTop: 3 }, noSongs: { color: colors.muted, padding: 20, textAlign: 'center' },
});
