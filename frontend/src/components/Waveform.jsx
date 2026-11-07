import { useEffect, useRef } from 'react'

export default function Waveform({ peaks, color, progress = 0, label }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const dpr = window.devicePixelRatio || 1
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = width * dpr
    canvas.height = height * dpr
    const g = canvas.getContext('2d')
    g.scale(dpr, dpr)
    g.clearRect(0, 0, width, height)
    if (!peaks) return
    const barW = width / peaks.length
    const mid = height / 2
    for (let i = 0; i < peaks.length; i++) {
      const h = Math.max(1, peaks[i] * height * 0.9)
      g.fillStyle = color
      g.globalAlpha = i / peaks.length <= progress ? 1 : 0.45
      g.fillRect(i * barW, mid - h / 2, Math.max(1, barW - 0.5), h)
    }
    g.globalAlpha = 1
  }, [peaks, color, progress])

  return <canvas ref={ref} role="img" aria-label={label} className="h-full w-full" />
}
