import { useRef, useMemo, type CSSProperties } from 'react'
import type { GongwenAST } from '../../types/ast'
import type { AIProofreadResult } from '../../types/aiProofread'
import { useDocumentConfig } from '../../contexts/DocumentConfigContext'
import { cmToPagePercent, CHARS_PER_LINE } from '../../types/documentConfig'
import { buildLayout } from '../../layout'
import { usePagination } from '../../hooks/usePagination'
import { renderContentFlow } from './renderContentFlow'
import { A4FooterNote } from './A4FooterNote'
import { A4Page } from './A4Page'
import './A4Page.css'
import './Preview.css'

interface PreviewProps {
  ast: GongwenAST
  /** AI校对结果映射，key 为 sentenceId */
  aiProofreadResults?: Map<string, AIProofreadResult>
}

/**
 * 预览容器（工作单元-5 重构后）
 *
 * - 一次性调用决策层 buildLayout（renderer='preview'），A4Page 页面内容
 *   与度量容器消费同一份块序列渲染输出——消灭旧实现中度量容器的
 *   第三次节点遍历复制（勘探 §3.2）
 * - 度量容器与页面渲染完全同构（task-0005：表格亦渲染真表格结构，
 *   usePagination 以 `:scope > p, :scope > table` 收集行、表格整块一个 line）
 * - CSS 变量读 config.headings（单元6 双轨合并后单一真值：预览与导出同源）
 */
export function Preview({ ast, aiProofreadResults }: PreviewProps) {
  const measurerRef = useRef<HTMLDivElement>(null)
  const { config } = useDocumentConfig()
  const pages = usePagination(ast.title, ast.body, measurerRef)

  /** 排版决策：AST + 配置 → 预览渲染决策（块序列 + 版头/版记/页码参数） */
  const layout = useMemo(function () {
    return buildLayout(ast, config, { renderer: 'preview' })
  }, [ast, config])

  /** 将 config 转换为 CSS 自定义属性 */
  const cssVars = useMemo((): CSSProperties => {
    // 计算字符间距，使每行恰好容纳 28 字 (GB/T 9704)
    // 预览以 72dpi 渲染，1pt = 1px，页面宽度 595px
    const pageWidthPx = 595
    const marginLeftPct = config.margins.left * 10 / 210
    const marginRightPct = config.margins.right * 10 / 210
    const availablePx = pageWidthPx * (1 - marginLeftPct - marginRightPct)
    const charSpacingPx = availablePx / CHARS_PER_LINE - config.body.fontSize
    // 首行缩进像素值 = 字符数 × (字号 + 字符间距)，确保缩进与实际字符宽度一致
    const bodyIndentPx = config.body.firstLineIndent * (config.body.fontSize + charSpacingPx)

    return {
      '--margin-top': `${cmToPagePercent(config.margins.top, 'x')}%`,
      '--margin-bottom': `${cmToPagePercent(config.margins.bottom, 'x')}%`,
      '--margin-left': `${cmToPagePercent(config.margins.left, 'x')}%`,
      '--margin-right': `${cmToPagePercent(config.margins.right, 'x')}%`,
      // 版记绝对定位使用 y 轴百分比（相对页面高度 297mm，而非宽度 210mm）
      '--margin-bottom-y': `${cmToPagePercent(config.margins.bottom, 'y')}%`,
      '--title-font': config.title.fontFamily,
      '--title-size': `${config.title.fontSize}px`,
      '--title-line-height': `${config.title.lineSpacing}px`,
      '--body-font': config.body.fontFamily,
      '--body-size': `${config.body.fontSize}px`,
      '--body-line-height': `${config.body.lineSpacing}px`,
      '--body-indent': `${config.body.firstLineIndent}em`,
      // 首行缩进像素值，包含字符间距，用于精确缩进
      '--body-indent-px': `${bodyIndentPx.toFixed(4)}px`,
      '--char-spacing': `${charSpacingPx.toFixed(4)}px`,
      '--h1-font': config.headings.h1.fontFamily,
      '--h1-size': `${config.headings.h1.fontSize}px`,
      '--h2-font': config.headings.h2.fontFamily,
      '--h2-size': `${config.headings.h2.fontSize}px`,
      '--h3-font': config.headings.h3.fontFamily,
      // 三级标题字号接线（0025 对齐：此前预览漏接，改字号导出变预览不变）
      '--h3-size': `${config.headings.h3.fontSize}px`,
      // 主送机关字体/字号接线（0026 对齐：仅中文字体槽——英数字体槽全族未接线为待办-0039）
      '--addressee-font': config.headings.addressee.fontFamily,
      '--addressee-size': `${config.headings.addressee.fontSize}px`,
      '--page-number-font': config.specialOptions.pageNumberFont,
      // 表格配置
      '--table-font': config.table.fontFamily,
      '--table-size': `${config.table.fontSize}px`,
      '--table-line-height': `${config.table.lineSpacing}px`,
      '--table-bold-header': config.table.boldHeader ? 'bold' : 'normal',
    } as CSSProperties
  }, [config])

  return (
    <div className="preview-container">
      <div className="preview-scroll" style={cssVars}>
        {/* 隐藏度量容器：渲染与 A4Page 同源的决策层块序列用于高度测量
            （不注入 AI 高亮上下文——测量无需高亮，纯文本渲染；
            表格与页面同构真表格，task-0005 修复测量失真） */}
        <div ref={measurerRef} className="a4-measurer" aria-hidden="true">
          <div className="a4-measurer-content">
            {renderContentFlow(layout.blocks, layout.metrics)}
          </div>
          {/* 隐藏版记：用于度量版记高度，始终渲染以便在分页计算时获取高度 */}
          {layout.footerNote && <A4FooterNote note={layout.footerNote} measurer />}
        </div>

        {/* 渲染分页后的多个 A4 页面（每页渲染完整内容流，通过 offsetY 裁剪） */}
        {pages.map((slice, index) => (
          <A4Page
            key={index}
            layout={layout}
            pageNumber={index + 1}
            offsetY={slice.offsetY}
            clipHeight={slice.clipHeight}
            isFirstPage={index === 0}
            isLastPage={index === pages.length - 1}
            aiProofreadResults={aiProofreadResults}
          />
        ))}
      </div>
    </div>
  )
}
