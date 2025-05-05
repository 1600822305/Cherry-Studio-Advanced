import { InfoCircleOutlined } from '@ant-design/icons'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useSettings } from '@renderer/hooks/useSettings'
import { useAppDispatch } from '@renderer/store'
import { setUseGeminiPromptForToolCalling, setUseOpenAIPromptForToolCalling } from '@renderer/store/settings'
import { Switch, Tooltip } from 'antd'
import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import { SettingContainer, SettingDivider, SettingGroup, SettingRow, SettingRowTitle, SettingTitle } from '..'

const McpToolCallingSettings: FC = () => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const dispatch = useAppDispatch()
  const { useOpenAIPromptForToolCalling, useGeminiPromptForToolCalling } = useSettings()

  return (
    <SettingContainer theme={theme}>
      <SettingGroup theme={theme}>
        <SettingTitle>{t('settings.mcp.tool_calling.title', '工具调用设置')}</SettingTitle>
        <SettingDivider />

        {/* OpenAI工具调用设置 */}
        <ProviderSection>
          <SectionTitle>OpenAI模型</SectionTitle>
          <SettingRow>
            <SettingRowTitle>
              {t('settings.mcp.tool_calling.use_openai_prompt', '使用提示词调用工具')}
              <Tooltip
                title={t(
                  'settings.mcp.tool_calling.use_prompt_tooltip',
                  '启用后，将使用提示词而非函数调用来调用MCP工具。适用于所有OpenAI模型，但可能不如函数调用精确。'
                )}
                placement="right">
                <InfoCircleOutlined style={{ marginLeft: 8, color: 'var(--color-text-3)' }} />
              </Tooltip>
            </SettingRowTitle>
            <Switch
              checked={useOpenAIPromptForToolCalling}
              onChange={(checked) => dispatch(setUseOpenAIPromptForToolCalling(checked))}
            />
          </SettingRow>
          <Description>
            提示词调用工具：适用于所有OpenAI模型，但可能不如函数调用精确。
            <br />
            函数调用工具：仅适用于支持函数调用的OpenAI模型，但调用更精确。
          </Description>
        </ProviderSection>

        <SettingDivider />

        {/* Gemini工具调用设置 */}
        <ProviderSection>
          <SectionTitle>Gemini模型</SectionTitle>
          <SettingRow>
            <SettingRowTitle>
              {t('settings.mcp.tool_calling.use_gemini_prompt', '使用提示词调用工具')}
              <Tooltip
                title={t(
                  'settings.mcp.tool_calling.use_gemini_prompt_tooltip',
                  '启用后，将使用提示词而非函数调用来调用MCP工具。适用于所有Gemini模型，但可能不如函数调用精确。'
                )}
                placement="right">
                <InfoCircleOutlined style={{ marginLeft: 8, color: 'var(--color-text-3)' }} />
              </Tooltip>
            </SettingRowTitle>
            <Switch
              checked={useGeminiPromptForToolCalling}
              onChange={(checked) => dispatch(setUseGeminiPromptForToolCalling(checked))}
            />
          </SettingRow>
          <Description>
            提示词调用工具：适用于所有Gemini模型，但可能不如函数调用精确。
            <br />
            函数调用工具：仅适用于支持函数调用的Gemini模型，但调用更精确。
          </Description>
        </ProviderSection>
      </SettingGroup>
    </SettingContainer>
  )
}

const Description = styled.div`
  color: var(--color-text-3);
  font-size: 14px;
  line-height: 1.5;
  margin-top: 8px;
  white-space: pre-line;
`

const ProviderSection = styled.div`
  margin-bottom: 16px;
`

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 16px;
  color: var(--color-text);
`

export default McpToolCallingSettings
