import { useState } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  return (
    <form
      style={{ display: "flex", gap: 6, padding: "8px 10px", borderTop: "1px solid #2a2d34" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() && !disabled) {
          onSend(text.trim());
          setText("");
        }
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask or annotate..."
        disabled={disabled}
        style={{ flex: 1, fontSize: 12, padding: "4px 6px" }}
      />
      <button type="submit" disabled={disabled || !text.trim()} style={{ fontSize: 12, padding: "4px 10px" }}>
        ↑
      </button>
    </form>
  );
}
