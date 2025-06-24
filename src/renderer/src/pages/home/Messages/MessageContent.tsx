import { SyncOutlined, TranslationOutlined } from '@ant-design/icons'
import TTSHighlightedText from '@renderer/components/TTSHighlightedText'
import { isOpenAIWebSearch } from '@renderer/config/models'
import { getModelUniqId } from '@renderer/services/ModelService'
import { MCPToolResponse, Message, Model } from '@renderer/types' // Import MCPToolResponse
import { getBriefInfo } from '@renderer/utils'
import { withMessageThought } from '@renderer/utils/formats'
import { Collapse, Divider, Flex } from 'antd'
import { clone } from 'lodash'
import { Search } from 'lucide-react'
import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react' // Import useCallback
import { useTranslation } from 'react-i18next'
import BarLoader from 'react-spinners/BarLoader'
import BeatLoader from 'react-spinners/BeatLoader'
import styled from 'styled-components'

import Markdown from '../Markdown/Markdown'
import CitationsList from './CitationsList'
import MessageAttachments from './MessageAttachments'
import MessageError from './MessageError'
import MessageImage from './MessageImage'
import MessageThought from './MessageThought'
import DeepThinkingMessage from './DeepThinkingMessage'

interface Props {
  message: Message
  model?: Model
}

const MessageContent: React.FC<Props> = ({ message: _message, model }) => {
  const { t } = useTranslation()
  const message = withMessageThought(clone(_message))

  // 直接检查是否存在<think>标签，确保不会重复显示
  useEffect(() => {
    // 如果消息已有ID和topicID（持久化消息）
    if (message.id && message.topicId) {
      const thinkPattern = /<think>([\s\S]*?)<\/think>/i
      const origContent = message.content || ''

      // 如果思考内容已存在于消息对象中，但思考标签仍在消息内容中
      if (thinkPattern.test(origContent)) {
        // 清理消息内容，移除思考标签及其内容
        const cleanContent = origContent.replace(thinkPattern, '').trim()

        // 确保内容有变化才更新
        if (cleanContent !== origContent) {
          console.log('[MessageContent] 发现内容中包含思考标签，执行清理')
          // 更新到全局状态
          setTimeout(() => {
            try {
              window.api.store.dispatch(
                window.api.store.updateMessageThunk(message.topicId!, message.id!, {
                  content: cleanContent
                })
              )
              console.log('[MessageContent] 已清理消息中的思考标签，避免重复显示')
            } catch (error) {
              console.error('[MessageContent] 更新全局状态失败:', error)
            }
          }, 0)
        }
      }
    }
  }, [message.id, message.topicId, message.content])

  const isWebCitation = model && (isOpenAIWebSearch(model) || model.provider === 'openrouter')
  const [isSegmentedPlayback, setIsSegmentedPlayback] = useState(false)

  // MCP Tool related states and handlers moved from MessageTools.tsx
  const [activeKeys, setActiveKeys] = useState<string[]>([])
  const [copiedMap, setCopiedMap] = useState<Record<string, boolean>>({})
  const [editingToolId, setEditingToolId] = useState<string | null>(null)
  const [editedParams, setEditedParams] = useState<string>('')

  // Local state for immediate UI updates, synced with message metadata
  const [localToolResponses, setLocalToolResponses] = useState<MCPToolResponse[]>(message.metadata?.mcpTools || [])

  // Effect to sync local state when message metadata changes externally
  useEffect(() => {
    // Only update local state if the incoming metadata is actually different
    // This prevents unnecessary re-renders if the message object reference changes but content doesn't
    const incomingTools = message.metadata?.mcpTools || []
    if (JSON.stringify(incomingTools) !== JSON.stringify(localToolResponses)) {
      setLocalToolResponses(incomingTools)
    }
  }, [message.metadata?.mcpTools, localToolResponses])

  const copyContent = useCallback(
    (content: string, toolId: string) => {
      navigator.clipboard.writeText(content)
      window.message.success({ content: t('message.copied'), key: 'copy-message' })
      setCopiedMap((prev) => ({ ...prev, [toolId]: true }))
      setTimeout(() => setCopiedMap((prev) => ({ ...prev, [toolId]: false })), 2000)
    },
    [t]
  )

  // --- Handlers for Edit/Rerun ---
  const handleRerun = useCallback(
    (toolCall: MCPToolResponse, currentParamsString: string) => {
      console.log('Rerunning tool:', toolCall.id, 'with params:', currentParamsString)
      try {
        const paramsToRun = JSON.parse(currentParamsString)

        // Proactively update local state for immediate UI feedback
        setLocalToolResponses((prevResponses) =>
          prevResponses.map((tc) =>
            tc.id === toolCall.id ? { ...tc, args: paramsToRun, status: 'invoking', response: undefined } : tc
          )
        )

        const serverConfig = message.enabledMCPs?.find((server) => server.id === toolCall.tool.serverId)
        if (!serverConfig) {
          console.error(`[MessageContent] Server config not found for ID ${toolCall.tool.serverId}`)
          window.message.error({ content: t('common.rerun_failed_server_not_found'), key: 'rerun-tool' })
          return
        }

        window.api.mcp
          .rerunTool(message.id, toolCall.id, serverConfig, toolCall.tool.name, paramsToRun)
          .then(() => window.message.success({ content: t('common.rerun_started'), key: 'rerun-tool' }))
          .catch((err) => {
            console.error('Rerun failed:', err)
            window.message.error({ content: t('common.rerun_failed'), key: 'rerun-tool' })
            // Optionally revert local state on failure
            setLocalToolResponses(
              (prevResponses) => prevResponses.map((tc) => (tc.id === toolCall.id ? { ...tc, status: 'done' } : tc)) // Revert status
            )
          })
      } catch (e) {
        console.error('Invalid JSON parameters for rerun:', e)
        window.message.error(t('common.invalid_json'))
        // Revert local state if JSON parsing fails
        setLocalToolResponses(
          (prevResponses) => prevResponses.map((tc) => (tc.id === toolCall.id ? { ...tc, status: 'done' } : tc)) // Revert status
        )
      }
    },
    [message.id, message.enabledMCPs, t]
  )

  const handleEdit = useCallback((toolCall: MCPToolResponse) => {
    setEditingToolId(toolCall.id)
    setEditedParams(JSON.stringify(toolCall.args || {}, null, 2))
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingToolId(null)
    setEditedParams('')
  }, [])

  const handleSaveEdit = useCallback(
    (toolCall: MCPToolResponse) => {
      handleRerun(toolCall, editedParams)
      setEditingToolId(null)
      setEditedParams('')
    },
    [editedParams, handleRerun]
  )

  const handleParamsChange = useCallback((newParams: string) => {
    setEditedParams(newParams)
  }, [])
  // --- End Handlers ---

  // --- Listener for Rerun Updates & Persistence ---
  useEffect(() => {
    const cleanupListener = window.api.mcp.onToolRerunUpdate((update) => {
      if (update.messageId !== message.id) return // Ignore updates for other messages

      console.log('[MessageContent] Received rerun update:', update)

      // --- Update Local State for Immediate UI Feedback ---
      setLocalToolResponses((currentLocalResponses) => {
        return currentLocalResponses.map((toolCall) => {
          if (toolCall.id === update.toolCallId) {
            let updatedCall: MCPToolResponse
            switch (update.status) {
              case 'rerunning':
                // Note: 'rerunning' status from IPC translates to 'invoking' in UI
                updatedCall = { ...toolCall, status: 'invoking', args: update.args, response: undefined }
                break
              case 'done':
                updatedCall = {
                  ...toolCall,
                  status: 'done',
                  response: update.response,
                  // Persist the args used for the successful rerun
                  args: update.args !== undefined ? update.args : toolCall.args
                }
                break
              case 'error':
                updatedCall = {
                  ...toolCall,
                  status: 'done', // Keep UI status as 'done' even on error
                  response: { content: [{ type: 'text', text: update.error }], isError: true },
                  // Persist the args used for the failed rerun
                  args: update.args !== undefined ? update.args : toolCall.args
                }
                break
              default:
                updatedCall = toolCall // Should not happen
            }
            return updatedCall
          }
          return toolCall
        })
      })
      // --- End Local State Update ---

      // --- Persist Changes to Global Store and DB (only on final states) ---
      if (update.status === 'done' || update.status === 'error') {
        // IMPORTANT: Use the message prop directly to get the state *before* this update cycle
        const previousMcpTools = message.metadata?.mcpTools || []
        console.log(
          '[MessageContent Persistence] Previous MCP Tools from message.metadata:',
          JSON.stringify(previousMcpTools, null, 2)
        ) // Log previous state

        const updatedMcpToolsForPersistence = previousMcpTools.map((toolCall) => {
          if (toolCall.id === update.toolCallId) {
            console.log(
              `[MessageContent Persistence] Updating tool ${toolCall.id} with status ${update.status}, args:`,
              update.args,
              'response:',
              update.response || update.error
            ) // Log update details
            // Apply the final state directly from the update object
            return {
              ...toolCall, // Keep existing id, tool info
              status: 'done', // Final status is always 'done' for persistence
              args: update.args !== undefined ? update.args : toolCall.args, // Persist the args used for the rerun
              response:
                update.status === 'error'
                  ? { content: [{ type: 'text', text: update.error }], isError: true } // Create error response object
                  : update.response // Use the successful response
            }
          }
          return toolCall // Keep other tool calls as they were
        })

        console.log(
          '[MessageContent Persistence] Calculated MCP Tools for Persistence:',
          JSON.stringify(updatedMcpToolsForPersistence, null, 2)
        ) // Log calculated state

        // Dispatch the thunk to update the message globally
        // Ensure we have the necessary IDs
        if (message.topicId && message.id) {
          console.log(
            `[MessageContent Persistence] Dispatching updateMessageThunk for message ${message.id} in topic ${message.topicId}`
          ) // Log dispatch attempt
          window.api.store.dispatch(
            window.api.store.updateMessageThunk(message.topicId, message.id, {
              metadata: {
                ...message.metadata, // Keep other metadata
                mcpTools: updatedMcpToolsForPersistence // Provide the correctly calculated final array
              }
            })
          )
          console.log(
            '[MessageContent] Dispatched updateMessageThunk with calculated persistence data for tool:',
            update.toolCallId
          )
        } else {
          console.error('[MessageContent] Missing topicId or messageId, cannot dispatch update.')
        }
      }
      // --- End Persistence Logic ---
    })

    return () => cleanupListener()
    // Ensure all necessary dependencies are included
  }, [message.id, message.topicId, message.metadata]) // message.metadata is crucial here
  // --- End Listener ---

  // 监听分段播放状态变化
  useEffect(() => {
    const handleSegmentedPlaybackUpdate = (event: CustomEvent) => {
      const { isSegmentedPlayback } = event.detail
      setIsSegmentedPlayback(isSegmentedPlayback)
    }

    // 添加事件监听器
    window.addEventListener('tts-segmented-playback-update', handleSegmentedPlaybackUpdate as EventListener)

    // 组件卸载时移除事件监听器
    return () => {
      window.removeEventListener('tts-segmented-playback-update', handleSegmentedPlaybackUpdate as EventListener)
    }
  }, [])

  // HTML实体编码辅助函数
  const encodeHTML = (str: string) => {
    return str.replace(/[&<>"']/g, (match) => {
      const entities: { [key: string]: string } = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;'
      }
      return entities[match]
    })
  }

  // HTML实体解码辅助函数使用useCallback包装，避免每次渲染都重新创建
  const decodeHTML = useCallback((str: string) => {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
  }, [])

  // Format citations for display
  const formattedCitations = useMemo(() => {
    if (!message.metadata?.citations?.length && !message.metadata?.annotations?.length) return null

    let citations: any[] = []

    if (model && isOpenAIWebSearch(model)) {
      citations =
        message.metadata.annotations?.map((url, index) => {
          return { number: index + 1, url: url.url_citation?.url, hostname: url.url_citation.title }
        }) || []
    } else {
      citations =
        message.metadata?.citations?.map((url, index) => {
          try {
            const hostname = new URL(url).hostname
            return { number: index + 1, url, hostname }
          } catch {
            return { number: index + 1, url, hostname: url }
          }
        }) || []
    }

    // Deduplicate by URL
    const urlSet = new Set()
    return citations
      .filter((citation) => {
        if (!citation.url || urlSet.has(citation.url)) return false
        urlSet.add(citation.url)
        return true
      })
      .map((citation, index) => ({
        ...citation,
        number: index + 1 // Renumber citations sequentially after deduplication
      }))
  }, [message.metadata?.citations, message.metadata?.annotations, model])

  // 获取引用数据
  // https://github.com/CherryHQ/cherry-studio/issues/5234#issuecomment-2824704499
  const citationsData = useMemo(() => {
    const citationUrls =
      Array.isArray(message.metadata?.citations) &&
      (message?.metadata?.annotations?.map((annotation) => annotation.url_citation) ?? [])
    const searchResults =
      message?.metadata?.webSearch?.results ||
      message?.metadata?.webSearchInfo ||
      message?.metadata?.groundingMetadata?.groundingChunks?.map((chunk) => chunk?.web) ||
      citationUrls ||
      []
    const citationsUrls = formattedCitations || []

    // 合并引用数据
    const data = new Map()

    // 添加webSearch结果
    searchResults.forEach((result) => {
      data.set(result.url || result.uri || result.link, {
        url: result.url || result.uri || result.link,
        title: result.title || result.hostname,
        content: result.content
      })
    })

    // 添加citations
    citationsUrls.forEach((result) => {
      if (!data.has(result.url)) {
        data.set(result.url, {
          url: result.url,
          title: result.title || result.hostname || undefined,
          content: result.content || undefined
        })
      }
    })

    return data
  }, [
    formattedCitations,
    message?.metadata?.annotations,
    message?.metadata?.groundingMetadata?.groundingChunks,
    message?.metadata?.webSearch?.results,
    message?.metadata?.webSearchInfo,
    message.metadata?.citations // Added missing dependency
    // knowledge 依赖已移除，因为它在 useMemo 中没有被使用
  ])

  /**
   * 知识库索引部分：解决LLM回复中未使用的知识库引用索引问题
   */
  // Process content to make citation numbers clickable
  const processedContent = useMemo(() => {
    // 元数据字段列表，用于调试目的
    // const metadataFields = ['citations', 'webSearch', 'webSearchInfo', 'annotations', 'knowledge']

    // 即使没有元数据，也尝试处理引用标记（针对二次询问的回复）
    // 这样可以确保在二次询问的回复中也能处理引用标记
    // 首先解码内容中的HTML实体，确保引用标记能被正确识别
    let content = decodeHTML(message.content)

    // 预先计算citations数组
    const websearchResults = message?.metadata?.webSearch?.results?.map((result) => result.url) || []
    const knowledgeResults = message?.metadata?.knowledge?.map((result) => result.sourceUrl) || []
    const citations = message?.metadata?.citations || [...websearchResults, ...knowledgeResults]

    // 处理引用标签
    if (citations && citations.length > 0) {
      // 检查是否有网络搜索或知识库引用相关的元数据
      const hasWebSearch = message?.metadata?.webSearch || message?.metadata?.webSearchInfo || message?.metadata?.annotations;
      const hasKnowledge = message?.metadata?.knowledge;
      const hasGroundingMetadata = message?.metadata?.groundingMetadata;

      // 只在实际使用引用功能时启用引用处理
      if (hasWebSearch || hasKnowledge || hasGroundingMetadata) {
        // 首先检测内容中是否有数学公式，避免处理数学公式内部的内容
        const katexBlockRegex = /\$\$([\s\S]*?)\$\$|\$((?!\$)[\s\S]*?)\$/g;
        const mathBlocks: { start: number, end: number }[] = [];
        let match;

        // 收集所有数学公式的位置
        while ((match = katexBlockRegex.exec(content)) !== null) {
          mathBlocks.push({
            start: match.index,
            end: match.index + match[0].length
          });
        }

        // 优化引用处理，避开数学公式区域
        // 扩展正则表达式匹配，同时匹配[[1]]、[1]和纯数字[1][2]格式
        const citationRegex = /\[\[(\d+)\]\]|\[(\d+)\]|\[(\d+)\]\[(\d+)\]/g;

        // 替换引用标记，避开数学公式区域
        content = content.replace(citationRegex, (match, num1, num2, num3, num4, offset) => {
          // 检查当前匹配是否在数学公式内部
          for (const block of mathBlocks) {
            if (offset >= block.start && offset < block.end) {
              return match; // 在数学公式内，保持原样
            }
          }

          // 处理[1][2]格式或其他格式
          const numStr = num1 || num2 || num3 || num4;
          if (!numStr) return match;

          const index = parseInt(numStr) - 1;

          // 检查索引是否有效
          if (index < 0 || index >= citations.length || !citations[index]) {
            return match; // 无效索引，返回原文
          }

          const link = citations[index];
          const citation = { ...(citationsData.get(link) || { url: link }) };
          if (citation.content) {
            citation.content = citation.content.substring(0, 200);
          }

          const citationDataHtml = encodeHTML(JSON.stringify(citation));

          // 返回可点击的引用标记
          return `<sup class="citation-marker" data-citation='${citationDataHtml}'>${numStr}</sup>`;
        });
      } else {
        // 没有启用引用功能，将引用格式转换为纯文本
        console.log('Citations found but reference feature is not enabled');
        const citationRegex = /\[\[(\d+)\]\]|\[(\d+)\]|\[(\d+)\]\[(\d+)\]/g;
        content = content.replace(citationRegex, (match, num1, num2, num3) => {
          const numStr = num1 || num2 || num3;
          if (!numStr) return match;
          return `[${numStr}]`;
        });
      }
    }

    // 优化非 webSearch/knowledge 的情况下的引用处理
    else {
      // 处理非 webSearch/knowledge 的情况
      // 首先处理标准Markdown引用格式
      const standardCitationRegex = /\[<sup>(\d+)<\/sup>\]\(([^)]+)\)/g;
      content = content.replace(standardCitationRegex, (_, num) => {
        // 保留引用标记，但转换为纯文本
        return `[${num}]`;
      });

      // 然后处理纯数字引用格式和HTML引用标记
      const simpleCitationRegex =
        /\[(\d+)\](?:\[(\d+)\])?|\[\[(\d+)\]\]|<sup[^>]*class=["']citation-marker["'][^>]*>(\d+)<\/sup>|<sup[^>]*data-citation=['"](.*?)['"][^>]*>(\d+)<\/sup>/g;
      content = content.replace(
        simpleCitationRegex,
        (match, num1, _unused, num3, num4, _citationData, num6, offset) => {
          const numStr = num1 || num3 || num4 || num6;
          if (!numStr) return match;

          // 检查是否在数学公式内部 - 先做一个简单检查
          const beforeContext = content.substring(Math.max(0, offset - 20), offset);
          const afterContext = content.substring(offset + match.length, offset + match.length + 20);

          // 如果前后文有数学符号，可能是数学公式的一部分，保持原样
          if (
            (beforeContext.includes('$') || beforeContext.includes('\\')) &&
            (afterContext.includes('$') || afterContext.includes('\\'))
          ) {
            return match;
          }

          // 否则转换为纯文本引用
          return `[${numStr}]`;
        }
      );
    }

    // 处理 MCP 工具调用标记
    console.log('[MessageContent] Original message content:', message.content) // Log original content
    console.log('[MessageContent] Original message content type:', typeof message.content) // 记录内容类型
    console.log('[MessageContent] Original message content length:', message.content?.length || 0) // 记录内容长度
    console.log('[MessageContent] First 100 chars:', message.content?.substring(0, 100)) // 显示前100个字符
    console.log('[MessageContent] Message metadata:', message.metadata) // 记录完整元数据

    const toolResponses = message.metadata?.mcpTools || []
    console.log('[MessageContent] Tool responses from metadata:', toolResponses) // Log tool responses

    // 如果有工具响应，检查每个工具的ID和名称
    if (toolResponses.length > 0) {
      console.log('[MessageContent] Tool IDs and names:')
      toolResponses.forEach((tr) => {
        console.log(`- Tool ID: ${tr.id}, Tool Name: ${tr.tool.name}, Server: ${tr.tool.serverName}`)
      })
    }

    if (toolResponses.length > 0) {
      let toolIndex = 0

      // 支持多种工具调用标签格式
      const toolTagPatterns = [
        // 1. 标准格式: <tool_use>...</tool_use>
        /<tool_use(?:\s+[^>]*)?>([\s\S]*?)<\/tool_use>/gi,

        // 2. 其他常见标签格式
        /<tool(?:\s+[^>]*)?>([\s\S]*?)<\/tool>/gi,
        /<function_call(?:\s+[^>]*)?>([\s\S]*?)<\/function_call>/gi,
        /<api_call(?:\s+[^>]*)?>([\s\S]*?)<\/api_call>/gi,

        // 3. Gemini特定格式 - 直接使用函数名作为标签
        /<(?:get_current_time|search|calculate|get_weather|query_database)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:get_current_time|search|calculate|get_weather|query_database)>/gi,

        // 4. Gemini特定占位符格式
        // 这个模式匹配GeminiProvider中生成的特殊占位符
        // GeminiProvider在检测到函数调用时会发送这个占位符文本，而不是空文本
        // 格式: <tool_placeholder id="functionName_timestamp"></tool_placeholder>
        // 作用: 提供准确的位置标记，使工具块能在正确位置渲染
        // 如果没有这个占位符，工具块会默认放在内容开头或结尾，而不是实际函数调用位置
        /<tool_placeholder\s+id="([^"]+)"><\/tool_placeholder>/gi,

        // 5. 工具名称直接作为标签 (基于已注册的工具)
        ...toolResponses.map(
          (tr) => new RegExp(`<${tr.tool.id}(?:\\s+[^>]*)?>(\\s*[\\s\\S]*?)<\\/${tr.tool.id}>`, 'gi')
        )
      ]

      // 记录所有匹配到的工具调用标记
      interface MatchInfo {
        pattern: RegExp
        match: RegExpMatchArray
        index: number
        length: number
      }

      const allMatches: MatchInfo[] = []

      // 对每种模式进行处理并收集匹配
      for (const pattern of toolTagPatterns) {
        // 重置正则表达式的lastIndex
        pattern.lastIndex = 0

        // 查找所有匹配并添加到总匹配列表
        const matches = Array.from(content.matchAll(pattern))
        if (matches.length > 0) {
          // 记录匹配的位置信息，用于后续按顺序替换
          matches.forEach((match) => {
            allMatches.push({
              pattern,
              match,
              index: match.index,
              length: match[0].length
            })
          })
        }
      }

      // 尝试匹配JSON格式的工具调用
      const jsonPattern =
        /\{(?:\s*)"(?:tool|function)"(?:\s*):(?:\s*)"([^"]+)"(?:\s*),(?:\s*)"(?:params|arguments|args)"(?:\s*):(?:\s*)(\{[\s\S]*?\})(?:\s*)\}/gi
      jsonPattern.lastIndex = 0
      const jsonMatches = Array.from(content.matchAll(jsonPattern))

      if (jsonMatches.length > 0) {
        jsonMatches.forEach((match) => {
          allMatches.push({
            pattern: jsonPattern,
            match,
            index: match.index,
            length: match[0].length
          })
        })
      }

      // 尝试匹配Markdown代码块格式的工具调用
      const markdownPattern = /```(?:tool|function|api)\n([\s\S]*?)```/gi
      markdownPattern.lastIndex = 0
      const markdownMatches = Array.from(content.matchAll(markdownPattern))

      if (markdownMatches.length > 0) {
        markdownMatches.forEach((match) => {
          allMatches.push({
            pattern: markdownPattern,
            match,
            index: match.index,
            length: match[0].length
          })
        })
      }

      // 按照在原文中的位置排序匹配结果
      allMatches.sort((a, b) => a.index - b.index)
      console.log('[MessageContent] All tool tag matches sorted by position:', allMatches)

      // 从后向前替换，避免位置变化影响
      if (allMatches.length > 0) {
        // 创建内容的副本
        let newContent = content

        // 从后向前替换
        for (let i = allMatches.length - 1; i >= 0; i--) {
          const matchInfo = allMatches[i]

          if (toolIndex < toolResponses.length) {
            const toolCall = toolResponses[toolIndex]
            toolIndex++

            // 替换匹配的内容
            newContent =
              newContent.substring(0, matchInfo.index) +
              `<tool-block id="${toolCall.id}"></tool-block>` +
              newContent.substring(matchInfo.index + matchInfo.length)

            console.log(
              `[MessageContent] Replacing match at position ${matchInfo.index} with tool-block id="${toolCall.id}"`
            )
          } else {
            // 如果工具响应数量与标记数量不匹配，记录警告但不替换
            console.warn(
              '[MessageContent] Mismatch between tool tags and tool responses. Keeping original tag:',
              matchInfo.match[0]
            )
          }
        }

        // 更新内容
        content = newContent
      } else {
        // 如果没有找到匹配，使用原始的正则表达式作为后备方案
        const toolTagRegex = /<tool_use>[\s\S]*?<\/tool_use>/gi
        const matches = Array.from(content.matchAll(toolTagRegex))
        console.log('[MessageContent] Fallback regex matches for tool tags:', matches)

        content = content.replace(toolTagRegex, (match) => {
          if (toolIndex < toolResponses.length) {
            const toolCall = toolResponses[toolIndex]
            toolIndex++
            console.log(`[MessageContent] Replacing match with tool-block id="${toolCall.id}"`)
            return `<tool-block id="${toolCall.id}"></tool-block>`
          }
          console.warn('[MessageContent] Mismatch between tool tags and tool responses. Returning original tag:', match)
          return match
        })

        // 检查是否所有工具都被处理了
        // 如果没有在内容中找到工具标签匹配但有工具响应，则为每个未处理的工具添加工具块
        if (toolIndex < toolResponses.length) {
          console.log('[MessageContent] Content has no tool tags but has tool responses, adding tool blocks')
          // 为每个剩余的工具响应创建工具块
          let additionalBlocks = ''
          while (toolIndex < toolResponses.length) {
            const toolCall = toolResponses[toolIndex]
            additionalBlocks += `<tool-block id="${toolCall.id}"></tool-block>`
            console.log(`[MessageContent] Adding tool-block for id="${toolCall.id}"`)
            toolIndex++
          }

          // 智能插入工具块到自然位置
          if (content.trim() === '') {
            // 如果内容为空，直接设置为工具块
            content = additionalBlocks
          } else {
            // 寻找适合插入工具块的位置
            const sentences = content.split(/([.!?。！？]+\s*)/).filter((s) => s.trim())

            // 如果有足够的句子，尝试在第一句话后插入
            if (sentences.length >= 2) {
              // 找到第一个句子结束的位置
              let insertPosition = 0
              const firstSentence = sentences[0] + (sentences[1].match(/[.!?。！？]+\s*/) ? sentences[1] : '')
              insertPosition = content.indexOf(firstSentence) + firstSentence.length

              // 在第一句话之后插入工具块
              content =
                content.substring(0, insertPosition) +
                '\n\n' +
                additionalBlocks +
                '\n\n' +
                content.substring(insertPosition)
              console.log(`[MessageContent] Inserted tool blocks after first sentence at position ${insertPosition}`)
            }
            // 如果找不到合适的句子，检查是否有"稍等"、"请稍等"等提示词
            else if (content.match(/稍等|请稍等|等一下|查询|搜索|检索|查找|让我|我来|正在/i)) {
              const waitPhrases = ['稍等', '请稍等', '等一下', '查询', '搜索', '检索', '查找', '让我', '我来', '正在']
              let insertPosition = content.length

              for (const phrase of waitPhrases) {
                const phrasePosition = content.indexOf(phrase)
                if (phrasePosition !== -1) {
                  // 找到包含提示词的句子结束位置
                  const sentenceEnd = content.substring(phrasePosition).search(/[.!?。！？]+\s*/)
                  if (sentenceEnd !== -1) {
                    insertPosition = phrasePosition + sentenceEnd + 1 // +1 包含标点符号
                    break
                  }
                }
              }

              // 在提示词句子后插入工具块
              content =
                content.substring(0, insertPosition) +
                '\n\n' +
                additionalBlocks +
                '\n\n' +
                content.substring(insertPosition)
              console.log(`[MessageContent] Inserted tool blocks after waiting phrase at position ${insertPosition}`)
            }
            // 如果没有找到合适的位置，则放在开头
            else {
              content = additionalBlocks + '\n\n' + content
              console.log('[MessageContent] No suitable insertion point found, added tool blocks at the beginning')
            }
          }
        }
      }

      console.log('[MessageContent] Content after tool tag replacement:', content)
    }

    return content
  }, [
    message.metadata?.citations,
    message.metadata?.webSearch,
    message.metadata?.knowledge,
    message.metadata?.mcpTools, // Add mcpTools as dependency
    message.content,
    citationsData,
    decodeHTML // 添加decodeHTML函数作为依赖
  ])

  // 工具调用结果在Markdown组件中渲染

  if (message.status === 'sending') {
    return (
      <MessageContentLoading>
        <SyncOutlined spin size={24} />
      </MessageContentLoading>
    )
  }

  if (message.status === 'searching') {
    return (
      <SearchingContainer>
        <Search size={24} />
        <SearchingText>{t('message.searching')}</SearchingText>
        <BarLoader color="#1677ff" />
      </SearchingContainer>
    )
  }

  if (message.status === 'error') {
    return <MessageError message={message} />
  }

  if (message.type === '@' && model) {
    const content = `[@${model.name}](#)  ${getBriefInfo(message.content)}`
    return (
      <Markdown
        message={{ ...message, content, metadata: message.metadata || {} }} // Ensure metadata is included
        toolResponses={localToolResponses} // 传递工具响应数据 (使用 local state)
        activeToolKeys={activeKeys} // 传递 activeKeys 状态
        copiedToolMap={copiedMap} // 传递 copiedMap 状态
        editingToolId={editingToolId} // 传递 editingToolId 状态
        editedToolParamsString={editedParams} // 传递 editedParams 状态
        onToolToggle={setActiveKeys} // 传递 setActiveKeys 函数
        onToolCopy={copyContent} // 传递 copyContent 函数
        onToolRerun={handleRerun} // 传递 handleRerun 函数
        onToolEdit={handleEdit} // 传递 handleEdit 函数
        onToolSave={handleSaveEdit} // 传递 handleSaveEdit 函数
        onToolCancel={handleCancelEdit} // 传递 handleCancelEdit 函数
        onToolParamsChange={handleParamsChange} // 传递 onToolParamsChange 函数
      />
    )
  }

  // 只移除工具调用标签，保留思考标签的内容
  // 这样思考过程的内容会保留在原始内容中，同时也会在折叠的思考块中显示
  const tagsToRemoveRegex = /<tool_use>(?:[\s\S]*?)<\/tool_use>/gi

  return (
    <Fragment>
      <Flex gap="4px" wrap style={{ marginBottom: '2px' }}>
        {message.mentions?.map((model) => <MentionTag key={getModelUniqId(model)}>{'@' + model.name}</MentionTag>)}
      </Flex>
      {message.referencedMessages && message.referencedMessages.length > 0 && (
        <div>
          {message.referencedMessages.map((refMsg, index) => (
            <Collapse
              key={refMsg.id}
              className="reference-collapse"
              defaultActiveKey={['1']}
              size="small"
              items={[
                {
                  key: '1',
                  label: (
                    <div className="reference-header-label">
                      <span className="reference-title">
                        {t('message.referenced_message')}{' '}
                        {message.referencedMessages && message.referencedMessages.length > 1
                          ? `(${index + 1}/${message.referencedMessages.length})`
                          : ''}
                      </span>
                      <span className="reference-role">{refMsg.role === 'user' ? t('common.you') : 'AI'}</span>
                    </div>
                  ),
                  extra: (
                    <span
                      className="reference-id"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigator.clipboard.writeText(refMsg.id)
                        window.message.success({
                          content: t('message.id_copied') || '消息ID已复制',
                          key: 'copy-reference-id'
                        })
                      }}>
                      ID: {refMsg.id}
                    </span>
                  ),
                  children: (
                    <div className="reference-content">
                      <div className="reference-text">{refMsg.content}</div>
                      <div className="reference-bottom-spacing"></div>
                    </div>
                  )
                }
              ]}
            />
          ))}
        </div>
      )}

      {/* 兼容旧版本的referencedMessage */}
      {!message.referencedMessages && (message as any).referencedMessage && (
        <Collapse
          className="reference-collapse"
          defaultActiveKey={['1']}
          size="small"
          items={[
            {
              key: '1',
              label: (
                <div className="reference-header-label">
                  <span className="reference-title">{t('message.referenced_message')}</span>
                  <span className="reference-role">
                    {(message as any).referencedMessage.role === 'user' ? t('common.you') : 'AI'}
                  </span>
                </div>
              ),
              extra: (
                <span
                  className="reference-id"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigator.clipboard.writeText((message as any).referencedMessage.id)
                    window.message.success({
                      content: t('message.id_copied') || '消息ID已复制',
                      key: 'copy-reference-id'
                    })
                  }}>
                  ID: {(message as any).referencedMessage.id}
                </span>
              ),
              children: (
                <div className="reference-content">
                  <div className="reference-text">{(message as any).referencedMessage.content}</div>
                  <div className="reference-bottom-spacing"></div>
                </div>
              )
            }
          ]}
        />
      )}
      {/* Only display thought info at the top */}
      <MessageThought message={message} />
      {/* Display deep thinking message if it's a thinking message */}
      {message.thinking && <DeepThinkingMessage message={message} />}
      {/* Display final thinking message if it's a final thinking message */}
      {message.isFinalThinking && <DeepThinkingMessage message={message} />}
      {/* 如果是思考消息或最终思考结果，不显示普通内容 */}
      {!message.thinking && !message.isFinalThinking && isSegmentedPlayback ? (
        // Apply regex replacement here for TTS
        <TTSHighlightedText text={processedContent.replace(tagsToRemoveRegex, '')} />
      ) : (!message.thinking && !message.isFinalThinking) ? (
        // Render Markdown with tool blocks
        <Markdown
          message={{ ...message, content: processedContent }} // 传递包含占位符的内容
          toolResponses={localToolResponses} // 传递工具响应数据 (使用 local state)
          activeToolKeys={activeKeys} // 传递 activeKeys 状态
          copiedToolMap={copiedMap} // 传递 copiedMap 状态
          editingToolId={editingToolId} // 传递 editingToolId 状态
          editedToolParamsString={editedParams} // 传递 editedParams 状态
          onToolToggle={setActiveKeys} // 传递 setActiveKeys 函数
          onToolCopy={copyContent} // 传递 copyContent 函数
          onToolRerun={handleRerun} // 传递 handleRerun 函数
          onToolEdit={handleEdit} // 传递 handleEdit 函数
          onToolSave={handleSaveEdit} // 传递 handleSaveEdit 函数
          onToolCancel={handleCancelEdit} // 传递 handleCancelEdit 函数
          onToolParamsChange={handleParamsChange} // 传递 onToolParamsChange 函数
        />
      ) : null}
      {message.metadata?.generateImage && <MessageImage message={message} />}
      {message.translatedContent && (
        <Fragment>
          <Divider style={{ margin: 0, marginBottom: 5 }}>
            <TranslationOutlined />
          </Divider>
          {message.translatedContent === t('translate.processing') ? (
            <BeatLoader color="var(--color-text-2)" size="10" style={{ marginBottom: 5 }} />
          ) : (
            // Render translated content (assuming it doesn't need tag removal, adjust if needed)
            <Markdown
              message={{ ...message, content: message.translatedContent }}
              toolResponses={localToolResponses} // 传递工具响应数据 (使用 local state)
              activeToolKeys={activeKeys} // 传递 activeKeys 状态
              copiedToolMap={copiedMap} // 传递 copiedMap 状态
              editingToolId={editingToolId} // 传递 editingToolId 状态
              editedToolParamsString={editedParams} // 传递 editedParams 状态
              onToolToggle={setActiveKeys} // 传递 setActiveKeys 函数
              onToolCopy={copyContent} // 传递 copyContent 函数
              onToolRerun={handleRerun} // 传递 handleRerun 函数
              onToolEdit={handleEdit} // 传递 handleEdit 函数
              onToolSave={handleSaveEdit} // 传递 handleSaveEdit 函数
              onToolCancel={handleCancelEdit} // 传递 handleCancelEdit 函数
              onToolParamsChange={handleParamsChange} // 传递 onToolParamsChange 函数
            />
          )}
        </Fragment>
      )}
      {message?.metadata?.groundingMetadata && message.status == 'success' && (
        <>
          <CitationsList
            citations={
              message.metadata.groundingMetadata?.groundingChunks?.map((chunk, index) => ({
                number: index + 1,
                url: chunk?.web?.uri || '',
                title: chunk?.web?.title,
                showFavicon: false
              })) || []
            }
          />
          <SearchEntryPoint
            dangerouslySetInnerHTML={{
              __html: message.metadata.groundingMetadata?.searchEntryPoint?.renderedContent
                ? message.metadata.groundingMetadata.searchEntryPoint.renderedContent
                  .replace(/@media \(prefers-color-scheme: light\)/g, 'body[theme-mode="light"]')
                  .replace(/@media \(prefers-color-scheme: dark\)/g, 'body[theme-mode="dark"]')
                : ''
            }}
          />
        </>
      )}
      {formattedCitations && (
        <CitationsList
          citations={formattedCitations.map((citation) => ({
            number: citation.number,
            url: citation.url,
            hostname: citation.hostname,
            showFavicon: isWebCitation
          }))}
        />
      )}
      {message?.metadata?.webSearch && message.status === 'success' && (
        <CitationsList
          citations={message.metadata.webSearch.results.map((result, index) => ({
            number: index + 1,
            url: result.url,
            title: result.title,
            showFavicon: true
          }))}
        />
      )}
      {message?.metadata?.webSearchInfo && message.status === 'success' && (
        <CitationsList
          citations={message.metadata.webSearchInfo.map((result, index) => ({
            number: index + 1,
            url: result.link || result.url,
            title: result.title,
            showFavicon: true
          }))}
        />
      )}
      <MessageAttachments message={message} />
    </Fragment>
  )
}

// Styled components and global styles remain the same...

const MessageContentLoading = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 32px;
  margin-top: -5px;
  margin-bottom: 5px;
`

const SearchingContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: var(--color-background-mute);
  padding: 8px;
  border-radius: 8px;
  margin-bottom: 5px;
  gap: 8px;
`

const MentionTag = styled.span`
  color: var(--color-link);
`

const SearchingText = styled.div`
  font-size: 14px;
  line-height: 1.6;
  text-decoration: none;
  color: var(--color-text-1);
`

const SearchEntryPoint = styled.div`
  margin: 5px 2px;
`

// 引用消息样式 - 使用全局样式
const referenceStyles = `
  .reference-collapse {
    margin-bottom: 5px;
    border: 1px solid var(--color-border) !important;
    border-radius: 6px !important;
    overflow: hidden;
    background-color: var(--color-bg-1) !important;

    .ant-collapse-header {
      padding: 2px 8px !important;
      background-color: var(--color-bg-2);
      border-bottom: 1px solid var(--color-border);
      font-size: 10px;
      display: flex;
      justify-content: space-between;
      height: 18px;
      min-height: 18px;
      line-height: 14px;
    }

    .ant-collapse-expand-icon {
      height: 18px;
      line-height: 14px;
      padding-top: 0 !important;
      margin-top: -2px;
      margin-right: 2px;
    }

    .ant-collapse-header-text {
      flex: 0 1 auto;
      max-width: 70%;
    }

    .ant-collapse-extra {
      flex: 0 0 auto;
      margin-left: 10px;
      padding-right: 0;
      position: relative;
      right: 20px;
    }

    .reference-header-label {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 14px;
      line-height: 14px;
    }

    .reference-title {
      font-weight: 500;
      color: var(--color-text-1);
      font-size: 10px;
    }

    .reference-role {
      color: var(--color-text-2);
      font-size: 9px;
    }

    .reference-id {
      color: var(--color-text-3);
      font-size: 9px;
      cursor: pointer;
      padding: 1px 4px;
      border-radius: 3px;
      transition: background-color 0.2s ease;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
      display: inline-block;

      &:hover {
        background-color: var(--color-bg-3);
        color: var(--color-text-2);
      }
    }

    .ant-collapse-extra {
      margin-left: auto;
      display: flex;
      align-items: center;
    }

    .ant-collapse-content-box {
      padding: 8px !important;
      padding-top: 5px !important;
      padding-bottom: 2px !important;
    }

    .reference-content {
      max-height: 200px;
      overflow-y: auto;
      padding-bottom: 10px;

      .reference-text {
        color: var(--color-text-1);
        font-size: 14px;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .reference-bottom-spacing {
        height: 5px;
      }
    }
  }
`

// 工具块样式已直接添加到文档中

// 将样式添加到文档中
try {
  if (typeof document !== 'undefined') {
    // Check if style already exists to prevent duplicates during HMR
    let styleElement = document.getElementById('message-content-reference-styles')
    if (!styleElement) {
      styleElement = document.createElement('style')
      styleElement.id = 'message-content-reference-styles'
      styleElement.textContent =
        referenceStyles +
        `
          .message-content-tools {
            margin-top: 5px; /* 进一步减少顶部间距 */
            margin-bottom: 2px; /* 进一步减少底部间距 */
          }

          /* 确保消息内容可以被正常选择 */
          .markdown, .markdown * {
            user-select: text !important;
            -webkit-user-select: text !important;
            pointer-events: auto !important;
          }

          /* 引用标记样式 */
          sup[data-citation], .citation-marker {
            color: var(--color-link);
            cursor: pointer;
            font-size: 0.75em;
            line-height: 0;
            position: relative;
            vertical-align: baseline;
            top: -0.5em;
            background-color: rgba(0, 123, 255, 0.1);
            padding: 0 4px;
            border-radius: 4px;
            transition: background-color 0.2s;
          }

          sup[data-citation]:hover, .citation-marker:hover {
            background-color: rgba(0, 123, 255, 0.2);
            text-decoration: underline;
          }

          .citation-link {
            color: var(--color-link);
            cursor: pointer;
          }

          .highlight-citation {
            animation: highlight-pulse 2s ease-in-out;
          }

          @keyframes highlight-pulse {
            0% { background-color: rgba(255, 215, 0, 0.1); }
            50% { background-color: rgba(255, 215, 0, 0.5); }
            100% { background-color: rgba(255, 215, 0, 0.1); }
          }

          /* 工具块包装器样式 */
          .tool-block-wrapper {
            display: block;
            margin: 16px 0;
            break-inside: avoid;
          }

          /* 确保 p 标签内的 tool-block-wrapper 能正确显示 */
          p > .tool-block-wrapper {
            margin-top: 16px;
            margin-bottom: 16px;
            display: block;
          }

          /* 防止段落内容包含块级元素的样式问题 */
          p > tool-block {
            display: block;
            margin-top: 16px;
            margin-bottom: 0;
          }

          /* 工具块独立气泡效果 */
          .separated-tool-block {
            margin: 20px 0;
            padding-bottom: 5px;
            position: relative;
          }

          /* 工具块间分隔线 */
          .separated-tool-block + .separated-tool-block {
            margin-top: 30px;
            padding-top: 10px;
            border-top: 1px dashed var(--color-border);
          }

          /* 在工具块上方添加独立标记 */
          .separated-tool-block::before {
            content: "⚙️ 工具执行";
            position: absolute;
            top: -20px;
            left: 10px;
            font-size: 12px;
            color: var(--color-text-2);
            background: var(--color-bg-1);
            padding: 2px 8px;
            border-radius: 10px;
            border: 1px solid var(--color-border);
            z-index: 2;
          }

          /* 深度思考容器样式 */
          .deep-thinking-container {
            margin-bottom: 15px;
            border: 1px solid var(--color-primary-mute);
            background-color: var(--color-background-soft);
            border-radius: 8px;
          }

          /* 思考块标题样式 */
          .deep-thinking-container .ant-collapse-header {
            background-color: rgba(var(--color-primary-rgb), 0.1);
          }
        `
      document.head.appendChild(styleElement)
    }
  }
} catch (error) {
  console.error('Failed to add reference styles:', error)
}

export default React.memo(MessageContent)
