import React from 'react'
import type { AIProofreadResult } from '../../types/aiProofread'

/**
 * AI 高亮包装层（工作单元-5 交付物）
 *
 * 从旧 A4Page 的 8 个渲染函数（renderHeading1~4 / renderHeading1~4WithHighlight）
 * 中抽出句子级高亮横切逻辑，与字体 run 渲染解耦：
 * - 切句正则与 sentenceId 生成规则（nodeType-lineNumber-localSeq）自旧实现
 *   原样迁移——这是冻结项：与 utils/sentenceSplitter.ts 的既有差异不统一
 *   （差异已入池为待办-0013），高亮切句文本切片边界不得变
 * - 已知冻结特征：标题（一至四级）首句取 seq=1，剩余部分重新从 seq=1 起算
 *   ——同一节点内首句与剩余首句的 sentenceId 相同（旧实现现状，双高亮副作用
 *   由结构快照锁定）
 * - 校对结果为空（无 Map 或 size=0）时全部退化为纯文本，与旧实现一致
 */

/** 高亮上下文：A4Page 悬停态注入；度量容器不注入（无高亮渲染） */
export interface AIHighlightContext {
  results: Map<string, AIProofreadResult>
  onEnter: (result: AIProofreadResult) => void
  onLeave: () => void
}

/**
 * 按句子拆分文本并渲染高亮（旧 renderTextWithHighlight 原样迁移）
 * 句子以句号、问号、感叹号、分号、省略号结尾
 */
export function renderSentenceHighlight(
  content: string,
  sourceType: string,
  sourceLineNumber: number,
  ai: AIHighlightContext | undefined
): React.ReactNode {
  // 如果没有校对结果，直接返回原文（保持纯文本子节点）
  if (!ai || ai.results.size === 0) {
    return content
  }

  // 按句子拆分文本（正则与旧实现逐字符一致——冻结项，见文件头注释）
  const sentenceEndRegex = /[^。！？；…]*[。！？；…]|[^。！？；…]+/g
  const sentences: string[] = []
  let match: RegExpExecArray | null

  while ((match = sentenceEndRegex.exec(content)) !== null) {
    const text = match[0].trim()
    if (text.length > 0) {
      sentences.push(text)
    }
  }

  // 如果没有拆分出句子，直接返回原文
  if (sentences.length === 0) {
    return content
  }

  // 为每个句子查找对应的校对结果（sentenceId：nodeType-lineNumber-localSeq）
  const elements: React.ReactNode[] = []
  let sentenceSeqInNode = 1

  sentences.forEach(function (sentence, idx) {
    const sentenceId = sourceType + '-' + sourceLineNumber + '-' + sentenceSeqInNode
    const result = ai.results.get(sentenceId)

    if (result && result.hasIssue) {
      // 有问题的句子，添加高亮
      elements.push(
        <span
          key={idx}
          className="a4-highlight-sentence"
          onMouseEnter={function () { ai.onEnter(result) }}
          onMouseLeave={ai.onLeave}
        >
          {sentence}
        </span>
      )
    } else {
      elements.push(<span key={idx}>{sentence}</span>)
    }
    sentenceSeqInNode++
  })

  return <>{elements}</>
}

/**
 * 渲染带高亮的公文标题（旧 renderTitleWithHighlight 原样迁移）
 * 公文标题作为整体处理，sentenceId 固定取 seq=1
 */
export function renderTitleHighlight(
  content: string,
  sourceType: string,
  sourceLineNumber: number,
  ai: AIHighlightContext | undefined
): React.ReactNode {
  if (!ai || ai.results.size === 0) {
    return content
  }
  const sentenceId = sourceType + '-' + sourceLineNumber + '-1'
  const result = ai.results.get(sentenceId)
  if (result && result.hasIssue) {
    return (
      <span
        className="a4-highlight-sentence"
        onMouseEnter={function () { ai.onEnter(result) }}
        onMouseLeave={ai.onLeave}
      >
        {content}
      </span>
    )
  }
  return content
}
