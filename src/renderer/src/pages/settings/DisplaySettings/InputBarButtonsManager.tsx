import { useTranslation } from 'react-i18next'
import { FC, useCallback, useEffect, useState } from 'react'
import { InputBarButton } from '@renderer/store/settings'
import { Button, Checkbox, Divider, Space, Tooltip } from 'antd'
import styled from 'styled-components'
import { useAppDispatch } from '@renderer/store'
import { setInputBarDisabledButtons } from '@renderer/store/settings'
import { CheckboxChangeEvent } from 'antd/es/checkbox'
import i18n from '@renderer/i18n'

interface InputBarButtonsManagerProps {
  disabledButtons: InputBarButton[]
  setDisabledButtons: (buttons: InputBarButton[]) => void
}

// 输入框按钮配置
const INPUT_BAR_BUTTONS: { id: InputBarButton; icon: string; nameKey: string; displayName: string }[] = [
  { id: 'new_topic', icon: '📝', nameKey: 'chat.input.new_topic', displayName: '新话题' },
  { id: 'workspace', icon: '📁', nameKey: 'workspace.toggle', displayName: '切换工作区面板' },
  { id: 'attachment', icon: '📎', nameKey: 'chat.input.upload', displayName: '上传图片或文档' },
  { id: 'web_search', icon: '🌐', nameKey: 'chat.input.web_search', displayName: '开启网络搜索' },
  { id: 'knowledge_base', icon: '📚', nameKey: 'chat.input.knowledge_base', displayName: '知识库' },
  { id: 'mcp_tools', icon: '🔧', nameKey: 'settings.mcp.title', displayName: 'MCP 设置' },
  { id: 'agent_mode', icon: '🤖', nameKey: 'agent.mode.title', displayName: 'Agent模式' },
  { id: 'mention_models', icon: '@', nameKey: 'agents.edit.model.select.title', displayName: '选择模型' },
  { id: 'quick_phrases', icon: '⚡', nameKey: 'settings.quickPhrase.title', displayName: '快捷短语' },
  { id: 'clear', icon: '🧹', nameKey: 'chat.input.clear', displayName: '清空消息' },
  { id: 'expand', icon: '⬆️', nameKey: 'chat.input.expand', displayName: '展开' },
  { id: 'new_context', icon: '🔄', nameKey: 'chat.input.new_context', displayName: '清除上下文' },
  { id: 'translate', icon: '🔤', nameKey: 'translate.title', displayName: '翻译' },
  { id: 'polish_text', icon: '✨', nameKey: 'polish.title', displayName: '润色文字' },
  { id: 'asr', icon: '🎤', nameKey: 'settings.asr.title', displayName: '语音识别' },
  { id: 'voice_call', icon: '📞', nameKey: 'settings.voice_call.title', displayName: '语音通话' }
]

const InputBarButtonsManager: FC<InputBarButtonsManagerProps> = ({ disabledButtons, setDisabledButtons }) => {
  useTranslation()
  const dispatch = useAppDispatch()
  const [localDisabledButtons, setLocalDisabledButtons] = useState<InputBarButton[]>(disabledButtons)

  // 强制重新加载翻译
  useEffect(() => {
    const currentLng = i18n.language
    i18n.reloadResources(currentLng)
    console.log('[InputBarButtonsManager] Translations reloaded for language:', currentLng)
  }, [])

  useEffect(() => {
    setLocalDisabledButtons(disabledButtons)
  }, [disabledButtons])

  const handleChange = useCallback(
    (button: InputBarButton, e: CheckboxChangeEvent) => {
      const checked = e.target.checked
      let newDisabledButtons: InputBarButton[]

      if (checked) {
        // 如果选中，从禁用列表中移除
        newDisabledButtons = localDisabledButtons.filter((b) => b !== button)
      } else {
        // 如果取消选中，添加到禁用列表
        newDisabledButtons = [...localDisabledButtons, button]
      }

      setLocalDisabledButtons(newDisabledButtons)
      setDisabledButtons(newDisabledButtons)
      dispatch(setInputBarDisabledButtons(newDisabledButtons))
    },
    [localDisabledButtons, setDisabledButtons, dispatch]
  )

  const handleReset = useCallback(() => {
    setLocalDisabledButtons([])
    setDisabledButtons([])
    dispatch(setInputBarDisabledButtons([]))
  }, [setDisabledButtons, dispatch])

  return (
    <Container>
      <ButtonsGrid>
        {INPUT_BAR_BUTTONS.map((button) => (
          <ButtonItem key={button.id}>
            <Tooltip title={button.displayName}>
              <Checkbox
                checked={!localDisabledButtons.includes(button.id)}
                onChange={(e) => handleChange(button.id, e)}
              >
                <ButtonLabel>
                  <ButtonIcon>{button.icon}</ButtonIcon>
                  <span>{button.displayName}</span>
                </ButtonLabel>
              </Checkbox>
            </Tooltip>
          </ButtonItem>
        ))}
      </ButtonsGrid>
      <Divider />
      <Space>
        <Button onClick={handleReset}>重置</Button>
      </Space>
    </Container>
  )
}

const Container = styled.div`
  margin: 10px 0;
`

const ButtonsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 10px;
`

const ButtonItem = styled.div`
  padding: 8px;
  border-radius: 4px;
  transition: background-color 0.2s;

  &:hover {
    background-color: var(--color-background-soft);
  }
`

const ButtonLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const ButtonIcon = styled.span`
  font-size: 16px;
  width: 20px;
  text-align: center;
`

export default InputBarButtonsManager
