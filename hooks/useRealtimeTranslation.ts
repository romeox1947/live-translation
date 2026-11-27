"use client";

import { useCallback, useRef, useState } from "react";

export type AudioMode = "original" | "translated";
export type ConnectionState = "idle" | "connecting" | "connected" | "error";
export type Eagerness = "low" | "medium" | "high";

type TranslationOptions = {
  targetLanguage: string;
  eagerness: Eagerness;
};

type ServerMessage = {
  message_type?: string;
  text?: string;
  data?: string;
  sample_rate?: number;
  code?: string;
  message?: string;
  error?: string;
};

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function useRealtimeTranslation(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [audioMode, setAudioModeState] = useState<AudioMode>("original");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [finalTranscripts, setFinalTranscripts] = useState<string[]>([]);
  const [translations, setTranslations] = useState<string[]>([]);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const workletLoadedRef = useRef(false);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const originalGainRef = useRef<GainNode | null>(null);
  const captureNodeRef = useRef<
    (AudioWorkletNode & { cleanup?: () => void }) | null
  >(null);
  const scheduledSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextPlayTimeRef = useRef(0);
  const activeRef = useRef(false);
  const generationRef = useRef(0);
  const silentChunksRef = useRef(0);
  const modeRef = useRef<AudioMode>("original");

  const clearTranslatedAudio = useCallback(() => {
    for (const source of scheduledSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // A scheduled source may already have ended.
      }
    }
    scheduledSourcesRef.current.clear();
    nextPlayTimeRef.current = contextRef.current?.currentTime ?? 0;
    setLatencyMs(0);
  }, []);

  const setAudioMode = useCallback(
    (mode: AudioMode) => {
      modeRef.current = mode;
      setAudioModeState(mode);
      if (originalGainRef.current) {
        originalGainRef.current.gain.setTargetAtTime(
          mode === "original" ? 1 : 0,
          contextRef.current?.currentTime ?? 0,
          0.015,
        );
      }
      if (mode === "original") clearTranslatedAudio();
    },
    [clearTranslatedAudio],
  );

  const stop = useCallback(
    (showError?: string) => {
      generationRef.current += 1;
      activeRef.current = false;
      captureNodeRef.current?.cleanup?.();
      if (captureNodeRef.current) {
        sourceRef.current?.disconnect(captureNodeRef.current);
      }
      captureNodeRef.current?.disconnect();
      captureNodeRef.current?.port.close();
      captureNodeRef.current = null;
      clearTranslatedAudio();
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ message_type: "end_of_stream" }));
        socket.close(1000, "Translation stopped");
      } else if (socket && socket.readyState < WebSocket.CLOSING) {
        socket.close(1000, "Translation stopped");
      }
      setAudioMode("original");
      setConnection(showError ? "error" : "idle");
      setError(showError ?? "");
    },
    [clearTranslatedAudio, setAudioMode],
  );

  const playTranslatedAudio = useCallback((data: string, sampleRate: number) => {
    const context = contextRef.current;
    if (!context || modeRef.current !== "translated") return;
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const sampleCount = Math.floor(bytes.byteLength / 2);
    if (sampleCount === 0) return;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const audioBuffer = context.createBuffer(1, sampleCount, sampleRate);
    const channel = audioBuffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) {
      channel[index] = view.getInt16(index * 2, true) / 0x8000;
    }

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    const startAt = Math.max(nextPlayTimeRef.current, context.currentTime + 0.08);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + audioBuffer.duration;
    scheduledSourcesRef.current.add(source);
    source.onended = () => scheduledSourcesRef.current.delete(source);
    setLatencyMs(Math.max(0, Math.round((nextPlayTimeRef.current - context.currentTime) * 1000)));
  }, []);

  const start = useCallback(
    async ({ targetLanguage, eagerness }: TranslationOptions) => {
      const video = videoRef.current;
      if (!video || !video.src) {
        setError("Load a direct MP4 or WebM video before starting translation.");
        setConnection("error");
        return;
      }
      if (activeRef.current) return;

      setError("");
      setWarning("");
      setPartialTranscript("");
      setFinalTranscripts([]);
      setTranslations([]);
      silentChunksRef.current = 0;
      setConnection("connecting");
      setAudioMode("translated");
      const requestGeneration = ++generationRef.current;

      try {
        const context = contextRef.current ?? new AudioContext();
        contextRef.current = context;
        const resumePromise = context.resume();
        await resumePromise;
        if (requestGeneration !== generationRef.current) return;

        const statusResponse = await fetch("/api/translation/status");
        if (requestGeneration !== generationRef.current) return;
        if (!statusResponse.ok) throw new Error("Could not check server translation settings.");
        const status = (await statusResponse.json()) as {
          configured: boolean;
          message: string;
        };
        if (!status.configured) throw new Error(status.message);

        if (!sourceRef.current) {
          sourceRef.current = context.createMediaElementSource(video);
          originalGainRef.current = context.createGain();
          sourceRef.current.connect(originalGainRef.current);
          originalGainRef.current.connect(context.destination);
        }
        const originalGain = originalGainRef.current;
        if (!originalGain) throw new Error("Could not initialize the video audio output.");
        originalGain.gain.value = 0;
        if (!context.audioWorklet) {
          throw new Error("This browser does not support AudioWorklet audio capture.");
        }
        if (!workletLoadedRef.current) {
          await context.audioWorklet.addModule("/pcm-capture-processor.js");
          workletLoadedRef.current = true;
        }
        if (requestGeneration !== generationRef.current) return;

        const socketProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(
          `${socketProtocol}//${window.location.host}/api/translation/socket`,
        );
        socketRef.current = socket;

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const timeout = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error("Timed out connecting to ElevenLabs."));
          }, 15_000);

          socket.onopen = () => {
            socket.send(JSON.stringify({ type: "start", targetLanguage, eagerness }));
          };
          socket.onmessage = (event) => {
            let message: ServerMessage;
            try {
              message = JSON.parse(String(event.data)) as ServerMessage;
            } catch {
              return;
            }

            if (
              message.message_type === "auth_error" ||
              message.message_type === "error" ||
              message.error
            ) {
              const providerMessage =
                message.error ??
                message.message ??
                "ElevenLabs could not start the translation session.";
              if (!settled) {
                settled = true;
                window.clearTimeout(timeout);
                reject(new Error(providerMessage));
              } else {
                stop(providerMessage);
              }
              return;
            }
            if (message.message_type === "proxy_connected" && !settled) {
              settled = true;
              window.clearTimeout(timeout);
              resolve();
              return;
            }
            if (message.message_type === "partial_transcript" && message.text) {
              setPartialTranscript(message.text);
            } else if (message.message_type === "final_transcript" && message.text) {
              setPartialTranscript("");
              setFinalTranscripts((previous) => [...previous.slice(-3), message.text!]);
            } else if (message.message_type === "translation" && message.text) {
              setTranslations((previous) => [...previous.slice(-3), message.text!]);
            } else if (
              message.message_type === "audio" &&
              message.data &&
              message.sample_rate
            ) {
              playTranslatedAudio(message.data, message.sample_rate);
            }
          };
          socket.onerror = () => {
            if (!settled) {
              settled = true;
              window.clearTimeout(timeout);
              reject(new Error("Could not connect to the translation service."));
            }
          };
          socket.onclose = (event) => {
            if (!settled) {
              settled = true;
              window.clearTimeout(timeout);
              reject(
                new Error(
                  event.code === 1006
                    ? "WebSocket disconnected. Check the network and retry."
                    : "Translation session closed before it was ready.",
                ),
              );
            } else if (activeRef.current) {
              const closeReason = event.reason?.trim();
              stop(
                closeReason ||
                  "The translation connection closed. Check access and network, then retry.",
              );
            }
          };
        });

        if (requestGeneration !== generationRef.current) {
          socket.close(1000, "Translation stopped");
          return;
        }
        activeRef.current = true;
        setConnection("connected");
        const captureNode = new AudioWorkletNode(context, "pcm-capture", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        captureNodeRef.current = captureNode;
        sourceRef.current!.connect(captureNode);
        captureNode.connect(context.destination);
        captureNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
          const currentSocket = socketRef.current;
          if (
            !activeRef.current ||
            video.paused ||
            !currentSocket ||
            currentSocket.readyState !== WebSocket.OPEN
          ) {
            return;
          }
          const samples = new Int16Array(event.data);
          let energy = 0;
          for (let index = 0; index < samples.length; index += 1) {
            const sample = samples[index] / 32768;
            energy += sample * sample;
          }
          if (Math.sqrt(energy / samples.length) < 0.001) {
            silentChunksRef.current += 1;
            if (silentChunksRef.current >= 30) {
              setWarning(
                "No audio signal is being captured. The video may be silent or its host may block audio access with CORS.",
              );
            }
          } else {
            silentChunksRef.current = 0;
            setWarning((current) =>
              current.startsWith("No audio signal is being captured.") ? "" : current,
            );
          }
          if (currentSocket.bufferedAmount > 256_000) {
            setWarning("Network is slow; audio chunks are being dropped to avoid extra delay.");
            return;
          }
          currentSocket.send(
            JSON.stringify({
              message_type: "input_audio_chunk",
              audio_base_64: bytesToBase64(event.data),
            }),
          );
        };

        const pauseCapture = () => {
          captureNode.port.postMessage("pause");
          clearTranslatedAudio();
        };
        const resumeCapture = () => {
          void context.resume();
          captureNode.port.postMessage("resume");
        };
        const clearOnSeek = () => clearTranslatedAudio();
        video.addEventListener("pause", pauseCapture);
        video.addEventListener("play", resumeCapture);
        video.addEventListener("seeking", clearOnSeek);
        video.addEventListener("ended", pauseCapture);
        (captureNode as AudioWorkletNode & { cleanup?: () => void }).cleanup = () => {
          video.removeEventListener("pause", pauseCapture);
          video.removeEventListener("play", resumeCapture);
          video.removeEventListener("seeking", clearOnSeek);
          video.removeEventListener("ended", pauseCapture);
        };
        if (video.paused) captureNode.port.postMessage("pause");
      } catch (caught) {
        if (requestGeneration !== generationRef.current) return;
        const message =
          caught instanceof Error ? caught.message : "Could not start live translation.";
        stop(message);
      }
    },
    [clearTranslatedAudio, playTranslatedAudio, setAudioMode, stop, videoRef],
  );

  const stopAndRestoreAudio = useCallback(() => {
    stop();
    if (originalGainRef.current && contextRef.current) {
      originalGainRef.current.gain.setTargetAtTime(
        1,
        contextRef.current.currentTime,
        0.015,
      );
    }
  }, [stop]);

  return {
    connection,
    error,
    warning,
    audioMode,
    partialTranscript,
    finalTranscripts,
    translations,
    latencyMs,
    start,
    stop: stopAndRestoreAudio,
    setAudioMode,
  };
}
