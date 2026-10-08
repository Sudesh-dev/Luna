import { requireSupabase } from '../lib/supabase';
import type { Track } from '../types/music';

export interface CloudPlaylist {
  id: string;
  user_id: string;
  name: string;
  tracks: Track[];
  created_at: string;
}

function validateTracks(tracks: Track[]): Track[] {
  if (!Array.isArray(tracks) || tracks.length > 500) throw new Error('A cloud playlist can hold up to 500 tracks.');
  return tracks.map(track => {
    if (!track || !['piped', 'jamendo', 'archive'].includes(track.source) || !track.id || !track.title || !track.artist || !/^https:\/\//i.test(track.url)) {
      throw new Error('A playlist contains an invalid track.');
    }
    return { id: String(track.id).slice(0, 500), title: String(track.title).slice(0, 200), artist: String(track.artist).slice(0, 200),
      url: String(track.url || '').slice(0, 3000), artwork: String(track.artwork || '').slice(0, 2000), source: track.source };
  });
}

export async function listCloudPlaylists(userId: string): Promise<CloudPlaylist[]> {
  const { data, error } = await requireSupabase().from('playlists').select('id,user_id,name,tracks,created_at')
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => ({ ...row, tracks: Array.isArray(row.tracks) ? row.tracks : [] })) as CloudPlaylist[];
}

export async function createCloudPlaylist(userId: string, name: string): Promise<CloudPlaylist> {
  const safeName = name.trim().slice(0, 80);
  if (!safeName) throw new Error('Enter a playlist name.');
  const { data, error } = await requireSupabase().from('playlists')
    .insert({ user_id: userId, name: safeName, tracks: [] }).select('id,user_id,name,tracks,created_at').single();
  if (error) throw error;
  return data as CloudPlaylist;
}

export async function updateCloudPlaylist(userId: string, playlistId: string, changes: { name?: string; tracks?: Track[] }): Promise<CloudPlaylist> {
  const payload: { name?: string; tracks?: Track[] } = {};
  if (changes.name !== undefined) {
    payload.name = changes.name.trim().slice(0, 80);
    if (!payload.name) throw new Error('Enter a playlist name.');
  }
  if (changes.tracks !== undefined) payload.tracks = validateTracks(changes.tracks);
  const { data, error } = await requireSupabase().from('playlists').update(payload)
    .eq('id', playlistId).eq('user_id', userId).select('id,user_id,name,tracks,created_at').single();
  if (error) throw error;
  return data as CloudPlaylist;
}

export async function deleteCloudPlaylist(userId: string, playlistId: string): Promise<void> {
  const { error } = await requireSupabase().from('playlists').delete().eq('id', playlistId).eq('user_id', userId);
  if (error) throw error;
}
