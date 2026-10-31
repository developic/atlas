"use client";

import { useRef, useState } from "react";

import type { SignProvider } from "@/lib/nvidia-sign";

/** Mirrors DEFAULT_SIGN_PROMPT in lib/nvidia-sign.ts, which is server-only. */
const DEFAULT_PROMPT =
  "Transcribe the American Sign Language signing in this video. Reply with only the transcribed utterance.";

const PROVIDERS: { value: SignProvider; label: string }[] = [
  { value: "nvidia", label: "NVIDIA omni" },
  { value: "opencode", label: "Muse Spark 1.3 (video)" },
];

type SignResult = {
  transcript: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  ms: number;
};

/**
 * Signing-video test console: a full clip goes to NVIDIA's omni model and
 * the transcription comes back, bypassing the Baseten turn pipeline (which
 * has no video input). The API key never leaves the server.
 */
export function SignTest() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [provider, setProvider] = useState<SignProvider>("nvidia");
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
      form.append("provider", provider);

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

        <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-ink-muted">Model</span>
        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value as SignProvider)}
          aria-label="Signing model"
          className="w-full rounded border-line bg-paper-2 px-3 py-1.5 text-ink font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {PROVIDERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
