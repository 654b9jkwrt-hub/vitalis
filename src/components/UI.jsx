import React, { useEffect, useRef, useState } from 'react'

/* ═══════ طبقة (Sheet) ═══════ */
export function Sheet({ title, subtitle, onClose, children, footer, center, wide }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className={'ov' + (center ? ' center' : '')} onMouseDown={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className={'sheet' + (wide ? ' wide' : '')}>
        {!center && <div className="grip" />}
        {(title || subtitle) &&
          <div className="sh-head">
            {title && <div className="h2">{title}</div>}
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>}
        {children}
        {footer && <div className="sh-foot">{footer}</div>}
      </div>
    </div>
  )
}

/* ═══════ حقل بأسطر اقتراح ═══════ */
export function Suggest({ value, onChange, fetcher, placeholder, className = 'fld', autoFocus }) {
  const [list, setList] = useState([])
  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(-1)
  const box = useRef(null)

  useEffect(() => {
    let dead = false
    if (!value || value.length < 2) { setList([]); return }
    const t = setTimeout(async () => {
      try { const r = await fetcher(value); if (!dead) { setList(r || []); setIdx(-1) } } catch { }
    }, 140)
    return () => { dead = true; clearTimeout(t) }
  }, [value])

  const pick = v => { onChange(v); setOpen(false); setList([]) }

  return (
    <div style={{ position: 'relative' }} ref={box}>
      <input className={className} value={value || ''} placeholder={placeholder} autoFocus={autoFocus}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        onKeyDown={e => {
          if (!open || !list.length) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, list.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, -1)) }
          if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); pick(list[idx]) }
        }} />
      {open && list.length > 0 &&
        <div className="sug" style={{ top: '100%', insetInlineStart: 0, marginTop: 4 }}>
          {list.map((s, i) =>
            <div key={i} className={i === idx ? 'on' : ''} onMouseDown={() => pick(s)}>{s}</div>)}
        </div>}
    </div>
  )
}

/* ═══════ مفتاح ═══════ */
export function Toggle({ on, onChange }) {
  return <div className={'toggle' + (on ? ' on' : '')} onClick={() => onChange(!on)} />
}

/* ═══════ حالة فارغة ═══════ */
export function Empty({ title, hint, action }) {
  return (
    <div className="empty">
      <div className="h3">{title}</div>
      {hint && <div className="sub">{hint}</div>}
      {action && <div className="mt16">{action}</div>}
    </div>
  )
}

/* ═══════ رسالة خطأ لطيفة ═══════ */
export function ErrorBar({ text, onClose }) {
  if (!text) return null
  return (
    <div className="alert mt12" style={{ justifyContent: 'space-between' }}>
      <span>{text}</span>
      <button className="ico" onClick={onClose}>✕</button>
    </div>
  )
}

/* ═══════ تأكيد بدل الحذف الفوري ═══════ */
export function Confirm({ title, body, confirmLabel = 'تأكيد', danger, onConfirm, onClose }) {
  return (
    <Sheet center title={title} subtitle={body} onClose={onClose}
      footer={<>
        <button className={'btn ' + (danger ? 'danger' : 'pri')} style={{ flex: 1 }}
          onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
        <button className="btn sec" onClick={onClose}>إلغاء</button>
      </>} />
  )
}
