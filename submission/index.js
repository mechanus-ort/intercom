#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║             INTERCOM-STANDUP  v1.0.0                        ║
 * ║       Async P2P Daily Standup for Dev Teams                 ║
 * ║       Built for the Intercom Vibe Competition               ║
 * ║       Trac Network | Hyperswarm | Termux-Ready              ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * FEATURES:
 *   · 4-part standup: Did · Do · Blockers · Notes
 *   · Async broadcast — post anytime, peers receive instantly
 *   · Daily digest — see all team updates in one view
 *   · Auto-reminder — nudge peers who haven't posted today
 *   · Export to Markdown — one .md file per day
 *   · Streak counter — track consecutive standup days
 *   · Append-only local log (standup-log.json)
 *
 * Author : [INSERT_YOUR_TRAC_ADDRESS_HERE]
 * License: MIT
 */

import Hyperswarm from 'hyperswarm'
import b4a        from 'b4a'
import crypto     from 'crypto'
import readline   from 'readline'
import fs         from 'fs'
import path       from 'path'

// ─── Config ─────────────────────────────────────────────────────────────────

const APP_VERSION     = '1.0.0'
const DEFAULT_CHANNEL = 'intercom-standup-v1-team'
const LOG_FILE        = 'standup-log.json'
const EXPORTS_DIR     = 'standup-exports'
const REMINDER_MS     = 4 * 60 * 60 * 1000   // remind every 4h if not posted

// ─── ANSI ────────────────────────────────────────────────────────────────────

const C = {
  reset  : '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan   : '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red    : '\x1b[31m', magenta: '\x1b[35m', blue: '\x1b[34m',
  white  : '\x1b[97m', bgBlue: '\x1b[44m',
}

function ts  () { return new Date().toLocaleTimeString() }
function iso () { return new Date().toISOString() }
function today () { return new Date().toISOString().slice(0, 10) }

function log (icon, col, msg) {
  process.stdout.write(`\r${C[col] ?? ''}[${ts()}] ${icon}${C.reset} ${msg}\n`)
  if (rl) rl.prompt(true)
}

function encode (o) { return Buffer.from(JSON.stringify(o) + '\n') }
function decode (s) { try { return JSON.parse(s.trim()) } catch { return null } }

function topicFromString (s) {
  return crypto.createHash('sha256').update(s).digest()
}
function shortId (hex) { return hex.slice(0, 8) + '…' + hex.slice(-4) }

// ─── Persistent store ────────────────────────────────────────────────────────

function loadLog () {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')) } catch { return {} }
}

function saveLog (data) {
  try { fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2)) } catch {}
}

// ─── Streak calculation ──────────────────────────────────────────────────────

function calcStreak (alias, logData) {
  const dates = Object.keys(logData).sort().reverse()
  let streak  = 0
  let cursor  = new Date(); cursor.setHours(0, 0, 0, 0)

  for (const d of dates) {
    const dDate = new Date(d + 'T00:00:00'); dDate.setHours(0, 0, 0, 0)
    const diff  = Math.round((cursor - dDate) / 86400000)
    if (diff > 1) break
    if (logData[d] && logData[d][alias]) { streak++; cursor = dDate }
    else if (diff === 0) { cursor = dDate }
    else break
  }
  return streak
}

// ─── State ───────────────────────────────────────────────────────────────────

let myAlias  = ''
let myPeerId = ''
let swarm, rl

const peers  = new Map()

let draftMode = false
let draft     = { did: '', do: '', blockers: '', notes: '' }
let draftStep = 0

const DRAFT_STEPS = [
  { key: 'did',      icon: '✅', label: 'What did you do yesterday?',  hint: '(ketik update, Enter untuk lanjut)' },
  { key: 'do',       icon: '🎯', label: 'What will you do today?',      hint: '(ketik rencana hari ini, Enter untuk lanjut)' },
  { key: 'blockers', icon: '🚧', label: 'Any blockers?',                hint: '(ketik blocker, atau "-" jika tidak ada)' },
  { key: 'notes',    icon: '💡', label: 'Notes (optional)',             hint: '(ketik notes, atau Enter untuk skip)' },
]

let reminderTimer = null

// ─── Network ─────────────────────────────────────────────────────────────────

function broadcast (obj) {
  const f = encode(obj)
  for (const [, p] of peers) { try { p.conn.write(f) } catch {} }
}

function handleConnection (conn, info) {
  const pid   = b4a.toString(info.publicKey, 'hex')
  const short = shortId(pid)
  peers.set(pid, { conn, alias: short })
  log('⟳', 'green', `${C.cyan}${short}${C.reset} terhubung (${peers.size} peer)`)

  try {
    conn.write(encode({
      type: 'HELLO', alias: myAlias, version: APP_VERSION,
      streak: calcStreak(myAlias, loadLog()),
    }))
  } catch {}

  const logData = loadLog()
  if (logData[today()]) {
    try { conn.write(encode({ type: 'SYNC', date: today(), entries: logData[today()] })) } catch {}
  }

  let buf = ''
  conn.on('data', d => {
    buf += d.toString()
    const lines = buf.split('\n'); buf = lines.pop()
    for (const line of lines) {
      if (!line.trim()) continue
      const msg = decode(line)
      if (msg) handleMessage(pid, msg)
    }
  })
  conn.on('close', () => { peers.delete(pid); log('✕', 'dim', `${short} terputus`) })
  conn.on('error', err => { if (err.code !== 'ECONNRESET') log('✕', 'red', err.message); peers.delete(pid) })
}

function handleMessage (pid, msg) {
  const peer = peers.get(pid)

  switch (msg.type) {
    case 'HELLO':
      if (peer) peer.alias = msg.alias || shortId(pid)
      log('👋', 'blue',
        `${C.cyan}${msg.alias}${C.reset} online` +
        (msg.streak > 1 ? ` — 🔥 streak ${msg.streak} hari` : ''))
      break

    case 'STANDUP': {
      const { alias, entry, date, streak } = msg
      if (peer) peer.alias = alias
      const logData = loadLog()
      if (!logData[date]) logData[date] = {}
      logData[date][alias] = entry
      saveLog(logData)
      printStandupEntry(alias, entry, streak, true)
      break
    }

    case 'SYNC': {
      const { date, entries } = msg
      const logData = loadLog()
      if (!logData[date]) logData[date] = {}
      for (const [alias, entry] of Object.entries(entries)) {
        if (!logData[date][alias]) logData[date][alias] = entry
      }
      saveLog(logData)
      log('🔄', 'dim', `Sync dari ${(peer && peer.alias) || shortId(pid)} — data diperbarui`)
      break
    }

    case 'REMINDER': {
      const from    = (peer && peer.alias) || shortId(pid)
      const logData = loadLog()
      const posted  = logData[today()] && logData[today()][myAlias]
      if (!posted)
        log('🔔', 'yellow',
          `${C.cyan}${from}${C.reset} mengingatkan: belum standup hari ini! Ketik /standup`)
      break
    }
  }
}

// ─── Display ─────────────────────────────────────────────────────────────────

function printStandupEntry (alias, entry, streak, incoming = false) {
  const streakTag = streak > 1 ? ` 🔥${streak}` : ''
  const dir       = incoming ? `${C.cyan}← dari${C.reset}` : `${C.green}→ kamu${C.reset}`
  const dateLabel = new Date().toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long' })

  process.stdout.write('\n')
  process.stdout.write(
    `${C.bold}${C.bgBlue} 📋 STANDUP ${C.reset}${C.bold} ${alias}${streakTag} ${C.reset}` +
    ` ${dir} ${C.dim}${dateLabel}${C.reset}\n` +
    `${'─'.repeat(56)}\n` +
    `  ${C.green}✅ Did:${C.reset}      ${entry.did || C.dim + '(kosong)' + C.reset}\n` +
    `  ${C.blue}🎯 Do:${C.reset}       ${entry.do  || C.dim + '(kosong)' + C.reset}\n`
  )
  if (entry.blockers && entry.blockers !== '-')
    process.stdout.write(`  ${C.yellow}🚧 Blockers:${C.reset} ${C.yellow}${entry.blockers}${C.reset}\n`)
  else
    process.stdout.write(`  ${C.dim}🚧 Blockers: tidak ada${C.reset}\n`)
  if (entry.notes)
    process.stdout.write(`  ${C.magenta}💡 Notes:${C.reset}    ${entry.notes}\n`)
  process.stdout.write(`${'─'.repeat(56)}\n\n`)
  if (rl) rl.prompt(true)
}

// ─── Standup wizard ──────────────────────────────────────────────────────────

function startStandup (forceEdit = false) {
  if (draftMode) { log('✕', 'yellow', 'Standup sedang dalam proses! Lanjutkan atau /cancel'); return }
  const logData = loadLog()
  if (!forceEdit && logData[today()] && logData[today()][myAlias]) {
    log('ℹ', 'yellow', 'Sudah standup hari ini. Ketik /edit untuk update.')
    return
  }
  draftMode = true; draftStep = 0
  draft = { did: '', do: '', blockers: '', notes: '' }
  if (forceEdit && logData[today()] && logData[today()][myAlias]) {
    Object.assign(draft, logData[today()][myAlias])
    log('✏️', 'cyan', 'Edit standup — jawab ulang tiap pertanyaan:')
  }
  promptDraftStep()
}

function promptDraftStep () {
  const s = DRAFT_STEPS[draftStep]
  process.stdout.write(
    `\n  ${C.bold}${C.yellow}[${draftStep+1}/4]${C.reset} ${s.icon} ${C.white}${s.label}${C.reset}\n` +
    `  ${C.dim}${s.hint}${C.reset}\n  > `
  )
}

function handleDraftInput (line) {
  draft[DRAFT_STEPS[draftStep].key] = line.trim()
  draftStep++
  if (draftStep < DRAFT_STEPS.length) { promptDraftStep(); return }

  draftMode = false
  const logData = loadLog()
  if (!logData[today()]) logData[today()] = {}
  logData[today()][myAlias] = { ...draft, postedAt: iso() }
  saveLog(logData)

  const streak = calcStreak(myAlias, logData)
  printStandupEntry(myAlias, draft, streak, false)
  log('✅', 'green', `Standup terposting! 🔥 Streak: ${streak} hari`)
  broadcast({ type: 'STANDUP', alias: myAlias, date: today(), entry: { ...draft, postedAt: iso() }, streak })
  exportToMarkdown(today())
}

// ─── Digest ──────────────────────────────────────────────────────────────────

function printDigest (d) {
  const logData = loadLog()
  const entries = logData[d] || {}
  const names   = Object.keys(entries)
  const dateLabel = new Date(d + 'T00:00:00').toLocaleDateString('id-ID',
    { weekday:'long', day:'numeric', month:'long', year:'numeric' })

  process.stdout.write(
    `\n${C.bold}${C.bgBlue} 📰 STANDUP DIGEST ${C.reset}${C.bold} ${dateLabel} ${C.reset}\n` +
    `${'═'.repeat(60)}\n`
  )

  if (!names.length) {
    process.stdout.write(`  ${C.dim}Belum ada standup untuk tanggal ini.${C.reset}\n`)
  } else {
    for (const alias of names) {
      const e = entries[alias]
      const streak = calcStreak(alias, logData)
      process.stdout.write(
        `\n  ${C.cyan}${C.bold}${alias}${streak > 1 ? ' 🔥'+streak : ''}${C.reset}` +
        `  ${C.dim}${e.postedAt ? new Date(e.postedAt).toLocaleTimeString() : ''}${C.reset}\n` +
        `  ${C.green}✅${C.reset} ${e.did || '—'}\n` +
        `  ${C.blue}🎯${C.reset} ${e.do  || '—'}\n`
      )
      if (e.blockers && e.blockers !== '-')
        process.stdout.write(`  ${C.yellow}🚧${C.reset} ${C.yellow}${e.blockers}${C.reset}\n`)
      if (e.notes)
        process.stdout.write(`  ${C.magenta}💡${C.reset} ${e.notes}\n`)
    }
  }

  const allMembers = [...new Set([myAlias, ...[...peers.values()].map(p => p.alias)])]
  const missing    = allMembers.filter(a => !entries[a])
  if (missing.length)
    process.stdout.write(`\n  ${C.dim}Belum standup: ${missing.join(', ')}${C.reset}\n`)

  process.stdout.write(`${'═'.repeat(60)}\n\n`)
  if (rl) rl.prompt(true)
}

// ─── Streak leaderboard ──────────────────────────────────────────────────────

function printStreaks () {
  const logData  = loadLog()
  const allNames = new Set([myAlias, ...[...peers.values()].map(p => p.alias)])
  const rows     = [...allNames].map(alias => ({
    alias,
    streak: calcStreak(alias, logData),
    posted: !!(logData[today()] && logData[today()][alias]),
  })).sort((a, b) => b.streak - a.streak)

  process.stdout.write(`\n${C.bold}🔥 Streak Leaderboard${C.reset}\n${'─'.repeat(40)}\n`)
  for (const [i, r] of rows.entries()) {
    const medal = ['🥇','🥈','🥉'][i] ?? '  '
    const check = r.posted ? `${C.green}✓${C.reset}` : `${C.dim}○${C.reset}`
    process.stdout.write(
      `  ${medal} ${check} ${C.cyan}${r.alias.padEnd(20)}${C.reset}` +
      `${C.yellow}${r.streak} hari${C.reset}${r.streak > 6 ? ' 🔥' : ''}\n`
    )
  }
  process.stdout.write(`${'─'.repeat(40)}\n\n`)
  if (rl) rl.prompt(true)
}

// ─── Export ──────────────────────────────────────────────────────────────────

function exportToMarkdown (d) {
  const logData = loadLog()
  const entries = logData[d] || {}
  const dateLabel = new Date(d + 'T00:00:00').toLocaleDateString('id-ID',
    { weekday:'long', day:'numeric', month:'long', year:'numeric' })

  let md = `# 📋 Standup — ${dateLabel}\n\n> Generated by intercom-standup · ${iso()}\n\n`
  for (const [alias, e] of Object.entries(entries)) {
    md += `## ${alias}\n\n`
    md += `**✅ Did:** ${e.did || '—'}\n\n**🎯 Do:** ${e.do || '—'}\n\n`
    md += `**🚧 Blockers:** ${(e.blockers && e.blockers !== '-') ? e.blockers : 'tidak ada'}\n\n`
    if (e.notes) md += `**💡 Notes:** ${e.notes}\n\n`
    if (e.postedAt) md += `_Posted: ${new Date(e.postedAt).toLocaleString('id-ID')}_\n\n`
    md += '---\n\n'
  }
  try {
    if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR)
    const fname = path.join(EXPORTS_DIR, `standup-${d}.md`)
    fs.writeFileSync(fname, md)
    return fname
  } catch { return null }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function printHelp () {
  process.stdout.write(`
${C.bold}${C.blue}╔══════════════════════════════════════════════════════╗
║           INTERCOM-STANDUP  COMMANDS                 ║
╚══════════════════════════════════════════════════════╝${C.reset}
  ${C.yellow}/standup${C.reset}           Mulai standup harian (wizard 4 langkah)
  ${C.yellow}/edit${C.reset}              Edit standup hari ini
  ${C.yellow}/cancel${C.reset}            Batalkan draft yang sedang dikerjakan
  ${C.yellow}/digest [tgl]${C.reset}      Digest hari ini (atau: /digest 2025-08-10)
  ${C.yellow}/remind${C.reset}            Kirim reminder ke peer yang belum standup
  ${C.yellow}/export [tgl]${C.reset}      Export digest ke .md
  ${C.yellow}/streak${C.reset}            Streak leaderboard
  ${C.yellow}/peers${C.reset}             Peer terhubung
  ${C.yellow}/alias <nama>${C.reset}      Ganti nama
  ${C.yellow}/help${C.reset}              Menu ini
  ${C.yellow}/exit${C.reset}              Keluar
\n> `)
}

function handleCommand (line) {
  if (draftMode) { handleDraftInput(line.trim()); return }
  const raw = line.trim()
  if (!raw) return
  if (!raw.startsWith('/')) { log('ℹ', 'dim', 'Ketik /help untuk perintah.'); return }

  const parts = raw.slice(1).split(' ')
  const cmd   = parts[0].toLowerCase()
  const rest  = parts.slice(1).join(' ').trim()

  switch (cmd) {
    case 'standup': startStandup(false); break
    case 'edit':    startStandup(true);  break
    case 'cancel':
      if (!draftMode) { log('ℹ','yellow','Tidak ada draft aktif.'); break }
      draftMode = false
      log('✕','yellow','Standup dibatalkan.')
      break
    case 'digest': {
      const d = rest || today()
      if (rest && !/^\d{4}-\d{2}-\d{2}$/.test(rest)) {
        log('✕','red','Format: YYYY-MM-DD'); break
      }
      printDigest(d); break
    }
    case 'remind':
      broadcast({ type: 'REMINDER', from: myAlias })
      log('🔔','magenta',`Reminder dikirim ke ${peers.size} peer`)
      break
    case 'export': {
      const d = rest || today()
      const f = exportToMarkdown(d)
      f ? log('📄','green',`Export: ${C.cyan}${f}${C.reset}`) : log('✕','red','Export gagal.')
      break
    }
    case 'streak': printStreaks(); break
    case 'peers':
      if (!peers.size) { log('ℹ','yellow','Belum ada peer.'); break }
      for (const [pid, p] of peers)
        process.stdout.write(`  ${C.cyan}${shortId(pid)}${C.reset}  ${p.alias}\n`)
      if (rl) rl.prompt(true)
      break
    case 'alias':
      if (!rest) { log('✕','red','Usage: /alias <nama>'); break }
      myAlias = rest.slice(0,24)
      log('✓','green',`Alias: "${myAlias}"`)
      break
    case 'help':  printHelp(); break
    case 'exit': case 'quit':
      if (reminderTimer) clearInterval(reminderTimer)
      log('✓','green','Keluar…'); process.exit(0)
      break
    default: log('✕','yellow',`Perintah tidak dikenal: /${cmd}`)
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main () {
  const args  = process.argv.slice(2)
  let channel = DEFAULT_CHANNEL, alias = ''
  for (let i = 0; i < args.length; i++) {
    if (args[i]==='--channel' && args[i+1]) channel = args[++i]
    if (args[i]==='--alias'   && args[i+1]) alias   = args[++i]
  }
  myAlias = alias || `dev-${crypto.randomBytes(2).toString('hex')}`

  process.stdout.write(`
${C.bold}${C.blue}
  ███████╗████████╗ █████╗ ███╗   ██╗██████╗ ██╗   ██╗██████╗
  ██╔════╝╚══██╔══╝██╔══██╗████╗  ██║██╔══██╗██║   ██║██╔══██╗
  ███████╗   ██║   ███████║██╔██╗ ██║██║  ██║██║   ██║██████╔╝
  ╚════██║   ██║   ██╔══██║██║╚██╗██║██║  ██║██║   ██║██╔═══╝
  ███████║   ██║   ██║  ██║██║ ╚████║██████╔╝╚██████╔╝██║
  ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝  ╚═════╝ ╚═╝${C.reset}
${C.dim}  intercom-standup v${APP_VERSION} · Async P2P Daily Standup · Intercom Vibe Competition${C.reset}

`)

  swarm    = new Hyperswarm()
  myPeerId = b4a.toString(swarm.keyPair.publicKey, 'hex')

  log('⚡','green',`Peer ID : ${shortId(myPeerId)}`)
  log('⚡','green',`Alias   : ${myAlias}`)
  log('⚡','green',`Channel : ${channel}`)
  log('⚡','green',`Log     : ${LOG_FILE}`)
  log('⚡','green',`Exports : ${EXPORTS_DIR}/`)

  const logData = loadLog()
  const streak  = calcStreak(myAlias, logData)
  const posted  = logData[today()] && logData[today()][myAlias]
  if (streak > 0) log('🔥','yellow',`Streak kamu: ${streak} hari berturut-turut!`)
  if (!posted)    log('📋','cyan','Belum standup hari ini — ketik /standup untuk mulai')
  else            log('✅','green','Sudah standup hari ini! Ketik /digest untuk lihat semua.')

  swarm.on('connection', handleConnection)
  await swarm.join(topicFromString(channel), { server:true, client:true }).flushed()
  log('✓','green','Bergabung ke DHT. Ketik /help untuk mulai.\n')

  reminderTimer = setInterval(() => {
    const ld = loadLog()
    if (!(ld[today()] && ld[today()][myAlias]) && peers.size > 0)
      log('🔔','yellow','Belum standup hari ini! Ketik /standup')
  }, REMINDER_MS)

  for (const sig of ['SIGINT','SIGTERM']) {
    process.on(sig, async () => {
      clearInterval(reminderTimer); await swarm.destroy(); process.exit(0)
    })
  }

  rl = readline.createInterface({ input:process.stdin, output:process.stdout, prompt:'> ', terminal:true })
  rl.prompt()
  rl.on('line', line => { handleCommand(line); if (!draftMode) rl.prompt() })
  rl.on('close', async () => { clearInterval(reminderTimer); await swarm.destroy(); process.exit(0) })
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
