import React, { useState, useEffect, useCallback } from 'react'
import { call, AR_MONTHS, AR_DAYS, todayISO } from '../lib/api'
import { Sheet, Empty } from '../components/UI'
import Search from '../components/Search'

const iso = d => d.toISOString().slice(0, 10)
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

export default function Calendar({ user, onOpenPatient, refreshKey }) {
  const [start, setStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d })
  const [rows, setRows] = useState([])
  const [surg, setSurg] = useState([])
  const [slot, setSlot] = useState(null)
  const [pick, setPick] = useState(null)
  const [wait, setWait] = useState([])
  const [freed, setFreed] = useState(null)
  const [settings, setSettings] = useState({})

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const from = iso(days[0]), to = iso(days[6])

  const load = useCallback(async () => {
    try {
      const [r, s, w, st] = await Promise.all([
        call('calendar', from, to), call('surgeryDays', from, to),
        call('waitList'), call('settingsGet')
      ])
      setRows(r); setSurg(s); setWait(w); setSettings(st)
    } catch { }
  }, [from, to])
  useEffect(() => { load() }, [load, refreshKey])

  const startH = parseInt((settings.work_start || '09:00').slice(0, 2), 10)
  const endH = parseInt((settings.work_end || '14:00').slice(0, 2), 10)
  const slots = []
  for (let h = startH; h < endH; h++) { slots.push(`${String(h).padStart(2, '0')}:00`); slots.push(`${String(h).padStart(2, '0')}:30`) }

  const at = (day, time) => rows.find(r => r.day === day && (r.time || '').slice(0, 5) === time)
  const surgOn = day => surg.find(s => s.day === day)

  async function book(patientId) {
    await call('apptCreate', patientId, slot.day, slot.time, 'كشف')
    setSlot(null); setPick(null); load()
  }
  async function cancel(id, day, time) {
    await call('apptStatus', id, 'cancelled')
    setSlot(null); load()
    if (wait.length) setFreed({ day, time })
  }

  return (
    <div className="main">
      <div className="row-flex wrap">
        <div>
          <div className="h1">التقويم</div>
          <div className="sub">
            {days[0].getDate()} — {days[6].getDate()} {AR_MONTHS[days[6].getMonth()]} {days[6].getFullYear()}
          </div>
        </div>
        <span className="grow" />
        <button className="btn quiet sm" onClick={() => setStart(addDays(start, -7))}>← الأسبوع السابق</button>
        <button className="btn quiet sm" onClick={() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); setStart(d) }}>هذا الأسبوع</button>
        <button className="btn quiet sm" onClick={() => setStart(addDays(start, 7))}>الأسبوع القادم →</button>
      </div>

      <div className="card mt16" style={{ padding: 0, overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(7,minmax(120px,1fr))`, minWidth: 900 }}>
          <div style={{ borderBottom: '1px solid var(--sep)' }} />
          {days.map(d => {
            const k = iso(d), isToday = k === todayISO()
            return (
              <div key={k} style={{
                padding: '10px 6px', textAlign: 'center', borderBottom: '1px solid var(--sep)',
                borderInlineStart: '1px solid var(--sep)',
                background: isToday ? 'var(--b50)' : 'transparent'
              }}>
                <div style={{ fontSize: 12.5, color: isToday ? 'var(--b600)' : 'var(--tx2)' }}>{AR_DAYS[d.getDay()]}</div>
                <div className="num" style={{ fontWeight: 600, color: isToday ? 'var(--b600)' : 'inherit' }}>{d.getDate()}</div>
                {surgOn(k) && <div className="bd bd-a" style={{ marginTop: 3, fontSize: 10 }}>🔪 عملية</div>}
              </div>)
          })}

          {slots.map(t => (
            <React.Fragment key={t}>
              <div className="num" style={{ padding: '7px 5px', fontSize: 11.5, color: 'var(--tx3)', textAlign: 'center' }}>{t}</div>
              {days.map(d => {
                const k = iso(d), a = at(k, t)
                return (
                  <div key={k + t}
                    onClick={() => setSlot({ day: k, time: t, appt: a })}
                    style={{
                      padding: '6px 7px', minHeight: 34, cursor: 'pointer',
                      borderInlineStart: '1px solid var(--sep)', borderBottom: '1px solid var(--sep)',
                      background: a ? 'var(--b50)' : 'transparent', fontSize: 12.5,
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'
                    }}>
                    {a ? <span style={{ color: 'var(--b600)', fontWeight: 500 }}>{a.name}</span>
                      : <span style={{ color: 'var(--tx3)' }}>▫</span>}
                  </div>)
              })}
            </React.Fragment>))}
        </div>
      </div>

      <div className="tiny mt12">انقر على أي خانة للحجز أو التعديل · الخانات الزرقاء محجوزة</div>

      {/* ═══ خانة ═══ */}
      {slot &&
        <Sheet center
          title={slot.appt ? slot.appt.name : 'حجز موعد'}
          subtitle={`${slot.day} · ${slot.time}`}
          onClose={() => setSlot(null)}>
          <div style={{ padding: '0 20px 18px' }}>
            {slot.appt ? <>
              <div className="row"><div className="grow"><div className="rt">نوع الزيارة</div></div>
                <span className="bd bd-b">{slot.appt.kind}</span></div>
              <button className="btn sec" style={{ width: '100%', marginTop: 8 }}
                onClick={() => { onOpenPatient(slot.appt.patient_id); setSlot(null) }}>فتح ملف المريض</button>
              <button className="btn danger" style={{ width: '100%', marginTop: 8 }}
                onClick={() => cancel(slot.appt.id, slot.day, slot.time)}>إلغاء الموعد</button>
            </> : <>
              <button className="btn pri xl" style={{ width: '100%' }} onClick={() => setPick(true)}>
                اختر مريضًا
              </button>
              <div className="tiny mt8 center">أو ابحث بالاسم أو الهاتف</div>
            </>}
          </div>
        </Sheet>}

      {pick &&
        <Search user={user} onClose={() => setPick(null)} onPick={book} />}

      {/* ═══ تحرر موعد ═══ */}
      {freed &&
        <Sheet center title="تحرر موعد" subtitle={`${freed.day} · ${freed.time}`} onClose={() => setFreed(null)}>
          <div style={{ padding: '0 20px 18px' }}>
            <div className="lb">في قائمة الانتظار ({wait.length})</div>
            {wait.length === 0 ? <Empty title="قائمة الانتظار فارغة" /> :
              wait.map(w =>
                <div key={w.id} className="row">
                  <div className="grow">
                    <div className="rt">{w.name}</div>
                    <div className="rs"><span className="num">{w.phone || '—'}</span>{w.note ? ` · ${w.note}` : ''}</div>
                  </div>
                </div>)}
            <div className="tiny mt12">اتصلي بمن يناسب — أنتِ تعرفين الأنسب.</div>
          </div>
        </Sheet>}
    </div>
  )
}

/* ═══════════ قائمة الانتظار ═══════════ */
export function Waitlist({ refreshKey }) {
  const [rows, setRows] = useState([])
  const [add, setAdd] = useState(false)
  const [f, setF] = useState({ name: '', phone: '', note: '' })

  const load = useCallback(async () => { try { setRows(await call('waitList')) } catch { } }, [])
  useEffect(() => { load() }, [load, refreshKey])

  async function save() {
    if (!f.name.trim()) return
    await call('waitAdd', f)
    setF({ name: '', phone: '', note: '' }); setAdd(false); load()
  }

  return (
    <div className="main main-narrow">
      <div className="row-flex wrap">
        <div>
          <div className="h1">قائمة الانتظار</div>
          <div className="sub">{rows.length} مرضى ينتظرون موعدًا قريبًا</div>
        </div>
        <span className="grow" />
        <button className="btn pri" onClick={() => setAdd(true)}>+ أضف اسمًا</button>
      </div>

      {rows.length === 0
        ? <div className="card mt16"><Empty title="القائمة فارغة"
          hint="أضف من يريد موعدًا قريبًا — يظهرون عند تحرر أي موعد" /></div>
        : <div className="card flat mt16">
          {rows.map(r =>
            <div key={r.id} className="row">
              <div className="grow">
                <div className="rt">{r.name}</div>
                <div className="rs"><span className="num">{r.phone || '—'}</span>{r.note ? ` · ${r.note}` : ''}</div>
              </div>
              <button className="btn danger sm" onClick={async () => { await call('waitDelete', r.id); load() }}>حذف</button>
            </div>)}
        </div>}

      {add &&
        <Sheet center title="إضافة لقائمة الانتظار" onClose={() => setAdd(false)}
          footer={<><button className="btn pri" style={{ flex: 1 }} onClick={save}>حفظ</button>
            <button className="btn sec" onClick={() => setAdd(false)}>إلغاء</button></>}>
          <div style={{ padding: '0 20px 14px' }}>
            <input className="fld" autoFocus placeholder="الاسم" value={f.name}
              onChange={e => setF(s => ({ ...s, name: e.target.value }))} style={{ marginBottom: 9 }} />
            <input className="fld num" placeholder="الهاتف" value={f.phone}
              onChange={e => setF(s => ({ ...s, phone: e.target.value }))}
              style={{ marginBottom: 9, textAlign: 'right' }} />
            <input className="fld" placeholder="ملاحظة — مثال: صباحًا فقط" value={f.note}
              onChange={e => setF(s => ({ ...s, note: e.target.value }))} />
          </div>
        </Sheet>}
    </div>
  )
}
