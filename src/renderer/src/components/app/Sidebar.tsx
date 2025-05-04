import { isMac } from '@renderer/config/constant'
import { AppLogo, UserAvatar } from '@renderer/config/env'
import { useTheme } from '@renderer/context/ThemeProvider'
import useAvatar from '@renderer/hooks/useAvatar'
import { useMinappPopup } from '@renderer/hooks/useMinappPopup'
import { useMinapps } from '@renderer/hooks/useMinapps'
import useNavBackgroundColor from '@renderer/hooks/useNavBackgroundColor'
import { modelGenerating, useRuntime } from '@renderer/hooks/useRuntime'
import { useSettings } from '@renderer/hooks/useSettings'
import { usePluginSystem } from '@renderer/services/PluginSystem'
import { isEmoji } from '@renderer/utils'
import type { MenuProps } from 'antd'
import { Avatar, Dropdown, Tooltip } from 'antd'
import {
  CircleHelp,
  FileSearch,
  Folder,
  FolderGit,
  Globe,
  Languages,
  LayoutGrid,
  MessageSquareQuote,
  Microscope,
  Moon,
  Palette,
  Settings,
  Sparkle,
  Sun
} from 'lucide-react'
import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import DragableList from '../DragableList'
import MinAppIcon from '../Icons/MinAppIcon'
import UserPopup from '../Popups/UserPopup'

// 添加全局Window类型定义
declare global {
  interface Window {
    openTextTools?: () => void
    handleTextToolsClick?: () => void
    pluginHandlers?: Record<string, () => void>
    [key: string]: any // 允许索引访问任意属性
  }
}

const Sidebar: FC = () => {
  const { hideMinappPopup, openMinapp } = useMinappPopup()
  const { minappShow, currentMinappId } = useRuntime()
  const { sidebarIcons } = useSettings()
  const { pinned } = useMinapps()

  const { pathname } = useLocation()
  const navigate = useNavigate()

  const { theme, settingTheme, toggleTheme } = useTheme()
  const avatar = useAvatar()
  const { t } = useTranslation()

  const onEditUser = () => UserPopup.show()

  const backgroundColor = useNavBackgroundColor()

  const showPinnedApps = pinned.length > 0 && sidebarIcons.visible.includes('minapp')

  const to = async (path: string) => {
    await modelGenerating()
    navigate(path)
  }

  const docsId = 'cherrystudio-docs'
  const onOpenDocs = () => {
    openMinapp({
      id: docsId,
      name: t('docs.title'),
      url: 'https://docs.cherry-ai.com/',
      logo: AppLogo
    })
  }

  return (
    <Container id="app-sidebar" style={{ backgroundColor, zIndex: minappShow ? 10000 : 'initial' }}>
      {isEmoji(avatar) ? (
        <EmojiAvatar onClick={onEditUser}>{avatar}</EmojiAvatar>
      ) : (
        <AvatarImg src={avatar || UserAvatar} draggable={false} className="nodrag" onClick={onEditUser} />
      )}
      <MainMenusContainer>
        <Menus onClick={hideMinappPopup}>
          <MainMenus />
        </Menus>
        <SidebarOpenedMinappTabs />
        {showPinnedApps && (
          <AppsContainer>
            <Divider />
            <Menus>
              <PinnedApps />
            </Menus>
          </AppsContainer>
        )}
      </MainMenusContainer>
      <Menus>
        <Tooltip title={t('docs.title')} mouseEnterDelay={0.8} placement="right">
          <Icon theme={theme} onClick={onOpenDocs} className={minappShow && currentMinappId === docsId ? 'active' : ''}>
            <CircleHelp size={20} className="icon" />
          </Icon>
        </Tooltip>
        <Tooltip
          title={t('settings.theme.title') + ': ' + t(`settings.theme.${settingTheme}`)}
          mouseEnterDelay={0.8}
          placement="right">
          <Icon theme={theme} onClick={() => toggleTheme()}>
            {settingTheme === 'auto' ? (
              <div style={{ position: 'relative' }}>
                <Sun size={20} className="icon" style={{ opacity: 0.5 }} />
                <Moon size={14} className="icon" style={{ position: 'absolute', bottom: -2, right: -2 }} />
              </div>
            ) : theme === 'dark' ? (
              <Moon size={20} className="icon" />
            ) : (
              <Sun size={20} className="icon" />
            )}
          </Icon>
        </Tooltip>
        <Tooltip title={t('settings.title')} mouseEnterDelay={0.8} placement="right">
          <StyledLink
            onClick={async () => {
              hideMinappPopup()
              await to('/settings/provider')
            }}>
            <Icon theme={theme} className={pathname.startsWith('/settings') && !minappShow ? 'active' : ''}>
              <Settings size={20} className="icon" />
            </Icon>
          </StyledLink>
        </Tooltip>
      </Menus>
    </Container>
  )
}

const MainMenus: FC = () => {
  const { hideMinappPopup } = useMinappPopup()
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { sidebarIcons } = useSettings()
  const { minappShow } = useRuntime()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { plugins } = usePluginSystem()

  // 定义功能类型
  interface AppFunction {
    id: string
    name: string
    isActive: boolean
    icon: string
    requiredModules: string[]
  }

  // 从插件系统获取功能列表
  const [functions, setFunctions] = useState<AppFunction[]>([])

  // 添加强制刷新计数器
  const [forceUpdateCounter, setForceUpdateCounter] = useState(0)

  // 添加一个全局钩子，确保插件可以劫持DOM事件
  useEffect(() => {
    // 特殊处理：添加一个全局函数用于帮助插件劫持DOM事件
    window.enableCustomPluginDOM = function (pluginId, handler) {
      console.log(`启用插件 ${pluginId} 的DOM事件劫持`)

      // 查找并劫持相应图标的DOM事件
      setTimeout(() => {
        const sidebarIcons = document.querySelectorAll('#app-sidebar .icon')
        sidebarIcons.forEach((icon) => {
          // 通过图标内容查找
          const parent = icon.closest('[role="button"]') || icon.closest('.StyledLink') || icon.parentElement

          if (parent) {
            // 转换为HTMLElement以访问onclick属性
            const htmlElement = parent as HTMLElement

            if (!htmlElement.hasAttribute('data-plugin-patched')) {
              // 设置数据属性以标记此元素
              htmlElement.setAttribute('data-plugin-id', pluginId)
              htmlElement.setAttribute('data-plugin-patched', 'ready')

              // 保存原始的onclick函数
              const originalOnclick = htmlElement.onclick

              // 设置新的onclick函数
              htmlElement.onclick = function (e) {
                // 调用原始处理函数
                if (originalOnclick) originalOnclick.call(this, e)

                // 如果是目标插件的图标，执行自定义处理
                // 使用Element类型断言
                const element = this as HTMLElement
                if (element.getAttribute && element.getAttribute('data-plugin-id') === pluginId) {
                  e.stopPropagation()
                  e.preventDefault()
                  console.log(`插件 ${pluginId} DOM事件触发`)
                  if (typeof handler === 'function') {
                    handler(e)
                  }
                  return false
                }
                return true
              }

              console.log(`为插件 ${pluginId} 准备了DOM事件劫持`)
            }
          }
        })
      }, 500)
    }

    // 清理函数
    return () => {
      delete window.enableCustomPluginDOM
    }
  }, [])

  // 监听URL变化，当从插件设置页面返回时刷新
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const pluginParam = urlParams.get('plugin')

    // 如果URL参数中有plugin，记录下来
    if (pathname.includes('/settings/modules')) {
      // 用户在插件设置页面
      sessionStorage.setItem('wasOnPluginPage', 'true')
      // 如果有插件参数，也保存下来
      if (pluginParam) {
        sessionStorage.setItem('lastPluginParam', pluginParam)
      }
    } else if (sessionStorage.getItem('wasOnPluginPage') === 'true') {
      // 用户从插件设置页面返回，延迟刷新
      sessionStorage.removeItem('wasOnPluginPage')
      const lastPlugin = sessionStorage.getItem('lastPluginParam')
      if (lastPlugin) {
        sessionStorage.removeItem('lastPluginParam')
      }

      // 延迟刷新以确保状态已更新
      setTimeout(() => {
        console.log('从插件设置页返回，强制刷新侧边栏')
        setForceUpdateCounter((prev) => prev + 1)
      }, 300)
    }
  }, [pathname])

  // 从插件系统获取插件状态
  useEffect(() => {
    try {
      // 首先从localStorage读取现有的功能设置
      const existingSettingsJson = localStorage.getItem('functionSettings')
      let existingFunctions: AppFunction[] = []

      if (existingSettingsJson) {
        try {
          existingFunctions = JSON.parse(existingSettingsJson)
          console.log('读取现有功能设置:', existingFunctions)
        } catch (e) {
          console.error('解析functionSettings失败:', e)
        }
      }

      // 定义内置插件
      const builtInPlugins = ['markdown-editor', 'code-analyzer', 'simple-calendar']

      // 使用插件状态更新内置功能列表
      const builtInFunctions: AppFunction[] = [
        {
          id: 'markdown-editor',
          name: '高级Markdown编辑器',
          isActive: !!plugins.find((p) => p.id === 'markdown-editor' && p.state.isActive),
          icon: '📝',
          requiredModules: ['npm']
        },
        {
          id: 'code-analyzer',
          name: '代码分析工具',
          isActive: !!plugins.find((p) => p.id === 'code-analyzer' && p.state.isActive),
          icon: '🔍',
          requiredModules: ['vue-codemirror-multi']
        },
        {
          id: 'simple-calendar',
          name: '简易日历',
          isActive: !!plugins.find((p) => p.id === 'simple-calendar' && p.state.isActive),
          icon: '📅',
          requiredModules: ['dayjs']
        }
      ]

      // 获取自定义插件并添加到功能列表中
      const customPluginsFromSystem = plugins.filter((p) => !builtInPlugins.includes(p.id))
      console.log(
        '从插件系统获取的自定义插件:',
        customPluginsFromSystem.map((p) => ({ id: p.id, active: p.state.isActive }))
      )

      // 为解决插件状态不一致的问题，创建一个Map保存最新状态
      const pluginStateMap = new Map()

      // 记录所有插件的最新状态
      plugins.forEach((p) => {
        pluginStateMap.set(p.id, p.state.isActive)
      })

      // 额外检查：直接从localStorage中读取plugins状态
      try {
        const storedPlugins = localStorage.getItem('plugins')
        if (storedPlugins) {
          const parsedPlugins = JSON.parse(storedPlugins)
          // 更新Map中的状态
          parsedPlugins.forEach((p) => {
            // 如果localStorage中的插件是激活状态，优先使用该状态
            if (p.state && p.state.isActive) {
              console.log(`从localStorage获取插件 ${p.id} 激活状态: ${p.state.isActive}`)
              pluginStateMap.set(p.id, true)
            }
          })
        }
      } catch (e) {
        console.error('读取localStorage中的plugins失败:', e)
      }

      // 另一种方法：使用自定义激活状态缓存
      // 从localStorage读取已知激活的插件ID
      try {
        const activatedPluginsJson = localStorage.getItem('activatedPlugins')
        if (activatedPluginsJson) {
          const activatedPlugins = JSON.parse(activatedPluginsJson)
          // 更新Map中的状态
          activatedPlugins.forEach((id) => {
            console.log(`从activatedPlugins获取插件 ${id} 激活状态: true`)
            pluginStateMap.set(id, true)
          })
        }
      } catch (e) {
        console.error('读取activatedPlugins失败:', e)
      }

      // 写入一个额外的key用于记住已激活的插件
      // 这是一个备用机制，确保激活状态被记住
      if (!localStorage.getItem('activatedPlugins')) {
        // 初始化为空数组
        localStorage.setItem('activatedPlugins', '[]')
      }

      // 手动为特定插件设置激活状态（用于调试）
      const debugPluginId = 'wode'
      if (pathname.includes('/settings/modules') && window.location.search.includes(`plugin=${debugPluginId}`)) {
        console.log(`为插件 ${debugPluginId} 设置强制激活状态`)
        pluginStateMap.set(debugPluginId, true)

        // 更新已激活插件列表
        try {
          const activatedPluginsJson = localStorage.getItem('activatedPlugins')
          if (activatedPluginsJson) {
            const activatedPlugins = JSON.parse(activatedPluginsJson)
            if (!activatedPlugins.includes(debugPluginId)) {
              activatedPlugins.push(debugPluginId)
              localStorage.setItem('activatedPlugins', JSON.stringify(activatedPlugins))
            }
          }
        } catch (e) {
          console.error('更新activatedPlugins失败:', e)
        }
      }

      console.log('最终整合后的插件激活状态:', Object.fromEntries([...pluginStateMap.entries()]))

      const customPluginFunctions = customPluginsFromSystem.map((p) => {
        // 从Map中获取最新状态
        const isActive = pluginStateMap.get(p.id) || false
        const iconValue = typeof p.icon === 'string' ? p.icon : '🧩'
        console.log(`处理自定义插件 ${p.id}, 最终激活状态: ${isActive}, 图标: ${iconValue}`)
        return {
          id: p.id,
          name: p.name || p.id,
          isActive: isActive,
          icon: iconValue,
          requiredModules: p.requiredModules || []
        }
      })

      // 合并内置插件和自定义插件
      // 1. 保留所有非内置插件（从existingFunctions中）
      const customFunctions = existingFunctions.filter((f) => !builtInPlugins.includes(f.id))

      // 2. 更新已有的自定义插件状态或添加新插件
      customPluginFunctions.forEach((newFunc) => {
        const existingIndex = customFunctions.findIndex((f) => f.id === newFunc.id)
        if (existingIndex >= 0) {
          // 始终使用newFunc中的激活状态，它来自插件系统的最新状态
          customFunctions[existingIndex].isActive = newFunc.isActive
          console.log(`更新插件 ${newFunc.id} 激活状态为: ${newFunc.isActive}`)
        } else {
          customFunctions.push(newFunc)
          console.log(`添加新插件: ${newFunc.id}, 激活状态: ${newFunc.isActive}`)
        }
      })

      // 3. 使用最新的内置插件状态和自定义插件
      const mergedFunctions = [...builtInFunctions, ...customFunctions]

      // 打印所有功能状态
      console.log(
        '合并后的功能列表详情:',
        mergedFunctions.map((f) => ({ id: f.id, active: f.isActive }))
      )

      // 4. 更新状态 - 只有当有变化时才设置状态
      // 避免无限循环更新
      if (JSON.stringify(functions) !== JSON.stringify(mergedFunctions)) {
        setFunctions(mergedFunctions)

        // 5. 将合并后的设置保存回localStorage
        localStorage.setItem('functionSettings', JSON.stringify(mergedFunctions))
        console.log('已保存更新后的功能设置:', mergedFunctions)
      }
    } catch (error) {
      console.error('更新功能设置时出错:', error)
    }
  }, [plugins, forceUpdateCounter]) // 移除pathname依赖，pathname变化不应该触发插件状态重新计算

  const isRoute = (path: string): string => (pathname === path && !minappShow ? 'active' : '')
  const isRoutes = (path: string): string => (pathname.startsWith(path) && !minappShow ? 'active' : '')

  const iconMap = {
    assistants: <MessageSquareQuote size={18} className="icon" />,
    agents: <Sparkle size={18} className="icon" />,
    paintings: <Palette size={18} className="icon" />,
    translate: <Languages size={18} className="icon" />,
    minapp: <LayoutGrid size={18} className="icon" />,
    knowledge: <FileSearch size={18} className="icon" />,
    files: <Folder size={17} className="icon" />,
    workspace: <FolderGit size={17} className="icon" />,
    deepresearch: <Microscope size={18} className="icon" />,
    browser: <Globe size={18} className="icon" />
  }

  const pathMap = {
    assistants: '/',
    agents: '/agents',
    paintings: '/paintings',
    translate: '/translate',
    minapp: '/apps',
    knowledge: '/knowledge',
    files: '/files',
    workspace: '/workspace',
    deepresearch: '/deepresearch',
    browser: '/browser'
  }

  // 生成系统菜单
  const systemMenus = sidebarIcons.visible.map((icon) => {
    const path = pathMap[icon]
    const isActive = path === '/' ? isRoute(path) : isRoutes(path)

    return (
      <Tooltip key={icon} title={t(`${icon}.title`)} mouseEnterDelay={0.8} placement="right">
        <StyledLink
          onClick={async () => {
            hideMinappPopup()
            await modelGenerating()
            navigate(path)
          }}>
          <Icon theme={theme} className={isActive}>
            {iconMap[icon]}
          </Icon>
        </StyledLink>
      </Tooltip>
    )
  })

  // 生成功能菜单（替代模块菜单）
  const functionMenus = functions
    .filter((func) => {
      const isActive = func.isActive
      if (isActive) {
        console.log(`功能 ${func.id} 是激活状态，图标: ${func.icon}`)
      }
      return isActive
    })
    .map((func) => {
      const path = `/function/${func.id}`
      const isActive = pathname.startsWith(path) && !minappShow ? 'active' : ''

      // 内置插件ID列表（与上方useEffect中定义的相同）
      const builtInPlugins = ['markdown-editor', 'code-analyzer', 'simple-calendar']

      // 对不同功能使用不同的路径
      const handleClick = async (e?: React.MouseEvent) => {
        try {
          hideMinappPopup()
          await modelGenerating()

          if (func.id === 'simple-calendar') {
            console.log('导航到日历')
            navigate('/calendar')
          } else if (func.id === 'simple-text-tools') {
            // 处理文本工具插件的点击
            console.log('打开简易文本工具')
            if (window.openTextTools) {
              window.openTextTools()
            } else {
              console.error('文本工具未初始化')
            }
          } else {
            // 自定义插件特殊处理
            if (!builtInPlugins.includes(func.id)) {
              // 阻止事件冒泡和默认行为
              if (e) {
                e.stopPropagation()
                e.preventDefault()
              }

              // 记录点击但不执行任何导航
              console.log(`自定义插件点击: ${func.id}，已阻止默认事件，DOM事件处理可以接管`)
              return
            } else {
              const targetPath = `/function/${func.id}`
              console.log(`打开系统功能: ${func.id}, 导航到: ${targetPath}`)
              navigate(targetPath)
            }
          }
        } catch (error) {
          console.error('点击处理出错:', error)
        }
      }

      // 确保图标是字符串类型
      const iconDisplay = typeof func.icon === 'string' ? func.icon : '🧩'

      return (
        <Tooltip key={func.id} title={func.name} mouseEnterDelay={0.8} placement="right">
          <StyledLink onClick={handleClick}>
            <Icon theme={theme} className={isActive}>
              <FunctionIcon>{iconDisplay}</FunctionIcon>
            </Icon>
          </StyledLink>
        </Tooltip>
      )
    })

  // 返回系统菜单和功能菜单的组合
  return (
    <>
      {systemMenus}
      {functionMenus.length > 0 && <MenuDivider />}
      {functionMenus}
    </>
  )
}

/** Tabs of opened minapps in sidebar */
const SidebarOpenedMinappTabs: FC = () => {
  const { minappShow, openedKeepAliveMinapps, currentMinappId } = useRuntime()
  const { openMinappKeepAlive, hideMinappPopup, closeMinapp, closeAllMinapps } = useMinappPopup()
  const { showOpenedMinappsInSidebar } = useSettings() // 获取控制显示的设置
  const { theme } = useTheme()
  const { t } = useTranslation()

  const handleOnClick = (app: any) => {
    if (minappShow && currentMinappId === app.id) {
      hideMinappPopup()
    } else {
      openMinappKeepAlive(app)
    }
  }

  // animation for minapp switch indicator
  useEffect(() => {
    //hacky way to get the height of the icon
    const iconDefaultHeight = 40
    const iconDefaultOffset = 17
    const container = document.querySelector('.TabsContainer') as HTMLElement
    const activeIcon = document.querySelector('.TabsContainer .opened-active') as HTMLElement

    let indicatorTop = 0,
      indicatorRight = 0
    if (minappShow && activeIcon && container) {
      indicatorTop = activeIcon.offsetTop + activeIcon.offsetHeight / 2 - 4 // 4 is half of the indicator's height (8px)
      indicatorRight = 0
    } else {
      indicatorTop =
        ((openedKeepAliveMinapps.length > 0 ? openedKeepAliveMinapps.length : 1) / 2) * iconDefaultHeight +
        iconDefaultOffset -
        4
      indicatorRight = -50
    }
    container.style.setProperty('--indicator-top', `${indicatorTop}px`)
    container.style.setProperty('--indicator-right', `${indicatorRight}px`)
  }, [currentMinappId, openedKeepAliveMinapps, minappShow])

  // 检查是否需要显示已打开小程序组件
  const isShowOpened = showOpenedMinappsInSidebar && openedKeepAliveMinapps.length > 0

  // 如果不需要显示，返回空容器保持动画效果但不显示内容
  if (!isShowOpened) return <TabsContainer className="TabsContainer" />

  return (
    <TabsContainer className="TabsContainer">
      <Divider />
      <TabsWrapper>
        <Menus>
          {openedKeepAliveMinapps.map((app) => {
            const menuItems: MenuProps['items'] = [
              {
                key: 'closeApp',
                label: t('minapp.sidebar.close.title'),
                onClick: () => {
                  closeMinapp(app.id)
                }
              },
              {
                key: 'closeAllApp',
                label: t('minapp.sidebar.closeall.title'),
                onClick: () => {
                  closeAllMinapps()
                }
              }
            ]
            const isActive = minappShow && currentMinappId === app.id

            return (
              <Tooltip key={app.id} title={app.name} mouseEnterDelay={0.8} placement="right">
                <StyledLink>
                  <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']} overlayStyle={{ zIndex: 10000 }}>
                    <Icon
                      theme={theme}
                      onClick={() => handleOnClick(app)}
                      className={`${isActive ? 'opened-active' : ''}`}>
                      <MinAppIcon size={20} app={app} style={{ borderRadius: 6 }} />
                    </Icon>
                  </Dropdown>
                </StyledLink>
              </Tooltip>
            )
          })}
        </Menus>
      </TabsWrapper>
    </TabsContainer>
  )
}

const PinnedApps: FC = () => {
  const { pinned, updatePinnedMinapps } = useMinapps()
  const { t } = useTranslation()
  const { minappShow, openedKeepAliveMinapps, currentMinappId } = useRuntime()
  const { theme } = useTheme()
  const { openMinappKeepAlive } = useMinappPopup()

  return (
    <DragableList list={pinned} onUpdate={updatePinnedMinapps} listStyle={{ marginBottom: 5 }}>
      {(app) => {
        const menuItems: MenuProps['items'] = [
          {
            key: 'togglePin',
            label: t('minapp.sidebar.remove.title'),
            onClick: () => {
              const newPinned = pinned.filter((item) => item.id !== app.id)
              updatePinnedMinapps(newPinned)
            }
          }
        ]
        const isActive = minappShow && currentMinappId === app.id
        return (
          <Tooltip key={app.id} title={app.name} mouseEnterDelay={0.8} placement="right">
            <StyledLink>
              <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']} overlayStyle={{ zIndex: 10000 }}>
                <Icon
                  theme={theme}
                  onClick={() => openMinappKeepAlive(app)}
                  className={`${isActive ? 'active' : ''} ${openedKeepAliveMinapps.some((item) => item.id === app.id) ? 'opened-minapp' : ''}`}>
                  <MinAppIcon size={20} app={app} style={{ borderRadius: 6 }} />
                </Icon>
              </Dropdown>
            </StyledLink>
          </Tooltip>
        )
      }}
    </DragableList>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  padding-bottom: 12px;
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  height: ${isMac ? 'calc(100vh - var(--navbar-height))' : '100vh'};
  -webkit-app-region: drag !important;
  margin-top: ${isMac ? 'var(--navbar-height)' : 0};
`

const AvatarImg = styled(Avatar)`
  width: 31px;
  height: 31px;
  background-color: var(--color-background-soft);
  margin-bottom: ${isMac ? '12px' : '12px'};
  margin-top: ${isMac ? '0px' : '2px'};
  border: none;
  cursor: pointer;
`

const EmojiAvatar = styled.div`
  width: 31px;
  height: 31px;
  background-color: var(--color-background-soft);
  margin-bottom: ${isMac ? '12px' : '12px'};
  margin-top: ${isMac ? '0px' : '2px'};
  border-radius: 20%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  cursor: pointer;
  -webkit-app-region: none;
  border: 0.5px solid var(--color-border);
  font-size: 20px;
`

const MainMenusContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
`

const Menus = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
`

const Icon = styled.div<{ theme: string }>`
  width: 35px;
  height: 35px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  box-sizing: border-box;
  -webkit-app-region: none;
  border: 0.5px solid transparent;
  &:hover {
    background-color: ${({ theme }) => (theme === 'dark' ? 'var(--color-black)' : 'var(--color-white)')};
    opacity: 0.8;
    cursor: pointer;
    .icon {
      color: var(--color-icon-white);
    }
  }
  &.active {
    background-color: ${({ theme }) => (theme === 'dark' ? 'var(--color-black)' : 'var(--color-white)')};
    border: 0.5px solid var(--color-border);
    .icon {
      color: var(--color-primary);
    }
  }

  @keyframes borderBreath {
    0% {
      opacity: 0.1;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.1;
    }
  }

  &.opened-minapp {
    position: relative;
  }
  &.opened-minapp::after {
    content: '';
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    border-radius: inherit;
    opacity: 0.3;
    border: 0.5px solid var(--color-primary);
  }
`

const StyledLink = styled.div`
  text-decoration: none;
  -webkit-app-region: none;
  &* {
    user-select: none;
  }
`

const AppsContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  overflow-x: hidden;
  margin-bottom: 10px;
  -webkit-app-region: none;
  &::-webkit-scrollbar {
    display: none;
  }
`

const Divider = styled.div`
  width: 50%;
  margin: 8px 0;
  border-bottom: 0.5px solid var(--color-border);
`

const TabsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  -webkit-app-region: none;
  position: relative;
  width: 100%;

  &::after {
    content: '';
    position: absolute;
    right: var(--indicator-right, 0);
    top: var(--indicator-top, 0);
    width: 4px;
    height: 8px;
    background-color: var(--color-primary);
    transition:
      top 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      right 0.3s ease-in-out;
    border-radius: 2px;
  }

  &::-webkit-scrollbar {
    display: none;
  }
`

const TabsWrapper = styled.div`
  background-color: rgba(128, 128, 128, 0.1);
  border-radius: 20px;
  overflow: hidden;
`

const MenuDivider = styled.div`
  width: 100%;
  height: 0.5px;
  background-color: var(--color-border);
  margin: 8px 0;
`

const FunctionIcon = styled.div`
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
`

export default Sidebar
