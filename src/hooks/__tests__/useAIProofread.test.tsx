import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { GongwenAST, DocumentNode } from '../../types/ast'
import { NodeType } from '../../types/ast'
import { useAIProofread } from '../useAIProofread'
import type { FullProofreadConfig, UseAIProofreadReturn } from '../useAIProofread'

/**
 * useAIProofread 空文档守卫测试（task-0003 待办-0037，测试先行）
 *
 * 背景：ef2eb62 将 GongwenAST.title 数组化后本 hook 漏改——
 * `(!ast.title && !ast.body)` 对数组恒假，守卫退化为 `!ast`，
 * 空文档（title/body 均空数组）走到切句兜底、误报
 * 「未提取到可审核的句子」而非「公文内容为空」。
 *
 * 空文档口径与 parser.test.ts:60-70、Toolbar.test.tsx 同源。
 *
 * 手法（零新增依赖，同 previewStructure 惯例）：
 * - renderToStaticMarkup 渲染探针组件捕获 hook 返回值，
 *   在静态渲染之外调用 startProofread（SSR 的 setState 为无害空转）
 * - vi.stubEnv 补齐 VITE_AI_* 必填项，绕过「AI服务未配置」前置分支
 * - vi.mock sendAllBlocksStreaming，非空文档用例不触网
 */

// 锁定守卫行为，真实网络层 mock 为立即成功
vi.mock('../../services/aiProofreadService', () => ({
  sendAllBlocksStreaming: vi.fn(() => Promise.resolve()),
}))

// ---- 测试辅助 ----

/** 捕获盒：渲染期写属性（非变量重绑定，react-hooks/globals 合规） */
const captureBox: { api: UseAIProofreadReturn | null } = { api: null }

/** 探针组件：渲染时捕获 hook 返回值 */
function Probe() {
  // eslint-disable-next-line react-hooks/immutability -- 测试探针：renderToStaticMarkup 单次同步渲染、无重入，静态渲染期捕获 hook API 是 hook 测试的必要手法
  captureBox.api = useAIProofread()
  return null
}

/** 静态渲染探针并取回 hook API */
function captureHook(): UseAIProofreadReturn {
  renderToStaticMarkup(React.createElement(Probe))
  if (captureBox.api === null) {
    throw new Error('hook 捕获失败')
  }
  return captureBox.api
}

/** 构造完整校对配置 */
function makeConfig(): FullProofreadConfig {
  return {
    customCheckItems: [],
    customExampleItems: [],
    maxCharsPerRequest: 3500,
    maxConcurrentRequests: 3,
  }
}

/** 构造普通 AST 节点（as 收窄：宽松 NodeType 参数 → 判别联合） */
function makeNode(type: NodeType, content: string, lineNumber = 1): DocumentNode {
  return { type, content, lineNumber } as DocumentNode
}

// ---- 用例 ----

beforeEach(() => {
  // 补齐 AI 服务必填环境变量，使 isAIServiceConfigured() 为真
  vi.stubEnv('VITE_AI_BASE_URL', 'http://test.local')
  vi.stubEnv('VITE_AI_MODEL', 'test-model')
  vi.stubEnv('VITE_AI_API_KEY', 'test-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
  captureBox.api = null
})

describe('useAIProofread 空文档守卫（待办-0037）', () => {
  it('空文档（title/body 均空数组）报「公文内容为空」而非切句兜底文案', async () => {
    const api = captureHook()
    const emptyAst: GongwenAST = { title: [], body: [] }
    await expect(api.startProofread(emptyAst, makeConfig())).rejects.toThrow('公文内容为空')
  })

  it('ast 为 null 时仍报「公文内容为空」（既有防御路径保持）', async () => {
    const api = captureHook()
    await expect(
      api.startProofread(null as unknown as GongwenAST, makeConfig())
    ).rejects.toThrow('公文内容为空')
  })

  it('非空文档（仅标题）通过守卫进入校对流程，不因空内容误拒', async () => {
    const api = captureHook()
    const ast: GongwenAST = {
      title: [makeNode(NodeType.DOCUMENT_TITLE, '关于加强安全生产工作的通知')],
      body: [],
    }
    await expect(api.startProofread(ast, makeConfig())).resolves.toBeUndefined()
  })
})
