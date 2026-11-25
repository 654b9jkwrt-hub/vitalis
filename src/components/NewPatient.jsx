import React, { useState, useEffect } from 'react'
import { call, todayISO } from '../lib/api'
import { Sheet, Toggle } from './UI'
import ChipList from './ChipList'

export default function NewPatient({ initialName = '', withAppointment = true, onDone, onClose }) {
  const [f, setF] = useState({
    name: initialName, phone: '', no_phone: false, contact_phone: '', contact_relation: '',
    age: '', gender: '', address: '', referred_by: ''
  })
  const [more, setMore] = useState(false)
  const [appt, setAppt] = useState(withAppointment ? 'today' : 'none')
  const [kind, setKind] = useState('كشف')
  const [dup, setDup] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [lists, setLists] = useState({})

  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const loadLists = () => call('optionsAll', ['referral_src']).then(setLists).catch(() => { })
  useEffect(() => { loadLists() }, [])

  // كشف التكرار — يقترح ولا يمنع
  useEffect(() => {
    let dead = false
    const q = f.name.trim() || f.phone.trim()
    if (q.length < 3) { setDup([]); return }
    const t = setTimeout(async () => {
      try { const r = await call('patientSearch', q); if (!dead) setDup(r.slice(0, 3)) } catch { }
    }, 250)
    return () => { dead = true; clearTimeout(t) }
  }, [f.name, f.phone])

  async function save(another) {
    setErr(''); setBusy(true)
    try {
      const p = await call('patientCreate', f)
      if (appt !== 'none') {
        const day = appt === 'today' ? todayISO() : new Date(Date.now() + 864e5).toISOString().slice(0, 10)
        await call('apptCreate', p.id, day, null, kind)
      }
      if (another) {
        setF({ name: '', phone: '', no_phone: false, contact_phone: '', contact_relation: '', age: '', gender: '', address: '', referred_by: '' })
        setDup([]); setBusy(false)
      } else { onDone?.(p); onClose() }
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <Sheet title="مريض جديد" onClose={onClose}
      footer={<>
        <button className="btn pri" style={{ flex: 1 }} disabled={busy} onClick={() => save(false)}>حفظ</button>
        <button className="btn sec" disabled={busy} onClick={() => save(true)}>حفظ وآخر</button>
      </>}>
      <div style={{ padding: '0 20px 8px' }}>
        <input className="fld" autoFocus placeholder="اسم المريض *" value={f.name}
          onChange={e => set('name', e.target.value)} style={{ marginBottom: 9 }} />

        {!f.no_phone &&
          <input className="fld num" placeholder="رقم الهاتف *" value={f.phone}
            onChange={e => set('phone', e.target.value)} style={{ marginBottom: 9, textAlign: 'right' }} />}

        <div className="row" style={{ padding: '6px 0' }}>
          <div className="grow">
            <div className="rt" style={{ fontSize: 14 }}>لا يملك هاتفًا</div>
            <div className="rs">يُستبعد من قائمة الاتصالات</div>
          </div>
          <Toggle on={f.no_phone} onChange={v => set('no_phone', v)} />
        </div>

        {f.no_phone &&
          <div style={{ display: 'flex', gap: 8, marginBottom: 9 }}>
            <input className="fld num" placeholder="هاتف شخص للتواصل" value={f.contact_phone}
              onChange={e => set('contact_phone', e.target.value)} style={{ textAlign: 'right' }} />
            <input className="fld" placeholder="الصلة" value={f.contact_relation}
              onChange={e => set('contact_relation', e.target.value)} style={{ maxWidth: 120 }} />
          </div>}

        {dup.length > 0 &&
          <div className="card" style={{ background: 'var(--a50)', padding: '10px 13px', marginBottom: 9 }}>
            <div style={{ fontSize: 12.5, color: 'var(--a600)', fontWeight: 500 }}>
              ⚠ يوجد مريض بمعلومات مشابهة
            </div>
            {dup.map(d =>
              <div key={d.id} className="tiny" style={{ marginTop: 3 }}>
                {d.name} · <span className="num">{d.phone || '—'}</span> · ملف <span className="num">{d.file_no}</span>
              </div>)}
          </div>}

        <button className="btn sec sm" onClick={() => setMore(m => !m)} style={{ paddingInline: 0 }}>
          {more ? '▾' : '▸'} بيانات إضافية (اختياري)
        </button>

        {more &&
          <div className="mt8">
            <div style={{ display: 'flex', gap: 8, marginBottom: 9 }}>
              <input className="fld num" placeholder="العمر" value={f.age}
                onChange={e => set('age', e.target.value.replace(/\D/g, ''))} style={{ maxWidth: 110, textAlign: 'center' }} />
              <div className="seg" style={{ flex: 1 }}>
                {['ذكر', 'أنثى'].map(g =>
                  <button key={g} className={f.gender === g ? 'on' : ''} style={{ flex: 1 }}
                    onClick={() => set('gender', g)}>{g}</button>)}
              </div>
            </div>
            <input className="fld" placeholder="العنوان" value={f.address}
              onChange={e => set('address', e.target.value)} style={{ marginBottom: 9 }} />
            <input className="fld" placeholder="جهة التحويل" value={f.referred_by}
              onChange={e => set('referred_by', e.target.value)} />
            <div className="mt8">
              <ChipList listKey="referral_src" options={lists.referral_src || []} multi={false}
                value={f.referred_by} onChange={v => set('referred_by', v)} onAdded={loadLists} />
            </div>
          </div>}

        <div className="lb mt16">موعد</div>
        <div className="seg" style={{ width: '100%' }}>
          {[['today', 'اليوم'], ['tomorrow', 'الغد'], ['none', 'بلا موعد']].map(([v, l]) =>
            <button key={v} className={appt === v ? 'on' : ''} style={{ flex: 1 }} onClick={() => setAppt(v)}>{l}</button>)}
        </div>

        {appt !== 'none' &&
          <div className="seg mt8" style={{ width: '100%' }}>
            {['كشف', 'مراجعة', 'زيارة قصيرة'].map(k =>
              <button key={k} className={kind === k ? 'on' : ''} style={{ flex: 1 }} onClick={() => setKind(k)}>{k}</button>)}
          </div>}

        {err && <div className="alert mt12">{err}</div>}
      </div>
    </Sheet>
  )
}
