"use client";

import * as React from "react";
import { Card, Button } from "@/components/ui";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error to our analytics API
    this.logError(error, errorInfo);
  }

  async logError(error: Error, errorInfo: React.ErrorInfo) {
    try {
      await fetch("/api/analytics/error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error_type: "frontend",
          message: error.message,
          stack: error.stack,
          metadata: {
            componentStack: errorInfo.componentStack?.slice(0, 2000),
            url: typeof window !== "undefined" ? window.location.href : null,
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null
          }
        })
      });
    } catch (e) {
      console.error("Failed to log error:", e);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleRefresh = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
            padding: 24
          }}
        >
          <div style={{ maxWidth: 480, width: "100%" }}>
            <Card>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: "rgba(255, 107, 107, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 24px"
                  }}
                >
                  <AlertTriangle size={32} color="var(--danger)" />
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
                  Something went wrong
                </div>
                <div className="muted" style={{ marginBottom: 24 }}>
                  We've logged this error and will look into it. You can try again or refresh the page.
                </div>
                {process.env.NODE_ENV === "development" && this.state.error && (
                  <pre
                    style={{
                      background: "rgba(0,0,0,0.3)",
                      padding: 12,
                      borderRadius: 6,
                      fontSize: 11,
                      textAlign: "left",
                      overflow: "auto",
                      maxHeight: 150,
                      marginBottom: 24
                    }}
                  >
                    {this.state.error.message}
                    {this.state.error.stack && `\n\n${this.state.error.stack}`}
                  </pre>
                )}
                <div className="row" style={{ gap: 12, justifyContent: "center" }}>
                  <Button onClick={this.handleRetry}>Try again</Button>
                  <Button variant="primary" onClick={this.handleRefresh}>
                    <RefreshCw size={14} />
                    Refresh page
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

