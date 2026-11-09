function Stat({ label, value, unit }) {
  return (
    <div className="rounded border border-spirit/20 bg-crypt/60 p-2 text-center">
      <dt className="text-[10px] uppercase tracking-widest text-bone/50">{label}</dt>
      <dd className="mt-1 text-lg text-ecto glow-ecto">
        {value ?? '—'} {value != null && unit && <span className="text-xs text-bone/50">{unit}</span>}
      </dd>
    </div>
  )
}

export default function AnalysisPanel({ analysis, arr, source, model }) {
  return (
    <section aria-labelledby="ana-h" className="rounded-lg border border-spirit/30 bg-tomb p-4">
      <h2 id="ana-h" className="mb-3 text-xs uppercase tracking-widest text-spirit">What the producer heard</h2>
      <dl className="grid grid-cols-3 gap-2">
        <Stat label="BPM" value={analysis?.bpm} />
        <Stat label="Key" value={analysis?.key} />
        <Stat label="Bright" value={analysis?.brightness_hz} unit="Hz" />
      </dl>
      {analysis && (
        <p className="mt-2 text-[11px] text-bone/50">
          Measured by Librosa on the backend. {analysis.bpm_fallback && 'Tempo unclear, defaulted to 140. '}
          {analysis.key_fallback && 'Key unclear, defaulted to C minor. '}
        </p>
      )}
      {arr && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-bone/70">
            Genre: <span className="text-ecto">{arr.genreName}</span> · beat {arr.bpm} BPM
            {arr.swing > 0 && ` · swing ${Math.round(arr.swing * 100)}%`}
          </p>
          <p className="mb-1 text-[10px] uppercase tracking-widest text-bone/50">Palette</p>
          <ul className="flex flex-wrap gap-1" aria-label="Instruments in this beat">
            {arr.layers.map((l) => (
              <li key={l.id} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: l.color, color: l.color }}
                title={l.patch ? 'Custom instrument designed by the AI' : undefined}>
                {l.patch && <span aria-hidden="true">✦ </span>}
                {l.name}
                {l.patch && <span className="sr-only"> (custom, designed by AI)</span>}
              </li>
            ))}
          </ul>
          {arr.paletteReason && <p className="mt-2 text-[11px] leading-relaxed text-bone/60">{arr.paletteReason}</p>}
        </div>
      )}
      {source && (
        <p className={`mt-2 rounded px-2 py-1 text-[11px] ${source === 'ai' ? 'bg-ecto/10 text-ecto' : 'bg-orange-500/10 text-orange-400'}`}>
          {source === 'ai' ? `Beat planned by AI (${model})` : 'Beat planned by built-in rules (no AI model used)'}
        </p>
      )}
    </section>
  )
}
