import { formatTime } from '../lib/audio'

export default function Transport({ playing, time, duration, disabled, status, onPlay, onStop }) {
  const base =
    'rounded border px-4 py-2 text-sm font-bold uppercase tracking-wider focus-visible:outline-2 focus-visible:outline-ecto'
  return (
    <div className="flex items-center gap-3 rounded-lg border border-spirit/30 bg-tomb p-3">
      <button
        type="button"
        onClick={onPlay}
        disabled={disabled}
        className={`${base} border-ecto text-ecto hover:bg-ecto/10 disabled:opacity-30`}
      >
        {playing ? 'Restart' : 'Raise'}
      </button>
      <button
        type="button"
        onClick={onStop}
        disabled={!playing}
        className={`${base} border-blood text-blood hover:bg-blood/10 disabled:opacity-30`}
      >
        Bury
      </button>
      <span className="text-xs text-spirit" role="status">{status}</span>
      <output className="ml-auto text-2xl text-ecto glow-ecto tabular-nums" aria-label="Playback time">
        {formatTime(time)} <span className="text-sm text-bone/40">/ {formatTime(duration)}</span>
      </output>
    </div>
  )
}
