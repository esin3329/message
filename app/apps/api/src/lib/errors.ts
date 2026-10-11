export class ApiError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 429,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ErrorBody = { error: { code: string; message: string } };
export const errorBody = (code: string, message: string): ErrorBody => ({
  error: { code, message },
});
