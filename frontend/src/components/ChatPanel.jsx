import { useEffect, useRef, useState } from 'react'

const SUGGESTIONS = [
  'Turn it into an upbeat pop song',
  'Make it 90s boom bap',
  'Remix it as afrobeats',
  'Design a rusty chainsaw 808 for the hook',
  'Invent a whispering ghost bell for the intro',
  'Swap the melody for a creepy music box',
  'Why did you choose these instruments?',
]

export default function ChatPanel({ messages, disabled, thinking, canUndo, onSend, onUndo }) {
  const [draft, setDraft] = useState('')
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, thinking])

  function submit(e) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || disabled || thinking) return
    onSend(text)
    setDraft('')
  }

  return (
    <section aria-labelledby="chat-h" className="flex h-[32rem] flex-col rounded-lg border border-spirit/30 bg-tomb p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="chat-h" className="text-xs uppercase tracking-widest text-spirit">Producer chat</h2>
        <button type="button" onClick={onUndo} disabled={!canUndo || thinking}
          className="rounded border border-spirit/50 px-2 py-0.5 text-xs text-spirit hover:bg-spirit/10 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-ecto">
          Undo
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded border border-spirit/20 bg-crypt p-3 text-xs leading-relaxed" role="log" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-bone/40">The producer is waiting for a vocal. Once it hears one, it explains every part it places, and you can ask for changes here in plain English.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <div className={`inline-block max-w-[92%] rounded-lg px-3 py-2 text-left ${
              m.role === 'user' ? 'bg-spirit/25 text-bone' : m.error ? 'bg-blood/20 text-blood' : 'bg-slab text-bone/90'
            }`}>
              {m.text && <p>{m.text}</p>}
              {m.changes?.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ecto/90">
                  {m.changes.map((c, j) => <li key={j}>{c}</li>)}
                </ul>
              )}
              {m.sources?.length > 0 && (
                <div className="mt-2 border-t border-spirit/20 pt-1 text-[11px] text-bone/60">
                  <p>Researched on the web:</p>
                  <ul className="list-disc pl-4">
                    {m.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-spirit underline hover:text-ecto">
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && <p className="text-bone/50">Producer is thinking…</p>}
        <div ref={endRef} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1" aria-label="Suggestions">
        {SUGGESTIONS.map((ex) => (
          <button key={ex} type="button" disabled={disabled || thinking} onClick={() => onSend(ex)}
            className="rounded-full border border-spirit/40 px-2 py-0.5 text-[11px] text-bone/70 hover:border-ecto hover:text-ecto disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-ecto">
            {ex}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-2 flex gap-2">
        <label htmlFor="chat-input" className="sr-only">Tell the producer what to change</label>
        <input id="chat-input" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={disabled}
          placeholder={disabled ? 'Add a vocal first…' : 'e.g. more bells in the chorus'}
          className="min-w-0 flex-1 rounded border border-spirit/40 bg-crypt px-3 py-2 text-sm placeholder:text-bone/30 focus-visible:outline-2 focus-visible:outline-ecto" />
        <button type="submit" disabled={disabled || thinking || !draft.trim()}
          className="rounded border border-ecto px-3 py-2 text-sm font-bold text-ecto hover:bg-ecto/10 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-ecto">
          Send
        </button>
      </form>
    </section>
  )
}
