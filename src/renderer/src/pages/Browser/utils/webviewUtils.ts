import { WebviewTag } from 'electron'

/**
 * 设置webview的布尔属性
 * 在React中，布尔属性需要作为字符串传递，而不是布尔值
 * @param webview webview元素
 */
export function setupWebviewBooleanAttributes(webview: WebviewTag) {
  if (webview.hasAttribute('data-allowpopups')) {
    webview.setAttribute('allowpopups', '')
  }
  if (webview.hasAttribute('data-disablewebsecurity')) {
    webview.setAttribute('disablewebsecurity', '')
  }
  if (webview.hasAttribute('data-plugins')) {
    webview.setAttribute('plugins', '')
  }
}

/**
 * 获取webview的标准属性配置
 * @returns webview属性配置对象
 */
export function getWebviewAttributes() {
  return {
    partition: 'persist:browser',
    webpreferences:
      'contextIsolation=no, javascript=yes, webgl=yes, webaudio=yes, allowRunningInsecureContent=yes, nodeIntegration=yes',
    'data-allowpopups': 'true',
    'data-disablewebsecurity': 'true',
    'data-plugins': 'true'
  }
}

/**
 * 检测webview是否需要重新设置事件监听器
 * 通过比较新旧webview引用来判断
 * @param existingWebview 现有的webview引用
 * @param newWebview 新的webview元素
 * @returns 是否需要重新设置
 */
export function shouldResetupWebview(existingWebview: WebviewTag | null, newWebview: WebviewTag): boolean {
  return !existingWebview || existingWebview !== newWebview
}
