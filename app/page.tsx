"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { TranslationCaptions } from "../components/TranslationCaptions";
import { TranslationControls } from "../components/TranslationControls";
import { VideoUrlInput } from "../components/VideoUrlInput";
import {
  useRealtimeTranslation,
  type Eagerness,
} from "../hooks/useRealtimeTranslation";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSource, setVideoSource] = useState("");
  const [videoName, setVideoName] = useState("");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playerError, setPlayerError] = useState("");
  const [language, setLanguage] = useState("hi");
  const [eagerness, setEagerness] = useState<Eagerness>("medium");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const translation = useRealtimeTranslation(videoRef);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/translation/status", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Status request failed");
        const status = (await response.json()) as { configured: boolean };
        setConfigured(status.configured);
      })
      .catch(() => {
        if (!controller.signal.aborted) setConfigured(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const source = videoSource;
    return () => {
      if (source.startsWith("blob:")) URL.revokeObjectURL(source);
    };
  }, [videoSource]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => setDuration(video.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => {
      if (videoSource) {
        setPlayerError(
          "This video could not be played. Confirm it is a public MP4/WebM file and its host permits cross-origin playback (CORS).",
        );
      }
    };
    video.addEventListener("timeupdate", updateTime);
    video.addEventListener("loadedmetadata", updateDuration);
    video.addEventListener("durationchange", updateDuration);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onPause);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("timeupdate", updateTime);
      video.removeEventListener("loadedmetadata", updateDuration);
      video.removeEventListener("durationchange", updateDuration);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onPause);
      video.removeEventListener("error", onError);
    };
  }, [videoSource]);

  const loadVideo = useCallback(
    (source: string, label: string) => {
      translation.stop();
      setPlayerError("");
      setVideoSource(source);
      setVideoName(label);
      setCurrentTime(0);
      setDuration(0);
      setPlaying(false);
      setPlaybackRate(1);
      if (videoRef.current) videoRef.current.playbackRate = 1;
    },
    [translation.stop],
  );

  function startTranslation(targetLanguage: string, targetEagerness: Eagerness) {
    if (playbackRate > 1) {
      setPlaybackRate(1);
      if (videoRef.current) videoRef.current.playbackRate = 1;
    }
    void translation.start({
      targetLanguage,
      eagerness: targetEagerness,
    });
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video || !videoSource) return;
    if (video.paused) {
      try {
        await video.play();
        setPlayerError("");
      } catch {
        setPlayerError("Playback was blocked by the browser. Press Play again to allow it.");
      }
    } else {
      video.pause();
    }
  }

  function changeLanguage(nextLanguage: string) {
    const wasActive =
      translation.connection === "connected" ||
      translation.connection === "connecting";
    setLanguage(nextLanguage);
    if (nextLanguage === "original") {
      if (wasActive) translation.stop();
      else translation.setAudioMode("original");
      return;
    }
    if (wasActive) {
      translation.stop();
      startTranslation(nextLanguage, eagerness);
    }
  }

  function changeEagerness(nextEagerness: Eagerness) {
    const wasActive =
      translation.connection === "connected" ||
      translation.connection === "connecting";
    setEagerness(nextEagerness);
    if (wasActive && language !== "original") {
      translation.stop();
      startTranslation(language, nextEagerness);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="LiveLingo home">
          <span className="brand-mark"><span /></span>
          <span className="brand-copy">
            <strong>LiveLingo</strong>
            <small>Watch anything. Understand everything.</small>
          </span>
        </a>
        <ConnectionStatus
          connection={translation.connection}
          configured={configured}
        />
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow intro-eyebrow">YOUR VIDEO, IN YOUR LANGUAGE</p>
          <h1>Stay in the moment.<br /><span>Understand every word.</span></h1>
          <p className="intro-copy">
            Live spoken translation for direct video files, powered by ElevenLabs.
          </p>
        </div>
        <div className="intro-badge">
          <span className="waveform" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>
          <span>Real-time audio</span>
        </div>
      </section>

      <div className="workspace-grid">
        <div className="main-column">
          <section className="video-card" aria-label="Video player">
            <div className={`video-stage ${videoSource ? "has-video" : ""}`}>
              <video
                ref={videoRef}
                className="video-element"
                src={videoSource || undefined}
                crossOrigin="anonymous"
                playsInline
                preload="metadata"
              />
              {!videoSource && (
                <div className="empty-video">
                  <div className="play-orb"><span /></div>
                  <strong>Your next watch starts here</strong>
                  <p>Add a video URL or upload a file to begin.</p>
                </div>
              )}
              {videoSource && !playing && (
                <button
                  type="button"
                  className="center-play"
                  onClick={() => void togglePlayback()}
                  aria-label="Play video"
                >
                  <span />
                </button>
              )}
              {translation.connection === "connected" && (
                <div className="video-live-badge"><span className="status-dot" /> LIVE TRANSLATION</div>
              )}
            </div>

            <div className="player-controls">
              <div className="timeline-row">
                <span className="timecode">{formatTime(currentTime)}</span>
                <input
                  aria-label="Video position"
                  className="timeline"
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={Math.min(currentTime, duration || currentTime)}
                  disabled={!videoSource || duration === 0}
                  style={{
                    "--progress": `${duration ? (currentTime / duration) * 100 : 0}%`,
                  } as CSSProperties}
                  onChange={(event) => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = Number(event.target.value);
                      setCurrentTime(videoRef.current.currentTime);
                    }
                  }}
                />
                <span className="timecode">{formatTime(duration)}</span>
              </div>
              <div className="player-bottom">
                <div className="player-left">
                  <button
                    type="button"
                    className="play-button"
                    onClick={() => void togglePlayback()}
                    disabled={!videoSource}
                    aria-label={playing ? "Pause video" : "Play video"}
                  >
                    {playing ? <span className="pause-icon" /> : <span className="play-icon" />}
                  </button>
                  <span className="video-title">{videoName || "No video loaded"}</span>
                </div>
                <label className="speed-control">
                  <span>Speed</span>
                  <select
                    aria-label="Playback speed"
                    value={playbackRate}
                    disabled={!videoSource}
                    onChange={(event) => {
                      const rate = Number(event.target.value);
                      if (
                        rate > 1 &&
                        (translation.connection === "connected" ||
                          translation.connection === "connecting")
                      ) {
                        return;
                      }
                      setPlaybackRate(rate);
                      if (videoRef.current) videoRef.current.playbackRate = rate;
                    }}
                  >
                    <option value={0.75}>0.75×</option>
                    <option value={1}>1×</option>
                    <option value={1.25} disabled={translation.connection === "connected" || translation.connection === "connecting"}>1.25×</option>
                    <option value={1.5} disabled={translation.connection === "connected" || translation.connection === "connecting"}>1.5×</option>
                    <option value={2} disabled={translation.connection === "connected" || translation.connection === "connecting"}>2×</option>
                  </select>
                </label>
              </div>
            </div>
          </section>

          <div className="source-card">
            <div className="source-title">
              <span className="source-number">01</span>
              <div>
                <h2>Choose your video</h2>
                <p>Use a public direct video link or a local file.</p>
              </div>
            </div>
            <VideoUrlInput onLoad={loadVideo} />
          </div>

          {(playerError || translation.error || translation.warning) && (
            <div className={`notice ${translation.error ? "notice-error" : "notice-warning"}`} role="alert">
              <span className="notice-icon" aria-hidden="true">{translation.error ? "!" : "i"}</span>
              <div>
                {playerError && <p>{playerError}</p>}
                {translation.error && <p>{translation.error}</p>}
                {translation.warning && <p>{translation.warning}</p>}
              </div>
              <button
                type="button"
                className="notice-close"
                aria-label="Dismiss messages"
                onClick={() => setPlayerError("")}
              >
                ×
              </button>
            </div>
          )}

          <TranslationCaptions
            partialTranscript={translation.partialTranscript}
            finalTranscripts={translation.finalTranscripts}
            translations={translation.translations}
          />
        </div>

        <aside className="side-column">
          <TranslationControls
            language={language}
            eagerness={eagerness}
            connection={translation.connection}
            audioMode={translation.audioMode}
            hasVideo={Boolean(videoSource)}
            latencyMs={translation.latencyMs}
            onLanguageChange={changeLanguage}
            onEagernessChange={changeEagerness}
            onStart={() => startTranslation(language, eagerness)}
            onStop={translation.stop}
            onAudioModeChange={translation.setAudioMode}
          />

          <section className="how-card">
            <p className="eyebrow">HOW IT WORKS</p>
            <div className="step-list">
              <div className="step">
                <span>1</span>
                <div><strong>Load your video</strong><p>Direct MP4/WebM links or local files.</p></div>
              </div>
              <div className="step">
                <span>2</span>
                <div><strong>Pick a language</strong><p>Choose Hindi, Marathi, Gujarati or Tamil.</p></div>
              </div>
              <div className="step">
                <span>3</span>
                <div><strong>Listen as you watch</strong><p>Original audio stays one tap away.</p></div>
              </div>
            </div>
          </section>

          {configured === false && (
            <div className="setup-card">
              <span className="setup-icon">⌘</span>
              <div>
                <strong>Connect your ElevenLabs account</strong>
                <p>Add your API key and voice ID to <code>.env.local</code>, then restart the app.</p>
              </div>
            </div>
          )}
        </aside>
      </div>

      <footer className="page-footer">
        <span>LiveLingo · Experimental translation, not a perfect dub.</span>
        <span>YouTube videos are streamed through this app for playback and translation.</span>
      </footer>
    </main>
  );
}
