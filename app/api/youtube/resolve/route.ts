import ytdl from "@distube/ytdl-core";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url || !ytdl.validateURL(url)) {
    return NextResponse.json(
      { message: "Enter a valid YouTube video or Shorts URL." },
      { status: 400 },
    );
  }

  try {
    const info = await ytdl.getBasicInfo(url);
    const format = ytdl.chooseFormat(info.formats, {
      quality: "highest",
      filter: "audioandvideo",
    });
    if (!format.url) {
      throw new Error("No playable audio and video stream was found.");
    }

    const streamUrl = new URL("/api/youtube/stream", request.url);
    streamUrl.searchParams.set("url", url);

    return NextResponse.json({
      title: info.videoDetails.title,
      duration: Number(info.videoDetails.lengthSeconds),
      streamUrl: streamUrl.toString(),
    });
  } catch (caught) {
    const rawMessage =
      caught instanceof Error
        ? caught.message
        : "Could not resolve this YouTube video.";
    if (
      rawMessage.includes("429") ||
      rawMessage.toLowerCase().includes("too many requests")
    ) {
      return NextResponse.json(
        {
          message:
            "YouTube is temporarily rate-limiting this server. Wait a few minutes and try again.",
        },
        { status: 429 },
      );
    }
    const message =
      rawMessage || "Could not resolve this YouTube video.";
    return NextResponse.json({ message }, { status: 422 });
  }
}
