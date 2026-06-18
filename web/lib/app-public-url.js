/**
 * URL pública do painel para redirects no browser.
 * Evita redirecionar para 0.0.0.0 quando o Next roda com --hostname 0.0.0.0 no Docker.
 * @returns {string}
 */
export function getAppPublicUrl() {
  const fromEnv = process.env.APP_PUBLIC_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (redirectUri) {
    try {
      const parsed = new URL(redirectUri);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      // segue para fallback
    }
  }

  return "http://localhost:3000";
}

/**
 * @param {string} pathWithQuery ex: "/?calendar_connected=1"
 * @returns {URL}
 */
export function appPublicRedirect(pathWithQuery) {
  const base = getAppPublicUrl();
  const normalizedPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  return new URL(normalizedPath, `${base}/`);
}
