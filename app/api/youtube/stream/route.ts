import ytdl from "@distube/ytdl-core";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url || !ytdl.validateURL(url)) {
    return new Response("Invalid YouTube URL", { status: 400 });
  }

  const range = request.headers.get("range");
  let rangeOptions: { start: number; end: number } | undefined;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : start + 1024 * 1024 - 1;
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        rangeOptions = { start, end };
      }
    }
  }

  try {
    const stream = ytdl(url, {
      quality: "highest",
      filter: "audioandvideo",
      ...(rangeOptions ? { range: rangeOptions } : {}),
    });
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new Response(webStream, {
      status: rangeOptions ? 206 : 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "Content-Type": "video/mp4",
        ...(rangeOptions
          ? { "Content-Range": `bytes ${rangeOptions.start}-${rangeOptions.end}/*` }
          : {}),
      },
    });
  } catch (caught) {
    const message =
      caught instanceof Error
        ? caught.message
        : "Could not start the YouTube video stream.";
    return new Response(message, { status: 422 });
  }
}
