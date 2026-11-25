import React, { useState, useEffect, useCallback, useRef } from 'react'
import { call, fmtDate } from '../lib/api'
import { Sheet, Empty } from './UI'

export default function Attachments({ patientId, visitId, refreshKey }) {
  const [rows, setRows] = useState([])
  const [view, setView] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inp = useRef(null)
  const [drag, setDrag] = useState(false)

  const load = useCallback(() => { call('attachList', patientId).then(setRows).catch(() => { }) }, [patientId])
  useEffect(() => { load() }, [load, refreshKey])

  async function upload(files) {
    setErr(''); setBusy(true)
    try {
      for (const file of files) {
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file)
        })
        await call('attachAdd', { patientId, visitId, fileName: file.name, dataUrl })
      }
      load()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  async function open(id) {
    try { setView(await call('attachRead', id)) } catch (e) { setErr(e.message) }
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); upload(Array.from(e.dataTransfer.files)) }}>

      <div className="row-flex" style={{ marginBottom: 8 }}>
        <span className="lb" style={{ margin: 0 }}>المرفقات ({rows.length})</span>
        <span className="grow" />
        <button className="btn quiet sm" disabled={busy} onClick={() => inp.current?.click()}>
          {busy ? 'جارٍ الرفع…' : '+ إضافة'}
        </button>
        <input ref={inp} type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }}
          onChange={e => { upload(Array.from(e.target.files || [])); e.target.value = '' }} />
      </div>

      <div className="card" style={{
        padding: 14,
        outline: drag ? '2px dashed var(--b500)' : 'none',
        background: drag ? 'var(--b50)' : 'var(--card)'
      }}>
        {rows.length === 0
          ? <div className="empty" style={{ padding: 22 }}>
            <div className="sub">لا مرفقات</div>
            <div className="tiny mt8">اسحب صورة أو ملف PDF إلى هنا · أو اضغط «إضافة»</div>
          </div>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(104px,1fr))', gap: 10 }}>
            {rows.map(a =>
              <div key={a.id} style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => open(a.id)}>
                <div style={{
                  height: 82, borderRadius: 10, background: 'var(--s2)',
                  display: 'grid', placeItems: 'center', fontSize: 26
                }}>{a.kind === 'pdf' ? '📄' : '🖼️'}</div>
                <div className="tiny ellipsis" style={{ marginTop: 4 }}>{a.caption || a.file_name}</div>
                <div className="tiny">{fmtDate(a.created_at)}</div>
              </div>)}
          </div>}
      </div>

      {err && <div className="alert mt8">{err}</div>}

      {view &&
        <Sheet center wide title={view.file_name} subtitle={fmtDate(view.created_at)}
          onClose={() => setView(null)}
          footer={<>
            <button className="btn danger" onClick={async () => {
              await call('attachDelete', view.id); setView(null); load()
            }}>حذف</button>
            <span className="grow" />
            <button className="btn sec" onClick={() => setView(null)}>إغلاق</button>
          </>}>
          <div style={{ padding: '0 16px 12px', textAlign: 'center' }}>
            {view.kind === 'pdf'
              ? <div className="empty"><div className="h3">ملف PDF</div>
                <div className="sub">{Math.round((view.size_bytes || 0) / 1024)} كيلوبايت</div></div>
              : <img src={view.dataUrl} alt="" style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 10 }} />}
          </div>
        </Sheet>}
    </div>
  )
}
