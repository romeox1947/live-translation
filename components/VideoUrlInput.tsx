"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

type Props = {
  onLoad: (source: string, label: string) => void;
};

export function VideoUrlInput({ onLoad }: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function loadUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      setError("Enter a complete video URL starting with https://.");
      return;
    }

    const host = parsed.hostname.toLowerCase();
    if (
      host === "youtu.be" ||
      host.endsWith(".youtube.com") ||
      host === "youtube.com" ||
      host.endsWith(".youtube-nocookie.com")
    ) {
      setError(
        "YouTube links are not supported. Use a direct MP4/WebM URL or upload a video file.",
      );
      return;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      setError("Video links must use HTTP or HTTPS.");
      return;
    }

    onLoad(parsed.toString(), parsed.pathname.split("/").pop() || parsed.hostname);
  }

  function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const validType =
      file.type === "video/mp4" ||
      file.type === "video/webm" ||
      /\.(mp4|webm)$/i.test(file.name);
    if (!validType) {
      setError("Choose an MP4 or WebM video file.");
      event.target.value = "";
      return;
    }

    setError("");
    onLoad(URL.createObjectURL(file), file.name);
    event.target.value = "";
  }

  return (
    <div className="source-controls">
      <form className="url-form" onSubmit={loadUrl}>
        <label className="sr-only" htmlFor="video-url">
          Video URL
        </label>
        <span className="url-icon" aria-hidden="true">
          ↗
        </span>
        <input
          id="video-url"
          type="url"
          placeholder="Paste a direct MP4 or WebM video URL"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <button type="submit" className="button button-secondary">
          Load video
        </button>
      </form>
      <div className="source-footer">
        <span>Direct video files only. The video host must allow CORS for audio capture.</span>
        <button
          className="upload-button"
          type="button"
          onClick={() => fileInput.current?.click()}
        >
          <span aria-hidden="true">＋</span> Upload a video
        </button>
        <input
          ref={fileInput}
          className="sr-only"
          type="file"
          accept="video/mp4,video/webm,.mp4,.webm"
          onChange={loadFile}
        />
      </div>
      {error && <p className="inline-error">{error}</p>}
    </div>
  );
}
