# LUNA

LUNA is a mobile-first music player built on the existing Expo SDK 57 project. Its preserved local library uses SQLite and works without an account. Search now combines Audius, Jamendo, Internet Archive, and available Piped nodes. Optional Supabase Auth and PostgreSQL playlists sync your cloud playlists between devices. The new provider, cloud, and player state modules are TypeScript; existing screens and local-library code remain JavaScript where they already work.

## Run it

```sh
npm install
npx expo start
```

Open the QR code with Expo Go, or use `npm run android` for an Android emulator. The app starts with an empty local library. Search real providers to play music, or use **Library → Import audio** for offline files. The app never seeds a fake catalog. Provider availability and rights vary by track and region.

To enable cloud playlists, create a free Supabase project, apply [001_cloud_playlists.sql](supabase/migrations/001_cloud_playlists.sql) in its SQL editor, and add `EXPO_PUBLIC_SUPABASE_URL` plus `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the ignored `.env` file. Use the publishable key only. Then open **Settings → Sign in or register**. Supabase may pause inactive free projects; see its current [pricing page](https://supabase.com/pricing). Cloud setup is optional for local playback.

Jamendo requires your own free developer app client ID in `EXPO_PUBLIC_JAMENDO_CLIENT_ID`. The suggested `56d30c95` ID returned a suspended-application error in a live check, so LUNA does not ship it as a working default. Public Piped instances may fail or return expiring streams; `EXPO_PUBLIC_PIPED_API_BASE_URL` can select a different instance. See [.env.example](.env.example).

On Windows PowerShell systems that block `npm.ps1`, use `npm.cmd` and `npx.cmd` instead.

## Development checks

```sh
npm test
npm run typecheck
npm run check:android
npm run check:web
npm run check:provider
```

Tests use Node's built-in test runner and SQLite (Node 22.13+; validated on Node 24). They cover conservative matching, JSON compatibility, URL validation, cancellation, provider normalization and partial failures, migration from the existing database, import persistence, deduplication, rollback, and history limits. Bundle checks write to the ignored `.expo/build-check` directory and verify routing, compilation, assets, and platform-specific module resolution without publishing.
`check:provider` is an optional live Audius check: it searches real `lofi` metadata and checks a playable stream's response headers, then cancels the body without saving audio. Automated bundles and core tests pass; native playback, sharing, lock-screen controls, and live SoundCloud widget import still need device testing. Browser visual QA could not run because the UI-control runtime failed to start.

## What works now

- Home, search, library, playlist detail, full player, mini-player, import, and settings screens.
- Unified search across Audius, Jamendo, Internet Archive, and reachable Piped nodes, with source badges and isolated provider errors.
- Optional account registration, persistent sign-in, and owner-only cloud playlists using Supabase Auth and row-level security.
- Local audio import and offline playback of user-provided audio files.
- SQLite storage for songs, playlists, liked songs, and listening history.
- Playlist create, rename, delete, add, remove, reorder, share, and import.
- Import review with EXACT, PROBABLE, and NOT_FOUND matches. Only single exact matches are selected automatically; alternate versions and ambiguous uploads require review.
- Persistent unresolved imports, with retry and candidate listening/selection from playlist detail.
- Queue, shuffle, repeat, seek, play/pause, previous/next, and native lock-screen metadata. Zustand holds global player state while the existing Expo audio player remains mounted at the app root.
- JSON library backup and restore. Backups contain metadata, playlists, and likes. They do **not** contain local audio files; supported provider references are restored when that source is connected.
- A database-aware startup screen, safe-area layout support, and accessible shared controls.
- Playback-only native audio permissions; LUNA does not request microphone access.

## Local database

LUNA uses a versioned SQLite schema. Tracks have an internal ID plus optional `source` and `source_id` fields, allowing remote providers to use their stable catalog identity without duplicating songs. Provider artwork, source links, availability, and timestamps are stored as metadata; playable URLs can still be resolved at playback time when a provider requires it.

Schema version 3 preserves the existing `tracks`, `playlists`, `playlist_tracks`, `liked_tracks`, and `history` tables. It adds playlist import provenance and `import_entries` for original metadata, candidates, match status, and pending review. A unique provider identity index prevents duplicate songs. Listening history is capped at 150 actual playback starts. Startup reads SQLite before audio setup; it never waits for a remote API. Existing Spotify/SoundCloud references are retained as unavailable metadata, since those providers no longer supply playback.

## Music service integration

LUNA uses the official Audius read-only API for login-free search and streaming. Additional adapters query Jamendo's read-only API, Internet Archive search and item metadata, and public Piped API instances concurrently with `Promise.allSettled`. Results are normalized to `{ id, title, artist, url, artwork, source }` for the new sources, then adapted to LUNA's existing SQLite track identity. Provider failures show a warning while successful results remain usable. Piped stream URLs are refreshed at playback time because they can expire. Remote audio is not downloaded or cached for offline playback.

Cloud playlists live separately from local playlists under **Library → Cloud**. The app stores uniform metadata in the `tracks` JSONB array, and the Supabase migration enforces per-user row-level security. Select a song's menu in Search to add Jamendo, Archive, or Piped tracks to a cloud playlist. Audius and device files continue to use local playlists. Cloud writes need connectivity; the local library still opens offline.

Search debounces by 350 ms, cancels obsolete requests, and caches provider results briefly in memory. It supports loading, no results, partial network/API errors, unavailable tracks, and retry. The existing player supports queue editing, playlist shuffle, repeat, seeking, buffering feedback, playback errors, and lock-screen metadata. No remote audio is downloaded for offline listening.

## Import playlists

Open **Library → Import a playlist** (also available in Settings).

- **SoundCloud:** paste a canonical `https://soundcloud.com/artist/sets/playlist` URL. LUNA uses the official [Widget API](https://developers.soundcloud.com/docs/api/html5-widget) `getSounds` method in a WebView/iframe to read only metadata the widget exposes. It does not scrape pages or use unofficial proxies, credentials, or Artist Pro. Private, blocked, shortened, or non-embeddable playlists may be unsupported; use pasted/file metadata instead. The widget is a visible, noninteractive reference and does not play audio in LUNA. Live widget behavior still needs device verification.
- **Spotify:** the official [public oEmbed response](https://developer.spotify.com/documentation/embeds/reference/oembed) does not contain playlist tracks. A playlist URL alone cannot supply a login-free track list through that mechanism. LUNA explains this limitation and accepts a track list you paste or an existing metadata JSON file. It does not call authenticated Spotify APIs, scrape Spotify, or copy Spotify audio.
- **LUNA / file:** choose a shared playlist JSON or text metadata file. Both the old `tracks` array and new `songs` array are accepted. Stable Audius IDs are preserved; other metadata is matched by title and artist. Existing local files on this device can be reused by source identity. Files contain no audio.

Pasted text uses one `Title — Artist` per line. JSON may contain `songs`, `tracks`, or `items`; tracks need a title/name and artist or artist names. Spotify-style `{ "items": [{ "track": { "name": "…", "artists": [{ "name": "…" }] } }] }` metadata also works. Imports are limited to 500 rows and 5 MB; malformed rows are counted and reported.

Matching sends title + artist to real Audius search in batches of three. Case, accents, punctuation, whitespace, and common feature abbreviations are normalized. Single playable title/artist matches are EXACT; duration differences, alternate versions, and multiple exact uploads require review. PROBABLE candidates are never silently accepted. NOT_FOUND entries and transient search failures remain local for retry. Matching and cancellation perform no database writes; a reviewed import is saved in one transaction. Listening to a candidate uses normal playback and history.

Review the summary, listen to possible matches, select the ones you want, and create the playlist. Its detail screen links to remaining review items, including after app restart or while offline. Fresh matching and Audius playback require internet.

## Share and back up

Playlist detail → Share produces `{ "format": "luna-playlist", "version": 1, "name": "…", "songs": [...] }`. Songs include title, artist, source, sourceId, artwork, duration, source URL, and availability. Pending original entries are included in playlist order so a friend can try matching them too. Native file sharing supports the device's installed WhatsApp, Telegram, Drive, and other share targets.

Settings library backups preserve metadata, playlists, likes, import provenance, and unresolved review entries. Audio files are not included. Sharing/backup uses native Android/iOS file APIs; the web preview supports pasted metadata and playlist file selection, but native audio import and backup sharing remain mobile-only.

The legacy `soundcloud-worker` folder is retained for reference and is unused by the app. Existing broker `.env` values have no effect; there is nothing to deploy.

## Manual test checklist

1. Search `lofi`, select a playable Audius result, pause, seek, skip, like, and create/add to a playlist from the song menu. Confirm real artwork/title/artist and mini/full player synchronization.
2. Rename, reorder, remove, play, and shuffle playlist songs. Share its JSON, then import it with **LUNA / file** and confirm Audius source IDs remain the same.
3. Import a small metadata list with an available title and a title that cannot be found. Check the summary, review possible matches, save, restart, and retry pending entries from playlist detail. Cancel during matching and confirm no playlist is created.
4. Paste a Spotify playlist link and verify the limitation/fallback. Try an embeddable public SoundCloud playlist; verify exposed metadata is matched to Audius. A private/unavailable link should produce a useful fallback.
5. Disable internet and confirm Home, Library, likes, history, playlist editing, and saved review entries still work. Local audio should play; fresh search should show a recoverable error.
6. On an Android development/release build, verify background audio, media controls, seeking, and lock-screen metadata. Bundle checks do not prove these device behaviors.
7. Search the same query with **All sources** and each source filter. Confirm real result badges, playback, and a partial warning when a provider fails. Archive should work without a key; Jamendo needs your own active free client ID, and Piped needs a reachable public instance.
8. After Supabase setup, register and confirm an account if email confirmation is enabled. Create a cloud playlist in **Library → Cloud**, add a Jamendo/Archive/Piped song from Search, restart the app, and verify persistent sign-in and playlist playback. Sign in as a different user and confirm the first user's playlist is not visible.

## Android APK

With Android Studio and the Android SDK installed, build locally without a cloud service:

```sh
npx expo run:android --device
```

`eas.json` retains its existing optional APK profile, but LUNA does not require EAS hosting or an Expo account for a local native build. The original moonlit artwork is preserved; `assets/branding` contains a simple crescent icon and transparent Android foreground, reproducible with `node scripts/generate-icon.cjs`. The updated project has not yet been run on a physical Android device.

## Project layout

- `src/app`: Expo Router screens
- `src/components`: reusable cards, rows, player bar, and dialogs
- `src/context/LunaContext.js`: library state and playback actions
- `src/lib/database.js`: SQLite schema and reads
- `src/services/audius.js`: real music search and provider normalization
- `src/services/playlistImport.js`: bounded, cancellable Audius matching
- `src/services/spotify.js`: playlist link validation and official import limitation
- `src/services/soundcloud.js`: official widget metadata normalization
- `src/utils`: metadata parsing and conservative track matching
- `src/components/SoundCloudMetadata.*`: platform-specific official widget bridge
- `tests/core.test.cjs`: core logic and SQLite migration tests
- `assets/art`: original LUNA artwork

## Design asset prompts

The artwork was generated with the built-in image generation tool for this project:

1. Cinematic midnight lake, luminous crescent moon, distant mountains, cherry blossom branches, lavender and pink moonlight, no text.
2. Night landscape with a bridge, distant lit city, crescent moon, lavender haze, no text.
3. Reflective lake with a torii gate, large pink moon, violet mountains and blossoms, no text.
