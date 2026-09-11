import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CONFIG,
  CONFIG_STORAGE_KEY,
  CONFIG_BACKUP_KEY_PREFIX,
  migrateDocumentConfig,
  migrateConfigStorage,
  loadMigratedConfigStorage,
  type ConfigKVStore,
} from '../documentConfig'

/**
 * 配置双轨合并迁移测试（task-0001 条款6 / 裁定 §三，工作单元-6）
 *
 * 锁定面：
 * - 旧双轨结构（headings.h1/h2 + advanced.*）→ 单一 headings 真值
 *   （h1/h2/h3/addressee × 中文字体/英数字体/字号）
 * - 两轨冲突以 advanced 为准（字段最全、驱动导出）
 * - 多档 savedConfigs 各自迁移；activeConfigId 原样保留
 * - 旧值中的 aiProofreadConfig 死字段被安全忽略（工作单元-8 删除
 *   Context 死路径后，AI 配置实际走独立键 ai-proofread-config）
 * - 迁移前旧结构原样备份至 docx-document-config-v2.backup-<时间戳> 键
 *   （回滚＝清空主键、恢复备份键——见文末回滚演练用例）
 * - 主键 docx-document-config-v2 前后保持不变（就地升级）
 */

// ---- 测试辅助 ----

/** 内存版键值存储替身（与 localStorage 同形，供副作用单测注入） */
function memoryStore(initial?: Record<string, string>): ConfigKVStore & { data: Record<string, string> } {
  const data: Record<string, string> = initial ? { ...initial } : {}
  return {
    data: data,
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null
    },
    setItem(key: string, value: string): void {
      data[key] = value
    },
  }
}

/** 深拷贝 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** 构造一份旧版双轨结构配置（两轨默认值等值形态＝旧版 DEFAULT_CONFIG 存储后形态） */
function legacyDualTrackConfig(): Record<string, unknown> {
  const base = clone(DEFAULT_CONFIG) as unknown as Record<string, unknown>
  base.headings = {
    h1: { fontFamily: '黑体', fontSize: 16 },
    h2: { fontFamily: '楷体_GB2312', fontSize: 16 },
  }
  base.advanced = {
    addressee: { fontFamily: '仿宋_GB2312', asciiFontFamily: 'Times New Roman', fontSize: 16 },
    h1: { fontFamily: '黑体', asciiFontFamily: 'Times New Roman', fontSize: 16 },
    h2: { fontFamily: '楷体_GB2312', asciiFontFamily: 'Times New Roman', fontSize: 16 },
    h3: { fontFamily: '仿宋_GB2312', asciiFontFamily: 'Times New Roman', fontSize: 16 },
  }
  return base
}

/** 构造一份两轨冲突的旧配置（headings 侧与 advanced 侧取不同值） */
function legacyConflictConfig(): Record<string, unknown> {
  const base = legacyDualTrackConfig()
  const headings = base.headings as Record<string, { fontFamily: string; fontSize: number }>
  headings.h1 = { fontFamily: '宋体', fontSize: 22 }
  headings.h2 = { fontFamily: '黑体', fontSize: 18 }
  return base
}

/** 断言对象拥有完整新结构 headings（四元素 × 三字段） */
function expectNewHeadingsShape(headings: unknown): void {
  expect(headings).toEqual({
    addressee: { fontFamily: '仿宋_GB2312', asciiFontFamily: 'Times New Roman', fontSize: 16 },
    h1: { fontFamily: '黑体', asciiFontFamily: 'Times New Roman', fontSize: 16 },
    h2: { fontFamily: '楷体_GB2312', asciiFontFamily: 'Times New Roman', fontSize: 16 },
    h3: { fontFamily: '仿宋_GB2312', asciiFontFamily: 'Times New Roman', fontSize: 16 },
  })
}

// ---- DEFAULT_CONFIG 结构锁定（单一真值） ----

describe('DEFAULT_CONFIG 单一真值结构', () => {
  it('无 advanced 键，headings 含 h1/h2/h3/addressee 四元素', () => {
    expect(Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, 'advanced')).toBe(false)
    expect(Object.keys(DEFAULT_CONFIG.headings).sort()).toEqual(
      ['addressee', 'h1', 'h2', 'h3']
    )
  })

  it('默认值与旧两轨默认等值（默认配置行为零变化的前提）', () => {
    expectNewHeadingsShape(DEFAULT_CONFIG.headings)
  })
})

// ---- migrateDocumentConfig（单配置纯函数） ----

describe('migrateDocumentConfig 单配置迁移', () => {
  it('默认等值双轨：合并为单一 headings 真值，advanced 键消失，其余字段原样保留', () => {
    const legacy = legacyDualTrackConfig()
    const result = migrateDocumentConfig(legacy) as unknown as Record<string, unknown>
    expectNewHeadingsShape(result.headings)
    expect(Object.prototype.hasOwnProperty.call(result, 'advanced')).toBe(false)
    // 其余字段原样保留（边距/标题/正文等不受迁移影响）
    expect(result.margins).toEqual(legacy.margins)
    expect(result.title).toEqual(legacy.title)
    expect(result.body).toEqual(legacy.body)
    expect(result.specialOptions).toEqual(legacy.specialOptions)
  })

  it('两轨冲突以 advanced 为准（裁定 §三：字段最全、驱动导出）', () => {
    const legacy = legacyConflictConfig()
    const result = migrateDocumentConfig(legacy) as unknown as {
      headings: Record<string, { fontFamily: string; asciiFontFamily: string; fontSize: number }>
    }
    // h1：headings 侧为 宋体/22，advanced 侧为 黑体/16 —— 三字段全取 advanced
    expect(result.headings.h1).toEqual({
      fontFamily: '黑体',
      asciiFontFamily: 'Times New Roman',
      fontSize: 16,
    })
    expect(result.headings.h2.fontFamily).toBe('楷体_GB2312')
    expect(result.headings.h2.fontSize).toBe(16)
  })

  it('advanced 缺席的更旧结构：h1/h2 取 headings 值，asciiFontFamily 回退默认，h3/addressee 取默认', () => {
    const legacy = legacyDualTrackConfig()
    delete (legacy as Record<string, unknown>).advanced
    const headings = legacy.headings as Record<string, { fontFamily: string; fontSize: number }>
    headings.h1 = { fontFamily: '宋体', fontSize: 22 }
    const result = migrateDocumentConfig(legacy) as unknown as {
      headings: Record<string, { fontFamily: string; asciiFontFamily: string; fontSize: number }>
    }
    expect(result.headings.h1).toEqual({
      fontFamily: '宋体',
      asciiFontFamily: 'Times New Roman',
      fontSize: 22,
    })
    expect(result.headings.h2).toEqual({
      fontFamily: '楷体_GB2312',
      asciiFontFamily: 'Times New Roman',
      fontSize: 16,
    })
    expect(result.headings.h3.fontFamily).toBe('仿宋_GB2312')
    expect(result.headings.addressee.fontFamily).toBe('仿宋_GB2312')
  })

  it('asciiFontFamily 空串（「跟随中文字体」选项）迁移中保留，不误回退默认', () => {
    const legacy = legacyDualTrackConfig()
    const advanced = (legacy as Record<string, { h1: Record<string, unknown> }>).advanced
    advanced.h1.asciiFontFamily = ''
    const result = migrateDocumentConfig(legacy) as unknown as {
      headings: Record<string, { asciiFontFamily: string }>
    }
    expect(result.headings.h1.asciiFontFamily).toBe('')
  })

  it('已是新结构的配置原样返回（幂等前提）', () => {
    const fresh = clone(DEFAULT_CONFIG) as unknown
    expect(migrateDocumentConfig(fresh)).toEqual(fresh)
  })

  it('非对象输入回退完整默认配置（脏数据容错）', () => {
    expect(migrateDocumentConfig(42)).toEqual(DEFAULT_CONFIG)
    expect(migrateDocumentConfig(null)).toEqual(DEFAULT_CONFIG)
    expect(migrateDocumentConfig('junk')).toEqual(DEFAULT_CONFIG)
  })
})

// ---- migrateConfigStorage（存储级纯函数） ----

describe('migrateConfigStorage 存储级迁移', () => {
  it('多档 savedConfigs 各自迁移；activeConfigId 原样保留；旧值 aiProofreadConfig 死字段被安全忽略', () => {
    const aiSentinel = { baseUrl: 'http://sentinel' }
    const parsed = {
      activeConfigId: 'cfg-b',
      aiProofreadConfig: aiSentinel,
      savedConfigs: [
        { id: 'cfg-a', name: '冲突档', createdAt: 1, config: legacyConflictConfig() },
        { id: 'cfg-b', name: '默认等值档', createdAt: 2, config: legacyDualTrackConfig() },
        { id: 'cfg-c', name: '已新结构档', createdAt: 3, config: clone(DEFAULT_CONFIG) },
      ],
    }
    const outcome = migrateConfigStorage(parsed)
    expect(outcome.migrated).toBe(true)
    expect(outcome.storage.activeConfigId).toBe('cfg-b')
    expect((outcome.storage as unknown as Record<string, unknown>).aiProofreadConfig).toBeUndefined()
    expect(outcome.storage.savedConfigs).toHaveLength(3)
    // 各档独立迁移：冲突档 h1 取 advanced，默认等值档取等值，新结构档原样
    const configs = outcome.storage.savedConfigs.map(function (sc) {
      return sc.config as unknown as Record<string, unknown>
    })
    expect((configs[0].headings as Record<string, { fontFamily: string }>).h1.fontFamily).toBe('黑体')
    expectNewHeadingsShape(configs[1].headings)
    expect(configs[2]).toEqual(clone(DEFAULT_CONFIG) as unknown as Record<string, unknown>)
    // 档案元数据保留
    expect(outcome.storage.savedConfigs[0].name).toBe('冲突档')
    expect(outcome.storage.savedConfigs[0].createdAt).toBe(1)
  })

  it('新结构存储不迁移（migrated=false，savedConfigs 逐项引用原样）', () => {
    const freshSaved = [{ id: 'cfg-x', name: '新档', createdAt: 9, config: clone(DEFAULT_CONFIG) }]
    const parsed = { activeConfigId: 'cfg-x', savedConfigs: freshSaved }
    const outcome = migrateConfigStorage(parsed)
    expect(outcome.migrated).toBe(false)
    expect(outcome.storage.savedConfigs[0]).toBe(freshSaved[0])
  })

  it('非对象/异常输入：返回空存储且不迁移（与旧版 loadStorage 容错一致）', () => {
    expect(migrateConfigStorage(null)).toEqual({
      storage: { activeConfigId: null, savedConfigs: [] },
      migrated: false,
    })
    expect(migrateConfigStorage('junk')).toEqual({
      storage: { activeConfigId: null, savedConfigs: [] },
      migrated: false,
    })
    expect(migrateConfigStorage({ savedConfigs: '不是数组' })).toEqual({
      storage: { activeConfigId: null, savedConfigs: [] },
      migrated: false,
    })
  })
})

// ---- loadMigratedConfigStorage（备份＋回写副作用，内存替身） ----

describe('loadMigratedConfigStorage 读取迁移（含备份）', () => {
  /** 构造含旧结构的完整主键内容 */
  function legacyRaw(): string {
    return JSON.stringify({
      activeConfigId: 'cfg-a',
      aiProofreadConfig: { baseUrl: 'http://sentinel' },
      savedConfigs: [
        { id: 'cfg-a', name: '旧档', createdAt: 1, config: legacyConflictConfig() },
      ],
    })
  }

  it('旧结构：旧内容原样备份至 backup-<时间戳> 键，新结构立即回写主键', () => {
    const raw = legacyRaw()
    const store = memoryStore()
    store.setItem(CONFIG_STORAGE_KEY, raw)

    const storage = loadMigratedConfigStorage(store)

    // 备份键：恰一个，键名＝前缀＋纯数字时间戳，值＝旧 raw 原样（逐字节）
    const backupKeys = Object.keys(store.data).filter(function (k) {
      return k !== CONFIG_STORAGE_KEY
    })
    expect(backupKeys).toHaveLength(1)
    expect(backupKeys[0]).toMatch(new RegExp('^' + CONFIG_BACKUP_KEY_PREFIX + '\\d+$'))
    expect(store.data[backupKeys[0]]).toBe(raw)

    // 主键：已回写新结构（advanced 消失、headings 完整、冲突以 advanced 为准）
    const rewritten = JSON.parse(store.data[CONFIG_STORAGE_KEY])
    const migrated = rewritten.savedConfigs[0].config
    expect(Object.prototype.hasOwnProperty.call(migrated, 'advanced')).toBe(false)
    expect(migrated.headings.h1.fontFamily).toBe('黑体')
    expect(migrated.headings.h1.fontSize).toBe(16)

    // 返回值与回写内容一致
    expect(storage.activeConfigId).toBe('cfg-a')
    expect(storage.savedConfigs[0].config.headings.h1.fontFamily).toBe('黑体')
  })

  it('幂等：对已迁移主键再次调用不产生新备份、主键内容不变', () => {
    const store = memoryStore()
    store.setItem(CONFIG_STORAGE_KEY, legacyRaw())
    loadMigratedConfigStorage(store)
    const afterFirst = store.data[CONFIG_STORAGE_KEY]
    const backupCountAfterFirst = Object.keys(store.data).filter(function (k) {
      return k !== CONFIG_STORAGE_KEY
    }).length

    loadMigratedConfigStorage(store)

    expect(store.data[CONFIG_STORAGE_KEY]).toBe(afterFirst)
    const backupCountAfterSecond = Object.keys(store.data).filter(function (k) {
      return k !== CONFIG_STORAGE_KEY
    }).length
    expect(backupCountAfterSecond).toBe(backupCountAfterFirst)
  })

  it('新结构主键：直接读取，无备份产生', () => {
    const freshRaw = JSON.stringify({
      activeConfigId: null,
      savedConfigs: [{ id: 'cfg-x', name: '新档', createdAt: 9, config: clone(DEFAULT_CONFIG) }],
    })
    const store = memoryStore()
    store.setItem(CONFIG_STORAGE_KEY, freshRaw)
    const storage = loadMigratedConfigStorage(store)
    expect(storage.savedConfigs[0].name).toBe('新档')
    expect(Object.keys(store.data)).toEqual([CONFIG_STORAGE_KEY])
  })

  it('主键缺失/坏 JSON：返回空存储（旧版 loadStorage 行为保持）', () => {
    expect(loadMigratedConfigStorage(memoryStore())).toEqual({
      activeConfigId: null,
      savedConfigs: [],
    })
    const broken = memoryStore()
    broken.setItem(CONFIG_STORAGE_KEY, '不是 JSON{{{')
    expect(loadMigratedConfigStorage(broken)).toEqual({
      activeConfigId: null,
      savedConfigs: [],
    })
  })

  it('getItem 抛异常（如 localStorage 被禁用）：返回空存储不崩溃（复核观察2）', () => {
    const throwing: ConfigKVStore = {
      getItem(): string | null {
        throw new Error('localStorage disabled')
      },
      setItem(): void {
        // 不会到达
      },
    }
    expect(loadMigratedConfigStorage(throwing)).toEqual({
      activeConfigId: null,
      savedConfigs: [],
    })
  })

  it('回滚路径演练：清空主键→恢复备份键内容→得到可读的旧结构原貌', () => {
    const raw = legacyRaw()
    const store = memoryStore()
    store.setItem(CONFIG_STORAGE_KEY, raw)
    loadMigratedConfigStorage(store)

    // 回滚操作一：清空新键（移除主键）
    delete store.data[CONFIG_STORAGE_KEY]
    // 回滚操作二：恢复备份键内容到主键
    const backupKey = Object.keys(store.data).find(function (k) {
      return k.indexOf(CONFIG_BACKUP_KEY_PREFIX) === 0
    })
    expect(backupKey).toBeTruthy()
    store.setItem(CONFIG_STORAGE_KEY, store.data[backupKey as string])

    // 恢复后的主键＝旧结构原貌（advanced 在、旧 headings 形态在——旧版代码可读）
    const restored = JSON.parse(store.data[CONFIG_STORAGE_KEY])
    const config = restored.savedConfigs[0].config
    expect(Object.prototype.hasOwnProperty.call(config, 'advanced')).toBe(true)
    expect(config.headings.h1).toEqual({ fontFamily: '宋体', fontSize: 22 })
  })
})

// ---- aiProofreadConfig 死路径删除的持久化兼容（工作单元-8，条款7） ----

describe('aiProofreadConfig 死路径删除的持久化兼容', () => {
  /** 旧双轨主键原文（内含 aiProofreadConfig 死字段残留） */
  function legacyRawWithAIDeadField(): string {
    return JSON.stringify({
      activeConfigId: 'cfg-a',
      aiProofreadConfig: { baseUrl: 'http://sentinel' },
      savedConfigs: [
        { id: 'cfg-a', name: '旧档', createdAt: 1, config: legacyConflictConfig() },
      ],
    })
  }

  it('旧双轨主键含 aiProofreadConfig 字段：迁移照常发生，回写内容不再含该死字段，配置读取正常', () => {
    const raw = legacyRawWithAIDeadField()
    const store = memoryStore()
    store.setItem(CONFIG_STORAGE_KEY, raw)

    const storage = loadMigratedConfigStorage(store)

    // 配置本身读取正常（迁移行为不变：冲突以 advanced 为准）
    expect(storage.activeConfigId).toBe('cfg-a')
    expect(storage.savedConfigs[0].config.headings.h1.fontFamily).toBe('黑体')
    // 回写主键不再携带死字段（旧值中的该字段被安全忽略，不报错不保留）
    const rewritten = JSON.parse(store.data[CONFIG_STORAGE_KEY])
    expect(Object.prototype.hasOwnProperty.call(rewritten, 'aiProofreadConfig')).toBe(false)
  })

  it('已是新结构但残留 aiProofreadConfig 字段的旧值：直接读取不迁移，配置无损', () => {
    // 旧版 Context 曾把 aiProofreadConfig 写入主键；新结构配置 + 残留死字段
    const raw = JSON.stringify({
      activeConfigId: 'cfg-x',
      aiProofreadConfig: { baseUrl: 'http://sentinel' },
      savedConfigs: [
        { id: 'cfg-x', name: '新档', createdAt: 9, config: clone(DEFAULT_CONFIG) },
      ],
    })
    const store = memoryStore()
    store.setItem(CONFIG_STORAGE_KEY, raw)

    const storage = loadMigratedConfigStorage(store)

    // 不触发迁移（无备份产生），配置读取正常，死字段被安全忽略
    expect(Object.keys(store.data)).toEqual([CONFIG_STORAGE_KEY])
    expect(storage.savedConfigs[0].name).toBe('新档')
    expect(storage.savedConfigs[0].config).toEqual(clone(DEFAULT_CONFIG))
    expect((storage as unknown as Record<string, unknown>).aiProofreadConfig).toBeUndefined()
  })
})
