import { WebviewTag } from 'electron'

/**
 * 从webview中获取当前网页内容
 * @param webview webview元素
 * @returns 网页内容的Promise
 */
export async function getWebviewContent(webview: WebviewTag | null): Promise<string> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    // 执行JavaScript获取页面内容
    const content = await webview.executeJavaScript(`
      (function() {
        // 移除脚本和样式标签以获取更干净的内容
        const clonedBody = document.body.cloneNode(true);
        const scripts = clonedBody.querySelectorAll('script');
        const styles = clonedBody.querySelectorAll('style');
        
        scripts.forEach(script => script.remove());
        styles.forEach(style => style.remove());
        
        // 获取标题
        const title = document.title;
        
        // 获取主要内容
        const content = clonedBody.textContent || '';
        const normalizedContent = content.replace(/\\s+/g, ' ').trim();
        
        // 获取URL
        const url = window.location.href;
        
        return {
          title,
          url,
          content: normalizedContent
        };
      })();
    `)

    return `当前网页: ${content.title}\nURL: ${content.url}\n\n${content.content}`
  } catch (error) {
    console.error('Error getting webview content:', error)
    throw new Error(`Failed to get webpage content: ${error}`)
  }
}

/**
 * 从webview中获取当前网页的元数据
 * @param webview webview元素
 * @returns 网页元数据的Promise
 */
export async function getWebviewMetadata(webview: WebviewTag | null): Promise<{
  title: string
  url: string
  description: string
}> {
  if (!webview) {
    throw new Error('Webview not available')
  }

  try {
    // 执行JavaScript获取页面元数据
    const metadata = await webview.executeJavaScript(`
      (function() {
        // 获取标题
        const title = document.title;
        
        // 获取URL
        const url = window.location.href;
        
        // 获取描述
        let description = '';
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
          description = metaDescription.getAttribute('content') || '';
        }
        
        return {
          title,
          url,
          description
        };
      })();
    `)

    return metadata
  } catch (error) {
    console.error('Error getting webview metadata:', error)
    throw new Error(`Failed to get webpage metadata: ${error}`)
  }
}
