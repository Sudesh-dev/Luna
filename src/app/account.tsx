import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as LunaUI from '../components/UI';
import { colors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { useMusicStore } from '../store/useMusicStore';

const { IconButton, Screen, ui } = LunaUI as any;

export default function AccountScreen() {
  const router = useRouter();
  const session = useMusicStore(state => state.session);
  const authReady = useMusicStore(state => state.authReady);
  const signIn = useMusicStore(state => state.signIn);
  const signUp = useMusicStore(state => state.signUp);
  const signOut = useMusicStore(state => state.signOut);
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    if (!email.includes('@') || password.length < 6) { setMessage('Enter a valid email and a password of at least 6 characters.'); return; }
    setBusy(true); setMessage('');
    try {
      if (mode === 'signUp') setMessage(await signUp(email, password, username));
      else await signIn(email, password);
    } catch (cause: any) { setMessage(cause?.message || 'Could not sign in.'); }
    finally { setBusy(false); }
  }

  return <Screen><View style={styles.header}><IconButton name="arrow-back" onPress={() => router.back()} /><Text style={ui.heading}>Cloud account</Text></View>
    <Text style={styles.intro}>Keep cloud playlists synced between your devices. Your local library, likes, and listening history stay on this device.</Text>
    {!supabase ? <View style={styles.card}><Text style={styles.title}>Cloud setup needed</Text><Text style={styles.detail}>Add your free Supabase project URL and publishable key to .env, then apply the included SQL migration. Local music still works.</Text></View>
      : !authReady ? <ActivityIndicator color={colors.lavender} />
        : session ? <View style={styles.card}><Text style={styles.title}>Signed in</Text><Text style={styles.detail}>{session.user.email}</Text><Pressable style={styles.button} onPress={() => router.push('/library')}><Text style={styles.buttonText}>Open playlists</Text></Pressable><Pressable disabled={busy} style={styles.secondary} onPress={async () => { setBusy(true); try { await signOut(); } catch (cause: any) { Alert.alert('Sign out failed', cause.message); } finally { setBusy(false); } }}><Text style={styles.secondaryText}>Sign out</Text></Pressable></View>
          : <View style={styles.card}><Text style={styles.title}>{mode === 'signIn' ? 'Welcome back' : 'Create your account'}</Text>
            {mode === 'signUp' && <TextInput accessibilityLabel="Username" value={username} onChangeText={setUsername} placeholder="Username" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" maxLength={40} />}
            <TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <TextInput accessibilityLabel="Password" value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.muted} style={styles.input} secureTextEntry autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} />
            {!!message && <Text style={styles.message}>{message}</Text>}
            <Pressable disabled={busy} style={styles.button} onPress={submit}>{busy ? <ActivityIndicator color="#211528" /> : <Text style={styles.buttonText}>{mode === 'signIn' ? 'Sign in' : 'Register'}</Text>}</Pressable>
            <Pressable style={styles.secondary} onPress={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setMessage(''); }}><Text style={styles.secondaryText}>{mode === 'signIn' ? 'Create an account' : 'Already have an account? Sign in'}</Text></Pressable>
          </View>}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 }, intro: { color: colors.muted, fontSize: 13, lineHeight: 20, marginBottom: 22 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 20 },
  title: { color: colors.white, fontSize: 20, fontWeight: '700', marginBottom: 13 }, detail: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  input: { color: colors.white, backgroundColor: colors.raised, height: 50, borderRadius: 12, paddingHorizontal: 14, marginBottom: 12 },
  message: { color: colors.lavender, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  button: { backgroundColor: colors.lavender, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  buttonText: { color: '#211528', fontWeight: '800' }, secondary: { alignItems: 'center', padding: 16 }, secondaryText: { color: colors.lavender, fontWeight: '600' },
});
