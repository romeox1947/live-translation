# LiveLingo

LiveLingo is an experimental Next.js app that captures audio from a playing
MP4/WebM video, streams 16 kHz PCM chunks to ElevenLabs Realtime Translation,
and plays returned translated PCM audio alongside live captions.

## Requirements

- Node.js 20.9 or newer
- An ElevenLabs API key and voice ID
- An eligible ElevenLabs Enterprise workspace with Realtime Translation access

## Run locally

```powershell
npm install
Copy-Item .env.example .env.local
```

Set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in `.env.local`, then start
the app:

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). For a production build:

```powershell
npm run build
npm start
```

The API key is used only by the server-side WebSocket proxy. The browser never
receives it. The proxy uses ElevenLabs' documented
`wss://api.elevenlabs.io/v1/translation/realtime` endpoint and does not fall
back to another translation provider.

## Video and audio limitations

- Use a direct, publicly accessible MP4 or WebM URL, or a YouTube video/Shorts
  link. YouTube streams are resolved by the server and proxied to the player.
- Remote video hosts must permit cross-origin playback and audio access (CORS).
  Local MP4/WebM uploads avoid the remote-host CORS requirement.
- Audio is streamed in real time while the video is playing; pausing or seeking
  clears queued translated audio. Translation latency varies and is reported as
  queued audio time, not guaranteed end-to-end synchronization.
- Browsers may require a user gesture before audio playback. Start the video or
  translation from the page controls to enable audio.
- Realtime Translation is Enterprise-only. A missing key, invalid voice,
  insufficient quota, or provider access restriction is shown as an error; no
  demo or simulated audio is used.

## Checks

```powershell
npm run typecheck
npm run build
```

# live-translation
