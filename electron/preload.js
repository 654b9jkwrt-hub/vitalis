'use strict'
const { contextBridge, ipcRenderer } = require('electron')

// جسر ضيق ومحدد — الواجهة لا تصل إلى Node مباشرة
contextBridge.exposeInMainWorld('vitalis', {
  call: (fn, ...args) => ipcRenderer.invoke('api', { fn, args }),
  print: (html, size) => ipcRenderer.invoke('print', { html, size }),
  info: () => ipcRenderer.invoke('app-info')
})
