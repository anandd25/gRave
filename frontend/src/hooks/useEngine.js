import { useCallback, useEffect, useRef, useState } from 'react'
import { decodeBlob, computePeaks } from '../lib/audio'

function makeImpulse(ctx, seconds = 2.8) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
  }
  return buf
}

// Web Audio multitrack engine. `mix` is { [trackId]: { volume, mute, solo } };
// `reverb` (0..1) is the wet amount on the vocal track.
export function useEngine(mix, reverb) {
  const ctxRef = useRef(null)
  const impulseRef = useRef(null)
  const gainsRef = useRef({})
  const wetRef = useRef(null)
  const sourcesRef = useRef([])
  const startedAtRef = useRef(0)
  const rafRef = useRef(0)
  const buffersRef = useRef({})

  const [peaks, setPeaks] = useState({})
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const getCtx = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext()
    return ctxRef.current
  }, [])

  const refreshDuration = () =>
    setDuration(Math.max(0, ...Object.values(buffersRef.current).map((b) => b.duration)))

  const applyGains = useCallback(() => {
    const anySolo = Object.values(mix).some((m) => m.solo)
    for (const [id, gain] of Object.entries(gainsRef.current)) {
      const m = mix[id]
      if (!m) continue
      const audible = !m.mute && (!anySolo || m.solo)
      gain.gain.value = audible ? m.volume : 0
    }
    if (wetRef.current) wetRef.current.gain.value = reverb * 0.9
  }, [mix, reverb])

  useEffect(applyGains, [applyGains])

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    sourcesRef.current.forEach((s) => {
      try { s.stop() } catch { /* already stopped */ }
    })
    sourcesRef.current = []
    setPlaying(false)
    setTime(0)
  }, [])

  const play = useCallback(async () => {
    const ctx = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    stop()
    const total = Math.max(0, ...Object.values(buffersRef.current).map((b) => b.duration))
    if (!total) return
    gainsRef.current = {}
    wetRef.current = null
    for (const [id, buffer] of Object.entries(buffersRef.current)) {
      const src = ctx.createBufferSource()
      const gain = ctx.createGain()
      src.buffer = buffer
      src.connect(gain)
      gain.connect(ctx.destination)
      if (id === 'vocal') {
        if (!impulseRef.current) impulseRef.current = makeImpulse(ctx)
        const conv = ctx.createConvolver()
        conv.buffer = impulseRef.current
        const wet = ctx.createGain()
        gain.connect(conv)
        conv.connect(wet)
        wet.connect(ctx.destination)
        wetRef.current = wet
      }
      gainsRef.current[id] = gain
      src.start()
      sourcesRef.current.push(src)
    }
    applyGains()
    startedAtRef.current = ctx.currentTime
    setPlaying(true)
    const tick = () => {
      const elapsed = ctx.currentTime - startedAtRef.current
      if (elapsed >= total) return stop()
      setTime(elapsed)
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()
  }, [applyGains, getCtx, stop])

  const setBuffer = useCallback((id, buffer) => {
    buffersRef.current[id] = buffer
    setPeaks((p) => ({ ...p, [id]: computePeaks(buffer) }))
    refreshDuration()
  }, [])

  const removeBuffer = useCallback((id) => {
    delete buffersRef.current[id]
    setPeaks((p) => {
      const { [id]: _gone, ...rest } = p
      return rest
    })
    refreshDuration()
  }, [])

  const loadVocal = useCallback(
    async (blob) => {
      const buffer = await decodeBlob(getCtx(), blob)
      setBuffer('vocal', buffer)
      return buffer
    },
    [getCtx, setBuffer],
  )

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current)
      ctxRef.current?.close()
      ctxRef.current = null
    },
    [],
  )

  return { peaks, playing, time, duration, play, stop, loadVocal, setBuffer, removeBuffer }
}
