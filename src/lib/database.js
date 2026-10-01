import * as SQLite from 'expo-sqlite';

let databasePromise;

export function getDatabase() {
  if (!databasePromise) databasePromise = SQLite.openDatabaseAsync('luna.db').then(async db => {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL,
        uri TEXT NOT NULL, duration REAL NOT NULL DEFAULT 0,
        artwork INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'local'
      );
      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, artwork INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        position INTEGER NOT NULL, PRIMARY KEY (playlist_id, track_id)
      );
      CREATE TABLE IF NOT EXISTS liked_tracks (
        track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
        liked_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        played_at INTEGER NOT NULL
      );
    `);
    return db;
  });
  return databasePromise;
}

export async function initializeDatabase() {
  return getDatabase();
}

export async function readLibrary() {
  const db = await getDatabase();
  const [tracks, playlists, playlistTracks, liked, history] = await Promise.all([
    db.getAllAsync('SELECT * FROM tracks ORDER BY title COLLATE NOCASE'),
    db.getAllAsync('SELECT * FROM playlists ORDER BY created_at DESC'),
    db.getAllAsync('SELECT * FROM playlist_tracks ORDER BY position'),
    db.getAllAsync('SELECT track_id FROM liked_tracks ORDER BY liked_at DESC'),
    db.getAllAsync('SELECT track_id, played_at FROM history ORDER BY played_at DESC LIMIT 100'),
  ]);
  return { tracks, playlists, playlistTracks, liked: liked.map(row => row.track_id), history };
}
