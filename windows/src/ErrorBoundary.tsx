import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, _info: ErrorInfo) { console.error('UI render failed', error.name) }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="subscription-loading"><h1>界面暂时无法显示</h1><p>可以重新打开界面，或导出本机诊断报告。</p><button className="primary-button" onClick={() => window.location.reload()}>重新打开</button><button className="secondary-button" onClick={() => void window.v2tt?.exportReport().catch(() => {})}>导出报告</button></main>
  }
}
