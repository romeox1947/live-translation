import { loadEnvConfig } from "@next/env";
import next from "next";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

loadEnvConfig(process.cwd());

const dev = process.env.NODE_ENV !== "production" && !process.argv.includes("--production");
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev });
const handle = app.getRequestHandler();
const languageCodes = new Set(["hi", "mr", "gu", "ta"]);
const eagernessValues = new Set(["low", "medium", "high"]);

function providerError(statusCode: number): { code: string; message: string } {
  if (statusCode === 401) {
    return {
      code: "authentication",
      message: "ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY.",
    };
  }
  if (statusCode === 402 || statusCode === 429) {
    return {
      code: "quota",
      message: "ElevenLabs quota or plan limits prevented this translation session.",
    };
  }
  if (statusCode === 403) {
    return {
      code: "access",
      message:
        "Realtime Translation is restricted to eligible Enterprise workspaces. Confirm access with ElevenLabs.",
    };
  }
  if (statusCode === 400) {
    return {
      code: "configuration",
      message:
        "ElevenLabs rejected the session settings. Check the voice ID, target language, and account access.",
    };
  }
  return {
    code: "provider",
    message: `ElevenLabs could not start the session (HTTP ${statusCode}).`,
  };
}

function sendError(socket: WebSocket, code: string, message: string) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ message_type: "error", code, message }));
  }
}

async function main() {
  await app.prepare();

  const server = createServer((request, response) => {
    void handle(request, response);
  });
  const webSockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (requestUrl.pathname !== "/api/translation/socket") {
      socket.destroy();
      return;
    }

    const origin = request.headers.origin;
    try {
      if (!origin || new URL(origin).host !== request.headers.host) {
        socket.destroy();
        return;
      }
    } catch {
      socket.destroy();
      return;
    }

    webSockets.handleUpgrade(request, socket, head, (client) => {
      webSockets.emit("connection", client, request);
    });
  });

  webSockets.on("connection", (client) => {
    let upstream: WebSocket | undefined;
    let started = false;
    let configTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      sendError(client, "configuration", "Translation session configuration timed out.");
      client.close(1008, "Configuration timeout");
    }, 10_000);

    client.on("message", (rawMessage) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(rawMessage.toString()) as Record<string, unknown>;
      } catch {
        sendError(client, "protocol", "Invalid message sent to the translation proxy.");
        return;
      }

      if (!started) {
        if (
          message.type !== "start" ||
          typeof message.targetLanguage !== "string" ||
          !languageCodes.has(message.targetLanguage) ||
          typeof message.eagerness !== "string" ||
          !eagernessValues.has(message.eagerness) ||
          (message.sourceLanguage !== undefined &&
            typeof message.sourceLanguage !== "string")
        ) {
          sendError(client, "configuration", "Unsupported translation session settings.");
          client.close(1008, "Invalid session settings");
          return;
        }

        const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
        const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
        if (!apiKey || !voiceId) {
          sendError(
            client,
            "configuration",
            "Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env.local, then restart the app.",
          );
          client.close(1011, "Missing server configuration");
          return;
        }

        started = true;
        if (configTimer) clearTimeout(configTimer);
        const query = new URLSearchParams({
          target_language: message.targetLanguage,
          voice_id: voiceId,
          input_format: "pcm_16000",
          output_format: "pcm_22050",
          tts_model_id: "eleven_v4_turbo",
          eagerness: message.eagerness,
        });
        if (typeof message.sourceLanguage === "string" && message.sourceLanguage) {
          query.set("source_language", message.sourceLanguage);
        }

        upstream = new WebSocket(
          `wss://api.elevenlabs.io/v1/translation/realtime?${query.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "xi-api-key": apiKey,
            },
          },
        );
        upstream.on("open", () => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ message_type: "proxy_connected" }));
          }
        });
        upstream.on("message", (data, isBinary) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(data, { binary: isBinary });
          }
        });
        upstream.on("unexpected-response", (_request, response) => {
          const error = providerError(response.statusCode ?? 500);
          sendError(client, error.code, error.message);
          client.close(1011, error.message);
          upstream?.terminate();
        });
        upstream.on("error", () => {
          sendError(
            client,
            "network",
            "Could not connect to ElevenLabs. Check the network and try again.",
          );
          client.close(1011, "Could not connect to ElevenLabs.");
        });
        upstream.on("close", (code, reason) => {
          if (client.readyState === WebSocket.OPEN) {
            if (code !== 1000 && code !== 1005) {
              const providerReason = reason.toString().trim();
              const detail =
                providerReason ||
                "ElevenLabs closed the translation session unexpectedly.";
              sendError(
                client,
                "provider",
                detail,
              );
              client.close(
                1011,
                `${detail} (provider close code ${code})`.slice(0, 123),
              );
              return;
            }
            client.close(1000, "Translation session ended");
          }
        });
        return;
      }

      if (!upstream || upstream.readyState !== WebSocket.OPEN) return;
      if (
        message.message_type === "input_audio_chunk" &&
        typeof message.audio_base_64 === "string"
      ) {
        upstream.send(JSON.stringify(message));
      } else if (message.message_type === "end_of_stream") {
        upstream.send(JSON.stringify({ message_type: "end_of_stream" }));
      }
    });

    client.on("close", () => {
      if (configTimer) clearTimeout(configTimer);
      if (upstream && upstream.readyState < WebSocket.CLOSING) {
        upstream.close(1000, "Client disconnected");
      }
    });
  });

  server.listen(port, () => {
    console.log(`LiveLingo ready on http://localhost:${port}`);
  });
}

void main();
