/**
 * AI 校对设置弹窗组件
 * 用于配置 AI 校对相关参数
 * 兼容 Chrome 78 内核，不使用可选链和空值合并操作符
 */

import { useState, type ChangeEvent } from 'react'
import type { AIProofreadConfig } from '../../types/aiProofread'
import { BUILTIN_CHECK_ITEMS } from '../../services/aiProofreadService'
import './AIProofreadSettings.css'

/**
 * 固定提示词前缀
 */
var FIXED_PROMPT_PREFIX =
  '你是一位资深的公文审核专家。请对以下公文进行逐句审核。\n' +
  '\n' +
  '【审核要求】\n' +
  '1. 逐句分析每个句子的语法、用词、逻辑是否正确\n' +
  '2. 如果句子没有问题，修改建议填写"无"\n' +
  '3. 如果句子有问题，修改建议填写修改后的内容\n' +
  '4. 必须严格按照要求的Markdown表格格式输出'

/**
 * 固定提示词后缀
 */
var FIXED_PROMPT_SUFFIX =
  '【输出格式】\n' +
  '必须输出Markdown表格格式，包含3列：\n' +
  '\n' +
  '| 序号 | 原句 | 修改建议 |\n' +
  '|:----|:---|:---|\n' +
  '\n' +
  '说明：\n' +
  '1. 序号列：填写句子标签中的序号数字，如句子标签为<序号1>则填1\n' +
  '2. 原句列：填写标签内的原句子内容（不含标签）\n' +
  '3. 修改建议列：无问题填"无"，有问题填修改建议\n' +
  '4. 每行一个句子，按顺序输出，不要遗漏\n' +
  '5. 不要添加表头以外的其他内容\n' +
  '\n' +
  '请对以下句子进行审核：'

/**
 * 构建完整提示词（用于预览）
 * @param customCheckItems 用户添加的检查项
 * @returns 完整提示词字符串
 */
function buildFullPrompt(customCheckItems: string[]): string {
  var prompt = FIXED_PROMPT_PREFIX

  // 添加检查项（内置 + 用户添加）
  prompt += '\n\n【检查项】'
  
  // 添加内置检查项
  for (var i = 0; i < BUILTIN_CHECK_ITEMS.length; i++) {
    prompt += '\n- ' + BUILTIN_CHECK_ITEMS[i]
  }
  
  // 添加用户检查项
  for (var j = 0; j < customCheckItems.length; j++) {
    var item = customCheckItems[j]
    if (item && item.trim().length > 0) {
      prompt += '\n- ' + item.trim()
    }
  }

  prompt += '\n\n' + FIXED_PROMPT_SUFFIX

  return prompt
}

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

  // 当外部 config 变化时同步状态
  var _useState2 = useState(config)
  var lastConfig = _useState2[0]
  var setLastConfig = _useState2[1]

  if (config !== lastConfig) {
    setLastConfig(config)
    setCustomCheckText(config.customCheckItems.join('\n'))
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
   * 处理保存
   */
  function handleSave() {
    onSave({
      customCheckItems: parseCustomCheckItems(customCheckText),
    })
  }

  /**
   * 处理取消
   */
  function handleCancel() {
    // 重置为原始配置
    setCustomCheckText(config.customCheckItems.join('\n'))
    onClose()
  }

  // 构建预览提示词
  var previewPrompt = buildFullPrompt(parseCustomCheckItems(customCheckText))

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
            <div className="ai-settings-builtin-items">
              <div className="ai-settings-builtin-label">系统内置：</div>
              <ul className="ai-settings-builtin-list">
                {BUILTIN_CHECK_ITEMS.map(function (item, index) {
                  return (
                    <li key={index} className="ai-settings-builtin-item">
                      {item}
                    </li>
                  )
                })}
              </ul>
            </div>
            
            {/* 用户添加的检查项 */}
            <div className="ai-settings-custom-area">
              <div className="ai-settings-custom-label">添加更多检查项（每行一个）：</div>
              <textarea
                className="ai-settings-textarea ai-settings-textarea--large"
                value={customCheckText}
                placeholder={'示例：\n检查是否包含敏感词汇\n检查是否有政治性错误\n检查称谓是否规范'}
                onChange={function (e: ChangeEvent<HTMLTextAreaElement>) {
                  setCustomCheckText(e.target.value)
                }}
                rows={8}
              />
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
