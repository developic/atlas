"use client";

/**
 * Browser-only attachment conversion for the dashboard chatbox.
 *
 * Images ride the existing mediaFrames path (downscaled JPEG data URLs, the
 * same recipe as the sign stills, so they fit the frame byte caps). Text
 * files are inlined into the message. Anything else is rejected with a
 * user-readable reason — audio and video have their own flows (voice
 * recording, sign camera) and never enter as attachments.
 */

const IMAGE_WIDTH = 640;
const IMAGE_QUALITY = 0.7;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 12_000;

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".json", ".csv", ".log"];

export type AttachmentKind = "image" | "text";

export type ConvertedAttachment =
  | { kind: "image"; frame: string }
  | { kind: "text"; content: string; truncated: boolean };

function isTextFile(file: File): boolean {
  if (file.type.startsWith("text/") || file.type === "application/json") {
    return true;
  }

  const name = file.name.toLowerCase();
  return TEXT_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("The image could not be read."));
    image.src = url;
  });
}

async function imageToFrame(file: File): Promise<string> {
  const url = URL.createObjectURL(file);

  try {
    const image = await loadImage(url);
    const scale = Math.min(1, IMAGE_WIDTH / image.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");

    if (!context) throw new Error("The image could not be read.");

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Reject early with a reason the caption can show; never throws. */
export function checkAttachment(file: File): { ok: true; kind: AttachmentKind } | { ok: false; error: string } {
  if (file.size === 0) {
    return { ok: false, error: "That file is empty." };
  }

  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "That file is too large. Keep it under 10 MB." };
  }

  if (file.type.startsWith("image/")) return { ok: true, kind: "image" };
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
    return {
      ok: false,
      error: "Send voice with the microphone and signing with the camera instead.",
    };
  }
  if (isTextFile(file)) return { ok: true, kind: "text" };

  return { ok: false, error: "Only images and text files can be attached." };
}

export async function convertAttachment(file: File): Promise<ConvertedAttachment> {
  const checked = checkAttachment(file);

  if (!checked.ok) throw new Error(checked.error);

  if (checked.kind === "image") {
    return { kind: "image", frame: await imageToFrame(file) };
  }

  const raw = await file.text();
  const truncated = raw.length > MAX_TEXT_CHARS;

  return {
    kind: "text",
    content: truncated ? `${raw.slice(0, MAX_TEXT_CHARS)}\n[…truncated]` : raw,
    truncated,
  };
}
