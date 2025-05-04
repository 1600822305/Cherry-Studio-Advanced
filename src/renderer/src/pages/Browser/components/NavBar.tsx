import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  BugOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  ExportOutlined,
  HomeOutlined,
  LinkOutlined,
  LockOutlined,
  ReloadOutlined,
  StarOutlined,
  StopOutlined
} from '@ant-design/icons'
import { Button, Space, Tooltip } from 'antd'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NavBar as StyledNavBar } from '../styles/BrowserStyles'
import { ErrorIndicator, NavBarButtonGroup, SecurityIndicator, UrlBarContainer, UrlInput } from '../styles/NavBarStyles'
import BookmarkButton from './BookmarkButton'
import ChatButton from './ChatButton'
import ExtensionManager from './ExtensionManager'
import ExtensionToolbar from './ExtensionToolbar'

interface NavBarProps {
  currentUrl: string
  displayUrl: string
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
  navigationError: string | null
  linkOpenMode: 'newTab' | 'newWindow'
  title: string
  favicon?: string
  activeWebview?: React.RefObject<Electron.WebviewTag> // 当前活动的webview引用
  onUrlChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onUrlSubmit: () => void
  onGoBack: () => void
  onGoForward: () => void
  onReload: (ignoreCache?: boolean) => void
  onStopLoading: () => void
  onHome: () => void
  onOpenDevTools: () => void
  onOpenExternal: () => void
  onClearData: () => void
  onToggleLinkOpenMode: () => void
  onOpenBookmarkManager: () => void
}

const NavBar: React.FC<NavBarProps> = ({
  currentUrl,
  displayUrl,
  canGoBack,
  canGoForward,
  isLoading,
  navigationError,
  linkOpenMode,
  title,
  favicon,
  activeWebview,
  onUrlChange,
  onUrlSubmit,
  onGoBack,
  onGoForward,
  onReload,
  onStopLoading,
  onHome,
  onOpenDevTools,
  onOpenExternal,
  onClearData,
  onToggleLinkOpenMode,
  onOpenBookmarkManager
}) => {
  const { t } = useTranslation()
  const inputRef = useRef<any>(null)
  const [isSecure, setIsSecure] = useState(true)
  const [isUrlFocused, setIsUrlFocused] = useState(false)
  const [showExtensionManager, setShowExtensionManager] = useState(false)

  const handleOpenExtensionManager = () => {
    setShowExtensionManager(true)
  }

  const handleCloseExtensionManager = () => {
    setShowExtensionManager(false)
  }

  // 检查URL是否安全 (https)
  useEffect(() => {
    if (currentUrl) {
      setIsSecure(currentUrl.startsWith('https://') || currentUrl === 'about:blank')
    }
  }, [currentUrl])

  // 处理键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+L 或 Alt+D 聚焦地址栏并全选
      if ((e.ctrlKey && e.key === 'l') || (e.altKey && e.key === 'd')) {
        e.preventDefault()
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      }

      // F5 刷新页面
      if (e.key === 'F5') {
        e.preventDefault()
        onReload(e.ctrlKey) // Ctrl+F5 强制刷新
      }

      // Alt+Left 后退
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        if (canGoBack) onGoBack()
      }

      // Alt+Right 前进
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        if (canGoForward) onGoForward()
      }

      // Escape 停止加载
      if (e.key === 'Escape' && isLoading) {
        e.preventDefault()
        onStopLoading()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canGoBack, canGoForward, isLoading, onGoBack, onGoForward, onReload, onStopLoading])

  // 右键菜单处理
  const handleContextMenu = () => {
    // 这里可以实现右键菜单功能
    // 例如复制URL、查看页面信息等
  }

  return (
    <StyledNavBar>
      <NavBarButtonGroup>
        <Space>
          <Tooltip title={t('browser.back')}>
            <Button
              icon={<ArrowLeftOutlined />}
              disabled={!canGoBack}
              onClick={onGoBack}
              onContextMenu={handleContextMenu}
            />
          </Tooltip>
          <Tooltip title={t('browser.forward')}>
            <Button
              icon={<ArrowRightOutlined />}
              disabled={!canGoForward}
              onClick={onGoForward}
              onContextMenu={handleContextMenu}
            />
          </Tooltip>

          {/* 停止加载按钮 */}
          {isLoading ? (
            <Tooltip title={t('browser.stop')}>
              <Button icon={<StopOutlined />} onClick={onStopLoading} danger />
            </Tooltip>
          ) : (
            <Tooltip title={`${t('browser.refresh')} (F5)`}>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => onReload(false)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onReload(true) // 右键点击强制刷新
                }}
              />
            </Tooltip>
          )}

          {/* 强制停止按钮 - 总是可见 */}
          <Tooltip title={t('browser.force_stop') || '强制停止'}>
            <Button icon={<StopOutlined />} onClick={onStopLoading} danger />
          </Tooltip>

          <Tooltip title={t('browser.home')}>
            <Button icon={<HomeOutlined />} onClick={onHome} />
          </Tooltip>
        </Space>
      </NavBarButtonGroup>

      <UrlBarContainer>
        {/* 安全指示器 */}
        <Tooltip title={isSecure ? t('browser.secure_connection') : t('browser.insecure_connection')}>
          <SecurityIndicator $isSecure={isSecure}>
            <LockOutlined />
          </SecurityIndicator>
        </Tooltip>

        <UrlInput
          ref={inputRef}
          value={isUrlFocused ? displayUrl : displayUrl || currentUrl}
          onChange={onUrlChange}
          onPressEnter={onUrlSubmit}
          onFocus={() => setIsUrlFocused(true)}
          onBlur={() => setIsUrlFocused(false)}
          placeholder={t('browser.url_placeholder')}
          spellCheck={false}
          autoComplete="off"
        />

        {/* 错误提示 */}
        {navigationError && (
          <Tooltip title={navigationError}>
            <ErrorIndicator onClick={() => onReload(true)}>
              <CloseCircleOutlined />
            </ErrorIndicator>
          </Tooltip>
        )}
      </UrlBarContainer>

      <NavBarButtonGroup>
        <Space>
          {/* 书签按钮 */}
          {currentUrl && <BookmarkButton url={currentUrl} title={title} favicon={favicon} />}

          {/* 书签管理按钮 */}
          <Tooltip title="管理书签">
            <Button icon={<StarOutlined />} onClick={onOpenBookmarkManager} />
          </Tooltip>

          {/* 链接打开方式切换按钮 */}
          <Tooltip title={linkOpenMode === 'newTab' ? '当前模式：新标签页' : '当前模式：独立窗口'}>
            <Button
              icon={<LinkOutlined />}
              onClick={onToggleLinkOpenMode}
              type={linkOpenMode === 'newWindow' ? 'primary' : 'default'}
            />
          </Tooltip>
          <Tooltip title={t('browser.devtools')}>
            <Button icon={<BugOutlined />} onClick={onOpenDevTools} />
          </Tooltip>
          <Tooltip title={t('browser.open_external')}>
            <Button icon={<ExportOutlined />} onClick={onOpenExternal} />
          </Tooltip>
          <Tooltip title={t('browser.clear_data')}>
            <Button icon={<DeleteOutlined />} onClick={onClearData} />
          </Tooltip>

          {/* 扩展管理按钮 */}
          <Tooltip title="管理扩展">
            <Button icon={<AppstoreOutlined />} onClick={handleOpenExtensionManager} />
          </Tooltip>

          {/* 聊天按钮 */}
          <ChatButton activeWebview={activeWebview} />
        </Space>

        {/* 扩展工具栏 */}
        <ExtensionToolbar onOpenExtensionManager={handleOpenExtensionManager} />
      </NavBarButtonGroup>

      {/* 扩展管理器 */}
      {showExtensionManager && (
        <ExtensionManager visible={showExtensionManager} onClose={handleCloseExtensionManager} />
      )}
    </StyledNavBar>
  )
}

export default NavBar
