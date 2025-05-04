import { motion } from 'framer-motion'
import styled from 'styled-components'

// 主容器
export const AnimatedTabsContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  background-color: var(--color-bg-1);
  border-bottom: 1px solid var(--color-border);
  position: relative;
  overflow: hidden;
  user-select: none;
`

// 标签页列表容器
export const TabsListContainer = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  height: 40px;
  padding: 0 4px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */

  &::-webkit-scrollbar {
    display: none; /* Chrome, Safari, Opera */
  }
`

// 单个标签页
export const TabItem = styled(motion.div)<{ $isActive: boolean }>`
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 12px;
  margin: 0 1px;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  position: relative;
  background-color: ${({ $isActive }) => ($isActive ? 'var(--color-bg-2)' : 'transparent')};
  color: ${({ $isActive }) => ($isActive ? 'var(--color-text-1)' : 'var(--color-text-2)')};
  font-weight: ${({ $isActive }) => ($isActive ? '500' : 'normal')};
  transition: all 0.2s ease;
  min-width: 120px;
  max-width: 240px;
  flex-shrink: 0;
  border-bottom: ${({ $isActive }) => ($isActive ? '2px solid var(--color-primary)' : 'none')};

  &:hover {
    background-color: ${({ $isActive }) => ($isActive ? 'var(--color-bg-2)' : 'var(--color-bg-3)')};
  }

  &.dragging {
    opacity: 0.7;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transform: scale(1.02);
  }
`

// 标签页内容
export const TabContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  overflow: hidden;
`

// 标签页标题和图标容器
export const TabInfo = styled.div`
  display: flex;
  align-items: center;
  overflow: hidden;
  flex: 1;
`

// 标签页图标
export const TabIcon = styled.img`
  width: 16px;
  height: 16px;
  margin-right: 8px;
  flex-shrink: 0;
`

// 标签页标题
export const TabTitle = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  max-width: 140px; /* 限制最大宽度 */
  display: inline-block;
`

// 关闭按钮
export const CloseButton = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  margin-left: 8px;
  opacity: 0.7;
  flex-shrink: 0;

  &:hover {
    background-color: var(--color-bg-4);
    opacity: 1;
  }
`

// 添加标签页按钮
export const AddTabButton = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  margin-left: 4px;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    background-color: var(--color-bg-3);
  }
`

// 标签页悬停指示器
export const TabHoverIndicator = styled(motion.div)`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background-color: var(--color-bg-3);
  border-radius: 6px;
  z-index: -1;
  pointer-events: none;
`

// 标签页活动指示器
export const TabActiveIndicator = styled(motion.div)`
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background-color: var(--color-primary);
  z-index: 1;
  pointer-events: none;
`

// 拖拽占位符
export const DragPlaceholder = styled(motion.div)`
  position: absolute;
  top: 0;
  height: 100%;
  background-color: var(--color-bg-4);
  border-radius: 6px;
  z-index: -2;
  opacity: 0.5;
  pointer-events: none;
`
