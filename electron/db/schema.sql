-- Vitalis — مخطط قاعدة البيانات
-- كل المعرّفات نصية فريدة عالميًا (UUID) لتعمل المزامنة لاحقًا بلا تصادم
-- الاستثناء الوحيد: file_no رقم تسلسلي يراه المستخدم (قرار ㊷)

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ═══════════════ الإعدادات ═══════════════
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ═══════════════ المستخدمون ═══════════════
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  role          TEXT NOT NULL CHECK (role IN ('doctor','secretary')),
  name          TEXT NOT NULL,
  pass_hash     TEXT,
  pass_salt     TEXT,
  pin_hash      TEXT,
  pin_salt      TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

-- ═══════════════ المرضى ═══════════════
CREATE TABLE IF NOT EXISTS patients (
  id              TEXT PRIMARY KEY,
  file_no         INTEGER UNIQUE,
  name            TEXT NOT NULL,
  phone           TEXT,
  no_phone        INTEGER NOT NULL DEFAULT 0,   -- المخرج الشرعي (مبدأ 13)
  contact_phone   TEXT,
  contact_relation TEXT,
  birth_year      INTEGER,
  age             INTEGER,
  gender          TEXT,
  address         TEXT,
  referred_by     TEXT,
  allergies       TEXT,      -- تحذير طبي — لا يُطوى
  chronic         TEXT,      -- أمراض مزمنة / مميعات
  note_admin      TEXT,      -- ملاحظة الطبيب للسكرتيرة (قرار ⑦)
  archived        INTEGER NOT NULL DEFAULT 0,
  merged_into     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_patients_name  ON patients(name);
CREATE INDEX IF NOT EXISTS ix_patients_phone ON patients(phone);

-- ═══════════════ الحالات (قرار ⑬ — تُنشأ تلقائيًا) ═══════════════
CREATE TABLE IF NOT EXISTS cases (
  id          TEXT PRIMARY KEY,
  patient_id  TEXT NOT NULL REFERENCES patients(id),
  title       TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at   TEXT NOT NULL,
  closed_at   TEXT
);
CREATE INDEX IF NOT EXISTS ix_cases_patient ON cases(patient_id, status);

-- ═══════════════ المواعيد ═══════════════
CREATE TABLE IF NOT EXISTS appointments (
  id          TEXT PRIMARY KEY,
  patient_id  TEXT NOT NULL REFERENCES patients(id),
  day         TEXT NOT NULL,          -- YYYY-MM-DD
  time        TEXT,                   -- HH:MM
  kind        TEXT NOT NULL DEFAULT 'كشف',
  duration    INTEGER,
  status      TEXT NOT NULL DEFAULT 'scheduled'
              CHECK (status IN ('scheduled','arrived','with_doctor','done','paid','cancelled')),
  order_index INTEGER NOT NULL DEFAULT 0,   -- ترتيب الدور اليدوي (قرار ㉚)
  confirm     TEXT,                          -- تأكد / لم يرد / اعتذر
  note        TEXT,
  arrived_at  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_appt_day ON appointments(day, order_index);

-- ═══════════════ الزيارات ═══════════════
CREATE TABLE IF NOT EXISTS visits (
  id             TEXT PRIMARY KEY,
  patient_id     TEXT NOT NULL REFERENCES patients(id),
  case_id        TEXT REFERENCES cases(id),
  appointment_id TEXT,
  kind           TEXT NOT NULL DEFAULT 'كشف',   -- كشف / مراجعة / زيارة قصيرة / إجراء
  short_type     TEXT,                           -- ضماد / نزع قطب / مراجعة سريعة
  capture        TEXT,        -- لوح الالتقاط (قرار ㉛)
  complaint      TEXT,
  exam           TEXT,
  diagnosis      TEXT,
  plan           TEXT,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','closed')),
  amount_due     INTEGER,     -- إلزامي عند الإغلاق ولو صفرًا
  covered        INTEGER NOT NULL DEFAULT 0,  -- مشمول (قرار ②)
  next_days      INTEGER,
  started_at     TEXT NOT NULL,
  closed_at      TEXT,
  edited_original TEXT,       -- النص الأصلي عند التعديل — حماية قانونية
  edited_at      TEXT
);
CREATE INDEX IF NOT EXISTS ix_visits_patient ON visits(patient_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_visits_status  ON visits(status);
CREATE INDEX IF NOT EXISTS ix_visits_diag    ON visits(diagnosis);

-- ═══════════════ الأدوية والوصفات ═══════════════
CREATE TABLE IF NOT EXISTS drugs (
  id          TEXT PRIMARY KEY,
  name_ar     TEXT NOT NULL,
  name_lat    TEXT,
  dose        TEXT,
  print_mode  TEXT NOT NULL DEFAULT 'both' CHECK (print_mode IN ('ar','lat','both')),
  use_count   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_drugs_ar  ON drugs(name_ar);
CREATE INDEX IF NOT EXISTS ix_drugs_lat ON drugs(name_lat);

CREATE TABLE IF NOT EXISTS rx_templates (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  items      TEXT NOT NULL,   -- JSON
  use_count  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id         TEXT PRIMARY KEY,
  visit_id   TEXT NOT NULL REFERENCES visits(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  items      TEXT NOT NULL,   -- JSON: [{name_ar,name_lat,dose,print_mode}]
  notes      TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_rx_visit ON prescriptions(visit_id);

-- ═══════════════ المالية ═══════════════
CREATE TABLE IF NOT EXISTS payments (
  id          TEXT PRIMARY KEY,
  patient_id  TEXT NOT NULL REFERENCES patients(id),
  visit_id    TEXT,
  amount      INTEGER NOT NULL,        -- سالب = استرجاع
  kind        TEXT NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','refund')),
  paid_by     TEXT,                    -- دُفع بواسطة (المرحلة 7)
  by_user     TEXT NOT NULL,
  note        TEXT,
  day         TEXT NOT NULL,
  reviewed    INTEGER NOT NULL DEFAULT 0,   -- مراجعة الطبيب للفروقات
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_pay_day     ON payments(day);
CREATE INDEX IF NOT EXISTS ix_pay_patient ON payments(patient_id);

CREATE TABLE IF NOT EXISTS day_close (
  day          TEXT PRIMARY KEY,
  system_total INTEGER NOT NULL,
  cash_counted INTEGER NOT NULL,
  diff         INTEGER NOT NULL,
  note         TEXT,
  closed_by    TEXT NOT NULL,
  closed_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prices (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'procedure',  -- visit / review / dressing / procedure
  created_at TEXT NOT NULL
);

-- ═══════════════ سجل الأحداث (لا يُحذف ولا يُعدَّل) ═══════════════
CREATE TABLE IF NOT EXISTS audit (
  id      TEXT PRIMARY KEY,
  at      TEXT NOT NULL,
  user    TEXT NOT NULL,
  role    TEXT NOT NULL,
  type    TEXT NOT NULL,     -- money / appointment / medical / auth / system
  text    TEXT NOT NULL,
  ref_id  TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_at ON audit(at DESC);

-- ═══════════════ سجل التغييرات — أساس المزامنة (قرار ㊸) ═══════════════
CREATE TABLE IF NOT EXISTS change_log (
  seq       INTEGER PRIMARY KEY AUTOINCREMENT,
  device    TEXT NOT NULL,
  tbl       TEXT NOT NULL,
  row_id    TEXT NOT NULL,
  op        TEXT NOT NULL,     -- insert / update / delete
  at        TEXT NOT NULL,
  synced    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_chg_sync ON change_log(synced, seq);

-- ═══════════════ الإشعارات الصامتة ═══════════════
CREATE TABLE IF NOT EXISTS notices (
  id         TEXT PRIMARY KEY,
  to_role    TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  seen       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_notices ON notices(to_role, seen, created_at DESC);

-- ═══════════════ الأعمال الجراحية (كيان مستقل — قرار المرحلة 2) ═══════════════
CREATE TABLE IF NOT EXISTS surgeries (
  id          TEXT PRIMARY KEY,
  patient_id  TEXT NOT NULL REFERENCES patients(id),
  case_id     TEXT REFERENCES cases(id),
  visit_id    TEXT,                 -- الزيارة التي تقرر فيها
  scope       TEXT NOT NULL DEFAULT 'major' CHECK (scope IN ('minor','major')),
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','cancelled')),
  planned_day TEXT,                 -- قد يكون فارغًا ← معلّقة أشد إلحاحًا
  done_at     TEXT,
  fee         INTEGER,              -- أجر الجراح فقط (قرار ③)
  anesthesia  TEXT,
  notes       TEXT,
  cancel_note TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_surg_patient ON surgeries(patient_id, status);
CREATE INDEX IF NOT EXISTS ix_surg_status  ON surgeries(status);

-- ═══════════════ الطلبات الخارجية ═══════════════
CREATE TABLE IF NOT EXISTS lab_orders (
  id          TEXT PRIMARY KEY,
  patient_id  TEXT NOT NULL REFERENCES patients(id),
  visit_id    TEXT,
  items       TEXT NOT NULL,        -- JSON: قائمة الفحوص
  diagnosis   TEXT,
  note        TEXT,
  arrived_at  TEXT,                 -- السكرتيرة: «أحضر الأوراق»
  arrived_by  TEXT,
  seen_at     TEXT,                 -- الطبيب: «رأيت النتيجة» ← يُغلق المعلّق
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lab_patient ON lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS ix_lab_open    ON lab_orders(seen_at);

-- ═══════════════ قوالب الفحوص ═══════════════
CREATE TABLE IF NOT EXISTS lab_templates (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  items      TEXT NOT NULL,
  use_count  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lab_tests (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  use_count  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- ═══════════════ المرفقات ═══════════════
CREATE TABLE IF NOT EXISTS attachments (
  id          TEXT PRIMARY KEY,
  patient_id  TEXT NOT NULL REFERENCES patients(id),
  visit_id    TEXT,
  kind        TEXT NOT NULL DEFAULT 'image',   -- image / pdf
  file_name   TEXT NOT NULL,
  rel_path    TEXT NOT NULL,                   -- داخل مجلد بيانات محمي
  caption     TEXT,
  size_bytes  INTEGER,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_att_patient ON attachments(patient_id, created_at DESC);

-- ═══════════════ المصروفات ═══════════════
CREATE TABLE IF NOT EXISTS expenses (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  day        TEXT NOT NULL,
  recurring  INTEGER NOT NULL DEFAULT 0,       -- متكرر شهريًا
  note       TEXT,
  by_user    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_exp_day ON expenses(day);

-- ═══════════════ بنود المصاريف — يضيفها الطبيب ═══════════════
CREATE TABLE IF NOT EXISTS expense_labels (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  use_count  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- ═══════════════ المزامنة بين الجهازين ═══════════════
CREATE TABLE IF NOT EXISTS sync_peers (
  device_id   TEXT PRIMARY KEY,
  name        TEXT,
  address     TEXT,          -- IP:port
  last_seq    INTEGER NOT NULL DEFAULT 0,   -- آخر تغيير طُبّق من هذا الجهاز
  last_seen   TEXT,
  created_at  TEXT NOT NULL
);

-- ═══════════════ القوائم القابلة للتخصيص ═══════════════
-- كل قائمة خيارات في البرنامج تُقرأ من هنا — والطبيب يضيف ما يشاء
CREATE TABLE IF NOT EXISTS options (
  id         TEXT PRIMARY KEY,
  list_key   TEXT NOT NULL,
  value      TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  use_count  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (list_key, value)
);
CREATE INDEX IF NOT EXISTS ix_opt_list ON options(list_key, sort, value);

-- ═══════════════ حقول يعرّفها الطبيب بنفسه ═══════════════
CREATE TABLE IF NOT EXISTS custom_fields (
  id         TEXT PRIMARY KEY,
  scope      TEXT NOT NULL DEFAULT 'visit',   -- visit / patient
  label      TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'text',    -- text / textarea / number / chips / scale
  list_key   TEXT,                            -- لحقول chips
  unit       TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- ═══════════════ سلة المحذوفات — لا شيء يُمحى بلا أثر ═══════════════
CREATE TABLE IF NOT EXISTS trash (
  id         TEXT PRIMARY KEY,
  tbl        TEXT NOT NULL,
  row_id     TEXT NOT NULL,
  label      TEXT NOT NULL,      -- وصف مقروء لما حُذف
  snapshot   TEXT NOT NULL,      -- نسخة كاملة من السجل (JSON)
  by_user    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_trash_at ON trash(created_at DESC);

-- ═══════════════ قائمة الانتظار (بسيطة — قرار ㊲) ═══════════════
CREATE TABLE IF NOT EXISTS waitlist (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT,
  note       TEXT,
  patient_id TEXT,
  created_at TEXT NOT NULL
);

-- ═══════════════ المسامحة على الديون (الطبيب حصرًا) ═══════════════
-- كيان مستقل عن الدفعات عمدًا: الإعفاء ليس قبضًا، فلا يُحسب دخلًا أبدًا
CREATE TABLE IF NOT EXISTS waivers (
  id         TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  amount     INTEGER NOT NULL,
  reason     TEXT,
  by_user    TEXT NOT NULL,
  day        TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_waiver_patient ON waivers(patient_id);
CREATE INDEX IF NOT EXISTS ix_waiver_day     ON waivers(day);

-- ═══════════════ تأجيل المعلّقات (قرار ㉟) ═══════════════
CREATE TABLE IF NOT EXISTS snoozes (
  key        TEXT PRIMARY KEY,      -- نوع:معرّف
  until      TEXT NOT NULL,
  times      INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
