/**
 * 插件索引文件
 * 用于集中导出所有自定义插件
 */
import { Plugin } from '@renderer/types/plugin'

// 移除其他插件的导入
// import DocumentReader from './DocumentReader'
// import SimpleTextTools from './SimpleTextTools'

/**
 * 日历插件定义
 * 直接在这里定义，不需要单独的文件
 */
const SimpleCalendar: Plugin = {
  // 插件元数据
  id: 'simple-calendar',
  name: '简易日历',
  description: '提供简单的日历视图与日程管理功能',
  version: '1.0.0',
  author: 'Cherry Ludi',
  icon: '📅',
  requiredModules: ['dayjs'],

  // 插件状态
  state: {
    isInstalled: false,
    isActive: false,
    isLoaded: false,
    hasError: false
  },

  // 储存API引用
  api: null,

  // 安装钩子
  onInstall: async function (): Promise<boolean> {
    console.log('安装简易日历插件')
    return true
  },

  // 激活钩子
  onActivate: async function (): Promise<boolean> {
    console.log('激活简易日历插件')
    return true
  },

  // 停用钩子
  onDeactivate: async function (): Promise<boolean> {
    console.log('停用简易日历插件')
    return true
  },

  // 卸载钩子
  onUninstall: async function (): Promise<boolean> {
    console.log('卸载简易日历插件')
    return true
  }
}

// 移除其他插件定义
// ... (其他插件定义代码省略) ...

// 导出插件列表 - 只保留SimpleCalendar
export default [SimpleCalendar]

// 只导出保留的插件
export { SimpleCalendar }
