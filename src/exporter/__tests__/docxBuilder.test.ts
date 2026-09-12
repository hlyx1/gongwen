import { describe, it, expect } from 'vitest'
import { Packer } from 'docx'
import JSZip from 'jszip'
import { buildDocument } from '../docxBuilder'
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

/**
 * buildDocument 导出产物结构快照（task-0001 条款1a）
 *
 * 快照方法（裁定 §二）：docx 库 Packer 序列化（toBuffer）→ jszip 解包
 * → 提取核心部件 word/document.xml、word/footer1.xml、word/footer2.xml
 * 的 XML 字符串做结构快照。docProps/core.xml 含时间戳（不稳定），不入快照。
 *
 * 【单元4（docx 渲染器退化）重构前后一致性对照基线】
 * 本快照即「行为严格保持」的判卷标准：重构后对同样 AST+Config 输入，
 * 序列化产物须与快照逐字段一致。任何快照变更都意味着导出行为改变，
 * 须走新裁定后由技术负责人确认方可更新。
 *
 * 场景覆盖（条款1a 要求）：全节点类型样例公文、版头开/关、版记开/关、
 * 奇偶页码、印章有无、单/多附件、含表格、无标题边界。
 *
 * 序列化特征：docx 库将非整数 twip 值截断为整数后写入 XML
 * （如署名缩进 1417.5 → w:right="1417"），断言按整数串书写。
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

/** 统计子串出现次数 */
function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/** 序列化 docx Document 并解包核心部件 */
async function packParts(ast: GongwenAST, config: DocumentConfig) {
  const buffer = await Packer.toBuffer(buildDocument(ast, config))
  const zip = await JSZip.loadAsync(buffer)
  const files = Object.keys(zip.files)
  const read = async (name: string): Promise<string> => {
    const entry = zip.file(name)
    return entry ? await entry.async('string') : ''
  }
  return {
    files,
    document: await read('word/document.xml'),
    footerOdd: await read('word/footer1.xml'),
    footerEven: await read('word/footer2.xml'),
    settings: await read('word/settings.xml'),
  }
}

/** 最小公文（标题 + 一段正文） */
const MINIMAL_AST: GongwenAST = {
  title: [makeNode(NodeType.DOCUMENT_TITLE, '测试公文标题')],
  body: [makeNode(NodeType.PARAGRAPH, '正文段落内容。')],
}

/** 全节点类型样例公文（多段标题、四级行政层级、时间冒号、表格、落款、多附件） */
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

// ---- 场景快照与断言 ----

describe('buildDocument 导出产物结构（条款1a）', () => {
  it('全节点类型样例公文（默认配置：版头关、版记关、页码开、无印章、多附件）', async () => {
    const parts = await packParts(FULL_AST, DEFAULT_CONFIG)

    // 页码开：奇偶页脚部件存在
    expect(parts.files).toContain('word/footer1.xml')
    expect(parts.files).toContain('word/footer2.xml')

    // 正文仅 1 个表格（内容表格；版头版记均关）
    expect(countOf(parts.document, '<w:tbl>')).toBe(1)

    // 落款：署名（10 字）×日期（10 字）等宽 → 右缩进基准 630；日期右空二字 630
    expect(parts.document).toContain('w:right="630"')

    // 标题两段均入文；标题字体方正小标宋
    expect(parts.document).toContain('某某市人民政府办公室')
    expect(parts.document).toContain('关于印发《公文排版管理办法》的通知')
    expect(parts.document).toContain('方正小标宋_GBK')

    // 多附件首行前缀与末项名称
    expect(parts.document).toContain('附件：')
    expect(parts.document).toContain('责任分工表')

    // 时间冒号/三级标题句点/附件句点拆分：存在 ascii=仿宋 的标点 run
    expect(parts.document).toContain('w:ascii="仿宋_GB2312"')

    expect(parts.document).toMatchSnapshot()
    expect(parts.footerOdd).toMatchSnapshot()
    expect(parts.footerEven).toMatchSnapshot()
  })

  it('版头开（含签发人）：机关标志 + 发文字号/签发人双栏表 + 红色分隔线', async () => {
    const config = configWith((c) => {
      c.header.enabled = true
      c.header.orgName = '某某市人民政府文件'
      c.header.docNumber = '某府发〔2026〕12号'
      c.header.signer = '李四'
    })
    const parts = await packParts(MINIMAL_AST, config)

    expect(parts.document).toContain('某某市人民政府文件')
    expect(parts.document).toContain('某府发〔2026〕12号')
    expect(parts.document).toContain('签发人：')
    expect(parts.document).toContain('李四')
    expect(parts.document).toContain('楷体_GB2312') // 签发人姓名字体
    expect(parts.document).toContain('w:color="E00000"') // 红色机关标志与分隔线（边框属性）
    expect(parts.document).toContain('<w:sz w:val="60"/>') // 机关标志 30pt
    expect(countOf(parts.document, '<w:tbl>')).toBe(1) // 签发人双栏表

    expect(parts.document).toMatchSnapshot()
  })

  it('版头开（无签发人）：发文字号居中，无表格无签发人', async () => {
    const config = configWith((c) => {
      c.header.enabled = true
      c.header.orgName = '某某市人民政府文件'
      c.header.docNumber = '某府发〔2026〕12号'
      c.header.signer = ''
    })
    const parts = await packParts(MINIMAL_AST, config)

    expect(parts.document).toContain('某府发〔2026〕12号')
    expect(parts.document).not.toContain('签发人')
    expect(countOf(parts.document, '<w:tbl>')).toBe(0)
    expect(parts.document).toContain('w:color="E00000"') // 红线仍在

    expect(parts.document).toMatchSnapshot()
  })

  it('版记开（抄送+印发俱全）：浮动表格 + 粗细分隔线', async () => {
    const config = configWith((c) => {
      c.footerNote.enabled = true
      c.footerNote.cc = '市委办公室，市人大常委会办公室'
      c.footerNote.printer = '某某市人民政府办公室'
      c.footerNote.printDate = '2026年9月12日'
    })
    const parts = await packParts(MINIMAL_AST, config)

    expect(parts.document).toContain('抄送：市委办公室，市人大常委会办公室')
    expect(parts.document).toContain('印发')
    expect(parts.document).toContain('某某市人民政府办公室')
    expect(parts.document).toContain('w:tblpPr') // 浮动锚定（版心底部吸附）
    expect(countOf(parts.document, '<w:tbl>')).toBe(2) // 嵌套印发行 + 浮动包装表

    expect(parts.document).toMatchSnapshot()
  })

  it('版记开（仅抄送）：无中间细线无印发行', async () => {
    const config = configWith((c) => {
      c.footerNote.enabled = true
      c.footerNote.cc = '市委办公室'
      c.footerNote.printer = ''
      c.footerNote.printDate = ''
    })
    const parts = await packParts(MINIMAL_AST, config)

    expect(parts.document).toContain('抄送：市委办公室')
    expect(parts.document).not.toContain('印发')
    expect(countOf(parts.document, '<w:tbl>')).toBe(1) // 仅浮动包装表

    expect(parts.document).toMatchSnapshot()
  })

  it('奇偶页码（开）：奇数页码居右空一字，偶数页码居左空一字', async () => {
    const parts = await packParts(MINIMAL_AST, DEFAULT_CONFIG)

    // 四号宋体 14pt → 空一字 280 twips；一字线 EM DASH
    expect(parts.footerOdd).toContain('w:right="280"')
    expect(parts.footerOdd).toContain('—')
    expect(parts.footerOdd).toContain('PAGE')
    expect(parts.footerEven).toContain('w:left="280"')
    expect(parts.footerEven).toContain('—')
    expect(parts.footerEven).toContain('PAGE')

    // settings.xml 奇偶页脚开关（0030 封网：evenAndOddHeaderAndFooters 接线，
    // 值断言形态——接线被删（元素消失）或误改（值翻转）均红）
    expect(parts.settings).toContain('<w:evenAndOddHeaders/>')

    expect(parts.footerOdd).toMatchSnapshot()
    expect(parts.footerEven).toMatchSnapshot()
  })

  it('页码关：无页脚部件，正文无页码引用', async () => {
    const config = configWith((c) => {
      c.specialOptions.showPageNumber = false
    })
    const parts = await packParts(MINIMAL_AST, config)

    const footerFiles = parts.files.filter((f) => /^word\/footer\d+\.xml$/.test(f))
    expect(footerFiles).toHaveLength(0)
    expect(parts.document).not.toContain('footerReference')
    expect(parts.document).not.toContain('PAGE')

    // settings.xml 奇偶页脚开关随页码关闭（0030 封网：docx 库恒传布尔 →
    // 元素恒存在仅取值翻转，值断言能同时捕获接线被删场景）
    expect(parts.settings).toContain('<w:evenAndOddHeaders w:val="false"/>')

    expect(parts.document).toMatchSnapshot()
  })

  it('印章有无：署名/日期右缩进在空二字与空四字基准间切换', async () => {
    const ast: GongwenAST = {
      title: [makeNode(NodeType.DOCUMENT_TITLE, '测试公文标题')],
      body: [
        makeNode(NodeType.PARAGRAPH, '正文段落内容。'),
        makeNode(NodeType.SIGNATURE, '某某市政府'), // 5 字
        makeNode(NodeType.DATE, '二零二六年九月十一日'), // 10 字
      ],
    }

    // 无印章：日期右空二字 630；署名 1417.5 → docx 序列化截断为整数 1417
    const off = await packParts(ast, DEFAULT_CONFIG)
    expect(off.document).toContain('w:right="630"')
    expect(off.document).toContain('w:right="1417"')
    expect(off.document).not.toContain('w:right="1260"')

    // 有印章：日期右空四字 1260；署名 2047.5 → 序列化为 2047
    const stamped = configWith((c) => {
      c.specialOptions.hasStamp = true
    })
    const on = await packParts(ast, stamped)
    expect(on.document).toContain('w:right="1260"')
    expect(on.document).toContain('w:right="2047"')
    expect(on.document).not.toContain('w:right="630"')

    expect(on.document).toMatchSnapshot()
  })

  it('单附件：附件：名称（无序号拆分）', async () => {
    const ast: GongwenAST = {
      title: [makeNode(NodeType.DOCUMENT_TITLE, '测试公文标题')],
      body: [
        makeNode(NodeType.PARAGRAPH, '正文段落内容。'),
        makeAttachment([{ index: 0, name: '公文排版管理办法实施细则' }], false),
      ],
    }
    const parts = await packParts(ast, DEFAULT_CONFIG)

    expect(countOf(parts.document, '附件：')).toBe(1)
    expect(parts.document).toContain('公文排版管理办法实施细则')
    expect(countOf(parts.document, '<w:tbl>')).toBe(0)

    expect(parts.document).toMatchSnapshot()
  })

  it('无标题公文：直接正文，无标题段与标题字体', async () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.PARAGRAPH, '正文段落内容。')],
    }
    const parts = await packParts(ast, DEFAULT_CONFIG)

    expect(parts.document).not.toContain('方正小标宋_GBK')
    expect(parts.document).toContain('正文段落内容。')

    expect(parts.document).toMatchSnapshot()
  })
})
