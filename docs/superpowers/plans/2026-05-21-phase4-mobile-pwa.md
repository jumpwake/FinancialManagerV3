# Phase 4 — Mobile Responsive + PWA Installability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the deployed report usable on a phone (responsive pass over every section, top bar, profile drawer, and chat sidebar) and installable as a PWA (manifest + icons + head tags).

**Architecture:** One mobile breakpoint at 768px. A `useIsMobile()` hook drives layout switches inline alongside the existing `style={{}}` idiom — no CSS files, no Tailwind. Chat sidebar becomes a bottom sheet on mobile; ProfileDrawer becomes a full-screen sheet; DimensionScorecard's table collapses to expandable rows. PWA manifest + BIS-globe icon (generated once via a `sharp` script from `Documentation/bis_cropped2.png`).

**Tech Stack:** React 18 + TypeScript (existing); `sharp` as a one-time devDependency for icon generation. No new runtime deps.

**Branch:** Create `phase4-mobile-pwa` off `main` (currently at `ffc470f`).

**Source spec:** `docs/superpowers/specs/2026-05-21-phase4-mobile-pwa-design.md`.

**Testing convention (per `CLAUDE.md`):** The React UI is built without unit tests — verify manually via the dev server. Each task ends with a manual-verification step + `npx tsc --noEmit -p src/report/app/tsconfig.json` clean.

**Hard constraint (per spec):** No scrollbars anywhere. No `overflow-x: auto`, no horizontal scrolling on any surface.

---

## File Structure

**New files:**
- `src/report/app/hooks/useIsMobile.ts` — the breakpoint hook.
- `src/report/app/public/manifest.json` — PWA manifest.
- `src/report/app/public/icons/icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` — generated PWA icons (committed).
- `scripts/generate-icons.ts` — one-off `sharp` script that renders the icons from `Documentation/bis_cropped2.png`.

**Modified files:**
- `src/report/app/App.tsx` — grid switches: desktop `1fr auto`, mobile single column.
- `src/report/app/TopBar.tsx` — tighter padding on mobile; account label truncates.
- `src/report/app/sidebar/Sidebar.tsx` — on mobile, renders as a bottom sheet with backdrop.
- `src/report/app/sections/ProfileDrawer.tsx` — on mobile, full-screen sheet.
- `src/report/app/sections/DimensionScorecard.tsx` — on mobile, collapsed-row layout instead of the 5-column table.
- `src/report/app/sections/RadarChart.tsx` — responsive sizing to container width on mobile.
- `src/report/app/sections/AllocationBreakdown.tsx` — pie chart fits container width on mobile.
- `src/report/app/sections/Gaps.tsx`, `Flags.tsx`, `NextMoves.tsx`, `OpenSituations.tsx` — full-width action buttons on mobile.
- `src/report/app/index.html` — PWA head tags + theme color meta.
- `package.json` — add `sharp` as devDependency.

---

## Task 0: Create the feature branch

**Files:** none (git operation only).

- [ ] **Step 1: Create branch**

Run:
```bash
git checkout -b phase4-mobile-pwa
```

Expected: branch created off `main` at `ffc470f`.

---

## Task 1: `useIsMobile()` hook

**Files:**
- Create: `src/report/app/hooks/useIsMobile.ts`

- [ ] **Step 1: Write the hook**

Create `src/report/app/hooks/useIsMobile.ts`:

```typescript
import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 767.98px)";

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Returns true when viewport width is < 768px (mobile layout).
 * Re-renders only when the boundary is crossed.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/report/app/hooks/useIsMobile.ts
git commit -m "feat(report): useIsMobile() hook for breakpoint-driven layout

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: App.tsx grid switch (desktop 2-col vs. mobile single-col)

**Files:**
- Modify: `src/report/app/App.tsx`

- [ ] **Step 1: Add the hook import and call**

In `src/report/app/App.tsx`, after the other imports, add:

```typescript
import { useIsMobile } from "./hooks/useIsMobile";
```

Inside the `App` component, near the other `useState` calls (around line 27), add:

```typescript
const isMobile = useIsMobile();
```

- [ ] **Step 2: Switch the grid based on `isMobile`**

In `App.tsx` find this block (around line 199):

```jsx
<div style={{ display: "grid", gridTemplateColumns: "1fr auto", flex: 1 }}>
```

Replace with:

```jsx
<div
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
    flex: 1,
  }}
>
```

The `<main>` and `<Sidebar />` children stay as-is — Sidebar will handle its own mobile positioning in Task 3.

- [ ] **Step 3: Adjust `<main>` padding on mobile**

In the same file, change the `<main>` element's style:

```jsx
<main style={{ padding: "2rem 1rem", maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, sans-serif", width: "100%" }}>
```

to:

```jsx
<main
  style={{
    padding: isMobile ? "1.25rem 1rem" : "2rem 1rem",
    maxWidth: 900,
    margin: "0 auto",
    fontFamily: "system-ui, sans-serif",
    width: "100%",
  }}
>
```

- [ ] **Step 4: Typecheck**

Run:
```bash
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Expected: clean.

- [ ] **Step 5: Manual verification**

Start the API and the dev server:

```bash
# Terminal A — ASP.NET Core API (auth + /api/*)
npm run serve

# Terminal B — Vite dev server (with proxy to the API)
npm run report
```

In the browser:
- At ≥ 768px: layout looks identical to before (two columns: main + sidebar).
- At < 768px (use DevTools responsive mode at 375px): main column is full width; sidebar visually overlaps main (it still renders as a sticky right column at this point — Task 3 fixes that).

- [ ] **Step 6: Commit**

```bash
git add src/report/app/App.tsx
git commit -m "feat(report): mobile grid switch and main padding

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Sidebar as a bottom sheet on mobile

**Files:**
- Modify: `src/report/app/sidebar/Sidebar.tsx`

- [ ] **Step 1: Replace Sidebar.tsx with the mobile-aware version**

Open `src/report/app/sidebar/Sidebar.tsx`. Replace the whole component (keep the `Props` interface and imports above it):

```typescript
import type { ChatScope, ChatMessage, Situation, Note, AnalysisOutput } from "../types";
import { ChatHistory } from "./ChatHistory";
import { ChatInput } from "./ChatInput";
import { useChat } from "./useChat";
import { TOP_BAR_HEIGHT } from "../TopBar";
import { appPath } from "../api";
import { useIsMobile } from "../hooks/useIsMobile";

interface Props {
  scope: ChatScope;
  onScopeChange: (scope: ChatScope) => void;
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
            height: "85dvh",
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
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Expected: clean.

- [ ] **Step 3: Manual verification**

In the browser:
- At ≥ 768px: sidebar still renders as a 340px right column — desktop behavior unchanged.
- At 375px (DevTools mobile): tapping the 💬 button in the top bar opens a bottom sheet at 85% viewport height with a dim backdrop. Tapping the backdrop or the × closes it. The report main content is visible behind the dimmed backdrop.
- Chat input still works inside the sheet; messages still send and stream.

- [ ] **Step 4: Commit**

```bash
git add src/report/app/sidebar/Sidebar.tsx
git commit -m "feat(report): mobile bottom-sheet layout for chat sidebar

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Body scroll lock when bottom sheet is open

**Files:**
- Modify: `src/report/app/sidebar/Sidebar.tsx`

- [ ] **Step 1: Add the React import**

At the very top of `src/report/app/sidebar/Sidebar.tsx`, add:

```typescript
import { useEffect } from "react";
```

This goes alongside the existing imports — React was not previously imported at the top of `Sidebar.tsx`.

- [ ] **Step 2: Add the scroll-lock effect**

Inside the `Sidebar` component, immediately after the `const isMobile = useIsMobile();` line (added in Task 3), add:

```typescript
useEffect(() => {
  if (!isMobile || collapsed) return;
  const prev = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => {
    document.body.style.overflow = prev;
  };
}, [isMobile, collapsed]);
```

- [ ] **Step 3: Typecheck**

Run:
```bash
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Expected: clean.

- [ ] **Step 4: Manual verification**

In the browser at 375px width:
- Open the chat bottom sheet (tap 💬). Try to scroll the report behind the backdrop — it should not scroll.
- Close the sheet (tap backdrop or ×). The report behind it should scroll normally again.
- At ≥ 768px (desktop): the chat sidebar opens/closes without touching body scroll.

- [ ] **Step 5: Commit**

```bash
git add src/report/app/sidebar/Sidebar.tsx
git commit -m "feat(report): lock body scroll while mobile chat sheet is open

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: TopBar mobile tweaks

**Files:**
- Modify: `src/report/app/TopBar.tsx`

- [ ] **Step 1: Replace TopBar.tsx with the mobile-aware version**

```typescript
import { COLORS } from "./theme";
import { useIsMobile } from "./hooks/useIsMobile";

/** Fixed height of the top bar — shared so the chat sidebar can sit below it. */
export const TOP_BAR_HEIGHT = 48;

interface Props {
  onOpenProfile: () => void;
  onToggleChat: () => void;
}

const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${COLORS.border}`,
  color: COLORS.textMuted,
  padding: "6px 9px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
};

export default function TopBar({ onOpenProfile, onToggleChat }: Props) {
  const isMobile = useIsMobile();
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: TOP_BAR_HEIGHT,
        boxSizing: "border-box",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: isMobile ? "0 12px" : "0 18px",
        background: COLORS.card,
        borderBottom: `1px solid ${COLORS.border}`,
        fontFamily: "system-ui, sans-serif",
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: COLORS.text,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        Portfolio Analyzer
      </span>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onToggleChat}
          aria-label="Toggle chat"
          title="Chat"
          style={iconBtn}
        >
          💬
        </button>
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="User Profile"
          title="User Profile"
          style={iconBtn}
        >
          👤
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Expected: clean.

- [ ] **Step 3: Manual verification**

- At 375px width: TopBar padding tighter; "Portfolio Analyzer" truncates if narrow; chat + profile icons stay visible on the right.
- At ≥ 768px: TopBar looks the same as before.

- [ ] **Step 4: Commit**

```bash
git add src/report/app/TopBar.tsx
git commit -m "feat(report): mobile top bar — tighter padding, ellipsis-truncated title

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: ProfileDrawer full-screen on mobile

**Files:**
- Modify: `src/report/app/sections/ProfileDrawer.tsx`

- [ ] **Step 1: Add the mobile-aware sizing**

In `src/report/app/sections/ProfileDrawer.tsx`, add the hook import near the other imports:

```typescript
import { useIsMobile } from "../hooks/useIsMobile";
```

Inside the `ProfileDrawer` component, after the existing `useState` calls and the load `useEffect`, add:

```typescript
const isMobile = useIsMobile();
```

- [ ] **Step 2: Change the drawer's dimensions based on `isMobile`**

In the same file, find the drawer `<div>` (the one with `role="dialog"`) and replace its `style` block with:

```jsx
style={{
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: isMobile ? "100vw" : 320,
  maxWidth: isMobile ? "100vw" : "90vw",
  background: COLORS.card,
  borderLeft: isMobile ? "none" : `1px solid ${COLORS.border}`,
  zIndex: 101,
  padding: "16px 18px",
  fontFamily: "system-ui, sans-serif",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  overflowY: "auto",
}}
```

Note: `overflowY: "auto"` stays. The form may exceed phone height; vertical scroll inside the drawer is acceptable (only horizontal scroll is forbidden).

- [ ] **Step 3: Typecheck**

Run:
```bash
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Expected: clean.

- [ ] **Step 4: Manual verification**

- At 375px: tap 👤. Drawer covers the full viewport. Save, Log out, and close all work.
- At ≥ 768px: drawer is the 320px side panel as before.

- [ ] **Step 5: Commit**

```bash
git add src/report/app/sections/ProfileDrawer.tsx
git commit -m "feat(report): full-screen ProfileDrawer on mobile

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: DimensionScorecard — collapsed-row mobile layout

**Files:**
- Modify: `src/report/app/sections/DimensionScorecard.tsx`

- [ ] **Step 1: Add mobile branch with collapsed rows**

Open `src/report/app/sections/DimensionScorecard.tsx`. Add at the top of the file alongside other imports:

```typescript
import { useState } from "react";
import { useIsMobile } from "../hooks/useIsMobile";
```

Replace the entire body of `export default function DimensionScorecard(...)` (everything from `const dimensions: DimensionScore[] = ...` through the closing `}`) with this:

```typescript
  const dimensions: DimensionScore[] = data.dimension_scores;
  const refs = data.reference_models;
  const dropped = data.dropped_dimensions ?? [];
  const yourColBg = "rgba(74, 159, 212, 0.06)";
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isMobile) {
    return (
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
        {dimensions.map((dim, i) => {
          const isOpen = expanded.has(dim.id);
          return (
            <div key={dim.id} style={{ borderBottom: i < dimensions.length - 1 || dropped.length > 0 ? `1px solid ${COLORS.border}` : undefined }}>
              <button
                type="button"
                onClick={() => toggleExpand(dim.id)}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  padding: "10px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  color: COLORS.text,
                  textAlign: "left",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                  <Dot rating={dim.rating} />
                  <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {dim.label}
                  </span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: COLORS.accentBlue, fontWeight: 600 }}>{dim.display_value}</span>
                  <span style={{ fontSize: 10, color: COLORS.textMuted }}>{isOpen ? "▾" : "▸"}</span>
                </span>
              </button>
              {isOpen && (
                <div style={{ padding: "0 14px 12px 36px", background: yourColBg }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: "italic", marginBottom: 6 }}>
                    {dim.note}
                  </div>
                  {refs.map((r) => {
                    const refScore = r.dimension_scores[dim.id] ?? 0;
                    const rating = toRating(refScore);
                    return (
                      <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0", color: COLORS.textMuted }}>
                        <span>{r.label}</span>
                        <span style={{ color: COLORS.text, display: "flex", alignItems: "center" }}>
                          <Dot rating={rating} />
                          <span>{refScore.toFixed(0)}</span>
                        </span>
                      </div>
                    );
                  })}
                  {onDiscuss && (
                    <button
                      type="button"
                      onClick={() => onDiscuss(dim.id)}
                      style={{
                        marginTop: 8,
                        background: "transparent",
                        border: `1px solid ${COLORS.border}`,
                        color: COLORS.textMuted,
                        padding: "4px 10px",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      💬 Discuss
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {dropped.map((dd) => (
          <div key={dd.id} style={{ padding: "10px 14px", borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 500 }}>{dd.label}</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: "italic", marginTop: 2 }}>
              Not graded for your risk profile · {dd.reason}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      overflow: "hidden",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, color: COLORS.textMuted, fontWeight: 500, width: "34%" }}>
              Dimension
            </th>
            <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, color: COLORS.accentBlue, fontWeight: 500, background: yourColBg }}>
              Yours
            </th>
            {refs.map(r => (
              <th key={r.id} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>
                {r.label}
              </th>
            ))}
            {onDiscuss && <th style={{ padding: "10px 14px", width: 40 }} />}
          </tr>
        </thead>
        <tbody>
          {dimensions.map((dim, i) => (
            <tr
              key={dim.id}
              style={{ borderBottom: i < dimensions.length - 1 ? `1px solid ${COLORS.border}` : undefined }}
            >
              <td style={{ padding: "9px 14px" }}>
                <div style={{ fontSize: 13, color: COLORS.text, fontWeight: 500 }}>{dim.label}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                  {dim.note.length > 60 ? dim.note.slice(0, 57) + "..." : dim.note}
                </div>
              </td>
              <td style={{ padding: "9px 14px", background: yourColBg }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <Dot rating={dim.rating} />
                  <span style={{ fontSize: 12, color: COLORS.text }}>{dim.display_value}</span>
                </div>
              </td>
              {refs.map(r => {
                const refScore = r.dimension_scores[dim.id] ?? 0;
                const rating = toRating(refScore);
                return (
                  <td key={r.id} style={{ padding: "9px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <Dot rating={rating} />
                      <span style={{ fontSize: 12, color: COLORS.text }}>{refScore.toFixed(0)}</span>
                    </div>
                  </td>
                );
              })}
              {onDiscuss && (
                <td style={{ padding: "9px 14px", textAlign: "right" }}>
                  <button
                    type="button"
                    onClick={() => onDiscuss(dim.id)}
                    title={`Discuss ${dim.label}`}
                    style={{
                      background: "transparent",
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.textMuted,
                      padding: "2px 6px",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    💬
                  </button>
                </td>
              )}
            </tr>
          ))}
          {dropped.map((dd) => (
            <tr key={dd.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <td style={{ padding: "9px 14px" }}>
                <div style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 500 }}>
                  {dd.label}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                  {dd.reason}
                </div>
              </td>
              <td
                colSpan={1 + refs.length + (onDiscuss ? 1 : 0)}
                style={{ padding: "9px 14px", fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}
              >
                Not graded for your risk profile
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Expected: clean.

- [ ] **Step 3: Manual verification**

- At ≥ 768px: section 3 still shows the desktop table (unchanged).
- At 375px: section 3 shows a list of expandable rows. Each row: rating dot · dimension name · "Yours" value · ▸. Tap a row → expands to show the dimension note (italic) and the 3 reference-model rows. Multiple rows can be open at once. "💬 Discuss" button appears at the bottom of the expanded content.
- "Not graded for your risk profile" rows still render at the bottom on mobile.
- No horizontal scroll.

- [ ] **Step 4: Commit**

```bash
git add src/report/app/sections/DimensionScorecard.tsx
git commit -m "feat(report): DimensionScorecard collapsed-row layout on mobile

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Chart sizing — RadarChart + AllocationBreakdown fit container width

**Files:**
- Modify: `src/report/app/sections/RadarChart.tsx`
- Modify: `src/report/app/sections/AllocationBreakdown.tsx`

- [ ] **Step 1: Read the current chart components to identify fixed sizes**

```bash
grep -n "width\|height\|aspectRatio\|maintainAspectRatio" src/report/app/sections/RadarChart.tsx src/report/app/sections/AllocationBreakdown.tsx
```

- [ ] **Step 2: Make the RadarChart container responsive**

Open `src/report/app/sections/RadarChart.tsx`. The current component renders a Chart.js Radar inside some wrapper. Locate the wrapper that sets the chart's width/height. Replace its size-setting style block with one that:

- Sets `width: "100%"` and a CSS `aspectRatio: "1 / 1"` on the wrapper div.
- Passes `options={{ ..., responsive: true, maintainAspectRatio: false }}` to the Radar component.

Concrete diff: find the outermost wrapper around the `<Radar />` component and ensure it includes:

```jsx
<div style={{ width: "100%", aspectRatio: "1 / 1", maxWidth: 460, margin: "0 auto" }}>
  <Radar
    data={...}
    options={{
      responsive: true,
      maintainAspectRatio: false,
      // ...existing options
    }}
  />
</div>
```

If the existing code already has `responsive: true` and `maintainAspectRatio: false`, only the wrapper style needs to change.

- [ ] **Step 3: Make the AllocationBreakdown pie chart fit container width**

Open `src/report/app/sections/AllocationBreakdown.tsx`. Find the chart container (a `<div>` that wraps the Pie/Doughnut chart). Apply the same pattern:

```jsx
<div style={{ width: "100%", maxWidth: 360, aspectRatio: "1 / 1", margin: "0 auto" }}>
  <Pie
    data={...}
    options={{
      responsive: true,
      maintainAspectRatio: false,
      // ...existing options
    }}
  />
</div>
```

- [ ] **Step 4: Typecheck**

Run:
```bash
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Expected: clean.

- [ ] **Step 5: Manual verification**

- At 375px: radar chart and allocation pie both fit comfortably inside the column with margin; no horizontal scroll; charts render as squares scaled to width.
- At ≥ 768px: charts look as they did before (capped at maxWidth, centered).

- [ ] **Step 6: Commit**

```bash
git add src/report/app/sections/RadarChart.tsx src/report/app/sections/AllocationBreakdown.tsx
git commit -m "feat(report): responsive chart containers fit narrow widths

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Action buttons full-width on mobile (situations, gaps, flags, next moves)

**Files:**
- Modify: `src/report/app/sections/OpenSituations.tsx`
- Modify: `src/report/app/sections/Gaps.tsx`
- Modify: `src/report/app/sections/Flags.tsx`
- Modify: `src/report/app/sections/NextMoves.tsx`

- [ ] **Step 1: Inspect the current button rows to find any that look cramped at narrow widths**

```bash
grep -n "button\|onClick" src/report/app/sections/OpenSituations.tsx src/report/app/sections/Gaps.tsx src/report/app/sections/Flags.tsx src/report/app/sections/NextMoves.tsx | head -60
```

For each section, identify the action-button container (the `<div>` holding "Track" / "Discuss" / "Resolve" / "Refresh verdict" / "💬" etc.). On mobile, that container should switch from `display: flex; gap: 8px;` to `display: grid; grid-template-columns: 1fr;` so buttons stretch full-width vertically.

- [ ] **Step 2: Apply the pattern in each section**

In each of the four files:

1. Add the import at the top (if not already present):
   ```typescript
   import { useIsMobile } from "../hooks/useIsMobile";
   ```

2. Inside the relevant component, add (near other state):
   ```typescript
   const isMobile = useIsMobile();
   ```

3. For each row of action buttons, wrap (or modify the existing wrapper) so that:
   ```jsx
   <div
     style={{
       display: isMobile ? "grid" : "flex",
       gridTemplateColumns: isMobile ? "1fr" : undefined,
       gap: 8,
       marginTop: 10,
     }}
   >
     {/* ...existing buttons */}
   </div>
   ```

4. For each `<button>` inside that row, ensure the existing inline `style` does **not** set a fixed `width` that would override the grid behavior. If a button has `width: 200` or similar, remove it on mobile by conditionally setting:
   ```jsx
   width: isMobile ? "100%" : undefined,
   ```

- [ ] **Step 3: Typecheck**

Run:
```bash
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Expected: clean.

- [ ] **Step 4: Manual verification**

- At 375px: each Situation, Gap, Flag, and Next-Move card has its action buttons stacked vertically, each filling the width of the card.
- At ≥ 768px: buttons sit side-by-side as before.

- [ ] **Step 5: Commit**

```bash
git add src/report/app/sections/OpenSituations.tsx src/report/app/sections/Gaps.tsx src/report/app/sections/Flags.tsx src/report/app/sections/NextMoves.tsx
git commit -m "feat(report): full-width action buttons on mobile cards

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: No-scrollbars audit

**Files:** all React app source.

- [ ] **Step 1: Grep for any horizontal-scroll patterns introduced or pre-existing**

Run:
```bash
grep -rn "overflow-x\|overflowX\|overflow: auto\|overflow: scroll" src/report/app
```

For each match, evaluate whether it can cause a horizontal scrollbar at narrow widths.

- [ ] **Step 2: Eliminate any horizontal scrollers**

For each finding:
- If the styling is `overflowX: "auto"` or similar — replace with `overflowX: "hidden"` AND ensure content fits via wrapping/shrinking/collapsing.
- If `overflow: "auto"` (both axes), audit whether horizontal scroll is needed; if not, change to `overflowY: "auto"` only.
- Leave `overflowY: "auto"` alone — vertical scroll inside containers is acceptable.

- [ ] **Step 3: Walk every section at 375px and verify no horizontal scrollbar**

In the browser at 375px width, scroll through the full report (all 9 sections + situations + chat). At no point should the body or any container produce a horizontal scrollbar. Resize down to 320px (a worst-case width) and re-check.

- [ ] **Step 4: Commit any changes**

```bash
git add -p src/report/app
git commit -m "fix(report): eliminate horizontal scroll on narrow widths

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

If no changes were needed in step 2, skip the commit.

---

## Task 11: PWA manifest

**Files:**
- Create: `src/report/app/public/manifest.json`

- [ ] **Step 1: Create the public directory and manifest file**

The directory `src/report/app/public/` does not yet exist. Create it:

```bash
mkdir -p src/report/app/public/icons
```

Create `src/report/app/public/manifest.json` with this content:

```json
{
  "name": "Portfolio Analyzer",
  "short_name": "Portfolio",
  "description": "Personal portfolio analysis with AI advisor",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#111111",
  "theme_color": "#111111",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Relative paths (`.` for `start_url`/`scope`, no leading slash on icons) make the manifest work both at the dev base `/` and the production base `/finance/` without rewriting.

- [ ] **Step 2: Commit**

```bash
git add src/report/app/public/manifest.json
git commit -m "feat(report): PWA manifest with relative paths

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Icon generation script + generated icons

**Files:**
- Create: `scripts/generate-icons.ts`
- Create: `src/report/app/public/icons/icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`
- Modify: `package.json` — add `sharp` as devDependency.

- [ ] **Step 1: Install `sharp` as a devDependency**

```bash
npm install --save-dev sharp
```

Expected: package.json's `devDependencies` now includes `sharp`, and `package-lock.json` is updated.

- [ ] **Step 2: Write the icon generation script**

Create `scripts/generate-icons.ts`:

```typescript
/**
 * One-off icon generation for the PWA.
 * Run:  npx tsx scripts/generate-icons.ts
 * Reads:  Documentation/bis_cropped2.png (transparent-background BIS globe)
 * Writes: src/report/app/public/icons/icon-{180,192,512,512-maskable}.png
 */
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(REPO_ROOT, "Documentation/bis_cropped2.png");
const OUT_DIR = path.join(REPO_ROOT, "src/report/app/public/icons");

// Icon design (locked in spec):
//   - radial gradient background centered at 45% / 42%: #1f3c5a -> #111 at 75% radius
//   - globe inset at ~78% of icon size, centered
//   - floating "$" glyph (Georgia bold, color #b8d62a) at the bottom-right corner with subtle shadow
function svgTemplate(size: number, globePct: number, dollarPct: number): string {
  const globeSize = Math.round(size * globePct);
  const globeOff = Math.round((size - globeSize) / 2);
  const dollarSize = Math.round(size * dollarPct);
  const dollarRight = Math.round(size * 0.10);
  const dollarBottom = Math.round(size * 0.10);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="45%" cy="42%" r="75%">
      <stop offset="0%" stop-color="#1f3c5a"/>
      <stop offset="100%" stop-color="#111111"/>
    </radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="${Math.max(1, Math.round(size * 0.006))}" stdDeviation="${Math.max(1, Math.round(size * 0.012))}" flood-color="#000" flood-opacity="0.6"/>
    </filter>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <image href="${SRC.replace(/\\/g, "/")}" x="${globeOff}" y="${globeOff}" width="${globeSize}" height="${globeSize}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${size - dollarRight}" y="${size - dollarBottom}" text-anchor="end" font-family="Georgia, serif" font-weight="700" font-size="${dollarSize}" fill="#b8d62a" filter="url(#shadow)">$</text>
</svg>`;
}

async function renderIcon(size: number, outPath: string, opts: { maskable?: boolean } = {}) {
  // Maskable variants need extra safe-area padding around the content.
  const globePct = opts.maskable ? 0.62 : 0.78;
  const dollarPct = opts.maskable ? 0.18 : 0.24;
  const svg = svgTemplate(size, globePct, dollarPct);
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log(`wrote ${path.relative(REPO_ROOT, outPath)} (${size}x${size}${opts.maskable ? ", maskable" : ""})`);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await renderIcon(180, path.join(OUT_DIR, "icon-180.png"));
  await renderIcon(192, path.join(OUT_DIR, "icon-192.png"));
  await renderIcon(512, path.join(OUT_DIR, "icon-512.png"));
  await renderIcon(512, path.join(OUT_DIR, "icon-512-maskable.png"), { maskable: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Run the script**

```bash
npx tsx scripts/generate-icons.ts
```

Expected output:
```
wrote src/report/app/public/icons/icon-180.png (180x180)
wrote src/report/app/public/icons/icon-192.png (192x192)
wrote src/report/app/public/icons/icon-512.png (512x512)
wrote src/report/app/public/icons/icon-512-maskable.png (512x512, maskable)
```

- [ ] **Step 4: Visually inspect the generated icons**

Open each PNG in an image viewer. Confirm:
- Dark radial background (slightly lighter blue near top-left, fading to near-black `#111` at edges).
- BIS globe centered, taking ~78% of the icon (62% for the maskable variant).
- Green `$` (Georgia, bold) at the bottom-right with a subtle shadow.
- Maskable variant has noticeably more padding around the content.

If any icon looks wrong, adjust the relevant constants in `svgTemplate` or `renderIcon` and re-run.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-icons.ts package.json package-lock.json src/report/app/public/icons/
git commit -m "feat(report): generate PWA icons from BIS globe + script

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: PWA head tags in index.html

**Files:**
- Modify: `src/report/app/index.html`

- [ ] **Step 1: Add the PWA head tags**

In `src/report/app/index.html`, inside `<head>` (after the existing `<meta name="viewport">` line), add:

```html
    <meta name="theme-color" content="#111111" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="manifest" href="manifest.json" />
    <link rel="apple-touch-icon" href="icons/icon-180.png" />
```

The relative `href` values (`manifest.json`, `icons/icon-180.png`) resolve against the current page URL, so they work both at the dev base `/` and the production base `/finance/`.

- [ ] **Step 2: Manual verification**

Start the dev server:

```bash
npx vite src/report/app
```

In Chrome DevTools:
- Open the **Application** tab → **Manifest**. The manifest should be loaded and show the name, short_name, theme color, and icons.
- The icons should render in the Manifest tab preview (192, 512, and 512-maskable).
- Run **Lighthouse** (Application → Manifest, or Lighthouse panel) → check **Progressive Web App**. The "Installable" criteria should pass.

On iOS Safari (or DevTools' iOS simulator):
- Visit the dev URL.
- `Share → Add to Home Screen`. The icon should appear as `icons/icon-180.png` and the title as "Portfolio".

On Android Chrome:
- Visit the dev URL.
- The browser should show "Add to Home Screen" / "Install" prompt within a few visits.

- [ ] **Step 3: Commit**

```bash
git add src/report/app/index.html
git commit -m "feat(report): PWA head tags — manifest, theme color, apple-touch-icon

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Full responsive sweep & TS final check

**Files:** none (verification only).

- [ ] **Step 1: Run both typechecks clean**

```bash
npx tsc --noEmit
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Both must report no errors.

- [ ] **Step 2: Mobile verification checklist (375px and 414px in DevTools)**

Walk the full report at 375px, then 414px. For each item below, mark a pass before moving on.

- [ ] Top bar visible and sticky; "Portfolio Analyzer" truncates with `…` if it overflows; 💬 and 👤 buttons visible.
- [ ] Header (grade / score / headline summary) reads cleanly without horizontal overflow.
- [ ] **Open Situations** cards stack; action buttons (Discuss / Refresh verdict / Mark resolved) are full-width.
- [ ] **Section 1 — Allocation breakdown.** Pie chart fits container width as a square. Breakdown rows stack.
- [ ] **Section 2 — Benchmark comparison.** All 4 cards stack readably.
- [ ] **Section 3 — Dimension scorecard.** Collapsed-row list. Each row: dot · name · value · ▸. Tap to expand → shows note + reference rows + "💬 Discuss" button.
- [ ] **Section 4 — Key findings.** Prose reads cleanly.
- [ ] **Section 5 — Radar.** Chart renders as a square fitting the column width.
- [ ] **Section 6 — Additional takeaways.** Prose reads cleanly.
- [ ] **Section 7 — Gaps.** Cards stack; "💬" / action buttons full-width.
- [ ] **Section 8 — Flags.** Cards stack; "💬" / action buttons full-width.
- [ ] **Section 9 — Next moves.** Cards stack; "Track" / "Discuss" buttons full-width.
- [ ] **No horizontal scrollbar anywhere** at 375px, 414px, or 320px.

- [ ] **Step 3: Bottom-sheet chat verification (375px)**

- [ ] Tap 💬 in top bar → bottom sheet slides up to 85% viewport height with backdrop.
- [ ] Backdrop dims the report behind. Tapping the backdrop closes the sheet.
- [ ] Tap × in sheet header → sheet closes.
- [ ] Scope bar ("Discussing: X") renders when scope ≠ "global".
- [ ] Sending a chat message works; assistant response streams.
- [ ] "New" button clears the chat history.
- [ ] Tool-proposal cards render inside the sheet without overflow.
- [ ] While the sheet is open, the report behind it cannot be scrolled. After closing, page scroll restored.

- [ ] **Step 4: ProfileDrawer verification (375px)**

- [ ] Tap 👤 in top bar → drawer covers full viewport.
- [ ] Age + risk tolerance fields render and are editable.
- [ ] Save button works; "Saved" message appears.
- [ ] Log out link is visible at the bottom.
- [ ] × button closes the drawer.

- [ ] **Step 5: Desktop verification (≥ 768px)**

Resize to 1280×800.

- [ ] Layout looks identical to current `main`. Two-column grid (main + 340px sidebar). TopBar padding `0 18px`. ProfileDrawer is a 320px side panel.
- [ ] DimensionScorecard renders as the desktop table.
- [ ] All charts at their previous sizes.

- [ ] **Step 6: PWA installability verification**

In Chrome DevTools → Lighthouse → run a PWA audit. **Installable** criteria pass:
- [ ] Manifest loads.
- [ ] Manifest has `name`, `short_name`, `start_url`, `display`, icons covering 192 and 512.
- [ ] Theme color set.

- [ ] **Step 7: Commit any tweaks discovered during sweep**

If the sweep surfaced bugs that warranted fixes, commit them now:

```bash
git add -p
git commit -m "fix(report): mobile polish from full responsive sweep

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

If no fixes were needed, skip this step.

---

## Done

The branch `phase4-mobile-pwa` is ready for review.

**Suggested PR title:** `feat(report): Phase 4 — mobile responsive + PWA installability`

**PR body** should reference `docs/superpowers/specs/2026-05-21-phase4-mobile-pwa-design.md` and link to the manual-verification checklist in Task 14.
