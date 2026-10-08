import React, { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { artFor, colors } from '../lib/theme';
import { formatTime } from '../lib/format';
import { useLuna } from '../context/LunaContext';
import { useMusicStore } from '../store/useMusicStore';
import { toCloudTrack } from '../types/music';

const labelForIcon = name => String(name || 'button').replace(/-outline$/, '').replace(/-/g, ' ');

export function Screen({ children, scroll = true, style, safeTop = true }) {
  const insets = useSafeAreaInsets();
  const safeStyle = { paddingTop: safeTop ? Math.max(insets.top + 8, 22) : 0, paddingBottom: 160 + insets.bottom };
  return <LinearGradient colors={['#20132D', '#0F0A17', colors.background]} locations={[0, 0.32, 0.72]} style={styles.screen}>
    {scroll ? <ScrollView contentContainerStyle={[styles.content, safeStyle, style]} showsVerticalScrollIndicator={false}>{children}</ScrollView>
      : <View style={[styles.content, safeStyle, { flex: 1 }, style]}>{children}</View>}
  </LinearGradient>;
}

export function IconButton({ name, onPress, color = colors.white, size = 22, style, accessibilityLabel }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || labelForIcon(name)} onPress={event => { event.stopPropagation(); onPress?.(event); }} hitSlop={6} style={[styles.iconButton, style]}>
    <Ionicons name={name} size={size} color={color} />
  </Pressable>;
}

export function SectionTitle({ title, action, onPress }) {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text>{action ? <Pressable accessibilityRole="button" accessibilityLabel={`${action}, ${title}`} onPress={onPress}><Text style={styles.sectionAction}>{action}</Text></Pressable> : null}</View>;
}

export function Cover({ index = 0, uri, size = 56, radius = 12, style }) {
  const [failed, setFailed] = useState(false);
  React.useEffect(() => setFailed(false), [uri]);
  const source = uri && !failed ? { uri } : artFor(index);
  return <Image source={source} onError={() => setFailed(true)} style={[{ width: size, height: size, borderRadius: radius, backgroundColor: colors.raised }, style]} />;
}

export function TrackRow({ track, tracks, trailing = true, onPress, onMore }) {
  const { playTrack, liked, toggleLike } = useLuna();
  const provider = track.source === 'audius' ? 'Audius'
    : track.source === 'piped' ? 'Piped'
      : track.source === 'jamendo' ? 'Jamendo'
        : track.source === 'archive' ? 'Internet Archive'
    : track.source === 'soundcloud' ? 'SoundCloud'
      : track.source === 'spotify' ? 'Spotify'
        : track.source === 'local' ? 'On device' : null;
  const playbackType = track.playback_type === 'preview' ? 'Preview' : null;
  const availability = track.playable === 0 || track.source === 'unresolved' ? 'Unavailable' : null;
  const details = [track.artist, playbackType, track.duration ? formatTime(track.duration) : null, availability].filter(Boolean).join(' · ');
  return <Pressable accessibilityRole="button" accessibilityLabel={`Play ${track.title} by ${track.artist}`} style={styles.trackRow} onPress={onPress || (() => playTrack(track, tracks))}>
    <Cover index={track.artwork} uri={track.artwork_url} size={54} radius={10} />
    <View style={styles.trackText}><View style={styles.trackTitleLine}><Text style={[styles.trackTitle, { flex: 1 }]} numberOfLines={1}>{track.title}</Text>{provider && <View style={styles.sourceBadge}><Text style={styles.sourceBadgeText}>{provider}</Text></View>}</View>
      <Text style={styles.trackArtist} numberOfLines={1}>{details}</Text></View>
    {trailing && <IconButton accessibilityLabel={liked.includes(track.id) ? `Unlike ${track.title}` : `Like ${track.title}`} name={liked.includes(track.id) ? 'heart' : 'heart-outline'} color={liked.includes(track.id) ? colors.rose : colors.muted} size={20} onPress={() => toggleLike(track)} />}
    {onMore && <IconButton accessibilityLabel={`More actions for ${track.title}`} name="ellipsis-vertical" color={colors.muted} size={18} onPress={onMore} />}
  </Pressable>;
}

export function EmptyState({ icon = 'musical-notes-outline', title, detail, action, onPress }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name={icon} size={27} color={colors.lavender} /></View>
    <Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text>
    {action && <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={onPress}><Text style={styles.primaryText}>{action}</Text></Pressable>}</View>;
}

export function NameModal({ visible, title, value = '', onCancel, onSave }) {
  const [name, setName] = useState(value);
  React.useEffect(() => { if (visible) setName(value); }, [visible, value]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.modalScrim}><View style={styles.modalCard}>
      <Text style={styles.modalTitle}>{title}</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Playlist name" placeholderTextColor={colors.muted} style={styles.input} autoFocus maxLength={80} onSubmitEditing={() => name.trim() && onSave(name.trim())} />
      <View style={styles.modalActions}><Pressable onPress={onCancel}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable onPress={() => name.trim() && onSave(name.trim())}><Text style={styles.save}>Save</Text></Pressable></View>
    </View></View>
  </Modal>;
}

export function PlaylistPicker({ track, onClose }) {
  const { playlists, addToPlaylist, addToQueue, createPlaylist } = useLuna();
  const cloudPlaylists = useMusicStore(state => state.cloudPlaylists);
  const addCloudTrack = useMusicStore(state => state.addCloudTrack);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const add = async playlistId => {
    if (adding) return;
    setAdding(true);
    try { await addToPlaylist(playlistId, track); onClose(); }
    catch (cause) { Alert.alert('Could not add song', cause.message); }
    finally { setAdding(false); }
  };
  return <Modal visible={!!track} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.modalScrim}><View style={styles.pickerCard}>
      <View style={styles.pickerHeader}><Text style={styles.modalTitle}>Add to playlist</Text><IconButton name="close" onPress={onClose} /></View>
      <Pressable style={styles.pickerRow} onPress={() => { addToQueue(track); onClose(); }}><Ionicons name="list-outline" color={colors.lavender} size={23} /><Text style={styles.trackTitle}>Add to queue</Text></Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 }}><TextInput accessibilityLabel="New playlist name" value={newName} onChangeText={setNewName} placeholder="New playlist name" placeholderTextColor={colors.muted} maxLength={80} style={[styles.input, { flex: 1 }]} /><Pressable disabled={adding || !newName.trim()} accessibilityRole="button" onPress={async () => { if (adding) return; setAdding(true); try { const id = await createPlaylist(newName); if (id) { await addToPlaylist(id, track); setNewName(''); onClose(); } } catch (cause) { Alert.alert('Could not create playlist', cause.message); } finally { setAdding(false); } }}><Text style={styles.save}>Create</Text></Pressable></View>
      <ScrollView>{playlists.length ? playlists.map(list => <Pressable disabled={adding} key={list.id} style={styles.pickerRow} onPress={() => add(list.id)}>
        <Cover index={list.artwork} size={44} /><Text style={styles.trackTitle}>{list.name}</Text><Ionicons name="add" color={colors.lavender} size={22} /></Pressable>)
        : <Text style={styles.emptyDetail}>Name a local playlist above, or choose a cloud playlist below.</Text>}</ScrollView>
      {!!cloudPlaylists.length && <ScrollView style={{ maxHeight: 180 }}><Text style={[styles.emptyDetail, { textAlign: 'left', marginBottom: 4 }]}>CLOUD PLAYLISTS</Text>{cloudPlaylists.map(list => <Pressable disabled={adding || !toCloudTrack(track || {})} key={list.id} style={styles.pickerRow} onPress={async () => { const cloudTrack = toCloudTrack(track); if (!cloudTrack) return; setAdding(true); try { await addCloudTrack(list.id, cloudTrack); onClose(); } catch (cause) { Alert.alert('Cloud playlist', cause.message); } finally { setAdding(false); } }}><Ionicons name="cloud-outline" size={22} color={colors.lavender} /><Text style={styles.trackTitle}>{list.name}</Text><Ionicons name="add" color={colors.lavender} size={22} /></Pressable>)}</ScrollView>}
    </View></View>
  </Modal>;
}

export const ui = StyleSheet.create({
  eyebrow: { color: colors.lavender, fontSize: 11, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase' },
  heading: { color: colors.white, fontSize: 30, fontWeight: '700', letterSpacing: -1 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: '#2A2234' },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 160, width: '100%', maxWidth: 520, alignSelf: 'center' },
  iconButton: { alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 30, marginBottom: 14 },
  sectionTitle: { color: colors.white, fontWeight: '700', fontSize: 18 },
  sectionAction: { color: colors.muted, fontSize: 12 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 67 },
  trackText: { flex: 1, minWidth: 0 },
  trackTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trackTitle: { color: colors.white, fontSize: 14, fontWeight: '600' },
  sourceBadge: { backgroundColor: '#342543', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  sourceBadgeText: { color: colors.lavender, fontSize: 9, fontWeight: '700' },
  trackArtist: { color: colors.muted, fontSize: 12, marginTop: 3 },
  empty: { paddingHorizontal: 24, paddingVertical: 28, alignItems: 'center', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: colors.line },
  emptyIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#2A1D39', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emptyTitle: { color: colors.white, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptyDetail: { color: colors.muted, lineHeight: 19, textAlign: 'center', marginTop: 6, marginBottom: 16, fontSize: 12 },
  primaryButton: { backgroundColor: colors.lavender, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 },
  primaryText: { color: '#190F23', fontWeight: '800', fontSize: 13 },
  modalScrim: { flex: 1, backgroundColor: '#000A', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.surface, borderRadius: 22, padding: 22, borderWidth: 1, borderColor: colors.line },
  modalTitle: { color: colors.white, fontSize: 19, fontWeight: '700', marginBottom: 16 },
  input: { color: colors.white, backgroundColor: colors.raised, borderRadius: 13, paddingHorizontal: 15, height: 50, borderWidth: 1, borderColor: colors.line },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 28, marginTop: 23 },
  cancel: { color: colors.muted, fontWeight: '600' }, save: { color: colors.lavender, fontWeight: '700' },
  pickerCard: { backgroundColor: colors.surface, borderRadius: 22, padding: 22, marginTop: 'auto', marginBottom: 18, maxHeight: '70%' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
});
