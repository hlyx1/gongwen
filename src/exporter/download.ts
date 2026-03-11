import { Packer } from 'docx'
import { saveAs } from 'file-saver'
import type { GongwenAST } from '../types/ast'
import type { DocumentConfig } from '../types/documentConfig'
import { buildDocument } from './docxBuilder'

/**
 * 获取当前时间格式化字符串
 * 格式：_x月x日x时x分
 */
function getTimeSuffix(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const hour = now.getHours()
  const minute = now.getMinutes()
  return '_' + month + '月' + day + '日' + hour + '时' + minute + '分'
}

/**
 * 将 AST 导出为 .docx 文件并触发浏览器下载
 * 文件名取公文标题，若无标题则用默认名
 * 多行标题会合并为一行（去除换行符）
 * 文件名后缀添加时间信息：_x月x日x时x分
 */
export async function downloadDocx(ast: GongwenAST, config: DocumentConfig): Promise<void> {
  const doc = buildDocument(ast, config)
  const blob = await Packer.toBlob(doc)
  const timeSuffix = getTimeSuffix()
  let fileName = '公文' + timeSuffix + '.docx'
  if (ast.title && ast.title.length > 0) {
    const titleText = ast.title
      .map(function (node) { return node.content })
      .join('')
      .replace(/[\r\n]/g, '')
    if (titleText) {
      fileName = titleText + timeSuffix + '.docx'
    }
  }
  saveAs(blob, fileName)
}
