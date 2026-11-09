// Backend client. There is deliberately no offline fallback: the beat must come
// from the backend (AI planner or its rule-based fallback), never a canned build.

export const BACKEND_HINT =
  'Cannot reach the backend. In a terminal run: cd backend, then .\\.venv\\Scripts\\python.exe -m uvicorn main:app --port 8000'

async function request(path, options) {
  let res
  try {
    res = await fetch(path, options)
  } catch {
    throw new Error(BACKEND_HINT)
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* not JSON */
    }
    // The Vite dev proxy answers 500/502/504 with no JSON when nothing listens on :8000.
    if (!detail && [500, 502, 503, 504].includes(res.status)) throw new Error(BACKEND_HINT)
    throw new Error(detail || `Request failed (${res.status})`)
  }
  return res
}

export async function getStatus() {
  try {
    return await (await request('/api/status')).json()
  } catch {
    return null
  }
}

// The instrument catalog (names, kinds, param ranges) for the Inspector.
export async function getInstruments() {
  try {
    return await (await request('/api/instruments')).json()
  } catch {
    return null
  }
}

// Knob ranges for editing AI-designed custom instruments.
export async function getPatchSpec() {
  try {
    return await (await request('/api/patch-spec')).json()
  } catch {
    return null
  }
}

export async function getGenres() {
  try {
    return await (await request('/api/genres')).json()
  } catch {
    return null
  }
}

export async function produce(wavBlob, brief, genre, bpm) {
  const form = new FormData()
  form.append('file', wavBlob, 'vocal.wav')
  form.append('brief', brief ?? '')
  form.append('genre', genre || 'auto')
  if (bpm) form.append('bpm', String(bpm))
  return (await request('/api/produce', { method: 'POST', body: form })).json()
}

export async function revise(sessionId, plan, message) {
  return (
    await request('/api/revise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, plan, message }),
    })
  ).json()
}

export async function curse(wavBlob, settings) {
  const form = new FormData()
  form.append('file', wavBlob, 'vocal.wav')
  form.append('settings', JSON.stringify(settings))
  return (await request('/api/curse', { method: 'POST', body: form })).blob()
}
