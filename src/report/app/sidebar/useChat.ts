import { useCallback, useState } from "react";
import type { ChatScope, ChatMessage, ChatToolCall } from "../types";

export interface UseChatResult {
  send: (message: string, scope: ChatScope) => Promise<void>;
  history: ChatMessage[];
  pendingAssistantText: string;
  pendingToolUse: { tool: string; payload: Record<string, unknown> } | null;
  streaming: boolean;
  resetPending: () => void;
}

function makeMsgId(): string {
  const d = new Date();
  return `msg_${d.toISOString().replace(/[^0-9]/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function useChat(initialHistory: ChatMessage[] = []): UseChatResult {
  const [history, setHistory] = useState<ChatMessage[]>(initialHistory);
  const [pendingAssistantText, setPendingAssistantText] = useState("");
  const [pendingToolUse, setPendingToolUse] =
    useState<{ tool: string; payload: Record<string, unknown> } | null>(null);
  const [streaming, setStreaming] = useState(false);

  const resetPending = useCallback(() => {
    setPendingAssistantText("");
    setPendingToolUse(null);
  }, []);

  const send = useCallback(
    async (message: string, scope: ChatScope) => {
      setStreaming(true);
      setPendingAssistantText("");
      setPendingToolUse(null);

      const userMsg: ChatMessage = {
        id: makeMsgId(),
        role: "user",
        content: message,
        scope,
        created_at: new Date().toISOString(),
      };
      setHistory((h) => [...h, userMsg]);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, scope }),
      });

      if (!res.ok || !res.body) {
        setHistory((h) => [
          ...h,
          {
            id: makeMsgId(),
            role: "assistant",
            content: `(error: ${res.status} ${res.statusText})`,
            scope,
            created_at: new Date().toISOString(),
          },
        ]);
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let toolUse: { tool: string; payload: Record<string, unknown> } | null = null;
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const lines = ev.split("\n");
          let eventName = "";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventName = line.slice(7).trim();
            if (line.startsWith("data: ")) data += line.slice(6);
          }
          if (!eventName || !data) continue;
          const parsed = JSON.parse(data);
          if (eventName === "delta") {
            assistantText += parsed.text;
            setPendingAssistantText(assistantText);
          } else if (eventName === "tool_use") {
            toolUse = { tool: parsed.tool, payload: parsed.payload };
            setPendingToolUse(toolUse);
          } else if (eventName === "error") {
            assistantText += `\n[error: ${parsed.message}]`;
            setPendingAssistantText(assistantText);
          }
        }
      }

      const assistantMsg: ChatMessage = {
        id: makeMsgId(),
        role: "assistant",
        content: assistantText,
        scope,
        created_at: new Date().toISOString(),
        ...(toolUse
          ? { tool_call: { ...toolUse, status: "proposed" as const } as ChatToolCall }
          : {}),
      };
      setHistory((h) => [...h, assistantMsg]);
      setPendingAssistantText("");
      setPendingToolUse(null);
      setStreaming(false);
    },
    [],
  );

  return { send, history, pendingAssistantText, pendingToolUse, streaming, resetPending };
}
