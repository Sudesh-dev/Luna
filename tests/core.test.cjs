const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { transformSync } = require('@babel/core');

// Execute production modules with only platform boundaries replaced.
function loader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(__dirname, '..', relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const code = transformSync(fs.readFileSync(filename, 'utf8'), {
      babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
    }).code;
    const localRequire = id => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('.')) return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${id.replace(/\.js$/, '')}.js`)));
      return require(id);
    };
    new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
}

const original = { title: 'Animals', artist: 'Martin Garrix', duration: 180 };
const track = (changes = {}) => ({ id: 'audius:abc', source: 'audius', source_id: 'abc', title: 'Animals', artist: 'Martin Garrix', duration: 180, uri: 'https://api.audius.co/v1/tracks/abc/stream', playable: 1, ...changes });

test('matching accepts punctuation/case but requires review for versions, ambiguity, or duration mismatch', () => {
  const { matchTracks } = loader()('src/utils/matchTracks.js');
  assert.equal(matchTracks({ title: '  ANIMALS! ', artist: 'MARTIN  GARRIX' }, [track()]).status, 'EXACT');
  assert.equal(matchTracks(original, [track({ title: 'Animals (Remix)' })]).status, 'PROBABLE');
  assert.equal(matchTracks(original, [track({ duration: 270 })]).status, 'PROBABLE');
  assert.equal(matchTracks(original, [track(), track({ id: 'other', source_id: 'other' })]).status, 'PROBABLE');
  assert.equal(matchTracks(original, [track({ artist: 'Different uploader' })]).status, 'NOT_FOUND');
  assert.equal(matchTracks(original, [track({ playable: 0 })]).status, 'NOT_FOUND');
  assert.equal(matchTracks(original, [track(), track()]).status, 'EXACT');
});

test('metadata accepts old and new LUNA JSON, Spotify metadata, Unicode and invalid rows', () => {
  const { parsePlaylistMetadata } = loader()('src/utils/playlistMetadata.js');
  for (const field of ['songs', 'tracks']) {
    const result = parsePlaylistMetadata(JSON.stringify({ format: 'luna-playlist', version: 1, name: 'Night', [field]: [{ title: '月', artist: '星', source: 'audius', sourceId: 'abc', duration: 180 }] }));
    assert.equal(result.name, 'Night'); assert.equal(result.tracks[0].source_id, 'abc');
  }
  const result = parsePlaylistMetadata(JSON.stringify({ items: [{ track: { name: 'Animals', artists: [{ name: 'Martin Garrix' }], duration_ms: 180000 } }, null] }), { source: 'spotify' });
  assert.equal(result.tracks[0].duration, 180); assert.equal(result.skipped, 1);
  assert.equal(parsePlaylistMetadata('Animals — Martin Garrix\nBad row').skipped, 1);
  assert.throws(() => parsePlaylistMetadata('{oops'), /valid JSON/);
  assert.throws(() => parsePlaylistMetadata(JSON.stringify(Array.from({ length: 501 }, () => original))), /500/);
});

test('provider URL validators reject lookalikes and unrelated resources', () => {
  const load = loader();
  const { spotifyPlaylistUrl } = load('src/services/spotify.js');
  const { soundCloudPlaylistUrl, soundCloudWidgetTracks } = load('src/services/soundcloud.js');
  assert.equal(spotifyPlaylistUrl('https://open.spotify.com/playlist/1234567890123456789012?si=x'), 'https://open.spotify.com/playlist/1234567890123456789012');
  assert.throws(() => spotifyPlaylistUrl('https://open.spotify.com.evil.test/playlist/1234567890123456789012'));
  assert.throws(() => soundCloudPlaylistUrl('https://soundcloud.com/artist/song'));
  assert.equal(soundCloudPlaylistUrl('https://soundcloud.com/artist/sets/night?si=x'), 'https://soundcloud.com/artist/sets/night');
  assert.equal(soundCloudWidgetTracks([{ id: 1, title: 'Animals', user: { username: 'Martin Garrix' }, duration: 180000 }]).tracks[0].duration, 180);
  const parsed = load('src/utils/playlistMetadata.js').parsePlaylistMetadata(JSON.stringify({ songs: [{ ...original, source: 'soundcloud', sourceId: '1' }] }));
  assert.equal(parsed.tracks[0].duration, 180);
  assert.throws(() => soundCloudWidgetTracks([]), /did not expose/);
});

test('playlist matching supports stable Audius sharing, cancellation, and recoverable network errors', async () => {
  let calls = 0;
  const load = loader({ './audius': { audiusStreamUrl: id => `https://api.audius.co/v1/tracks/${id}/stream`, searchAudiusTracks: async () => { calls++; throw new Error('Offline'); } } });
  const { matchPlaylist } = load('src/services/playlistImport.js');
  const result = await matchPlaylist({ tracks: [{ ...original, source: 'audius', source_id: 'abc' }, { ...original, source: 'spotify' }] });
  assert.equal(result[0].accepted, true); assert.equal(calls, 1);
  assert.equal(result[1].accepted, false); assert.equal(result[1].error, 'Offline');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(matchPlaylist({ tracks: [original] }, { signal: controller.signal }), { name: 'AbortError' });
});

test('Audius search caches real results and propagates API errors and pre-aborted requests', async () => {
  const savedFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, json: async () => ({ data: [{ id: 'abc', title: 'Animals', user: { name: 'Martin Garrix' }, duration: 180, is_streamable: true }] }) }; };
  try {
    const audius = loader()('src/services/audius.js');
    const first = await audius.searchAudiusTracks('Animals');
    first[0].title = 'Changed externally';
    assert.equal((await audius.searchAudiusTracks(' animals '))[0].title, 'Animals'); assert.equal(calls, 1);
    global.fetch = async () => ({ ok: false, status: 429 });
    await assert.rejects(audius.searchAudiusTracks('new query'), error => error.code === 'rate_limit');
    global.fetch = async () => ({ ok: true, json: async () => ({ bad: true }) });
    await assert.rejects(audius.searchAudiusTracks('bad payload'), error => error.code === 'invalid_response');
    const controller = new AbortController(); controller.abort();
    await assert.rejects(audius.searchAudiusTracks('Animals', { signal: controller.signal }), { name: 'AbortError' });
  } finally { global.fetch = savedFetch; }
});

function databaseFixture(version = 0) {
  const sql = new DatabaseSync(':memory:');
  if (version === 2) sql.exec(`
    CREATE TABLE tracks (id TEXT PRIMARY KEY, source TEXT NOT NULL DEFAULT 'local', source_id TEXT, title TEXT NOT NULL, artist TEXT NOT NULL, album_title TEXT, uri TEXT NOT NULL DEFAULT '', duration REAL NOT NULL DEFAULT 0, artwork INTEGER NOT NULL DEFAULT 0, artwork_url TEXT, source_url TEXT, playable INTEGER NOT NULL DEFAULT 1, unavailable_reason TEXT, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE playlists (id TEXT PRIMARY KEY, name TEXT NOT NULL, artwork INTEGER NOT NULL DEFAULT 0, artwork_url TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE playlist_tracks (playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE, track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, position INTEGER NOT NULL, added_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (playlist_id,track_id));
    CREATE TABLE liked_tracks (track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE, liked_at INTEGER NOT NULL);
    CREATE TABLE history (id INTEGER PRIMARY KEY AUTOINCREMENT, track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, played_at INTEGER NOT NULL);
    INSERT INTO tracks (id,source,source_id,title,artist,uri) VALUES ('local1','local','file1','My song','Me','file:///song.mp3');
    INSERT INTO playlists (id,name,created_at) VALUES ('old','Existing playlist',1);
    INSERT INTO playlist_tracks VALUES ('old','local1',0,1);
    INSERT INTO liked_tracks VALUES ('local1',1);
    PRAGMA user_version=2;
  `);
  const db = {
    execAsync: async query => sql.exec(query),
    getFirstAsync: async (query, ...args) => sql.prepare(query).get(...args) || null,
    getAllAsync: async (query, ...args) => sql.prepare(query).all(...args),
    runAsync: async (query, ...args) => { const result = sql.prepare(query).run(...args); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; },
    withTransactionAsync: async action => { sql.exec('BEGIN'); try { await action(); sql.exec('COMMIT'); } catch (error) { sql.exec('ROLLBACK'); throw error; } },
  };
  return { sql, db, api: loader({ 'expo-sqlite': { openDatabaseAsync: async () => db } })('src/lib/database.js') };
}

test('SQLite v2 migration preserves songs, likes and playlists; imports persist review and deduplicate', async () => {
  const { sql, api } = databaseFixture(2);
  try {
    await api.initializeDatabase();
    let library = await api.readLibrary();
    assert.equal(library.tracks[0].uri, 'file:///song.mp3'); assert.deepEqual(library.liked, ['local1']);
    assert.equal(library.playlists[0].name, 'Existing playlist');
    assert.equal(sql.prepare('PRAGMA user_version').get().user_version, 3);
    const accepted = { original, status: 'EXACT', candidates: [track()], selected: track(), accepted: true };
    const pending = { original: { title: 'Other', artist: 'Artist' }, status: 'NOT_FOUND', candidates: [], selected: null, accepted: false, error: 'Offline' };
    const imported = await api.saveMatchedPlaylist({ name: 'Imported', source: 'spotify', entries: [accepted, accepted, pending] });
    assert.equal(imported.added, 1); assert.equal(imported.pending, 1);
    const review = await api.readImportReview(imported.id);
    assert.equal(review[0].original.title, 'Other'); assert.equal(review[0].error, 'Offline');
    await api.saveImportReview(imported.id, [{ ...review[0], accepted: true, selected: track({ id: 'second', source_id: 'second' }), candidates: [] }]);
    assert.equal((await api.readImportReview(imported.id)).length, 0);
    library = await api.readLibrary();
    assert.equal(library.tracks.length, 3); assert.equal(library.playlists.find(list => list.id === imported.id).pending_count, 0);
    for (let index = 0; index < 155; index++) await api.recordPlay('local1', index);
    assert.equal((await api.readLibrary()).history.length, 150);
    await assert.rejects(api.saveMatchedPlaylist({ name: 'Invalid', entries: [{ ...accepted, selected: track({ source: 'spotify' }) }] }), /Only Audius/);
    assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM playlists WHERE name='Invalid'").get().count, 0);
    sql.prepare('DELETE FROM playlists WHERE id=?').run(imported.id);
    assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM import_entries').get().count, 0);
  } finally { sql.close(); }
});

test('fresh SQLite installs initialize without an existing library', async () => {
  const { sql, api } = databaseFixture();
  try { await api.initializeDatabase(); assert.equal((await api.readLibrary()).tracks.length, 0); } finally { sql.close(); }
});

test('concurrent provider saves reuse a single stable song identity', async () => {
  const { sql, api } = databaseFixture();
  try {
    await api.initializeDatabase();
    const saved = await Promise.all(Array.from({ length: 10 }, (_, index) => api.saveProviderTrack(track({ id: `candidate-${index}` }))));
    assert.equal(new Set(saved.map(item => item.id)).size, 1);
    assert.equal((await api.readLibrary()).tracks.length, 1);
  } finally { sql.close(); }
});

test('migration retains old SoundCloud metadata while removing obsolete broker playback', async () => {
  const { sql, api } = databaseFixture(2);
  try {
    sql.prepare('INSERT INTO tracks (id,source,source_id,title,artist,uri) VALUES (?,?,?,?,?,?)').run('sc1', 'soundcloud', 'soundcloud:tracks:1', 'Old song', 'Artist', 'https://old-broker.test/play?key=obsolete');
    await api.initializeDatabase();
    const old = (await api.readLibrary()).tracks.find(track => track.id === 'sc1');
    assert.equal(old.title, 'Old song'); assert.equal(old.playable, 0); assert.equal(old.uri, '');
    assert.match(old.unavailable_reason, /import source/);
  } finally { sql.close(); }
});
