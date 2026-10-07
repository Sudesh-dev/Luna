# LUNA SoundCloud Broker

> Legacy integration, retained for reference. The current LUNA app does not call this worker and does not require deployment or SoundCloud API credentials. SoundCloud is now a metadata import source through its official Widget API. Do not deploy this broker to run LUNA.

This Cloudflare Worker keeps the SoundCloud client secret outside the Expo application. It stores no user or music data. It caches the client-credentials token, proxies track search, and redirects playback to a permitted SoundCloud stream URL.

## Configure and deploy

```sh
cd soundcloud-worker
npx wrangler@latest login
npx wrangler@latest secret put SOUNDCLOUD_CLIENT_ID
npx wrangler@latest secret put SOUNDCLOUD_CLIENT_SECRET
npx wrangler@latest secret put LUNA_CLIENT_KEY
npm run deploy
```

Set `ALLOWED_ORIGINS` in `wrangler.toml` when using the web build. Native Expo requests do not send a browser origin. The client key limits casual use of a private deployment, but it is not a true secret because an installed app can be inspected.

Never place the SoundCloud client secret in an Expo environment variable or commit it to this repository.
