import { useEffect, useState, type CSSProperties } from "react";
import { COLORS } from "./theme";
import { appPath } from "./api";

interface AppConfig {
  devLogin: boolean;
  devUsers: string[];
}

const primaryButton: CSSProperties = {
  display: "block",
  width: "100%",
  background: COLORS.accentBlue,
  color: "#fff",
  padding: "10px 20px",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 500,
  textDecoration: "none",
  textAlign: "center",
  boxSizing: "border-box",
};

const secondaryButton: CSSProperties = {
  ...primaryButton,
  background: "transparent",
  color: COLORS.text,
  border: `1px solid ${COLORS.textMuted}`,
};

function titleCase(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * Shown when no user is signed in. Always offers Google sign-in; when the
 * server reports the dev-login bypass is available (Development only), also
 * offers one-click "Login as <user>" buttons for local testing.
 */
export default function Landing() {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(appPath("/api/config"))
      .then((r) => (r.ok ? r.json() : { devLogin: false, devUsers: [] }))
      .then((c) => { if (!cancelled) setConfig(c as AppConfig); })
      .catch(() => { if (!cancelled) setConfig({ devLogin: false, devUsers: [] }); });
    return () => { cancelled = true; };
  }, []);

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
      <div style={{ width: 300, padding: "2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 500, color: COLORS.text, marginBottom: 8 }}>
          Portfolio Report
        </h1>
        <p
          style={{
            fontSize: 14,
            color: COLORS.textMuted,
            marginBottom: 24,
            lineHeight: 1.6,
          }}
        >
          Sign in with your authorized Google account to view your portfolio analysis.
        </p>

        <a href={appPath("/login")} style={primaryButton}>
          Sign in with Google
        </a>

        {config?.devLogin && config.devUsers.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: COLORS.textMuted,
                marginBottom: 12,
              }}
            >
              Test login — local only
            </div>
            {config.devUsers.map((u) => (
              <a
                key={u}
                href={appPath(`/dev-login?user=${encodeURIComponent(u)}`)}
                style={{ ...secondaryButton, marginBottom: 8 }}
              >
                Login as {titleCase(u)}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
