import { GroundingMetadata } from '@google/generative-ai'
import OpenAI from 'openai'
import React from 'react'
import { BuiltinTheme } from 'shiki'

export type Assistant = {
  id: string
  name: string
  prompt: string
  knowledge_bases?: KnowledgeBase[]
  topics: Topic[]
  type: string
  emoji?: string
  description?: string
  model?: Model
  defaultModel?: Model
  settings?: Partial<AssistantSettings>
  messages?: AssistantMessage[]
  enableWebSearch?: boolean
  enableGenerateImage?: boolean
  mcpServers?: MCPServer[]
}

export type AssistantMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type AssistantSettingCustomParameters = {
  name: string
  value: string | number | boolean | object
  type: 'string' | 'number' | 'boolean' | 'json'
}

export type AssistantSettings = {
  contextCount: number
  temperature: number
  topP: number
  maxTokens: number | undefined
  enableMaxTokens: boolean
  streamOutput: boolean
  hideMessages: boolean
  defaultModel?: Model
  customParameters?: AssistantSettingCustomParameters[]
  reasoning_effort?: 'low' | 'medium' | 'high'
  thinkingBudget?: number
}

export type Agent = Omit<Assistant, 'model'> & {
  group?: string[]
}

export type Message = {
  id: string
  assistantId: string
  role: 'user' | 'assistant'
  content: string
  reasoning_content?: string
  translatedContent?: string
  topicId: string
  createdAt: string
  status: 'sending' | 'pending' | 'searching' | 'success' | 'paused' | 'error'
  modelId?: string
  model?: Model
  files?: FileType[]
  images?: string[]
  usage?: OpenAI.Completions.CompletionUsage
  metrics?: Metrics
  knowledgeBaseIds?: string[]
  type: 'text' | '@' | 'clear'
  isPreset?: boolean
  mentions?: Model[]
  askId?: string
  useful?: boolean
  error?: Record<string, any>
  enabledMCPs?: MCPServer[]
  // 是否隐藏消息（用于系统消息）
  isHidden?: boolean
  // 是否为深度思考消息
  thinking?: boolean
  // 是否为最终思考结果
  isFinalThinking?: boolean
  // 引用消息
  referencedMessages?: {
    id: string
    content: string
    role: 'user' | 'assistant'
    createdAt: string
  }[]
  metadata?: {
    // Gemini
    groundingMetadata?: GroundingMetadata
    // Perplexity Or Openrouter
    citations?: string[]
    // OpenAI
    annotations?: OpenAI.Chat.Completions.ChatCompletionMessage.Annotation[]
    // Zhipu or Hunyuan
    webSearchInfo?: any[]
    // Web search
    webSearch?: WebSearchResponse
    // MCP Tools
    mcpTools?: MCPToolResponse[]
    // Generate Image
    generateImage?: GenerateImageResponse
    // Knowledge base results
    knowledge?: KnowledgeReference[]
    // 工具调用查询标记
    isToolResultQuery?: boolean
    // 工具调用响应标记
    isToolResultResponse?: boolean
    // 工具调用结果
    toolResults?: {
      toolId: string
      response: MCPCallToolResponse
    }[]
    // 语音通话消息标记
    isVoiceCallMessage?: boolean
  }
  // 多模型消息样式
  multiModelMessageStyle?: 'horizontal' | 'vertical' | 'fold' | 'grid'
  // fold时是否选中
  foldSelected?: boolean
}

export type Metrics = {
  completion_tokens?: number
  time_completion_millsec?: number
  time_first_token_millsec?: number
  time_thinking_millsec?: number
}

export type Topic = {
  id: string
  assistantId: string
  name: string
  createdAt: string
  updatedAt: string
  messages: Message[]
  pinned?: boolean
  prompt?: string
  isNameManuallyEdited?: boolean
}

export type User = {
  id: string
  name: string
  avatar: string
  email: string
}

export type Provider = {
  id: string
  type: ProviderType
  name: string
  apiKey: string
  apiHost: string
  apiVersion?: string
  models: Model[]
  enabled?: boolean
  isSystem?: boolean
  isAuthed?: boolean
  rateLimit?: number
  isNotSupportArrayContent?: boolean
  notes?: string
}

export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'qwenlm' | 'azure-openai' | 'deepclaude' | 'openai-compatible'

export type ModelType = 'text' | 'vision' | 'embedding' | 'reasoning' | 'function_calling' | 'web_search'

export type Model = {
  id: string
  provider: string
  name: string
  group: string
  owned_by?: string
  description?: string
  type?: ModelType[]
}

export type Suggestion = {
  content: string
}

export interface Painting {
  id: string
  model?: string
  urls: string[]
  files: FileType[]
  prompt?: string
  negativePrompt?: string
  imageSize?: string
  numImages?: number
  seed?: string
  steps?: number
  guidanceScale?: number
  promptEnhancement?: boolean
  aspectRatio?: string
}

export type MinAppType = {
  id: string
  name: string
  logo?: string
  url: string
  bodered?: boolean
  background?: string
  style?: React.CSSProperties
}

export interface FileType {
  id: string
  name: string
  origin_name: string
  path: string
  size: number
  ext: string
  type: FileTypes
  created_at: string
  count: number
  tokens?: number
  pdf_page_range?: string
  pdf_page_count?: number
}

export enum FileTypes {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  TEXT = 'text',
  DOCUMENT = 'document',
  OTHER = 'other'
}

export enum ThemeMode {
  light = 'light',
  dark = 'dark',
  auto = 'auto',
  timeBasedAuto = 'timeBasedAuto'
}

export type LanguageVarious = 'zh-CN' | 'zh-TW' | 'el-GR' | 'en-US' | 'es-ES' | 'fr-FR' | 'ja-JP' | 'pt-PT' | 'ru-RU'

export type TranslateLanguageVarious =
  | 'chinese'
  | 'chinese-traditional'
  | 'greek'
  | 'english'
  | 'spanish'
  | 'french'
  | 'japanese'
  | 'portuguese'
  | 'russian'

export type CodeStyleVarious = BuiltinTheme | 'auto'

export type WebDavConfig = {
  webdavHost: string
  webdavUser: string
  webdavPass: string
  webdavPath: string
  fileName?: string
}

export type AppInfo = {
  version: string
  isPackaged: boolean
  appPath: string
  configPath: string
  appDataPath: string
  resourcesPath: string
  filesPath: string
  logsPath: string
  arch: string
}

export interface Shortcut {
  key: string
  shortcut: string[]
  editable: boolean
  enabled: boolean
  system: boolean
}

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type KnowledgeItemType = 'file' | 'url' | 'note' | 'sitemap' | 'directory'

export type KnowledgeItem = {
  id: string
  baseId?: string
  uniqueId?: string
  uniqueIds?: string[]
  type: KnowledgeItemType
  content: string | FileType
  remark?: string
  created_at: number
  updated_at: number
  processingStatus?: ProcessingStatus
  processingProgress?: number
  processingError?: string
  retryCount?: number
}

export interface KnowledgeBase {
  id: string
  name: string
  model: Model
  dimensions: number
  description?: string
  items: KnowledgeItem[]
  created_at: number
  updated_at: number
  version: number
  documentCount?: number
  chunkSize?: number
  chunkOverlap?: number
  threshold?: number
  rerankModel?: Model
  topN?: number
}

export type KnowledgeBaseParams = {
  id: string
  model: string
  dimensions: number
  apiKey: string
  apiVersion?: string
  baseURL: string
  chunkSize?: number
  chunkOverlap?: number
  rerankApiKey?: string
  rerankBaseURL?: string
  rerankModel?: string
  rerankModelProvider?: string
  topN?: number
}

export type GenerateImageParams = {
  model: string
  prompt: string
  negativePrompt?: string
  imageSize: string
  batchSize: number
  seed?: string
  numInferenceSteps: number
  guidanceScale: number
  signal?: AbortSignal
  promptEnhancement?: boolean
}

export type GenerateImageResponse = {
  type: 'url' | 'base64'
  images: string[]
}

export interface TranslateHistory {
  id: string
  sourceText: string
  targetText: string
  sourceLanguage: string
  targetLanguage: string
  createdAt: string
}

export type SidebarIcon =
  | 'assistants'
  | 'agents'
  | 'paintings'
  | 'translate'
  | 'minapp'
  | 'knowledge'
  | 'files'
  | 'projects'
  | 'workspace'
  | 'deepresearch'
  | 'browser'
  | 'calendar'

export type WebSearchProvider = {
  id: string
  name: string
  apiKey?: string
  apiHost?: string
  engines?: string[]
  url?: string
  contentLimit?: number
  usingBrowser?: boolean
  description?: string
  category?: string
  // Jina特定参数
  topK?: number
  includeMetadata?: boolean
  searchType?: 'hybrid' | 'sparse' | 'dense'
  useReranker?: boolean
  // 新增Jina参数
  apiEndpoint?: 'reader' | 'search' // r.jina.ai 或 s.jina.ai
  locale?: string
  country?: string
  timeout?: number
  noCache?: boolean
  withFavicon?: boolean
  withLinks?: boolean
  withImages?: boolean
  returnFormat?: 'markdown' | 'html' | 'text' | 'screenshot' | 'pageshot'
  engine?: 'browser' | 'direct' | 'cf-browser-rendering'
  site?: string
  // SERP特定参数
  jsonResponse?: boolean
  fetchFavicons?: boolean
  location?: string
  page?: number
  num?: number
  // Reader特定参数
  removeSelectors?: string
  targetSelectors?: string
  waitForSelectors?: string
  withGeneratedAlt?: boolean
  withIframe?: boolean
  tokenBudget?: number
  retainImages?: 'all' | 'none'
  respondWith?: string
  proxy?: string
  // 新增 Reader API 参数
  dnt?: boolean
  noGfm?: boolean
  robotsTxt?: string
  withShadowDom?: boolean
  base?: string
  mdHeadingStyle?: string
  mdHr?: string
  mdBulletListMarker?: string
  mdEmDelimiter?: string
  mdStrongDelimiter?: string
  mdLinkStyle?: string
  mdLinkReferenceStyle?: string
  setCookie?: string
  proxyUrl?: string
  viewport?: { width: number; height: number }
  injectPageScript?: string
}

export type WebSearchResponse = {
  query?: string
  results: WebSearchResult[]
}

export type WebSearchResult = {
  title: string
  content: string
  url: string
  source?: string
  summary?: string
  keywords?: string[]
  relevanceScore?: number
  meta?: {
    priorityScore?: number
    [key: string]: any
  }
}

export interface ResearchIteration {
  query: string
  results: WebSearchResult[]
  analysis: string
  followUpQueries: string[]
}

export interface ResearchReport {
  originalQuery: string
  iterations: ResearchIteration[]
  summary: string
  directAnswer: string
  keyInsights: string[]
  sources: string[]
  tokenUsage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

export type KnowledgeReference = {
  id: number
  content: string
  sourceUrl: string
  type: KnowledgeItemType
  file?: FileType
}

export type MCPArgType = 'string' | 'list' | 'number'
export type MCPEnvType = 'string' | 'number'
export type MCPArgParameter = { [key: string]: MCPArgType }
export type MCPEnvParameter = { [key: string]: MCPEnvType }

export interface MCPServerParameter {
  name: string
  type: MCPArgType | MCPEnvType
  description: string
}

export interface MCPConfigSample {
  command: string
  args: string[]
  env?: Record<string, string> | undefined
}

export interface MCPServer {
  id: string
  name: string
  type?: 'stdio' | 'sse' | 'inMemory' | 'streamableHttp'
  description?: string
  baseUrl?: string
  command?: string
  registryUrl?: string
  args?: string[]
  env?: Record<string, string>
  isActive: boolean
  disabledTools?: string[] // List of tool names that are disabled for this server
  configSample?: MCPConfigSample
  headers?: Record<string, string> // Custom headers to be sent with requests to this server
  searchKey?: string
  timeout?: number // 请求超时时间，单位秒
  provider?: string // 服务提供者名称
  providerUrl?: string // 服务提供者URL
  logoUrl?: string // 服务图标URL
  tags?: string[] // 服务标签
}

export interface MCPToolInputSchema {
  type: string
  title: string
  description?: string
  required?: string[]
  properties: Record<string, object>
}

export interface MCPTool {
  id: string
  serverId: string
  serverName: string
  name: string
  description?: string
  inputSchema: MCPToolInputSchema
  toolKey: string // Add descriptive key: serverId-toolName
}

export interface MCPPromptArguments {
  name: string
  description?: string
  required?: boolean
}

export interface MCPPrompt {
  id: string
  name: string
  description?: string
  arguments?: MCPPromptArguments[]
  serverId: string
  serverName: string
}

export interface GetMCPPromptResponse {
  description?: string
  messages: {
    role: string
    content: {
      type: 'text' | 'image' | 'audio' | 'resource'
      text?: string
      data?: string
      mimeType?: string
    }
  }[]
}

export interface MCPConfig {
  servers: MCPServer[]
}

export interface MCPToolResponse {
  id: string // tool call id, it should be unique
  tool: MCPTool // tool info
  args?: any // Actual arguments passed to the tool
  status: string // 'invoking' | 'done'
  response?: any
}

export interface MCPToolResultContent {
  type: 'text' | 'image' | 'audio' | 'resource'
  text?: string
  data?: string
  mimeType?: string
  resource?: {
    uri?: string
    text?: string
    mimeType?: string
  }
}

export interface MCPCallToolResponse {
  content: MCPToolResultContent[]
  isError?: boolean
}

export interface MCPResource {
  serverId: string
  serverName: string
  uri: string
  name: string
  description?: string
  mimeType?: string
  size?: number
  text?: string
  blob?: string
}

export interface GetResourceResponse {
  contents: MCPResource[]
}

// Agent Task Definition
export interface AgentTask {
  id: string
  title: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'error'
  result?: string
  messageId: string // 添加关联的消息ID
  toolName?: string // 添加 toolName 字段
  toolArgs?: any // 添加 toolArgs 字段
  toolResponse?: MCPCallToolResponse // 添加 toolResponse 字段
}

export interface QuickPhrase {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
  order?: number
}

export type TTSProvider = {
  id: string
  name: string
  apiKey?: string
  apiUrl?: string
  voice?: string
  model?: string
}

export type MathEngine = 'KaTeX' | 'MathJax' | 'none'

