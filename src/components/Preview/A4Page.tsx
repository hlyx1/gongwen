import { useState, useCallback } from 'react'
import type { AIProofreadResult } from '../../types/aiProofread'
import type { LayoutDocument } from '../../layout/types'
import { renderContentFlow } from './renderContentFlow'
import type { AIHighlightContext } from './aiHighlight'
import { A4HeaderSection } from './A4HeaderSection'
import { A4FooterNote } from './A4FooterNote'
import { A4PageNumber } from './A4PageNumber'
import './A4Page.css'

/**
 * A4 单页渲染器（工作单元-5 重构后）
 *
 * 退化为排版决策层（src/layout/ buildLayout, renderer='preview'）的渲染器：
 * - 内容流：renderContentFlow 消费块序列（与 Preview 度量容器同一渲染输出）
 * - 版头/版记/页码：拆出的子组件消费决策层版式参数
 * - AI 高亮：经 aiHighlight 包装层叠加（悬停浮层状态保留于此）
 * - 分页裁剪：视窗高度 clipHeight + translateY 偏移（机制不变）
 * 旧散落的排版决策（getNodeStyle/calculateTextWidthEm/SignatureIndentEm/
 * splitAttachmentTextForPreview/8 个标题渲染函数）已删除，
 * 由决策层与 renderContentFlow 供给（行为由结构特征快照锁定）。
 */
interface A4PageProps {
  /** 排版决策层产物（renderer='preview'） */
  layout: LayoutDocument
  /** 页码（自 1 起） */
  pageNumber: number
  /** 内容流偏移量(px)，用于视窗裁剪定位 */
  offsetY: number
  /** 该页应显示的内容高度(px)，精确到行边界 */
  clipHeight: number
  /** 是否为第一页（版头只出现在首页） */
  isFirstPage: boolean
  /** 是否为最后一页（版记只出现在末页） */
  isLastPage: boolean
  /** AI校对结果映射，key 为 sentenceId */
  aiProofreadResults?: Map<string, AIProofreadResult>
}

export function A4Page({
  layout,
  pageNumber,
  offsetY,
  clipHeight,
  isFirstPage,
  isLastPage,
  aiProofreadResults,
}: A4PageProps) {
  /** 悬停浮层状态 */
  const [hoveredResult, setHoveredResult] = useState<AIProofreadResult | null>(null)

  /**
   * 处理鼠标悬停事件
   * 显示AI建议浮层（固定显示在A4纸左上角）
   */
  const handleMouseEnter = useCallback(function (result: AIProofreadResult) {
    setHoveredResult(result)
  }, [])

  /**
   * 处理鼠标离开事件
   * 隐藏AI建议浮层
   */
  const handleMouseLeave = useCallback(function () {
    setHoveredResult(null)
  }, [])

  /** AI 高亮上下文（无校对结果时缺省——度量容器亦不注入） */
  const ai: AIHighlightContext | undefined = aiProofreadResults
    ? {
        results: aiProofreadResults,
        onEnter: handleMouseEnter,
        onLeave: handleMouseLeave,
      }
    : undefined

  return (
    <div className="a4-page">
      <div className="a4-content">
        {/* 版头：仅第一页且决策层给出版头版式（启用且有机关标志）时渲染 */}
        {isFirstPage && layout.header && <A4HeaderSection header={layout.header} />}
        <div className="a4-content-viewport" style={{ height: `${clipHeight}px` }}>
          <div style={{ transform: `translateY(-${offsetY}px)` }}>
            {/* 内容流：决策层块序列 → 共享渲染器 */}
            {renderContentFlow(layout.blocks, layout.metrics, ai)}
            {/* 空文档占位 */}
            {layout.blocks.length === 0 && (
              <p className="a4-placeholder">预览区域</p>
            )}
          </div>
        </div>
      </div>
      {/* AI校对建议浮层：固定显示在A4纸左上角 */}
      {hoveredResult && (
        <div className="a4-tooltip">
          <div className="a4-tooltip-header">AI 校对建议</div>
          <div className="a4-tooltip-content">
            <div className="a4-tooltip-row">
              <span className="a4-tooltip-label">原文：</span>
              <span className="a4-tooltip-original">{hoveredResult.originalText}</span>
            </div>
            <div className="a4-tooltip-row">
              <span className="a4-tooltip-label">建议：</span>
              <span className="a4-tooltip-suggestion">{hoveredResult.suggestion}</span>
            </div>
          </div>
        </div>
      )}
      {/* 版记：绝对定位到最后一页底部，末条线与版心下边缘重合 */}
      {isLastPage && layout.footerNote && <A4FooterNote note={layout.footerNote} />}
      {/* 页码：奇数页居右空一字、偶数页居左空一字（决策层 pageNumber.enabled 控制） */}
      {layout.pageNumber.enabled && (
        <A4PageNumber number={pageNumber} layout={layout.pageNumber} />
      )}
    </div>
  )
}
