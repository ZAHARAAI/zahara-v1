"use client";
import { Component, type ReactNode } from "react";

interface State {
  hasError: boolean;
  message: string;
}

export class ModeErrorBoundary extends Component<
  { children: ReactNode; mode: string },
  State
> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidUpdate(prevProps: { mode: string }) {
    // Reset error when the user switches modes — don't stay crashed
    if (prevProps.mode !== this.props.mode && this.state.hasError) {
      this.setState({ hasError: false, message: "" });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-sm">
          <p className="text-muted_fg">This mode failed to load.</p>
          <p className="text-xs text-red-400 font-mono max-w-sm text-center">
            {this.state.message}
          </p>
          <button
            className="text-xs text-accent underline"
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
