import React, { useState, useEffect } from 'react'
import { call } from '../lib/api'
import { Sheet } from './UI'
import Prescription from './Prescription'
import { prescriptionHTML } from '../lib/print'

/** بطاقة الاختتام — قلب النظام (المرحلة 4) */
export default function CloseVisit({ visit, patient, settings, onClosed, onClose }) {
  const [rx, setRx] = useState(null)
  const [showRx, setShowRx] = useState(false)
  const [amount, setAmount] = useState('')
  const [nextDays, setNextDays] = useState(7)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [diagHint, setDiagHint] = useState(null)

  useEffect(() => {
    call('suggestAmount', patient.id, visit.kind)
      .then(v => setAmount(String(v ?? ''))).catch(() => setAmount(''))
    // اقتراح تشخيص من آخر سطر في لوح الالتقاط إن لم يوجد تشخيص
    if (!visit.diagnosis && visit.capture) {
      const lines = visit.capture.split('\n').map(s => s.trim()).filter(Boolean)
      if (lines.length) setDiagHint(lines[lines.length - 1])
    }
  }, [])

  async function finish(withPrint) {
    setErr('')
    if (amount === '' || amount === null) { setErr('المبلغ المستحق إلزامي — ولو كان صفرًا'); return }
    setBusy(true)
    try {
      if (diagHint && !visit.diagnosis) { /* التشخيص يبقى اختياريًا — لا يمنع */ }
      await call('visitClose', visit.id, {
        amount: Number(String(amount).replace(/[^\d-]/g, '')),
        nextDays: nextDays || null,
        rx: rx
      })
      if (withPrint && rx?.items?.length) {
        const html = prescriptionHTML({ settings, patient, items: rx.items, notes: rx.notes })
        await window.vitalis.print(html, 'A5')
      }
      onClosed()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  const nextOptions = [[0, 'بلا موعد'], [7, 'بعد أسبوع'], [14, 'بعد أسبوعين'], [30, 'بعد شهر']]

  return (
    <>
      <Sheet title={`إنهاء زيارة ${patient.name}`}
        subtitle={`${visit.kind} · ${new Date().toLocaleDateString('ar-SY')}`}
        onClose={onClose}
        footer={<>
          <button className="btn pri" style={{ flex: 1 }} disabled={busy} onClick={() => finish(true)}>
            {rx?.items?.length ? 'إنهاء وطباعة' : 'إنهاء'}
          </button>
          {rx?.items?.length ? <button className="btn sec" disabled={busy} onClick={() => finish(false)}>إنهاء فقط</button> : null}
        </>}>

        <div className="row click" onClick={() => setShowRx(true)}>
          <div className="grow">
            <div className="rt">💊 الوصفة</div>
            <div className="rs">{rx?.items?.length ? `${rx.items.length} أدوية` : 'اختياري'}</div>
          </div>
          <span className="btn sec sm">{rx?.items?.length ? 'تعديل' : '+ إضافة'}</span>
        </div>

        <div className="row">
          <div className="grow">
            <div className="rt">📅 الموعد القادم</div>
            <div className="rs">اقتراح — يمكن رفضه</div>
          </div>
          <select className="fld" style={{ width: 140, padding: '8px 10px', fontSize: 13.5 }}
            value={nextDays} onChange={e => setNextDays(Number(e.target.value))}>
            {nextOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div className="row">
          <div className="grow">
            <div className="rt">💰 المبلغ المستحق</div>
            <div className="rs" style={{ color: 'var(--r600)' }}>إلزامي — الصفر مقبول، الفراغ لا</div>
          </div>
          <input className="fld num" value={amount} autoFocus
            onChange={e => { setAmount(e.target.value.replace(/[^\d]/g, '')); setErr('') }}
            style={{ width: 120, textAlign: 'center', fontWeight: 600, fontSize: 16 }} />
        </div>

        {diagHint && !visit.diagnosis &&
          <div style={{ padding: '10px 20px' }}>
            <div className="card" style={{ background: 'var(--b50)', padding: '10px 13px', margin: 0 }}>
              <div className="tiny" style={{ color: 'var(--b600)' }}>اقتراح تشخيص من التقاطك</div>
              <div className="row-flex mt8">
                <span className="grow" style={{ fontSize: 13.5 }}>{diagHint}</span>
                <button className="chip" onClick={async () => {
                  await call('visitSave', visit.id, { diagnosis: diagHint }); setDiagHint(null)
                }}>اعتمد</button>
                <button className="chip" onClick={() => setDiagHint(null)}>تجاهل</button>
              </div>
            </div>
          </div>}

        {err && <div style={{ padding: '0 20px' }}><div className="alert">{err}</div></div>}
      </Sheet>

      {showRx &&
        <Prescription initial={rx} onDone={setRx} onClose={() => setShowRx(false)} />}
    </>
  )
}
