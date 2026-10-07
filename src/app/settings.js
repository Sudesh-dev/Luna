import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { IconButton, Screen, SectionTitle, ui } from '../components/UI';
import { useLuna } from '../context/LunaContext';
import { colors } from '../lib/theme';

function SettingRow({ icon, title, subtitle, onPress }) {
  return <Pressable style={styles.row} onPress={onPress}><View style={styles.icon}><Ionicons name={icon} size={20} color={colors.lavender} /></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>{onPress && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}</Pressable>;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { clearHistory, exportLibrary, importLibrary } = useLuna();
  const run = async action => { try { await action(); } catch (cause) { Alert.alert('Could not complete action', cause.message || 'Please try again.'); } };
  return <Screen><View style={styles.header}><IconButton name="arrow-back" onPress={() => router.back()} /><Text style={ui.heading}>Settings</Text><View style={{ width: 34 }} /></View>
    <SectionTitle title="Appearance" /><View style={styles.group}><SettingRow icon="moon-outline" title="Moonlight theme" subtitle="LUNA uses its signature dark appearance." /></View>
    <SectionTitle title="Library" /><View style={styles.group}>
      <SettingRow icon="musical-notes-outline" title="Import audio" subtitle="Keep playable copies on this device" onPress={() => router.push('/library')} />
      <SettingRow icon="document-text-outline" title="Import playlist" subtitle="Match Spotify, SoundCloud, or LUNA metadata to Audius" onPress={() => router.push('/import')} />
      <SettingRow icon="download-outline" title="Import library backup" subtitle="Restore playlists, likes, and song metadata" onPress={() => run(async () => { const imported = await importLibrary(); if (imported) Alert.alert('Library imported', 'Local audio files are not included. Provider songs remain playable when their source is connected.'); })} />
      <SettingRow icon="share-outline" title="Export library backup" subtitle="Share playlists, likes, and song metadata" onPress={() => run(exportLibrary)} />
      <SettingRow icon="time-outline" title="Clear recently played" onPress={() => Alert.alert('Clear history?', 'Your recently played list will be removed from this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => run(clearHistory) }])} />
    </View>
    <SectionTitle title="About" /><View style={styles.group}><SettingRow icon="sparkles-outline" title="LUNA" subtitle="Music under your moon · version 1.0" /><SettingRow icon="cloud-offline-outline" title="Private by design" subtitle="Your library and listening history stay on this device." /></View>
    <Text style={styles.note}>Music streams through Audius. Spotify and SoundCloud are playlist import sources. Your playlists, likes, history, and imported audio live on this device. Fresh search and streaming require internet.</Text>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7, marginBottom: 12 },
  group: { backgroundColor: colors.surface, borderRadius: 17, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 65, gap: 12, borderBottomWidth: 1, borderBottomColor: '#2A2234', paddingVertical: 8 },
  icon: { width: 37, height: 37, borderRadius: 11, backgroundColor: '#30223F', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.white, fontSize: 13, fontWeight: '600' }, subtitle: { color: colors.muted, fontSize: 10, marginTop: 3, lineHeight: 15 }, note: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 26, paddingHorizontal: 5 },
});
