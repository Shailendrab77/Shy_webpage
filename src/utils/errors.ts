export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly exposeToCustomer: boolean;
  readonly customerMessage?: string;
  readonly details?: unknown;

  constructor(options: {
    message: string;
    code: string;
    statusCode?: number;
    exposeToCustomer?: boolean;
    customerMessage?: string;
    details?: unknown;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.exposeToCustomer = options.exposeToCustomer ?? false;
    this.customerMessage = options.customerMessage;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown, customerMessage?: string) {
    super({
      message,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      exposeToCustomer: true,
      customerMessage: customerMessage ?? message,
      details,
    });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, customerMessage?: string) {
    super({
      message,
      code: 'NOT_FOUND',
      statusCode: 404,
      exposeToCustomer: true,
      customerMessage: customerMessage ?? message,
    });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, customerMessage?: string) {
    super({
      message,
      code: 'CONFLICT',
      statusCode: 409,
      exposeToCustomer: true,
      customerMessage: customerMessage ?? message,
    });
    this.name = 'ConflictError';
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, cause?: unknown) {
    super({
      message: `${service}: ${message}`,
      code: 'EXTERNAL_SERVICE_ERROR',
      statusCode: 503,
      exposeToCustomer: true,
      customerMessage:
        "We're temporarily unable to process your request. Please try again shortly.",
      cause,
    });
    this.name = 'ExternalServiceError';
  }
}

export function getCustomerSafeMessage(error: unknown): string {
  if (error instanceof AppError && error.exposeToCustomer) {
    return (
      error.customerMessage ??
      "We're temporarily unable to process your request. Please try again shortly."
    );
  }
  return "We're temporarily unable to process your request. Please try again shortly.";
}
