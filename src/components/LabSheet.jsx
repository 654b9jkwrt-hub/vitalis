import React, { useState, useEffect } from 'react'
import { call } from '../lib/api'
import { Sheet } from './UI'
import { labRequestHTML } from '../lib/print'

/** طلب الفحوص — بنية ثلاثية كالوصفة، ويولّد معلّقة تُتابَع */
export default function LabSheet({ patientId, visitId, patient, settings, diagnosis, onDone, onClose }) {
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [tests, setTests] = useState([])
  const [tpls, setTpls] = useState([])
  const [note, setNote] = useState('')
  const [withDiag, setWithDiag] = useState(true)
  const [tplName, setTplName] = useState('')
  const [saveTpl, setSaveTpl] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { call('labTplList').then(setTpls).catch(() => { }) }, [])
  useEffect(() => {
    let dead = false
    const t = setTimeout(async () => {
      try { const r = await call('labTestsSearch', q); if (!dead) setTests(r) } catch { }
    }, 130)
    return () => { dead = true; clearTimeout(t) }
  }, [q])

  const add = name => { if (name && !items.includes(name)) setItems(x => [...x, name]) }
  const del = i => setItems(x => x.filter((_, j) => j !== i))

  async function submit(withPrint) {
    setErr('')
    try {
      if (!items.length) throw new Error('اختر فحصًا واحدًا على الأقل')
      if (saveTpl && tplName.trim()) { try { await call('labTplSave', tplName.trim(), items) } catch { } }
      await call('labCreate', {
        patientId, visitId, items,
        diagnosis: withDiag ? (diagnosis || null) : null, note: note || null
      })
      if (withPrint) {
        const html = labRequestHTML({
          settings, patient, items,
          diagnosis: withDiag ? diagnosis : null, note
        })
        await window.vitalis.print(html, 'A5')
      }
      onDone?.(); onClose()
    } catch (e) { setErr(e.message) }
  }

  return (
    <Sheet title="طلب فحوص" onClose={onClose} wide
      footer={<>
        <button className="btn pri" style={{ flex: 1 }} onClick={() => submit(true)}>حفظ وطباعة</button>
        <button className="btn sec" onClick={() => submit(false)}>حفظ فقط</button>
      </>}>
      <div style={{ padding: '0 20px 12px' }}>
        <input className="fld" value={q} autoFocus
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && q.trim()) { e.preventDefault(); add(q.trim()); setQ('') } }}
          placeholder="🔍 ابحث عن فحص أو اكتبه ثم Enter" />
      </div>

      {items.length > 0 &&
        <div style={{ padding: '0 20px 8px' }}>
          {items.map((it, i) =>
            <div key={i} className="row-flex" style={{ padding: '5px 0' }}>
              <span>▫</span><span className="grow">{it}</span>
              <button className="ico" onClick={() => del(i)}>✕</button>
            </div>)}
        </div>}

      {tpls.length > 0 &&
        <>
          <div className="lb" style={{ padding: '6px 20px 2px', margin: 0 }}>⭐ قوالبي</div>
          {tpls.map(t =>
            <div key={t.id} className="row click" onClick={() => JSON.parse(t.items).forEach(add)}>
              <div className="grow"><div className="rt">{t.name}</div>
                <div className="rs">{JSON.parse(t.items).join(' · ')}</div></div>
              <span className="bd bd-b">تطبيق</span>
            </div>)}
        </>}

      <div className="lb" style={{ padding: '12px 20px 2px', margin: 0 }}>
        {q ? 'نتائج البحث' : 'فحوصي — الأكثر استخدامًا'}
      </div>
      {tests.length === 0 &&
        <div className="empty" style={{ padding: 18 }}>
          <div className="sub">لا فحوص محفوظة — اكتب اسم الفحص واضغط Enter</div>
        </div>}
      {tests.map(t =>
        <div key={t.id} className="row click" onClick={() => add(t.name)}>
          <div className="grow"><div className="rt">{t.name}</div></div>
        </div>)}

      <div style={{ padding: '14px 20px 0' }}>
        {diagnosis &&
          <div className="row" style={{ padding: '8px 0' }}>
            <div className="grow">
              <div className="rt" style={{ fontSize: 14 }}>طباعة التشخيص المبدئي</div>
              <div className="rs">{diagnosis}</div>
            </div>
            <div className={'toggle' + (withDiag ? ' on' : '')} onClick={() => setWithDiag(v => !v)} />
          </div>}
        <div className="lb mt8">ملاحظة للمخبر</div>
        <input className="fld" value={note} onChange={e => setNote(e.target.value)}
          placeholder="مثال: صائم 12 ساعة" />
        <button className="btn sec sm mt8" style={{ paddingInline: 0 }} onClick={() => setSaveTpl(s => !s)}>
          {saveTpl ? '▾' : '▸'} حفظ كقالب
        </button>
        {saveTpl &&
          <input className="fld mt8" value={tplName} onChange={e => setTplName(e.target.value)}
            placeholder="اسم القالب — مثال: ما قبل العملية" />}
        {err && <div className="alert mt12">{err}</div>}
      </div>
    </Sheet>
  )
}
