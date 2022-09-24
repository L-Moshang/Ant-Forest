let { config } = require('../config.js')(runtime, global)
config.buddha_like_mode = false
let singletonRequire = require('../lib/SingletonRequirer.js')(runtime, global)
let { logInfo, errorInfo, warnInfo, debugInfo, infoLog, debugForDev, clearLogFile, flushAllLogs } = singletonRequire('LogUtils')
let floatyInstance = singletonRequire('FloatyUtil')
let commonFunctions = singletonRequire('CommonFunction')
let widgetUtils = singletonRequire('WidgetUtils')
let automator = singletonRequire('Automator')
let runningQueueDispatcher = singletonRequire('RunningQueueDispatcher')
let ocrUtil = require('../lib/LocalOcrUtil.js')
infoLog(['当前使用的OCR类型为：{} 是否启用：{}', ocrUtil.type, ocrUtil.enabled])
let unlocker = require('../lib/Unlock.js')
// 回收图像资源
let resourceMonitor = require('../lib/ResourceMonitor.js')(runtime, global)
let SCALE_RATE = config.scaleRate
let cvt = (v) => parseInt(v * SCALE_RATE)
config.not_lingering_float_window = true

logInfo('======加入任务队列，并关闭重复运行的脚本=======')
runningQueueDispatcher.addRunningTask()

// 注册自动移除运行中任务
commonFunctions.registerOnEngineRemoved(function () {
  if (config.auto_lock === true && unlocker.needRelock() === true) {
    debugInfo('重新锁定屏幕')
    automator.lockScreen()
    unlocker.saveNeedRelock(true)
  }
  config.resetBrightness && config.resetBrightness()
  debugInfo('校验并移除已加载的dex')
  // 移除运行中任务
  runningQueueDispatcher.removeRunningTask(true, true,
    () => {
      // 保存是否需要重新锁屏
      unlocker.saveNeedRelock()
      config.isRunning = false
    }
  )
}, 'main')

if (!commonFunctions.ensureAccessibilityEnabled()) {
  errorInfo('获取无障碍权限失败')
  exit()
}

unlocker.exec()

commonFunctions.showCommonDialogAndWait('神奇海洋收垃圾')
commonFunctions.listenDelayStart()
commonFunctions.requestScreenCaptureOrRestart()

openMiracleOcean()
checkNext()
findTrashs()
commonFunctions.minimize()
exit()

function openMiracleOcean () {
  logInfo('准备打开神奇海洋')
  app.startActivity({
    action: 'VIEW',
    data: 'alipays://platformapi/startapp?appId=2021003115672468',
    packageName: config.package_name
  })
  floatyInstance.setFloatyInfo({ x: config.device_width / 2, y: config.device_height / 2 }, "查找是否有'打开'对话框")
  let confirm = widgetUtils.widgetGetOne(/^打开$/, 1000)
  if (confirm) {
    automator.clickCenter(confirm)
  }
  sleep(1000)
  if (widgetUtils.idWaiting('ocean-fish-cnt-percent', '神奇海洋')) {
    debugInfo(['打开神奇海洋成功'])
  } else {
    warnInfo(['打开神奇海洋检测超时'])
  }
  sleep(1000)
}

function findTrashs (delay) {
  sleep(delay || 3000)
  let screen = commonFunctions.checkCaptureScreenPermission()
  if (screen) {
    this.temp_img = images.copy(screen, true)
    let grayImgInfo = images.grayscale(images.medianBlur(screen, 5))
    let findBalls = images.findCircles(
      grayImgInfo,
      {
        param1: config.hough_param1 || 30,
        param2: config.hough_param2 || 30,
        minRadius: config.hough_min_radius || cvt(65),
        maxRadius: config.hough_max_radius || cvt(75),
        minDst: config.hough_min_dst || cvt(100),
        region: [config.device_width / 2, config.device_height / 2, config.device_width / 2, config.device_height / 2]
      }
    )
    findBalls = findBalls.map(ball => {
      ball.x = ball.x + config.device_width / 2
      ball.y = ball.y + config.device_height / 2
      return ball
    })
    debugInfo(['找到的球：{}', JSON.stringify(findBalls)])
    if (findBalls && findBalls.length > 0) {
      let ball = findBalls[0]
      floatyInstance.setFloatyInfo({x: ball.x, y:ball.y}, '找到了垃圾')
      sleep(500)
      automator.click(ball.x + ball.radius, ball.y + ball.radius)
      sleep(1000)
      let collect = widgetUtils.widgetGetOne('.*(清理|收下).*')
      if (collect) {
        automator.clickCenter(collect)
        // 二次校验
        findTrashs(1500)
      }
    }
  }
}

function checkNext() {
  if (!ocrUtil.enabled) {
    if (new Date().getHours() < 21) {
      warnInfo('当前版本AutoJS不支持本地OCR，直接设置两小时后的定时任务，此方式并不准确请手动设置实际定时时间，每天间隔两小时的定时任务 并注释下面自动设置定时任务的代码')
      commonFunctions.setUpAutoStart(120)
    }
    return
  }
  let screen = commonFunctions.checkCaptureScreenPermission()
  if (screen) {
    let text = ocrUtil.recognize(screen, [0, 1800, 370, 240])
    if (text) {
      text = text.replace(/\n/g, '')
      let regex = /下次清理时间(\d+)分((\d+)秒)/
      floatyInstance.setFloatyInfo({x: 120, y: 1800}, '识别倒计时文本：' + text)
      sleep(500)
      let result = regex.exec(text)
      if (result && result.length > 0) {
        let remainMins = parseInt(result[1])
        let remainSecs = parseInt(result[3])
        debugInfo(['下次生产时间: {} 分 {} 秒', remainMins, remainSecs])
        commonFunctions.setUpAutoStart(remainMins + 1)
      }
    }
  }
  
}
