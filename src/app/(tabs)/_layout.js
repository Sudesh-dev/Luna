import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MiniPlayer from '../../components/MiniPlayer';
import { colors } from '../../lib/theme';

export default function TabLayout() {
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.lavender,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: '#0D0A13', borderTopColor: '#2A2234', height: 74, paddingTop: 7, paddingBottom: 8 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      tabBarIcon: ({ color, focused }) => <Ionicons name={({ index: focused ? 'home' : 'home-outline', search: focused ? 'search' : 'search-outline', library: focused ? 'albums' : 'albums-outline' })[route.name]} size={22} color={color} />,
    })}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
    </Tabs>
    <MiniPlayer />
  </View>;
}
