export class AppError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'AppError';
    this.code = code || null;
    this.status = status || null;
  }
}
