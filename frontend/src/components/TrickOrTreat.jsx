import { useState } from 'react'
import { Pumpkin, Candy } from './Decor'

// Random surprise: each outcome is sent to the producer chat as a normal command.
const OUTCOMES = [
  { kind: 'Treat', msg: 'A glockenspiel chimes in.', command: 'add glockenspiel everywhere' },
  { kind: 'Treat', msg: 'Hi-hats get busier.', command: 'make the hi-hats busier' },
  { kind: 'Trick', msg: 'The 808 turns filthy.', command: 'make the 808 grittier and longer' },
  { kind: 'Trick', msg: 'The room fills with ghosts.', command: 'make it spookier' },
  { kind: 'Treat', msg: 'A sweet synth lead appears.', command: 'add synth lead in the hook' },
]

export default function TrickOrTreat({ disabled, onCommand }) {
  const [result, setResult] = useState(null)

  function knock() {
    const o = OUTCOMES[Math.floor(Math.random() * OUTCOMES.length)]
    setResult(o)
    onCommand(o.command)
  }

  return (
    <section aria-labelledby="tot-h" className="rounded-lg border border-orange-500/40 bg-tomb p-4">
      <h2 id="tot-h" className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-orange-400">
        <Pumpkin className="h-6 w-6" /> Trick or Treat
      </h2>
      <button
        type="button"
        onClick={knock}
        disabled={disabled}
        className="w-full rounded border border-orange-500 px-3 py-2 text-sm font-bold text-orange-400 hover:bg-orange-500/10 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ecto"
      >
        Knock on the door
      </button>
      <p className="mt-3 flex min-h-10 items-start gap-2 text-xs text-bone/80" role="status">
        {result ? (
          <>
            <Candy className="h-5 w-8 shrink-0" />
            <span>
              <strong className={result.kind === 'Trick' ? 'text-blood' : 'text-ecto'}>{result.kind}!</strong> {result.msg}
            </span>
          </>
        ) : (
          'Add a vocal, then knock for a random change.'
        )}
      </p>
    </section>
  )
}
