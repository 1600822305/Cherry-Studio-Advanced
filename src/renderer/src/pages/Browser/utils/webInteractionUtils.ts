import { WebviewTag } from 'electron'

import { getWebviewContent } from './webContentUtils'

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
          
          // 等待一小段时间确保滚动完成
          return new Promise(resolve => {
            setTimeout(() => {
              try {
                // 模拟点击事件
                element.click();
                resolve({ success: true });
              } catch (clickError) {
                resolve({ success: false, error: 'Click failed: ' + clickError.message });
              }
            }, 500);
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
 * 在webview中执行自定义JavaScript
 * @param webview webview元素
 * @param script JavaScript代码
 * @returns 脚本执行的结果
 */
export async function executeScript(webview: WebviewTag | null, script: string): Promise<any> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    // 执行JavaScript
    return await webview.executeJavaScript(script)
  } catch (error) {
    console.error('Error executing script:', error)
    throw new Error(`Failed to execute script: ${error}`)
  }
}

/**
 * 点击元素并获取更新后的页面内容
 * @param webview webview元素
 * @param selector CSS选择器
 * @returns 更新后的页面内容
 */
export async function clickAndGetContent(webview: WebviewTag | null, selector: string): Promise<string> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    // 点击元素
    const clickResult = await clickElement(webview, selector)

    if (!clickResult) {
      throw new Error('Failed to click element')
    }

    // 等待页面加载完成
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // 获取更新后的页面内容
    const content = await getWebviewContent(webview)

    return content
  } catch (error) {
    console.error('Error clicking and getting content:', error)
    throw new Error(`Failed to click and get content: ${error}`)
  }
}

/**
 * 获取页面上所有可点击元素的信息
 * @param webview webview元素
 * @returns 可点击元素的列表
 */
export async function getClickableElements(
  webview: WebviewTag | null
): Promise<Array<{ selector: string; text: string; tag: string }>> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    // 执行JavaScript获取可点击元素
    const elements = await webview.executeJavaScript(`
      (function() {
        // 查找所有可能可点击的元素
        const clickableElements = Array.from(document.querySelectorAll('a, button, [role="button"], [onclick], input[type="submit"], input[type="button"]'));
        
        // 过滤掉不可见的元素
        const visibleElements = clickableElements.filter(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return (rect.width > 0 && rect.height > 0) && 
                 style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 style.opacity !== '0';
        });
        
        // 提取元素信息
        return visibleElements.map((el, index) => {
          // 创建唯一选择器
          let selector = '';
          
          // 尝试使用id
          if (el.id) {
            selector = '#' + CSS.escape(el.id);
          } 
          // 尝试使用类名
          else if (el.className && typeof el.className === 'string') {
            const classes = el.className.trim().split(/\\s+/).map(c => '.' + CSS.escape(c)).join('');
            if (classes) {
              // 检查这个类选择器是否唯一
              if (document.querySelectorAll(classes).length === 1) {
                selector = classes;
              }
            }
          }
          
          // 如果上面的方法没有产生唯一选择器，使用标签名和索引
          if (!selector || document.querySelectorAll(selector).length > 1) {
            const tagName = el.tagName.toLowerCase();
            selector = \`\${tagName}:nth-of-type(\${Array.from(el.parentNode.querySelectorAll(tagName)).indexOf(el) + 1})\`;
            
            // 如果有父元素且父元素有ID，使用父元素ID增强选择器
            let parent = el.parentElement;
            if (parent && parent.id) {
              selector = '#' + CSS.escape(parent.id) + ' > ' + selector;
            }
          }
          
          // 获取元素文本内容
          const text = el.textContent?.trim() || '';
          
          return {
            selector,
            text: text.length > 50 ? text.substring(0, 47) + '...' : text,
            tag: el.tagName.toLowerCase()
          };
        });
      })();
    `)

    return elements
  } catch (error) {
    console.error('Error getting clickable elements:', error)
    throw new Error(`Failed to get clickable elements: ${error}`)
  }
}
