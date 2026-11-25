import React, { useState, useEffect, useRef } from 'react'
import { call, money, initials, fmtDate } from '../lib/api'
import { Sheet } from './UI'

export default function Search({ user, onClose, onPick, onNew }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [idx, setIdx] = useState(0)
  const inp = useRef(null)

  useEffect(() => { inp.current?.focus() }, [])
  useEffect(() => {
    let dead = false
    if (!q.trim()) { setRes([]); return }
    const t = setTimeout(async () => {
      try { const r = await call('patientSearch', q); if (!dead) { setRes(r); setIdx(0) } } catch { }
    }, 120)
    return () => { dead = true; clearTimeout(t) }
  }, [q])

  function key(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, res.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (res[idx]) { onPick(res[idx].id); onClose() }
      else if (q.trim() && onNew) { onNew(q.trim()); onClose() }
    }
  }

  return (
    <Sheet center onClose={onClose}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--sep)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>🔍</span>
        <input ref={inp} value={q} onChange={e => setQ(e.target.value)} onKeyDown={key}
          placeholder="ابحث باسم أو رقم هاتف أو رقم ملف…"
          className="fld bare" style={{ fontSize: 16 }} />
      </div>

      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {res.length > 0 && <div className="lb" style={{ padding: '12px 18px 4px', margin: 0 }}>المرضى</div>}
        {res.map((p, i) =>
          <div key={p.id} className={'row click' + (i === idx ? ' on' : '')}
            style={i === idx ? { background: 'var(--b50)' } : null}
            onClick={() => { onPick(p.id); onClose() }}>
            <div className="avatar sm">{initials(p.name)}</div>
            <div className="grow">
              <div className="rt">{p.name}</div>
              <div className="rs">
                <span className="num">{p.file_no}</span>
                {p.age ? ` · ${p.age} سنة` : ''}
                {p.phone ? <> · <span className="num">{p.phone}</span></> : ''}
                {p.last_visit ? ` · آخر زيارة ${fmtDate(p.last_visit)}` : ' · لا زيارات'}
              </div>
            </div>
            {p.balance > 0 && <span className="bd bd-a">دين <span className="num">{money(p.balance)}</span></span>}
          </div>)}

        {q.trim() && onNew &&
          <>
            <div className="lb" style={{ padding: '12px 18px 4px', margin: 0 }}>أفعال سريعة</div>
            <div className="row click" onClick={() => { onNew(q.trim()); onClose() }}>
              <span style={{ fontSize: 18 }}>＋</span>
              <div className="grow"><div className="rt">مريض جديد باسم «{q.trim()}»</div></div>
            </div>
          </>}

        {!q.trim() && <div className="empty"><div className="sub">اكتب حرفين للبحث</div></div>}
      </div>

      <div style={{ padding: '10px 18px', background: 'var(--bg)', fontSize: 12, color: 'var(--tx3)' }}>
        ↑↓ للتنقل · Enter للفتح · Esc للإغلاق
      </div>
    </Sheet>
  )
}
