import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { Extension, ExtensionPoint, Plugin } from '@renderer/types/plugin'

// 扩展点注册表 - 目前未使用
/*
interface ExtensionPointRegistry {
  [id: string]: ExtensionPoint
}
*/

// 插件系统状态
interface PluginSystemState {
  plugins: Record<string, Plugin>
  extensionPoints: Record<string, ExtensionPoint>
  loading: boolean
  error: string | null
}

// 初始状态
const initialState: PluginSystemState = {
  plugins: {},
  extensionPoints: {},
  loading: false,
  error: null
}

// 创建插件系统Slice
const pluginSystemSlice = createSlice({
  name: 'pluginSystem',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
    clearPlugins: (state) => {
      state.plugins = {}
      state.extensionPoints = {}
    },
    registerPlugin: (state, action: PayloadAction<Plugin>) => {
      const plugin = action.payload
      state.plugins[plugin.id] = plugin
    },
    unregisterPlugin: (state, action: PayloadAction<string>) => {
      const pluginId = action.payload
      delete state.plugins[pluginId]
    },
    enablePlugin: (state, action: PayloadAction<string>) => {
      const pluginId = action.payload
      if (state.plugins[pluginId]) {
        state.plugins[pluginId].enabled = true
      }
    },
    disablePlugin: (state, action: PayloadAction<string>) => {
      const pluginId = action.payload
      if (state.plugins[pluginId]) {
        state.plugins[pluginId].enabled = false
      }
    },
    setPluginLoaded: (state, action: PayloadAction<{ id: string; loaded: boolean }>) => {
      const { id, loaded } = action.payload
      if (state.plugins[id]) {
        state.plugins[id].loaded = loaded
      }
    },
    setPluginError: (state, action: PayloadAction<{ id: string; error: string }>) => {
      const { id, error } = action.payload
      if (state.plugins[id]) {
        state.plugins[id].error = error
      }
    },
    registerExtensionPoint: (state, action: PayloadAction<ExtensionPoint>) => {
      const extensionPoint = action.payload
      state.extensionPoints[extensionPoint.id] = extensionPoint
    },
    unregisterExtensionPoint: (state, action: PayloadAction<string>) => {
      const extensionPointId = action.payload
      delete state.extensionPoints[extensionPointId]
    },
    addExtension: (
      state,
      action: PayloadAction<{
        pluginId: string
        extensionPointId: string
        extension: Omit<Extension, 'id' | 'pluginId' | 'extensionPointId'>
      }>
    ) => {
      const { pluginId, extensionPointId, extension } = action.payload
      const plugin = state.plugins[pluginId]

      if (plugin) {
        if (!plugin.extensions) {
          plugin.extensions = []
        }

        // 检查扩展点是否存在
        if (state.extensionPoints[extensionPointId]) {
          plugin.extensions.push({
            id: `${pluginId}.${extensionPointId}.${Date.now()}`,
            pluginId,
            extensionPointId,
            ...extension
          })
        }
      }
    },
    removeExtension: (state, action: PayloadAction<{ pluginId: string; extensionId: string }>) => {
      const { pluginId, extensionId } = action.payload
      const plugin = state.plugins[pluginId]

      if (plugin && plugin.extensions) {
        plugin.extensions = plugin.extensions.filter((ext) => ext.id !== extensionId)
      }
    },
    updatePluginConfig: (state, action: PayloadAction<{ pluginId: string; config: Record<string, any> }>) => {
      const { pluginId, config } = action.payload
      const plugin = state.plugins[pluginId]

      if (plugin) {
        plugin.config = {
          ...plugin.config,
          ...config
        }
      }
    }
  }
})

// 导出action和reducer
export const {
  setLoading,
  setError,
  clearPlugins,
  registerPlugin,
  unregisterPlugin,
  enablePlugin,
  disablePlugin,
  setPluginLoaded,
  setPluginError,
  registerExtensionPoint,
  unregisterExtensionPoint,
  addExtension,
  removeExtension,
  updatePluginConfig
} = pluginSystemSlice.actions

// 移除未使用的默认扩展点，使用注释保留代码以供参考
/*
const defaultExtensionPoints: ExtensionPoint[] = [
  {
    id: 'sidebar',
    name: '侧边栏',
    description: '向侧边栏添加新的菜单项或功能'
  },
  {
    id: 'toolbar',
    name: '工具栏',
    description: '向顶部工具栏添加新的按钮或功能'
  },
  {
    id: 'editor',
    name: '编辑器',
    description: '扩展编辑器功能'
  },
  {
    id: 'settings',
    name: '设置',
    description: '添加新的设置选项'
  }
]
*/

export default pluginSystemSlice.reducer
