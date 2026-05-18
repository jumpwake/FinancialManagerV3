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

function riskLabel(value: RiskTolerance): string {
  return RISK_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export default function ProfilePanel() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [age, setAge] = useState("");
  const [risk, setRisk] = useState<RiskTolerance>("moderate");
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((p: UserProfile | null) => {
        setProfile(p);
        if (p) {
          setAge(String(p.age));
          setRisk(p.risk_tolerance);
        } else {
          setEditing(true);
        }
      })
      .catch(() => {});
  }, []);

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
      setProfile(body);
      setEditing(false);
      setSaved(true);
    } catch {
      setErr("Save failed — is the dev server running?");
    }
  }

  const card: React.CSSProperties = {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    padding: "12px 14px",
    marginBottom: "1.5rem",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };

  if (!editing && profile) {
    return (
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={labelStyle}>Investor profile</span>
            <div style={{ fontSize: 14, color: COLORS.text, marginTop: 4 }}>
              Age {profile.age} · {riskLabel(profile.risk_tolerance)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setSaved(false);
            }}
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              color: COLORS.textMuted,
              padding: "4px 10px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Edit
          </button>
        </div>
        {saved && (
          <div style={{ fontSize: 12, color: COLORS.accentBlue, marginTop: 8 }}>
            Saved — re-run <code>npm run analyze</code> to apply it to the analysis.
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={card}>
      <span style={labelStyle}>Investor profile</span>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: COLORS.textMuted }}>
          Age
          <br />
          <input
            type="number"
            min={18}
            max={100}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            style={{
              marginTop: 4,
              width: 80,
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.text,
              borderRadius: 4,
              padding: "4px 6px",
              fontSize: 13,
            }}
          />
        </label>
        <label style={{ fontSize: 12, color: COLORS.textMuted }}>
          Risk tolerance
          <br />
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value as RiskTolerance)}
            style={{
              marginTop: 4,
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.text,
              borderRadius: 4,
              padding: "4px 6px",
              fontSize: 13,
            }}
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
            padding: "6px 14px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Save
        </button>
      </div>
      {err && <div style={{ fontSize: 12, color: COLORS.red, marginTop: 8 }}>{err}</div>}
    </div>
  );
}
