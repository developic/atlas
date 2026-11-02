import {
  assertSignVideo,
  DEFAULT_SIGN_PROMPT,
  SignVideoError,
  acceptableSignUtterance,
  transcribeSigningVideo,
} from "@/lib/sign-video";
import { capabilitiesFor, isAccessMode } from "@/lib/access-modes";

const MAX_VIDEO_BYTES = 15 * 1024 * 1024;

/**
 * Dashboard signing route: a recorded video clip in, plain text out.
 *
 * Only the transcription prompt is sent with the video — never the Atlas
 * system prompt. The returned text enters the normal turn as if typed, so
 * the full prompt, tools, cards, and speech all apply there.
 *
 * Sign recognition is a permissioned capability: the request must name the
 * selected mode (mute or deaf only) and carry the user's consent flag. The
 * normal camera path (`open_camera`) does not depend on this route.
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
    const mode = form.get("mode");

    // Sign recognition is a permissioned capability: mute and deaf only, and
    // only when the client says signing was explicitly activated.
    if (!isAccessMode(mode) || !capabilitiesFor(mode).sign) {
      return Response.json(
        { error: "Sign recognition is not available in this access mode." },
        { status: 403 },
      );
    }

    if (form.get("consent") !== "1") {
      return Response.json(
        { error: "Sign recognition needs your permission first." },
        { status: 403 },
      );
    }

    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "Attach a video clip first." }, { status: 400 });
    }

    if (file.size > MAX_VIDEO_BYTES) {
      return Response.json(
        { error: "That clip is too large. Keep it under 15 MB." },
        { status: 400 },
      );
    }

    const clip = assertSignVideo(
      Buffer.from(await file.arrayBuffer()),
      file.type,
    );

    const result = await transcribeSigningVideo(
      clip.buffer,
      DEFAULT_SIGN_PROMPT,
      request.signal,
      clip.mimeType,
    );

    // `sign-video.ts` returns the structured contract (transcription field +
    // readable flag), so the analysis can never enter the turn. The remaining
    // checks are deterministic caps, not wording heuristics: unreadable or
    // over-long results get a retry instead of a guess.
    const utterance = acceptableSignUtterance(result.transcript);

    if (!result.readable || !utterance) {
      return Response.json(
        { error: "I couldn’t read that signing. Try again." },
        { status: 502 },
      );
    }

    return Response.json({ transcript: utterance });
  } catch (error) {
    if (error instanceof SignVideoError) {
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
