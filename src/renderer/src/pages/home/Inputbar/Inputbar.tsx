import { FolderOutlined, HolderOutlined } from '@ant-design/icons' // Add FolderOutlined
import ASRButton from '@renderer/components/ASRButton'
import { QuickPanelListItem, QuickPanelView, useQuickPanel } from '@renderer/components/QuickPanel'
import TranslateButton from '@renderer/components/TranslateButton'
import VoiceCallButton from '@renderer/components/VoiceCallButton'
import { isGenerateImageModel, isVisionModel, isWebSearchModel } from '@renderer/config/models'
import { getDefaultVoiceCallPrompt } from '@renderer/config/prompts'
import db from '@renderer/databases'
import { useAssistant } from '@renderer/hooks/useAssistant'
import { useKnowledgeBases } from '@renderer/hooks/useKnowledge'
import { useMCPServers } from '@renderer/hooks/useMCPServers'
import { useMessageOperations, useTopicLoading } from '@renderer/hooks/useMessageOperations'
import { modelGenerating, useRuntime } from '@renderer/hooks/useRuntime'
import { useMessageStyle, useSettings } from '@renderer/hooks/useSettings'
import { useShortcut, useShortcutDisplay } from '@renderer/hooks/useShortcuts'
import { useSidebarIconShow } from '@renderer/hooks/useSidebarIcon'
import { addAssistantMessagesToTopic, getDefaultTopic } from '@renderer/services/AssistantService'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import FileManager from '@renderer/services/FileManager'
import { checkRateLimit, findMessageById, getUserMessage } from '@renderer/services/MessagesService'
import { getModelUniqId } from '@renderer/services/ModelService'
import { estimateMessageUsage, estimateTextTokens as estimateTxtTokens } from '@renderer/services/TokenService'
import { translateText } from '@renderer/services/TranslateService'
import WebSearchService from '@renderer/services/WebSearchService'
import store, { useAppDispatch } from '@renderer/store'
import { sendMessage as _sendMessage } from '@renderer/store/messages'
import { setSearching } from '@renderer/store/runtime'
import { setPdfSettings } from '@renderer/store/settings'
import {
  AgentTask,
  Assistant,
  FileType,
  KnowledgeBase,
  KnowledgeItem,
  MCPServer,
  Message,
  Model,
  Topic
} from '@renderer/types'
import { classNames, delay, formatFileSize, getFileExtension } from '@renderer/utils'
import { getFilesFromDropEvent } from '@renderer/utils/input'
import { documentExts, imageExts, textExts } from '@shared/config/constant'
import { Button, Tooltip } from 'antd'
import TextArea, { TextAreaRef } from 'antd/es/input/TextArea'
import dayjs from 'dayjs'
import Logger from 'electron-log/renderer'
import { debounce, isEmpty } from 'lodash'
import {
  AtSign,
  CirclePause,
  FileSearch,
  FileText,
  Globe,
  Languages,
  LucideSquareTerminal,
  Maximize,
  MessageSquareDiff,
  Minimize,
  PaintbrushVertical,
  Paperclip,
  Upload,
  Zap
} from 'lucide-react'
import React, { CSSProperties, FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import NarrowLayout from '../Messages/NarrowLayout'
import AgentModeButton from './AgentModeButton'
import AttachmentButton, { AttachmentButtonRef } from './AttachmentButton'
import AttachmentPreview from './AttachmentPreview'
import DeepThinkingButton from './DeepThinkingButton'
import KnowledgeBaseButton, { KnowledgeBaseButtonRef } from './KnowledgeBaseButton'
import KnowledgeBaseInput from './KnowledgeBaseInput'
import MCPToolsButton, { MCPToolsButtonRef } from './MCPToolsButton'
import MentionModelsButton, { MentionModelsButtonRef } from './MentionModelsButton'
import MentionModelsInput from './MentionModelsInput'
import NewContextButton from './NewContextButton'
import PolishTextButton from './PolishTextButton'
import QuickPhrasesButton, { QuickPhrasesButtonRef } from './QuickPhrasesButton'
import SendMessageButton from './SendMessageButton'
import TokenCount from './TokenCount'

interface Props {
  assistant: Assistant
  setActiveTopic: (topic: Topic) => void
  topic: Topic
  onToggleWorkspacePanel?: () => void // Add prop for toggling workspace panel
  agentTasks: AgentTask[] // 添加 agentTasks 属性
  scrollToMessage?: (messageId: string) => void // 添加 scrollToMessage 属性
}

let _text = ''
let _files: FileType[] = []

const Inputbar: FC<Props> = ({
  assistant: _assistant,
  setActiveTopic,
  topic,
  onToggleWorkspacePanel,
  agentTasks,
  scrollToMessage // 在这里解构 scrollToMessage prop
}) => {
  // Destructure the new prop
  const [text, setText] = useState(_text)
  // 用于存储语音识别的中间结果，不直接显示在输入框中
  const [, setAsrCurrentText] = useState('')
  const [inputFocus, setInputFocus] = useState(false)
  const { assistant, addTopic, model, setModel, updateAssistant } = useAssistant(_assistant.id)
  const {
    targetLanguage,
    sendMessageShortcut,
    fontSize,
    pasteLongTextAsFile,
    pasteLongTextThreshold,
    showInputEstimatedTokens,
    autoTranslateWithSpace,
    enableQuickPanelTriggers,
    enableBackspaceDeleteModel,
    inputBarDisabledButtons
    // 移除 scrollToMessage 的解构
  } = useSettings()
  const [expended, setExpend] = useState(false)
  const [estimateTokenCount, setEstimateTokenCount] = useState(0)
  const [contextCount, setContextCount] = useState({ current: 0, max: 0 })
  const textareaRef = useRef<TextAreaRef>(null)
  const [files, setFiles] = useState<FileType[]>(_files)
  const { t } = useTranslation()
  const containerRef = useRef(null)
  const { searching } = useRuntime()
  const { isBubbleStyle } = useMessageStyle()
  const { pauseMessages } = useMessageOperations(topic)
  const loading = useTopicLoading(topic)
  const dispatch = useAppDispatch()
  const [spaceClickCount, setSpaceClickCount] = useState(0)
  const spaceClickTimer = useRef<NodeJS.Timeout>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  const [selectedKnowledgeBases, setSelectedKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [mentionModels, setMentionModels] = useState<Model[]>([])
  const [enabledMCPs, setEnabledMCPs] = useState<MCPServer[]>(assistant.mcpServers || [])
  const [isDragging, setIsDragging] = useState(false)
  const [textareaHeight, setTextareaHeight] = useState<number>()
  const startDragY = useRef<number>(0)
  const startHeight = useRef<number>(0)
  const currentMessageId = useRef<string>('')
  const isVision = useMemo(() => isVisionModel(model), [model])
  const supportExts = useMemo(() => [...textExts, ...documentExts, ...(isVision ? imageExts : [])], [isVision])
  const navigate = useNavigate()
  const { activedMcpServers } = useMCPServers()
  const { bases: knowledgeBases } = useKnowledgeBases()

  const quickPanel = useQuickPanel()

  const showKnowledgeIcon = useSidebarIconShow('knowledge')
  // const showMCPToolsIcon = isFunctionCallingModel(model)

  const [tokenCount, setTokenCount] = useState(0)

  const quickPhrasesButtonRef = useRef<QuickPhrasesButtonRef>(null)
  const mentionModelsButtonRef = useRef<MentionModelsButtonRef>(null)
  const knowledgeBaseButtonRef = useRef<KnowledgeBaseButtonRef>(null)
  const mcpToolsButtonRef = useRef<MCPToolsButtonRef>(null)
  const attachmentButtonRef = useRef<AttachmentButtonRef>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedEstimate = useCallback(
    debounce((newText) => {
      if (showInputEstimatedTokens) {
        const count = estimateTxtTokens(newText) || 0
        setTokenCount(count)
      }
    }, 500),
    [showInputEstimatedTokens]
  )

  useEffect(() => {
    debouncedEstimate(text)
  }, [text, debouncedEstimate])

  const inputTokenCount = showInputEstimatedTokens ? tokenCount : 0

  const newTopicShortcut = useShortcutDisplay('new_topic')
  const cleanTopicShortcut = useShortcutDisplay('clear_topic')
  const inputEmpty = isEmpty(text.trim()) && files.length === 0

  _text = text
  _files = files

  const resizeTextArea = useCallback(() => {
    const textArea = textareaRef.current?.resizableTextArea?.textArea
    if (textArea) {
      // 如果已经手动设置了高度,则不自动调整
      if (textareaHeight) {
        return
      }
      textArea.style.height = 'auto'
      textArea.style.height = textArea?.scrollHeight > 400 ? '400px' : `${textArea?.scrollHeight}px`
    }
  }, [textareaHeight])

  // Reset to assistant knowledge mcp servers
  useEffect(() => {
    setEnabledMCPs(assistant.mcpServers || [])
  }, [assistant.mcpServers])

  const sendMessage = useCallback(async () => {
    if (inputEmpty || loading) {
      return
    }
    if (checkRateLimit(assistant)) {
      return
    }

    EventEmitter.emit(EVENT_NAMES.SEND_MESSAGE)

    try {
      // 检查用户输入是否包含消息ID
      const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i

      // 从文本中提取所有消息ID
      const matches = text.match(new RegExp(uuidRegex, 'g'))

      // 如果只有ID且没有其他内容，则直接查找原始消息
      if (matches && matches.length > 0 && text.trim() === matches.join(' ')) {
        try {
          // 创建引用消息
          const userMessage = getUserMessage({ assistant, topic, type: 'text', content: '' })
          userMessage.referencedMessages = []

          // 处理所有匹配到的ID
          let foundAnyMessage = false
          for (const messageId of matches) {
            console.log(`[引用消息] 尝试查找消息ID: ${messageId}`)
            const originalMessage = await findMessageById(messageId)
            if (originalMessage) {
              userMessage.referencedMessages.push({
                id: originalMessage.id,
                content: originalMessage.content,
                role: originalMessage.role,
                createdAt: originalMessage.createdAt
              })
              foundAnyMessage = true
              console.log(`[引用消息] 找到消息ID: ${messageId}`)
            } else {
              console.log(`[引用消息] 未找到消息ID: ${messageId}`)
            }
          }

          if (foundAnyMessage) {
            // 发送引用消息
            userMessage.usage = await estimateMessageUsage(userMessage)
            currentMessageId.current = userMessage.id

            dispatch(
              _sendMessage(userMessage, assistant, topic, {
                mentions: mentionModels
              })
            )

            // 清空输入框
            setText('')
            setFiles([])
            setTimeout(() => setText(''), 500)
            setTimeout(() => resizeTextArea(), 0)
            setExpend(false)

            window.message.success({
              content:
                t('message.ids_found', { count: userMessage.referencedMessages.length }) ||
                `已找到${userMessage.referencedMessages.length}条原始消息`,
              key: 'message-id-found'
            })
            return
          } else {
            window.message.error({
              content: t('message.id_not_found') || '未找到原始消息',
              key: 'message-id-not-found'
            })
          }
        } catch (error) {
          console.error(`[引用消息] 查找消息ID时出错:`, error)
          window.message.error({ content: t('message.id_error') || '查找原始消息时出错', key: 'message-id-error' })
        }
      }

      // 如果不是单独的ID或者没有找到原始消息，则正常发送消息
      // 先检查消息内容是否包含消息ID，如果是则将其替换为空字符串
      let messageContent = text

      // 如果消息内容包含消息ID，则将其替换为空字符串
      if (matches && matches.length > 0) {
        // 检查是否是纯消息ID
        const isOnlyUUID = text.trim() === matches[0]
        if (isOnlyUUID) {
          messageContent = ''
        } else {
          // 如果消息内容包含消息ID，则将消息ID替换为空字符串
          for (const match of matches) {
            messageContent = messageContent.replace(match, '')
          }
          // 去除多余的空格
          messageContent = messageContent.replace(/\s+/g, ' ').trim()
        }
      }

      // Dispatch the sendMessage action with all options
      const uploadedFiles = await FileManager.uploadFiles(files)
      const userMessage = getUserMessage({ assistant, topic, type: 'text', content: messageContent })

      // 如果消息内容包含消息ID，则添加引用
      if (matches && matches.length > 0) {
        try {
          // 初始化引用消息数组
          userMessage.referencedMessages = []

          // 处理所有匹配到的ID
          for (const messageId of matches) {
            console.log(`[引用消息] 尝试查找消息ID作为引用: ${messageId}`)
            const originalMessage = await findMessageById(messageId)
            if (originalMessage) {
              userMessage.referencedMessages.push({
                id: originalMessage.id,
                content: originalMessage.content,
                role: originalMessage.role,
                createdAt: originalMessage.createdAt
              })
              console.log(`[引用消息] 找到消息ID作为引用: ${messageId}`)
            } else {
              console.log(`[引用消息] 未找到消息ID作为引用: ${messageId}`)
            }
          }

          // 如果找到了引用消息，显示成功提示
          if (userMessage.referencedMessages.length > 0) {
            window.message.success({
              content:
                t('message.ids_found', { count: userMessage.referencedMessages.length }) ||
                `已找到${userMessage.referencedMessages.length}条原始消息`,
              key: 'message-id-found'
            })
          }
        } catch (error) {
          console.error(`[引用消息] 查找消息ID作为引用时出错:`, error)
        }
      }

      if (uploadedFiles) {
        userMessage.files = uploadedFiles
      }

      const knowledgeBaseIds = selectedKnowledgeBases?.map((base) => base.id)

      if (knowledgeBaseIds) {
        userMessage.knowledgeBaseIds = knowledgeBaseIds
      }

      if (mentionModels) {
        userMessage.mentions = mentionModels
      }

      if (!isEmpty(enabledMCPs) && !isEmpty(activedMcpServers)) {
        userMessage.enabledMCPs = activedMcpServers.filter((server) => enabledMCPs?.some((s) => s.id === server.id))
      }

      userMessage.usage = await estimateMessageUsage(userMessage)
      currentMessageId.current = userMessage.id

      dispatch(
        _sendMessage(userMessage, assistant, topic, {
          mentions: mentionModels
        })
      )

      // Clear input
      setText('')
      setFiles([])
      setTimeout(() => setText(''), 500)
      setTimeout(() => resizeTextArea(), 0)
      setExpend(false)
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }, [
    assistant,
    dispatch,
    enabledMCPs,
    files,
    inputEmpty,
    loading,
    mentionModels,
    resizeTextArea,
    selectedKnowledgeBases,
    text,
    topic,
    activedMcpServers,
    t
  ])

  const translate = useCallback(async () => {
    if (isTranslating) {
      return
    }

    try {
      setIsTranslating(true)
      const translatedText = await translateText(text, targetLanguage)
      translatedText && setText(translatedText)
      setTimeout(() => resizeTextArea(), 0)
    } catch (error) {
      console.error('Translation failed:', error)
    } finally {
      setIsTranslating(false)
    }
  }, [isTranslating, text, targetLanguage, resizeTextArea])

  const openKnowledgeFileList = useCallback(
    (base: KnowledgeBase) => {
      quickPanel.open({
        title: base.name,
        list: base.items
          .filter((file): file is KnowledgeItem => ['file'].includes(file.type))
          .map((file) => {
            const fileContent = file.content as FileType
            return {
              label: fileContent.origin_name || fileContent.name,
              description:
                formatFileSize(fileContent.size) + ' · ' + dayjs(fileContent.created_at).format('YYYY-MM-DD HH:mm'),
              icon: <FileText />,
              isSelected: files.some((f) => f.path === fileContent.path),
              action: async ({ item }) => {
                item.isSelected = !item.isSelected
                if (fileContent.path) {
                  setFiles((prevFiles) => {
                    const fileExists = prevFiles.some((f) => f.path === fileContent.path)
                    if (fileExists) {
                      return prevFiles.filter((f) => f.path !== fileContent.path)
                    } else {
                      return fileContent ? [...prevFiles, fileContent] : prevFiles
                    }
                  })
                }
              }
            }
          }),
        symbol: 'file',
        multiple: true
      })
    },
    [files, quickPanel]
  )

  const openSelectFileMenu = useCallback(() => {
    quickPanel.open({
      title: t('chat.input.upload'),
      list: [
        {
          label: t('chat.input.upload.upload_from_local'),
          description: '',
          icon: <Upload />,
          action: () => {
            attachmentButtonRef.current?.openQuickPanel()
          }
        },
        ...knowledgeBases.map((base) => {
          const length = base.items?.filter(
            (item): item is KnowledgeItem => ['file', 'note'].includes(item.type) && typeof item.content !== 'string'
          ).length
          return {
            label: base.name,
            description: `${length} ${t('files.count')}`,
            icon: <FileSearch />,
            disabled: length === 0,
            isMenu: true,
            action: () => openKnowledgeFileList(base)
          }
        })
      ],
      symbol: 'file'
    })
  }, [knowledgeBases, openKnowledgeFileList, quickPanel, t])

  const quickPanelMenu = useMemo<QuickPanelListItem[]>(() => {
    return [
      {
        label: t('settings.quickPhrase.title'),
        description: '',
        icon: <Zap />,
        isMenu: true,
        action: () => {
          quickPhrasesButtonRef.current?.openQuickPanel()
        }
      },
      {
        label: t('agents.edit.model.select.title'),
        description: '',
        icon: <AtSign />,
        isMenu: true,
        action: () => {
          mentionModelsButtonRef.current?.openQuickPanel()
        }
      },
      {
        label: t('chat.input.knowledge_base'),
        description: '',
        icon: <FileSearch />,
        isMenu: true,
        disabled: files.length > 0,
        action: () => {
          knowledgeBaseButtonRef.current?.openQuickPanel()
        }
      },
      {
        label: t('settings.mcp.title'),
        description: t('settings.mcp.not_support'),
        icon: <LucideSquareTerminal />,
        isMenu: true,
        action: () => {
          mcpToolsButtonRef.current?.openQuickPanel()
        }
      },
      {
        label: `MCP ${t('settings.mcp.tabs.prompts')}`,
        description: '',
        icon: <LucideSquareTerminal />,
        isMenu: true,
        action: () => {
          mcpToolsButtonRef.current?.openPromptList()
        }
      },
      {
        label: `MCP ${t('settings.mcp.tabs.resources')}`,
        description: '',
        icon: <LucideSquareTerminal />,
        isMenu: true,
        action: () => {
          mcpToolsButtonRef.current?.openResourcesList()
        }
      },
      {
        label: isVisionModel(model) ? t('chat.input.upload') : t('chat.input.upload.document'),
        description: '',
        icon: <Paperclip />,
        isMenu: true,
        action: openSelectFileMenu
      },
      {
        label: t('translate.title'),
        description: t('translate.menu.description'),
        icon: <Languages />,
        action: () => {
          if (!text) return
          translate()
        }
      }
    ]
  }, [files.length, model, openSelectFileMenu, t, text, translate])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isEnterPressed = event.key === 'Enter'

    // 检查是否是消息ID格式
    if (isEnterPressed && !event.shiftKey) {
      const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i
      const currentText = text.trim()
      const isUUID = uuidRegex.test(currentText) && currentText.length === 36

      if (isUUID) {
        // 如果是消息ID格式，则不显示ID在对话中
        event.preventDefault()
        sendMessage()
        return
      }
    }

    // 按下Tab键，自动选中${xxx}
    if (event.key === 'Tab' && inputFocus) {
      event.preventDefault()
      const textArea = textareaRef.current?.resizableTextArea?.textArea
      if (!textArea) return

      const cursorPosition = textArea.selectionStart
      const selectionLength = textArea.selectionEnd - textArea.selectionStart
      const text = textArea.value

      let match = text.slice(cursorPosition + selectionLength).match(/\$\{[^}]+\}/)
      let startIndex = -1

      if (!match) {
        match = text.match(/\$\{[^}]+\}/)
        startIndex = match?.index ?? -1
      } else {
        startIndex = cursorPosition + selectionLength + match.index!
      }

      if (startIndex !== -1) {
        const endIndex = startIndex + match![0].length
        textArea.setSelectionRange(startIndex, endIndex)
        return
      }
    }

    if (autoTranslateWithSpace) {
      if (event.key === ' ') {
        setSpaceClickCount((prev) => prev + 1)

        if (spaceClickTimer.current) {
          clearTimeout(spaceClickTimer.current)
        }

        spaceClickTimer.current = setTimeout(() => {
          setSpaceClickCount(0)
        }, 200)

        if (spaceClickCount === 2) {
          console.log('Triple space detected - trigger translation')
          setSpaceClickCount(0)
          setIsTranslating(true)
          translate()
          return
        }
      }
    }

    if (expended) {
      if (event.key === 'Escape') {
        return onToggleExpended()
      }
    }

    if (isEnterPressed && !event.shiftKey && sendMessageShortcut === 'Enter') {
      if (quickPanel.isVisible) return event.preventDefault()

      sendMessage()
      return event.preventDefault()
    }

    if (sendMessageShortcut === 'Shift+Enter' && isEnterPressed && event.shiftKey) {
      if (quickPanel.isVisible) return event.preventDefault()

      sendMessage()
      return event.preventDefault()
    }

    if (sendMessageShortcut === 'Ctrl+Enter' && isEnterPressed && event.ctrlKey) {
      if (quickPanel.isVisible) return event.preventDefault()

      sendMessage()
      return event.preventDefault()
    }

    if (sendMessageShortcut === 'Command+Enter' && isEnterPressed && event.metaKey) {
      if (quickPanel.isVisible) return event.preventDefault()

      sendMessage()
      return event.preventDefault()
    }

    if (enableBackspaceDeleteModel && event.key === 'Backspace' && text.trim() === '' && mentionModels.length > 0) {
      setMentionModels((prev) => prev.slice(0, -1))
      return event.preventDefault()
    }

    if (enableBackspaceDeleteModel && event.key === 'Backspace' && text.trim() === '' && files.length > 0) {
      setFiles((prev) => prev.slice(0, -1))
      return event.preventDefault()
    }
  }

  const addNewTopic = useCallback(async () => {
    await modelGenerating()

    const topic = getDefaultTopic(assistant.id)

    await db.topics.add({ id: topic.id, messages: [] })
    await addAssistantMessagesToTopic({ assistant, topic })

    // Clear previous state
    // Reset to assistant default model
    assistant.defaultModel && setModel(assistant.defaultModel)

    // Reset to assistant knowledge mcp servers
    !isEmpty(assistant.mcpServers) && setEnabledMCPs(assistant.mcpServers || [])

    addTopic(topic)
    setActiveTopic(topic)

    setTimeout(() => EventEmitter.emit(EVENT_NAMES.SHOW_TOPIC_SIDEBAR), 0)
  }, [addTopic, assistant, setActiveTopic, setModel])

  const onPause = async () => {
    await pauseMessages()
  }

  const clearTopic = async () => {
    if (loading) {
      await onPause()
      await delay(1)
    }
    EventEmitter.emit(EVENT_NAMES.CLEAR_MESSAGES)
  }

  const onNewContext = () => {
    if (loading) {
      onPause()
      return
    }
    EventEmitter.emit(EVENT_NAMES.NEW_CONTEXT)
  }

  const onInput = () => !expended && resizeTextArea()

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value

    // 检查是否包含UUID格式的消息ID
    const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i
    const matches = newText.match(new RegExp(uuidRegex, 'g'))

    // 如果输入的内容只是一个UUID，不更新文本框内容，直接处理引用
    if (matches && matches.length === 1 && newText.trim() === matches[0]) {
      // 不立即更新文本框，等待用户按下回车键时再处理
      setText(newText)
    } else {
      // 正常更新文本框内容
      setText(newText)
    }

    const textArea = textareaRef.current?.resizableTextArea?.textArea
    const cursorPosition = textArea?.selectionStart ?? 0
    const lastSymbol = newText[cursorPosition - 1]

    if (enableQuickPanelTriggers && !quickPanel.isVisible && lastSymbol === '/') {
      quickPanel.open({
        title: t('settings.quickPanel.title'),
        list: quickPanelMenu,
        symbol: '/'
      })
    }

    if (enableQuickPanelTriggers && !quickPanel.isVisible && lastSymbol === '@') {
      mentionModelsButtonRef.current?.openQuickPanel()
    }
  }

  const onPaste = useCallback(
    async (event: ClipboardEvent | React.ClipboardEvent) => {
      const clipboardText = event.clipboardData?.getData('text')
      if (clipboardText) {
        // 检查粘贴的内容是否是消息ID
        const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i
        const isUUID = uuidRegex.test(clipboardText.trim()) && clipboardText.trim().length === 36

        if (isUUID) {
          // 如果是消息ID，则阻止默认粘贴行为，自定义处理
          event.preventDefault()

          // 获取当前文本框的内容和光标位置
          const textArea = textareaRef.current?.resizableTextArea?.textArea
          if (textArea) {
            const currentText = textArea.value
            const cursorPosition = textArea.selectionStart
            const cursorEnd = textArea.selectionEnd

            // 如果有选中文本，则替换选中文本；否则在光标位置插入
            const newText =
              currentText.substring(0, cursorPosition) + clipboardText.trim() + currentText.substring(cursorEnd)

            setText(newText)

            // 将光标移到插入的ID后面
            const newCursorPosition = cursorPosition + clipboardText.trim().length
            setTimeout(() => {
              if (textArea) {
                textArea.focus()
                textArea.setSelectionRange(newCursorPosition, newCursorPosition)
              }
            }, 0)
          } else {
            // 如果无法获取textArea，则直接设置文本
            setText(clipboardText.trim())
          }
        }
        // 其他文本内容由默认事件处理
      } else {
        // 确保 files 是一个数组
        const clipboardFiles = event.clipboardData?.files
        if (clipboardFiles && clipboardFiles.length > 0) {
          const files = Array.from(clipboardFiles) as File[]
          for (const file of files) {
            event.preventDefault()

            try {
              // 检查文件是否有path属性（兼容Electron 32.3.3之前的版本）
              const hasPath = 'path' in file && typeof (file as any).path === 'string'

              // 如果文件没有path属性或path为空（Electron 32.3.3+或从网页复制的文件）
              if (!hasPath || (file as any).path === '') {
                if (file.type.startsWith('image/') && isVisionModel(model)) {
                  // 创建临时文件并写入内容
                  const fileName = file.name
                  const tempFilePath = await window.api.file.create(fileName)

                  // 使用 FileReader 读取文件内容
                  const reader = new FileReader()
                  const fileContent = await new Promise<ArrayBuffer>((resolve, reject) => {
                    reader.onload = () => resolve(reader.result as ArrayBuffer)
                    reader.onerror = reject
                    reader.readAsArrayBuffer(file)
                  })

                  const uint8Array = new Uint8Array(fileContent)
                  await window.api.file.write(tempFilePath, uint8Array)
                  const selectedFile = await window.api.file.get(tempFilePath)
                  selectedFile && setFiles((prevFiles) => [...prevFiles, selectedFile])
                  break
                } else {
                  window.message.info({
                    key: 'file_not_supported',
                    content: t('chat.input.file_not_supported')
                  })
                }
              }
              // 如果文件有path属性（Electron 32.3.3之前的版本）
              else if (hasPath) {
                const filePath = (file as any).path
                if (supportExts.includes(getFileExtension(filePath))) {
                  const selectedFile = await window.api.file.get(filePath)
                  selectedFile && setFiles((prevFiles) => [...prevFiles, selectedFile])
                } else {
                  window.message.info({
                    key: 'file_not_supported',
                    content: t('chat.input.file_not_supported')
                  })
                }
              }
            } catch (error) {
              console.error('[Inputbar] Error processing pasted file:', error)
              window.message.error({
                key: 'file_processing_error',
                content: t('chat.input.file_processing_error') || 'Error processing file'
              })
            }
          }
        }
      }

      if (pasteLongTextAsFile) {
        const item = event.clipboardData?.items[0]
        if (item && item.kind === 'string' && item.type === 'text/plain') {
          item.getAsString(async (pasteText: string) => {
            if (pasteText.length > pasteLongTextThreshold) {
              const tempFilePath = await window.api.file.create('pasted_text.txt')
              await window.api.file.write(tempFilePath, pasteText)
              const selectedFile = await window.api.file.get(tempFilePath)
              selectedFile && setFiles((prevFiles) => [...prevFiles, selectedFile])
              setText(text)
              setTimeout(() => resizeTextArea(), 50)
            }
          })
        }
      }
    },
    [model, pasteLongTextAsFile, pasteLongTextThreshold, resizeTextArea, supportExts, t, text]
  )

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  // 强制初始化PDF设置
  const forcePdfSettingsInitialization = () => {
    const { pdfSettings } = store.getState().settings
    console.log('[Inputbar] Current PDF settings:', pdfSettings)

    // 如果pdfSettings为undefined或缺少enablePdfSplitting属性，则使用默认值初始化
    if (!pdfSettings || pdfSettings.enablePdfSplitting === undefined) {
      const defaultPdfSettings = {
        enablePdfSplitting: true,
        defaultPageRangePrompt: '输入页码范围，例如：1-5,8,10-15'
      }

      // 如果pdfSettings存在，则合并现有设置和默认设置
      const mergedSettings = {
        ...defaultPdfSettings,
        ...pdfSettings,
        // 确保 enablePdfSplitting 存在且为 true
        enablePdfSplitting: true
      }

      console.log('[Inputbar] Forcing PDF settings initialization with:', mergedSettings)
      dispatch(setPdfSettings(mergedSettings))
      return mergedSettings
    }

    return pdfSettings
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('[Inputbar] handleDrop called')

    try {
      // 使用修改后的 getFilesFromDropEvent 函数处理拖放的文件
      // 该函数已经被修改为兼容 Electron 32.3.3
      const files = await getFilesFromDropEvent(e).catch((err) => {
        Logger.error('[src/renderer/src/pages/home/Inputbar/Inputbar.tsx] handleDrop:', err)
        return null
      })

      if (files && files.length > 0) {
        console.log('[Inputbar] Files from drop event:', files)
        // 获取设置中的PDF设置，并强制初始化
        const pdfSettings = forcePdfSettingsInitialization()
        console.log('[Inputbar] PDF settings after initialization:', pdfSettings)

        for (const file of files) {
          // 确保文件有 path 属性
          if (!file.path) {
            console.log('[Inputbar] File has no path, skipping:', file)
            continue
          }

          const fileExt = getFileExtension(file.path)
          console.log(`[Inputbar] Processing file: ${file.path} with extension: ${fileExt}`)

          // 如果是PDF文件
          if (fileExt === '.pdf') {
            console.log('[Inputbar] PDF file detected, checking if splitting is enabled')
            console.log('[Inputbar] pdfSettings?.enablePdfSplitting =', pdfSettings?.enablePdfSplitting)

            // 如果启用了PDF分割功能
            if (pdfSettings?.enablePdfSplitting === true) {
              console.log('[Inputbar] PDF splitting is enabled, calling handlePdfFile')
              // 检查attachmentButtonRef.current是否存在
              if (attachmentButtonRef.current) {
                console.log('[Inputbar] attachmentButtonRef.current exists, calling handlePdfFile')
                const handled = attachmentButtonRef.current.handlePdfFile(file)
                console.log('[Inputbar] handlePdfFile result:', handled)
                if (handled) {
                  // 如果文件已经被处理，则跳过后面的处理
                  console.log('[Inputbar] File was handled by PDF splitter, skipping normal processing')
                  continue
                }
              } else {
                console.log('[Inputbar] attachmentButtonRef.current is null or undefined')
              }
            } else {
              console.log('[Inputbar] PDF splitting is disabled, processing as normal file')
            }
          }
          // 其他支持的文件类型
          else if (supportExts.includes(fileExt)) {
            console.log('[Inputbar] Adding file to files state:', file.path)
            setFiles((prevFiles) => [...prevFiles, file])
          } else {
            console.log('[Inputbar] File not supported or PDF splitting disabled:', file.path)
          }
        }
      } else {
        console.log('[Inputbar] No files from drop event')
      }
    } catch (error) {
      console.error('[Inputbar] Error in handleDrop:', error)
      window.message.error({
        key: 'drop_error',
        content: t('chat.input.drop_error') || 'Error processing dropped files'
      })
    }
  }

  const onTranslated = (translatedText: string) => {
    setText(translatedText)
    setTimeout(() => resizeTextArea(), 0)
  }

  const onPolished = (polishedText: string) => {
    setText(polishedText)
    setTimeout(() => resizeTextArea(), 0)
  }

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    startDragY.current = e.clientY
    const textArea = textareaRef.current?.resizableTextArea?.textArea
    if (textArea) {
      startHeight.current = textArea.offsetHeight
    }
  }

  const handleDrag = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return

      const delta = startDragY.current - e.clientY // 改变计算方向
      const viewportHeight = window.innerHeight
      const maxHeightInPixels = viewportHeight * 0.7

      const newHeight = Math.min(maxHeightInPixels, Math.max(startHeight.current + delta, 30))
      const textArea = textareaRef.current?.resizableTextArea?.textArea

      if (textArea) {
        textArea.style.height = `${newHeight}px`
        setExpend(newHeight == maxHeightInPixels)
        setTextareaHeight(newHeight)
      }
    },
    [isDragging]
  )

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDrag)
      document.addEventListener('mouseup', handleDragEnd)
    }
    return () => {
      document.removeEventListener('mousemove', handleDrag)
      document.removeEventListener('mouseup', handleDragEnd)
    }
  }, [isDragging, handleDrag, handleDragEnd])

  useShortcut('new_topic', () => {
    addNewTopic()
    EventEmitter.emit(EVENT_NAMES.SHOW_TOPIC_SIDEBAR)
    textareaRef.current?.focus()
  })

  useShortcut('clear_topic', clearTopic)

  useEffect(() => {
    const _setEstimateTokenCount = debounce(setEstimateTokenCount, 100, { leading: false, trailing: true })
    const unsubscribes = [
      EventEmitter.on(EVENT_NAMES.EDIT_MESSAGE, (message: Message) => {
        setText(message.content)
        textareaRef.current?.focus()
        setTimeout(() => resizeTextArea(), 0)
      }),
      EventEmitter.on(EVENT_NAMES.ESTIMATED_TOKEN_COUNT, ({ tokensCount, contextCount }) => {
        _setEstimateTokenCount(tokensCount)
        setContextCount({ current: contextCount.current, max: contextCount.max }) // 现在contextCount是一个对象而不是单个数值
      }),
      EventEmitter.on(EVENT_NAMES.ADD_NEW_TOPIC, addNewTopic),
      EventEmitter.on(EVENT_NAMES.QUOTE_TEXT, (quotedText: string) => {
        setText((prevText) => {
          const newText = prevText ? `${prevText}\n${quotedText}\n` : `${quotedText}\n`
          setTimeout(() => resizeTextArea(), 0)
          return newText
        })
        textareaRef.current?.focus()
      }),
      // 监听语音通话消息
      EventEmitter.on(
        EVENT_NAMES.VOICE_CALL_MESSAGE,
        (data: {
          text: string
          model: any
          isVoiceCall?: boolean
          useVoiceCallModel?: boolean
          voiceCallModelId?: string
        }) => {
          console.log('收到语音通话消息:', data)

          // 先设置输入框文本
          setText(data.text)

          // 使用延时确保文本已经设置到输入框
          setTimeout(() => {
            // 直接调用发送消息函数，而不检查inputEmpty
            console.log('准备自动发送语音识别消息:', data.text)

            // 直接使用正确的方式发送消息
            // 创建用户消息
            const userMessage = getUserMessage({
              assistant,
              topic,
              type: 'text',
              content: data.text
            })

            // 如果是语音通话消息，使用语音通话专用模型
            if (data.isVoiceCall || data.useVoiceCallModel) {
              // 从全局设置中获取语音通话专用模型
              const { voiceCallModel } = store.getState().settings

              // 打印调试信息
              console.log('语音通话消息，尝试使用语音通话专用模型')
              console.log('全局设置中的语音通话模型:', voiceCallModel ? JSON.stringify(voiceCallModel) : 'null')
              console.log('事件中传递的模型:', data.model ? JSON.stringify(data.model) : 'null')

              // 如果全局设置中有语音通话专用模型，优先使用
              if (voiceCallModel) {
                userMessage.model = voiceCallModel
                console.log('使用全局设置中的语音通话专用模型:', voiceCallModel.name)

                // 强制覆盖消息中的模型
                userMessage.modelId = voiceCallModel.id
              }
              // 如果没有全局设置，但事件中传递了模型，使用事件中的模型
              else if (data.model && typeof data.model === 'object') {
                userMessage.model = data.model
                console.log('使用事件中传递的模型:', data.model.name || data.model.id)

                // 强制覆盖消息中的模型
                userMessage.modelId = data.model.id
              }
              // 如果没有模型对象，但有模型ID，尝试使用模型ID
              else if (data.voiceCallModelId) {
                console.log('使用事件中传递的模型ID:', data.voiceCallModelId)
                userMessage.modelId = data.voiceCallModelId
              }
              // 如果以上都没有，使用当前助手模型
              else {
                console.log('没有找到语音通话专用模型，使用当前助手模型')
              }
            }
            // 非语音通话消息，使用当前助手模型
            else if (data.model) {
              const modelObj = assistant.model?.id === data.model.id ? assistant.model : undefined
              if (modelObj) {
                userMessage.model = modelObj
                console.log('使用当前助手模型:', modelObj.name || modelObj.id)
              }
            }

            // 如果是语音通话消息，创建一个新的助手对象，并设置模型和提示词
            let assistantToUse = assistant
            if (data.isVoiceCall || data.useVoiceCallModel) {
              // 创建一个新的助手对象，以避免修改原始助手
              assistantToUse = { ...assistant }

              // 如果有语音通话专用模型，设置助手的模型
              if (userMessage.model) {
                assistantToUse.model = userMessage.model
                console.log(
                  '为语音通话消息创建了新的助手对象，并设置了模型:',
                  userMessage.model.name || userMessage.model.id
                )
              }

              // 获取用户自定义提示词
              const { voiceCallPrompt } = store.getState().settings

              // 使用自定义提示词或当前语言的默认提示词
              const promptToUse = voiceCallPrompt || getDefaultVoiceCallPrompt()

              // 如果助手已经有提示词，则在其后添加语音通话专属提示词
              if (assistantToUse.prompt) {
                assistantToUse.prompt += '\n\n' + promptToUse
              } else {
                assistantToUse.prompt = promptToUse
              }

              console.log('为语音通话消息添加了专属提示词')
            }

            // 分发发送消息的action
            dispatch(_sendMessage(userMessage, assistantToUse, topic, {}))

            // 清空输入框
            setText('')
            // 重置语音识别状态
            setAsrCurrentText('')

            console.log('已触发发送消息事件')
          }, 300)
        }
      )
    ]
    return () => unsubscribes.forEach((unsub) => unsub())
  }, [
    addNewTopic,
    resizeTextArea,
    sendMessage,
    model,
    inputEmpty,
    loading,
    dispatch,
    assistant,
    topic,
    setText
    // getUserMessage 和 _sendMessage 是外部作用域值，不需要作为依赖项
  ])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [assistant])

  useEffect(() => {
    setTimeout(() => resizeTextArea(), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (spaceClickTimer.current) {
        clearTimeout(spaceClickTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    window.addEventListener('focus', () => {
      textareaRef.current?.focus()
    })
  }, [])

  // Add useEffect to listen for SET_CHAT_INPUT event
  useEffect(() => {
    const unsubscribe = EventEmitter.on(EVENT_NAMES.SET_CHAT_INPUT, (content: string) => {
      setText(content) // Update the input text state
      setTimeout(() => {
        resizeTextArea() // Adjust textarea height
        textareaRef.current?.focus() // Focus the textarea
      }, 0)
    })

    // Cleanup function to unsubscribe when the component unmounts
    return () => {
      unsubscribe()
    }
  }, [resizeTextArea]) // Add resizeTextArea to dependency array

  // Add useEffect to listen for SEND_FILE_ATTACHMENT event
  useEffect(() => {
    const unsubscribe = EventEmitter.on(EVENT_NAMES.SEND_FILE_ATTACHMENT, (file: FileType) => {
      // Add file to files array
      setFiles((prevFiles) => {
        // Check if file already exists in array
        const fileExists = prevFiles.some((f) => f.path === file.path)
        if (fileExists) {
          return prevFiles // File already exists, don't add it again
        } else {
          return [...prevFiles, file] // Add new file to array
        }
      })

      // Focus the textarea
      setTimeout(() => {
        textareaRef.current?.focus()
      }, 0)

      // Show success message
      window.message.success(t('workspace.fileSentAsAttachment'))
    })

    // Cleanup function to unsubscribe when the component unmounts
    return () => {
      unsubscribe()
    }
  }, [t]) // Add t to dependency array

  useEffect(() => {
    // if assistant knowledge bases are undefined return []
    setSelectedKnowledgeBases(showKnowledgeIcon ? (assistant.knowledge_bases ?? []) : [])
  }, [assistant.id, assistant.knowledge_bases, showKnowledgeIcon])

  const textareaRows = window.innerHeight >= 1000 || isBubbleStyle ? 2 : 1

  const handleKnowledgeBaseSelect = (bases?: KnowledgeBase[]) => {
    updateAssistant({ ...assistant, knowledge_bases: bases })
    setSelectedKnowledgeBases(bases ?? [])
  }

  const handleRemoveModel = (model: Model) => {
    setMentionModels(mentionModels.filter((m) => m.id !== model.id))
  }

  const handleRemoveKnowledgeBase = (knowledgeBase: KnowledgeBase) => {
    const newKnowledgeBases = assistant.knowledge_bases?.filter((kb) => kb.id !== knowledgeBase.id)
    updateAssistant({
      ...assistant,
      knowledge_bases: newKnowledgeBases
    })
    setSelectedKnowledgeBases(newKnowledgeBases ?? [])
  }

  const toggelEnableMCP = (mcp: MCPServer) => {
    setEnabledMCPs((prev) => {
      const exists = prev.some((item) => item.id === mcp.id)
      if (exists) {
        return prev.filter((item) => item.id !== mcp.id)
      } else {
        return [...prev, mcp]
      }
    })
  }

  const showWebSearchEnableModal = () => {
    window.modal.confirm({
      title: t('chat.input.web_search.enable'),
      content: t('chat.input.web_search.enable_content'),
      centered: true,
      okText: t('chat.input.web_search.button.ok'),
      onOk: () => {
        navigate('/settings/web-search')
      }
    })
  }

  const shouldShowEnableModal = () => {
    // 网络搜索功能是否未启用
    const webSearchNotEnabled = !WebSearchService.isWebSearchEnabled()
    // 非网络搜索模型：仅当网络搜索功能未启用时显示启用提示
    if (!isWebSearchModel(model)) {
      return webSearchNotEnabled
    }
    // 网络搜索模型：当允许覆盖但网络搜索功能未启用时显示启用提示
    return WebSearchService.isOverwriteEnabled() && webSearchNotEnabled
  }

  const onEnableWebSearch = () => {
    if (shouldShowEnableModal()) {
      showWebSearchEnableModal()
      return
    }

    updateAssistant({ ...assistant, enableWebSearch: !assistant.enableWebSearch })
  }

  // 图像生成功能切换函数，暂未在界面使用，但保留以供未来使用
  // const onEnableGenerateImage = () => {
  //   updateAssistant({ ...assistant, enableGenerateImage: !assistant.enableGenerateImage })
  // }

  useEffect(() => {
    if (!isWebSearchModel(model) && !WebSearchService.isWebSearchEnabled() && assistant.enableWebSearch) {
      updateAssistant({ ...assistant, enableWebSearch: false })
    }
    if (!isGenerateImageModel(model) && assistant.enableGenerateImage) {
      updateAssistant({ ...assistant, enableGenerateImage: false })
    }
    if (isGenerateImageModel(model) && !assistant.enableGenerateImage) {
      updateAssistant({ ...assistant, enableGenerateImage: true })
    }
  }, [assistant, model, updateAssistant])

  const onMentionModel = (model: Model) => {
    setMentionModels((prev) => {
      const modelId = getModelUniqId(model)
      const exists = prev.some((m) => getModelUniqId(m) === modelId)
      return exists ? prev.filter((m) => getModelUniqId(m) !== modelId) : [...prev, model]
    })
  }

  const onToggleExpended = () => {
    if (textareaHeight) {
      const textArea = textareaRef.current?.resizableTextArea?.textArea
      if (textArea) {
        textArea.style.height = 'auto'
        setTextareaHeight(undefined)
        setTimeout(() => {
          textArea.style.height = `${textArea.scrollHeight}px`
        }, 200)
        return
      }
    }

    const isExpended = !expended
    setExpend(isExpended)
    const textArea = textareaRef.current?.resizableTextArea?.textArea

    if (textArea) {
      if (isExpended) {
        textArea.style.height = '70vh'
      } else {
        resetHeight()
      }
    }

    textareaRef.current?.focus()
  }

  const resetHeight = () => {
    if (expended) {
      setExpend(false)
    }

    setTextareaHeight(undefined)

    requestAnimationFrame(() => {
      const textArea = textareaRef.current?.resizableTextArea?.textArea
      if (textArea) {
        textArea.style.height = 'auto'
        const contentHeight = textArea.scrollHeight
        textArea.style.height = contentHeight > 400 ? '400px' : `${contentHeight}px`
      }
    })
  }

  const isExpended = expended || !!textareaHeight

  // 检查按钮是否被禁用
  const isButtonDisabled = useCallback(
    (buttonId: string) => {
      return inputBarDisabledButtons?.includes(buttonId as any)
    },
    [inputBarDisabledButtons]
  )

  return (
    <Container onDragOver={handleDragOver} onDrop={handleDrop} className="inputbar">
      <NarrowLayout style={{ width: '100%' }}>
        <QuickPanelView setInputText={setText} />
        <InputBarContainer
          id="inputbar"
          className={classNames('inputbar-container', inputFocus && 'focus')}
          ref={containerRef}>
          {files.length > 0 && <AttachmentPreview files={files} setFiles={setFiles} />}
          {selectedKnowledgeBases.length > 0 && (
            <KnowledgeBaseInput
              selectedKnowledgeBases={selectedKnowledgeBases}
              onRemoveKnowledgeBase={handleRemoveKnowledgeBase}
            />
          )}
          {mentionModels.length > 0 && (
            <MentionModelsInput selectedModels={mentionModels} onRemoveModel={handleRemoveModel} />
          )}
          <Textarea
            id="chat-input"
            value={text}
            onChange={onChange}
            onKeyDown={handleKeyDown}
            placeholder={isTranslating ? t('chat.input.translating') : t('chat.input.placeholder')}
            autoFocus
            contextMenu="true"
            variant="borderless"
            spellCheck={false}
            rows={textareaRows}
            ref={textareaRef}
            style={{
              fontSize,
              minHeight: textareaHeight ? `${textareaHeight}px` : undefined
            }}
            styles={{ textarea: TextareaStyle }}
            onFocus={(e: React.FocusEvent<HTMLTextAreaElement>) => {
              setInputFocus(true)
              const textArea = e.target
              if (textArea) {
                const length = textArea.value.length
                textArea.setSelectionRange(length, length)
              }
            }}
            onBlur={() => setInputFocus(false)}
            onInput={onInput}
            disabled={searching}
            onPaste={(e: React.ClipboardEvent<HTMLTextAreaElement>) => onPaste(e.nativeEvent)}
            onClick={() => searching && dispatch(setSearching(false))}
          />
          <DragHandle onMouseDown={handleDragStart}>
            <HolderOutlined />
          </DragHandle>
          <Toolbar>
            <ToolbarMenu>
              {!isButtonDisabled('new_topic') && (
                <Tooltip placement="top" title={t('chat.input.new_topic', { Command: newTopicShortcut })} arrow>
                  <ToolbarButton type="text" onClick={addNewTopic}>
                    <MessageSquareDiff size={19} />
                  </ToolbarButton>
                </Tooltip>
              )}
              {/* Add Workspace Toggle Button here */}
              {onToggleWorkspacePanel && !isButtonDisabled('workspace') && (
                <Tooltip placement="top" title={t('workspace.toggle')} arrow>
                  <ToolbarButton type="text" onClick={onToggleWorkspacePanel}>
                    <FolderOutlined />
                  </ToolbarButton>
                </Tooltip>
              )}
              {!isButtonDisabled('attachment') && (
                <AttachmentButton
                  ref={attachmentButtonRef}
                  model={model}
                  files={files}
                  setFiles={setFiles}
                  ToolbarButton={ToolbarButton}
                />
              )}
              {!isButtonDisabled('web_search') && (
                <Tooltip placement="top" title={t('chat.input.web_search')} arrow>
                  <ToolbarButton type="text" onClick={onEnableWebSearch}>
                    <Globe
                      size={18}
                      style={{ color: assistant.enableWebSearch ? 'var(--color-link)' : 'var(--color-icon)' }}
                    />
                  </ToolbarButton>
                </Tooltip>
              )}
              {showKnowledgeIcon && !isButtonDisabled('knowledge_base') && (
                <KnowledgeBaseButton
                  ref={knowledgeBaseButtonRef}
                  selectedBases={selectedKnowledgeBases}
                  onSelect={handleKnowledgeBaseSelect}
                  ToolbarButton={ToolbarButton}
                  disabled={files.length > 0}
                />
              )}
              {!isButtonDisabled('mcp_tools') && (
                <MCPToolsButton
                  ref={mcpToolsButtonRef}
                  enabledMCPs={enabledMCPs}
                  toggelEnableMCP={toggelEnableMCP}
                  ToolbarButton={ToolbarButton}
                  setInputValue={setText}
                  resizeTextArea={resizeTextArea}
                />
              )}
              {/* 将 agentTasks 属性传递给 AgentModeButton。注意：这里暂时传递空数组，实际数据应从父组件获取并传递 */}
              {!isButtonDisabled('agent_mode') && (
                <AgentModeButton
                  ToolbarButton={ToolbarButton}
                  agentTasks={agentTasks || []}
                  scrollToMessage={scrollToMessage} // 传递 scrollToMessage prop
                />
              )}
              {!isButtonDisabled('mention_models') && (
                <MentionModelsButton
                  ref={mentionModelsButtonRef}
                  mentionModels={mentionModels}
                  onMentionModel={onMentionModel}
                  ToolbarButton={ToolbarButton}
                />
              )}
              {!isButtonDisabled('quick_phrases') && (
                <QuickPhrasesButton
                  ref={quickPhrasesButtonRef}
                  setInputValue={setText}
                  resizeTextArea={resizeTextArea}
                  ToolbarButton={ToolbarButton}
                />
              )}
              {!isButtonDisabled('clear') && (
                <Tooltip placement="top" title={t('chat.input.clear', { Command: cleanTopicShortcut })} arrow>
                  <ToolbarButton type="text" onClick={clearTopic}>
                    <PaintbrushVertical size={18} />
                  </ToolbarButton>
                </Tooltip>
              )}
              {!isButtonDisabled('expand') && (
                <Tooltip placement="top" title={isExpended ? t('chat.input.collapse') : t('chat.input.expand')} arrow>
                  <ToolbarButton type="text" onClick={onToggleExpended}>
                    {isExpended ? <Minimize size={18} /> : <Maximize size={18} />}
                  </ToolbarButton>
                </Tooltip>
              )}
              {!isButtonDisabled('new_context') && (
                <NewContextButton onNewContext={onNewContext} ToolbarButton={ToolbarButton} />
              )}
              <TokenCount
                estimateTokenCount={estimateTokenCount}
                inputTokenCount={inputTokenCount}
                contextCount={contextCount}
                topic={topic}
                ToolbarButton={ToolbarButton}
                onClick={onNewContext}
              />
            </ToolbarMenu>
            <ToolbarMenu>
              {!isButtonDisabled('translate') && (
                <TranslateButton text={text} onTranslated={onTranslated} isLoading={isTranslating} />
              )}
              {!isButtonDisabled('polish_text') && (
                <PolishTextButton text={text} onPolished={onPolished} />
              )}
              {!isButtonDisabled('deep_thinking') && (
                <DeepThinkingButton
                  text={text}
                  files={files}
                  topic={topic}
                  onDeepThinking={async (thinkingResult) => {
                    // 创建用户消息
                    const userMessage = getUserMessage({
                      assistant,
                      topic,
                      type: 'text',
                      content: text
                    })

                    // 添加文件附件
                    if (files && files.length > 0) {
                      userMessage.files = files;
                    }

                    // 添加思考结果作为助手消息
                    const assistantMessage = {
                      ...userMessage,
                      id: `thinking-${Date.now()}`,
                      role: 'assistant' as const,
                      content: thinkingResult,
                      createdAt: new Date().toISOString(),
                      thinking: true // 标记为思考消息
                    }

                    // 将用户消息和思考结果添加到当前主题
                    if (topic && topic.id) {
                      try {
                        // 添加用户消息和助手消息
                        await addAssistantMessagesToTopic(topic.id, [userMessage, assistantMessage])

                        // 打印日志，便于调试
                        console.log('[DeepThinking] Added user message and thinking result to topic:', topic.id)
                        console.log('[DeepThinking] User message:', userMessage)
                        console.log('[DeepThinking] Assistant message:', assistantMessage)
                      } catch (error) {
                        console.error('Failed to add messages to topic:', error)
                        window.message.error({
                          content: t('deep_thinking.error.failed'),
                          key: 'deep-thinking-message'
                        })
                      }
                    } else {
                      console.error('Topic is undefined or missing id')
                      window.message.error({
                        content: t('deep_thinking.error.failed'),
                        key: 'deep-thinking-message'
                      })
                    }

                    // 清空输入框
                    setText('')
                    setFiles([]) // 清空文件附件
                    setTimeout(() => resizeTextArea(), 0)
                  }} />
              )}
              {!isButtonDisabled('asr') && (
                <ASRButton
                  onTranscribed={(transcribedText, isFinal) => {
                    // 如果是空字符串，不做任何处理
                    if (!transcribedText) return

                    if (isFinal) {
                      // 最终结果，添加到输入框中
                      setText((prevText) => {
                        // 如果当前输入框为空，直接设置为识别的文本
                        if (!prevText.trim()) {
                          return transcribedText
                        }

                        // 否则，添加识别的文本到输入框中，用空格分隔
                        return prevText + ' ' + transcribedText
                      })

                      // 清除当前识别的文本
                      setAsrCurrentText('')
                    } else {
                      // 中间结果，保存到状态变量中，但不更新输入框
                      setAsrCurrentText(transcribedText)
                    }
                  }}
                />
              )}
              {!isButtonDisabled('voice_call') && <VoiceCallButton disabled={loading} />}
              {loading && (
                <Tooltip placement="top" title={t('chat.input.pause')} arrow>
                  <ToolbarButton type="text" onClick={onPause} style={{ marginRight: -2, marginTop: 1 }}>
                    <CirclePause style={{ color: 'var(--color-error)', fontSize: 20 }} />
                  </ToolbarButton>
                </Tooltip>
              )}
              {!loading && <SendMessageButton sendMessage={sendMessage} disabled={loading || inputEmpty} />}
            </ToolbarMenu>
          </Toolbar>
        </InputBarContainer>
      </NarrowLayout>
    </Container>
  )
}

// Add these styled components at the bottom
const DragHandle = styled.div`
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  height: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: row-resize;
  color: var(--color-icon);
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 1;

  &:hover {
    opacity: 1;
  }

  .anticon {
    transform: rotate(90deg);
    font-size: 14px;
  }
`

const Container = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 2;
`

const InputBarContainer = styled.div`
  border: 0.5px solid var(--color-border);
  transition: all 0.2s ease;
  position: relative;
  margin: 14px 20px;
  margin-top: 0;
  border-radius: 15px;
  padding-top: 6px; // 为拖动手柄留出空间
  background-color: var(--color-background-opacity);
`

const TextareaStyle: CSSProperties = {
  paddingLeft: 0,
  padding: '6px 15px 8px' // 减小顶部padding
}

const Textarea = styled(TextArea)`
  padding: 0;
  border-radius: 0;
  display: flex;
  flex: 1;
  font-family: Ubuntu;
  resize: none !important;
  overflow: auto;
  width: 100%;
  box-sizing: border-box;
  &.ant-input {
    line-height: 1.4;
  }
`

const Toolbar = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  padding: 0 8px;
  padding-bottom: 0;
  margin-bottom: 4px;
  height: 36px;
`

const ToolbarMenu = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
`

const ToolbarButton = styled(Button)`
  width: 30px;
  height: 30px;
  font-size: 16px;
  border-radius: 50%;
  transition: all 0.3s ease;
  color: var(--color-icon);
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  padding: 0;
  &.anticon,
  &.iconfont {
    transition: all 0.3s ease;
    color: var(--color-icon);
  }
  .icon-a-addchat {
    font-size: 18px;
    margin-bottom: -2px;
  }
  &:hover {
    background-color: var(--color-background-soft);
    .anticon,
    .iconfont {
      color: var(--color-text-1);
    }
  }
  &.active {
    background-color: var(--color-primary) !important;
    .anticon,
    .iconfont {
      color: var(--color-white-soft);
    }
    &:hover {
      background-color: var(--color-primary);
    }
  }
`

export default Inputbar
