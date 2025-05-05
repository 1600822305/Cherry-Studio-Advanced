// 浏览器预加载脚本
// 用于修改浏览器环境，绕过反爬虫检测

// 控制是否启用浏览器模拟脚本
window.ENABLE_BROWSER_EMULATION = true

// 使用Chrome 126的用户代理字符串，但保留Chrome 134的功能
const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// 覆盖navigator.userAgent
Object.defineProperty(navigator, 'userAgent', {
  value: userAgent,
  writable: false
})

// 覆盖navigator.platform
Object.defineProperty(navigator, 'platform', {
  value: 'Win32',
  writable: false
})

// Chrome 126的品牌信息
const brands = [
  { brand: 'Chromium', version: '126' },
  { brand: 'Google Chrome', version: '126' },
  { brand: 'Not-A.Brand', version: '99' }
]

// 覆盖navigator.userAgentData
if (!navigator.userAgentData) {
  Object.defineProperty(navigator, 'userAgentData', {
    value: {
      brands: brands,
      mobile: false,
      platform: 'Windows',
      toJSON: function () {
        return { brands, mobile: false, platform: 'Windows' }
      }
    },
    writable: false
  })
} else {
  // 如果已经存在，则修改其属性
  Object.defineProperty(navigator.userAgentData, 'brands', {
    value: brands,
    writable: false
  })
  Object.defineProperty(navigator.userAgentData, 'platform', {
    value: 'Windows',
    writable: false
  })
}

// 覆盖navigator.plugins - Chrome 134的插件列表
Object.defineProperty(navigator, 'plugins', {
  value: [
    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    {
      name: 'Chrome PDF Viewer',
      filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
      description: 'Portable Document Format'
    },
    { name: 'Native Client', filename: 'internal-nacl-plugin', description: 'Native Client' }
  ],
  writable: false
})

// 覆盖navigator.languages
Object.defineProperty(navigator, 'languages', {
  value: ['zh-CN', 'zh', 'en-US', 'en'],
  writable: false
})

// 覆盖window.chrome - 增强的Chrome对象结构，支持扩展API
window.chrome = {
  runtime: {
    id: undefined,
    getURL: (path) => {
      return `chrome-extension://undefined/${path}`
    },
    connect: function () {
      return {
        onDisconnect: {
          addListener: function () {
            /* 空方法，用于模拟Chrome API */
          }
        },
        onMessage: {
          addListener: function () {
            /* 空方法，用于模拟Chrome API */
          }
        },
        postMessage: function () {
          /* 空方法，用于模拟Chrome API */
        }
      }
    },
    sendMessage: function () {
      return Promise.resolve()
    },
    onMessage: {
      addListener: function (callback) {
        this._listeners = this._listeners || []
        this._listeners.push(callback)
        return callback
      },
      removeListener: function (callback) {
        this._listeners = this._listeners || []
        this._listeners = this._listeners.filter((listener) => listener !== callback)
      }
    },
    onConnect: {
      addListener: function () {
        /* 空方法，用于模拟Chrome API */
      }
    },
    onInstalled: {
      addListener: function () {
        /* 空方法，用于模拟Chrome API */
      }
    },
    getManifest: function () {
      return {}
    }
  },
  loadTimes: function () {
    return {
      firstPaintTime: 0,
      firstPaintAfterLoadTime: 0,
      requestTime: Date.now() / 1000,
      startLoadTime: Date.now() / 1000,
      commitLoadTime: Date.now() / 1000,
      finishDocumentLoadTime: Date.now() / 1000,
      finishLoadTime: Date.now() / 1000,
      navigationType: 'Other'
    }
  },
  csi: function () {
    return { startE: Date.now(), onloadT: Date.now() }
  },
  app: { isInstalled: false },
  webstore: { onInstallStageChanged: {}, onDownloadProgress: {} },

  // 添加更多扩展API支持
  tabs: {
    query: function () {
      return Promise.resolve([])
    },
    sendMessage: function () {
      return Promise.resolve()
    },
    executeScript: function () {
      return Promise.resolve()
    },
    update: function () {
      return Promise.resolve()
    },
    create: function () {
      return Promise.resolve()
    },
    getCurrent: function () {
      return Promise.resolve({ id: 1 })
    },
    onUpdated: {
      addListener: function () {
        /* 空方法，用于模拟Chrome API */
      }
    },
    onActivated: {
      addListener: function () {
        /* 空方法，用于模拟Chrome API */
      }
    }
  },
  storage: {
    local: {
      get: function () {
        return Promise.resolve({})
      },
      set: function () {
        return Promise.resolve()
      },
      remove: function () {
        return Promise.resolve()
      },
      clear: function () {
        return Promise.resolve()
      }
    },
    sync: {
      get: function () {
        return Promise.resolve({})
      },
      set: function () {
        return Promise.resolve()
      },
      remove: function () {
        return Promise.resolve()
      },
      clear: function () {
        return Promise.resolve()
      }
    },
    onChanged: {
      addListener: function () {
        /* 空方法，用于模拟Chrome API */
      }
    }
  },
  contextMenus: {
    create: function () {
      return 1
    },
    update: function () {
      return Promise.resolve()
    },
    remove: function () {
      return Promise.resolve()
    },
    removeAll: function () {
      return Promise.resolve()
    },
    onClicked: {
      addListener: function () {
        /* 空方法，用于模拟Chrome API */
      }
    }
  },
  cookies: {
    get: function () {
      return Promise.resolve({})
    },
    getAll: function () {
      return Promise.resolve([])
    },
    set: function () {
      return Promise.resolve()
    },
    remove: function () {
      return Promise.resolve()
    },
    onChanged: {
      addListener: function () {
        /* 空方法，用于模拟Chrome API */
      }
    }
  },
  extension: {
    getURL: function (path) {
      return `chrome-extension://undefined/${path}`
    },
    getBackgroundPage: function () {
      return window
    },
    isAllowedIncognitoAccess: function () {
      return Promise.resolve(true)
    },
    isAllowedFileSchemeAccess: function () {
      return Promise.resolve(true)
    }
  },
  i18n: {
    getMessage: function (messageName) {
      return messageName
    }
  },
  permissions: {
    contains: function () {
      return Promise.resolve(true)
    },
    request: function () {
      return Promise.resolve(true)
    },
    remove: function () {
      return Promise.resolve(true)
    },
    onAdded: {
      addListener: function () {
        /* 空方法，用于模拟Chrome API */
      }
    },
    onRemoved: {
      addListener: function () {
        /* 空方法，用于模拟Chrome API */
      }
    }
  },
  browserAction: {
    setIcon: function () {
      return Promise.resolve()
    },
    setBadgeText: function () {
      return Promise.resolve()
    },
    setBadgeBackgroundColor: function () {
      return Promise.resolve()
    },
    setTitle: function () {
      return Promise.resolve()
    },
    onClicked: {
      addListener: function () {
        /* 空方法，用于模拟Chrome API */
      }
    }
  },
  action: {
    setIcon: function () {
      return Promise.resolve()
    },
    setBadgeText: function () {
      return Promise.resolve()
    },
    setBadgeBackgroundColor: function () {
      return Promise.resolve()
    },
    setTitle: function () {
      return Promise.resolve()
    },
    onClicked: {
      addListener: function () {
        /* 空方法，用于模拟Chrome API */
      }
    }
  }
}

// 添加WebGL支持检测 - 更新为Chrome 134的特征
try {
  const origGetContext = HTMLCanvasElement.prototype.getContext
  if (origGetContext) {
    HTMLCanvasElement.prototype.getContext = function (type, attributes) {
      if (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2') {
        const gl = origGetContext.call(this, type, attributes)
        if (gl) {
          // 修改WebGL参数以模拟Chrome 134
          const getParameter = gl.getParameter.bind(gl)
          gl.getParameter = function (parameter) {
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 37445) {
              return 'Google Inc. (Intel)'
            }
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 37446) {
              return 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'
            }
            // VERSION
            if (parameter === 7938) {
              return 'WebGL 2.0 (OpenGL ES 3.0 Chromium)'
            }
            // SHADING_LANGUAGE_VERSION
            if (parameter === 35724) {
              return 'WebGL GLSL ES 3.00 (OpenGL ES GLSL ES 3.0 Chromium)'
            }
            // VENDOR
            if (parameter === 7936) {
              return 'Google Inc.'
            }
            // RENDERER
            if (parameter === 7937) {
              return 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'
            }
            return getParameter(parameter)
          }
        }
        return gl
      }
      return origGetContext.call(this, type, attributes)
    }
  }
} catch (e) {
  console.error('Failed to patch WebGL:', e)
}

// 添加音频上下文支持 - Chrome 134版本
try {
  if (typeof AudioContext !== 'undefined') {
    const origAudioContext = AudioContext
    window.AudioContext = function () {
      const context = new origAudioContext()

      // 模拟Chrome 134的音频上下文属性
      if (context.sampleRate) {
        Object.defineProperty(context, 'sampleRate', {
          value: 48000,
          writable: false
        })
      }

      // 模拟音频目标节点
      const origCreateMediaElementSource = context.createMediaElementSource
      if (origCreateMediaElementSource) {
        context.createMediaElementSource = function (mediaElement) {
          const source = origCreateMediaElementSource.call(this, mediaElement)
          return source
        }
      }

      return context
    }
  }
} catch (e) {
  console.error('Failed to patch AudioContext:', e)
}

// 添加电池API模拟 - Chrome 134版本
try {
  if (navigator.getBattery) {
    navigator.getBattery = function () {
      return Promise.resolve({
        charging: true,
        chargingTime: 0,
        dischargingTime: Infinity,
        level: 1.0,
        addEventListener: function (type, listener) {
          // 实现一个简单的事件监听器
          if (!this._listeners) this._listeners = {}
          if (!this._listeners[type]) this._listeners[type] = []
          this._listeners[type].push(listener)
        },
        removeEventListener: function (type, listener) {
          // 实现事件监听器的移除
          if (!this._listeners || !this._listeners[type]) return
          const index = this._listeners[type].indexOf(listener)
          if (index !== -1) this._listeners[type].splice(index, 1)
        }
      })
    }
  }
} catch (e) {
  console.error('Failed to patch Battery API:', e)
}

// 添加硬件并发层级 - Chrome 134通常报告实际CPU核心数
try {
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    value: 8, // 设置为一个合理的值，如8核
    writable: false
  })
} catch (e) {
  console.error('Failed to patch hardwareConcurrency:', e)
}

// 添加设备内存 - Chrome 134会报告实际内存
try {
  Object.defineProperty(navigator, 'deviceMemory', {
    value: 8, // 设置为8GB
    writable: false
  })
} catch (e) {
  console.error('Failed to patch deviceMemory:', e)
}

// 添加连接信息 - Chrome 134的NetworkInformation API
try {
  if (!navigator.connection) {
    Object.defineProperty(navigator, 'connection', {
      value: {
        effectiveType: '4g',
        rtt: 50,
        downlink: 10,
        saveData: false,
        addEventListener: function (type, listener) {
          // 简单实现
          if (!this._listeners) this._listeners = {}
          if (!this._listeners[type]) this._listeners[type] = []
          this._listeners[type].push(listener)
        },
        removeEventListener: function (type, listener) {
          // 简单实现
          if (!this._listeners || !this._listeners[type]) return
          const index = this._listeners[type].indexOf(listener)
          if (index !== -1) this._listeners[type].splice(index, 1)
        }
      },
      writable: false
    })
  }
} catch (e) {
  console.error('Failed to patch NetworkInformation API:', e)
}

// Cloudflare 验证处理已完全移除
// 测试表明不需要特殊的 CF 验证处理，移除后没有任何影响
// 如果将来需要，可以参考备份文件：src\renderer\src\pages\Browser\utils\cloudflareHandler.ts.bak

console.log('Browser preload script loaded successfully')
