import React, { useState, useEffect } from 'react'
import { call } from '../lib/api'
import { Sheet } from './UI'
import ChipList from './ChipList'

/** محرر الوصفة — ثلاث طبقات: قوالبي · أدويتي · سطر حر (قرار المرحلة 2) */
export default function Prescription({ initial, onDone, onClose }) {
  const [items, setItems] = useState(initial?.items || [])
  const [notes, setNotes] = useState(initial?.notes || '')
  const [q, setQ] = useState('')
  const [drugs, setDrugs] = useState([])
  const [tpls, setTpls] = useState([])
  const [saveTpl, setSaveTpl] = useState(false)
  const [tplName, setTplName] = useState('')

  const [lists, setLists] = useState({})
  const loadLists = () => call('optionsAll', ['dose_presets']).then(setLists).catch(() => { })
  useEffect(() => { call('tplList').then(setTpls).catch(() => { }); loadLists() }, [])
  useEffect(() => {
    let dead = false
    const t = setTimeout(async () => {
      try { const r = await call('drugsSearch', q); if (!dead) setDrugs(r) } catch { }
    }, 130)
    return () => { dead = true; clearTimeout(t) }
  }, [q])

  const addDrug = d => setItems(x => [...x, {
    name_ar: d.name_ar, name_lat: d.name_lat || '', dose: d.dose || '', print_mode: d.print_mode || 'both'
  }])
  const addFree = () => { if (q.trim()) { setItems(x => [...x, { name_ar: q.trim(), name_lat: '', dose: '', print_mode: 'ar' }]); setQ('') } }
  const applyTpl = t => { setItems(x => [...x, ...JSON.parse(t.items)]); }
  const upd = (i, k, v) => setItems(x => x.map((it, j) => j === i ? { ...it, [k]: v } : it))
  const del = i => setItems(x => x.filter((_, j) => j !== i))

  async function done() {
    if (saveTpl && tplName.trim()) { try { await call('tplSave', tplName.trim(), items) } catch { } }
    onDone({ items, notes }); onClose()
  }

  return (
    <Sheet title="الوصفة" onClose={onClose} wide
      footer={<>
        <button className="btn pri" style={{ flex: 1 }} onClick={done}>تم</button>
        <button className="btn sec" onClick={() => setSaveTpl(s => !s)}>حفظ كقالب</button>
      </>}>

      <div style={{ padding: '0 20px 12px' }}>
        <input className="fld" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFree() } }}
          placeholder="🔍 ابحث عن دواء أو اكتب سطرًا حرًا ثم Enter" autoFocus />
      </div>

      {/* الأدوية المضافة */}
      {items.length > 0 &&
        <div style={{ padding: '0 20px 6px' }}>
          {items.map((it, i) =>
            <div key={i} className="card" style={{ padding: '11px 13px', marginBottom: 7 }}>
              <div className="row-flex">
                <span className="num" style={{ color: 'var(--tx3)', fontSize: 13 }}>{i + 1}</span>
                <input className="fld bare" style={{ fontWeight: 600, fontSize: 14.5 }}
                  value={it.name_ar} onChange={e => upd(i, 'name_ar', e.target.value)} placeholder="اسم الدواء" />
                <button className="ico" onClick={() => del(i)}>✕</button>
              </div>
              <div className="row-flex" style={{ marginTop: 5 }}>
                <input className="fld" style={{ fontSize: 13, padding: '7px 11px' }}
                  value={it.dose} onChange={e => upd(i, 'dose', e.target.value)}
                  placeholder="الجرعة بالعربية: حبة مرتين يوميًا لمدة أسبوع" />
              </div>
              <div style={{ marginTop: 5 }}>
                <ChipList listKey="dose_presets" options={lists.dose_presets || []} multi={false}
                  value={it.dose} onChange={v => upd(i, 'dose', v)} onAdded={loadLists} />
              </div>
              <div className="row-flex" style={{ marginTop: 5 }}>
                <input className="fld" style={{ fontSize: 12.5, padding: '6px 11px', maxWidth: 190, direction: 'ltr' }}
                  value={it.name_lat} onChange={e => upd(i, 'name_lat', e.target.value)}
                  placeholder="Latin name (optional)" />
                <div className="seg" style={{ marginInlineStart: 'auto' }}>
                  {[['ar', 'عربي'], ['both', 'الاثنان'], ['lat', 'لاتيني']].map(([v, l]) =>
                    <button key={v} className={it.print_mode === v ? 'on' : ''}
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => upd(i, 'print_mode', v)}>{l}</button>)}
                </div>
              </div>
            </div>)}
        </div>}

      {/* القوالب */}
      {tpls.length > 0 &&
        <>
          <div className="lb" style={{ padding: '8px 20px 2px', margin: 0 }}>⭐ قوالبي — الأسرع</div>
          {tpls.map(t =>
            <div key={t.id} className="row click" onClick={() => applyTpl(t)}>
              <div className="grow"><div className="rt">{t.name}</div>
                <div className="rs">{JSON.parse(t.items).length} أدوية</div></div>
              <span className="bd bd-b">تطبيق</span>
            </div>)}
        </>}

      {/* أدويتي */}
      <div className="lb" style={{ padding: '12px 20px 2px', margin: 0 }}>
        {q ? 'نتائج البحث' : 'أدويتي — الأكثر استخدامًا'}
      </div>
      {drugs.length === 0 &&
        <div className="empty" style={{ padding: '20px' }}>
          <div className="sub">لا أدوية محفوظة بعد — اكتب اسم الدواء واضغط Enter</div>
          <div className="tiny mt8">القائمة تنمو من عملك، لا من شاشة إعداد</div>
        </div>}
      {drugs.map(d =>
        <div key={d.id} className="row click" onClick={() => addDrug(d)}>
          <div className="grow">
            <div className="rt">{d.name_ar} {d.name_lat && <span className="tiny" style={{ direction: 'ltr' }}>({d.name_lat})</span>}</div>
            {d.dose && <div className="rs">{d.dose}</div>}
          </div>
        </div>)}

      <div style={{ padding: '14px 20px 0' }}>
        <div className="lb">ملاحظات للمريض</div>
        <input className="fld" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="مثال: تجنب رفع الأثقال أسبوعين" />
        {saveTpl &&
          <input className="fld mt8" value={tplName} onChange={e => setTplName(e.target.value)}
            placeholder="اسم القالب — مثال: ما بعد عملية فتق" autoFocus />}
      </div>
    </Sheet>
  )
}
