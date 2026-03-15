import React from 'react'
import './AIProofreadButton.css'

interface AIProofreadButtonProps {
  status: 'idle' | 'loading' | 'success' | 'error'
  processedSentences: number
  totalSentences: number
  issueCount: number
  isConfigured: boolean
  onStartProofread: () => void
}

const AIProofreadButton: React.FC<AIProofreadButtonProps> = ({
  status,
  processedSentences,
  totalSentences,
  issueCount,
  isConfigured,
  onStartProofread
}) => {
  const handleClick = () => {
    if (!isConfigured) {
      alert('请联系管理员配置AI服务')
      return
    }
    if (status === 'loading') {
      return
    }
    onStartProofread()
  }

  const getButtonText = () => {
    if (!isConfigured) {
      return 'AI服务未配置'
    }

    switch (status) {
      case 'loading':
        return 'AI审核 正在检测(' + processedSentences + '/' + totalSentences + ')'
      case 'success':
        if (issueCount > 0) {
          return 'AI审核 发现' + issueCount + '处问题'
        }
        return 'AI审核 无问题'
      case 'error':
        return 'AI审核 检测失败'
      case 'idle':
      default:
        return 'AI审核'
    }
  }

  const isDisabled = !isConfigured || status === 'loading'

  const buttonClassName = 'ai-proofread-button' +
    (isDisabled ? ' ai-proofread-button--disabled' : '') +
    (status === 'loading' ? ' ai-proofread-button--loading' : '') +
    (status === 'success' && issueCount > 0 ? ' ai-proofread-button--has-issues' : '') +
    (status === 'error' ? ' ai-proofread-button--error' : '')

  return (
    <button
      className={buttonClassName}
      onClick={handleClick}
      disabled={isDisabled}
      type="button"
    >
      <span className="ai-proofread-button__text">
        {getButtonText()}
      </span>
      {status === 'success' && issueCount > 0 && (
        <span className="ai-proofread-button__badge">
          {issueCount}
        </span>
      )}
    </button>
  )
}

export default AIProofreadButton
