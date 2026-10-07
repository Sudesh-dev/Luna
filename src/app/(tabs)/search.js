import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Cover, EmptyState, PlaylistPicker, Screen, SectionTitle, TrackRow, ui } from '../../components/UI';
import { useLuna } from '../../context/LunaContext';
import { colors } from '../../lib/theme';
import { cachedAudiusSearch, searchAudiusTracks } from '../../services/audius';

const DEBOUNCE_MS = 350;
const PROVIDER_OPTIONS = [
  { id: 'all', label: 'Audius + library', icon: 'sparkles-outline', detail: 'Audius and saved songs' },
  { id: 'audius', label: 'Audius', icon: 'musical-notes-outline', detail: 'Ready' },
  { id: 'local', label: 'On device', icon: 'phone-portrait-outline', detail: 'Offline library' },
];

const sameSourceTrack = (left, right) => left.source && left.source === right.source
  && left.source_id && left.source_id === right.source_id;

export default function SearchScreen() {
  const { q } = useLocalSearchParams();
  const router = useRouter();
  const { tracks, playlists, importAudio } = useLuna();
  const [query, setQuery] = useState(typeof q === 'string' ? q : '');
  const [filter, setFilter] = useState('Songs');
  const [selectedProvider, setSelectedProvider] = useState('audius');
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [remoteTracks, setRemoteTracks] = useState([]);
  const [searchState, setSearchState] = useState('idle');
  const [searchError, setSearchError] = useState('');
  const [searchWarning, setSearchWarning] = useState('');
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const search = query.trim().toLocaleLowerCase();
  const selectedProviderOption = PROVIDER_OPTIONS.find(option => option.id === selectedProvider) || PROVIDER_OPTIONS[0];
  useEffect(() => { if (typeof q === 'string') setQuery(q); }, [q]);

  useEffect(() => {
    if (search.length < 2) {
      setRemoteTracks([]);
      setSearchState('idle');
      setSearchError('');
      setSearchWarning('');
      return undefined;
    }

    let controller;
    const cached = selectedProvider !== 'local' ? cachedAudiusSearch(query) : null;
    setRemoteTracks(cached || []);
    setSearchState(cached ? 'success' : 'debouncing');
    setSearchError('');
    setSearchWarning('');
    const timer = setTimeout(async () => {
      controller = new AbortController();
      setSearchState('loading');
      try {
        const providers = [];
        if (selectedProvider === 'all' || selectedProvider === 'audius') {
          providers.push({ name: 'Audius', request: searchAudiusTracks(query, { signal: controller.signal }) });
        }
        if (!providers.length) {
          setRemoteTracks([]);
          setSearchState('success');
          return;
        }
        const settled = await Promise.allSettled(providers.map(provider => provider.request));
        if (controller.signal.aborted) return;
        const results = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
        const unavailableProviders = settled.map((result, index) => result.status === 'rejected' ? providers[index].name : null).filter(Boolean);
        if (!results.length && unavailableProviders.length === providers.length) {
          const firstError = settled.find(result => result.status === 'rejected')?.reason;
          throw firstError || new Error('Music search failed. Please try again.');
        }
        setRemoteTracks(results);
        setSearchWarning(unavailableProviders.length ? `${unavailableProviders.join(' and ')} could not be reached. Showing results from available providers.` : '');
        setSearchState('success');
      } catch (cause) {
        if (cause?.name === 'AbortError') return;
        setRemoteTracks([]);
        setSearchError(cause?.message || 'Music search failed. Please try again.');
        setSearchState('error');
      }
    }, cached ? 0 : DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller?.abort();
    };
  }, [query, retryCount, search, selectedProvider]);

  const hydratedRemoteTracks = useMemo(() => remoteTracks.map(remoteTrack => {
    const storedTrack = tracks.find(track => sameSourceTrack(track, remoteTrack));
    return storedTrack ? { ...remoteTrack, id: storedTrack.id } : remoteTrack;
  }), [remoteTracks, tracks]);

  const results = useMemo(() => {
    const localMatches = tracks.filter(track => {
      const matchesProvider = selectedProvider === 'all'
        || (selectedProvider === 'local' ? track.source === 'local' : track.source === selectedProvider);
      const matchesQuery = !search || `${track.title} ${track.artist} ${track.album_title || ''}`.toLocaleLowerCase().includes(search);
      return matchesProvider && matchesQuery;
    });
    if (!search) return localMatches;
    const newRemoteTracks = hydratedRemoteTracks.filter(remoteTrack => !localMatches.some(localTrack => sameSourceTrack(localTrack, remoteTrack)));
    return [...localMatches, ...newRemoteTracks];
  }, [hydratedRemoteTracks, search, selectedProvider, tracks]);

  const artistNames = [...new Set(results.map(track => track.artist))];
  const albums = [...new Map(results.filter(track => track.album_title).map(track => [`${track.artist}:${track.album_title}`, track])).values()];
  const playlistResults = playlists.filter(list => !search || list.name.toLocaleLowerCase().includes(search));
  return <Screen><Text style={ui.eyebrow}>DISCOVER YOUR COLLECTION</Text><Text style={[ui.heading, { marginTop: 5, marginBottom: 22 }]}>Search</Text>
    <View style={styles.searchControls}>
      <View style={styles.searchBox}><Ionicons name="search" size={20} color={colors.lavender} /><TextInput value={query} onChangeText={setQuery} placeholder="Search music..." placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" returnKeyType="search" />
        {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')}><Ionicons name="close-circle" size={19} color={colors.muted} /></Pressable>}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Music source, ${selectedProviderOption.label}`} accessibilityState={{ expanded: providerMenuOpen }} style={[styles.providerButton, providerMenuOpen && styles.providerButtonOpen]} onPress={() => setProviderMenuOpen(open => !open)}>
        <Ionicons name={selectedProviderOption.icon} size={17} color={colors.lavender} />
        <Text style={styles.providerButtonText} numberOfLines={1}>{selectedProviderOption.label}</Text>
        <Ionicons name={providerMenuOpen ? 'chevron-up' : 'chevron-down'} size={15} color={colors.muted} />
      </Pressable>
    </View>
    {providerMenuOpen && <View style={styles.providerMenu}>{PROVIDER_OPTIONS.map(option => {
      const disabled = false;
      const detail = option.detail;
      return <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ disabled, selected: selectedProvider === option.id }} disabled={disabled} style={[styles.providerOption, disabled && styles.providerOptionDisabled]} onPress={() => { setSelectedProvider(option.id); setProviderMenuOpen(false); }}>
        <View style={styles.providerIcon}><Ionicons name={option.icon} size={19} color={disabled ? '#5E5865' : colors.lavender} /></View>
        <View style={styles.providerOptionText}><Text style={[styles.providerName, disabled && styles.disabledText]}>{option.label}</Text><Text style={[styles.providerDetail, disabled && styles.disabledText]}>{detail}</Text></View>
        {selectedProvider === option.id && <Ionicons name="checkmark-circle" size={20} color={colors.lavender} />}
      </Pressable>;
    })}</View>}
    <View style={styles.filters}>{['Songs', 'Artists', 'Albums', 'Playlists'].map(item => <Pressable key={item} style={[styles.chip, filter === item && styles.activeChip]} onPress={() => setFilter(item)}><Text style={[styles.chipText, filter === item && styles.activeText]}>{item}</Text></Pressable>)}</View>
    {searchState === 'loading' && <View style={styles.loading}><ActivityIndicator color={colors.lavender} /><Text style={styles.loadingText}>Searching {selectedProviderOption.label.toLocaleLowerCase()}...</Text></View>}
    {searchState === 'error' && <View style={styles.errorBanner}><Ionicons name="cloud-offline-outline" size={19} color="#FFB7C9" /><View style={{ flex: 1 }}><Text style={styles.errorTitle}>Internet search unavailable</Text><Text style={styles.errorText}>{searchError}</Text></View><Pressable accessibilityRole="button" onPress={() => setRetryCount(value => value + 1)}><Text style={styles.retry}>Retry</Text></Pressable></View>}
    {!!searchWarning && <View style={styles.warningBanner}><Ionicons name="information-circle-outline" size={19} color={colors.lavender} /><Text style={styles.warningText}>{searchWarning}</Text></View>}
    {filter === 'Songs' && (results.length ? <><SectionTitle title={search ? `${results.length} ${selectedProviderOption.label} results` : `${selectedProviderOption.label} songs`} />{results.map(track => <TrackRow key={`${track.source}-${track.id}`} track={track} tracks={results} onMore={() => setSelectedTrack(track)} />)}</>
      : <EmptyState icon="musical-notes-outline" title={searchState === 'success' ? `No ${selectedProviderOption.label} songs found` : 'Search real music'} detail={searchState === 'success' ? 'Try another song title, artist, genre, mood, or music source.' : 'Enter at least two characters, then choose which connected source to search.'} action={!search && selectedProvider === 'local' ? 'Import audio' : undefined} onPress={importAudio} />)}
    {filter === 'Artists' && (artistNames.length ? <><SectionTitle title="Artists" />{artistNames.map((artist, index) => <Pressable key={artist} style={styles.artistRow} onPress={() => { setFilter('Songs'); setQuery(artist); }}><Cover index={index} size={52} radius={26} /><Text style={styles.artistName}>{artist}</Text><Ionicons name="chevron-forward" size={19} color={colors.muted} /></Pressable>)}</>
      : <EmptyState icon="person-outline" title="No artists found" detail="Search for an artist to discover music." />)}
    {filter === 'Albums' && (albums.length ? <><SectionTitle title="Albums" />{albums.map(track => <Pressable key={`${track.artist}-${track.album_title}`} style={styles.artistRow} onPress={() => { setFilter('Songs'); setQuery(`${track.artist} ${track.album_title}`); }}><Cover index={track.artwork} uri={track.artwork_url} size={52} /><View style={{ flex: 1 }}><Text style={styles.artistName}>{track.album_title}</Text><Text style={styles.albumArtist}>{track.artist}</Text></View><Ionicons name="chevron-forward" size={19} color={colors.muted} /></Pressable>)}</>
      : <EmptyState icon="disc-outline" title="No albums found" detail="Album information will appear when the provider supplies it." />)}
    {filter === 'Playlists' && (playlistResults.length ? <><SectionTitle title="Playlists" />{playlistResults.map(list => <Pressable key={list.id} style={styles.artistRow} onPress={() => router.push(`/playlist/${list.id}`)}><Cover index={list.artwork} size={52} /><Text style={styles.artistName}>{list.name}</Text><Ionicons name="chevron-forward" size={19} color={colors.muted} /></Pressable>)}</>
      : <EmptyState icon="albums-outline" title="No playlists found" detail="Create one in your Library to see it here." action="Open Library" onPress={() => router.push('/library')} />)}
    <View style={styles.sourceNote}><Ionicons name="musical-note-outline" color={colors.lavender} size={18} /><Text style={styles.sourceText}>{selectedProvider === 'local' ? 'Showing audio stored in your local LUNA library.' : `Searching ${selectedProviderOption.label}. Availability depends on each artist, region, and provider.`}</Text></View>
    <PlaylistPicker track={selectedTrack} onClose={() => setSelectedTrack(null)} />
  </Screen>;
}

const styles = StyleSheet.create({
  searchControls: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchBox: { flex: 1, height: 52, borderRadius: 15, backgroundColor: '#25202D', borderWidth: 1, borderColor: '#443153', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  input: { flex: 1, color: colors.white, fontSize: 14 },
  providerButton: { width: 118, height: 52, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  providerButtonOpen: { borderColor: colors.lavender, backgroundColor: '#251C30' },
  providerButtonText: { color: colors.white, flex: 1, fontSize: 11, fontWeight: '700' },
  providerMenu: { alignSelf: 'flex-end', width: 242, backgroundColor: '#1B1622', borderRadius: 18, borderWidth: 1, borderColor: '#443153', padding: 7, marginTop: 8 },
  providerOption: { minHeight: 57, borderRadius: 13, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  providerOptionDisabled: { opacity: 0.55 },
  providerIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#2A2034', alignItems: 'center', justifyContent: 'center' },
  providerOptionText: { flex: 1 }, providerName: { color: colors.white, fontSize: 13, fontWeight: '700' }, providerDetail: { color: colors.muted, fontSize: 10, marginTop: 2 }, disabledText: { color: '#77707E' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18, marginBottom: 12 }, chip: { borderRadius: 20, backgroundColor: colors.surface, paddingHorizontal: 15, paddingVertical: 9, borderWidth: 1, borderColor: colors.line }, activeChip: { backgroundColor: colors.lavender, borderColor: colors.lavender }, chipText: { color: colors.muted, fontSize: 12, fontWeight: '600' }, activeText: { color: '#201429' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 }, loadingText: { color: colors.muted, fontSize: 12 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#2A1722', borderRadius: 14, borderWidth: 1, borderColor: '#633245', padding: 13, marginTop: 12 }, errorTitle: { color: colors.white, fontSize: 12, fontWeight: '700' }, errorText: { color: '#C9AEB8', fontSize: 10, marginTop: 3 }, retry: { color: colors.lavender, fontSize: 12, fontWeight: '700' },
  warningBanner: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#20182A', borderRadius: 14, padding: 12, marginTop: 12 }, warningText: { color: colors.muted, flex: 1, fontSize: 11, lineHeight: 16 },
  artistRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 8 }, artistName: { color: colors.white, fontWeight: '600', flex: 1 }, albumArtist: { color: colors.muted, fontSize: 11, marginTop: 3 },
  sourceNote: { flexDirection: 'row', gap: 8, backgroundColor: '#1B1622', padding: 15, borderRadius: 12, marginTop: 28 }, sourceText: { color: colors.muted, fontSize: 11, flex: 1, lineHeight: 16 },
});
