#!/bin/bash
# ── تشغيل Vitalis بنقرة مزدوجة ──
cd "$(dirname "$0")" || exit 1
clear
echo ""
echo "   ╭──────────────────────────────────────╮"
echo "   │   Vitalis — نظام إدارة العيادة       │"
echo "   ╰──────────────────────────────────────╯"
echo ""

# 1) التأكد من وجود Node.js
if ! command -v node >/dev/null 2>&1; then
  export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
fi
if ! command -v node >/dev/null 2>&1; then
  echo "   ✗ برنامج Node.js غير مثبّت على هذا الجهاز."
  echo ""
  echo "   سأفتح لك صفحة التحميل الآن."
  echo "   حمّل النسخة المكتوب بجانبها LTS، ثبّتها،"
  echo "   ثم أغلق هذه النافذة وانقر على الملف مرة أخرى."
  echo ""
  sleep 3
  open "https://nodejs.org/en/download"
  echo "   اضغط أي مفتاح للإغلاق…"
  read -n 1 -s
  exit 1
fi

echo "   ✓ Node.js موجود — الإصدار $(node -v)"
echo ""

# 2) تثبيت المكوّنات في المرة الأولى فقط
if [ ! -d "node_modules" ]; then
  echo "   ⏳ التحضير لأول مرة — قد يستغرق من دقيقتين إلى خمس."
  echo "      لا تغلق هذه النافذة."
  echo ""
  npm install
  if [ $? -ne 0 ]; then
    echo ""
    echo "   ✗ تعذّر التحضير."
    echo "   على الماك: افتح Terminal واكتب:  xcode-select --install"
    echo "   ثم أعد المحاولة."
    echo ""
    echo "   اضغط أي مفتاح للإغلاق…"
    read -n 1 -s
    exit 1
  fi
  echo ""
  echo "   ✓ اكتمل التحضير"
  echo ""
fi

# 3) بناء الواجهة إن لزم
if [ ! -d "dist" ]; then
  echo "   ⏳ تجهيز الواجهة…"
  npm run build >/dev/null 2>&1
fi

echo "   ▶ جارٍ فتح البرنامج…"
echo ""
echo "   ملاحظة: اترك هذه النافذة مفتوحة ما دام البرنامج يعمل."
echo ""

npm start
