// جسر الواجهة إلى العملية الرئيسية
const bridge = window.vitalis

export async function call(fn, ...args) {
  const r = await bridge.call(fn, ...args)
  if (!r.ok) throw new Error(r.error)
  return r.data
}
export const print = (html, size) => bridge.print(html, size)
export const appInfo = () => bridge.info()

/* ═══════ أدوات التنسيق ═══════ */
export const money = (n) =>
  (n === null || n === undefined || n === '') ? '—' : Number(n).toLocaleString('en-US')

export const AR_MONTHS = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران',
  'تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول']
export const AR_DAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']

export function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]}`
}
export function fmtFull(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${AR_DAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
export function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
export function daysSince(iso) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 864e5)
}
export function minutesSince(iso) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
}
export const todayISO = () => new Date().toISOString().slice(0, 10)
export const initials = (name) => (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join(' ')
