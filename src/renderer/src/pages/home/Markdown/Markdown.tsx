import 'katex/dist/katex.min.css'
import 'katex/dist/contrib/copy-tex'
import 'katex/dist/contrib/mhchem'
import '@renderer/styles/translation.css'
import '@renderer/styles/citation.css'

import MarkdownShadowDOMRenderer from '@renderer/components/MarkdownShadowDOMRenderer'
import { useSettings } from '@renderer/hooks/useSettings'
import type { MCPToolResponse, Message } from '@renderer/types' // Import MCPToolResponse
import { parseJSON } from '@renderer/utils'
import { escapeBrackets, removeSvgEmptyLines, withGeminiGrounding } from '@renderer/utils/formats'
import { findCitationInChildren } from '@renderer/utils/markdown'
import { isEmpty } from 'lodash'
import React, { type FC, memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown, { type Components } from 'react-markdown' // Keep Components type here
import rehypeKatex from 'rehype-katex'
// @ts-ignore next-line
import rehypeMathjax from 'rehype-mathjax'
import rehypeRaw from 'rehype-raw'
// @ts-ignore next-line
import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import SingleToolCallBlock from '../Messages/SingleToolCallBlock' // 导入 SingleToolCallBlock
import EditableCodeBlock from './EditableCodeBlock'
import ImagePreview from './ImagePreview'
import Link from './Link'

interface Props {
  message: Message
  toolResponses: MCPToolResponse[] // 添加工具响应数据 prop
  activeToolKeys: string[] // 添加 activeKeys prop
  copiedToolMap: Record<string, boolean> // 添加 copiedMap prop
  editingToolId: string | null // 添加 editingToolId prop
  editedToolParamsString: string // 添加 editedParams prop
  onToolToggle: React.Dispatch<React.SetStateAction<string[]>> // 添加 onToolToggle prop
  onToolCopy: (content: string, toolId: string) => void // 添加 onToolCopy prop
  onToolRerun: (toolCall: MCPToolResponse, currentParamsString: string) => void // 添加 onToolRerun prop
  onToolEdit: (toolCall: MCPToolResponse) => void // 添加 onToolEdit prop
  onToolSave: (toolCall: MCPToolResponse) => void // 添加 onToolSave prop
  onToolCancel: () => void // 添加 onToolCancel prop
  onToolParamsChange: (newParams: string) => void // 添加 onToolParamsChange prop
}

const Markdown: FC<Props> = ({
  message,
  toolResponses,
  activeToolKeys,
  copiedToolMap,
  editingToolId,
  editedToolParamsString,
  onToolToggle,
  onToolCopy,
  onToolRerun,
  onToolEdit,
  onToolSave,
  onToolCancel,
  onToolParamsChange
}) => {
  const { t } = useTranslation()
  const { renderInputMessageAsMarkdown, messageFont, mathEngine } = useSettings() // Add messageFont

  const remarkPlugins = useMemo(() => {
    const plugins = [remarkGfm, remarkCjkFriendly]
    if (mathEngine && mathEngine !== 'none') {
      plugins.push(remarkMath)
    }
    return plugins
  }, [mathEngine])

  const messageContent = useMemo(() => {
    // 检查消息内容是否为空或未定义
    if (message.content === undefined) {
      return ''
    }

    const empty = isEmpty(message.content)
    const paused = message.status === 'paused'
    const content = empty && paused ? t('message.chat.completion.paused') : withGeminiGrounding(message)
    return removeSvgEmptyLines(escapeBrackets(content))
  }, [message, t])

  const rehypePlugins = useMemo(() => {
    const plugins: any[] = []
    // 始终添加rehypeRaw插件，确保HTML标签能够被正确处理
    plugins.push(rehypeRaw)

    if (mathEngine === 'KaTeX') {
      plugins.push(rehypeKatex as any)
    } else if (mathEngine === 'MathJax') {
      plugins.push(rehypeMathjax as any)
    }
    return plugins
  }, [mathEngine])

  // Remove processToolUse function as it's based on XML tags in content,
  // which won't exist with native function calling.
  // const processToolUse = (content: string) => { ... }

  // 预处理消息内容，解码HTML实体并完全去除引用标记
  const processedMessageContent = useMemo(() => {
    // 先解码HTML实体
    let content = messageContent
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")

    // 移除各种可能的引用标记形式
    content = content
      // 移除标准引用标记
      .replace(/<sup\s+class="citation-marker"\s+data-citation='(.*?)'>(.*?)<\/sup>/g, '')
      // 移除带引号的引用
      .replace(/<sup\s+class="citation-marker"\s+data-citation="(.*?)">(.*?)<\/sup>/g, '')
      // 移除自定义引用标记
      .replace(/<citation-ref\s+data-citation="(.*?)">(.*?)<\/citation-ref>/g, '')
      // 移除HTML实体编码的引用
      .replace(/&lt;sup\s+class="citation-marker"\s+data-citation='(.*?)'&gt;(.*?)&lt;\/sup&gt;/g, '')
      // 移除任何剩余的包含"data-citation"的标签
      .replace(/<[^>]*data-citation[^>]*>.*?<\/[^>]*>/g, '');

    return content
  }, [messageContent])

  const components = useMemo(() => {
    const baseComponents = {
      a: (props: any) => {
        // 检查是否包含引用数据
        const citationData = parseJSON(findCitationInChildren(props.children))

        // 不再需要检查是否是引用链接，直接使用citationData
        // 移除未使用的变量和调试日志

        return <Link {...props} citationData={citationData} />
      },
      code: EditableCodeBlock,
      img: ImagePreview,
      pre: (props: any) => <pre style={{ overflow: 'visible' }} {...props} />,

      // 保留空的sup处理器，不做任何特殊处理
      sup: (props: any) => {
        return <sup {...props} />
      },
      // 自定义处理所有思考相关标签 - 显示思考过程的内容
      think: (props: any) => {
        // 显示思考过程的内容
        return props.children
      },
      thinking: (props: any) => {
        // 显示思考过程的内容
        return props.children
      },
      thoughts: (props: any) => {
        // 显示思考过程的内容
        return props.children
      },
      thought: (props: any) => {
        // 显示思考过程的内容
        return props.children
      },
      reasoning: (props: any) => {
        // 显示思考过程的内容
        return props.children
      },
      reason: (props: any) => {
        // 显示思考过程的内容
        return props.children
      },
      analysis: (props: any) => {
        // 显示思考过程的内容
        return props.children
      },
      reflection: (props: any) => {
        // 显示思考过程的内容
        return props.children
      },
      // 添加JSON格式思考标签的支持
      'json-thinking': (props: any) => {
        // JSON格式思考过程的内容
        return props.children
      },
      'json-thought': (props: any) => {
        // JSON格式思考过程的内容
        return props.children
      },
      // 自定义处理translated标签
      translated: (props: any) => {
        // 将translated标签渲染为可点击的span
        return (
          <span
            className="translated-text"
            onClick={(e) => window.toggleTranslation(e as unknown as MouseEvent)}
            data-original={props.original}
            data-language={props.language}>
            {props.children}
          </span>
        )
      },
      // 添加 tool-block 渲染器
      'tool-block': (props: any) => {
        console.log('[Markdown] Tool block renderer called with props:', props) // Log renderer call and props
        const toolCallId = props.id // 获取占位符中的 id
        console.log('[Markdown] Extracted toolCallId:', toolCallId) // Log extracted ID
        const toolResponse = toolResponses.find((tr) => tr.id === toolCallId) // 查找对应的工具响应数据
        console.log('[Markdown] Found toolResponse:', toolResponse) // Log found tool response

        if (!toolResponse) {
          return null // 如果找不到对应的工具响应，则不渲染
        }

        if (!toolResponse) {
          console.warn('[Markdown] Tool response not found for id:', toolCallId) // Warn if not found
          return null // 如果找不到对应的工具响应，则不渲染
        }

        console.log('[Markdown] Rendering SingleToolCallBlock for toolCallId:', toolCallId) // Log rendering SingleToolCallBlock
        // 渲染 SingleToolCallBlock 组件，并传递必要的 props
        return (
          <div className="tool-block-wrapper separated-tool-block">
            <SingleToolCallBlock
              toolResponse={toolResponse}
              isActive={activeToolKeys.includes(toolCallId)}
              isCopied={copiedToolMap[toolCallId] || false}
              isEditing={editingToolId === toolCallId}
              editedParamsString={editedToolParamsString}
              fontFamily={
                messageFont === 'serif'
                  ? 'serif'
                  : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans","Helvetica Neue", sans-serif'
              } // 传递字体样式
              t={t} // 传递翻译函数
              onToggle={() =>
                onToolToggle((prev) =>
                  prev.includes(toolCallId) ? prev.filter((k) => k !== toolCallId) : [...prev, toolCallId]
                )
              } // 传递 onToolToggle 函数
              onCopy={onToolCopy} // 传递 onToolCopy 函数
              onRerun={onToolRerun} // 传递 onToolRerun 函数
              onEdit={onToolEdit} // 传递 onToolEdit 函数
              onSave={() => toolResponse && onToolSave(toolResponse)} // 传递 onToolSave 函数
              onCancel={onToolCancel} // 传递 onToolCancel 函数
              onParamsChange={onToolParamsChange} // 传递 onToolParamsChange 函数
            />
          </div>
        )
      }
    } as Partial<Components>
    return baseComponents
  }, [
    toolResponses, // 添加 toolResponses 依赖
    activeToolKeys, // 添加 activeToolKeys 依赖
    copiedToolMap, // 添加 copiedToolMap 依赖
    editingToolId, // 添加 editingToolId 依赖
    editedToolParamsString, // 添加 editedToolParamsString 依赖
    onToolToggle, // 添加 onToolToggle 依赖
    onToolCopy, // 添加 onToolCopy 依赖
    onToolRerun, // 添加 onToolRerun 依赖
    onToolEdit, // 添加 onToolEdit 依赖
    onToolSave, // 添加 onToolSave 依赖
    onToolCancel, // 添加 onToolCancel 依赖
    onToolParamsChange, // 添加 onToolParamsChange 依赖
    t, // 添加 t 依赖
    messageFont // 添加 messageFont 依赖
    // 移除不再需要的依赖
    // message.model?.provider
    // message.model?.id
  ])

  // 使用useEffect在渲染后添加事件处理
  React.useEffect(() => {
    // 在组件挂载后，为所有引用标记添加点击事件
    const addCitationClickHandlers = () => {
      const citations = document.querySelectorAll('sup[data-citation]')
      // console.log('Found citation elements:', citations.length)

      citations.forEach((citation) => {
        // 确保元素有data-citation属性
        const citationData = citation.getAttribute('data-citation')
        if (!citationData) return

        try {
          const data = JSON.parse(citationData)
          // console.log('Citation data:', data)

          // 添加点击事件
          citation.addEventListener('click', (e) => {
            e.preventDefault()
            // 移除阻止冒泡，只阻止默认行为
            // e.stopPropagation()

            // console.log('Citation clicked:', data)

            // 如果是锚点链接，滚动到页面对应位置
            if (data.url && data.url.startsWith('#')) {
              const element = document.querySelector(data.url)
              if (element) {
                element.scrollIntoView({ behavior: 'smooth' })
              }
            } else if (data.url) {
              // 否则打开外部链接
              window.open(data.url, '_blank')
            }
          })

          // 添加样式
          // 使用 HTMLElement 类型断言
          if (citation instanceof HTMLElement) {
            citation.style.cursor = 'pointer'
            citation.style.color = 'var(--color-link)'
          }
        } catch (error) {
          console.error('Error parsing citation data:', error)
        }
      })
    }

    // 延迟执行，确保DOM已经渲染完成
    setTimeout(addCitationClickHandlers, 100)

    // 组件卸载时清理
    return () => {
      // 清理工作（如果需要）
    }
  }, [processedMessageContent]) // 当消息内容变化时重新执行

  // 处理样式标签
  if (processedMessageContent.includes('<style>')) {
    components.style = MarkdownShadowDOMRenderer as any
  }

  // 用户消息且不需要渲染为Markdown
  if (message.role === 'user' && !renderInputMessageAsMarkdown) {
    return <p className="user-message-content">{messageContent}</p>
  }

  // 渲染Markdown内容
  return (
    <ReactMarkdown
      rehypePlugins={rehypePlugins}
      remarkPlugins={remarkPlugins}
      className="markdown"
      components={components}
      remarkRehypeOptions={{
        footnoteLabel: t('common.footnotes'),
        footnoteLabelTagName: 'h4',
        footnoteBackContent: ' '
      }}>
      {processedMessageContent}
    </ReactMarkdown>
  )
}

// 使用 memo 包装组件，避免不必要的重渲染
export default memo(Markdown)
