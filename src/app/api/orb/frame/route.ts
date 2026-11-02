import {
  FrameVideoError,
  assertFrameClip,
  describeCameraClip,
} from "@/lib/frame-video";

/**
 * The `frame` tool's vision pass: one short MP4 clip in, one typed
 * description out. The main conversational model never receives video, so this
 * route is the bridge; its text becomes the next turn's context.
 *
 * Clips are analyzed and discarded — nothing is stored or logged.
 */
export async function POST(request: Request) {
  try {
    let form: FormData;

    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }

    const file = form.get("video");

    if (!(file instanceof File)) {
      return Response.json({ error: "No camera clip arrived." }, { status: 400 });
    }

    const clip = assertFrameClip(Buffer.from(await file.arrayBuffer()), file.type);
    const question = form.get("question");
    const result = await describeCameraClip(
      clip.buffer,
      clip.mimeType,
      typeof question === "string" ? question : "",
      request.signal,
    );

    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof FrameVideoError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      return Response.json({ error: "The request was stopped." }, { status: 499 });
    }

    return Response.json({ error: "The camera clip failed." }, { status: 500 });
  }
}
