import { COLORS } from "./theme";
import { useIsMobile } from "./hooks/useIsMobile";

/** Fixed height of the top bar — shared so the chat sidebar can sit below it. */
export const TOP_BAR_HEIGHT = 48;

interface Props {
  onOpenProfile: () => void;
  onToggleChat: () => void;
}

const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${COLORS.border}`,
  color: COLORS.textMuted,
  padding: "6px 9px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
};

export default function TopBar({ onOpenProfile, onToggleChat }: Props) {
  const isMobile = useIsMobile();
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: TOP_BAR_HEIGHT,
        boxSizing: "border-box",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: isMobile ? "0 12px" : "0 18px",
        background: COLORS.card,
        borderBottom: `1px solid ${COLORS.border}`,
        fontFamily: "system-ui, sans-serif",
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: COLORS.text,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        Portfolio Analyzer
      </span>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onToggleChat}
          aria-label="Toggle chat"
          title="Chat"
          style={iconBtn}
        >
          💬
        </button>
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="User Profile"
          title="User Profile"
          style={iconBtn}
        >
          👤
        </button>
      </div>
    </header>
  );
}
