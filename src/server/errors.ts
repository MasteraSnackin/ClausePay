export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 500,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super("NOT_FOUND", message, 404, details);
  }
}

export function toErrorResponse(error: unknown, requestId: string) {
  if (error instanceof AppError) {
    const errorBody: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
      requestId: string;
    } = {
      code: error.code,
      message: error.message,
      requestId
    };
    if (Object.keys(error.details).length > 0) {
      errorBody.details = error.details;
    }

    return {
      status: error.status,
      body: {
        ok: false,
        error: errorBody
      }
    };
  }

  if (isHttpBodyParserError(error)) {
    const status = error.status === 413 ? 413 : 400;
    return {
      status,
      body: {
        ok: false,
        error: {
          code: status === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
          message: status === 413 ? "Request body is too large." : "Invalid JSON request body.",
          requestId
        }
      }
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected server error.",
        requestId
      }
    }
  };
}

function isHttpBodyParserError(error: unknown): error is { status: number; type?: string } {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { status?: unknown; type?: unknown };
  return (
    typeof candidate.status === "number" &&
    [400, 413].includes(candidate.status) &&
    (candidate.type === "entity.parse.failed" || candidate.type === "entity.too.large")
  );
}
