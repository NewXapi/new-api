// Ainotation dev-only annotation tool entry (injected via rsbuild html.tags
// in development; production builds never reference this file).
// Bundle: bun run aino → public/ainotation/ainotation.iife.js
//
// MCP wiring: read { url, token } from the local bridge
// (scripts/ainotation-bridge.mjs). The bridge signs a browser grant for this
// page origin and renews it; connection.json under public/ is served
// same-origin by the dev server, with the bridge's CORS endpoint as the
// fallback. Without a bridge the SDK degrades to local-only mode
// (annotate / copy / export still work).
import { createAinotation } from '@ainotation/sdk'

const PROJECT_ID = 'new-api-web'

function mount(options: Parameters<typeof createAinotation>[0]) {
  const inspector = createAinotation({ projectId: PROJECT_ID, ...options })
  void inspector.mount()
}

function start(mcp?: { mcp: { endpoint: string; token: string } }) {
  const mountNow = () => mount(mcp ?? {})
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountNow, { once: true })
  } else {
    mountNow()
  }
}

async function loadConnection() {
  for (const url of [
    '/ainotation/connection.json',
    'http://127.0.0.1:44090/connection.json',
  ]) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue
      return (await res.json()) as { url: string; token: string }
    } catch {
      // try the next source
    }
  }
  return null
}

loadConnection()
  .then((cfg) => start(cfg ? { mcp: { endpoint: cfg.url, token: cfg.token } } : undefined))
  .catch(() => start())
