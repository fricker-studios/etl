import * as Sentry from "@sentry/react";

export interface ErrorContext {
  userId?: string;
  action?: string;
  resource?: string;
  additionalData?: Record<string, any>;
}

/**
 * Centralized error logging utility
 * Logs errors to console and Sentry with appropriate context
 */
export function logError(
  error: Error | unknown,
  context?: ErrorContext,
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Console logging for development
  console.error("[Error]", {
    message: errorMessage,
    stack: errorStack,
    context,
    timestamp: new Date().toISOString(),
  });

  // Send to Sentry with context
  if (context) {
    Sentry.captureException(error, {
      tags: {
        action: context.action,
        resource: context.resource,
      },
      user: context.userId ? { id: context.userId } : undefined,
      extra: context.additionalData,
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Log info-level messages for debugging
 */
export function logInfo(message: string, data?: Record<string, any>): void {
  console.info("[Info]", {
    message,
    data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log warning-level messages
 */
export function logWarning(message: string, data?: Record<string, any>): void {
  console.warn("[Warning]", {
    message,
    data,
    timestamp: new Date().toISOString(),
  });

  // Send warnings to Sentry too
  Sentry.captureMessage(message, {
    level: "warning",
    extra: data,
  });
}
