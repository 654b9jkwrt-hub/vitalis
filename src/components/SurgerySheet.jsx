import React, { useState, useEffect } from 'react'
import { call } from '../lib/api'
import { Sheet, Suggest } from './UI'
import ChipList from './ChipList'

/** العمل الجراحي — كيان مستقل يمتد عبر الزمن (قرار المرحلة 2) */
export default function SurgerySheet({ patientId, visitId, initial, onDone, onClose }) {
  const [f, setF] = useState({
    scope: initial?.scope || 'major',
    title: initial?.title || '',
    plannedDay: initial?.planned_day || '',
    fee: initial?.fee ? String(initial.fee) : '',
    anesthesia: initial?.anesthesia || 'موضعي',
    notes: initial?.notes || '',
    status: initial?.status || 'planned'
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [lists, setLists] = useState({})
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const loadLists = () => call('optionsAll', ['anesthesia']).then(setLists).catch(() => { })
  useEffect(() => { loadLists() }, [])

  async function save() {
    setErr(''); setBusy(true)
    try {
      if (initial?.id) {
        await call('surgeryUpdate', initial.id, {
          title: f.title, scope: f.scope, planned_day: f.plannedDay || null,
          fee: f.fee ? Number(f.fee) : null, anesthesia: f.anesthesia, notes: f.notes
        })
        if (f.status !== initial.status) await call('surgerySetStatus', initial.id, f.status)
      } else {
        await call('surgeryCreate', {
          patientId, visitId, scope: f.scope, title: f.title,
          plannedDay: f.plannedDay || null, fee: f.fee ? Number(f.fee) : null,
          anesthesia: f.anesthesia, notes: f.notes, status: f.status
        })
      }
      onDone?.(); onClose()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <Sheet title={initial ? 'تعديل العمل الجراحي' : 'عمل جراحي جديد'} onClose={onClose} wide
      footer={<>
        <button className="btn pri" style={{ flex: 1 }} disabled={busy} onClick={save}>حفظ</button>
        {initial && f.status === 'planned' &&
          <button className="btn sec" disabled={busy} onClick={async () => {
            await call('surgerySetStatus', initial.id, 'done'); onDone?.(); onClose()
          }}>تم التنفيذ</button>}
      </>}>
      <div style={{ padding: '0 20px 14px' }}>
        <div className="seg" style={{ width: '100%', marginBottom: 12 }}>
          <button className={f.scope === 'minor' ? 'on' : ''} style={{ flex: 1 }}
            onClick={() => set('scope', 'minor')}>إجراء صغير — العيادة</button>
          <button className={f.scope === 'major' ? 'on' : ''} style={{ flex: 1 }}
            onClick={() => set('scope', 'major')}>عملية كبرى — المشفى</button>
        </div>

        <div className="lb">العملية</div>
        <Suggest value={f.title} onChange={v => set('title', v)}
          fetcher={async q => {
            const all = await call('surgeryAll')
            return [...new Set(all.map(s => s.title).filter(t => t.includes(q)))].slice(0, 6)
          }}
          placeholder="مثال: استئصال فتق إربي أيمن" autoFocus />

        <div className="lb mt12">الحالة</div>
        <div className="seg" style={{ width: '100%' }}>
          {[['planned', 'مقرر'], ['done', 'منفّذ'], ['cancelled', 'ملغى']].map(([v, l]) =>
            <button key={v} className={f.status === v ? 'on' : ''} style={{ flex: 1 }}
              onClick={() => set('status', v)}>{l}</button>)}
        </div>

        {f.status === 'planned' &&
          <>
            <div className="lb mt12">تاريخ العملية — اتركه فارغًا إن لم يُحدَّد بعد</div>
            <input className="fld num" type="date" value={f.plannedDay}
              onChange={e => set('plannedDay', e.target.value)} />
            {!f.plannedDay &&
              <div className="tiny mt8" style={{ color: 'var(--a600)' }}>
                ⚠ بلا موعد ← ستظهر في «تحتاج انتباهك» حتى تحدده
              </div>}
          </>}

        <div className="lb mt12">أجر الجراح</div>
        <input className="fld num" value={f.fee} onChange={e => set('fee', e.target.value.replace(/\D/g, ''))}
          style={{ textAlign: 'center', fontWeight: 600 }} placeholder="0" />
        <div className="tiny mt8">أجرك فقط — أجور المشفى خارج النظام</div>

        {f.scope === 'minor' &&
          <>
            <div className="lb mt12">التخدير</div>
            <ChipList listKey="anesthesia" options={lists.anesthesia || []} multi={false}
              value={f.anesthesia} onChange={v => set('anesthesia', v)} onAdded={loadLists} />
          </>}

        <div className="lb mt12">ملاحظات</div>
        <textarea className="fld" rows={3} value={f.notes} onChange={e => set('notes', e.target.value)} />

        {err && <div className="alert mt12">{err}</div>}
      </div>
    </Sheet>
  )
}
