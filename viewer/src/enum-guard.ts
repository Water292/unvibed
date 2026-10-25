/** A type guard for a string enum or `as const` object: true for one of its values. The Set is built once, here. */
export function enumGuard<E extends Record<string, string>>(e: E) {
  const values = new Set<string>(Object.values(e));
  return (v: unknown): v is E[keyof E] => typeof v === "string" && values.has(v);
}
