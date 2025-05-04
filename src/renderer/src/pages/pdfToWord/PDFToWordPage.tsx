import { InboxOutlined } from '@ant-design/icons'
import { Button, Card, Empty, message, Upload } from 'antd'
import React, { useState } from 'react'
import styled from 'styled-components'

const { Dragger } = Upload

/**
 * PDF转Word页面组件
 */
const PDFToWordPage: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState<File | null>(null)

  // 处理文件上传
  const handleFileUpload = (file: File) => {
    // 检查文件类型
    if (file.type !== 'application/pdf') {
      message.error('请上传PDF文件')
      return false
    }

    // 设置文件
    setFile(file)
    return false // 阻止默认上传行为
  }

  // 开始转换
  const handleConvert = async () => {
    if (!file) {
      message.error('请先上传PDF文件')
      return
    }

    setLoading(true)
    message.loading('正在转换中，请稍候...', 0)

    try {
      // 调用转换API
      // 这里是示例代码，实际实现需要根据项目的API进行调整
      const result = await window.api.pdf.convertToWord(file.path)

      message.destroy()
      if (result.success) {
        message.success('转换成功')
      } else {
        message.error(`转换失败: ${result.error}`)
      }
    } catch (error) {
      message.destroy()
      console.error('转换失败:', error)
      message.error('转换失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container>
      <Card title="PDF转Word工具" bordered={false}>
        <Dragger
          name="file"
          multiple={false}
          beforeUpload={handleFileUpload}
          showUploadList={!!file}
          fileList={file ? [file as any] : []}
          onRemove={() => setFile(null)}
          accept=".pdf"
          disabled={loading}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽PDF文件到此区域上传</p>
          <p className="ant-upload-hint">支持单个PDF文件</p>
        </Dragger>

        <ButtonContainer>
          <Button type="primary" onClick={handleConvert} loading={loading} disabled={!file} size="large">
            开始转换
          </Button>
        </ButtonContainer>

        {!file && !loading && (
          <EmptyContainer>
            <Empty description="请上传PDF文件以开始转换" />
          </EmptyContainer>
        )}
      </Card>
    </Container>
  )
}

const Container = styled.div`
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
`

const ButtonContainer = styled.div`
  margin-top: 20px;
  text-align: center;
`

const EmptyContainer = styled.div`
  margin-top: 40px;
`

export default PDFToWordPage
