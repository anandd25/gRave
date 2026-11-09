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

// Encode an AudioBuffer as 16-bit mono WAV. The backend reads WAV everywhere,
// while browsers record WebM/Opus which it cannot.
export function audioBufferToWav(buffer) {
  const n = buffer.length
  const mono = new Float32Array(n)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c)
    for (let i = 0; i < n; i++) mono[i] += ch[i] / buffer.numberOfChannels
  }
  const out = new DataView(new ArrayBuffer(44 + n * 2))
  const str = (o, s) => [...s].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)))
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true)
  out.setUint32(24, buffer.sampleRate, true); out.setUint32(28, buffer.sampleRate * 2, true)
  out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]))
    out.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([out], { type: 'audio/wav' })
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
}
