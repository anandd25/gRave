function Knob({ id, label, min, max, step, value, unit, onChange }) {
  return (
    <div>
      <label htmlFor={id} className="flex justify-between text-xs text-bone/70">
        <span>{label}</span>
        <span className="text-spirit tabular-nums">{value}{unit}</span>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-spirit" />
    </div>
  )
}

export default function CursePanel({ settings, onChange, busy, disabled, cursed, status, onCurse, onRestore }) {
  const set = (k) => (v) => onChange({ ...settings, [k]: v })
  return (
    <section aria-labelledby="curse-h" className="rounded-lg border border-spirit/30 bg-tomb p-4">
      <h2 id="curse-h" className="mb-3 text-xs uppercase tracking-widest text-spirit">Curse the vocal (Pedalboard)</h2>
      <div className="space-y-3">
        <Knob id="c-pitch" label="Pitch shift" min={-12} max={0} step={0.5} unit=" st" value={settings.pitch_semitones} onChange={set('pitch_semitones')} />
        <Knob id="c-formant" label="Formant warp" min={-100} max={100} step={5} unit="" value={settings.formant_warp} onChange={set('formant_warp')} />
        <Knob id="c-rev" label="Crypt reverb" min={0} max={1} step={0.05} unit="" value={settings.reverb_mix} onChange={set('reverb_mix')} />
        <Knob id="c-grit" label="Grit" min={0} max={1} step={0.05} unit="" value={settings.grit} onChange={set('grit')} />
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onCurse} disabled={disabled || busy}
          className="flex-1 rounded border border-blood px-3 py-2 text-sm font-bold text-blood hover:bg-blood/10 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ecto">
          {busy ? 'Chanting…' : 'Curse it'}
        </button>
        {cursed && (
          <button type="button" onClick={onRestore} disabled={busy}
            className="rounded border border-spirit px-3 py-2 text-sm font-bold text-spirit hover:bg-spirit/10 focus-visible:outline-2 focus-visible:outline-ecto">
            Restore
          </button>
        )}
      </div>
      {status && <p className="mt-2 text-[11px] text-bone/60" role="status">{status}</p>}
    </section>
  )
}
