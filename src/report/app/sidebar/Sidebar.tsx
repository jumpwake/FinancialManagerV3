import { useEffect, useState } from "react";
import type { ChatScope, ChatMessage } from "../types";
import { initialChatState, persistCollapsed } from "./chatStore";
import { ChatHistory } from "./ChatHistory";
import { ChatInput } from "./ChatInput";
import { useChat } from "./useChat";

interface Props {
  scope: ChatScope;
  onScopeChange: (scope: ChatScope) => void;
  initialHistory?: ChatMessage[];
}

export function Sidebar({ scope, onScopeChange, initialHistory = [] }: Props) {
  const [collapsed, setCollapsed] = useState(initialChatState().collapsed);
  const chat = useChat(initialHistory);

  useEffect(() => persistCollapsed(collapsed), [collapsed]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: "fixed",
          right: 12,
          top: 12,
          padding: "6px 10px",
          background: "#11141a",
          border: "1px solid #2a2d34",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        💬 Chat
      </button>
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
        height: "100vh",
        position: "sticky",
        top: 0,
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
        <button onClick={() => setCollapsed(true)} style={{ fontSize: 11 }}>×</button>
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
          Discussing: <strong>{scope.finding_key ?? scope.situation_id}</strong> ·{" "}
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
