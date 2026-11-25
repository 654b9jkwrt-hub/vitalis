import React, { useState, useEffect, useCallback } from 'react'
import { call, money, fmtFull, minutesSince } from '../lib/api'
import { Sheet, Empty } from '../components/UI'

const GROUPS = [
  { key: 'unpaid', title: '⚠ انتهى — لم يُحاسب', color: 'var(--a600)' },
  { key: 'arrived', title: '● في الانتظار — اسحب لترتيب الدور', color: 'var(--tx2)' },
  { key: 'with_doctor', title: '◐ عند الطبيب', color: 'var(--tx2)' },
  { key: 'scheduled', title: '○ لم يصل بعد', color: 'var(--tx2)' },
  { key: 'paid', title: '✓ خرج', color: 'var(--tx3)' }
]

export default function SecretaryToday({ user, onOpenPatient, onNewPatient, refreshKey }) {
  const [list, setList] = useState([])
  const [pay, setPay] = useState(null)
  const [drag, setDrag] = useState(null)

  const load = useCallback(async () => {
    try { setList(await call('apptDay', null)) } catch { }
  }, [])
  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => { const t = setInterval(load, 4000); return () => clearInterval(t) }, [load])

  function bucket(a) {
    if (a.status === 'paid') return 'paid'
    if (a.status === 'done') return a.amount_due > a.paid ? 'unpaid' : 'paid'
    if (a.status === 'with_doctor') return 'with_doctor'
    if (a.status === 'arrived') return 'arrived'
    return 'scheduled'
  }
  const by = k => list.filter(a => bucket(a) === k)
  const total = list.reduce((s, a) => s + (a.paid || 0), 0)

  async function setStatus(id, st) { await call('apptStatus', id, st); load() }

  async function onDrop(target) {
    if (!drag || drag === target) return
    const arr = by('arrived').map(a => a.id)
    const from = arr.indexOf(drag), to = arr.indexOf(target)
    if (from < 0 || to < 0) return
    arr.splice(to, 0, arr.splice(from, 1)[0])
    await call('apptReorder', null, arr)
    setDrag(null); load()
  }

  return (
    <div className="main main-narrow">
      <div className="row-flex wrap">
        <div>
          <div className="h1">اليوم</div>
          <div className="sub">
            {fmtFull(new Date().toISOString())} · {list.length} مرضى ·
            {' '}<span className="money">{money(total)}</span> ل.س
          </div>
        </div>
        <span className="grow" />
        <button className="btn pri" onClick={onNewPatient}>+ مريض جديد</button>
      </div>

      {list.length === 0 &&
        <div className="card mt16">
          <Empty title="لا مواعيد اليوم" hint="ابدأ بإضافة مريض"
            action={<button className="btn pri" onClick={onNewPatient}>+ مريض جديد</button>} />
        </div>}

      {GROUPS.map(g => {
        const rows = by(g.key)
        if (!rows.length) return null
        return (
          <div key={g.key}>
            <div className="sec-t" style={{ color: g.color }}>{g.title} ({rows.length})</div>
            <div className="card flat">
              {rows.map(a =>
                <div key={a.id} className="row"
                  draggable={g.key === 'arrived'}
                  onDragStart={() => setDrag(a.id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDrop(a.id)}>

                  {g.key === 'arrived' &&
                    <span style={{ color: 'var(--tx3)', cursor: 'grab', fontSize: 15 }}>⠿</span>}
                  <span className="st">{a.time || '—'}</span>

                  <div className="grow" style={{ cursor: 'pointer' }} onClick={() => onOpenPatient(a.patient_id)}>
                    <div className="rt">{a.name}</div>
                    {a.note_admin && <div className="rs">📝 {a.note_admin}</div>}
                  </div>

                  <span className="bd bd-y">{a.kind}</span>

                  {g.key === 'arrived' &&
                    <span className="tiny" style={{
                      color: minutesSince(a.arrived_at) > 40 ? 'var(--r600)'
                        : minutesSince(a.arrived_at) > 20 ? 'var(--a600)' : 'var(--tx3)'
                    }}>
                      ينتظر {minutesSince(a.arrived_at) ?? 0} د
                    </span>}

                  {g.key === 'scheduled' &&
                    <button className="btn quiet sm" onClick={() => setStatus(a.id, 'arrived')}>وصل</button>}

                  {g.key === 'with_doctor' && <span className="bd bd-b">عند الطبيب</span>}

                  {g.key === 'unpaid' && <>
                    <span className="money">{money(a.amount_due - a.paid)}</span>
                    <button className="btn pri sm" onClick={() => setPay(a)}>قبض</button>
                  </>}

                  {g.key === 'paid' && a.paid > 0 &&
                    <span className="money" style={{ color: 'var(--g600)', fontSize: 13.5 }}>{money(a.paid)}</span>}
                </div>)}
            </div>
          </div>)
      })}

      {pay &&
        <PaySheet appt={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); load() }} />}
    </div>
  )
}

/* ═══ بطاقة القبض ═══ */
export function PaySheet({ appt, patient, onClose, onDone }) {
  const due = appt ? (appt.amount_due - appt.paid) : (patient?.balance || 0)
  const name = appt?.name || patient?.name
  const [amt, setAmt] = useState(String(due))
  const [paidBy, setPaidBy] = useState('')
  const [more, setMore] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setErr(''); setBusy(true)
    try {
      await call('pay', {
        patientId: appt?.patient_id || patient.id,
        visitId: appt?.visit_id || null,
        amount: Number(String(amt).replace(/\D/g, '')),
        paidBy: paidBy.trim() || null
      })
      onDone()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  const short = due - Number(String(amt).replace(/\D/g, '') || 0)

  return (
    <Sheet title={`قبض من ${name}`} onClose={onClose}
      footer={<button className="btn pri xl" style={{ width: '100%' }} disabled={busy} onClick={submit}>
        تأكيد القبض</button>}>
      <div style={{ padding: '4px 24px 18px', textAlign: 'center' }}>
        <div className="lb">المستحق</div>
        <div className="money" style={{ fontSize: 30 }}>{money(due)}
          <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--tx2)' }}> ل.س</span></div>

        <div className="lb mt16">المقبوض</div>
        <input className="fld num" autoFocus value={amt}
          onChange={e => setAmt(e.target.value.replace(/\D/g, ''))}
          style={{ textAlign: 'center', fontSize: 21, fontWeight: 600 }} />

        {short > 0 &&
          <div className="tiny mt8" style={{ color: 'var(--a600)' }}>
            الفرق <span className="num">{money(short)}</span> يصبح دينًا · ويُبلَّغ الطبيب فورًا
          </div>}
        {short < 0 &&
          <div className="tiny mt8" style={{ color: 'var(--g600)' }}>
            زيادة <span className="num">{money(-short)}</span> تُسجَّل رصيدًا للمريض
          </div>}

        <button className="btn sec sm mt12" onClick={() => setMore(m => !m)}>
          {more ? '▾' : '▸'} دُفع بواسطة شخص آخر
        </button>
        {more &&
          <input className="fld mt8" value={paidBy} onChange={e => setPaidBy(e.target.value)}
            placeholder="اسم الدافع — مثال: والد المريض" />}

        {err && <div className="alert mt12">{err}</div>}
      </div>
    </Sheet>
  )
}
