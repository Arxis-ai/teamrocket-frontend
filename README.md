# AI Reality Show — Director's Dashboard

The control room for an autonomous, audio-first AI reality show. Twelve AI contestants talk in several conversations running at once; you watch as the director — tune into any one to hear it live, and whisper into a contestant's ear to steer where it goes.

Next.js frontend for the [show engine](https://github.com/Arxis-ai/teamrocket-backend). Built for the Pocket FM **Zero to One 2026** hackathon (P3: Interactive Entertainment).

---

## The dashboard

| Panel | What it shows |
|---|---|
| **Conversations** | Every group running right now. Click one to tune in — only that conversation is audible and visible. |
| **Contestants** | Who's listening to you, who's mid-conversation elsewhere, who's off screen. |
| **Trust Network** | Live trust graph. Edges appear only between people actually talking to each other, and the current speaker pulses. |
| **Spoken Dialogue** | What contestants actually say out loud, revealed in time with the voice saying it. |
| **Inner Monologue** | What they're really thinking. Never shared with any other character. |
| **God Mic** | Hold to dictate, or type, then whisper it to a contestant mid-scene. |

## Key implementation details

**Captions are paced by audio, not by arrival.** A `dialogue_turn` doesn't render when it arrives — it waits in `pendingTurns` until `AudioPlayer` confirms that line actually started playing, then moves into the transcript. Otherwise text races ahead of the voice reading it.

**Audio is assembled per line, never per chunk.** The backend streams MP3 bytes at arbitrary byte boundaries, so an individual `audio_chunk` is not a decodable file. Bytes accumulate until `audio_end`, then decode once.

**Every finished line is acknowledged.** `playback_done` goes back on every path that resolves a turn — played, decode-failed, or discarded on a focus switch. The backend holds that conversation until it arrives, so missing any one path would stall the show until a server-side timeout.

**The socket reconnects itself.** Every control is gated on connection status, so a single dropped socket used to leave *Start* disabled until a full page reload. It now retries with backoff, survives a late-starting backend, and keeps subscriptions alive across reconnects.

**Switching conversations clears the log; a reshuffle doesn't.** You stay tuned to one conversation — the Director walking a contestant in or out doesn't make it a different one, so the dialogue you've been reading survives it. Only an explicit switch resets.

## Running it

```bash
npm install
npx next dev --webpack
```

Open `http://localhost:3000`.

> **Windows note:** use the `--webpack` flag. Turbopack's native binary is blocked by Application Control policy on some machines, and `next dev` / `next build` will fail without it.

### Environment

Create `.env.local`:

```ini
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000/ws/show
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Set `NEXT_PUBLIC_USE_MOCK=true` to run the whole dashboard with **no backend at all**. The mock client in `lib/ws/mockClient.ts` simulates concurrent conversations, Director-driven membership swaps, focus switching and catch-up backfill — enough to develop and demo the UI offline.

For deployment, point `NEXT_PUBLIC_WS_URL` at the deployed backend using `wss://`.

## Project layout

```
app/                      layout, globals.css (light violet theme + animations)
components/dashboard/     the panels described above
components/ui/            shadcn primitives
lib/ws/                   WebSocket contract, real client (with reconnect), mock client
lib/state/                reducer + provider — single source of truth for scene state
lib/deepgram/             scoped-token cache for God Mic
```

State lives in one `useReducer` fed directly by server messages (`lib/state/sceneReducer.ts`); components subscribe through `SceneStateProvider`. Components that need raw message events rather than derived state — the audio player, the trust graph — subscribe via `onMessage`.

## God Mic

Speech streams **browser → Deepgram directly**, never proxied through our backend. The backend only mints a short-lived scoped key (cached in `lib/deepgram/tokenCache.ts`), which is passed as a WebSocket subprotocol. Interim results render live as you speak; only the finalized transcript is sent to the backend, as one whole message rather than chunk-by-chunk.

## Checks

```bash
npx tsc --noEmit
npx eslint .
npx next build --webpack
```

## Stack

Next.js 16 (App Router) · React · TypeScript · Tailwind CSS v4 · shadcn/ui · Web Audio API · Deepgram streaming STT.
