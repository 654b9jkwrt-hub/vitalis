import React, { useState, useEffect, useCallback } from 'react'
import { call, fmtFull } from '../lib/api'
import { Empty } from '../components/UI'

const TOMORROW = () => new Date(Date.now() + 864e5).toISOString().slice(0, 10)

export default function Calls({ refreshKey }) {
  const [rows, setRows] = useState([])
  const load = useCallback(async () => {
    try { setRows(await call('callsList', TOMORROW())) } catch { }
  }, [])
  useEffect(() => { load() }, [load, refreshKey])

  async function mark(id, confirm) {
    await call('apptSetConfirm', id, confirm)
    load()
  }

  const pending = rows.filter(r => !r.confirm).length

  return (
    <div className="main main-narrow">
      <div className="h1">اتصالات الغد</div>
      <div className="sub">
        {fmtFull(TOMORROW())} · {rows.length} مواعيد · {pending} لم يُتصل بهم
      </div>

      {rows.length === 0
        ? <div className="card mt16"><Empty title="لا مواعيد غدًا" /></div>
        : <div className="card flat mt16">
          {rows.map(r =>
            <div key={r.id} className="row wrap">
              <span className="st">{r.time || '—'}</span>
              <div className="grow">
                <div className="rt">{r.name}</div>
                <div className="rs"><span className="num">{r.phone}</span> · {r.kind}</div>
              </div>
              {r.confirm
                ? <span className={'bd ' + (r.confirm === 'تأكد' ? 'bd-g' : 'bd-a')}>{r.confirm}</span>
                : <div className="row-flex">
                  <button className="btn quiet sm" onClick={() => mark(r.id, 'تأكد')}>✓ تأكد</button>
                  <button className="btn quiet sm" onClick={() => mark(r.id, 'لم يرد')}>☎ لم يرد</button>
                  <button className="btn danger sm" onClick={() => mark(r.id, 'اعتذر')}>✕ اعتذر</button>
                </div>}
            </div>)}
        </div>}

      <div className="tiny mt16">
        من يعتذر يُلغى موعده فورًا وتتحرر الخانة — الإلغاء مساءً أفضل من مفاجأة الصباح.
      </div>
    </div>
  )
}
