import {
  assertSignVideo,
  DEFAULT_SIGN_PROMPT,
  NvidiaSignError,
  transcribeSigningVideo,
} from "@/lib/nvidia-sign";

const MAX_VIDEO_BYTES = 15 * 1024 * 1024;

/**
 * Dashboard signing route: a recorded video clip in, plain text out.
 *
 * Only the transcription prompt is sent with the video — never the Atlas
 * system prompt. The returned text enters the normal turn as if typed, so
 * the full prompt, tools, cards, and speech all apply there.
 */
export async function POST(request: Request) {
  try {
    let form: FormData;

    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: "Attach a video clip first." }, { status: 400 });
    }

    const file = form.get("video");

    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "Attach a video clip first." }, { status: 400 });
    }

    if (file.size > MAX_VIDEO_BYTES) {
      return Response.json(
        { error: "That clip is too large. Keep it under 15 MB." },
        { status: 400 },
      );
    }

    const buffer = assertSignVideo(
      Buffer.from(await file.arrayBuffer()),
      file.type,
    );

    const result = await transcribeSigningVideo(
      buffer,
      DEFAULT_SIGN_PROMPT,
      request.signal,
      "opencode",
    );

    return Response.json({ transcript: result.transcript });
  } catch (error) {
    if (error instanceof NvidiaSignError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      return Response.json({ error: "The request was stopped." }, { status: 499 });
    }

    return Response.json({ error: "The transcription failed." }, { status: 500 });
  }
}
