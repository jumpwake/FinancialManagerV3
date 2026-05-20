import { useCallback, useState } from "react";
import type { ChatScope, ChatMessage, ChatToolCall } from "../types";
import {
  CHAT_SYSTEM_PROMPT,
  CHAT_TOOLS,
  renderChatInput,
  type ChatInputContext,
} from "../ai/chat";
import { aiClient as client } from "../ai/client";

export interface UseChatResult {
  send: (
    message: string,
    scope: ChatScope,
    context: Omit<ChatInputContext, "user_message" | "scope" | "history">,
  ) => Promise<void>;
  history: ChatMessage[];
  pendingAssistantText: string;
  pendingToolUse: { tool: string; payload: Record<string, unknown> } | null;
  streaming: boolean;
  resetPending: () => void;
}

function makeMsgId(): string {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  return `msg_${stamp}_${Math.random().toString(36).slice(2, 6)}`;
}

async function persist(messages: ChatMessage[]): Promise<void> {
  await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
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
    async (
      message: string,
      scope: ChatScope,
      ctx: Omit<ChatInputContext, "user_message" | "scope" | "history">,
    ) => {
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

      const userContent = renderChatInput({
        user_message: message,
        scope,
        history,
        ...ctx,
      });

      let assistantText = "";
      let toolUse: { tool: string; payload: Record<string, unknown> } | null = null;

      try {
        const stream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          system: CHAT_SYSTEM_PROMPT,
          tools: CHAT_TOOLS as never,
          messages: [{ role: "user", content: userContent }],
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            assistantText += event.delta.text;
            setPendingAssistantText(assistantText);
          }
        }
        const final = await stream.finalMessage();
        for (const block of final.content) {
          if (block.type === "tool_use") {
            toolUse = { tool: block.name, payload: block.input as Record<string, unknown> };
            setPendingToolUse(toolUse);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        assistantText += `\n[error: ${msg}]`;
        setPendingAssistantText(assistantText);
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

      await persist([userMsg, assistantMsg]).catch(() => {/* non-fatal */});

      setPendingAssistantText("");
      setPendingToolUse(null);
      setStreaming(false);
    },
    [history],
  );

  return { send, history, pendingAssistantText, pendingToolUse, streaming, resetPending };
}
