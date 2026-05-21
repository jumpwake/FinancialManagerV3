/**
 * Prefix any server-side path with the app's base URL.
 *
 *   Dev  (vite base = "/"):          appPath("/api/me") → "/api/me"
 *   Prod (vite base = "/finance/"):  appPath("/api/me") → "/finance/api/me"
 *
 * Use for fetch() targets AND full-navigation hrefs (/login, /logout,
 * /dev-login) — anything that resolves against the API server's host.
 *
 * BASE_URL is injected by Vite from the `base` config and always ends with "/".
 */
export function appPath(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const tail = path.startsWith("/") ? path : `/${path}`;
  return `${base}${tail}`;
}
