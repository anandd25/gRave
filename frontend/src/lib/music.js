export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  pentMinor: [0, 3, 5, 7, 10],
  pentMajor: [0, 2, 4, 7, 9],
}

export const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12)

export function keyName(key) {
  return `${NOTE_NAMES[key.pc]} ${key.mode}`
}

// Small deterministic PRNG so renders are repeatable.
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LETTER_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }

// Parses e.g. "F# minor", "bb major", "C" (defaults to minor).
export function parseKey(text) {
  const m = text.match(/\b([a-g])\s*(#|♯|b|♭|sharp|flat)?\s*(minor|min|major|maj)?\b/i)
  if (!m) return null
  let pc = LETTER_PC[m[1].toLowerCase()]
  const acc = (m[2] || '').toLowerCase()
  if (acc === '#' || acc === '♯' || acc === 'sharp') pc += 1
  if (acc === 'b' || acc === '♭' || acc === 'flat') pc -= 1
  const mode = /^maj/i.test(m[3] || '') ? 'major' : 'minor'
  return { pc: (pc + 12) % 12, mode }
}

// Scale degree (0 = root, negative = below, 7 = octave) to MIDI note.
export function degreeToMidi(rootMidi, mode, degree) {
  const scale = mode === 'major' ? SCALES.major : SCALES.minor
  const d = Math.round(degree)
  return rootMidi + scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7)
}

// Root note pitch class folded into a comfortable range for each role.
export const subMidi = (pc) => (pc <= 6 ? 36 + pc : 24 + pc)
export const midRootMidi = (pc) => (pc <= 6 ? 60 + pc : 48 + pc)
