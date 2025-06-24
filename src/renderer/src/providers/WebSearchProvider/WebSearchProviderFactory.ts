import { WebSearchProvider } from '@renderer/types'

import BaseWebSearchProvider from './BaseWebSearchProvider'
import BochaProvider from './BochaProvider'
import DeepResearchProvider from './DeepResearchProvider'
import DeepSearchProvider from './DeepSearchProvider'
import DefaultProvider from './DefaultProvider'
import ExaProvider from './ExaProvider'
import JinaSearchProvider from './JinaSearchProvider'
import LocalBaiduProvider from './LocalBaiduProvider'
import LocalBingProvider from './LocalBingProvider'
import LocalGoogleProvider from './LocalGoogleProvider'
import SearxngProvider from './SearxngProvider'
import TavilyProvider from './TavilyProvider'

export default class WebSearchProviderFactory {
  static create(provider: WebSearchProvider): BaseWebSearchProvider {
    switch (provider.id) {
      case 'tavily':
        return new TavilyProvider(provider)
      case 'bocha':
        return new BochaProvider(provider)
      case 'searxng':
        return new SearxngProvider(provider)
      case 'exa':
        return new ExaProvider(provider)
      case 'jina':
        return new JinaSearchProvider(provider)
      case 'local-google':
        return new LocalGoogleProvider(provider)
      case 'local-baidu':
        return new LocalBaiduProvider(provider)
      case 'local-bing':
        return new LocalBingProvider(provider)
      case 'deep-search':
        return new DeepSearchProvider(provider)
      case 'deep-research':
        return new DeepResearchProvider(provider)
      default:
        return new DefaultProvider(provider)
    }
  }
}
