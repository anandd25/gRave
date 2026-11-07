import { SCALES, midiToFreq, mulberry32, subMidi, midRootMidi } from './music'

const SR = 44100

// Renders one layer of the arrangement to a mono AudioBuffer covering all bars.
export async function renderLayer(layer, info) {
  const { bpm, key, bars } = info
  const barSec = 240 / bpm
  const step = barSec / 16
  const total = bars * barSec + 2 // tail for ringing notes
  const ctx = new OfflineAudioContext(1, Math.ceil(total * SR), SR)
  const out = ctx.createGain()
  out.connect(ctx.destination)

  const noise = ctx.createBuffer(1, SR, SR)
  const nd = noise.getChannelData(0)
  const rng0 = mulberry32(1234)
  for (let i = 0; i < nd.length; i++) nd[i] = rng0() * 2 - 1

  const ctxh = { ctx, out, noise, barSec, step, key, bpm }
  const fn = RENDERERS[layer.type]
  if (fn) {
    const barsList = []
    for (const r of layer.regions) {
      for (let b = r.start; b < Math.min(r.end, bars); b++) barsList.push({ b, start: r.start, end: r.end })
    }
    fn(ctxh, layer.params, barsList)
  }

  const buffer = await ctx.startRendering()
  // Normalize so volume sliders behave consistently across layers.
  const d = buffer.getChannelData(0)
  let peak = 0
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]))
  if (peak > 0) {
    const g = 0.8 / peak
    for (let i = 0; i < d.length; i++) d[i] *= g
  }
  return buffer
}

function envGain(ctx, t, attack, peak, decayTo, release) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(decayTo, t + attack + release)
  return g
}

// ---------- 808 ----------
const PATTERNS_808 = {
  sparse: [0, 10],
  bounce: [0, 7, 10, 14],
  heavy: [0, 3, 7, 10, 12, 14],
}

function render808({ ctx, out, step, key }, p, barsList) {
  const shaper = ctx.createWaveShaper()
  const k = 1 + p.drive * 8
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / 512) - 1
    curve[i] = Math.tanh(k * x) / Math.tanh(k)
  }
  shaper.curve = curve
  shaper.connect(out)
  const freq = midiToFreq(subMidi(key.pc) + p.tune)
  const steps = PATTERNS_808[p.pattern] || PATTERNS_808.bounce
  for (const { b } of barsList) {
    steps.forEach((s, i) => {
      const t = (b * 16 + s) * step
      const nextS = steps[i + 1] ?? 16
      const dur = Math.min(p.decay, (nextS - s) * step + 0.04)
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq * (1 + p.glide * 1.5), t)
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.08)
      const g = envGain(ctx, t, 0.005, 1, 0.0001, dur)
      osc.connect(g).connect(shaper)
      osc.start(t)
      osc.stop(t + dur + 0.05)
    })
  }
}

// ---------- hi-hats ----------
function renderHats({ ctx, out, noise, step }, p, barsList) {
  const hp = 4000 + p.tone * 5000
  const hit = (t, vel, len) => {
    const src = ctx.createBufferSource()
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = hp
    const g = ctx.createGain()
    g.gain.setValueAtTime(vel, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + len)
    src.buffer = noise
    src.connect(f).connect(g).connect(out)
    src.start(t)
    src.stop(t + len + 0.02)
  }
  for (const { b } of barsList) {
    const base = b * 16
    const stepsPer = p.density === 1 ? [2, 6, 10, 14] : p.density === 2 ? [0, 2, 4, 6, 8, 10, 12, 14] : [...Array(16).keys()]
    for (const s of stepsPer) {
      const accent = s % 4 === 0 ? 0.55 : 0.3
      const rollBar = p.rolls && b % 4 === 3 && s >= 12
      if (rollBar) {
        hit((base + s) * step, 0.35, 0.04)
        hit((base + s + 0.5) * step, 0.25, 0.04)
      } else {
        hit((base + s) * step, accent, 0.06)
      }
    }
  }
}

// ---------- clap ----------
function renderClap({ ctx, out, noise, step }, p, barsList) {
  for (const { b } of barsList) {
    for (const s of [4, 12]) {
      const t = (b * 16 + s) * step
      for (let i = 0; i < 3; i++) {
        const src = ctx.createBufferSource()
        const f = ctx.createBiquadFilter()
        f.type = 'bandpass'
        f.frequency.value = 1200 + p.tone * 1400
        f.Q.value = 1.2
        const g = ctx.createGain()
        const ti = t + i * 0.011
        g.gain.setValueAtTime(0.7, ti)
        g.gain.exponentialRampToValueAtTime(0.0001, ti + (i === 2 ? 0.16 : 0.03))
        src.buffer = noise
        src.connect(f).connect(g).connect(out)
        src.start(ti)
        src.stop(ti + 0.2)
      }
    }
  }
}

// ---------- synth lead ----------
function renderLead({ ctx, out, step, key, bpm }, p, barsList) {
  const scale = key.mode === 'minor' ? SCALES.pentMinor : SCALES.pentMajor
  const root = midRootMidi(key.pc) + 12 * p.octave
  const cutoff = 500 + p.tone * 5000
  let degree = 2
  for (const { b } of barsList) {
    const rng = mulberry32(b * 7919 + bpm)
    const hits = [0, 3, 6, 8, 10, 12].filter(() => rng() > 0.35)
    hits.forEach((s, i) => {
      degree = Math.max(0, Math.min(scale.length * 2 - 1, degree + Math.floor(rng() * 5) - 2))
      const oct = Math.floor(degree / scale.length)
      const midi = root + scale[degree % scale.length] + 12 * oct
      const t = (b * 16 + s) * step
      const len = ((hits[i + 1] ?? 16) - s) * step * 0.9
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = cutoff
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.15)
      f.connect(g).connect(out)
      for (const det of [-8, 8]) {
        const osc = ctx.createOscillator()
        osc.type = p.wave
        osc.frequency.value = midiToFreq(midi)
        osc.detune.value = det
        osc.connect(f)
        osc.start(t)
        osc.stop(t + len + 0.2)
      }
    })
  }
}

// ---------- glockenspiel ----------
function renderGlock({ ctx, out, step, key }, p, barsList) {
  const scale = key.mode === 'minor' ? SCALES.minor : SCALES.major
  const root = midRootMidi(key.pc) + 12 + 12 * p.octave
  const shape = [0, 2, 4, 2, 5, 4, 2, 1]
  const gap = p.density === 2 ? 2 : 4
  for (const { b } of barsList) {
    for (let s = 0; s < 16; s += gap) {
      const idx = shape[(s / gap + b) % shape.length]
      const midi = root + scale[idx % scale.length] + 12 * Math.floor(idx / scale.length)
      const t = (b * 16 + s) * step
      const f = midiToFreq(midi)
      for (const [mult, amp, len] of [[1, 0.6, 1.0], [2.76, 0.22 + p.tone * 0.2, 0.4], [5.4, 0.1, 0.18]]) {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = f * mult
        const g = envGain(ctx, t, 0.003, amp, 0.0001, len)
        osc.connect(g).connect(out)
        osc.start(t)
        osc.stop(t + len + 0.05)
      }
    }
  }
}

// ---------- dark pad ----------
function renderPad({ ctx, out, barSec, key }, p, barsList) {
  const progression = key.mode === 'minor' ? [0, 8, 3, 10] : [0, 9, 5, 7]
  const third = key.mode === 'minor' ? 3 : 4
  const cutoff = 300 + p.tone * 1500
  for (const { b, start, end } of barsList) {
    if ((b - start) % 2 !== 0) continue
    const len = Math.min(2, end - b) * barSec
    const chordRoot = (key.pc + progression[Math.floor((b - start) / 2) % 4]) % 12
    const base = (chordRoot <= 6 ? 48 : 36) + chordRoot
    const t = b * barSec
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = cutoff
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.4, t + Math.min(0.6, len / 3))
    g.gain.linearRampToValueAtTime(0.0001, t + len + 0.3)
    f.connect(g).connect(out)
    for (const iv of [0, third, 7]) {
      for (const det of [-9, 9]) {
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = midiToFreq(base + iv)
        osc.detune.value = det
        osc.connect(f)
        osc.start(t)
        osc.stop(t + len + 0.35)
      }
    }
  }
}

const RENDERERS = {
  kick808: render808,
  hihat: renderHats,
  clap: renderClap,
  lead: renderLead,
  glock: renderGlock,
  pad: renderPad,
}
