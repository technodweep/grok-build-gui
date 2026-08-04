import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Surfaces render-time crashes instead of a blank window. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI crash:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            height: "100%",
            padding: 24,
            background: "#0c0e12",
            color: "#f07178",
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            whiteSpace: "pre-wrap",
          }}
        >
          <h1 style={{ color: "#e8ecf4", fontSize: 18 }}>UI failed to render</h1>
          <p style={{ color: "#8b95a8" }}>{this.state.error.message}</p>
          <pre style={{ fontSize: 12, overflow: "auto" }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
