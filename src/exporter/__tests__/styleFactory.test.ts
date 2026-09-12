import { describe, it, expect } from 'vitest'
import { Paragraph, Table } from 'docx'
import { buildLayout } from '../../layout'
import type { LayoutBlock, LayoutParagraphBlock, LayoutRun } from '../../layout/types'
import {
  fontOptions,
  runOptions,
  paragraphOptions,
  paragraphFromBlock,
  spacerParagraphs,
  blocksToDocx,
  blockToDocx,
} from '../styleFactory'
import { DEFAULT_CONFIG } from '../../types/documentConfig'
import type { DocumentConfig } from '../../types/documentConfig'
import { NodeType } from '../../types/ast'
import type { GongwenAST, DocumentNode, AttachmentNode } from '../../types/ast'

/**
 * 导出翻译层测试（task-0001 条款3，单元4 迁移改写）
 *
 * 原 styleFactory.test.ts（60 用例）的对照基线职责拆分承接：
 * - 排版决策数值 → src/layout/__tests__/（fonts/metrics/buildLayout）
 * - 导出产物结构 → docxBuilder.test.ts 13 条快照红线
 * - 本文件＝「决策中间表示 → docx 对象」翻译层的形状与数值：
 *   可选字段只在决策层给出时翻译（docx 对空对象产出空标签、对 undefined
 *   不产出属性——逐字节保持快照的机械保证），数值与原基线一致
 *   （charSpacing −5、charWidth 315、首行缩进 630、签名缩进 1417.5 等）。
 *
 * 单一真值（单元6 双轨合并后）：标题字体真值在 config.headings
 * （h1/h2/h3/addressee），预览与导出同源。
 */

// ---- 测试辅助 ----

/** 深拷贝默认配置后打补丁（测试专用，避免污染共享对象） */
function configWith(patch: (c: DocumentConfig) => void): DocumentConfig {
  const cloned = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as DocumentConfig
  patch(cloned)
  return cloned
}

/** 构造普通 AST 节点（as 收窄：宽松 NodeType 参数 → 判别联合，待办-0029） */
function makeNode(type: NodeType, content: string, lineNumber = 1): DocumentNode {
  return { type, content, lineNumber } as DocumentNode
}

/** 构造单节点公文并取其首个段落块（署名/备注前有空行块，须跳过） */
function paragraphBlockOf(
  type: NodeType,
  content: string,
  config: DocumentConfig = DEFAULT_CONFIG
): LayoutParagraphBlock {
  const ast: GongwenAST = { title: [], body: [makeNode(type, content)] }
  const layout = buildLayout(ast, config, { renderer: 'docx' })
  const block = layout.blocks.find((b): b is LayoutParagraphBlock => b.kind === 'paragraph')
  if (!block) {
    throw new Error('预期存在段落块')
  }
  return block
}

/** 构造署名+日期公文（署名缩进按日期上下文计算；跳过署名前空行块） */
function signatureBlockOf(
  signature: string,
  date: string,
  config: DocumentConfig = DEFAULT_CONFIG
): LayoutParagraphBlock {
  const ast: GongwenAST = {
    title: [],
    body: [makeNode(NodeType.SIGNATURE, signature), makeNode(NodeType.DATE, date)],
  }
  const layout = buildLayout(ast, config, { renderer: 'docx' })
  const block = layout.blocks.find(
    (b): b is LayoutParagraphBlock => b.kind === 'paragraph' && b.sourceType === NodeType.SIGNATURE
  )
  if (!block) {
    throw new Error('预期存在署名段落块')
  }
  return block
}

/** 构造附件节点并取全部附件段落块 */
function attachmentBlocksOf(
  items: Array<{ index: number; name: string }>,
  isMultiple: boolean,
  config: DocumentConfig = DEFAULT_CONFIG
): LayoutParagraphBlock[] {
  const node: AttachmentNode = {
    type: NodeType.ATTACHMENT,
    content: '附件：',
    lineNumber: 1,
    isMultiple,
    items,
  }
  const ast: GongwenAST = { title: [], body: [node] }
  const layout = buildLayout(ast, config, { renderer: 'docx' })
  return layout.blocks.filter(
    (b): b is LayoutParagraphBlock => b.kind === 'paragraph' && b.sourceType === NodeType.ATTACHMENT
  )
}

/** 手工构造最小 LayoutRun（纯翻译函数单测用） */
function mkRun(overrides: Partial<LayoutRun>): LayoutRun {
  return {
    text: 'x',
    role: 'body',
    font: { ascii: 'Times New Roman', eastAsia: '仿宋_GB2312', hAnsi: '仿宋_GB2312', cs: 'Times New Roman' },
    sizeHalfPt: 32,
    ...overrides,
  }
}

// ---- 纯翻译函数形状（快照逐字节保持的机械保证） ----

describe('fontOptions / runOptions 翻译形状', () => {
  it('字体四槽纯搬运（四键直传）', () => {
    expect(fontOptions(mkRun({}).font)).toEqual({
      ascii: 'Times New Roman',
      eastAsia: '仿宋_GB2312',
      hAnsi: '仿宋_GB2312',
      cs: 'Times New Roman',
    })
  })

  it('text 与 size 直传', () => {
    const options = runOptions(mkRun({ text: '正文', sizeHalfPt: 44 }))
    expect(options.text).toBe('正文')
    expect(options.size).toBe(44)
  })

  it('characterSpacing 未设时不产出属性（公文标题——不参与 28 字微调）', () => {
    const options = runOptions(mkRun({ characterSpacingTwips: undefined }))
    expect(options.characterSpacing).toBeUndefined()
    expect('characterSpacing' in options).toBe(false)
  })

  it('characterSpacing 设定时产出（−5）', () => {
    const options = runOptions(mkRun({ characterSpacingTwips: -5 }))
    expect(options.characterSpacing).toBe(-5)
  })

  it('bold 未设时不产出属性（现状正文/标题均无加粗 run）', () => {
    const options = runOptions(mkRun({}))
    expect('bold' in options).toBe(false)
  })

  it('bold 设定时保留 boolean（表格表头 boldHeader 通道）', () => {
    expect(runOptions(mkRun({ bold: true })).bold).toBe(true)
    expect(runOptions(mkRun({ bold: false })).bold).toBe(false)
  })
})

// ---- 决策块 → run 翻译（原 getRunStyle 字体映射基线承接） ----

describe('决策块 run 数值基线（原 getRunStyle 对照迁移）', () => {
  it('正文：eastAsia/hAnsi 仿宋_GB2312，ascii/cs Times New Roman，三号 32 half-point', () => {
    const block = paragraphBlockOf(NodeType.PARAGRAPH, '正文内容。')
    const options = runOptions(block.runs[0])
    expect(options.font).toEqual({
      ascii: 'Times New Roman',
      eastAsia: '仿宋_GB2312',
      hAnsi: '仿宋_GB2312',
      cs: 'Times New Roman',
    })
    expect(options.size).toBe(32)
  })

  it('公文标题：方正小标宋_GBK，二号 44 half-point', () => {
    const ast: GongwenAST = { title: [makeNode(NodeType.DOCUMENT_TITLE, '标题')], body: [] }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const title = layout.blocks[0]
    if (title.kind !== 'paragraph') throw new Error('预期标题段')
    const options = runOptions(title.runs[0])
    expect(options.font).toEqual(
      expect.objectContaining({ eastAsia: '方正小标宋_GBK' })
    )
    expect(options.size).toBe(44)
  })

  it('一级标题：eastAsia/hAnsi 黑体（读 config.headings.h1）', () => {
    const block = paragraphBlockOf(NodeType.HEADING_1, '一、总体要求。')
    expect(runOptions(block.runs[0]).font).toEqual(
      expect.objectContaining({ eastAsia: '黑体', hAnsi: '黑体' })
    )
  })

  it('二级标题：eastAsia 楷体_GB2312（读 config.headings.h2）', () => {
    const block = paragraphBlockOf(NodeType.HEADING_2, '（一）指导思想。')
    expect(runOptions(block.runs[0]).font).toEqual(
      expect.objectContaining({ eastAsia: '楷体_GB2312' })
    )
  })

  it('三级标题：eastAsia 仿宋_GB2312（读 config.headings.h3）', () => {
    const block = paragraphBlockOf(NodeType.HEADING_3, '1.加强组织领导。')
    expect(runOptions(block.runs[0]).font).toEqual(
      expect.objectContaining({ eastAsia: '仿宋_GB2312' })
    )
  })

  it('四级标题落入默认分支：正文字体仿宋_GB2312（现状）', () => {
    const block = paragraphBlockOf(NodeType.HEADING_4, '（1）制定实施方案。')
    const options = runOptions(block.runs[0])
    expect(options.font).toEqual(
      expect.objectContaining({ eastAsia: '仿宋_GB2312' })
    )
    expect(options.size).toBe(32)
  })

  it('主送机关读 config.headings.addressee（仿宋 + Times New Roman）', () => {
    const block = paragraphBlockOf(NodeType.ADDRESSEE, '各县（市、区）人民政府：')
    const options = runOptions(block.runs[0])
    expect(options.font).toEqual(
      expect.objectContaining({ eastAsia: '仿宋_GB2312', ascii: 'Times New Roman' })
    )
  })

  it('署名/成文日期/备注 run 与正文同字体（body 角色）', () => {
    for (const type of [NodeType.SIGNATURE, NodeType.DATE, NodeType.REMARK]) {
      const block = paragraphBlockOf(type, '内容')
      expect(runOptions(block.runs[0]).font).toEqual(
        expect.objectContaining({ eastAsia: '仿宋_GB2312' })
      )
    }
  })

  it('时间冒号 run：四槽全正文字体（原 getTimeColonRunStyle 基线）', () => {
    const block = paragraphBlockOf(NodeType.PARAGRAPH, '会议时间为9:00开始。')
    const colon = block.runs.find((r) => r.role === 'bodyPunct')
    if (!colon) throw new Error('缺少时间冒号 run')
    expect(runOptions(colon).font).toEqual({
      ascii: '仿宋_GB2312',
      eastAsia: '仿宋_GB2312',
      hAnsi: '仿宋_GB2312',
      cs: '仿宋_GB2312',
    })
  })

  it('时间冒号 run 字号随宿主：正文内 32、标题内 44（原字号随调用方基线）', () => {
    const body = paragraphBlockOf(NodeType.PARAGRAPH, '时间为9:00。')
    const bodyColon = body.runs.find((r) => r.role === 'bodyPunct')
    if (!bodyColon) throw new Error('缺少正文冒号 run')
    expect(runOptions(bodyColon).size).toBe(32)

    const ast: GongwenAST = {
      title: [makeNode(NodeType.DOCUMENT_TITLE, '关于9:00开会')],
      body: [],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const title = layout.blocks[0]
    if (title.kind !== 'paragraph') throw new Error('预期标题段')
    const titleColon = title.runs.find((r) => r.role === 'bodyPunct')
    if (!titleColon) throw new Error('缺少标题冒号 run')
    expect(runOptions(titleColon).size).toBe(44)
  })

  it('三级标题句点 run：四槽正文字体，字号跟随三级标题（32）', () => {
    const block = paragraphBlockOf(NodeType.HEADING_3, '1.加强领导。')
    const dot = block.runs.find((r) => r.text === '.')
    if (!dot) throw new Error('缺少句点 run')
    const options = runOptions(dot)
    expect(options.font).toEqual(
      expect.objectContaining({ ascii: '仿宋_GB2312', eastAsia: '仿宋_GB2312' })
    )
    expect(options.size).toBe(32)
  })

  it('附件句点 run：四槽正文字体，字号跟随正文（32）', () => {
    const blocks = attachmentBlocksOf(
      [
        { index: 1, name: '办法' },
        { index: 2, name: '清单' },
      ],
      true
    )
    const dot = blocks[0].runs.find((r) => r.text === '.')
    if (!dot) throw new Error('缺少附件句点 run')
    expect(runOptions(dot).size).toBe(32)
    expect(runOptions(dot).font).toEqual(
      expect.objectContaining({ ascii: '仿宋_GB2312' })
    )
  })

  it('附件文本 run：数字英文 Times New Roman、中文仿宋（原 getAttachmentRunStyle 基线）', () => {
    const blocks = attachmentBlocksOf([{ index: 1, name: '办法' }], true)
    const numberRun = blocks[0].runs.find((r) => r.text === '1')
    if (!numberRun) throw new Error('缺少序号 run')
    const options = runOptions(numberRun)
    expect(options.font).toEqual({
      ascii: 'Times New Roman',
      eastAsia: '仿宋_GB2312',
      hAnsi: '仿宋_GB2312',
      cs: 'Times New Roman',
    })
    expect(options.characterSpacing).toBe(-5)
  })

  it('charSpacing 公式：默认 floor(8844/28 − 320) = −5（twips）', () => {
    const block = paragraphBlockOf(NodeType.PARAGRAPH, '正文。')
    expect(runOptions(block.runs[0]).characterSpacing).toBe(-5)
  })

  it('边距变化响应：左右各 2.5cm → charSpacing = 3（原基线）', () => {
    const config = configWith((c) => {
      c.margins.left = 2.5
      c.margins.right = 2.5
    })
    const block = paragraphBlockOf(NodeType.PARAGRAPH, '正文。', config)
    expect(runOptions(block.runs[0]).characterSpacing).toBe(3)
  })
})

// ---- 决策块 → 段落翻译（原 getParagraphStyle 基线承接） ----

describe('决策块段落样式基线（原 getParagraphStyle 对照迁移）', () => {
  it('正文：两端对齐 + 首行缩进 630 + 固定行距 592', () => {
    const options = paragraphOptions(paragraphBlockOf(NodeType.PARAGRAPH, '正文。'))
    expect(options.alignment).toBe('both')
    expect(options.spacing).toEqual({ line: 592, lineRule: 'exact', before: 0, after: 0 })
    expect(options.indent).toEqual({ firstLine: 630, left: 0 })
  })

  it('公文标题：居中，行距取 title.lineSpacing（592），无缩进', () => {
    const ast: GongwenAST = { title: [makeNode(NodeType.DOCUMENT_TITLE, '标题')], body: [] }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const title = layout.blocks[0]
    if (title.kind !== 'paragraph') throw new Error('预期标题段')
    const options = paragraphOptions(title)
    expect(options.alignment).toBe('center')
    expect(options.spacing).toEqual({ line: 592, lineRule: 'exact', before: 0, after: 0 })
    expect(options.indent).toBeUndefined()
  })

  it('主送机关：顶格（无首行缩进，left 0）两端对齐', () => {
    const options = paragraphOptions(paragraphBlockOf(NodeType.ADDRESSEE, '各部门：'))
    expect(options.alignment).toBe('both')
    expect(options.indent).toEqual({ left: 0 })
  })

  it('成文日期：右对齐右缩进，无印章空二字（630）', () => {
    const options = paragraphOptions(paragraphBlockOf(NodeType.DATE, '二零二六年九月十一日'))
    expect(options.alignment).toBe('right')
    expect(options.indent).toEqual({ right: 630 })
  })

  it('成文日期（有印章）：右空四字（1260）', () => {
    const stamped = configWith((c) => {
      c.specialOptions.hasStamp = true
    })
    const options = paragraphOptions(paragraphBlockOf(NodeType.DATE, '二零二六年九月十一日', stamped))
    expect(options.indent).toEqual({ right: 1260 })
  })

  it('署名（无日期上下文）：右缩进同日期基准（630）', () => {
    const options = paragraphOptions(paragraphBlockOf(NodeType.SIGNATURE, '某某市政府'))
    expect(options.indent).toEqual({ right: 630 })
  })

  it('署名（无日期上下文、有印章）：右空四字（1260）', () => {
    const stamped = configWith((c) => {
      c.specialOptions.hasStamp = true
    })
    const options = paragraphOptions(paragraphBlockOf(NodeType.SIGNATURE, '某某市政府', stamped))
    expect(options.indent).toEqual({ right: 1260 })
  })

  it('署名（有日期上下文）：右缩进取签名居中计算值（1417.5）', () => {
    const options = paragraphOptions(
      signatureBlockOf('某某市政府', '二零二六年九月十一日')
    )
    expect(options.indent).toEqual({ right: 1417.5 })
  })

  it('备注：左对齐不缩进', () => {
    const options = paragraphOptions(paragraphBlockOf(NodeType.REMARK, '（联系人：张三）'))
    expect(options.alignment).toBe('left')
    expect(options.indent).toEqual({ left: 0 })
  })

  it('公文标题（版头启用）：段前距 = 2 × 正文行距（1184）', () => {
    const config = configWith((c) => {
      c.header.enabled = true
      c.header.orgName = '某某市人民政府文件'
    })
    const ast: GongwenAST = { title: [makeNode(NodeType.DOCUMENT_TITLE, '标题')], body: [] }
    const layout = buildLayout(ast, config, { renderer: 'docx' })
    const title = layout.blocks[0]
    if (title.kind !== 'paragraph') throw new Error('预期标题段')
    expect(title.spacing.beforeTwips).toBe(1184)
  })

  it('公文标题（版头关）：段前距 0', () => {
    const ast: GongwenAST = { title: [makeNode(NodeType.DOCUMENT_TITLE, '标题')], body: [] }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const title = layout.blocks[0]
    if (title.kind !== 'paragraph') throw new Error('预期标题段')
    expect(title.spacing.beforeTwips).toBe(0)
  })

  it('附件单段：左空 5 字（1575）悬挂 3 字（945），段前一行距、无段后距', () => {
    const blocks = attachmentBlocksOf([{ index: 0, name: '实施细则' }], false)
    const options = paragraphOptions(blocks[0])
    expect(options.indent).toEqual({ left: 1575, hanging: 945 })
    expect(options.spacing).toEqual({ line: 592, lineRule: 'exact', before: 592 })
  })

  it('多附件首行：与单附件同构（悬挂缩进对齐换行）', () => {
    const blocks = attachmentBlocksOf(
      [
        { index: 1, name: '办法' },
        { index: 2, name: '清单' },
      ],
      true
    )
    const options = paragraphOptions(blocks[0])
    expect(options.indent).toEqual({ left: 1575, hanging: 945 })
    expect(options.spacing?.before).toBe(592)
  })

  it('多附件后续行：仅左空 5 字，段前段后均不设', () => {
    const blocks = attachmentBlocksOf(
      [
        { index: 1, name: '办法' },
        { index: 2, name: '清单' },
      ],
      true
    )
    const options = paragraphOptions(blocks[1])
    expect(options.indent).toEqual({ left: 1575 })
    expect(options.spacing).toEqual({ line: 592, lineRule: 'exact' })
  })
})

// ---- 空行翻译 ----

describe('空行块翻译（spacerParagraphs）', () => {
  /** 取决策层空行块（按 reason 定位） */
  function spacerOf(reason: 'after-title' | 'before-signature' | 'before-remark') {
    const ast: GongwenAST = {
      title: [makeNode(NodeType.DOCUMENT_TITLE, '标题')],
      body: [makeNode(NodeType.SIGNATURE, '某某市政府'), makeNode(NodeType.REMARK, '（备注）')],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const spacer = layout.blocks.find(
      (b) => b.kind === 'spacer' && b.reason === reason
    )
    if (!spacer || spacer.kind !== 'spacer') throw new Error('缺少空行块')
    return spacer
  }

  it('按 lines 数产出空段（署名前 2 空行）', () => {
    expect(spacerParagraphs(spacerOf('before-signature'))).toHaveLength(2)
  })

  it('标题后空行：lines 1、固定行距 592（决策字段）', () => {
    const spacer = spacerOf('after-title')
    expect(spacer.lines).toBe(1)
    expect(spacer.lineTwips).toBe(592)
    expect(spacerParagraphs(spacer)).toHaveLength(1)
  })

  it('空段 run 规格：决策层给定正文字体四槽与字号（序列化形状由导出快照锁定）', () => {
    const spacer = spacerOf('after-title')
    expect(spacer.font).toEqual({
      ascii: 'Times New Roman',
      eastAsia: '仿宋_GB2312',
      hAnsi: '仿宋_GB2312',
      cs: 'Times New Roman',
    })
    expect(spacer.sizeHalfPt).toBe(32)
  })
})

// ---- 块流翻译 ----

describe('块流翻译（blocksToDocx / blockToDocx）', () => {
  const FULL_AST: GongwenAST = {
    title: [makeNode(NodeType.DOCUMENT_TITLE, '标题', 1)],
    body: [
      makeNode(NodeType.PARAGRAPH, '正文。', 2),
      makeNode(NodeType.SIGNATURE, '某某市政府', 3),
      makeNode(NodeType.DATE, '二零二六年九月十一日', 4),
      makeNode(NodeType.REMARK, '（备注）', 5),
    ],
  }

  it('空行块按行数展开、块序保持（段落-空行-段落）', () => {
    const layout = buildLayout(FULL_AST, DEFAULT_CONFIG, { renderer: 'docx' })
    const docxChildren = blocksToDocx(layout.blocks)
    // 标题 1 + 空行 1 + 正文 1 + 署名前空行 2 + 署名 1 + 日期 1 + 备注前空行 2 + 备注 1 = 10
    expect(docxChildren).toHaveLength(10)
  })

  it('blockToDocx：段落块产出 Paragraph', () => {
    const block = paragraphBlockOf(NodeType.PARAGRAPH, '正文。')
    const result = blockToDocx(block)
    expect(result).toBeInstanceOf(Paragraph)
  })

  it('blockToDocx：空行块产出首个空段 Paragraph', () => {
    const ast: GongwenAST = {
      title: [makeNode(NodeType.DOCUMENT_TITLE, '标题')],
      body: [],
    }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    const spacer = layout.blocks[1]
    if (spacer.kind !== 'spacer') throw new Error('预期空行块')
    expect(blockToDocx(spacer)).toBeInstanceOf(Paragraph)
  })

  it('blockToDocx：表格块产出 Table', () => {
    const tableBlock: LayoutBlock = {
      kind: 'table',
      sourceType: NodeType.TABLE,
      rawContent: '|列一|\n|---|\n|值一|',
      headerCells: ['列一'],
      dataRows: [['值一']],
      cellAlignment: 'center',
      font: { ascii: 'Times New Roman', eastAsia: '仿宋_GB2312', hAnsi: 'Times New Roman', cs: 'Times New Roman' },
      sizeHalfPt: 24,
      lineTwips: 440,
      boldHeader: true,
    }
    expect(blockToDocx(tableBlock)).toBeInstanceOf(Table)
  })

  it('paragraphFromBlock 产出 docx Paragraph 实例', () => {
    expect(paragraphFromBlock(paragraphBlockOf(NodeType.PARAGRAPH, '正文。'))).toBeInstanceOf(
      Paragraph
    )
  })

  it('无标题公文：单块直译（无标题段与标题后空行）', () => {
    const ast: GongwenAST = { title: [], body: [makeNode(NodeType.PARAGRAPH, '正文。')] }
    const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'docx' })
    expect(blocksToDocx(layout.blocks)).toHaveLength(1)
  })
})

// ---- 签名缩进基线（原 calculateSignatureIndent 用例迁移，经决策层整链） ----

describe('签名缩进基线（导出侧，经决策层）', () => {
  it('署名与日期等宽（各 10 字）：右缩进即基准 630', () => {
    expect(
      paragraphOptions(signatureBlockOf('某某市人民政府办公厅', '二零二六年九月十一日')).indent
    ).toEqual({ right: 630 })
  })

  it('日期长于署名（10 字 × 5 字）：630 + 2.5×315 = 1417.5', () => {
    expect(
      paragraphOptions(signatureBlockOf('某某市政府', '二零二六年九月十一日')).indent
    ).toEqual({ right: 1417.5 })
  })

  it('有印章（10 字 × 5 字）：1260 + 787.5 = 2047.5', () => {
    const stamped = configWith((c) => {
      c.specialOptions.hasStamp = true
    })
    expect(
      paragraphOptions(signatureBlockOf('某某市政府', '二零二六年九月十一日', stamped)).indent
    ).toEqual({ right: 2047.5 })
  })

  it('署名长于日期（10 字 × 9 字）：630 − 157.5 = 472.5（不钳制）', () => {
    expect(
      paragraphOptions(signatureBlockOf('某某市人民政府办公室', '二零二六年九月一日')).indent
    ).toEqual({ right: 472.5 })
  })

  it('署名显著长于日期（20 字 × 10 字）：负偏移钳制为 0', () => {
    expect(
      paragraphOptions(
        signatureBlockOf('某某市人民政府办公室政务公开与法治建设科', '二零二六年九月十一日')
      ).indent
    ).toEqual({ right: 0 })
  })

  it('含〇日期（〇 按 0.69 计）：630 − 48.825 = 581.175', () => {
    const indent = paragraphOptions(
      signatureBlockOf('某某市人民政府办公室', '二〇二六年九月十一日')
    ).indent
    expect(indent && indent.right).toBeCloseTo(581.175, 6)
  })

  it('混合字符：数字字母按 0.69 系数计宽（≈1488.375）', () => {
    const indent = paragraphOptions(signatureBlockOf('AB局', '2026年9月11日')).indent
    expect(indent && indent.right).toBeCloseTo(1488.375, 6)
  })
})

// ---- 单一真值（单元6 双轨合并后：标题字体真值在 config.headings） ----

describe('标题字体单一真值行为记录', () => {
  it('改 config.headings.h1 影响导出字体（预览与导出同源）', () => {
    const config = configWith((c) => {
      c.headings.h1.fontFamily = '宋体'
      c.headings.h1.fontSize = 22
    })
    const block = paragraphBlockOf(NodeType.HEADING_1, '一、标题。', config)
    const options = runOptions(block.runs[0])
    expect(options.font).toEqual(expect.objectContaining({ eastAsia: '宋体' }))
    expect(options.size).toBe(44)
  })

  it('headings.h1.asciiFontFamily 为空串时回退中文字体（「跟随中文字体」选项）', () => {
    const config = configWith((c) => {
      c.headings.h1.asciiFontFamily = ''
    })
    const block = paragraphBlockOf(NodeType.HEADING_1, '一、标题。', config)
    expect(runOptions(block.runs[0]).font).toEqual(
      expect.objectContaining({ ascii: '黑体' })
    )
  })
})

// ---- run 分段序列（导出侧整链：拆分决策经决策层供给） ----

describe('run 分段序列（导出侧现状）', () => {
  it('一级标题：首句黑体、句号后切换正文（原 splitHeadingSentence 行为）', () => {
    const block = paragraphBlockOf(NodeType.HEADING_1, '一、总体要求。具体内容。')
    expect(block.runs.map((r) => r.role)).toEqual(['heading1', 'body'])
    expect(block.runs[0].text).toBe('一、总体要求。')
    expect(block.runs[1].text).toBe('具体内容。')
  })

  it('二级标题：句号在末尾不拆分（单 run）', () => {
    const block = paragraphBlockOf(NodeType.HEADING_2, '（一）指导思想。')
    expect(block.runs).toHaveLength(1)
  })

  it('三级标题：序号句点拆分（待办-0001 导出现状：句点用正文字体）', () => {
    const block = paragraphBlockOf(NodeType.HEADING_3, '1.加强组织领导。')
    expect(block.runs.map((r) => r.text)).toEqual(['1', '.', '加强组织领导。'])
    expect(block.runs[1].role).toBe('bodyPunct')
  })

  it('三级标题（全角句点序号）：与半角同法拆分（待办-0004 对齐后）', () => {
    const block = paragraphBlockOf(NodeType.HEADING_3, '1．加强组织领导。')
    expect(block.runs.map((r) => r.text)).toEqual(['1', '．', '加强组织领导。'])
    expect(block.runs[1].role).toBe('bodyPunct')
  })

  it('三级标题含句号：首句序号拆分 + 剩余时间冒号拆分', () => {
    const block = paragraphBlockOf(NodeType.HEADING_3, '1.开会时间。9:00开始。')
    expect(block.runs.map((r) => r.text)).toEqual(['1', '.', '开会时间。', '9', ':', '00', '开始。'])
  })

  it('正文时间冒号序列（原 splitTimeColonText 行为）', () => {
    const block = paragraphBlockOf(NodeType.PARAGRAPH, '会议时间为9:00至11:30。')
    expect(block.runs.map((r) => r.text)).toEqual([
      '会议时间为', '9', ':', '00', '至', '11', ':', '30', '。',
    ])
  })

  it('多附件首行：「附件：」+ 序号句点拆分 4 run；后续行 3 run', () => {
    const blocks = attachmentBlocksOf(
      [
        { index: 1, name: '办法' },
        { index: 2, name: '清单' },
      ],
      true
    )
    expect(blocks[0].runs.map((r) => r.text)).toEqual(['附件：', '1', '.', '办法'])
    expect(blocks[1].runs.map((r) => r.text)).toEqual(['2', '.', '清单'])
  })
})
