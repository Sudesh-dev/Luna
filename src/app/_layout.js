import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LunaProvider, useLuna } from '../context/LunaContext';
import { colors } from '../lib/theme';
import { useMusicStore } from '../store/useMusicStore';

function AppNavigator() {
  const { ready } = useLuna();

  if (!ready) {
    return <View accessible style={styles.loading} accessibilityLabel="LUNA is opening your music library">
      <Text style={styles.logo}>L U N A</Text>
      <ActivityIndicator color={colors.lavender} size="small" />
      <Text style={styles.loadingText}>Opening your library...</Text>
    </View>;
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade' }} />;
}

export default function RootLayout() {
  React.useEffect(() => { useMusicStore.getState().initializeAuth().catch(cause => console.warn('Cloud sign-in setup failed', cause)); }, []);
  return <SafeAreaProvider><StatusBar style="light" backgroundColor={colors.background} /><LunaProvider><AppNavigator /></LunaProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: colors.background },
  logo: { color: colors.white, fontSize: 28, fontWeight: '300', letterSpacing: 8 },
  loadingText: { color: colors.muted, fontSize: 12, letterSpacing: 0.4 },
});
