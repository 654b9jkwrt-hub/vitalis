import React, { useState, useEffect, useCallback } from 'react'
import { call, money, AR_MONTHS, daysSince } from '../lib/api'
import { Sheet, Empty } from '../components/UI'

const TABS = [['income', 'الدخل والربح'], ['debts', 'الديون'], ['patterns', 'الأنماط الطبية']]

export default function Reports({ onOpenPatient, refreshKey }) {
  const [tab, setTab] = useState('income')
  return (
    <div className="main main-narrow">
      <div className="h1">التقارير</div>
      <div className="seg mt16">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'income' && <Income refreshKey={refreshKey} />}
      {tab === 'debts' && <DebtsReport onOpenPatient={onOpenPatient} refreshKey={refreshKey} />}
      {tab === 'patterns' && <Patterns refreshKey={refreshKey} />}
    </div>
  )
}

/* ═══ الدخل والربح ═══ */
function Income({ refreshKey }) {
  const [rows, setRows] = useState([])
  useEffect(() => { call('reportIncome', 12).then(setRows).catch(() => { }) }, [refreshKey])
  if (!rows.length) return null

  const cur = rows[rows.length - 1]
  const prev = rows[rows.length - 2]
  const change = prev && prev.income > 0 ? Math.round(((cur.income - prev.income) / prev.income) * 100) : null
  const max = Math.max(...rows.map(r => Math.max(r.income, r.expense)), 1)

  return (
    <>
      <div className="card mt16">
        <div className="lb">{AR_MONTHS[new Date().getMonth()]} {new Date().getFullYear()}</div>
        <div className="row" style={{ padding: '10px 0' }}>
          <div className="grow"><div className="rt">الدخل</div></div>
          <span className="money" style={{ fontSize: 18, color: 'var(--g600)' }}>{money(cur.income)}</span>
        </div>
        <div className="row" style={{ padding: '10px 0' }}>
          <div className="grow"><div className="rt">المصروفات</div></div>
          <span className="money" style={{ fontSize: 18, color: 'var(--a600)' }}>{money(cur.expense)}</span>
        </div>
        <div className="row" style={{ padding: '10px 0' }}>
          <div className="grow"><div className="rt" style={{ fontWeight: 600 }}>صافي الربح</div></div>
          <span className="money" style={{ fontSize: 22 }}>{money(cur.profit)}</span>
        </div>
        <div className="row-flex mt8 wrap">
          {change !== null &&
            <span className={'bd ' + (change >= 0 ? 'bd-g' : 'bd-a')}>
              {change >= 0 ? '▲' : '▼'} {Math.abs(change)}٪ عن الشهر الماضي
            </span>}
          <span className="bd bd-y">{cur.patients} مريضًا</span>
          <span className="bd bd-b">{cur.newPatients} جديد</span>
        </div>
      </div>

      <div className="lb mt24">الدخل الشهري — آخر 12 شهرًا</div>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160 }}>
          {rows.map(r => (
            <div key={r.month} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                height: Math.round((r.income / max) * 120), background: 'var(--b500)',
                borderRadius: '5px 5px 0 0', minHeight: r.income ? 3 : 0, transition: 'height .3s'
              }} title={money(r.income)} />
              <div style={{
                height: Math.round((r.expense / max) * 120), background: 'var(--a600)',
                opacity: .55, borderRadius: '0 0 5px 5px', minHeight: r.expense ? 2 : 0
              }} title={money(r.expense)} />
              <div className="num" style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4 }}>
                {r.month.slice(5)}
              </div>
            </div>))}
        </div>
        <div className="row-flex mt12" style={{ justifyContent: 'center', gap: 16 }}>
          <span className="tiny"><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--b500)', borderRadius: 3 }} /> الدخل</span>
          <span className="tiny"><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--a600)', opacity: .55, borderRadius: 3 }} /> المصروفات</span>
        </div>
      </div>

      <div className="lb mt24">التفصيل</div>
      <div className="card flat">
        {[...rows].reverse().map(r =>
          <div key={r.month} className="row">
            <span className="num st" style={{ width: 66 }}>{r.month}</span>
            <div className="grow"><div className="rs">{r.patients} مريضًا · {r.newPatients} جديد</div></div>
            <span className="money" style={{ fontSize: 13.5, color: 'var(--g600)' }}>{money(r.income)}</span>
            <span className="money" style={{ fontSize: 13.5, color: 'var(--a600)' }}>−{money(r.expense)}</span>
            <span className="money" style={{ fontSize: 14 }}>{money(r.profit)}</span>
          </div>)}
      </div>
    </>
  )
}

/* ═══ الديون ═══ */
function DebtsReport({ onOpenPatient, refreshKey }) {
  const [rows, setRows] = useState([])
  const load = useCallback(() => { call('debts').then(setRows).catch(() => { }) }, [])
  useEffect(() => { load() }, [load, refreshKey])
  const total = rows.reduce((s, r) => s + r.balance, 0)

  return (
    <>
      <div className="card mt16 center" style={{ padding: '22px' }}>
        <div className="money" style={{ fontSize: 30 }}>{money(total)}</div>
        <div className="sub">ل.س · على {rows.length} مريضًا · مرتبة حسب القِدَم</div>
      </div>
      {rows.length === 0 ? <div className="card"><Empty title="لا ديون" /></div> :
        <div className="card flat">
          {rows.map(r => {
            const d = daysSince(r.last_visit)
            return (
              <div key={r.id} className="row click" onClick={() => onOpenPatient(r.id)}>
                <div className="grow">
                  <div className="rt">{r.name}</div>
                  <div className="rs">منذ {d ?? '—'} يومًا{r.waived > 0 ? ` · سُومح بـ${money(r.waived)}` : ''}</div>
                </div>
                <span className="money" style={{ color: d > 30 ? 'var(--r600)' : 'var(--a600)' }}>{money(r.balance)}</span>
              </div>)
          })}
        </div>}
    </>
  )
}

/* ═══ الأنماط الطبية ═══ */
function Patterns({ refreshKey }) {
  const [d, setD] = useState(null)
  const [merge, setMerge] = useState(null)
  const load = useCallback(() => { call('reportPatterns').then(setD).catch(() => { }) }, [])
  useEffect(() => { load() }, [load, refreshKey])
  if (!d) return null

  const Bar = ({ label, count, max, onClick }) => (
    <div className="row" style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div className="grow">
        <div className="rt" style={{ fontSize: 14 }}>{label}</div>
        <div style={{ height: 5, background: 'var(--s2)', borderRadius: 99, marginTop: 5 }}>
          <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: 'var(--b500)', borderRadius: 99 }} />
        </div>
      </div>
      <span className="num" style={{ fontWeight: 600 }}>{count}</span>
    </div>
  )

  const maxD = Math.max(...d.diag.map(x => x.c), 1)
  const maxS = Math.max(...d.surg.map(x => x.c), 1)

  return (
    <>
      <div className="lb mt16">أكثر التشخيصات</div>
      {d.diag.length === 0 ? <div className="card"><Empty title="لا تشخيصات بعد" /></div> :
        <div className="card flat">
          {d.diag.map(x => <Bar key={x.d} label={x.d} count={x.c} max={maxD} onClick={() => setMerge(x.d)} />)}
        </div>}
      {d.diag.length > 1 && <div className="tiny">انقر على تشخيص لدمجه مع آخر مشابه — يصلح تجزؤ الإحصاء</div>}

      <div className="lb mt24">الأعمال الجراحية</div>
      {d.surg.length === 0 ? <div className="card"><Empty title="لا أعمال جراحية بعد" /></div> :
        <div className="card flat">
          {d.surg.map(x =>
            <div key={x.t} className="row">
              <div className="grow">
                <div className="rt" style={{ fontSize: 14 }}>{x.t}</div>
                <div style={{ height: 5, background: 'var(--s2)', borderRadius: 99, marginTop: 5 }}>
                  <div style={{ width: `${(x.c / maxS) * 100}%`, height: '100%', background: 'var(--b500)', borderRadius: 99 }} />
                </div>
              </div>
              <span className="bd bd-g">{x.done} منفّذ</span>
              <span className="num" style={{ fontWeight: 600 }}>{x.c}</span>
            </div>)}
        </div>}

      <div className="lb mt24">أنواع الزيارات</div>
      <div className="card flat">
        {d.kinds.map(k =>
          <div key={k.k} className="row">
            <div className="grow"><div className="rt" style={{ fontSize: 14 }}>{k.k}</div></div>
            <span className="num" style={{ fontWeight: 600 }}>{k.c}</span>
          </div>)}
      </div>

      <div className="lb mt24">أعمار المرضى</div>
      <div className="card flat">
        {[['أقل من 18', d.ages.a1], ['18 — 39', d.ages.a2], ['40 — 59', d.ages.a3],
        ['60 فأكثر', d.ages.a4], ['غير مسجّل', d.ages.a0]].map(([l, c]) =>
          <div key={l} className="row">
            <div className="grow"><div className="rt" style={{ fontSize: 14 }}>{l}</div></div>
            <span className="num" style={{ fontWeight: 600 }}>{c || 0}</span>
          </div>)}
      </div>

      {merge &&
        <MergeDiag from={merge} all={d.diag.map(x => x.d)} onClose={() => setMerge(null)}
          onDone={() => { setMerge(null); load() }} />}
    </>
  )
}

function MergeDiag({ from, all, onClose, onDone }) {
  const [to, setTo] = useState('')
  return (
    <Sheet center title="دمج تشخيص" subtitle={`«${from}» سيصبح…`} onClose={onClose}
      footer={<><button className="btn pri" style={{ flex: 1 }} disabled={!to}
        onClick={async () => { await call('diagMerge', from, to); onDone() }}>دمج</button>
        <button className="btn sec" onClick={onClose}>إلغاء</button></>}>
      <div style={{ padding: '0 20px 14px', maxHeight: 300, overflowY: 'auto' }}>
        {all.filter(x => x !== from).map(x =>
          <div key={x} className={'row click' + (to === x ? ' on' : '')}
            style={to === x ? { background: 'var(--b50)' } : null}
            onClick={() => setTo(x)}>
            <div className="grow"><div className="rt">{x}</div></div>
            {to === x && <span style={{ color: 'var(--b600)' }}>✓</span>}
          </div>)}
      </div>
    </Sheet>
  )
}

/* ═══════════ المصروفات ═══════════ */
export function Expenses({ refreshKey }) {
  const [rows, setRows] = useState([])
  const [labels, setLabels] = useState([])
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [add, setAdd] = useState(false)
  const [manage, setManage] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [f, setF] = useState({ label: '', amount: '', recurring: false, note: '' })
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    call('expenseList', month).then(setRows).catch(() => { })
    call('expenseLabels').then(setLabels).catch(() => { })
  }, [month])
  useEffect(() => { load() }, [load, refreshKey])
  const total = rows.reduce((s, r) => s + r.amount, 0)

  async function save() {
    setErr('')
    try {
      await call('expenseAdd', f)
      if (f.label && !labels.some(l => l.name === f.label)) await call('expenseLabelAdd', f.label)
      setF({ label: '', amount: '', recurring: false, note: '' }); setAdd(false); load()
    } catch (e) { setErr(e.message) }
  }
  async function addLabel() {
    const n = newLabel.trim(); if (!n) return
    try { await call('expenseLabelAdd', n); setNewLabel(''); load() } catch (e) { setErr(e.message) }
  }

  return (
    <div className="main main-narrow">
      <div className="row-flex wrap">
        <div>
          <div className="h1">المصروفات</div>
          <div className="sub">
            <span className="num">{month}</span> · المجموع <span className="money">{money(total)}</span> ل.س
          </div>
        </div>
        <span className="grow" />
        <input className="fld num" type="month" value={month} onChange={e => setMonth(e.target.value)}
          style={{ width: 150 }} />
        <button className="btn quiet sm" onClick={() => setManage(true)}>البنود</button>
        <button className="btn pri" onClick={() => setAdd(true)}>+ مصروف</button>
      </div>

      {rows.length === 0
        ? <div className="card mt16"><Empty title="لا مصروفات هذا الشهر"
          action={<button className="btn pri" onClick={() => setAdd(true)}>+ أضف مصروفًا</button>} /></div>
        : <div className="card flat mt16">
          {rows.map(r =>
            <div key={r.id} className="row">
              <span className="num st" style={{ width: 74 }}>{r.day}</span>
              <div className="grow">
                <div className="rt">{r.label}</div>
                {r.note && <div className="rs">{r.note}</div>}
              </div>
              {r.recurring === 1 && <span className="bd bd-b">شهري</span>}
              <span className="money">{money(r.amount)}</span>
              <button className="btn danger sm" onClick={async () => { await call('expenseDelete', r.id); load() }}>حذف</button>
            </div>)}
        </div>}

      {add &&
        <Sheet center title="مصروف جديد" onClose={() => setAdd(false)}
          footer={<><button className="btn pri" style={{ flex: 1 }} onClick={save}>حفظ</button>
            <button className="btn sec" onClick={() => setAdd(false)}>إلغاء</button></>}>
          <div style={{ padding: '0 20px 14px' }}>
            <input className="fld" autoFocus placeholder="البند — اكتب بندًا جديدًا ويُحفظ تلقائيًا" value={f.label}
              onChange={e => setF(s => ({ ...s, label: e.target.value }))} />
            <div className="row-flex wrap mt8">
              {labels.map(l =>
                <button key={l.id} className={'chip' + (f.label === l.name ? ' done' : '')}
                  onClick={() => setF(x => ({ ...x, label: l.name }))}>{l.name}</button>)}
            </div>
            <div className="lb mt12">المبلغ</div>
            <input className="fld num" value={f.amount}
              onChange={e => setF(s => ({ ...s, amount: e.target.value.replace(/\D/g, '') }))}
              style={{ textAlign: 'center', fontSize: 19, fontWeight: 600 }} />
            <div className="row" style={{ padding: '10px 0' }}>
              <div className="grow"><div className="rt" style={{ fontSize: 14 }}>متكرر شهريًا</div>
                <div className="rs">مثل الإيجار والراتب</div></div>
              <div className={'toggle' + (f.recurring ? ' on' : '')}
                onClick={() => setF(s => ({ ...s, recurring: !s.recurring }))} />
            </div>
            <input className="fld" placeholder="ملاحظة (اختياري)" value={f.note}
              onChange={e => setF(s => ({ ...s, note: e.target.value }))} />
            {err && <div className="alert mt12">{err}</div>}
          </div>
        </Sheet>}

      {manage &&
        <Sheet center title="بنود المصاريف" subtitle="أضف ما تحتاجه — يظهر عند تسجيل أي مصروف"
          onClose={() => { setManage(false); setErr('') }}
          footer={<button className="btn sec" style={{ flex: 1 }} onClick={() => setManage(false)}>تم</button>}>
          <div style={{ padding: '0 20px 14px' }}>
            <div className="row-flex">
              <input className="fld" autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addLabel() }}
                placeholder="بند جديد — مثال: أجور المخبر" />
              <button className="btn pri sm" onClick={addLabel}>إضافة</button>
            </div>
            {err && <div className="alert mt8">{err}</div>}
            <div className="lb mt16">البنود الحالية ({labels.length})</div>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {labels.map(l =>
                <div key={l.id} className="row" style={{ padding: '9px 0' }}>
                  <div className="grow">
                    <div className="rt" style={{ fontSize: 14 }}>{l.name}</div>
                    {l.use_count > 0 && <div className="rs">استُخدم {l.use_count} مرة</div>}
                  </div>
                  <button className="btn danger sm" onClick={async () => {
                    await call('expenseLabelDelete', l.id); load()
                  }}>حذف</button>
                </div>)}
            </div>
            <div className="tiny mt8">حذف البند لا يحذف المصاريف المسجّلة به.</div>
          </div>
        </Sheet>}
    </div>
  )
}
