/** `path` with `key` set to `value` (or removed when null) in the given query string. */
export function withParam(path: string, query: string, key: string, value: string | null): string {
  const sp = new URLSearchParams(query);
  if (value == null) sp.delete(key);
  else sp.set(key, value);
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}
