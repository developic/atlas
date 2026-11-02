import { capabilitiesFor, isAccessMode } from "@/lib/access-modes";
import {
  GuardError,
  analyzeGuardFrame,
  analyzeGuardVideo,
  assertGuardVideo,
  parseGuardFrame,
} from "@/lib/vision-guard";

/**
 * Blind-mode obstacle warnings: a short live camera clip in, one short spoken
 * instruction out. A single JPEG frame is accepted as a fallback for browsers
 * that cannot record.
 *
 * The app owns activation and delivery; this route only answers "is something
 * in the path right now". Clips and frames are analyzed and discarded —
 * nothing is stored, logged, or added to a conversation.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    return contentType.includes("multipart/form-data")
      ? await fromClip(request)
      : await fromFrame(request);
  } catch (error) {
    return errorResponse(error);
  }
}

async function fromClip(request: Request): Promise<Response> {
  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const mode = form.get("mode");

  if (!isAccessMode(mode) || !capabilitiesFor(mode).guard) {
    throw new GuardError(403, "Obstacle warnings are only available in blind mode.");
  }

  const file = form.get("video");

  if (!(file instanceof File)) {
    throw new GuardError(400, "No camera clip arrived.");
  }

  const clip = assertGuardVideo(Buffer.from(await file.arrayBuffer()), file.type);
  const previous = readPrevious(form.get("previous"));
  const result = await analyzeGuardVideo(
    clip.buffer,
    clip.mimeType,
    previous,
    request.signal,
  );

  return noStore(result);
}

async function fromFrame(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const record =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const mode = record.mode;

  if (!isAccessMode(mode) || !capabilitiesFor(mode).guard) {
    throw new GuardError(403, "Obstacle warnings are only available in blind mode.");
  }

  const frame = parseGuardFrame(record.frame);

  if (!frame) {
    throw new GuardError(400, "A camera frame is required.");
  }

  const previous = readPrevious(record.previous);
  const result = await analyzeGuardFrame(frame, previous, request.signal);

  return noStore(result);
}

function readPrevious(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 200) : "";
}

function noStore(result: unknown): Response {
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

function errorResponse(error: unknown): Response {
  if (error instanceof GuardError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return Response.json({ error: "The request was stopped." }, { status: 499 });
  }

  return Response.json({ error: "The vision check failed." }, { status: 500 });
}
