import React, { useState, useEffect, useCallback, useRef } from 'react'
import { call, todayISO } from './lib/api'
import Login from './screens/Login'
import Lock from './screens/Lock'
import DoctorToday from './screens/DoctorToday'
import PatientFile from './screens/PatientFile'
import SecretaryToday from './screens/SecretaryToday'
import Cashbox from './screens/Cashbox'
import Debts from './screens/Debts'
import Calls from './screens/Calls'
import Pending from './screens/Pending'
import Calendar, { Waitlist } from './screens/Calendar'
import Reports, { Expenses } from './screens/Reports'
import SettingsScreen from './screens/Settings'
import { SyncDot } from './screens/Sync'
import Search from './components/Search'
import NewPatient from './components/NewPatient'

export default function App() {
  const [settings, setSettings] = useState(null)
  const [user, setUser] = useState(null)
  const [locked, setLocked] = useState(false)
  const [view, setView] = useState('today')
  const [patientId, setPatientId] = useState(null)
  const [apptId, setApptId] = useState(null)
  const [search, setSearch] = useState(false)
  const [newPt, setNewPt] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const [today, setToday] = useState([])
  const [notices, setNotices] = useState([])
  const [toast, setToast] = useState(null)
  const [morning, setMorning] = useState(false)
  const [paused, setPaused] = useState(null)      // الزيارة المعلّقة مؤقتًا
  const [pendCount, setPendCount] = useState(0)
  const idle = useRef(Date.now())
  const bump = () => setRefresh(r => r + 1)

  useEffect(() => { call('settingsGet').then(setSettings).catch(() => setSettings({})) }, [])

  /* ═══ القفل التلقائي ═══ */
  useEffect(() => {
    if (!user) return
    const reset = () => { idle.current = Date.now() }
    const evs = ['mousemove', 'keydown', 'mousedown', 'wheel']
    evs.forEach(e => window.addEventListener(e, reset))
    const t = setInterval(() => {
      const mins = user.role === 'doctor' ? +(settings?.idle_doctor || 3) : +(settings?.idle_secretary || 15)
      if (Date.now() - idle.current > mins * 60000) setLocked(true)
    }, 10000)
    return () => { evs.forEach(e => window.removeEventListener(e, reset)); clearInterval(t) }
  }, [user, settings])

  /* ═══ اختصارات ═══ */
  useEffect(() => {
    const h = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true) }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); setLocked(true) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  /* ═══ التحديث الدوري ═══ */
  const loadSide = useCallback(async () => {
    if (!user) return
    try { setToday(await call('apptDay', todayISO())) } catch { }
    if (user.role === 'doctor') {
      try { const p = await call('pendingAll'); setPendCount(p.items.filter(i => i.urgent).length + (p.diffs ? 1 : 0)) } catch { }
    }
    try {
      const n = await call('noticeList')
      setNotices(n)
      const fresh = n.filter(x => !x.seen)
      if (fresh.length && !toast) {
        setToast(fresh[0]); await call('noticeSeen', [fresh[0].id])
        setTimeout(() => setToast(null), 6000)
      }
    } catch { }
  }, [user])
  useEffect(() => { loadSide() }, [loadSide, refresh])
  useEffect(() => { const t = setInterval(loadSide, 4000); return () => clearInterval(t) }, [loadSide])

  /* ═══ النسخ الاحتياطي التلقائي (الطبيب) ═══ */
  useEffect(() => {
    if (!user || user.role !== 'doctor') return
    const run = async () => {
      try {
        const st = await call('backupStatus')
        const hours = st.last ? (Date.now() - new Date(st.last).getTime()) / 36e5 : 999
        if (hours >= 6) await call('backupNow')
      } catch { }
    }
    run()
    const t = setInterval(run, 36e5)
    return () => clearInterval(t)
  }, [user])

  async function afterLogin(u) {
    setUser(u); idle.current = Date.now()
    if (u.role === 'doctor' && settings?.morning_brief === '1') {
      const key = 'vitalis_brief_' + todayISO()
      if (!localStorage.getItem(key)) {
        try {
          const p = await call('pendingAll')
          if (p.items.length || p.diffs) setMorning(true)
          localStorage.setItem(key, '1')
        } catch { }
      }
    }
  }

  function openPatient(id, aid) { setPatientId(id); setApptId(aid || null); setView('patient') }

  if (!settings) return null
  if (!user) return <Login settings={settings} onLogin={afterLogin} />
  if (locked) return <Lock user={user} onUnlock={() => { setLocked(false); idle.current = Date.now() }}
    onLogout={() => { call('logout'); setUser(null); setLocked(false) }} />

  const isDoc = user.role === 'doctor'
  const waiting = today.filter(a => a.status === 'arrived')
  const unpaid = today.filter(a => a.status === 'done' && (a.amount_due || 0) > (a.paid || 0))
  const unseen = notices.filter(n => !n.seen).length

  if (morning)
    return (
      <div className="fullscreen" style={{ overflowY: 'auto', alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 520, padding: '40px 24px' }}>
          <div className="sub">صباح الخير، {settings.doctor_name}</div>
          <div className="h1">قبل أن تبدأ</div>
          <Pending compact onOpenPatient={id => { setMorning(false); openPatient(id) }} refreshKey={refresh} />
          <button className="btn pri xl" style={{ width: '100%', marginTop: 16 }}
            onClick={() => setMorning(false)}>ابدأ اليوم</button>
          <div className="tiny center mt8">تظهر مرة واحدة صباحًا</div>
        </div>
      </div>
    )

  const NavItem = ({ id, children, count, countClass }) => (
    <div className={'si' + (view === id ? ' on' : '')} onClick={() => setView(id)}>
      {children}
      {count > 0 && <span className={'cnt ' + (countClass || '')}>{count}</span>}
    </div>
  )

  return (
    <div className="app">
      <div className="topbar">
        <div className="logo">
          {settings.logo_data
            ? <img src={settings.logo_data} alt="" style={{ width: '100%', height: '100%', borderRadius: 9, objectFit: 'cover' }} />
            : 'V'}
        </div>
        <div className="clinic ellipsis">{settings.clinic_name}</div>
        <SyncDot />
        <div className="searchbar" onClick={() => setSearch(true)}>
          🔍 ابحث عن مريض…<span className="kbd">⌘K</span>
        </div>
        <span className="grow" />
        {!isDoc && <button className="btn pri sm" onClick={() => setNewPt('')}>+ مريض جديد</button>}
        <button className="ico" title="الإشعارات">🔔{unseen > 0 && <span className="pip" />}</button>
        <button className="ico" onClick={() => setLocked(true)} title="قفل (⌘L)">🔒</button>
        <button className="ico" onClick={() => { call('logout'); setUser(null) }} title="خروج">⏻</button>
      </div>

      {/* ═══ شريط الزيارة المعلّقة ═══ */}
      {paused && view !== 'patient' &&
        <div style={{
          padding: '7px 16px', background: 'var(--a50)', color: 'var(--a600)',
          fontSize: 13, display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '1px solid var(--sep)'
        }}>
          ⏸ زيارة {paused.name} معلّقة
          <span className="grow" />
          <button className="btn sec sm" onClick={() => openPatient(paused.patientId)}>عودة</button>
          <button className="ico" onClick={() => setPaused(null)}>✕</button>
        </div>}

      <div className="body">
        {view === 'today' && (isDoc
          ? <DoctorToday user={user} onOpenPatient={openPatient} refreshKey={refresh} />
          : <SecretaryToday user={user} onOpenPatient={id => openPatient(id)}
            onNewPatient={() => setNewPt('')} refreshKey={refresh} />)}

        {view === 'patient' && patientId &&
          <PatientFile user={user} settings={settings} patientId={patientId} apptId={apptId}
            onBack={() => { setView('today'); bump() }} onChanged={bump} onPause={setPaused} />}

        {view === 'pending' && isDoc && <div className="main main-narrow">
          <Pending onOpenPatient={openPatient} refreshKey={refresh} /></div>}
        {view === 'calendar' && <Calendar user={user} onOpenPatient={id => openPatient(id)} refreshKey={refresh} />}
        {view === 'wait' && <Waitlist refreshKey={refresh} />}
        {view === 'cash' && <Cashbox user={user} refreshKey={refresh} />}
        {view === 'debts' && <Debts user={user} onOpenPatient={id => openPatient(id)} refreshKey={refresh} />}
        {view === 'calls' && <Calls refreshKey={refresh} />}
        {view === 'expenses' && isDoc && <Expenses refreshKey={refresh} />}
        {view === 'reports' && isDoc && <Reports onOpenPatient={id => openPatient(id)} refreshKey={refresh} />}
        {view === 'settings' && isDoc && <SettingsScreen settings={settings} onSaved={setSettings} />}

        {/* ═══ العمود الجانبي ═══ */}
        <div className="side">
          {isDoc ? <>
            <div className="side-lb">اليوم</div>
            {today.length === 0 && <div className="tiny" style={{ padding: '4px 10px' }}>لا مواعيد</div>}
            {today.map(a =>
              <div key={a.id}
                className={'si' + (['done', 'paid'].includes(a.status) ? ' done' : '')
                  + (patientId === a.patient_id && view === 'patient' ? ' on' : '')}
                onClick={() => openPatient(a.patient_id, a.id)}>
                <span className="st">{a.time || '—'}</span>
                <span className="ellipsis">{a.name}</span>
                {['done', 'paid'].includes(a.status) &&
                  <span style={{ marginInlineStart: 'auto', color: 'var(--g600)' }}>✓</span>}
                {a.status === 'arrived' && <span style={{ marginInlineStart: 'auto', color: 'var(--b600)' }}>●</span>}
              </div>)}

            <div className="side-lb">العيادة</div>
            <NavItem id="today" count={waiting.length} countClass="blue">🏠 اليوم</NavItem>
            <NavItem id="pending" count={pendCount}>⏳ تحتاج انتباهك</NavItem>
            <NavItem id="calendar">📅 التقويم</NavItem>
            <NavItem id="wait">🕐 قائمة الانتظار</NavItem>

            <div className="side-lb">المال</div>
            <NavItem id="cash">💰 الصندوق</NavItem>
            <NavItem id="debts">📋 الديون</NavItem>
            <NavItem id="expenses">🧾 المصروفات</NavItem>
            <NavItem id="reports">📊 التقارير</NavItem>

            <div className="side-lb">النظام</div>
            <NavItem id="settings">⚙ الإعدادات</NavItem>
          </> : <>
            <NavItem id="today" count={unpaid.length}>● اليوم</NavItem>
            <NavItem id="calendar">📅 التقويم</NavItem>
            <NavItem id="calls">☎ اتصالات الغد</NavItem>
            <NavItem id="wait">🕐 قائمة الانتظار</NavItem>
            <NavItem id="cash">💰 الصندوق</NavItem>
            <NavItem id="debts">📋 الديون</NavItem>
          </>}
        </div>
      </div>

      {search &&
        <Search user={user} onClose={() => setSearch(false)}
          onPick={id => openPatient(id)} onNew={name => setNewPt(name)} />}

      {newPt !== null &&
        <NewPatient initialName={newPt} onClose={() => setNewPt(null)}
          onDone={p => { bump(); if (isDoc) openPatient(p.id) }} />}

      {toast &&
        <div className="toast">
          <div className="toast-dot" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{toast.title}</div>
            {toast.body && <div className="tiny num" style={{ marginTop: 1 }}>{toast.body}</div>}
          </div>
        </div>}
    </div>
  )
}
