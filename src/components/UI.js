import React, { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { artFor, colors } from '../lib/theme';
import { useLuna } from '../context/LunaContext';

export function Screen({ children, scroll = true, style }) {
  return <LinearGradient colors={['#20132D', '#0F0A17', colors.background]} locations={[0, 0.32, 0.72]} style={styles.screen}>
    {scroll ? <ScrollView contentContainerStyle={[styles.content, style]} showsVerticalScrollIndicator={false}>{children}</ScrollView>
      : <View style={[styles.content, { flex: 1 }, style]}>{children}</View>}
  </LinearGradient>;
}

export function IconButton({ name, onPress, color = colors.white, size = 22, style }) {
  return <Pressable onPress={onPress} hitSlop={10} style={[styles.iconButton, style]}><Ionicons name={name} size={size} color={color} /></Pressable>;
}

export function SectionTitle({ title, action, onPress }) {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text>{action ? <Pressable onPress={onPress}><Text style={styles.sectionAction}>{action}</Text></Pressable> : null}</View>;
}

export function Cover({ index = 0, size = 56, radius = 12, style }) {
  return <Image source={artFor(index)} style={[{ width: size, height: size, borderRadius: radius, backgroundColor: colors.raised }, style]} />;
}

export function TrackRow({ track, tracks, trailing = true, onPress, onMore }) {
  const { playTrack, liked, toggleLike } = useLuna();
  return <Pressable style={styles.trackRow} onPress={onPress || (() => playTrack(track, tracks))}>
    <Cover index={track.artwork} size={54} radius={10} />
    <View style={styles.trackText}><Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
      <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}{track.source === 'unresolved' ? ' · Needs audio' : ''}</Text></View>
    {trailing && <IconButton name={liked.includes(track.id) ? 'heart' : 'heart-outline'} color={liked.includes(track.id) ? colors.rose : colors.muted} size={20} onPress={() => toggleLike(track.id)} />}
    {onMore && <IconButton name="ellipsis-vertical" color={colors.muted} size={18} onPress={onMore} />}
  </Pressable>;
}

export function EmptyState({ icon = 'musical-notes-outline', title, detail, action, onPress }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name={icon} size={27} color={colors.lavender} /></View>
    <Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text>
    {action && <Pressable style={styles.primaryButton} onPress={onPress}><Text style={styles.primaryText}>{action}</Text></Pressable>}</View>;
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
  const { playlists, addToPlaylist } = useLuna();
  return <Modal visible={!!track} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.modalScrim}><View style={styles.pickerCard}>
      <View style={styles.pickerHeader}><Text style={styles.modalTitle}>Add to playlist</Text><IconButton name="close" onPress={onClose} /></View>
      {playlists.length ? playlists.map(list => <Pressable key={list.id} style={styles.pickerRow} onPress={async () => { await addToPlaylist(list.id, track.id); onClose(); }}>
        <Cover index={list.artwork} size={44} /><Text style={styles.trackTitle}>{list.name}</Text><Ionicons name="add" color={colors.lavender} size={22} /></Pressable>)
        : <Text style={styles.emptyDetail}>Create a playlist from your Library first.</Text>}
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
  content: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 160 },
  iconButton: { alignItems: 'center', justifyContent: 'center', minWidth: 34, minHeight: 34 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 30, marginBottom: 14 },
  sectionTitle: { color: colors.white, fontWeight: '700', fontSize: 18 },
  sectionAction: { color: colors.muted, fontSize: 12 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 67 },
  trackText: { flex: 1, minWidth: 0 },
  trackTitle: { color: colors.white, fontSize: 14, fontWeight: '600' },
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
