'use strict'
/**
 * Vitalis — محرك المزامنة بين جهازين على الشبكة المحلية
 *
 * المبدأ: لا خادم مركزي. كل جهاز يشغّل خادمًا صغيرًا ويسحب من الآخر.
 *  · اكتشاف تلقائي عبر بث UDP على الشبكة — لا حاجة لكتابة عناوين
 *  · سحب التغييرات من سجل change_log منذ آخر رقم مطبَّق
 *  · «نكزة» فورية بعد كل تغيير محلي ← الظهور خلال أقل من ثانية
 *  · بلا شبكة: كل جهاز يعمل كاملًا ويتراكم لديه ما سيُزامن
 */
const http = require('http')
const dgram = require('dgram')
const os = require('os')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const D = require('./db')

const PORT = 47821
const UDP_PORT = 47822
const PULL_MS = 2500          // سحب دوري احتياطي
const ANNOUNCE_MS = 5000      // إعلان الوجود

/* الجداول التي تُزامَن ومفتاح كل منها */
const TABLES = {
  settings: 'key', patients: 'id', cases: 'id', appointments: 'id', visits: 'id',
  drugs: 'id', rx_templates: 'id', prescriptions: 'id', payments: 'id', waivers: 'id',
  day_close: 'day', prices: 'id', surgeries: 'id', lab_orders: 'id', lab_templates: 'id',
  lab_tests: 'id', attachments: 'id', expenses: 'id', expense_labels: 'id',
  waitlist: 'id', options: 'id', custom_fields: 'id', snoozes: 'key',
  notices: 'id', audit: 'id', trash: 'id', users: 'id'
}

let server = null, udp = null, timer = null, announceTimer = null
let secret = null
let status = { running: false, peer: null, lastSync: null, lastError: null, pending: 0 }
let pokeTimer = null

const now = () => new Date().toISOString()
const db = () => D.db

/* ═══════════ أدوات ═══════════ */
function localIPs() {
  const out = []
  for (const list of Object.values(os.networkInterfaces() || {}))
    for (const i of (list || []))
      if (i.family === 'IPv4' && !i.internal) out.push(i.address)
  return out
}
function getSecret() {
  if (secret) return secret
  const row = db().prepare("SELECT value FROM settings WHERE key='sync_secret'").get()
  if (row?.value) { secret = row.value; return secret }
  secret = crypto.randomBytes(16).toString('hex')
  db().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run('sync_secret', secret)
  return secret
}
function setSecret(v) {
  secret = (v || '').trim()
  db().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run('sync_secret', secret)
}
function deviceName() {
  const row = db().prepare("SELECT value FROM settings WHERE key='device_name'").get()
  return row?.value || os.hostname()
}

/* ═══════════ الخادم ═══════════ */
function startServer() {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(obj))
    }
    // كل الطلبات تحتاج المفتاح المشترك
    if (req.headers['x-vitalis-key'] !== getSecret() && url.pathname !== '/hello')
      return send(401, { error: 'مفتاح غير صحيح' })

    try {
      if (url.pathname === '/hello')
        return send(200, { app: 'vitalis', device: D.device, name: deviceName() })

      if (url.pathname === '/changes') {
        const since = parseInt(url.searchParams.get('since') || '0', 10)
        const asker = url.searchParams.get('device') || ''
        const rows = db().prepare(
          `SELECT seq,device,tbl,row_id,op,at FROM change_log
           WHERE seq > ? AND device != ? ORDER BY seq LIMIT 400`).all(since, asker)
        const out = []
        for (const c of rows) {
          const pk = TABLES[c.tbl]
          if (!pk) continue
          let row = null
          if (c.op !== 'delete') {
            try { row = db().prepare(`SELECT * FROM ${c.tbl} WHERE ${pk}=?`).get(c.row_id) } catch { }
          }
          out.push({ seq: c.seq, device: c.device, tbl: c.tbl, row_id: c.row_id, op: c.op, at: c.at, row })
        }
        const max = db().prepare('SELECT COALESCE(MAX(seq),0) m FROM change_log').get().m
        return send(200, { changes: out, max, device: D.device, name: deviceName() })
      }

      if (url.pathname === '/file') {
        const id = url.searchParams.get('id')
        const a = db().prepare('SELECT * FROM attachments WHERE id=?').get(id)
        if (!a) return send(404, { error: 'غير موجود' })
        const p = path.join(D.filesDir, a.rel_path)
        if (!fs.existsSync(p)) return send(404, { error: 'الملف مفقود' })
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
        return fs.createReadStream(p).pipe(res)
      }

      if (url.pathname === '/poke') { setTimeout(pullOnce, 120); return send(200, { ok: true }) }

      send(404, { error: 'غير معروف' })
    } catch (e) { send(500, { error: String(e.message || e) }) }
  })
  server.on('error', e => { status.lastError = 'تعذّر تشغيل الخادم: ' + e.message })
  server.listen(PORT, '0.0.0.0', () => { status.running = true })
}

/* ═══════════ الاكتشاف التلقائي ═══════════ */
function startDiscovery() {
  udp = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  udp.on('error', () => { })
  udp.on('message', msg => {
    try {
      const m = JSON.parse(msg.toString())
      if (m.app !== 'vitalis' || m.device === D.device) return
      if (m.secretHash !== crypto.createHash('sha256').update(getSecret()).digest('hex').slice(0, 16)) return
      savePeer(m.device, m.name, `${m.ip}:${m.port}`)
    } catch { }
  })
  udp.bind(UDP_PORT, () => { try { udp.setBroadcast(true) } catch { } })

  const announce = () => {
    const payload = ip => JSON.stringify({
      app: 'vitalis', device: D.device, name: deviceName(), ip, port: PORT,
      secretHash: crypto.createHash('sha256').update(getSecret()).digest('hex').slice(0, 16)
    })
    for (const ip of localIPs()) {
      const buf = Buffer.from(payload(ip))
      try { udp.send(buf, 0, buf.length, UDP_PORT, '255.255.255.255') } catch { }
      const parts = ip.split('.'); parts[3] = '255'
      try { udp.send(buf, 0, buf.length, UDP_PORT, parts.join('.')) } catch { }
    }
  }
  announceTimer = setInterval(announce, ANNOUNCE_MS)
  setTimeout(announce, 800)
}

function savePeer(deviceId, name, address) {
  const ex = db().prepare('SELECT * FROM sync_peers WHERE device_id=?').get(deviceId)
  if (ex) db().prepare('UPDATE sync_peers SET name=?, address=?, last_seen=? WHERE device_id=?')
    .run(name || ex.name, address, now(), deviceId)
  else db().prepare('INSERT INTO sync_peers (device_id,name,address,last_seq,last_seen,created_at) VALUES (?,?,?,0,?,?)')
    .run(deviceId, name || '—', address, now(), now())
}

/* ═══════════ السحب والتطبيق ═══════════ */
function req(address, pathname, query) {
  return new Promise((resolve, reject) => {
    const [host, port] = address.split(':')
    const q = new URLSearchParams(query || {}).toString()
    const r = http.request({
      host, port: port || PORT, path: pathname + (q ? '?' + q : ''),
      method: 'GET', timeout: 6000, headers: { 'x-vitalis-key': getSecret() }
    }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve(JSON.parse(d)) } catch { reject(new Error('رد غير صالح')) }
      })
    })
    r.on('error', reject)
    r.on('timeout', () => { r.destroy(); reject(new Error('انتهت المهلة')) })
    r.end()
  })
}

function upsert(tbl, pk, row, originDevice) {
  const cols = Object.keys(row)
  const ph = cols.map(() => '?').join(',')
  const upd = cols.filter(c => c !== pk).map(c => `${c}=excluded.${c}`).join(',')
  db().prepare(`INSERT INTO ${tbl} (${cols.join(',')}) VALUES (${ph})
                ON CONFLICT(${pk}) DO UPDATE SET ${upd}`).run(...cols.map(c => row[c]))
  D.logChange(tbl, row[pk], 'update', originDevice)
}

async function applyChanges(peer, changes) {
  let applied = 0
  const attachNeeded = []
  const tx = db().transaction(() => {
    for (const c of changes) {
      const pk = TABLES[c.tbl]
      if (!pk) continue
      try {
        if (c.op === 'delete') {
          db().prepare(`DELETE FROM ${c.tbl} WHERE ${pk}=?`).run(c.row_id)
          D.logChange(c.tbl, c.row_id, 'delete', c.device)
        } else if (c.row) {
          // حل التعارض: الأحدث يفوز حين يوجد updated_at
          const cur = db().prepare(`SELECT * FROM ${c.tbl} WHERE ${pk}=?`).get(c.row_id)
          if (cur && cur.updated_at && c.row.updated_at && cur.updated_at > c.row.updated_at) {
            continue    // نسختنا أحدث — نتجاهل
          }
          upsert(c.tbl, pk, c.row, c.device)
          if (c.tbl === 'attachments') attachNeeded.push(c.row)
        }
        applied++
      } catch { /* سجل واحد فاسد لا يوقف الدفعة */ }
    }
    if (changes.length)
      db().prepare('UPDATE sync_peers SET last_seq=?, last_seen=? WHERE device_id=?')
        .run(changes[changes.length - 1].seq, now(), peer.device_id)
  })
  tx()

  // جلب ملفات المرفقات بعد تطبيق البيانات
  for (const a of attachNeeded) {
    const dest = path.join(D.filesDir, a.rel_path)
    if (fs.existsSync(dest)) continue
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      await new Promise((res, rej) => {
        const [host, port] = peer.address.split(':')
        const r = http.request({
          host, port: port || PORT, path: `/file?id=${encodeURIComponent(a.id)}`,
          headers: { 'x-vitalis-key': getSecret() }, timeout: 20000
        }, resp => {
          if (resp.statusCode !== 200) { resp.resume(); return rej(new Error('تعذّر جلب الملف')) }
          const w = fs.createWriteStream(dest)
          resp.pipe(w); w.on('finish', res); w.on('error', rej)
        })
        r.on('error', rej); r.on('timeout', () => { r.destroy(); rej(new Error('مهلة')) })
        r.end()
      })
    } catch { }
  }
  return applied
}

async function pullFrom(peer) {
  const res = await req(peer.address, '/changes', { since: peer.last_seq, device: D.device })
  if (!res || !Array.isArray(res.changes)) throw new Error('رد غير متوقع')
  savePeer(peer.device_id, res.name, peer.address)
  if (res.changes.length === 0) return 0
  return await applyChanges(peer, res.changes)
}

async function pullOnce() {
  const peers = db().prepare('SELECT * FROM sync_peers WHERE address IS NOT NULL').all()
  if (!peers.length) { status.peer = null; return }
  let total = 0, ok = false
  for (const p of peers) {
    try {
      let n = 0, guard = 0
      do { n = await pullFrom(p); total += n; guard++ } while (n >= 400 && guard < 20)
      ok = true
      status.peer = { name: p.name, address: p.address, device: p.device_id }
      status.lastError = null
    } catch (e) { status.lastError = e.message }
  }
  if (ok) status.lastSync = now()
  return total
}

/** نكزة للطرف الآخر بعد أي تغيير محلي — تجعل الظهور فوريًا */
function pokePeers() {
  clearTimeout(pokeTimer)
  pokeTimer = setTimeout(() => {
    const peers = db().prepare('SELECT * FROM sync_peers WHERE address IS NOT NULL').all()
    for (const p of peers) {
      const [host, port] = p.address.split(':')
      const r = http.request({
        host, port: port || PORT, path: '/poke', timeout: 3000,
        headers: { 'x-vitalis-key': getSecret() }
      }, res => res.resume())
      r.on('error', () => { }); r.on('timeout', () => r.destroy())
      r.end()
    }
  }, 250)
}

/* ═══════════ الواجهة البرمجية ═══════════ */
function start() {
  try {
    startServer()
    startDiscovery()
    D.setOnChange(pokePeers)
    timer = setInterval(() => { pullOnce().catch(() => { }) }, PULL_MS)
    setTimeout(() => pullOnce().catch(() => { }), 1500)
  } catch (e) { status.lastError = String(e.message || e) }
}
function stop() {
  clearInterval(timer); clearInterval(announceTimer)
  try { server?.close() } catch { }
  try { udp?.close() } catch { }
  status.running = false
}

function info() {
  const peers = db().prepare('SELECT * FROM sync_peers ORDER BY last_seen DESC').all()
  const pending = db().prepare('SELECT COUNT(*) c FROM change_log WHERE device=?').get(D.device).c
  const connected = peers.some(p => p.last_seen && (Date.now() - new Date(p.last_seen).getTime()) < 15000)
  return {
    running: status.running, device: D.device, name: deviceName(),
    ips: localIPs(), port: PORT, key: getSecret(),
    peers, connected, lastSync: status.lastSync, lastError: status.lastError, pending
  }
}

/** اقتران يدوي بعنوان IP — حين يفشل الاكتشاف التلقائي */
async function pair(address) {
  const addr = address.includes(':') ? address : `${address}:${PORT}`
  const hello = await req(addr, '/hello')
  if (hello?.app !== 'vitalis') throw new Error('لا يوجد Vitalis على هذا العنوان')
  if (hello.device === D.device) throw new Error('هذا هو الجهاز نفسه')
  savePeer(hello.device, hello.name, addr)
  await pullOnce()
  return hello
}
function forget(deviceId) {
  db().prepare('DELETE FROM sync_peers WHERE device_id=?').run(deviceId)
  return true
}
function setName(name) {
  db().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run('device_name', name)
  return true
}

module.exports = { start, stop, info, pair, forget, pullOnce, setName, setSecret, getSecret, PORT }
