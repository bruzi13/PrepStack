// A crash in one screen shows a recovery message instead of a blank page, and is reported.
import { Component, type ErrorInfo, type ReactNode } from "react";
import type { ErrorReporter } from "@/services/ErrorReporter";

interface ErrorBoundaryProps { reporter: ErrorReporter; children: ReactNode }

export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    error.stack = `${error.stack ?? ""}\n--- component stack ---${info.componentStack ?? ""}`;
    void this.props.reporter.report("react", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="center">
        <div className="card narrow" role="alert">
          <h1>משהו השתבש במסך הזה</h1>
          <p className="muted">התקלה נשלחה אלינו אוטומטית. אפשר לטעון את הדף מחדש או לחזור להתחלה.</p>
          <div className="row">
            <button className="btn primary" onClick={() => location.reload()}>טעינה מחדש</button>
            <a className="btn" href="/">חזרה להיום</a>
          </div>
        </div>
      </div>
    );
  }
}
