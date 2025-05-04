const { contextBridge, ipcRenderer } = require('electron')

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('auth', {
  // 获取认证信息
  getAuthInfo: () => ipcRenderer.invoke('auth-info'),

  // 提交认证表单
  submitCredentials: (username, password) => ipcRenderer.invoke('auth-submit', username, password),

  // 取消认证
  cancelAuth: () => ipcRenderer.invoke('auth-cancel'),

  // 添加事件监听器
  on: (channel, callback) => {
    // 白名单通道
    const validChannels = ['auth-info']
    if (validChannels.includes(channel)) {
      // 转换callback以避免原型污染
      const subscription = (_event, ...args) => callback(...args)
      ipcRenderer.on(channel, subscription)

      // 返回清理函数
      return () => {
        ipcRenderer.removeListener(channel, subscription)
      }
    }
  }
})

// 日志记录初始化
console.log('Auth preload script loaded')
