// dsh-ping-me — host half. Push notifications from dsh to your phone via ntfy,
// one way only: this plugin publishes and never subscribes, so nothing sent to
// the topic can ever reach an agent.
//
//   turn done      the reply, replacing the turn's live status notification
//   needs you      an approval or an ask_user_question is waiting (high priority)
//   failed         error / output limit / blocked (your own Stop stays silent)
//   heartbeat      optional live "🟢 working · 2m 10s" notification, updated in
//                  place, saying what it's doing (thinking / running bash). No server-side
//                  dead-man alert: ntfy.sh can't cancel or postpone a delayed
//                  message (tested 2026-10-25), so it would fire after every turn.
//   ping_me        a tool for automation tasks (dsh Schedule): the agent pings you
//                  only when it found something it was told to report
//
// Notification buttons only *open* dsh in the browser (ntfy "view" actions);
// there are no buttons that post anything back.
import { createHash, randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-ping-me'
export const inject = ['connection']

export const TOKEN_REF = 'DSH_PING_ME_TOKEN'
const HOME = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'ping-me')
const STATE_FILE = join(HOME, 'state.json')
const LOG_FILE = join(HOME, 'log.jsonl')
const GUIDE = fileURLToPath(new URL('../SETUP-GUIDE.md', import.meta.url))
const MAX_BYTES = 3800 // ntfy's hard limit is 4096 bytes per message; leave room for the footer

export const Config = z.object({
  server: z.string().default('https://ntfy.sh').volatile().description('ntfy server: ntfy.sh or your own.'),
  dshUrl: z.string().default('').volatile().description('Where "Open dsh" in a notification leads. Empty: the address you open dsh with, detected automatically.'),
  turnDone: z.boolean().default(true).volatile().description('Push the reply when a turn you started finishes.'),
  needsYou: z.boolean().default(true).volatile().description('Push when an approval or a question is waiting.'),
  failures: z.boolean().default(true).volatile().description('Push when a turn fails or is cut off.'),
  automationDone: z.boolean().default(false).volatile()
    .description('Also push the reply of automation-task runs. Off: they only reach you through ping_me, failures and questions.'),
  heartbeat: z.boolean().default(false).volatile().description('Live status while a turn runs. Costs one message per beat: best on your own server.'),
  heartbeatSec: z.natural().min(15).max(600).default(60).volatile(),
  maxPingsPerHour: z.natural().min(1).max(100).default(10).volatile().description('Cap for the ping_me tool.'),
})

export const snapshot = (c) => Object.fromEntries(Object.keys(c).map(k => [k, c[k].get()]))

// ---- pure helpers (tested) ----

const bytes = (s) => Buffer.byteLength(s, 'utf8')

/** Cut text to ntfy's per-message budget on a character boundary. */
export function fit(text, max = MAX_BYTES) {
  if (bytes(text) <= max) return text
  const note = '\n\n… (cut, full reply in dsh)'
  let out = Buffer.from(text, 'utf8').subarray(0, max - bytes(note)).toString('utf8')
  if (out.endsWith('�')) out = out.slice(0, -1)
  return out + note
}

export const duration = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}m`
}

/** null for a stop you caused yourself (no push), else a short reason. */
export function failure(reason) {
  const kind = reason?.kind
  if (kind === 'completed') return undefined
  if (kind === 'aborted') {
    const cause = reason?.reason?.kind
    if (cause === 'user' || cause === 'parent' || cause === 'disposed') return null
    return `aborted (${cause === 'hook' ? reason?.reason?.reason ?? 'hook' : cause ?? 'unknown'})`
  }
  if (kind === 'error') return `error: ${reason?.error?.message ?? 'model call failed'}`
  if (kind === 'max-tokens') return 'cut off at the output limit'
  if (kind === 'blocked') return 'blocked by a policy'
  if (kind === 'interrupted') return 'interrupted (dsh restarted mid-turn)'
  return `ended: ${kind ?? 'unknown'}`
}

/** The questions of an ask_user_question call, as readable text. */
export function questionText(rawArgs) {
  let args = rawArgs
  if (typeof args === 'string') { try { args = JSON.parse(args) } catch { return undefined } }
  const qs = Array.isArray(args?.questions) ? args.questions : []
  const lines = qs.filter(q => typeof q?.question === 'string').map((q) => {
    const opts = Array.isArray(q.options) ? q.options.map(o => o?.label).filter(l => typeof l === 'string') : []
    return `**${q.question}**` + (opts.length ? '\n' + opts.map((o, i) => `${i + 1}. ${o}`).join('\n') : '')
  })
  return lines.length ? lines.join('\n\n') : undefined
}

/** Whether a turn's pushes are wanted, from the source of the prompt that started it. */
export const wants = (cfg, origin, what) =>
  what === 'done' ? (origin === 'schedule' ? cfg.automationDone : cfg.turnDone)
    : what === 'needs' ? cfg.needsYou : cfg.failures

/**
 * Rank a browser origin for the "Open dsh" link, by how likely a phone can open it anywhere:
 * https domain (3) > https IP (2, usually LAN-only) > plain http (1) > loopback (0).
 * null for anything that isn't http(s).
 */
export function originRank(origin) {
  let url
  try { url = new URL(origin) } catch { return null }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (/^(localhost|127\.|\[::1\]$)/.test(url.hostname)) return 0
  if (url.protocol === 'http:') return 1
  return /^(\d+\.){3}\d+$|^\[/.test(url.hostname) ? 2 : 3
}

export const newTopic = () => 'dsh-' + randomBytes(12).toString('hex') // 96 random bits: unguessable
const seqKey = (sessionId) => createHash('sha256').update(sessionId).digest('hex').slice(0, 16)

// ---- ntfy ----

/** Publish one message; retries once on 403/429/5xx (self-hosted ntfy throws spurious 403s under concurrency). */
export async function publish(server, token, msg, fetchImpl = fetch) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  let last
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 1000))
    try {
      const res = await fetchImpl(server.replace(/\/+$/, ''), { method: 'POST', headers, body: JSON.stringify(msg) })
      if (res.ok) return
      last = `ntfy answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`
      if (![403, 429].includes(res.status) && res.status < 500) break
    } catch (err) { last = err instanceof Error ? err.message : String(err) }
  }
  throw new Error(last)
}

/** Delete a message by sequence id (clears it on the phone). 404 = already gone. */
export async function unpublish(server, token, topic, seq, fetchImpl = fetch) {
  const res = await fetchImpl(`${server.replace(/\/+$/, '')}/${topic}/${seq}`, {
    method: 'DELETE', headers: token ? { authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok && res.status !== 404) throw new Error(`ntfy answered ${res.status}`)
}

// ---- plugin ----

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function readState() { try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')) } catch { return {} } }
function writeState(state) { mkdirSync(HOME, { recursive: true }); writeFileSync(STATE_FILE, JSON.stringify(state), { mode: 0o600 }) }

export function apply(ctx, config, deps = {}) {
  config = config ?? Config({})
  const fetchImpl = deps.fetch ?? fetch
  const state = readState()
  if (!state.topic) { state.topic = newTopic(); writeState(state) }
  const recent = [] // last few deliveries, for the settings card
  const remember = (entry) => {
    recent.unshift({ at: new Date().toISOString(), ...entry })
    recent.length = Math.min(recent.length, 20)
    if (entry.what === 'ping' || entry.result !== 'sent') {
      try { mkdirSync(HOME, { recursive: true }); appendFileSync(LOG_FILE, JSON.stringify(recent[0]) + '\n') } catch {}
    }
  }

  const token = async () => {
    try { return (await ctx.get('credentials')?.resolve(TOKEN_REF))?.value || '' } catch { return '' }
  }
  const send = async (what, sessionId, msg) => {
    const cfg = snapshot(config)
    const url = cfg.dshUrl.trim() || state.dshUrl
    const actions = url ? [{ action: 'view', label: 'Open dsh', url, clear: true }] : undefined
    try {
      await publish(cfg.server, await token(), { topic: state.topic, markdown: true, click: url || undefined, actions, ...msg }, fetchImpl)
      remember({ what, sessionId, result: 'sent', title: msg.title })
    } catch (err) {
      remember({ what, sessionId, result: 'failed', title: msg.title, reason: err.message })
      throw err
    }
  }
  const quietly = (p) => { p.catch(err => console.warn('dsh-ping-me:', err.message)) }

  // Per root session: who started the current turn, its last reply, its heartbeat.
  const sessions = new Map()
  const of = (id) => { let s = sessions.get(id); if (!s) sessions.set(id, s = { origin: 'user' }); return s }
  // The session's title once dsh has named it, else its workspace folder. After a restart the
  // title event is history, so it's read back from the session log once.
  const label = (session) => {
    const s = of(session.id)
    if (s.title === undefined) {
      const events = typeof session.ownEvents === 'function' ? session.ownEvents() : []
      s.title = events.findLast?.(e => e?.type === 'session/title')?.data?.title?.trim().slice(0, 80) || ''
    }
    return s.title || (session.header?.cwd || '').split('/').filter(Boolean).pop() || 'dsh'
  }

  const stopBeat = (s) => { if (s.beat) { clearInterval(s.beat.timer); s.beat = undefined } }
  const tick = async (session, s) => {
    const cfg = snapshot(config)
    const b = s.beat
    if (!b) return
    // No "stuck" alarm: model output streams outside session events, so a model thinking
    // for minutes looks exactly like a hang (tested with a 27B local model).
    const now = Date.now()
    await publish(cfg.server, await token(), {
      topic: state.topic, sequence_id: b.status, priority: 1, tags: ['hourglass'],
      title: `🟢 ${label(session)} · ${b.doing} · ${duration(now - b.started)}`,
      // The clock shows a frozen notification for what it is: dsh stopped updating it.
      message: `Updated ${new Date(now).toTimeString().slice(0, 5)}.`,
    }, fetchImpl)
  }

  const finish = async (session, s, push) => {
    const b = s.beat
    stopBeat(s)
    const cfg = snapshot(config)
    if (push) await send(push.what, session.id, { ...push.msg, ...(b ? { sequence_id: b.status } : {}) })
    else if (b) await unpublish(cfg.server, await token(), state.topic, b.status, fetchImpl).catch(() => {})
  }

  ctx.on('session/event', (session, event) => {
    if (session.header?.parentSession !== undefined || session.header?.origin === 'subagent') return // subagents report to their parent
    const type = event?.type
    const data = event?.data
    const s = of(session.id)
    const cfg = snapshot(config)

    if (type === 'session/title' && typeof data?.title === 'string') {
      s.title = data.title.trim().slice(0, 80)
    } else if (type === 'user/message') {
      const kind = data?.source?.kind ?? data?.message?.source?.kind
      if (kind === 'user' || kind === 'schedule') s.origin = kind
    } else if (type === 'turn/start') {
      s.reply = undefined
      stopBeat(s)
      if (cfg.heartbeat && wants(cfg, s.origin, 'done')) {
        const key = seqKey(session.id)
        s.beat = { started: Date.now(), doing: 'thinking', status: `st${key}${data?.turn ?? Date.now()}` }
        s.beat.timer = setInterval(() => quietly(tick(session, s)), cfg.heartbeatSec * 1000)
        s.beat.timer.unref?.()
        quietly(tick(session, s))
      }
    } else if (type === 'turn/end') {
      const why = failure(data?.reason)
      let push
      if (why === undefined && wants(cfg, s.origin, 'done')) {
        push = { what: 'done', msg: { title: `✅ ${label(session)}`, message: fit(s.reply || '(no text reply)'), priority: 3, tags: ['white_check_mark'] } }
      } else if (why && wants(cfg, s.origin, 'failed')) {
        push = { what: 'failed', msg: { title: `❌ ${label(session)}: ${why}`, message: fit(s.reply || why), priority: 4, tags: ['x'] } }
      }
      quietly(finish(session, s, push))
    } else if (type === 'approval/asked' && wants(cfg, s.origin, 'needs')) {
      quietly(send('needs', session.id, { title: `✋ ${label(session)} needs your approval`, priority: 5, tags: ['raised_hand'],
        message: fit(`**${data?.toolName ?? 'a tool'}** wants to run.${data?.reason ? `\n\n${data.reason}` : ''}\n\nAnswer in dsh.`) }))
    } else if (type === 'tool/call' && data?.name === 'ask_user_question' && wants(cfg, s.origin, 'needs')) {
      quietly(send('needs', session.id, { title: `❓ ${label(session)} has a question`, priority: 5, tags: ['question'],
        message: fit((questionText(data.arguments) ?? 'The agent is waiting for your answer.') + '\n\nAnswer in dsh.') }))
    }
    if (type === 'assistant/message') {
      const text = (data?.message?.content ?? data?.content ?? []).filter(b => b?.type === 'text').map(b => b.text).join('')
      if (text.trim()) s.reply = text
    }
    if (s.beat && type === 'tool/call') s.beat.doing = `running ${data?.name ?? 'a tool'}`
    if (s.beat && type === 'tool/result') s.beat.doing = 'thinking'
  })
  ctx.on('session/disposed', (session) => {
    const s = sessions.get(session.id)
    if (s?.beat) quietly(finish(session, s))
    sessions.delete(session.id)
  })
  // Unload / shutdown: clear live status notifications so none is left saying "working".
  ctx.effect(() => () => {
    for (const [id, s] of sessions) if (s.beat) quietly(finish({ id }, s))
  })

  // ---- the ping_me tool ----
  const pings = []
  const pingsLastHour = () => { const cut = Date.now() - 3_600_000; while (pings.length && pings[0] < cut) pings.shift(); return pings.length }
  const tool = {
    name: 'ping_me',
    // Kept short: this text is sent with every model request.
    description: 'Push an alert to the user\'s phone. Only in a turn started by an automation task ([SCHEDULE REMINDER]) '
      + 'that says to report problems, and only if you found one; never "all fine". Include the evidence. One-way. '
      + `Setup help for the user: ${GUIDE}`,
    parameters: {
      type: 'object',
      required: ['title', 'message'],
      properties: {
        title: { type: 'string', description: 'One line.' },
        message: { type: 'string', description: 'Markdown, under 2000 characters.' },
        urgent: { type: 'boolean', description: 'Only if it needs action now.' },
      },
    },
    output: { schema: { type: 'string' }, render: (_a, text) => [{ type: 'text', text }] },
    async execute(args, exec) {
      const sessionId = exec.agent?.session?.id ?? 'unknown'
      const cfg = snapshot(config)
      const title = String(args?.title ?? '').replace(/\s+/g, ' ').trim()
      const message = String(args?.message ?? '').trim()
      let refusal
      if (!title || !message) refusal = 'title and message are required'
      else if (sessions.get(sessionId)?.origin !== 'schedule') refusal = 'ping_me is only for turns started by an automation task. Tell the user in chat instead.'
      else if (pingsLastHour() >= cfg.maxPingsPerHour) refusal = `hourly cap reached (${cfg.maxPingsPerHour}); do not retry`
      if (refusal) {
        remember({ what: 'ping', sessionId, result: 'refused', title, reason: refusal })
        throw new Error(refusal)
      }
      await send('ping', sessionId, { title: `⚠️ ${title.slice(0, 150)}`, message: fit(message), priority: args.urgent === true ? 5 : 4, tags: ['warning'] })
      pings.push(Date.now())
      return 'Pushed to the user\'s phone.'
    },
  }
  ctx.inject(['agents'], (ctx) => {
    const attach = (agent) => {
      if (ctx.agents.roots().includes(agent)) ctx.effect(() => agent.ctx.effect(() => agent.ctx.tools.register(tool)))
    }
    ctx.on('agent/created', ({ agent }) => attach(agent))
    for (const agent of ctx.agents.roots()) attach(agent)
  })

  // ---- settings card API ----
  const subscribeUrl = () => `${snapshot(config).server.replace(/\/+$/, '')}/${state.topic}`
  // QR code: the ntfy Android app's deep link, which opens the topic straight in the app
  // (docs.ntfy.sh/subscribe/phone). The iPhone app handles no links at all (checked its
  // source, 2026-10-25), so iPhone users enter the topic name by hand.
  const appLink = () => {
    const url = new URL(subscribeUrl())
    return `ntfy://${url.host}${url.pathname}?display=dsh${url.protocol === 'http:' ? '&secure=false' : ''}`
  }
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/dsh-ping-me',
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const action = new URL(request.url).searchParams.get('do')
      if (request.method === 'GET' && action === 'qr') {
        const svg = await (deps.qrcode ?? (await import('qrcode')).default).toString(appLink(), { type: 'svg', margin: 1 })
        return new Response(svg, { status: 200, headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' } })
      }
      if (request.method === 'GET') return json(200, { topic: state.topic, server: snapshot(config).server, detectedDshUrl: state.dshUrl ?? '', subscribeUrl: subscribeUrl(), appLink: appLink(), recent })
      if (action === 'seen') {
        // Every dsh page reports its own address; keep the best one seen (see originRank).
        // Behind dsh's login, so only a signed-in browser can set it.
        const origin = (await request.text()).trim().replace(/\/+$/, '')
        const rank = originRank(origin)
        if (rank !== null && origin !== state.dshUrl && rank >= (originRank(state.dshUrl) ?? -1)) {
          state.dshUrl = origin; writeState(state)
        }
        return json(200, { dshUrl: state.dshUrl })
      }
      if (action === 'rotate') {
        state.topic = newTopic(); writeState(state)
        return json(200, { topic: state.topic, subscribeUrl: subscribeUrl() })
      }
      if (action === 'test') {
        try {
          await send('test', undefined, { title: '👋 dsh-ping-me works', message: 'Notifications from dsh will show up here. This is push only: nothing you send to this topic reaches dsh.', priority: 3, tags: ['wave'] })
          return json(200, { ok: true })
        } catch (err) { return json(200, { ok: false, error: err.message }) }
      }
      return json(404, { error: 'unknown action' })
    },
  }), 'dsh-ping-me: /api/dsh-ping-me')
}
