import React, { useState, useEffect, useCallback } from 'react'
import { call, money } from '../lib/api'
import { Empty, Sheet } from '../components/UI'

const TYPE_LABEL = {
  lab: '🧪 نتائج فحوص', surgery: '🔪 أعمال جراحية', draft: '✎ زيارات غير مكتملة',
  debt: '💰 ديون', case: '📁 حالات بلا حراك'
}
const SNOOZE_OPTS = [[1, 'غدًا'], [7, 'بعد أسبوع'], [30, 'بعد شهر']]

export default function Pending({ onOpenPatient, refreshKey, compact }) {
  const [data, setData] = useState(null)
  const [snoozing, setSnoozing] = useState(null)

  const load = useCallback(async () => {
    try { setData(await call('pendingAll')) } catch { setData({ items: [], diffs: 0, snoozed: 0 }) }
  }, [])
  useEffect(() => { load() }, [load, refreshKey])

  if (!data) return null
  const { items, diffs, snoozed } = data

  const urgent = items.filter(i => i.urgent)
  const fresh = items.filter(i => !i.urgent && i.fresh)
  const rest = items.filter(i => !i.urgent && !i.fresh)

  const total = items.length + (diffs ? 1 : 0)
  if (total === 0 && !compact)
    return <div className="card"><Empty title="لا شيء معلّق" hint="كل الالتزامات مغلقة" /></div>

  const Row = ({ it }) => (
    <div className="row">
      <div className="grow" style={{ cursor: 'pointer' }} onClick={() => onOpenPatient(it.patient_id)}>
        <div className="rt">{it.title}</div>
        <div className="rs">
          {it.sub}
          {it.times > 1 && <span style={{ color: 'var(--a600)' }}> · مؤجّلة {it.times} مرات</span>}
        </div>
      </div>
      <button className="btn quiet sm" onClick={() => setSnoozing(it)}>تأجيل</button>
      <button className="btn sec sm" onClick={() => onOpenPatient(it.patient_id)}>فتح</button>
    </div>
  )

  const Group = ({ title, color, rows }) => rows.length === 0 ? null : (
    <>
      <div className="sec-t" style={{ color }}>{title} ({rows.length})</div>
      <div className="card flat">{rows.map(it => <Row key={it.key} it={it} />)}</div>
    </>
  )

  return (
    <div>
      {!compact && <>
        <div className="h1">تحتاج انتباهك</div>
        <div className="sub">{items.length} التزامًا مفتوحًا</div>
      </>}

      <Group title="🔴 متأخر" color="var(--r600)" rows={urgent} />
      <Group title="🟢 جديد — وصلت نتائج" color="var(--g600)" rows={fresh} />
      <Group title="🟡 مفتوح" color="var(--a600)" rows={rest} />

      {diffs > 0 &&
        <>
          <div className="sec-t">💰 فروقات لم تُراجَع</div>
          <div className="card flat">
            <div className="row">
              <div className="grow">
                <div className="rt">{diffs} فروقات مالية</div>
                <div className="rs">قبض أقل من المستحق — بانتظار موافقتك</div>
              </div>
              <button className="btn pri sm" onClick={async () => {
                const d = await call('diffList')
                await call('diffReview', d.map(x => x.id)); load()
              }}>موافقة على الكل</button>
            </div>
          </div>
        </>}

      {snoozed > 0 &&
        <div className="card flat mt16" style={{ opacity: .62 }}>
          <div className="row">
            <div className="grow">
              <div className="rt">{snoozed} مؤجّلة</div>
              <div className="rs">تعود في مواعيدها تلقائيًا</div>
            </div>
          </div>
        </div>}

      {snoozing &&
        <Sheet center title="تأجيل" subtitle={snoozing.title} onClose={() => setSnoozing(null)}>
          <div style={{ padding: '0 20px 18px' }}>
            {SNOOZE_OPTS.map(([d, l]) =>
              <button key={d} className="btn quiet" style={{ width: '100%', marginBottom: 8 }}
                onClick={async () => { await call('snooze', snoozing.key, d); setSnoozing(null); load() }}>
                {l}
              </button>)}
            <div className="tiny mt8">
              تختفي من القائمة ثم تعود في موعدها موسومة — لا تضيع أبدًا.
            </div>
          </div>
        </Sheet>}
    </div>
  )
}
