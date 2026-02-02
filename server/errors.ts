const dbUnavailableCodes = new Set([
  "ETIMEDOUT",
  "ENETUNREACH",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ECONNRESET",
  "EPIPE",
  "57P01",
]);

function collectCodes(err: unknown, out: Set<string>, depth: number) {
  if (!err || depth <= 0) return;

  if (typeof err === "object") {
    const anyErr = err as any;
    if (typeof anyErr.code === "string") out.add(anyErr.code);
    if (typeof anyErr.errno === "string") out.add(anyErr.errno);
    if (typeof anyErr?.cause === "object") collectCodes(anyErr.cause, out, depth - 1);
    if (Array.isArray(anyErr.errors)) {
      for (const e of anyErr.errors) collectCodes(e, out, depth - 1);
    }
    if (Array.isArray(anyErr[Symbol.iterator])) {
      for (const e of anyErr as any) collectCodes(e, out, depth - 1);
    }
    for (const v of Object.values(anyErr)) collectCodes(v, out, depth - 1);
    for (const s of Object.getOwnPropertySymbols(anyErr)) collectCodes(anyErr[s], out, depth - 1);
  }
}

export function isDbUnavailableError(err: unknown) {
  const codes = new Set<string>();
  collectCodes(err, codes, 4);
  for (const c of codes) {
    if (dbUnavailableCodes.has(c)) return true;
  }
  const msg = (err as any)?.message;
  if (
    typeof msg === "string" &&
    /(ETIMEDOUT|ENETUNREACH|ECONNREFUSED|EHOSTUNREACH|ECONNRESET|EPIPE)/.test(msg)
  ) {
    return true;
  }
  return false;
}
