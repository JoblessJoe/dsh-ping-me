import assert from 'node:assert'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-ping-me-'))
const { Config, apply, failure, fit, newTopic, publish, questionText, unpublish } = await import('./lib/index.js')

// ---- pure helpers ----
assert.strictEqual(fit('short'), 'short')
const long = fit('ä'.repeat(5000)) // 2-byte chars: no split character, ends with the cut note
assert.ok(Buffer.byteLength(long) <= 3800 && long.endsWith('full reply in dsh)') && !long.includes('�'))
assert.strictEqual(failure({ kind: 'completed' }), undefined)
assert.strictEqual(failure({ kind: 'aborted', reason: { kind: 'user' } }), null) // your own Stop: silent
assert.strictEqual(failure({ kind: 'aborted', reason: { kind: 'parent' } }), null)
assert.match(failure({ kind: 'error', error: { message: 'boom' } }), /error: boom/)
assert.match(failure({ kind: 'max-tokens' }), /output limit/)
assert.strictEqual(questionText(JSON.stringify({ questions: [{ question: 'Deploy?', options: [{ label: 'Yes' }, { label: 'No' }] }] })), '**Deploy?**\n1. Yes\n2. No')
assert.strictEqual(questionText('not json'), undefined)
assert.match(newTopic(), /^dsh-[0-9a-f]{24}$/)
assert.notStrictEqual(newTopic(), newTopic())
console.log('ok: helpers')

// ---- ntfy calls ----
let calls = []
const everything = []
const fakeFetch = async (url, init) => { everything.push({ url, method: init.method }); calls.push({ url, ...init, body: init.body && JSON.parse(init.body) }); return { ok: true, status: 200, text: async () => '' } }
await publish('https://ntfy.example/', 'tok', { topic: 't', message: 'm' }, fakeFetch)
assert.deepStrictEqual(calls[0], { url: 'https://ntfy.example', method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer tok' }, body: { topic: 't', message: 'm' } })
let n = 0
await publish('https://x', '', { topic: 't' }, async () => (++n === 1 ? { ok: false, status: 403, text: async () => '' } : { ok: true })) // one retry on 403
assert.strictEqual(n, 2)
await assert.rejects(publish('https://x', '', { topic: 't' }, async () => ({ ok: false, status: 400, text: async () => 'bad' })), /400: bad/)
await unpublish('https://x', '', 't', 'seq', async (url, init) => { assert.strictEqual(url, 'https://x/t/seq'); assert.strictEqual(init.method, 'DELETE'); return { ok: false, status: 404 } }) // gone = fine
console.log('ok: ntfy')

// ---- the plugin against a fake ctx ----
calls = []
const handlers = {}
let tool, route, disposeAll
const root = { ctx: { effect: (f) => f(), tools: { register: (t) => { tool = t } } } }
const ctx = {
  on: (ev, fn) => { handlers[ev] = fn },
  get: () => undefined,
  effect: (f) => { const d = f(); if (typeof d === 'function' && !disposeAll) disposeAll = d },
  inject: (_s, fn) => fn(ctx),
  agents: { roots: () => [root] },
  connection: { fetch: { register: (r) => { route = r } } },
}
// live settings the test can flip, shaped like the volatile config dsh hands the plugin
const vals = Object.fromEntries(Object.entries(Config({})).map(([k, v]) => [k, v.get()]))
const config = Object.fromEntries(Object.keys(vals).map(k => [k, { get: () => vals[k] }]))
apply(ctx, config, { fetch: fakeFetch, qrcode: { toString: async (text) => `<svg>${text}</svg>` } })
const topic = JSON.parse(readFileSync(join(process.env.DSH_HOME, 'ping-me', 'state.json'), 'utf8')).topic
const session = { id: 'session-1', header: { cwd: '/home/me/projects/myshop' } }
const ev = (type, data, s = session) => handlers['session/event'](s, { type, data })
const flush = () => new Promise(r => setTimeout(r, 20))
const prompt = (kind) => ev('user/message', { role: 'user', source: { kind }, content: [] })

// the "Open dsh" address comes from the browsers that open dsh: https beats http beats loopback
const seen = async (origin) => (await (await route.fetch(new Request('http://x/api/dsh-ping-me?do=seen', { method: 'POST', body: origin }))).json()).dshUrl
assert.strictEqual(await seen('http://127.0.0.1:3080'), 'http://127.0.0.1:3080') // better than nothing
assert.strictEqual(await seen('http://192.168.1.20:8444'), 'http://192.168.1.20:8444')
assert.strictEqual(await seen('https://192.168.1.20:8444'), 'https://192.168.1.20:8444')
assert.strictEqual(await seen('https://dsh.example/'), 'https://dsh.example')
assert.strictEqual(await seen('https://192.168.1.20:8444'), 'https://dsh.example') // a LAN IP doesn't replace a domain
assert.strictEqual(await seen('http://localhost:3080'), 'https://dsh.example') // never downgraded
assert.strictEqual(await seen('javascript:alert(1)'), 'https://dsh.example') // only http(s)
assert.strictEqual(await seen('not a url'), 'https://dsh.example')

// a normal chat turn: one push with the reply, labelled by the workspace, with an "Open dsh" button
prompt('user'); ev('turn/start', { turn: 1 })
ev('assistant/message', { message: { content: [{ type: 'text', text: 'All tests pass.' }] } })
ev('turn/end', { reason: { kind: 'completed' } }); await flush()
assert.strictEqual(calls.length, 1)
let m = calls[0].body
assert.strictEqual(m.topic, topic)
assert.strictEqual(m.title, '✅ myshop')
assert.strictEqual(m.message, 'All tests pass.')
assert.deepStrictEqual(m.actions, [{ action: 'view', label: 'Open dsh', url: 'https://dsh.example', clear: true }])
vals.dshUrl = 'https://override.example' // set in the card: wins over the detected address
calls = []
ev('turn/start', { turn: 1 }); ev('turn/end', { reason: { kind: 'completed' } }); await flush()
assert.strictEqual(calls[0].body.actions[0].url, 'https://override.example')
vals.dshUrl = ''

// once dsh names the session, the title becomes the label
ev('session/title', { title: 'Fix login bug', source: { kind: 'provider' } })
calls = []
ev('turn/start', { turn: 9 }); ev('turn/end', { reason: { kind: 'completed' } }); await flush()
assert.strictEqual(calls[0].body.title, '✅ Fix login bug')
ev('session/title', { title: '' }) // back to the folder name for the rest of the test

// after a restart: no title event comes, so it's read back from the session log
const restored = { id: 'restored', header: { cwd: '/x/y' }, ownEvents: () => [{ type: 'session/title', data: { title: 'Old name' } }, { type: 'session/title', data: { title: 'Nightly myshop check' } }] }
calls = []
ev('turn/start', { turn: 1 }, restored); ev('turn/end', { reason: { kind: 'completed' } }, restored); await flush()
assert.strictEqual(calls[0].body.title, '✅ Nightly myshop check')

// your own Stop: nothing. An error: a push.
calls = []
ev('turn/start', { turn: 2 }); ev('turn/end', { reason: { kind: 'aborted', reason: { kind: 'user' } } }); await flush()
assert.strictEqual(calls.length, 0)
ev('turn/start', { turn: 3 }); ev('turn/end', { reason: { kind: 'error', error: { message: 'ollama down' } } }); await flush()
assert.match(calls[0].body.title, /❌ myshop: error: ollama down/)

// approvals and questions: loud
calls = []
ev('approval/asked', { toolName: 'bash', reason: 'rm -rf build' })
ev('tool/call', { name: 'ask_user_question', arguments: JSON.stringify({ questions: [{ question: 'Which branch?' }] }) }); await flush()
assert.deepStrictEqual(calls.map(c => [c.body.priority, c.body.title]), [[5, '✋ myshop needs your approval'], [5, '❓ myshop has a question']])
assert.match(calls[1].body.message, /Which branch\?/)

// subagent sessions never push
calls = []
const child = { id: 'child', header: { parentSession: 'session-1' } }
ev('turn/start', { turn: 1 }, child); ev('turn/end', { reason: { kind: 'completed' } }, child); await flush()
assert.strictEqual(calls.length, 0)

// automation run: the "all fine" reply stays quiet by default; ping_me works only here
await assert.rejects(tool.execute({ title: 'x', message: 'y' }, { agent: { session: { id: 'session-1' } } }), /only for turns started by an automation task/)
prompt('schedule'); ev('turn/start', { turn: 4 })
ev('assistant/message', { message: { content: [{ type: 'text', text: 'Everything fine.' }] } })
assert.strictEqual(await tool.execute({ title: 'myshop: 3 snapshot failures', message: 'see log' }, { agent: { session: { id: 'session-1' } } }), "Pushed to the user's phone.")
ev('turn/end', { reason: { kind: 'completed' } }); await flush()
assert.deepStrictEqual(calls.map(c => c.body.title), ['⚠️ myshop: 3 snapshot failures'])
assert.strictEqual(calls[0].body.priority, 4)
vals.automationDone = true // switched on in settings: automation replies push too
calls = []
ev('turn/start', { turn: 5 }); ev('turn/end', { reason: { kind: 'completed' } }); await flush()
assert.strictEqual(calls.length, 1)
vals.automationDone = false
vals.maxPingsPerHour = 1
await assert.rejects(tool.execute({ title: 'again', message: 'y' }, { agent: { session: { id: 'session-1' } } }), /hourly cap/)
const log = readFileSync(join(process.env.DSH_HOME, 'ping-me', 'log.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
assert.deepStrictEqual(log.filter(e => e.what === 'ping').map(e => e.result), ['refused', 'sent', 'refused'])

// heartbeat: status updated in place, silent while healthy, becomes the result at turn end
vals.heartbeat = true
vals.heartbeatSec = 15
prompt('user'); calls = []
ev('turn/start', { turn: 6 }); await flush()
assert.strictEqual(calls.length, 1)
const status = calls[0].body
assert.match(status.title, /🟢 myshop · thinking · 0s/)
assert.match(status.message, /Updated \d\d:\d\d/)
assert.strictEqual(status.priority, 1)
assert.ok(!('delay' in status))
calls = []
ev('assistant/message', { message: { content: [{ type: 'text', text: 'Done.' }] } })
ev('turn/end', { reason: { kind: 'completed' } }); await flush()
assert.strictEqual(calls.length, 1)
assert.strictEqual(calls[0].body.sequence_id, status.sequence_id) // the status notification becomes the result
assert.strictEqual(calls[0].body.title, '✅ myshop')
// shutdown mid-turn clears the live status instead of leaving "working" on the phone
ev('turn/start', { turn: 7 }); await flush(); calls = []
disposeAll(); await flush()
assert.deepStrictEqual(calls.map(c => c.method), ['DELETE'])

// push only: every request ever made is a publish (POST to the server) or a delete; never a subscribe
// (ntfy subscriptions are GET .../json, /sse, /raw, /ws)
assert.ok(everything.length >= 10, String(everything.length))
for (const c of everything) assert.ok(c.method === 'POST' || c.method === 'DELETE', `${c.method} ${c.url}`)
assert.ok(!/EventSource|WebSocket|\/(json|sse|raw|ws)\b(?!')/.test(readFileSync('./lib/index.js', 'utf8')))
console.log('ok: plugin')

// ---- settings API ----
const call = async (method, q = '') => route.fetch(new Request('http://x/api/dsh-ping-me' + q, { method }))
const info = await (await call('GET')).json()
assert.strictEqual(info.subscribeUrl, `https://ntfy.sh/${topic}`)
assert.strictEqual(await (await call('GET', '?do=qr')).text(), `<svg>ntfy://ntfy.sh/${topic}?display=dsh</svg>`)
assert.strictEqual(info.appLink, `ntfy://ntfy.sh/${topic}?display=dsh`)
assert.deepStrictEqual(await (await call('POST', '?do=test')).json(), { ok: true })
const rotated = await (await call('POST', '?do=rotate')).json()
assert.notStrictEqual(rotated.topic, topic)
console.log('ok: settings api')
