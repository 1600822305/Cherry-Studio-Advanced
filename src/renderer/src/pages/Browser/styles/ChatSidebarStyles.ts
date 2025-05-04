import styled from 'styled-components'

// 聊天侧边栏相关样式
export const ChatSidebarContainer = styled.div<{ $expanded: boolean }>`
  position: fixed;
  top: 42px;
  right: 0;
  width: ${(props) => (props.$expanded ? '40%' : '25%')};
  height: calc(100% - 60px);
  background-color: var(--color-bg-1);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
  z-index: 9999; /* 提高z-index确保在最上层 */
  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
  pointer-events: auto; /* 确保容器可以接收点击事件 */
`

export const ChatSidebarHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between; /* 确保标题和按钮分开 */
  padding: 6px 12px;
  border-bottom: 1px solid var(--color-border);
  font-weight: 500;
  height: 36px;
  position: relative;
  width: 100%; /* 确保占满整个宽度 */

  /* 左侧按钮容器 */
  .header-left-buttons {
    display: flex;
    align-items: center;
    position: relative; /* 确保定位上下文 */
    z-index: 10000; /* 确保按钮在最上层 */
    pointer-events: auto; /* 确保可以接收点击事件 */
    margin-right: 10px; /* 与标题保持一定距离 */
  }

  /* 右侧按钮容器 */
  .header-buttons {
    display: flex;
    align-items: center;
    position: relative; /* 确保定位上下文 */
    z-index: 10000; /* 确保按钮在最上层 */
    pointer-events: auto; /* 确保可以接收点击事件 */
    margin-left: auto; /* 推到右侧 */
  }

  /* 确保按钮可以点击 */
  .ant-btn {
    pointer-events: auto !important; /* 强制确保按钮可点击 */
    z-index: 10001; /* 确保按钮在最上层 */
    position: relative; /* 确保定位上下文 */
  }

  /* 确保Space组件可以点击 */
  .ant-space {
    pointer-events: auto !important; /* 强制确保可点击 */
    z-index: 10001; /* 确保在最上层 */
    position: relative; /* 确保定位上下文 */
  }

  /* 确保图标可点击 */
  .anticon {
    pointer-events: auto !important; /* 强制确保图标可点击 */
  }
`

export const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`

export const MessageItem = styled.div<{ $isUser: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: ${(props) => (props.$isUser ? 'flex-end' : 'flex-start')};
  margin-bottom: 10px;
`

export const MessageContent = styled.div`
  background-color: ${(props) => (props.theme.mode === 'dark' ? 'var(--color-bg-3)' : 'var(--color-bg-2)')};
  padding: 10px 14px;
  border-radius: 12px;
  max-width: 85%;
  word-break: break-word;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);

  /* 确保Markdown内容正确显示 */
  .markdown {
    font-size: 14px;

    p {
      margin: 0.5em 0;
    }

    p:first-child {
      margin-top: 0;
    }

    p:last-child {
      margin-bottom: 0;
    }

    ul,
    ol {
      margin: 0.5em 0;
      padding-left: 1.5em;
    }

    pre {
      margin: 0.5em 0;
      padding: 8px;
      border-radius: 4px;
      background-color: ${(props) => (props.theme.mode === 'dark' ? 'var(--color-bg-1)' : 'var(--color-bg-3)')};
      overflow-x: auto;
    }

    code {
      font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
      font-size: 13px;
    }

    blockquote {
      margin: 0.5em 0;
      padding-left: 1em;
      border-left: 3px solid var(--color-border);
      color: var(--color-text-3);
    }
  }
`

export const MessageTimestamp = styled.div`
  font-size: 11px;
  color: var(--color-text-3);
  margin-top: 4px;
  padding: 0 4px;
`

export const EmptyMessage = styled.div`
  text-align: center;
  color: var(--color-text-3);
  margin-top: 12px;
`

export const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  margin: 8px 0;
`

export const InputContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  border-top: 1px solid var(--color-border);
  gap: 6px;

  .ant-input {
    border-radius: 8px;
  }

  .input-row {
    display: flex;
    gap: 8px;

    button {
      align-self: flex-end;
    }
  }
`

export const ModelIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-3);
  padding: 0 4px;
  margin-bottom: 4px;

  .model-name {
    font-weight: 500;
    color: var(--color-text-2);
  }
`

export const ToolbarContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-top: 1px solid var(--color-border);
  background-color: var(--color-bg-1);
  position: relative;
  z-index: 100;

  .toolbar-buttons {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .toolbar-button {
    cursor: pointer;
    height: 32px;
    width: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 101;
  }
`
