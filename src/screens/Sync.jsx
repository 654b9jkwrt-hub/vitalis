import React, { useState, useEffect, useCallback } from 'react'
import { call, fmtTime } from '../lib/api'
import { Empty } from '../components/UI'

export default function Sync() {
  const [info, setInfo] = useState(null)
  const [addr, setAddr] = useState('')
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    call('syncInfo').then(i => { setInfo(i); setName(n => n || i.name); setKey(k => k || i.key) }).catch(() => { })
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t) }, [load])

  if (!info) return null
  const ok = info.connected

  async function pair() {
    setErr(''); setMsg(''); setBusy(true)
    try { const h = await call('syncPair', addr.trim()); setMsg(`تم الاقتران مع ${h.name}`); setAddr(''); load() }
    catch (e) { setErr(e.message) }
    setBusy(false)
  }

  return (
    <>
      {/* ═══ الحالة ═══ */}
      <div className="card mt16" style={{ background: ok ? 'var(--g50)' : 'var(--a50)' }}>
        <div style={{ color: ok ? 'var(--g600)' : 'var(--a600)', fontSize: 15, fontWeight: 600 }}>
          {ok ? '● متصل — المزامنة تعمل' : '⚠ غير متصل بالجهاز الآخر'}
        </div>
        <div className="tiny mt8">
          {ok
            ? <>آخر مزامنة: {info.lastSync ? fmtTime(info.lastSync) : '—'} · التغييرات تظهر خلال أقل من ثانية</>
            : <>هذا الجهاز يعمل بشكل طبيعي · وما يُسجَّل عليه سيُزامَن تلقائيًا عند عودة الاتصال</>}
        </div>
        {info.lastError && !ok && <div className="tiny mt8" style={{ color: 'var(--a600)' }}>{info.lastError}</div>}
      </div>

      {/* ═══ هذا الجهاز ═══ */}
      <div className="lb mt24">هذا الجهاز</div>
      <div className="card">
        <div className="field-row">
          <label>الاسم</label>
          <input className="fld" value={name} onChange={e => setName(e.target.value)} />
          <button className="btn quiet sm" onClick={async () => {
            await call('syncSetName', name); setMsg('حُفظ الاسم'); setTimeout(() => setMsg(''), 2000); load()
          }}>حفظ</button>
        </div>
        <div className="tiny" style={{ lineHeight: 2 }}>
          العنوان على الشبكة:{' '}
          {info.ips.length
            ? info.ips.map(ip => <span key={ip} className="bd bd-b" style={{ marginInlineEnd: 5 }}>
              <span className="num">{ip}:{info.port}</span></span>)
            : <span style={{ color: 'var(--a600)' }}>الجهاز غير متصل بأي شبكة</span>}
        </div>
      </div>

      {/* ═══ الأجهزة المقترنة ═══ */}
      <div className="lb mt24">الجهاز الآخر</div>
      {info.peers.length === 0
        ? <div className="card">
          <Empty title="لم يُعثر على جهاز آخر"
            hint="افتح البرنامج على الجهاز الثاني وتأكد أن الجهازين على نفس الشبكة — يجد أحدهما الآخر تلقائيًا خلال ثوانٍ" />
        </div>
        : <div className="card flat">
          {info.peers.map(p => {
            const alive = p.last_seen && (Date.now() - new Date(p.last_seen).getTime()) < 15000
            return (
              <div key={p.device_id} className="row">
                <span style={{ color: alive ? 'var(--g600)' : 'var(--tx3)', fontSize: 18 }}>●</span>
                <div className="grow">
                  <div className="rt">{p.name}</div>
                  <div className="rs">
                    <span className="num">{p.address}</span>
                    {' · '}{alive ? 'متصل الآن' : `آخر ظهور ${p.last_seen ? fmtTime(p.last_seen) : '—'}`}
                  </div>
                </div>
                <button className="btn danger sm" onClick={async () => { await call('syncForget', p.device_id); load() }}>
                  إزالة
                </button>
              </div>)
          })}
        </div>}

      <div className="row-flex mt12 wrap">
        <button className="btn pri sm" disabled={busy} onClick={async () => {
          setBusy(true); try { const n = await call('syncNow'); setMsg(`تمت المزامنة — ${n || 0} تغييرًا`); setTimeout(() => setMsg(''), 2500) } catch (e) { setErr(e.message) } setBusy(false); load()
        }}>مزامنة الآن</button>
        {info.pending > 0 && <span className="bd bd-y">{info.pending} تغييرًا محليًا</span>}
        {msg && <span className="bd bd-g">{msg}</span>}
        {err && <span className="bd bd-r">{err}</span>}
      </div>

      {/* ═══ الاقتران اليدوي ═══ */}
      <div className="lb mt24">اقتران يدوي — إن لم يجد أحدهما الآخر</div>
      <div className="card">
        <div className="tiny" style={{ marginBottom: 10 }}>
          اكتب عنوان الجهاز الآخر كما يظهر عنده في «هذا الجهاز».
        </div>
        <div className="row-flex">
          <input className="fld num" value={addr} onChange={e => setAddr(e.target.value)}
            placeholder="192.168.1.5" style={{ textAlign: 'center' }}
            onKeyDown={e => { if (e.key === 'Enter') pair() }} />
          <button className="btn pri sm" disabled={busy || !addr.trim()} onClick={pair}>اقتران</button>
        </div>
      </div>

      {/* ═══ مفتاح العيادة ═══ */}
      <div className="lb mt24">مفتاح العيادة</div>
      <div className="card">
        <div className="tiny" style={{ marginBottom: 10 }}>
          الجهازان لا يتصلان إلا إذا تطابق المفتاح. انسخه من هذا الجهاز والصقه في الآخر.
        </div>
        <div className="row-flex">
          <input className="fld num" value={key} onChange={e => setKey(e.target.value)}
            style={{ fontSize: 12.5, direction: 'ltr' }} />
          <button className="btn quiet sm" onClick={async () => {
            await call('syncSetKey', key.trim()); setMsg('حُفظ المفتاح — أعد تشغيل البرنامج'); load()
          }}>حفظ</button>
        </div>
      </div>

      <div className="card mt16" style={{ background: 'var(--b50)' }}>
        <div className="tiny" style={{ color: 'var(--b600)', lineHeight: 1.9 }}>
          <b>كيف تعمل المزامنة:</b> لا يوجد خادم مركزي — كل جهاز يحمل نسخة كاملة عاملة.
          عند أي تغيير يُنبَّه الجهاز الآخر فورًا فيسحبه. وإن انقطعت الشبكة يواصل كل جهاز عمله
          ويُزامن ما تراكم عند عودتها.
        </div>
      </div>
    </>
  )
}

/* مؤشر صغير للشريط العلوي */
export function SyncDot() {
  const [ok, setOk] = useState(null)
  useEffect(() => {
    const t = setInterval(() => {
      call('syncInfo').then(i => setOk(i.peers.length ? i.connected : null)).catch(() => setOk(null))
    }, 5000)
    call('syncInfo').then(i => setOk(i.peers.length ? i.connected : null)).catch(() => { })
    return () => clearInterval(t)
  }, [])
  if (ok === null) return null
  return (
    <span title={ok ? 'متصل بالجهاز الآخر' : 'غير متصل — يعمل محليًا'}
      style={{
        width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
        background: ok ? 'var(--g600)' : 'var(--a600)', flexShrink: 0
      }} />
  )
}
