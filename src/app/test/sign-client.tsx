"use client";

import { useRef, useState } from "react";

/** Mirrors DEFAULT_SIGN_PROMPT in lib/sign-video.ts, which is server-only. */
const DEFAULT_PROMPT =
  "Transcribe the American Sign Language signing in this video. Decide only from what the signer\u2019s hands, face, and body do. First write down any on-screen text, captions, or labels you see, then ignore them completely \u2014 they are never the answer, even when they match. Work in three short passes, a few words per segment. 1. Segments: split signing from rest at movement bursts; ignore rest. 2. Signs: reason in 3D, not flat screen positions \u2014 track toward and away from the camera as well as up, down, left, and right, hand rotation, which hand or finger is in front when they overlap, and distance from the torso. A finger hidden behind the hand is occluded, not absent. Outward-from-body versus sideways movement distinguishes signs that look alike flat. For each signing segment give the 5 parameters  \u2014 handshape as a categorical label (H-hand, 1-hand, B-hand, fist, open-5), palm orientation (in, out, up, down, left, right), movement (path: up, down, forward, back, circle, tap, wiggle, or none, plus repeats), location (chin, forehead, chest, front of body, start to end), non-manuals (head, brows, eyes, mouth open or closed) \u2014 and 1H vs 2H with what each hand does. Read as language, not as generic gestures: resemblance to a hearing gesture is not evidence. Trust fingers visible across most frames; brief flashes are transitions. A static hold is a fingerspelled letter (letters run together as one word); name a lexical sign only for its characteristic movement. End with a final line starting \"Transcription:\" followed by only the transcribed words (under 12 words) \u2014 your best reading. Write Transcription: UNCLEAR only if nothing at all is readable.";

type SignResult = {
  transcript: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  ms: number;
};

/**
 * Signing-video test console: a full clip goes to Muse Spark and
 * the transcription comes back, bypassing the Baseten turn pipeline (which
 * has no video input). The API key never leaves the server.
 */
export function SignTest() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SignResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const file = fileRef.current?.files?.[0];

    if (!file || running) return;

    setRunning(true);
    setResult(null);
    setError(null);

    try {
      const form = new FormData();
      form.append("video", file);
      form.append("prompt", prompt);

      const response = await fetch("/api/sign-test", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as SignResult & { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "The sign test failed.");
        return;
      }

      setResult(payload);
    } catch {
      setError("The sign test could not reach the server.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg border border-line bg-paper p-4 text-ink">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-ink-muted">Signing clip (mp4, webm, or mov, under 15 MB)</span>
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
          aria-label="Signing clip"
          className="font-mono text-xs text-ink file:mr-3 file:rounded-full file:border file:border-line file:bg-paper-2 file:px-3 file:py-1.5 file:font-mono file:text-xs file:text-ink hover:file:border-sage"
        />
      </div>

      <label className="flex flex-col gap-1 font-mono text-xs text-ink-muted">
        Instruction
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={2}
          className="w-full rounded border border-line bg-paper-2 px-3 py-2 font-mono text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </label>

      <button
        type="button"
        onClick={run}
        disabled={!fileName || running}
        className="rounded-full border border-sage px-4 py-2 font-mono text-xs text-sage-text transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      >
        {running ? "Transcribing…" : "Transcribe signing"}
      </button>

      {error ? (
        <p role="alert" className="font-mono text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-2 rounded border border-line bg-paper-2 p-3">
          <p className="font-mono text-sm text-ink">{result.transcript}</p>
          <p className="font-mono text-[11px] text-ink-muted">
            {result.model} · {result.ms} ms · {result.promptTokens} prompt / {result.completionTokens} completion tokens
          </p>
        </div>
      ) : null}

      <p className="font-mono text-[11px] text-ink-muted">
        Full clip goes to NVIDIA; the dashboard turn pipeline uses stills because
        its model has no video input.
      </p>
    </div>
  );
}
