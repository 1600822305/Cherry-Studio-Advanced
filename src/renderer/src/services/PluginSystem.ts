/**
 * 插件系统核心服务
 * 负责插件的注册、加载、激活、卸载等生命周期管理
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
// 导入插件
import allPlugins from '@renderer/plugins'
import { useModuleRegistry } from '@renderer/services/ModuleRegistryManager'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { clearPlugins } from '@renderer/store/slices/pluginSystemSlice'
import { ExtensionPointRegistry, Plugin, PluginAPI, PluginMeta } from '@renderer/types/plugin'
import { message } from 'antd'
import { ReactNode, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

// 声明window上的全局变量
declare global {
  interface Window {
    pluginsToActivate?: string[]
  }
}

// 存储键名
const STORAGE_KEY = 'plugins'

// 默认扩展点
const DEFAULT_EXTENSION_POINTS: ExtensionPointRegistry = {
  sidebar: {
    id: 'sidebar',
    name: '侧边栏',
    description: '侧边栏图标区域',
    extensions: []
  },
  settings: {
    id: 'settings',
    name: '设置页面',
    description: '设置页面',
    extensions: []
  },
  'editor.toolbar': {
    id: 'editor.toolbar',
    name: '编辑器工具栏',
    description: '编辑器工具栏',
    extensions: []
  },
  'main.header': {
    id: 'main.header',
    name: '主界面顶部',
    description: '主界面顶部区域',
    extensions: []
  }
}

// 插件系统状态
export interface PluginSystemState {
  plugins: Plugin[]
  extensionPoints: ExtensionPointRegistry
  isInitialized: boolean
  isLoading: boolean
  error: string | null
}

// 初始状态
const initialState: PluginSystemState = {
  plugins: [],
  extensionPoints: DEFAULT_EXTENSION_POINTS,
  isInitialized: false,
  isLoading: false,
  error: null
}

// 创建 Redux 切片
const pluginSystemSlice = createSlice({
  name: 'pluginSystem',
  initialState,
  reducers: {
    setPlugins: (state, action: PayloadAction<Plugin[]>) => {
      state.plugins = action.payload
    },
    addPlugin: (state, action: PayloadAction<Plugin>) => {
      state.plugins.push(action.payload)
    },
    updatePlugin: (state, action: PayloadAction<Plugin>) => {
      const index = state.plugins.findIndex((p) => p.id === action.payload.id)
      if (index !== -1) {
        state.plugins[index] = action.payload
      }
    },
    removePlugin: (state, action: PayloadAction<string>) => {
      state.plugins = state.plugins.filter((p) => p.id !== action.payload)
    },
    setPluginState: (state, action: PayloadAction<{ id: string; stateUpdates: Partial<Plugin['state']> }>) => {
      const { id, stateUpdates } = action.payload
      const plugin = state.plugins.find((p) => p.id === id)
      if (plugin) {
        plugin.state = { ...plugin.state, ...stateUpdates }
      }
    },
    registerExtension: (
      state,
      action: PayloadAction<{ point: string; pluginId: string; component: ReactNode; priority?: number }>
    ) => {
      const { point, pluginId, component, priority = 0 } = action.payload

      // 如果扩展点不存在，创建它
      if (!state.extensionPoints[point]) {
        state.extensionPoints[point] = {
          id: point,
          name: `扩展点 ${point}`,
          description: `扩展点 ${point}`,
          extensions: []
        }
      }

      // 添加扩展
      if (state.extensionPoints[point]?.extensions) {
        state.extensionPoints[point].extensions.push({
          pluginId,
          component,
          priority
        })

        // 按优先级排序
        if (state.extensionPoints[point]?.extensions) {
          state.extensionPoints[point].extensions.sort((a, b) => b.priority - a.priority)
        }
      }
    },
    removeExtension: (state, action: PayloadAction<{ point: string; pluginId: string }>) => {
      const { point, pluginId } = action.payload
      if (state.extensionPoints[point] && state.extensionPoints[point]?.extensions) {
        state.extensionPoints[point].extensions = state.extensionPoints[point].extensions.filter(
          (ext) => ext.pluginId !== pluginId
        )
      }
    },
    setInitialized: (state, action: PayloadAction<boolean>) => {
      state.isInitialized = action.payload
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    }
  }
})

// 导出 actions
export const {
  setPlugins,
  addPlugin,
  updatePlugin,
  removePlugin,
  setPluginState,
  registerExtension,
  removeExtension,
  setInitialized,
  setLoading,
  setError
} = pluginSystemSlice.actions

// 导出 reducer
export const pluginSystemReducer = pluginSystemSlice.reducer

// 创建 Hook 用于访问插件系统
export const usePluginSystem = () => {
  const dispatch = useAppDispatch()
  const plugins = useAppSelector((state) => state.pluginSystem?.plugins || [])
  const extensionPoints = useAppSelector((state) => state.pluginSystem?.extensionPoints || DEFAULT_EXTENSION_POINTS)
  const isInitialized = useAppSelector((state) => state.pluginSystem?.isInitialized || false)
  const isLoading = useAppSelector((state) => state.pluginSystem?.isLoading || false)
  const error = useAppSelector((state) => state.pluginSystem?.error || null)

  const { t } = useTranslation()
  const navigate = useNavigate()
  const [messageApi, setMessageApi] = useState<any>(null)
  const { installModule, activateModule } = useModuleRegistry()

  // 初始化消息API
  useEffect(() => {
    // 这里仅创建函数引用，不在组件中实际渲染message组件
    // 实际使用时，还需要在应用根组件调用message.useMessage()并传入
    setMessageApi(message)
  }, [])

  // 注册插件
  const registerPlugin = useCallback(
    async (pluginMeta: PluginMeta): Promise<boolean> => {
      try {
        // 检查是否已存在同ID插件
        const existingPlugin = plugins.find((p) => p.id === pluginMeta.id)
        if (existingPlugin) {
          console.warn(`Plugin ${pluginMeta.id} already registered`)
          return true // 返回true而不是false，因为插件已经存在
        }

        // 创建新插件对象
        const newPlugin: Plugin = {
          ...pluginMeta,
          state: {
            isInstalled: false,
            isActive: false,
            isLoaded: false,
            hasError: false
          }
        }

        // 添加到插件列表
        dispatch(addPlugin(newPlugin))
        return true
      } catch (error) {
        console.error(`Failed to register plugin ${pluginMeta.id}:`, error)
        return false
      }
    },
    [dispatch, plugins]
  )

  // 创建插件API
  const createPluginAPI = useCallback(
    (pluginId: string): PluginAPI => {
      return {
        registerExtension: (extension) => {
          const id = `${pluginId}.${extension.extensionPointId}.${Date.now()}`
          dispatch(
            registerExtension({
              point: extension.extensionPointId,
              pluginId,
              component: (extension.component as ReactNode) || (extension.render as ReactNode),
              priority: extension.priority || 0
            })
          )
          return id
        },
        getSettings: (pluginId) => {
          const settingsJson = localStorage.getItem(`plugin_settings_${pluginId}`)
          return settingsJson ? JSON.parse(settingsJson) : {}
        },
        saveSettings: (pluginId, settings) => {
          localStorage.setItem(`plugin_settings_${pluginId}`, JSON.stringify(settings))
        },
        translate: t,
        navigate,
        notify: (message, type = 'info') => {
          if (messageApi) {
            messageApi[type](message)
          }
        },
        // 下面是新增的必要方法
        getExtensionPoint: (id) => extensionPoints[id],
        getExtensionPoints: () => extensionPoints,
        getPlugin: (id) => plugins.find((p) => p.id === id),
        getPlugins: () => plugins.reduce((acc, plugin) => ({ ...acc, [plugin.id]: plugin }), {}),
        getCurrentPlugin: () => plugins.find((p) => p.id === pluginId) as Plugin,
        getConfig: () => {
          const plugin = plugins.find((p) => p.id === pluginId)
          return (plugin?.config || {}) as any
        },
        updateConfig: (config) => {
          const plugin = plugins.find((p) => p.id === pluginId)
          if (plugin) {
            plugin.config = { ...plugin.config, ...config }
            dispatch(updatePlugin({ ...plugin }))
          }
        },
        unregisterExtension: (extensionPointId) => {
          dispatch(removeExtension({ point: extensionPointId, pluginId }))
        },
        getAppAPI: () => ({}),
        registerFunction: () => {},
        registerMenuItem: () => {},
        registerSettingsPanel: () => {},
        getPluginPath: () => '',
        i18n: {
          t,
          changeLanguage: () => {},
          getCurrentLanguage: () => 'zh-CN'
        }
      }
    },
    [dispatch, t, navigate, messageApi, extensionPoints, plugins]
  )

  // 安装插件
  const installPlugin = useCallback(
    async (pluginId: string): Promise<boolean> => {
      try {
        dispatch(setLoading(true))

        // 查找插件
        let plugin = plugins.find((p) => p.id === pluginId)

        // 如果没有找到插件但是是已知的内置插件，尝试先注册它
        if (!plugin) {
          console.log(`插件 ${pluginId} 未找到，尝试自动注册...`)

          // 尝试从统一注册的插件中查找
          const registeredPlugin = allPlugins.find((p) => p.id === pluginId)

          if (registeredPlugin) {
            console.log(`从统一注册的插件中找到 ${pluginId}`)
            // 创建插件元数据
            const pluginMeta: PluginMeta = {
              id: registeredPlugin.id,
              name: registeredPlugin.name,
              description: registeredPlugin.description,
              version: registeredPlugin.version,
              author: registeredPlugin.author,
              icon: registeredPlugin.icon,
              requiredModules: registeredPlugin.requiredModules || []
            }
            await registerPlugin(pluginMeta)
          } else if (['simple-calendar', 'markdown-editor', 'code-analyzer'].includes(pluginId)) {
            // 旧的硬编码逻辑，作为备用
            if (pluginId === 'simple-calendar') {
              await registerPlugin({
                id: 'simple-calendar',
                name: '简易日历',
                description: '提供简单的日历视图与日程管理功能',
                version: '1.0.0',
                author: 'Cherry Ludi',
                icon: '📅',
                requiredModules: ['dayjs']
              })
            } else if (pluginId === 'markdown-editor') {
              await registerPlugin({
                id: 'markdown-editor',
                name: '高级Markdown编辑器',
                description: '提供语法高亮、预览和导出功能的Markdown编辑器',
                version: '1.0.0',
                author: 'Cherry Ludi',
                icon: '📝',
                requiredModules: ['npm']
              })
            } else if (pluginId === 'code-analyzer') {
              await registerPlugin({
                id: 'code-analyzer',
                name: '代码分析工具',
                description: '分析代码质量并提供改进建议',
                version: '1.0.0',
                author: 'Cherry Ludi',
                icon: '🔍',
                requiredModules: ['vue-codemirror-multi']
              })
            }
          } else {
            // 对于自定义插件ID，尝试创建一个默认插件
            const customPlugin: PluginMeta = {
              id: pluginId,
              name: `插件 ${pluginId}`,
              description: '自动创建的插件',
              version: '1.0.0',
              author: '系统',
              icon: '🧩',
              requiredModules: []
            }

            const registered = await registerPlugin(customPlugin)
            if (registered) {
              console.log(`已自动创建插件 ${pluginId}`)

              // 延迟一下，确保状态更新
              await new Promise((resolve) => setTimeout(resolve, 10))

              // 重新获取插件
              plugin = plugins.find((p) => p.id === pluginId)

              if (!plugin) {
                console.log(`注册成功但插件对象未找到，使用自定义插件对象继续`)
                // 如果还是找不到，创建一个临时对象用于安装
                plugin = {
                  ...customPlugin,
                  state: {
                    isInstalled: false,
                    isActive: false,
                    isLoaded: false,
                    hasError: false
                  }
                }
              }
            }
          }

          // 延迟一下，确保状态更新
          await new Promise((resolve) => setTimeout(resolve, 10))

          // 重新获取插件
          plugin = plugins.find((p) => p.id === pluginId)

          // 如果仍然没有找到插件
          if (!plugin) {
            console.error(`找不到插件 ${pluginId}，无法安装`)
            return false
          }
        }

        // 安装所需模块
        for (const moduleId of plugin.requiredModules || []) {
          const success = await installModule(moduleId)
          if (!success) {
            console.error(`Failed to install required module ${moduleId} for plugin ${pluginId}`)
            dispatch(
              setPluginState({
                id: pluginId,
                stateUpdates: {
                  hasError: true,
                  errorMessage: `无法安装所需模块: ${moduleId}`
                }
              })
            )
            return false
          }
        }

        // 执行插件的onInstall钩子
        if (plugin.onInstall) {
          const success = await plugin.onInstall()
          if (!success) {
            console.error(`Plugin ${pluginId} installation hook failed`)
            dispatch(
              setPluginState({
                id: pluginId,
                stateUpdates: {
                  hasError: true,
                  errorMessage: '插件安装钩子执行失败'
                }
              })
            )
            return false
          }
        }

        // 更新插件状态
        dispatch(
          setPluginState({
            id: pluginId,
            stateUpdates: {
              isInstalled: true,
              hasError: false,
              errorMessage: undefined
            }
          })
        )

        return true
      } catch (error) {
        console.error(`Failed to install plugin ${pluginId}:`, error)
        dispatch(
          setPluginState({
            id: pluginId,
            stateUpdates: {
              hasError: true,
              errorMessage: `安装失败: ${error}`
            }
          })
        )
        return false
      } finally {
        dispatch(setLoading(false))
      }
    },
    [dispatch, plugins, installModule, registerPlugin]
  )

  // 激活插件
  const activatePlugin = useCallback(
    async (pluginId: string): Promise<boolean> => {
      try {
        dispatch(setLoading(true))

        console.log(`尝试激活插件: ${pluginId}`)

        // 查找插件
        let plugin = plugins.find((p) => p.id === pluginId)

        // 如果找不到插件，尝试安装后再激活
        if (!plugin) {
          console.warn(`找不到插件 ${pluginId}，尝试先安装`)
          const installed = await installPlugin(pluginId)
          if (!installed) {
            console.error(`无法安装插件 ${pluginId}`)
            return false
          }

          // 延迟一下，确保状态更新
          await new Promise((resolve) => setTimeout(resolve, 10))

          // 重新获取插件
          plugin = plugins.find((p) => p.id === pluginId)
          if (!plugin) {
            console.error(`插件 ${pluginId} 安装后仍未找到`)

            // 尝试创建临时插件对象用于激活
            plugin = {
              id: pluginId,
              name: `插件 ${pluginId}`,
              description: '自动创建的插件',
              version: '1.0.0',
              author: '系统',
              icon: '🧩',
              requiredModules: [],
              state: {
                isInstalled: true,
                isActive: false,
                isLoaded: false,
                hasError: false
              }
            }

            if (!plugin) {
              return false
            }
          }
        }

        if (!plugin.state.isInstalled) {
          console.log(`插件 ${pluginId} 未安装，先进行安装`)
          const installed = await installPlugin(pluginId)
          if (!installed) {
            console.error(`无法安装插件 ${pluginId}`)
            return false
          }
        }

        // 激活所需模块
        for (const moduleId of plugin.requiredModules || []) {
          const success = await activateModule(moduleId)
          if (!success) {
            console.error(`无法激活插件 ${pluginId} 所需的模块: ${moduleId}`)
            dispatch(
              setPluginState({
                id: pluginId,
                stateUpdates: {
                  hasError: true,
                  errorMessage: `无法激活所需模块: ${moduleId}`
                }
              })
            )
            return false
          }
        }

        // 创建插件API实例
        const api = createPluginAPI(pluginId)

        // 将API对象设置到插件的api属性上，供onActivate方法内部使用
        if (plugin) {
          // 不要将API对象存储在Redux状态中
          // 以下代码会导致非序列化值存储在Redux中
          // const updatedPlugin = { ...plugin, api }
          // dispatch(updatePlugin(updatedPlugin))

          // 不重新获取插件对象，而是使用本地变量
          const pluginWithApi = { ...plugin, api }

          // 执行插件的onActivate钩子
          if (pluginWithApi.onActivate) {
            try {
              // 调用onActivate方法，使用临时的带有API的插件对象
              const success = await pluginWithApi.onActivate()
              if (!success) {
                console.error(`插件 ${pluginId} 激活钩子执行失败`)
                dispatch(
                  setPluginState({
                    id: pluginId,
                    stateUpdates: {
                      hasError: true,
                      errorMessage: '插件激活钩子执行失败'
                    }
                  })
                )
                return false
              }
            } catch (error) {
              console.error(`插件 ${pluginId} 激活钩子执行出错:`, error)
              dispatch(
                setPluginState({
                  id: pluginId,
                  stateUpdates: {
                    hasError: true,
                    errorMessage: `激活钩子执行出错: ${error}`
                  }
                })
              )
              return false
            }
          }

          // 注册插件的UI扩展
          if (pluginWithApi.registerExtensions) {
            Object.entries(pluginWithApi.registerExtensions).forEach(([point, extension]) => {
              dispatch(
                registerExtension({
                  point,
                  pluginId,
                  component: extension.component,
                  priority: extension.priority
                })
              )
            })
          }

          // 更新插件状态 - 只更新状态相关字段，不包含API
          dispatch(
            setPluginState({
              id: pluginId,
              stateUpdates: {
                isActive: true,
                isLoaded: true,
                hasError: false,
                errorMessage: undefined
              }
            })
          )

          // 额外更新activatedPlugins列表，用于备份激活状态
          try {
            const activatedPluginsJson = localStorage.getItem('activatedPlugins') || '[]'
            let activatedPlugins = JSON.parse(activatedPluginsJson)

            // 确保activatedPlugins是数组
            if (!Array.isArray(activatedPlugins)) {
              activatedPlugins = []
            }

            // 检查并去重
            const uniquePluginIds = [...new Set(activatedPlugins)]

            // 如果发现重复，更新列表
            if (uniquePluginIds.length !== activatedPlugins.length) {
              console.log(`检测到重复的激活插件ID，从 ${activatedPlugins.length} 个减少到 ${uniquePluginIds.length} 个`)
              activatedPlugins = uniquePluginIds
            }

            // 添加当前插件ID（如果不存在）
            if (!activatedPlugins.includes(pluginId)) {
              activatedPlugins.push(pluginId)
              console.log(`已将插件 ${pluginId} 添加到activatedPlugins列表`)
            }

            // 保存更新后的列表
            localStorage.setItem('activatedPlugins', JSON.stringify(activatedPlugins))
          } catch (e) {
            console.error('更新activatedPlugins失败:', e)
          }

          console.log(`插件 ${pluginId} 激活成功`)
          return true
        }

        console.error(`插件 ${pluginId} 找不到，无法激活`)
        return false
      } catch (error) {
        console.error(`插件 ${pluginId} 激活失败:`, error)
        dispatch(
          setPluginState({
            id: pluginId,
            stateUpdates: {
              hasError: true,
              errorMessage: `激活失败: ${error}`
            }
          })
        )
        return false
      } finally {
        dispatch(setLoading(false))
      }
    },
    [dispatch, plugins, installPlugin, createPluginAPI, activateModule]
  )

  // 初始化插件系统 - 确保在activatePlugin之后定义
  const initializePluginSystem = useCallback(async () => {
    try {
      if (isInitialized) return

      dispatch(setLoading(true))
      console.log('初始化插件系统...')

      // 初始化扩展点
      for (const [, extensionPoint] of Object.entries(DEFAULT_EXTENSION_POINTS)) {
        // 创建适合registerExtension的参数
        dispatch(
          registerExtension({
            point: extensionPoint.id,
            pluginId: 'system',
            component: null
          })
        )
      }

      // 加载插件黑名单
      const blacklistJson = localStorage.getItem('plugin_blacklist') || '[]'
      let blacklist: string[] = []
      try {
        const parsed = JSON.parse(blacklistJson)
        blacklist = Array.isArray(parsed) ? parsed : []
        console.log('插件黑名单:', blacklist)
      } catch (e) {
        console.error('解析插件黑名单失败:', e)
      }

      // 清除可能存在的重复插件数据
      const storedPluginsJson = localStorage.getItem(STORAGE_KEY)
      if (storedPluginsJson) {
        try {
          let storedPlugins = JSON.parse(storedPluginsJson)
          console.log('从存储加载的插件 (原始):', storedPlugins)

          // 检查并移除重复的插件和黑名单中的插件
          const uniquePlugins: any[] = []
          const pluginIds = new Set<string>()

          for (const plugin of storedPlugins) {
            if (plugin && plugin.id && !pluginIds.has(plugin.id)) {
              // 跳过黑名单中的插件
              if (blacklist.includes(plugin.id)) {
                console.log(`跳过黑名单中的插件: ${plugin.id}`)
                continue
              }

              pluginIds.add(plugin.id)
              uniquePlugins.push(plugin)
            }
          }

          // 如果发现重复或黑名单插件，更新存储
          if (uniquePlugins.length !== storedPlugins.length) {
            console.log(`检测到重复或黑名单插件，从 ${storedPlugins.length} 个减少到 ${uniquePlugins.length} 个`)
            localStorage.setItem(STORAGE_KEY, JSON.stringify(uniquePlugins))
            storedPlugins = uniquePlugins
          }

          console.log('从存储加载的插件 (去重和过滤后):', storedPlugins)

          // 注册存储的插件
          for (const plugin of storedPlugins) {
            await registerPlugin(plugin)
          }
        } catch (e) {
          console.error('解析存储的插件失败:', e)
          dispatch(setError('解析存储的插件失败'))
        }
      }

      // 预注册所有统一注册的插件
      for (const plugin of allPlugins) {
        // 检查插件是否已经注册，以及是否在黑名单中
        const existingPlugin = plugins.find((p) => p.id === plugin.id)
        if (!existingPlugin && !blacklist.includes(plugin.id)) {
          console.log(`预注册统一管理的插件: ${plugin.id}`)
          const pluginMeta: PluginMeta = {
            id: plugin.id,
            name: plugin.name,
            description: plugin.description,
            version: plugin.version,
            author: plugin.author,
            icon: plugin.icon,
            requiredModules: plugin.requiredModules || []
          }
          await registerPlugin(pluginMeta)
        } else if (blacklist.includes(plugin.id)) {
          console.log(`跳过黑名单中的插件: ${plugin.id}`)
        }
      }

      // 从localStorage获取已激活的插件列表
      try {
        const activatedPluginsJson = localStorage.getItem('activatedPlugins')
        if (activatedPluginsJson) {
          let activatedPlugins = JSON.parse(activatedPluginsJson)
          console.log('找到已激活的插件 (原始):', activatedPlugins)

          // 确保activatedPlugins是字符串数组
          if (!Array.isArray(activatedPlugins)) {
            activatedPlugins = []
          }

          // 检查并移除重复的插件ID
          const uniquePluginIds = [...new Set(activatedPlugins)]

          // 过滤掉黑名单中的插件ID
          const filteredPluginIds = uniquePluginIds.filter((id) => typeof id === 'string' && !blacklist.includes(id))

          // 如果发现重复或黑名单插件，更新存储
          if (filteredPluginIds.length !== activatedPlugins.length) {
            console.log(
              `检测到重复或黑名单的激活插件ID，从 ${activatedPlugins.length} 个减少到 ${filteredPluginIds.length} 个`
            )
            localStorage.setItem('activatedPlugins', JSON.stringify(filteredPluginIds))
            activatedPlugins = filteredPluginIds
          }

          console.log('找到已激活的插件 (去重和过滤后):', activatedPlugins)

          // 激活已激活的插件
          for (const pluginId of activatedPlugins) {
            await activatePlugin(pluginId)
          }
        }
      } catch (e) {
        console.error('解析已激活插件失败:', e)
      }

      // 设置初始化完成
      dispatch(setInitialized(true))
      console.log('插件系统初始化完成!')
    } catch (error) {
      console.error('初始化插件系统失败:', error)
      dispatch(setError(`初始化失败: ${error}`))
    } finally {
      dispatch(setLoading(false))
    }
  }, [isInitialized, dispatch, plugins, registerPlugin, activatePlugin])

  // 保存插件到localStorage
  const savePluginsToStorage = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plugins))
  }, [plugins])

  // 当插件列表变化时保存到localStorage
  useEffect(() => {
    if (isInitialized) {
      savePluginsToStorage()
    }
  }, [plugins, isInitialized, savePluginsToStorage])

  // 停用插件
  const deactivatePlugin = useCallback(
    async (pluginId: string): Promise<boolean> => {
      try {
        const plugin = plugins.find((p) => p.id === pluginId)
        if (!plugin || !plugin.state.isActive) {
          console.log(`Plugin ${pluginId} is not active`)
          return true
        }

        // 执行插件的onDeactivate钩子
        if (plugin.onDeactivate) {
          try {
            const success = await plugin.onDeactivate()
            if (!success) {
              console.error(`Plugin ${pluginId} deactivation hook failed`)
              return false
            }
          } catch (error) {
            console.error(`Plugin ${pluginId} deactivation hook error:`, error)
            return false
          }
        }

        // 移除插件扩展
        Object.keys(extensionPoints).forEach((point) => {
          dispatch(removeExtension({ point, pluginId }))
        })

        // 更新插件状态
        dispatch(
          setPluginState({
            id: pluginId,
            stateUpdates: {
              isActive: false
            }
          })
        )

        // 从activatedPlugins列表中移除
        try {
          const activatedPluginsJson = localStorage.getItem('activatedPlugins') || '[]'
          const activatedPlugins = JSON.parse(activatedPluginsJson)
          const index = activatedPlugins.indexOf(pluginId)
          if (index > -1) {
            activatedPlugins.splice(index, 1)
            localStorage.setItem('activatedPlugins', JSON.stringify(activatedPlugins))
            console.log(`已将插件 ${pluginId} 从activatedPlugins列表移除`)
          }
        } catch (e) {
          console.error('更新activatedPlugins失败:', e)
        }

        return true
      } catch (error) {
        console.error(`Failed to deactivate plugin ${pluginId}:`, error)
        return false
      }
    },
    [dispatch, plugins, extensionPoints]
  )

  // 卸载插件
  const uninstallPlugin = useCallback(
    async (pluginId: string): Promise<boolean> => {
      try {
        const plugin = plugins.find((p) => p.id === pluginId)
        if (!plugin) {
          console.log(`Plugin ${pluginId} not found`)
          return true
        }

        // 如果插件已激活，先停用它
        if (plugin.state.isActive) {
          const deactivated = await deactivatePlugin(pluginId)
          if (!deactivated) {
            console.error(`Failed to deactivate plugin ${pluginId} before uninstall`)
            return false
          }
        }

        // 执行插件的onUninstall钩子
        if (plugin.onUninstall) {
          try {
            const success = await plugin.onUninstall()
            if (!success) {
              console.error(`Plugin ${pluginId} uninstall hook failed`)
              return false
            }
          } catch (error) {
            console.error(`Plugin ${pluginId} uninstall hook error:`, error)
            return false
          }
        }

        // 移除插件配置
        localStorage.removeItem(`plugin_settings_${pluginId}`)

        // 从插件列表中移除
        dispatch(removePlugin(pluginId))

        return true
      } catch (error) {
        console.error(`Failed to uninstall plugin ${pluginId}:`, error)
        return false
      }
    },
    [dispatch, plugins, deactivatePlugin]
  )

  // 获取插件的扩展
  const getPluginExtensions = useCallback(
    (extensionPointId: string) => {
      return extensionPoints[extensionPointId]?.extensions || []
    },
    [extensionPoints]
  )

  // 重置插件系统
  const resetPluginSystem = useCallback(async () => {
    try {
      console.log('开始重置插件系统...')

      // 停用所有激活的插件
      for (const plugin of plugins) {
        if (plugin.state.isActive) {
          await deactivatePlugin(plugin.id)
        }
      }

      // 保存当前的插件黑名单
      let blacklist: string[] = []
      try {
        const blacklistJson = localStorage.getItem('plugin_blacklist') || '[]'
        blacklist = JSON.parse(blacklistJson)
        if (!Array.isArray(blacklist)) {
          blacklist = []
        }
        console.log('保存当前插件黑名单:', blacklist)
      } catch (e) {
        console.error('解析插件黑名单失败:', e)
      }

      // 清除所有与插件相关的localStorage项
      // 获取所有localStorage的键
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key) {
          // 清除所有与插件相关的项，但保留黑名单
          if (
            key === STORAGE_KEY ||
            key === 'activatedPlugins' ||
            key.startsWith('plugin_settings_') ||
            (key.includes('plugin') && key !== 'plugin_blacklist') ||
            key.includes('Plugin')
          ) {
            keysToRemove.push(key)
          }
        }
      }

      // 删除收集到的键
      console.log('清除以下localStorage项:', keysToRemove)
      keysToRemove.forEach((key) => localStorage.removeItem(key))

      // 确保黑名单被保留
      localStorage.setItem('plugin_blacklist', JSON.stringify(blacklist))

      // 重置Redux状态
      dispatch(setInitialized(false))
      dispatch(clearPlugins())

      // 重新初始化插件系统
      setTimeout(() => {
        initializePluginSystem()
      }, 500) // 增加延迟，确保状态完全清除

      console.log('插件系统重置完成')
      return true
    } catch (error) {
      console.error('重置插件系统失败:', error)
      dispatch(setError(`重置失败: ${error}`))
      return false
    }
  }, [plugins, dispatch, deactivatePlugin, initializePluginSystem])

  // 强制刷新插件
  const refreshPlugin = useCallback(
    async (pluginId: string) => {
      try {
        console.log(`开始刷新插件: ${pluginId}`)

        // 找到插件
        const plugin = plugins.find((p) => p.id === pluginId)
        if (!plugin) {
          console.error(`找不到插件: ${pluginId}`)
          return false
        }

        // 如果插件已激活，先停用
        if (plugin.state.isActive) {
          await deactivatePlugin(pluginId)
        }

        // 移除插件
        dispatch(removePlugin(pluginId))

        // 清除插件设置
        localStorage.removeItem(`plugin_settings_${pluginId}`)

        // 从activatedPlugins中移除
        try {
          const activatedPluginsJson = localStorage.getItem('activatedPlugins') || '[]'
          const activatedPlugins = JSON.parse(activatedPluginsJson)
          const updatedActivatedPlugins = activatedPlugins.filter((id: string) => id !== pluginId)
          localStorage.setItem('activatedPlugins', JSON.stringify(updatedActivatedPlugins))
        } catch (e) {
          console.error('更新activatedPlugins失败:', e)
        }

        // 保存原始插件信息，用于后续恢复
        const wasActive = plugin.state.isActive // 保存激活状态
        const originalPluginInfo = {
          id: plugin.id,
          name: plugin.name,
          description: plugin.description,
          version: plugin.version,
          author: plugin.author,
          icon: plugin.icon,
          requiredModules: plugin.requiredModules || []
        }

        // 尝试从allPlugins中查找插件
        const registeredPlugin = allPlugins.find((p) => p.id === pluginId)

        if (registeredPlugin) {
          // 如果在allPlugins中找到，使用注册的信息
          console.log(`从注册的插件中找到: ${pluginId}`)
          const pluginMeta: PluginMeta = {
            id: registeredPlugin.id,
            name: registeredPlugin.name,
            description: registeredPlugin.description,
            version: registeredPlugin.version,
            author: registeredPlugin.author,
            icon: registeredPlugin.icon,
            requiredModules: registeredPlugin.requiredModules || []
          }

          await registerPlugin(pluginMeta)
        } else {
          // 如果在allPlugins中找不到，使用原始插件信息
          console.log(`在注册的插件中找不到 ${pluginId}，使用原始信息恢复`)

          // 创建PluginMeta对象
          const pluginMeta: PluginMeta = {
            id: originalPluginInfo.id,
            name: originalPluginInfo.name || `插件 ${pluginId}`,
            description: originalPluginInfo.description || '刷新恢复的插件',
            version: originalPluginInfo.version || '1.0.0',
            author: originalPluginInfo.author || '系统',
            icon: originalPluginInfo.icon || '🧩',
            requiredModules: originalPluginInfo.requiredModules || []
          }

          await registerPlugin(pluginMeta)
        }

        // 安装并激活插件
        await installPlugin(pluginId)

        // 如果原来是激活状态，则重新激活
        if (wasActive) {
          await activatePlugin(pluginId)
        }

        console.log(`插件刷新完成: ${pluginId}`)
        return true
      } catch (error) {
        console.error(`刷新插件失败: ${pluginId}`, error)
        return false
      }
    },
    [plugins, dispatch, deactivatePlugin, registerPlugin, installPlugin, activatePlugin]
  )

  return {
    plugins,
    extensionPoints,
    isInitialized,
    isLoading,
    error,
    initializePluginSystem,
    registerPlugin,
    installPlugin,
    activatePlugin,
    deactivatePlugin,
    uninstallPlugin,
    getPluginExtensions,
    createPluginAPI,
    resetPluginSystem,
    refreshPlugin
  }
}
