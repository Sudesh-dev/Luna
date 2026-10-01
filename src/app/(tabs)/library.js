import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Cover, EmptyState, IconButton, NameModal, Screen, SectionTitle, TrackRow, ui } from '../../components/UI';
import { useLuna } from '../../context/LunaContext';
import { colors } from '../../lib/theme';

export default function LibraryScreen() {
  const router = useRouter();
  const { tracks, playlists, playlistTracks, liked, history, createPlaylist, importAudio, playTrack } = useLuna();
  const [showName, setShowName] = useState(false);
  const [section, setSection] = useState('Playlists');
  const likedTracks = liked.map(id => tracks.find(track => track.id === id)).filter(Boolean);
  const recentTracks = [...new Set(history.map(item => item.track_id))].map(id => tracks.find(track => track.id === id)).filter(Boolean);
  return <Screen><View style={styles.header}><View><Text style={ui.eyebrow}>YOUR PERSONAL SPACE</Text><Text style={[ui.heading, { marginTop: 5 }]}>Library</Text></View><IconButton name="settings-outline" color={colors.lavender} onPress={() => router.push('/settings')} /></View>
    <View style={styles.summary}><View style={styles.stat}><Text style={styles.statNumber}>{tracks.length}</Text><Text style={styles.statLabel}>Songs</Text></View><View style={styles.divider} /><View style={styles.stat}><Text style={styles.statNumber}>{playlists.length}</Text><Text style={styles.statLabel}>Playlists</Text></View><View style={styles.divider} /><View style={styles.stat}><Text style={styles.statNumber}>{liked.length}</Text><Text style={styles.statLabel}>Liked</Text></View></View>
    <View style={styles.actions}><Pressable style={styles.actionPrimary} onPress={importAudio}><Ionicons name="add" color="#1B1025" size={20} /><Text style={styles.actionPrimaryText}>Import audio</Text></Pressable><Pressable style={styles.actionSecondary} onPress={() => setShowName(true)}><Ionicons name="add" color={colors.lavender} size={20} /><Text style={styles.actionSecondaryText}>Playlist</Text></Pressable></View>
    <View style={styles.tabs}>{['Playlists', 'Liked Songs', 'Recently Played', 'All Songs'].map(item => <Pressable key={item} onPress={() => setSection(item)} style={[styles.tab, section === item && styles.selectedTab]}><Text style={[styles.tabText, section === item && styles.selectedText]}>{item}</Text></Pressable>)}</View>
    {section === 'Playlists' && <><SectionTitle title="Your playlists" action="+ New" onPress={() => setShowName(true)} />
      {playlists.length ? playlists.map(list => <Pressable key={list.id} style={styles.playlistRow} onPress={() => router.push(`/playlist/${list.id}`)}><Cover index={list.artwork} size={62} /><View style={{ flex: 1 }}><Text style={styles.playlistName}>{list.name}</Text><Text style={styles.playlistCount}>{playlistTracks.filter(row => row.playlist_id === list.id).length} songs</Text></View><Ionicons name="chevron-forward" color={colors.muted} size={19} /></Pressable>)
        : <EmptyState icon="albums-outline" title="Make a little space for music" detail="Create playlists for late drives, quiet focus, and every mood in between." action="Create playlist" onPress={() => setShowName(true)} />}</>}
    {section === 'Liked Songs' && <><SectionTitle title="Liked Songs" />{likedTracks.length ? likedTracks.map(track => <TrackRow key={track.id} track={track} tracks={likedTracks} />) : <EmptyState icon="heart-outline" title="Nothing liked yet" detail="Tap the heart beside a song to keep it close." />}</>}
    {section === 'Recently Played' && <><SectionTitle title="Recently Played" />{recentTracks.length ? recentTracks.map(track => <TrackRow key={track.id} track={track} tracks={recentTracks} />) : <EmptyState icon="time-outline" title="Nothing played yet" detail="Your listening history stays on this device." />}</>}
    {section === 'All Songs' && <><SectionTitle title="All Songs" />{tracks.length ? tracks.map(track => <TrackRow key={track.id} track={track} tracks={tracks} />) : <EmptyState icon="musical-notes-outline" title="No songs yet" detail="Import audio files from your device to begin." action="Import audio" onPress={importAudio} />}</>}
    <NameModal visible={showName} title="New playlist" onCancel={() => setShowName(false)} onSave={async name => { const id = await createPlaylist(name); setShowName(false); if (id) router.push(`/playlist/${id}`); }} />
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8, marginBottom: 22 },
  summary: { flexDirection: 'row', backgroundColor: '#1F172A', borderRadius: 18, borderWidth: 1, borderColor: '#3E2B4F', paddingVertical: 20 },
  stat: { flex: 1, alignItems: 'center' }, statNumber: { color: colors.white, fontSize: 22, fontWeight: '700' }, statLabel: { color: colors.muted, fontSize: 11, marginTop: 3 }, divider: { width: 1, backgroundColor: colors.line },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 }, actionPrimary: { flex: 1, backgroundColor: colors.lavender, height: 44, borderRadius: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 }, actionPrimaryText: { color: '#1B1025', fontWeight: '800', fontSize: 12 },
  actionSecondary: { flex: 1, borderWidth: 1, borderColor: '#6C4A83', height: 44, borderRadius: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 }, actionSecondaryText: { color: colors.lavender, fontWeight: '700', fontSize: 12 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 25 }, tab: { backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 9, borderWidth: 1, borderColor: colors.line }, selectedTab: { backgroundColor: '#3E2A52', borderColor: '#8E68AA' }, tabText: { color: colors.muted, fontSize: 11, fontWeight: '600' }, selectedText: { color: colors.white },
  playlistRow: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 11, padding: 7, borderRadius: 14, backgroundColor: '#191520' },
  playlistName: { color: colors.white, fontWeight: '600', fontSize: 14 }, playlistCount: { color: colors.muted, fontSize: 11, marginTop: 4 },
});
