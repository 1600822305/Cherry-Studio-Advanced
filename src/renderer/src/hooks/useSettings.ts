import store, { useAppDispatch, useAppSelector } from '@renderer/store'
import {
  AssistantIconType,
  InputBarButton,
  SendMessageShortcut,
  setAssistantIconType,
  setEnableDataCollection as _setEnableDataCollection,
  setInputBarDisabledButtons,
  setLaunchOnBoot,
  setLaunchToTray,
  setSendMessageShortcut as _setSendMessageShortcut,
  setSidebarIcons,
  setTargetLanguage,
  setTheme,
  SettingsState,
  setTopicPosition,
  setTray as _setTray,
  setTrayOnClose,
  setWindowStyle
} from '@renderer/store/settings'
import { SidebarIcon } from '@renderer/store/settings'
import { ThemeMode, TranslateLanguageVarious } from '@renderer/types'

export function useSettings(): SettingsState & {
  setSendMessageShortcut: (shortcut: SendMessageShortcut) => void
  setLaunch: (isLaunchOnBoot: boolean | undefined, isLaunchToTray?: boolean | undefined) => void
  setTray: (isShowTray: boolean | undefined, isTrayOnClose?: boolean | undefined) => void
  setTheme: (theme: ThemeMode) => void
  setWindowStyle: (windowStyle: 'transparent' | 'opaque') => void
  setTargetLanguage: (targetLanguage: TranslateLanguageVarious) => void
  setTopicPosition: (topicPosition: 'left' | 'right') => void
  updateSidebarIcons: (icons: { visible: SidebarIcon[]; disabled: SidebarIcon[] }) => void
  updateSidebarVisibleIcons: (icons: SidebarIcon[]) => void
  updateSidebarDisabledIcons: (icons: SidebarIcon[]) => void
  setAssistantIconType: (assistantIconType: AssistantIconType) => void
  setEnableDataCollection: (enabled: boolean) => void
  showAgentTaskList: boolean
  agentAutoExecutionCount: number
  setShowAgentTaskList: (show: boolean) => void
  setAgentAutoExecutionCount: (count: number) => void
  setInputBarDisabledButtons: (buttons: InputBarButton[]) => void
} {
  const settings = useAppSelector((state) => state.settings)
  const dispatch = useAppDispatch()

  return {
    ...settings,
    setSendMessageShortcut(shortcut: SendMessageShortcut) {
      dispatch(_setSendMessageShortcut(shortcut))
    },

    setLaunch(isLaunchOnBoot: boolean | undefined, isLaunchToTray: boolean | undefined = undefined) {
      if (isLaunchOnBoot !== undefined) {
        dispatch(setLaunchOnBoot(isLaunchOnBoot))
        window.api.setLaunchOnBoot(isLaunchOnBoot)
      }

      if (isLaunchToTray !== undefined) {
        dispatch(setLaunchToTray(isLaunchToTray))
        window.api.setLaunchToTray(isLaunchToTray)
      }
    },

    setTray(isShowTray: boolean | undefined, isTrayOnClose: boolean | undefined = undefined) {
      if (isShowTray !== undefined) {
        dispatch(_setTray(isShowTray))
        window.api.setTray(isShowTray)
      }
      if (isTrayOnClose !== undefined) {
        dispatch(setTrayOnClose(isTrayOnClose))
        window.api.setTrayOnClose(isTrayOnClose)
      }
    },

    setTheme(theme: ThemeMode) {
      dispatch(setTheme(theme))
    },
    setWindowStyle(windowStyle: 'transparent' | 'opaque') {
      dispatch(setWindowStyle(windowStyle))
    },
    setTargetLanguage(targetLanguage: TranslateLanguageVarious) {
      dispatch(setTargetLanguage(targetLanguage))
    },
    setTopicPosition(topicPosition: 'left' | 'right') {
      dispatch(setTopicPosition(topicPosition))
    },
    updateSidebarIcons(icons: { visible: SidebarIcon[]; disabled: SidebarIcon[] }) {
      dispatch(setSidebarIcons(icons))
    },
    updateSidebarVisibleIcons(icons: SidebarIcon[]) {
      dispatch(setSidebarIcons({ visible: icons }))
    },
    updateSidebarDisabledIcons(icons: SidebarIcon[]) {
      dispatch(setSidebarIcons({ disabled: icons }))
    },
    setAssistantIconType(assistantIconType: AssistantIconType) {
      dispatch(setAssistantIconType(assistantIconType))
    },

    setEnableDataCollection(enabled: boolean) {
      dispatch(_setEnableDataCollection(enabled))
      // 同步到主进程
      window.api.invoke('app:setEnableDataCollection', enabled)
    },
    // 添加 showAgentTaskList 和 agentAutoExecutionCount 属性
    showAgentTaskList: settings.showAgentTaskList, // 使用 Redux store 中的值
    agentAutoExecutionCount: settings.agentAutoExecutionCount, // 使用 Redux store 中的值

    // 添加设置 Agent 任务列表显示状态的函数
    setShowAgentTaskList(show: boolean) {
      const { setShowAgentTaskList } = require('@renderer/store/settings')
      dispatch(setShowAgentTaskList(show))
    },

    // 添加设置 Agent 自动执行次数的函数
    setAgentAutoExecutionCount(count: number) {
      const { setAgentAutoExecutionCount } = require('@renderer/store/settings')
      dispatch(setAgentAutoExecutionCount(count))
    },

    // 添加设置禁用输入框按钮的函数
    setInputBarDisabledButtons(buttons: InputBarButton[]) {
      dispatch(setInputBarDisabledButtons(buttons))
    }
  }
}

export function useMessageStyle() {
  const { messageStyle } = useSettings()
  const isBubbleStyle = messageStyle === 'bubble'

  return {
    isBubbleStyle
  }
}

export const getStoreSetting = (key: keyof SettingsState) => {
  return store.getState().settings[key]
}
