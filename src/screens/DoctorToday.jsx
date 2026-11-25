import React, { useState, useEffect, useCallback } from 'react'
import { call, initials, fmtFull, minutesSince } from '../lib/api'
import { Empty } from '../components/UI'
import Pending from './Pending'

export default function DoctorToday({ user, onOpenPatient, refreshKey }) {
  const [list, setList] = useState([])

  const load = useCallback(async () => {
    try { setList(await call('apptDay', null)) } catch { }
  }, [])
  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => { const t = setInterval(load, 4000); return () => clearInterval(t) }, [load])

  const waiting = list.filter(a => a.status === 'arrived')
  const next = waiting[0]
  const done = list.filter(a => ['done', 'paid'].includes(a.status)).length

  return (
    <div className="main main-narrow">
      <div className="h1">{fmtFull(new Date().toISOString())}</div>
      <div className="sub">{list.length} مواعيد · {done} انتهوا · {waiting.length} ينتظرون</div>

      <div className="lb mt24">التالي</div>
      {next ? (
        <div className="next">
          <div className="avatar">{initials(next.name)}</div>
          <div className="grow" style={{ minWidth: 190 }}>
            <div className="h2">{next.name}</div>
            <div className="sub">
              {next.kind} · ينتظر منذ {minutesSince(next.arrived_at) ?? 0} دقيقة
              {next.file_no ? <> · ملف <span className="num">{next.file_no}</span></> : ''}
            </div>
            {(next.allergies || next.chronic) &&
              <div className="alert mt8">⚠ {[next.allergies, next.chronic].filter(Boolean).join(' · ')}</div>}
          </div>
          <button className="btn pri xl" onClick={() => onOpenPatient(next.patient_id, next.id)}>
            ابدأ الزيارة
          </button>
        </div>
      ) : (
        <div className="card">
          <Empty title="لا أحد ينتظر الآن"
            hint={list.length ? 'المواعيد القادمة في العمود الجانبي' : 'لا مواعيد اليوم'} />
        </div>
      )}

      <div className="lb mt24">تحتاج انتباهك</div>
      <Pending compact onOpenPatient={onOpenPatient} refreshKey={refreshKey} />
    </div>
  )
}
