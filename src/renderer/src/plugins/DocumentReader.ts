/**
 * 多格式文档阅读器插件
 * 支持查看PDF、Word、Excel、PowerPoint等多种文档格式
 */
import DocumentReaderSettings from '@renderer/components/plugins/document-reader/DocumentReaderSettings'
import DocumentViewerComponent from '@renderer/components/plugins/document-reader/DocumentViewerComponent'
import { Plugin, PluginAPI } from '@renderer/types/plugin'

// 支持的文档类型
export enum DocumentType {
  PDF = 'pdf',
  WORD = 'docx',
  EXCEL = 'xlsx',
  POWERPOINT = 'pptx',
  TEXT = 'txt',
  MARKDOWN = 'md',
  HTML = 'html',
  IMAGE = 'image' // 包括jpg, png, gif等
}

// 文档阅读器插件定义
const DocumentReader: Plugin = {
  // 插件元数据
  id: 'document-reader',
  name: '多格式文档阅读器',
  description: '支持查看多种文档格式，包括PDF、Word、Excel、PowerPoint等',
  version: '1.0.0',
  author: 'Cherry Ludi',
  icon: '📚',
  requiredModules: ['pdfjs-dist', 'mammoth', 'xlsx', 'pptxjs'],

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
    console.log('安装多格式文档阅读器插件')
    return true
  },

  // 激活钩子
  onActivate: async function (): Promise<boolean> {
    console.log('激活多格式文档阅读器插件')

    if (!this.api) {
      console.error('插件API未初始化')
      return false
    }

    try {
      // 注册文档查看器扩展点
      const viewerId = this.api.registerExtension({
        extensionPointId: 'document-viewer',
        component: DocumentViewerComponent,
        priority: 10
      })

      console.log('注册文档查看器扩展点成功:', viewerId)

      // 注册文档类型处理器
      registerDocumentHandlers(this.api)

      // 注册设置面板
      this.api.registerSettingsPanel({
        id: 'document-reader-settings',
        title: '文档阅读器设置',
        component: DocumentReaderSettings
      })

      // 注册菜单项
      this.api.registerMenuItem({
        id: 'document-reader-menu',
        title: '文档阅读器',
        icon: '📚',
        path: '/document-reader',
        order: 5
      })

      // 初始化设置
      const defaultSettings = {
        defaultZoom: 100,
        rememberLastOpenedFiles: true,
        maxRecentFiles: 10,
        autoSaveInterval: 5,
        darkMode: false,
        fileAssociations: {
          pdf: true,
          docx: true,
          xlsx: true,
          pptx: true,
          txt: true,
          md: true,
          html: true,
          image: true
        }
      }

      // 获取现有设置或使用默认设置
      const existingSettings = this.api.getSettings('document-reader')
      const settings =
        existingSettings && Object.keys(existingSettings).length > 0
          ? { ...defaultSettings, ...existingSettings }
          : defaultSettings

      // 保存设置
      this.api.saveSettings('document-reader', settings)

      console.log('文档阅读器插件激活成功')
      return true
    } catch (error) {
      console.error('激活文档阅读器插件失败:', error)
      return false
    }
  },

  // 停用钩子
  onDeactivate: async function (): Promise<boolean> {
    console.log('停用多格式文档阅读器插件')

    if (!this.api) {
      return true
    }

    try {
      // 移除扩展点
      this.api.unregisterExtension('document-viewer')
      return true
    } catch (error) {
      console.error('停用文档阅读器插件失败:', error)
      return false
    }
  },

  // 卸载钩子
  onUninstall: async function (): Promise<boolean> {
    console.log('卸载多格式文档阅读器插件')
    return true
  }
}

// 组件已从外部导入

// 注册文档类型处理器
function registerDocumentHandlers(api: PluginAPI) {
  // 这里会注册各种文档类型的处理器
  console.log('注册文档类型处理器')

  // 注册文档类型处理函数
  const documentHandlers = {
    [DocumentType.PDF]: handlePdfDocument,
    [DocumentType.WORD]: handleWordDocument,
    [DocumentType.EXCEL]: handleExcelDocument,
    [DocumentType.POWERPOINT]: handlePowerpointDocument,
    [DocumentType.TEXT]: handleTextDocument,
    [DocumentType.MARKDOWN]: handleMarkdownDocument,
    [DocumentType.HTML]: handleHtmlDocument,
    [DocumentType.IMAGE]: handleImageDocument
  }

  // 将处理器保存到插件设置中，以便其他组件可以访问
  const settings = api.getSettings('document-reader') || {}
  settings.documentHandlers = documentHandlers
  api.saveSettings('document-reader', settings)

  // 注册文件类型关联
  registerFileAssociations(api)
}

// 注册文件类型关联
function registerFileAssociations(api: PluginAPI) {
  // 这里可以注册文件类型关联，使系统默认使用此插件打开特定类型的文件
  console.log('注册文件类型关联')

  // 获取当前设置
  const settings = api.getSettings('document-reader') || {}
  const fileAssociations = settings.fileAssociations || {
    pdf: true,
    docx: true,
    xlsx: true,
    pptx: true,
    txt: true,
    md: true,
    html: true,
    image: true
  }

  // 保存文件关联设置
  settings.fileAssociations = fileAssociations
  api.saveSettings('document-reader', settings)

  // 注册文件类型处理函数
  // 实际应用中，这里会与操作系统的文件关联机制交互
  console.log(
    '已注册以下文件类型关联:',
    Object.keys(fileAssociations).filter((key) => fileAssociations[key])
  )
}

// 文档处理函数
function handlePdfDocument(file: File): Promise<any> {
  console.log('处理PDF文档', file.name)
  // 实际实现中，这里会使用pdfjs-dist库来处理PDF文件
  // 例如：
  // const url = URL.createObjectURL(file)
  // const loadingTask = pdfjsLib.getDocument(url)
  // return loadingTask.promise.then(pdf => {
  //   return { type: 'pdf', content: pdf }
  // })
  return Promise.resolve({ type: 'pdf', content: null })
}

function handleWordDocument(file: File): Promise<any> {
  console.log('处理Word文档', file.name)
  // 实际实现中，这里会使用mammoth.js库来处理Word文件
  // 例如：
  // return new Promise((resolve, reject) => {
  //   const reader = new FileReader()
  //   reader.onload = function(event) {
  //     const arrayBuffer = event.target?.result
  //     mammoth.convertToHtml({ arrayBuffer })
  //       .then(result => {
  //         resolve({ type: 'word', content: result.value })
  //       })
  //       .catch(reject)
  //   }
  //   reader.readAsArrayBuffer(file)
  // })
  return Promise.resolve({ type: 'word', content: null })
}

function handleExcelDocument(file: File): Promise<any> {
  console.log('处理Excel文档', file.name)
  // 实际实现中，这里会使用xlsx库来处理Excel文件
  // 例如：
  // return new Promise((resolve, reject) => {
  //   const reader = new FileReader()
  //   reader.onload = function(event) {
  //     const data = event.target?.result
  //     try {
  //       const workbook = XLSX.read(data, { type: 'array' })
  //       const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  //       const htmlTable = XLSX.utils.sheet_to_html(firstSheet)
  //       resolve({ type: 'excel', content: htmlTable })
  //     } catch (error) {
  //       reject(error)
  //     }
  //   }
  //   reader.readAsArrayBuffer(file)
  // })
  return Promise.resolve({ type: 'excel', content: null })
}

function handlePowerpointDocument(file: File): Promise<any> {
  console.log('处理PowerPoint文档', file.name)
  // 实际实现中，这里会使用pptxjs库来处理PowerPoint文件
  // 注意：pptxjs的使用方式可能与此不同，需要根据实际库的API调整
  // 例如：
  // return new Promise((resolve, reject) => {
  //   // pptxjs通常需要一个DOM元素来渲染PPT
  //   // 这里只是示例，实际使用时需要根据库的API调整
  //   resolve({ type: 'powerpoint', content: file })
  // })
  return Promise.resolve({ type: 'powerpoint', content: null })
}

function handleTextDocument(file: File): Promise<any> {
  console.log('处理文本文档', file.name)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      resolve({ type: 'text', content: e.target?.result })
    }
    reader.readAsText(file)
  })
}

function handleMarkdownDocument(file: File): Promise<any> {
  console.log('处理Markdown文档', file.name)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      resolve({ type: 'markdown', content: e.target?.result })
    }
    reader.readAsText(file)
  })
}

function handleHtmlDocument(file: File): Promise<any> {
  console.log('处理HTML文档', file.name)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      resolve({ type: 'html', content: e.target?.result })
    }
    reader.readAsText(file)
  })
}

function handleImageDocument(file: File): Promise<any> {
  console.log('处理图片文件', file.name)
  return Promise.resolve({ type: 'image', content: null })
}

export default DocumentReader
