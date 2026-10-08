const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'multiSource.ts'), 'utf8');
function loadService(clientId = 'test-client') {
  process.env.EXPO_PUBLIC_JAMENDO_CLIENT_ID = clientId;
  const compiled = babel.transformSync(source, { filename: 'multiSource.ts', presets: ['@babel/preset-typescript'], plugins: ['@babel/plugin-transform-modules-commonjs'], configFile: false, babelrc: false });
  const module = { exports: {} };
  new Function('exports', 'require', 'module', compiled.code)(module.exports, require, module);
  return module.exports;
}

const reply = body => ({ ok: true, json: async () => body });

test('Jamendo maps only tracks with direct HTTPS audio into the strict Track shape', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => reply({ headers: { status: 'success' }, results: [
    { id: 41, name: 'Night Drive', artist_name: 'Moonlight', audio: 'https://music.example/song.mp3', image: 'https://music.example/cover.jpg' },
    { id: 42, name: 'Unavailable', artist_name: 'Moonlight', audio: '' },
  ] });
  try {
    const tracks = await loadService().searchJamendo('night');
    assert.deepEqual(tracks, [{ id: '41', title: 'Night Drive', artist: 'Moonlight', url: 'https://music.example/song.mp3', artwork: 'https://music.example/cover.jpg', source: 'jamendo' }]);
  } finally { global.fetch = originalFetch; }
});

test('Archive search retrieves metadata and emits playable file URLs', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => String(url).includes('/metadata/')
    ? reply({ files: [{ name: 'Live Set.mp3', format: 'VBR MP3', source: 'derivative' }, { name: 'notes.txt', source: 'original' }] })
    : reply({ response: { docs: [{ identifier: 'concert-1', title: 'Live Set', creator: 'Night Band' }] } });
  try {
    const tracks = await loadService().searchArchive('live');
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].url, 'https://archive.org/download/concert-1/Live%20Set.mp3');
    assert.equal(tracks[0].artist, 'Night Band');
  } finally { global.fetch = originalFetch; }
});

test('Aggregator preserves successful results when one provider fails', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => {
    if (String(url).includes('jamendo')) throw new Error('offline');
    if (String(url).includes('/metadata/')) return reply({ files: [{ name: 'song.mp3', format: 'VBR MP3', source: 'derivative' }] });
    return reply({ response: { docs: [{ identifier: 'live-1', creator: 'Artist' }] } });
  };
  try {
    const result = await loadService().aggregateMusicSearch('live', ['jamendo', 'archive']);
    assert.equal(result.tracks.length, 1);
    assert.equal(result.tracks[0].source, 'archive');
    assert.match(result.warnings[0], /jamendo/i);
  } finally { global.fetch = originalFetch; }
});

test('Piped search resolves direct audio and drops non-stream results', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => String(url).includes('/streams/')
    ? reply({ audioStreams: [{ url: 'https://audio.example/play.m4a', mimeType: 'audio/mp4', bitrate: 128000 }] })
    : reply({ items: [{ type: 'stream', title: 'A real song', uploaderName: 'Singer', thumbnail: 'https://art.example/a.jpg', url: '/watch?v=abcdefghijk' }, { type: 'channel', title: 'Singer' }] });
  try {
    const tracks = await loadService().searchPiped('song');
    assert.equal(tracks.length, 1);
    assert.deepEqual(Object.keys(tracks[0]), ['id', 'title', 'artist', 'url', 'artwork', 'source']);
    assert.equal(tracks[0].url, 'https://audio.example/play.m4a');
  } finally { global.fetch = originalFetch; }
});
