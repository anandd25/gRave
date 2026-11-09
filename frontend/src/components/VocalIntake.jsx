import { useRef, useState } from 'react'

export default function VocalIntake({
  vocalName, busy, error: parentError, brief, onBrief, genre, genres, onGenre, onVocal, onReproduce,
}) {
  const [recording, setRecording] = useState(false)
  const [localError, setError] = useState('')
  const error = localError || parentError
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const fileRef = useRef(null)

  async function startRecording() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        onVocal(new Blob(chunksRef.current, { type: recorder.mimeType }), 'microphone take')
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch {
      setError('Microphone unavailable. Check permissions or upload a file.')
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
    setRecording(false)
  }

  function onFile(e) {
    const file = e.target.files?.[0]
    if (file) {
      setError('')
      onVocal(file, file.name)
    }
    e.target.value = ''
  }

  const btn = 'rounded border px-3 py-2 text-sm font-bold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ecto'
  return (
    <section aria-labelledby="intake-h" className="rounded-lg border border-spirit/30 bg-tomb p-4">
      <h2 id="intake-h" className="mb-3 text-xs uppercase tracking-widest text-spirit">Start here · Your vocal</h2>

      <div className="mb-3 flex items-center justify-between gap-2 text-xs text-bone/70">
        <label htmlFor="genre">Genre</label>
        <select
          id="genre" value={genre} onChange={(e) => onGenre(e.target.value)} disabled={busy}
          className="min-w-0 flex-1 rounded border border-spirit/40 bg-crypt px-2 py-1 text-bone focus-visible:outline-2 focus-visible:outline-ecto"
        >
          {(genres ?? [{ id: 'auto', name: 'Auto (producer decides)' }]).map((g) => (
            <option key={g.id} value={g.id}>{g.bpm ? `${g.name} (${g.bpm[0]}-${g.bpm[1]} BPM)` : g.name}</option>
          ))}
        </select>
      </div>

      <label htmlFor="brief" className="text-xs text-bone/70">What do you want? (optional)</label>
      <textarea
        id="brief" rows={3} maxLength={1000} value={brief} onChange={(e) => onBrief(e.target.value)}
        placeholder="e.g. upbeat summer pop with guitar, or 90s boom bap with jazzy keys, or evil drill with bells."
        className="mb-3 mt-1 w-full resize-none rounded border border-spirit/40 bg-crypt px-3 py-2 text-sm placeholder:text-bone/30 focus-visible:outline-2 focus-visible:outline-ecto"
      />

      <div className="flex flex-wrap gap-2">
        {recording ? (
          <button type="button" onClick={stopRecording}
            className={`${btn} rec-pulse border-blood bg-blood/20 text-blood`}>■ Stop recording</button>
        ) : (
          <button type="button" onClick={startRecording} disabled={busy}
            className={`${btn} border-blood text-blood hover:bg-blood/10`}>● Record</button>
        )}
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy || recording}
          className={`${btn} border-spirit text-spirit hover:bg-spirit/10`}>Upload take</button>
        {vocalName && (
          <button type="button" onClick={onReproduce} disabled={busy || recording}
            className={`${btn} border-ecto text-ecto hover:bg-ecto/10`}>Re-produce</button>
        )}
        <input ref={fileRef} type="file" accept="audio/*" onChange={onFile} className="sr-only" aria-label="Upload vocal file" />
      </div>

      <p className="mt-3 text-xs text-bone/60" role="status">
        {error ? <span className="text-blood">{error}</span> : vocalName ? `Loaded: ${vocalName}` : 'No vocal yet. The crypt is silent.'}
      </p>
    </section>
  )
}
