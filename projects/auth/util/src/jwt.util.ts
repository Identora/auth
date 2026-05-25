export function decodeJwt<T = any>(token: string): T | null {
  try {
    const [, base64] = token.split('.');
    return JSON.parse(atob(base64));
  } catch { return null; }
}

export function isJwtExpired(token: string): boolean {
  const payload = decodeJwt(token);
  const exp = payload?.exp;
  return !exp || exp < Date.now() / 1000;
}
