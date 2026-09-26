import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from './ui';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[stocksense] render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="card max-w-lg p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-error-container text-on-error-container">
            <Icon name="bug_report" size={24} fill />
          </span>
          <h1 className="mt-3 text-[16px] font-extrabold">Something broke while rendering</h1>
          <p className="mt-1.5 text-[12.5px] text-on-surface/60">
            {this.state.error.message}
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-surface-low p-3 text-left font-mono text-[10.5px] whitespace-pre-wrap text-on-surface/60">
            {this.state.error.stack?.split('\n').slice(0, 8).join('\n')}
          </pre>
          <button className="btn btn-primary mt-4" onClick={() => this.setState({ error: null })}>
            <Icon name="refresh" size={16} /> Try again
          </button>
        </div>
      </div>
    );
  }
}
