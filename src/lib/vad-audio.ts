/**
 * PCM framing for the server VAD channel.
 *
 * The browser owns the microphone and ships fixed 32 ms windows; the server
 * owns Silero and answers with boundary events. All helpers here are pure so
 * the offline suite covers the wire format without audio hardware.
 *
 * Wire protocol (WebSocket, per live mic):
 * - client → server, binary: `seq` (LE uint32) + 512 LE int16 samples
 *   (16 kHz mono). Sequence numbers count windows from the connection start.
 * - client → server, text: control JSON, currently only `{"type":"reset"}`
 *   (clear the server's Silero state and start numbering clean).
 * - server → client, text: `{"event":"speech-start","seq"}`,
 *   `{"event":"speech-end","startSeq","endSeq"}`, or `{"event":"misfire"}`.
 *   Sequence numbers refer to the client's window numbering, so the client
 *   slices the finished segment out of its own ring buffer — the padded audio
 *   never crosses the network twice.
 */

export const VAD_SAMPLE_RATE = 16_000;
/** Silero's native window: 512 samples at 16 kHz is 32 ms. */
export const VAD_WINDOW_SAMPLES = 512;
/** LE uint32 window counter prefixing every binary frame. */
export const VAD_SEQ_BYTES = 4;

export type VadServerEvent =
  | { event: "speech-start"; seq: number }
  | { event: "speech-end"; startSeq: number; endSeq: number }
  | { event: "misfire" };

/**
 * Linear-interpolation resampler to 16 kHz mono. Browsers capture at 44.1 or
 * 48 kHz; Silero scores 16 kHz windows only.
 */
export function downsampleTo16k(
  input: Float32Array,
  inputRate: number,
): Float32Array {
  if (input.length === 0 || !Number.isFinite(inputRate) || inputRate <= 0) {
    return new Float32Array(0);
  }

  if (inputRate === VAD_SAMPLE_RATE) return input.slice();

  const ratio = inputRate / VAD_SAMPLE_RATE;
  const length = Math.max(0, Math.floor(input.length / ratio));
  const output = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, input.length - 1);
    const fraction = position - lower;
    output[index] = input[lower] * (1 - fraction) + input[upper] * fraction;
  }

  return output;
}

/** Clamp float samples to int16 PCM. */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);

  for (let index = 0; index < input.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, input[index]));
    output[index] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }

  return output;
}

/** One binary window: LE uint32 seq followed by LE int16 samples. */
export function encodeVadFrame(seq: number, pcm: Int16Array): ArrayBuffer {
  const buffer = new ArrayBuffer(VAD_SEQ_BYTES + pcm.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, seq >>> 0, true);
  new Int16Array(buffer, VAD_SEQ_BYTES).set(pcm);

  return buffer;
}

/** Inverse of `encodeVadFrame`; null on any malformed frame. */
export function decodeVadFrame(
  buffer: ArrayBuffer,
): { seq: number; pcm: Int16Array } | null {
  if (
    buffer.byteLength < VAD_SEQ_BYTES + 2 ||
    (buffer.byteLength - VAD_SEQ_BYTES) % 2 !== 0
  ) {
    return null;
  }

  const view = new DataView(buffer);

  return {
    seq: view.getUint32(0, true),
    pcm: new Int16Array(buffer.slice(VAD_SEQ_BYTES)),
  };
}

/** Control frame clearing the server's Silero state. */
export function vadResetControl(): string {
  return JSON.stringify({ type: "reset" });
}

/** Strict boundary-event parser; unknown shapes are refused, never coerced. */
export function parseVadEvent(value: unknown): VadServerEvent | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;

  if (record.event === "speech-start" && Number.isInteger(record.seq)) {
    return { event: "speech-start", seq: record.seq as number };
  }

  if (
    record.event === "speech-end" &&
    Number.isInteger(record.startSeq) &&
    Number.isInteger(record.endSeq) &&
    (record.endSeq as number) >= (record.startSeq as number)
  ) {
    return {
      event: "speech-end",
      startSeq: record.startSeq as number,
      endSeq: record.endSeq as number,
    };
  }

  if (record.event === "misfire") return { event: "misfire" };

  return null;
}
