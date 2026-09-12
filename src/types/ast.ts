/** 公文 AST 节点类型 */
export enum NodeType {
  /** 公文标题（居中、小标宋 22pt） */
  DOCUMENT_TITLE = 'DOCUMENT_TITLE',
  /** 一级标题：「一、」黑体 */
  HEADING_1 = 'HEADING_1',
  /** 二级标题：「（一）」楷体 */
  HEADING_2 = 'HEADING_2',
  /** 三级标题：「1.」仿宋加粗 */
  HEADING_3 = 'HEADING_3',
  /** 四级标题：「（1）」仿宋 */
  HEADING_4 = 'HEADING_4',
  /** 正文段落 */
  PARAGRAPH = 'PARAGRAPH',
  /** 主送机关（顶格，以冒号结尾） */
  ADDRESSEE = 'ADDRESSEE',
  /** 附件说明（"附件："开头） */
  ATTACHMENT = 'ATTACHMENT',
  /** 发文机关署名（成文日期正上方，以成文日期为基准居中） */
  SIGNATURE = 'SIGNATURE',
  /** 成文日期（"XXXX年X月X日"） */
  DATE = 'DATE',
  /** 备注（成文日期后的括号内容，如"（联系人 小明 电话 10000000）"） */
  REMARK = 'REMARK',
  /** Markdown 表格 */
  TABLE = 'TABLE',
}

/** 同形状节点共享基形状（type 判别键由各联合成员具体化） */
interface DocumentNodeBase {
  content: string
  /** 原始文本中的行号（从 1 开始） */
  lineNumber: number
}

/**
 * 单个文档节点（按 type 判别的封闭联合，待办-0029）
 *
 * 11 个同形状成员（仅 type 判别值不同）＋附件/表格两个带专属字段的成员。
 * 运行时形状与封闭前完全一致（纯类型层封闭）；新增 NodeType 枚举成员时
 * 须在此联合与各 Record<NodeType, …>/穷尽 switch 同步补齐，tsc 强制报错。
 */
export type DocumentNode =
  | (DocumentNodeBase & { type: NodeType.DOCUMENT_TITLE })
  | (DocumentNodeBase & { type: NodeType.HEADING_1 })
  | (DocumentNodeBase & { type: NodeType.HEADING_2 })
  | (DocumentNodeBase & { type: NodeType.HEADING_3 })
  | (DocumentNodeBase & { type: NodeType.HEADING_4 })
  | (DocumentNodeBase & { type: NodeType.PARAGRAPH })
  | (DocumentNodeBase & { type: NodeType.ADDRESSEE })
  | (DocumentNodeBase & { type: NodeType.SIGNATURE })
  | (DocumentNodeBase & { type: NodeType.DATE })
  | (DocumentNodeBase & { type: NodeType.REMARK })
  | AttachmentNode
  | TableNode

/**
 * switch 穷尽断言辅助（纯类型层，待办-0029）
 *
 * 消费 NodeType 的 switch 穷尽全部成员后，在 default 分支调用本函数：
 * 新增枚举成员未补分支时实参不再是 never，tsc 即报错（编译期强制补分支）。
 * 函数体刻意为空——零运行时行为。
 */
export function assertNever(_value: never): void {}

/** 附件项 */
export interface AttachmentItem {
  /** 附件序号（1, 2, 3...），单附件时为 0 */
  index: number
  /** 附件名称（不含序号和点号） */
  name: string
}

/** 附件说明节点 */
export interface AttachmentNode extends DocumentNodeBase {
  type: NodeType.ATTACHMENT
  /** 是否为多附件模式 */
  isMultiple: boolean
  /** 附件列表（单附件时只有一项，index 为 0） */
  items: AttachmentItem[]
}

/** 表格单元格 */
export interface TableCell {
  content: string
}

/** 表格行 */
export interface TableRowData {
  cells: TableCell[]
}

/** 表格节点 */
export interface TableNode extends DocumentNodeBase {
  type: NodeType.TABLE
  /** 表头行 */
  header: TableRowData
  /** 数据行 */
  rows: TableRowData[]
  /** 列数 */
  columnCount: number
}

/** 完整公文 AST */
export interface GongwenAST {
  /** 公文标题数组（支持多段标题，每段一行） */
  title: DocumentNode[]
  body: DocumentNode[]
}
