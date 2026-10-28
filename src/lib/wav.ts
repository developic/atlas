/**
 * Small WAV helpers shared by the dashboard and its tests.
 *
 * The omni model documents wav and mp3 input only, while MediaRecorder usually
 * produces WebM/Opus. The dashboard decodes the browser clip and re-encodes it
 * as 16 kHz mono PCM16 before sending, which also matches Parakeet's native
 * input rate and keeps the upload small.
 */

const WAV_HEADER_BYTES = 44;

function clampSample(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
}

function toPcm16(value: number) {
  const sample = clampSample(value);

  // -1 maps to -32768 and +1 maps to 32767, so the full signed range is used.
  return sample < 0
    ? Math.round(sample * 0x8000)
    : Math.round(sample * 0x7fff);
}

/**
 * Encode one or more Float32 channels as a mono PCM16 WAV.
 *
 * Multi-channel input is averaged down to mono because the voice pipeline only
 * ever sends a microphone signal.
 */
export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
): ArrayBuffer {
  const usable = channels.filter((channel) => channel.length > 0);

  if (usable.length === 0) {
    return new ArrayBuffer(WAV_HEADER_BYTES);
  }

  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("A positive sample rate is required.");
  }

  const frames = Math.max(...usable.map((channel) => channel.length));
  const dataSize = frames * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // linear PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, Math.round(sampleRate), true);
  view.setUint32(28, Math.round(sampleRate) * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    let count = 0;

    for (const channel of usable) {
      if (frame < channel.length) {
        sum += channel[frame];
        count += 1;
      }
    }

    view.setInt16(WAV_HEADER_BYTES + frame * 2, toPcm16(sum / count), true);
  }

  return buffer;
}

/**
 * Decode a browser recording and re-encode it as 16 kHz mono WAV.
 *
 * Throws when the browser cannot decode the clip; callers keep the original
 * blob in that case so a turn still reaches the model.
 */
export async function clipToWav(blob: Blob): Promise<Blob> {
  const AudioContextCtor =
    window.AudioContext ??
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextCtor) {
    throw new Error("Audio decoding is not available in this browser.");
  }

  const context = new AudioContextCtor();
  let decoded: AudioBuffer;

  try {
    decoded = await context.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void context.close();
  }

  const sampleRate = 16_000;
  const frames = Math.max(1, Math.ceil(decoded.duration * sampleRate));
  const offline = new OfflineAudioContext(1, frames, sampleRate);
  const source = offline.createBufferSource();

  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  const wav = encodeWav(
    Array.from(
      { length: rendered.numberOfChannels },
      (_, index) => rendered.getChannelData(index),
    ),
    rendered.sampleRate,
  );

  return new Blob([wav], { type: "audio/wav" });
}
