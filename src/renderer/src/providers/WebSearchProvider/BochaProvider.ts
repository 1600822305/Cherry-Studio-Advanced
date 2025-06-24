import { WebSearchState } from '@renderer/store/websearch'
import { WebSearchProvider, WebSearchResponse } from '@renderer/types'
import { BochaSearchParams, BochaSearchResponse } from '@renderer/types/bocha'

// 定义WebSearchProviderResponse别名与WebSearchResponse保持一致
type WebSearchProviderResponse = WebSearchResponse

import BaseWebSearchProvider from './BaseWebSearchProvider'

export default class BochaProvider extends BaseWebSearchProvider {
  constructor(provider: WebSearchProvider) {
    super(provider)
    if (!this.apiKey) {
      throw new Error('API key is required for Bocha provider')
    }
    if (!this.apiHost) {
      throw new Error('API host is required for Bocha provider')
    }
  }

  public async search(query: string, websearch: WebSearchState): Promise<WebSearchProviderResponse> {
    try {
      if (!query.trim()) {
        throw new Error('Search query cannot be empty')
      }

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      }

      const contentLimit = websearch.contentLimit

      const params: BochaSearchParams = {
        query,
        count: websearch.maxResults,
        exclude: websearch.excludeDomains.join(','),
        freshness: websearch.searchWithTime ? 'oneDay' : 'noLimit',
        summary: false,
        page: contentLimit ? Math.ceil(contentLimit / websearch.maxResults) : 1
      }

      // 添加超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

      try {
        const response = await fetch(`${this.apiHost}/v1/web-search`, {
          method: 'POST',
          body: JSON.stringify(params),
          headers: {
            ...this.defaultHeaders(),
            ...headers
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Bocha search failed: ${response.status} ${response.statusText}`)
        }

        const resp: BochaSearchResponse = await response.json()
        if (resp.code !== 200) {
          throw new Error(`Bocha search failed: ${resp.msg}`)
        }

        // 检查响应数据结构
        if (!resp.data || !resp.data.webPages || !Array.isArray(resp.data.webPages.value)) {
          throw new Error('Invalid response format from Bocha API')
        }

        return {
          query: resp.data.queryContext?.originalQuery || query,
          results: resp.data.webPages.value.map((result) => ({
            title: result.name || 'Untitled',
            content: result.snippet || '',
            url: result.url || ''
          }))
        }
      } catch (error) {
        clearTimeout(timeoutId);
        const fetchError = error as { name?: string };
        if (fetchError.name === 'AbortError') {
          throw new Error('Connection to Bocha API timed out. Please check your network or try again later.')
        }
        throw error;
      }
    } catch (error) {
      console.error('Bocha search failed:', error)
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
