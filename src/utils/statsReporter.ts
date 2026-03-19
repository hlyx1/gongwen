/**
 * 统计上报工具函数
 * 向后端发送功能使用记录，完全静默，不影响主流程
 */

/** 导出 Word 功能标识 */
export const STATS_ACTION_EXPORT = 'export_docx'

/** AI 校对功能标识 */
export const STATS_ACTION_AI_PROOFREAD = 'ai_proofread'

/**
 * 上报功能使用统计
 * fire-and-forget 模式：不等待响应，失败静默忽略
 */
export function reportStats(action: string): void {
  try {
    fetch('/api/stats/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action }),
    }).catch(function() {
      // 静默忽略上报失败
    })
  } catch {
    // 静默忽略
  }
}
