import './DeepResearchPanel.css'

import {
  BulbOutlined,
  DownloadOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  LinkOutlined,
  SearchOutlined
} from '@ant-design/icons'
import DeepResearchProvider from '@renderer/providers/WebSearchProvider/DeepResearchProvider'
import { ResearchIteration, ResearchReport, WebSearchResult } from '@renderer/types'
import {
  Button,
  Card,
  Collapse,
  Divider,
  Dropdown,
  Input,
  List,
  Menu,
  message,
  Modal,
  Space,
  Spin,
  Tag,
  Typography
} from 'antd'
import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { useWebSearchStore } from '../../hooks/useWebSearchStore'

const { Title, Paragraph, Text } = Typography
const { Panel } = Collapse

// 定义历史研究记录的接口
interface ResearchHistory {
  id: string
  query: string
  date: string
  report: ResearchReport
}

// 定义导出格式类型
type ExportFormat = 'markdown' | 'html'

const DeepResearchPanel: React.FC = () => {
  const [query, setQuery] = useState('')
  const [isResearching, setIsResearching] = useState(false)
  const [report, setReport] = useState<ResearchReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [maxIterations, setMaxIterations] = useState(3)
  const [historyVisible, setHistoryVisible] = useState(false)
  const [history, setHistory] = useState<ResearchHistory[]>([])
  const [currentIteration, setCurrentIteration] = useState(0)
  const [progressStatus, setProgressStatus] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)

  const { providers, selectedProvider, websearch } = useWebSearchStore()

  // 加载历史记录
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const savedHistory = localStorage.getItem('deepResearchHistory')
        if (savedHistory) {
          setHistory(JSON.parse(savedHistory))
        }
      } catch (err) {
        console.error('加载历史记录失败:', err)
      }
    }

    loadHistory()
  }, [])

  // 保存历史记录
  const saveToHistory = (newReport: ResearchReport) => {
    try {
      const newHistory: ResearchHistory = {
        id: Date.now().toString(),
        query: newReport.originalQuery,
        date: new Date().toLocaleString(),
        report: newReport
      }

      const updatedHistory = [newHistory, ...history].slice(0, 20) // 只保存20条记录
      setHistory(updatedHistory)
      localStorage.setItem('deepResearchHistory', JSON.stringify(updatedHistory))
    } catch (err) {
      console.error('保存历史记录失败:', err)
    }
  }

  // 导出报告为Markdown文件
  const exportToMarkdown = (reportToExport: ResearchReport) => {
    try {
      let markdown = `# 深度研究报告: ${reportToExport.originalQuery}\n\n`

      // 添加问题回答
      markdown += `## 问题回答\n\n${reportToExport.directAnswer}\n\n`

      // 添加关键见解
      markdown += `## 关键见解\n\n`
      reportToExport.keyInsights.forEach((insight) => {
        markdown += `- ${insight}\n`
      })

      // 添加研究总结
      markdown += `\n## 研究总结\n\n${reportToExport.summary}\n\n`

      // 添加研究过程
      markdown += `## 研究过程\n\n`
      reportToExport.iterations.forEach((iteration, index) => {
        markdown += `### 迭代 ${index + 1}: ${iteration.query}\n\n`
        markdown += `#### 分析\n\n${iteration.analysis}\n\n`

        if (iteration.followUpQueries.length > 0) {
          markdown += `#### 后续查询\n\n`
          iteration.followUpQueries.forEach((q) => {
            markdown += `- ${q}\n`
          })
          markdown += '\n'
        }
      })

      // 添加信息来源
      markdown += `## 信息来源\n\n`
      reportToExport.sources.forEach((source) => {
        markdown += `- [${source}](${source})\n`
      })

      // 添加Token统计
      if (reportToExport.tokenUsage) {
        markdown += `\n## Token统计\n\n`
        markdown += `- 输入Token数: ${reportToExport.tokenUsage.inputTokens.toLocaleString()}\n`
        markdown += `- 输出Token数: ${reportToExport.tokenUsage.outputTokens.toLocaleString()}\n`
        markdown += `- 总计Token数: ${reportToExport.tokenUsage.totalTokens.toLocaleString()}\n`
      }

      // 创建Blob并下载
      const blob = new Blob([markdown], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `深度研究-${reportToExport.originalQuery.substring(0, 20)}-${new Date().toISOString().split('T')[0]}.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      message.success('报告导出成功')
    } catch (err) {
      console.error('导出报告失败:', err)
      message.error('导出报告失败')
    }
  }

  // 导出报告为HTML文件
  const exportToHtml = (reportToExport: ResearchReport) => {
    try {
      // 创建HTML内容
      let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>深度研究报告: ${reportToExport.originalQuery}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0 auto; max-width: 900px; padding: 20px; }
          h1 { color: #1890ff; border-bottom: 1px solid #eee; padding-bottom: 10px; }
          h2 { margin-top: 25px; color: #333; }
          h3 { margin-top: 20px; color: #444; }
          .insights { background-color: #f9f9f9; padding: 15px; border-radius: 5px; }
          .source-link { color: #1890ff; text-decoration: none; }
          .source-link:hover { text-decoration: underline; }
          .token-stats { background-color: #f0f0f0; padding: 10px; margin: 15px 0; border-radius: 5px; }
          pre { background-color: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <h1>深度研究报告: ${reportToExport.originalQuery}</h1>

        <h2>问题回答</h2>
        <div>${reportToExport.directAnswer.replace(/\n/g, '<br>')}</div>

        <h2>关键见解</h2>
        <div class="insights">
          <ul>
            ${reportToExport.keyInsights.map((insight) => `<li>${insight}</li>`).join('')}
          </ul>
        </div>

        <h2>研究总结</h2>
        <div>${reportToExport.summary.replace(/\n/g, '<br>')}</div>

        <h2>研究过程</h2>
      `

      // 添加迭代过程
      reportToExport.iterations.forEach((iteration, index) => {
        html += `
        <h3>迭代 ${index + 1}: ${iteration.query}</h3>
        <h4>分析</h4>
        <div>${iteration.analysis.replace(/\n/g, '<br>')}</div>
        `

        if (iteration.followUpQueries.length > 0) {
          html += `
          <h4>后续查询</h4>
          <ul>
            ${iteration.followUpQueries.map((q) => `<li>${q}</li>`).join('')}
          </ul>
          `
        }
      })

      // 添加信息来源
      html += `
        <h2>信息来源</h2>
        <ul>
          ${reportToExport.sources.map((source) => `<li><a href="${source}" class="source-link" target="_blank">${source}</a></li>`).join('')}
        </ul>
      `

      // 添加Token统计
      if (reportToExport.tokenUsage) {
        html += `
        <div class="token-stats">
          <h2>Token统计</h2>
          <ul>
            <li>输入Token数: ${reportToExport.tokenUsage.inputTokens.toLocaleString()}</li>
            <li>输出Token数: ${reportToExport.tokenUsage.outputTokens.toLocaleString()}</li>
            <li>总计Token数: ${reportToExport.tokenUsage.totalTokens.toLocaleString()}</li>
          </ul>
        </div>
        `
      }

      html += `
      </body>
      </html>
      `

      // 创建Blob并下载
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `深度研究-${reportToExport.originalQuery.substring(0, 20)}-${new Date().toISOString().split('T')[0]}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      message.success('HTML报告导出成功')
    } catch (err) {
      console.error('导出HTML报告失败:', err)
      message.error('导出HTML报告失败')
    }
  }

  // 导出报告的统一函数
  const exportReport = (format: ExportFormat, reportToExport: ResearchReport) => {
    switch (format) {
      case 'markdown':
        exportToMarkdown(reportToExport)
        break
      case 'html':
        exportToHtml(reportToExport)
        break
      default:
        exportToMarkdown(reportToExport)
    }
  }

  // 从历史记录中加载报告
  const loadFromHistory = (historyItem: ResearchHistory) => {
    setReport(historyItem.report)
    setQuery(historyItem.query)
    setHistoryVisible(false)
  }

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
  }

  const handleMaxIterationsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value)
    if (!isNaN(value) && value > 0) {
      setMaxIterations(value)
    }
  }

  const startResearch = async () => {
    if (!query.trim()) {
      setError('请输入研究查询')
      return
    }

    if (!selectedProvider) {
      setError('请选择搜索提供商')
      return
    }

    setIsResearching(true)
    setError(null)
    setReport(null)
    setCurrentIteration(0)
    setProgressStatus('准备中...')
    setProgressPercent(0)

    try {
      const provider = providers.find((p) => p.id === selectedProvider)
      if (!provider) {
        throw new Error('找不到选定的搜索提供商')
      }

      const deepResearchProvider = new DeepResearchProvider(provider)
      deepResearchProvider.setAnalysisConfig({
        maxIterations,
        ...(websearch?.deepResearchConfig?.modelId ? { modelId: websearch.deepResearchConfig.modelId } : {})
      })

      // 确保 websearch 存在，如果不存在则创建一个空对象
      const webSearchState = websearch || {
        defaultProvider: selectedProvider,
        providers,
        maxResults: 10,
        excludeDomains: [],
        searchWithTime: false,
        subscribeSources: [],
        overwrite: false,
        deepResearchConfig: {
          maxIterations,
          maxResultsPerQuery: 50,
          autoSummary: true,
          enableQueryOptimization: true
        }
      }

      // 添加进度回调
      const progressCallback = (iteration: number, status: string, percent: number) => {
        setCurrentIteration(iteration)
        setProgressStatus(status)
        setProgressPercent(percent)
      }

      // 开始研究
      const researchReport = await deepResearchProvider.research(query, webSearchState, progressCallback)
      setReport(researchReport)

      // 保存到历史记录
      saveToHistory(researchReport)
    } catch (err: any) {
      console.error('深度研究失败:', err)
      setError(`研究过程中出错: ${err?.message || '未知错误'}`)
    } finally {
      setIsResearching(false)
      setProgressStatus('')
      setProgressPercent(100)
    }
  }

  const renderResultItem = (result: WebSearchResult) => (
    <List.Item>
      <Card
        title={
          <a href={result.url} target="_blank" rel="noopener noreferrer">
            {result.title}
          </a>
        }
        size="small"
        style={{ width: '100%', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
        <Paragraph ellipsis={{ rows: 3 }}>
          {result.content ? result.content.substring(0, 200) + '...' : '无内容'}
        </Paragraph>
        <Text type="secondary" style={{ wordBreak: 'break-word', overflowWrap: 'break-word', display: 'block' }}>
          来源: {result.url}
        </Text>
      </Card>
    </List.Item>
  )

  const renderIteration = (iteration: ResearchIteration, index: number) => (
    <Panel
      header={
        <Space>
          <FileSearchOutlined />
          <span>
            迭代 {index + 1}: {iteration.query}
          </span>
        </Space>
      }
      key={index}>
      <Title level={5}>搜索结果</Title>
      <List dataSource={iteration.results} renderItem={renderResultItem} grid={{ gutter: 16, column: 1 }} />

      <Divider />

      <Title level={5}>分析</Title>
      <Card>
        <ReactMarkdown remarkPlugins={[remarkGfm]} className="markdown">
          {iteration.analysis}
        </ReactMarkdown>
      </Card>

      <Divider />

      <Title level={5}>后续查询</Title>
      <Space wrap>
        {iteration.followUpQueries.map((q, i) => (
          <Tag color="blue" key={i}>
            {q}
          </Tag>
        ))}
      </Space>
    </Panel>
  )

  const renderReport = () => {
    if (!report) return null

    return (
      <div>
        <Card>
          <Title level={3}>
            <ExperimentOutlined /> 深度研究报告: {report.originalQuery}
          </Title>
          {report.tokenUsage && (
            <div className="token-stats">
              Token统计: 输入 {report.tokenUsage.inputTokens.toLocaleString()} | 输出{' '}
              {report.tokenUsage.outputTokens.toLocaleString()} | 总计 {report.tokenUsage.totalTokens.toLocaleString()}
            </div>
          )}

          <Divider />

          <Title level={4} className="direct-answer-title">
            问题回答
          </Title>
          <Card className="direct-answer-card">
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="markdown">
              {report.directAnswer}
            </ReactMarkdown>
          </Card>

          <Divider />

          <Title level={4}>
            <BulbOutlined /> 关键见解
          </Title>
          <List
            dataSource={report.keyInsights}
            renderItem={(item) => (
              <List.Item>
                <Text>{item}</Text>
              </List.Item>
            )}
          />

          <Divider />

          <Title level={4}>研究总结</Title>
          <Card>
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="markdown">
              {report.summary}
            </ReactMarkdown>
          </Card>

          <Divider />

          <Title level={4}>研究迭代</Title>
          <Collapse>{report.iterations.map((iteration, index) => renderIteration(iteration, index))}</Collapse>

          <Divider />

          <Title level={4}>
            <LinkOutlined /> 信息来源
          </Title>
          <List
            dataSource={report.sources}
            renderItem={(source) => (
              <List.Item>
                <a href={source} target="_blank" rel="noopener noreferrer" className="source-link">
                  {source}
                </a>
              </List.Item>
            )}
          />
        </Card>
      </div>
    )
  }

  // 为历史记录中的每一项渲染导出选项
  const renderExportMenu = (historyItem: ResearchHistory) => (
    <Menu>
      <Menu.Item key="markdown" onClick={() => exportReport('markdown', historyItem.report)}>
        导出为Markdown
      </Menu.Item>
      <Menu.Item key="html" onClick={() => exportReport('html', historyItem.report)}>
        导出为HTML
      </Menu.Item>
    </Menu>
  )

  // 渲染历史记录对话框
  const renderHistoryModal = () => (
    <Modal
      title={
        <div>
          <HistoryOutlined /> 历史研究记录
        </div>
      }
      open={historyVisible}
      onCancel={() => setHistoryVisible(false)}
      footer={null}
      width={800}>
      <List
        dataSource={history}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button key="load" type="link" onClick={() => loadFromHistory(item)}>
                加载
              </Button>,
              <Dropdown key="export" overlay={renderExportMenu(item)}>
                <Button type="link">
                  导出 <DownloadOutlined />
                </Button>
              </Dropdown>
            ]}>
            <List.Item.Meta
              title={item.query}
              description={
                <div>
                  <div>日期: {item.date}</div>
                  <div>迭代次数: {item.report.iterations.length}</div>
                </div>
              }
            />
          </List.Item>
        )}
        locale={{ emptyText: '暂无历史记录' }}
      />
    </Modal>
  )

  return (
    <div className="deep-research-container">
      <Title level={3}>
        <ExperimentOutlined /> 深度研究
      </Title>
      <Paragraph>深度研究功能通过多轮搜索、分析和总结，为您提供全面的研究报告。</Paragraph>

      <Space direction="vertical" style={{ width: '100%', marginBottom: '20px' }}>
        <Input
          placeholder="输入研究主题或问题"
          value={query}
          onChange={handleQueryChange}
          prefix={<SearchOutlined />}
          size="large"
        />

        <Space>
          <Text>最大迭代次数:</Text>
          <Input type="number" value={maxIterations} onChange={handleMaxIterationsChange} style={{ width: '60px' }} />

          <Button
            type="primary"
            icon={<ExperimentOutlined />}
            onClick={startResearch}
            loading={isResearching}
            disabled={!query.trim() || !selectedProvider}>
            开始深度研究
          </Button>

          <Button icon={<HistoryOutlined />} onClick={() => setHistoryVisible(true)} disabled={isResearching}>
            历史记录
          </Button>

          {report && (
            <Dropdown
              overlay={
                <Menu>
                  <Menu.Item key="markdown" onClick={() => exportReport('markdown', report)}>
                    导出为Markdown
                  </Menu.Item>
                  <Menu.Item key="html" onClick={() => exportReport('html', report)}>
                    导出为HTML
                  </Menu.Item>
                </Menu>
              }>
              <Button icon={<DownloadOutlined />} disabled={isResearching}>
                导出报告
              </Button>
            </Dropdown>
          )}
        </Space>
      </Space>

      {error && <div className="error-message">{error}</div>}

      {isResearching && (
        <div className="research-loading">
          <Spin size="large" />
          <div className="loading-status">
            <div>正在进行深度研究: {progressStatus}</div>
            <div className="iteration-info">
              迭代 {currentIteration}/{maxIterations}
            </div>
            <div className="progress-container">
              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="progress-percentage">{progressPercent}%</div>
            </div>
          </div>
        </div>
      )}

      {report && renderReport()}

      {/* 渲染历史记录对话框 */}
      {renderHistoryModal()}
    </div>
  )
}

export default DeepResearchPanel
