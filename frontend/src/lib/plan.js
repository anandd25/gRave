// Converts between the backend plan (1-based inclusive bars) and the UI arrangement
// (0-based, end exclusive). The backend owns the instrument catalog and validation;
// each layer arrives with its name, color, synth engine and pattern kind resolved.

export function planToArr(plan, analysis, previous) {
  const old = Object.fromEntries((previous?.layers ?? []).map((l) => [l.id, l]))
  return {
    bpm: plan.bpm,
    genre: plan.genre,
    genreName: plan.genre_name,
    swing: plan.swing ?? 0,
    key: { pc: plan.key_pc, mode: plan.mode },
    keyLabel: plan.key,
    bars: plan.bars,
    offset: plan.offset_sec,
    duration: analysis.duration_sec,
    summary: plan.summary,
    paletteReason: plan.palette_reason,
    sections: plan.sections.map((s) => ({ name: s.name, start: s.start_bar - 1, end: s.end_bar })),
    layers: plan.layers.map((l) => ({
      id: l.id,
      instrument: l.instrument,
      engine: l.engine,
      kind: l.kind,
      role: l.role,
      name: l.name,
      color: l.color,
      volume: l.volume,
      mute: old[l.id]?.mute ?? false,
      solo: old[l.id]?.solo ?? false,
      reason: l.reason,
      params: l.params,
      patch: l.patch ?? null,
      regions: l.regions.map((r) => ({ start: r.start_bar - 1, end: r.end_bar, why: r.why, pattern: r.pattern })),
    })),
  }
}

export function arrToPlan(arr) {
  return {
    genre: arr.genre,
    swing: arr.swing,
    summary: arr.summary ?? '',
    palette_reason: arr.paletteReason ?? '',
    layers: arr.layers.map((l) => ({
      id: l.id,
      instrument: l.instrument,
      volume: l.volume,
      reason: l.reason,
      params: l.params,
      ...(l.patch ? { kind: l.kind, role: l.role, patch: l.patch } : {}),
      regions: l.regions.map((r) => ({ start_bar: r.start + 1, end_bar: r.end, why: r.why ?? '', pattern: r.pattern })),
    })),
  }
}

export const barRange = (r) => (r.end - r.start === 1 ? `bar ${r.start + 1}` : `bars ${r.start + 1}-${r.end}`)
export const regionsText = (regions) => (regions.length ? regions.map(barRange).join(', ') : 'nowhere')
