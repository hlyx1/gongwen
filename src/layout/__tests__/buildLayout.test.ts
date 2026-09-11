import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG } from '../../types/documentConfig'
import type { DocumentConfig } from '../../types/documentConfig'
import { NodeType } from '../../types/ast'
import type {
  GongwenAST,
  DocumentNode,
  AttachmentNode,
  TableNode,
  TableRowData,
} from '../../types/ast'
import { buildLayout } from '../index'

/**
 * buildLayout 决策输出快照（task-0001 条款2 验收法）
 *
 * 覆盖每个 NodeType 的决策输出快照＋版头/版记/页码开关场景。
 * 两渲染器（preview/docx）分别快照：默认偏差开关下，
 * docx 快照须体现导出侧现状、preview 快照须体现预览侧现状
 * （差异点：0001 三级标题句点拆分、0002/0003 版式参数）。
 * 快照变更即决策行为变化，须走新裁定后由技术负责人确认方可更新。
 */

// ---- 测试辅助 ----

/** 构造普通 AST 节点 */
function makeNode(type: NodeType, content: string, lineNumber = 1): DocumentNode {
  return { type, content, lineNumber }
}

/** 构造附件说明节点 */
function makeAttachment(
  items: Array<{ index: number; name: string }>,
  isMultiple: boolean,
  lineNumber = 1
): AttachmentNode {
  return { type: NodeType.ATTACHMENT, content: '附件：', lineNumber, isMultiple, items }
}

/** 构造表格节点 */
function makeTable(headerCells: string[], dataRows: string[][], lineNumber = 1): TableNode {
  const toRow = (cells: string[]): TableRowData => ({ cells: cells.map((content) => ({ content })) })
  return {
    type: NodeType.TABLE,
    content: '',
    lineNumber,
    header: toRow(headerCells),
    rows: dataRows.map(toRow),
    columnCount: headerCells.length,
  }
}

/** 深拷贝默认配置后打补丁（测试专用，避免污染共享对象） */
function configWith(patch: (c: DocumentConfig) => void): DocumentConfig {
  const cloned = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as DocumentConfig
  patch(cloned)
  return cloned
}

/** 最小公文（标题 + 一段正文） */
const MINIMAL_AST: GongwenAST = {
  title: [makeNode(NodeType.DOCUMENT_TITLE, '测试公文标题')],
  body: [makeNode(NodeType.PARAGRAPH, '正文段落内容。')],
}

/** 全节点类型样例公文（与 docxBuilder.test.ts 的 FULL_AST 同构） */
const FULL_AST: GongwenAST = {
  title: [
    makeNode(NodeType.DOCUMENT_TITLE, '某某市人民政府办公室', 1),
    makeNode(NodeType.DOCUMENT_TITLE, '关于印发《公文排版管理办法》的通知', 2),
  ],
  body: [
    makeNode(NodeType.ADDRESSEE, '各县（市、区）人民政府，市政府各部门：', 4),
    makeNode(
      NodeType.PARAGRAPH,
      '为规范公文排版工作，提高公文处理质量，经市政府同意，现将《公文排版管理办法》印发给你们，请认真贯彻执行。',
      5
    ),
    makeNode(NodeType.HEADING_1, '一、总体要求。坚持以体式规范为基准，以要件齐全为底线。', 6),
    makeNode(NodeType.PARAGRAPH, '公文排版应当符合党政机关公文格式国家标准，做到整洁美观、庄重规范。', 7),
    makeNode(NodeType.HEADING_2, '（一）指导思想。', 8),
    makeNode(NodeType.PARAGRAPH, '以提升公文质量为核心，强化格式规范的刚性约束。', 9),
    makeNode(NodeType.HEADING_3, '1.加强组织领导。要压实各方责任。', 10),
    makeNode(NodeType.PARAGRAPH, '各部门主要负责同志是本部门公文质量的第一责任人。', 11),
    makeNode(NodeType.HEADING_4, '（1）制定实施方案。', 12),
    makeNode(NodeType.PARAGRAPH, '会议时间为9:00至11:30，请提前入场。', 13),
    makeTable(['序号', '事项', '责任单位'], [['1', '制定方案', '办公室'], ['2', '组织培训', '人事科']], 14),
    makeAttachment(
      [
        { index: 1, name: '公文排版管理办法' },
        { index: 2, name: '公文格式自查清单' },
        { index: 3, name: '责任分工表' },
      ],
      true,
      15
    ),
    makeNode(NodeType.SIGNATURE, '某某市人民政府办公室', 16),
    makeNode(NodeType.DATE, '二零二六年九月十一日', 17),
    makeNode(NodeType.REMARK, '（联系人：张三，电话0001-1234567）', 18),
  ],
}

/** 提取块序列中指定源类型的段落块 */
function paragraphBlocksOf(layout: ReturnType<typeof buildLayout>, type: NodeType) {
  return layout.blocks.filter(
    (b) => b.kind === 'paragraph' && b.sourceType === type
  ) as Extract<ReturnType<typeof buildLayout>['blocks'][number], { kind: 'paragraph' }>[]
}

// ---- 全节点样例快照（两渲染器） ----

describe('buildLayout 全节点样例快照', () => {
  it('docx 渲染器：体现导出侧现状（默认配置）', () => {
    const layout = buildLayout(FULL_AST, DEFAULT_CONFIG, { renderer: 'docx' })
    expect(layout.metrics).toEqual({ charSpacingTwips: -5, charWidthTwips: 315, firstLineIndentTwips: 630 })
    expect(layout.header).toBeNull()
    expect(layout.footerNote).toBeNull()
    expect(layout.pageNumber.enabled).toBe(true)
    expect(layout).toMatchSnapshot()
  })

  it('preview 渲染器：体现预览侧现状（默认配置）', () => {
    const layout = buildLayout(FULL_AST, DEFAULT_CONFIG, { renderer: 'preview' })
    expect(layout).toMatchSnapshot()
  })
})

// ---- 每个 NodeType 的决策输出 ----

describe('buildLayout 各 NodeType 决策输出', () => {
  it('DOCUMENT_TITLE：居中、标题行距、无缩进、时间冒号拆分（统一真值）', () => {
    const ast: GongwenAST = {
      title: [makeNode(NodeType.DOCUMENT_TITLE, '关于9:00召开会议的通知', 1)],
      body: [],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const title = paragraphBlocksOf(layout, NodeType.DOCUMENT_TITLE)[0]
    expect(title.alignment).toBe('center')
    expect(title.spacing).toEqual({ lineTwips: 592, lineRule: 'exact', beforeTwips: 0, afterTwips: 0 })
    expect(title.indent).toEqual({})
    expect(title.runs.map((r) => r.text)).toEqual(['关于', '9', ':', '00', '召开会议的通知'])
    expect(title.runs[2].role).toBe('bodyPunct')
    expect(title.runs[2].sizeHalfPt).toBe(44) // 冒号规格字号跟随宿主（标题 22pt）
    // 标题后空一行
    const spacer = layout.blocks[1]
    expect(spacer.kind).toBe('spacer')
    if (spacer.kind === 'spacer') {
      expect(spacer.reason).toBe('after-title')
      expect(spacer.lines).toBe(1)
      expect(spacer.lineTwips).toBe(592)
    }
  })

  it('HEADING_1：两端对齐、首行缩进 630、首句黑体拆分', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.HEADING_1, '一、总体要求。具体内容。', 1)],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const block = paragraphBlocksOf(layout, NodeType.HEADING_1)[0]
    expect(block.alignment).toBe('justified')
    expect(block.indent).toEqual({ firstLineTwips: 630, leftTwips: 0 })
    expect(block.runs.map((r) => r.role)).toEqual(['heading1', 'body'])
    expect(block.runs[0].font.eastAsia).toBe('黑体')
    expect(block.runs[0].characterSpacingTwips).toBe(-5)
  })

  it('HEADING_2：楷体（读 advanced.h2）', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.HEADING_2, '（一）指导思想。', 1)],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const block = paragraphBlocksOf(layout, NodeType.HEADING_2)[0]
    expect(block.runs[0].font.eastAsia).toBe('楷体_GB2312')
    expect(block.runs[0].role).toBe('heading2')
  })

  it('HEADING_3：docx 决策拆分序号句点（0001 导出现状）', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.HEADING_3, '1.加强组织领导。', 1)],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const block = paragraphBlocksOf(layout, NodeType.HEADING_3)[0]
    expect(block.runs.map((r) => r.text)).toEqual(['1', '.', '加强组织领导。'])
    expect(block.runs[0].font.eastAsia).toBe('仿宋_GB2312')
    expect(block.runs[0].role).toBe('heading3')
  })

  it('HEADING_3：preview 决策不拆分序号句点（0001 预览现状）', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.HEADING_3, '1.加强组织领导。', 1)],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'preview' })
    const block = paragraphBlocksOf(layout, NodeType.HEADING_3)[0]
    expect(block.runs.map((r) => r.text)).toEqual(['1.加强组织领导。'])
    expect(block.runs[0].role).toBe('heading3')
  })

  it('HEADING_4：正文字体（现状落入默认分支）、首句拆分', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.HEADING_4, '（1）制定实施方案。', 1)],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const block = paragraphBlocksOf(layout, NodeType.HEADING_4)[0]
    expect(block.runs[0].role).toBe('body')
    expect(block.runs[0].font.eastAsia).toBe('仿宋_GB2312')
  })

  it('PARAGRAPH：两端对齐、首行缩进、时间冒号拆分', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.PARAGRAPH, '会议时间为9:00至11:30。', 1)],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const block = paragraphBlocksOf(layout, NodeType.PARAGRAPH)[0]
    expect(block.alignment).toBe('justified')
    expect(block.indent).toEqual({ firstLineTwips: 630, leftTwips: 0 })
    expect(block.spacing).toEqual({ lineTwips: 592, lineRule: 'exact', beforeTwips: 0, afterTwips: 0 })
    expect(block.runs.map((r) => r.text)).toEqual(['会议时间为', '9', ':', '00', '至', '11', ':', '30', '。'])
  })

  it('ADDRESSEE：两端对齐、顶格（left 0，无首行缩进）', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.ADDRESSEE, '各县（市、区）人民政府：', 1)],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const block = paragraphBlocksOf(layout, NodeType.ADDRESSEE)[0]
    expect(block.alignment).toBe('justified')
    expect(block.indent).toEqual({ leftTwips: 0 })
    expect(block.runs[0].role).toBe('addressee')
    expect(block.runs[0].font.eastAsia).toBe('仿宋_GB2312')
    expect(block.runs[0].font.ascii).toBe('Times New Roman')
  })

  it('ATTACHMENT 单附件：左空 5 字悬挂 3 字、段前一行距、不拆句点', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeAttachment([{ index: 0, name: '公文排版管理办法实施细则' }], false, 1)],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const block = paragraphBlocksOf(layout, NodeType.ATTACHMENT)[0]
    expect(block.indent).toEqual({ leftTwips: 1575, hangingTwips: 945 })
    expect(block.spacing.beforeTwips).toBe(592)
    expect(block.runs.map((r) => r.text)).toEqual(['附件：', '公文排版管理办法实施细则'])
  })

  it('ATTACHMENT 多附件：首行带「附件：」前缀＋序号句点拆分，后续行顶格 5 字', () => {
    const layout = buildLayout(FULL_AST, DEFAULT_CONFIG, { renderer: 'docx' })
    const blocks = paragraphBlocksOf(layout, NodeType.ATTACHMENT)
    expect(blocks).toHaveLength(3)
    expect(blocks[0].runs.map((r) => r.text)).toEqual(['附件：', '1', '.', '公文排版管理办法'])
    expect(blocks[0].runs[2].role).toBe('bodyPunct')
    expect(blocks[0].indent).toEqual({ leftTwips: 1575, hangingTwips: 945 })
    expect(blocks[0].spacing.beforeTwips).toBe(592)
    expect(blocks[1].runs.map((r) => r.text)).toEqual(['2', '.', '公文格式自查清单'])
    expect(blocks[1].indent).toEqual({ leftTwips: 1575 })
    expect(blocks[1].spacing.beforeTwips).toBe(0)
  })

  it('SIGNATURE＋DATE：署名前 2 空行、按日期宽度居中（1417.5/630 基准）', () => {
    const ast: GongwenAST = {
      title: [],
      body: [
        makeNode(NodeType.PARAGRAPH, '正文。', 1),
        makeNode(NodeType.SIGNATURE, '某某市政府', 2),
        makeNode(NodeType.DATE, '二零二六年九月十一日', 3),
      ],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const signature = paragraphBlocksOf(layout, NodeType.SIGNATURE)[0]
    expect(signature.alignment).toBe('right')
    expect(signature.indent).toEqual({ rightTwips: 1417.5 })
    const date = paragraphBlocksOf(layout, NodeType.DATE)[0]
    expect(date.alignment).toBe('right')
    expect(date.indent).toEqual({ rightTwips: 630 })
    // 署名前 2 空行
    const spacers = layout.blocks.filter((b) => b.kind === 'spacer')
    expect(spacers).toHaveLength(1)
    const spacer = spacers[0]
    if (spacer.kind === 'spacer') {
      expect(spacer.reason).toBe('before-signature')
      expect(spacer.lines).toBe(2)
      expect(spacer.font.eastAsia).toBe('仿宋_GB2312')
    }
  })

  it('SIGNATURE 无日期跟随：右缩进取印章基准（630/1260）', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.SIGNATURE, '某某市政府', 1)],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    expect(paragraphBlocksOf(layout, NodeType.SIGNATURE)[0].indent).toEqual({ rightTwips: 630 })

    const stamped = configWith((c) => {
      c.specialOptions.hasStamp = true
    })
    const stampedLayout = buildLayout(ast, stamped, { renderer: 'docx' })
    expect(paragraphBlocksOf(stampedLayout, NodeType.SIGNATURE)[0].indent).toEqual({ rightTwips: 1260 })
  })

  it('REMARK：左对齐不缩进、前 2 空行', () => {
    const ast: GongwenAST = {
      title: [],
      body: [
        makeNode(NodeType.PARAGRAPH, '正文。', 1),
        makeNode(NodeType.REMARK, '（联系人：张三）', 2),
      ],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const block = paragraphBlocksOf(layout, NodeType.REMARK)[0]
    expect(block.alignment).toBe('left')
    expect(block.indent).toEqual({ leftTwips: 0 })
    const spacer = layout.blocks.find((b) => b.kind === 'spacer')
    if (spacer && spacer.kind === 'spacer') {
      expect(spacer.reason).toBe('before-remark')
      expect(spacer.lines).toBe(2)
    } else {
      throw new Error('缺少备注前空行')
    }
  })

  it('TABLE：结构化表格块（居中单元格、表头加粗开关、表格行距）', () => {
    const layout = buildLayout(FULL_AST, DEFAULT_CONFIG, { renderer: 'docx' })
    const table = layout.blocks.find((b) => b.kind === 'table')
    if (table && table.kind === 'table') {
      expect(table.headerCells).toEqual(['序号', '事项', '责任单位'])
      expect(table.dataRows).toEqual([['1', '制定方案', '办公室'], ['2', '组织培训', '人事科']])
      expect(table.cellAlignment).toBe('center')
      expect(table.font.eastAsia).toBe('仿宋_GB2312')
      expect(table.font.ascii).toBe('Times New Roman')
      expect(table.sizeHalfPt).toBe(24) // 表格 12pt
      expect(table.lineTwips).toBe(440) // 22pt 行距
      expect(table.boldHeader).toBe(true)
    } else {
      throw new Error('缺少表格块')
    }
  })

  it('无标题公文：无 after-title 空行，直接正文', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.PARAGRAPH, '正文段落内容。', 1)],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    expect(layout.blocks).toHaveLength(1)
    expect(layout.blocks[0].kind).toBe('paragraph')
  })
})

// ---- 版头/版记/页码场景 ----

describe('buildLayout 版头/版记/页码版式参数', () => {
  it('版头开（含签发人）：机关标志规格、空二行、标题段前距 1184、红线现状参数', () => {
    const config = configWith((c) => {
      c.header.enabled = true
      c.header.orgName = '某某市人民政府文件'
      c.header.docNumber = '某府发〔2026〕12号'
      c.header.signer = '李四'
    })
    const layout = buildLayout(MINIMAL_AST, config, { renderer: 'docx' })
    const header = layout.header
    expect(header).not.toBeNull()
    if (header) {
      expect(header.orgNameRun.text).toBe('某某市人民政府文件')
      expect(header.orgNameRun.font.eastAsia).toBe('方正小标宋_GBK')
      expect(header.orgNameRun.sizeHalfPt).toBe(60)
      expect(header.orgNameRun.font).toEqual({
        ascii: 'Times New Roman',
        eastAsia: '方正小标宋_GBK',
        hAnsi: '方正小标宋_GBK',
        cs: 'Times New Roman',
      })
      expect(header.metaFont.hAnsi).toBe('Times New Roman') // 版头元数据字体现状（hAnsi=TNR）
      expect(header.metaFont.eastAsia).toBe('仿宋_GB2312')
      expect(header.signerNameFont.eastAsia).toBe('楷体_GB2312')
      expect(header.oneCharIndentTwips).toBe(320) // 空一字 = 16pt = 320 twips
      expect(header.blankLinesAfterOrg).toBe(2)
      expect(header.titleSpacingBeforeTwips).toBe(1184) // 2 × 592
      expect(header.separator).toEqual({
        mechanism: 'paragraph-border',
        sizeEighthPt: 15,
        beforeTwips: 80,
        color: 'E00000',
      })
    }
    // 首标题段带版头段前距
    const title = paragraphBlocksOf(layout, NodeType.DOCUMENT_TITLE)[0]
    expect(title.spacing.beforeTwips).toBe(1184)
    expect(layout).toMatchSnapshot()
  })

  it('版头关（默认）：header 为 null，标题段前距 0', () => {
    const layout = buildLayout(MINIMAL_AST, DEFAULT_CONFIG, { renderer: 'docx' })
    expect(layout.header).toBeNull()
    const title = paragraphBlocksOf(layout, NodeType.DOCUMENT_TITLE)[0]
    expect(title.spacing.beforeTwips).toBe(0)
  })

  it('版记开（抄送+印发俱全）：粗细线参数、锚定机制按渲染器', () => {
    const config = configWith((c) => {
      c.footerNote.enabled = true
      c.footerNote.cc = '市委办公室，市人大常委会办公室'
      c.footerNote.printer = '某某市人民政府办公室'
      c.footerNote.printDate = '2026年9月12日'
    })
    const docxLayout = buildLayout(MINIMAL_AST, config, { renderer: 'docx' })
    expect(docxLayout.footerNote).not.toBeNull()
    if (docxLayout.footerNote) {
      expect(docxLayout.footerNote.hasCc).toBe(true)
      expect(docxLayout.footerNote.hasPrint).toBe(true)
      expect(docxLayout.footerNote.sizeHalfPt).toBe(28)
      expect(docxLayout.footerNote.thickLineSizeEighthPt).toBe(12)
      expect(docxLayout.footerNote.thinLineSizeEighthPt).toBe(4)
      expect(docxLayout.footerNote.oneCharIndentTwips).toBe(320)
      expect(docxLayout.footerNote.anchoring).toBe('float-table-body-bottom')
    }
    const previewLayout = buildLayout(MINIMAL_AST, config, { renderer: 'preview' })
    if (previewLayout.footerNote) {
      expect(previewLayout.footerNote.anchoring).toBe('absolute-page-bottom')
    }
  })

  it('版记开（仅抄送）：hasPrint 为 false', () => {
    const config = configWith((c) => {
      c.footerNote.enabled = true
      c.footerNote.cc = '市委办公室'
      c.footerNote.printer = ''
      c.footerNote.printDate = ''
    })
    const layout = buildLayout(MINIMAL_AST, config, { renderer: 'docx' })
    if (layout.footerNote) {
      expect(layout.footerNote.hasCc).toBe(true)
      expect(layout.footerNote.hasPrint).toBe(false)
    } else {
      throw new Error('缺少版记参数')
    }
  })

  it('版记关（默认）：footerNote 为 null', () => {
    const layout = buildLayout(MINIMAL_AST, DEFAULT_CONFIG, { renderer: 'docx' })
    expect(layout.footerNote).toBeNull()
  })

  it('页码开：四号宋体、空一字 280、奇右偶左、— X — 格式', () => {
    const layout = buildLayout(MINIMAL_AST, DEFAULT_CONFIG, { renderer: 'docx' })
    expect(layout.pageNumber.enabled).toBe(true)
    expect(layout.pageNumber.font).toEqual({
      ascii: '宋体',
      eastAsia: '宋体',
      hAnsi: '宋体',
      cs: '宋体',
    })
    expect(layout.pageNumber.sizeHalfPt).toBe(28)
    expect(layout.pageNumber.oneCharIndentTwips).toBe(280)
    expect(layout.pageNumber.oddAlignment).toBe('right')
    expect(layout.pageNumber.evenAlignment).toBe('left')
    expect(layout.pageNumber.format).toBe('dash-number-dash')
  })

  it('页码关：enabled 为 false', () => {
    const config = configWith((c) => {
      c.specialOptions.showPageNumber = false
    })
    const layout = buildLayout(MINIMAL_AST, config, { renderer: 'docx' })
    expect(layout.pageNumber.enabled).toBe(false)
  })

  it('多段标题：逐段入流，仅首段带段前距', () => {
    const config = configWith((c) => {
      c.header.enabled = true
      c.header.orgName = '某某市人民政府文件'
    })
    const layout = buildLayout(FULL_AST, config, { renderer: 'docx' })
    const titles = paragraphBlocksOf(layout, NodeType.DOCUMENT_TITLE)
    expect(titles).toHaveLength(2)
    expect(titles[0].spacing.beforeTwips).toBe(1184)
    expect(titles[1].spacing.beforeTwips).toBe(0)
  })
})

// ---- 全场景结构快照（块序列骨架） ----

describe('buildLayout 块序列结构', () => {
  it('全节点样例：块类型序列符合预期骨架', () => {
    const layout = buildLayout(FULL_AST, DEFAULT_CONFIG, { renderer: 'docx' })
    const skeleton = layout.blocks.map(function (b) {
      if (b.kind === 'spacer') {
        return 'spacer:' + b.reason + 'x' + b.lines
      }
      if (b.kind === 'table') {
        return 'table'
      }
      return 'p:' + b.sourceType
    })
    expect(skeleton).toEqual([
      'p:DOCUMENT_TITLE',
      'p:DOCUMENT_TITLE',
      'spacer:after-titlex1',
      'p:ADDRESSEE',
      'p:PARAGRAPH',
      'p:HEADING_1',
      'p:PARAGRAPH',
      'p:HEADING_2',
      'p:PARAGRAPH',
      'p:HEADING_3',
      'p:PARAGRAPH',
      'p:HEADING_4',
      'p:PARAGRAPH',
      'table',
      'p:ATTACHMENT',
      'p:ATTACHMENT',
      'p:ATTACHMENT',
      'spacer:before-signaturex2',
      'p:SIGNATURE',
      'p:DATE',
      'spacer:before-remarkx2',
      'p:REMARK',
    ])
  })

  it('preview 与 docx 的块序列骨架一致（差异仅在 run 分段与开关参数）', () => {
    const docxLayout = buildLayout(FULL_AST, DEFAULT_CONFIG, { renderer: 'docx' })
    const previewLayout = buildLayout(FULL_AST, DEFAULT_CONFIG, { renderer: 'preview' })
    expect(previewLayout.blocks).toHaveLength(docxLayout.blocks.length)
    expect(previewLayout.metrics).toEqual(docxLayout.metrics)
    expect(previewLayout.footerNote).toEqual(docxLayout.footerNote)
  })
})
