import { getModelLogo } from '@renderer/config/models'
import { useProviders } from '@renderer/hooks/useProvider'
import { getModelUniqId } from '@renderer/services/ModelService'
import { Model } from '@renderer/types'
import { Avatar, Select, Tooltip } from 'antd'
import { first } from 'lodash'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

interface ModelSelectorProps {
  value?: Model
  onChange: (model: Model) => void
  style?: React.CSSProperties
  className?: string
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ value, onChange, style, className }) => {
  const { t } = useTranslation()
  const { providers } = useProviders()

  // 获取所有可用模型
  const allModels = useMemo(() => {
    return providers
      .filter((p) => p.enabled)
      .flatMap((p) => p.models)
      .filter((m) => m.id && m.name) // 确保模型有效
  }, [providers])

  // 按提供商分组的选项
  const selectOptions = useMemo(() => {
    return providers
      .filter((p) => p.enabled && p.models.length > 0)
      .map((p) => ({
        label: p.isSystem ? t(`provider.${p.id}`) : p.name,
        options: p.models
          .filter((m) => m.id && m.name) // 确保模型有效
          .map((m) => ({
            label: m.name,
            value: getModelUniqId(m),
            model: m
          }))
      }))
  }, [providers, t])

  // 处理模型选择
  const handleModelChange = (modelUniqId: string) => {
    const selectedModel = allModels.find((m) => getModelUniqId(m) === modelUniqId)
    if (selectedModel) {
      onChange(selectedModel)
    }
  }

  return (
    <SelectorContainer style={style} className={className}>
      <Select
        placeholder={t('button.select_model') || '选择模型'}
        value={value ? getModelUniqId(value) : undefined}
        onChange={handleModelChange}
        style={{ width: '100%' }}
        popupClassName="model-selector-dropdown"
        optionLabelProp="label"
        optionFilterProp="label"
        showSearch
        options={selectOptions}
        optionRender={(option) => {
          const optionData = option.data as any
          const model = optionData.model as Model
          return (
            <ModelOption>
              <Avatar src={getModelLogo(model.id)} size={16}>
                {first(model.name)}
              </Avatar>
              <Tooltip title={model.name} mouseEnterDelay={0.5}>
                <ModelName>{model.name}</ModelName>
              </Tooltip>
              <ProviderName>| {providers.find((p) => p.id === model.provider)?.name || model.provider}</ProviderName>
            </ModelOption>
          )
        }}
      />
    </SelectorContainer>
  )
}

// 样式
const SelectorContainer = styled.div`
  width: 100%;
`

const ModelOption = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
`

const ModelName = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const ProviderName = styled.span`
  color: var(--color-text-3);
  font-size: 12px;
`

export default ModelSelector
