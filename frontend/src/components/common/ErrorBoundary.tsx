import { Component, type ReactNode, type ErrorInfo } from "react";
import { Alert, Button, Container, Stack } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import * as Sentry from "@sentry/react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Container size="sm" mt="xl">
          <Stack>
            <Alert
              icon={<IconAlertCircle size={24} />}
              title="Something went wrong"
              color="red"
              variant="filled"
            >
              <Stack gap="sm">
                <div>
                  An unexpected error occurred. Please try refreshing the page.
                </div>
                {this.state.error && (
                  <div style={{ fontSize: "0.875rem", opacity: 0.8 }}>
                    {this.state.error.message}
                  </div>
                )}
                <Button
                  variant="white"
                  size="sm"
                  onClick={() => window.location.reload()}
                >
                  Refresh Page
                </Button>
              </Stack>
            </Alert>
          </Stack>
        </Container>
      );
    }

    return this.props.children;
  }
}
