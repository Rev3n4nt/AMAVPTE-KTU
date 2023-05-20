const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
} = require('electron')

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const process = require('process')

let droidbotPath
let pythonPath

let testList
let selectedTests = []
let mainWindow
var selectedPath
var droidbotProcess
var testProcess
var imageUpdateTimer

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    // icon: __dirname + '/app.ico',
    webPreferences: {
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      disableBlinkFeatures: 'Auxclick'
    }
  })
  mainWindow.loadFile(path.join(__dirname, 'index.html'))
  // mainWindow.webContents.openDevTools()
}

testList = []
let dir = fs.opendirSync('tests')
let file
while ((file = dir.readSync()) !== null) {
  if (file.name.slice(-3) == '.py') {
    let testPath = path.join('tests', file.name)
    let code = fs.readFileSync(testPath).toString()
    let testName = code.slice(2, code.indexOf('\n'))
    selectedTests.push(true)
    testList.push({
      name: testName,
      path: testPath,
    })
  }
}
dir.closeSync()

function makeTestSelectClick(i) {
  return (e) => {
    selectedTests[i] = e.checked
  }
}

app.whenReady().then(() => {
  let configPath = path.join(__dirname, 'config.json')
  if (!fs.existsSync(configPath)) {
    let defaultConfig = {
      droidbotPath: 'droidbot',
      pythonPath: 'python',
    }
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, '  '))
  }
  let config = JSON.parse(fs.readFileSync(configPath).toString())
  droidbotPath = config.droidbotPath || 'droidbot'
  pythonPath = config.pythonPath || 'python'

  let items = []
  for (let i in testList) {
    items.push({
      label: testList[i].name,
      type: 'checkbox',
      checked: true,
      click: makeTestSelectClick(i),
    })
  }

  let menu = Menu.buildFromTemplate([{
    label: 'Tests',
    submenu: items,
  }, {
    label: 'Window',
    submenu: [{
      role: 'reload',
    }, {
      role: 'forceReload',
    }, {
      role: 'toggleDevTools',
    }, {
      role: 'close',
    }],
  }])
  Menu.setApplicationMenu(menu)

  createWindow()
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
  clearInterval(imageUpdateTimer)
})

/// api

function isApk(inputPath) {
  return inputPath.slice(-4).toLowerCase() == '.apk'
}

function outputPathFor(inputPath) {
  return isApk(inputPath) ? inputPath + '-output' : inputPath
}

function imagesPathFor(inputPath) {
  return isApk(inputPath) ? path.join(inputPath + '-output', 'states') : inputPath
}

function exportPathFor(inputPath) {
  return isApk(inputPath) ? inputPath + '-results.html' : path.join(inputPath, 'results.html')
}

function send_log(line, isError) {
  var console_line = line
  if (line.slice(-1) == "\n") {
    console_line = line.replace(/[\r\n]+$/, '')
  } else {
    line = line + "\n"
  }
  if (isError) {
    console.error(console_line)
  } else {
    console.log(console_line)
  }
  mainWindow.webContents.send('log', line, isError)
}

ipcMain.handle('selectPath', (event) => {
  let files = dialog.showOpenDialogSync({
    properties: ['openFile'],
  })
  if (files) {
    selectedPath = files[0]
  }
  if (fs.existsSync(selectedPath)) {
    if (!isApk(selectedPath)) {
      selectedPath = path.dirname(selectedPath)
    }
  } else {
    selectedPath = undefined
  }
  return selectedPath
})

ipcMain.handle('startDroidbot', (event) => {
  if (droidbotProcess) {
    console.error('droidbot already running')
    return
  }
  console.log('starting droidbot')
  droidbotProcess = spawn(droidbotPath, ['-a', selectedPath, '-o', outputPathFor(selectedPath)])
  droidbotProcess.stdout.on('data', data => {
    send_log(`${data}`, false)
  })
  droidbotProcess.stderr.on('data', data => {
    send_log(`${data}`, true)
  })
  droidbotProcess.on('error', (error) => {
    send_log(`error: ${error.message}`, true)
  })
  droidbotProcess.on('close', (code) => {
    send_log(`droidbot exited with code ${code}`)
    mainWindow.webContents.send('droidbotStopped')
    droidbotProcess = undefined
  })
})

ipcMain.handle('stopDroidbot', (event) => {
  if (!droidbotProcess) {
    console.error('droidbot not running')
    return
  }
  if (process.platform == "win32") {
    spawn('taskkill', ['/pid', droidbotProcess.pid, '/f', '/t'])
  } else {
    droidbotProcess.kill()
  }
})

ipcMain.handle('getSelectedTests', (event) => {
  let result = []
  for (let i in testList) {
    if (selectedTests[i]) result.push(testList[i].path)
  }
  return result
})

ipcMain.handle('startTest', (event, test, image) => {
  if (testProcess) {
    console.error('test already running')
    return
  }
  send_log(`running ${test} for ${image}`)
  testProcess = spawn(pythonPath, [test, image])
  testProcess.stdout.on('data', data => {
    data = `${data}`
    let lines = data.split('\n')
    for (let i in lines) {
      let line = lines[i]
      if (line == '') break
      try {
        let result = JSON.parse(line)
        let bb = result.bounding_box
        console.log(`${result.message} at ${bb.x}, ${bb.y}, ${bb.w}, ${bb.h}`)
        mainWindow.webContents.send('testResult', result)
      } catch(e) {
        console.error(e)
        send_log(`could not parse test result: ${e}`)
      }
    }
  })
  testProcess.stderr.on('data', data => {
    send_log(`${data}`, true)
  })
  testProcess.on('error', (error) => {
    send_log(`error: ${error.message}`, true)
  })
  testProcess.on('close', (code) => {
    send_log(`test exited with code ${code}`)
    mainWindow.webContents.send('testStopped')
    testProcess = undefined
  })
})

ipcMain.handle('stopTest', (event) => {
  if (!testProcess) {
    console.error('test not running')
    return
  }
  if (process.platform == "win32") {
    spawn('taskkill', ['/pid', testProcess.pid, '/f', '/t'])
  } else {
    testProcess.kill()
  }
})

ipcMain.handle('exportResults', (event, htmlData) => {
  let resultPath = exportPathFor(selectedPath)
  let imagesPath = imagesPathFor(selectedPath)
  let relativePath = path.relative(path.dirname(resultPath), imagesPath)
  if (relativePath == '') {
    htmlData = htmlData.replaceAll(`src="${imagesPath}/`, `src="${relativePath}`)
  } else {
    htmlData = htmlData.replaceAll(`src="${imagesPath}`, `src="${relativePath}`)
  }
  let header = `<html><body>`
  let footer = `</body></html>`
  fs.writeFileSync(resultPath, header + htmlData + footer)
  return resultPath
})

imageUpdateTimer = setInterval(() => {
  if (!selectedPath) return
  let imagesDir = imagesPathFor(selectedPath)
  if (!fs.existsSync(imagesDir)) return
  let dir = fs.opendirSync(imagesDir)
  let file
  let imageList = []
  while ((file = dir.readSync()) !== null) {
    if (file.name.slice(-4) == '.jpg') {
      imageList.push(path.join(imagesDir, file.name))
    }
  }
  dir.closeSync()
  mainWindow.webContents.send('imageListUpdated', imageList)
}, 1000)
