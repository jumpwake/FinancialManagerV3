import { COLORS } from "./theme";

/**
 * Shown when no user is signed in. Offers the Google sign-in, plus — only when
 * running under the Vite dev server — quick dev sign-in links backed by the
 * server's Development-only /dev-login endpoint.
 */
export default function Landing() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", padding: "2rem", maxWidth: 380 }}>
        <h1 style={{ fontSize: 24, fontWeight: 500, color: COLORS.text, marginBottom: 8 }}>
          Portfolio Report
        </h1>
        <p
          style={{
            fontSize: 14,
            color: COLORS.textMuted,
            marginBottom: 28,
            lineHeight: 1.6,
          }}
        >
          Sign in with your authorized Google account to view your portfolio analysis.
        </p>
        <a
          href="/login"
          style={{
            display: "inline-block",
            background: COLORS.accentBlue,
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Sign in with Google
        </a>
        {import.meta.env.DEV && (
          <div style={{ marginTop: 28, fontSize: 12, color: COLORS.textMuted }}>
            Dev sign-in:{" "}
            <a href="/dev-login?user=kevin" style={{ color: COLORS.accentBlue }}>
              kevin
            </a>
            {" · "}
            <a href="/dev-login?user=luke" style={{ color: COLORS.accentBlue }}>
              luke
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
