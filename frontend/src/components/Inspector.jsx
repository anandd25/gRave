import { useState } from 'react'

const pct = (v) => `${Math.round(v * 100)}%`
const BOX = 'rounded-lg border border-spirit/30 bg-tomb p-4'
const HEAD = 'mb-3 text-xs uppercase tracking-widest text-spirit'

const PARAM_LABELS = {
  decay: 'Decay / tail', glide: 'Pitch glide', drive: 'Distortion', tune: 'Tune (semitones)',
  tone: 'Tone (dark to bright)', octave: 'Octave', release: 'Release', detune: 'Detune (cents)',
  attack: 'Attack (swell)', vibrato: 'Vibrato', wave: 'Waveform',
}
const KIND_HELP = {
  hits: 'Hits: choose which 16th steps play in every bar of this section.',
  melodic: 'Melodic: choose the steps, then the note (scale degree) for each hit.',
  chords: 'Chords: one chord root per 2 bars, repeating.',
  sustained: 'Sustained: plays continuously through each section.',
}

function Slider({ id, label, min, max, step, value, fmt = (v) => v, onChange }) {
  return (
    <div>
      <label htmlFor={id} className="flex justify-between text-xs text-bone/70">
        <span>{label}</span>
        <span className="text-spirit tabular-nums">{fmt(value)}</span>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-spirit" />
    </div>
  )
}

// 16 toggles = one bar of 16th notes.
function StepGrid({ label, steps, color, onToggle }) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-1 text-[11px] text-bone/50">{label}</p>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
        {Array.from({ length: 16 }, (_, s) => {
          const on = steps.includes(s)
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              aria-label={`${label} step ${s + 1}`}
              onClick={() => onToggle(s)}
              className={`h-7 rounded-sm border text-[9px] focus-visible:outline-2 focus-visible:outline-ecto ${
                s % 4 === 0 ? 'border-bone/40' : 'border-spirit/30'
              }`}
              style={on ? { background: color, borderColor: color, color: '#0b0710' } : undefined}
            >
              {s % 4 === 0 ? s / 4 + 1 : ''}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Controls generated from the backend's catalog spec, so every instrument works.
function ParamControls({ layer, spec, set }) {
  if (!spec) return <p className="text-[11px] text-bone/40">Sound settings load from the backend.</p>
  return Object.entries(spec.params).map(([key, s]) => {
    const id = `${layer.id}-${key}`
    const label = PARAM_LABELS[key] ?? key
    const value = layer.params[key] ?? s.default
    if (s.type === 'choice') {
      return (
        <div key={key} className="flex items-center justify-between gap-2 text-xs text-bone/70">
          <label htmlFor={id}>{label}</label>
          <select id={id} value={value} onChange={(e) => set({ [key]: e.target.value })}
            className="rounded border border-spirit/40 bg-crypt px-2 py-1 text-bone">
            {s.choices.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )
    }
    const unitFmt = s.int ? (v) => (v > 0 ? `+${v}` : v) : s.max <= 1 ? pct : (v) => Number(v).toFixed(2)
    return (
      <Slider key={key} id={id} label={label} min={s.min} max={s.max}
        step={s.int ? 1 : (s.max - s.min) / 100} value={value} fmt={unitFmt} onChange={(v) => set({ [key]: v })} />
    )
  })
}

const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)
function setPath(obj, path, value) {
  const [k, ...rest] = path.split('.')
  if (!rest.length) return { ...obj, [k]: value }
  return { ...obj, [k]: setPath(obj?.[k] ?? {}, rest.join('.'), value) }
}

// Slider on a logarithmic scale (filter cutoff), so low frequencies stay usable.
function LogSlider({ id, label, min, max, value, onChange }) {
  const pos = Math.round((Math.log(value / min) / Math.log(max / min)) * 1000)
  return (
    <div>
      <label htmlFor={id} className="flex justify-between text-xs text-bone/70">
        <span>{label}</span>
        <span className="text-spirit tabular-nums">{Math.round(value)}</span>
      </label>
      <input id={id} type="range" min={0} max={1000} step={1} value={pos}
        onChange={(e) => onChange(Math.round(min * (max / min) ** (Number(e.target.value) / 1000)))}
        className="w-full accent-spirit" />
    </div>
  )
}

const fmtNum = (v) => (Math.abs(v) >= 100 ? Math.round(v) : Number(v).toFixed(2))

// Editor for an AI-designed custom instrument. Ranges come from the backend.
function PatchEditor({ layer, spec, onPatch }) {
  const P = layer.patch
  if (!spec) return <p className="text-[11px] text-bone/40">Sound design controls load from the backend.</p>
  const set = (path, v) => onPatch(setPath(P, path, v))
  const lim = spec.source_limits
  const setSource = (i, patch) => onPatch({ ...P, sources: P.sources.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  return (
    <details open className="rounded border border-spirit/20 p-2">
      <summary className="cursor-pointer text-xs text-spirit">Sound design (AI-generated patch)</summary>
      <p className="my-2 text-[11px] text-bone/50">Tweak it here, or describe the change in chat, like "make it rustier".</p>

      <fieldset className="mb-3 space-y-2">
        <legend className="mb-1 text-[11px] text-bone/50">Sound sources</legend>
        {P.sources.map((s, i) => (
          <div key={i} className="space-y-1 rounded border border-spirit/15 p-2">
            <div className="flex items-center gap-2 text-xs">
              <label htmlFor={`${layer.id}-src${i}`} className="text-bone/60">Source {i + 1}</label>
              <select id={`${layer.id}-src${i}`} value={s.type} onChange={(e) => setSource(i, { type: e.target.value })}
                className="rounded border border-spirit/40 bg-crypt px-1 py-0.5 text-bone">
                {spec.source_types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {P.sources.length > 1 && (
                <button type="button" aria-label={`Remove source ${i + 1}`}
                  onClick={() => onPatch({ ...P, sources: P.sources.filter((_, j) => j !== i) })}
                  className="ml-auto rounded border border-blood/60 px-2 text-blood hover:bg-blood/10">×</button>
              )}
            </div>
            <Slider id={`${layer.id}-src${i}-lvl`} label="Level" min={lim.level.min} max={lim.level.max} step={0.01}
              value={s.level} fmt={pct} onChange={(v) => setSource(i, { level: v })} />
            {s.type !== 'noise' && (
              <>
                <Slider id={`${layer.id}-src${i}-ratio`} label="Pitch ratio" min={lim.ratio.min} max={lim.ratio.max} step={0.01}
                  value={s.ratio} fmt={fmtNum} onChange={(v) => setSource(i, { ratio: v })} />
                <Slider id={`${layer.id}-src${i}-det`} label="Detune (cents)" min={lim.detune.min} max={lim.detune.max} step={1}
                  value={s.detune} fmt={fmtNum} onChange={(v) => setSource(i, { detune: v })} />
              </>
            )}
          </div>
        ))}
        {P.sources.length < spec.max_sources && (
          <button type="button"
            onClick={() => onPatch({ ...P, sources: [...P.sources, { type: 'sine', ratio: 2, detune: 0, level: 0.3 }] })}
            className="rounded border border-spirit/50 px-2 py-1 text-xs text-spirit hover:bg-spirit/10">
            + Add source
          </button>
        )}
      </fieldset>

      <div className="space-y-3">
        {spec.knobs.map((k) => {
          const id = `${layer.id}-${k.path}`
          const value = getPath(P, k.path) ?? k.default
          if (k.type === 'choice') {
            return (
              <div key={k.path} className="flex items-center justify-between gap-2 text-xs text-bone/70">
                <label htmlFor={id}>{k.label}</label>
                <select id={id} value={value} onChange={(e) => set(k.path, e.target.value)}
                  className="rounded border border-spirit/40 bg-crypt px-2 py-1 text-bone">
                  {k.choices.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )
          }
          if (k.log) return <LogSlider key={k.path} id={id} label={k.label} min={k.min} max={k.max} value={value} onChange={(v) => set(k.path, v)} />
          return (
            <Slider key={k.path} id={id} label={k.label} min={k.min} max={k.max}
              step={k.int ? 1 : (k.max - k.min) / 200} value={value} fmt={k.int ? (v) => (v > 0 ? `+${v}` : v) : fmtNum}
              onChange={(v) => set(k.path, v)} />
          )
        })}
      </div>
    </details>
  )
}

function PatternEditor({ layer, region, onChange }) {
  const p = region.pattern

  if (layer.kind === 'sustained') return null

  if (layer.kind === 'chords') {
    const setDegs = (degrees) => onChange({ ...p, degrees })
    return (
      <div role="group" aria-label="Chord roots, one per 2 bars">
        <p className="mb-1 text-[11px] text-bone/50">Chord root (scale degree) for each 2 bars, repeating</p>
        <div className="flex flex-wrap items-center gap-1">
          {p.degrees.map((d, i) => (
            <input key={i} type="number" min={-7} max={14} value={d} aria-label={`Chord ${i + 1} root degree`}
              onChange={(e) => setDegs(p.degrees.map((x, j) => (j === i ? Number(e.target.value) : x)))}
              className="w-14 rounded border border-spirit/40 bg-crypt px-1 py-0.5 text-xs" />
          ))}
          <button type="button" aria-label="Add chord" disabled={p.degrees.length >= 8}
            onClick={() => setDegs([...p.degrees, 0])}
            className="rounded border border-spirit/50 px-2 text-xs text-spirit disabled:opacity-30">+</button>
          <button type="button" aria-label="Remove last chord" disabled={p.degrees.length <= 1}
            onClick={() => setDegs(p.degrees.slice(0, -1))}
            className="rounded border border-spirit/50 px-2 text-xs text-spirit disabled:opacity-30">−</button>
        </div>
      </div>
    )
  }

  const melodic = layer.kind === 'melodic'
  const toggle = (key) => (s) => {
    const list = p[key]
    if (key === 'fill_steps') {
      return onChange({ ...p, fill_steps: list.includes(s) ? list.filter((x) => x !== s) : [...list, s].sort((a, b) => a - b) })
    }
    if (list.includes(s)) {
      if (list.length === 1) return undefined // keep at least one hit
      const i = list.indexOf(s)
      return onChange({ ...p, steps: list.filter((x) => x !== s), degrees: melodic ? p.degrees.filter((_, j) => j !== i) : [] })
    }
    const steps = [...list, s].sort((a, b) => a - b)
    const degrees = [...p.degrees]
    degrees.splice(steps.indexOf(s), 0, 0)
    return onChange({ ...p, steps, degrees: melodic ? degrees : [] })
  }

  return (
    <div className="space-y-3">
      <StepGrid label="Pattern (every bar of this section)" steps={p.steps} color={layer.color} onToggle={toggle('steps')} />
      <StepGrid label="Fill (every 4th bar, optional)" steps={p.fill_steps} color={layer.color} onToggle={toggle('fill_steps')} />
      {melodic && (
        <div role="group" aria-label="Note for each hit">
          <p className="mb-1 text-[11px] text-bone/50">Note for each hit (scale degree, 0 = key root)</p>
          <div className="flex flex-wrap gap-1">
            {p.steps.map((s, i) => (
              <label key={s} className="flex flex-col items-center text-[9px] text-bone/50">
                {s + 1}
                <input type="number" min={-14} max={14} value={p.degrees[i] ?? 0} aria-label={`Note at step ${s + 1}`}
                  onChange={(e) => onChange({ ...p, degrees: p.degrees.map((x, j) => (j === i ? Number(e.target.value) : x)) })}
                  className="w-12 rounded border border-spirit/40 bg-crypt px-1 py-0.5 text-xs text-bone" />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LayerInspector({ arr, layer, spec, patchSpec, onUpdateLayer, onRemoveLayer }) {
  const [ri, setRi] = useState(0)
  const idx = Math.min(ri, layer.regions.length - 1)
  const region = layer.regions[idx]

  const set = (patch) => onUpdateLayer(layer.id, (l) => ({ ...l, params: { ...l.params, ...patch } }))
  const setRegion = (i, patch) =>
    onUpdateLayer(layer.id, (l) => ({ ...l, regions: l.regions.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  const editBar = (i, key, value) => {
    const next = { ...layer.regions[i], [key]: value }
    if (next.end > next.start && next.start >= 0 && next.end <= arr.bars) setRegion(i, { [key]: value })
  }

  return (
    <section aria-labelledby="insp-h" className={BOX}>
      <h2 id="insp-h" className={HEAD}>Inspector · {layer.name}{layer.patch && ' ✦'}</h2>
      {layer.patch ? (
        <p className="mb-2 text-[11px] italic text-bone/50">Custom instrument designed by the AI for this track.</p>
      ) : (
        spec?.blurb && <p className="mb-2 text-[11px] italic text-bone/50">{spec.blurb}</p>
      )}
      {layer.reason && (
        <p className="mb-3 text-xs leading-relaxed text-bone/70"><span className="text-ecto">Why: </span>{layer.reason}</p>
      )}

      <fieldset className="mb-3">
        <legend className="mb-1 text-xs text-bone/50">Sections (pick one to edit its pattern)</legend>
        {layer.regions.map((r, i) => (
          <div key={i} className="mb-1 flex items-center gap-1 text-xs">
            <input type="radio" name={`region-${layer.id}`} checked={i === idx} onChange={() => setRi(i)}
              aria-label={`Edit section ${i + 1}`} className="accent-spirit" />
            <input type="number" aria-label={`Section ${i + 1} start bar`} min={1} max={arr.bars} value={r.start + 1}
              onChange={(e) => editBar(i, 'start', Number(e.target.value) - 1)}
              className="w-14 rounded border border-spirit/40 bg-crypt px-1 py-0.5" />
            <span>to</span>
            <input type="number" aria-label={`Section ${i + 1} end bar`} min={1} max={arr.bars} value={r.end}
              onChange={(e) => editBar(i, 'end', Number(e.target.value))}
              className="w-14 rounded border border-spirit/40 bg-crypt px-1 py-0.5" />
            {layer.regions.length > 1 && (
              <button type="button" aria-label={`Remove section ${i + 1}`}
                onClick={() => { setRi(0); onUpdateLayer(layer.id, (l) => ({ ...l, regions: l.regions.filter((_, j) => j !== i) })) }}
                className="ml-auto rounded border border-blood/60 px-2 text-blood hover:bg-blood/10">×</button>
            )}
          </div>
        ))}
        <button type="button"
          onClick={() => {
            const last = layer.regions[layer.regions.length - 1]
            const start = Math.min(last.end, arr.bars - 1)
            onUpdateLayer(layer.id, (l) => ({
              ...l,
              regions: [...l.regions, { start, end: Math.min(arr.bars, start + 4), why: 'Added by you', pattern: structuredClone(last.pattern) }],
            }))
            setRi(layer.regions.length)
          }}
          className="mt-1 rounded border border-spirit/50 px-2 py-1 text-xs text-spirit hover:bg-spirit/10">
          + Add section
        </button>
      </fieldset>

      <p className="mb-2 text-[11px] text-bone/40">{KIND_HELP[layer.kind]}</p>
      {region && (
        <>
          {region.why && <p className="mb-2 text-[11px] text-bone/50">This section: {region.why}</p>}
          <PatternEditor layer={layer} region={region} onChange={(pattern) => setRegion(idx, { pattern })} />
        </>
      )}

      <div className="mt-3 space-y-3">
        {layer.patch ? (
          <PatchEditor layer={layer} spec={patchSpec} onPatch={(patch) => onUpdateLayer(layer.id, (l) => ({ ...l, patch }))} />
        ) : (
          <ParamControls layer={layer} spec={spec} set={set} />
        )}
      </div>

      <button type="button" onClick={() => onRemoveLayer(layer.id)}
        className="mt-4 w-full rounded border border-blood px-3 py-2 text-sm font-bold text-blood hover:bg-blood/10 focus-visible:outline-2 focus-visible:outline-ecto">
        Remove {layer.name}
      </button>
    </section>
  )
}

export default function Inspector({ arr, catalog, patchSpec, selectedId, vocalMix, onVocalMix, onUpdateLayer, onRemoveLayer }) {
  const layer = arr?.layers.find((l) => l.id === selectedId)

  if (selectedId === 'vocal') {
    return (
      <section aria-labelledby="insp-h" className={BOX}>
        <h2 id="insp-h" className={HEAD}>Inspector · Your vocal</h2>
        <div className="space-y-3">
          <Slider id="v-rev" label="Reverb (crypt room)" min={0} max={1} step={0.05} value={vocalMix.reverb} fmt={pct} onChange={(v) => onVocalMix({ reverb: v })} />
          <Slider id="v-vol" label="Volume" min={0} max={1.2} step={0.01} value={vocalMix.volume} fmt={pct} onChange={(v) => onVocalMix({ volume: v })} />
        </div>
      </section>
    )
  }
  if (!layer) {
    return (
      <section aria-labelledby="insp-h" className={BOX}>
        <h2 id="insp-h" className={HEAD}>Inspector</h2>
        <p className="text-xs text-bone/50">Click a part on the timeline to see why the producer chose it, then edit it or ask the chat to swap it for something else.</p>
      </section>
    )
  }
  return (
    <LayerInspector key={layer.id} arr={arr} layer={layer} spec={catalog?.[layer.instrument]} patchSpec={patchSpec}
      onUpdateLayer={onUpdateLayer} onRemoveLayer={onRemoveLayer} />
  )
}
