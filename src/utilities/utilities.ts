export function isAString(value: any): boolean {
  return typeof value === 'string' || value instanceof String;
}
