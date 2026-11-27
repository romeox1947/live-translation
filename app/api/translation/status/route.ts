import { NextResponse } from "next/server";

export function GET() {
  const configured = Boolean(
    process.env.ELEVENLABS_API_KEY?.trim() &&
      process.env.ELEVENLABS_VOICE_ID?.trim(),
  );
  return NextResponse.json({
    configured,
    message: configured
      ? "Server credentials are configured. Enterprise access is checked when connecting."
      : "Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env.local.",
  });
}
