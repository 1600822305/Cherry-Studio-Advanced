import {
  CheckOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  SearchOutlined,
  UndoOutlined
} from '@ant-design/icons'
import ExecutionResult, { ExecutionResultProps } from '@renderer/components/CodeExecutorButton/ExecutionResult'
import CodeMirrorEditor, { CodeMirrorEditorRef } from '@renderer/components/CodeMirrorEditor'
import CopyIcon from '@renderer/components/Icons/CopyIcon'
import UnWrapIcon from '@renderer/components/Icons/UnWrapIcon'
import WrapIcon from '@renderer/components/Icons/WrapIcon'
import { HStack } from '@renderer/components/Layout'
import { useSettings } from '@renderer/hooks/useSettings'
import { message, Tooltip } from 'antd'
import dayjs from 'dayjs'
import React, { useCallback, useEffect, useRef, useState } from 'react'
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

import Mermaid from './Mermaid'
import { isValidPlantUML, PlantUML } from './PlantUML'
import SvgPreview from './SvgPreview'

interface EditableCodeBlockProps {
  children: string
  className?: string
  [key: string]: any
}

const EditableCodeBlock: React.FC<EditableCodeBlockProps> = ({ children, className }) => {
  // 改进代码判断逻辑
  const languageMatch = /language-(\w+)/.exec(className || '')
  const { codeShowLineNumbers, fontSize, codeCollapsible, codeWrappable } = useSettings()

  // 判断是否为代码块的更严格条件
  // 1. 如果有明确的语言标记，则认为是代码块
  // 2. 如果没有语言标记，则需要满足更严格的条件才被视为代码块
  const isCodeBlock = !!languageMatch || isLikelyCode(children)
  const language = languageMatch?.[1] ?? 'text'
  const [isExpanded, setIsExpanded] = useState(!codeCollapsible)
  const [isUnwrapped, setIsUnwrapped] = useState(!codeWrappable)
  const [shouldShowExpandButton, setShouldShowExpandButton] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [code, setCode] = useState(children)
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<ExecutionResultProps | null>(null)
  const codeContentRef = useRef<HTMLPreElement>(null)
  const editorRef = useRef<CodeMirrorEditorRef>(null)
  const { t } = useTranslation()

  const showFooterCopyButton = children && children.length > 500 && !codeCollapsible
  const showDownloadButton = ['csv', 'json', 'txt', 'md'].includes(language)

  useEffect(() => {
    setCode(children)
  }, [children])

  useEffect(() => {
    setIsExpanded(!codeCollapsible)
    setShouldShowExpandButton(codeCollapsible && (codeContentRef.current?.scrollHeight ?? 0) > 350)
  }, [codeCollapsible])

  useEffect(() => {
    setIsUnwrapped(!codeWrappable)
  }, [codeWrappable])

  // 当点击编辑按钮时调用
  const handleEditToggle = useCallback(() => {
    if (isEditing) {
      // 如果当前是编辑状态，则保存代码
      if (editorRef.current) {
        // 使用 getContent 方法获取编辑器内容
        const newCode = editorRef.current.getContent()
        setCode(newCode)
      }
    }
    // 切换编辑状态
    setIsEditing(!isEditing)
  }, [isEditing])

  // handleCodeChange 函数，只在撤销/重做操作时才会被调用
  const handleCodeChange = useCallback((newCode: string) => {
    // 只在撤销/重做操作时才会被调用，所以可以安全地更新代码
    // 这不会影响普通的输入操作
    setCode(newCode)
  }, [])

  // 执行代码
  const executeCode = useCallback(async () => {
    if (!code) return

    setIsExecuting(true)
    setExecutionResult(null)

    try {
      let result

      // 根据语言类型选择执行方法
      if (language === 'javascript' || language === 'js') {
        result = await window.api.codeExecutor.executeJS(code)
      } else if (language === 'python' || language === 'py') {
        result = await window.api.codeExecutor.executePython(code)
      } else {
        message.error(t('code.execution.unsupported_language'))
        setIsExecuting(false)
        return
      }

      setExecutionResult(result)
    } catch (error) {
      console.error('Code execution error:', error)
      setExecutionResult({
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setIsExecuting(false)
    }
  }, [code, language, t])

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
          {showDownloadButton && <DownloadButton language={language} data={code} />}
          {codeWrappable && <UnwrapButton unwrapped={isUnwrapped} onClick={() => setIsUnwrapped(!isUnwrapped)} />}
          {codeCollapsible && shouldShowExpandButton && (
            <CollapseIcon expanded={isExpanded} onClick={() => setIsExpanded(!isExpanded)} />
          )}
          {isEditing && (
            <>
              <UndoRedoButton
                icon={<UndoOutlined />}
                title={t('code_block.undo')}
                onClick={() => editorRef.current?.undo()}
              />
              <UndoRedoButton
                icon={<RedoOutlined />}
                title={t('code_block.redo')}
                onClick={() => editorRef.current?.redo()}
              />
              <UndoRedoButton
                icon={<SearchOutlined />}
                title={t('code_block.search')}
                onClick={() => editorRef.current?.openSearch()}
              />
            </>
          )}
          {(language === 'javascript' || language === 'js' || language === 'python' || language === 'py') && (
            <ExecuteButton isExecuting={isExecuting} onClick={executeCode} title={t('code.execute')} />
          )}
          <EditButton isEditing={isEditing} onClick={handleEditToggle} />
          <CopyButton text={code} />
        </HStack>
      </StickyWrapper>
      {isEditing ? (
        <EditorContainer
          style={{
            maxHeight: codeCollapsible && !isExpanded ? '350px' : 'none',
            overflow: codeCollapsible && !isExpanded ? 'auto' : 'visible'
          }}>
          <CodeMirrorEditor
            ref={editorRef}
            code={code}
            language={language}
            onChange={handleCodeChange}
            showLineNumbers={codeShowLineNumbers}
            fontSize={fontSize - 1}
            height={codeCollapsible && !isExpanded ? '350px' : 'auto'}
          />
        </EditorContainer>
      ) : (
        <CodeContent
          ref={codeContentRef}
          isShowLineNumbers={codeShowLineNumbers}
          isUnwrapped={isUnwrapped}
          isCodeWrappable={codeWrappable}
          style={{
            border: '0.5px solid var(--color-code-background)',
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            marginTop: 0,
            fontSize: fontSize - 1,
            maxHeight: codeCollapsible && !isExpanded ? '350px' : 'none',
            overflow: codeCollapsible && !isExpanded ? 'auto' : 'visible',
            position: 'relative',
            whiteSpace: isUnwrapped ? 'pre' : 'pre-wrap'
          }}>
          {code}
        </CodeContent>
      )}
      {executionResult && (
        <ExecutionResult
          success={executionResult.success}
          output={executionResult.output}
          error={executionResult.error}
        />
      )}
      {codeCollapsible && (
        <ExpandButton
          isExpanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
          showButton={shouldShowExpandButton}
        />
      )}
      {showFooterCopyButton && (
        <CodeFooter>
          <CopyButton text={code} style={{ marginTop: -40, marginRight: 10 }} />
        </CodeFooter>
      )}
    </CodeBlockWrapper>
  ) : (
    <WrappedCode className={className}>{children}</WrappedCode>
  )
}

const EditButton: React.FC<{ isEditing: boolean; onClick: () => void }> = ({ isEditing, onClick }) => {
  const { t } = useTranslation()
  const editLabel = isEditing ? t('code_block.done_editing') : t('code_block.edit')

  return (
    <Tooltip title={editLabel}>
      <EditButtonWrapper onClick={onClick} title={editLabel}>
        {isEditing ? <CheckOutlined style={{ color: 'var(--color-primary)' }} /> : <EditOutlined />}
      </EditButtonWrapper>
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

const EditorContainer = styled.div`
  border: 0.5px solid var(--color-code-background);
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  margin-top: 0;
  position: relative;
`

const CodeContent = styled.pre<{ isShowLineNumbers: boolean; isUnwrapped: boolean; isCodeWrappable: boolean }>`
  padding: 1em;
  background-color: var(--color-code-background);
  border-radius: 4px;
  overflow: auto;
  font-family: monospace;
  white-space: ${(props) => (props.isUnwrapped ? 'pre' : 'pre-wrap')};
  word-break: break-all;
`

const CodeHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5em 1em;
  background-color: var(--color-code-background);
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
  border-bottom: 0.5px solid var(--color-border);
`

const CodeLanguage = styled.span`
  font-family: monospace;
  font-size: 0.9em;
  color: #000000;
  padding: 2px 8px;
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 0.9);
  font-weight: bold;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
`

const StickyWrapper = styled.div`
  position: sticky;
  top: 0;
  z-index: 10;
`

const CodeFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: 0.5em;
`

const ExpandButtonWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0.5em;
  cursor: pointer;
  background-color: var(--color-code-background);
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  border-top: 0.5px solid var(--color-border);

  .button-text {
    font-size: 0.8em;
    color: var(--color-text-3);
  }

  &:hover {
    background-color: var(--color-code-background-hover);
  }
`

const UnwrapButtonWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  color: var(--color-text-3);

  &:hover {
    color: var(--color-primary);
  }
`

const CopyButtonWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  color: var(--color-text-3);

  &:hover {
    color: var(--color-primary);
  }

  .copy {
    width: 100%;
    height: 100%;
  }
`

const EditButtonWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  color: var(--color-text-3);

  &:hover {
    color: var(--color-primary);
  }
`

const UndoRedoButton: React.FC<{ icon: React.ReactNode; title: string; onClick: () => void }> = ({
  icon,
  title,
  onClick
}) => {
  return (
    <Tooltip title={title}>
      <UndoRedoButtonWrapper onClick={onClick} title={title}>
        {icon}
      </UndoRedoButtonWrapper>
    </Tooltip>
  )
}

const UndoRedoButtonWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  color: var(--color-text-3);

  &:hover {
    color: var(--color-primary);
  }
`

const DownloadWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  color: var(--color-text-3);

  &:hover {
    color: var(--color-primary);
  }
`

const ExecuteButton: React.FC<{ isExecuting: boolean; onClick: () => void; title: string }> = ({
  isExecuting,
  onClick,
  title
}) => {
  return (
    <Tooltip title={title}>
      <ExecuteButtonWrapper onClick={onClick} disabled={isExecuting}>
        {isExecuting ? <LoadingOutlined /> : <PlayCircleOutlined />}
      </ExecuteButtonWrapper>
    </Tooltip>
  )
}

const ExecuteButtonWrapper = styled.div<{ disabled: boolean }>`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 24px;
  height: 24px;
  cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
  color: var(--color-text-3);
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};

  &:hover {
    color: ${(props) => (props.disabled ? 'var(--color-text-3)' : 'var(--color-primary)')};
  }
`

const CollapseIcon = styled(({ expanded, ...props }: { expanded: boolean; onClick: () => void }) => (
  <div {...props}>{expanded ? <DownOutlined /> : <DownOutlined style={{ transform: 'rotate(180deg)' }} />}</div>
))`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  color: var(--color-text-3);

  &:hover {
    color: var(--color-primary);
  }
`

const WrappedCode = styled.code`
  text-wrap: wrap;
`

export default EditableCodeBlock
