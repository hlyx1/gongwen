/**
 * AI 校对设置弹窗组件
 * 用于配置 AI 校对相关参数
 * 兼容 Chrome 78 内核，不使用可选链和空值合并操作符
 */

import { useState, type ChangeEvent } from 'react'
import type { AIProofreadConfig, CustomExampleItem } from '../../types/aiProofread'
import { BUILTIN_CHECK_ITEMS, BUILTIN_EXAMPLES, buildPromptTemplate } from '../../services/aiProofreadService'
import './AIProofreadSettings.css'

interface AIProofreadSettingsProps {
  isOpen: boolean
  config: AIProofreadConfig
  onSave: (config: AIProofreadConfig) => void
  onClose: () => void
}

/**
 * AI 校对设置弹窗组件
 */
export function AIProofreadSettings(props: AIProofreadSettingsProps) {
  var isOpen = props.isOpen
  var config = props.config
  var onSave = props.onSave
  var onClose = props.onClose

  // 本地状态：用户添加的检查项文本（每行一个）
  var _useState = useState(config.customCheckItems.join('\n'))
  var customCheckText = _useState[0]
  var setCustomCheckText = _useState[1]

  // 本地状态：用户添加的示例行列表
  var _useState3 = useState<CustomExampleItem[]>(config.customExampleItems.slice())
  var customExampleItems = _useState3[0]
  var setCustomExampleItems = _useState3[1]

  // 本地状态：新示例输入
  var _useState4 = useState('')
  var newExampleOriginal = _useState4[0]
  var setNewExampleOriginal = _useState4[1]

  var _useState5 = useState('')
  var newExampleSuggestion = _useState5[0]
  var setNewExampleSuggestion = _useState5[1]

  // 当外部 config 变化时同步状态
  var _useState2 = useState(config)
  var lastConfig = _useState2[0]
  var setLastConfig = _useState2[1]

  if (config !== lastConfig) {
    setLastConfig(config)
    setCustomCheckText(config.customCheckItems.join('\n'))
    setCustomExampleItems(config.customExampleItems.slice())
  }

  // 如果弹窗未打开，不渲染
  if (!isOpen) {
    return null
  }

  /**
   * 解析用户检查项文本
   */
  function parseCustomCheckItems(text: string): string[] {
    var lines = text.split('\n')
    var items: string[] = []
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim()
      if (line.length > 0) {
        items.push(line)
      }
    }
    return items
  }

  /**
   * 添加示例行
   */
  function handleAddExample() {
    if (newExampleOriginal.trim().length > 0) {
      var newItem: CustomExampleItem = {
        originalText: newExampleOriginal.trim(),
        suggestion: newExampleSuggestion.trim(),
      }
      setCustomExampleItems(customExampleItems.concat([newItem]))
      setNewExampleOriginal('')
      setNewExampleSuggestion('')
    }
  }

  /**
   * 删除示例行
   */
  function handleDeleteExample(index: number) {
    var newItems: CustomExampleItem[] = []
    for (var i = 0; i < customExampleItems.length; i++) {
      if (i !== index) {
        newItems.push(customExampleItems[i])
      }
    }
    setCustomExampleItems(newItems)
  }

  /**
   * 处理保存
   */
  function handleSave() {
    onSave({
      customCheckItems: parseCustomCheckItems(customCheckText),
      customExampleItems: customExampleItems,
    })
  }

  /**
   * 处理取消
   */
  function handleCancel() {
    // 重置为原始配置
    setCustomCheckText(config.customCheckItems.join('\n'))
    setCustomExampleItems(config.customExampleItems.slice())
    setNewExampleOriginal('')
    setNewExampleSuggestion('')
    onClose()
  }

  // 构建预览提示词
  var previewPrompt = buildPromptTemplate(parseCustomCheckItems(customCheckText), customExampleItems)

  return (
    <div className="ai-settings-overlay" onClick={handleCancel}>
      <div className="ai-settings-modal ai-settings-modal--wide" onClick={function (e) { e.stopPropagation() }}>
        {/* 顶部 */}
        <div className="ai-settings-header">
          <h2 className="ai-settings-title">AI 校对设置</h2>
          <button className="ai-settings-close" onClick={handleCancel} aria-label="关闭">
            x
          </button>
        </div>

        {/* 内容区 - 两列布局 */}
        <div className="ai-settings-body ai-settings-body--twocol">
          {/* 左列：检查项 */}
          <section className="ai-settings-section ai-settings-section--left">
            <h3 className="ai-settings-section-title">检查项</h3>
            
            {/* 系统内置检查项 */}
            <div className="ai-settings-builtin-compact">
              <div className="ai-settings-builtin-label-compact">系统内置：</div>
              <ol className="ai-settings-builtin-list-compact">
                {BUILTIN_CHECK_ITEMS.map(function (item, index) {
                  return (
                    <li key={index} className="ai-settings-builtin-item-compact">
                      {item}
                    </li>
                  )
                })}
              </ol>
            </div>
            
            {/* 用户添加的检查项 */}
            <div className="ai-settings-custom-area ai-settings-custom-area--compact">
              <div className="ai-settings-custom-label">添加检查项（每行一个）：</div>
              <textarea
                className="ai-settings-textarea ai-settings-textarea--compact"
                value={customCheckText}
                placeholder={'示例：检查是否包含敏感词汇'}
                onChange={function (e: ChangeEvent<HTMLTextAreaElement>) {
                  setCustomCheckText(e.target.value)
                }}
                rows={2}
              />
            </div>
            
            {/* 示例行 */}
            <div className="ai-settings-custom-area">
              <div className="ai-settings-custom-label">示例行：</div>
              
              {/* 内置示例列表 */}
              <div className="ai-settings-example-list ai-settings-example-list--builtin">
                <div className="ai-settings-example-list-header">系统内置：</div>
                {BUILTIN_EXAMPLES.map(function (item, index) {
                  return (
                    <div key={index} className="ai-settings-example-item ai-settings-example-item--builtin">
                      <div className="ai-settings-example-content">
                        <span className="ai-settings-example-original">{item.originalText}</span>
                        <span className="ai-settings-example-arrow">→</span>
                        <span className="ai-settings-example-suggestion">{item.suggestion}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              
              {/* 用户添加的示例列表 */}
              {customExampleItems.length > 0 && (
                <div className="ai-settings-example-list ai-settings-example-list--custom">
                  <div className="ai-settings-example-list-header">用户添加：</div>
                  {customExampleItems.map(function (item, index) {
                    return (
                      <div key={index} className="ai-settings-example-item">
                        <div className="ai-settings-example-content">
                          <span className="ai-settings-example-original">{item.originalText}</span>
                          <span className="ai-settings-example-arrow">→</span>
                          <span className="ai-settings-example-suggestion">{item.suggestion || '无'}</span>
                        </div>
                        <button
                          className="ai-settings-example-delete"
                          onClick={function () { handleDeleteExample(index) }}
                          aria-label="删除"
                        >
                          x
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              
              {/* 添加新示例 */}
              <div className="ai-settings-example-add">
                <input
                  type="text"
                  className="ai-settings-input ai-settings-example-input"
                  value={newExampleOriginal}
                  placeholder="原句"
                  onChange={function (e: ChangeEvent<HTMLInputElement>) {
                    setNewExampleOriginal(e.target.value)
                  }}
                />
                <input
                  type="text"
                  className="ai-settings-input ai-settings-example-input"
                  value={newExampleSuggestion}
                  placeholder="建议（无问题填「无」）"
                  onChange={function (e: ChangeEvent<HTMLInputElement>) {
                    setNewExampleSuggestion(e.target.value)
                  }}
                />
                <button
                  className="ai-settings-btn ai-settings-btn--add-small"
                  onClick={handleAddExample}
                  disabled={newExampleOriginal.trim().length === 0}
                >
                  添加
                </button>
              </div>
            </div>
          </section>

          {/* 右列：最终提示词预览 */}
          <section className="ai-settings-section ai-settings-section--right">
            <h3 className="ai-settings-section-title">最终提示词预览</h3>
            <div className="ai-settings-prompt-box ai-settings-prompt-box--preview">
              <pre className="ai-settings-prompt-content">{previewPrompt}</pre>
            </div>
          </section>
        </div>

        {/* 底部操作栏 */}
        <div className="ai-settings-footer">
          <div className="ai-settings-footer-spacer" />
          <button className="ai-settings-btn ai-settings-btn--cancel" onClick={handleCancel}>
            取消
          </button>
          <button className="ai-settings-btn ai-settings-btn--save" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
