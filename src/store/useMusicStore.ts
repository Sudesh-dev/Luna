import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase, requireSupabase } from '../lib/supabase';
import { aggregateMusicSearch } from '../services/multiSource';
import { createCloudPlaylist, deleteCloudPlaylist, listCloudPlaylists, updateCloudPlaylist, type CloudPlaylist } from '../services/cloudPlaylists';
import { toLunaTrack, type Track, type TrackSource } from '../types/music';
import { searchAudiusTracks } from '../services/audius';

export type ProviderFilter = 'all' | 'audius' | 'local' | TrackSource;
type LunaTrack = ReturnType<typeof toLunaTrack> | Record<string, any>;
type PlayerCommands = {
  playTrack: (track: LunaTrack, tracks?: LunaTrack[]) => Promise<boolean>;
  togglePlay: () => void;
  next: (direction?: number) => Promise<void>;
  seek: (seconds: number) => Promise<void>;
};

interface MusicState {
  current: LunaTrack | null;
  queue: LunaTrack[];
  status: Record<string, any>;
  shuffle: boolean;
  repeat: boolean;
  playbackError: string;
  commands: PlayerCommands | null;
  setCurrent: (track: LunaTrack | null) => void;
  setQueue: (tracks: LunaTrack[]) => void;
  setStatus: (status: Record<string, any>) => void;
  setShuffle: (enabled: boolean) => void;
  setRepeat: (enabled: boolean) => void;
  setPlaybackError: (message: string) => void;
  bindPlayer: (commands: PlayerCommands | null) => void;
  play: (track: LunaTrack, tracks?: LunaTrack[]) => Promise<boolean>;
  pauseOrResume: () => void;
  skip: (direction?: number) => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  searchResults: LunaTrack[];
  searchWarnings: string[];
  searchLoading: boolean;
  searchCatalog: (query: string, provider: ProviderFilter, signal?: AbortSignal) => Promise<void>;
  session: Session | null;
  authReady: boolean;
  cloudPlaylists: CloudPlaylist[];
  cloudLoading: boolean;
  cloudError: string;
  initializeAuth: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<string>;
  signOut: () => Promise<void>;
  refreshCloudPlaylists: () => Promise<void>;
  createCloudPlaylist: (name: string) => Promise<string>;
  renameCloudPlaylist: (id: string, name: string) => Promise<void>;
  removeCloudPlaylist: (id: string) => Promise<void>;
  addCloudTrack: (id: string, track: Track) => Promise<void>;
  removeCloudTrack: (id: string, index: number) => Promise<void>;
  moveCloudTrack: (id: string, index: number, direction: number) => Promise<void>;
}

let searchSequence = 0;
let authSubscription: { unsubscribe: () => void } | null = null;

export const useMusicStore = create<MusicState>((set, get) => ({
  current: null, queue: [], status: { playing: false, currentTime: 0, duration: 0 }, shuffle: false, repeat: false,
  playbackError: '', commands: null,
  setCurrent: current => set({ current }), setQueue: queue => set({ queue }), setStatus: status => set({ status }),
  setShuffle: shuffle => set({ shuffle }), setRepeat: repeat => set({ repeat }), setPlaybackError: playbackError => set({ playbackError }),
  bindPlayer: commands => set({ commands }),
  play: (track, tracks) => get().commands?.playTrack(track, tracks) || Promise.resolve(false),
  pauseOrResume: () => get().commands?.togglePlay(),
  skip: direction => get().commands?.next(direction) || Promise.resolve(),
  seek: seconds => get().commands?.seek(seconds) || Promise.resolve(),
  searchResults: [], searchWarnings: [], searchLoading: false,
  searchCatalog: async (query, provider, signal) => {
    const sequence = ++searchSequence;
    if (query.trim().length < 2 || provider === 'local') { set({ searchResults: [], searchWarnings: [], searchLoading: false }); return; }
    set({ searchLoading: true, searchWarnings: [], searchResults: [] });
    const sources: TrackSource[] = provider === 'all' ? ['piped', 'jamendo', 'archive']
      : provider === 'audius' ? [] : [provider];
    const tasks: Promise<any>[] = [];
    const names: string[] = [];
    if (provider === 'all' || provider === 'audius') { tasks.push((searchAudiusTracks as any)(query, { signal })); names.push('Audius'); }
    if (sources.length) { tasks.push(aggregateMusicSearch(query, sources, signal)); names.push('Other sources'); }
    const settled = await Promise.allSettled(tasks);
    if (signal?.aborted || sequence !== searchSequence) return;
    const tracks = settled.flatMap((result, index) => result.status !== 'fulfilled' ? []
      : names[index] === 'Audius' ? result.value : result.value.tracks.map((track: Track) => toLunaTrack(track)));
    const warnings = settled.flatMap((result, index) => result.status === 'rejected'
      ? [`${names[index]} search is unavailable`] : names[index] === 'Other sources' ? result.value.warnings : []);
    if (!tracks.length && (settled.every(result => result.status === 'rejected') || (sources.length && warnings.length >= sources.length + (names.includes('Audius') ? 1 : 0)))) {
      set({ searchLoading: false, searchWarnings: warnings });
      throw new Error(warnings.join(' · ') || 'Music sources could not be reached. Check your connection and try again.');
    }
    set({ searchResults: tracks, searchWarnings: warnings, searchLoading: false });
  },
  session: null, authReady: false, cloudPlaylists: [], cloudLoading: false, cloudError: '',
  initializeAuth: async () => {
    if (!supabase) { set({ authReady: true }); return; }
    try {
      const { data, error } = await supabase.auth.getSession();
      set({ session: data.session, cloudError: error?.message || '' });
      if (!authSubscription) {
        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
          set({ session, cloudPlaylists: session ? get().cloudPlaylists : [] });
          if (session) setTimeout(() => get().refreshCloudPlaylists().catch(() => {}), 0);
        });
        authSubscription = listener.subscription;
      }
      if (data.session) await get().refreshCloudPlaylists();
    } catch (cause: any) {
      set({ cloudError: cause?.message || 'Cloud sign-in could not be restored.' });
    } finally {
      set({ authReady: true });
    }
  },
  signIn: async (email, password) => {
    const { error } = await requireSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  },
  signUp: async (email, password, username) => {
    const { data, error } = await requireSupabase().auth.signUp({ email: email.trim(), password, options: { data: { username: username.trim().slice(0, 40) } } });
    if (error) throw error;
    return data.session ? 'Account created.' : 'Account created. Check your email to confirm it before signing in.';
  },
  signOut: async () => {
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw error;
    set({ session: null, cloudPlaylists: [] });
  },
  refreshCloudPlaylists: async () => {
    const userId = get().session?.user.id;
    if (!userId) return;
    set({ cloudLoading: true, cloudError: '' });
    try { set({ cloudPlaylists: await listCloudPlaylists(userId) }); }
    catch (cause: any) { set({ cloudError: cause?.message || 'Cloud playlists could not load.' }); throw cause; }
    finally { set({ cloudLoading: false }); }
  },
  createCloudPlaylist: async name => {
    const userId = get().session?.user.id;
    if (!userId) throw new Error('Sign in to create a shared cloud playlist.');
    const playlist = await createCloudPlaylist(userId, name);
    set({ cloudPlaylists: [playlist, ...get().cloudPlaylists] });
    return playlist.id;
  },
  renameCloudPlaylist: async (id, name) => {
    const userId = get().session?.user.id;
    if (!userId) throw new Error('Sign in first.');
    const playlist = await updateCloudPlaylist(userId, id, { name });
    set({ cloudPlaylists: get().cloudPlaylists.map(item => item.id === id ? playlist : item) });
  },
  removeCloudPlaylist: async id => {
    const userId = get().session?.user.id;
    if (!userId) throw new Error('Sign in first.');
    await deleteCloudPlaylist(userId, id);
    set({ cloudPlaylists: get().cloudPlaylists.filter(item => item.id !== id) });
  },
  addCloudTrack: async (id, track) => {
    const userId = get().session?.user.id;
    const playlist = get().cloudPlaylists.find(item => item.id === id);
    if (!userId || !playlist) throw new Error('Open a cloud playlist after signing in.');
    if (playlist.tracks.some(item => item.source === track.source && item.id === track.id)) return;
    const updated = await updateCloudPlaylist(userId, id, { tracks: [...playlist.tracks, track] });
    set({ cloudPlaylists: get().cloudPlaylists.map(item => item.id === id ? updated : item) });
  },
  removeCloudTrack: async (id, index) => {
    const userId = get().session?.user.id;
    const playlist = get().cloudPlaylists.find(item => item.id === id);
    if (!userId || !playlist) throw new Error('Open a cloud playlist after signing in.');
    const updated = await updateCloudPlaylist(userId, id, { tracks: playlist.tracks.filter((_, at) => at !== index) });
    set({ cloudPlaylists: get().cloudPlaylists.map(item => item.id === id ? updated : item) });
  },
  moveCloudTrack: async (id, index, direction) => {
    const userId = get().session?.user.id;
    const playlist = get().cloudPlaylists.find(item => item.id === id);
    if (!userId || !playlist) throw new Error('Open a cloud playlist after signing in.');
    const other = index + direction;
    if (index < 0 || other < 0 || other >= playlist.tracks.length) return;
    const tracks = [...playlist.tracks];
    [tracks[index], tracks[other]] = [tracks[other], tracks[index]];
    const updated = await updateCloudPlaylist(userId, id, { tracks });
    set({ cloudPlaylists: get().cloudPlaylists.map(item => item.id === id ? updated : item) });
  },
}));
