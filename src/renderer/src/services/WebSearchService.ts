import WebSearchEngineProvider from '@renderer/providers/WebSearchProvider'
import store from '@renderer/store'
import { addWebSearchProvider, setDefaultProvider, WebSearchState } from '@renderer/store/websearch'
import { WebSearchProvider, WebSearchResponse } from '@renderer/types'
import { hasObjectKey } from '@renderer/utils'
import dayjs from 'dayjs'

/**
 * 提供网络搜索相关功能的服务类
 */
class WebSearchService {
  private initialized = false

  /**
   * 确保必要的搜索供应商存在于列表中
   * @private
   */
  private ensureDeepSearchProvider(): void {
    if (this.initialized) return

    try {
      const state = store.getState()
      if (!state || !state.websearch) return

      const { providers } = state.websearch
      if (!providers) return

      const deepSearchExists = providers.some((provider) => provider.id === 'deep-search')
      const bochaExists = providers.some((provider) => provider.id === 'bocha')

      if (!deepSearchExists) {
        console.log('[WebSearchService] 添加DeepSearch供应商到列表')
        store.dispatch(
          addWebSearchProvider({
            id: 'deep-search',
            name: 'DeepSearch (多引擎)',
            description: '使用Baidu、Bing、DuckDuckGo、搜狗和SearX进行深度搜索',
            contentLimit: 10000
          })
        )
      }

      if (!bochaExists) {
        console.log('[WebSearchService] 添加Bocha供应商到列表')
        store.dispatch(
          addWebSearchProvider({
            id: 'bocha',
            name: 'Bocha',
            apiKey: '',
            apiHost: 'https://open.bochaai.com',
            description: 'Bocha AI搜索服务，支持多语言搜索'
          })
        )
      }

      this.initialized = true
    } catch (error) {
      console.error('[WebSearchService] 初始化搜索供应商失败:', error)
    }
  }

  /**
   * 获取当前存储的网络搜索状态
   * @private
   * @returns 网络搜索状态
   */
  private getWebSearchState(): WebSearchState {
    // 确保DeepSearch供应商存在
    this.ensureDeepSearchProvider()
    return store.getState().websearch
  }

  /**
   * 检查网络搜索功能是否启用
   * @public
   * @returns 如果默认搜索提供商已启用则返回true，否则返回false
   */
  public isWebSearchEnabled(): boolean {
    const { defaultProvider, providers } = this.getWebSearchState()
    const provider = providers.find((provider) => provider.id === defaultProvider)

    if (!provider) {
      return false
    }

    // DeepSearch和本地搜索引擎总是可用的
    // Bocha搜索引擎需要验证apiKey和apiHost
    if (provider.id === 'deep-search' || provider.id.startsWith('local-')) {
      return true
    }

    if (hasObjectKey(provider, 'apiKey')) {
      return provider.apiKey !== ''
    }

    if (hasObjectKey(provider, 'apiHost')) {
      return provider.apiHost !== ''
    }

    return false
  }

  /**
   * 检查是否启用搜索增强模式
   * @public
   * @returns 如果启用搜索增强模式则返回true，否则返回false
   */
  public isEnhanceModeEnabled(): boolean {
    const { enhanceMode } = this.getWebSearchState()
    return enhanceMode
  }

  /**
   * 检查是否启用覆盖搜索
   * @public
   * @returns 如果启用覆盖搜索则返回true，否则返回false
   */
  public isOverwriteEnabled(): boolean {
    const { overwrite } = this.getWebSearchState()
    return overwrite
  }

  /**
   * 获取当前默认的网络搜索提供商
   * @public
   * @returns 网络搜索提供商
   * @throws 如果找不到默认提供商则抛出错误
   */
  public getWebSearchProvider(): WebSearchProvider {
    const { defaultProvider, providers } = this.getWebSearchState()
    let provider = providers.find((provider) => provider.id === defaultProvider)

    if (!provider) {
      provider = providers[0]
      if (provider) {
        // 可选：自动更新默认提供商
        store.dispatch(setDefaultProvider(provider.id))
      } else {
        throw new Error(`No web search providers available`)
      }
    }

    return provider
  }

  /**
   * 使用指定的提供商执行网络搜索
   * @public
   * @param provider 搜索提供商
   * @param query 搜索查询
   * @returns 搜索响应
   */
  public async search(provider: WebSearchProvider, query: string): Promise<WebSearchResponse> {
    const websearch = this.getWebSearchState()
    const webSearchEngine = new WebSearchEngineProvider(provider)

    let formattedQuery = query
    // 有待商榷，效果一般
    if (websearch.searchWithTime) {
      formattedQuery = `today is ${dayjs().format('YYYY-MM-DD')} \r\n ${query}`
    }

    try {
      return await webSearchEngine.search(formattedQuery, websearch)
    } catch (error) {
      console.error('Search failed:', error)
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * 检查搜索提供商是否正常工作
   * @public
   * @param provider 要检查的搜索提供商
   * @returns 如果提供商可用返回true，否则返回false
   */
  public async checkSearch(provider: WebSearchProvider): Promise<{ valid: boolean; error?: any }> {
    try {
      const response = await this.search(provider, 'test query')
      console.log('Search response:', response)
      // 优化的判断条件：检查结果是否有效且没有错误
      return { valid: response.results !== undefined, error: undefined }
    } catch (error) {
      return { valid: false, error }
    }
  }

  /**
   * 从带有XML标签的文本中提取信息
   * @public
   * @param text 包含XML标签的文本
   * @returns 提取的信息对象
   * @throws 如果文本中没有question标签则抛出错误
   */
  public extractInfoFromXML(text: string): { question: string; links?: string[] } {
    // 提取工具标签内容
    let questionText = text

    // 先检查是否有工具标签
    const websearchMatch = text.match(/<websearch>([\s\S]*?)<\/websearch>/)
    const knowledgeMatch = text.match(/<knowledge>([\s\S]*?)<\/knowledge>/)

    // 如果有工具标签，使用工具标签内的内容
    if (websearchMatch) {
      questionText = websearchMatch[1]
    } else if (knowledgeMatch) {
      questionText = knowledgeMatch[1]
    }

    // 提取question标签内容
    const questionMatch =
      questionText.match(/<question>([\s\S]*?)<\/question>/) || text.match(/<question>([\s\S]*?)<\/question>/)
    if (!questionMatch) {
      throw new Error('Missing required <question> tag')
    }
    const question = questionMatch[1].trim()

    // 提取links标签内容（可选）
    const linksMatch = text.match(/<links>([\s\S]*?)<\/links>/)
    const links = linksMatch
      ? linksMatch[1]
          .trim()
          .split('\n')
          .map((link) => link.trim())
          .filter((link) => link !== '')
      : undefined

    return {
      question,
      links
    }
  }
}

export default new WebSearchService()
