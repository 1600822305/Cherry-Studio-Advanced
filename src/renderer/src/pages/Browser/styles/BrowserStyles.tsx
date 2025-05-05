import styled from 'styled-components'

export const BrowserContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
`

export const NavBar = styled.div`
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background-color: var(--color-bg-1);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag; /* 允许拖动窗口 */
`

export const AddressBar = styled.input`
  flex: 1;
  margin: 0 12px;
  max-width: calc(75% - 320px); // 减少四分之一的长度
  -webkit-app-region: no-drag; /* 确保输入框可以正常交互 */
`

export const TabsContainer = styled.div`
  background-color: var(--color-bg-1);
  border-bottom: 1px solid var(--color-border);

  .ant-tabs-nav {
    margin-bottom: 0;
  }

  .ant-tabs-tab {
    padding: 8px 16px;

    .anticon-close {
      margin-left: 8px;
      font-size: 12px;
      opacity: 0.5;

      &:hover {
        opacity: 1;
      }
    }
  }

  .add-tab-button {
    margin: 0 8px;
    padding: 0 8px;
    background: transparent;
    border: none;
    cursor: pointer;

    &:hover {
      color: var(--color-primary);
    }
  }
`

export const WebviewContainer = styled.div<{ $chatSidebarOpen?: boolean; $chatSidebarExpanded?: boolean }>`
  flex: 1;
  height: calc(100% - 90px); // 调整高度以适应选项卡
  position: relative;
  width: 100%;
  transition:
    width 0.3s ease,
    margin-right 0.3s ease;
  ${(props) =>
    props.$chatSidebarOpen &&
    !props.$chatSidebarExpanded &&
    `
    width: calc(100% - 25%);
    margin-right: 25%;
  `}
  ${(props) =>
    props.$chatSidebarOpen &&
    props.$chatSidebarExpanded &&
    `
    width: calc(100% - 40%);
    margin-right: 40%;
  `}

  .webview-wrapper {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    visibility: hidden;
    z-index: 1;
    pointer-events: auto;
    transition: width 0.3s ease;

    &.active {
      visibility: visible;
      z-index: 2;
    }
  }

  & webview {
    width: 100%;
    height: 100%;
    border: none;
    outline: none;
    z-index: 1;
  }
`

export const GoogleLoginTip = styled.div`
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 10px;
  z-index: 1000;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  max-width: 300px;

  .tip-content {
    text-align: left;
    position: relative;

    p {
      margin-bottom: 10px;
      font-size: 13px;
    }
  }

  .close-button {
    position: absolute;
    top: -5px;
    right: -5px;
    background: #444;
    color: white;
    border: none;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 12px;

    &:hover {
      background: #666;
    }
  }
`

export const FaviconImage = styled.img`
  width: 16px;
  height: 16px;
  margin-right: 8px;
  vertical-align: middle;
`
