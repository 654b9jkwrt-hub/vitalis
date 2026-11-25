'use strict'
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const D = require('./db')
const API = require('./db/api')
const SYNC = require('./sync')

const DEV = !app.isPackaged && process.env.VITE_DEV === '1'
let win = null
let session = null   // المستخدم الحالي — يُحفظ في العملية الرئيسية لا في الواجهة

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 1024, minHeight: 700,
    title: 'Vitalis',
    backgroundColor: '#F2F3F7',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.once('ready-to-show', () => win.show())
  if (DEV) win.loadURL('http://localhost:5199')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  try {
    D.init(app.getPath('userData'))
  } catch (e) {
    dialog.showErrorBox('تعذّر فتح قاعدة البيانات', String(e.message || e))
    app.quit(); return
  }
  try { SYNC.start() } catch (e) { console.error('sync', e) }
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('before-quit', () => { try { SYNC.stop() } catch { } })

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

/* ═══════════════ جسر الواجهة ═══════════════ */
// كل نداء يمر عبر هذه الدالة، والمستخدم يُحقن من الجلسة — الواجهة لا تستطيع انتحال دور
const PUBLIC = new Set(['settingsGet', 'usersList'])   // لا تحتاج جلسة ولا تستقبل المستخدم

ipcMain.handle('api', async (_e, { fn, args = [] }) => {
  try {
    if (fn === 'login') { session = API.login(args[0], args[1]); return { ok: true, data: session } }
    if (fn === 'logout') { session = null; return { ok: true, data: true } }
    if (fn === 'session') return { ok: true, data: session }

    // وظائف المزامنة — الطبيب حصرًا
    if (fn.startsWith('sync')) {
      if (!session) return { ok: false, error: 'انتهت الجلسة' }
      if (session.role !== 'doctor' && fn !== 'syncInfo')
        return { ok: false, error: 'إعداد المزامنة للطبيب فقط' }
      const map = {
        syncInfo: () => SYNC.info(),
        syncPair: () => SYNC.pair(args[0]),
        syncForget: () => SYNC.forget(args[0]),
        syncNow: () => SYNC.pullOnce(),
        syncSetName: () => SYNC.setName(args[0]),
        syncSetKey: () => { SYNC.setSecret(args[0]); return true }
      }
      if (!map[fn]) return { ok: false, error: 'وظيفة مزامنة غير معروفة' }
      return { ok: true, data: await map[fn]() }
    }

    const f = API[fn]
    if (typeof f !== 'function') return { ok: false, error: `وظيفة غير معروفة: ${fn}` }

    if (PUBLIC.has(fn)) return { ok: true, data: f(...args) }
    if (!session) return { ok: false, error: 'انتهت الجلسة — سجّل الدخول' }
    return { ok: true, data: f(session, ...args) }
  } catch (err) {
    return { ok: false, error: String(err.message || err) }
  }
})

/* ═══════════════ الطباعة ═══════════════ */
ipcMain.handle('print', async (_e, { html, size }) => {
  const w = new BrowserWindow({
    show: false, width: 800, height: 1000,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise(r => setTimeout(r, 350))
  return new Promise((resolve) => {
    w.webContents.print({
      silent: false,
      printBackground: true,
      margins: { marginType: 'none' },
      pageSize: size === 'A5' ? 'A5' : 'A4'
    }, (success, reason) => {
      w.close()
      resolve({ ok: success, error: success ? null : reason })
    })
  })
})

ipcMain.handle('app-info', () => ({
  version: app.getVersion(),
  device: D.device,
  dataPath: app.getPath('userData'),
  platform: process.platform
}))
