import store, { useAppDispatch, useAppSelector } from '@renderer/store'
import { addProvider, removeProvider } from '@renderer/store/llm'
import { Provider } from '@renderer/types'
import {
  checkModelCombinationsInLocalStorage,
  createAllDeepClaudeProviders
} from '@renderer/utils/createDeepClaudeProvider'
import { useCallback, useEffect } from 'react'

/**
 * DeepClaudeProvider组件
 * 用于在应用启动时加载DeepClaude提供商
 */
const DeepClaudeProvider = () => {
  const dispatch = useAppDispatch()
  const providers = useAppSelector((state) => state.llm.providers)

  // 加载DeepClaude提供商
  const loadDeepClaudeProviders = useCallback(() => {
    console.log('[DeepClaudeProvider] 开始加载DeepClaude提供商')

    // 检查localStorage中的模型组合数据
    checkModelCombinationsInLocalStorage()

    // 移除所有现有的DeepClaude提供商
    const existingDeepClaudeProviders = providers.filter((p) => p.type === 'deepclaude')
    console.log('[DeepClaudeProvider] 移除现有DeepClaude提供商数量:', existingDeepClaudeProviders.length)
    existingDeepClaudeProviders.forEach((provider) => {
      dispatch(removeProvider(provider))
    })

    // 创建并添加新的DeepClaude提供商
    const deepClaudeProviders = createAllDeepClaudeProviders()
    console.log('[DeepClaudeProvider] 创建的DeepClaude提供商数量:', deepClaudeProviders.length)

    // 列出所有提供商，便于调试
    console.log(
      '[DeepClaudeProvider] 当前所有提供商:',
      providers.map((p) => ({ id: p.id, name: p.name, type: p.type }))
    )

    // 添加DeepClaude提供商
    deepClaudeProviders.forEach((provider) => {
      console.log(
        '[DeepClaudeProvider] 添加DeepClaude提供商:',
        provider.id,
        provider.name,
        provider.type,
        provider.models.length > 0 ? `包含${provider.models.length}个模型` : '无模型'
      )
      dispatch(addProvider(provider))
    })

    // 再次列出所有提供商，确认添加成功
    setTimeout(() => {
      const currentProviders = store.getState().llm.providers
      console.log(
        '[DeepClaudeProvider] 添加后的所有提供商:',
        currentProviders.map((p: Provider) => ({ id: p.id, name: p.name, type: p.type }))
      )
      console.log('[DeepClaudeProvider] DeepClaude提供商加载完成')
    }, 100)
  }, [dispatch, providers])

  // 监听localStorage中的modelCombinations变化
  useEffect(() => {
    // 初始化时加载DeepClaude提供商
    loadDeepClaudeProviders()

    // 监听localStorage变化
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'modelCombinations') {
        loadDeepClaudeProviders()
      }
    }

    // 添加事件监听器
    window.addEventListener('storage', handleStorageChange)

    // 清理函数
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [loadDeepClaudeProviders])

  // 这是一个纯逻辑组件，不需要渲染任何内容
  return null
}

export default DeepClaudeProvider
