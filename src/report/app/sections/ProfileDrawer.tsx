import { useEffect, useState } from "react";
import { RiskTolerance, UserProfile } from "../types";
import { COLORS } from "../theme";

const RISK_OPTIONS: { value: RiskTolerance; label: string }[] = [
  { value: "conservative", label: "Conservative" },
  { value: "moderately_conservative", label: "Moderately Conservative" },
  { value: "moderate", label: "Moderate" },
  { value: "moderately_aggressive", label: "Moderately Aggressive" },
  { value: "aggressive", label: "Aggressive" },
];

interface Props {
  open: boolean;
  /** Must be stable (memoized) — this is a dependency of the Esc-key effect. */
  onClose: () => void;
}

export default function ProfileDrawer({ open, onClose }: Props) {
  const [age, setAge] = useState("");
  const [risk, setRisk] = useState<RiskTolerance>("moderate");
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Load the current profile once on mount.
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((p: UserProfile | null) => {
        if (p) {
          setAge(String(p.age));
          setRisk(p.risk_tolerance);
        }
      })
      .catch(() => {});
  }, []);

  // While open: clear transient state and close on Escape.
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setSaved(false);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function save() {
    setErr(null);
    const ageNum = Number(age);
    if (!Number.isInteger(ageNum) || ageNum < 18 || ageNum > 100) {
      setErr("Age must be a whole number between 18 and 100.");
      return;
    }
    const body: UserProfile = { age: ageNum, risk_tolerance: risk };
    try {
      const r = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        setErr(`Save failed (HTTP ${r.status}).`);
        return;
      }
      setSaved(true);
    } catch {
      setErr("Save failed — is the dev server running?");
    }
  }

  const fieldStyle: React.CSSProperties = {
    display: "block",
    marginTop: 4,
    width: "100%",
    boxSizing: "border-box",
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.text,
    borderRadius: 4,
    padding: "6px 8px",
    fontSize: 13,
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100 }}
      />
      {/* Drawer */}
      <div
        role="dialog"
        aria-label="User Profile"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 320,
          maxWidth: "90vw",
          background: COLORS.card,
          borderLeft: `1px solid ${COLORS.border}`,
          zIndex: 101,
          padding: "16px 18px",
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: COLORS.text, margin: 0 }}>
            User Profile
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: COLORS.textMuted,
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: 12, color: COLORS.textMuted, margin: 0, lineHeight: 1.5 }}>
          Age and risk tolerance drive the analysis — the fixed-income target,
          several dimension scores, and which dimensions are graded.
        </p>

        <label style={{ fontSize: 12, color: COLORS.textMuted }}>
          Age
          <input
            type="number"
            min={18}
            max={100}
            value={age}
            onChange={(e) => {
              setAge(e.target.value);
              setSaved(false);
            }}
            style={fieldStyle}
          />
        </label>

        <label style={{ fontSize: 12, color: COLORS.textMuted }}>
          Risk tolerance
          <select
            value={risk}
            onChange={(e) => {
              setRisk(e.target.value as RiskTolerance);
              setSaved(false);
            }}
            style={fieldStyle}
          >
            {RISK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={save}
          style={{
            background: COLORS.accentBlue,
            border: "none",
            color: "#fff",
            padding: "8px 14px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Save
        </button>

        {err && <div style={{ fontSize: 12, color: COLORS.red }}>{err}</div>}
        {saved && (
          <div style={{ fontSize: 12, color: COLORS.accentBlue, lineHeight: 1.5 }}>
            Saved — re-run <code>npm run analyze</code> to apply it to the analysis.
          </div>
        )}
      </div>
    </>
  );
}
