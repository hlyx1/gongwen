/**
 * 统计查询工具函数
 * 从后端获取统计数据并打印到控制台
 */

interface StatsSummary {
  period_days: number
  unique_users: number
  total_calls: number
  export_docx_calls: number
  ai_proofread_calls: number
}

/**
 * 打印统计概览到控制台
 * 调用各时间段的统计接口并格式化输出
 */
export async function printStatsOverview(): Promise<void> {
  try {
    const periods = [7, 30, 365, 0]
    const periodLabels: Record<number, string> = {
      7: '最近 7 天',
      30: '最近 30 天',
      365: '最近 365 天',
      0: '全部记录',
    }

    console.log('%c=== 公文排版工具使用统计 ===', 'color: #047857; font-weight: bold; font-size: 14px')

    for (const days of periods) {
      try {
        const resp = await fetch(`/api/stats/summary?days=${days}`)
        if (!resp.ok) {
          console.warn(`[统计] 获取 ${periodLabels[days]} 数据失败`)
          continue
        }
        const stats: StatsSummary = await resp.json()

        console.log(
          `%c${periodLabels[days]}%c\n  不同用户数: ${stats.unique_users}\n  导出 Word 次数: ${stats.export_docx_calls}\n  AI 校对次数: ${stats.ai_proofread_calls}\n  总调用次数: ${stats.total_calls}`,
          'color: #059669; font-weight: bold',
          'color: #64748b',
        )
      } catch {
        console.warn(`[统计] 获取 ${periodLabels[days]} 数据失败，可能是网络错误或后端未启动`)
      }
    }

    console.log('%c============================', 'color: #047857; font-weight: bold')
  } catch {
    // 静默忽略整体错误
  }
}
