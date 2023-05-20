const {
  contextBridge,
  ipcRenderer
} = require('electron')

contextBridge.exposeInMainWorld('api', {
  selectPath: function() {
    return ipcRenderer.invoke('selectPath')
  },
  startDroidbot: function () {
    return ipcRenderer.invoke('startDroidbot')
  },
  stopDroidbot: function () {
    return ipcRenderer.invoke('stopDroidbot')
  },
  getSelectedTests: function () {
    return ipcRenderer.invoke('getSelectedTests')
  },
  startTest: function (test, image) {
    return ipcRenderer.invoke('startTest', test, image)
  },
  stopTest: function () {
    return ipcRenderer.invoke('stopTest')
  },
  exportResults: function (htmlData) {
    return ipcRenderer.invoke('exportResults', htmlData)
  },
})

ipcRenderer.on('droidbotStopped', (event) => {
  window.postMessage(['droidbotStopped'])
})

ipcRenderer.on('testStopped', (event) => {
  window.postMessage(['testStopped'])
})

ipcRenderer.on('log', (event, message, is_error) => {
  window.postMessage(['log', message, is_error])
})

ipcRenderer.on('imageListUpdated', (event, images) => {
  window.postMessage(['imageListUpdated', images])
})

ipcRenderer.on('testResult', (event, result) => {
  window.postMessage(['testResult', result])
})
