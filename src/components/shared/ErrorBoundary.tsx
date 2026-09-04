import { logService } from '@/services/logService';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getTranslator } from '@/i18n/translations';
import { resolveBrowserLanguage } from '@/i18n/languageRegistry';
import { isStaleBuildError, recoverFromStaleBuild } from '@/utils/staleBuildRecovery';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logService.error('[ErrorBoundary] Caught error.', { error, componentStack: errorInfo.componentStack });
  }

  private handleReload = () => {
    const { error } = this.state;
    this.setState({ hasError: false, error: null });

    if (isStaleBuildError(error)) {
      void recoverFromStaleBuild();
      return;
    }

    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const language = resolveBrowserLanguage();
      const translator = getTranslator(language);

      return (
        // Deliberately hardcoded: the error boundary renders before/outside the
        // theme provider, so --theme-* variables are not guaranteed here.
        <div className="flex h-full items-center justify-center bg-gray-900 p-8">
          <div className="max-w-md rounded-xl bg-gray-800 p-8 text-center shadow-2xl">
            <div className="mb-4 text-5xl">&#9888;&#65039;</div>
            <h2 className="mb-2 text-xl font-bold text-white">{translator('errorBoundaryTitle')}</h2>
            <p className="mb-4 text-sm text-gray-400">
              {this.state.error?.message || translator('errorBoundaryDescription')}
            </p>
            <button
              onClick={this.handleReload}
              className="rounded-lg bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
            >
              {translator('errorBoundaryReload')}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
