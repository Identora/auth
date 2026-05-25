export async function generatePkcePair() {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  return { verifier, challenge };
}

export function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(bytes);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const buffer = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return base64UrlEncode(new Uint8Array(hash));
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
