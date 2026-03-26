/**
 * Error class for HTTP and Actions API failures.
 *
 * Carries an optional HTTP status code so callers can make retry/reporting
 * decisions based on the response status without parsing error messages.
 */
export class ActionsError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "ActionsError";
  }
}
