import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, ChatScope } from "../types";
import { sameScope } from "./chatStore";
import { ToolProposalCard } from "./ToolProposalCard";

interface Props {
  history: ChatMessage[];
  scope: ChatScope;
  pendingAssistantText: string;
  pendingToolUse: { tool: string; payload: Record<string, unknown> } | null;
}

// Compact, chat-friendly markdown renderer. Overrides default browser styles
// (heavy padding on lists, big margins on h2, etc.) so output fits in the
// narrow chat sheet without dominating the conversation.
const mdComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f0", margin: "8px 0 4px" }}>{children}</div>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f0f0", margin: "8px 0 4px" }}>{children}</div>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <div style={{ fontSize: 12, fontWeight: 700, color: "#f0f0f0", margin: "6px 0 3px" }}>{children}</div>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p style={{ margin: "4px 0", lineHeight: 1.5 }}>{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul style={{ paddingLeft: 18, margin: "4px 0" }}>{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol style={{ paddingLeft: 20, margin: "4px 0" }}>{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li style={{ marginBottom: 2, lineHeight: 1.45 }}>{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong style={{ color: "#f0f0f0", fontWeight: 600 }}>{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em style={{ color: "#d0d0d0" }}>{children}</em>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code style={{ background: "#0e1116", padding: "1px 4px", borderRadius: 3, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{children}</code>
  ),
  hr: () => (
    <hr style={{ border: "none", borderTop: "1px solid #2a2d34", margin: "8px 0" }} />
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div style={{ overflowX: "auto", margin: "6px 0" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th style={{ border: "1px solid #2a2d34", padding: "3px 6px", textAlign: "left", color: "#bbb", fontWeight: 600 }}>{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td style={{ border: "1px solid #2a2d34", padding: "3px 6px" }}>{children}</td>
  ),
} as const;

function MessageBody({ content }: { content: string }) {
  return (
    <div style={{ overflowWrap: "anywhere" }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function ChatHistory({ history, scope, pendingAssistantText, pendingToolUse }: Props) {
  const filtered =
    scope.type === "global"
      ? history
      : history.filter((m) => m.scope.type === "global" || sameScope(m.scope, scope));

  // Auto-scroll to the bottom whenever a new message lands or the streaming
  // assistant text grows. The deps cover both: filtered.length for committed
  // turns, pendingAssistantText.length for the live stream.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length, pendingAssistantText.length, pendingToolUse]);

  return (
    <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "8px 10px", fontSize: 12 }}>
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
          <MessageBody content={m.content} />
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
          <MessageBody content={pendingAssistantText} />
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
