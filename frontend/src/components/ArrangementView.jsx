import Waveform from './Waveform'
import { barRange } from '../lib/plan'

const SECTION_STYLE = {
  intro: 'bg-bone/10 text-bone/60',
  verse: 'bg-spirit/25 text-spirit',
  hook: 'bg-blood/30 text-blood',
  break: 'bg-bone/5 text-bone/40',
  outro: 'bg-bone/10 text-bone/60',
}

function LaneHeader({ label, color, mix, selected, onSelect, onMix }) {
  const btn = (active, cls) =>
    `h-6 w-6 rounded border text-[11px] font-bold focus-visible:outline-2 focus-visible:outline-ecto ${
      active ? cls : 'border-spirit/40 text-bone/70 hover:border-spirit'
    }`
  return (
    <div className={`flex w-48 shrink-0 flex-col justify-between gap-2 border-r border-spirit/20 p-2 ${selected ? 'bg-slab' : 'bg-tomb'}`}>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex items-center gap-2 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ecto"
      >
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </button>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={`Mute ${label}`} aria-pressed={mix.mute} onClick={() => onMix({ mute: !mix.mute })} className={btn(mix.mute, 'border-blood bg-blood/30 text-blood')}>M</button>
        <button type="button" aria-label={`Solo ${label}`} aria-pressed={mix.solo} onClick={() => onMix({ solo: !mix.solo })} className={btn(mix.solo, 'border-ecto bg-ecto/20 text-ecto')}>S</button>
        <input
          type="range" min="0" max="1.2" step="0.01" value={mix.volume}
          aria-label={`${label} volume`}
          onChange={(e) => onMix({ volume: Number(e.target.value) })}
          className="w-full accent-spirit"
        />
      </div>
    </div>
  )
}

export default function ArrangementView({
  arr, peaks, timelineSec, vocalMix, onVocalMix, onLayerMix,
  selectedId, onSelect, changedIds, progress,
}) {
  if (!arr || !timelineSec) {
    return (
      <section aria-label="Arrangement" className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-spirit/30 bg-tomb/60 p-6 text-center text-sm text-bone/50">
        Drop in a vocal. The producer will listen, then decide where every instrument goes.
      </section>
    )
  }

  const barSec = 240 / arr.bpm
  const off = arr.offset || 0
  const pctOf = (sec) => `${(sec / timelineSec) * 100}%`
  const at = (bar) => pctOf(off + bar * barSec) // bar position on the timeline
  const span = (bars) => pctOf(bars * barSec)

  // Bar lines start at the beat grid offset, not at zero.
  const grid = (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0"
      style={{
        left: pctOf(off),
        backgroundImage: 'repeating-linear-gradient(to right, rgba(180,107,255,.16) 0, rgba(180,107,255,.16) 1px, transparent 1px, transparent 100%)',
        backgroundSize: `${(barSec / Math.max(0.01, timelineSec - off)) * 100}% 100%`,
        backgroundRepeat: 'repeat-x',
      }}
    />
  )

  return (
    <section aria-label="Arrangement" className="relative overflow-hidden rounded-lg border border-spirit/30">
      <div className="flex border-b border-spirit/20 bg-tomb">
        <div className="w-48 shrink-0 border-r border-spirit/20 p-2 text-[10px] uppercase tracking-widest text-bone/40">
          {arr.bpm} BPM · {arr.keyLabel}
        </div>
        <div className="relative h-12 flex-1">
          {Array.from({ length: arr.bars }, (_, i) =>
            i % (arr.bars > 24 ? 4 : 2) === 0 ? (
              <span key={i} className="absolute top-0 text-[10px] text-bone/40" style={{ left: at(i) }}>
                {i + 1}
              </span>
            ) : null,
          )}
          {arr.sections.map((s, i) => (
            <div
              key={i}
              className={`absolute bottom-0 h-5 truncate border-l border-crypt px-1 text-[10px] uppercase leading-5 ${SECTION_STYLE[s.name]}`}
              style={{ left: at(s.start), width: span(s.end - s.start) }}
            >
              {s.name}
            </div>
          ))}
        </div>
      </div>

      <div className="flex border-b border-spirit/20">
        <LaneHeader
          label="Your vocal" color="#e8e1d3" mix={vocalMix}
          selected={selectedId === 'vocal'} onSelect={() => onSelect('vocal')} onMix={onVocalMix}
        />
        <div className="relative h-20 flex-1 bg-crypt/60">
          {grid}
          <div className="absolute inset-y-1 left-0" style={{ width: pctOf(arr.duration) }}>
            <Waveform peaks={peaks.vocal} color="#e8e1d3" progress={progress * (timelineSec / arr.duration)} label="Vocal waveform" />
          </div>
        </div>
      </div>

      {arr.layers.map((layer) => (
        <div key={layer.id} className="flex border-b border-spirit/20 last:border-b-0">
          <LaneHeader
            label={layer.name} color={layer.color} mix={layer}
            selected={selectedId === layer.id} onSelect={() => onSelect(layer.id)}
            onMix={(patch) => onLayerMix(layer.id, patch)}
          />
          <div className="relative h-20 flex-1 bg-crypt/60">
            {grid}
            <div className="absolute inset-y-1 left-0 w-full opacity-60">
              <Waveform peaks={peaks[layer.id]} color={layer.color} progress={progress} label={`${layer.name} waveform`} />
            </div>
            {layer.regions.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSelect(layer.id)}
                title={r.why || layer.reason}
                aria-label={`${layer.name}, ${barRange(r)}. ${r.why || layer.reason}`}
                className={`absolute inset-y-1 overflow-hidden rounded border px-1 text-left text-[10px] font-bold leading-4 focus-visible:outline-2 focus-visible:outline-ecto ${
                  changedIds.includes(layer.id) ? 'ring-2 ring-ecto' : ''
                } ${layer.mute ? 'opacity-40' : ''}`}
                style={{
                  left: at(r.start),
                  width: span(r.end - r.start),
                  borderColor: layer.color,
                  background: `${layer.color}26`,
                  color: layer.color,
                }}
              >
                <span className="block truncate">{layer.name}</span>
                <span className="block truncate font-normal opacity-80">{barRange(r)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div
        className="pointer-events-none absolute inset-y-0 w-px bg-ecto shadow-[0_0_8px_#7CFF6B]"
        style={{ left: `calc(12rem + (100% - 12rem) * ${progress})` }}
        aria-hidden="true"
      />
    </section>
  )
}
