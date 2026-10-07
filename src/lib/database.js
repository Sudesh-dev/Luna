import * as SQLite from 'expo-sqlite';

const DATABASE_VERSION = 3;
export const HISTORY_LIMIT = 150;

let databasePromise;

const createTables = async db => db.execAsync(`
  CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'local',
    source_id TEXT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album_title TEXT,
    uri TEXT NOT NULL DEFAULT '',
    duration REAL NOT NULL DEFAULT 0,
    artwork INTEGER NOT NULL DEFAULT 0,
    artwork_url TEXT,
    source_url TEXT,
    playable INTEGER NOT NULL DEFAULT 1,
    unavailable_reason TEXT,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    artwork INTEGER NOT NULL DEFAULT 0,
    artwork_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    added_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (playlist_id, track_id)
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
  CREATE TABLE IF NOT EXISTS import_entries (
    id TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    original_json TEXT NOT NULL,
    match_status TEXT NOT NULL,
    candidates_json TEXT NOT NULL DEFAULT '[]',
    matched_track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
    last_error TEXT
  );
`);

async function addColumnIfMissing(db, table, column, definition) {
  const columns = await db.getAllAsync(`PRAGMA table_info(${table})`);
  if (!columns.some(item => item.name === column)) await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

async function migrateDatabase(db) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const versionRow = await db.getFirstAsync('PRAGMA user_version');
  const currentVersion = Number(versionRow?.user_version) || 0;
  if (currentVersion > DATABASE_VERSION) throw new Error('This LUNA library was created by a newer app version.');

  await db.withTransactionAsync(async () => {
    await createTables(db);

    if (currentVersion < 2) {
      await addColumnIfMissing(db, 'tracks', 'source_id', 'source_id TEXT');
      await addColumnIfMissing(db, 'tracks', 'album_title', 'album_title TEXT');
      await addColumnIfMissing(db, 'tracks', 'artwork_url', 'artwork_url TEXT');
      await addColumnIfMissing(db, 'tracks', 'source_url', 'source_url TEXT');
      await addColumnIfMissing(db, 'tracks', 'playable', 'playable INTEGER NOT NULL DEFAULT 1');
      await addColumnIfMissing(db, 'tracks', 'unavailable_reason', 'unavailable_reason TEXT');
      await addColumnIfMissing(db, 'tracks', 'created_at', 'created_at INTEGER NOT NULL DEFAULT 0');
      await addColumnIfMissing(db, 'tracks', 'updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0');
      await addColumnIfMissing(db, 'playlists', 'artwork_url', 'artwork_url TEXT');
      await addColumnIfMissing(db, 'playlists', 'updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0');
      await addColumnIfMissing(db, 'playlist_tracks', 'added_at', 'added_at INTEGER NOT NULL DEFAULT 0');

      await db.execAsync(`
        UPDATE tracks
        SET source_id = id
        WHERE source = 'local' AND (source_id IS NULL OR source_id = '');
        UPDATE tracks
        SET created_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
        WHERE created_at = 0;
        UPDATE tracks SET updated_at = created_at WHERE updated_at = 0;
        UPDATE playlists SET updated_at = created_at WHERE updated_at = 0;
        UPDATE playlist_tracks
        SET added_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
        WHERE added_at = 0;
        DELETE FROM history WHERE id NOT IN (
          SELECT id FROM history ORDER BY played_at DESC, id DESC LIMIT ${HISTORY_LIMIT}
        );
      `);
    }

    if (currentVersion < 3) {
      await addColumnIfMissing(db, 'playlists', 'imported_from', 'imported_from TEXT');
      await addColumnIfMissing(db, 'playlists', 'source_url', 'source_url TEXT');
      await db.runAsync("UPDATE tracks SET uri = '', playable = 0, unavailable_reason = ? WHERE source IN ('spotify', 'soundcloud')",
        'This provider is an import source. Match the song to Audius from Import Playlist.');
    }

    await db.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS tracks_source_identity
        ON tracks(source, source_id) WHERE source_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS tracks_title ON tracks(title COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS playlists_created_at ON playlists(created_at DESC);
      CREATE INDEX IF NOT EXISTS playlist_tracks_order ON playlist_tracks(playlist_id, position);
      CREATE INDEX IF NOT EXISTS liked_tracks_liked_at ON liked_tracks(liked_at DESC);
      CREATE INDEX IF NOT EXISTS history_played_at ON history(played_at DESC);
      CREATE INDEX IF NOT EXISTS history_track_id ON history(track_id);
      CREATE INDEX IF NOT EXISTS import_entries_playlist ON import_entries(playlist_id, position);
    `);
    if (currentVersion < DATABASE_VERSION) await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  });
}

export function getDatabase() {
  if (!databasePromise) databasePromise = SQLite.openDatabaseAsync('luna.db').then(async db => {
    await migrateDatabase(db);
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
    db.getAllAsync(`SELECT p.*,
      (SELECT COUNT(*) FROM import_entries i WHERE i.playlist_id = p.id AND i.matched_track_id IS NULL) AS pending_count,
      (SELECT COUNT(*) FROM import_entries i WHERE i.playlist_id = p.id) AS import_count
      FROM playlists p ORDER BY created_at DESC`),
    db.getAllAsync('SELECT * FROM playlist_tracks ORDER BY playlist_id, position'),
    db.getAllAsync('SELECT track_id FROM liked_tracks ORDER BY liked_at DESC'),
    db.getAllAsync('SELECT track_id, played_at FROM history ORDER BY played_at DESC LIMIT ?', HISTORY_LIMIT),
  ]);
  return { tracks, playlists, playlistTracks, liked: liked.map(row => row.track_id), history };
}

export async function recordPlay(trackId, playedAt = Date.now()) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO history (track_id, played_at) VALUES (?, ?)', trackId, playedAt);
    await db.runAsync(`DELETE FROM history WHERE id NOT IN (
      SELECT id FROM history ORDER BY played_at DESC, id DESC LIMIT ?
    )`, HISTORY_LIMIT);
  });
}

export async function clearPlayHistory() {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM history');
}

export async function saveProviderTrack(track, database = null) {
  const source = String(track?.source || '').trim().toLocaleLowerCase();
  const sourceId = String(track?.source_id || '').trim();
  if (!source || source === 'local' || source === 'unresolved' || !sourceId) return track;

  const db = database || await getDatabase();
  const existing = await db.getFirstAsync('SELECT id, created_at FROM tracks WHERE source = ? AND source_id = ?', source, sourceId);
  const id = existing?.id || String(track.id || `${source}:${sourceId}`);
  const now = Date.now();
  const values = [
    String(track.title || 'Untitled').slice(0, 200),
    String(track.artist || 'Unknown artist').slice(0, 200),
    track.album_title || null,
    track.uri || '',
    Number(track.duration) || 0,
    track.artwork_url || null,
    track.source_url || null,
    track.playable === 0 ? 0 : 1,
    track.unavailable_reason || null,
  ];

  await db.runAsync(`INSERT INTO tracks (
    id, source, source_id, title, artist, album_title, uri, duration, artwork_url,
    source_url, playable, unavailable_reason, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source, source_id) WHERE source_id IS NOT NULL DO UPDATE SET
    title = excluded.title, artist = excluded.artist, album_title = excluded.album_title,
    uri = excluded.uri, duration = excluded.duration, artwork_url = excluded.artwork_url,
    source_url = excluded.source_url, playable = excluded.playable,
    unavailable_reason = excluded.unavailable_reason, updated_at = excluded.updated_at`,
  id, source, sourceId, ...values, now, now);
  const stored = await db.getFirstAsync('SELECT id, created_at FROM tracks WHERE source = ? AND source_id = ?', source, sourceId);
  return { ...track, id: stored.id, source, source_id: sourceId, created_at: stored.created_at, updated_at: now };
}

export async function saveMatchedPlaylist({ name, source = 'metadata', sourceUrl = null, entries }) {
  if (!name.trim() || !entries.length || entries.length > 500) throw new Error('Choose a name and up to 500 songs.');
  const db = await getDatabase();
  const id = `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();
  let added = 0;
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO playlists (id, name, artwork, created_at, updated_at, imported_from, source_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, name.trim().slice(0, 80), 0, now, now, source, sourceUrl);
    for (let position = 0; position < entries.length; position += 1) {
      const entry = entries[position];
      let stored = null;
      if (entry.accepted && entry.selected) {
        if (!['audius', 'local'].includes(entry.selected.source)) throw new Error('Only Audius or existing local audio can be added for playback.');
        stored = await saveProviderTrack(entry.selected, db);
        const insertion = await db.runAsync('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, ?)', id, stored.id, position, now);
        added += insertion.changes;
      }
      await db.runAsync(`INSERT INTO import_entries (id, playlist_id, position, original_json, match_status, candidates_json, matched_track_id, last_error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, `${id}:${position}`, id, position, JSON.stringify(entry.original), entry.status,
      JSON.stringify(entry.candidates), stored?.id || null, entry.error || null);
    }
  });
  return { id, added, total: entries.length, pending: entries.filter(entry => !entry.accepted || !entry.selected).length };
}

export async function readImportReview(playlistId) {
  const db = await getDatabase();
  const rows = await db.getAllAsync('SELECT * FROM import_entries WHERE playlist_id = ? AND matched_track_id IS NULL ORDER BY position', playlistId);
  return rows.map(row => ({ id: row.id, position: row.position, original: JSON.parse(row.original_json), status: row.match_status,
    candidates: JSON.parse(row.candidates_json), selected: null, accepted: false, error: row.last_error }));
}

export async function saveImportReview(playlistId, entries) {
  const db = await getDatabase();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const entry of entries) {
      const row = await db.getFirstAsync('SELECT position FROM import_entries WHERE id = ? AND playlist_id = ?', entry.id, playlistId);
      if (!row) continue;
      let stored = null;
      if (entry.accepted && entry.selected) {
        if (!['audius', 'local'].includes(entry.selected.source)) throw new Error('Select an Audius match.');
        stored = await saveProviderTrack(entry.selected, db);
        await db.runAsync('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, ?)', playlistId, stored.id, row.position, now);
      }
      await db.runAsync('UPDATE import_entries SET match_status = ?, candidates_json = ?, matched_track_id = ?, last_error = ? WHERE id = ?',
        entry.status, JSON.stringify(entry.candidates), stored?.id || null, entry.error || null, entry.id);
    }
    await db.runAsync('UPDATE playlists SET updated_at = ? WHERE id = ?', now, playlistId);
  });
  return playlistId;
}
