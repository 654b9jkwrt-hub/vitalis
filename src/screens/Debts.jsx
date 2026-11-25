import React, { useState, useEffect, useCallback } from 'react'
import { call, money, daysSince } from '../lib/api'
import { Empty, Sheet } from '../components/UI'
import { PaySheet } from './SecretaryToday'

export default function Debts({ user, onOpenPatient, refreshKey }) {
  const [rows, setRows] = useState([])
  const [pay, setPay] = useState(null)
  const [waive, setWaive] = useState(null)
  const isDoc = user.role === 'doctor'

  const load = useCallback(async () => { try { setRows(await call('debts')) } catch { } }, [])
  useEffect(() => { load() }, [load, refreshKey])

  const total = rows.reduce((s, r) => s + r.balance, 0)
  const waivedTotal = rows.reduce((s, r) => s + (r.waived || 0), 0)

  return (
    <div className="main main-narrow">
      <div className="h1">الديون</div>
      <div className="sub">
        {rows.length} مريضًا · مجموعها <span className="money">{money(total)}</span> ل.س · مرتبة حسب القِدَم
        {waivedTotal > 0 && <> · سُومح بـ<span className="money">{money(waivedTotal)}</span></>}
      </div>

      {rows.length === 0
        ? <div className="card mt16"><Empty title="لا ديون" hint="كل الحسابات مسددة" /></div>
        : <div className="card flat mt16">
          {rows.map(r => {
            const d = daysSince(r.last_visit)
            return (
              <div key={r.id} className="row wrap">
                <div className="grow" style={{ cursor: 'pointer' }} onClick={() => onOpenPatient(r.id)}>
                  <div className="rt">{r.name}</div>
                  <div className="rs">
                    منذ {d ?? '—'} يومًا
                    {r.phone ? <> · <span className="num">{r.phone}</span></> : ''}
                    {r.waived > 0 ? <> · سُومح بـ<span className="num">{money(r.waived)}</span></> : ''}
                  </div>
                </div>
                <span className="money" style={{ color: d > 30 ? 'var(--r600)' : 'var(--a600)' }}>
                  {money(r.balance)}</span>
                <button className="btn pri sm" onClick={() => setPay(r)}>قبض</button>
                {isDoc
                  ? <button className="btn sec sm" onClick={() => setWaive(r)}>مسامحة</button>
                  : <button className="btn quiet sm" disabled title="المسامحة من الطبيب">مسامحة</button>}
              </div>)
          })}
        </div>}

      {!isDoc && rows.length > 0 &&
        <div className="tiny mt12">المسامحة على الديون من صلاحية الطبيب وحده.</div>}

      {pay &&
        <PaySheet patient={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); load() }} />}

      {waive &&
        <WaiveSheet r={waive} onClose={() => setWaive(null)} onDone={() => { setWaive(null); load() }} />}
    </div>
  )
}

function WaiveSheet({ r, onClose, onDone }) {
  const [amount, setAmount] = useState(String(r.balance))
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const REASONS = ['ظرف مادي', 'قريب أو صديق', 'مجاملة مهنية', 'مريض قديم']
  const amt = Number(String(amount).replace(/\D/g, '') || 0)

  return (
    <Sheet title={`مسامحة ${r.name}`} subtitle="الإعفاء ليس قبضًا — لا يُحسب دخلًا" onClose={onClose}
      footer={<button className="btn pri xl" style={{ width: '100%' }} disabled={busy || amt <= 0}
        onClick={async () => {
          setErr(''); setBusy(true)
          try { await call('waive', { patientId: r.id, amount: amt, reason: reason || null }); onDone() }
          catch (e) { setErr(e.message); setBusy(false) }
        }}>تأكيد المسامحة</button>}>
      <div style={{ padding: '4px 24px 18px', textAlign: 'center' }}>
        <div className="lb">الدين الحالي</div>
        <div className="money" style={{ fontSize: 28, color: 'var(--a600)' }}>{money(r.balance)}</div>

        <div className="lb mt16">المبلغ المُسامَح به</div>
        <input className="fld num" autoFocus value={amount}
          onChange={e => setAmount(e.target.value.replace(/\D/g, ''))}
          style={{ textAlign: 'center', fontSize: 21, fontWeight: 600 }} />
        <div className="row-flex mt8" style={{ justifyContent: 'center' }}>
          <button className="chip" onClick={() => setAmount(String(r.balance))}>الدين كاملًا</button>
          <button className="chip" onClick={() => setAmount(String(Math.round(r.balance / 2)))}>النصف</button>
        </div>
        {amt > 0 && amt < r.balance &&
          <div className="tiny mt8">يبقى عليه <span className="num">{money(r.balance - amt)}</span></div>}

        <div className="lb mt16">السبب (اختياري)</div>
        <input className="fld" value={reason} onChange={e => setReason(e.target.value)} />
        <div className="row-flex wrap mt8" style={{ justifyContent: 'center' }}>
          {REASONS.map(x => <button key={x} className="chip" onClick={() => setReason(x)}>{x}</button>)}
        </div>

        <div className="tiny mt16" style={{ color: 'var(--tx2)' }}>
          ستُبلَّغ السكرتيرة بألا تطالب بهذا المبلغ · والحدث يُسجَّل باسمك
        </div>
        {err && <div className="alert mt12">{err}</div>}
      </div>
    </Sheet>
  )
}
