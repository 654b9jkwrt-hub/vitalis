import React, { useState } from 'react'
import { call } from '../lib/api'

/**
 * قائمة خيارات قابلة للتخصيص — تُقرأ من قاعدة البيانات
 * وفيها زر ＋ لإضافة خيار جديد في مكانه، بلا مغادرة الشاشة.
 */
export default function ChipList({ listKey, options = [], value, onChange, multi = true, onAdded }) {
  const [adding, setAdding] = useState(false)
  const [txt, setTxt] = useState('')
  const arr = multi ? (Array.isArray(value) ? value : []) : (value ? [value] : [])

  const toggle = o => {
    if (multi) onChange(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o])
    else onChange(value === o ? '' : o)
    if (!arr.includes(o)) call('optionUse', listKey, o).catch(() => { })
  }

  async function add() {
    const v = txt.trim(); if (!v) return
    try {
      await call('optionAdd', listKey, v)
      setTxt(''); setAdding(false)
      onAdded?.()
      if (multi) onChange([...arr, v]); else onChange(v)
    } catch { }
  }

  return (
    <div className="row-flex wrap" style={{ gap: 5 }}>
      {options.map(o =>
        <button key={o.id || o.value} className={'chip' + (arr.includes(o.value) ? ' done' : '')}
          onClick={() => toggle(o.value)}>{o.value}</button>)}

      {adding
        ? <span className="row-flex" style={{ gap: 4 }}>
          <input className="fld" autoFocus value={txt}
            onChange={e => setTxt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { setAdding(false); setTxt('') } }}
            onBlur={() => { if (!txt.trim()) setAdding(false) }}
            placeholder="خيار جديد"
            style={{ width: 150, padding: '4px 10px', fontSize: 12.5, borderRadius: 7 }} />
          <button className="chip" onMouseDown={add}>حفظ</button>
        </span>
        : <button className="chip" style={{ borderStyle: 'dashed', opacity: .75 }}
          onClick={() => setAdding(true)} title="أضف خيارًا جديدًا">＋</button>}
    </div>
  )
}
