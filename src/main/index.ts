import './services/MemoryFileService'
import './services/ModuleFileManager'

import { electronApp, optimizer } from '@electron-toolkit/utils'
import { replaceDevtoolsFont } from '@main/utils/windowUtil'
import { app, session } from 'electron'
import installExtension, { REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS } from 'electron-devtools-installer'
import Logger from 'electron-log'
import * as fs from 'fs'
import * as path from 'path'

import { registerIpc } from './ipc'
import { configManager } from './services/ConfigManager'
import mcpService from './services/MCPService'
import { CHERRY_STUDIO_PROTOCOL, handleProtocolUrl, registerProtocolClient } from './services/ProtocolClient'
import { registerShortcuts } from './services/ShortcutService'
import { TrayService } from './services/TrayService'
import { windowService } from './services/WindowService'

// 安全控制开关
const DISABLE_SECURITY = true // 设置为true表示禁用安全限制，false表示启用安全限制

// Check for single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
} else {
  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.

  app.whenReady().then(async () => {
    // Set app user model id for windows
    electronApp.setAppUserModelId(import.meta.env.VITE_MAIN_BUNDLE_ID || 'com.kangfenmao.CherryStudio')

    // 配置浏览器会话
    const browserSession = session.fromPartition('persist:browser')

    // 设置用户代理 - 使用Chrome 126的用户代理字符串，但保留Chrome 134的功能
    const desktopUserAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    const mobileUserAgent =
      'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.44 Mobile Safari/537.36'

    // 默认使用桌面用户代理
    browserSession.setUserAgent(desktopUserAgent)

    // 添加扩展支持
    // 创建扩展目录
    const extensionsDir = path.join(app.getPath('userData'), 'extensions')
    if (!fs.existsSync(extensionsDir)) {
      fs.mkdirSync(extensionsDir, { recursive: true })
    }

    // 加载已安装的扩展
    const loadExtensions = async () => {
      try {
        const extensions = fs.readdirSync(extensionsDir)
        for (const extId of extensions) {
          const extPath = path.join(extensionsDir, extId)
          if (fs.statSync(extPath).isDirectory()) {
            try {
              await browserSession.loadExtension(extPath)
              console.log(`已加载扩展: ${extId}`)
            } catch (err) {
              console.error(`加载扩展失败 ${extId}:`, err)
            }
          }
        }
      } catch (err) {
        console.error('加载扩展目录失败:', err)
      }
    }

    await loadExtensions()

    // 配置请求拦截器
    browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const { requestHeaders } = details
      const url = details.url

      // 修改请求头，移除可能导致网站检测到Electron的头
      if (requestHeaders['User-Agent']) {
        // 只对Google域名使用移动版用户代理
        if (url.includes('accounts.google.com')) {
          requestHeaders['User-Agent'] = mobileUserAgent
        } else {
          requestHeaders['User-Agent'] = desktopUserAgent
        }
      }

      // 添加常见的浏览器请求头
      requestHeaders['Accept-Language'] = 'zh-CN,zh;q=0.9,en;q=0.8'
      requestHeaders['Sec-Ch-Ua'] = '"Not/A)Brand";v="8", "Chromium";v="126"'
      requestHeaders['Sec-Ch-Ua-Mobile'] = '?0'
      requestHeaders['Sec-Ch-Ua-Platform'] = '"Windows"'
      requestHeaders['Sec-Fetch-Dest'] = 'document'
      requestHeaders['Sec-Fetch-Mode'] = 'navigate'
      requestHeaders['Sec-Fetch-Site'] = 'none'
      requestHeaders['Sec-Fetch-User'] = '?1'
      requestHeaders['Upgrade-Insecure-Requests'] = '1'

      // 处理Google和其他需要登录的网站，或者如果禁用安全限制
      if (
        DISABLE_SECURITY ||
        details.url.includes('google.com') ||
        details.url.includes('accounts.google') ||
        details.url.includes('login') ||
        details.url.includes('signin')
      ) {
        // 添加必要的Cookie处理头
        requestHeaders['Access-Control-Allow-Origin'] = '*'
        requestHeaders['Access-Control-Allow-Credentials'] = 'true'

        // 不添加特殊请求头，让浏览器自然处理
      }

      callback({ requestHeaders })
    })

    // 处理响应头
    browserSession.webRequest.onHeadersReceived((details, callback) => {
      const { responseHeaders } = details

      // 如果禁用安全限制，或者是Google或其他登录相关页面，修改响应头
      if (
        DISABLE_SECURITY ||
        details.url.includes('google.com') ||
        details.url.includes('accounts.google') ||
        details.url.includes('login') ||
        details.url.includes('signin')
      ) {
        // 移除可能阻止跨域的头
        if (responseHeaders) {
          delete responseHeaders['X-Frame-Options']
          delete responseHeaders['Content-Security-Policy']

          // 添加允许跨域的头
          responseHeaders['Access-Control-Allow-Origin'] = ['*']
          responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS']
          responseHeaders['Access-Control-Allow-Headers'] = ['Content-Type, Authorization']
          responseHeaders['Access-Control-Allow-Credentials'] = ['true']
        }
      }

      callback({ responseHeaders })
    })

    // 根据安全设置决定是否允许所有证书和其他安全选项
    if (DISABLE_SECURITY) {
      // 允许所有证书
      browserSession.setCertificateVerifyProc((_request, callback) => {
        callback(0) // 0表示证书有效
      })

      // 允许不安全内容
      browserSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': ["default-src * 'unsafe-inline' 'unsafe-eval' data: blob: sentry-ipc:;"]
          }
        })
      })

      // 设置cookie行为
      browserSession.cookies.set({
        url: 'https://accounts.google.com',
        name: 'CONSENT',
        value: 'YES+',
        domain: '.google.com',
        expirationDate: Math.floor(Date.now() / 1000) + 31536000
      })
    }

    // Mac: Hide dock icon before window creation when launch to tray is set
    const isLaunchToTray = configManager.getLaunchToTray()
    if (isLaunchToTray) {
      app.dock?.hide()
    }

    const mainWindow = windowService.createMainWindow()
    new TrayService()

    app.on('activate', function () {
      const mainWindow = windowService.getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) {
        windowService.createMainWindow()
      } else {
        windowService.showMainWindow()
      }
    })

    registerShortcuts(mainWindow)

    registerIpc(mainWindow, app)

    // 初始化模块文件管理器
    // 注意：ModuleFileManager 已经是一个初始化好的实例
    // 导入时就已经调用了 getInstance()

    // 注意: MsTTS IPC处理程序已在ipc.ts中注册
    // 不需要再次调用registerMsTTSIpcHandlers()

    replaceDevtoolsFont(mainWindow)

    if (process.env.NODE_ENV === 'development') {
      installExtension([REDUX_DEVTOOLS, REACT_DEVELOPER_TOOLS])
        .then((name) => console.log(`Added Extension:  ${name}`))
        .catch((err) => console.log('An error occurred: ', err))
    }
    // 系统相关的IPC处理程序已在ipc.ts中注册
  })

  registerProtocolClient(app)

  // macOS specific: handle protocol when app is already running
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleProtocolUrl(url)
  })

  registerProtocolClient(app)

  // macOS specific: handle protocol when app is already running
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleProtocolUrl(url)
  })

  // Listen for second instance
  app.on('second-instance', (_event, argv) => {
    windowService.showMainWindow()

    // Protocol handler for Windows/Linux
    // The commandLine is an array of strings where the last item might be the URL
    const url = argv.find((arg) => arg.startsWith(CHERRY_STUDIO_PROTOCOL + '://'))
    if (url) handleProtocolUrl(url)
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('before-quit', () => {
    app.isQuitting = true
  })

  app.on('will-quit', async () => {
    // event.preventDefault()
    try {
      await mcpService.cleanup()
    } catch (error) {
      Logger.error('Error cleaning up MCP service:', error)
    }
  })

  // In this file you can include the rest of your app"s specific main process
  // code. You can also put them in separate files and require them here.
}

