import React from 'react'
import type { PageNumberLayout } from '../../layout/types'

/**
 * 页码子组件（工作单元-5 交付物：自 A4Page 拆出）
 *
 * 消费决策层页码版式参数（buildLayout.pageNumber）：奇数页居右空一字、
 * 偶数页居左空一字（由 a4-footer-odd/even 类配合 CSS 实现），
 * 格式为「— X —」一字线。字体与纵向位置均为 CSS 单源（.a4-footer），
 * 决策层的每渲染器参数（font/vertical）为 0022/0023 偏差的集中登记。
 */
export function A4PageNumber(props: {
  number: number
  layout: PageNumberLayout
}): React.ReactElement {
  const isEven = props.number % 2 === 0
  return (
    <div className={`a4-footer ${isEven ? 'a4-footer-even' : 'a4-footer-odd'}`}>
      — {props.number} —
    </div>
  )
}
