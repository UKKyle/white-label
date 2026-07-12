const encoder = new TextEncoder();

async function digest(input: string): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return Array.from(new Uint8Array(result))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashSecret(secret: string): Promise<string> {
  return digest(secret);
}

export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  return (await digest(secret)) === hash;
}

export function createSessionToken(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
