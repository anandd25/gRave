import { mergeRegions } from '../lib/producer'

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

function Select({ id, label, value, options, onChange }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-bone/70">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded border border-spirit/40 bg-crypt px-2 py-1 text-bone">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}

const pct = (v) => `${Math.round(v * 100)}%`

function LayerParams({ layer, set }) {
  const p = layer.params
  const id = (n) => `${layer.id}-${n}`
  const tone = <Slider key="tone" id={id('tone')} label="Tone (dark to bright)" min={0} max={1} step={0.05} value={p.tone} fmt={pct} onChange={(v) => set({ tone: v })} />
  switch (layer.type) {
    case 'kick808':
      return (
        <>
          <Select id={id('pat')} label="Pattern" value={p.pattern} onChange={(v) => set({ pattern: v })}
            options={[['sparse', 'Sparse'], ['bounce', 'Bounce'], ['heavy', 'Heavy']]} />
          <Slider id={id('decay')} label="Tail length" min={0.25} max={1.4} step={0.05} value={p.decay} fmt={(v) => `${v.toFixed(2)}s`} onChange={(v) => set({ decay: v })} />
          <Slider id={id('drive')} label="Distortion" min={0} max={1} step={0.05} value={p.drive} fmt={pct} onChange={(v) => set({ drive: v })} />
          <Slider id={id('glide')} label="Pitch glide" min={0} max={1} step={0.05} value={p.glide} fmt={pct} onChange={(v) => set({ glide: v })} />
          <Slider id={id('tune')} label="Tune" min={-12} max={12} step={1} value={p.tune} fmt={(v) => `${v > 0 ? '+' : ''}${v} st`} onChange={(v) => set({ tune: v })} />
        </>
      )
    case 'hihat':
      return (
        <>
          <Select id={id('den')} label="Pattern" value={p.density} onChange={(v) => set({ density: Number(v) })}
            options={[[1, 'Offbeat'], [2, '8th notes'], [3, '16th notes']]} />
          <label className="flex items-center gap-2 text-xs text-bone/70">
            <input type="checkbox" checked={p.rolls} onChange={(e) => set({ rolls: e.target.checked })} className="accent-spirit" />
            Hi-hat rolls every 4th bar
          </label>
          {tone}
        </>
      )
    case 'lead':
      return (
        <>
          <Select id={id('wave')} label="Waveform" value={p.wave} onChange={(v) => set({ wave: v })}
            options={[['sawtooth', 'Saw'], ['square', 'Square'], ['triangle', 'Triangle'], ['sine', 'Sine']]} />
          <Slider id={id('oct')} label="Octave" min={-1} max={2} step={1} value={p.octave} fmt={(v) => (v > 0 ? `+${v}` : v)} onChange={(v) => set({ octave: v })} />
          {tone}
        </>
      )
    case 'glock':
      return (
        <>
          <Select id={id('den')} label="Rhythm" value={p.density} onChange={(v) => set({ density: Number(v) })}
            options={[[1, 'Quarter notes'], [2, '8th notes']]} />
          <Slider id={id('oct')} label="Octave" min={-1} max={2} step={1} value={p.octave} fmt={(v) => (v > 0 ? `+${v}` : v)} onChange={(v) => set({ octave: v })} />
          {tone}
        </>
      )
    default:
      return tone
  }
}

export default function Inspector({ arr, selectedId, vocalMix, onVocalMix, onUpdateLayer, onRemoveLayer }) {
  const layer = arr?.layers.find((l) => l.id === selectedId)

  const box = 'rounded-lg border border-spirit/30 bg-tomb p-4'
  const head = 'mb-3 text-xs uppercase tracking-widest text-spirit'

  if (selectedId === 'vocal') {
    return (
      <section aria-labelledby="insp-h" className={box}>
        <h2 id="insp-h" className={head}>Inspector · Your vocal</h2>
        <div className="space-y-3">
          <Slider id="v-rev" label="Reverb (crypt room)" min={0} max={1} step={0.05} value={vocalMix.reverb} fmt={pct} onChange={(v) => onVocalMix({ reverb: v })} />
          <Slider id="v-vol" label="Volume" min={0} max={1.2} step={0.01} value={vocalMix.volume} fmt={pct} onChange={(v) => onVocalMix({ volume: v })} />
        </div>
      </section>
    )
  }

  if (!layer) {
    return (
      <section aria-labelledby="insp-h" className={box}>
        <h2 id="insp-h" className={head}>Inspector</h2>
        <p className="text-xs text-bone/50">Click a part on the timeline to see why it was added and tweak it.</p>
      </section>
    )
  }

  const set = (patch) => onUpdateLayer(layer.id, (l) => ({ ...l, params: { ...l.params, ...patch } }))
  const setRegions = (regions) => onUpdateLayer(layer.id, (l) => ({ ...l, regions }))
  const editRegion = (i, key, value) => {
    const regions = layer.regions.map((r, j) => (j === i ? { ...r, [key]: value } : r))
    const r = regions[i]
    if (r.end <= r.start) return
    setRegions(regions)
  }

  return (
    <section aria-labelledby="insp-h" className={box}>
      <h2 id="insp-h" className={head}>Inspector · {layer.name}</h2>
      <p className="mb-3 text-xs leading-relaxed text-bone/70">
        <span className="text-ecto">Why: </span>{layer.reason}
      </p>

      <fieldset className="mb-3">
        <legend className="mb-1 text-xs text-bone/50">Plays at (bar numbers)</legend>
        {layer.regions.map((r, i) => (
          <div key={i} className="mb-1 flex items-center gap-1 text-xs">
            <input type="number" aria-label={`Region ${i + 1} start bar`} min={1} max={arr.bars} value={r.start + 1}
              onChange={(e) => editRegion(i, 'start', Math.max(0, Number(e.target.value) - 1))}
              className="w-14 rounded border border-spirit/40 bg-crypt px-1 py-0.5" />
            <span>to</span>
            <input type="number" aria-label={`Region ${i + 1} end bar`} min={1} max={arr.bars} value={r.end}
              onChange={(e) => editRegion(i, 'end', Math.min(arr.bars, Number(e.target.value)))}
              className="w-14 rounded border border-spirit/40 bg-crypt px-1 py-0.5" />
            <button type="button" aria-label={`Remove region ${i + 1}`} onClick={() => setRegions(layer.regions.filter((_, j) => j !== i))}
              className="ml-auto rounded border border-blood/60 px-2 text-blood hover:bg-blood/10">×</button>
          </div>
        ))}
        <button type="button"
          onClick={() => {
            const last = layer.regions[layer.regions.length - 1]
            const start = last ? Math.min(last.end, arr.bars - 1) : 0
            setRegions(mergeRegions([...layer.regions, { start, end: Math.min(arr.bars, start + 4) }]))
          }}
          className="mt-1 rounded border border-spirit/50 px-2 py-1 text-xs text-spirit hover:bg-spirit/10">
          + Add section
        </button>
      </fieldset>

      <div className="space-y-3"><LayerParams layer={layer} set={set} /></div>

      <button type="button" onClick={() => onRemoveLayer(layer.id)}
        className="mt-4 w-full rounded border border-blood px-3 py-2 text-sm font-bold text-blood hover:bg-blood/10 focus-visible:outline-2 focus-visible:outline-ecto">
        Remove {layer.name}
      </button>
    </section>
  )
}
