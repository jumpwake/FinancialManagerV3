import { useEffect } from "react";
import type { ChatScope, ChatMessage, Situation, Note, AnalysisOutput } from "../types";
import { ChatHistory } from "./ChatHistory";
import { ChatInput } from "./ChatInput";
import { useChat } from "./useChat";
import { TOP_BAR_HEIGHT } from "../TopBar";
import { appPath } from "../api";
import { useIsMobile } from "../hooks/useIsMobile";

const SHEET_HEIGHT =
  typeof window !== "undefined" &&
  typeof CSS !== "undefined" &&
  CSS.supports?.("height: 1dvh")
    ? "85dvh"
    : "85vh";

interface Props {
  scope: ChatScope;
  onScopeChange: (scope: ChatScope) => void;
  /** Collapsed state is owned by App so the top-bar chat icon can toggle it. */
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  initialHistory?: ChatMessage[];
  analysis: AnalysisOutput;
  situations: Situation[];
  notes: Note[];
}

export function Sidebar({
  scope,
  onScopeChange,
  collapsed,
  onCollapsedChange,
  initialHistory = [],
  analysis,
  situations,
  notes,
}: Props) {
  const chat = useChat(initialHistory);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMobile || collapsed) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, collapsed]);

  // When collapsed the sidebar renders nothing — it is reopened from the
  // top bar's chat icon (App owns the collapsed state).
  if (collapsed) return null;

  const headerAndBody = (
    <>
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
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            onClick={async () => {
              if (chat.streaming) return;
              try { await fetch(appPath("/api/chat"), { method: "DELETE" }); } catch { /* non-fatal */ }
              chat.clear();
              onScopeChange({ type: "global" });
            }}
            disabled={chat.streaming}
            title="Start a new chat (clears history)"
            style={{ fontSize: 11 }}
          >
            New
          </button>
          <button onClick={() => onCollapsedChange(true)} style={{ fontSize: 11 }}>×</button>
        </div>
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
      <ChatInput onSend={(text) => chat.send(text, scope, { analysis, situations, notes })} disabled={chat.streaming} />
    </>
  );

  if (isMobile) {
    return (
      <>
        <div
          onClick={() => onCollapsedChange(true)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 200,
          }}
        />
        <aside
          role="dialog"
          aria-label="Chat"
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            height: SHEET_HEIGHT,
            background: "#11141a",
            borderTop: "1px solid #2a2d34",
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            display: "flex",
            flexDirection: "column",
            zIndex: 201,
            boxShadow: "0 -8px 24px rgba(0,0,0,0.5)",
          }}
        >
          {headerAndBody}
        </aside>
      </>
    );
  }

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
      {headerAndBody}
    </aside>
  );
}
