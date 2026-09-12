import { useLayoutEffect, useState, useRef, type RefObject } from 'react'
import type { DocumentNode } from '../types/ast'
import { useDocumentConfig } from '../contexts/DocumentConfigContext'

/** 单页裁剪信息 */
export interface PageSlice {
  /** 内容在完整流中的起始偏移(px) */
  offsetY: number
  /** 该页应显示的内容高度(px)，精确到行边界 */
  clipHeight: number
}

/**
 * DOM 度量分页 hook（视窗裁剪方案）
 *
 * 在隐藏的度量容器中渲染全部节点，通过 offsetTop / offsetHeight / lineHeight
 * 逐行计算分页断点。每页只需一个 offsetY 值，配合 CSS overflow:hidden + transform
 * 偏移实现段落内自然跨页断行。表格（task-0005）按元素整块参与——断点不落进
 * 表格内部（详见行收集处的表格分支）。
 *
 * 关键：首页扣除版头（.a4-header-section）高度，末页扣除版记（.a4-footer-note）高度，
 * 避免 clipHeight 超出父容器实际可用空间导致 overflow:hidden 截断内容。
 *
 * 同时监听 ResizeObserver，窗口缩放时自动重新分页。
 */
export function usePagination(
  title: DocumentNode[],
  body: DocumentNode[],
  measurerRef: RefObject<HTMLDivElement | null>
): PageSlice[] {
  const { config } = useDocumentConfig()
  const [pages, setPages] = useState<PageSlice[]>(() => [{ offsetY: 0, clipHeight: 0 }])
  // 计算去重时间戳：React StrictMode 双重调用 / 连续 resize 短时间重复触发时
  // 跳过重复计算（计算幂等，去重只为省一次全量度量）
  const lastCalcTimeRef = useRef<number>(0)

  useLayoutEffect(() => {
    const measurer = measurerRef.current
    if (!measurer) return

    function calculate() {
      const el = measurerRef.current
      if (!el) {
        setPages([{ offsetY: 0, clipHeight: 0 }])
        return
      }

      // 如果距离上次计算不到 100ms，跳过本次计算
      // （StrictMode 双重调用几乎同时发生；连续触发的重复计算结果幂等）
      const now = Date.now()
      if (now - lastCalcTimeRef.current < 100) {
        return
      }
      lastCalcTimeRef.current = now

      const scrollContainer = el.parentElement
      if (!scrollContainer) {
        setPages([{ offsetY: 0, clipHeight: 0 }])
        return
      }

      // 获取当前页面 zoom 值（CSS zoom 属性会影响 getBoundingClientRect 返回值）
      // getBoundingClientRect 返回缩放后的值，需要除以 zoom 得到未缩放的实际值
      // 兼容性处理：旧版浏览器可能返回 undefined、"normal" 或其他非数字值
      let zoom = 1
      try {
        const parsedZoom = parseFloat(getComputedStyle(document.documentElement).zoom)
        if (isFinite(parsedZoom) && parsedZoom > 0) {
          zoom = parsedZoom
        }
      } catch {
        // 旧版浏览器可能不支持 zoom 属性，保持默认值 1
        zoom = 1
      }

      // ① 同步度量容器宽度：使用 getBoundingClientRect 获取精确浮点宽度，
      //    避免 offsetWidth 整数取整导致度量容器与 A4 页面文本换行不一致。
      //    注意：需要除以 zoom 得到未缩放的实际宽度。
      const a4Page = scrollContainer.querySelector('.a4-page') as HTMLElement | null

      // 检测 getBoundingClientRect 是否已经应用了 zoom 缩放
      // 旧版浏览器（如 Chrome 86）的 getBoundingClientRect 不受 zoom 影响，返回未缩放的值
      // 新版浏览器的 getBoundingClientRect 受 zoom 影响，返回缩放后的值
      // 通过比较 getBoundingClientRect().width 和 offsetWidth 来判断
      let rectAlreadyZoomed = false
      if (a4Page && zoom !== 1) {
        const a4PageRect = a4Page.getBoundingClientRect()
        const offsetW = a4Page.offsetWidth
        // 如果 rect.width ≈ offsetWidth * zoom，说明 rect 已经应用了 zoom
        // 如果 rect.width ≈ offsetWidth，说明 rect 没有应用 zoom
        const ratio = a4PageRect.width / offsetW
        rectAlreadyZoomed = Math.abs(ratio - zoom) < 0.01
      }

      if (a4Page) {
        const a4PageRect = a4Page.getBoundingClientRect()
        // 如果 rect 已经应用了 zoom，需要除以 zoom 得到未缩放值
        // 如果 rect 没有应用 zoom，直接使用原始值
        const calculatedWidth = rectAlreadyZoomed ? a4PageRect.width / zoom : a4PageRect.width
        el.style.width = `${calculatedWidth}px`
      } else {
        const cs = getComputedStyle(scrollContainer)
        const contentWidth = scrollContainer.clientWidth
          - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        el.style.width = `${Math.min(contentWidth, 595)}px`
      }

      // ② 读取 .a4-content 内容区全量高度（= 页面高度 - 上下 padding）
      //    这是不含版头/版记时的最大可用空间。
      //    注意：getBoundingClientRect 受 zoom 影响，需要除以 zoom 得到未缩放值。
      let fullAvailable: number
      const a4Content = a4Page && a4Page.querySelector('.a4-content') as HTMLElement | null
      if (a4Content) {
        const rect = a4Content.getBoundingClientRect()
        const contentCs = getComputedStyle(a4Content)
        // 如果 rect 已经应用了 zoom，需要除以 zoom 得到未缩放值
        // 如果 rect 没有应用 zoom，直接使用原始值
        const rawHeight = rectAlreadyZoomed ? rect.height / zoom : rect.height
        const paddingTop = parseFloat(contentCs.paddingTop)
        const paddingBottom = parseFloat(contentCs.paddingBottom)
        fullAvailable = rawHeight - paddingTop - paddingBottom
      } else {
        // 首次渲染无 A4 页面时回退到 JS 公式
        const rectWidth = el.getBoundingClientRect().width
        // 同样需要考虑 rectAlreadyZoomed
        const pageWidth = rectAlreadyZoomed ? rectWidth / zoom : rectWidth
        const pageHeight = pageWidth * (297 / 210)
        const topPad = pageWidth * (config.margins.top * 10 / 210)
        const bottomPad = pageWidth * (config.margins.bottom * 10 / 210)
        fullAvailable = pageHeight - topPad - bottomPad
      }

      // ③ 度量版头高度（首页渲染，含外边距；flex column 中 margin 不折叠）
      //    注意：offsetHeight 不受 CSS zoom 影响，始终返回未缩放的值
      let headerHeight = 0
      const headerSection = scrollContainer.querySelector('.a4-header-section') as HTMLElement | null
      if (headerSection) {
        const hs = getComputedStyle(headerSection)
        const offsetH = headerSection.offsetHeight
        const marginTop = parseFloat(hs.marginTop)
        const marginBottom = parseFloat(hs.marginBottom)
        // offsetHeight 不受 zoom 影响，直接使用
        headerHeight = offsetH + marginTop + marginBottom
      }

      // ④ 度量版记高度（末页绝对定位于 .a4-page 底部，需预留空间防重叠）
      //    注意：offsetHeight 不受 CSS zoom 影响，始终返回未缩放的值
      //    版记在度量容器中渲染，优先从度量容器获取。
      let footerNoteHeight = 0
      const footerNote = el.querySelector('.a4-footer-note') as HTMLElement | null
      if (footerNote) {
        // offsetHeight 不受 zoom 影响，直接使用
        footerNoteHeight = footerNote.offsetHeight
      }

      // 首页可用高度 = 全量 - 版头占位
      const firstPageAvailable = fullAvailable - headerHeight

      // ⑤ 获取度量容器内所有内容流元素（段落＋表格——task-0005：度量容器
      //    渲染真实 <table> 结构，表格按元素口径整块参与测量）
      const contentEl = el.querySelector('.a4-measurer-content')
      if (!contentEl) {
        setPages([{ offsetY: 0, clipHeight: firstPageAvailable }])
        return
      }

      const flowElements = contentEl.querySelectorAll<HTMLElement>(':scope > p, :scope > table')
      if (flowElements.length === 0) {
        setPages([{ offsetY: 0, clipHeight: firstPageAvailable }])
        return
      }

      // ⑥ 收集所有行的 top/bottom 位置
      interface LinePos { top: number; bottom: number }
      const lines: LinePos[] = []

      for (const element of flowElements) {
        const elementTop = element.offsetTop
        const elementHeight = element.offsetHeight

        if (element.tagName === 'TABLE') {
          // 表格整块作为一个 line（不可分割，task-0005 裁定1 方案 A-简）：
          // 分页断点只能落在表格边界外；巨型表格（高于一页可用高）推到
          // 新页起后仍超高，由视窗 overflow:hidden 截断底部（与单行段落
          // 超高行为一致——明确不做项，跨页重排须另立任务）
          lines.push({ top: elementTop, bottom: elementTop + elementHeight })
          continue
        }

        const computedStyle = getComputedStyle(element)
        const lineHeight = parseFloat(computedStyle.lineHeight)

        if (isNaN(lineHeight) || lineHeight <= 0 || elementHeight <= lineHeight * 1.5) {
          // 单行段落（标题等）：整段作为一行
          lines.push({ top: elementTop, bottom: elementTop + elementHeight })
        } else {
          const lineCount = Math.max(1, Math.round(elementHeight / lineHeight))
          // 使用 CSS line-height 定位行边界（而非 elementHeight/lineCount），
          // 避免混合字体 inline span 导致段落高度偏离 line-height 整数倍时
          // 断点位置与实际渲染不一致（半行字问题）。
          // 最后一行 bottom 取段落实际底部，衔接下一段。
          for (let i = 0; i < lineCount; i++) {
            lines.push({
              top: elementTop + i * lineHeight,
              bottom: i < lineCount - 1 ? elementTop + (i + 1) * lineHeight : elementTop + elementHeight,
            })
          }
        }
      }

      const totalContentHeight = lines.length > 0 ? lines[lines.length - 1].bottom : 0

      // ⑦ Phase 1: 按行边界分页
      //    首页使用 firstPageAvailable（扣除版头），后续页使用 fullAvailable。
      const breakOffsets: number[] = [0]
      let pageStart = 0
      let currentAvailable = firstPageAvailable

      for (const line of lines) {
        // 当前行底部超出当前页可用高度 → 推入下一页
        // line.top - pageStart > 0.5 防止页首行触发分页（死循环保护）
        // + 1 容差：避免因浮点精度或段落实际高度微差导致过早分页
        const shouldBreak = line.bottom - pageStart > currentAvailable + 1 && line.top - pageStart > 0.5
        if (shouldBreak) {
          pageStart = line.top
          breakOffsets.push(pageStart)
          currentAvailable = fullAvailable // 后续页恢复全量高度
        }
      }

      // ⑧ Phase 2: 确保末页有足够空间容纳版记
      //    版记在末页渲染，其高度会挤压 viewport 的可用空间。
      //    如果末页内容 + 版记 > 全量高度，需要将溢出行推到新页。
      if (footerNoteHeight > 0) {
        let maxIterations = 10 // 安全上限，防止极端情况死循环
        let stable = false
        while (!stable && maxIterations-- > 0) {
          stable = true
          const lastIdx = breakOffsets.length - 1
          const lastStart = breakOffsets[lastIdx]
          const isAlsoFirstPage = lastIdx === 0
          const lastPageBase = isAlsoFirstPage ? firstPageAvailable : fullAvailable
          const lastPageAvailable = lastPageBase - footerNoteHeight
          const lastPageContent = totalContentHeight - lastStart

          if (lastPageContent > lastPageAvailable + 0.5) {
            // 在末页中找到溢出行并创建新断点
            for (const line of lines) {
              if (line.top < lastStart + 0.5) continue
              if (line.bottom - lastStart > lastPageAvailable && line.top - lastStart > 0.5) {
                breakOffsets.push(line.top)
                stable = false
                break
              }
            }
          }
        }
      }

      // ⑨ 根据断点计算每页 clipHeight
      //    clipHeight = 下一页 offsetY - 当前页 offsetY，天然对齐行边界。
      const result: PageSlice[] = breakOffsets.map((offset, i) => {
        const nextOffset = i < breakOffsets.length - 1 ? breakOffsets[i + 1] : totalContentHeight
        return {
          offsetY: offset,
          clipHeight: nextOffset - offset,
        }
      })

      setPages(result)
    }

    // 监听尺寸变化（窗口缩放时重新分页）
    // ResizeObserver 创建后会立即触发一次回调，无需额外调用 calculate()
    const observer = new ResizeObserver(() => calculate())
    observer.observe(measurer)
    return () => observer.disconnect()
  }, [title, body, measurerRef, config])

  return pages
}
