import { RootState } from '@renderer/store'
import { addWebSearchProvider } from '@renderer/store/websearch'
import { WebSearchProvider } from '@renderer/types'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'

/**
 * WebSearchInitializer组件
 * 用于在应用启动时初始化WebSearchService
 * 确保DeepSearch和Jina在应用启动时被正确设置
 */
const WebSearchInitializer = () => {
  const dispatch = useDispatch()
  const providers = useSelector((state: RootState) => state.websearch.providers)

  useEffect(() => {
    // 检查是否已经存在DeepSearch提供商
    const hasDeepSearch = providers.some((provider) => provider.id === 'deep-search')
    // 检查是否已经存在Jina提供商
    const hasJina = providers.some((provider) => provider.id === 'jina')
    // 检查是否已经存在Bocha提供商
    const hasBocha = providers.some((provider) => provider.id === 'bocha')

    // 如果不存在，添加DeepSearch提供商
    if (!hasDeepSearch) {
      const deepSearchProvider: WebSearchProvider = {
        id: 'deep-search',
        name: 'DeepSearch',
        usingBrowser: true,
        contentLimit: 10000,
        description: '多引擎深度搜索，支持中文、国际、学术、技术、新闻和专业领域搜索引擎'
      }
      dispatch(addWebSearchProvider(deepSearchProvider))
    }

    // 如果不存在，添加Jina提供商
    if (!hasJina) {
      const jinaProvider: WebSearchProvider = {
        id: 'jina',
        name: 'Jina AI',
        apiKey: '',
        description: 'Jina AI搜索服务，支持多语言和代码搜索',
        contentLimit: 10000
      }
      dispatch(addWebSearchProvider(jinaProvider))
    }

    // 如果不存在，添加Bocha提供商
    if (!hasBocha) {
      const bochaProvider: WebSearchProvider = {
        id: 'bocha',
        name: 'Bocha',
        apiKey: '',
        apiHost: 'https://open.bochaai.com',
        description: 'Bocha AI搜索服务，支持多语言搜索'
      }
      dispatch(addWebSearchProvider(bochaProvider))
    }
  }, [dispatch, providers])

  // 这是一个初始化组件，不需要渲染任何UI
  return null
}

export default WebSearchInitializer
