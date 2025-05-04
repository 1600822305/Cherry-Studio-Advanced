/**
 * 简易文本工具插件示例
 */
import { Plugin, PluginAPI } from '@renderer/types/plugin'

// 插件定义
const SimpleTextTools: Plugin = {
  // 插件元数据
  id: 'simple-text-tools',
  name: '简易文本工具',
  description: '提供基本的文本处理工具',
  version: '1.0.0',
  author: '示例开发者',
  icon: '🔠',
  requiredModules: [],

  // 插件状态
  state: {
    isInstalled: false,
    isActive: false,
    isLoaded: false,
    hasError: false
  },

  // 储存API引用
  api: null as unknown as PluginAPI,

  // 安装钩子
  onInstall: async function (): Promise<boolean> {
    console.log('安装简易文本工具插件')
    return true
  },

  // 激活钩子
  onActivate: async function (): Promise<boolean> {
    try {
      console.log('激活简易文本工具插件')

      // 访问通过plugin.api设置的API对象
      if (!this.api) {
        console.error('插件API未初始化')
        return false
      }

      // 创建全局文本处理函数对象
      window.SimpleTextTools = {
        // 字符统计
        countChars: (text: string): number => {
          return text ? text.length : 0
        },

        // 单词统计
        countWords: (text: string): number => {
          return text ? text.split(/\s+/).filter(Boolean).length : 0
        },

        // 转换为大写
        toUpperCase: (text: string): string => {
          return text ? text.toUpperCase() : ''
        },

        // 转换为小写
        toLowerCase: (text: string): string => {
          return text ? text.toLowerCase() : ''
        },

        // 反转文本
        reverse: (text: string): string => {
          return text ? text.split('').reverse().join('') : ''
        }
      }

      // 创建显示工具UI的方法
      window.openTextTools = () => {
        // 创建简单的模态窗口
        const modal = document.createElement('div')
        modal.style.position = 'fixed'
        modal.style.top = '0'
        modal.style.left = '0'
        modal.style.width = '100vw'
        modal.style.height = '100vh'
        modal.style.backgroundColor = 'rgba(0,0,0,0.7)'
        modal.style.display = 'flex'
        modal.style.justifyContent = 'center'
        modal.style.alignItems = 'center'
        modal.style.zIndex = '10000'

        // 创建内容容器
        const container = document.createElement('div')
        container.style.backgroundColor = 'var(--color-background, white)'
        container.style.borderRadius = '8px'
        container.style.padding = '20px'
        container.style.width = '500px'
        container.style.maxWidth = '90vw'
        container.style.maxHeight = '90vh'
        container.style.overflow = 'auto'
        container.style.color = 'var(--color-text, black)'

        // 标题
        const title = document.createElement('h2')
        title.textContent = '简易文本工具'
        title.style.borderBottom = '1px solid var(--color-border, #eee)'
        title.style.paddingBottom = '10px'
        title.style.marginTop = '0'
        container.appendChild(title)

        // 输入区域
        const inputLabel = document.createElement('div')
        inputLabel.textContent = '输入文本:'
        inputLabel.style.marginBottom = '5px'
        container.appendChild(inputLabel)

        const input = document.createElement('textarea')
        input.style.width = '100%'
        input.style.height = '120px'
        input.style.padding = '8px'
        input.style.boxSizing = 'border-box'
        input.style.marginBottom = '15px'
        input.style.borderRadius = '4px'
        input.style.border = '1px solid var(--color-border, #ccc)'
        container.appendChild(input)

        // 按钮区域
        const buttonContainer = document.createElement('div')
        buttonContainer.style.display = 'flex'
        buttonContainer.style.flexWrap = 'wrap'
        buttonContainer.style.gap = '8px'
        buttonContainer.style.marginBottom = '15px'
        container.appendChild(buttonContainer)

        // 添加按钮
        const buttons = [
          {
            text: '字符统计',
            action: () => (output.value = `字符数: ${window.SimpleTextTools?.countChars(input.value) || 0}`)
          },
          {
            text: '单词统计',
            action: () => (output.value = `单词数: ${window.SimpleTextTools?.countWords(input.value) || 0}`)
          },
          { text: '转大写', action: () => (output.value = window.SimpleTextTools?.toUpperCase(input.value) || '') },
          { text: '转小写', action: () => (output.value = window.SimpleTextTools?.toLowerCase(input.value) || '') },
          { text: '反转文本', action: () => (output.value = window.SimpleTextTools?.reverse(input.value) || '') }
        ]

        buttons.forEach((btn) => {
          const button = document.createElement('button')
          button.textContent = btn.text
          button.style.padding = '6px 12px'
          button.style.backgroundColor = 'var(--color-primary, #1890ff)'
          button.style.color = 'white'
          button.style.border = 'none'
          button.style.borderRadius = '4px'
          button.style.cursor = 'pointer'
          button.onclick = btn.action
          buttonContainer.appendChild(button)
        })

        // 输出区域
        const outputLabel = document.createElement('div')
        outputLabel.textContent = '处理结果:'
        outputLabel.style.marginBottom = '5px'
        container.appendChild(outputLabel)

        const output = document.createElement('textarea')
        output.style.width = '100%'
        output.style.height = '120px'
        output.style.padding = '8px'
        output.style.boxSizing = 'border-box'
        output.style.marginBottom = '15px'
        output.style.borderRadius = '4px'
        output.style.border = '1px solid var(--color-border, #ccc)'
        output.readOnly = true
        container.appendChild(output)

        // 复制按钮
        const copyButton = document.createElement('button')
        copyButton.textContent = '复制结果'
        copyButton.style.padding = '6px 12px'
        copyButton.style.backgroundColor = 'var(--color-success, #52c41a)'
        copyButton.style.color = 'white'
        copyButton.style.border = 'none'
        copyButton.style.borderRadius = '4px'
        copyButton.style.cursor = 'pointer'
        copyButton.onclick = () => {
          output.select()
          document.execCommand('copy')
          copyButton.textContent = '已复制!'
          setTimeout(() => (copyButton.textContent = '复制结果'), 2000)
        }
        container.appendChild(copyButton)

        // 关闭按钮
        const closeButton = document.createElement('button')
        closeButton.textContent = '关闭'
        closeButton.style.padding = '6px 12px'
        closeButton.style.backgroundColor = 'var(--color-danger, #ff4d4f)'
        closeButton.style.color = 'white'
        closeButton.style.border = 'none'
        closeButton.style.borderRadius = '4px'
        closeButton.style.cursor = 'pointer'
        closeButton.style.marginLeft = '10px'
        closeButton.onclick = () => document.body.removeChild(modal)
        container.appendChild(closeButton)

        // 点击外部区域关闭
        modal.onclick = (e) => {
          if (e.target === modal) {
            document.body.removeChild(modal)
          }
        }

        modal.appendChild(container)
        document.body.appendChild(modal)
      }

      // 将功能添加到localStorage
      try {
        const existingSettingsJson = localStorage.getItem('functionSettings')
        // 明确定义settings的类型
        interface FunctionSetting {
          id: string
          name: string
          isActive: boolean
          icon: string
          requiredModules: string[]
        }

        let settings: FunctionSetting[] = []

        if (existingSettingsJson) {
          settings = JSON.parse(existingSettingsJson)
        }

        // 仅当不存在时添加
        if (!settings.some((func: FunctionSetting) => func.id === 'simple-text-tools')) {
          settings.push({
            id: 'simple-text-tools',
            name: '简易文本工具',
            isActive: true,
            icon: '🔠',
            requiredModules: []
          })

          localStorage.setItem('functionSettings', JSON.stringify(settings))
          console.log('已添加简易文本工具到侧边栏')
        }
      } catch (error) {
        console.error('保存功能设置失败:', error)
      }

      return true
    } catch (error) {
      console.error('激活简易文本工具插件失败:', error)
      return false
    }
  },

  // 停用钩子
  onDeactivate: async function (): Promise<boolean> {
    try {
      console.log('停用简易文本工具插件')

      // 从全局对象中移除
      if (window.SimpleTextTools) {
        delete window.SimpleTextTools
      }

      if (window.openTextTools) {
        delete window.openTextTools
      }

      // 从侧边栏移除
      try {
        const existingSettingsJson = localStorage.getItem('functionSettings')
        if (existingSettingsJson) {
          // 使用与上面相同的类型定义
          interface FunctionSetting {
            id: string
            name: string
            isActive: boolean
            icon: string
            requiredModules: string[]
          }

          let settings: FunctionSetting[] = JSON.parse(existingSettingsJson)
          settings = settings.filter((func: FunctionSetting) => func.id !== 'simple-text-tools')
          localStorage.setItem('functionSettings', JSON.stringify(settings))
        }
      } catch (error) {
        console.error('移除功能设置失败:', error)
      }

      return true
    } catch (error) {
      console.error('停用简易文本工具插件失败:', error)
      return false
    }
  },

  // 卸载钩子
  onUninstall: async function (): Promise<boolean> {
    console.log('卸载简易文本工具插件')
    // 已经在deactivate中处理了大部分清理工作
    return true
  }
}

// 为TypeScript全局对象添加声明
declare global {
  interface Window {
    SimpleTextTools?: {
      countChars: (text: string) => number
      countWords: (text: string) => number
      toUpperCase: (text: string) => string
      toLowerCase: (text: string) => string
      reverse: (text: string) => string
    }
    openTextTools?: () => void
  }
}

export default SimpleTextTools
