import React, { useState, useEffect, useCallback } from 'react'
import { call } from '../lib/api'
import { TEMPLATES, TEMPLATE_BY_ID, groupsFor, bmi, bmiLabel } from '../lib/templates'
import ChipList from './ChipList'

/**
 * الحقول الاحترافية — تُفتح عند الحاجة فقط.
 * كل قائمة خيارات قابلة للإضافة في مكانها، والطبيب يعرّف حقولًا خاصة به.
 */
export default function ClinicalFields({ template, data, onChange, onTemplate }) {
  const [lists, setLists] = useState({})
  const [custom, setCustom] = useState([])
  const [open, setOpen] = useState(() => ({ [TEMPLATE_BY_ID(template).groups[0].key]: true }))
  const [pickTpl, setPickTpl] = useState(false)
  const [newField, setNewField] = useState(false)

  const loadLists = useCallback(async () => {
    try { setLists(await call('optionsAll')) } catch { }
    try { setCustom(await call('customFields', 'visit')) } catch { }
  }, [])
  useEffect(() => { loadLists() }, [loadLists])

  const groups = groupsFor(template, custom)
  const tpl = TEMPLATE_BY_ID(template)

  const set = (gk, fk, v) => onChange({ ...data, [gk]: { ...(data[gk] || {}), [fk]: v } })
  const get = (gk, fk) => data?.[gk]?.[fk]

  const filledCount = g => g.fields.reduce((n, f) => {
    const v = get(g.key, f.key)
    return n + ((v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)) ? 1 : 0)
  }, 0)
  const totalFilled = groups.reduce((n, g) => n + filledCount(g), 0)

  const fillNormal = g => onChange({ ...data, [g.key]: { ...(data[g.key] || {}), ...g.normal } })
  const clearGroup = g => { const d = { ...data }; delete d[g.key]; onChange(d) }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--sep)' }}>
      <div className="row-flex wrap" style={{ marginBottom: 10 }}>
        <span className="lb" style={{ margin: 0 }}>الحقول الاحترافية</span>
        <span className="bd bd-b">{tpl.name}</span>
        {totalFilled > 0 && <span className="bd bd-g">{totalFilled} حقلًا</span>}
        <span className="grow" />
        <button className="chip" onClick={() => setPickTpl(v => !v)}>
          {pickTpl ? 'إخفاء القوالب' : 'تغيير القالب'}
        </button>
      </div>

      {pickTpl &&
        <div className="row-flex wrap" style={{ marginBottom: 12 }}>
          {TEMPLATES.map(t =>
            <button key={t.id} className={'chip' + (t.id === tpl.id ? ' done' : '')}
              onClick={() => { onTemplate(t.id); setOpen({ [TEMPLATE_BY_ID(t.id).groups[0].key]: true }); setPickTpl(false) }}>
              {t.name}
            </button>)}
        </div>}

      {groups.map(g => {
        const isOpen = !!open[g.key]
        const n = filledCount(g)
        return (
          <div key={g.key} className="card" style={{ padding: 0, marginBottom: 8, overflow: 'hidden' }}>
            <div className="row click" style={{ minHeight: 44, padding: '10px 14px' }}
              onClick={() => setOpen(o => ({ ...o, [g.key]: !o[g.key] }))}>
              <span style={{ fontSize: 15 }}>{g.icon}</span>
              <div className="grow"><div className="rt" style={{ fontSize: 14 }}>{g.title}</div></div>
              {n > 0 && <span className="bd bd-g">{n}</span>}
              <span style={{ color: 'var(--tx3)', fontSize: 12 }}>{isOpen ? '▾' : '▸'}</span>
            </div>

            {isOpen &&
              <div style={{ padding: '4px 14px 14px' }}>
                {g.fields.length === 0 &&
                  <div className="tiny" style={{ padding: '8px 0' }}>لم تُعرّف حقولًا بعد.</div>}
                <div className="row-flex wrap" style={{ gap: 10 }}>
                  {g.fields.map(f =>
                    <Field key={f.key} f={f} g={g} get={get} set={set}
                      lists={lists} onListChanged={loadLists} />)}
                </div>
                <div className="row-flex wrap" style={{ marginTop: 10 }}>
                  {g.normal && <button className="chip" onClick={() => fillNormal(g)}>✓ ملء سريع: طبيعي</button>}
                  {n > 0 && <button className="chip" onClick={() => clearGroup(g)}>مسح المجموعة</button>}
                  {g.custom && <button className="chip" onClick={() => setNewField(true)}>＋ حقل جديد</button>}
                </div>
              </div>}
          </div>)
      })}

      {!custom.length &&
        <button className="btn quiet sm" style={{ width: '100%' }} onClick={() => setNewField(true)}>
          ⭐ أضف حقلًا خاصًا بك
        </button>}

      <div className="tiny mt8">
        كل الحقول اختيارية · أي قائمة خيارات فيها زر ＋ لإضافة ما ينقصها.
      </div>

      {newField &&
        <NewFieldSheet onClose={() => setNewField(false)}
          onDone={() => { setNewField(false); loadLists(); setOpen(o => ({ ...o, mine: true })) }} />}
    </div>
  )
}

/* ═══════════ الحقل الواحد ═══════════ */
function Field({ f, g, get, set, lists, onListChanged }) {
  const v = get(g.key, f.key)
  const width = f.w === '100%' || !f.w ? '100%' : f.w + 'px'

  if (f.type === 'computed') {
    const b = bmi(get('vitals', 'weight'), get('vitals', 'height'))
    return (
      <div style={{ width: f.w + 'px' }}>
        <div className="lb" style={{ marginBottom: 3 }}>{f.label}</div>
        <div className="fld num" style={{ textAlign: 'center', opacity: b ? 1 : .5 }}>{b || '—'}</div>
        {b && <div className="tiny center" style={{ marginTop: 2 }}>{bmiLabel(b)}</div>}
      </div>)
  }

  if (f.type === 'chips') {
    return (
      <div style={{ width: '100%' }}>
        <div className="lb" style={{ marginBottom: 4 }}>{f.label}</div>
        <ChipList listKey={f.list} options={lists[f.list] || []}
          value={v} onChange={val => set(g.key, f.key, val)} onAdded={onListChanged} />
      </div>)
  }

  if (f.type === 'scale') {
    const n = parseInt(v || 0, 10)
    return (
      <div style={{ width: '100%' }}>
        <div className="lb" style={{ marginBottom: 4 }}>{f.label} {n ? `— ${n}/10` : ''}</div>
        <div className="row-flex" style={{ gap: 4 }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(i =>
            <button key={i} onClick={() => set(g.key, f.key, n === i ? '' : i)}
              style={{
                flex: 1, height: 30, border: 'none', borderRadius: 7, cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                background: n >= i ? (i <= 3 ? 'var(--g600)' : i <= 6 ? 'var(--a600)' : 'var(--r600)') : 'var(--s2)',
                color: n >= i ? '#fff' : 'var(--tx3)'
              }}>{i}</button>)}
        </div>
      </div>)
  }

  if (f.type === 'textarea')
    return (
      <div style={{ width: '100%' }}>
        <div className="lb" style={{ marginBottom: 3 }}>{f.label}</div>
        <textarea className="fld" rows={2} value={v || ''} placeholder={f.ph}
          onChange={e => set(g.key, f.key, e.target.value)} />
      </div>)

  return (
    <div style={{ width }}>
      <div className="lb" style={{ marginBottom: 3 }}>
        {f.label}{f.unit ? <span style={{ fontWeight: 400 }}> ({f.unit})</span> : ''}
      </div>
      <input className={'fld' + (f.type === 'number' ? ' num' : '')}
        type={f.type === 'number' ? 'number' : 'text'} step={f.step}
        value={v || ''} placeholder={f.ph}
        style={f.type === 'number' ? { textAlign: 'center' } : null}
        onChange={e => set(g.key, f.key, e.target.value)} />
    </div>)
}

/* ═══════════ تعريف حقل جديد ═══════════ */
export function NewFieldSheet({ scope = 'visit', onClose, onDone }) {
  const [label, setLabel] = useState('')
  const [type, setType] = useState('text')
  const [unit, setUnit] = useState('')
  const [opts, setOpts] = useState('')
  const [err, setErr] = useState('')

  const TYPES = [
    ['text', 'نص قصير'], ['textarea', 'نص طويل'], ['number', 'رقم'],
    ['chips', 'خيارات'], ['scale', 'مقياس ١–١٠']
  ]

  async function save() {
    setErr('')
    try {
      await call('customFieldAdd', {
        scope, label, type, unit: unit || null,
        options: type === 'chips' ? opts.split(/[,،\n]/).map(s => s.trim()).filter(Boolean) : []
      })
      onDone()
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="ov center" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sheet">
        <div className="sh-head">
          <div className="h2">حقل جديد</div>
          <div className="sub">يظهر في كل زيارة ضمن مجموعة «حقولي»</div>
        </div>
        <div style={{ padding: '0 20px 14px' }}>
          <div className="lb">اسم الحقل</div>
          <input className="fld" autoFocus value={label} onChange={e => setLabel(e.target.value)}
            placeholder="مثال: قياس محيط البطن" />

          <div className="lb mt12">نوع الحقل</div>
          <div className="row-flex wrap">
            {TYPES.map(([v, l]) =>
              <button key={v} className={'chip' + (type === v ? ' done' : '')}
                onClick={() => setType(v)}>{l}</button>)}
          </div>

          {type === 'number' &&
            <>
              <div className="lb mt12">الوحدة (اختياري)</div>
              <input className="fld" value={unit} onChange={e => setUnit(e.target.value)}
                placeholder="سم · كغ · ملم" style={{ width: 160 }} />
            </>}

          {type === 'chips' &&
            <>
              <div className="lb mt12">الخيارات — افصل بينها بفاصلة</div>
              <textarea className="fld" rows={2} value={opts} onChange={e => setOpts(e.target.value)}
                placeholder="خفيف، متوسط، شديد" />
              <div className="tiny mt8">تستطيع إضافة خيارات أخرى لاحقًا من داخل الحقل نفسه.</div>
            </>}

          {err && <div className="alert mt12">{err}</div>}
        </div>
        <div className="sh-foot">
          <button className="btn pri" style={{ flex: 1 }} disabled={!label.trim()} onClick={save}>إضافة</button>
          <button className="btn sec" onClick={onClose}>إلغاء</button>
        </div>
      </div>
    </div>
  )
}
