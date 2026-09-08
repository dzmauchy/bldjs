export class ParseError extends Error {
  constructor(
    message: string,
    readonly file?: string,
  ) {
    super(file ? `${file}: ${message}` : message);
    this.name = "ParseError";
  }

  static new(message: string): ParseError {
    return new ParseError(message);
  }
}

export function fail(file: string, message: string): never {
  throw new ParseError(message, file);
}
