import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as LunaUI from '../../components/UI';
import { useLuna } from '../../context/LunaContext';
import { colors } from '../../lib/theme';
import { useMusicStore } from '../../store/useMusicStore';
import { toLunaTrack } from '../../types/music';

const { Cover, IconButton, NameModal, Screen, TrackRow, ui } = LunaUI as any;

export default function CloudPlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const playlist = useMusicStore(state => state.cloudPlaylists.find(item => item.id === id));
  const rename = useMusicStore(state => state.renameCloudPlaylist);
  const remove = useMusicStore(state => state.removeCloudPlaylist);
  const removeTrack = useMusicStore(state => state.removeCloudTrack);
  const moveTrack = useMusicStore(state => state.moveCloudTrack);
  const refresh = useMusicStore(state => state.refreshCloudPlaylists);
  const { startPlaylist } = useLuna() as any;
  const [renaming, setRenaming] = useState(false);
  const tracks = useMemo(() => (playlist?.tracks || []).map(track => toLunaTrack(track)), [playlist]);
  if (!playlist) return <Screen><IconButton name="arrow-back" onPress={() => router.back()} /><Text style={ui.heading}>Cloud playlist</Text><Text style={styles.detail}>This playlist could not be found. Check your connection and refresh from Library.</Text><Pressable onPress={() => refresh().catch(cause => Alert.alert('Refresh failed', cause.message))}><Text style={styles.link}>Refresh</Text></Pressable></Screen>;
  const confirmDelete = () => Alert.alert('Delete cloud playlist?', `Delete ${playlist.name} from your cloud account?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await remove(playlist.id); router.back(); } catch (cause: any) { Alert.alert('Delete failed', cause.message); } } },
  ]);
  return <Screen><View style={styles.header}><IconButton name="arrow-back" onPress={() => router.back()} /><Text style={ui.eyebrow}>CLOUD PLAYLIST</Text></View>
    <View style={styles.hero}><Cover uri={tracks[0]?.artwork_url} size={145} radius={22} /><Text style={styles.title}>{playlist.name}</Text><Text style={styles.detail}>{tracks.length} songs · synced to your account</Text></View>
    <View style={styles.actions}><Pressable style={styles.play} onPress={() => startPlaylist(tracks)}><Ionicons name="play" size={19} color="#211528" /><Text style={styles.playText}>Play all</Text></Pressable><IconButton name="shuffle" onPress={() => startPlaylist(tracks, true)} /><IconButton name="pencil-outline" onPress={() => setRenaming(true)} /><IconButton name="trash-outline" onPress={confirmDelete} /></View>
    <Text style={styles.detail}>Add songs from Search using the song menu. Stream links are refreshed when needed.</Text>
    {tracks.map((track, index) => <View key={`${track.source}:${track.source_id}:${index}`} style={styles.row}><View style={{ flex: 1 }}><TrackRow track={track} tracks={tracks} trailing={false} /></View><IconButton name="chevron-up" size={16} onPress={() => moveTrack(playlist.id, index, -1).catch((cause: Error) => Alert.alert('Move failed', cause.message))} /><IconButton name="chevron-down" size={16} onPress={() => moveTrack(playlist.id, index, 1).catch((cause: Error) => Alert.alert('Move failed', cause.message))} /><IconButton name="close" size={17} onPress={() => removeTrack(playlist.id, index).catch((cause: Error) => Alert.alert('Remove failed', cause.message))} /></View>)}
    <NameModal visible={renaming} title="Rename cloud playlist" value={playlist.name} onCancel={() => setRenaming(false)} onSave={async (name: string) => { try { await rename(playlist.id, name); setRenaming(false); } catch (cause: any) { Alert.alert('Rename failed', cause.message); } }} />
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, hero: { alignItems: 'center', paddingVertical: 24 }, title: { color: colors.white, fontSize: 28, fontWeight: '700', marginTop: 17 }, detail: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 7 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 17 }, play: { flex: 1, height: 46, backgroundColor: colors.lavender, borderRadius: 24, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }, playText: { color: '#211528', fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center' }, link: { color: colors.lavender, marginTop: 16 },
});
