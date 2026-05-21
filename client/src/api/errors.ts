/**
 * ApiError carries the server's per-field validation errors so forms can render
 * them inline (rather than relying on a single toast). When the server returns
 *   { message, errors: [{ field, message }] }
 * the request layer constructs an ApiError and throws it. Callers can either
 * surface .message as a toast, or pass .fieldErrors to a FormField component.
 */
export class ApiError extends Error {
  status: number;
  fieldErrors: Map<string, string>;

  constructor(status: number, message: string, fieldErrors: Map<string, string> = new Map()) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  /** True if the server attached at least one per-field validation error. */
  get hasFieldErrors(): boolean {
    return this.fieldErrors.size > 0;
  }

  get(field: string): string | undefined {
    return this.fieldErrors.get(field);
  }
}

export function asApiError(error: unknown, fallback = "Request failed"): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) return new ApiError(0, error.message);
  return new ApiError(0, fallback);
}
