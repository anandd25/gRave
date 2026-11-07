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

export default function AnalysisPanel({ analysis, arr }) {
  return (
    <section aria-labelledby="ana-h" className="rounded-lg border border-spirit/30 bg-tomb p-4">
      <h2 id="ana-h" className="mb-3 text-xs uppercase tracking-widest text-spirit">What the producer heard</h2>
      <dl className="grid grid-cols-3 gap-2">
        <Stat label="BPM" value={arr?.bpm} />
        <Stat label="Key" value={arr ? `${['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][arr.key.pc]}${arr.key.mode === 'minor' ? 'm' : ''}` : null} />
        <Stat label="Bright" value={analysis?.brightness} unit="Hz" />
      </dl>
      {analysis && (
        <p className="mt-2 text-[11px] text-bone/50">
          Estimated in your browser from the vocal. {analysis.bpmFallback && 'Tempo unclear, defaulted to 140. '}
          {analysis.key.fallback && 'Key unclear, defaulted to C minor. '}
          Ask the chat to change any of it.
        </p>
      )}
    </section>
  )
}
