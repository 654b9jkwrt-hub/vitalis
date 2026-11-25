import React, { useState, useEffect } from 'react'
import { call } from '../lib/api'

export default function Login({ settings, onLogin }) {
  const [role, setRole] = useState(null)
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [shake, setShake] = useState(false)

  useEffect(() => { setPass(''); setErr('') }, [role])

  async function submit(e) {
    e?.preventDefault()
    try {
      const u = await call('login', role, pass)
      onLogin(u)
    } catch (ex) {
      setErr(ex.message); setShake(true); setTimeout(() => setShake(false), 400); setPass('')
    }
  }

  return (
    <div className="fullscreen">
      <div className="center" style={{ padding: 24, width: '100%', maxWidth: 460 }}>
        <div style={{
          width: 76, height: 76, borderRadius: 20, margin: '0 auto 20px',
          background: 'linear-gradient(135deg,#1FA8F8,#0B76B8)', color: '#fff',
          display: 'grid', placeItems: 'center', fontSize: 27, fontWeight: 700
        }}>
          {settings.logo_data
            ? <img src={settings.logo_data} alt="" style={{ width: '100%', height: '100%', borderRadius: 20, objectFit: 'cover' }} />
            : 'V'}
        </div>

        <div className="h1">{settings.clinic_name || 'Vitalis'}</div>
        <div className="sub" style={{ marginTop: 2 }}>{settings.specialty}</div>

        {!role ? (
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 34 }}>
            <div className="pick" onClick={() => setRole('doctor')}>
              <div style={{ fontSize: 30 }}>👨‍⚕️</div>
              <div style={{ fontWeight: 600, marginTop: 7 }}>الطبيب</div>
            </div>
            <div className="pick" onClick={() => setRole('secretary')}>
              <div style={{ fontSize: 30 }}>💼</div>
              <div style={{ fontWeight: 600, marginTop: 7 }}>السكرتيرة</div>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className={shake ? 'shake' : ''} style={{ marginTop: 30, maxWidth: 300, marginInline: 'auto' }}>
            <div className="sub" style={{ marginBottom: 10 }}>
              {role === 'doctor' ? 'الطبيب' : 'السكرتيرة'}
            </div>
            <input className="fld" type="password" autoFocus value={pass} placeholder="كلمة المرور"
              onChange={e => { setPass(e.target.value); setErr('') }} style={{ textAlign: 'center' }} />
            {err && <div style={{ color: 'var(--r600)', fontSize: 13, marginTop: 8 }}>{err}</div>}
            <button className="btn pri xl" style={{ width: '100%', marginTop: 14 }} type="submit">دخول</button>
            <button type="button" className="btn sec sm" style={{ marginTop: 8 }} onClick={() => setRole(null)}>
              رجوع
            </button>
          </form>
        )}

        <div className="tiny" style={{ marginTop: 54, letterSpacing: '.03em' }}>
          Vitalis · تصميم د. علاء شاكر — حماة، سوريا
        </div>
      </div>
    </div>
  )
}
