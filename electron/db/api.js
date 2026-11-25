'use strict'
/**
 * Vitalis — طبقة البيانات وجدار الصلاحيات
 * كل ما تصل إليه الواجهة يمر من هنا. الصلاحيات تُفرض هنا لا في الواجهة.
 */
const fs = require('fs')
const path = require('path')
const D = require('./index')

const today = () => new Date().toISOString().slice(0, 10)
const T = () => D.nowISO()

/* ═══════════════ جدار الصلاحيات ═══════════════ */
// المحتوى الطبي ممنوع على السكرتيرة منعًا صارمًا (المرحلة 3)
const DOCTOR_ONLY = new Set([
  'visit.start', 'visit.save', 'visit.close', 'visit.short', 'visit.get',
  'rx.save', 'rx.get', 'drugs.search', 'drugs.upsert', 'tpl.list', 'tpl.save',
  'case.new', 'case.close', 'patient.setMedical', 'patient.setAdminNote',
  'price.set', 'settings.set', 'audit.list', 'money.review', 'money.refund',
  'reports.get', 'user.setPass', 'diff.list', 'money.waive',
  'surgery.write', 'surgery.read', 'lab.write',
  'attach.write', 'attach.read', 'expense.write',
  'pending.read', 'snooze', 'patient.merge', 'backup',
  'delete',         // الحذف كله — الطبيب حصرًا
  'options.write'   // تعديل القوائم والحقول المخصصة
])

function guard(user, action) {
  if (!user) throw new Error('غير مسجّل الدخول')
  if (user.role === 'doctor') return
  if (DOCTOR_ONLY.has(action)) throw new Error('هذه الوظيفة للطبيب فقط')
}

// تجريد المحتوى الطبي قبل إرساله للسكرتيرة
function redactPatient(p, role) {
  if (!p) return p
  if (role === 'doctor') return p
  const { allergies, chronic, ...rest } = p
  return rest
}
function redactVisit(v, role) {
  if (!v) return v
  if (role === 'doctor') return v
  return {
    id: v.id, patient_id: v.patient_id, kind: v.kind, short_type: v.short_type,
    status: v.status, amount_due: v.amount_due, covered: v.covered,
    started_at: v.started_at, closed_at: v.closed_at
  }
}

/* ═══════════════ الإعدادات ═══════════════ */
function settingsGet() {
  const rows = D.db.prepare('SELECT key,value FROM settings').all()
  const o = {}
  for (const r of rows) o[r.key] = r.value
  return o
}
function settingsSet(user, patch) {
  guard(user, 'settings.set')
  const up = D.db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  D.db.transaction(() => { for (const [k, v] of Object.entries(patch)) up.run(k, String(v ?? '')) })()
  D.audit(user, 'system', 'عدّل الإعدادات')
  return settingsGet()
}

/* ═══════════════ الدخول ═══════════════ */
function usersList() {
  return D.db.prepare('SELECT id,role,name,active FROM users WHERE active=1').all()
}
function login(role, pass) {
  const u = D.db.prepare('SELECT * FROM users WHERE role=? AND active=1').get(role)
  if (!u) throw new Error('المستخدم غير موجود')
  if (!D.verifySecret(pass, u.pass_hash, u.pass_salt)) throw new Error('كلمة المرور غير صحيحة')
  const user = { id: u.id, role: u.role, name: u.name }
  D.audit(user, 'auth', 'سجّل الدخول')
  return user
}
function unlock(user, pin) {
  const u = D.db.prepare('SELECT * FROM users WHERE id=?').get(user.id)
  if (!u.pin_hash) return D.verifySecret(pin, u.pass_hash, u.pass_salt)
  return D.verifySecret(pin, u.pin_hash, u.pin_salt)
}
function setPass(user, targetRole, pass, pin) {
  guard(user, 'user.setPass')
  const p = D.hashSecret(pass)
  if (pin) {
    const n = D.hashSecret(pin)
    D.db.prepare('UPDATE users SET pass_hash=?,pass_salt=?,pin_hash=?,pin_salt=? WHERE role=?')
      .run(p.hash, p.salt, n.hash, n.salt, targetRole)
  } else {
    D.db.prepare('UPDATE users SET pass_hash=?,pass_salt=? WHERE role=?').run(p.hash, p.salt, targetRole)
  }
  D.audit(user, 'auth', `غيّر كلمة مرور: ${targetRole === 'doctor' ? 'الطبيب' : 'السكرتيرة'}`)
  return true
}

/* ═══════════════ المرضى ═══════════════ */
function nextFileNo() {
  const cur = parseInt(settingsGet().next_file_no || '1000', 10)
  D.db.prepare('UPDATE settings SET value=? WHERE key=?').run(String(cur + 1), 'next_file_no')
  return cur
}

function patientCreate(user, data) {
  guard(user, 'patient.create')
  if (!data.name || !data.name.trim()) throw new Error('اسم المريض مطلوب')
  if (!data.no_phone && !(data.phone || '').trim()) throw new Error('الهاتف مطلوب — أو أشّر «لا يملك هاتفًا»')
  const id = D.uid()
  const fno = nextFileNo()
  D.db.prepare(`INSERT INTO patients
    (id,file_no,name,phone,no_phone,contact_phone,contact_relation,age,gender,address,referred_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, fno, data.name.trim(), (data.phone || '').trim(), data.no_phone ? 1 : 0,
      data.contact_phone || null, data.contact_relation || null,
      data.age ? parseInt(data.age, 10) : null, data.gender || null,
      data.address || null, data.referred_by || null, T(), T())
  D.logChange('patients', id, 'insert')
  D.audit(user, 'system', `أنشأ ملف مريض: ${data.name.trim()} (${fno})`, id)
  return patientGet(user, id)
}

function patientUpdate(user, id, patch) {
  guard(user, 'patient.update')
  const allowed = ['name', 'phone', 'no_phone', 'contact_phone', 'contact_relation', 'age', 'gender', 'address', 'referred_by']
  const med = ['allergies', 'chronic', 'note_admin']
  const fields = [], vals = []
  for (const k of allowed) if (k in patch) { fields.push(`${k}=?`); vals.push(patch[k]) }
  if (user.role === 'doctor') for (const k of med) if (k in patch) { fields.push(`${k}=?`); vals.push(patch[k]) }
  if (!fields.length) return patientGet(user, id)
  fields.push('updated_at=?'); vals.push(T(), id)
  D.db.prepare(`UPDATE patients SET ${fields.join(',')} WHERE id=?`).run(...vals)
  D.logChange('patients', id, 'update')
  D.audit(user, 'system', `عدّل بيانات مريض`, id)
  return patientGet(user, id)
}

function patientGet(user, id) {
  const p = D.db.prepare('SELECT * FROM patients WHERE id=?').get(id)
  if (!p) return null
  p.balance = patientBalance(id)
  return redactPatient(p, user.role)
}

function patientSearch(user, q) {
  const s = (q || '').trim()
  if (s.length < 1) return []
  const norm = s.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  const like = `%${norm}%`
  const rows = D.db.prepare(`
    SELECT id,file_no,name,phone,age,gender FROM patients
    WHERE archived=0 AND (
      replace(replace(replace(replace(name,'أ','ا'),'إ','ا'),'ى','ي'),'ة','ه') LIKE ?
      OR phone LIKE ? OR CAST(file_no AS TEXT) LIKE ?)
    ORDER BY name LIMIT 25`).all(like, `%${s}%`, `%${s}%`)
  for (const r of rows) {
    r.balance = patientBalance(r.id)
    const lv = D.db.prepare('SELECT started_at,kind FROM visits WHERE patient_id=? ORDER BY started_at DESC LIMIT 1').get(r.id)
    r.last_visit = lv ? lv.started_at : null
  }
  return rows
}

function patientFile(user, id) {
  const p = patientGet(user, id)
  if (!p) return null
  const visits = D.db.prepare('SELECT * FROM visits WHERE patient_id=? ORDER BY started_at DESC').all(id)
  const kase = D.db.prepare("SELECT * FROM cases WHERE patient_id=? AND status='open' ORDER BY opened_at DESC LIMIT 1").get(id)
  const pays = D.db.prepare('SELECT * FROM payments WHERE patient_id=? ORDER BY created_at DESC').all(id)
  const appts = D.db.prepare("SELECT * FROM appointments WHERE patient_id=? AND status IN ('scheduled','arrived') AND day>=? ORDER BY day,time").all(id, today())
  return {
    patient: p,
    activeCase: user.role === 'doctor' ? kase : null,
    visits: visits.map(v => redactVisit(v, user.role)),
    payments: pays,
    upcoming: appts,
    totals: financials(id)
  }
}

/* ═══════════════ الحالات ═══════════════ */
function ensureCase(patientId) {
  let c = D.db.prepare("SELECT * FROM cases WHERE patient_id=? AND status='open' ORDER BY opened_at DESC LIMIT 1").get(patientId)
  if (c) return c
  const id = D.uid()
  D.db.prepare('INSERT INTO cases (id,patient_id,title,status,opened_at) VALUES (?,?,?,?,?)')
    .run(id, patientId, null, 'open', T())
  D.logChange('cases', id, 'insert')
  return D.db.prepare('SELECT * FROM cases WHERE id=?').get(id)
}
function caseNew(user, patientId, title) {
  guard(user, 'case.new')
  D.db.prepare("UPDATE cases SET status='closed', closed_at=? WHERE patient_id=? AND status='open'").run(T(), patientId)
  const id = D.uid()
  D.db.prepare('INSERT INTO cases (id,patient_id,title,status,opened_at) VALUES (?,?,?,?,?)')
    .run(id, patientId, title || null, 'open', T())
  D.logChange('cases', id, 'insert')
  D.audit(user, 'medical', `فتح حالة جديدة: ${title || '—'}`, patientId)
  return D.db.prepare('SELECT * FROM cases WHERE id=?').get(id)
}

/* ═══════════════ المواعيد ولوحة اليوم ═══════════════ */
function apptDay(user, day) {
  const d = day || today()
  const rows = D.db.prepare(`
    SELECT a.*, p.name, p.file_no, p.phone, p.allergies, p.chronic, p.note_admin
    FROM appointments a JOIN patients p ON p.id=a.patient_id
    WHERE a.day=? AND a.status!='cancelled'
    ORDER BY a.order_index, a.time`).all(d)
  return rows.map(r => {
    const o = { ...r }
    if (user.role !== 'doctor') { delete o.allergies; delete o.chronic }
    const dv = D.db.prepare("SELECT id,status,amount_due FROM visits WHERE appointment_id=? ORDER BY started_at DESC LIMIT 1").get(r.id)
    o.visit_id = dv?.id || null
    o.visit_status = dv?.status || null
    o.amount_due = dv?.amount_due ?? null
    o.paid = dv ? paidForVisit(dv.id) : 0
    return o
  })
}

function apptCreate(user, patientId, day, time, kind) {
  guard(user, 'appt.create')
  const s = settingsGet()
  const dur = kind === 'مراجعة' ? +s.dur_review : kind === 'زيارة قصيرة' ? +s.dur_short : +s.dur_visit
  const max = D.db.prepare('SELECT COALESCE(MAX(order_index),0) m FROM appointments WHERE day=?').get(day).m
  const id = D.uid()
  D.db.prepare(`INSERT INTO appointments (id,patient_id,day,time,kind,duration,status,order_index,created_at,updated_at)
                VALUES (?,?,?,?,?,?,'scheduled',?,?,?)`)
    .run(id, patientId, day, time || null, kind || 'كشف', dur, max + 1, T(), T())
  D.logChange('appointments', id, 'insert')
  D.audit(user, 'appointment', `حجز موعد ${day} ${time || ''}`, id)
  return id
}

function apptStatus(user, id, status) {
  guard(user, 'appt.status')
  const extra = status === 'arrived' ? ', arrived_at=?' : ''
  const args = status === 'arrived' ? [status, T(), T(), id] : [status, T(), id]
  D.db.prepare(`UPDATE appointments SET status=?${extra}, updated_at=? WHERE id=?`).run(...args)
  D.logChange('appointments', id, 'update')
  if (status === 'cancelled') D.audit(user, 'appointment', 'ألغى موعدًا', id)
  return true
}

function apptReorder(user, day, ids) {
  guard(user, 'appt.reorder')
  const up = D.db.prepare('UPDATE appointments SET order_index=?, updated_at=? WHERE id=?')
  D.db.transaction(() => ids.forEach((id, i) => up.run(i + 1, T(), id)))()
  return true
}

function apptSetConfirm(user, id, confirm) {
  guard(user, 'appt.status')
  D.db.prepare('UPDATE appointments SET confirm=?, updated_at=? WHERE id=?').run(confirm, T(), id)
  if (confirm === 'اعتذر') apptStatus(user, id, 'cancelled')
  return true
}

function callsList(user, day) {
  const d = day || new Date(Date.now() + 864e5).toISOString().slice(0, 10)
  return D.db.prepare(`
    SELECT a.id,a.time,a.kind,a.confirm,p.name,p.phone,p.no_phone
    FROM appointments a JOIN patients p ON p.id=a.patient_id
    WHERE a.day=? AND a.status='scheduled' AND p.no_phone=0
    ORDER BY a.time`).all(d)
}

/* ═══════════════ الزيارات ═══════════════ */
function visitStart(user, patientId, apptId, kind) {
  guard(user, 'visit.start')
  const open = D.db.prepare("SELECT * FROM visits WHERE patient_id=? AND status='draft' ORDER BY started_at DESC LIMIT 1").get(patientId)
  if (open) return open
  const c = ensureCase(patientId)
  const id = D.uid()
  D.db.prepare(`INSERT INTO visits (id,patient_id,case_id,appointment_id,kind,status,started_at)
                VALUES (?,?,?,?,?,'draft',?)`)
    .run(id, patientId, c.id, apptId || null, kind || 'كشف', T())
  D.logChange('visits', id, 'insert')
  if (apptId) apptStatus(user, apptId, 'with_doctor')
  return D.db.prepare('SELECT * FROM visits WHERE id=?').get(id)
}

function visitSave(user, id, patch) {
  guard(user, 'visit.save')
  const cur = D.db.prepare('SELECT * FROM visits WHERE id=?').get(id)
  if (!cur) throw new Error('الزيارة غير موجودة')
  // تعديل زيارة مغلقة يحفظ النص الأصلي — حماية قانونية
  if (cur.status === 'closed' && !cur.edited_original) {
    const orig = JSON.stringify({ capture: cur.capture, complaint: cur.complaint, exam: cur.exam, diagnosis: cur.diagnosis, plan: cur.plan })
    D.db.prepare('UPDATE visits SET edited_original=?, edited_at=? WHERE id=?').run(orig, T(), id)
    D.audit(user, 'medical', 'عدّل زيارة مغلقة — حُفظ النص الأصلي', id)
  }
  const keys = ['capture', 'complaint', 'exam', 'diagnosis', 'plan', 'kind', 'short_type', 'struct', 'template']
  const f = [], v = []
  for (const k of keys) if (k in patch) { f.push(`${k}=?`); v.push(patch[k]) }
  if (!f.length) return cur
  v.push(id)
  D.db.prepare(`UPDATE visits SET ${f.join(',')} WHERE id=?`).run(...v)
  D.logChange('visits', id, 'update')
  return D.db.prepare('SELECT * FROM visits WHERE id=?').get(id)
}

function visitGet(user, id) {
  guard(user, 'visit.get')
  const v = D.db.prepare('SELECT * FROM visits WHERE id=?').get(id)
  if (!v) return null
  v.prescription = D.db.prepare('SELECT * FROM prescriptions WHERE visit_id=? ORDER BY created_at DESC LIMIT 1').get(id) || null
  return v
}

function visitOpenDraft(user) {
  guard(user, 'visit.get')
  return D.db.prepare(`SELECT v.*, p.name FROM visits v JOIN patients p ON p.id=v.patient_id
                       WHERE v.status='draft' ORDER BY v.started_at DESC`).all()
}

// هل المريض «من مرضاي»؟ (قرار ② — الضماد مجاني لمن أجريتُ له عملًا جراحيًا)
function isMyPatient(patientId) {
  const a = D.db.prepare(`SELECT COUNT(*) c FROM visits WHERE patient_id=? AND kind='إجراء' AND status='closed'`).get(patientId).c
  const b = D.db.prepare(`SELECT COUNT(*) c FROM surgeries WHERE patient_id=? AND status='done'`).get(patientId).c
  return (a + b) > 0
}

function visitClose(user, id, { amount, nextDays, rx }) {
  guard(user, 'visit.close')
  if (amount === null || amount === undefined || amount === '') throw new Error('المبلغ المستحق إلزامي — ولو كان صفرًا')
  const amt = Math.round(Number(amount))
  if (Number.isNaN(amt) || amt < 0) throw new Error('المبلغ غير صالح')
  const v = D.db.prepare('SELECT * FROM visits WHERE id=?').get(id)
  if (!v) throw new Error('الزيارة غير موجودة')

  D.db.transaction(() => {
    if (rx && rx.items && rx.items.length) rxSave(user, id, v.patient_id, rx)
    D.db.prepare("UPDATE visits SET status='closed', amount_due=?, next_days=?, closed_at=? WHERE id=?")
      .run(amt, nextDays || null, T(), id)
    D.logChange('visits', id, 'update')
    if (v.appointment_id) {
      D.db.prepare("UPDATE appointments SET status='done', updated_at=? WHERE id=?").run(T(), v.appointment_id)
      D.logChange('appointments', v.appointment_id, 'update')
    }
    if (nextDays) {
      const d = new Date(Date.now() + nextDays * 864e5).toISOString().slice(0, 10)
      apptCreate(user, v.patient_id, d, null, 'مراجعة')
    }
  })()
  D.audit(user, 'medical', `أنهى زيارة — المستحق ${amt.toLocaleString('en-US')}`, id)
  return visitGet(user, id)
}

// الزيارة القصيرة — نقرتان، بلا حقول (قرار ㉙)
function visitShort(user, patientId, shortType) {
  guard(user, 'visit.short')
  const covered = isMyPatient(patientId)
  const s = settingsGet()
  const amt = covered ? 0 : parseInt(s.price_dressing || '0', 10)
  const c = ensureCase(patientId)
  const id = D.uid()
  D.db.prepare(`INSERT INTO visits (id,patient_id,case_id,kind,short_type,status,amount_due,covered,started_at,closed_at)
                VALUES (?,?,?,'زيارة قصيرة',?,'closed',?,?,?,?)`)
    .run(id, patientId, c.id, shortType, amt, covered ? 1 : 0, T(), T())
  D.logChange('visits', id, 'insert')
  D.audit(user, 'medical', `زيارة قصيرة: ${shortType}${covered ? ' — مشمول' : ''}`, id)
  return { id, covered, amount: amt }
}

/* ═══════════════ الأدوية والوصفات ═══════════════ */
function drugsSearch(user, q) {
  guard(user, 'drugs.search')
  const s = (q || '').trim()
  if (!s) return D.db.prepare('SELECT * FROM drugs ORDER BY use_count DESC, name_ar LIMIT 20').all()
  const like = `%${s}%`
  return D.db.prepare('SELECT * FROM drugs WHERE name_ar LIKE ? OR name_lat LIKE ? ORDER BY use_count DESC LIMIT 20').all(like, like)
}
function drugUpsert(user, d) {
  guard(user, 'drugs.upsert')
  const ex = D.db.prepare('SELECT * FROM drugs WHERE name_ar=?').get(d.name_ar)
  if (ex) {
    D.db.prepare('UPDATE drugs SET name_lat=?,dose=?,print_mode=?,use_count=use_count+1 WHERE id=?')
      .run(d.name_lat || ex.name_lat, d.dose || ex.dose, d.print_mode || ex.print_mode, ex.id)
    return ex.id
  }
  const id = D.uid()
  D.db.prepare('INSERT INTO drugs (id,name_ar,name_lat,dose,print_mode,use_count,created_at) VALUES (?,?,?,?,?,1,?)')
    .run(id, d.name_ar, d.name_lat || null, d.dose || null, d.print_mode || 'both', T())
  D.logChange('drugs', id, 'insert')
  return id
}
function tplList(user) { guard(user, 'tpl.list'); return D.db.prepare('SELECT * FROM rx_templates ORDER BY use_count DESC, name').all() }
function tplSave(user, name, items) {
  guard(user, 'tpl.save')
  const id = D.uid()
  D.db.prepare('INSERT INTO rx_templates (id,name,items,created_at) VALUES (?,?,?,?)')
    .run(id, name, JSON.stringify(items), T())
  D.logChange('rx_templates', id, 'insert')
  return id
}
function rxSave(user, visitId, patientId, rx) {
  guard(user, 'rx.save')
  const id = D.uid()
  D.db.prepare('INSERT INTO prescriptions (id,visit_id,patient_id,items,notes,created_at) VALUES (?,?,?,?,?,?)')
    .run(id, visitId, patientId, JSON.stringify(rx.items || []), rx.notes || null, T())
  D.logChange('prescriptions', id, 'insert')
  for (const it of (rx.items || [])) if (it.name_ar) drugUpsert(user, it)
  return id
}

/* ═══════════════ المالية ═══════════════ */
function paidForVisit(visitId) {
  return D.db.prepare('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE visit_id=?').get(visitId).s
}
function waivedFor(patientId) {
  return D.db.prepare('SELECT COALESCE(SUM(amount),0) s FROM waivers WHERE patient_id=?').get(patientId).s
}
function patientBalance(patientId) {
  const f = financials(patientId)
  return f.balance
}
function financials(patientId) {
  const due = D.db.prepare("SELECT COALESCE(SUM(amount_due),0) s FROM visits WHERE patient_id=? AND status='closed'").get(patientId).s
  const paid = D.db.prepare('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE patient_id=?').get(patientId).s
  const waived = waivedFor(patientId)
  return { due, paid, waived, balance: due - paid - waived }
}

/* المسامحة على الدين — الطبيب حصرًا (قرار المرحلة 3) */
function waive(user, { patientId, amount, reason }) {
  guard(user, 'money.waive')
  const bal = patientBalance(patientId)
  if (bal <= 0) throw new Error('لا يوجد دين على هذا المريض')
  const amt = amount === undefined || amount === null || amount === ''
    ? bal : Math.round(Number(amount))
  if (Number.isNaN(amt) || amt <= 0) throw new Error('المبلغ غير صالح')
  if (amt > bal) throw new Error(`المبلغ أكبر من الدين (${bal.toLocaleString('en-US')})`)
  const id = D.uid()
  D.db.prepare('INSERT INTO waivers (id,patient_id,amount,reason,by_user,day,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, patientId, amt, reason || null, user.name, today(), T())
  D.logChange('waivers', id, 'insert')
  const p = D.db.prepare('SELECT name FROM patients WHERE id=?').get(patientId)
  D.audit(user, 'money', `سامح ${p?.name} بمبلغ ${amt.toLocaleString('en-US')}${amt === bal ? ' (الدين كاملًا)' : ' (جزئيًا)'}${reason ? ' — ' + reason : ''}`, id)
  noticePush('secretary', `${p?.name} — مسامحة`,
    `أعفى الطبيب ${amt.toLocaleString('en-US')} · لا تطالبي بهذا المبلغ`)
  return { id, amount: amt, remaining: bal - amt }
}
function waiverList(user, patientId) {
  if (patientId) return D.db.prepare('SELECT * FROM waivers WHERE patient_id=? ORDER BY created_at DESC').all(patientId)
  guard(user, 'money.waive')
  return D.db.prepare(`SELECT w.*, p.name, p.file_no FROM waivers w JOIN patients p ON p.id=w.patient_id
                       ORDER BY w.created_at DESC LIMIT 200`).all()
}
function waiverCancel(user, id) {
  guard(user, 'money.waive')
  const w = D.db.prepare('SELECT * FROM waivers WHERE id=?').get(id)
  if (!w) throw new Error('المسامحة غير موجودة')
  D.db.prepare('DELETE FROM waivers WHERE id=?').run(id)
  const p = D.db.prepare('SELECT name FROM patients WHERE id=?').get(w.patient_id)
  D.audit(user, 'money', `تراجع عن مسامحة ${p?.name} بمبلغ ${w.amount.toLocaleString('en-US')}`, id)
  return true
}

// القبض — السكرتيرة تقبض أي مبلغ بلا إذن + إشعار صامت (قرار ⑥)
function pay(user, { patientId, visitId, amount, paidBy, note }) {
  guard(user, 'money.pay')
  const amt = Math.round(Number(amount))
  if (Number.isNaN(amt) || amt <= 0) throw new Error('المبلغ غير صالح')
  const id = D.uid()
  let short = 0
  if (visitId) {
    const v = D.db.prepare('SELECT amount_due FROM visits WHERE id=?').get(visitId)
    const expected = (v?.amount_due || 0) - paidForVisit(visitId)
    if (amt < expected) short = expected - amt
  }
  D.db.prepare(`INSERT INTO payments (id,patient_id,visit_id,amount,kind,paid_by,by_user,note,day,reviewed,created_at)
                VALUES (?,?,?,?,'payment',?,?,?,?,?,?)`)
    .run(id, patientId, visitId || null, amt, paidBy || null, user.name, note || null, today(), short ? 0 : 1, T())
  D.logChange('payments', id, 'insert')

  const p = D.db.prepare('SELECT name FROM patients WHERE id=?').get(patientId)
  if (short > 0) {
    noticePush('doctor', `${p.name} — قبض ناقص`,
      `المستحق ${(amt + short).toLocaleString('en-US')} · قُبض ${amt.toLocaleString('en-US')} · الفرق ${short.toLocaleString('en-US')}`)
    D.audit(user, 'money', `قبضت ${amt.toLocaleString('en-US')} من ${p.name} (ناقص ${short.toLocaleString('en-US')})`, id)
  } else {
    D.audit(user, 'money', `قبضت ${amt.toLocaleString('en-US')} من ${p.name}`, id)
  }
  if (visitId) {
    const v2 = D.db.prepare('SELECT appointment_id FROM visits WHERE id=?').get(visitId)
    if (v2?.appointment_id) D.db.prepare("UPDATE appointments SET status='paid', updated_at=? WHERE id=?").run(T(), v2.appointment_id)
  }
  return { id, short }
}

function refund(user, { patientId, amount, note }) {
  guard(user, 'money.refund')
  const amt = Math.abs(Math.round(Number(amount)))
  const id = D.uid()
  D.db.prepare(`INSERT INTO payments (id,patient_id,amount,kind,by_user,note,day,reviewed,created_at)
                VALUES (?,?,?,'refund',?,?,?,1,?)`)
    .run(id, patientId, -amt, user.name, note || null, today(), T())
  D.logChange('payments', id, 'insert')
  D.audit(user, 'money', `استرجاع ${amt.toLocaleString('en-US')}`, id)
  return id
}

function debts(user) {
  const rows = D.db.prepare(`
    SELECT p.id,p.name,p.phone,p.file_no,
      (SELECT COALESCE(SUM(amount_due),0) FROM visits WHERE patient_id=p.id AND status='closed') due,
      (SELECT COALESCE(SUM(amount),0) FROM payments WHERE patient_id=p.id) paid,
      (SELECT COALESCE(SUM(amount),0) FROM waivers WHERE patient_id=p.id) waived,
      (SELECT MAX(closed_at) FROM visits WHERE patient_id=p.id AND status='closed') last_visit
    FROM patients p WHERE p.archived=0`).all()
  return rows.filter(r => r.due - r.paid - r.waived > 0)
    .map(r => ({ ...r, balance: r.due - r.paid - r.waived }))
    .sort((a, b) => (a.last_visit || '').localeCompare(b.last_visit || ''))
}

function cashDay(user, day) {
  const d = day || today()
  const rows = D.db.prepare(`
    SELECT pay.*, p.name FROM payments pay JOIN patients p ON p.id=pay.patient_id
    WHERE pay.day=? ORDER BY pay.created_at`).all(d)
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const closed = D.db.prepare('SELECT * FROM day_close WHERE day=?').get(d) || null
  return { day: d, rows, total, closed, count: new Set(rows.map(r => r.patient_id)).size }
}

function dayClose(user, { day, counted, note }) {
  guard(user, 'money.close')
  const d = day || today()
  const c = cashDay(user, d)
  const diff = Math.round(Number(counted)) - c.total
  if (diff !== 0 && !(note || '').trim()) throw new Error('يوجد فرق — الملاحظة إلزامية')
  D.db.prepare(`INSERT INTO day_close (day,system_total,cash_counted,diff,note,closed_by,closed_at)
                VALUES (?,?,?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET
                system_total=excluded.system_total,cash_counted=excluded.cash_counted,
                diff=excluded.diff,note=excluded.note,closed_by=excluded.closed_by,closed_at=excluded.closed_at`)
    .run(d, c.total, Math.round(Number(counted)), diff, note || null, user.name, T())
  D.logChange('day_close', d, 'insert')
  D.audit(user, 'money', `أقفلت يوم ${d} — النظام ${c.total.toLocaleString('en-US')} · النقد ${Number(counted).toLocaleString('en-US')} · الفرق ${diff}`)
  if (diff !== 0) noticePush('doctor', `فرق في إقفال ${d}`, `${diff > 0 ? 'زيادة' : 'نقص'} ${Math.abs(diff).toLocaleString('en-US')} · ${note}`)
  return true
}

function diffList(user) {
  guard(user, 'diff.list')
  return D.db.prepare(`
    SELECT pay.*, p.name, v.amount_due FROM payments pay
    JOIN patients p ON p.id=pay.patient_id
    LEFT JOIN visits v ON v.id=pay.visit_id
    WHERE pay.reviewed=0 ORDER BY pay.created_at DESC`).all()
}
function diffReview(user, ids) {
  guard(user, 'money.review')
  const up = D.db.prepare('UPDATE payments SET reviewed=1 WHERE id=?')
  D.db.transaction(() => ids.forEach(i => up.run(i)))()
  D.audit(user, 'money', `راجع ${ids.length} فرقًا ماليًا`)
  return true
}

/* ═══════════════ الإشعارات الصامتة ═══════════════ */
function noticePush(toRole, title, body) {
  const id = D.uid()
  D.db.prepare('INSERT INTO notices (id,to_role,title,body,created_at) VALUES (?,?,?,?,?)')
    .run(id, toRole, title, body || null, T())
  return id
}
function noticeList(user) {
  return D.db.prepare('SELECT * FROM notices WHERE to_role=? ORDER BY created_at DESC LIMIT 40').all(user.role)
}
function noticeSeen(user, ids) {
  const up = D.db.prepare('UPDATE notices SET seen=1 WHERE id=?')
  D.db.transaction(() => ids.forEach(i => up.run(i)))()
  return true
}

/* ═══════════════ الأسعار ═══════════════ */
function pricesList() { return D.db.prepare('SELECT * FROM prices ORDER BY label').all() }
function priceSet(user, { id, label, amount, kind }) {
  guard(user, 'price.set')
  if (id) { D.db.prepare('UPDATE prices SET label=?,amount=? WHERE id=?').run(label, Math.round(amount), id); return id }
  const nid = D.uid()
  D.db.prepare('INSERT INTO prices (id,label,amount,kind,created_at) VALUES (?,?,?,?,?)')
    .run(nid, label, Math.round(amount), kind || 'procedure', T())
  return nid
}
function priceDel(user, id) { guard(user, 'price.set'); D.db.prepare('DELETE FROM prices WHERE id=?').run(id); return true }

// اقتراح المبلغ عند الاختتام
function suggestAmount(user, patientId, kind) {
  const s = settingsGet()
  if (kind === 'زيارة قصيرة') return isMyPatient(patientId) ? 0 : +s.price_dressing
  const last = D.db.prepare(`SELECT amount_due FROM visits WHERE kind=? AND status='closed' AND amount_due IS NOT NULL
                             ORDER BY closed_at DESC LIMIT 1`).get(kind)
  if (last) return last.amount_due
  return kind === 'مراجعة' ? +s.price_review : +s.price_visit
}

/* ═══════════════ اقتراح التشخيص ═══════════════ */
function diagSuggest(user, q) {
  guard(user, 'visit.get')
  const s = (q || '').trim()
  if (s.length < 2) return []
  return D.db.prepare(`SELECT diagnosis d, COUNT(*) c FROM visits
                       WHERE diagnosis IS NOT NULL AND diagnosis!='' AND diagnosis LIKE ?
                       GROUP BY diagnosis ORDER BY c DESC LIMIT 6`).all(`%${s}%`).map(r => r.d)
}

/* ═══════════════ سجل الأحداث ═══════════════ */
function auditList(user, limit) {
  guard(user, 'audit.list')
  return D.db.prepare('SELECT * FROM audit ORDER BY at DESC LIMIT ?').all(limit || 200)
}

/* ═══════════════ الأعمال الجراحية ═══════════════ */
function surgeryCreate(user, d) {
  guard(user, 'surgery.write')
  if (!d.title || !d.title.trim()) throw new Error('اسم العمل الجراحي مطلوب')
  const c = ensureCase(d.patientId)
  const id = D.uid()
  D.db.prepare(`INSERT INTO surgeries (id,patient_id,case_id,visit_id,scope,title,status,planned_day,fee,anesthesia,notes,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, d.patientId, c.id, d.visitId || null, d.scope || 'major', d.title.trim(),
      d.status || 'planned', d.plannedDay || null,
      d.fee ? Math.round(d.fee) : null, d.anesthesia || null, d.notes || null, T(), T())
  D.logChange('surgeries', id, 'insert')
  D.audit(user, 'medical', `سجّل عملًا جراحيًا: ${d.title.trim()}`, id)
  return id
}
function surgeryUpdate(user, id, patch) {
  guard(user, 'surgery.write')
  const keys = ['title', 'scope', 'planned_day', 'fee', 'anesthesia', 'notes']
  const f = [], v = []
  for (const k of keys) if (k in patch) { f.push(`${k}=?`); v.push(patch[k]) }
  if (!f.length) return true
  f.push('updated_at=?'); v.push(T(), id)
  D.db.prepare(`UPDATE surgeries SET ${f.join(',')} WHERE id=?`).run(...v)
  D.logChange('surgeries', id, 'update')
  return true
}
function surgerySetStatus(user, id, status, note) {
  guard(user, 'surgery.write')
  const s = D.db.prepare('SELECT * FROM surgeries WHERE id=?').get(id)
  D.db.prepare('UPDATE surgeries SET status=?, done_at=?, cancel_note=?, updated_at=? WHERE id=?')
    .run(status, status === 'done' ? T() : null, status === 'cancelled' ? (note || null) : null, T(), id)
  D.logChange('surgeries', id, 'update')
  D.audit(user, 'medical', `${status === 'done' ? 'نفّذ' : 'ألغى'} عملًا جراحيًا: ${s?.title}`, id)
  return true
}
function surgeryList(user, patientId) {
  guard(user, 'surgery.read')
  return D.db.prepare('SELECT * FROM surgeries WHERE patient_id=? ORDER BY created_at DESC').all(patientId)
}
function surgeryAll(user, status) {
  guard(user, 'surgery.read')
  const q = status
    ? `SELECT s.*, p.name, p.file_no FROM surgeries s JOIN patients p ON p.id=s.patient_id WHERE s.status=? ORDER BY s.planned_day IS NULL DESC, s.planned_day`
    : `SELECT s.*, p.name, p.file_no FROM surgeries s JOIN patients p ON p.id=s.patient_id ORDER BY s.created_at DESC`
  return status ? D.db.prepare(q).all(status) : D.db.prepare(q).all()
}

/* ═══════════════ الطلبات الخارجية ═══════════════ */
function labCreate(user, d) {
  guard(user, 'lab.write')
  const items = (d.items || []).filter(Boolean)
  if (!items.length) throw new Error('اختر فحصًا واحدًا على الأقل')
  const id = D.uid()
  D.db.prepare('INSERT INTO lab_orders (id,patient_id,visit_id,items,diagnosis,note,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, d.patientId, d.visitId || null, JSON.stringify(items), d.diagnosis || null, d.note || null, T())
  D.logChange('lab_orders', id, 'insert')
  for (const t of items) {
    const ex = D.db.prepare('SELECT id FROM lab_tests WHERE name=?').get(t)
    if (ex) D.db.prepare('UPDATE lab_tests SET use_count=use_count+1 WHERE id=?').run(ex.id)
    else D.db.prepare('INSERT INTO lab_tests (id,name,use_count,created_at) VALUES (?,?,1,?)').run(D.uid(), t, T())
  }
  D.audit(user, 'medical', `طلب فحوص: ${items.join('، ')}`, id)
  return id
}
function labList(user, patientId) {
  const rows = D.db.prepare('SELECT * FROM lab_orders WHERE patient_id=? ORDER BY created_at DESC').all(patientId)
  if (user.role === 'doctor') return rows
  // السكرتيرة ترى وجود طلب معلّق فقط — لا محتواه
  return rows.map(r => ({ id: r.id, patient_id: r.patient_id, created_at: r.created_at, arrived_at: r.arrived_at, seen_at: r.seen_at }))
}
function labArrived(user, id) {                     // كلا الدورين (قرار ㉒)
  D.db.prepare('UPDATE lab_orders SET arrived_at=?, arrived_by=? WHERE id=?').run(T(), user.name, id)
  D.logChange('lab_orders', id, 'update')
  D.audit(user, 'medical', 'أشّر وصول أوراق فحوص', id)
  if (user.role === 'secretary') noticePush('doctor', 'وصلت نتيجة فحوص', 'مريض أحضر أوراقه — بانتظار مراجعتك')
  return true
}
function labSeen(user, id) {                        // الطبيب فقط — يُغلق المعلّق
  guard(user, 'lab.write')
  D.db.prepare('UPDATE lab_orders SET seen_at=? WHERE id=?').run(T(), id)
  D.logChange('lab_orders', id, 'update')
  D.audit(user, 'medical', 'راجع نتيجة فحوص', id)
  return true
}
function labTestsSearch(user, q) {
  guard(user, 'lab.write')
  const s = (q || '').trim()
  if (!s) return D.db.prepare('SELECT * FROM lab_tests ORDER BY use_count DESC LIMIT 20').all()
  return D.db.prepare('SELECT * FROM lab_tests WHERE name LIKE ? ORDER BY use_count DESC LIMIT 20').all(`%${s}%`)
}
function labTplList(user) { guard(user, 'lab.write'); return D.db.prepare('SELECT * FROM lab_templates ORDER BY use_count DESC').all() }
function labTplSave(user, name, items) {
  guard(user, 'lab.write')
  const id = D.uid()
  D.db.prepare('INSERT INTO lab_templates (id,name,items,created_at) VALUES (?,?,?,?)').run(id, name, JSON.stringify(items), T())
  return id
}

/* ═══════════════ المرفقات ═══════════════ */
function attachAdd(user, { patientId, visitId, fileName, dataUrl, caption }) {
  guard(user, 'attach.write')
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '')
  if (!m) throw new Error('ملف غير صالح')
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > 12 * 1024 * 1024) throw new Error('الملف كبير — الحد 12 ميغابايت')
  const dir = path.join(D.filesDir, patientId)
  fs.mkdirSync(dir, { recursive: true })
  const id = D.uid()
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || (m[1].includes('pdf') ? 'pdf' : 'jpg')
  const rel = path.join(patientId, `${id}.${ext}`)
  fs.writeFileSync(path.join(D.filesDir, rel), buf)
  D.db.prepare(`INSERT INTO attachments (id,patient_id,visit_id,kind,file_name,rel_path,caption,size_bytes,created_at)
                VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, patientId, visitId || null, ext === 'pdf' ? 'pdf' : 'image',
      fileName || `مرفق.${ext}`, rel, caption || null, buf.length, T())
  D.logChange('attachments', id, 'insert')
  D.audit(user, 'medical', 'أضاف مرفقًا', id)
  return id
}
function attachList(user, patientId) {
  guard(user, 'attach.read')
  return D.db.prepare('SELECT id,file_name,kind,caption,size_bytes,created_at FROM attachments WHERE patient_id=? ORDER BY created_at DESC').all(patientId)
}
function attachRead(user, id) {
  guard(user, 'attach.read')
  const a = D.db.prepare('SELECT * FROM attachments WHERE id=?').get(id)
  if (!a) throw new Error('المرفق غير موجود')
  const buf = fs.readFileSync(path.join(D.filesDir, a.rel_path))
  const mime = a.kind === 'pdf' ? 'application/pdf' : 'image/jpeg'
  return { ...a, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
}
function attachDelete(user, id) {
  guard(user, 'attach.write')
  const a = D.db.prepare('SELECT * FROM attachments WHERE id=?').get(id)
  if (a) { try { fs.unlinkSync(path.join(D.filesDir, a.rel_path)) } catch { } }
  D.db.prepare('DELETE FROM attachments WHERE id=?').run(id)
  D.audit(user, 'medical', 'حذف مرفقًا', id)
  return true
}

/* ═══════════════ المصروفات ═══════════════ */
function expenseAdd(user, d) {
  guard(user, 'expense.write')
  const amt = Math.round(Number(d.amount))
  if (!amt || amt <= 0) throw new Error('المبلغ غير صالح')
  if (!d.label) throw new Error('البند مطلوب')
  const id = D.uid()
  D.db.prepare('INSERT INTO expenses (id,label,amount,day,recurring,note,by_user,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, d.label, amt, d.day || today(), d.recurring ? 1 : 0, d.note || null, user.name, T())
  D.logChange('expenses', id, 'insert')
  D.audit(user, 'money', `مصروف: ${d.label} — ${amt.toLocaleString('en-US')}`, id)
  return id
}
function expenseList(user, month) {
  guard(user, 'expense.write')
  const m = month || today().slice(0, 7)
  return D.db.prepare('SELECT * FROM expenses WHERE day LIKE ? ORDER BY day DESC').all(m + '%')
}
function expenseDelete(user, id) {
  guard(user, 'expense.write')
  D.db.prepare('DELETE FROM expenses WHERE id=?').run(id)
  D.audit(user, 'money', 'حذف مصروفًا', id)
  return true
}

/* ═══════════════ القوائم القابلة للتخصيص ═══════════════ */
/* كل قائمة خيارات في البرنامج تُقرأ من هنا — القيم أدناه بداية فقط، والطبيب يضيف ويحذف */
const OPTION_LISTS = {
  visit_kinds:   { title: 'أنواع الزيارة', def: ['كشف', 'مراجعة', 'إجراء'] },
  short_types:   { title: 'أنواع الزيارة القصيرة', def: ['ضماد', 'نزع قطب', 'مراجعة سريعة'] },
  pmh:           { title: 'سوابق مرضية', def: ['سكري', 'ارتفاع ضغط', 'قلبية', 'ربو', 'كلوية', 'كبدية', 'تخثرية', 'لا يوجد'] },
  meds:          { title: 'أدوية حالية', def: ['مميعات', 'أسبرين', 'خافض ضغط', 'أنسولين', 'ستيروئيد', 'لا يوجد'] },
  social:        { title: 'عادات', def: ['تدخين', 'كحول', 'لا يوجد'] },
  pain_char:     { title: 'صفة الألم', def: ['ماغص', 'حارق', 'واخز', 'ثقل', 'شد', 'نابض'] },
  assoc:         { title: 'أعراض مرافقة', def: ['غثيان', 'إقياء', 'حرارة', 'إسهال', 'إمساك', 'قهم', 'نقص وزن', 'يرقان', 'انتفاخ'] },
  abd_signs:     { title: 'علامات البطن', def: ['ماكبرني', 'روفسينغ', 'ميرفي', 'صدمة الحرقفي', 'إيلام ارتدادي', 'دفاع عضلي', 'بطن خشبي'] },
  mass_cons:     { title: 'قوام الكتلة', def: ['طري', 'قاسٍ', 'مطاطي', 'متموج', 'صلب'] },
  mass_mob:      { title: 'حركية الكتلة', def: ['متحرك', 'ملتصق بالجلد', 'ملتصق بالعمق', 'ثابت'] },
  tenderness:    { title: 'الإيلام', def: ['مؤلم', 'غير مؤلم'] },
  wound_state:   { title: 'حالة الجرح', def: ['نظيف', 'احمرار', 'إفراز مصلي', 'إفراز قيحي', 'انفكاك', 'ملتهب', 'ملتئم'] },
  wound_edges:   { title: 'حواف الجرح', def: ['متقاربة', 'متباعدة', 'نخرية'] },
  wound_sutures: { title: 'القطب', def: ['سليمة', 'نُزعت كليًا', 'نُزعت جزئيًا', 'ذاتية الانحلال'] },
  wound_action:  { title: 'إجراء الجرح', def: ['تبديل ضماد', 'تنظيف', 'تصريف', 'نزع قطب'] },
  asa:           { title: 'تصنيف ASA', def: ['I', 'II', 'III', 'IV'] },
  preop_labs:    { title: 'تحاليل ما قبل العملية', def: ['تعداد دم', 'زمر', 'تخثر', 'وظائف كلية', 'وظائف كبد', 'سكر', 'تخطيط قلب', 'صدر شعاعي'] },
  anesth_consult:{ title: 'استشارة التخدير', def: ['تمت', 'مطلوبة', 'غير لازمة'] },
  consent:       { title: 'الموافقة المستنيرة', def: ['شُرحت ووُقّعت', 'مؤجلة'] },
  management:    { title: 'التدبير', def: ['علاج دوائي', 'مراقبة', 'إجراء بالعيادة', 'عمل جراحي', 'تحويل', 'إسعاف'] },
  anesthesia:    { title: 'نوع التخدير', def: ['موضعي', 'ناحي', 'عام', 'بلا'] },
  waive_reasons: { title: 'أسباب المسامحة', def: ['ظرف مادي', 'قريب أو صديق', 'مجاملة مهنية', 'مريض قديم'] },
  dose_presets:  { title: 'جرعات جاهزة', def: ['حبة مرتين يوميًا لمدة أسبوع', 'حبة ثلاث مرات يوميًا · ٥ أيام', 'حبة صباحًا على الريق', 'عند اللزوم'] },
  referral_src:  { title: 'جهات التحويل', def: [] },
  expense_kinds: { title: 'بنود المصاريف', def: [] }
}

function seedList(key) {
  const meta = OPTION_LISTS[key]
  if (!meta) return
  const n = D.db.prepare('SELECT COUNT(*) c FROM options WHERE list_key=?').get(key).c
  if (n > 0 || !meta.def.length) return
  const ins = D.db.prepare('INSERT OR IGNORE INTO options (id,list_key,value,sort,use_count,created_at) VALUES (?,?,?,?,0,?)')
  D.db.transaction(() => meta.def.forEach((v, i) => ins.run(D.uid(), key, v, i, T())))()
}

/** يعيد خريطة: { list_key: [قيم] } — تُستدعى مرة واحدة عند فتح المحرر */
function optionsAll(user, keys) {
  const list = (keys && keys.length) ? keys : Object.keys(OPTION_LISTS)
  const out = {}
  for (const k of list) {
    seedList(k)
    out[k] = D.db.prepare('SELECT id,value,use_count FROM options WHERE list_key=? ORDER BY sort, value').all(k)
  }
  return out
}
function optionsMeta(user) {
  guard(user, 'options.write')
  return Object.entries(OPTION_LISTS).map(([k, m]) => {
    seedList(k)
    return {
      key: k, title: m.title,
      count: D.db.prepare('SELECT COUNT(*) c FROM options WHERE list_key=?').get(k).c
    }
  })
}
function optionAdd(user, listKey, value) {
  guard(user, 'options.write')
  const v = (value || '').trim()
  if (!v) throw new Error('القيمة مطلوبة')
  const ex = D.db.prepare('SELECT id FROM options WHERE list_key=? AND value=?').get(listKey, v)
  if (ex) return ex.id
  const max = D.db.prepare('SELECT COALESCE(MAX(sort),0) m FROM options WHERE list_key=?').get(listKey).m
  const id = D.uid()
  D.db.prepare('INSERT INTO options (id,list_key,value,sort,use_count,created_at) VALUES (?,?,?,?,0,?)')
    .run(id, listKey, v, max + 1, T())
  D.logChange('options', id, 'insert')
  D.audit(user, 'system', `أضاف خيارًا: ${v} (${OPTION_LISTS[listKey]?.title || listKey})`, id)
  return id
}
function optionDelete(user, id) {
  guard(user, 'options.write')
  const o = D.db.prepare('SELECT * FROM options WHERE id=?').get(id)
  D.db.prepare('DELETE FROM options WHERE id=?').run(id)
  D.audit(user, 'system', `حذف خيارًا: ${o?.value}`, id)
  return true
}
function optionUse(user, listKey, value) {
  D.db.prepare('UPDATE options SET use_count=use_count+1 WHERE list_key=? AND value=?').run(listKey, value)
  return true
}

/* ═══════════════ حقول يعرّفها الطبيب ═══════════════ */
function customFields(user, scope) {
  return D.db.prepare('SELECT * FROM custom_fields WHERE scope=? ORDER BY sort, created_at').all(scope || 'visit')
}
function customFieldAdd(user, d) {
  guard(user, 'options.write')
  if (!d.label || !d.label.trim()) throw new Error('اسم الحقل مطلوب')
  const id = D.uid()
  const max = D.db.prepare('SELECT COALESCE(MAX(sort),0) m FROM custom_fields WHERE scope=?').get(d.scope || 'visit').m
  let listKey = d.list_key || null
  if (d.type === 'chips' && !listKey) {
    listKey = 'custom_' + id.slice(0, 8)
    for (const v of (d.options || [])) optionAdd(user, listKey, v)
  }
  D.db.prepare(`INSERT INTO custom_fields (id,scope,label,type,list_key,unit,sort,created_at)
                VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, d.scope || 'visit', d.label.trim(), d.type || 'text', listKey, d.unit || null, max + 1, T())
  D.logChange('custom_fields', id, 'insert')
  D.audit(user, 'system', `أضاف حقلًا مخصصًا: ${d.label.trim()}`, id)
  return id
}
function customFieldDelete(user, id) {
  guard(user, 'options.write')
  const f = D.db.prepare('SELECT * FROM custom_fields WHERE id=?').get(id)
  if (f?.list_key?.startsWith('custom_')) D.db.prepare('DELETE FROM options WHERE list_key=?').run(f.list_key)
  D.db.prepare('DELETE FROM custom_fields WHERE id=?').run(id)
  D.audit(user, 'system', `حذف حقلًا مخصصًا: ${f?.label}`, id)
  return true
}

/* ═══════════════ بنود المصاريف — يضيفها الطبيب ═══════════════ */
const DEFAULT_EXPENSE_LABELS = ['إيجار', 'كهرباء', 'ماء', 'إنترنت', 'راتب السكرتيرة',
  'مستلزمات طبية', 'أدوية', 'صيانة', 'تنظيف', 'ضرائب ورسوم']

function expenseLabels(user) {
  guard(user, 'expense.write')
  let rows = D.db.prepare('SELECT * FROM expense_labels ORDER BY use_count DESC, name').all()
  if (rows.length === 0) {
    const ins = D.db.prepare('INSERT OR IGNORE INTO expense_labels (id,name,use_count,created_at) VALUES (?,?,0,?)')
    D.db.transaction(() => DEFAULT_EXPENSE_LABELS.forEach(n => ins.run(D.uid(), n, T())))()
    rows = D.db.prepare('SELECT * FROM expense_labels ORDER BY use_count DESC, name').all()
  }
  return rows
}
function expenseLabelAdd(user, name) {
  guard(user, 'expense.write')
  const n = (name || '').trim()
  if (!n) throw new Error('اسم البند مطلوب')
  const ex = D.db.prepare('SELECT id FROM expense_labels WHERE name=?').get(n)
  if (ex) return ex.id
  const id = D.uid()
  D.db.prepare('INSERT INTO expense_labels (id,name,use_count,created_at) VALUES (?,?,0,?)').run(id, n, T())
  D.logChange('expense_labels', id, 'insert')
  D.audit(user, 'system', `أضاف بند مصروف: ${n}`, id)
  return id
}
function expenseLabelDelete(user, id) {
  guard(user, 'expense.write')
  const l = D.db.prepare('SELECT * FROM expense_labels WHERE id=?').get(id)
  D.db.prepare('DELETE FROM expense_labels WHERE id=?').run(id)
  D.audit(user, 'system', `حذف بند مصروف: ${l?.name}`, id)
  return true
}

/* ═══════════════ الحذف — الطبيب حصرًا · كل محذوف يُحفظ في السلة ═══════════════ */
function toTrash(user, tbl, row, label) {
  D.db.prepare('INSERT INTO trash (id,tbl,row_id,label,snapshot,by_user,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(D.uid(), tbl, row.id || row.day || '—', label, JSON.stringify(row), user.name, T())
}

function visitDelete(user, id) {
  guard(user, 'delete')
  const v = D.db.prepare('SELECT * FROM visits WHERE id=?').get(id)
  if (!v) throw new Error('الزيارة غير موجودة')
  const pays = D.db.prepare('SELECT COUNT(*) c FROM payments WHERE visit_id=?').get(id).c
  if (pays > 0) throw new Error(`لا يمكن حذف الزيارة — عليها ${pays} دفعة. احذف الدفعات أولًا`)
  const p = D.db.prepare('SELECT name FROM patients WHERE id=?').get(v.patient_id)
  D.db.transaction(() => {
    toTrash(user, 'visits', v, `زيارة ${p?.name} — ${v.kind} — ${(v.closed_at || v.started_at || '').slice(0, 10)}`)
    D.db.prepare('DELETE FROM prescriptions WHERE visit_id=?').run(id)
    D.db.prepare('UPDATE lab_orders SET visit_id=NULL WHERE visit_id=?').run(id)
    D.db.prepare('UPDATE surgeries SET visit_id=NULL WHERE visit_id=?').run(id)
    D.db.prepare('UPDATE attachments SET visit_id=NULL WHERE visit_id=?').run(id)
    D.db.prepare('DELETE FROM visits WHERE id=?').run(id)
  })()
  D.logChange('visits', id, 'delete')
  D.audit(user, 'medical', `حذف زيارة: ${p?.name} — ${v.kind}`, id)
  return true
}

function paymentDelete(user, id) {
  guard(user, 'delete')
  const r = D.db.prepare('SELECT * FROM payments WHERE id=?').get(id)
  if (!r) throw new Error('الدفعة غير موجودة')
  const day = D.db.prepare('SELECT * FROM day_close WHERE day=?').get(r.day)
  if (day) throw new Error('اليوم مُقفل — لا يمكن حذف دفعة منه')
  const p = D.db.prepare('SELECT name FROM patients WHERE id=?').get(r.patient_id)
  toTrash(user, 'payments', r, `دفعة ${p?.name} — ${r.amount.toLocaleString('en-US')}`)
  D.db.prepare('DELETE FROM payments WHERE id=?').run(id)
  D.logChange('payments', id, 'delete')
  D.audit(user, 'money', `حذف دفعة: ${p?.name} — ${r.amount.toLocaleString('en-US')}`, id)
  return true
}

function surgeryDelete(user, id) {
  guard(user, 'delete')
  const r = D.db.prepare('SELECT * FROM surgeries WHERE id=?').get(id)
  if (!r) throw new Error('غير موجود')
  toTrash(user, 'surgeries', r, `عمل جراحي — ${r.title}`)
  D.db.prepare('DELETE FROM surgeries WHERE id=?').run(id)
  D.logChange('surgeries', id, 'delete')
  D.audit(user, 'medical', `حذف عملًا جراحيًا: ${r.title}`, id)
  return true
}

function labDelete(user, id) {
  guard(user, 'delete')
  const r = D.db.prepare('SELECT * FROM lab_orders WHERE id=?').get(id)
  if (!r) throw new Error('غير موجود')
  toTrash(user, 'lab_orders', r, 'طلب فحوص')
  D.db.prepare('DELETE FROM lab_orders WHERE id=?').run(id)
  D.logChange('lab_orders', id, 'delete')
  D.audit(user, 'medical', 'حذف طلب فحوص', id)
  return true
}

function apptDelete(user, id) {
  guard(user, 'delete')
  const r = D.db.prepare('SELECT * FROM appointments WHERE id=?').get(id)
  if (!r) throw new Error('غير موجود')
  toTrash(user, 'appointments', r, `موعد ${r.day} ${r.time || ''}`)
  D.db.prepare('DELETE FROM appointments WHERE id=?').run(id)
  D.logChange('appointments', id, 'delete')
  D.audit(user, 'appointment', 'حذف موعدًا', id)
  return true
}

/** أرشفة المريض — قابلة للاسترجاع */
function patientArchive(user, id) {
  guard(user, 'delete')
  const p = D.db.prepare('SELECT * FROM patients WHERE id=?').get(id)
  if (!p) throw new Error('المريض غير موجود')
  D.db.prepare('UPDATE patients SET archived=1, updated_at=? WHERE id=?').run(T(), id)
  D.logChange('patients', id, 'update')
  D.audit(user, 'system', `أرشف مريضًا: ${p.name} (${p.file_no})`, id)
  return true
}
function patientRestore(user, id) {
  guard(user, 'delete')
  const p = D.db.prepare('SELECT * FROM patients WHERE id=?').get(id)
  D.db.prepare('UPDATE patients SET archived=0, updated_at=? WHERE id=?').run(T(), id)
  D.audit(user, 'system', `استرجع مريضًا: ${p?.name}`, id)
  return true
}
function archivedList(user) {
  guard(user, 'delete')
  return D.db.prepare('SELECT id,file_no,name,phone,updated_at FROM patients WHERE archived=1 ORDER BY updated_at DESC').all()
}

/** الحذف النهائي للمريض — يمحو كل ما يخصه */
function patientDelete(user, id, confirmName) {
  guard(user, 'delete')
  const p = D.db.prepare('SELECT * FROM patients WHERE id=?').get(id)
  if (!p) throw new Error('المريض غير موجود')
  if ((confirmName || '').trim() !== p.name.trim())
    throw new Error('اكتب اسم المريض كما هو للتأكيد')
  const counts = {
    visits: D.db.prepare('SELECT COUNT(*) c FROM visits WHERE patient_id=?').get(id).c,
    payments: D.db.prepare('SELECT COUNT(*) c FROM payments WHERE patient_id=?').get(id).c,
    surgeries: D.db.prepare('SELECT COUNT(*) c FROM surgeries WHERE patient_id=?').get(id).c
  }
  const atts = D.db.prepare('SELECT * FROM attachments WHERE patient_id=?').all(id)
  D.db.transaction(() => {
    toTrash(user, 'patients', { ...p, counts }, `مريض ${p.name} (ملف ${p.file_no}) — ${counts.visits} زيارة · ${counts.payments} دفعة`)
    for (const t of ['prescriptions', 'lab_orders', 'attachments', 'surgeries',
      'payments', 'waivers', 'visits', 'appointments', 'cases'])
      D.db.prepare(`DELETE FROM ${t} WHERE patient_id=?`).run(id)
    D.db.prepare('DELETE FROM patients WHERE id=?').run(id)
  })()
  for (const a of atts) { try { fs.unlinkSync(path.join(D.filesDir, a.rel_path)) } catch { } }
  D.logChange('patients', id, 'delete')
  D.audit(user, 'system', `حذف نهائيًا مريضًا: ${p.name} (${p.file_no}) — ${counts.visits} زيارة · ${counts.payments} دفعة`, id)
  return true
}

function trashList(user, limit) {
  guard(user, 'delete')
  return D.db.prepare('SELECT id,tbl,label,by_user,created_at FROM trash ORDER BY created_at DESC LIMIT ?')
    .all(limit || 100)
}

/* ═══════════════ قائمة الانتظار ═══════════════ */
function waitAdd(user, d) {
  guard(user, 'wait.write')
  if (!d.name) throw new Error('الاسم مطلوب')
  const id = D.uid()
  D.db.prepare('INSERT INTO waitlist (id,name,phone,note,patient_id,created_at) VALUES (?,?,?,?,?,?)')
    .run(id, d.name, d.phone || null, d.note || null, d.patientId || null, T())
  return id
}
function waitList(user) { return D.db.prepare('SELECT * FROM waitlist ORDER BY created_at').all() }
function waitDelete(user, id) { guard(user, 'wait.write'); D.db.prepare('DELETE FROM waitlist WHERE id=?').run(id); return true }

/* ═══════════════ التأجيل ═══════════════ */
function snooze(user, key, days) {
  guard(user, 'snooze')
  const until = new Date(Date.now() + days * 864e5).toISOString()
  const ex = D.db.prepare('SELECT * FROM snoozes WHERE key=?').get(key)
  if (ex) D.db.prepare('UPDATE snoozes SET until=?, times=times+1 WHERE key=?').run(until, key)
  else D.db.prepare('INSERT INTO snoozes (key,until,times,created_at) VALUES (?,?,1,?)').run(key, until, T())
  return true
}
function snoozeMap() {
  const rows = D.db.prepare('SELECT * FROM snoozes').all()
  const m = {}
  for (const r of rows) m[r.key] = r
  return m
}

/* ═══════════════ المعلّقات — المجمِّع الكامل ═══════════════ */
function pendingAll(user) {
  guard(user, 'pending.read')
  const s = settingsGet()
  const idleDays = parseInt(s.idle_case_days || '30', 10)
  const sn = snoozeMap()
  const now = Date.now()
  const active = (key) => !sn[key] || new Date(sn[key].until).getTime() <= now
  const snInfo = (key) => sn[key] ? { snoozed: true, times: sn[key].times } : {}
  const age = iso => iso ? Math.floor((now - new Date(iso).getTime()) / 864e5) : 0
  const out = []

  // 1) طلبات خارجية لم تُراجَع
  for (const r of D.db.prepare(`SELECT l.*, p.name FROM lab_orders l JOIN patients p ON p.id=l.patient_id
                                WHERE l.seen_at IS NULL`).all()) {
    const key = 'lab:' + r.id
    if (!active(key)) continue
    const d = age(r.created_at)
    out.push({
      key, type: 'lab', patient_id: r.patient_id, title: `${r.name} — ${r.arrived_at ? 'وصلت النتيجة ولم تُراجَع' : 'طلب فحوص'}`,
      sub: r.arrived_at ? `أحضرها ${r.arrived_by}` : `منذ ${d} يومًا`,
      days: d, urgent: !r.arrived_at && d >= 14, fresh: !!r.arrived_at, refId: r.id, ...snInfo(key)
    })
  }
  // 2) أعمال جراحية مقررة
  for (const r of D.db.prepare(`SELECT s.*, p.name FROM surgeries s JOIN patients p ON p.id=s.patient_id
                                WHERE s.status='planned'`).all()) {
    const key = 'surg:' + r.id
    if (!active(key)) continue
    const d = age(r.created_at)
    out.push({
      key, type: 'surgery', patient_id: r.patient_id,
      title: `${r.name} — ${r.title}`,
      sub: r.planned_day ? `مقررة ${r.planned_day}` : `بلا موعد · منذ ${d} يومًا`,
      days: d, urgent: !r.planned_day && d >= 14, refId: r.id, ...snInfo(key)
    })
  }
  // 3) مسودات غير مكتملة
  for (const r of D.db.prepare(`SELECT v.*, p.name FROM visits v JOIN patients p ON p.id=v.patient_id
                                WHERE v.status='draft'`).all()) {
    const key = 'draft:' + r.id
    if (!active(key)) continue
    const d = age(r.started_at)
    if (d < 1) continue                      // مسودة اليوم ليست معلّقة
    out.push({
      key, type: 'draft', patient_id: r.patient_id, title: `${r.name} — زيارة غير مكتملة`,
      sub: `مسودة منذ ${d} يومًا`, days: d, urgent: d >= 3, refId: r.id, ...snInfo(key)
    })
  }
  // 4) ديون
  for (const r of debts(user)) {
    const key = 'debt:' + r.id
    if (!active(key)) continue
    const d = age(r.last_visit)
    if (d < 7) continue
    out.push({
      key, type: 'debt', patient_id: r.id, title: `${r.name} — دين ${r.balance.toLocaleString('en-US')}`,
      sub: `منذ ${d} يومًا`, days: d, urgent: d >= 30, refId: r.id, ...snInfo(key)
    })
  }
  // 5) حالات خاملة
  for (const r of D.db.prepare(`SELECT c.*, p.name,
      (SELECT MAX(started_at) FROM visits WHERE case_id=c.id) last_v
      FROM cases c JOIN patients p ON p.id=c.patient_id WHERE c.status='open'`).all()) {
    const key = 'case:' + r.id
    if (!active(key)) continue
    const d = age(r.last_v || r.opened_at)
    if (d < idleDays) continue
    out.push({
      key, type: 'case', patient_id: r.patient_id, title: `${r.name} — حالة بلا حراك`,
      sub: `${r.title || 'حالة مفتوحة'} · منذ ${d} يومًا`, days: d, urgent: d >= idleDays * 2, refId: r.id, ...snInfo(key)
    })
  }
  // 6) فروقات مالية
  const diffs = D.db.prepare('SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM payments WHERE reviewed=0').get()

  out.sort((a, b) => (b.urgent - a.urgent) || (b.days - a.days))
  const snoozedCount = D.db.prepare('SELECT COUNT(*) c FROM snoozes WHERE until > ?').get(new Date().toISOString()).c
  return { items: out, diffs: diffs.c, snoozed: snoozedCount }
}

/* ═══════════════ التقويم ═══════════════ */
function calendar(user, from, to) {
  return D.db.prepare(`SELECT a.*, p.name, p.file_no FROM appointments a JOIN patients p ON p.id=a.patient_id
                       WHERE a.day BETWEEN ? AND ? AND a.status!='cancelled' ORDER BY a.day, a.time`).all(from, to)
}
function apptMove(user, id, day, time) {
  guard(user, 'appt.create')
  D.db.prepare('UPDATE appointments SET day=?, time=?, updated_at=? WHERE id=?').run(day, time || null, T(), id)
  D.logChange('appointments', id, 'update')
  D.audit(user, 'appointment', `نقل موعدًا إلى ${day} ${time || ''}`, id)
  return true
}
function surgeryDays(user, from, to) {
  return D.db.prepare(`SELECT s.planned_day day, COUNT(*) c FROM surgeries s
                       WHERE s.status='planned' AND s.planned_day BETWEEN ? AND ? GROUP BY s.planned_day`).all(from, to)
}

/* ═══════════════ دمج ملفين ═══════════════ */
function patientMerge(user, keepId, mergeId) {
  guard(user, 'patient.merge')
  if (keepId === mergeId) throw new Error('لا يمكن دمج ملف مع نفسه')
  const keep = D.db.prepare('SELECT * FROM patients WHERE id=?').get(keepId)
  const gone = D.db.prepare('SELECT * FROM patients WHERE id=?').get(mergeId)
  if (!keep || !gone) throw new Error('أحد الملفين غير موجود')
  D.db.transaction(() => {
    for (const t of ['visits', 'cases', 'appointments', 'payments', 'surgeries', 'lab_orders', 'attachments', 'prescriptions'])
      D.db.prepare(`UPDATE ${t} SET patient_id=? WHERE patient_id=?`).run(keepId, mergeId)
    D.db.prepare('UPDATE patients SET archived=1, merged_into=?, updated_at=? WHERE id=?').run(keepId, T(), mergeId)
  })()
  D.logChange('patients', mergeId, 'update')
  D.audit(user, 'system', `دمج الملف ${gone.file_no} في ${keep.file_no}`, keepId)
  return true
}

/* ═══════════════ التقارير ═══════════════ */
function reportIncome(user, months) {
  guard(user, 'reports.get')
  const n = months || 12
  const rows = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    const m = d.toISOString().slice(0, 7)
    const inc = D.db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE day LIKE ?").get(m + '%').s
    const exp = D.db.prepare("SELECT COALESCE(SUM(amount),0) s FROM expenses WHERE day LIKE ?").get(m + '%').s
    const pts = D.db.prepare("SELECT COUNT(DISTINCT patient_id) c FROM visits WHERE status='closed' AND closed_at LIKE ?").get(m + '%').c
    const nw = D.db.prepare("SELECT COUNT(*) c FROM patients WHERE created_at LIKE ?").get(m + '%').c
    rows.push({ month: m, income: inc, expense: exp, profit: inc - exp, patients: pts, newPatients: nw })
  }
  return rows
}
function reportPatterns(user) {
  guard(user, 'reports.get')
  const diag = D.db.prepare(`SELECT diagnosis d, COUNT(*) c FROM visits
    WHERE diagnosis IS NOT NULL AND diagnosis!='' GROUP BY diagnosis ORDER BY c DESC LIMIT 15`).all()
  const surg = D.db.prepare(`SELECT title t, COUNT(*) c,
    SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) done FROM surgeries GROUP BY title ORDER BY c DESC LIMIT 15`).all()
  const ages = D.db.prepare(`SELECT
    SUM(CASE WHEN age<18 THEN 1 ELSE 0 END) a1,
    SUM(CASE WHEN age BETWEEN 18 AND 39 THEN 1 ELSE 0 END) a2,
    SUM(CASE WHEN age BETWEEN 40 AND 59 THEN 1 ELSE 0 END) a3,
    SUM(CASE WHEN age>=60 THEN 1 ELSE 0 END) a4,
    SUM(CASE WHEN age IS NULL THEN 1 ELSE 0 END) a0 FROM patients WHERE archived=0`).get()
  const kinds = D.db.prepare(`SELECT kind k, COUNT(*) c FROM visits WHERE status='closed' GROUP BY kind ORDER BY c DESC`).all()
  return { diag, surg, ages, kinds }
}
function diagMerge(user, from, to) {
  guard(user, 'reports.get')
  const n = D.db.prepare('UPDATE visits SET diagnosis=? WHERE diagnosis=?').run(to, from).changes
  D.audit(user, 'medical', `دمج تشخيص «${from}» في «${to}» — ${n} زيارة`)
  return n
}

/* ═══════════════ النسخ الاحتياطي ═══════════════ */
function backupNow(user, destDir) {
  guard(user, 'backup')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = destDir || D.backupDir
  fs.mkdirSync(dir, { recursive: true })
  const target = path.join(dir, `vitalis-${stamp}.db`)
  D.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  fs.copyFileSync(D.dbFile, target)
  // الاحتفاظ بآخر 30 نسخة
  const files = fs.readdirSync(dir).filter(f => f.startsWith('vitalis-') && f.endsWith('.db')).sort()
  while (files.length > 30) { try { fs.unlinkSync(path.join(dir, files.shift())) } catch { } }
  settingsSetInternal('last_backup', T())
  D.audit(user, 'system', 'أنشأ نسخة احتياطية')
  return { file: target, size: fs.statSync(target).size }
}
function settingsSetInternal(k, v) {
  D.db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v))
}
function backupStatus(user) {
  const s = settingsGet()
  return { last: s.last_backup || null, dir: D.backupDir, dataDir: D.dataDir }
}

module.exports = {
  settingsGet, settingsSet, usersList, login, unlock, setPass,
  patientCreate, patientUpdate, patientGet, patientSearch, patientFile, patientMerge,
  caseNew,
  apptDay, apptCreate, apptStatus, apptReorder, apptSetConfirm, callsList, calendar, apptMove, surgeryDays,
  visitStart, visitSave, visitGet, visitClose, visitShort, visitOpenDraft,
  drugsSearch, drugUpsert, tplList, tplSave, rxSave,
  surgeryCreate, surgeryUpdate, surgerySetStatus, surgeryList, surgeryAll,
  labCreate, labList, labArrived, labSeen, labTestsSearch, labTplList, labTplSave,
  attachAdd, attachList, attachRead, attachDelete,
  expenseAdd, expenseList, expenseDelete,
  expenseLabels, expenseLabelAdd, expenseLabelDelete,
  optionsAll, optionsMeta, optionAdd, optionDelete, optionUse,
  customFields, customFieldAdd, customFieldDelete,
  visitDelete, paymentDelete, surgeryDelete, labDelete, apptDelete,
  patientArchive, patientRestore, patientDelete, archivedList, trashList,
  waitAdd, waitList, waitDelete,
  snooze, pendingAll,
  pay, refund, debts, cashDay, dayClose, diffList, diffReview, patientBalance,
  waive, waiverList, waiverCancel,
  noticeList, noticeSeen,
  pricesList, priceSet, priceDel, suggestAmount, diagSuggest, auditList,
  reportIncome, reportPatterns, diagMerge,
  backupNow, backupStatus,
  today
}
