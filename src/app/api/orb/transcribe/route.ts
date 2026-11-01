import {
  assertSignVideo,
  DEFAULT_SIGN_PROMPT,
  SignVideoError,
  transcribeSigningVideo,
} from "@/lib/sign-video";

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
    );

    // The reply should end with a "Transcription:" line holding the best
    // reading, but the model renames the final label across runs — so fall
    // back to the last non-empty line as long as it is short and not a
    // heading. Only that line enters the turn: the analysis must never be
    // spoken. A long or missing final line means the read failed: surface a
    // retry instead of speaking the analysis aloud. A short bare reply (no
    // analysis at all) is used as-is.
    const words = (value: string) => value.split(/\s+/).filter(Boolean);
    // Strip list markers, emphasis, and spoken-output labels from either end.
    const cleanLabel = (value: string) =>
      value
        .replace(/^(?:[A-Za-z][A-Za-z'’\- ]{0,28}:\s*)+/, "")
        .replace(/^[-\u2022\s]*((?:segment|step|pass)\s+\d+\s*:?\s*)+/i, "")
        .replace(/^[\s*#_"“”]+|[\s*_"“”]+$/g, "")
        .trim();
    const explicit = cleanLabel(
      result.transcript.match(/(?:^|\n)\s*Transcription:\s*([\s\S]+?)\s*$/im)?.[1] ?? "",
    );
    const tailLines = result.transcript
      .split("\n")
      .map((line) => line.trim().replace(/^\*+|\*+$/g, "").trim())
      .filter(Boolean);
    const tail = tailLines[tailLines.length - 1] ?? "";
    const isHeading =
      /^(#{1,6}\s+|\d+\.\s*|pass\s+\d|segments?|signs?|utterance|english\s*:)/i.test(tail);
    const unlabeled = cleanLabel(tail);
    const shortTail =
      unlabeled && !isHeading && words(unlabeled).length <= 12 ? unlabeled : "";
    const utterance = explicit || shortTail || (words(result.transcript.trim()).length <= 12 ? result.transcript.trim() : "");

    if (!utterance || words(utterance).length > 30 || /^unclear\.?$/i.test(utterance)) {
      return Response.json(
        { error: "I couldn't read that signing. Try again." },
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
