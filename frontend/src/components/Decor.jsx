// Halloween SVG art. All decorative: hidden from assistive tech.

export function Pumpkin({ className = 'h-12 w-12' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M32 14c2-6 6-8 10-8-1 4-3 7-6 9z" fill="#4a7c2a" />
      <ellipse cx="20" cy="38" rx="16" ry="22" fill="#e8680f" />
      <ellipse cx="44" cy="38" rx="16" ry="22" fill="#e8680f" />
      <ellipse cx="32" cy="38" rx="12" ry="23" fill="#ff8a1f" />
      <path d="M20 30l6 8h-12zM44 30l6 8h-12z" fill="#2a0f00" />
      <path d="M18 46c4 8 24 8 28 0-4 3-8 2-10 0l-4 3-4-3c-2 2-6 3-10 0z" fill="#2a0f00" />
    </svg>
  )
}

export function Ghost({ className = 'h-14 w-14' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M12 58V28C12 14 21 6 32 6s20 8 20 22v30l-7-6-6 6-7-6-7 6-6-6z" fill="#e8e1d3" opacity="0.92" />
      <ellipse cx="25" cy="28" rx="4" ry="6" fill="#150d1f" />
      <ellipse cx="39" cy="28" rx="4" ry="6" fill="#150d1f" />
      <ellipse cx="32" cy="42" rx="4" ry="5" fill="#150d1f" />
    </svg>
  )
}

export function Bat({ className = 'h-8 w-12' }) {
  return (
    <svg viewBox="0 0 64 32" className={className} aria-hidden="true">
      <path
        d="M32 8l3-5 2 6c6-5 14-6 27-3-5 3-7 7-7 11-3-3-6-3-9 0-2-3-5-3-8 2-2 4-2 7-4 9-2-2-2-5-4-9-3-5-6-5-8-2-3-3-6-3-9 0 0-4-2-8-7-11 13-3 21-2 27 3l2-6z"
        fill="#b46bff"
      />
    </svg>
  )
}

export function Candy({ className = 'h-8 w-12' }) {
  return (
    <svg viewBox="0 0 64 32" className={className} aria-hidden="true">
      <path d="M2 4l14 12L2 28zM62 4L48 16l14 12z" fill="#ff2e4d" />
      <rect x="14" y="6" width="36" height="20" rx="10" fill="#7CFF6B" />
      <path d="M24 6l-6 20M34 6l-6 20M44 6l-6 20" stroke="#150d1f" strokeWidth="3" opacity="0.5" />
    </svg>
  )
}

export function CandyCorn({ className = 'h-10 w-8' }) {
  return (
    <svg viewBox="0 0 40 52" className={className} aria-hidden="true">
      <path d="M20 2c8 0 18 40 18 46 0 3-3 4-6 4H8c-3 0-6-1-6-4C2 42 12 2 20 2z" fill="#fff4d6" />
      <path d="M9 34c3-12 7-30 11-32 4 2 8 20 11 32z" fill="#ff8a1f" />
      <path d="M13 18C16 8 18 4 20 2c2 2 4 6 7 16z" fill="#ffd23f" />
    </svg>
  )
}

export function Moon({ className = 'h-24 w-24' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="26" fill="#f3ecc8" opacity="0.9" />
      <circle cx="24" cy="26" r="5" fill="#d9d0a0" />
      <circle cx="40" cy="40" r="7" fill="#d9d0a0" />
      <circle cx="42" cy="20" r="3" fill="#d9d0a0" />
    </svg>
  )
}

export function Tombstone({ className = 'h-14 w-10' }) {
  return (
    <svg viewBox="0 0 40 56" className={className} aria-hidden="true">
      <path d="M4 56V20C4 8 12 2 20 2s16 6 16 18v36z" fill="#3a2d4d" />
      <text x="20" y="26" textAnchor="middle" fontSize="9" fill="#e8e1d3" fontFamily="serif">RIP</text>
      <path d="M12 34h16M12 40h16" stroke="#e8e1d3" strokeWidth="1.5" opacity="0.5" />
    </svg>
  )
}

export function Web({ className = 'h-28 w-28' }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" fill="none" stroke="#e8e1d3" strokeWidth="1" opacity="0.4">
      <path d="M0 0L100 0M0 0L0 100M0 0L100 100M0 0L70 100M0 0L100 70" />
      <path d="M20 0Q18 18 0 20M40 0Q36 36 0 40M60 0Q54 54 0 60M80 0Q72 72 0 80" />
      <path d="M72 100L86 62" opacity="0" />
    </svg>
  )
}

// Slowly drifting bats and ghosts behind the UI.
const FLOATERS = [
  { C: Bat, top: '8%', dur: 22, delay: 0, size: 'h-6 w-10' },
  { C: Bat, top: '22%', dur: 30, delay: 6, size: 'h-8 w-12' },
  { C: Ghost, top: '55%', dur: 38, delay: 3, size: 'h-12 w-12' },
  { C: Bat, top: '70%', dur: 26, delay: 12, size: 'h-5 w-8' },
  { C: Ghost, top: '85%', dur: 44, delay: 18, size: 'h-10 w-10' },
]

export function AmbientLayer() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute right-10 top-6 opacity-70">
        <Moon />
      </div>
      {FLOATERS.map(({ C, top, dur, delay, size }, i) => (
        <div
          key={i}
          className="drift absolute left-0 opacity-25"
          style={{ top, animationDuration: `${dur}s`, animationDelay: `-${delay}s` }}
        >
          <C className={size} />
        </div>
      ))}
      <div className="absolute left-0 top-0"><Web /></div>
      <div className="absolute right-0 top-0 -scale-x-100"><Web /></div>
    </div>
  )
}

export function GraveyardFooter() {
  return (
    <footer className="mt-4 flex items-end justify-between border-t border-spirit/20 pt-3" aria-hidden="true">
      <div className="flex items-end gap-3">
        <Tombstone />
        <Pumpkin className="h-10 w-10" />
        <Tombstone className="h-10 w-7" />
      </div>
      <div className="flex items-end gap-3">
        <CandyCorn />
        <Candy />
        <CandyCorn />
      </div>
      <div className="flex items-end gap-3">
        <Pumpkin className="h-12 w-12" />
        <Ghost className="h-10 w-10" />
        <Tombstone />
      </div>
    </footer>
  )
}
