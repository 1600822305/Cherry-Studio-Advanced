import { Model } from '@renderer/types'
import { WebviewTag } from 'electron'

import { visualWebInteraction } from './visualWebInteraction'
import { getWebviewContent } from './webContentUtils'

/**
 * 浏览器自动化操作类型
 */
export type BrowserAction =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'type'; selector: string; text: string }
  | { type: 'search'; engine: 'baidu' | 'google' | 'bing'; query: string }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'refresh' }
  | { type: 'scrollDown' }
  | { type: 'scrollUp' }
  | { type: 'getContent' }
  | { type: 'visualInteraction'; instruction: string; model?: Model }
  | { type: 'switchToTab'; tabIndex: number }
  | { type: 'listTabs' }
  | { type: 'closeTab'; tabIndex: number }
  | { type: 'createTab'; url: string; title?: string }

/**
 * 执行浏览器导航操作
 * @param webview webview元素
 * @param url 要导航到的URL
 */
export async function navigateTo(webview: WebviewTag | null, url: string): Promise<void> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    // 如果URL不包含协议，添加https://
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }

    // 导航到URL
    webview.src = url

    // 等待页面加载完成
    await new Promise<void>((resolve) => {
      const onLoadCommit = () => {
        webview.removeEventListener('did-finish-load', onLoadFinish)
        webview.removeEventListener('did-fail-load', onLoadFail)
      }

      const onLoadFinish = () => {
        onLoadCommit()
        resolve()
      }

      const onLoadFail = (event: Electron.DidFailLoadEvent) => {
        onLoadCommit()
        console.error('Failed to load page:', event)
        resolve() // 即使失败也继续执行
      }

      webview.addEventListener('did-finish-load', onLoadFinish)
      webview.addEventListener('did-fail-load', onLoadFail)
    })
  } catch (error) {
    console.error('Error navigating to URL:', error)
    throw new Error(`Failed to navigate to ${url}: ${error}`)
  }
}

/**
 * 在webview中点击指定的元素
 * @param webview webview元素
 * @param selector CSS选择器
 * @returns 点击操作的结果
 */
export async function clickElement(webview: WebviewTag | null, selector: string): Promise<boolean> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    // 执行JavaScript点击元素
    const result = await webview.executeJavaScript(`
      (function() {
        try {
          const element = document.querySelector('${selector}');
          if (!element) {
            return { success: false, error: 'Element not found' };
          }

          // 检查元素是否可见
          const rect = element.getBoundingClientRect();
          const isVisible = !!(rect.width || rect.height) &&
                           window.getComputedStyle(element).visibility !== 'hidden';

          if (!isVisible) {
            return { success: false, error: 'Element is not visible' };
          }

          // 滚动到元素位置
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // 等待一小段时间确保滚动完成（减少等待时间）
          return new Promise(resolve => {
            setTimeout(() => {
              try {
                // 模拟点击事件
                element.click();
                resolve({ success: true });
              } catch (clickError) {
                resolve({ success: false, error: 'Click failed: ' + clickError.message });
              }
            }, 200);
          });
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `)

    return result.success
  } catch (error) {
    console.error('Error clicking element:', error)
    throw new Error(`Failed to click element: ${error}`)
  }
}

/**
 * 在webview中的输入框中输入文本
 * @param webview webview元素
 * @param selector CSS选择器
 * @param text 要输入的文本
 * @returns 输入操作的结果
 */
export async function typeText(webview: WebviewTag | null, selector: string, text: string): Promise<boolean> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    // 执行JavaScript输入文本
    const result = await webview.executeJavaScript(`
      (function() {
        try {
          const element = document.querySelector('${selector}');
          if (!element) {
            return { success: false, error: 'Element not found' };
          }

          // 检查元素是否是输入元素
          if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
            return { success: false, error: 'Element is not an input or textarea' };
          }

          // 聚焦元素
          element.focus();

          // 清除现有内容
          element.value = '';

          // 输入新文本
          element.value = '${text.replace(/'/g, "\\'")}';

          // 触发input和change事件
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));

          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `)

    return result.success
  } catch (error) {
    console.error('Error typing text:', error)
    throw new Error(`Failed to type text: ${error}`)
  }
}

/**
 * 使用搜索引擎搜索
 * @param webview webview元素
 * @param engine 搜索引擎
 * @param query 搜索查询
 */
export async function search(
  webview: WebviewTag | null,
  engine: 'baidu' | 'google' | 'bing',
  query: string
): Promise<void> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    let url = ''

    // 根据搜索引擎构建URL
    switch (engine) {
      case 'baidu':
        url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`
        break
      case 'google':
        url = `https://www.google.com/search?q=${encodeURIComponent(query)}`
        break
      case 'bing':
        url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`
        break
      default:
        throw new Error(`Unsupported search engine: ${engine}`)
    }

    // 导航到搜索URL
    await navigateTo(webview, url)
  } catch (error) {
    console.error('Error searching:', error)
    throw new Error(`Failed to search for "${query}" using ${engine}: ${error}`)
  }
}

/**
 * 浏览器后退
 * @param webview webview元素
 */
export async function goBack(webview: WebviewTag | null): Promise<void> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    if (webview.canGoBack()) {
      webview.goBack()
    } else {
      throw new Error('Cannot go back')
    }
  } catch (error) {
    console.error('Error going back:', error)
    throw new Error(`Failed to go back: ${error}`)
  }
}

/**
 * 浏览器前进
 * @param webview webview元素
 */
export async function goForward(webview: WebviewTag | null): Promise<void> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    if (webview.canGoForward()) {
      webview.goForward()
    } else {
      throw new Error('Cannot go forward')
    }
  } catch (error) {
    console.error('Error going forward:', error)
    throw new Error(`Failed to go forward: ${error}`)
  }
}

/**
 * 刷新页面
 * @param webview webview元素
 */
export async function refresh(webview: WebviewTag | null): Promise<void> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    webview.reload()
  } catch (error) {
    console.error('Error refreshing page:', error)
    throw new Error(`Failed to refresh page: ${error}`)
  }
}

/**
 * 向下滚动页面
 * @param webview webview元素
 */
export async function scrollDown(webview: WebviewTag | null): Promise<void> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    await webview.executeJavaScript(`
      window.scrollBy({
        top: window.innerHeight * 0.8,
        behavior: 'smooth'
      });
    `)
  } catch (error) {
    console.error('Error scrolling down:', error)
    throw new Error(`Failed to scroll down: ${error}`)
  }
}

/**
 * 向上滚动页面
 * @param webview webview元素
 */
export async function scrollUp(webview: WebviewTag | null): Promise<void> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    await webview.executeJavaScript(`
      window.scrollBy({
        top: -window.innerHeight * 0.8,
        behavior: 'smooth'
      });
    `)
  } catch (error) {
    console.error('Error scrolling up:', error)
    throw new Error(`Failed to scroll up: ${error}`)
  }
}

/**
 * 执行浏览器自动化操作
 * @param webview webview元素
 * @param action 浏览器操作
 * @returns 操作结果和页面内容
 */
export async function executeBrowserAction(
  webview: WebviewTag | null,
  action: BrowserAction
): Promise<{
  success: boolean
  content?: string
  error?: string
}> {
  if (!webview) {
    return { success: false, error: 'Webview not available' }
  }

  try {
    switch (action.type) {
      case 'navigate':
        await navigateTo(webview, action.url)
        break
      case 'click': {
        const clickResult = await clickElement(webview, action.selector)
        if (!clickResult) {
          return { success: false, error: 'Failed to click element' }
        }
        break
      }
      case 'type': {
        const typeResult = await typeText(webview, action.selector, action.text)
        if (!typeResult) {
          return { success: false, error: 'Failed to type text' }
        }
        break
      }
      case 'search':
        await search(webview, action.engine, action.query)
        break
      case 'back':
        await goBack(webview)
        break
      case 'forward':
        await goForward(webview)
        break
      case 'refresh':
        await refresh(webview)
        break
      case 'scrollDown':
        await scrollDown(webview)
        break
      case 'scrollUp':
        await scrollUp(webview)
        break
      case 'getContent':
        // 不需要执行任何操作，只需获取内容
        break
      case 'visualInteraction': {
        // 使用视觉AI执行操作
        const visualResult = await visualWebInteraction(webview, action.instruction, action.model)
        if (!visualResult.success) {
          return visualResult
        }
        // 如果成功，继续获取内容
        break
      }
      case 'switchToTab':
        await switchToTab(webview, action.tabIndex)
        break
      case 'listTabs': {
        const tabsResult = await listTabs(webview)
        return {
          success: tabsResult.success,
          content: JSON.stringify(tabsResult),
          error: tabsResult.error
        }
      }
      case 'closeTab': {
        const closeResult = await closeTab(webview, action.tabIndex)
        if (!closeResult) {
          return { success: false, error: 'Failed to close tab' }
        }
        break
      }
      case 'createTab': {
        const createResult = await createTab(webview, action.url, action.title)
        if (!createResult.success) {
          return { success: false, error: `Failed to create tab: ${createResult.error}` }
        }
        break
      }
      default:
        return { success: false, error: `Unsupported action type: ${(action as any).type}` }
    }

    // 获取操作后的页面内容
    const content = await getWebviewContent(webview)
    return { success: true, content }
  } catch (error) {
    console.error('Error executing browser action:', error)
    return { success: false, error: `${error}` }
  }
}

/**
 * 获取当前页面信息
 * @param webview webview元素
 * @returns 当前页面信息
 */
export async function getCurrentPageInfo(webview: WebviewTag | null): Promise<{
  url: string
  title: string
  isSearchEngine: boolean
  searchEngine?: 'baidu' | 'google' | 'bing' | 'other'
  hasSearchBox: boolean
  searchBoxSelector?: string
}> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    // 执行JavaScript获取页面信息
    const pageInfo = await webview.executeJavaScript(`
      (function() {
        const url = window.location.href;
        const title = document.title;

        // 检查是否是搜索引擎
        const isBaidu = url.includes('baidu.com');
        const isGoogle = url.includes('google.com');
        const isBing = url.includes('bing.com');
        const isSearchEngine = isBaidu || isGoogle || isBing;

        // 确定搜索引擎类型
        let searchEngine = null;
        if (isBaidu) searchEngine = 'baidu';
        else if (isGoogle) searchEngine = 'google';
        else if (isBing) searchEngine = 'bing';
        else if (isSearchEngine) searchEngine = 'other';

        // 查找搜索框
        let searchBoxSelector = null;
        let hasSearchBox = false;

        if (isBaidu) {
          searchBoxSelector = '#kw';
          hasSearchBox = !!document.querySelector(searchBoxSelector);
        } else if (isGoogle) {
          searchBoxSelector = 'input[name="q"]';
          hasSearchBox = !!document.querySelector(searchBoxSelector);
        } else if (isBing) {
          searchBoxSelector = '#sb_form_q';
          hasSearchBox = !!document.querySelector(searchBoxSelector);
        } else {
          // 尝试查找通用搜索框
          const possibleSearchInputs = document.querySelectorAll('input[type="search"], input[type="text"][name*="search"], input[type="text"][name*="query"], input[type="text"][placeholder*="搜索"], input[type="text"][placeholder*="search"]');
          if (possibleSearchInputs.length > 0) {
            hasSearchBox = true;
            searchBoxSelector = '';

            // 尝试为第一个搜索框创建选择器
            const input = possibleSearchInputs[0];
            if (input.id) {
              searchBoxSelector = '#' + input.id;
            } else if (input.name) {
              searchBoxSelector = 'input[name="' + input.name + '"]';
            } else {
              // 创建一个基于标签和索引的选择器
              const inputs = Array.from(document.querySelectorAll('input'));
              const index = inputs.indexOf(input);
              if (index !== -1) {
                searchBoxSelector = 'input:nth-of-type(' + (index + 1) + ')';
              }
            }
          }
        }

        return {
          url,
          title,
          isSearchEngine,
          searchEngine,
          hasSearchBox,
          searchBoxSelector
        };
      })();
    `)

    return pageInfo
  } catch (error) {
    console.error('Error getting current page info:', error)
    // 返回默认值
    return {
      url: '',
      title: '',
      isSearchEngine: false,
      hasSearchBox: false
    }
  }
}

/**
 * 在当前页面搜索
 * @param webview webview元素
 * @param query 搜索查询
 * @param searchBoxSelector 搜索框选择器
 */
export async function searchInCurrentPage(
  webview: WebviewTag | null,
  query: string,
  searchBoxSelector: string
): Promise<boolean> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    // 在当前页面的搜索框中输入并提交
    const result = await webview.executeJavaScript(`
      (function() {
        try {
          const searchBox = document.querySelector('${searchBoxSelector}');
          if (!searchBox) {
            return { success: false, error: 'Search box not found' };
          }

          // 聚焦搜索框
          searchBox.focus();

          // 清除现有内容
          searchBox.value = '';

          // 输入新查询
          searchBox.value = '${query.replace(/'/g, "\\'")}';

          // 触发input和change事件
          searchBox.dispatchEvent(new Event('input', { bubbles: true }));
          searchBox.dispatchEvent(new Event('change', { bubbles: true }));

          // 查找搜索框所在的表单
          let form = searchBox.form;
          if (!form) {
            // 如果搜索框不在表单中，尝试查找最近的表单祖先
            form = searchBox.closest('form');
          }

          if (form) {
            // 提交表单
            form.submit();
          } else {
            // 如果没有表单，模拟按下回车键
            const event = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true
            });
            searchBox.dispatchEvent(event);
          }

          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `)

    return result.success
  } catch (error) {
    console.error('Error searching in current page:', error)
    throw new Error(`Failed to search in current page: ${error}`)
  }
}

/**
 * 解析自然语言指令为浏览器操作
 * @param instruction 自然语言指令
 * @param currentPageInfo 当前页面信息
 * @returns 浏览器操作
 */
export async function parseInstruction(instruction: string, webview: WebviewTag | null): Promise<BrowserAction | null> {
  instruction = instruction.toLowerCase().trim()

  // 获取当前页面信息
  let currentPageInfo
  try {
    if (webview) {
      currentPageInfo = await getCurrentPageInfo(webview)
    }
  } catch (error) {
    console.error('Error getting current page info:', error)
    // 如果无法获取页面信息，继续使用原来的逻辑
    currentPageInfo = null
  }

  // 搜索指令
  if (instruction.includes('百度搜索') || instruction.includes('在百度搜索') || instruction.includes('用百度搜')) {
    const query = instruction.replace(/百度搜索|在百度搜索|用百度搜|百度|搜索/g, '').trim()

    // 如果当前已经在百度，直接在当前页面搜索
    if (
      currentPageInfo &&
      currentPageInfo.searchEngine === 'baidu' &&
      currentPageInfo.hasSearchBox &&
      currentPageInfo.searchBoxSelector
    ) {
      return {
        type: 'type',
        selector: currentPageInfo.searchBoxSelector,
        text: query
      }
    }

    // 否则导航到百度并搜索
    return { type: 'search', engine: 'baidu', query }
  }

  if (instruction.includes('谷歌搜索') || instruction.includes('在谷歌搜索') || instruction.includes('用谷歌搜')) {
    const query = instruction.replace(/谷歌搜索|在谷歌搜索|用谷歌搜|谷歌|搜索/g, '').trim()

    // 如果当前已经在谷歌，直接在当前页面搜索
    if (
      currentPageInfo &&
      currentPageInfo.searchEngine === 'google' &&
      currentPageInfo.hasSearchBox &&
      currentPageInfo.searchBoxSelector
    ) {
      return {
        type: 'type',
        selector: currentPageInfo.searchBoxSelector,
        text: query
      }
    }

    // 否则导航到谷歌并搜索
    return { type: 'search', engine: 'google', query }
  }

  if (instruction.includes('必应搜索') || instruction.includes('在必应搜索') || instruction.includes('用必应搜')) {
    const query = instruction.replace(/必应搜索|在必应搜索|用必应搜|必应|搜索/g, '').trim()

    // 如果当前已经在必应，直接在当前页面搜索
    if (
      currentPageInfo &&
      currentPageInfo.searchEngine === 'bing' &&
      currentPageInfo.hasSearchBox &&
      currentPageInfo.searchBoxSelector
    ) {
      return {
        type: 'type',
        selector: currentPageInfo.searchBoxSelector,
        text: query
      }
    }

    // 否则导航到必应并搜索
    return { type: 'search', engine: 'bing', query }
  }

  // 通用搜索指令
  if (instruction.includes('搜索')) {
    const query = instruction.replace(/搜索/g, '').trim()

    // 如果当前页面有搜索框，直接在当前页面搜索
    if (currentPageInfo && currentPageInfo.hasSearchBox && currentPageInfo.searchBoxSelector) {
      return {
        type: 'type',
        selector: currentPageInfo.searchBoxSelector,
        text: query
      }
    }

    // 否则使用默认搜索引擎（百度）
    return { type: 'search', engine: 'baidu', query }
  }

  // 导航指令
  if (
    instruction.includes('打开') ||
    instruction.includes('访问') ||
    instruction.includes('前往') ||
    instruction.includes('去')
  ) {
    // 提取网站名称或URL
    let siteName = instruction.replace(/打开|访问|前往|去/g, '').trim()

    // 移除可能的"网站"、"网页"等词
    siteName = siteName.replace(/网站|网页|页面/g, '').trim()

    // 常见网站映射
    const commonSites: Record<string, string> = {
      百度: 'https://www.baidu.com',
      baidu: 'https://www.baidu.com',
      谷歌: 'https://www.google.com',
      google: 'https://www.google.com',
      必应: 'https://www.bing.com',
      bing: 'https://www.bing.com',
      淘宝: 'https://www.taobao.com',
      taobao: 'https://www.taobao.com',
      京东: 'https://www.jd.com',
      jd: 'https://www.jd.com',
      微博: 'https://weibo.com',
      weibo: 'https://weibo.com',
      知乎: 'https://www.zhihu.com',
      zhihu: 'https://www.zhihu.com',
      哔哩哔哩: 'https://www.bilibili.com',
      bilibili: 'https://www.bilibili.com',
      b站: 'https://www.bilibili.com',
      腾讯: 'https://www.qq.com',
      qq: 'https://www.qq.com',
      网易: 'https://www.163.com',
      '163': 'https://www.163.com',
      搜狐: 'https://www.sohu.com',
      sohu: 'https://www.sohu.com',
      新浪: 'https://www.sina.com.cn',
      sina: 'https://www.sina.com.cn',
      亚马逊: 'https://www.amazon.cn',
      amazon: 'https://www.amazon.com',
      天猫: 'https://www.tmall.com',
      tmall: 'https://www.tmall.com',
      github: 'https://github.com',
      推特: 'https://twitter.com',
      twitter: 'https://twitter.com',
      脸书: 'https://www.facebook.com',
      facebook: 'https://www.facebook.com',
      youtube: 'https://www.youtube.com',
      优酷: 'https://www.youku.com',
      youku: 'https://www.youku.com'
    }

    // 检查是否是常见网站
    if (commonSites[siteName]) {
      return { type: 'navigate', url: commonSites[siteName] }
    }

    // 检查是否已经是一个有效的URL
    if (siteName.includes('http://') || siteName.includes('https://')) {
      return { type: 'navigate', url: siteName }
    }

    // 检查是否包含域名后缀
    const domainSuffixes = ['.com', '.cn', '.net', '.org', '.io', '.co', '.me', '.tv', '.info', '.app', '.dev']
    const hasDomainSuffix = domainSuffixes.some((suffix) => siteName.includes(suffix))

    if (hasDomainSuffix) {
      // 如果包含域名后缀但不包含协议，添加https://
      if (!siteName.includes('://')) {
        return { type: 'navigate', url: 'https://' + siteName }
      }
      return { type: 'navigate', url: siteName }
    }

    // 如果不是常见网站且不包含域名后缀，可能是搜索意图
    // 将其转换为搜索操作而不是导航操作
    return { type: 'search', engine: 'baidu', query: siteName }
  }

  // 浏览器控制指令
  if (instruction.includes('后退') || instruction.includes('返回')) {
    return { type: 'back' }
  }

  if (instruction.includes('前进')) {
    return { type: 'forward' }
  }

  if (instruction.includes('刷新') || instruction.includes('重新加载')) {
    return { type: 'refresh' }
  }

  if (instruction.includes('向下滚动') || instruction.includes('下滚') || instruction.includes('往下看')) {
    return { type: 'scrollDown' }
  }

  if (instruction.includes('向上滚动') || instruction.includes('上滚') || instruction.includes('往上看')) {
    return { type: 'scrollUp' }
  }

  // 获取内容指令
  if (instruction.includes('获取内容') || instruction.includes('读取内容') || instruction.includes('分析页面')) {
    return { type: 'getContent' }
  }

  // 点击相关指令
  if (instruction.includes('点击') || instruction.includes('选择') || instruction.includes('打开链接')) {
    // 使用视觉AI来处理点击操作
    return { type: 'visualInteraction', instruction }
  }

  // 无法识别的指令，尝试使用视觉AI
  return { type: 'visualInteraction', instruction }
}

/**
 * 切换到指定标签页
 * @param webview webview元素
 * @param tabIndex 标签页索引
 */
async function switchToTab(_webview: WebviewTag, tabIndex: number): Promise<boolean> {
  try {
    console.log('Switching to tab index:', tabIndex)

    // 使用IPC调用主进程的标签页切换方法
    if (window.electron?.ipcRenderer) {
      const result = await window.electron.ipcRenderer.invoke('browser:switchTab', tabIndex)
      return result.success
    }

    return false
  } catch (error) {
    console.error('Error switching tab:', error)
    throw new Error(`Failed to switch to tab: ${error}`)
  }
}

/**
 * 列出所有标签页
 * @param webview webview元素
 * @returns 标签页列表
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function listTabs(_webview: WebviewTag): Promise<any> {
  try {
    console.log('Listing tabs')

    // 使用IPC调用主进程的标签页列表方法
    if (window.electron?.ipcRenderer) {
      const result = await window.electron.ipcRenderer.invoke('browser:listTabs')
      return result
    }

    return { success: false, error: 'IPC not available' }
  } catch (error) {
    console.error('Error listing tabs:', error)
    throw new Error(`Failed to list tabs: ${error}`)
  }
}

/**
 * 关闭指定标签页
 * @param webview webview元素
 * @param tabIndex 标签页索引
 * @returns 是否成功关闭
 */

async function closeTab(_webview: WebviewTag, tabIndex: number): Promise<boolean> {
  try {
    console.log('Closing tab index:', tabIndex)

    // 使用IPC调用主进程的关闭标签页方法
    if (window.electron?.ipcRenderer) {
      const result = await window.electron.ipcRenderer.invoke('browser:closeTab', tabIndex)
      return result.success
    }

    return false
  } catch (error) {
    console.error('Error closing tab:', error)
    throw new Error(`Failed to close tab: ${error}`)
  }
}

/**
 * 创建新标签页
 * @param webview webview元素
 * @param url 新标签页URL
 * @param title 新标签页标题（可选）
 * @returns 新标签页信息
 */

async function createTab(_webview: WebviewTag, url: string, title?: string): Promise<any> {
  try {
    console.log('Creating new tab with URL:', url, 'and title:', title || url)

    // 使用IPC调用主进程的创建标签页方法
    if (window.electron?.ipcRenderer) {
      const result = await window.electron.ipcRenderer.invoke('browser:createTab', { url, title })
      return result
    }

    return { success: false, error: 'IPC not available' }
  } catch (error) {
    console.error('Error creating tab:', error)
    throw new Error(`Failed to create tab: ${error}`)
  }
}
