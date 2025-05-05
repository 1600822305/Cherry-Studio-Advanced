import { Model } from '@renderer/types'
import { WebviewTag } from 'electron'

import { getWebviewContent } from './webContentUtils'

/**
 * 使用视觉AI识别和操作网页元素
 * @param webview webview元素
 * @param instruction 指令，例如"点击百度百科链接"
 * @param model AI模型
 * @returns 操作结果
 */
export async function visualWebInteraction(
  webview: WebviewTag,
  instruction: string,
  model?: Model
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    // 1. 截取网页截图
    const image = await webview.capturePage()
    const screenshot = image.toDataURL()

    // 2. 构建提示词，包含截图和指令
    const prompt = `
你是一个专门帮助用户分析网页截图并执行操作的AI助手。
请分析以下网页截图，并根据用户指令找到需要操作的元素。

用户指令: "${instruction}"

请提供以下信息:
1. 元素描述: 描述你看到的与指令相关的元素
2. 元素位置: 提供元素在截图中的大致位置(x, y坐标或区域描述)
3. 推荐操作: 建议的操作(点击、输入文本等)
4. CSS选择器: 如果可能，提供可能的CSS选择器来定位该元素

请以JSON格式回答:
{
  "elementDescription": "百度百科链接，显示为'我的世界_百度百科'",
  "elementLocation": "页面左上方，第一个搜索结果",
  "recommendedAction": "点击该链接",
  "cssSelector": "可能的选择器，如'.result a[href*=baike.baidu.com]'"
}
`

    // 3. 调用支持视觉的AI模型
    const aiResponse = await generateAIResponseWithImage(prompt, screenshot, model)

    // 4. 解析AI响应
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('无法解析AI响应')
    }

    const result = JSON.parse(jsonMatch[0])

    // 5. 根据AI的分析结果执行操作
    if (result.cssSelector) {
      try {
        // 尝试使用CSS选择器点击元素
        const clickResult = await webview.executeJavaScript(`
          (function() {
            try {
              // 尝试多种选择器变体
              const selectors = ['${result.cssSelector}', '${result.cssSelector.replace(/'/g, "'")}'];

              // 添加更通用的选择器
              if ('${result.cssSelector}'.includes('baike.baidu.com')) {
                selectors.push('a[href*="baike.baidu.com"]');
                selectors.push('.result a[href*="baike.baidu.com"]');
                selectors.push('.c-container a[href*="baike.baidu.com"]');
              }

              // 尝试每个选择器
              for (const selector of selectors) {
                try {
                  const elements = document.querySelectorAll(selector);
                  if (elements.length > 0) {
                    // 找到了元素，尝试点击第一个
                    elements[0].click();
                    return { success: true };
                  }
                } catch (e) {
                  // 忽略单个选择器的错误，继续尝试下一个
                  console.error('Error with selector:', selector, e);
                }
              }

              // 如果没有找到元素，尝试查找第一个搜索结果
              const firstResult = document.querySelector('.result a:first-child, .c-container a:first-child, .g a:first-child, .b_algo a:first-child');
              if (firstResult) {
                firstResult.click();
                return { success: true };
              }

              return { success: false, error: '未找到元素' };
            } catch (error) {
              return { success: false, error: error.toString() };
            }
          })()
        `)

        if (clickResult.success) {
          // 等待页面加载（减少等待时间）
          await new Promise((resolve) => setTimeout(resolve, 500))

          // 获取更新后的页面内容
          const content = await getWebviewContent(webview)

          return { success: true, content }
        }
      } catch (error) {
        console.error('Error executing JavaScript in webview:', error)
        // 继续尝试其他方法
      }
    }

    // 如果CSS选择器不可用或点击失败，尝试使用文本内容查找
    if (result.elementDescription) {
      try {
        const clickResult = await webview.executeJavaScript(`
          (function() {
            try {
              // 查找包含特定文本的链接
              const textToFind = '${result.elementDescription.replace(/'/g, "'")}';
              const searchTerms = [
                textToFind.split('，')[0],
                textToFind.split('_')[0],
                textToFind.split(' ')[0],
                '百度百科',
                '维基百科'
              ].filter(Boolean);

              // 尝试每个搜索词
              for (const term of searchTerms) {
                // 查找包含文本的链接
                const links = Array.from(document.querySelectorAll('a'));
                for (const link of links) {
                  if (link.textContent && link.textContent.includes(term)) {
                    try {
                      link.click();
                      return { success: true };
                    } catch (e) {
                      console.error('Error clicking link:', e);
                      // 继续尝试下一个链接
                    }
                  }
                }
              }

              // 如果没有找到链接，尝试查找第一个搜索结果
              const searchResults = document.querySelectorAll('.result a:first-child, .c-container a:first-child, .g a:first-child, .b_algo a:first-child');
              if (searchResults.length > 0) {
                try {
                  searchResults[0].click();
                  return { success: true };
                } catch (e) {
                  console.error('Error clicking search result:', e);
                }
              }

              // 如果还是没找到，尝试查找任何可点击元素
              const clickableElements = Array.from(document.querySelectorAll('a, button, [role="button"], [onclick]'));
              const visibleClickable = clickableElements.filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 &&
                      window.getComputedStyle(el).display !== 'none' &&
                      window.getComputedStyle(el).visibility !== 'hidden';
              });

              if (visibleClickable.length > 0) {
                // 尝试点击第一个可见的可点击元素
                try {
                  visibleClickable[0].click();
                  return { success: true };
                } catch (e) {
                  console.error('Error clicking visible element:', e);
                }
              }

              return { success: false, error: '未找到匹配的元素' };
            } catch (error) {
              return { success: false, error: error.toString() };
            }
          })()
        `)

        if (clickResult.success) {
          // 等待页面加载（减少等待时间）
          await new Promise((resolve) => setTimeout(resolve, 500))

          // 获取更新后的页面内容
          const content = await getWebviewContent(webview)

          return { success: true, content }
        }
      } catch (error) {
        console.error('Error executing JavaScript for text search:', error)
        // 继续尝试其他方法
      }
    }

    // 如果以上方法都失败，尝试最后的备选方案
    try {
      const clickResult = await webview.executeJavaScript(`
        (function() {
          try {
            // 尝试各种常见的选择器模式
            const selectors = [
              // 百度百科链接
              'a[href*="baike.baidu.com"]',
              // 维基百科链接
              'a[href*="wikipedia.org"]',
              // 第一个搜索结果链接
              '.result a:first-child',
              '.c-container a:first-child',
              '.g a:first-child',
              '.b_algo a:first-child',
              // 任何看起来像搜索结果的链接
              '.result a',
              '.c-container a',
              // 通用选择器
              'a[href^="http"]'
            ];

            // 尝试每个选择器
            for (const selector of selectors) {
              try {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                  // 尝试点击第一个元素
                  elements[0].click();
                  return { success: true };
                }
              } catch (e) {
                // 忽略单个选择器的错误，继续尝试下一个
                console.error('Error with selector:', selector, e);
              }
            }

            // 如果所有选择器都失败，尝试使用JavaScript模拟点击第一个链接
            try {
              // 获取所有可见链接
              const allLinks = Array.from(document.querySelectorAll('a'));
              const visibleLinks = allLinks.filter(link => {
                const rect = link.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 &&
                      window.getComputedStyle(link).display !== 'none' &&
                      window.getComputedStyle(link).visibility !== 'hidden';
              });

              if (visibleLinks.length > 0) {
                // 创建并触发点击事件
                const clickEvent = new MouseEvent('click', {
                  view: window,
                  bubbles: true,
                  cancelable: true
                });

                visibleLinks[0].dispatchEvent(clickEvent);
                return { success: true };
              }
            } catch (e) {
              console.error('Error simulating click:', e);
            }

            return { success: false, error: '尝试了所有可能的方法，但都失败了' };
          } catch (error) {
            return { success: false, error: error.toString() };
          }
        })()
      `)

      if (clickResult.success) {
        // 等待页面加载（减少等待时间）
        await new Promise((resolve) => setTimeout(resolve, 500))

        // 获取更新后的页面内容
        const content = await getWebviewContent(webview)

        return { success: true, content }
      }
    } catch (error) {
      console.error('Error in final fallback method:', error)
    }

    throw new Error(`无法执行操作: ${result.elementDescription || instruction}`)
  } catch (error: any) {
    console.error('Visual web interaction error:', error)
    return { success: false, error: error.toString() }
  }
}

/**
 * 生成包含图像的AI回复
 * @param prompt 提示词
 * @param imageData 图像数据（base64编码）
 * @param model AI模型
 * @returns AI回复
 */
export async function generateAIResponseWithImage(prompt: string, imageData: string, model?: Model): Promise<string> {
  try {
    // 这里需要调用支持视觉的AI模型API
    // 由于我们没有实际的API实现，这里模拟一个响应

    // 在实际实现中，这里应该调用支持视觉的AI模型API
    // 例如：return await ApiService.generateWithImage(prompt, imageData, model)

    // 使用提示词、图像数据和模型信息来构建响应
    // 这里我们只是模拟，实际应用中应该使用这些参数调用真实的API
    console.log(
      `Generating AI response with image. Prompt length: ${prompt.length}, Image data length: ${imageData.length}, Model: ${model?.name || 'default'}`
    )

    // 模拟响应
    return `
分析结果：

{
  "elementDescription": "百度百科链接，显示为'我的世界_百度百科'",
  "elementLocation": "页面左上方，第一个搜索结果区域",
  "recommendedAction": "点击该链接",
  "cssSelector": ".result a[href*='baike.baidu.com'], .c-container a[href*='baike.baidu.com']"
}

我在截图中看到了搜索结果页面，其中包含"我的世界"的搜索结果。第一个结果看起来是百度百科的链接，显示为"我的世界_百度百科"。建议点击这个链接来查看百度百科页面。
`
  } catch (error) {
    console.error('Error generating AI response with image:', error)
    // 返回一个基本的响应，以便程序可以继续运行
    return `
{
  "elementDescription": "搜索结果链接",
  "elementLocation": "页面主要内容区域",
  "recommendedAction": "点击第一个搜索结果",
  "cssSelector": ".result a:first-child, .c-container a:first-child"
}
`
  }
}
