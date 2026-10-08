import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Cover, EmptyState, IconButton, NameModal, Screen, SectionTitle, TrackRow, ui } from '../../components/UI';
import { useLuna } from '../../context/LunaContext';
import { colors } from '../../lib/theme';
import { useMusicStore } from '../../store/useMusicStore';

export default function LibraryScreen() {
  const router = useRouter();
  const { tracks, playlists, playlistTracks, liked, history, createPlaylist, importAudio } = useLuna();
  const [showName, setShowName] = useState(false);
  const [showCloudName, setShowCloudName] = useState(false);
  const [section, setSection] = useState('Playlists');
  const session = useMusicStore(state => state.session);
  const cloudPlaylists = useMusicStore(state => state.cloudPlaylists);
  const cloudLoading = useMusicStore(state => state.cloudLoading);
  const cloudError = useMusicStore(state => state.cloudError);
  const createCloudPlaylist = useMusicStore(state => state.createCloudPlaylist);
  const refreshCloudPlaylists = useMusicStore(state => state.refreshCloudPlaylists);
  const likedTracks = liked.map(id => tracks.find(track => track.id === id)).filter(Boolean);
  const recentTracks = [...new Set(history.map(item => item.track_id))].map(id => tracks.find(track => track.id === id)).filter(Boolean);
  return <Screen><View style={styles.header}><View><Text style={ui.eyebrow}>YOUR PERSONAL SPACE</Text><Text style={[ui.heading, { marginTop: 5 }]}>Library</Text></View><IconButton name="settings-outline" color={colors.lavender} onPress={() => router.push('/settings')} /></View>
    <View style={styles.summary}><View style={styles.stat}><Text style={styles.statNumber}>{tracks.length}</Text><Text style={styles.statLabel}>Songs</Text></View><View style={styles.divider} /><View style={styles.stat}><Text style={styles.statNumber}>{playlists.length}</Text><Text style={styles.statLabel}>Playlists</Text></View><View style={styles.divider} /><View style={styles.stat}><Text style={styles.statNumber}>{liked.length}</Text><Text style={styles.statLabel}>Liked</Text></View></View>
    <View style={styles.actions}><Pressable style={styles.actionPrimary} onPress={importAudio}><Ionicons name="add" color="#1B1025" size={20} /><Text style={styles.actionPrimaryText}>Import audio</Text></Pressable><Pressable style={styles.actionSecondary} onPress={() => setShowName(true)}><Ionicons name="add" color={colors.lavender} size={20} /><Text style={styles.actionSecondaryText}>Playlist</Text></Pressable></View>
    <Pressable accessibilityRole="button" style={[styles.playlistRow, { marginTop: 15, padding: 15 }]} onPress={() => router.push('/import')}><Ionicons name="download-outline" size={23} color={colors.lavender} /><View style={{ flex: 1 }}><Text style={styles.playlistName}>Import a playlist</Text><Text style={styles.playlistCount}>Spotify, SoundCloud, or a shared LUNA file</Text></View><Ionicons name="chevron-forward" color={colors.muted} size={19} /></Pressable>
    <View style={styles.tabs}>{['Playlists', 'Cloud', 'Imported', 'Liked Songs', 'Recently Played', 'All Songs'].map(item => <Pressable key={item} onPress={() => setSection(item)} style={[styles.tab, section === item && styles.selectedTab]}><Text style={[styles.tabText, section === item && styles.selectedText]}>{item}</Text></Pressable>)}</View>
    {section === 'Cloud' && <><SectionTitle title="Cloud playlists" action={session ? '+ New' : 'Sign in'} onPress={() => session ? setShowCloudName(true) : router.push('/account')} />
      {!session ? <EmptyState icon="cloud-outline" title="Sync playlists" detail="Sign in to save playlists to your free Supabase project. Your local music remains available." action="Sign in or register" onPress={() => router.push('/account')} />
        : <>{cloudLoading && <Text style={styles.playlistCount}>Refreshing cloud playlists...</Text>}{!!cloudError && <Pressable onPress={() => refreshCloudPlaylists().catch(() => {})}><Text style={styles.playlistCount}>{cloudError} · Tap to retry</Text></Pressable>}
          {cloudPlaylists.length ? cloudPlaylists.map(list => <Pressable key={list.id} style={styles.playlistRow} onPress={() => router.push(`/cloud/${list.id}`)}><Ionicons name="cloud-outline" size={27} color={colors.lavender} /><View style={{ flex: 1 }}><Text style={styles.playlistName}>{list.name}</Text><Text style={styles.playlistCount}>{list.tracks.length} songs</Text></View><Ionicons name="chevron-forward" color={colors.muted} size={19} /></Pressable>)
            : !cloudLoading && <EmptyState icon="albums-outline" title="No cloud playlists yet" detail="Create one here, then add songs from Search." action="Create cloud playlist" onPress={() => setShowCloudName(true)} />}</>}
    </>}
    {section === 'Playlists' && <><SectionTitle title="Your playlists" action="+ New" onPress={() => setShowName(true)} />
      {playlists.length ? playlists.map(list => <Pressable key={list.id} style={styles.playlistRow} onPress={() => router.push(`/playlist/${list.id}`)}><Cover index={list.artwork} size={62} /><View style={{ flex: 1 }}><Text style={styles.playlistName}>{list.name}</Text><Text style={styles.playlistCount}>{playlistTracks.filter(row => row.playlist_id === list.id).length} songs</Text></View><Ionicons name="chevron-forward" color={colors.muted} size={19} /></Pressable>)
        : <EmptyState icon="albums-outline" title="Make a little space for music" detail="Create playlists for late drives, quiet focus, and every mood in between." action="Create playlist" onPress={() => setShowName(true)} />}</>}
    {section === 'Liked Songs' && <><SectionTitle title="Liked Songs" />{likedTracks.length ? likedTracks.map(track => <TrackRow key={track.id} track={track} tracks={likedTracks} />) : <EmptyState icon="heart-outline" title="Nothing liked yet" detail="Tap the heart beside a song to keep it close." />}</>}
    {section === 'Imported' && <><SectionTitle title="Imported Playlists" />{playlists.some(list => list.imported_from) ? playlists.filter(list => list.imported_from).map(list => <Pressable key={list.id} style={styles.playlistRow} onPress={() => router.push(`/playlist/${list.id}`)}><Cover index={list.artwork} size={62} /><View style={{ flex: 1 }}><Text style={styles.playlistName}>{list.name}</Text><Text style={styles.playlistCount}>{playlistTracks.filter(row => row.playlist_id === list.id).length} songs · {list.pending_count} awaiting review</Text></View><Ionicons name="chevron-forward" color={colors.muted} size={19} /></Pressable>) : <EmptyState icon="download-outline" title="Bring your playlists along" detail="Match a track list to Audius and keep it on your device." action="Import playlist" onPress={() => router.push('/import')} />}</>}
    {section === 'Recently Played' && <><SectionTitle title="Recently Played" />{recentTracks.length ? recentTracks.map(track => <TrackRow key={track.id} track={track} tracks={recentTracks} />) : <EmptyState icon="time-outline" title="Nothing played yet" detail="Your listening history stays on this device." />}</>}
    {section === 'All Songs' && <><SectionTitle title="All Songs" />{tracks.length ? tracks.map(track => <TrackRow key={track.id} track={track} tracks={tracks} />) : <EmptyState icon="musical-notes-outline" title="No songs yet" detail="Import audio files from your device to begin." action="Import audio" onPress={importAudio} />}</>}
    <NameModal visible={showName} title="New playlist" onCancel={() => setShowName(false)} onSave={async name => { const id = await createPlaylist(name); setShowName(false); if (id) router.push(`/playlist/${id}`); }} />
    <NameModal visible={showCloudName} title="New cloud playlist" onCancel={() => setShowCloudName(false)} onSave={async name => { try { const id = await createCloudPlaylist(name); setShowCloudName(false); router.push(`/cloud/${id}`); } catch (cause) { Alert.alert('Cloud playlist', cause.message); } }} />
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
