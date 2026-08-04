'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * React 错误边界
 * 依据：spec 7.1 节
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="text-2xl">⚠️</div>
            <p className="text-sm text-stone-600">
              {this.state.error?.message ?? '页面出了点问题'}
            </p>
            <button
              onClick={this.handleReset}
              className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 transition hover:bg-stone-50"
            >
              重试
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
