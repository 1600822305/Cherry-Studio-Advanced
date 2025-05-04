/**
 * 文档查看器组件
 * 支持查看多种文档格式
 */
import {
  FileExcelOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FileWordOutlined,
  UploadOutlined
} from '@ant-design/icons'
import { DocumentType } from '@renderer/plugins/DocumentReader'
import { Button, Empty, message, Spin, Tabs, Upload } from 'antd'
import { useState } from 'react'

// 文档查看器组件
export const DocumentViewerComponent = () => {
  const [loading, setLoading] = useState(false)
  const [openDocuments, setOpenDocuments] = useState<
    Array<{
      type: DocumentType
      name: string
      content: any
      url?: string
      key: string
    }>
  >([])
  const [activeKey, setActiveKey] = useState<string>('')

  // 处理文件上传
  const handleFileUpload = async (file: File) => {
    setLoading(true)
    try {
      const fileType = getFileType(file.name)
      if (!fileType) {
        message.error('不支持的文件类型')
        return false
      }

      // 创建文件URL
      const fileUrl = URL.createObjectURL(file)

      // 创建新的文档对象
      const newDocument = {
        type: fileType,
        name: file.name,
        content: null,
        url: fileUrl,
        key: `doc-${Date.now()}`
      }

      // 加载文档内容
      await loadDocumentContent(newDocument)

      // 添加到打开的文档列表
      setOpenDocuments((prev) => [...prev, newDocument])
      setActiveKey(newDocument.key)

      message.success(`成功打开文件: ${file.name}`)
    } catch (error) {
      console.error('打开文档失败:', error)
      message.error('打开文档失败')
    } finally {
      setLoading(false)
    }
    return false // 阻止默认上传行为
  }

  // 根据文件扩展名获取文件类型
  const getFileType = (fileName: string): DocumentType | null => {
    const extension = fileName.split('.').pop()?.toLowerCase()

    switch (extension) {
      case 'pdf':
        return DocumentType.PDF
      case 'doc':
      case 'docx':
        return DocumentType.WORD
      case 'xls':
      case 'xlsx':
        return DocumentType.EXCEL
      case 'ppt':
      case 'pptx':
        return DocumentType.POWERPOINT
      case 'txt':
        return DocumentType.TEXT
      case 'md':
        return DocumentType.MARKDOWN
      case 'html':
      case 'htm':
        return DocumentType.HTML
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
        return DocumentType.IMAGE
      default:
        return null
    }
  }

  // 加载文档内容
  const loadDocumentContent = async (document: any) => {
    // 这里应该根据文档类型加载内容
    // 实际实现中，这里会使用不同的库来处理不同类型的文档
    console.log(`加载${document.type}类型的文档: ${document.name}`)

    // 模拟加载过程
    await new Promise((resolve) => setTimeout(resolve, 500))

    // 设置文档内容（实际应用中会解析文档内容）
    document.content = '文档内容将在这里显示'
  }

  // 关闭文档
  const closeDocument = (targetKey: string) => {
    const newOpenDocuments = openDocuments.filter((doc) => doc.key !== targetKey)
    setOpenDocuments(newOpenDocuments)

    // 如果关闭的是当前活动文档，则切换到最后一个文档
    if (activeKey === targetKey && newOpenDocuments.length > 0) {
      const lastDoc = newOpenDocuments[newOpenDocuments.length - 1]
      setActiveKey(lastDoc.key)
    } else if (newOpenDocuments.length === 0) {
      setActiveKey('')
    }
  }

  // 渲染文档内容
  const renderDocumentContent = (document: any) => {
    if (!document) return <Empty description="请打开一个文档" />

    switch (document.type) {
      case DocumentType.PDF:
        return (
          <div className="pdf-viewer">
            <iframe src={document.url} width="100%" height="600px" title={document.name} />
          </div>
        )
      case DocumentType.WORD:
        return (
          <div className="word-viewer">
            <p>Word文档查看器</p>
            <p>文件名: {document.name}</p>
            {/* 实际应用中会使用docx库解析并显示Word文档 */}
          </div>
        )
      case DocumentType.EXCEL:
        return (
          <div className="excel-viewer">
            <p>Excel文档查看器</p>
            <p>文件名: {document.name}</p>
            {/* 实际应用中会使用xlsx库解析并显示Excel文档 */}
          </div>
        )
      case DocumentType.POWERPOINT:
        return (
          <div className="powerpoint-viewer">
            <p>PowerPoint文档查看器</p>
            <p>文件名: {document.name}</p>
            {/* 实际应用中会使用pptx-js库解析并显示PowerPoint文档 */}
          </div>
        )
      case DocumentType.TEXT:
      case DocumentType.MARKDOWN:
        return (
          <div className="text-viewer">
            <p>文本查看器</p>
            <p>文件名: {document.name}</p>
            <pre>{document.content}</pre>
          </div>
        )
      case DocumentType.HTML:
        return (
          <div className="html-viewer">
            <iframe src={document.url} width="100%" height="600px" title={document.name} />
          </div>
        )
      case DocumentType.IMAGE:
        return (
          <div className="image-viewer">
            <img src={document.url} alt={document.name} style={{ maxWidth: '100%', maxHeight: '600px' }} />
          </div>
        )
      default:
        return <Empty description="不支持的文档类型" />
    }
  }

  // 获取文档图标
  const getDocumentIcon = (type: DocumentType) => {
    switch (type) {
      case DocumentType.PDF:
        return <FilePdfOutlined />
      case DocumentType.WORD:
        return <FileWordOutlined />
      case DocumentType.EXCEL:
        return <FileExcelOutlined />
      case DocumentType.POWERPOINT:
      case DocumentType.TEXT:
      case DocumentType.MARKDOWN:
      case DocumentType.HTML:
      case DocumentType.IMAGE:
      default:
        return <FileTextOutlined />
    }
  }

  // 处理标签页切换
  const handleTabChange = (key: string) => {
    setActiveKey(key)
  }

  // 处理标签页编辑（关闭）
  const handleTabEdit = (targetKey: any, action: 'add' | 'remove') => {
    if (action === 'remove') {
      closeDocument(targetKey)
    }
  }

  return (
    <div className="document-viewer-container">
      <div className="document-toolbar">
        <Upload beforeUpload={handleFileUpload} showUploadList={false}>
          <Button icon={<UploadOutlined />}>打开文档</Button>
        </Upload>
      </div>

      <Spin spinning={loading}>
        {openDocuments.length > 0 ? (
          <Tabs
            type="editable-card"
            activeKey={activeKey}
            onChange={handleTabChange}
            onEdit={handleTabEdit}
            items={openDocuments.map((doc) => ({
              key: doc.key,
              label: (
                <span>
                  {getDocumentIcon(doc.type)} {doc.name.length > 15 ? doc.name.substring(0, 15) + '...' : doc.name}
                </span>
              ),
              children: renderDocumentContent(doc)
            }))}
          />
        ) : (
          <div className="empty-state">
            <Empty description="请打开一个文档以开始查看" />
            <Upload beforeUpload={handleFileUpload} showUploadList={false}>
              <Button type="primary" icon={<UploadOutlined />} style={{ marginTop: 16 }}>
                打开文档
              </Button>
            </Upload>
          </div>
        )}
      </Spin>
    </div>
  )
}

export default DocumentViewerComponent
