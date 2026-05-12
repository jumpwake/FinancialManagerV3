import type { ChatMessage, ChatScope } from "../types";
import { sameScope } from "./chatStore";
import { ToolProposalCard } from "./ToolProposalCard";

interface Props {
  history: ChatMessage[];
  scope: ChatScope;
  pendingAssistantText: string;
  pendingToolUse: { tool: string; payload: Record<string, unknown> } | null;
}

export function ChatHistory({ history, scope, pendingAssistantText, pendingToolUse }: Props) {
  const filtered =
    scope.type === "global"
      ? history
      : history.filter((m) => m.scope.type === "global" || sameScope(m.scope, scope));

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", fontSize: 12 }}>
      {filtered.map((m) => (
        <div
          key={m.id}
          style={{
            background: m.role === "user" ? "#1a3a2a" : "#1a1d24",
            padding: "6px 8px",
            borderRadius: 6,
            marginBottom: 6,
            color: "#bbb",
          }}
        >
          <div>{m.content}</div>
          {m.tool_call && m.tool_call.status === "proposed" && (
            <div style={{ marginTop: 6 }}>
              <ToolProposalCard
                tool={m.tool_call.tool}
                payload={m.tool_call.payload}
                messageId={m.id}
              />
            </div>
          )}
        </div>
      ))}
      {pendingAssistantText && (
        <div
          style={{
            background: "#1a1d24",
            padding: "6px 8px",
            borderRadius: 6,
            color: "#bbb",
          }}
        >
          {pendingAssistantText}
          <span style={{ opacity: 0.4 }}> ▌</span>
        </div>
      )}
      {pendingToolUse && (
        <div style={{ marginTop: 6 }}>
          <ToolProposalCard tool={pendingToolUse.tool} payload={pendingToolUse.payload} />
        </div>
      )}
    </div>
  );
}
