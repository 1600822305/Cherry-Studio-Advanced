import { PushpinOutlined, SearchOutlined } from '@ant-design/icons'
import { TopView } from '@renderer/components/TopView'
import { getModelLogo, isEmbeddingModel, isRerankModel } from '@renderer/config/models'
import db from '@renderer/databases'
import { useProviders } from '@renderer/hooks/useProvider'
import { getModelUniqId } from '@renderer/services/ModelService'
import { Model } from '@renderer/types' // Removed unused 'Provider' import
import { Avatar, Divider, Empty, Input, InputRef, Modal, Spin, Tooltip } from 'antd'
import { first, sortBy } from 'lodash'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import { HStack } from '../Layout'
import ModelTags from '../ModelTags'
import Scrollbar from '../Scrollbar'
import ModelSettingsButton from './ModelSettingsButton'

interface Props {
  model?: Model // The currently active model, for highlighting
}

interface PopupContainerProps extends Props {
  resolve: (value: Model | undefined) => void
  preloadedModels?: Model[]
  preloadedPinnedModels?: string[]
}

const PINNED_PROVIDER_ID = '__pinned__' // Special ID for pinned section

// 简化数据加载和处理逻辑的弹窗容器组件
const PopupContainer: React.FC<PopupContainerProps> = ({
  model: activeModel,
  resolve,
  preloadedModels,
  preloadedPinnedModels
}) => {
  const [open, setOpen] = useState(true)
  const { t } = useTranslation()
  const [searchText, setSearchText] = useState('')
  const inputRef = useRef<InputRef>(null)
  const { providers } = useProviders()
  const [pinnedModels, setPinnedModels] = useState<string[]>(preloadedPinnedModels || [])
  const [selectedProviderId, setSelectedProviderId] = useState<string>('all')
  const [isInitialized, setIsInitialized] = useState(!!preloadedModels && !!preloadedPinnedModels)
  const [contentLoading, setContentLoading] = useState(true)

  // 使用RAF优化初始渲染
  useEffect(() => {
    // 利用requestAnimationFrame延迟渲染内容，让UI先显示
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setContentLoading(false)
      })
    })
  }, [])

  // 缓存所有模型列表，只在providers变化时重新计算
  const allModels = useMemo(() => {
    // 优先使用预加载的模型数据
    if (preloadedModels) {
      return preloadedModels
    }
    return providers.flatMap((p) => p.models || []).filter((m) => !isEmbeddingModel(m) && !isRerankModel(m))
  }, [providers, preloadedModels])

  // --- 优化后的Load Pinned Models ---
  useEffect(() => {
    // 如果已经有预加载的固定模型，则不需要从数据库加载
    if ((preloadedPinnedModels && preloadedPinnedModels.length > 0) || !open || isInitialized) {
      return
    }

    const loadPinnedModels = async () => {
      let validPinnedModels: string[] = []

      try {
        const setting = await db.settings.get('pinned:models')
        const savedPinnedModels = setting?.value || []
        const allModelIds = allModels.map((m) => getModelUniqId(m))
        validPinnedModels = savedPinnedModels.filter((id: string) => allModelIds.includes(id))
      } catch (error) {
        console.error('加载固定模型失败', error)
      }

      setPinnedModels(sortBy(validPinnedModels))
      setIsInitialized(true)
    }

    loadPinnedModels()
  }, [allModels, open, preloadedPinnedModels, isInitialized])

  // 设置初始选中的提供商
  useEffect(() => {
    if (!isInitialized || !open) return

    // 初始化选中的提供商
    if (activeModel) {
      const activeModelId = getModelUniqId(activeModel)
      if (pinnedModels.includes(activeModelId)) {
        setSelectedProviderId(PINNED_PROVIDER_ID)
      } else {
        setSelectedProviderId(activeModel.provider)
      }
    } else if (pinnedModels.length > 0) {
      setSelectedProviderId(PINNED_PROVIDER_ID)
    } else if (providers.length > 0) {
      setSelectedProviderId(providers[0].id)
    }
  }, [activeModel, pinnedModels, providers, isInitialized, open])

  // --- Pin/Unpin Logic ---
  const togglePin = useCallback(
    async (modelId: string) => {
      const newPinnedModels = pinnedModels.includes(modelId)
        ? pinnedModels.filter((id) => id !== modelId)
        : [...pinnedModels, modelId]

      await db.settings.put({ id: 'pinned:models', value: newPinnedModels })
      setPinnedModels(sortBy(newPinnedModels)) // Keep sorted

      // 更新静态缓存
      SelectModelPopup.updatePinnedModelsCache(newPinnedModels)

      // If unpinning the last pinned model and currently viewing pinned, switch provider
      if (newPinnedModels.length === 0 && selectedProviderId === PINNED_PROVIDER_ID) {
        setSelectedProviderId(providers[0]?.id || 'all')
      }
    },
    [pinnedModels, selectedProviderId, providers]
  )

  // --- Filter Models for Right Column ---
  const displayedModels = useMemo(() => {
    let modelsToShow: Model[] = []

    // 如果有搜索文本，在所有模型中搜索
    if (searchText.trim()) {
      const keywords = searchText.toLowerCase().split(/\s+/).filter(Boolean)
      modelsToShow = allModels.filter((m) => {
        const provider = providers.find((p) => p.id === m.provider)
        const providerName = provider ? (provider.isSystem ? t(`provider.${provider.id}`) : provider.name) : ''
        const fullName = `${m.name} ${providerName}`.toLowerCase()
        return keywords.every((keyword) => fullName.includes(keyword))
      })
    } else {
      // 没有搜索文本时，根据选择的供应商筛选
      if (selectedProviderId === 'all') {
        // 显示所有模型
        modelsToShow = allModels
      } else if (selectedProviderId === PINNED_PROVIDER_ID) {
        // 显示固定的模型
        modelsToShow = allModels.filter((m) => pinnedModels.includes(getModelUniqId(m)))
      } else if (selectedProviderId) {
        // 显示选中供应商的模型
        const provider = providers.find((p) => p.id === selectedProviderId)
        if (provider && provider.models) {
          modelsToShow = provider.models.filter((m) => !isEmbeddingModel(m) && !isRerankModel(m))
        }
      }
    }

    return sortBy(modelsToShow, ['group', 'name'])
  }, [selectedProviderId, pinnedModels, searchText, allModels, providers, t])

  // --- Event Handlers ---
  const handleProviderSelect = useCallback((providerId: string) => {
    setSelectedProviderId(providerId)
  }, [])

  const handleModelSelect = useCallback(
    (model: Model) => {
      resolve(model)
      setOpen(false)
    },
    [resolve, setOpen]
  )

  const onCancel = useCallback(() => {
    setOpen(false)
  }, [])

  const onClose = useCallback(async () => {
    resolve(undefined)
    SelectModelPopup.hide()
  }, [resolve])

  // --- Focus Input on Open ---
  useEffect(() => {
    open && setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  // --- Provider List for Left Column ---
  const providerListItems = useMemo(() => {
    const items: { id: string; name: string }[] = [{ id: 'all', name: t('models.all') || '全部' }]
    if (pinnedModels.length > 0) {
      items.push({ id: PINNED_PROVIDER_ID, name: t('models.pinned') })
    }
    providers.forEach((p) => {
      // Only add provider if it has non-embedding/rerank models
      if (p.models?.some((m) => !isEmbeddingModel(m) && !isRerankModel(m))) {
        items.push({ id: p.id, name: p.isSystem ? t(`provider.${p.id}`) : p.name })
      }
    })
    return items
  }, [providers, pinnedModels, t])

  // --- Render ---
  return (
    <Modal
      centered
      open={open}
      onCancel={onCancel}
      afterClose={onClose}
      transitionName="animation-move-down"
      styles={{
        content: {
          borderRadius: 15,
          padding: 0,
          overflow: 'hidden',
          border: '1px solid var(--color-border)'
        },
        body: {
          padding: 0
        },
        wrapper: {
          zIndex: 30100
        }
      }}
      closeIcon={null}
      footer={null}
      width={900}>
      {/* Search Input - 总是最先渲染 */}
      <SearchContainer onClick={() => inputRef.current?.focus()}>
        <SearchInputContainer>
          <Input
            prefix={
              <SearchIcon>
                <SearchOutlined />
              </SearchIcon>
            }
            ref={inputRef}
            placeholder={t('models.search')}
            value={searchText}
            onChange={useCallback(
              (e: React.ChangeEvent<HTMLInputElement>) => {
                const value = e.target.value
                setSearchText(value)
                if (value.trim() && selectedProviderId !== 'all') {
                  setSelectedProviderId('all')
                }
              },
              [selectedProviderId]
            )}
            allowClear
            autoFocus
            style={{
              paddingLeft: 0,
              height: '32px',
              fontSize: '14px'
            }}
            variant="borderless"
            size="middle"
          />
        </SearchInputContainer>
      </SearchContainer>
      <Divider style={{ margin: 0, borderBlockStartWidth: 0.5, marginTop: -5 }} />

      {/* 延迟加载内容部分 */}
      {contentLoading ? (
        <LoadingContainer>
          <Spin spinning={true}>
            <div
              style={{
                height: '60vh',
                width: '800px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
              <div>正在加载模型...</div>
            </div>
          </Spin>
        </LoadingContainer>
      ) : (
        <TwoColumnContainer>
          {/* Left Column: Providers */}
          <ProviderListColumn>
            <Scrollbar style={{ height: '60vh', paddingRight: '5px' }}>
              {providerListItems.map((provider, index) => (
                <React.Fragment key={provider.id}>
                  <Tooltip title={provider.name} placement="right" mouseEnterDelay={0.5}>
                    <ProviderListItem
                      $selected={selectedProviderId === provider.id}
                      onClick={() => handleProviderSelect(provider.id)}>
                      <ProviderName>{provider.name}</ProviderName>
                      {provider.id === PINNED_PROVIDER_ID && <PinnedIcon />}
                    </ProviderListItem>
                  </Tooltip>
                  {index < providerListItems.length - 1 && <ProviderDivider />}
                </React.Fragment>
              ))}
            </Scrollbar>
          </ProviderListColumn>

          {/* Right Column: Models - 显示所有模型，不再限制数量 */}
          <ModelListColumn>
            <Scrollbar style={{ height: '60vh', paddingRight: '5px' }}>
              {displayedModels.length > 0 ? (
                displayedModels.map((m) => (
                  <ModelListItem
                    key={getModelUniqId(m)}
                    $selected={activeModel ? getModelUniqId(activeModel) === getModelUniqId(m) : false}
                    onClick={() => handleModelSelect(m)}>
                    <Avatar src={getModelLogo(m?.id || '')} size={24}>
                      {first(m?.name)}
                    </Avatar>
                    <ModelDetails>
                      <ModelNameRow>
                        <Tooltip title={m?.name} mouseEnterDelay={0.5}>
                          <span className="model-name">{m?.name}</span>
                        </Tooltip>
                        {(selectedProviderId !== PINNED_PROVIDER_ID || searchText) && (
                          <Tooltip
                            title={providers.find((p) => p.id === m.provider)?.name ?? m.provider}
                            mouseEnterDelay={0.5}>
                            <span className="provider-name">
                              | {providers.find((p) => p.id === m.provider)?.name ?? m.provider}
                            </span>
                          </Tooltip>
                        )}
                        <ModelTags model={m} />
                      </ModelNameRow>
                    </ModelDetails>
                    <ActionButtons>
                      <ModelSettingsButton model={m} size={14} className="settings-button" />
                      <PinButton
                        $isPinned={pinnedModels.includes(getModelUniqId(m))}
                        onClick={(e) => {
                          e.stopPropagation()
                          togglePin(getModelUniqId(m))
                        }}>
                        <PushpinOutlined />
                      </PinButton>
                    </ActionButtons>
                  </ModelListItem>
                ))
              ) : (
                <EmptyState>
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('models.no_matches')} />
                </EmptyState>
              )}
            </Scrollbar>
          </ModelListColumn>
        </TwoColumnContainer>
      )}
    </Modal>
  )
}

// --- Styled Components ---

const SearchContainer = styled(HStack)`
  padding: 8px 15px;
  cursor: pointer;
`

const SearchInputContainer = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
`

const SearchIcon = styled.div`
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--color-background-soft);
  margin-right: 5px;
  color: var(--color-icon);
  font-size: 14px;
  flex-shrink: 0;

  &:hover {
    background-color: var(--color-background-mute);
  }
`

const TwoColumnContainer = styled.div`
  display: flex;
  height: 60vh;
`

const ProviderListColumn = styled.div`
  width: 200px;
  border-right: 0.5px solid var(--color-border);
  padding: 15px 10px;
  box-sizing: border-box;
  background-color: var(--color-background-soft);
`

const ProviderListItem = styled.div<{ $selected: boolean }>`
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 8px;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: ${(props) => (props.$selected ? '600' : '400')};
  background-color: ${(props) => (props.$selected ? 'var(--color-background-mute)' : 'transparent')};
  color: ${(props) => (props.$selected ? 'var(--color-text-primary)' : 'var(--color-text)')};
  display: flex;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    background-color: var(--color-background-mute);
  }
`

const ModelListColumn = styled.div`
  flex: 1;
  padding: 12px;
  box-sizing: border-box;
`

const ModelListItem = styled.div<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 6px;
  border-radius: 6px;
  cursor: pointer;
  background-color: ${(props) => (props.$selected ? 'var(--color-background-mute)' : 'transparent')};

  &:hover {
    background-color: var(--color-background-mute);
    .pin-button,
    .settings-button {
      opacity: 0.5;
    }
  }

  .pin-button,
  .settings-button {
    opacity: ${(props) => (props.$selected ? 0.5 : 0)};
    transition: opacity 0.2s;
    &:hover {
      opacity: 1 !important;
    }
  }
`

const ModelDetails = styled.div`
  margin-left: 10px;
  flex: 1;
  overflow: hidden;
`

const ModelNameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;

  .model-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
  }
  .provider-name {
    color: var(--color-text-secondary);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
  }
`
const ActionButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
`

const PinButton = styled.button<{ $isPinned: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: ${(props) => (props.$isPinned ? 'var(--color-primary)' : 'var(--color-icon)')};
  transform: ${(props) => (props.$isPinned ? 'rotate(-45deg)' : 'none')};
  font-size: 14px;
  line-height: 1;

  &:hover {
    color: ${(props) => (props.$isPinned ? 'var(--color-primary)' : 'var(--color-text-primary)')};
  }
`

const EmptyState = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: var(--color-text-secondary);
`

const ProviderName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
`

const PinnedIcon = styled(PushpinOutlined)`
  margin-left: auto;
  flex-shrink: 0;
`

const ProviderDivider = styled.div`
  height: 1px;
  background-color: var(--color-border);
  margin: 8px 0;
  opacity: 0.5;
`

// 加载指示器容器
const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 60vh;
`

// --- 在应用初始化时预加载数据 ---
// 自动在后台预加载数据
const initPreload = () => {
  setTimeout(() => {
    SelectModelPopup.preloadData().catch(console.error)
  }, 2000) // 应用启动2秒后自动预加载
}

// 使用IIFE立即执行预加载
;(function () {
  try {
    initPreload()
  } catch (e) {
    console.error('启动时预加载失败', e)
  }
})()

// --- Export Class ---
export default class SelectModelPopup {
  static hide() {
    TopView.hide('SelectModelPopup')
  }

  // 优化缓存策略
  private static modelsCache: Model[] | undefined = undefined
  private static pinnedModelsCache: string[] | undefined = undefined
  private static lastCacheTime: number = 0
  private static cacheLifetime: number = 600000 // 增加到10分钟缓存有效期
  private static isPreloading: boolean = false // 防止并发预加载

  // 保存固定模型到缓存
  static updatePinnedModelsCache(pinnedModels: string[]) {
    this.pinnedModelsCache = [...pinnedModels]
  }

  // 预加载数据，支持同步与异步使用
  static async preloadData() {
    // 避免并发预加载
    if (this.isPreloading) {
      return {
        models: this.modelsCache || [],
        pinnedModels: this.pinnedModelsCache || []
      }
    }

    // 检查缓存是否有效
    const now = Date.now()
    if (this.modelsCache && now - this.lastCacheTime < this.cacheLifetime) {
      return {
        models: this.modelsCache,
        pinnedModels: this.pinnedModelsCache || []
      }
    }

    this.isPreloading = true

    try {
      // 并行加载数据
      const store = window.store.getState()
      const providers = store.llm.providers.filter((p) => p.enabled)
      const modelPromise = Promise.resolve(
        providers.flatMap((p) => p.models || []).filter((m) => !isEmbeddingModel(m) && !isRerankModel(m))
      )

      const pinnedModelPromise = this.pinnedModelsCache
        ? Promise.resolve(this.pinnedModelsCache)
        : db.settings.get('pinned:models').then((setting) => setting?.value || [])

      // 等待所有数据加载完成
      const [models, pinnedModels] = await Promise.all([modelPromise, pinnedModelPromise])

      // 更新缓存
      this.modelsCache = models
      this.pinnedModelsCache = pinnedModels
      this.lastCacheTime = now

      return {
        models,
        pinnedModels
      }
    } catch (error) {
      console.error('预加载模型数据失败', error)
      return {
        models: this.modelsCache || [],
        pinnedModels: this.pinnedModelsCache || []
      }
    } finally {
      this.isPreloading = false
    }
  }

  // 优化show方法，快速显示UI同时在后台加载数据
  static async show(params: Props) {
    try {
      const cachedData = {
        models: this.modelsCache,
        pinnedModels: this.pinnedModelsCache
      }

      // 快速路径：如果有缓存，立即显示弹窗
      if (cachedData.models) {
        // 同时在后台刷新数据
        this.preloadData().catch(console.error)

        return new Promise<Model | undefined>((resolve) => {
          TopView.show(
            <PopupContainer
              {...params}
              resolve={resolve}
              preloadedModels={cachedData.models}
              preloadedPinnedModels={cachedData.pinnedModels}
            />,
            'SelectModelPopup'
          )
        })
      }

      // 慢路径：需要等待数据加载
      const { models, pinnedModels } = await this.preloadData()

      return new Promise<Model | undefined>((resolve) => {
        TopView.show(
          <PopupContainer
            {...params}
            resolve={resolve}
            preloadedModels={models}
            preloadedPinnedModels={pinnedModels}
          />,
          'SelectModelPopup'
        )
      })
    } catch (error) {
      console.error('显示模型选择弹窗失败', error)

      // 降级：显示没有预加载数据的弹窗
      return new Promise<Model | undefined>((resolve) => {
        TopView.show(<PopupContainer {...params} resolve={resolve} />, 'SelectModelPopup')
      })
    }
  }
}
