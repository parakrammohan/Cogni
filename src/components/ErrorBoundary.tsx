import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  /** Optional label shown in the default fallback ("Vision panel", "Map", etc.) */
  scope?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    if (typeof console !== "undefined") {
      console.error("[CogniTrack] ErrorBoundary caught:", error, info.componentStack);
    }
  }

  reset = () => this.setState({ hasError: false, message: undefined });

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle size={18} aria-hidden />
            <span className="text-sm font-semibold uppercase tracking-wider">
              {this.props.scope ?? "Component"} crashed
            </span>
          </div>
          <p className="text-sm leading-6">
            {this.state.message ?? "An unexpected error occurred while rendering this section."}
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-800 transition hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
