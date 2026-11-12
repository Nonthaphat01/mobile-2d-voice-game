# My Little Neighborhood V5 — Firebase Realtime Database

GitHub Pages frontend for 2D community 002, using Firebase Realtime Database for online room slots, messages, and per-user save games.

## Quick setup (required before online mode works)

1. In [Firebase Console](https://console.firebase.google.com/), select project **gamesurvival-58e92**.
2. **Completed:** `config.js` now contains the Firebase Web App config (API key, app ID, and database URL) for `gamesurvival-58e92`. No secret service credentials should be added to public files.
3. Open **Build → Authentication → Sign-in method**. Enable **Email/Password** and (if guest play desired) **Anonymous**. Add the GitHub Pages domain to Firebase Authentication's authorized domains if required.
4. Open **Build → Realtime Database → Rules**, back up existing rules, merge carefully with or publish the supplied `database.rules.json`. Do **not** publish open `.read: true` / `.write: true` rules. The included rules assume this project database is dedicated to this game. If it contains existing data, merge with existing rules instead of overwriting them.
5. Publish static files to GitHub Pages root: `index.html`, `style.css`, `client.js`, `shared/rules.js`, `config.js`, and `firebase-game.js`.
6. Visit GitHub Pages over **HTTPS**. Log in with Email and Password (persists across devices). Anonymous accounts only persist in the browser and may be lost on clearing browser storage.

## Features

- Three rooms (001, **002**, 003), maximum eight reserved lots per room.
- Starter money 100 THB (in-game), 10 plots, hoe, watering can, 3 tomato seeds.
- Save garden, home furniture, inventory, XP, and money under `little-neighborhood-v5/profiles/<uid>`.
- Realtime player positions, 5-second chat bubbles, shared room members, with onDisconnect removal of slots.
- Offline demo still works with browser localStorage if `apiKey` is blank.

## Security and limitations

**Prototype only.** The Firebase rules restrict each profile and room slot to its authenticated owner but **cannot prevent clients from forging their own in-game currency, progress, or movement**. Use a trusted backend (Firebase Cloud Functions or server-authoritative logic) before launching real-money systems or competitive economies. A lost connection between claiming a slot and registering onDisconnect may leave a stale slot, and inactive clients can consume slots; consider lease expiry and Cloud Functions cleanup in production. The provided `database.rules.json` is a setup file only and is NOT deployed to the Firebase Console automatically. Firebase Web API keys may be public, but NEVER commit a service account private key.

The previous V4 code and the old Supabase/Node.js server were **not converted** to Firebase. This deploy is the V5 client (house, farms, room list, chat); live voice/microphone is not part of this frontend revision.
