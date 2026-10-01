import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLuna } from '../context/LunaContext';
import { colors } from '../lib/theme';
import { Cover } from './UI';

export default function MiniPlayer() {
  const router = useRouter();
  const { current, status, togglePlay } = useLuna();
  if (!current) return null;
  const progress = status.duration ? Math.min(100, (status.currentTime / status.duration) * 100) : 0;
  return <View style={styles.wrap}><Pressable style={styles.bar} onPress={() => router.push('/player')}>
    <Cover index={current.artwork} size={42} radius={8} />
    <View style={styles.meta}><Text style={styles.title} numberOfLines={1}>{current.title}</Text><Text style={styles.artist} numberOfLines={1}>{current.artist}</Text></View>
    <Pressable style={styles.play} onPress={event => { event.stopPropagation(); togglePlay(); }}><Ionicons name={status.playing ? 'pause' : 'play'} size={22} color={colors.white} /></Pressable>
    <View style={styles.progress}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
  </Pressable></View>;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 10, right: 10, bottom: 74 },
  bar: { height: 62, backgroundColor: '#291D38', borderRadius: 14, borderWidth: 1, borderColor: '#60466D', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, overflow: 'hidden' },
  meta: { flex: 1, minWidth: 0 }, title: { color: colors.white, fontSize: 13, fontWeight: '700' }, artist: { color: colors.muted, fontSize: 11, marginTop: 3 },
  play: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  progress: { height: 2, backgroundColor: colors.line, position: 'absolute', left: 0, right: 0, bottom: 0 },
  progressFill: { height: 2, backgroundColor: colors.lavender },
});
