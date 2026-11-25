# Vitalis · فيتاليس

**An offline-first, Arabic (RTL) desktop app for running a small medical clinic** — built for a general-surgery practice, usable by any single-doctor clinic.

**نظام مفتوح المصدر لإدارة عيادة طبية صغيرة** — يعمل على الكمبيوتر بدون إنترنت، بواجهة عربية كاملة.

## Features

- **Two roles:** doctor and secretary, each with its own "today" screen, permissions and auto-lock (PIN).
- **Patients & visits:** patient files, clinical fields, visit closing, attachments, smart search (name + phone in one box).
- **Appointments & queue:** calendar, manual queue ordering, pending cases and follow-up calls.
- **Prescriptions, lab and surgery sheets** with reusable templates; Arabic / Latin / bilingual printing.
- **Cashbox & debts:** payments, refunds, daily cash review, outstanding balances, reports.
- **Two-device LAN sync:** doctor and secretary machines sync over the local network — no cloud, no server.
- **Audit log** of every important action.

## Tech stack

Electron · React 18 · Vite · SQLite (`better-sqlite3`). All data stays on the clinic's own machines.

## Getting started

```bash
npm install
npm run dev        # development
npm run dist:mac   # build a macOS .dmg
npm run dist:win   # build a Windows installer
```

On first launch two accounts are created: **doctor** (password `1234`, PIN `1234`) and **secretary** (password `1111`).
**Change both immediately** from Settings. Set your clinic name, doctor name, prices and working hours in Settings as well.

See `تشغيل-النظام.md` (running the system) and `شبك-الجهازين.md` (connecting the two devices) for step-by-step Arabic guides.

## Design documents

The `docs/` folder contains the full Arabic design and specification (workflow analysis, modules, permissions, UX, visual system, screens, scenario review, technical details), plus an interactive HTML prototype (`docs/نموذج-تفاعلي.html`).

## Contributing

Issues and pull requests are welcome — especially translations, printing templates for other specialties, and Windows testing.

## License

[MIT](LICENSE) © 2026 Alaa Shaker
