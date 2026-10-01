import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Cover, IconButton, PlaylistPicker, Screen, TrackRow, ui } from '../components/UI';
import { useLuna } from '../context/LunaContext';
import { formatTime } from '../lib/format';
import { artFor, colors } from '../lib/theme';

export default function PlayerScreen() {
  const router = useRouter();
  const { current, status, queue, liked, toggleLike, togglePlay, next, seek, shuffle, repeat, toggleShuffle, toggleRepeat, removeFromQueue, moveInQueue } = useLuna();
  const [showQueue, setShowQueue] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  if (!current) return <Screen><IconButton name="chevron-down" onPress={() => router.back()} /><Text style={ui.heading}>Nothing playing yet</Text><Text style={ui.body}>Choose a song from your library.</Text></Screen>;
  const duration = status.duration || current.duration || 0;
  return <Screen style={{ paddingBottom: 60 }}><View style={styles.top}><IconButton name="chevron-down" size={26} onPress={() => router.back()} /><View style={styles.topText}><Text style={ui.eyebrow}>NOW PLAYING</Text><Text style={styles.topLabel}>LUNA</Text></View><IconButton name="list-outline" onPress={() => setShowQueue(true)} /></View>
    <Image source={artFor(current.artwork)} style={styles.artwork} />
    <View style={styles.meta}><View style={{ flex: 1 }}><Text style={styles.title} numberOfLines={1}>{current.title}</Text><Text style={styles.artist} numberOfLines={1}>{current.artist}</Text></View><IconButton name={liked.includes(current.id) ? 'heart' : 'heart-outline'} color={liked.includes(current.id) ? colors.rose : colors.lavender} size={25} onPress={() => toggleLike(current.id)} /></View>
    <View style={styles.slider}><Slider minimumValue={0} maximumValue={Math.max(duration, 1)} value={Math.min(status.currentTime || 0, duration || 1)} onSlidingComplete={seek} minimumTrackTintColor={colors.lavender} maximumTrackTintColor={colors.line} thumbTintColor={colors.rose} />
      <View style={styles.times}><Text style={styles.time}>{formatTime(status.currentTime)}</Text><Text style={styles.time}>{formatTime(duration)}</Text></View></View>
    <View style={styles.controls}><IconButton name="shuffle" color={shuffle ? colors.lavender : colors.muted} onPress={toggleShuffle} size={22} /><IconButton name="play-skip-back" onPress={() => next(-1)} size={28} /><Pressable style={styles.playButton} onPress={togglePlay}><Ionicons name={status.playing ? 'pause' : 'play'} color="#22142D" size={31} /></Pressable><IconButton name="play-skip-forward" onPress={() => next(1)} size={28} /><IconButton name="repeat" color={repeat ? colors.lavender : colors.muted} onPress={toggleRepeat} size={22} /></View>
    <View style={styles.bottomActions}><Pressable style={styles.textAction} onPress={() => setShowPicker(true)}><Ionicons name="add-circle-outline" size={19} color={colors.lavender} /><Text style={styles.actionLabel}>Add to playlist</Text></Pressable><Pressable style={styles.textAction} onPress={() => setShowQueue(true)}><Ionicons name="list" size={20} color={colors.lavender} /><Text style={styles.actionLabel}>Queue</Text></Pressable></View>
    <PlaylistPicker track={showPicker ? current : null} onClose={() => setShowPicker(false)} />
    <Modal visible={showQueue} transparent animationType="slide" onRequestClose={() => setShowQueue(false)}><View style={styles.scrim}><View style={styles.queueSheet}><View style={styles.queueHeader}><View><Text style={ui.eyebrow}>UP NEXT</Text><Text style={styles.queueTitle}>Queue</Text></View><IconButton name="close" onPress={() => setShowQueue(false)} /></View><ScrollView>{queue.map((track, index) => <View key={`${track.id}-${index}`} style={styles.queueRow}><Cover index={track.artwork} size={43} radius={8} /><View style={{ flex: 1 }}><Text style={styles.queueTrack} numberOfLines={1}>{track.title}</Text><Text style={styles.queueArtist} numberOfLines={1}>{track.artist}</Text></View><IconButton name="chevron-up" size={17} color={colors.muted} onPress={() => moveInQueue(index, -1)} /><IconButton name="chevron-down" size={17} color={colors.muted} onPress={() => moveInQueue(index, 1)} /><IconButton name="close" size={17} color={colors.muted} onPress={() => removeFromQueue(index)} /></View>)}</ScrollView></View></View></Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 27 }, topText: { alignItems: 'center' }, topLabel: { color: colors.white, fontSize: 11, letterSpacing: 3, marginTop: 3 },
  artwork: { width: '100%', aspectRatio: 1, borderRadius: 19, backgroundColor: colors.surface, shadowColor: colors.purple, shadowOpacity: 0.25, shadowRadius: 25, elevation: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 28 }, title: { color: colors.white, fontSize: 25, fontWeight: '700' }, artist: { color: colors.muted, fontSize: 15, marginTop: 5 },
  slider: { marginTop: 23, marginHorizontal: -10 }, times: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 13 }, time: { color: colors.muted, fontSize: 11 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginTop: 19 }, playButton: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#F5DCF3', alignItems: 'center', justifyContent: 'center', shadowColor: colors.rose, shadowOpacity: 0.6, shadowRadius: 15, elevation: 7 },
  bottomActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 37 }, textAction: { flexDirection: 'row', alignItems: 'center', gap: 7 }, actionLabel: { color: colors.lavender, fontSize: 12, fontWeight: '600' },
  scrim: { flex: 1, backgroundColor: '#000A', justifyContent: 'flex-end' }, queueSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 22, height: '65%', borderWidth: 1, borderColor: colors.line },
  queueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, queueTitle: { color: colors.white, fontSize: 25, fontWeight: '700' }, queueRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 58 }, queueTrack: { color: colors.white, fontSize: 12, fontWeight: '600' }, queueArtist: { color: colors.muted, fontSize: 10, marginTop: 3 },
});
