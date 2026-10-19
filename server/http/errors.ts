export interface ApiErrorOptions {
  code?: string;
  errors?: Record<string, string>;
}

/** An error that is safe to show to the client. Anything else becomes a generic 500. */
export class ApiError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string>;

  constructor(status: number, message: string, opts: ApiErrorOptions = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = opts.code ?? defaultCode(status);
    this.errors = opts.errors;
  }
}

function defaultCode(status: number) {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 422:
      return "validation_failed";
    case 429:
      return "rate_limited";
    default:
      return "error";
  }
}

export const badRequest = (m = "That request doesn't look right.") => new ApiError(400, m);
export const unauthorized = (m = "Please sign in to continue.") => new ApiError(401, m);
export const forbidden = (m = "You don't have permission to do that.") => new ApiError(403, m);
export const notFound = (m = "We couldn't find that.") => new ApiError(404, m);
export const conflict = (m: string) => new ApiError(409, m);
