import { keyName } from './music'

// Browser-side vocal analysis: tempo, key, brightness and loudness envelope.
// Rough estimates (a cappella vocals are hard), good enough to drive arrangement.

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

function pearson(a, b) {
  const n = a.length
  const ma = a.reduce((s, v) => s + v, 0) / n
  const mb = b.reduce((s, v) => s + v, 0) / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

function estimateBpm(env, hopSec) {
  const onset = new Float32Array(env.length)
  for (let i = 1; i < env.length; i++) onset[i] = Math.max(0, env[i] - env[i - 1])
  const minLag = Math.floor(60 / 180 / hopSec)
  const maxLag = Math.ceil(60 / 60 / hopSec)
  if (env.length < maxLag * 3) return null
  let best = 0, bestLag = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = 0; i + lag < onset.length; i++) sum += onset[i] * onset[i + lag]
    const bpm = 60 / (lag * hopSec)
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 110) / 0.8) ** 2) // prefer 80-150
    const score = (sum / (onset.length - lag)) * prior
    if (score > best) { best = score; bestLag = lag }
  }
  if (!bestLag) return null
  let bpm = 60 / (bestLag * hopSec)
  while (bpm > 160) bpm /= 2
  while (bpm < 70) bpm *= 2
  return Math.round(bpm)
}

export function analyzeBuffer(buffer) {
  const sr = buffer.sampleRate
  const raw = buffer.getChannelData(0)
  const dec = Math.max(1, Math.round(sr / 22050))
  const rate = sr / dec
  const n = Math.floor(Math.min(raw.length, sr * 45) / dec)
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let k = 0; k < dec; k++) s += raw[i * dec + k]
    x[i] = s / dec
  }

  // Loudness envelope (also used for vocal activity per bar).
  const hop = 512
  const hopSec = hop / rate
  const envLen = Math.floor(n / hop)
  const env = new Float32Array(envLen)
  let maxRms = 1e-6
  for (let i = 0; i < envLen; i++) {
    let s = 0
    for (let j = 0; j < hop; j++) s += x[i * hop + j] ** 2
    env[i] = Math.sqrt(s / hop)
    if (env[i] > maxRms) maxRms = env[i]
  }

  const bpm = estimateBpm(env, hopSec)

  // Pitch tracking by autocorrelation -> pitch-class histogram -> key.
  const frame = 2048
  const minLag = Math.floor(rate / 800)
  const maxLag = Math.floor(rate / 70)
  const hist = new Array(12).fill(0)
  let zcrSum = 0, zcrFrames = 0
  for (let start = 0; start + frame + maxLag < n; start += 4096) {
    let r0 = 0
    for (let i = 0; i < frame; i++) r0 += x[start + i] ** 2
    if (Math.sqrt(r0 / frame) < maxRms * 0.15) continue
    let crossings = 0
    for (let i = 1; i < frame; i++) if ((x[start + i] >= 0) !== (x[start + i - 1] >= 0)) crossings++
    zcrSum += crossings / frame
    zcrFrames++
    let bestR = 0, bestLag = 0
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0
      for (let i = 0; i < frame; i++) r += x[start + i] * x[start + i + lag]
      if (r > bestR) { bestR = r; bestLag = lag }
    }
    if (bestLag && bestR / r0 > 0.5) {
      const midi = 69 + 12 * Math.log2(rate / bestLag / 440)
      hist[((Math.round(midi) % 12) + 12) % 12] += Math.sqrt(r0 / frame)
    }
  }

  let key = { pc: 0, mode: 'minor', fallback: true }
  if (hist.some((v) => v > 0)) {
    let best = -2
    for (let pc = 0; pc < 12; pc++) {
      const rot = (profile) => profile.map((_, i) => profile[(i - pc + 12) % 12])
      for (const [mode, profile] of [['major', MAJOR], ['minor', MINOR]]) {
        const c = pearson(hist, rot(profile))
        if (c > best) { best = c; key = { pc, mode } }
      }
    }
  }

  const brightness = zcrFrames
    ? Math.round(Math.min(8000, Math.max(500, (zcrSum / zcrFrames) * (rate / 2))))
    : 2500

  return {
    bpm: bpm ?? 140,
    bpmFallback: bpm == null,
    key,
    keyLabel: keyName(key),
    brightness,
    duration: buffer.duration,
    env,
    hopSec,
    maxRms,
  }
}
