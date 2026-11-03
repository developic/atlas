/**
 * PCM helpers shared by the dashboard player and its tests.
 *
 * A provider that streams Linear16 inside a WAV container must strip the
 * header (as the retired Deepgram path did) so the player receives
 * little-endian signed 16-bit mono. The player turns each chunk into a
 * Float32 AudioBuffer and schedules it on the audio clock.
 */

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function base64ToInt16(value: string): Int16Array {
  const bytes = base64ToBytes(value);
  const samples = new Int16Array(Math.floor(bytes.length / 2));

  for (let index = 0; index < samples.length; index += 1) {
    const low = bytes[index * 2];
    const high = bytes[index * 2 + 1];
    const signed = (high << 8) | low;

    samples[index] = signed > 0x7fff ? signed - 0x10000 : signed;
  }

  return samples;
}

export function pcm16ToFloat32(samples: Int16Array): Float32Array {
  const floats = new Float32Array(samples.length);

  for (let index = 0; index < samples.length; index += 1) {
    floats[index] = samples[index] / 0x8000;
  }

  return floats;
}

/** Schedule a chunk at the later of "now" and the previous chunk's end. */
export function scheduleStart(
  currentTime: number,
  nextStartTime: number,
): number {
  return Math.max(currentTime, nextStartTime);
}
