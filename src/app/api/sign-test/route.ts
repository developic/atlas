import {
  assertSignVideo,
  DEFAULT_SIGN_PROMPT,
  NvidiaSignError,
  parseSignProvider,
  transcribeSigningVideo,
} from "@/lib/nvidia-sign";

/**
 * Signing-video test endpoint: full mp4 in, transcription out.
 *
 * The Baseten turn pipeline has no video input, so this route exists to test
 * whole clips against NVIDIA's omni model directly. The key stays server-side;
 * the client only ever sees the transcript, token counts, and timing.
 */
export async function POST(request: Request) {
  try {
    let form: FormData;

    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: "Attach a video file first." }, { status: 400 });
    }

    const file = form.get("video");
    const prompt = form.get("prompt");
    const provider = parseSignProvider(form.get("provider"));

    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "Attach a video file first." }, { status: 400 });
    }

    const buffer = assertSignVideo(
      Buffer.from(await file.arrayBuffer()),
      file.type,
    );

    const result = await transcribeSigningVideo(
      buffer,
      typeof prompt === "string" && prompt.trim() ? prompt : DEFAULT_SIGN_PROMPT,
      request.signal,
      provider,
    );

    return Response.json(result);
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

    return Response.json({ error: "The sign test failed." }, { status: 500 });
  }
}
