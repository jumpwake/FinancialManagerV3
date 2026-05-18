import type { ChatScope, ChatMessage } from "../types";
import { ChatHistory } from "./ChatHistory";
import { ChatInput } from "./ChatInput";
import { useChat } from "./useChat";
import { TOP_BAR_HEIGHT } from "../TopBar";

interface Props {
  scope: ChatScope;
  onScopeChange: (scope: ChatScope) => void;
  /** Collapsed state is owned by App so the top-bar chat icon can toggle it. */
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  initialHistory?: ChatMessage[];
}

export function Sidebar({
  scope,
  onScopeChange,
  collapsed,
  onCollapsedChange,
  initialHistory = [],
}: Props) {
  const chat = useChat(initialHistory);

  // When collapsed the sidebar renders nothing — it is reopened from the
  // top bar's chat icon (App owns the collapsed state).
  if (collapsed) return null;

  return (
    <aside
      style={{
        width: 340,
        background: "#11141a",
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid #2a2d34",
        height: `calc(100vh - ${TOP_BAR_HEIGHT}px)`,
        position: "sticky",
        top: TOP_BAR_HEIGHT,
      }}
    >
      <header
        style={{
          padding: 10,
          borderBottom: "1px solid #2a2d34",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <strong>💬 Chat</strong>
        <button onClick={() => onCollapsedChange(true)} style={{ fontSize: 11 }}>×</button>
      </header>

      {scope.type !== "global" && (
        <div
          style={{
            margin: "8px 10px",
            padding: "5px 8px",
            background: "#0a1a2a",
            border: "1px solid #4a9eff",
            borderRadius: 3,
            fontSize: 10,
            color: "#4a9eff",
          }}
        >
          Discussing:{" "}
          <strong>
            {(() => {
              switch (scope.type) {
                case "flag":
                case "gap":
                  return scope.finding_key;
                case "situation":
                  return scope.situation_id;
                case "dimension":
                  return `Dimension: ${scope.dimension_id}`;
                case "tactical_move":
                  return `Move: ${scope.move_id}`;
                default:
                  return "global";
              }
            })()}
          </strong>{" "}
          ·{" "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onScopeChange({ type: "global" });
            }}
            style={{ color: "#4a9eff", textDecoration: "underline" }}
          >
            clear
          </a>
        </div>
      )}

      <ChatHistory
        history={chat.history}
        scope={scope}
        pendingAssistantText={chat.pendingAssistantText}
        pendingToolUse={chat.pendingToolUse}
      />
      <ChatInput onSend={(text) => chat.send(text, scope)} disabled={chat.streaming} />
    </aside>
  );
}
