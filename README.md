# LUNA

LUNA is a login-free, mobile-first music player built with Expo SDK 57, React Native, JavaScript, Expo Router, `expo-audio`, and `expo-sqlite`. Its night palette and original moonlit artwork follow the supplied concept image.

## Run it

```sh
npm install
npx expo start
```

Open the QR code with Expo Go, or use `npm run android` for an Android emulator. The app starts with an empty local library. Import audio files from **Library → Import audio** to test playback.

## What works now

- Home, search, library, playlist detail, full player, mini-player, and settings screens.
- Local audio import and offline playback of user-provided audio files.
- SQLite storage for songs, playlists, liked songs, and listening history.
- Playlist create, rename, delete, add, remove, reorder, share, and import.
- Queue, shuffle, repeat, seek, play/pause, previous/next, and Android lock-screen metadata.
- JSON library backup and restore. Backups contain metadata, playlists, and likes. They do **not** contain audio files; unmatched imported songs are marked as needing audio.

## Music service integration

SoundCloud search and streaming are **not connected**. SoundCloud requires registered API credentials, a securely managed client secret/token flow, and per-track playback checks. Never put a client secret in `EXPO_PUBLIC_*` or commit it to this repository. Add a small token service or another approved integration after API access is available. Tracks marked blocked or preview-only must be represented accurately.

SoundCloud's terms prohibit persistent audio downloads or offline listening through its API. LUNA's offline mode is for audio files that the user imports from their own device. Spotify/SoundCloud playlist-link import and metadata matching need their respective authorized API integrations; LUNA JSON playlist sharing works now.

## Android APK

`eas.json` includes a `preview` build profile that produces an APK. Once the repository is connected to an Expo account and the Android application ID is confirmed, run:

```sh
npx eas-cli@latest build --platform android --profile preview
```

This project has been bundled for Android and web. It has not yet been run on a physical Android device or built as an APK.

## Project layout

- `src/app`: Expo Router screens
- `src/components`: reusable cards, rows, player bar, and dialogs
- `src/context/LunaContext.js`: library state and playback actions
- `src/lib/database.js`: SQLite schema and reads
- `assets/art`: original LUNA artwork

## Design asset prompts

The artwork was generated with the built-in image generation tool for this project:

1. Cinematic midnight lake, luminous crescent moon, distant mountains, cherry blossom branches, lavender and pink moonlight, no text.
2. Night landscape with a bridge, distant lit city, crescent moon, lavender haze, no text.
3. Reflective lake with a torii gate, large pink moon, violet mountains and blossoms, no text.
