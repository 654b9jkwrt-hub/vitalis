import React, { useState, useEffect, useCallback } from 'react'
import { call, money, fmtFull, fmtTime, todayISO } from '../lib/api'
import { Sheet, Empty } from '../components/UI'

export default function Cashbox({ user, refreshKey }) {
  const [data, setData] = useState(null)
  const [closing, setClosing] = useState(false)
  const [del, setDel] = useState(null)
  const [err, setErr] = useState('')
  const isDoc = user.role === 'doctor'

  const load = useCallback(async () => {
    try { setData(await call('cashDay', todayISO())) } catch { }
  }, [])
  useEffect(() => { load() }, [load, refreshKey])

  if (!data) return <div className="main"><div className="empty">…</div></div>

  return (
    <div className="main main-narrow">
      <div className="h1">الصندوق</div>
      <div className="sub">{fmtFull(new Date().toISOString())}</div>

      <div className="card mt16 center" style={{ padding: '26px 20px' }}>
        <div className="money" style={{ fontSize: 38 }}>{money(data.total)}</div>
        <div className="sub">ل.س · من {data.count} مرضى</div>
        {data.closed &&
          <div className="mt12">
            <span className={'bd ' + (data.closed.diff === 0 ? 'bd-g' : 'bd-a')}>
              {data.closed.diff === 0 ? '✓ أُقفل بلا فروقات'
                : `أُقفل بفرق ${money(data.closed.diff)}`}
            </span>
          </div>}
      </div>

      {!data.closed &&
        <button className="btn pri xl" style={{ width: '100%' }} onClick={() => setClosing(true)}>
          إقفال اليوم
        </button>}

      <div className="lb mt24">مقبوضات اليوم</div>
      {data.rows.length === 0
        ? <div className="card"><Empty title="لا مقبوضات بعد" /></div>
        : <div className="card flat">
          {data.rows.map(r =>
            <div key={r.id} className="row">
              <span className="st">{fmtTime(r.created_at)}</span>
              <div className="grow">
                <div className="rt">{r.name}</div>
                <div className="rs">
                  {r.by_user}{r.paid_by ? ` · دفع: ${r.paid_by}` : ''}
                  {r.kind === 'refund' ? ' · استرجاع' : ''}
                </div>
              </div>
              {r.reviewed === 0 && <span className="bd bd-a">فرق</span>}
              <span className="money" style={{ color: r.amount < 0 ? 'var(--r600)' : 'inherit' }}>
                {money(r.amount)}</span>
              {isDoc && !data.closed &&
                <button className="btn danger sm" onClick={() => setDel(r)}>حذف</button>}
            </div>)}
        </div>}

      {err && <div className="alert mt12">{err}</div>}

      {del &&
        <Sheet center title="حذف دفعة" subtitle={`${del.name} — ${money(del.amount)} ل.س`}
          onClose={() => setDel(null)}
          footer={<>
            <button className="btn danger" style={{ flex: 1 }} onClick={async () => {
              try { await call('paymentDelete', del.id); setDel(null); load() }
              catch (e) { setErr(e.message); setDel(null) }
            }}>حذف نهائيًا</button>
            <button className="btn sec" onClick={() => setDel(null)}>إلغاء</button>
          </>}>
          <div style={{ padding: '0 20px 14px' }}>
            <div className="alert">⚠ سيعود المبلغ دينًا على المريض</div>
            <div className="tiny mt8">نسخة من الدفعة تُحفظ في سجل المحذوفات · لا يمكن الحذف من يوم مُقفل.</div>
          </div>
        </Sheet>}

      {closing &&
        <CloseDay total={data.total} onClose={() => setClosing(false)}
          onDone={() => { setClosing(false); load() }} />}
    </div>
  )
}

function CloseDay({ total, onClose, onDone }) {
  const [counted, setCounted] = useState(String(total))
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const diff = Number(String(counted).replace(/\D/g, '') || 0) - total

  async function submit() {
    setErr(''); setBusy(true)
    try {
      await call('dayClose', { day: todayISO(), counted: Number(String(counted).replace(/\D/g, '')), note })
      onDone()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <Sheet title="إقفال اليوم" subtitle="مطابقة نقدية" onClose={onClose}
      footer={<button className="btn pri xl" style={{ width: '100%' }} disabled={busy} onClick={submit}>
        تأكيد الإقفال</button>}>
      <div style={{ padding: '4px 24px 18px' }}>
        <div className="row"><div className="grow"><div className="rt">المسجّل في النظام</div></div>
          <span className="money">{money(total)}</span></div>

        <div className="lb mt16">النقد الفعلي في يدك</div>
        <input className="fld num" autoFocus value={counted}
          onChange={e => setCounted(e.target.value.replace(/\D/g, ''))}
          style={{ textAlign: 'center', fontSize: 21, fontWeight: 600 }} />

        <div className="center mt16">
          <div className="lb">الفرق</div>
          <div className="money" style={{
            fontSize: 24,
            color: diff === 0 ? 'var(--g600)' : 'var(--a600)'
          }}>{diff > 0 ? '+' : ''}{money(diff)}</div>
        </div>

        {diff !== 0 &&
          <>
            <div className="lb mt12" style={{ color: 'var(--a600)' }}>الملاحظة إلزامية عند وجود فرق</div>
            <input className="fld" value={note} onChange={e => setNote(e.target.value)}
              placeholder="سبب الفرق — مثال: باقي لم يُستلم من مريض" />
          </>}

        {err && <div className="alert mt12">{err}</div>}
      </div>
    </Sheet>
  )
}
