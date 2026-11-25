import React, { useState, useEffect, useRef, useCallback } from 'react'
import { call, money, fmtDate, daysSince } from '../lib/api'
import { Sheet, Suggest, Empty } from '../components/UI'
import CloseVisit from '../components/CloseVisit'
import SurgerySheet from '../components/SurgerySheet'
import LabSheet from '../components/LabSheet'
import Attachments from '../components/Attachments'
import ClinicalFields from '../components/ClinicalFields'
import { structToText } from '../lib/templates'
import { reportHTML } from '../lib/print'

const FIELDS = [['complaint', 'شكوى'], ['exam', 'فحص'], ['diagnosis', 'تشخيص'], ['plan', 'خطة']]

export default function PatientFile({ user, settings, patientId, apptId, onBack, onChanged, onPause }) {
  const [file, setFile] = useState(null)
  const [visit, setVisit] = useState(null)
  const [cap, setCap] = useState('')
  const [saving, setSaving] = useState('')
  const [showFields, setShowFields] = useState(false)
  const [showPro, setShowPro] = useState(false)
  const [struct, setStruct] = useState({})
  const [template, setTemplate] = useState('general')
  const [distribute, setDistribute] = useState(false)
  const [assigned, setAssigned] = useState({})
  const [surgeries, setSurgeries] = useState([])
  const [labs, setLabs] = useState([])
  const [sheet, setSheet] = useState(null)   // closing | surgery | lab | med | case | edit | waive
  const [editSurg, setEditSurg] = useState(null)
  const [shortMenu, setShortMenu] = useState(false)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  const [lists, setLists] = useState({})
  const [customF, setCustomF] = useState([])
  const timer = useRef(null)
  const isDoctor = user.role === 'doctor'

  useEffect(() => {
    if (!isDoctor) return
    call('optionsAll', ['visit_kinds', 'short_types', 'waive_reasons']).then(setLists).catch(() => { })
    call('customFields', 'visit').then(setCustomF).catch(() => { })
  }, [isDoctor, tick])

  const load = useCallback(async () => {
    const f = await call('patientFile', patientId)
    setFile(f)
    if (isDoctor) {
      try { setSurgeries(await call('surgeryList', patientId)) } catch { }
    }
    try { setLabs(await call('labList', patientId)) } catch { }
    const draft = f.visits.find(v => v.status === 'draft')
    if (draft && isDoctor) {
      const full = await call('visitGet', draft.id)
      setVisit(full); setCap(full.capture || '')
      try { setStruct(full.struct ? JSON.parse(full.struct) : {}) } catch { setStruct({}) }
      setTemplate(full.template || 'general')
      setShowPro(!!full.struct)
    } else { setVisit(null); setCap(''); setStruct({}); setTemplate('general'); setShowPro(false) }
  }, [patientId, isDoctor])

  useEffect(() => { load() }, [load, tick])
  const refresh = () => { setTick(t => t + 1); onChanged?.() }

  /* ── المسودة الحية ── */
  function onCap(v) {
    setCap(v); setSaving('يُحفظ…')
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try { await call('visitSave', visit.id, { capture: v }); setSaving('حُفظت الآن'); setTimeout(() => setSaving(''), 1800) }
      catch (e) { setSaving('لم تُحفظ!'); setErr(e.message) }
    }, 450)
  }
  async function startVisit(kind) {
    try {
      const v = await call('visitStart', patientId, apptId || null, kind || 'كشف')
      const full = await call('visitGet', v.id)
      setVisit(full); setCap(full.capture || ''); onChanged?.()
      onPause?.({ visitId: full.id, patientId, name: file.patient.name })
    } catch (e) { setErr(e.message) }
  }
  async function shortVisit(type) {
    try {
      const r = await call('visitShort', patientId, type)
      setShortMenu(false); refresh()
      setSaving(r.covered ? 'سُجّلت — مشمولة' : `سُجّلت — ${money(r.amount)}`)
      setTimeout(() => setSaving(''), 2600)
    } catch (e) { setErr(e.message) }
  }
  async function assign(i, field) {
    const line = cap.split('\n')[i]?.trim(); if (!line) return
    const cur = visit[field] || ''
    const val = cur ? cur + ' · ' + line : line
    await call('visitSave', visit.id, { [field]: val })
    setVisit(v => ({ ...v, [field]: val }))
    setAssigned(a => ({ ...a, [i]: field }))
  }
  function saveField(k, v) {
    setVisit(x => ({ ...x, [k]: v }))
    clearTimeout(timer.current)
    timer.current = setTimeout(() => call('visitSave', visit.id, { [k]: v }).catch(() => { }), 400)
  }

  /* الحقول الاحترافية — حفظ فوري كالمسودة تمامًا */
  const proTimer = useRef(null)
  function saveStruct(next, tpl) {
    setStruct(next)
    const t = tpl || template
    setSaving('يُحفظ…')
    clearTimeout(proTimer.current)
    proTimer.current = setTimeout(async () => {
      try {
        await call('visitSave', visit.id, { struct: JSON.stringify(next), template: t })
        setSaving('حُفظت الآن'); setTimeout(() => setSaving(''), 1600)
      } catch (e) { setSaving('لم تُحفظ!'); setErr(e.message) }
    }, 450)
  }
  async function printReport() {
    const last = file.visits.find(v => v.status === 'closed')
    let full = null
    if (last) { try { full = await call('visitGet', last.id) } catch { } }
    let pro = ''
    try { if (full?.struct) pro = structToText(full.template, JSON.parse(full.struct), customF) } catch { }
    await window.vitalis.print(reportHTML({
      settings, patient: file.patient,
      fields: full ? {
        complaint: [full.complaint, full.capture].filter(Boolean).join('\n'),
        exam: [full.exam, pro].filter(Boolean).join('\n'),
        diagnosis: full.diagnosis, plan: full.plan
      } : {}
    }), 'A4')
  }

  if (!file) return <div className="main"><div className="empty">…</div></div>
  const p = file.patient
  const closed = file.visits.filter(v => v.status === 'closed')
  const lastClosed = closed[0]
  const openLabs = labs.filter(l => !l.seen_at)

  return (
    <div className="main">
      {/* ═══ الرأس ═══ */}
      <div className="row-flex wrap" style={{ alignItems: 'baseline' }}>
        <button className="ico" onClick={onBack}>→</button>
        <span className="h1">{p.name}</span>
        <span className="sub">
          {p.age ? `${p.age} سنة · ` : ''}{p.gender ? p.gender + ' · ' : ''}
          {p.phone ? <span className="num">{p.phone}</span> : (p.no_phone ? 'بلا هاتف' : '')}
          {' · ملف '}<span className="num">{p.file_no}</span>
        </span>
        <span className="grow" />
        <button className="btn quiet sm" onClick={() => setSheet('edit')}>تعديل البيانات</button>
        {isDoctor && <button className="btn sec sm" onClick={printReport}>تقرير طبي</button>}
        {isDoctor && <button className="btn danger sm" onClick={() => setSheet('delpatient')}>حذف</button>}
      </div>

      {isDoctor && (p.allergies || p.chronic) &&
        <div className="alert mt8" style={{ cursor: 'pointer' }} onClick={() => setSheet('med')}>
          ⚠ {[p.allergies, p.chronic].filter(Boolean).join(' · ')}
        </div>}
      {isDoctor && !p.allergies && !p.chronic &&
        <button className="btn sec sm mt8" style={{ paddingInline: 0 }} onClick={() => setSheet('med')}>
          + إضافة تحذير طبي
        </button>}

      {file.totals.balance > 0 &&
        <div className="row-flex mt8">
          <span className="bd bd-a">دين <span className="num">{money(file.totals.balance)}</span> ل.س</span>
          {isDoctor && <button className="btn sec sm" onClick={() => setSheet('waive')}>مسامحة</button>}
        </div>}

      {/* ═══ الحالة ═══ */}
      {isDoctor &&
        <div className="card mt12 row-flex wrap">
          <span className="bd bd-b">📁 {file.activeCase?.title || 'حالة مفتوحة'}</span>
          <span className="sub">{file.activeCase ? `منذ ${daysSince(file.activeCase.opened_at)} يومًا` : '—'}</span>
          <span className="grow" />
          <button className="btn sec sm" onClick={() => setSheet('case')}>حالة جديدة</button>
        </div>}

      {p.note_admin &&
        <div className="card" style={{ background: 'var(--b50)' }}>
          <div className="lb" style={{ color: 'var(--b600)' }}>ملاحظة الطبيب للاستقبال</div>
          <div style={{ fontSize: 14.5 }}>{p.note_admin}</div>
        </div>}

      {/* ═══ طلبات معلّقة ═══ */}
      {openLabs.length > 0 &&
        <div className="card" style={{ background: 'var(--a50)' }}>
          <div className="lb" style={{ color: 'var(--a600)' }}>🧪 طلبات فحوص معلّقة ({openLabs.length})</div>
          {openLabs.map(l =>
            <div key={l.id} className="row-flex wrap" style={{ padding: '5px 0' }}>
              <div className="grow">
                {isDoctor && l.items
                  ? <div style={{ fontSize: 14 }}>{JSON.parse(l.items).join(' · ')}</div>
                  : <div style={{ fontSize: 14 }}>طلب فحوص</div>}
                <div className="tiny">
                  {l.arrived_at ? `وصلت الأوراق — ${l.arrived_by}` : `منذ ${daysSince(l.created_at)} يومًا`}
                </div>
              </div>
              {!l.arrived_at &&
                <button className="btn quiet sm" onClick={async () => { await call('labArrived', l.id); refresh() }}>
                  أحضر الأوراق
                </button>}
              {isDoctor && l.arrived_at &&
                <button className="btn pri sm" onClick={async () => { await call('labSeen', l.id); refresh() }}>
                  رأيت النتيجة
                </button>}
            </div>)}
        </div>}

      {/* ═══ الأعمال الجراحية ═══ */}
      {isDoctor &&
        <>
          <div className="row-flex mt16" style={{ marginBottom: 8 }}>
            <span className="lb" style={{ margin: 0 }}>الأعمال الجراحية ({surgeries.length})</span>
            <span className="grow" />
            <button className="btn quiet sm" onClick={() => { setEditSurg(null); setSheet('surgery') }}>+ إضافة</button>
          </div>
          {surgeries.length > 0 &&
            <div className="card flat">
              {surgeries.map(s =>
                <div key={s.id} className="row click" onClick={() => { setEditSurg(s); setSheet('surgery') }}>
                  <span>🔪</span>
                  <div className="grow">
                    <div className="rt">{s.title}</div>
                    <div className="rs">
                      {s.scope === 'minor' ? 'إجراء — العيادة' : 'عملية — المشفى'}
                      {s.planned_day ? ` · ${s.planned_day}` : (s.status === 'planned' ? ' · بلا موعد' : '')}
                      {s.fee ? <> · أجر <span className="num">{money(s.fee)}</span></> : ''}
                    </div>
                  </div>
                  <span className={'bd ' + (s.status === 'done' ? 'bd-g' : s.status === 'cancelled' ? 'bd-y' : 'bd-a')}>
                    {{ planned: 'مقرر', done: 'منفّذ', cancelled: 'ملغى' }[s.status]}
                  </span>
                  <button className="btn danger sm" onClick={async e => {
                    e.stopPropagation()
                    try { await call('surgeryDelete', s.id); refresh() } catch (ex) { setErr(ex.message) }
                  }}>حذف</button>
                </div>)}
            </div>}
        </>}

      {/* ═══ آخر زيارة ═══ */}
      {isDoctor && lastClosed && <LastVisit id={lastClosed.id} custom={customF} />}

      {/* ═══ الزيارة الجارية ═══ */}
      {isDoctor && (visit ? (
        <div className="card hi">
          <div className="row-flex" style={{ marginBottom: 9 }}>
            <span className="lb" style={{ margin: 0 }}>✎ التقاط سريع — {visit.kind}</span>
            <span className="grow" /><span className="saving">{saving}</span>
          </div>
          <textarea className="fld bare" rows={Math.max(4, cap.split('\n').length + 1)}
            value={cap} onChange={e => onCap(e.target.value)} autoFocus
            placeholder="اكتب بحرية… كل حرف يُحفظ فورًا. لا يوجد زر حفظ." />

          {distribute &&
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--sep)' }}>
              <div className="lb">وزّع الأسطر — اختياري</div>
              {cap.split('\n').map((l, i) => l.trim() && (
                <div className="capline" key={i}>
                  <span className="txt">{l}</span>
                  {FIELDS.map(([k, lb]) =>
                    <button key={k} className={'chip' + (assigned[i] === k ? ' done' : '')}
                      onClick={() => assign(i, k)}>{lb}</button>)}
                </div>))}
              <div className="tiny mt8">إن لم توزّع شيئًا، يبقى النص كاملًا كسجل صالح.</div>
            </div>}

          {showFields &&
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--sep)' }}>
              {FIELDS.map(([k, lb]) =>
                <div key={k} style={{ marginBottom: 9 }}>
                  <div className="lb" style={{ marginBottom: 3 }}>{lb}</div>
                  {k === 'diagnosis'
                    ? <Suggest value={visit.diagnosis || ''} onChange={v => saveField('diagnosis', v)}
                      fetcher={q => call('diagSuggest', q)} placeholder="اكتب بحرية — تظهر اقتراحات مما كتبته سابقًا" />
                    : <input className="fld" value={visit[k] || ''} onChange={e => saveField(k, e.target.value)} />}
                </div>)}
            </div>}

          {showPro &&
            <ClinicalFields template={template} data={struct}
              onChange={saveStruct}
              onTemplate={t => { setTemplate(t); saveStruct(struct, t) }} />}

          <div className="row-flex wrap" style={{ marginTop: 13 }}>
            <button className="btn quiet sm" onClick={() => setDistribute(d => !d)}>
              {distribute ? 'إخفاء التوزيع' : 'وزّع على الحقول'}
            </button>
            <button className={'btn sm ' + (showPro ? 'sec' : 'quiet')} onClick={() => setShowPro(f => !f)}>
              {showPro ? 'إخفاء الحقول الاحترافية' : '＋ حقول احترافية'}
            </button>
            <button className="btn quiet sm" onClick={() => setShowFields(f => !f)}>
              {showFields ? 'إخفاء المختصرة' : 'الحقول المختصرة'}
            </button>
            <button className="btn quiet sm" onClick={() => setSheet('lab')}>🧪 طلب فحوص</button>
            <button className="btn quiet sm" onClick={() => { setEditSurg(null); setSheet('surgery') }}>🔪 عمل جراحي</button>
            <span className="grow" />
            <button className="btn pri" onClick={() => setSheet('closing')}>إنهاء الزيارة</button>
          </div>
        </div>
      ) : (
        <div className="card mt12 row-flex wrap">
          {(lists.visit_kinds || [{ value: 'كشف' }, { value: 'مراجعة' }]).map((k, i) =>
            <button key={k.value} className={'btn ' + (i === 0 ? 'pri' : 'sec')}
              onClick={() => startVisit(k.value)}>
              {i === 0 ? `بدء زيارة — ${k.value}` : k.value}
            </button>)}
          <span className="grow" />
          <div style={{ position: 'relative' }}>
            <button className="btn quiet" onClick={() => setShortMenu(s => !s)}>+ زيارة قصيرة</button>
            {shortMenu &&
              <div className="sug" style={{ insetInlineEnd: 0, top: '100%', marginTop: 5 }}>
                {(lists.short_types || [{ value: 'ضماد' }]).map(t =>
                  <div key={t.value} onClick={() => shortVisit(t.value)}>{t.value}</div>)}
              </div>}
          </div>
        </div>
      ))}

      {/* ═══ المرفقات ═══ */}
      {isDoctor && <div className="mt24"><Attachments patientId={patientId} visitId={visit?.id} refreshKey={tick} /></div>}

      {/* ═══ الزيارات السابقة ═══ */}
      <div className="lb mt24">الزيارات السابقة</div>
      {closed.length === 0
        ? <Empty title="لا زيارات بعد" hint={isDoctor ? 'ابدأ الزيارة الأولى من الأعلى' : ''} />
        : <div className="card flat">{closed.map(v =>
          <VisitRow key={v.id} v={v} isDoctor={isDoctor} custom={customF} onDeleted={refresh} onErr={setErr} />)}</div>}

      {/* ═══ الحساب ═══ */}
      <div className="lb mt24">الحساب</div>
      <div className="card flat">
        <div className="row"><div className="grow"><div className="rt">إجمالي المستحق</div></div>
          <span className="money">{money(file.totals.due)}</span></div>
        <div className="row"><div className="grow"><div className="rt">المقبوض</div></div>
          <span className="money" style={{ color: 'var(--g600)' }}>{money(file.totals.paid)}</span></div>
        {file.totals.waived > 0 &&
          <div className="row"><div className="grow"><div className="rt">مسامحة</div>
            <div className="rs">أعفاها الطبيب</div></div>
            <span className="money" style={{ color: 'var(--b600)' }}>{money(file.totals.waived)}</span></div>}
        <div className="row"><div className="grow"><div className="rt">الرصيد</div></div>
          <span className="money" style={{ color: file.totals.balance > 0 ? 'var(--a600)' : 'var(--tx2)' }}>
            {money(file.totals.balance)}</span></div>
      </div>

      {err && <div className="alert mt12">{err}</div>}

      {/* ═══ الطبقات ═══ */}
      {sheet === 'closing' && visit &&
        <CloseVisit visit={visit} patient={p} settings={settings}
          onClose={() => setSheet(null)}
          onClosed={() => { setSheet(null); setVisit(null); setCap(''); refresh(); onPause?.(null) }} />}

      {sheet === 'surgery' &&
        <SurgerySheet patientId={patientId} visitId={visit?.id} initial={editSurg}
          onClose={() => { setSheet(null); setEditSurg(null) }} onDone={refresh} />}

      {sheet === 'lab' &&
        <LabSheet patientId={patientId} visitId={visit?.id} patient={p} settings={settings}
          diagnosis={visit?.diagnosis} onClose={() => setSheet(null)} onDone={refresh} />}

      {sheet === 'med' && <MedSheet p={p} onClose={() => setSheet(null)} onDone={refresh} />}
      {sheet === 'case' && <CaseSheet patientId={patientId} onClose={() => setSheet(null)} onDone={refresh} />}
      {sheet === 'edit' && <EditSheet p={p} isDoctor={isDoctor} onClose={() => setSheet(null)} onDone={refresh} />}
      {sheet === 'delpatient' &&
        <DeletePatient p={p} counts={{ visits: closed.length, pays: file.payments.length }}
          onClose={() => setSheet(null)} onArchived={onBack} onDeleted={onBack} />}
      {sheet === 'waive' &&
        <WaiveSheet p={p} balance={file.totals.balance} reasons={lists.waive_reasons || []}
          onClose={() => setSheet(null)} onDone={refresh} />}
    </div>
  )
}

/* ═══ آخر زيارة ═══ */
function LastVisit({ id, custom }) {
  const [v, setV] = useState(null)
  useEffect(() => { call('visitGet', id).then(setV).catch(() => { }) }, [id])
  if (!v) return null
  const text = [v.capture, v.plan].filter(Boolean).join('\n') || v.complaint || '—'
  let pro = ''
  try { if (v.struct) pro = structToText(v.template, JSON.parse(v.struct), custom) } catch { }
  return (
    <div className="card">
      <div className="lb">آخر زيارة — {fmtDate(v.closed_at)} · {v.kind}</div>
      <div style={{ fontSize: 14.5, whiteSpace: 'pre-wrap' }}>{text}</div>
      {pro &&
        <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', color: 'var(--tx2)', marginTop: 8 }}>{pro}</div>}
      {v.diagnosis && <div className="mt8"><span className="bd bd-b">{v.diagnosis}</span></div>}
    </div>
  )
}

function VisitRow({ v, isDoctor, custom, onDeleted, onErr }) {
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState(null)
  const [confirm, setConfirm] = useState(false)
  async function toggle() {
    if (!isDoctor) return
    if (!open && !full) { try { setFull(await call('visitGet', v.id)) } catch { } }
    setOpen(o => !o)
  }
  return (
    <>
      <div className={'row' + (isDoctor ? ' click' : '')} onClick={toggle}>
        <span className="st" style={{ width: 74 }}>{fmtDate(v.closed_at || v.started_at)}</span>
        <div className="grow"><div className="rt">{v.kind}{v.short_type ? ` — ${v.short_type}` : ''}</div></div>
        {v.covered ? <span className="bd bd-g">مشمول</span>
          : <span className="money" style={{ fontSize: 13.5 }}>{money(v.amount_due)}</span>}
        {isDoctor &&
          <button className="btn danger sm" onClick={e => { e.stopPropagation(); setConfirm(true) }}>حذف</button>}
      </div>

      {confirm &&
        <Sheet center title="حذف الزيارة"
          subtitle={`${v.kind} — ${fmtDate(v.closed_at || v.started_at)}`}
          onClose={() => setConfirm(false)}
          footer={<>
            <button className="btn danger" style={{ flex: 1 }} onClick={async () => {
              try { await call('visitDelete', v.id); setConfirm(false); onDeleted?.() }
              catch (e) { onErr?.(e.message); setConfirm(false) }
            }}>حذف نهائيًا</button>
            <button className="btn sec" onClick={() => setConfirm(false)}>إلغاء</button>
          </>}>
          <div style={{ padding: '0 20px 14px' }}>
            <div className="alert">⚠ لا يمكن التراجع — لكن نسخة تُحفظ في سجل المحذوفات</div>
            <div className="tiny mt8">
              إن كان على الزيارة دفعات، احذف الدفعات أولًا من شاشة الصندوق.
            </div>
          </div>
        </Sheet>}
      {open && full &&
        <div style={{ padding: '4px 18px 14px', background: 'var(--bg)' }}>
          {full.capture && <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{full.capture}</div>}
          {full.struct && (() => {
            let t = ''
            try { t = structToText(full.template, JSON.parse(full.struct), custom) } catch { }
            return t ? <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, color: 'var(--tx2)', marginTop: 8 }}>{t}</div> : null
          })()}
          {full.diagnosis && <div className="mt8"><span className="bd bd-b">{full.diagnosis}</span></div>}
          {full.prescription &&
            <div className="mt8 tiny">💊 {JSON.parse(full.prescription.items).map(i => i.name_ar).join(' · ')}</div>}
          {full.edited_original && <div className="tiny mt8" style={{ color: 'var(--a600)' }}>⚠ عُدّلت — النص الأصلي محفوظ</div>}
        </div>}
    </>
  )
}

/* ═══ حذف المريض ═══ */
function DeletePatient({ p, counts, onClose, onArchived, onDeleted }) {
  const [mode, setMode] = useState(null)     // archive | hard
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (!mode)
    return (
      <Sheet center title={`حذف ${p.name}`} onClose={onClose}>
        <div style={{ padding: '0 20px 18px' }}>
          <div className="card" style={{ background: 'var(--bg)', marginBottom: 10 }}>
            <div className="rt">📦 الأرشفة — الخيار الآمن</div>
            <div className="rs mt8">
              يختفي المريض من البحث والقوائم، وكل بياناته محفوظة، ويمكن استرجاعه متى شئت
              من الإعدادات ← الأرشيف.
            </div>
            <button className="btn pri" style={{ width: '100%', marginTop: 10 }}
              onClick={() => setMode('archive')}>أرشفة</button>
          </div>

          <div className="card" style={{ background: 'var(--r50)' }}>
            <div className="rt" style={{ color: 'var(--r600)' }}>🗑 الحذف النهائي</div>
            <div className="rs mt8">
              يمحو المريض و{counts.visits} زيارة و{counts.pays} دفعة وكل المرفقات.
              <b> لا يمكن التراجع.</b>
            </div>
            <button className="btn danger" style={{ width: '100%', marginTop: 10 }}
              onClick={() => setMode('hard')}>حذف نهائي</button>
          </div>
        </div>
      </Sheet>)

  if (mode === 'archive')
    return (
      <Sheet center title="أرشفة المريض" subtitle={p.name} onClose={onClose}
        footer={<>
          <button className="btn pri" style={{ flex: 1 }} disabled={busy} onClick={async () => {
            setBusy(true)
            try { await call('patientArchive', p.id); onClose(); onArchived?.() }
            catch (e) { setErr(e.message); setBusy(false) }
          }}>تأكيد الأرشفة</button>
          <button className="btn sec" onClick={() => setMode(null)}>رجوع</button>
        </>}>
        <div style={{ padding: '0 20px 14px' }}>
          <div className="tiny">يمكن استرجاعه في أي وقت من الإعدادات ← الأرشيف.</div>
          {err && <div className="alert mt8">{err}</div>}
        </div>
      </Sheet>)

  return (
    <Sheet center title="حذف نهائي" subtitle="لا يمكن التراجع عن هذه الخطوة" onClose={onClose}
      footer={<>
        <button className="btn danger" style={{ flex: 1 }}
          disabled={busy || name.trim() !== p.name.trim()} onClick={async () => {
            setBusy(true)
            try { await call('patientDelete', p.id, name); onClose(); onDeleted?.() }
            catch (e) { setErr(e.message); setBusy(false) }
          }}>احذف نهائيًا</button>
        <button className="btn sec" onClick={() => setMode(null)}>رجوع</button>
      </>}>
      <div style={{ padding: '0 20px 14px' }}>
        <div className="alert">
          ⚠ سيُمحى {counts.visits} زيارة و{counts.pays} دفعة وكل المرفقات
        </div>
        <div className="lb mt16">اكتب اسم المريض للتأكيد</div>
        <input className="fld" autoFocus value={name} onChange={e => setName(e.target.value)}
          placeholder={p.name} style={{ textAlign: 'center' }} />
        {err && <div className="alert mt8">{err}</div>}
      </div>
    </Sheet>)
}

/* ═══ المسامحة على الدين ═══ */
function WaiveSheet({ p, balance, reasons = [], onClose, onDone }) {
  const [amount, setAmount] = useState(String(balance))
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const REASONS = reasons.map(r => r.value)
  const amt = Number(String(amount).replace(/\D/g, '') || 0)

  async function submit() {
    setErr(''); setBusy(true)
    try { await call('waive', { patientId: p.id, amount: amt, reason: reason || null }); onDone(); onClose() }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <Sheet title={`مسامحة ${p.name}`} subtitle="الإعفاء ليس قبضًا — لا يُحسب دخلًا" onClose={onClose}
      footer={<button className="btn pri xl" style={{ width: '100%' }} disabled={busy || amt <= 0} onClick={submit}>
        تأكيد المسامحة</button>}>
      <div style={{ padding: '4px 24px 18px', textAlign: 'center' }}>
        <div className="lb">الدين الحالي</div>
        <div className="money" style={{ fontSize: 28, color: 'var(--a600)' }}>{money(balance)}</div>

        <div className="lb mt16">المبلغ المُسامَح به</div>
        <input className="fld num" autoFocus value={amount}
          onChange={e => setAmount(e.target.value.replace(/\D/g, ''))}
          style={{ textAlign: 'center', fontSize: 21, fontWeight: 600 }} />
        <div className="row-flex mt8" style={{ justifyContent: 'center' }}>
          <button className="chip" onClick={() => setAmount(String(balance))}>الدين كاملًا</button>
          <button className="chip" onClick={() => setAmount(String(Math.round(balance / 2)))}>النصف</button>
        </div>
        {amt > 0 && amt < balance &&
          <div className="tiny mt8">يبقى عليه <span className="num">{money(balance - amt)}</span></div>}

        <div className="lb mt16">السبب (اختياري)</div>
        <input className="fld" value={reason} onChange={e => setReason(e.target.value)} placeholder="يُسجَّل في السجل" />
        <div className="row-flex wrap mt8" style={{ justifyContent: 'center' }}>
          {REASONS.map(r => <button key={r} className="chip" onClick={() => setReason(r)}>{r}</button>)}
        </div>

        <div className="tiny mt16" style={{ color: 'var(--tx2)' }}>
          ستُبلَّغ السكرتيرة بألا تطالب بهذا المبلغ · والحدث يُسجَّل باسمك
        </div>
        {err && <div className="alert mt12">{err}</div>}
      </div>
    </Sheet>
  )
}

function MedSheet({ p, onClose, onDone }) {
  const [m, setM] = useState({ allergies: p.allergies || '', chronic: p.chronic || '', note_admin: p.note_admin || '' })
  const [err, setErr] = useState('')
  return (
    <Sheet center title="التحذيرات الطبية" onClose={onClose}
      footer={<><button className="btn pri" style={{ flex: 1 }} onClick={async () => {
        try { await call('patientUpdate', p.id, m); onDone(); onClose() } catch (e) { setErr(e.message) }
      }}>حفظ</button><button className="btn sec" onClick={onClose}>إلغاء</button></>}>
      <div style={{ padding: '0 20px 14px' }}>
        <div className="lb">الحساسيات</div>
        <input className="fld" autoFocus value={m.allergies}
          onChange={e => setM(s => ({ ...s, allergies: e.target.value }))} placeholder="مثال: حساسية بنسلين" />
        <div className="lb mt12">أمراض مزمنة / أدوية دائمة</div>
        <input className="fld" value={m.chronic}
          onChange={e => setM(s => ({ ...s, chronic: e.target.value }))} placeholder="مثال: سكري · مميعات دم" />
        <div className="lb mt12">ملاحظة للسكرتيرة</div>
        <input className="fld" value={m.note_admin}
          onChange={e => setM(s => ({ ...s, note_admin: e.target.value }))} placeholder="مثال: يحضر التحاليل معه" />
        {err && <div className="alert mt12">{err}</div>}
      </div>
    </Sheet>
  )
}

function CaseSheet({ patientId, onClose, onDone }) {
  const [t, setT] = useState('')
  return (
    <Sheet center title="حالة جديدة" subtitle="تُغلق الحالة الحالية ويبدأ سياق جديد" onClose={onClose}
      footer={<><button className="btn pri" style={{ flex: 1 }} onClick={async () => {
        await call('caseNew', patientId, t.trim() || null); onDone(); onClose()
      }}>فتح الحالة</button><button className="btn sec" onClick={onClose}>إلغاء</button></>}>
      <div style={{ padding: '0 20px 14px' }}>
        <input className="fld" autoFocus value={t} onChange={e => setT(e.target.value)}
          placeholder="عنوان الحالة — مثال: فتق إربي أيمن" />
      </div>
    </Sheet>
  )
}

function EditSheet({ p, isDoctor, onClose, onDone }) {
  const [f, setF] = useState({
    name: p.name || '', phone: p.phone || '', no_phone: !!p.no_phone,
    contact_phone: p.contact_phone || '', contact_relation: p.contact_relation || '',
    age: p.age || '', gender: p.gender || '', address: p.address || '', referred_by: p.referred_by || ''
  })
  const [err, setErr] = useState('')
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  return (
    <Sheet center title="تعديل بيانات المريض" onClose={onClose}
      footer={<><button className="btn pri" style={{ flex: 1 }} onClick={async () => {
        try { await call('patientUpdate', p.id, { ...f, no_phone: f.no_phone ? 1 : 0 }); onDone(); onClose() }
        catch (e) { setErr(e.message) }
      }}>حفظ</button><button className="btn sec" onClick={onClose}>إلغاء</button></>}>
      <div style={{ padding: '0 20px 14px' }}>
        <input className="fld" value={f.name} onChange={e => set('name', e.target.value)}
          placeholder="الاسم" style={{ marginBottom: 9 }} />
        <input className="fld num" value={f.phone} onChange={e => set('phone', e.target.value)}
          placeholder="الهاتف" style={{ marginBottom: 9, textAlign: 'right' }} />
        <div className="row" style={{ padding: '6px 0' }}>
          <div className="grow"><div className="rt" style={{ fontSize: 14 }}>لا يملك هاتفًا</div></div>
          <div className={'toggle' + (f.no_phone ? ' on' : '')} onClick={() => set('no_phone', !f.no_phone)} />
        </div>
        {f.no_phone &&
          <div style={{ display: 'flex', gap: 8, marginBottom: 9 }}>
            <input className="fld num" value={f.contact_phone} onChange={e => set('contact_phone', e.target.value)}
              placeholder="هاتف للتواصل" style={{ textAlign: 'right' }} />
            <input className="fld" value={f.contact_relation} onChange={e => set('contact_relation', e.target.value)}
              placeholder="الصلة" style={{ maxWidth: 110 }} />
          </div>}
        <div style={{ display: 'flex', gap: 8, marginBottom: 9 }}>
          <input className="fld num" value={f.age} onChange={e => set('age', e.target.value.replace(/\D/g, ''))}
            placeholder="العمر" style={{ maxWidth: 110, textAlign: 'center' }} />
          <div className="seg" style={{ flex: 1 }}>
            {['ذكر', 'أنثى'].map(g =>
              <button key={g} className={f.gender === g ? 'on' : ''} style={{ flex: 1 }}
                onClick={() => set('gender', g)}>{g}</button>)}
          </div>
        </div>
        <input className="fld" value={f.address} onChange={e => set('address', e.target.value)}
          placeholder="العنوان" style={{ marginBottom: 9 }} />
        <input className="fld" value={f.referred_by} onChange={e => set('referred_by', e.target.value)}
          placeholder="جهة التحويل" />
        {err && <div className="alert mt12">{err}</div>}
      </div>
    </Sheet>
  )
}
