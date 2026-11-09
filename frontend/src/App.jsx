import { useEffect, useMemo, useRef, useState } from 'react'
import { curse, getGenres, getInstruments, getPatchSpec, getStatus, produce, revise } from './lib/api'
import { audioBufferToWav } from './lib/audio'
import { arrToPlan, planToArr, regionsText } from './lib/plan'
import { renderLayer } from './lib/synth'
import { useEngine } from './hooks/useEngine'
import Transport from './components/Transport'
import VocalIntake from './components/VocalIntake'
import ArrangementView from './components/ArrangementView'
import Inspector from './components/Inspector'
import AnalysisPanel from './components/AnalysisPanel'
import ChatPanel from './components/ChatPanel'
import CursePanel from './components/CursePanel'
import TrickOrTreat from './components/TrickOrTreat'
import { AmbientLayer, GraveyardFooter, Pumpkin, Ghost } from './components/Decor'

const INITIAL_VOCAL_MIX = { volume: 1, mute: false, solo: false, reverb: 0.25 }
const INITIAL_CURSE = { pitch_semitones: -3, formant_warp: -30, reverb_mix: 0.4, grit: 0 }

export default function App() {
  const [arr, setArr] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [source, setSource] = useState(null)
  const [model, setModel] = useState(null)
  const [ai, setAi] = useState(undefined) // undefined = checking, null = backend offline
  const [webResearch, setWebResearch] = useState(false)
  const [catalog, setCatalog] = useState(null)
  const [patchSpec, setPatchSpec] = useState(null)
  const [genres, setGenres] = useState(null)
  const [genre, setGenre] = useState('auto')
  const [vocalMix, setVocalMix] = useState(INITIAL_VOCAL_MIX)
  const [vocalName, setVocalName] = useState('')
  const [brief, setBrief] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [changedIds, setChangedIds] = useState([])
  const [messages, setMessages] = useState([])
  const [history, setHistory] = useState([])
  const [stage, setStage] = useState('idle') // idle | listening | thinking
  const [chatBusy, setChatBusy] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState('')
  const [curseSettings, setCurseSettings] = useState(INITIAL_CURSE)
  const [curseBusy, setCurseBusy] = useState(false)
  const [cursed, setCursed] = useState(false)
  const [curseStatus, setCurseStatus] = useState('')

  const wavRef = useRef(null) // the clean vocal as WAV, sent to the backend
  const sigRef = useRef({})

  const mix = useMemo(
    () => ({ vocal: vocalMix, ...Object.fromEntries((arr?.layers ?? []).map((l) => [l.id, l])) }),
    [vocalMix, arr],
  )
  const engine = useEngine(mix, vocalMix.reverb)
  const engineRef = useRef(engine)
  engineRef.current = engine

  useEffect(() => {
    getStatus().then((s) => {
      setAi(s ? s.ai : null)
      setWebResearch(!!s?.research?.configured)
    })
    getInstruments().then(setCatalog)
    getPatchSpec().then(setPatchSpec)
    getGenres().then(setGenres)
  }, [])

  // Render only the instruments whose plan changed, then restart playback if it was running.
  useEffect(() => {
    if (!arr) return undefined
    let cancelled = false
    const timer = setTimeout(async () => {
      const info = { bpm: arr.bpm, key: arr.key, bars: arr.bars, offset: arr.offset, swing: arr.swing }
      const live = new Set(arr.layers.map((l) => l.id))
      for (const id of Object.keys(sigRef.current)) {
        if (!live.has(id)) {
          engineRef.current.removeBuffer(id)
          delete sigRef.current[id]
        }
      }
      let rendered = false
      for (const layer of arr.layers) {
        const sig = JSON.stringify([layer.engine, layer.kind, layer.regions, layer.params, layer.patch, info])
        if (sigRef.current[layer.id] === sig) continue
        sigRef.current[layer.id] = sig
        setRendering(true)
        const buffer = await renderLayer(layer, info)
        if (cancelled) {
          delete sigRef.current[layer.id]
          return
        }
        engineRef.current.setBuffer(layer.id, buffer)
        rendered = true
      }
      setRendering(false)
      if (rendered && engineRef.current.playing) engineRef.current.play()
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [arr])

  const say = (msg) => setMessages((m) => [...m, msg])

  async function runProduce(wav, briefText) {
    setStage('thinking')
    const res = await produce(wav, briefText, genre)
    const next = planToArr(res.plan, res.analysis)
    setAnalysis(res.analysis)
    setSessionId(res.session_id)
    setSource(res.source)
    setModel(res.model)
    setArr(next)
    setHistory([])
    setSelectedId(null)
    setChangedIds(next.layers.map((l) => l.id))
    const a = res.analysis
    const msgs = [
      {
        role: 'ai',
        text: [
          `I listened: your vocal moves at about ${a.detected_bpm ?? a.bpm} BPM in ${a.key}, brightness near ${a.brightness_hz} Hz.`,
          `Genre: ${res.plan.genre_name}, beat at ${a.bpm} BPM`
            + (a.detected_bpm && a.detected_bpm !== a.bpm ? ` (${a.bpm > a.detected_bpm ? 'double' : 'half'} time, still locked to your voice)` : '')
            + `, ${a.bars} bars.`,
          res.plan.summary,
        ].filter(Boolean).join(' '),
      },
      {
        role: 'ai',
        text: [res.plan.palette_reason, res.plan.reply || 'Here is what I placed and why:'].filter(Boolean).join(' '),
        changes: next.layers.map((l) => `${l.name} at ${regionsText(l.regions)}. ${l.reason}`),
        sources: res.research?.sources,
      },
    ]
    if (res.notice) msgs.push({ role: 'ai', error: res.source === 'rules' && !!res.model, text: res.notice })
    msgs.push({ role: 'ai', text: 'Press Raise to hear it. Click any block to see why it is there, or tell me what to change.' })
    setMessages(msgs)
  }

  async function handleVocal(blob, name) {
    setError('')
    engine.stop()
    setStage('listening')
    try {
      const buffer = await engine.loadVocal(blob)
      wavRef.current = audioBufferToWav(buffer)
      setVocalName(name)
      setCursed(false)
      setCurseStatus('')
      await runProduce(wavRef.current, brief)
    } catch (e) {
      setError(e.message || 'Could not read that audio. Try a WAV or MP3.')
    } finally {
      setStage('idle')
    }
  }

  async function handleReproduce() {
    if (!wavRef.current) return
    setError('')
    engine.stop()
    try {
      await runProduce(wavRef.current, brief)
    } catch (e) {
      setError(e.message)
    } finally {
      setStage('idle')
    }
  }

  async function handleCommand(text) {
    if (!arr || !sessionId) return
    if (/^\s*(undo|revert|go back)\b/i.test(text)) return undo()
    say({ role: 'user', text })
    setChatBusy(true)
    try {
      const res = await revise(sessionId, { ...arrToPlan(arr), bpm: arr.bpm }, text)
      setHistory((h) => [...h.slice(-19), { arr, analysis, vocalMix }])
      setArr(planToArr(res.plan, res.analysis, arr))
      setAnalysis(res.analysis)
      setChangedIds(res.changed_ids)
      say({
        role: 'ai',
        text: res.plan.reply || (res.changes.length ? 'Done.' : 'I left the arrangement as it was.'),
        changes: res.changes,
        sources: res.research?.sources,
      })
      if (res.research?.error) say({ role: 'ai', error: true, text: res.research.error })
    } catch (e) {
      say({ role: 'ai', error: true, text: e.message })
    } finally {
      setChatBusy(false)
    }
  }

  function undo() {
    const prev = history[history.length - 1]
    if (!prev) return say({ role: 'ai', text: 'Nothing to undo yet.' })
    setHistory((h) => h.slice(0, -1))
    setArr(prev.arr)
    setAnalysis(prev.analysis)
    setVocalMix(prev.vocalMix)
    setChangedIds([])
    say({ role: 'ai', text: 'Undid the last change.' })
  }

  const updateLayer = (id, fn) => setArr((a) => ({ ...a, layers: a.layers.map((l) => (l.id === id ? fn(l) : l)) }))

  function removeLayer(id) {
    setHistory((h) => [...h.slice(-19), { arr, analysis, vocalMix }])
    setArr((a) => ({ ...a, layers: a.layers.filter((l) => l.id !== id) }))
    setSelectedId(null)
  }

  async function handleCurse() {
    setCurseBusy(true)
    setCurseStatus('')
    try {
      await engine.loadVocal(await curse(wavRef.current, curseSettings))
      setCursed(true)
      setCurseStatus('Vocal cursed. Press Raise to hear it.')
    } catch (e) {
      setCurseStatus(e.message)
    } finally {
      setCurseBusy(false)
    }
  }

  async function handleRestore() {
    await engine.loadVocal(wavRef.current)
    setCursed(false)
    setCurseStatus('Original vocal restored.')
  }

  const progress = engine.duration ? engine.time / engine.duration : 0
  const busyMsg =
    stage === 'listening' ? 'Listening to your vocal…'
      : stage === 'thinking' ? 'The producer is planning your beat…'
        : rendering ? 'Building the sounds…' : ''
  const aiLabel =
    ai === undefined ? 'Checking backend…'
      : ai === null ? 'Backend offline'
        : ai.configured ? `AI: ${ai.model}` : 'AI not configured (rule-based)'

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
          <div className="text-right text-xs">
            <p className="text-spirit">Kiroween '26</p>
            <p className={ai?.configured ? 'text-ecto' : 'text-orange-400'} role="status">{aiLabel}</p>
            {ai && <p className={webResearch ? 'text-ecto/80' : 'text-bone/40'}>{webResearch ? 'Web research: on (Tavily)' : 'Web research: off'}</p>}
          </div>
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
                catalog={catalog}
                patchSpec={patchSpec}
                selectedId={selectedId}
                vocalMix={vocalMix}
                onVocalMix={(patch) => setVocalMix((v) => ({ ...v, ...patch }))}
                onUpdateLayer={updateLayer}
                onRemoveLayer={removeLayer}
              />
              <div className="flex flex-col gap-4">
                <AnalysisPanel analysis={analysis} arr={arr} source={source} model={model} />
                <CursePanel
                  settings={curseSettings}
                  onChange={setCurseSettings}
                  busy={curseBusy}
                  disabled={!wavRef.current}
                  cursed={cursed}
                  status={curseStatus}
                  onCurse={handleCurse}
                  onRestore={handleRestore}
                />
                <TrickOrTreat disabled={!arr || chatBusy} onCommand={handleCommand} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <VocalIntake
              vocalName={vocalName}
              busy={stage !== 'idle'}
              error={error}
              brief={brief}
              onBrief={setBrief}
              genre={genre}
              genres={genres}
              onGenre={setGenre}
              onVocal={handleVocal}
              onReproduce={handleReproduce}
            />
            <ChatPanel
              messages={messages}
              disabled={!arr}
              thinking={chatBusy}
              canUndo={history.length > 0}
              onSend={handleCommand}
              onUndo={undo}
            />
          </div>
        </main>
        <GraveyardFooter />
      </div>
    </>
  )
}
