import React from 'react'
import type { HeaderLayout } from '../../layout/types'

/**
 * 版头子组件（工作单元-5 交付物：自 A4Page 拆出）
 *
 * 消费决策层版头版式参数（buildLayout.header），DOM 类名与层级
 * 与旧 A4Page 内联实现逐字节一致（A4Page.css 零改动）。
 * 红色分隔线的粗细/间距为 CSS 单源（.a4-header-separator），
 * 决策层的每渲染器参数（header.separator）为 0003 偏差的集中登记。
 */
export function A4HeaderSection(props: { header: HeaderLayout }): React.ReactElement {
  const header = props.header
  return (
    <div className="a4-header-section">
      <div className="a4-header-org">{header.orgName}</div>
      <div className={`a4-header-meta${header.signer ? ' a4-header-meta--with-signer' : ''}`}>
        <span>{header.docNumber}</span>
        {header.signer && (
          <span>
            <span className="a4-header-signer-label">签发人：</span>
            <span className="a4-header-signer-name">{header.signer}</span>
          </span>
        )}
      </div>
      <div className="a4-header-separator"></div>
    </div>
  )
}
