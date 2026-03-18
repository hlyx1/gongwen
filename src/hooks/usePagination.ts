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
 * 偏移实现段落内自然跨页断行。
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
  // 用于防止 React StrictMode 双重调用导致的重复日志
  const lastLogTimeRef = useRef<number>(0)

  useLayoutEffect(() => {
    const measurer = measurerRef.current
    if (!measurer) return

    function calculate() {
      const el = measurerRef.current
      if (!el) {
        setPages([{ offsetY: 0, clipHeight: 0 }])
        return
      }

      // 防止 React StrictMode 双重调用导致的重复日志
      // 如果距离上次调用不到 100ms，跳过本次计算（StrictMode 双重调用几乎同时发生）
      const now = Date.now()
      if (now - lastLogTimeRef.current < 100) {
        return
      }
      lastLogTimeRef.current = now

      const scrollContainer = el.parentElement
      if (!scrollContainer) {
        setPages([{ offsetY: 0, clipHeight: 0 }])
        return
      }

      console.log('========== 分页调试日志开始 ==========')
      console.log('浏览器信息:', navigator.userAgent)

      // 获取当前页面 zoom 值（CSS zoom 属性会影响 getBoundingClientRect 返回值）
      // getBoundingClientRect 返回缩放后的值，需要除以 zoom 得到未缩放的实际值
      // 兼容性处理：旧版浏览器可能返回 undefined、"normal" 或其他非数字值
      let zoom = 1
      let zoomRawValue: string | undefined
      try {
        zoomRawValue = getComputedStyle(document.documentElement).zoom
        console.log('[zoom] getComputedStyle 返回原始值:', zoomRawValue, '类型:', typeof zoomRawValue)
        const parsedZoom = parseFloat(zoomRawValue)
        console.log('[zoom] parseFloat 结果:', parsedZoom, 'isFinite:', isFinite(parsedZoom))
        if (isFinite(parsedZoom) && parsedZoom > 0) {
          zoom = parsedZoom
        }
      } catch (e) {
        // 旧版浏览器可能不支持 zoom 属性，保持默认值 1
        console.log('[zoom] 获取失败:', e)
        zoom = 1
      }
      console.log('[zoom] 最终使用的 zoom 值:', zoom)

      // ① 同步度量容器宽度：使用 getBoundingClientRect 获取精确浮点宽度，
      //    避免 offsetWidth 整数取整导致度量容器与 A4 页面文本换行不一致。
      //    注意：需要除以 zoom 得到未缩放的实际宽度。
      const a4Page = scrollContainer.querySelector('.a4-page') as HTMLElement | null
      console.log('[宽度] a4Page 是否存在:', !!a4Page)
      
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
        console.log('[兼容性检测] getBoundingClientRect 是否已应用 zoom:', rectAlreadyZoomed, {
          'rect.width': a4PageRect.width,
          'offsetWidth': offsetW,
          'ratio': ratio,
          'zoom': zoom,
          'Math.abs(ratio - zoom)': Math.abs(ratio - zoom)
        })
      }

      if (a4Page) {
        const a4PageRect = a4Page.getBoundingClientRect()
        console.log('[宽度] a4Page.getBoundingClientRect():', {
          width: a4PageRect.width,
          height: a4PageRect.height,
          top: a4PageRect.top,
          left: a4PageRect.left
        })
        console.log('[宽度] a4Page.offsetWidth:', a4Page.offsetWidth)
        console.log('[宽度] a4Page.clientHeight:', a4Page.clientHeight)
        // 如果 rect 已经应用了 zoom，需要除以 zoom 得到未缩放值
        // 如果 rect 没有应用 zoom，直接使用原始值
        const calculatedWidth = rectAlreadyZoomed ? a4PageRect.width / zoom : a4PageRect.width
        console.log('[宽度] 计算得到的度量容器宽度:', calculatedWidth, '(rectAlreadyZoomed:', rectAlreadyZoomed, ')')
        el.style.width = `${calculatedWidth}px`
      } else {
        const cs = getComputedStyle(scrollContainer)
        const contentWidth = scrollContainer.clientWidth
          - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        console.log('[宽度] 无 a4Page，使用 scrollContainer 计算:', {
          clientWidth: scrollContainer.clientWidth,
          paddingLeft: cs.paddingLeft,
          paddingRight: cs.paddingRight,
          contentWidth: contentWidth
        })
        el.style.width = `${Math.min(contentWidth, 595)}px`
      }
      console.log('[宽度] 最终设置的度量容器宽度:', el.style.width)

      // ② 读取 .a4-content 内容区全量高度（= 页面高度 - 上下 padding）
      //    这是不含版头/版记时的最大可用空间。
      //    注意：getBoundingClientRect 受 zoom 影响，需要除以 zoom 得到未缩放值。
      let fullAvailable: number
      const a4Content = a4Page && a4Page.querySelector('.a4-content') as HTMLElement | null
      console.log('[高度] a4Content 是否存在:', !!a4Content)
      if (a4Content) {
        const rect = a4Content.getBoundingClientRect()
        const contentCs = getComputedStyle(a4Content)
        console.log('[高度] a4Content.getBoundingClientRect():', {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left
        })
        console.log('[高度] a4Content CSS:', {
          height: contentCs.height,
          paddingTop: contentCs.paddingTop,
          paddingBottom: contentCs.paddingBottom,
          lineHeight: contentCs.lineHeight
        })
        // 如果 rect 已经应用了 zoom，需要除以 zoom 得到未缩放值
        // 如果 rect 没有应用 zoom，直接使用原始值
        const rawHeight = rectAlreadyZoomed ? rect.height / zoom : rect.height
        const paddingTop = parseFloat(contentCs.paddingTop)
        const paddingBottom = parseFloat(contentCs.paddingBottom)
        fullAvailable = rawHeight - paddingTop - paddingBottom
        console.log('[高度] 计算过程:', {
          'rect.height': rect.height,
          'rectAlreadyZoomed': rectAlreadyZoomed,
          'rawHeight': rawHeight,
          paddingTop: paddingTop,
          paddingBottom: paddingBottom,
          fullAvailable: fullAvailable
        })
      } else {
        // 首次渲染无 A4 页面时回退到 JS 公式
        const rectWidth = el.getBoundingClientRect().width
        // 同样需要考虑 rectAlreadyZoomed
        const pageWidth = rectAlreadyZoomed ? rectWidth / zoom : rectWidth
        const pageHeight = pageWidth * (297 / 210)
        const topPad = pageWidth * (config.margins.top * 10 / 210)
        const bottomPad = pageWidth * (config.margins.bottom * 10 / 210)
        fullAvailable = pageHeight - topPad - bottomPad
        console.log('[高度] 无 a4Content，使用 JS 公式计算:', {
          pageWidth: pageWidth,
          pageHeight: pageHeight,
          topPad: topPad,
          bottomPad: bottomPad,
          fullAvailable: fullAvailable
        })
      }
      console.log('[高度] 最终 fullAvailable:', fullAvailable)

      // ③ 度量版头高度（首页渲染，含外边距；flex column 中 margin 不折叠）
      //    注意：offsetHeight 不受 CSS zoom 影响，始终返回未缩放的值
      let headerHeight = 0
      const headerSection = scrollContainer.querySelector('.a4-header-section') as HTMLElement | null
      console.log('[版头] headerSection 是否存在:', !!headerSection)
      if (headerSection) {
        const hs = getComputedStyle(headerSection)
        const offsetH = headerSection.offsetHeight
        const marginTop = parseFloat(hs.marginTop)
        const marginBottom = parseFloat(hs.marginBottom)
        console.log('[版头] headerSection 尺寸:', {
          offsetHeight: offsetH,
          marginTop: marginTop,
          marginBottom: marginBottom
        })
        // offsetHeight 不受 zoom 影响，直接使用
        headerHeight = offsetH + marginTop + marginBottom
        console.log('[版头] 计算得到的 headerHeight:', headerHeight)
      }

      // ④ 度量版记高度（末页绝对定位于 .a4-page 底部，需预留空间防重叠）
      //    注意：offsetHeight 不受 CSS zoom 影响，始终返回未缩放的值
      //    版记在度量容器中渲染，优先从度量容器获取。
      let footerNoteHeight = 0
      const footerNote = el.querySelector('.a4-footer-note') as HTMLElement | null
      console.log('[版记] footerNote 是否存在:', !!footerNote)
      if (footerNote) {
        const offsetH = footerNote.offsetHeight
        console.log('[版记] footerNote.offsetHeight:', offsetH)
        // offsetHeight 不受 zoom 影响，直接使用
        footerNoteHeight = offsetH
      }

      // 首页可用高度 = 全量 - 版头占位
      const firstPageAvailable = fullAvailable - headerHeight
      console.log('[首页可用高度] fullAvailable - headerHeight =', fullAvailable, '-', headerHeight, '=', firstPageAvailable)

      // ⑤ 获取度量容器内所有段落
      const contentEl = el.querySelector('.a4-measurer-content')
      if (!contentEl) {
        console.log('[段落] contentEl 不存在，返回默认分页')
        setPages([{ offsetY: 0, clipHeight: firstPageAvailable }])
        return
      }

      const paragraphs = contentEl.querySelectorAll<HTMLParagraphElement>(':scope > p')
      console.log('[段落] 段落数量:', paragraphs.length)
      if (paragraphs.length === 0) {
        console.log('[段落] 无段落，返回默认分页')
        setPages([{ offsetY: 0, clipHeight: firstPageAvailable }])
        return
      }

      // ⑥ 收集所有行的 top/bottom 位置
      interface LinePos { top: number; bottom: number }
      const lines: LinePos[] = []

      console.log('[行高] 开始收集所有行的位置信息...')
      for (const p of paragraphs) {
        const pTop = p.offsetTop
        const pHeight = p.offsetHeight
        const computedStyle = getComputedStyle(p)
        const lineHeight = parseFloat(computedStyle.lineHeight)

        console.log('[行高] 段落:', {
          offsetTop: pTop,
          offsetHeight: pHeight,
          lineHeight: lineHeight,
          'lineHeight 是否有效': !isNaN(lineHeight) && lineHeight > 0,
          '是否单行': pHeight <= lineHeight * 1.5
        })

        if (isNaN(lineHeight) || lineHeight <= 0 || pHeight <= lineHeight * 1.5) {
          // 单行段落（标题等）：整段作为一行
          lines.push({ top: pTop, bottom: pTop + pHeight })
        } else {
          const lineCount = Math.max(1, Math.round(pHeight / lineHeight))
          console.log('[行高] 多行段落，行数:', lineCount)
          // 使用 CSS line-height 定位行边界（而非 pHeight/lineCount），
          // 避免混合字体 inline span 导致段落高度偏离 line-height 整数倍时
          // 断点位置与实际渲染不一致（半行字问题）。
          // 最后一行 bottom 取段落实际底部，衔接下一段。
          for (let i = 0; i < lineCount; i++) {
            lines.push({
              top: pTop + i * lineHeight,
              bottom: i < lineCount - 1 ? pTop + (i + 1) * lineHeight : pTop + pHeight,
            })
          }
        }
      }

      const totalContentHeight = lines.length > 0 ? lines[lines.length - 1].bottom : 0
      console.log('[行高] 总行数:', lines.length, '总内容高度:', totalContentHeight)
      console.log('[行高] 前几行位置:', lines.slice(0, 5))
      console.log('[行高] 后几行位置:', lines.slice(-3))

      // ⑦ Phase 1: 按行边界分页
      //    首页使用 firstPageAvailable（扣除版头），后续页使用 fullAvailable。
      const breakOffsets: number[] = [0]
      let pageStart = 0
      let currentAvailable = firstPageAvailable

      console.log('[分页] 开始 Phase 1 分页计算')
      console.log('[分页] firstPageAvailable:', firstPageAvailable, 'fullAvailable:', fullAvailable)
      
      let lineIndex = 0
      for (const line of lines) {
        // 当前行底部超出当前页可用高度 → 推入下一页
        // line.top - pageStart > 0.5 防止页首行触发分页（死循环保护）
        // + 1 容差：避免因浮点精度或段落实际高度微差导致过早分页
        const shouldBreak = line.bottom - pageStart > currentAvailable + 1 && line.top - pageStart > 0.5
        if (shouldBreak) {
          console.log(`[分页] 行 ${lineIndex} 触发分页:`, {
            'line.top': line.top,
            'line.bottom': line.bottom,
            'pageStart': pageStart,
            'currentAvailable': currentAvailable,
            'line.bottom - pageStart': line.bottom - pageStart,
            '是否超出': line.bottom - pageStart > currentAvailable + 1
          })
          pageStart = line.top
          breakOffsets.push(pageStart)
          currentAvailable = fullAvailable // 后续页恢复全量高度
          console.log('[分页] 新页面开始，pageStart:', pageStart, 'currentAvailable 切换为:', currentAvailable)
        }
        lineIndex++
      }

      console.log('[分页] Phase 1 结束，断点数量:', breakOffsets.length, '断点位置:', breakOffsets)

      // ⑧ Phase 2: 确保末页有足够空间容纳版记
      //    版记在末页渲染，其高度会挤压 viewport 的可用空间。
      //    如果末页内容 + 版记 > 全量高度，需要将溢出行推到新页。
      console.log('[版记处理] footerNoteHeight:', footerNoteHeight)
      if (footerNoteHeight > 0) {
        console.log('[版记处理] 开始 Phase 2 版记空间检查')
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

          console.log(`[版记处理] 迭代检查:`, {
            lastIdx: lastIdx,
            lastStart: lastStart,
            isAlsoFirstPage: isAlsoFirstPage,
            lastPageBase: lastPageBase,
            lastPageAvailable: lastPageAvailable,
            lastPageContent: lastPageContent,
            '是否溢出': lastPageContent > lastPageAvailable + 0.5
          })

          if (lastPageContent > lastPageAvailable + 0.5) {
            // 在末页中找到溢出行并创建新断点
            for (const line of lines) {
              if (line.top < lastStart + 0.5) continue
              if (line.bottom - lastStart > lastPageAvailable && line.top - lastStart > 0.5) {
                console.log('[版记处理] 创建新断点:', line.top)
                breakOffsets.push(line.top)
                stable = false
                break
              }
            }
          }
        }
        console.log('[版记处理] Phase 2 结束，最终断点数量:', breakOffsets.length)
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

      console.log('[最终结果] 分页数量:', result.length)
      result.forEach((page, i) => {
        console.log(`[最终结果] 第 ${i + 1} 页:`, {
          offsetY: page.offsetY,
          clipHeight: page.clipHeight,
          '预计行数': Math.round(page.clipHeight / 29) // 假设行高29px
        })
      })
      console.log('========== 分页调试日志结束 ==========')

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
