import React, { useState, useEffect } from 'react'
import { call } from '../lib/api'

export default function Lock({ user, onUnlock, onLogout }) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)

  useEffect(() => {
    async function tryPin() {
      if (pin.length < 4) return
      try {
        const ok = await call('unlock', pin)
        if (ok) onUnlock()
        else { setShake(true); setTimeout(() => { setShake(false); setPin('') }, 400) }
      } catch { setShake(true); setTimeout(() => { setShake(false); setPin('') }, 400) }
    }
    tryPin()
  }, [pin])

  useEffect(() => {
    const h = e => {
      if (/^[0-9]$/.test(e.key)) setPin(p => (p.length < 4 ? p + e.key : p))
      if (e.key === 'Backspace') setPin(p => p.slice(0, -1))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <div className="fullscreen">
      <div className={'center ' + (shake ? 'shake' : '')} style={{ padding: 24 }}>
        <div style={{ fontSize: 34 }}>🔒</div>
        <div className="h2" style={{ marginTop: 10 }}>{user.name}</div>
        <div className="sub">أدخل الرمز</div>

        <div className="pins">
          {[0, 1, 2, 3].map(i => <div key={i} className={'pin' + (pin.length > i ? ' on' : '')} />)}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,64px)', gap: 12, justifyContent: 'center' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n =>
            <button key={n} className="btn quiet" style={{ height: 56, fontSize: 20 }}
              onClick={() => setPin(p => p.length < 4 ? p + n : p)}>{n}</button>)}
          <div />
          <button className="btn quiet" style={{ height: 56, fontSize: 20 }}
            onClick={() => setPin(p => p.length < 4 ? p + '0' : p)}>0</button>
          <button className="btn quiet" style={{ height: 56, fontSize: 18 }}
            onClick={() => setPin(p => p.slice(0, -1))}>⌫</button>
        </div>

        <button className="btn sec sm" style={{ marginTop: 20 }} onClick={onLogout}>
          تسجيل الخروج
        </button>
      </div>
    </div>
  )
}
