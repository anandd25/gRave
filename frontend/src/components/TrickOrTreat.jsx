import { useState } from 'react'
import { Pumpkin, Candy } from './Decor'

// Random surprise: each outcome is sent to the AI producer as a normal chat request.
const OUTCOMES = [
  { kind: 'Treat', msg: 'A music box starts playing by itself.', command: 'add a creepy music box melody where the vocal rests' },
  { kind: 'Treat', msg: 'A ghost choir rises from the crypt.', command: 'add a ghost choir under the hook' },
  { kind: 'Trick', msg: 'The 808 turns filthy.', command: 'swap the 808 for the distorted 808 and make it hit harder' },
  { kind: 'Trick', msg: 'The church bell tolls.', command: 'add a tolling church bell in the intro and outro' },
  { kind: 'Treat', msg: 'War drums in the distance.', command: 'add war toms building into every hook' },
  { kind: 'Trick', msg: 'The lights go out.', command: 'strip it back to a horror drone and the 808 in the breaks' },
  { kind: 'Trick', msg: 'Something new crawls out of the synth.', command: 'design a brand new cursed instrument nobody has heard before and give it the hook' },
  { kind: 'Treat', msg: 'A haunted toy wakes up.', command: 'invent a broken wind-up toy sound and sprinkle it in the breaks' },
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
