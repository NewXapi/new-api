// Ainotation MCP sync bridge (dev tool, localhost only).
//
// Background: browser→service sync needs a same-origin middleware bridge
// (upstream ships one only inside its Vite plugin). This script talks to the
// local MCP service control API as a node-side client:
//   1. register the project (new-api-web) → projectId;
//   2. issue a browser grant for the dev page origin (5-minute lease), renew
//      it on a loop, and write the grant into
//      public/ainotation/connection.json — the dev server serves that file
//      same-origin for the SDK bundle (ainotation-entry.ts).
//
// Usage: start the service first (`node <cli.mjs> service --port 45029`, or
// let the omp MCP connect spawn it), then `node scripts/ainotation-bridge.mjs`
// (stay in the foreground so renewal keeps running).
//
// Env overrides:
//   AINO_ORIGIN  page origin, default http://127.0.0.1:5173 (= rsbuild dev)
//   AINO_PORT    CORS fallback endpoint port, default 44090
import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const SERVICE_USER_FILE = `${homedir()}/.ainotation/service/connection.json`
const SDK_CONNECTION = new URL(
  '../public/ainotation/connection.json',
  import.meta.url
)
const ORIGIN = process.env.AINO_ORIGIN ?? 'http://127.0.0.1:5173'
const FILE_PORT = Number(process.env.AINO_PORT ?? 44090)
const PROJECT_NAME = 'new-api-web'
// Repo root derived from the script location (apps/web/scripts → three up),
// so a clone on any machine needs no edits.
const PROJECT_DIRECTORY = fileURLToPath(new URL('../../..', import.meta.url))
const RENEW_INTERVAL_MS = 2 * 60 * 1000

async function api(url, token, path, method = 'GET', body) {
  const res = await fetch(url + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok)
    throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

async function main() {
  // The service may be spawned late by a resident connect process; poll for
  // its discovery file.
  let svc
  for (let i = 0; ; i++) {
    try {
      svc = JSON.parse(await readFile(SERVICE_USER_FILE, 'utf8'))
      break
    } catch {
      if (i > 60) throw new Error('service connection.json not available after 120s')
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  let { url, token } = svc
  // A service restart regenerates connection.json (new instanceId + token);
  // on renew 401, reload it so a stale token never kills the bridge.
  async function reloadServiceCreds() {
    try {
      const next = JSON.parse(await readFile(SERVICE_USER_FILE, 'utf8'))
      if (next.url !== url || next.token !== token) {
        console.log('service connection changed, re-syncing:', next.url)
        url = next.url
        token = next.token
      }
    } catch (error) {
      console.error(
        'service connection.json unreadable, keeping old creds:',
        String(error).slice(0, 120)
      )
    }
  }

  // 1. Register the project (idempotent: an existing record is returned).
  let project
  try {
    project = await api(url, token, '/control/projects', 'POST', {
      directory: PROJECT_DIRECTORY,
      declaration: { name: PROJECT_NAME },
    })
  } catch (error) {
    const projects = await api(url, token, '/control/projects')
    project = (projects.projects ?? []).find(
      (p) =>
        (p.projectId ?? p.config?.projectId) &&
        (p.name ?? p.config?.name) === PROJECT_NAME
    )
    if (!project) throw error
  }
  const projectId = project.projectId ?? project.config.projectId
  console.log('project ready:', projectId, project.name ?? project.config?.name)

  // 2. Issue the grant and write the SDK connection file (renew responses do
  // not carry the token, so keep it separately).
  let grantToken
  async function issue() {
    const grant = await api(url, token, '/control/grants', 'POST', {
      kind: 'browser',
      projectId,
      origin: ORIGIN,
    })
    grantToken = grant.token
    await writeFile(
      SDK_CONNECTION,
      `${JSON.stringify({ url, token: grant.token }, null, 2)}\n`
    )
    console.log(
      'grant issued',
      grant.grantId,
      'expires',
      new Date(grant.expiresAt).toISOString()
    )
    return grant
  }
  let grant = await issue()

  // 3. Renewal loop (renew keeps the same token valid, only extends expiry).
  setInterval(async () => {
    try {
      grant = await api(url, token, `/control/grants/${grant.grantId}/renew`, 'POST')
      console.log('renewed, expires', new Date(grant.expiresAt).toISOString())
    } catch (error) {
      console.error(
        'renew failed, re-syncing service creds and re-issuing:',
        String(error).slice(0, 160)
      )
      await new Promise((r) => setTimeout(r, 1000))
      await reloadServiceCreds()
      try {
        grant = await issue()
      } catch (error2) {
        console.error('re-issue failed, will retry next tick:', String(error2).slice(0, 160))
      }
    }
  }, RENEW_INTERVAL_MS)

  // 4. Fixed-port CORS endpoint as a fallback for the page SDK.
  createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ url, token: grantToken }))
  }).listen(FILE_PORT, '127.0.0.1', () =>
    console.log(`connection file served on :${FILE_PORT}`)
  )
}

main().catch((error) => {
  console.error('bridge fatal:', error)
  process.exit(1)
})
