/**
 * AI 服务配置运行时覆盖契约测试
 * 三方契约共引：gongwen-docker/docker-entrypoint.d/40-runtime-config.sh（生成端）、
 * src/services/aiServiceConfig.ts（读取端）、本测试（行为锁定）。
 * vitest 环境下 import.meta.env.DEV=true，走 DEV 编译默认组（外网 DeepSeek）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getAIServiceConfig, isAIServiceConfigured } from '../aiServiceConfig'

/** 运行时覆盖全局名（与生成脚本/前端读取端共引） */
const RUNTIME_CONFIG_GLOBAL = '__GONGWEN_RUNTIME_CONFIG__'

/** 备份并清掉全局上的覆盖帧，测试间互不污染 */
let savedHolder: Record<string, unknown> | null = null

beforeEach(function () {
  const holder = globalThis as unknown as Record<string, unknown>
  if (holder[RUNTIME_CONFIG_GLOBAL] !== undefined) {
    savedHolder = {}
    savedHolder[RUNTIME_CONFIG_GLOBAL] = holder[RUNTIME_CONFIG_GLOBAL]
    delete holder[RUNTIME_CONFIG_GLOBAL]
  }
})

afterEach(function () {
  const holder = globalThis as unknown as Record<string, unknown>
  delete holder[RUNTIME_CONFIG_GLOBAL]
  if (savedHolder !== null) {
    holder[RUNTIME_CONFIG_GLOBAL] = savedHolder[RUNTIME_CONFIG_GLOBAL]
    savedHolder = null
  }
})

describe('运行时覆盖三态', function () {
  it('缺席全局＝走编译默认组（vitest 下为 DEV 组）', function () {
    const config = getAIServiceConfig()
    expect(config).not.toBeNull()
    if (config === null) return
    expect(config.baseUrl).toBe('/llm/v1/chat/completions')
    expect(config.model).toBe('deepseek-reasoner')
    expect(config.apiKey).toBe('')
    expect(isAIServiceConfigured()).toBe(true)
  })

  it('全量覆盖＝逐字段生效（数字以字符串形式写入也能解析）', function () {
    const holder = globalThis as unknown as Record<string, unknown>
    holder[RUNTIME_CONFIG_GLOBAL] = {
      baseUrl: 'http://proxy.example.com',
      model: 'Qwen3.6-35B',
      apiKey: 'sk-test',
      temperature: '0.5',
      maxTokens: '8192',
      topP: '0.9',
      topK: '15',
      minP: '0.1',
      presencePenalty: '1.2',
      repetitionPenalty: '1.05',
    }
    const config = getAIServiceConfig()
    expect(config).not.toBeNull()
    if (config === null) return
    // baseUrl 自动补全 /v1/chat/completions 路径
    expect(config.baseUrl).toBe('http://proxy.example.com/v1/chat/completions')
    expect(config.model).toBe('Qwen3.6-35B')
    expect(config.apiKey).toBe('sk-test')
    expect(config.temperature).toBe(0.5)
    expect(config.maxTokens).toBe(8192)
    expect(config.topP).toBe(0.9)
    expect(config.topK).toBe(15)
    expect(config.minP).toBe(0.1)
    expect(config.presencePenalty).toBe(1.2)
    expect(config.repetitionPenalty).toBe(1.05)
  })

  it('AI_ENABLED=false（entrypoint 生成的字面 boolean）＝整体禁用返回 null', function () {
    const holder = globalThis as unknown as Record<string, unknown>
    holder[RUNTIME_CONFIG_GLOBAL] = { enabled: false, model: 'Qwen3.6-35B' }
    expect(getAIServiceConfig()).toBeNull()
    expect(isAIServiceConfigured()).toBe(false)
  })

  it('坏值逐字段忽略回落编译默认（非对象、非数字字符串、空串）', function () {
    const holder = globalThis as unknown as Record<string, unknown>
    holder[RUNTIME_CONFIG_GLOBAL] = {
      model: '  ',
      apiKey: 'sk-keep',
      temperature: 'not-a-number',
      maxTokens: 'abc',
      topP: 0.8,
    }
    const config = getAIServiceConfig()
    expect(config).not.toBeNull()
    if (config === null) return
    // 空串/坏数字回落默认，数字字面量与有效字符串生效
    expect(config.model).toBe('deepseek-reasoner')
    expect(config.apiKey).toBe('sk-keep')
    expect(config.temperature).toBe(0.7)
    expect(config.maxTokens).toBe(65536)
    expect(config.topP).toBe(0.8)
  })

  it('非对象全局（脚本损坏等极端情况）＝no-op 回落编译默认', function () {
    const holder = globalThis as unknown as Record<string, unknown>
    holder[RUNTIME_CONFIG_GLOBAL] = 'broken'
    const config = getAIServiceConfig()
    expect(config).not.toBeNull()
    if (config === null) return
    expect(config.model).toBe('deepseek-reasoner')
  })
})
