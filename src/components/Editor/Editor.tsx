import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from 'react'
import './Editor.css'

interface EditorProps {
  value: string
  onChange: (value: string) => void
  /** 文件导入回调 */
  onFileImport: (file: File) => void
  /** 是否正在导入中 */
  importing?: boolean
  /** 清空回调 */
  onClear: () => void
}

export function Editor({ value, onChange, onFileImport, importing, onClear }: EditorProps) {
  const [dragging, setDragging] = useState(false)

  // 使用 ref 计数器避免子元素触发 dragLeave 导致闪烁
  const dragCounterRef = useRef(0)

  // 隐藏的 file input 引用
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImportClick = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.click()
  }, [])

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0]
    if (file) onFileImport(file)
    // 重置 input 以允许连续选择同一文件
    e.target.value = ''
  }, [onFileImport])

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (dragCounterRef.current === 1) setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setDragging(false)
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    dragCounterRef.current = 0

    const file = e.dataTransfer.files[0]
    if (file) onFileImport(file)
  }, [onFileImport])

  const hasContent = value.trim().length > 0

  return (
    <div
      className="editor-container"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="editor-header">
        <span className="editor-label">公文正文（可拖入docx文件）</span>
        <span className="editor-hint">首行自动识别为标题，后续自动识别各级标题</span>
      </div>
      <textarea
        className="editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`关于XXX的通知\n\n一、总体要求\n为深入贯彻落实……\n（一）指导思想\n坚持以……\n1.加强组织领导\n（1）制定实施方案\n各部门要……`}
        spellCheck={false}
      />
      <div className="editor-footer">
        <button
          className="editor-btn editor-btn--import"
          onClick={handleImportClick}
          disabled={importing}
          title="导入 .docx 或 .txt 文件"
        >
          {importing ? '导入中…' : '导入'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.txt,.doc,.wps"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button
          className="editor-btn editor-btn--clear"
          onClick={onClear}
          disabled={!hasContent}
        >
          清空
        </button>
      </div>
      {dragging && (
        <div className="editor-drop-overlay">
          <span>释放文件以导入</span>
        </div>
      )}
      {importing && (
        <div className="editor-drop-overlay editor-drop-overlay--importing">
          <span>正在提取文本…</span>
        </div>
      )}
    </div>
  )
}
