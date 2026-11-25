/**
 * قوالب الحقول الاحترافية — جراحة عامة
 * كل قائمة خيارات تُقرأ من قاعدة البيانات (list) — والطبيب يضيف ما يشاء.
 * القيم هنا مجرد مفاتيح، لا قوائم ثابتة.
 */

const VITALS = {
  key: 'vitals', title: 'العلامات الحيوية', icon: '🩺',
  fields: [
    { key: 'bp', label: 'الضغط', type: 'text', unit: 'ملم ز', w: 100, ph: '120/80' },
    { key: 'hr', label: 'النبض', type: 'number', unit: 'ن/د', w: 90 },
    { key: 'temp', label: 'الحرارة', type: 'number', unit: '°م', w: 90, step: '0.1' },
    { key: 'rr', label: 'التنفس', type: 'number', unit: 'ن/د', w: 90 },
    { key: 'spo2', label: 'الأكسجة', type: 'number', unit: '٪', w: 90 },
    { key: 'weight', label: 'الوزن', type: 'number', unit: 'كغ', w: 90, step: '0.5' },
    { key: 'height', label: 'الطول', type: 'number', unit: 'سم', w: 90 },
    { key: 'bmi', label: 'كتلة الجسم', type: 'computed', w: 100 }
  ]
}

const HISTORY = {
  key: 'history', title: 'السوابق', icon: '📋',
  fields: [
    { key: 'pmh', label: 'سوابق مرضية', type: 'chips', list: 'pmh' },
    { key: 'psh', label: 'سوابق جراحية', type: 'text', w: '100%', ph: 'العمليات السابقة وتواريخها' },
    { key: 'meds', label: 'أدوية حالية', type: 'chips', list: 'meds' },
    { key: 'allergy', label: 'حساسية', type: 'text', w: 220, ph: 'دوائية أو غذائية' },
    { key: 'social', label: 'عادات', type: 'chips', list: 'social' },
    { key: 'fh', label: 'سوابق عائلية', type: 'text', w: '100%' }
  ]
}

const HPI = {
  key: 'hpi', title: 'القصة الحالية', icon: '💬',
  fields: [
    { key: 'onset', label: 'البداية', type: 'text', w: 150, ph: 'منذ متى؟' },
    { key: 'site', label: 'الموقع', type: 'text', w: 190 },
    { key: 'character', label: 'الصفة', type: 'chips', list: 'pain_char' },
    { key: 'severity', label: 'الشدة', type: 'scale' },
    { key: 'radiation', label: 'الانتشار', type: 'text', w: 190 },
    { key: 'aggravating', label: 'ما يزيده', type: 'text', w: 190 },
    { key: 'relieving', label: 'ما يخففه', type: 'text', w: 190 },
    { key: 'assoc', label: 'أعراض مرافقة', type: 'chips', list: 'assoc' }
  ]
}

const EXAM_GENERAL = {
  key: 'exam', title: 'الفحص العام', icon: '🔍',
  normal: { general: 'واعٍ متوجه، حالة عامة جيدة', skin: 'طبيعي' },
  fields: [
    { key: 'general', label: 'الحالة العامة', type: 'text', w: '100%', ph: 'واعٍ متوجه، حالة عامة جيدة' },
    { key: 'skin', label: 'الجلد والأغشية', type: 'text', w: '100%', ph: 'لون طبيعي، بلا يرقان ولا شحوب' },
    { key: 'lymph', label: 'العقد اللمفية', type: 'text', w: '100%' }
  ]
}

const EXAM_ABDOMEN = {
  key: 'abdomen', title: 'فحص البطن', icon: '🫃',
  normal: { insp: 'بطن مسطح متناظر، بلا ندبات', pal: 'لين غير مؤلم، بلا كتل', perc: 'رنين طبيعي', ausc: 'أصوات معوية طبيعية' },
  fields: [
    { key: 'insp', label: 'التفتيش', type: 'text', w: '100%', ph: 'مسطح، ندبات، انتفاخ، فتوق' },
    { key: 'pal', label: 'الجس', type: 'text', w: '100%', ph: 'إيلام، دفاع، كتلة، ضخامة' },
    { key: 'perc', label: 'القرع', type: 'text', w: '100%', ph: 'رنين، أصمية، حبن' },
    { key: 'ausc', label: 'الإصغاء', type: 'text', w: '100%', ph: 'أصوات معوية' },
    { key: 'signs', label: 'علامات خاصة', type: 'chips', list: 'abd_signs' },
    { key: 'hernia_orifices', label: 'فتحات الفتق', type: 'text', w: '100%' },
    { key: 'dre', label: 'المس الشرجي', type: 'text', w: '100%', ph: 'إن أُجري' }
  ]
}

const EXAM_LOCAL = {
  key: 'local', title: 'الفحص الموضعي', icon: '📍',
  fields: [
    { key: 'site', label: 'الموقع', type: 'text', w: 200 },
    { key: 'size', label: 'الحجم', type: 'text', w: 150, ph: 'سم × سم' },
    { key: 'consistency', label: 'القوام', type: 'chips', list: 'mass_cons' },
    { key: 'mobility', label: 'الحركية', type: 'chips', list: 'mass_mob' },
    { key: 'tenderness', label: 'الإيلام', type: 'chips', list: 'tenderness' },
    { key: 'skin_over', label: 'الجلد فوقه', type: 'text', w: '100%' },
    { key: 'other', label: 'ملاحظات', type: 'textarea' }
  ]
}

const WOUND = {
  key: 'wound', title: 'حالة الجرح', icon: '🩹',
  fields: [
    { key: 'state', label: 'الحالة', type: 'chips', list: 'wound_state' },
    { key: 'edges', label: 'الحواف', type: 'chips', list: 'wound_edges' },
    { key: 'sutures', label: 'القطب', type: 'chips', list: 'wound_sutures' },
    { key: 'dressing', label: 'الإجراء', type: 'chips', list: 'wound_action' },
    { key: 'note', label: 'ملاحظة', type: 'text', w: '100%' }
  ]
}

const PREOP = {
  key: 'preop', title: 'تقييم ما قبل العملية', icon: '🔪',
  fields: [
    { key: 'planned', label: 'العملية المقررة', type: 'text', w: '100%' },
    { key: 'asa', label: 'تصنيف ASA', type: 'chips', list: 'asa' },
    { key: 'labs', label: 'التحاليل', type: 'chips', list: 'preop_labs' },
    { key: 'anesth_consult', label: 'استشارة التخدير', type: 'chips', list: 'anesth_consult' },
    { key: 'consent', label: 'الموافقة المستنيرة', type: 'chips', list: 'consent' },
    { key: 'fasting', label: 'تعليمات الصيام', type: 'text', w: '100%', ph: 'صائم 8 ساعات' },
    { key: 'risk', label: 'عوامل خطورة', type: 'textarea' }
  ]
}

const ASSESS = {
  key: 'assess', title: 'التشخيص والخطة', icon: '🎯',
  fields: [
    { key: 'ddx', label: 'التشخيص التفريقي', type: 'text', w: '100%', ph: 'الاحتمالات الأخرى' },
    { key: 'management', label: 'التدبير', type: 'chips', list: 'management' },
    { key: 'advice', label: 'التوصيات للمريض', type: 'textarea' }
  ]
}

/* مجموعة حقول الطبيب المخصصة — تُبنى من قاعدة البيانات */
export const CUSTOM_GROUP_KEY = 'mine'
export function customGroup(fields) {
  return {
    key: CUSTOM_GROUP_KEY, title: 'حقولي', icon: '⭐', custom: true,
    fields: (fields || []).map(f => ({
      key: f.id, label: f.label, type: f.type,
      list: f.list_key, unit: f.unit, w: f.type === 'text' ? 200 : '100%'
    }))
  }
}

export const TEMPLATES = [
  { id: 'general', name: 'معاينة عامة', groups: [HPI, HISTORY, VITALS, EXAM_GENERAL, ASSESS] },
  { id: 'abdomen', name: 'بطن حاد', groups: [HPI, VITALS, EXAM_GENERAL, EXAM_ABDOMEN, HISTORY, ASSESS] },
  { id: 'hernia', name: 'فتق', groups: [HPI, EXAM_ABDOMEN, EXAM_LOCAL, HISTORY, ASSESS] },
  { id: 'mass', name: 'كتلة أو ورم', groups: [HPI, EXAM_LOCAL, HISTORY, ASSESS] },
  { id: 'wound', name: 'متابعة جرح', groups: [WOUND, ASSESS] },
  { id: 'preop', name: 'ما قبل العملية', groups: [PREOP, VITALS, HISTORY] }
]

export const TEMPLATE_BY_ID = id => TEMPLATES.find(t => t.id === id) || TEMPLATES[0]

/** المجموعات كاملة = مجموعات القالب + مجموعة «حقولي» إن وُجدت */
export function groupsFor(templateId, custom) {
  const g = [...TEMPLATE_BY_ID(templateId).groups]
  if (custom && custom.length) g.push(customGroup(custom))
  return g
}

export function structToText(templateId, data, custom) {
  const groups = groupsFor(templateId, custom)
  const out = []
  for (const g of groups) {
    const lines = []
    for (const f of g.fields) {
      const v = data?.[g.key]?.[f.key]
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue
      const val = Array.isArray(v) ? v.join('، ') : String(v)
      lines.push(`${f.label}: ${val}${f.unit ? ' ' + f.unit : ''}`)
    }
    if (lines.length) out.push(`【${g.title}】\n` + lines.join(' · '))
  }
  return out.join('\n\n')
}

export function bmi(w, h) {
  const W = parseFloat(w), H = parseFloat(h)
  if (!W || !H) return ''
  const b = W / Math.pow(H / 100, 2)
  if (!isFinite(b) || b <= 0) return ''
  return b.toFixed(1)
}
export function bmiLabel(v) {
  const b = parseFloat(v)
  if (!b) return ''
  if (b < 18.5) return 'نقص وزن'
  if (b < 25) return 'طبيعي'
  if (b < 30) return 'زيادة وزن'
  if (b < 35) return 'بدانة I'
  if (b < 40) return 'بدانة II'
  return 'بدانة III'
}
