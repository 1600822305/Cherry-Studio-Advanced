import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { WebSearchProvider } from '@renderer/types'
export interface SubscribeSource {
  key: number
  url: string
  name: string
  blacklist?: string[] // 存储从该订阅源获取的黑名单
}

export interface WebSearchState {
  // 默认搜索提供商的ID
  defaultProvider: string
  // 所有可用的搜索提供商列表
  providers: WebSearchProvider[]
  // 是否在搜索查询中添加当前日期
  searchWithTime: boolean
  // 搜索结果的最大数量
  maxResults: number
  // 搜索结果内容的最大长度
  contentLimit?: number
  // 要排除的域名列表
  excludeDomains: string[]
  // 订阅源列表
  subscribeSources: SubscribeSource[]
  // 是否启用搜索增强模式
  enhanceMode: boolean
  // 是否覆盖服务商搜索
  overwrite: boolean
  // 深度研究配置
  deepResearchConfig?: {
    maxIterations?: number
    maxResultsPerQuery?: number
    autoSummary?: boolean
    enableQueryOptimization?: boolean
    modelId?: string
    maxReportLinks?: number // 最终报告最大链接数
    enableLinkRelevanceFilter?: boolean // 启用链接相关性过滤
    linkRelevanceModelId?: string // 链接相关性评估模型ID
    linkRelevanceThreshold?: number // 链接相关性阈值，低于此值的链接将被过滤
  }
  // DeepSearch 配置
  deepSearchConfig?: {
    enabledEngines?: {
      // 中文搜索引擎
      baidu?: boolean
      sogou?: boolean
      '360'?: boolean
      yisou?: boolean
      toutiao?: boolean
      zhihu?: boolean

      // 国际搜索引擎
      bing?: boolean
      google?: boolean
      duckduckgo?: boolean
      brave?: boolean
      qwant?: boolean
      yahoo?: boolean

      // 元搜索引擎
      searx?: boolean
      ecosia?: boolean
      startpage?: boolean
      mojeek?: boolean
      yandex?: boolean
      presearch?: boolean

      // 学术搜索引擎
      scholar?: boolean
      semantic?: boolean
      base?: boolean
      pubmed?: boolean
      sciencedirect?: boolean
      researchgate?: boolean
      jstor?: boolean

      // 技术搜索引擎
      github?: boolean
      stackoverflow?: boolean
      devdocs?: boolean
      mdn?: boolean
      npm?: boolean
      pypi?: boolean

      // 新闻搜索引擎
      googlenews?: boolean
      reuters?: boolean
      bbc?: boolean
      xinhua?: boolean
      cctv?: boolean

      // 专业领域搜索引擎
      arxiv?: boolean
      uspto?: boolean
      wolframalpha?: boolean
      coursera?: boolean
      khan?: boolean
    }
  }
}

const initialState: WebSearchState = {
  defaultProvider: '',
  providers: [
    {
      id: 'tavily',
      name: 'Tavily',
      apiKey: ''
    },
    {
      id: 'searxng',
      name: 'Searxng',
      apiHost: ''
    },
    {
      id: 'exa',
      name: 'Exa',
      apiKey: '',
      apiHost: 'https://api.exa.ai'
    },
    {
      id: 'bocha',
      name: 'Bocha',
      apiKey: '',
      apiHost: 'https://open.bochaai.com',
      description: 'Bocha AI搜索服务，支持多语言搜索'
    },
    {
      id: 'jina',
      name: 'Jina AI',
      apiKey: '',
      description: 'Jina AI搜索服务，支持多语言和代码搜索',
      contentLimit: 10000
    },
    {
      id: 'local-google',
      name: 'Google',
      url: 'https://www.google.com/search?q=%s'
    },
    {
      id: 'local-bing',
      name: 'Bing',
      url: 'https://cn.bing.com/search?q=%s&ensearch=1'
    },
    {
      id: 'local-baidu',
      name: 'Baidu',
      url: 'https://www.baidu.com/s?wd=%s'
    },
    {
      id: 'deep-search',
      name: 'DeepSearch (多引擎)',
      description: '使用多种搜索引擎进行并行深度搜索，包括通用搜索、学术搜索、技术搜索、新闻搜索和专业领域搜索',
      contentLimit: 10000
    },
    {
      id: 'deep-research',
      name: 'DeepResearch (深度研究)',
      description: '使用多轮搜索、分析和总结进行深度研究',
      contentLimit: 30000
    }
  ],
  searchWithTime: true,
  maxResults: 100,
  contentLimit: 10000,
  excludeDomains: [],
  subscribeSources: [],
  enhanceMode: true,
  overwrite: false,
  deepResearchConfig: {
    maxIterations: 3,
    maxResultsPerQuery: 50,
    autoSummary: true,
    enableQueryOptimization: true,
    maxReportLinks: 10, // 最终报告最大链接数
    enableLinkRelevanceFilter: true, // 默认启用链接相关性过滤
    linkRelevanceThreshold: 0.6 // 默认链接相关性阈值
  },
  deepSearchConfig: {
    enabledEngines: {
      // 中文搜索引擎
      baidu: true,
      sogou: true,
      '360': false,
      yisou: false,
      toutiao: false,
      zhihu: false,

      // 国际搜索引擎
      bing: true,
      google: true,
      duckduckgo: true,
      brave: false,
      qwant: false,
      yahoo: false,

      // 元搜索引擎
      searx: true,
      ecosia: false,
      startpage: false,
      mojeek: false,
      yandex: false,
      presearch: false,

      // 学术搜索引擎
      scholar: true,
      semantic: false,
      base: false,
      pubmed: false,
      sciencedirect: false,
      researchgate: false,
      jstor: false,

      // 技术搜索引擎
      github: true,
      stackoverflow: true,
      devdocs: false,
      mdn: false,
      npm: false,
      pypi: false,

      // 新闻搜索引擎
      googlenews: false,
      reuters: false,
      bbc: false,
      xinhua: false,
      cctv: false,

      // 专业领域搜索引擎
      arxiv: false,
      uspto: false,
      wolframalpha: false,
      coursera: false,
      khan: false
    }
  }
}

export const defaultWebSearchProviders = initialState.providers

const websearchSlice = createSlice({
  name: 'websearch',
  initialState,
  reducers: {
    setDefaultProvider: (state, action: PayloadAction<string>) => {
      state.defaultProvider = action.payload
    },
    setWebSearchProviders: (state, action: PayloadAction<WebSearchProvider[]>) => {
      state.providers = action.payload
    },
    updateWebSearchProviders: (state, action: PayloadAction<WebSearchProvider[]>) => {
      state.providers = action.payload
    },
    updateWebSearchProvider: (state, action: PayloadAction<WebSearchProvider>) => {
      const index = state.providers.findIndex((provider) => provider.id === action.payload.id)
      if (index !== -1) {
        state.providers[index] = action.payload
      }
    },
    setSearchWithTime: (state, action: PayloadAction<boolean>) => {
      state.searchWithTime = action.payload
    },
    setMaxResult: (state, action: PayloadAction<number>) => {
      state.maxResults = action.payload
    },
    setExcludeDomains: (state, action: PayloadAction<string[]>) => {
      state.excludeDomains = action.payload
    },
    // 添加订阅源
    addSubscribeSource: (state, action: PayloadAction<Omit<SubscribeSource, 'key'>>) => {
      state.subscribeSources = state.subscribeSources || []
      const newKey =
        state.subscribeSources.length > 0 ? Math.max(...state.subscribeSources.map((item) => item.key)) + 1 : 0
      state.subscribeSources.push({
        key: newKey,
        url: action.payload.url,
        name: action.payload.name,
        blacklist: action.payload.blacklist
      })
    },
    // 删除订阅源
    removeSubscribeSource: (state, action: PayloadAction<number>) => {
      state.subscribeSources = state.subscribeSources.filter((source) => source.key !== action.payload)
    },
    // 更新订阅源的黑名单
    updateSubscribeBlacklist: (state, action: PayloadAction<{ key: number; blacklist: string[] }>) => {
      const source = state.subscribeSources.find((s) => s.key === action.payload.key)
      if (source) {
        source.blacklist = action.payload.blacklist
      }
    },
    // 更新订阅源列表
    setSubscribeSources: (state, action: PayloadAction<SubscribeSource[]>) => {
      state.subscribeSources = action.payload
    },
    setEnhanceMode: (state, action: PayloadAction<boolean>) => {
      state.enhanceMode = action.payload
    },
    setOverwrite: (state, action: PayloadAction<boolean>) => {
      state.overwrite = action.payload
    },
    addWebSearchProvider: (state, action: PayloadAction<WebSearchProvider>) => {
      // Check if provider with same ID already exists
      const exists = state.providers.some((provider) => provider.id === action.payload.id)

      if (!exists) {
        // Add the new provider to the array
        state.providers.push(action.payload)
      }
    },
    setDeepResearchConfig: (
      state,
      action: PayloadAction<{
        maxIterations?: number
        maxResultsPerQuery?: number
        autoSummary?: boolean
        enableQueryOptimization?: boolean
        modelId?: string
        maxReportLinks?: number // 最终报告最大链接数
        enableLinkRelevanceFilter?: boolean // 启用链接相关性过滤
        linkRelevanceModelId?: string // 链接相关性评估模型ID
        linkRelevanceThreshold?: number // 链接相关性阈值
      }>
    ) => {
      state.deepResearchConfig = {
        ...state.deepResearchConfig,
        ...action.payload
      }
    },
    setDeepSearchConfig: (
      state,
      action: PayloadAction<{
        enabledEngines?: {
          // 中文搜索引擎
          baidu?: boolean
          sogou?: boolean
          '360'?: boolean
          yisou?: boolean
          toutiao?: boolean
          zhihu?: boolean

          // 国际搜索引擎
          bing?: boolean
          google?: boolean
          duckduckgo?: boolean
          brave?: boolean
          qwant?: boolean
          yahoo?: boolean

          // 元搜索引擎
          searx?: boolean
          ecosia?: boolean
          startpage?: boolean
          mojeek?: boolean
          yandex?: boolean
          presearch?: boolean

          // 学术搜索引擎
          scholar?: boolean
          semantic?: boolean
          base?: boolean
          pubmed?: boolean
          sciencedirect?: boolean
          researchgate?: boolean
          jstor?: boolean

          // 技术搜索引擎
          github?: boolean
          stackoverflow?: boolean
          devdocs?: boolean
          mdn?: boolean
          npm?: boolean
          pypi?: boolean

          // 新闻搜索引擎
          googlenews?: boolean
          reuters?: boolean
          bbc?: boolean
          xinhua?: boolean
          cctv?: boolean

          // 专业领域搜索引擎
          arxiv?: boolean
          uspto?: boolean
          wolframalpha?: boolean
          coursera?: boolean
          khan?: boolean
        }
      }>
    ) => {
      state.deepSearchConfig = {
        ...state.deepSearchConfig,
        ...action.payload
      }
    }
  }
})

export const {
  setWebSearchProviders,
  updateWebSearchProvider,
  updateWebSearchProviders,
  setDefaultProvider,
  setSearchWithTime,
  setExcludeDomains,
  setMaxResult,
  addSubscribeSource,
  removeSubscribeSource,
  updateSubscribeBlacklist,
  setSubscribeSources,
  setEnhanceMode,
  setOverwrite,
  addWebSearchProvider,
  setDeepResearchConfig,
  setDeepSearchConfig
} = websearchSlice.actions

export default websearchSlice.reducer
