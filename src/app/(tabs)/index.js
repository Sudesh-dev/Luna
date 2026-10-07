import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Cover, EmptyState, IconButton, Screen, SectionTitle, TrackRow, ui } from '../../components/UI';
import { useLuna } from '../../context/LunaContext';
import { artFor, colors } from '../../lib/theme';
import { greeting } from '../../lib/format';

const moods = [
  { title: 'Night Drive', subtitle: 'Find your after-hours sound', art: 0, query: 'night' },
  { title: 'Moonlight Focus', subtitle: 'A quieter kind of energy', art: 1, query: 'focus' },
  { title: 'Slow Hours', subtitle: 'Stay in the moment', art: 2, query: 'chill' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { tracks, playlists, playlistTracks, liked, history, error } = useLuna();
  const favorites = liked.slice(0, 4).map(id => tracks.find(track => track.id === id)).filter(Boolean);
  const recent = [...new Set(history.map(item => item.track_id))].slice(0, 4).map(id => tracks.find(track => track.id === id)).filter(Boolean);
  return <Screen><View style={styles.header}>
    <View><Text style={ui.eyebrow}>{greeting()}</Text><Text style={styles.logo}>L U N A <Text style={styles.moon}>☾</Text></Text><Text style={styles.tagline}>MUSIC UNDER YOUR MOON</Text></View>
    <IconButton name="settings-outline" onPress={() => router.push('/settings')} color={colors.lavender} />
  </View>
  <Pressable style={styles.search} onPress={() => router.push('/search')}><Ionicons name="search-outline" color={colors.muted} size={20} /><Text style={styles.searchText}>Search songs, artists, albums...</Text></Pressable>
  <SectionTitle title="Made For You" />
  {favorites.length ? favorites.map(track => <TrackRow key={track.id} track={track} tracks={favorites} />) : <Text style={ui.body}>Like a song and your favorites will find a home here.</Text>}
  <SectionTitle title="Discover by mood" />
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} style={{ marginHorizontal: -22, paddingHorizontal: 22 }}>
    {moods.map(item => <Pressable key={item.title} style={styles.moodCard} onPress={() => router.push({ pathname: '/search', params: { q: item.query } })}>
      <Image source={artFor(item.art)} style={styles.moodImage} resizeMode="cover" />
      <View style={styles.moodShade}><Text style={styles.moodTitle}>{item.title}</Text><Text style={styles.moodSubtitle}>{item.subtitle}</Text></View>
    </Pressable>)}
  </ScrollView>
  <SectionTitle title="Recently played" action={recent.length ? 'See all' : undefined} onPress={() => router.push('/library')} />
  {recent.length ? recent.map(track => <TrackRow key={track.id} track={track} tracks={recent} />)
    : <EmptyState icon="time-outline" title="Your story starts here" detail="Search Audius, press play, and your recent tracks will appear here." action="Search music" onPress={() => router.push('/search')} />}
  <SectionTitle title="Your playlists" action="View library" onPress={() => router.push('/library')} />
  {playlists.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} style={{ marginHorizontal: -22, paddingHorizontal: 22 }}>
    {playlists.slice(0, 6).map(list => <Pressable key={list.id} style={styles.playlistCard} onPress={() => router.push(`/playlist/${list.id}`)}><Cover index={list.artwork} size={138} radius={13} /><Text style={styles.playlistTitle} numberOfLines={1}>{list.name}</Text><Text style={styles.playlistCount}>{playlistTracks.filter(row => row.playlist_id === list.id).length} songs</Text></Pressable>)}
  </ScrollView> : <Pressable style={styles.newPlaylist} onPress={() => router.push('/library')}><Ionicons name="add-circle-outline" color={colors.lavender} size={25} /><Text style={styles.newTitle}>Create your first playlist</Text><Ionicons name="chevron-forward" color={colors.muted} size={18} /></Pressable>}
  {error ? <Text style={styles.error}>{error}</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 8, marginBottom: 25 },
  logo: { color: colors.white, fontSize: 31, letterSpacing: 3, fontWeight: '300', marginTop: 6 },
  moon: { color: colors.lavender, fontSize: 34 }, tagline: { color: colors.rose, letterSpacing: 2.8, fontSize: 9, marginTop: 1 },
  search: { backgroundColor: '#25202D', height: 48, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: '#34283F' },
  searchText: { color: colors.muted, fontSize: 13 },
  moodCard: { width: 174, height: 185, borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden' },
  moodImage: { width: 174, height: 185, position: 'absolute' }, moodShade: { flex: 1, justifyContent: 'flex-end', padding: 14, paddingTop: 40, backgroundColor: '#09070D55' },
  moodTitle: { color: colors.white, fontSize: 16, fontWeight: '700' }, moodSubtitle: { color: '#E2D6EB', fontSize: 10, marginTop: 4 },
  playlistCard: { width: 138 }, playlistTitle: { color: colors.white, fontSize: 13, fontWeight: '600', marginTop: 9 }, playlistCount: { color: colors.muted, fontSize: 11, marginTop: 3 },
  newPlaylist: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  newTitle: { color: colors.white, fontWeight: '600', flex: 1 }, error: { color: '#FFB1B1', marginTop: 20 },
});
