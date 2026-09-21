/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { VitePWA } from 'vite-plugin-pwa'

// 单文件模式：SINGLE_FILE=1 npm run build
const isSingleFile = !!process.env.SINGLE_FILE

// GitHub Pages 需要子路径前缀，Vercel / 本地开发使用根路径
// 单文件模式强制使用相对路径以支持离线双击打开
const base = isSingleFile ? './' : process.env.GITHUB_ACTIONS ? '/gongwen/' : '/'

// AI dev 密钥注入（fojian-ai 同款体例，前端零密钥）：/llm 代理转发外网 DeepSeek 时由
// vite dev server 进程注入 Authorization 头；密钥读 gitignored 本地文件
// ai-keys.local.json（仓库只留 ai-keys.local.example.json 占位，密钥绝不入 git）。
// 文件缺失/坏 JSON/缺字段 → 不注入 ＋ 一次性 console.warn（浏览器端零干预；无密钥文件
// 时 DeepSeek 请求 401＝已知边界）。仅 dev server 实例化 proxy 时读取（configure 钩子）；
// `vite build` 只求值 config 不走此路径零噪音；模块级缓存保证 warn 只发一次。
let aiApiKeyCache: string | undefined
function loadAiApiKey(): string {
  if (aiApiKeyCache !== undefined) return aiApiKeyCache
  let key = ''
  try {
    const parsed = JSON.parse(readFileSync(new URL('./ai-keys.local.json', import.meta.url), 'utf-8'))
    if (parsed && typeof parsed.deepseekApiKey === 'string' && parsed.deepseekApiKey) {
      key = parsed.deepseekApiKey
    } else {
      console.warn(
        '[ai-keys] ai-keys.local.json 缺少 deepseekApiKey 字段（形状见 ai-keys.local.example.json）——/llm 转发不注入 Authorization，DeepSeek 请求将 401。'
      )
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      console.warn(
        '[ai-keys] 未找到 ai-keys.local.json——/llm 转发不注入 Authorization，DeepSeek 请求将 401。一次性配置：复制 ai-keys.local.example.json 为仓库根 ai-keys.local.json，填入 DeepSeek 密钥后重启 npm run dev（该文件已被 .gitignore 排除，密钥不入 git）。'
      )
    } else {
      console.warn('[ai-keys] ai-keys.local.json 解析失败——不注入 Authorization，请核对 JSON 格式后重启 npm run dev。')
    }
  }
  aiApiKeyCache = key
  return key
}

// /llm 代理的密钥注入插件：转发上游前注入 Bearer 头（http-proxy 事件体例）
function aiKeyInjection(): ProxyOptions {
  return {
    configure(proxy) {
      const apiKey = loadAiApiKey()
      if (apiKey) {
        proxy.on('proxyReq', (proxyReq) => {
          proxyReq.setHeader('Authorization', 'Bearer ' + apiKey)
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    ...(isSingleFile
      ? [viteSingleFile({ removeViteModuleLoader: true })]
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
              name: '公文排版工具',
              short_name: '公文排版',
              description: '符合 GB/T 9704 标准的公文排版与导出工具',
              theme_color: '#c0392b',
              background_color: '#ffffff',
              display: 'standalone',
              scope: base,
              start_url: base,
              icons: [
                {
                  src: 'pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                },
                {
                  src: 'pwa-512x512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'any maskable',
                },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
              // 运行时部署配置不预缓存：生产容器重启改 env 后须立即取新值，
              // SW 预缓存会把旧配置锁死到下次 SW 更新
              globIgnores: ['**/runtime-config.js'],
            },
          }),
        ]),
  ],
  // 目标浏览器：Chrome 78 内核兼容性
  // 阻止 LightningCSS 使用 inset 等新 CSS 特性
  build: {
    cssTarget: 'chrome78',
    target: 'chrome78',
  },
  css: {
    devSourcemap: true,
  },
  server: {
    port: 3001,
    host: '0.0.0.0',
    proxy: {
      // 统计后端：根目录 docker-compose-dev.yml 的 stats-backend-dev 容器（8026→容器 8000）
      '/api': {
        target: 'http://localhost:8026',
        changeOrigin: true,
      },
      // AI 同源前缀（部署面契约，与生产 nginx 容器的 /llm/ location 同名）：
      // dev 转发外网 DeepSeek（密钥由代理注入）；/llm/v1/chat/completions →
      // https://api.deepseek.com/v1/chat/completions
      '/llm': {
        target: 'https://api.deepseek.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llm/, ''),
        ...aiKeyInjection(),
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
