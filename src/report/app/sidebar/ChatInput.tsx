import { useState, useRef, useEffect } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea to fit content (capped so it doesn't take over the sheet).
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [text]);

  function submit() {
    if (text.trim() && !disabled) {
      onSend(text.trim());
      setText("");
    }
  }

  return (
    <form
      style={{
        display: "flex",
        gap: 6,
        padding: "8px 10px",
        borderTop: "1px solid #2a2d34",
        alignItems: "flex-end",
      }}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter submits; Shift+Enter inserts a newline.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask or annotate..."
        disabled={disabled}
        rows={1}
        style={{
          flex: 1,
          // Without this, the textarea won't shrink below its intrinsic ~20-char width
          // inside a flex container — overflows narrow mobile sheets.
          minWidth: 0,
          fontSize: 13,
          padding: "6px 8px",
          resize: "none",
          lineHeight: 1.4,
          fontFamily: "inherit",
          background: "#1a1d24",
          color: "#f0f0f0",
          border: "1px solid #2a2d34",
          borderRadius: 4,
          // Wraps long content onto multiple lines instead of horizontal scroll.
          overflowWrap: "anywhere",
        }}
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        style={{ fontSize: 14, padding: "6px 12px", flexShrink: 0 }}
      >
        ↑
      </button>
    </form>
  );
}
