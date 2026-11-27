import type {
  AudioMode,
  ConnectionState,
  Eagerness,
} from "../hooks/useRealtimeTranslation";
import { LanguageSelector } from "./LanguageSelector";

type Props = {
  language: string;
  eagerness: Eagerness;
  connection: ConnectionState;
  audioMode: AudioMode;
  hasVideo: boolean;
  latencyMs: number | null;
  onLanguageChange: (language: string) => void;
  onEagernessChange: (eagerness: Eagerness) => void;
  onStart: () => void;
  onStop: () => void;
  onAudioModeChange: (mode: AudioMode) => void;
};

export function TranslationControls({
  language,
  eagerness,
  connection,
  audioMode,
  hasVideo,
  latencyMs,
  onLanguageChange,
  onEagernessChange,
  onStart,
  onStop,
  onAudioModeChange,
}: Props) {
  const active = connection === "connected" || connection === "connecting";

  return (
    <section className="translation-card" aria-label="Translation controls">
      <div className="card-heading">
        <div>
          <p className="eyebrow">LIVE TRANSLATION</p>
          <h2>Make this video yours</h2>
        </div>
        {latencyMs !== null && active && (
          <div className="latency-chip" title="Queued translated audio, estimated from playback scheduling">
            <span className="latency-bars" aria-hidden="true">▮▮▮</span>
            {latencyMs < 1000 ? `${latencyMs} ms behind` : `${(latencyMs / 1000).toFixed(1)} s behind`}
          </div>
        )}
      </div>

      <LanguageSelector
        language={language}
        eagerness={eagerness}
        onLanguageChange={onLanguageChange}
        onEagernessChange={onEagernessChange}
      />

      <div className="action-row">
        {active ? (
          <button type="button" className="button button-stop" onClick={onStop}>
            <span className="stop-square" aria-hidden="true" />
            Stop translation
          </button>
        ) : (
          <button
            type="button"
            className="button button-primary"
            onClick={onStart}
            disabled={!hasVideo || language === "original"}
          >
            <span className="sparkle" aria-hidden="true">✦</span>
            Start live translation
          </button>
        )}
        {connection === "connecting" && (
          <span className="connecting-label">Opening secure session…</span>
        )}
      </div>

      <div className="audio-switch">
        <span className="audio-switch-label">Audio output</span>
        <div className="segmented-control" role="group" aria-label="Audio output">
          <button
            type="button"
            aria-pressed={audioMode === "original"}
            className={audioMode === "original" ? "selected" : ""}
            onClick={() => onAudioModeChange("original")}
          >
            Original
          </button>
          <button
            type="button"
            aria-pressed={audioMode === "translated"}
            className={audioMode === "translated" ? "selected" : ""}
            onClick={() => onAudioModeChange("translated")}
            disabled={connection !== "connected"}
          >
            Translated
          </button>
        </div>
      </div>
      <p className="control-note">
        Translation requires an eligible ElevenLabs Enterprise workspace. Audio is captured only while this video plays.
        {active && " Playback is limited to 1× to keep audio streaming in real time."}
      </p>
    </section>
  );
}
