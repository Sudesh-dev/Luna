import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LunaProvider } from '../context/LunaContext';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return <LunaProvider><StatusBar style="light" backgroundColor={colors.background} />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade' }} />
  </LunaProvider>;
}
