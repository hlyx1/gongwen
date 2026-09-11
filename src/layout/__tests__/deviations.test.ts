import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG } from '../../types/documentConfig'
import type { DocumentConfig } from '../../types/documentConfig'
import { NodeType } from '../../types/ast'
import type { GongwenAST, DocumentNode } from '../../types/ast'
import {
  DEVIATION_SWITCHES_DEFAULT,
  resolveDeviationSwitches,
} from '../deviations'
import { buildLayout } from '../index'

/**
 * 四项偏差开关断言（工作单元-3 交付物；裁定 §一/§七）
 *
 * 默认值＝两渲染器现状（详细需求条款9 冻结——不得顺手修正）：
 * - 0001 三级标题序号句点字体：预览=follow-heading3 / 导出=body-font
 * - 0002 页码纵向位置：预览=css bottom 4.2% / 导出=footer spacing.before 397
 * - 0003 红色分隔线：预览=css 2px+8px / 导出=border size 15 + before 80
 * - 0004 三级标题全角句点：两侧均=no-split
 * 现状值来源见 deviations.ts 文件头注释（A4Page.css / docxBuilder.ts 行号）。
 */

/** 构造普通 AST 节点 */
function makeNode(type: NodeType, content: string, lineNumber = 1): DocumentNode {
  return { type, content, lineNumber }
}

/** 深拷贝默认配置后打补丁（测试专用，避免污染共享对象） */
function configWith(patch: (c: DocumentConfig) => void): DocumentConfig {
  const cloned = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as DocumentConfig
  patch(cloned)
  return cloned
}

// ---- 默认值＝两渲染器现状 ----

describe('偏差开关默认值＝两渲染器现状', () => {
  it('0001 heading3DotFont：预览 follow-heading3 / 导出 body-font', () => {
    expect(DEVIATION_SWITCHES_DEFAULT.heading3DotFont.preview).toBe('follow-heading3')
    expect(DEVIATION_SWITCHES_DEFAULT.heading3DotFont.docx).toBe('body-font')
  })

  it('0002 pageNumberVertical：预览 css-bottom-percent 4.2 / 导出 footer-spacing-before 397', () => {
    expect(DEVIATION_SWITCHES_DEFAULT.pageNumberVertical.preview).toEqual({
      mechanism: 'css-bottom-percent',
      bottomPercent: 4.2,
    })
    expect(DEVIATION_SWITCHES_DEFAULT.pageNumberVertical.docx).toEqual({
      mechanism: 'footer-spacing-before',
      beforeTwips: 397,
    })
  })

  it('0003 redSeparator：预览 css 2px/8px / 导出 paragraph-border 15/80', () => {
    expect(DEVIATION_SWITCHES_DEFAULT.redSeparator.preview).toEqual({
      mechanism: 'css',
      thicknessPx: 2,
      marginTopPx: 8,
      color: 'E00000',
    })
    expect(DEVIATION_SWITCHES_DEFAULT.redSeparator.docx).toEqual({
      mechanism: 'paragraph-border',
      sizeEighthPt: 15,
      beforeTwips: 80,
      color: 'E00000',
    })
  })

  it('0004 heading3FullwidthDot：两侧均 no-split', () => {
    expect(DEVIATION_SWITCHES_DEFAULT.heading3FullwidthDot.preview).toBe('no-split')
    expect(DEVIATION_SWITCHES_DEFAULT.heading3FullwidthDot.docx).toBe('no-split')
  })

  it('0022 timeColonSplit：预览 no-split / 导出 split（单元5 接线补设，裁定 §八）', () => {
    expect(DEVIATION_SWITCHES_DEFAULT.timeColonSplit.preview).toBe('no-split')
    expect(DEVIATION_SWITCHES_DEFAULT.timeColonSplit.docx).toBe('split')
  })

  it('0023 pageNumberFont：预览 CSS 栈（TNR 优先）/ 导出四槽宋体', () => {
    expect(DEVIATION_SWITCHES_DEFAULT.pageNumberFont.preview).toEqual({
      mechanism: 'css-stack',
      primary: 'Times New Roman',
    })
    expect(DEVIATION_SWITCHES_DEFAULT.pageNumberFont.docx).toEqual({
      mechanism: 'quad',
      eastAsia: '宋体',
    })
  })
})

// ---- 开关解析 ----

describe('resolveDeviationSwitches 开关解析', () => {
  it('无覆盖：返回默认值', () => {
    const switches = resolveDeviationSwitches()
    expect(switches).toEqual({ ...DEVIATION_SWITCHES_DEFAULT })
  })

  it('单项覆盖生效、其余保持现状', () => {
    const switches = resolveDeviationSwitches({
      heading3DotFont: { preview: 'body-font', docx: 'body-font' },
    })
    expect(switches.heading3DotFont.preview).toBe('body-font')
    expect(switches.pageNumberVertical).toEqual(DEVIATION_SWITCHES_DEFAULT.pageNumberVertical)
  })
})

// ---- buildLayout 按开关产出各渲染器的最终决策 ----

describe('buildLayout 按开关产出各渲染器决策（默认＝现状）', () => {
  const ast: GongwenAST = {
    title: [makeNode(NodeType.DOCUMENT_TITLE, '测试公文标题')],
    body: [
      makeNode(NodeType.HEADING_3, '1.三级标题内容。后续句子。', 2),
      makeNode(NodeType.PARAGRAPH, '正文内容。', 3),
    ],
  }

  it('0002：页码纵向位置——预览取 css-bottom-percent 4.2', () => {
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'preview' })
    expect(layout.pageNumber.vertical).toEqual({
      mechanism: 'css-bottom-percent',
      bottomPercent: 4.2,
    })
  })

  it('0002：页码纵向位置——导出取 footer-spacing-before 397', () => {
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    expect(layout.pageNumber.vertical).toEqual({
      mechanism: 'footer-spacing-before',
      beforeTwips: 397,
    })
  })

  it('0003：红色分隔线——按渲染器取各自现状参数', () => {
    const config = configWith((c) => {
      c.header.enabled = true
      c.header.orgName = '某某市人民政府文件'
    })
    const previewLayout = buildLayout(ast, config, { renderer: 'preview' })
    const docxLayout = buildLayout(ast, config, { renderer: 'docx' })
    expect(previewLayout.header && previewLayout.header.separator).toEqual({
      mechanism: 'css',
      thicknessPx: 2,
      marginTopPx: 8,
      color: 'E00000',
    })
    expect(docxLayout.header && docxLayout.header.separator).toEqual({
      mechanism: 'paragraph-border',
      sizeEighthPt: 15,
      beforeTwips: 80,
      color: 'E00000',
    })
  })

  it('0001：三级标题句点——预览决策不拆分（单 run），导出决策拆分（句点为正文字体）', () => {
    const previewLayout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'preview' })
    const docxLayout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })

    const previewH3 = previewLayout.blocks.find(
      (b) => b.kind === 'paragraph' && b.sourceType === NodeType.HEADING_3
    )
    const docxH3 = docxLayout.blocks.find(
      (b) => b.kind === 'paragraph' && b.sourceType === NodeType.HEADING_3
    )
    if (previewH3 && docxH3 && previewH3.kind === 'paragraph' && docxH3.kind === 'paragraph') {
      expect(previewH3.runs.map((r) => r.text)).toEqual([
        '1.三级标题内容。',
        '后续句子。',
      ])
      expect(docxH3.runs.map((r) => r.text)).toEqual([
        '1',
        '.',
        '三级标题内容。',
        '后续句子。',
      ])
      expect(docxH3.runs[1].role).toBe('bodyPunct')
      expect(docxH3.runs[1].font.ascii).toBe('仿宋_GB2312')
    } else {
      throw new Error('未找到三级标题块')
    }
  })

  it('0004：全角句点三级标题——导出决策不拆分（正则只认半角，现状）', () => {
    const fullwidthAst: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.HEADING_3, '1．全角句点标题', 1)],
    }
    const docxLayout = buildLayout(fullwidthAst, DEFAULT_CONFIG, { renderer: 'docx' })
    const block = docxLayout.blocks[0]
    if (block.kind === 'paragraph') {
      expect(block.runs.map((r) => r.text)).toEqual(['1．全角句点标题'])
      expect(block.runs[0].role).toBe('heading3')
    } else {
      throw new Error('首块应为段落')
    }
  })

  it('0022：时间冒号分段——预览决策不拆分（单 run），导出决策拆分（冒号为正文字体）', () => {
    const timeAst: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.PARAGRAPH, '会议时间为9:00至11:30。', 1)],
    }
    const previewLayout = buildLayout(timeAst, DEFAULT_CONFIG, { renderer: 'preview' })
    const docxLayout = buildLayout(timeAst, DEFAULT_CONFIG, { renderer: 'docx' })

    const previewBlock = previewLayout.blocks[0]
    const docxBlock = docxLayout.blocks[0]
    if (previewBlock.kind === 'paragraph' && docxBlock.kind === 'paragraph') {
      expect(previewBlock.runs.map((r) => r.text)).toEqual(['会议时间为9:00至11:30。'])
      expect(docxBlock.runs.map((r) => r.text)).toEqual([
        '会议时间为',
        '9',
        ':',
        '00',
        '至',
        '11',
        ':',
        '30',
        '。',
      ])
      expect(docxBlock.runs[2].role).toBe('bodyPunct')
      expect(docxBlock.runs[2].font.ascii).toBe('仿宋_GB2312')
    } else {
      throw new Error('首块应为段落')
    }
  })

  it('开关翻转生效：0022 预览翻为 split 后时间冒号拆分（偏差修复演示）', () => {
    const timeAst: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.PARAGRAPH, '会议时间为9:00至11:30。', 1)],
    }
    const layout = buildLayout(timeAst, DEFAULT_CONFIG, {
      renderer: 'preview',
      deviations: {
        timeColonSplit: { preview: 'split', docx: 'split' },
      },
    })
    const block = layout.blocks[0]
    if (block.kind === 'paragraph') {
      expect(block.runs.map((r) => r.text)).toEqual([
        '会议时间为',
        '9',
        ':',
        '00',
        '至',
        '11',
        ':',
        '30',
        '。',
      ])
    } else {
      throw new Error('首块应为段落')
    }
  })

  it('开关翻转生效：0001 预览翻为 body-font 后句点拆分（偏差修复演示）', () => {
    const layout = buildLayout(ast, DEFAULT_CONFIG, {
      renderer: 'preview',
      deviations: {
        heading3DotFont: { preview: 'body-font', docx: 'body-font' },
      },
    })
    const h3 = layout.blocks.find(
      (b) => b.kind === 'paragraph' && b.sourceType === NodeType.HEADING_3
    )
    if (h3 && h3.kind === 'paragraph') {
      expect(h3.runs.map((r) => r.text)).toEqual(['1', '.', '三级标题内容。', '后续句子。'])
      expect(h3.runs[1].role).toBe('bodyPunct')
    } else {
      throw new Error('未找到三级标题块')
    }
  })

  it('开关翻转生效：0004 导出翻为 split 后全角句点拆分（偏差修复演示）', () => {
    const fullwidthAst: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.HEADING_3, '1．全角句点标题', 1)],
    }
    const layout = buildLayout(fullwidthAst, DEFAULT_CONFIG, {
      renderer: 'docx',
      deviations: {
        heading3DotFont: { preview: 'body-font', docx: 'body-font' },
        heading3FullwidthDot: { preview: 'no-split', docx: 'split' },
      },
    })
    const block = layout.blocks[0]
    if (block.kind === 'paragraph') {
      expect(block.runs.map((r) => r.text)).toEqual(['1', '．', '全角句点标题'])
      expect(block.runs[1].role).toBe('bodyPunct')
    } else {
      throw new Error('首块应为段落')
    }
  })
})
