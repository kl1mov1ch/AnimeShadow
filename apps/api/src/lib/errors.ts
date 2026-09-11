import type { ApiErrorCode } from "@animeshadow/shared";

/**
 * Base class for every error the API deliberately surfaces to a client.
 * Anything that isn't an `AppError` is treated as an unexpected 500 and its
 * details are kept out of the response.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request") {
    super(400, "BAD_REQUEST", message);
  }
}

export class ValidationError extends AppError {
  constructor(fields: Record<string, string[]>, message = "Some fields need attention") {
    super(422, "VALIDATION", message, fields);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You need to sign in to do that") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have access to that") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "That doesn't exist") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "That already exists") {
    super(409, "CONFLICT", message);
  }
}

export class UpstreamUnavailableError extends AppError {
  constructor(message = "The anime data service is temporarily unavailable") {
    super(503, "UPSTREAM_UNAVAILABLE", message);
  }
}
