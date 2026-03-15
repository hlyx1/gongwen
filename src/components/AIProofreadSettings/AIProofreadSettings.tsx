/**
 * AI 校对设置弹窗组件
 * 用于配置 AI 校对相关参数
 * 兼容 Chrome 78 内核，不使用可选链和空值合并操作符
 */

import { useState, type FormEvent, type ChangeEvent } from 'react'
import type { AIProofreadConfig, CustomCheckItem } from '../../types/aiProofread'
import './AIProofreadSettings.css'

/**
 * 固定提示词内容
 * 包含审核要求和基础检查项，只读显示
 */
var FIXED_PROMPT =
  '你是一位资深的公文审核专家。请对以下公文进行逐句审核。\n' +
  '\n' +
  '【审核要求】\n' +
  '1. 逐句分析每个句子的语法、用词、逻辑是否正确\n' +
  '2. 如果句子没有问题，修改建议填写"无"\n' +
  '3. 如果句子有问题，修改建议填写修改后的内容\n' +
  '4. 必须严格按照要求的Markdown表格格式输出\n' +
  '\n' +
  '【基础检查项】\n' +
  '- 语法错误：成分残缺、搭配不当、语序混乱\n' +
  '- 用词不当：不符合公文规范的口语化表达\n' +
  '- 逻辑问题：前后矛盾、概念不清、指代不明\n' +
  '- 格式问题：标点使用不当、数字格式不规范\n' +
  '- 表达冗余：重复啰嗦、可简化的表述'

interface AIProofreadSettingsProps {
  isOpen: boolean
  config: AIProofreadConfig
  onSave: (config: AIProofreadConfig) => void
  onClose: () => void
}

/**
 * 生成唯一ID
 */
function generateId(): string {
  return 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

/**
 * 添加检查项弹窗组件
 */
function AddCheckItemDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (item: CustomCheckItem) => void
  onCancel: () => void
}) {
  var _useState = useState('')
  var name = _useState[0]
  var setName = _useState[1]

  var _useState2 = useState('')
  var description = _useState2[0]
  var setDescription = _useState2[1]

  /**
   * 处理表单提交
   */
  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) {
      onConfirm({
        id: generateId(),
        name: name.trim(),
        description: description.trim(),
      })
    }
  }

  return (
    <div className="ai-settings-dialog-overlay" onClick={onCancel}>
      <div className="ai-settings-dialog" onClick={function (e) { e.stopPropagation() }}>
        <form onSubmit={handleSubmit}>
          <div className="ai-settings-dialog-header">
            <h3 className="ai-settings-dialog-title">添加检查项</h3>
          </div>
          <div className="ai-settings-dialog-body">
            <label className="ai-settings-field">
              <span className="ai-settings-field-label">名称 *</span>
              <input
                type="text"
                className="ai-settings-input"
                value={name}
                placeholder="如：政治敏感性检查"
                onChange={function (e: ChangeEvent<HTMLInputElement>) { setName(e.target.value) }}
                autoFocus
              />
            </label>
            <label className="ai-settings-field">
              <span className="ai-settings-field-label">描述</span>
              <textarea
                className="ai-settings-textarea"
                value={description}
                placeholder="如：检查是否包含敏感词汇或不当表述"
                onChange={function (e: ChangeEvent<HTMLTextAreaElement>) { setDescription(e.target.value) }}
                rows={3}
              />
            </label>
          </div>
          <div className="ai-settings-dialog-footer">
            <button type="button" className="ai-settings-btn ai-settings-btn--cancel" onClick={onCancel}>
              取消
            </button>
            <button
              type="submit"
              className="ai-settings-btn ai-settings-btn--save"
              disabled={!name.trim()}
            >
              确认
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * AI 校对设置弹窗组件
 */
export function AIProofreadSettings(props: AIProofreadSettingsProps) {
  var isOpen = props.isOpen
  var config = props.config
  var onSave = props.onSave
  var onClose = props.onClose

  // 本地状态
  var _useState3 = useState(config.customCheckItems)
  var customCheckItems = _useState3[0]
  var setCustomCheckItems = _useState3[1]

  var _useState4 = useState(false)
  var showAddDialog = _useState4[0]
  var setShowAddDialog = _useState4[1]

  // 当外部 config 变化时同步状态
  var _useState5 = useState(config)
  var lastConfig = _useState5[0]
  var setLastConfig = _useState5[1]

  if (config !== lastConfig) {
    setLastConfig(config)
    setCustomCheckItems(config.customCheckItems)
  }

  // 如果弹窗未打开，不渲染
  if (!isOpen) {
    return null
  }

  /**
   * 处理保存
   */
  function handleSave() {
    onSave({
      customCheckItems: customCheckItems,
    })
  }

  /**
   * 处理取消
   */
  function handleCancel() {
    // 重置为原始配置
    setCustomCheckItems(config.customCheckItems)
    onClose()
  }

  /**
   * 处理添加检查项
   */
  function handleAddCheckItem(item: CustomCheckItem) {
    setCustomCheckItems(customCheckItems.concat([item]))
    setShowAddDialog(false)
  }

  /**
   * 处理删除检查项
   */
  function handleDeleteCheckItem(id: string) {
    setCustomCheckItems(customCheckItems.filter(function (item) {
      return item.id !== id
    }))
  }

  return (
    <div className="ai-settings-overlay" onClick={handleCancel}>
      <div className="ai-settings-modal" onClick={function (e) { e.stopPropagation() }}>
        {/* 顶部 */}
        <div className="ai-settings-header">
          <h2 className="ai-settings-title">AI 校对设置</h2>
          <button className="ai-settings-close" onClick={handleCancel} aria-label="关闭">
            x
          </button>
        </div>

        {/* 内容区 */}
        <div className="ai-settings-body">
          {/* 固定提示词区域 */}
          <section className="ai-settings-section">
            <h3 className="ai-settings-section-title">固定提示词</h3>
            <div className="ai-settings-prompt-box">
              <pre className="ai-settings-prompt-content">{FIXED_PROMPT}</pre>
            </div>
            <p className="ai-settings-hint">此提示词为系统预设，不可修改</p>
          </section>

          {/* 自定义检查项管理区域 */}
          <section className="ai-settings-section">
            <h3 className="ai-settings-section-title">自定义检查项</h3>
            <div className="ai-settings-check-items">
              {customCheckItems.length === 0 ? (
                <p className="ai-settings-empty">暂无自定义检查项</p>
              ) : (
                customCheckItems.map(function (item) {
                  return (
                    <div key={item.id} className="ai-settings-check-item">
                      <div className="ai-settings-check-item-content">
                        <div className="ai-settings-check-item-name">{item.name}</div>
                        {item.description && (
                          <div className="ai-settings-check-item-desc">{item.description}</div>
                        )}
                      </div>
                      <button
                        className="ai-settings-check-item-delete"
                        onClick={function () { handleDeleteCheckItem(item.id) }}
                        title="删除"
                      >
                        x
                      </button>
                    </div>
                  )
                })
              )}
            </div>
            <button
              className="ai-settings-btn ai-settings-btn--add"
              onClick={function () { setShowAddDialog(true) }}
            >
              + 添加检查项
            </button>
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

      {/* 添加检查项弹窗 */}
      {showAddDialog && (
        <AddCheckItemDialog
          onConfirm={handleAddCheckItem}
          onCancel={function () { setShowAddDialog(false) }}
        />
      )}
    </div>
  )
}
