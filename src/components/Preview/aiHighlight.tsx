import React from 'react'
import type { AIProofreadResult } from '../../types/aiProofread'

/**
 * AI 高亮包装层（工作单元-5 交付物；task-0004 0022 接线调整结构；
 * task-0007 切句对齐后收敛为上下文类型＋标题高亮查询）
 *
 * - 切句单一真值（task-0007/0013 对齐）：旧内联切句正则
 *   splitHighlightSentences 已删除——高亮侧切句改为复用
 *   utils/sentenceSplitter 的 splitNodeIntoSentences（经
 *   renderContentFlow 的 sentencesForBlock 消费），正文族句集合、
 *   边界、trim 口径与送审侧逐句一致。0013 对齐后高亮侧切句以
 *   sentenceSplitter 为单一真值，改切句行为须双侧同变
 *   （sentenceSplitter 切句逻辑为冻结红线）
 * - 本文件保留：AI 高亮上下文类型＋公文标题整段高亮查询（seq=1；
 *   多段标题统一查送审合并句 id DOCUMENT_TITLE-<首行>-1，行号由
 *   renderContentFlow 自 blocks 序列推导后传入——task-0007 条款4）
 * - 校对结果为空（无 Map 或 size=0）时全部退化为纯文本，与旧实现一致
 */

/** 高亮上下文：A4Page 悬停态注入；度量容器不注入（无高亮渲染） */
export interface AIHighlightContext {
  results: Map<string, AIProofreadResult>
  onEnter: (result: AIProofreadResult) => void
  onLeave: () => void
}

/**
 * 渲染带高亮的公文标题（旧 renderTitleWithHighlight 原样迁移）
 * 公文标题作为整体处理，sentenceId 固定取 seq=1
 * （多段标题时 sourceLineNumber＝送审合并句的首标题块行号，由调用方传入）
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
