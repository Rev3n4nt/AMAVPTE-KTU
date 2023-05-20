const defaultTimeout = 300
const timerIncrease = 60

var tests
var images
var testRunning
var nextTestIdx
var nextImageIdx
var testResults = {}

var stopTimerCounter = 0

function updateTimerElement() {
  let minutes = Math.floor(stopTimerCounter / 60)
  let seconds = stopTimerCounter % 60
  document.getElementById('stopTimer').innerHTML = `${minutes}:${seconds}`
}

function timerUpdate() {
  if (stopTimerCounter == 0) return
  stopTimerCounter--
  if (stopTimerCounter <= 0) {
    stopDroidbot()
  }
  updateTimerElement()
}

function isApk(path) {
  return path.slice(-4).toLowerCase() == '.apk'
}

window.addEventListener('DOMContentLoaded', () => {
  let selectPathButton = document.getElementById('selectPath')
  let selectedPathSpan = document.getElementById('selectedPath')

  let startDroidbotButton = document.getElementById('startDroidbot')
  let stopDroidbotButton = document.getElementById('stopDroidbot')
  let increaseTimer = document.getElementById('increaseTimer')

  let startTestButton = document.getElementById('startTest')
  let stopTestButton = document.getElementById('stopTest')

  let exportResultsButton = document.getElementById('exportResults')

  selectPathButton.onclick = async (event) => {
    let path = await window.api.selectPath()
    if (path) {
      selectedPathSpan.innerHTML = path
      startDroidbotButton.disabled = !isApk(path)
      startTestButton.disabled = false
    }
  }

  startDroidbotButton.onclick = (event) => {
    window.api.startDroidbot()
    startDroidbotButton.disabled = true
    stopDroidbotButton.disabled = false
    increaseTimer.disabled = false
    stopTimerCounter = defaultTimeout
    updateTimerElement()
  }
  stopDroidbotButton.onclick = (event) => {
    stopTimerCounter = 0
    updateTimerElement()
    stopDroidbot()
  }
  increaseTimer.onclick = (event) => {
    stopTimerCounter += timerIncrease
    updateTimerElement()
  }

  startTestButton.onclick = async (event) => {
    tests = await window.api.getSelectedTests()
    testRunning = true
    nextTestIdx = 0
    nextImageIdx = 0
    testResults = {}
    for (let i in images) {
      testResults[images[i]] = []
    }
    testNextImage()
    startTestButton.disabled = true
    stopTestButton.disabled = false
  }
  stopTestButton.onclick = (event) => {
    testRunning = false
    window.api.stopTest()
  }

  exportResultsButton.onclick = async (event) => {
    let elem = document.createElement('div')
    for (let i in images) {
      let image = images[i]
      if (testResults[image].length > 0) {
        if (i > 0) {
          elem.appendChild(document.createElement('hr'))
        }
        populateResultPreview(elem, image)
      }
    }
    let resultPath = await window.api.exportResults(elem.innerHTML)
    if (resultPath) {
      let msg = `results exported to ${resultPath}`
      log(msg, false)
      alert(msg)
    } else {
      log('failed to export results', true)
    }
  }

  let resultPreview = document.getElementById('resultPreview')
  resultPreview.onclick = (event) => {
    event.stopPropagation()
    resultPreview.style.display = 'none'
  }
  let resultPreviewContent = document.getElementById('resultPreviewContent')
  resultPreviewContent.onclick = (event) => {
    event.stopPropagation()
  }

  setInterval(timerUpdate, 1000)
})

window.addEventListener('message', (event) => {
  let data = event.data
  if (data[0] === 'droidbotStopped') {
    droidbotStopped();
  } else if (data[0] === 'testStopped') {
    testStopped();
  } else if (data[0] === 'log') {
    log(data[1], data[2])
  } else if (data[0] == 'imageListUpdated') {
    imageListUpdated(data[1])
  } else if (data[0] == 'testResult') {
    testResult(data[1])
  } else {
    console.error(`unsupported message: ${data}`)
  }
})

function droidbotStopped() {
  let startDroidbotButton = document.getElementById('startDroidbot')
  let stopDroidbotButton = document.getElementById('stopDroidbot')
  startDroidbotButton.disabled = false
  stopDroidbotButton.disabled = true
  stopTimerCounter = 0
  updateTimerElement()
}

function testNextImage() {
  let image = images[nextImageIdx]
  window.api.startTest(tests[nextTestIdx], image)
  nextTestIdx++
  if (nextTestIdx >= tests.length) {
    nextTestIdx = 0
    nextImageIdx++
  }
  if (nextImageIdx >= images.length) {
    testRunning = false
  }
}

function testStopped() {
  if (testRunning) {
    testNextImage()
  } else {
    let startTestButton = document.getElementById('startTest')
    let stopTestButton = document.getElementById('stopTest')
    startTestButton.disabled = false
    stopTestButton.disabled = true
  }
}

function log(message, isError) {
  let logElem = document.getElementById('log')
  var textElem = document.createTextNode(message)
  if (isError) {
    let spanElem = document.createElement('span')
    spanElem.classList.add('error')
    spanElem.appendChild(textElem)
    logElem.appendChild(spanElem)
  } else {
    logElem.appendChild(textElem)
  }
  logElem.scrollTop = logElem.scrollHeight
}

function makeImageClickListener(elem, image) {
  return (event) => {
    let resultPreview = document.getElementById('resultPreview')
    resultPreview.style.display = 'block'

    let resultPreviewContent = document.getElementById('resultPreviewContent')
    resultPreviewContent.innerHTML = ''

    populateResultPreview(resultPreviewContent, image)
  }
}

function populateResultPreview(resultPreviewContent, image) {
  let divImgElem = document.createElement('div')
  let imgElem = document.createElement('img')
  imgElem.src = image
  if (resultPreviewContent.clientWidth > 0) {
    imgElem.width = resultPreviewContent.clientWidth * 0.5
  } else {
    imgElem.style.width = '30%'
  }
  imgElem.style.border = '1px solid black'
  divImgElem.appendChild(imgElem)
  resultPreviewContent.appendChild(divImgElem)

  let resultsGrouped = {}

  var results = testResults[image]
  for (let i in results) {
    let result = results[i]
    let bb = result.bounding_box
    let key = `${bb.x}:${bb.y}:${bb.w}:${bb.h}`
    resultsGrouped[key] = resultsGrouped[key] || { bb: bb, messages:[] }
    resultsGrouped[key].messages.push(result.message)
  }

  for (let key in resultsGrouped) {
    let bb = resultsGrouped[key].bb
    let messages = resultsGrouped[key].messages

    resultPreviewContent.appendChild(document.createElement('hr'))

    let textElem = document.createElement('span')
    textElem.innerHTML = `at ${bb.x}, ${bb.y}, ${bb.w}, ${bb.h}:`
    resultPreviewContent.appendChild(textElem)
    resultPreviewContent.appendChild(document.createElement('br'))
    for (let i in messages) {
      let textElem = document.createElement('span')
      textElem.innerHTML = messages[i]
      resultPreviewContent.appendChild(textElem)
      resultPreviewContent.appendChild(document.createElement('br'))
    }

    let cropDiv = document.createElement('div')
    cropDiv.style = `width: ${bb.w}px; height: ${bb.h}px; overflow: hidden;`
    let cropImg = document.createElement('img')
    cropImg.src = image
    cropImg.style = `margin: -${bb.y}px 0 0 -${bb.x}px`
    cropDiv.appendChild(cropImg)
    resultPreviewContent.appendChild(cropDiv)
    resultPreviewContent.appendChild(document.createElement('br'))
  }
}

function imageListUpdated(_images) {
  images = _images
  let imagesElem = document.getElementById('images')
  imagesElem.innerHTML = ''
  for (let i in images) {
    let imgElem = document.createElement('img')
    let image = images[i]
    imgElem.src = image
    imgElem.classList.add('screenshot')
    var results = testResults[image]
    if (results) {
      if (results.length > 0) {
        imgElem.classList.add('red_border')
        imgElem.onclick = makeImageClickListener(imgElem, image)
      } else {
        imgElem.classList.add('green_border')
      }
    }
    imagesElem.appendChild(imgElem)
  }
}

function stopDroidbot() {
  window.api.stopDroidbot()
  let stopDroidbotButton = document.getElementById('stopDroidbot')
  let increaseTimer = document.getElementById('increaseTimer')
  stopDroidbotButton.disabled = true
  increaseTimer.disabled = true
}

function testResult(result) {
  document.getElementById('exportResults').disabled = false
  testResults[result.image].push(result)
  imageListUpdated(images)
}

