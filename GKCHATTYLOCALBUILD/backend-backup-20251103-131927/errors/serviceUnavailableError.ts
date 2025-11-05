export class ServiceUnavailableError extends Error {
  public readonly status: number = 503;

  constructor(message = 'Service unavailable') {
    super(message);
    this.name = 'ServiceUnavailableError';
    // Restore prototype chain (necessary when targeting ES5)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
