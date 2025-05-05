import { CheckOutlined, DownloadOutlined, DownOutlined, RightOutlined } from '@ant-design/icons'
import CopyIcon from '@renderer/components/Icons/CopyIcon'
import UnWrapIcon from '@renderer/components/Icons/UnWrapIcon'
import WrapIcon from '@renderer/components/Icons/WrapIcon'
import { HStack } from '@renderer/components/Layout'
import { useSyntaxHighlighter } from '@renderer/context/SyntaxHighlighterProvider'
import { useSettings } from '@renderer/hooks/useSettings'
import { Tooltip } from 'antd'
import dayjs from 'dayjs'
import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

/**
 * 判断文本是否可能是代码
 * 使用更严格的条件来判断未标记语言的内容是否为代码
 */
function isLikelyCode(text: string): boolean {
  if (!text) return false

  // 如果文本太短，不太可能是代码
  if (text.length < 10) return false

  // 检查是否包含多行
  const lines = text.split('\n')

  // 如果只有一行，通常不是代码块（除非有明确的语言标记）
  if (lines.length <= 1) return false

  // 代码特征计数
  let codeFeatures = 0

  // 检查常见代码特征
  const codePatterns = [
    /\b(function|const|let|var|if|else|for|while|return|import|export|class|interface|extends|implements)\b/,
    /[{}[\]()]/, // 括号
    /\b(public|private|protected|static|final|void)\b/,
    /\b(def|async|await|try|catch|finally)\b/,
    /\b(int|string|bool|float|double)\b/,
    /\s{2,}[a-zA-Z0-9_]+/, // 缩进后跟标识符
    /^\s*(\/\/|#|\/\*|\*|;)/ // 注释行开始
  ]

  // 检查行特征
  let indentedLines = 0
  let commentLines = 0
  let codePatternLines = 0

  for (const line of lines) {
    // 跳过空行
    if (!line.trim()) continue

    // 检查缩进
    if (line.startsWith('  ') || line.startsWith('\t')) {
      indentedLines++
    }

    // 检查注释
    if (
      line.trim().startsWith('//') ||
      line.trim().startsWith('#') ||
      line.trim().startsWith('/*') ||
      line.trim().startsWith('*')
    ) {
      commentLines++
    }

    // 检查代码模式
    for (const pattern of codePatterns) {
      if (pattern.test(line)) {
        codePatternLines++
        break
      }
    }
  }

  // 计算特征比例
  const nonEmptyLines = lines.filter((line) => line.trim()).length
  if (nonEmptyLines === 0) return false

  const indentRatio = indentedLines / nonEmptyLines
  const commentRatio = commentLines / nonEmptyLines
  const patternRatio = codePatternLines / nonEmptyLines

  // 如果有足够的缩进行或代码模式行，可能是代码
  if (indentRatio > 0.3 || patternRatio > 0.3) {
    return true
  }

  // 如果同时有缩进和注释，可能是代码
  if (indentRatio > 0.1 && commentRatio > 0.1) {
    return true
  }

  // 检查是否包含多个连续的特殊字符，这在代码中很常见
  if (/[{}[\]()<>:;=+\-*/%&|^!~]+/.test(text)) {
    codeFeatures++
  }

  // 检查是否有明显的代码结构（如缩进模式）
  let hasIndentPattern = false
  let prevIndent = -1
  for (const line of lines) {
    if (!line.trim()) continue
    const indent = line.search(/\S/)
    if (prevIndent !== -1 && indent > prevIndent) {
      hasIndentPattern = true
      break
    }
    prevIndent = indent
  }

  if (hasIndentPattern) {
    codeFeatures++
  }

  // 如果满足足够多的代码特征，则认为是代码
  return codeFeatures >= 1
}

import Artifacts from './Artifacts'
import Mermaid from './Mermaid'
import { isValidPlantUML, PlantUML } from './PlantUML'
import SvgPreview from './SvgPreview'

interface CodeBlockProps {
  children: string
  className?: string
  [key: string]: any
}

const CodeBlock: React.FC<CodeBlockProps> = ({ children, className }) => {
  // 改进代码判断逻辑
  const languageMatch = /language-(\w+)/.exec(className || '')
  const { codeShowLineNumbers, fontSize, codeCollapsible, codeWrappable } = useSettings()

  // 判断是否为代码块的更严格条件
  // 1. 如果有明确的语言标记，则认为是代码块
  // 2. 如果没有语言标记，则需要满足更严格的条件才被视为代码块
  const isCodeBlock = !!languageMatch || isLikelyCode(children)
  const language = languageMatch?.[1] ?? 'text'
  // const [html, setHtml] = useState<string>('')
  const { codeToHtml } = useSyntaxHighlighter()
  const [isExpanded, setIsExpanded] = useState(!codeCollapsible)
  const [isUnwrapped, setIsUnwrapped] = useState(!codeWrappable)
  const [shouldShowExpandButton, setShouldShowExpandButton] = useState(false)
  const codeContentRef = useRef<HTMLDivElement>(null)
  const childrenLengthRef = useRef(0)
  const isStreamingRef = useRef(false)

  const showFooterCopyButton = children && children.length > 500 && !codeCollapsible

  const showDownloadButton = ['csv', 'json', 'txt', 'md'].includes(language)

  const shouldShowExpandButtonRef = useRef(false)

  const shouldHighlight = useCallback((lang: string) => {
    const NON_HIGHLIGHT_LANGS = ['mermaid', 'plantuml', 'svg']
    return !NON_HIGHLIGHT_LANGS.includes(lang)
  }, [])

  const highlightCode = useCallback(async () => {
    if (!codeContentRef.current) return
    const codeElement = codeContentRef.current

    // 只在非流式输出状态才尝试启用cache
    const highlightedHtml = await codeToHtml(children, language, !isStreamingRef.current)

    codeElement.innerHTML = highlightedHtml
    codeElement.style.opacity = '1'

    const isShowExpandButton = codeElement.scrollHeight > 350
    if (shouldShowExpandButtonRef.current === isShowExpandButton) return
    shouldShowExpandButtonRef.current = isShowExpandButton
    setShouldShowExpandButton(shouldShowExpandButtonRef.current)
  }, [language, codeToHtml, children])

  useEffect(() => {
    // 跳过非文本代码块
    if (!codeContentRef.current || !shouldHighlight(language)) return

    let isMounted = true
    const codeElement = codeContentRef.current

    if (childrenLengthRef.current > 0 && childrenLengthRef.current !== children?.length) {
      isStreamingRef.current = true
    } else {
      isStreamingRef.current = false
      codeElement.style.opacity = '0.1'
    }

    if (childrenLengthRef.current === 0) {
      // 挂载时显示原始代码
      codeElement.textContent = children
    }

    const observer = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting && isMounted) {
        setTimeout(highlightCode, 0)
        observer.disconnect()
      }
    })

    observer.observe(codeElement)

    return () => {
      childrenLengthRef.current = children?.length
      isMounted = false
      observer.disconnect()
    }
  }, [children, highlightCode, language, shouldHighlight])

  useEffect(() => {
    setIsExpanded(!codeCollapsible)
    setShouldShowExpandButton(codeCollapsible && (codeContentRef.current?.scrollHeight ?? 0) > 350)
  }, [codeCollapsible])

  useEffect(() => {
    setIsUnwrapped(!codeWrappable)
  }, [codeWrappable])

  if (language === 'mermaid') {
    return <Mermaid chart={children} />
  }

  if (language === 'plantuml' && isValidPlantUML(children)) {
    return <PlantUML diagram={children} />
  }

  if (language === 'svg') {
    return (
      <CodeBlockWrapper className="code-block">
        <CodeHeader>
          <CodeLanguage>{language.toUpperCase()}</CodeLanguage>
          <CopyButton text={children} />
        </CodeHeader>
        <SvgPreview>{children}</SvgPreview>
      </CodeBlockWrapper>
    )
  }

  return isCodeBlock ? (
    <CodeBlockWrapper className="code-block">
      <CodeHeader>
        <CodeLanguage>{language.toUpperCase()}</CodeLanguage>
      </CodeHeader>
      <StickyWrapper>
        <HStack
          position="absolute"
          gap={12}
          alignItems="center"
          style={{ bottom: '0.2rem', right: '1rem', height: '27px' }}>
          {showDownloadButton && <DownloadButton language={language} data={children} />}
          {codeWrappable && <UnwrapButton unwrapped={isUnwrapped} onClick={() => setIsUnwrapped(!isUnwrapped)} />}
          {codeCollapsible && shouldShowExpandButton && (
            <CollapseIcon expanded={isExpanded} onClick={() => setIsExpanded(!isExpanded)} />
          )}
          <CopyButton text={children} />
        </HStack>
      </StickyWrapper>
      <CodeContent
        ref={codeContentRef}
        isShowLineNumbers={codeShowLineNumbers}
        isUnwrapped={isUnwrapped}
        isCodeWrappable={codeWrappable}
        // dangerouslySetInnerHTML={{ __html: html }}
        style={{
          border: '0.5px solid var(--color-code-background)',
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          marginTop: 0,
          fontSize: fontSize - 1,
          maxHeight: codeCollapsible && !isExpanded ? '350px' : 'none',
          overflow: codeCollapsible && !isExpanded ? 'auto' : 'visible',
          position: 'relative'
        }}
      />
      {codeCollapsible && (
        <ExpandButton
          isExpanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
          showButton={shouldShowExpandButton}
        />
      )}
      {showFooterCopyButton && (
        <CodeFooter>
          <CopyButton text={children} style={{ marginTop: -40, marginRight: 10 }} />
        </CodeFooter>
      )}
      {language === 'html' && children?.includes('</html>') && <Artifacts html={children} />}
    </CodeBlockWrapper>
  ) : (
    <WrappedCode className={className}>{children}</WrappedCode>
  )
}

const CollapseIcon: React.FC<{ expanded: boolean; onClick: () => void }> = ({ expanded, onClick }) => {
  const { t } = useTranslation()
  const [tooltipVisible, setTooltipVisible] = useState(false)

  const handleClick = () => {
    setTooltipVisible(false)
    onClick()
  }

  return (
    <Tooltip
      title={expanded ? t('code_block.collapse') : t('code_block.expand')}
      open={tooltipVisible}
      onOpenChange={setTooltipVisible}>
      <CollapseIconWrapper onClick={handleClick}>
        {expanded ? <DownOutlined style={{ fontSize: 12 }} /> : <RightOutlined style={{ fontSize: 12 }} />}
      </CollapseIconWrapper>
    </Tooltip>
  )
}

const ExpandButton: React.FC<{
  isExpanded: boolean
  onClick: () => void
  showButton: boolean
}> = ({ isExpanded, onClick, showButton }) => {
  const { t } = useTranslation()
  if (!showButton) return null

  return (
    <ExpandButtonWrapper onClick={onClick}>
      <div className="button-text">{isExpanded ? t('code_block.collapse') : t('code_block.expand')}</div>
    </ExpandButtonWrapper>
  )
}

const UnwrapButton: React.FC<{ unwrapped: boolean; onClick: () => void }> = ({ unwrapped, onClick }) => {
  const { t } = useTranslation()
  const unwrapLabel = unwrapped ? t('code_block.enable_wrap') : t('code_block.disable_wrap')
  return (
    <Tooltip title={unwrapLabel}>
      <UnwrapButtonWrapper onClick={onClick} title={unwrapLabel}>
        {unwrapped ? (
          <UnWrapIcon style={{ width: '100%', height: '100%' }} />
        ) : (
          <WrapIcon style={{ width: '100%', height: '100%' }} />
        )}
      </UnwrapButtonWrapper>
    </Tooltip>
  )
}

const CopyButton: React.FC<{ text: string; style?: React.CSSProperties }> = ({ text, style }) => {
  const [copied, setCopied] = useState(false)
  const { t } = useTranslation()
  const copy = t('common.copy')

  const onCopy = () => {
    if (!text) return
    navigator.clipboard.writeText(text)
    window.message.success({ content: t('message.copied'), key: 'copy-code' })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Tooltip title={copy}>
      <CopyButtonWrapper onClick={onCopy} style={style}>
        {copied ? <CheckOutlined style={{ color: 'var(--color-primary)' }} /> : <CopyIcon className="copy" />}
      </CopyButtonWrapper>
    </Tooltip>
  )
}

const DownloadButton = ({ language, data }: { language: string; data: string }) => {
  const onDownload = () => {
    const fileName = `${dayjs().format('YYYYMMDDHHmm')}.${language}`
    window.api.file.save(fileName, data)
  }

  return (
    <DownloadWrapper onClick={onDownload}>
      <DownloadOutlined />
    </DownloadWrapper>
  )
}

const CodeBlockWrapper = styled.div`
  position: relative;
`

const CodeContent = styled.div<{ isShowLineNumbers: boolean; isUnwrapped: boolean; isCodeWrappable: boolean }>`
  transition: opacity 0.3s ease;
  .shiki {
    padding: 1em;

    code {
      display: flex;
      flex-direction: column;
      width: 100%;

      .line {
        display: block;
        min-height: 1.3rem;
        padding-left: ${(props) => (props.isShowLineNumbers ? '2rem' : '0')};
      }
    }
  }

  ${(props) =>
    props.isShowLineNumbers &&
    `
      code {
        counter-reset: step;
        counter-increment: step 0;
        position: relative;
      }

      code .line::before {
        content: counter(step);
        counter-increment: step;
        width: 1rem;
        position: absolute;
        left: 0;
        text-align: right;
        opacity: 0.35;
      }
    `}

  ${(props) =>
    props.isCodeWrappable &&
    !props.isUnwrapped &&
    `
      code .line * {
        word-wrap: break-word;
        white-space: pre-wrap;
      }
    `}
`
const CodeHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--color-text);
  font-size: 14px;
  font-weight: bold;
  height: 34px;
  padding: 0 10px;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
`

const CodeLanguage = styled.div`
  font-weight: bold;
  color: #000000;
  padding: 2px 8px;
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
`

const CodeFooter = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  position: relative;
  .copy {
    cursor: pointer;
    color: var(--color-text-3);
    transition: color 0.3s;
  }
  .copy:hover {
    color: var(--color-text-1);
  }
`
const CopyButtonWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--color-text-3);
  transition: color 0.3s;
  font-size: 16px;

  &:hover {
    color: var(--color-text-1);
  }
`
const ExpandButtonWrapper = styled.div`
  position: relative;
  cursor: pointer;
  height: 25px;
  margin-top: -25px;

  .button-text {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    text-align: center;
    padding: 8px;
    color: var(--color-text-3);
    z-index: 1;
    transition: color 0.2s;
    font-size: 12px;
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue',
      sans-serif;
  }

  &:hover .button-text {
    color: var(--color-text-1);
  }
`

const CollapseIconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-text-3);
  transition: all 0.2s ease;

  &:hover {
    color: var(--color-text-1);
  }
`

const UnwrapButtonWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-text-3);
  transition: all 0.2s ease;

  &:hover {
    background-color: var(--color-background-soft);
    color: var(--color-text-1);
  }
`

const DownloadWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--color-text-3);
  transition: color 0.3s;
  font-size: 16px;

  &:hover {
    color: var(--color-text-1);
  }
`

const StickyWrapper = styled.div`
  position: sticky;
  top: 28px;
  z-index: 10;
`

const WrappedCode = styled.code`
  text-wrap: wrap;
`

export default memo(CodeBlock)
