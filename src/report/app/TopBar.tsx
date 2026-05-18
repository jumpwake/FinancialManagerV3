import { COLORS } from "./theme";

interface Props {
  onOpenProfile: () => void;
}

export default function TopBar({ onOpenProfile }: Props) {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 18px",
        background: COLORS.card,
        borderBottom: `1px solid ${COLORS.border}`,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>
        Portfolio Analyzer
      </span>
      <button
        type="button"
        onClick={onOpenProfile}
        aria-label="User Profile"
        title="User Profile"
        style={{
          background: "transparent",
          border: `1px solid ${COLORS.border}`,
          color: COLORS.textMuted,
          padding: "6px 9px",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
        }}
      >
        👤
      </button>
    </header>
  );
}
