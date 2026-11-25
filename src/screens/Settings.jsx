import React, { useState, useEffect } from 'react'
import { call, appInfo, fmtTime } from '../lib/api'
import { Toggle, Empty } from '../components/UI'
import { NewFieldSheet } from '../components/ClinicalFields'
import SyncScreen from './Sync'

const TABS = [
  ['clinic', 'العيادة'], ['prices', 'الأسعار'], ['appts', 'المواعيد'],
  ['lists', 'القوائم'], ['sync', 'المزامنة'], ['security', 'الأمان'], ['archive', 'الأرشيف'], ['audit', 'السجل']
]

export default function Settings({ settings, onSaved }) {
  const [tab, setTab] = useState('clinic')
  const [f, setF] = useState(settings)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState(null)
  const [audit, setAudit] = useState([])

  useEffect(() => { appInfo().then(setInfo) }, [])
  useEffect(() => { if (tab === 'audit') call('auditList', 200).then(setAudit).catch(() => { }) }, [tab])

  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  async function save() {
    setErr(''); setMsg('')
    try { const s = await call('settingsSet', f); onSaved(s); setMsg('حُفظت الإعدادات'); setTimeout(() => setMsg(''), 2200) }
    catch (e) { setErr(e.message) }
  }

  async function pickLogo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 400_000) { setErr('حجم الشعار كبير — اختر صورة أصغر من 400 كيلوبايت'); return }
    const r = new FileReader()
    r.onload = () => set('logo_data', r.result)
    r.readAsDataURL(file)
  }

  return (
    <div className="main main-narrow">
      <div className="h1">الإعدادات</div>

      <div className="seg mt16" style={{ flexWrap: 'wrap' }}>
        {TABS.map(([k, l]) =>
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'clinic' &&
        <div className="card mt16">
          <Field label="اسم العيادة" v={f.clinic_name} on={v => set('clinic_name', v)} />
          <Field label="اسم الطبيب" v={f.doctor_name} on={v => set('doctor_name', v)} />
          <Field label="التخصص" v={f.specialty} on={v => set('specialty', v)} />
          <Field label="العنوان" v={f.address} on={v => set('address', v)} />
          <Field label="الهاتف" v={f.phone} on={v => set('phone', v)} num />

          <div className="field-row" style={{ alignItems: 'flex-start' }}>
            <label>الشعار</label>
            <div>
              {f.logo_data &&
                <img src={f.logo_data} alt="" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 10, marginBottom: 8, display: 'block' }} />}
              <input type="file" accept="image/*" onChange={pickLogo} style={{ fontSize: 13 }} />
              {f.logo_data && <button className="btn danger sm mt8" onClick={() => set('logo_data', '')}>إزالة</button>}
            </div>
          </div>

          <div className="lb mt16">معاينة الترويسة</div>
          <div style={{ background: '#fff', color: '#111', borderRadius: 10, padding: 14, display: 'flex', gap: 12, borderBottom: '2px solid #222' }}>
            {f.logo_data
              ? <img src={f.logo_data} style={{ width: 44, height: 44, objectFit: 'contain' }} />
              : <div style={{ width: 44, height: 44, borderRadius: 10, background: '#0E90DE', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>V</div>}
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{f.clinic_name}</div>
              <div style={{ fontSize: 11, color: '#444' }}>{f.specialty}</div>
              <div style={{ fontSize: 10, color: '#666' }}>{f.address} {f.phone && '· ' + f.phone}</div>
            </div>
          </div>
        </div>}

      {tab === 'prices' &&
        <div className="card mt16">
          <Field label="سعر الكشف" v={f.price_visit} on={v => set('price_visit', v)} num />
          <Field label="سعر المراجعة" v={f.price_review} on={v => set('price_review', v)} num />
          <Field label="الضماد لغير مرضاك" v={f.price_dressing} on={v => set('price_dressing', v)} num />
          <div className="tiny mt12">
            هذه أسعار <b>مقترحة</b>. المبلغ النهائي تحدده أنت في بطاقة الاختتام لكل زيارة —
            والنظام يقترح آخر مبلغ استخدمته لنوع الزيارة نفسه.
          </div>
        </div>}

      {tab === 'appts' &&
        <div className="card mt16">
          <Field label="بداية الدوام" v={f.work_start} on={v => set('work_start', v)} />
          <Field label="نهاية الدوام" v={f.work_end} on={v => set('work_end', v)} />
          <Field label="مدة الكشف (د)" v={f.dur_visit} on={v => set('dur_visit', v)} num />
          <Field label="مدة المراجعة (د)" v={f.dur_review} on={v => set('dur_review', v)} num />
          <Field label="مدة الزيارة القصيرة (د)" v={f.dur_short} on={v => set('dur_short', v)} num />
          <Field label="خمول الحالة (يوم)" v={f.idle_case_days} on={v => set('idle_case_days', v)} num />
          <div className="row" style={{ padding: '10px 0' }}>
            <div className="grow"><div className="rt">شاشة المعلّقات صباحًا</div>
              <div className="rs">تظهر مرة واحدة عند أول تشغيل يومي</div></div>
            <Toggle on={f.morning_brief === '1'} onChange={v => set('morning_brief', v ? '1' : '0')} />
          </div>
        </div>}

      {tab === 'security' &&
        <div className="card mt16">
          <PassBox />
          <div className="lb mt24">معلومات النظام</div>
          {info &&
            <div className="tiny" style={{ lineHeight: 2 }}>
              الإصدار <span className="num">{info.version}</span><br />
              الجهاز <span className="num">{info.device?.slice(0, 8)}</span><br />
              مسار البيانات: <span style={{ direction: 'ltr', display: 'inline-block' }}>{info.dataPath}</span>
            </div>}
          <Backup />
        </div>}

      {tab === 'lists' && <Lists />}

      {tab === 'sync' && <SyncScreen />}

      {tab === 'archive' && <Archive />}

      {tab === 'audit' &&
        <div className="mt16">
          {audit.length === 0 ? <div className="card"><Empty title="السجل فارغ" /></div> :
            <div className="card flat">
              {audit.map(a =>
                <div key={a.id} className="row">
                  <span className="st" style={{ width: 46 }}>{fmtTime(a.at)}</span>
                  <div className="grow">
                    <div className="rt" style={{ fontSize: 13.5 }}>{a.text}</div>
                    <div className="rs">{a.user}</div>
                  </div>
                  <span className="bd bd-y">{
                    { money: 'مالي', appointment: 'مواعيد', medical: 'طبي', auth: 'دخول', system: 'نظام' }[a.type] || a.type
                  }</span>
                </div>)}
            </div>}
          <div className="tiny mt12">السجل لا يُحذف ولا يُعدَّل — ولا منك.</div>
        </div>}

      {!['audit','archive','lists','sync'].includes(tab) &&
        <div className="row-flex mt16">
          <button className="btn pri" onClick={save}>حفظ</button>
          {msg && <span className="bd bd-g">{msg}</span>}
          {err && <span className="bd bd-r">{err}</span>}
        </div>}
    </div>
  )
}

/* ═══ القوائم القابلة للتخصيص ═══ */
function Lists() {
  const [meta, setMeta] = useState([])
  const [all, setAll] = useState({})
  const [open, setOpen] = useState(null)
  const [txt, setTxt] = useState('')
  const [custom, setCustom] = useState([])
  const [newField, setNewField] = useState(false)
  const [err, setErr] = useState('')

  const load = () => {
    call('optionsMeta').then(setMeta).catch(() => { })
    call('optionsAll').then(setAll).catch(() => { })
    call('customFields', 'visit').then(setCustom).catch(() => { })
  }
  useEffect(() => { load() }, [])

  async function add(key) {
    const v = txt.trim(); if (!v) return
    try { await call('optionAdd', key, v); setTxt(''); load() } catch (e) { setErr(e.message) }
  }

  const TYPE_AR = { text: 'نص قصير', textarea: 'نص طويل', number: 'رقم', chips: 'خيارات', scale: 'مقياس' }

  return (
    <>
      <div className="card mt16" style={{ background: 'var(--b50)' }}>
        <div className="tiny" style={{ color: 'var(--b600)' }}>
          كل قائمة خيارات في البرنامج تُدار من هنا · وتستطيع الإضافة أيضًا من داخل أي حقل بزر ＋
        </div>
      </div>

      {/* حقول الطبيب المخصصة */}
      <div className="row-flex mt24" style={{ marginBottom: 8 }}>
        <span className="lb" style={{ margin: 0 }}>⭐ حقولي الخاصة ({custom.length})</span>
        <span className="grow" />
        <button className="btn pri sm" onClick={() => setNewField(true)}>＋ حقل جديد</button>
      </div>
      {custom.length === 0
        ? <div className="card"><Empty title="لم تُعرّف حقولًا خاصة"
          hint="أضف أي حقل تحتاجه ويظهر في كل زيارة ضمن مجموعة «حقولي»" /></div>
        : <div className="card flat">
          {custom.map(f =>
            <div key={f.id} className="row">
              <div className="grow">
                <div className="rt">{f.label}</div>
                <div className="rs">{TYPE_AR[f.type] || f.type}{f.unit ? ` · ${f.unit}` : ''}</div>
              </div>
              <button className="btn danger sm" onClick={async () => {
                await call('customFieldDelete', f.id); load()
              }}>حذف</button>
            </div>)}
        </div>}

      {/* القوائم الجاهزة */}
      <div className="lb mt24">قوائم البرنامج ({meta.length})</div>
      <div className="card flat">
        {meta.map(m => {
          const isOpen = open === m.key
          const items = all[m.key] || []
          return (
            <React.Fragment key={m.key}>
              <div className="row click" onClick={() => { setOpen(isOpen ? null : m.key); setTxt('') }}>
                <div className="grow">
                  <div className="rt">{m.title}</div>
                  <div className="rs">{m.count} خيارًا</div>
                </div>
                <span style={{ color: 'var(--tx3)', fontSize: 12 }}>{isOpen ? '▾' : '▸'}</span>
              </div>
              {isOpen &&
                <div style={{ padding: '4px 18px 16px', background: 'var(--bg)' }}>
                  <div className="row-flex" style={{ marginBottom: 10 }}>
                    <input className="fld" autoFocus value={txt} onChange={e => setTxt(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') add(m.key) }}
                      placeholder="خيار جديد ثم Enter" />
                    <button className="btn pri sm" onClick={() => add(m.key)}>إضافة</button>
                  </div>
                  <div className="row-flex wrap" style={{ gap: 6 }}>
                    {items.map(o =>
                      <span key={o.id} className="chip" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {o.value}
                        <span style={{ color: 'var(--r600)', cursor: 'pointer', fontWeight: 700 }}
                          onClick={async () => { await call('optionDelete', o.id); load() }}>✕</span>
                      </span>)}
                    {items.length === 0 && <span className="tiny">لا خيارات — أضف الأول</span>}
                  </div>
                </div>}
            </React.Fragment>)
        })}
      </div>

      {err && <div className="alert mt12">{err}</div>}

      {newField &&
        <NewFieldSheet onClose={() => setNewField(false)} onDone={() => { setNewField(false); load() }} />}
    </>
  )
}

/* ═══ الأرشيف وسجل المحذوفات ═══ */
function Archive() {
  const [arch, setArch] = useState([])
  const [trash, setTrash] = useState([])
  const [err, setErr] = useState('')

  const load = () => {
    call('archivedList').then(setArch).catch(() => { })
    call('trashList', 100).then(setTrash).catch(() => { })
  }
  useEffect(() => { load() }, [])

  const TBL = {
    patients: 'مريض', visits: 'زيارة', payments: 'دفعة',
    surgeries: 'عمل جراحي', lab_orders: 'طلب فحوص', appointments: 'موعد'
  }

  return (
    <>
      <div className="lb mt16">المرضى المؤرشفون ({arch.length})</div>
      {arch.length === 0
        ? <div className="card"><Empty title="لا مرضى مؤرشفين" /></div>
        : <div className="card flat">
          {arch.map(a =>
            <div key={a.id} className="row">
              <div className="grow">
                <div className="rt">{a.name}</div>
                <div className="rs">
                  ملف <span className="num">{a.file_no}</span>
                  {a.phone ? <> · <span className="num">{a.phone}</span></> : ''}
                </div>
              </div>
              <button className="btn pri sm" onClick={async () => {
                try { await call('patientRestore', a.id); load() } catch (e) { setErr(e.message) }
              }}>استرجاع</button>
            </div>)}
        </div>}

      <div className="lb mt24">سجل المحذوفات ({trash.length})</div>
      <div className="tiny" style={{ marginBottom: 8 }}>
        كل ما يُحذف تُحفظ منه نسخة هنا — لا شيء يُمحى بلا أثر.
      </div>
      {trash.length === 0
        ? <div className="card"><Empty title="لم يُحذف شيء" /></div>
        : <div className="card flat">
          {trash.map(t =>
            <div key={t.id} className="row">
              <span className="bd bd-y">{TBL[t.tbl] || t.tbl}</span>
              <div className="grow">
                <div className="rt" style={{ fontSize: 13.5 }}>{t.label}</div>
                <div className="rs">{t.by_user} · {new Date(t.created_at).toLocaleString('ar-SY')}</div>
              </div>
            </div>)}
        </div>}

      {err && <div className="alert mt12">{err}</div>}
    </>
  )
}

/* ═══ النسخ الاحتياطي ═══ */
function Backup() {
  const [st, setSt] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => call('backupStatus').then(setSt).catch(() => { })
  useEffect(() => { load() }, [])

  const hours = st?.last ? Math.floor((Date.now() - new Date(st.last).getTime()) / 36e5) : null
  const stale = hours === null || hours >= 24

  return (
    <>
      <div className="lb mt24">النسخ الاحتياطي</div>
      <div className="card" style={{ background: stale ? 'var(--a50)' : 'var(--g50)', marginBottom: 12 }}>
        <div style={{ color: stale ? 'var(--a600)' : 'var(--g600)', fontSize: 14, fontWeight: 500 }}>
          {st?.last
            ? `${stale ? '⚠' : '✓'} آخر نسخة ناجحة: ${new Date(st.last).toLocaleString('ar-SY')}`
            : '⚠ لم تُنشأ أي نسخة بعد'}
        </div>
        <div className="tiny mt8">
          {hours !== null && `منذ ${hours} ساعة · `}
          النسخ تلقائي كل 6 ساعات · يُحتفظ بآخر 30 نسخة
        </div>
      </div>

      <div className="row-flex wrap">
        <button className="btn pri sm" disabled={busy} onClick={async () => {
          setBusy(true); setErr(''); setMsg('')
          try {
            const r = await call('backupNow')
            setMsg(`تمت النسخة — ${Math.round(r.size / 1024)} كيلوبايت`); load()
            setTimeout(() => setMsg(''), 3000)
          } catch (e) { setErr(e.message) }
          setBusy(false)
        }}>أنشئ نسخة الآن</button>
        {msg && <span className="bd bd-g">{msg}</span>}
        {err && <span className="bd bd-r">{err}</span>}
      </div>

      {st &&
        <div className="tiny mt12" style={{ lineHeight: 1.9 }}>
          مجلد النسخ: <span style={{ direction: 'ltr', display: 'inline-block' }}>{st.dir}</span><br />
          مجلد البيانات: <span style={{ direction: 'ltr', display: 'inline-block' }}>{st.dataDir}</span>
        </div>}

      <div className="card mt12" style={{ background: 'var(--b50)' }}>
        <div className="tiny" style={{ color: 'var(--b600)' }}>
          انسخ مجلد النسخ إلى قرص خارجي دوريًا — النسخة على الجهاز نفسه لا تحمي من تعطله.
        </div>
      </div>
    </>
  )
}

function Field({ label, v, on, num }) {
  return (
    <div className="field-row">
      <label>{label}</label>
      <input className={'fld' + (num ? ' num' : '')} value={v || ''} onChange={e => on(e.target.value)}
        style={num ? { textAlign: 'right', direction: 'ltr' } : null} />
    </div>
  )
}

function PassBox() {
  const [role, setRole] = useState('doctor')
  const [pass, setPass] = useState('')
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function save() {
    setErr(''); setMsg('')
    if (pass.length < 4) { setErr('كلمة المرور قصيرة — 4 أحرف على الأقل'); return }
    try {
      await call('setPass', role, pass, role === 'doctor' ? (pin || null) : null)
      setMsg('تم التغيير'); setPass(''); setPin(''); setTimeout(() => setMsg(''), 2200)
    } catch (e) { setErr(e.message) }
  }

  return (
    <>
      <div className="lb">تغيير كلمة المرور</div>
      <div className="seg" style={{ marginBottom: 10 }}>
        <button className={role === 'doctor' ? 'on' : ''} onClick={() => setRole('doctor')}>الطبيب</button>
        <button className={role === 'secretary' ? 'on' : ''} onClick={() => setRole('secretary')}>السكرتيرة</button>
      </div>
      <input className="fld" type="password" value={pass} onChange={e => setPass(e.target.value)}
        placeholder="كلمة المرور الجديدة" style={{ marginBottom: 9 }} />
      {role === 'doctor' &&
        <input className="fld num" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="رمز القفل (4 أرقام)" style={{ textAlign: 'center', marginBottom: 9 }} />}
      <div className="row-flex">
        <button className="btn quiet sm" onClick={save}>تغيير</button>
        {msg && <span className="bd bd-g">{msg}</span>}
        {err && <span className="bd bd-r">{err}</span>}
      </div>
    </>
  )
}
