import { useState } from "react";

interface Props {
  tool: string;
  payload: Record<string, unknown>;
  messageId?: string;
}

export function ToolProposalCard({ tool, payload }: Props) {
  const [status, setStatus] = useState<"proposed" | "confirmed" | "dismissed">("proposed");

  const confirm = async () => {
    let url = "";
    let body: unknown = payload;
    if (tool === "propose_situation") {
      url = "/api/situations";
    } else if (tool === "propose_note") {
      url = "/api/notes";
    } else if (tool === "propose_close_situation") {
      const sid = payload.situation_id as string;
      url = `/api/situations/${sid}`;
      body = { status: "closed", closure_reason: payload.closure_reason };
      await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setStatus("confirmed");
      return;
    } else {
      setStatus("dismissed");
      return;
    }
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setStatus("confirmed");
  };

  const title = tool === "propose_situation"
    ? "💡 Track this as a Situation?"
    : tool === "propose_note"
      ? "💡 Save this as a Note?"
      : tool === "propose_close_situation"
        ? "💡 Mark Situation as resolved?"
        : tool;

  return (
    <div
      style={{
        border: status === "confirmed" ? "1px solid #4ade80" : "1px solid #4a9eff",
        borderRadius: 4,
        padding: 8,
        background: status === "confirmed" ? "#0a2a1a" : "#0a1a2a",
        fontSize: 11,
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 4 }}>{title}</div>
      <pre style={{ margin: 0, fontSize: 10, overflowX: "auto" }}>
        {JSON.stringify(payload, null, 2)}
      </pre>
      {status === "proposed" && (
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <button onClick={confirm} style={{ fontSize: 11, padding: "3px 8px" }}>Confirm</button>
          <button onClick={() => setStatus("dismissed")} style={{ fontSize: 11, padding: "3px 8px" }}>Dismiss</button>
        </div>
      )}
      {status === "confirmed" && <div style={{ marginTop: 4, color: "#4ade80" }}>✓ saved</div>}
      {status === "dismissed" && <div style={{ marginTop: 4, color: "#888" }}>dismissed</div>}
    </div>
  );
}
