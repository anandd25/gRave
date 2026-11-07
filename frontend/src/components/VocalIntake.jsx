import { useRef, useState } from 'react'

export default function VocalIntake({ vocalName, busy, error: parentError, onVocal }) {
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
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        onVocal(blob, 'microphone take')
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
    if (file) onVocal(file, file.name)
    e.target.value = ''
  }

  return (
    <section aria-labelledby="intake-h" className="rounded-lg border border-spirit/30 bg-tomb p-4">
      <h2 id="intake-h" className="mb-3 text-xs uppercase tracking-widest text-spirit">
        Start here · Your vocal
      </h2>
      <div className="flex flex-wrap gap-2">
        {recording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="rec-pulse rounded border border-blood bg-blood/20 px-3 py-2 text-sm font-bold text-blood focus-visible:outline-2 focus-visible:outline-ecto"
          >
            ■ Stop recording
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            disabled={busy}
            className="rounded border border-blood px-3 py-2 text-sm font-bold text-blood hover:bg-blood/10 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ecto"
          >
            ● Record
          </button>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy || recording}
          className="rounded border border-spirit px-3 py-2 text-sm font-bold text-spirit hover:bg-spirit/10 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ecto"
        >
          Upload take
        </button>
        <input ref={fileRef} type="file" accept="audio/*" onChange={onFile} className="sr-only" aria-label="Upload vocal file" />
      </div>
      <p className="mt-3 text-xs text-bone/60" role="status">
        {error ? <span className="text-blood">{error}</span> : vocalName ? `Loaded: ${vocalName}` : 'No vocal yet. The crypt is silent.'}
      </p>
    </section>
  )
}
