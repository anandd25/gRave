// Generic audio helpers: decoding, waveform peaks, time formatting.

export async function decodeBlob(ctx, blob) {
  return ctx.decodeAudioData(await blob.arrayBuffer())
}

export function computePeaks(buffer, count = 400) {
  const data = buffer.getChannelData(0)
  const block = Math.max(1, Math.floor(data.length / count))
  const peaks = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    let max = 0
    for (let j = i * block; j < Math.min((i + 1) * block, data.length); j++) {
      const v = Math.abs(data[j])
      if (v > max) max = v
    }
    peaks[i] = max
  }
  return peaks
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
}
