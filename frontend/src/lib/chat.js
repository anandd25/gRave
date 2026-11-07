import { parseKey, keyName } from './music'
import {
  LAYER_DEFS, makeLayer, defaultRegions, mergeRegions, subtractRegion,
  regionsText, computeSections, barSecFor, describeArrangement,
} from './producer'

// Local, rule-based producer chat. It understands plain-English edits and returns
// a new arrangement plus a human-readable list of what changed. An LLM/MCP agent
// can replace `interpret` later without touching the UI.

const TARGETS = [
  ['kick808', /\b(808s?|subs?|bass)\b/],
  ['hihat', /\b(hi-?hats?|hats?|hihats?)\b/],
  ['clap', /\b(claps?|snares?)\b/],
  ['lead', /\b(synth(?:\s?leads?)?|leads?)\b/],
  ['glock', /\b(glock\w*|bells?|chimes?|xylophone|music box)\b/],
  ['pad', /\b(pads?|atmos\w*|drones?|strings?)\b/],
  ['vocal', /\b(vocals?|voice|vox)\b/],
]
const ORDER = Object.keys(LAYER_DEFS)

const SECTION_WORDS = {
  intro: 'intro', verse: 'verse', verses: 'verse', hook: 'hook', chorus: 'hook',
  drop: 'hook', refrain: 'hook', break: 'break', bridge: 'break', gaps: 'break',
  gap: 'break', outro: 'outro', ending: 'outro',
}

const pct = (v) => `${Math.round(v * 100)}%`
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function parseWhere(text, arr) {
  const range = text.match(/\bbars?\s*(\d+)\s*(?:-|–|to|through|until)\s*(\d+)/)
  if (range) {
    const a = clamp(Number(range[1]) - 1, 0, arr.bars - 1)
    const b = clamp(Number(range[2]), a + 1, arr.bars)
    return [{ start: a, end: b }]
  }
  const single = text.match(/\bbar\s*(\d+)\b/)
  if (single) {
    const a = clamp(Number(single[1]) - 1, 0, arr.bars - 1)
    return [{ start: a, end: a + 1 }]
  }
  const names = new Set()
  const re = /\b(?:in|on|during|at|for|over|under)\s+(?:the\s+)?(intro|verses?|hook|chorus|drop|refrain|break|bridge|gaps?|outro|ending)\b/g
  for (const m of text.matchAll(re)) names.add(SECTION_WORDS[m[1]])
  if (names.size) {
    const regs = mergeRegions(arr.sections.filter((s) => names.has(s.name)))
    if (regs.length) return regs
  }
  if (/\b(everywhere|throughout|whole|entire|all the way|every bar)\b/.test(text)) {
    return [{ start: 0, end: arr.bars }]
  }
  return null
}

const INTENTS = [
  ['remove', /\b(remove|delete|drop|kill|take out|get rid|without|cut|scrap)\b/],
  ['unmute', /\bunmute\b/],
  ['mute', /\b(mute|silence)\b/],
  ['octaveUp', /\b(octave up|higher octave|an octave higher|up an octave)\b/],
  ['octaveDown', /\b(octave down|lower octave|an octave lower|down an octave)\b/],
  ['denser', /\b(denser|busier|more notes|more rolls|rolls|faster|quicker|more hats|more bells)\b/],
  ['sparser', /\b(sparser|simpler|less busy|fewer|calmer|less rolls|less hats)\b/],
  ['longer', /\b(longer|sustain|more decay)\b/],
  ['shorter', /\b(shorter|tighter|punchier)\b/],
  ['gritty', /\b(gritt\w*|distort\w*|dirty|drive|saturat\w*|crunch\w*)\b/],
  ['clean', /\b(clean|cleaner|smoother)\b/],
  ['heavier', /\b(heavier|harder|bouncier)\b/],
  ['lighter', /\b(lighter|softer pattern)\b/],
  ['up', /\b(louder|boost|turn up|increase|bigger|raise|more volume|pump)\b/],
  ['down', /\b(quieter|softer|turn down|reduce|decrease|lower the volume|less volume|smaller|quiet|tone down)\b/],
  ['add', /\b(add|put|include|bring in|throw in|give me|insert|want|need|use|with)\b/],
]

function detectIntent(clause) {
  for (const [name, re] of INTENTS) if (re.test(clause)) return name
  return null
}

function scaleRegions(regions, ratio, bars) {
  return mergeRegions(
    regions.map((r) => {
      const start = clamp(Math.round(r.start * ratio), 0, bars - 1)
      const end = clamp(Math.max(start + 1, Math.round(r.end * ratio)), start + 1, bars)
      return { start, end }
    }),
  )
}

function setTempo(next, analysis, bpm) {
  const old = next.bpm
  const bars = clamp(Math.ceil(next.duration / barSecFor(bpm)) + 1, 4, 64)
  const ratio = bpm / old
  next.layers.forEach((l) => { l.regions = scaleRegions(l.regions, ratio, bars) })
  next.bpm = bpm
  next.bars = bars
  next.sections = computeSections(analysis, bpm, bars)
}

export const HELP_EXAMPLES = [
  'Add glockenspiel in the intro',
  'Make the 808 louder and grittier',
  'Remove the hi-hats in bars 5-8',
  'Make it spookier',
  'Set tempo to 130 bpm',
  'Change key to F minor',
  'More reverb on the vocals',
  'Why is there a synth lead?',
]

export function interpret(raw, { arr, vocalMix, analysis }) {
  const text = raw.toLowerCase().trim()
  if (/^\s*(undo|revert|go back)\b/.test(text)) return { undo: true }
  if (/\b(reset|start over|regenerate|redo everything)\b/.test(text)) return { regen: true }

  const next = structuredClone(arr)
  let vocal = { ...vocalMix }
  const changes = []
  const notes = []
  const changed = new Set()
  let vocalChanged = false
  let prevIntent = null
  const wholeWhere = parseWhere(text, next)

  const clauses = text.split(/\s*(?:,|;|\bthen\b|\band\b)\s*/).filter(Boolean)
  let lastTs = []
  for (const clause of clauses) {
    let ts = TARGETS.filter(([, re]) => re.test(clause)).map(([t]) => t)
    if (ts.length) lastTs = ts
    else if (lastTs.length && detectIntent(clause)) ts = lastTs // "808 louder and grittier"
    const layerTs = ts.filter((t) => t !== 'vocal')
    let intent = detectIntent(clause)
    if (!intent && ts.length) intent = prevIntent
    if (intent) prevIntent = intent
    const where = parseWhere(clause, next) ?? (/\b(in|on|during|bars?)\b/.test(clause) ? null : wholeWhere)

    // ---- tempo
    const bm = clause.match(/(\d{2,3})\s*bpm|(?:bpm|tempo)\s*(?:to|of|at)?\s*(\d{2,3})/)
    const tempoWord = /\b(tempo|bpm|speed|song|beat|overall)\b/.test(clause)
    if (bm || (/\b(faster|speed up|quicker|slower|slow down)\b/.test(clause) && (!layerTs.length || tempoWord) && !ts.includes('vocal'))) {
      const target = bm
        ? clamp(Number(bm[1] || bm[2]), 60, 200)
        : clamp(next.bpm + (/\b(slower|slow down)\b/.test(clause) ? -10 : 10), 60, 200)
      if (target !== next.bpm) {
        const from = next.bpm
        setTempo(next, analysis, target)
        changes.push(`Tempo ${from} to ${target} BPM (all parts re-timed)`)
        ORDER.forEach((id) => changed.add(id))
      }
      continue
    }

    // ---- key / mode
    const keyIdx = clause.indexOf('key')
    const modeOnly = !layerTs.length && /\b(minor|major)\b/.test(clause)
    if (keyIdx !== -1 || modeOnly) {
      let k = keyIdx !== -1 ? parseKey(clause.slice(keyIdx + 3)) : null
      if (!k && modeOnly) k = { pc: next.key.pc, mode: /\bmajor\b/.test(clause) ? 'major' : 'minor' }
      if (k && (k.pc !== next.key.pc || k.mode !== next.key.mode)) {
        const from = keyName(next.key)
        next.key = k
        changes.push(`Key ${from} to ${keyName(k)} (808, lead, glockenspiel and pad re-tuned)`)
        ;['kick808', 'lead', 'glock', 'pad'].forEach((id) => changed.add(id))
        continue
      }
      if (k) continue
    }

    // ---- mood
    if (/\b(spook\w*|scar\w*|creep\w*|haunt\w*|horror|eerie|evil)\b/.test(clause)) {
      for (const t of ['pad', 'glock']) {
        if (!next.layers.some((l) => l.id === t)) {
          const layer = makeLayer(t, defaultRegions(t, next.sections, next.bars), analysis, next.key)
          next.layers.push(layer)
          changes.push(`Added ${layer.name} at ${regionsText(layer.regions)}`)
          changed.add(t)
        }
      }
      vocal = { ...vocal, reverb: clamp(vocal.reverb + 0.2, 0, 0.9) }
      vocalChanged = true
      changes.push(`Vocal reverb up to ${pct(vocal.reverb)} for a haunted room`)
      next.layers.forEach((l) => {
        if ('tone' in l.params) { l.params.tone = clamp(l.params.tone - 0.15, 0, 1); changed.add(l.id) }
      })
      changes.push('Darkened the tone of every part')
      continue
    }
    if (/\b(darker|dark|muddier|duller)\b/.test(clause) || /\b(brighter|bright|crisper|sparkl\w*)\b/.test(clause)) {
      const dir = /\b(brighter|bright|crisper|sparkl\w*)\b/.test(clause) ? 0.2 : -0.2
      next.layers.forEach((l) => {
        if ('tone' in l.params) { l.params.tone = clamp(l.params.tone + dir, 0, 1); changed.add(l.id) }
      })
      changes.push(dir > 0 ? 'Brightened every part' : 'Darkened every part')
      continue
    }

    // ---- vocal chain
    if (/\b(reverb|echo|wet|cathedral|hall|dry)\b/.test(clause)) {
      const less = /\b(dry|less|remove|reduce|lower|no)\b/.test(clause)
      vocal = { ...vocal, reverb: clamp(vocal.reverb + (less ? -0.2 : 0.2), 0, 1) }
      vocalChanged = true
      changes.push(`Vocal reverb ${less ? 'down' : 'up'} to ${pct(vocal.reverb)}`)
      continue
    }
    if (ts.includes('vocal') && (intent === 'up' || intent === 'down')) {
      vocal = { ...vocal, volume: clamp(vocal.volume + (intent === 'up' ? 0.15 : -0.15), 0.05, 1.2) }
      vocalChanged = true
      changes.push(`Vocal volume ${pct(vocal.volume)}`)
      continue
    }
    if (ts.includes('vocal') && intent === 'mute') { vocal = { ...vocal, mute: true }; vocalChanged = true; changes.push('Vocal muted'); continue }
    if (ts.includes('vocal') && intent === 'unmute') { vocal = { ...vocal, mute: false }; vocalChanged = true; changes.push('Vocal unmuted'); continue }

    // ---- layer operations
    for (const t of layerTs) {
      const def = LAYER_DEFS[t]
      let layer = next.layers.find((l) => l.id === t)

      if (!intent && /\b(why|explain|what)\b/.test(clause)) continue

      if (intent === 'add') {
        const regs = where ?? defaultRegions(t, next.sections, next.bars)
        if (!layer) {
          layer = makeLayer(t, regs, analysis, next.key)
          layer.reason = `Added at your request. ${layer.reason}`
          next.layers.push(layer)
          changes.push(`Added ${def.name} at ${regionsText(regs)}`)
          changed.add(t)
        } else if (where) {
          layer.regions = mergeRegions([...layer.regions, ...where])
          changes.push(`${def.name} now plays at ${regionsText(layer.regions)}`)
          changed.add(t)
        } else {
          notes.push(`${def.name} is already on at ${regionsText(layer.regions)}. Say where to add more, like "add ${def.name.toLowerCase()} in the hook".`)
        }
        continue
      }

      if (!layer) {
        if (intent) notes.push(`There's no ${def.name} yet. Say "add ${def.name.toLowerCase()}" first.`)
        continue
      }

      switch (intent) {
        case 'remove':
          if (where) {
            let regs = layer.regions
            for (const w of where) regs = subtractRegion(regs, w)
            layer.regions = regs
            if (!regs.length) {
              next.layers = next.layers.filter((l) => l.id !== t)
              changes.push(`Removed ${def.name}`)
            } else changes.push(`${def.name} cut from ${regionsText(where)}, still plays at ${regionsText(regs)}`)
          } else {
            next.layers = next.layers.filter((l) => l.id !== t)
            changes.push(`Removed ${def.name}`)
          }
          changed.add(t)
          break
        case 'mute': layer.mute = true; changes.push(`${def.name} muted`); changed.add(t); break
        case 'unmute': layer.mute = false; changes.push(`${def.name} unmuted`); changed.add(t); break
        case 'up':
          layer.volume = clamp(layer.volume + 0.15, 0.05, 1.2)
          changes.push(`${def.name} volume ${pct(layer.volume)}`); changed.add(t); break
        case 'down':
          layer.volume = clamp(layer.volume - 0.15, 0.05, 1.2)
          changes.push(`${def.name} volume ${pct(layer.volume)}`); changed.add(t); break
        case 'denser':
          if (t === 'hihat') {
            if (layer.params.density < 3) layer.params.density += 1
            layer.params.rolls = true
            changes.push(`Hi-hats busier (${['', 'offbeat', '8th notes', '16th notes'][layer.params.density]}, rolls on)`)
          } else if (t === 'glock') {
            layer.params.density = 2
            changes.push('Glockenspiel plays 8th notes now')
          } else { notes.push(`I can't make ${def.name} denser, try louder or add it in more places.`); break }
          changed.add(t); break
        case 'sparser':
          if (t === 'hihat') {
            if (layer.params.density > 1) layer.params.density -= 1
            layer.params.rolls = false
            changes.push(`Hi-hats simpler (${['', 'offbeat', '8th notes', '16th notes'][layer.params.density]}, rolls off)`)
          } else if (t === 'glock') {
            layer.params.density = 1
            changes.push('Glockenspiel plays quarter notes now')
          } else { notes.push(`${def.name} has no density setting. Try removing it from some bars.`); break }
          changed.add(t); break
        case 'longer': case 'shorter':
          if (t === 'kick808') {
            layer.params.decay = clamp(layer.params.decay + (intent === 'longer' ? 0.25 : -0.25), 0.25, 1.4)
            changes.push(`808 tail ${intent === 'longer' ? 'longer' : 'shorter'} (${layer.params.decay.toFixed(2)}s)`)
            changed.add(t)
          }
          break
        case 'gritty': case 'clean':
          if (t === 'kick808') {
            layer.params.drive = clamp(layer.params.drive + (intent === 'gritty' ? 0.25 : -0.25), 0, 1)
            changes.push(`808 distortion ${pct(layer.params.drive)}`); changed.add(t)
          }
          break
        case 'heavier': case 'lighter':
          if (t === 'kick808') {
            const pats = ['sparse', 'bounce', 'heavy']
            const i = clamp(pats.indexOf(layer.params.pattern) + (intent === 'heavier' ? 1 : -1), 0, 2)
            layer.params.pattern = pats[i]
            changes.push(`808 pattern: ${pats[i]}`); changed.add(t)
          }
          break
        case 'octaveUp': case 'octaveDown':
          if ('octave' in layer.params) {
            layer.params.octave = clamp(layer.params.octave + (intent === 'octaveUp' ? 1 : -1), -1, 2)
            changes.push(`${def.name} octave ${layer.params.octave >= 0 ? '+' : ''}${layer.params.octave}`); changed.add(t)
          }
          break
        default:
          break
      }
      if (t === 'lead') {
        const w = clause.match(/\b(square|saw|sawtooth|triangle|sine)\b/)
        if (w) {
          layer.params.wave = w[1] === 'saw' ? 'sawtooth' : w[1]
          changes.push(`Synth lead waveform: ${layer.params.wave}`); changed.add(t)
        }
      }
    }
  }

  // ---- explain (only if nothing else happened)
  if (!changes.length && !notes.length && /\b(why|explain|what|summary|list|show|how|describe)\b/.test(text)) {
    const ts = TARGETS.filter(([, re]) => re.test(text)).map(([t]) => t)
    const lines = ts.length
      ? next.layers.filter((l) => ts.includes(l.id)).map((l) => `${l.name} (${regionsText(l.regions)}): ${l.reason}`)
      : describeArrangement(next)
    return { reply: 'Here is what I did and why:', changes: lines }
  }

  if (!changes.length && !notes.length) {
    return {
      reply: `I didn't catch a change in that. Try something like: ${HELP_EXAMPLES.slice(0, 4).map((e) => `"${e}"`).join(', ')}.`,
      changes: [],
    }
  }

  next.layers.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
  const reply = [changes.length ? 'Done. The mix is updating.' : '', ...notes].filter(Boolean).join(' ')
  return {
    reply,
    changes,
    arr: changes.length ? next : null,
    vocalMix: vocalChanged ? vocal : null,
    changed: [...changed],
  }
}
