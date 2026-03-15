import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Editor } from './components/Editor/Editor'
import { Preview } from './components/Preview/Preview'
import { Toolbar } from './components/Toolbar/Toolbar'
import { DetectionPanel } from './components/DetectionPanel'
import AIProofreadButton from './components/AIProofreadButton/AIProofreadButton'
import { AIProofreadSettings } from './components/AIProofreadSettings/AIProofreadSettings'
import { useDocumentParser } from './hooks/useDocumentParser'
import { useDocumentConfig } from './contexts/DocumentConfigContext'
import { useAIProofread } from './hooks/useAIProofread'
import type { FullProofreadConfig } from './hooks/useAIProofread'
import { isAIServiceConfigured } from './services/aiServiceConfig'
import { downloadDocx } from './exporter'
import { sanitizeText } from './utils/sanitize'
import { importFile } from './utils/fileImporter'
import { getHistory, saveToHistory, deleteHistoryItem, clearHistory, isContentExists } from './utils/historyStorage'
import type { HistoryRecord } from './types/history'
import type { AIProofreadConfig } from './types/aiProofread'
import { DEFAULT_AI_PROOFREAD_CONFIG, AI_PROOFREAD_INTERNAL_CONFIG } from './types/aiProofread'
import './App.css'

const STORAGE_KEY_TEXT = 'docx-editor-text'

/** 从 localStorage 读取持久化的编辑区文本 */
function loadText(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_TEXT) || ''
  } catch {
    return ''
  }
}

/** AI 配置存储键 */
const STORAGE_KEY_AI_CONFIG = 'ai-proofread-config'

/** 从 localStorage 读取 AI 配置 */
function loadAIConfig(): AIProofreadConfig {
  try {
    var saved = localStorage.getItem(STORAGE_KEY_AI_CONFIG)
    if (saved) {
      var parsed = JSON.parse(saved)
      return {
        customCheckItems: parsed.customCheckItems || [],
      }
    }
  } catch {
    // 解析失败使用默认配置
  }
  return DEFAULT_AI_PROOFREAD_CONFIG
}

function App() {
  const [text, setText] = useState(loadText)
  const [importing, setImporting] = useState(false)
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>(() => getHistory())
  
  // AI 审核相关状态
  const [aiConfig, setAIConfig] = useState<AIProofreadConfig>(loadAIConfig)
  const [showAISettings, setShowAISettings] = useState(false)
  
  // 使用 AI 审核 hook
  var aiProofreadHook = useAIProofread()
  var aiProofreadState = aiProofreadHook.state
  var startProofread = aiProofreadHook.startProofread
  var isAIConfigured = isAIServiceConfigured()

  // 自动净化：解析前预处理，编辑器保留原文不干扰输入
  const sanitized = useMemo(() => sanitizeText(text).text, [text])
  const ast = useDocumentParser(sanitized)
  const { config } = useDocumentConfig()

  // Auto-Save: debounce 500ms 写入 localStorage
  const isContentDuplicate = useMemo(() => isContentExists(text), [text, historyRecords])

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY_TEXT, text)
      } catch {
        // localStorage 写入失败静默忽略
      }
    }, 500)
    return () => clearTimeout(timerRef.current)
  }, [text])

  /**
   * 导出文档
   */
  const handleExport = useCallback(async () => {
    try {
      await downloadDocx(ast, config)
    } catch (err) {
      console.error('导出失败:', err)
      alert('导出失败，请检查控制台日志')
    }
  }, [ast, config])

  /**
   * 清空编辑器
   */
  const handleClear = useCallback(() => {
    setText('')
    try {
      localStorage.removeItem(STORAGE_KEY_TEXT)
    } catch {
      // 静默忽略
    }
  }, [])

  /**
   * 导入文件
   */
  const handleImport = useCallback(async (file: File) => {
    if (text.trim() && !confirm('导入文件将覆盖当前内容，是否继续？')) return

    setImporting(true)
    try {
      const result = await importFile(file)
      setText(result.text)
    } catch (err) {
      alert(err instanceof Error ? err.message : '文件导入失败')
    } finally {
      setImporting(false)
    }
  }, [text])

  /**
   * 保存当前内容到历史记录
   */
  const handleSave = useCallback(() => {
    if (!text.trim()) return
    const success = saveToHistory(text)
    if (success) {
      setHistoryRecords(getHistory())
    }
  }, [text])

  /**
   * 从历史记录恢复内容
   */
  const handleRestore = useCallback((content: string) => {
    setText(content)
  }, [])

  /**
   * 删除历史记录项
   */
  const handleDeleteHistory = useCallback((id: string) => {
    const updated = deleteHistoryItem(id)
    setHistoryRecords(updated)
  }, [])

  /**
   * 清空所有历史记录
   */
  const handleClearHistory = useCallback(() => {
    clearHistory()
    setHistoryRecords([])
  }, [])

  /**
   * 开始 AI 审核
   */
  const handleStartAIProofread = useCallback(function() {
    startProofread(ast, {
      customCheckItems: aiConfig.customCheckItems,
      maxCharsPerRequest: AI_PROOFREAD_INTERNAL_CONFIG.maxCharsPerRequest,
      maxConcurrentRequests: AI_PROOFREAD_INTERNAL_CONFIG.maxConcurrentRequests,
    })
  }, [ast, aiConfig, startProofread])

  /**
   * 保存 AI 配置
   */
  const handleSaveAIConfig = useCallback(function(newConfig: AIProofreadConfig) {
    setAIConfig(newConfig)
    try {
      localStorage.setItem(STORAGE_KEY_AI_CONFIG, JSON.stringify(newConfig))
    } catch {
      // 保存失败静默忽略
    }
    setShowAISettings(false)
  }, [])

  /**
   * 计算问题数量
   */
  var issueCount = 0
  aiProofreadState.results.forEach(function(result) {
    if (result.hasIssue) {
      issueCount = issueCount + 1
    }
  })

  return (
    <div className="app">
      <Toolbar
        ast={ast}
        onExport={handleExport}
      />
      <div className="app-main">
        <div className="app-editor">
          <Editor
            value={text}
            onChange={setText}
            onFileImport={handleImport}
            importing={importing}
            onClear={handleClear}
            onSave={handleSave}
            historyRecords={historyRecords}
            onRestore={handleRestore}
            onDeleteHistory={handleDeleteHistory}
            onClearHistory={handleClearHistory}
            isContentDuplicate={isContentDuplicate}
          />
        </div>
        <div className="app-detection">
          <DetectionPanel 
            ast={ast} 
            aiProofreadState={aiProofreadState}
            isAIConfigured={isAIConfigured}
          />
        </div>
        <div className="app-preview">
          <div className="app-preview-header">
            <div className="app-preview-header-left">
              <span className="preview-label">预览（浏览器样式仅供参考，请导出 Word 确认）</span>
            </div>
            <div className="app-preview-header-right">
              <AIProofreadButton
                status={aiProofreadState.status}
                processedSentences={aiProofreadState.processedSentences}
                totalSentences={aiProofreadState.totalSentences}
                issueCount={issueCount}
                isConfigured={isAIConfigured}
                onStartProofread={handleStartAIProofread}
              />
              <button 
                className="ai-settings-btn"
                onClick={function() { setShowAISettings(true) }}
                type="button"
                title="审核设置"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6.5 1L6.87 2.96C6.08 3.24 5.37 3.67 4.77 4.22L2.87 3.5L1.37 6.1L2.93 7.4C2.85 7.76 2.8 8.12 2.8 8.5C2.8 8.88 2.85 9.24 2.93 9.6L1.37 10.9L2.87 13.5L4.77 12.78C5.37 13.33 6.08 13.76 6.87 14.04L7.25 16H9.75L10.13 14.04C10.92 13.76 11.63 13.33 12.23 12.78L14.13 13.5L15.63 10.9L14.07 9.6C14.15 9.24 14.2 8.88 14.2 8.5C14.2 8.12 14.15 7.76 14.07 7.4L15.63 6.1L14.13 3.5L12.23 4.22C11.63 3.67 10.92 3.24 10.13 2.96L9.75 1H6.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
                  <circle cx="8.5" cy="8.5" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                </svg>
                <span>设置</span>
              </button>
            </div>
          </div>
          <div className="app-preview-content">
            <Preview 
              ast={ast} 
              aiProofreadResults={aiProofreadState.results}
            />
          </div>
          <AIProofreadSettings
            isOpen={showAISettings}
            config={aiConfig}
            onSave={handleSaveAIConfig}
            onClose={function() { setShowAISettings(false) }}
          />
        </div>
      </div>
    </div>
  )
}

export default App
