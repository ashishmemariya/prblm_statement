export class HttpError extends Error {
  status: number;
  /** Business-readable lines shown verbatim in a toast or an error state. */
  blockers: string[];
  constructor(status: number, message: string, blockers: string[] = []) {
    super(message);
    this.status = status;
    this.blockers = blockers;
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const notFound = (m: string) => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);
export const blocked = (m: string, blockers: string[] = []) => new HttpError(422, m, blockers);
export const forbidden = (m: string) => new HttpError(403, m);
