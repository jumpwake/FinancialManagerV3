import type { ChatScope, ChatMessage } from "../types";

export interface ChatState {
  collapsed: boolean;
  scope: ChatScope;
  history: ChatMessage[];
  streaming: boolean;
}

const LS_KEY = "fmv3.sidebar.collapsed";

export function initialChatState(): ChatState {
  const collapsed =
    typeof window !== "undefined" ? localStorage.getItem(LS_KEY) === "true" : false;
  return {
    collapsed,
    scope: { type: "global" },
    history: [],
    streaming: false,
  };
}

export function persistCollapsed(collapsed: boolean): void {
  if (typeof window !== "undefined") localStorage.setItem(LS_KEY, String(collapsed));
}

export function sameScope(a: ChatScope, b: ChatScope): boolean {
  if (a.type !== b.type) return false;
  if ((a.finding_key ?? "") !== (b.finding_key ?? "")) return false;
  if ((a.situation_id ?? "") !== (b.situation_id ?? "")) return false;
  return true;
}
