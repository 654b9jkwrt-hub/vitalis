'use strict'
/**
 * Vitalis — فتح قاعدة البيانات وتهيئتها
 * قاعدة معاملاتية بسجل كتابة مسبق (WAL) — شرط قبول من المرحلة 8
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const Database = require('better-sqlite3')

let db = null
let DEVICE_ID = null
let DATA_DIR = null
let FILES_DIR = null
let BACKUP_DIR = null
let DB_FILE = null

function nowISO() { return new Date().toISOString() }
function uid() { return crypto.randomUUID() }

function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(secret), salt, 64).toString('hex')
  return { hash, salt }
}
function verifySecret(secret, hash, salt) {
  if (!hash || !salt) return false
  const test = crypto.scryptSync(String(secret), salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(hash, 'hex'))
}

const DEFAULT_SETTINGS = {
  clinic_name: 'اسم العيادة',
  doctor_name: 'اسم الطبيب',
  specialty: 'اختصاصي جراحة عامة',
  address: '',
  phone: '',
  logo_data: '',
  currency: 'ل.س',
  price_visit: '50000',
  price_review: '30000',
  price_dressing: '15000',
  dur_visit: '30',
  dur_review: '15',
  dur_short: '10',
  idle_doctor: '3',
  idle_secretary: '15',
  idle_case_days: '30',
  work_start: '09:00',
  work_end: '14:00',
  next_file_no: '1000',
  morning_brief: '1',
  theme: 'light',
  header_from_system: '1'
}

function init(userDataPath) {
  const dir = path.join(userDataPath, 'data')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'vitalis.db')
  DATA_DIR = dir
  DB_FILE = file
  FILES_DIR = path.join(dir, 'files')
  BACKUP_DIR = path.join(userDataPath, 'backups')
  fs.mkdirSync(FILES_DIR, { recursive: true })
  fs.mkdirSync(BACKUP_DIR, { recursive: true })

  db = new Database(file)
  db.pragma('journal_mode = WAL')      // يمنع تلف البيانات عند انقطاع الكهرباء
  db.pragma('synchronous = FULL')      // أمان أعلى — الأداء كافٍ لحجمنا
  db.pragma('foreign_keys = ON')

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  db.exec(schema)
  migrate()

  // معرّف الجهاز — أساس المزامنة لاحقًا
  const devFile = path.join(dir, 'device.id')
  if (!fs.existsSync(devFile)) fs.writeFileSync(devFile, uid())
  DEVICE_ID = fs.readFileSync(devFile, 'utf8').trim()

  seed()
  return { file, dir, device: DEVICE_ID }
}

/**
 * الترقيات — تُضاف الأعمدة الجديدة إلى قواعد البيانات القائمة بلا فقدان بيانات.
 * آمنة ومتكررة: تفحص وجود العمود قبل إضافته.
 */
function migrate() {
  const ADD = [
    ['visits', 'struct', 'TEXT'],          // الحقول الاحترافية (JSON)
    ['visits', 'template', 'TEXT'],        // القالب المستخدم
    ['patients', 'blood_type', 'TEXT'],
    ['patients', 'job', 'TEXT']
  ]
  for (const [table, col, type] of ADD) {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)
      if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`)
    } catch { /* الجدول غير موجود بعد — سيُنشأ بالمخطط */ }
  }
}

function seed() {
  const get = db.prepare('SELECT value FROM settings WHERE key=?')
  const put = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)')
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) put.run(k, v)
  })
  tx()

  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c
  if (count === 0) {
    // كلمتا مرور ابتدائيتان — يغيّرهما الطبيب من الإعدادات
    const mk = (role, name, pass, pin) => {
      const p = hashSecret(pass)
      const n = pin ? hashSecret(pin) : { hash: null, salt: null }
      db.prepare(`INSERT INTO users (id,role,name,pass_hash,pass_salt,pin_hash,pin_salt,active,created_at)
                  VALUES (?,?,?,?,?,?,?,1,?)`)
        .run(uid(), role, name, p.hash, p.salt, n.hash, n.salt, nowISO())
    }
    mk('doctor', 'الطبيب', '1234', '1234')
    mk('secretary', 'السكرتيرة', '1111', null)
  }
  void get
}

let onChangeCb = null
function setOnChange(fn) { onChangeCb = fn }

/** يُسجَّل كل تغيير محلي — وهو أساس المزامنة */
function logChange(tbl, rowId, op, originDevice) {
  db.prepare('INSERT INTO change_log (device,tbl,row_id,op,at) VALUES (?,?,?,?,?)')
    .run(originDevice || DEVICE_ID, tbl, rowId, op, nowISO())
  if (!originDevice && onChangeCb) { try { onChangeCb() } catch { } }
}

function audit(user, type, text, refId) {
  db.prepare('INSERT INTO audit (id,at,user,role,type,text,ref_id) VALUES (?,?,?,?,?,?,?)')
    .run(uid(), nowISO(), user?.name || '—', user?.role || '—', type, text, refId || null)
}

module.exports = {
  init,
  get db() { return db },
  get device() { return DEVICE_ID },
  get dataDir() { return DATA_DIR },
  get filesDir() { return FILES_DIR },
  get backupDir() { return BACKUP_DIR },
  get dbFile() { return DB_FILE },
  uid, nowISO, hashSecret, verifySecret, logChange, audit, setOnChange, DEFAULT_SETTINGS
}
