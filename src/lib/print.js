/* قوالب الطباعة — الترويسة من النظام على ورق أبيض (قرار ㊶) */

const AR_MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول']

function today() {
  const d = new Date()
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function shell({ settings, patient, size, title, body }) {
  const isA5 = size === 'A5'
  const logo = settings.logo_data
    ? `<img src="${settings.logo_data}" style="width:17mm;height:17mm;object-fit:contain">`
    : `<div style="width:17mm;height:17mm;border-radius:4mm;background:#0E90DE;color:#fff;
         display:flex;align-items:center;justify-content:center;font-size:6mm;font-weight:700">V</div>`

  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>
  @page { size:${isA5 ? 'A5' : 'A4'}; margin:12mm 14mm; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"SF Arabic","Geeza Pro","Segoe UI",Tahoma,sans-serif;
       color:#111;font-size:${isA5 ? '11.5pt' : '12pt'};line-height:1.6;-webkit-print-color-adjust:exact}
  .num{font-variant-numeric:tabular-nums;direction:ltr;display:inline-block}
  .head{display:flex;gap:4mm;align-items:flex-start;padding-bottom:3mm;border-bottom:.6mm solid #222}
  .cname{font-size:${isA5 ? '13pt' : '15pt'};font-weight:700}
  .csub{font-size:${isA5 ? '9pt' : '10pt'};color:#444}
  .caddr{font-size:${isA5 ? '8pt' : '9pt'};color:#666}
  .meta{display:flex;justify-content:space-between;font-size:${isA5 ? '9pt' : '10pt'};
        color:#333;margin-top:3mm;padding-bottom:2mm;border-bottom:.2mm solid #DDD}
  .title{text-align:center;font-size:${isA5 ? '12pt' : '14pt'};font-weight:700;margin:5mm 0 4mm}
  .item{margin-bottom:4.5mm}
  .item b{font-size:${isA5 ? '11.5pt' : '12.5pt'}}
  .item .dose{color:#333;margin-top:.6mm}
  .lat{color:#666;font-size:${isA5 ? '9pt' : '10pt'};direction:ltr;display:inline-block}
  .notes{border-top:.2mm solid #DDD;margin-top:5mm;padding-top:2.5mm;font-size:${isA5 ? '9.5pt' : '10.5pt'};color:#333}
  .sign{text-align:left;margin-top:${isA5 ? '10mm' : '18mm'};font-size:${isA5 ? '9pt' : '10pt'};color:#444}
  .sign .line{margin-top:8mm;border-top:.2mm solid #999;width:45mm;margin-inline-start:auto}
  .foot{position:fixed;bottom:6mm;left:0;right:0;text-align:center;
        font-size:6.5pt;color:#AAA;letter-spacing:.02em}
  .field{margin-bottom:5mm}
  .field .lb{font-size:9.5pt;color:#555;font-weight:600;margin-bottom:1mm}
  .field .box{border-bottom:.2mm solid #CCC;min-height:9mm;white-space:pre-wrap}
</style></head><body>

<div class="head">
  ${logo}
  <div>
    <div class="cname">${esc(settings.clinic_name)}</div>
    <div class="csub">${esc(settings.specialty)}</div>
    <div class="caddr">${esc(settings.address)}${settings.phone ? ' · <span class="num">' + esc(settings.phone) + '</span>' : ''}</div>
  </div>
</div>

<div class="meta">
  <span>${esc(patient.name)}${patient.age ? ' · ' + patient.age + ' سنة' : ''}</span>
  <span>ملف <span class="num">${patient.file_no ?? ''}</span> · ${today()}</span>
</div>

<div class="title">${title}</div>
${body}

<div class="sign">
  ${esc(settings.doctor_name)}
  <div class="line"></div>
  <div style="margin-top:1mm">التوقيع والختم</div>
</div>

<div class="foot">Vitalis · تصميم د. علاء شاكر — حماة، سوريا</div>
</body></html>`
}

/* ═══ الوصفة — A5 ═══ */
export function prescriptionHTML({ settings, patient, items = [], notes }) {
  const AR_NUM = ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '١٠', '١١', '١٢']
  const body = `
    ${items.map((it, i) => {
    const showAr = it.print_mode !== 'lat'
    const showLat = it.print_mode !== 'ar' && it.name_lat
    return `<div class="item">
        <b>${AR_NUM[i] || (i + 1)}· ${showAr ? esc(it.name_ar) : esc(it.name_lat)}</b>
        ${showAr && showLat ? ` <span class="lat">(${esc(it.name_lat)})</span>` : ''}
        ${it.dose ? `<div class="dose">${esc(it.dose)}</div>` : ''}
      </div>`
  }).join('')}
    ${notes ? `<div class="notes">ملاحظات: ${esc(notes)}</div>` : ''}`
  return shell({ settings, patient, size: 'A5', title: 'الوصفة', body })
}

/* ═══ طلب الفحوص — A5 ═══ */
export function labRequestHTML({ settings, patient, items = [], diagnosis, note }) {
  const body = `
    <div style="margin-bottom:4mm;font-weight:600">المطلوب:</div>
    ${items.map(t => `<div class="item">▫ ${esc(t)}</div>`).join('')}
    ${diagnosis ? `<div class="notes">التشخيص المبدئي: ${esc(diagnosis)}</div>` : ''}
    ${note ? `<div class="notes" style="border:none;padding-top:1mm">ملاحظة: ${esc(note)}</div>` : ''}`
  return shell({ settings, patient, size: 'A5', title: 'طلب فحوص', body })
}

/* ═══ التقرير الطبي — A4 ═══ */
export function reportHTML({ settings, patient, fields = {} }) {
  const F = (lb, val) => `<div class="field"><div class="lb">${lb}</div><div class="box">${esc(val || '')}</div></div>`
  const body = `
    ${F('الشكوى', fields.complaint)}
    ${F('الفحص السريري', fields.exam)}
    ${F('التشخيص', fields.diagnosis)}
    ${F('الإجراء المتخذ', fields.done)}
    ${F('التوصيات', fields.plan)}`
  return shell({ settings, patient, size: 'A4', title: 'تقرير طبي', body })
}
