const unsafe = /[<>]/g;

export function sanitizeText(value: unknown): string {
  return String(value ?? '')
    .replace(unsafe, '')
    .trim()
    .slice(0, 1200);
}

export function sanitizeEmail(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 320);
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
