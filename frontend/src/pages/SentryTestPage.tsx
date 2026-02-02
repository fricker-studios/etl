import { Button, Container, Stack, Text, Title } from "@mantine/core";
import * as Sentry from "@sentry/react";

export function SentryTestPage() {
  const handleTestError = () => {
    throw new Error("This is a test error for Sentry integration");
  };

  const handleCaptureException = () => {
    try {
      throw new Error("This is a captured test error");
    } catch (error) {
      Sentry.captureException(error);
      alert("Error captured and sent to Sentry!");
    }
  };

  const handleTestMessage = () => {
    Sentry.captureMessage("Test message from Sentry integration", "info");
    alert("Test message sent to Sentry!");
  };

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={2}>Sentry Integration Test</Title>
        
        <Text c="dimmed">
          Use these buttons to test different Sentry error tracking scenarios:
        </Text>

        <Stack gap="sm">
          <Button
            onClick={handleTestError}
            color="red"
            variant="filled"
          >
            Throw Unhandled Error
          </Button>
          <Text size="sm" c="dimmed">
            This will throw an uncaught error that should be automatically captured by Sentry
          </Text>

          <Button
            onClick={handleCaptureException}
            color="orange"
            variant="filled"
          >
            Capture Exception
          </Button>
          <Text size="sm" c="dimmed">
            This will catch an error and manually send it to Sentry
          </Text>

          <Button
            onClick={handleTestMessage}
            color="blue"
            variant="filled"
          >
            Send Test Message
          </Button>
          <Text size="sm" c="dimmed">
            This will send a test message to Sentry
          </Text>
        </Stack>
      </Stack>
    </Container>
  );
}
