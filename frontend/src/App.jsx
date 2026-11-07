import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzeBuffer } from './lib/analysis'
import { generateArrangement, regionsText } from './lib/producer'
import { renderLayer } from './lib/synth'
import { interpret } from './lib/chat'
import { keyName } from './lib/music'
import { useEngine } from './hooks/useEngine'
import Transport from './components/Transport'
import VocalIntake from './components/VocalIntake'
import ArrangementView from './components/ArrangementView'
import Inspector from './components/Inspector'
import AnalysisPanel from './components/AnalysisPanel'
import ChatPanel from './components/ChatPanel'
import TrickOrTreat from './components/TrickOrTreat'
import { AmbientLayer, GraveyardFooter, Pumpkin, Ghost } from './components/Decor'

const INITIAL_VOCAL_MIX = { volume: 1, mute: false, solo: false, reverb: 0.25 }

export default function App() {
  const [arr, setArr] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [vocalMix, setVocalMix] = useState(INITIAL_VOCAL_MIX)
  const [vocalName, setVocalName] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [changedIds, setChangedIds] = useState([])
  const [messages, setMessages] = useState([])
  const [history, setHistory] = useState([])
  const [stage, setStage] = useState('idle') // idle | analyzing | rendering
  const [error, setError] = useState('')

  const mix = useMemo(
    () => ({ vocal: vocalMix, ...Object.fromEntries((arr?.layers ?? []).map((l) => [l.id, l])) }),
    [vocalMix, arr],
  )
  const engine = useEngine(mix, vocalMix.reverb)
  const engineRef = useRef(engine)
  engineRef.current = engine
  const sigRef = useRef({})

  // Re-render only the parts whose notes/params/regions changed.
  useEffect(() => {
    if (!arr) return undefined
    let cancelled = false
    const timer = setTimeout(async () => {
      const info = { bpm: arr.bpm, key: arr.key, bars: arr.bars }
      const live = new Set(arr.layers.map((l) => l.id))
      for (const id of Object.keys(sigRef.current)) {
        if (!live.has(id)) {
          engineRef.current.removeBuffer(id)
          delete sigRef.current[id]
        }
      }
      let rendered = false
      for (const layer of arr.layers) {
        const sig = JSON.stringify([layer.type, layer.regions, layer.params, info])
        if (sigRef.current[layer.id] === sig) continue
        sigRef.current[layer.id] = sig
        setStage('rendering')
        const buffer = await renderLayer(layer, info)
        if (cancelled) {
          delete sigRef.current[layer.id]
          return
        }
        engineRef.current.setBuffer(layer.id, buffer)
        rendered = true
      }
      setStage('idle')
      if (rendered && engineRef.current.playing) engineRef.current.play()
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [arr])

  const say = (msg) => setMessages((m) => [...m, msg])

  async function handleVocal(blob, name) {
    setError('')
    engine.stop()
    try {
      setStage('analyzing')
      const buffer = await engine.loadVocal(blob)
      await new Promise((r) => setTimeout(r, 30)) // let the UI paint before heavy work
      const a = analyzeBuffer(buffer)
      const next = generateArrangement(a)
      setAnalysis(a)
      setArr(next)
      setVocalName(name)
      setSelectedId(null)
      setHistory([])
      setChangedIds(next.layers.map((l) => l.id))
      setMessages([
        {
          role: 'ai',
          text: `I listened to your vocal. It sits around ${next.bpm} BPM in ${keyName(next.key)}, with a brightness of about ${a.brightness} Hz. The song has ${next.bars} bars. Here is what I added and why:`,
          changes: next.layers.map((l) => `${l.name} at ${regionsText(l.regions)}. ${l.reason}`),
        },
        {
          role: 'ai',
          text: 'Press Raise to hear it. Click any part on the timeline to tweak it, or tell me what to change, like "make the 808 louder" or "add glockenspiel in the intro".',
        },
      ])
    } catch {
      setStage('idle')
      setError('Could not read that audio. Try a WAV or MP3.')
    }
  }

  function pushHistory() {
    setHistory((h) => [...h.slice(-19), { arr, vocalMix }])
  }

  function handleCommand(text) {
    if (!arr) return
    say({ role: 'user', text })
    const res = interpret(text, { arr, vocalMix, analysis })
    if (res.undo) {
      const prev = history[history.length - 1]
      if (!prev) return say({ role: 'ai', text: 'Nothing to undo yet.' })
      setHistory((h) => h.slice(0, -1))
      setArr(prev.arr)
      setVocalMix(prev.vocalMix)
      setChangedIds([])
      return say({ role: 'ai', text: 'Undid the last change.' })
    }
    if (res.regen) {
      pushHistory()
      const next = generateArrangement(analysis)
      setArr(next)
      setVocalMix(INITIAL_VOCAL_MIX)
      setChangedIds(next.layers.map((l) => l.id))
      return say({ role: 'ai', text: 'Back to my original arrangement.', changes: next.layers.map((l) => `${l.name} at ${regionsText(l.regions)}`) })
    }
    if (res.arr || res.vocalMix) pushHistory()
    if (res.arr) setArr(res.arr)
    if (res.vocalMix) setVocalMix(res.vocalMix)
    setChangedIds(res.changed ?? [])
    say({ role: 'ai', text: res.reply, changes: res.changes })
  }

  const updateLayer = (id, fn) =>
    setArr((a) => ({ ...a, layers: a.layers.map((l) => (l.id === id ? fn(l) : l)) }))

  const removeLayer = (id) => {
    pushHistory()
    const name = arr.layers.find((l) => l.id === id)?.name
    setArr((a) => ({ ...a, layers: a.layers.filter((l) => l.id !== id) }))
    setSelectedId(null)
    say({ role: 'ai', text: `Removed ${name}.` })
  }

  const progress = engine.duration ? engine.time / engine.duration : 0
  const busyMsg = stage === 'analyzing' ? 'Listening to your vocal…' : stage === 'rendering' ? 'Building the beat…' : ''

  return (
    <>
      <AmbientLayer />
      <div className="relative z-10 mx-auto flex min-h-full max-w-7xl flex-col gap-4 p-4">
        <header className="flex items-end justify-between">
          <div className="flex items-end gap-3">
            <Pumpkin className="bob h-14 w-14" />
            <div>
              <h1 className="flicker font-display text-5xl tracking-wide text-ecto glow-ecto">gRave</h1>
              <p className="text-xs uppercase tracking-[0.3em] text-bone/50">The Haunted AI Audio Studio</p>
            </div>
            <Ghost className="bob h-10 w-10" />
          </div>
          <p className="text-xs text-spirit">Kiroween '26</p>
        </header>

        <Transport
          playing={engine.playing}
          time={engine.time}
          duration={engine.duration}
          disabled={!arr}
          status={busyMsg}
          onPlay={engine.play}
          onStop={engine.stop}
        />

        <main className="grid flex-1 gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <ArrangementView
              arr={arr}
              peaks={engine.peaks}
              timelineSec={engine.duration}
              vocalMix={vocalMix}
              onVocalMix={(patch) => setVocalMix((v) => ({ ...v, ...patch }))}
              onLayerMix={(id, patch) => updateLayer(id, (l) => ({ ...l, ...patch }))}
              selectedId={selectedId}
              onSelect={setSelectedId}
              changedIds={changedIds}
              progress={progress}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Inspector
                arr={arr}
                selectedId={selectedId}
                vocalMix={vocalMix}
                onVocalMix={(patch) => setVocalMix((v) => ({ ...v, ...patch }))}
                onUpdateLayer={updateLayer}
                onRemoveLayer={removeLayer}
              />
              <div className="flex flex-col gap-4">
                <AnalysisPanel analysis={analysis} arr={arr} />
                <TrickOrTreat disabled={!arr} onCommand={handleCommand} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <VocalIntake vocalName={vocalName} busy={stage === 'analyzing'} error={error} onVocal={handleVocal} />
            <ChatPanel
              messages={messages}
              disabled={!arr}
              thinking={stage === 'analyzing'}
              canUndo={history.length > 0}
              onSend={handleCommand}
              onUndo={() => handleCommand('undo')}
            />
          </div>
        </main>
        <GraveyardFooter />
      </div>
    </>
  )
}
