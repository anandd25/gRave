import { midiToFreq, mulberry32, subMidi, midRootMidi, degreeToMidi } from './music'

const SR = 44100
const NYQUIST_SAFE = 18000
// Swing (0-0.6) for the layer being scheduled. Scheduling is synchronous inside
// renderLayer, so a module-level value is safe even if renders overlap.
let SWING = 0

// Renders one instrument of the AI's plan to a mono AudioBuffer.
// layer.engine picks the synth; the plan says which bars, steps and notes to play.
export async function renderLayer(layer, info) {
  const { bpm, key, bars, offset } = info
  const barSec = 240 / bpm
  const step = barSec / 16
  const total = offset + bars * barSec + 4 // tail for ringing bells and reverbs
  const ctx = new OfflineAudioContext(1, Math.ceil(total * SR), SR)

  // Shift the whole layer so the beat grid lines up with the vocal's beats.
  const out = ctx.createGain()
  const delay = ctx.createDelay(Math.max(1, offset + 0.5))
  delay.delayTime.value = offset
  out.connect(delay).connect(ctx.destination)

  const noise = ctx.createBuffer(1, SR, SR)
  const nd = noise.getChannelData(0)
  const rng = mulberry32(1234)
  for (let i = 0; i < nd.length; i++) nd[i] = rng() * 2 - 1

  SWING = Math.max(0, Math.min(0.6, info.swing || 0))
  const engine = ENGINES[layer.engine]
  if (engine) engine({ ctx, out, noise, barSec, step, key, rng: mulberry32(99) }, layer.params, layer.regions, layer)

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

// ---- scheduling helpers -------------------------------------------------------

// Every hit of a hits/melodic layer. Fill steps replace the pattern in every 4th bar.
function forEachHit(regions, step, fn) {
  for (const r of regions) {
    const p = r.pattern
    for (let b = r.start; b < r.end; b++) {
      const fill = p.fill_steps?.length > 0 && (b - r.start) % 4 === 3
      const steps = fill ? p.fill_steps : p.steps
      steps.forEach((s, i) => {
        const degree = !fill && p.degrees?.length ? p.degrees[i % p.degrees.length] : 0
        // Swing pushes off-beat 8ths (steps 2, 6, 10, 14) and odd 16ths later for a shuffle.
        const swing = s % 4 === 2 ? SWING * step * 0.66 : s % 2 === 1 ? SWING * step * 0.33 : 0
        fn({ b, s, degree, t: (b * 16 + s) * step + swing, gap: ((steps[i + 1] ?? 16) - s) * step })
      })
    }
  }
}

// Every chord of a chords layer: pattern.degrees = chord root for each 2 bars, cycling.
function forEachChord(regions, barSec, fn) {
  for (const r of regions) {
    const degs = r.pattern.degrees?.length ? r.pattern.degrees : [0]
    for (let b = r.start; b < r.end; b += 2) {
      fn({ t: b * barSec, len: Math.min(2, r.end - b) * barSec, degree: degs[((b - r.start) / 2) % degs.length] })
    }
  }
}

const triad = (base, mode, degree) => [0, 2, 4].map((o) => degreeToMidi(base, mode, degree + o))

function env(ctx, t, attack, peak, release) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release)
  return g
}

// Attack, hold, release envelope for sustained notes and chords.
function swell(ctx, t, attack, peak, len, release) {
  const g = ctx.createGain()
  const a = Math.min(attack, len * 0.8)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + a)
  g.gain.setValueAtTime(peak, t + Math.max(a, len - 0.01))
  g.gain.linearRampToValueAtTime(0.0001, t + len + release)
  return g
}

function osc(ctx, type, freq, t, stopAt, dest, detune = 0) {
  if (freq > NYQUIST_SAFE) return null
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.value = freq
  o.detune.value = detune
  o.connect(dest)
  o.start(t)
  o.stop(stopAt)
  return o
}

function filter(ctx, type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

function noiseHit(ctx, out, noise, t, { type, freq, q = 0.7, vel, len, attack = 0.001 }) {
  const src = ctx.createBufferSource()
  src.buffer = noise
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vel, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + len)
  src.connect(filter(ctx, type, freq, q)).connect(g).connect(out)
  src.start(t)
  src.stop(t + attack + len + 0.02)
}

// ---- bass ---------------------------------------------------------------------

function sub808({ ctx, out, step, key }, p, regions) {
  const shaper = ctx.createWaveShaper()
  const k = 1 + p.drive * 10
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(k * (i / 512 - 1)) / Math.tanh(k)
  shaper.curve = curve
  shaper.connect(out)
  forEachHit(regions, step, ({ t, gap, degree }) => {
    let midi = degreeToMidi(subMidi(key.pc), key.mode, degree) + p.tune
    while (midi > 55) midi -= 12
    while (midi < 26) midi += 12
    const freq = midiToFreq(midi)
    const dur = Math.min(p.decay, gap + 0.04)
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(freq * (1 + p.glide * 1.5), t)
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.04 + p.glide * 0.12)
    o.connect(env(ctx, t, 0.005, 1, dur)).connect(shaper)
    o.start(t)
    o.stop(t + dur + 0.05)
  })
}

function reese({ ctx, out, step, key }, p, regions) {
  const base = subMidi(key.pc) + 12 + 12 * p.octave
  forEachHit(regions, step, ({ t, gap, degree }) => {
    const freq = midiToFreq(degreeToMidi(base, key.mode, degree))
    const len = gap * 0.95
    const f = filter(ctx, 'lowpass', 150 + p.tone * 1500, 3)
    const g = swell(ctx, t, 0.02, 0.5, len, 0.08)
    f.connect(g).connect(out)
    osc(ctx, 'sawtooth', freq, t, t + len + 0.1, f, -p.detune)
    osc(ctx, 'sawtooth', freq, t, t + len + 0.1, f, p.detune)
    osc(ctx, 'sine', freq / 2, t, t + len + 0.1, g)
  })
}

// ---- drums --------------------------------------------------------------------

function kick({ ctx, out, noise, step }, p, regions) {
  forEachHit(regions, step, ({ t }) => {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(160, t)
    o.frequency.exponentialRampToValueAtTime(45, t + 0.09)
    o.connect(env(ctx, t, 0.002, 1, p.decay)).connect(out)
    o.start(t)
    o.stop(t + p.decay + 0.05)
    noiseHit(ctx, out, noise, t, { type: 'highpass', freq: 2000 + p.tone * 4000, vel: 0.05 + p.tone * 0.3, len: 0.015 })
  })
}

function hat({ ctx, out, noise, step }, p, regions) {
  forEachHit(regions, step, ({ t, s }) =>
    noiseHit(ctx, out, noise, t, { type: 'highpass', freq: 4000 + p.tone * 5000, vel: s % 4 === 0 ? 0.55 : 0.32, len: p.decay }),
  )
}

function shaker({ ctx, out, noise, step }, p, regions) {
  forEachHit(regions, step, ({ t, s }) =>
    noiseHit(ctx, out, noise, t, { type: 'bandpass', freq: 5000 + p.tone * 3000, q: 1.5, vel: s % 4 === 2 ? 0.5 : 0.3, len: 0.06, attack: 0.012 }),
  )
}

function clap({ ctx, out, noise, step }, p, regions) {
  forEachHit(regions, step, ({ t }) => {
    for (let i = 0; i < 3; i++) {
      const ti = t + i * 0.011
      noiseHit(ctx, out, noise, ti, { type: 'bandpass', freq: 1200 + p.tone * 1400, q: 1.2, vel: 0.7, len: i === 2 ? 0.16 : 0.03 })
    }
  })
}

function snare({ ctx, out, noise, step }, p, regions) {
  forEachHit(regions, step, ({ t }) => {
    noiseHit(ctx, out, noise, t, { type: 'highpass', freq: 1200 + p.tone * 2500, vel: 0.7, len: p.decay })
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(230, t)
    o.frequency.exponentialRampToValueAtTime(160, t + 0.05)
    o.connect(env(ctx, t, 0.002, 0.6, 0.08)).connect(out)
    o.start(t)
    o.stop(t + 0.12)
  })
}

function rim({ ctx, out, noise, step }, p, regions) {
  forEachHit(regions, step, ({ t }) => {
    noiseHit(ctx, out, noise, t, { type: 'bandpass', freq: 1700 + p.tone * 1500, q: 4, vel: 0.6, len: 0.03 })
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = 800 + p.tone * 600
    o.connect(env(ctx, t, 0.001, 0.4, 0.025)).connect(out)
    o.start(t)
    o.stop(t + 0.05)
  })
}

function tom({ ctx, out, noise, step, key }, p, regions) {
  const base = subMidi(key.pc) + 12 + p.tune
  forEachHit(regions, step, ({ t, degree }) => {
    const freq = midiToFreq(degreeToMidi(base, key.mode, degree))
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(freq * 1.5, t)
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.08)
    o.connect(env(ctx, t, 0.002, 0.9, p.decay)).connect(out)
    o.start(t)
    o.stop(t + p.decay + 0.05)
    noiseHit(ctx, out, noise, t, { type: 'lowpass', freq: 1200, vel: 0.2, len: 0.05 })
  })
}

function impact({ ctx, out, noise, step }, p, regions) {
  forEachHit(regions, step, ({ t }) => {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(75, t)
    o.frequency.exponentialRampToValueAtTime(28, t + p.decay)
    o.connect(env(ctx, t, 0.003, 1, p.decay)).connect(out)
    o.start(t)
    o.stop(t + p.decay + 0.1)
    noiseHit(ctx, out, noise, t, { type: 'lowpass', freq: 400 + p.tone * 2500, vel: 0.6, len: Math.min(1.2, p.decay * 0.4) })
  })
}

// ---- melody -------------------------------------------------------------------

function lead({ ctx, out, step, key }, p, regions) {
  const root = midRootMidi(key.pc) + 12 * p.octave
  forEachHit(regions, step, ({ t, gap, degree }) => {
    const len = gap * 0.9
    const f = filter(ctx, 'lowpass', 500 + p.tone * 5000)
    f.connect(swell(ctx, t, 0.01, 0.5, len, p.release)).connect(out)
    const freq = midiToFreq(degreeToMidi(root, key.mode, degree))
    for (const det of [-8, 8]) osc(ctx, p.wave, freq, t, t + len + p.release + 0.05, f, det)
  })
}

function pluck({ ctx, out, step, key }, p, regions) {
  const root = midRootMidi(key.pc) + 12 * p.octave
  forEachHit(regions, step, ({ t, degree }) => {
    const f = filter(ctx, 'lowpass', 400, 2)
    const cutoff = 600 + p.tone * 5000
    f.frequency.setValueAtTime(cutoff * 3, t)
    f.frequency.exponentialRampToValueAtTime(cutoff * 0.5, t + 0.25)
    f.connect(env(ctx, t, 0.003, 0.6, 0.35)).connect(out)
    osc(ctx, p.wave, midiToFreq(degreeToMidi(root, key.mode, degree)), t, t + 0.45, f)
  })
}

// Bells: [frequency ratio, amplitude, decay multiplier] per partial.
const BELLS = {
  glock: { lift: 24, partials: [[1, 0.6, 1], [2.76, 0.25, 0.4], [5.4, 0.1, 0.2]] },
  musicbox: { lift: 24, partials: [[1, 0.6, 1], [3.0, 0.18, 0.5], [6.1, 0.08, 0.25]] },
  churchbell: { lift: 0, partials: [[0.5, 0.5, 1.2], [1, 0.6, 1], [1.19, 0.35, 0.8], [1.56, 0.25, 0.6], [2, 0.3, 0.5], [2.51, 0.15, 0.4], [3, 0.1, 0.3]] },
}

function bell(profile) {
  return ({ ctx, out, step, key }, p, regions) => {
    const root = midRootMidi(key.pc) + profile.lift + 12 * p.octave
    forEachHit(regions, step, ({ t, degree }) => {
      const f = midiToFreq(degreeToMidi(root, key.mode, degree))
      for (const [ratio, amp, dm] of profile.partials) {
        const a = amp * (ratio > 1.5 ? 0.5 + p.tone : 1)
        const len = p.decay * dm
        const g = env(ctx, t, 0.002, a, len)
        g.connect(out)
        osc(ctx, 'sine', f * ratio, t, t + len + 0.05, g)
      }
    })
  }
}

function piano({ ctx, out, noise, step, key }, p, regions) {
  const root = midRootMidi(key.pc) + 12 * p.octave
  const partials = [[1, 1], [2, 0.5], [3, 0.3], [4, 0.15], [5, 0.08]]
  forEachHit(regions, step, ({ t, gap, degree }) => {
    const f = midiToFreq(degreeToMidi(root, key.mode, degree))
    const len = Math.min(3, gap + 1.2)
    const lp = filter(ctx, 'lowpass', 1500 + p.tone * 6000)
    lp.connect(out)
    for (const [ratio, amp] of partials) {
      const g = env(ctx, t, 0.004, amp * 0.4, len / ratio)
      g.connect(lp)
      for (const det of [-p.detune / 2, p.detune / 2]) osc(ctx, 'sine', f * ratio, t, t + len + 0.05, g, det)
    }
    noiseHit(ctx, out, noise, t, { type: 'bandpass', freq: 2500, q: 1, vel: 0.04, len: 0.02 })
  })
}

// ---- chords -------------------------------------------------------------------

function chordBase(key, octave = 0) {
  return (key.pc <= 6 ? 48 + key.pc : 36 + key.pc) + 12 * octave
}

function pad({ ctx, out, barSec, key }, p, regions) {
  forEachChord(regions, barSec, ({ t, len, degree }) => {
    const f = filter(ctx, 'lowpass', 300 + p.tone * 1800)
    f.connect(swell(ctx, t, p.attack, 0.4, len, 0.4)).connect(out)
    for (const m of triad(chordBase(key), key.mode, degree)) {
      for (const det of [-9, 9]) osc(ctx, p.wave, midiToFreq(m), t, t + len + 0.5, f, det)
    }
  })
}

function choir({ ctx, out, barSec, key }, p, regions) {
  forEachChord(regions, barSec, ({ t, len, degree }) => {
    const g = swell(ctx, t, p.attack, 0.5, len, 0.6)
    g.connect(out)
    const lp = filter(ctx, 'lowpass', 1500 + p.tone * 2500)
    lp.connect(g)
    // Two vocal formants ("ooh"/"oh") give the saws a sung quality.
    for (const [freq, q] of [[450 + p.tone * 250, 5], [900 + p.tone * 400, 6]]) {
      const bp = filter(ctx, 'bandpass', freq, q)
      bp.connect(lp)
      for (const m of triad(chordBase(key), key.mode, degree)) {
        for (const det of [-12, 0, 12]) osc(ctx, 'sawtooth', midiToFreq(m), t, t + len + 0.7, bp, det)
      }
    }
  })
}

function strings({ ctx, out, barSec, key }, p, regions) {
  forEachChord(regions, barSec, ({ t, len, degree }) => {
    const f = filter(ctx, 'lowpass', 800 + p.tone * 4000)
    f.connect(swell(ctx, t, p.attack, 0.4, len, 0.5)).connect(out)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 5.2
    const depth = ctx.createGain()
    depth.gain.value = p.vibrato * 18
    lfo.connect(depth)
    lfo.start(t)
    lfo.stop(t + len + 0.6)
    for (const m of triad(chordBase(key), key.mode, degree)) {
      for (const det of [-7, 0, 7]) {
        const o = osc(ctx, 'sawtooth', midiToFreq(m), t, t + len + 0.6, f, det)
        if (o) depth.connect(o.detune)
      }
    }
  })
}

function organ({ ctx, out, barSec, key }, p, regions) {
  const drawbars = [[1, 1], [2, 0.6], [3, 0.35], [4, 0.25], [8, 0.12]]
  forEachChord(regions, barSec, ({ t, len, degree }) => {
    const lp = filter(ctx, 'lowpass', 1200 + p.tone * 5000)
    const g = swell(ctx, t, 0.05, 0.3, len, 0.3)
    const trem = ctx.createOscillator()
    trem.frequency.value = 6
    const tremDepth = ctx.createGain()
    tremDepth.gain.value = 0.06
    trem.connect(tremDepth).connect(g.gain)
    trem.start(t)
    trem.stop(t + len + 0.4)
    lp.connect(g).connect(out)
    for (const m of triad(chordBase(key, p.octave), key.mode, degree)) {
      for (const [ratio, amp] of drawbars) {
        const pg = ctx.createGain()
        pg.gain.value = amp
        pg.connect(lp)
        osc(ctx, 'sine', midiToFreq(m) * ratio, t, t + len + 0.4, pg)
      }
    }
  })
}

// ---- texture and fx -----------------------------------------------------------

function drone({ ctx, out, barSec, key }, p, regions) {
  const base = subMidi(key.pc) + 12 * (p.octave + 1)
  for (const r of regions) {
    const t = r.start * barSec
    const len = (r.end - r.start) * barSec
    const lp = filter(ctx, 'lowpass', 200 + p.tone * 900, 4)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.12
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = 150 + p.tone * 400
    lfo.connect(lfoDepth).connect(lp.frequency)
    lfo.start(t)
    lfo.stop(t + len + 2)
    lp.connect(swell(ctx, t, Math.min(2, len / 3), 0.5, len, 1.5)).connect(out)
    for (const [interval, det] of [[0, -6], [0, 6], [7, 0], [-12, 0]]) {
      osc(ctx, 'sawtooth', midiToFreq(base + interval), t, t + len + 2, lp, det)
    }
  }
}

function riser({ ctx, out, noise, barSec }, p, regions) {
  for (const r of regions) {
    const t = r.start * barSec
    const len = Math.max(0.5, (r.end - r.start) * barSec)
    const src = ctx.createBufferSource()
    src.buffer = noise
    src.loop = true
    const bp = filter(ctx, 'bandpass', 200, 2)
    bp.frequency.setValueAtTime(200, t)
    bp.frequency.exponentialRampToValueAtTime(5000 + p.tone * 7000, t + len)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.8, t + len)
    g.gain.linearRampToValueAtTime(0.0001, t + len + 0.05)
    src.connect(bp).connect(g).connect(out)
    src.start(t)
    src.stop(t + len + 0.1)
  }
}

function vinyl({ ctx, out, barSec, rng }, p, regions) {
  for (const r of regions) {
    const t = r.start * barSec
    const len = (r.end - r.start) * barSec
    const n = Math.ceil(len * SR)
    const buf = ctx.createBuffer(1, n, SR)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (rng() * 2 - 1) * 0.02 // hiss
    const crackles = Math.floor(len * (6 + p.tone * 40))
    for (let c = 0; c < crackles; c++) {
      const at = Math.floor(rng() * (n - 200))
      const amp = 0.2 + rng() * 0.8
      for (let j = 0; j < 120; j++) d[at + j] += (rng() * 2 - 1) * amp * Math.exp(-j / 18)
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(filter(ctx, 'bandpass', 2500, 0.5)).connect(out)
    src.start(t)
  }
}

// ---- genre instruments --------------------------------------------------------

function synthbass({ ctx, out, step, key }, p, regions) {
  const base = subMidi(key.pc) + 12 * (p.octave + 1)
  forEachHit(regions, step, ({ t, gap, degree }) => {
    const f = midiToFreq(degreeToMidi(base, key.mode, degree))
    const len = Math.max(0.06, gap * 0.85)
    const cut = 180 + p.tone * 1800
    const lp = filter(ctx, 'lowpass', cut, 4)
    lp.frequency.setValueAtTime(cut * 4, t)
    lp.frequency.exponentialRampToValueAtTime(cut, t + 0.12)
    const g = swell(ctx, t, 0.004, 0.6, len, 0.05)
    lp.connect(g).connect(out)
    osc(ctx, p.wave, f, t, t + len + 0.1, lp)
    osc(ctx, 'sine', f / 2, t, t + len + 0.1, g) // sub layer for weight
  })
}

function conga({ ctx, out, noise, step, key }, p, regions) {
  const base = midRootMidi(key.pc) - 7 + p.tune
  forEachHit(regions, step, ({ t, degree }) => {
    const f = midiToFreq(degreeToMidi(base, key.mode, degree))
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(f * 1.15, t)
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03)
    o.connect(env(ctx, t, 0.002, 0.8, p.decay)).connect(out)
    o.start(t)
    o.stop(t + p.decay + 0.05)
    noiseHit(ctx, out, noise, t, { type: 'bandpass', freq: 1500 + p.tone * 2500, q: 2, vel: 0.15 + p.tone * 0.3, len: 0.02 })
  })
}

// Karplus-Strong plucked string, computed sample by sample.
function guitar({ ctx, out, step, key, rng }, p, regions) {
  const root = midRootMidi(key.pc) - 12 + 12 * p.octave
  const blend = 0.5 + p.tone * 0.4 // higher = brighter, longer ring
  forEachHit(regions, step, ({ t, gap, degree }) => {
    const f = midiToFreq(degreeToMidi(root, key.mode, degree))
    const dur = Math.min(3, Math.max(0.3, Math.min(p.decay, gap + p.decay * 0.5)))
    const n = Math.ceil(dur * SR)
    const period = Math.max(2, Math.round(SR / f))
    const damp = Math.pow(0.01, period / Math.max(period, p.decay * SR)) // ~1% after p.decay seconds
    const buf = ctx.createBuffer(1, n, SR)
    const d = buf.getChannelData(0)
    let prev = 0
    for (let i = 0; i < Math.min(period + 1, n); i++) {
      prev += (rng() * 2 - 1 - prev) * (0.3 + p.tone * 0.7) // filtered noise burst = pick attack
      d[i] = prev
    }
    for (let i = period + 1; i < n; i++) d[i] = damp * (blend * d[i - period] + (1 - blend) * d[i - period - 1])
    const fade = Math.min(n, Math.round(0.02 * SR))
    for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade
    const src = ctx.createBufferSource()
    src.buffer = buf
    const g = ctx.createGain()
    g.gain.value = 0.6
    src.connect(g).connect(out)
    src.start(t)
  })
}

// Rhodes-style electric piano: FM tine, 7th chords, re-struck every bar, tremolo.
function epiano({ ctx, out, barSec, key }, p, regions) {
  forEachChord(regions, barSec, ({ t, len, degree }) => {
    const base = chordBase(key, p.octave) + 12
    const notes = [...triad(base, key.mode, degree), degreeToMidi(base, key.mode, degree + 6)]
    const strikes = Math.max(1, Math.round(len / barSec))
    for (let k = 0; k < strikes; k++) {
      const ts = t + k * barSec
      const dur = Math.min(barSec, len - k * barSec) + 0.3
      const bus = ctx.createGain()
      bus.gain.value = 1 - p.tremolo * 0.2
      if (p.tremolo > 0) {
        const lfo = ctx.createOscillator()
        lfo.frequency.value = 4.5
        const depth = ctx.createGain()
        depth.gain.value = p.tremolo * 0.2
        lfo.connect(depth).connect(bus.gain)
        lfo.start(ts)
        lfo.stop(ts + dur + 0.1)
      }
      bus.connect(out)
      for (const m of notes) {
        const f = midiToFreq(m)
        const e = env(ctx, ts, 0.003, 0.3, dur)
        e.connect(bus)
        const car = osc(ctx, 'sine', f, ts, ts + dur + 0.1, e)
        if (!car) continue
        const mod = ctx.createOscillator()
        mod.frequency.value = f
        const mg = ctx.createGain()
        mg.gain.setValueAtTime(f * (0.3 + p.tone * 1.5), ts)
        mg.gain.exponentialRampToValueAtTime(f * 0.02, ts + 0.4)
        mod.connect(mg).connect(car.frequency)
        mod.start(ts)
        mod.stop(ts + dur + 0.1)
      }
    }
  })
}

function supersaw({ ctx, out, barSec, key }, p, regions) {
  forEachChord(regions, barSec, ({ t, len, degree }) => {
    const lp = filter(ctx, 'lowpass', 1200 + p.tone * 8000)
    lp.connect(swell(ctx, t, p.attack, 0.25, len, 0.3)).connect(out)
    const notes = triad(chordBase(key), key.mode, degree)
    notes.push(notes[0] - 12)
    for (const m of notes) {
      for (const d of [-1, -0.5, 0, 0.5, 1]) osc(ctx, 'sawtooth', midiToFreq(m), t, t + len + 0.4, lp, d * p.spread)
    }
  })
}

// ---- custom instruments: AI-designed synth patches ------------------------------

const clampHz = (f) => Math.min(NYQUIST_SAFE, Math.max(30, f))

// Shared per-layer effects: drive, bitcrush, echo. Returns the input node.
function patchPostChain(ctx, out, P) {
  const input = ctx.createGain()
  let head = input
  if (P.drive > 0) {
    const ws = ctx.createWaveShaper()
    const k = 1 + P.drive * 20
    const curve = new Float32Array(2048)
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(k * (i / 1024 - 1)) / Math.tanh(k)
    ws.curve = curve
    head.connect(ws)
    head = ws
  }
  if (P.bitcrush > 0) {
    const ws = ctx.createWaveShaper()
    const levels = 2 ** Math.round(16 - P.bitcrush * 13) / 2
    const curve = new Float32Array(8192)
    for (let i = 0; i < curve.length; i++) curve[i] = Math.round((i / 4096 - 1) * levels) / levels
    ws.curve = curve
    head.connect(ws)
    head = ws
  }
  head.connect(out)
  if (P.echo.mix > 0) {
    const d = ctx.createDelay(1.5)
    d.delayTime.value = P.echo.time
    const fb = ctx.createGain()
    fb.gain.value = P.echo.feedback
    const wet = ctx.createGain()
    wet.gain.value = P.echo.mix
    head.connect(d)
    d.connect(fb).connect(d)
    d.connect(wet).connect(out)
  }
  return input
}

// One note of a patch. hold <= 0 means a one-shot (hits ignore sustain).
function patchNote(ctx, dest, noise, P, midi, t, hold) {
  const f0 = midiToFreq(midi)
  const { attack: a, decay: d, sustain, release: r } = P.amp_env
  const oneShot = hold <= 0
  const noteOff = oneShot ? t + a + d : Math.max(t + a + d, t + hold)
  const end = noteOff + r + 0.05
  const sus = Math.max(sustain, 0.0001)

  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.linearRampToValueAtTime(1, t + a)
  amp.gain.exponentialRampToValueAtTime(oneShot ? 0.0001 : sus, t + a + d)
  amp.gain.setValueAtTime(oneShot ? 0.0001 : sus, noteOff)
  amp.gain.exponentialRampToValueAtTime(0.0001, noteOff + r)

  const flt = ctx.createBiquadFilter()
  flt.type = P.filter.type
  flt.Q.value = P.filter.resonance
  const cut = P.filter.cutoff
  flt.frequency.setValueAtTime(clampHz(cut * 2 ** (P.filter.env_amount * 4)), t)
  flt.frequency.exponentialRampToValueAtTime(clampHz(cut), t + P.filter.env_time)
  flt.connect(amp)

  let lfoOut = null
  if (P.lfo.target !== 'none' && P.lfo.depth > 0) {
    const lfo = ctx.createOscillator()
    lfo.frequency.value = P.lfo.rate
    lfoOut = ctx.createGain()
    lfo.connect(lfoOut)
    lfo.start(t)
    lfo.stop(end)
  }
  if (lfoOut && P.lfo.target === 'amp') {
    const trem = ctx.createGain()
    trem.gain.value = 1 - P.lfo.depth / 2
    lfoOut.gain.value = P.lfo.depth / 2
    lfoOut.connect(trem.gain)
    amp.connect(trem).connect(dest)
  } else {
    amp.connect(dest)
  }
  if (lfoOut && P.lfo.target === 'filter') {
    lfoOut.gain.value = P.lfo.depth * cut * 0.9
    lfoOut.connect(flt.frequency)
  }
  if (lfoOut && P.lfo.target === 'pitch') lfoOut.gain.value = P.lfo.depth * 100 // cents

  for (const src of P.sources) {
    if (src.level <= 0) continue
    const g = ctx.createGain()
    g.gain.value = src.level
    g.connect(flt)
    if (src.type === 'noise') {
      const n = ctx.createBufferSource()
      n.buffer = noise
      n.loop = true
      n.connect(g)
      n.start(t)
      n.stop(end)
      continue
    }
    const f = f0 * src.ratio
    if (f > NYQUIST_SAFE) continue
    const o = ctx.createOscillator()
    o.type = src.type
    o.detune.value = src.detune
    if (P.pitch_env.amount > 0) {
      o.frequency.setValueAtTime(Math.min(NYQUIST_SAFE, f * (1 + P.pitch_env.amount)), t)
      o.frequency.exponentialRampToValueAtTime(f, t + P.pitch_env.time)
    } else {
      o.frequency.value = f
    }
    if (P.fm.depth > 0 && f * P.fm.ratio < NYQUIST_SAFE) {
      const m = ctx.createOscillator()
      m.frequency.value = f * P.fm.ratio
      const mg = ctx.createGain()
      mg.gain.value = P.fm.depth * f
      m.connect(mg).connect(o.frequency)
      m.start(t)
      m.stop(end)
    }
    if (lfoOut && P.lfo.target === 'pitch') lfoOut.connect(o.detune)
    o.connect(g)
    o.start(t)
    o.stop(end)
  }
}

function patchEngine({ ctx, out, noise, barSec, step, key }, _params, regions, layer) {
  const P = layer.patch
  if (!P) return
  const input = patchPostChain(ctx, out, P)
  const root = midRootMidi(key.pc) + 12 * P.octave
  const note = (midi, t, hold) => patchNote(ctx, input, noise, P, midi, t, hold)
  if (layer.kind === 'hits') {
    forEachHit(regions, step, ({ t }) => note(root, t, 0))
  } else if (layer.kind === 'melodic') {
    forEachHit(regions, step, ({ t, gap, degree }) => note(degreeToMidi(root, key.mode, degree), t, gap * 0.95))
  } else if (layer.kind === 'chords') {
    forEachChord(regions, barSec, ({ t, len, degree }) => triad(root, key.mode, degree).forEach((m) => note(m, t, len)))
  } else {
    for (const r of regions) note(root, r.start * barSec, (r.end - r.start) * barSec)
  }
}

const ENGINES = {
  patch: patchEngine,
  synthbass, conga, guitar, epiano, supersaw,
  sub808, reese,
  kick, hat, shaker, clap, snare, rim, tom, impact,
  lead, pluck, glock: bell(BELLS.glock), musicbox: bell(BELLS.musicbox), churchbell: bell(BELLS.churchbell), piano,
  pad, choir, strings, organ,
  drone, riser, vinyl,
}
