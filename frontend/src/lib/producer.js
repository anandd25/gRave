import { NOTE_NAMES, keyName } from './music'

export const LAYER_DEFS = {
  kick808: { name: '808 Sub', color: '#ff2e4d', volume: 0.85, params: { pattern: 'bounce', decay: 0.7, glide: 0.5, drive: 0.35, tune: 0 } },
  hihat: { name: 'Hi-Hats', color: '#7CFF6B', volume: 0.45, params: { density: 2, rolls: true, tone: 0.6 } },
  clap: { name: 'Clap', color: '#ffd23f', volume: 0.5, params: { tone: 0.5 } },
  lead: { name: 'Synth Lead', color: '#b46bff', volume: 0.4, params: { wave: 'sawtooth', octave: 0, tone: 0.5 } },
  glock: { name: 'Glockenspiel', color: '#5ee7ff', volume: 0.35, params: { density: 1, octave: 0, tone: 0.5 } },
  pad: { name: 'Dark Pad', color: '#ff8a1f', volume: 0.3, params: { tone: 0.35 } },
}

export const barSecFor = (bpm) => 240 / bpm

// ---- sections -------------------------------------------------------------

function barLevels(analysis, bpm, bars) {
  const barSec = barSecFor(bpm)
  const levels = []
  for (let b = 0; b < bars; b++) {
    const i0 = Math.floor((b * barSec) / analysis.hopSec)
    const i1 = Math.min(analysis.env.length, Math.floor(((b + 1) * barSec) / analysis.hopSec))
    let s = 0
    for (let i = i0; i < i1; i++) s += analysis.env[i]
    levels.push(i1 > i0 ? s / (i1 - i0) / analysis.maxRms : 0)
  }
  return levels
}

export function computeSections(analysis, bpm, bars) {
  const levels = barLevels(analysis, bpm, bars)
  const active = levels.map((l) => l > 0.12)
  const first = active.indexOf(true)
  const last = active.lastIndexOf(true)
  const activeLevels = levels.filter((_, i) => active[i]).sort((a, b) => a - b)
  const hookCut = activeLevels.length >= 4 ? activeLevels[Math.floor(activeLevels.length * 0.7)] : Infinity

  const labels = levels.map((l, i) => {
    if (first === -1) return 'verse'
    if (i < first) return 'intro'
    if (i > last) return 'outro'
    if (!active[i]) return 'break'
    return l >= hookCut ? 'hook' : 'verse'
  })

  const sections = []
  labels.forEach((name, i) => {
    const prev = sections[sections.length - 1]
    if (prev && prev.name === name) prev.end = i + 1
    else sections.push({ name, start: i, end: i + 1 })
  })
  return sections
}

export function mergeRegions(regions) {
  const sorted = regions.map((r) => ({ ...r })).sort((a, b) => a.start - b.start)
  const merged = []
  for (const r of sorted) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else merged.push(r)
  }
  return merged
}

export function subtractRegion(regions, cut) {
  const out = []
  for (const r of regions) {
    if (cut.end <= r.start || cut.start >= r.end) out.push(r)
    else {
      if (r.start < cut.start) out.push({ start: r.start, end: cut.start })
      if (r.end > cut.end) out.push({ start: cut.end, end: r.end })
    }
  }
  return out
}

const pick = (sections, names) => mergeRegions(sections.filter((s) => names.includes(s.name)))

// Where each instrument would naturally go, based on the vocal's sections.
export function defaultRegions(type, sections, bars) {
  const hasVocal = sections.some((s) => s.name === 'verse' || s.name === 'hook')
  const all = [{ start: 0, end: bars }]
  if (!hasVocal) return all
  let r
  switch (type) {
    case 'kick808': r = pick(sections, ['verse', 'hook']); break
    case 'hihat': r = pick(sections, ['verse', 'hook', 'break']); break
    case 'clap': r = pick(sections, ['verse', 'hook']); break
    case 'lead': r = pick(sections, ['intro', 'break', 'outro']); if (!r.length) r = pick(sections, ['hook']); break
    case 'glock': r = pick(sections, ['intro', 'hook', 'outro']); if (!r.length) r = pick(sections, ['verse']); break
    default: r = all
  }
  return r.length ? r : all
}

const REASONS = {
  kick808: (a, key) => `Follows your vocal and sits on ${NOTE_NAMES[key.pc]}, the root of ${keyName(key)}, so the low end locks to your melody.`,
  hihat: () => 'Keeps the groove moving under the vocal. Rolls land at the end of every 4th bar.',
  clap: () => 'Backbeat on beats 2 and 4 to give the vocal a spine.',
  lead: () => 'Answers you in the gaps where the vocal is quiet (call and response).',
  glock: () => 'Icy bell melody for the quiet and high-energy moments. Adds the music-box creep.',
  pad: () => 'Low, slow chords underneath everything for dread and glue.',
}
export const reasonFor = (type, analysis, key) => REASONS[type]?.(analysis, key) ?? ''

export function makeLayer(type, regions, analysis, key) {
  const def = LAYER_DEFS[type]
  const layer = {
    id: type,
    type,
    name: def.name,
    color: def.color,
    volume: def.volume,
    mute: false,
    solo: false,
    regions,
    params: { ...def.params },
    reason: reasonFor(type, analysis, key),
  }
  if (analysis) {
    if (type === 'hihat') layer.params.tone = analysis.brightness > 3500 ? 0.4 : 0.7
    if (type === 'kick808') layer.params.pattern = analysis.bpm < 100 ? 'sparse' : 'bounce'
  }
  return layer
}

// ---- arrangement ---------------------------------------------------------

export function generateArrangement(analysis) {
  const bpm = analysis.bpm
  const key = { pc: analysis.key.pc, mode: analysis.key.mode }
  const bars = Math.min(64, Math.max(4, Math.ceil(analysis.duration / barSecFor(bpm)) + 1))
  const sections = computeSections(analysis, bpm, bars)
  const order = ['kick808', 'hihat', 'clap', 'lead', 'glock', 'pad']
  const layers = order.map((t) => makeLayer(t, defaultRegions(t, sections, bars), analysis, key))
  return { bpm, key, bars, sections, layers, duration: analysis.duration }
}

// ---- text helpers --------------------------------------------------------

export const barRange = (r) => (r.end - r.start === 1 ? `bar ${r.start + 1}` : `bars ${r.start + 1}-${r.end}`)
export const regionsText = (regions) => (regions.length ? regions.map(barRange).join(', ') : 'nowhere')

export function sectionNamesFor(arr, region) {
  const names = arr.sections.filter((s) => s.start < region.end && s.end > region.start).map((s) => s.name)
  return [...new Set(names)].join('/')
}

export function describeArrangement(arr) {
  return arr.layers.map((l) => `${l.name}: ${regionsText(l.regions)}. ${l.reason}`)
}
