/**
 * 公文格式配置类型定义
 * 包含所有可自定义的排版参数、默认值、选项常量和单位转换工具函数
 */

// ---- 配置接口 ----

/** 页面边距 (cm) */
export interface MarginsConfig {
  top: number
  bottom: number
  left: number
  right: number
}

/** 标题格式 */
export interface TitleConfig {
  fontFamily: string
  fontSize: number    // pt
  lineSpacing: number // 磅 (固定行距)
}

/** 单个字体元素配置（中文字体/英数字体/字号——「标题字体」区每级一组三控件） */
export interface FontElementConfig {
  fontFamily: string      // 中文字体
  asciiFontFamily: string // 英数字体（空串＝跟随中文字体）
  fontSize: number        // pt
}

/**
 * 标题字体（单一真值）
 * 单元6 配置双轨合并（task-0001 条款6 / 裁定 §三）：旧 headings.h1/h2
 * （仅中文字体+字号）与旧 advanced.h1/h2（含英文字体）收敛为本结构，
 * 并吸收旧 advanced 的 h3/addressee 扩展字段——预览与导出消费同一份数据
 */
export interface HeadingsConfig {
  h1: FontElementConfig
  h2: FontElementConfig
  h3: FontElementConfig
  /** 主送机关字体（原高级设置扩展字段，并入同区） */
  addressee: FontElementConfig
}

/** 正文格式 */
export interface BodyConfig {
  fontFamily: string
  fontSize: number      // pt
  lineSpacing: number   // 磅 (固定行距)
  firstLineIndent: number // 字符数
}

/** 表格格式 (预留) */
export interface TableConfig {
  fontFamily: string
  fontSize: number      // pt
  lineSpacing: number   // 磅
  boldHeader: boolean
}

/** 特殊选项 */
export interface SpecialOptionsConfig {
  showPageNumber: boolean
  pageNumberFont: string
  /**
   * 是否加盖印章
   * - true: 成文日期右空四字 (GB/T 9704 7.3.5.1 加盖印章的公文)
   * - false: 成文日期右空二字 (GB/T 9704 7.3.5.2 不加盖印章的公文)
   */
  hasStamp: boolean
}

/** 版头配置 */
export interface HeaderConfig {
  enabled: boolean
  /** 发文机关标志（红色大字居中） */
  orgName: string
  /** 发文字号，如"国办发〔2024〕1号" */
  docNumber: string
  /** 签发人（上行文使用，为空则不显示） */
  signer: string
}

/** 版记配置 */
export interface FooterNoteConfig {
  enabled: boolean
  /** 抄送机关 */
  cc: string
  /** 印发机关 */
  printer: string
  /** 印发日期，如"2024年1月1日" */
  printDate: string
}

/** 完整文档配置 */
export interface DocumentConfig {
  margins: MarginsConfig
  title: TitleConfig
  headings: HeadingsConfig
  body: BodyConfig
  table: TableConfig
  specialOptions: SpecialOptionsConfig
  header: HeaderConfig
  footerNote: FooterNoteConfig
}

/** 深层 Partial 类型，用于 patch 更新 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

// ---- 多配置存储类型 ----

/** 保存的配置项 */
export interface SavedConfig {
  id: string
  name: string
  config: DocumentConfig
  createdAt: number
}

/** localStorage 存储结构 */
export interface ConfigStorage {
  activeConfigId: string | null
  savedConfigs: SavedConfig[]
  // 注：旧版曾在此持久化 aiProofreadConfig 死字段（工作单元-8 已删，
  // AI 配置实际走独立键 ai-proofread-config）；旧值中残留的该字段被安全忽略
}

// ---- 旧配置迁移（单元6：配置双轨合并，task-0001 条款6 / 裁定 §三） ----

/** localStorage 主键（迁移前后保持不变——读时就地升级） */
export const CONFIG_STORAGE_KEY = 'docx-document-config-v2'

/** 迁移备份键前缀（完整键＝前缀 + Date.now() 时间戳） */
export const CONFIG_BACKUP_KEY_PREFIX = 'docx-document-config-v2.backup-'

/** 键值存储接口（与 localStorage 同形——供单测注入内存替身） */
export interface ConfigKVStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 旧版 headings 元素结构（迁移输入视角：仅中文字体+字号） */
interface LegacyHeadingsElement {
  fontFamily?: string
  fontSize?: number
}

/** 旧版 advanced 元素结构（迁移输入视角：字段最全——两轨冲突时以此为准） */
interface LegacyAdvancedElement {
  fontFamily?: string
  asciiFontFamily?: string
  fontSize?: number
}

/**
 * 迁移单个文档配置：双轨合并为单一 headings 真值
 * - 两轨冲突以 advanced 为准（字段最全、驱动导出——裁定 §三）
 * - advanced 缺字段时按 headings → 默认值 逐级回退（旧 headings 无
 *   英文字体槽，回退默认 Times New Roman）
 * - asciiFontFamily 空串（「跟随中文字体」选项）原样保留，不视为缺失
 * - 删除旧 advanced 键；其余字段原样保留；脏输入回退完整默认配置
 */
export function migrateDocumentConfig(config: unknown): DocumentConfig {
  const record: Record<string, unknown> =
    config !== null && typeof config === 'object'
      ? (config as Record<string, unknown>)
      : {}
  const legacyAdvanced: Record<string, LegacyAdvancedElement | undefined> =
    record.advanced !== null && typeof record.advanced === 'object'
      ? (record.advanced as Record<string, LegacyAdvancedElement>)
      : {}
  const legacyHeadings: Record<string, LegacyHeadingsElement | undefined> =
    record.headings !== null && typeof record.headings === 'object'
      ? (record.headings as Record<string, LegacyHeadingsElement>)
      : {}

  /** 合并单个元素：advanced → headings → 默认值 逐字段回退 */
  function mergeElement(key: 'addressee' | 'h1' | 'h2' | 'h3'): FontElementConfig {
    const adv = legacyAdvanced[key]
    const head = legacyHeadings[key]
    const def = DEFAULT_CONFIG.headings[key]
    const advFont = adv && typeof adv.fontFamily === 'string' ? adv.fontFamily : undefined
    const headFont = head && typeof head.fontFamily === 'string' ? head.fontFamily : undefined
    const advAscii = adv && typeof adv.asciiFontFamily === 'string' ? adv.asciiFontFamily : undefined
    const advSize = adv && typeof adv.fontSize === 'number' ? adv.fontSize : undefined
    const headSize = head && typeof head.fontSize === 'number' ? head.fontSize : undefined
    return {
      fontFamily: advFont || headFont || def.fontFamily,
      asciiFontFamily: advAscii !== undefined ? advAscii : def.asciiFontFamily,
      fontSize: advSize !== undefined ? advSize : headSize !== undefined ? headSize : def.fontSize,
    }
  }

  const merged = {
    ...DEFAULT_CONFIG,
    ...record,
    headings: {
      addressee: mergeElement('addressee'),
      h1: mergeElement('h1'),
      h2: mergeElement('h2'),
      h3: mergeElement('h3'),
    },
  } as DocumentConfig
  delete (merged as unknown as Record<string, unknown>).advanced
  return merged
}

/**
 * 判断存储中的单个配置是否需要双轨迁移
 * 旧结构特征：含 advanced 键，或 headings 缺新结构必需的 addressee/h3/
 * asciiFontFamily 字段；已是新结构返回 false（幂等前提）
 */
function needsMigration(config: unknown): boolean {
  if (config === null || typeof config !== 'object') {
    return false
  }
  const record = config as Record<string, unknown>
  if ('advanced' in record) {
    return true
  }
  const headings = record.headings
  if (headings === null || typeof headings !== 'object') {
    return true
  }
  const h = headings as Record<string, unknown>
  const keys: ('addressee' | 'h1' | 'h2' | 'h3')[] = ['addressee', 'h1', 'h2', 'h3']
  for (const key of keys) {
    const el = h[key]
    if (el === null || typeof el !== 'object') {
      return true
    }
    if (!('asciiFontFamily' in (el as Record<string, unknown>))) {
      return true
    }
  }
  return false
}

/** 存储级迁移结果：storage＝迁移后的存储结构；migrated＝是否发生旧→新迁移 */
export interface ConfigMigrationOutcome {
  storage: ConfigStorage
  migrated: boolean
}

/**
 * 检测并迁移整份存储结构（纯函数，不触碰 localStorage）
 * - 多档 savedConfigs 逐档迁移；activeConfigId 原样保留
 * - 旧值中残留的 aiProofreadConfig 死字段被安全忽略（不保留到新结构）
 * - 无旧结构时原样返回（migrated=false，savedConfigs 逐项引用不变）
 */
export function migrateConfigStorage(parsed: unknown): ConfigMigrationOutcome {
  const empty: ConfigStorage = { activeConfigId: null, savedConfigs: [] }
  if (parsed === null || typeof parsed !== 'object') {
    return { storage: empty, migrated: false }
  }
  const record = parsed as Record<string, unknown>
  const rawSavedConfigs = Array.isArray(record.savedConfigs) ? record.savedConfigs : []
  let migrated = false
  const savedConfigs: SavedConfig[] = rawSavedConfigs.map(function (item) {
    const sc = item as Record<string, unknown>
    if (sc !== null && typeof sc === 'object' && needsMigration(sc.config)) {
      migrated = true
      return { ...sc, config: migrateDocumentConfig(sc.config) } as SavedConfig
    }
    return item as SavedConfig
  })
  const storage: ConfigStorage = {
    activeConfigId: (record.activeConfigId as string) || null,
    savedConfigs: savedConfigs,
  }
  return { storage: storage, migrated: migrated }
}

/**
 * 读取主键并按需迁移（含备份与回写——调用方传入 localStorage 或测试替身）
 * - 检测到旧双轨结构：先将原始字符串原样备份至
 *   docx-document-config-v2.backup-<时间戳> 键（回滚＝清空主键、恢复备份键），
 *   再把迁移后的新结构立即写回主键（立即回写保证迁移幂等——重复调用
 *   不再触发迁移、不叠加备份）
 * - 主键缺失/解析失败：返回空存储（与旧版 loadStorage 容错行为一致）
 */
export function loadMigratedConfigStorage(store: ConfigKVStore): ConfigStorage {
  // getItem 可能抛异常（如浏览器禁用 localStorage）——与 JSON 解析失败同等容错
  let raw: string | null
  try {
    raw = store.getItem(CONFIG_STORAGE_KEY)
  } catch {
    return { activeConfigId: null, savedConfigs: [] }
  }
  if (!raw) {
    return { activeConfigId: null, savedConfigs: [] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { activeConfigId: null, savedConfigs: [] }
  }
  const outcome = migrateConfigStorage(parsed)
  if (outcome.migrated) {
    store.setItem(CONFIG_BACKUP_KEY_PREFIX + String(Date.now()), raw)
    store.setItem(CONFIG_STORAGE_KEY, JSON.stringify(outcome.storage))
  }
  return outcome.storage
}

// ---- 默认值 (GB/T 9704 国标) ----

export const DEFAULT_CONFIG: DocumentConfig = {
  margins: {
    top: 3.458,
    bottom: 3.258,
    left: 2.8,
    right: 2.6,
  },
  title: {
    fontFamily: '方正小标宋_GBK',
    fontSize: 22,
    lineSpacing: 29.6,
  },
  headings: {
    addressee: { fontFamily: '仿宋_GB2312', asciiFontFamily: 'Times New Roman', fontSize: 16 },
    h1: { fontFamily: '黑体', asciiFontFamily: 'Times New Roman', fontSize: 16 },
    h2: { fontFamily: '楷体_GB2312', asciiFontFamily: 'Times New Roman', fontSize: 16 },
    h3: { fontFamily: '仿宋_GB2312', asciiFontFamily: 'Times New Roman', fontSize: 16 },
  },
  body: {
    fontFamily: '仿宋_GB2312',
    fontSize: 16,
    lineSpacing: 29.6,
    firstLineIndent: 2,
  },
  table: {
    fontFamily: '仿宋_GB2312',
    fontSize: 12,
    lineSpacing: 22,
    boldHeader: true,
  },
  specialOptions: {
    showPageNumber: true,
    pageNumberFont: '宋体',
    hasStamp: false,
  },
  header: {
    enabled: false,
    orgName: '',
    docNumber: '',
    signer: '',
  },
  footerNote: {
    enabled: false,
    cc: '',
    printer: '',
    printDate: '',
  },
}

// ---- 下拉选项常量 ----

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: '方正小标宋_GBK', value: '方正小标宋_GBK' },
  { label: '方正小标宋简体', value: '方正小标宋简体' },
  { label: '仿宋_GB2312', value: '仿宋_GB2312' },
  { label: '仿宋', value: '仿宋' },
  { label: '黑体', value: '黑体' },
  { label: '楷体_GB2312', value: '楷体_GB2312' },
  { label: '楷体', value: '楷体' },
  { label: '宋体', value: '宋体' },
  { label: '华文中宋', value: '华文中宋' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Arial', value: 'Arial' },
]

export const ASCII_FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Calibri', value: 'Calibri' },
  { label: '（跟随中文字体）', value: '' },
]

export const FONT_SIZE_OPTIONS: { label: string; value: number }[] = [
  { label: '小四 (12pt)', value: 12 },
  { label: '四号 (14pt)', value: 14 },
  { label: '小三 (15pt)', value: 15 },
  { label: '三号 (16pt)', value: 16 },
  { label: '小二 (18pt)', value: 18 },
  { label: '二号 (22pt)', value: 22 },
  { label: '小一 (24pt)', value: 24 },
  { label: '一号 (26pt)', value: 26 },
]

export const LINE_SPACING_OPTIONS: { label: string; value: number }[] = [
  { label: '22磅', value: 22 },
  { label: '24磅', value: 24 },
  { label: '26磅', value: 26 },
  { label: '28磅', value: 28 },
  { label: '29磅', value: 29 },
  { label: '29.6磅', value: 29.6 },
  { label: '30磅', value: 30 },
  { label: '32磅', value: 32 },
]

export const INDENT_OPTIONS: { label: string; value: number }[] = [
  { label: '无缩进', value: 0 },
  { label: '1字符', value: 1 },
  { label: '2字符', value: 2 },
  { label: '3字符', value: 3 },
]

// ---- 版式常量 (GB/T 9704) ----

/** 每行字数 */
export const CHARS_PER_LINE = 28

// ---- 单位转换工具函数 ----

/** 厘米 → twip (1cm = 567 twip) */
export function cmToTwip(cm: number): number {
  return Math.round(cm * 567)
}

/** 磅 → half-point (1pt = 2 half-point) */
export function ptToHalfPoint(pt: number): number {
  return pt * 2
}

/** 磅 → twip (1pt = 20 twip) */
export function ptToTwip(pt: number): number {
  return pt * 20
}

/** 厘米 → 占 A4 页面百分比 (宽 210mm, 高 297mm) */
export function cmToPagePercent(cm: number, axis: 'x' | 'y'): number {
  const totalMm = axis === 'x' ? 210 : 297
  return (cm * 10) / totalMm * 100
}
