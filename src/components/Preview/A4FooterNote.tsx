import React from 'react'
import type { FooterNoteLayout } from '../../layout/types'

/**
 * 版记子组件（工作单元-5 交付物：自 A4Page 拆出）
 *
 * 消费决策层版记版式参数（buildLayout.footerNote），DOM 类名与层级
 * 与旧实现逐字节一致（A4Page.css 零改动）：
 * - 页面内：绝对定位到末页底部，末条线与版心下边缘重合（由 CSS 类 a4-footer-note 实现）
 * - 度量容器内：追加 --measurer 修饰类走正常流布局，用于度量版记高度
 */
export function A4FooterNote(props: {
  note: FooterNoteLayout
  /** 度量容器形态：追加 a4-footer-note--measurer 修饰类 */
  measurer?: boolean
}): React.ReactElement {
  const note = props.note
  return (
    <div className={props.measurer ? 'a4-footer-note a4-footer-note--measurer' : 'a4-footer-note'}>
      <div className="a4-footer-note-line-top"></div>
      {note.hasCc && (
        <div className="a4-footer-note-cc">抄送：{note.cc}</div>
      )}
      {note.hasPrint && (
        <div className="a4-footer-note-printer">
          <span>{note.printer}</span>
          <span>{note.printDate}{note.printDate && '印发'}</span>
        </div>
      )}
      <div className="a4-footer-note-line-bottom"></div>
    </div>
  )
}
