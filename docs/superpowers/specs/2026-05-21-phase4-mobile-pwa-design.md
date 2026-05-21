# Phase 4 — Mobile Responsive + PWA Installability — Design

**Date:** 2026-05-21
**Status:** Approved architecture, pending spec review
**Topic:** Make the deployed report usable on a phone and installable as a PWA

**Source spec this extends:** `docs/superpowers/specs/2026-05-18-hosted-report-design.md` (the "Phase 4 — PWA polish" item in the suggested implementation phasing).

## Summary

The hosted report (live at `finance.bis-corp.com` since the `v1 deployment` commit) is desktop-only today. The fixed two-column layout (main + chat sidebar) doesn't collapse, dense tables don't fit narrow widths, and there's no manifest, so the app can't be added to a phone's home screen.

This phase delivers two pieces:

1. **A responsive pass** so every UI surface — the 9 report sections, TopBar, ProfileDrawer, and chat sidebar — works on a phone (≈ 375–414px wide) without horizontal scrolling.
2. **PWA installability** — `manifest.json`, app icons, theme color, and the `<head>` tags that make iOS Safari and Android Chrome treat the app as installable.

A **service worker** is explicitly **out of scope** for this phase — it's deferred to a future phase to keep the SW lifecycle complexity contained.

## Goals

1. The report reads cleanly on a phone in portrait orientation. All 9 sections, the chat sidebar, and the profile drawer are usable.
2. The app is installable as a PWA from iOS Safari and Android Chrome. Launching the installed app opens in standalone mode (no browser chrome) with the correct theme color.
3. The desktop experience at ≥ 768px is **unchanged** from current `main`.

## Non-goals

- Service worker / offline app shell. (Future phase.)
- A native mobile app.
- Landscape phone optimization beyond "doesn't break."
- Tablet-specific layouts. Tablets (≥ 768px) get the desktop layout.
- Changes to the analyze pipeline, the C# API, or any AI logic.

## Hard constraints

- **No scrollbars anywhere.** No horizontal scroll on tables, charts, code blocks, or chat. Content shrinks, wraps, or collapses to fit width. Vertical page scroll is fine.
- **Desktop unchanged.** At widths ≥ 768px the rendered DOM and styles match `main` byte-for-byte where reasonable; any regressions are bugs.

## Architecture

### Single breakpoint at 768px

One boundary keeps things sane. < 768px = mobile layout. ≥ 768px = current desktop layout, unchanged. Tablets in portrait land at exactly 768px, which is fine — they have room for desktop.

### `useIsMobile()` hook drives layout switches

The codebase uses inline `style={{}}` throughout — no Tailwind, no CSS modules, no styled-components. Adding a CSS file just for media queries would clash with the existing idiom. Instead, components read a hook:

```ts
// src/report/app/hooks/useIsMobile.ts (new)
export function useIsMobile(): boolean;
```

Implementation: wraps `window.matchMedia("(max-width: 767.98px)")` with a `useSyncExternalStore` subscription so components re-render when the boundary is crossed. Components branch on `useIsMobile()` to choose layout — same pattern as the existing `useState`-driven UI flags.

Re-renders fire only on boundary crossings (rare in practice — usually rotation), so cost is negligible. The hook is used at layout-decision level only, not deep in component trees.

### File-level impact

| File | Change |
|---|---|
| `src/report/app/hooks/useIsMobile.ts` | **New** — the hook |
| `src/report/app/App.tsx` | Grid switches: desktop `1fr auto`, mobile single column (sidebar overlays, not in flow) |
| `src/report/app/sidebar/Sidebar.tsx` | On mobile, renders as a bottom sheet (fixed position, slides up from bottom). Desktop behavior unchanged. |
| `src/report/app/sections/ProfileDrawer.tsx` | On mobile, full-screen sheet instead of side drawer |
| `src/report/app/sections/DimensionScorecard.tsx` | On mobile, render the collapsed-row layout instead of the table |
| `src/report/app/TopBar.tsx` | Tighter spacing; chat/profile buttons icon-only on mobile |
| Other section files | `useIsMobile()`-driven tweaks where needed (padding, font sizes, chart sizing) |
| `src/report/app/index.html` | `<link rel="manifest">`, theme-color meta, `apple-touch-icon`, iOS PWA meta tags |
| `src/report/app/public/manifest.json` | **New** — PWA manifest |
| `src/report/app/public/icons/icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` | **New** — generated icons |
| `scripts/generate-icons.ts` | **New** — one-off script that produces the icon PNGs from `Documentation/bis_cropped2.png` |

### What stays untouched

- The C# API (`api/PortfolioReport.Api/`). The manifest and icons are pure static assets served from `wwwroot/`.
- The analyze pipeline (`src/index.ts`, `src/engine/*`, `src/intake/*`).
- All AI logic (`src/ai/*`, `src/report/app/ai/*`).
- The 9 report section components' content and behavior — only their layout/styling adapts.

## Per-surface responsive behavior

### Bottom-sheet chat (the biggest single change)

On mobile, `Sidebar.tsx` renders itself as a bottom sheet instead of a right column.

- Container: `position: fixed; left: 0; right: 0; bottom: 0; height: 85dvh`. Falls back to `vh` on browsers without dynamic viewport units.
- Open/close: CSS transition on `transform: translateY(...)`, 240ms ease.
- Header inside the sheet: small decorative grab handle, "Chat" title, ✕ button.
- The existing scope bar ("Discussing: <X>") stays at the top of the sheet, below the header.
- Backdrop: `position: fixed; inset: 0; background: rgba(0,0,0,0.4)`; click dismisses.
- Body scroll lock while open: set `document.body.style.overflow = "hidden"` on open, restore on close. Cleanup in the effect's return.
- Two states only: **closed** (sheet translated off-screen, backdrop hidden) and **open** (sheet at 85% viewport height with backdrop). Drag-to-resize is **not** in scope.
- Existing chat input, message rendering, and tool-proposal cards work as-is — only the container changes.

### ProfileDrawer — full-screen sheet on mobile

Same component, conditional sizing.

- Desktop: current side drawer, unchanged.
- Mobile: `position: fixed; inset: 0`; covers the whole viewport.
- Top of the mobile sheet: "Profile" title with a left-aligned "←" close button.
- "Log out" stays at the bottom of the form. Backdrop behavior identical to bottom sheet.

### TopBar mobile

- Padding reduced to `8px 12px`.
- "User Profile" and "Chat" labels drop to icons only (👤 and 💬). `aria-label` preserved for screen readers.
- Account label truncates with ellipsis if it overflows.
- Sticky at top: `position: sticky; top: 0; z-index: 10` (already current behavior — unchanged on mobile).

### DimensionScorecard — collapsed-row layout on mobile

The desktop table is 5 columns wide (Dimension · Yours · Boglehead · All-Weather · 60/40) and won't fit a phone. On mobile, it becomes a list of expandable rows:

- Each row: rating dot · dimension name (left) · "Yours" value · caret (right).
- Tap a row → expands inline to show: the dimension note (italic) + the 3 reference-model values.
- Multiple rows can be expanded simultaneously. State: `const [expanded, setExpanded] = useState<Set<string>>(new Set())` keyed by dimension `id`.
- The desktop table is preserved at ≥ 768px.

### Other sections — per-section treatment

| Section | Mobile change |
|---|---|
| Header (grade / score / headline) | Already vertical — h1 shrinks 22 → 18px, headline body 14 → 13px |
| 1. Allocation breakdown | Pie chart fills container width via Chart.js `maintainAspectRatio: false`, fixed height ~220px. Breakdown rows already stack. |
| 2. Benchmark comparison | Already card-based; padding shrinks. Composition/philosophy text remains readable. |
| 3. Dimension scorecard | See above — swap to collapsed-row layout. |
| 4. Key findings | Already prose — padding/font tweaks only. |
| 5. Radar | Chart.js radar with `responsive: true, maintainAspectRatio: false`; container forced square via `aspectRatio: 1` on a wrapper div. Legend below instead of side on mobile. |
| 6. Additional takeaways | Prose only — padding tweaks. |
| 7. Gaps | Card list — stacks; 💬 button stays on the right of each card. |
| 8. Flags | Same as Gaps. |
| 9. Next moves | Cards stack vertically. "Track" / "Discuss" buttons full-width on mobile. |
| Open situations (above section 1) | Cards stack. "Refresh verdict" / "Discuss" / "Mark resolved" buttons stretch full-width on mobile. |

### Main container width

- Desktop: `maxWidth: 900px` (unchanged).
- Mobile: full width minus `padding: 1.25rem 1rem` (slight reduction from current `2rem 1rem`).

## PWA installability

### Manifest

`src/report/app/public/manifest.json`:

```json
{
  "name": "Portfolio Analyzer",
  "short_name": "Portfolio",
  "description": "Personal portfolio analysis with AI advisor",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#111111",
  "theme_color": "#111111",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`orientation: "portrait-primary"` is a hint; browsers may ignore it. The app still renders in landscape — see [Edge cases](#edge-cases).

### `index.html` additions

Inside `<head>`:

```html
<meta name="theme-color" content="#111111" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="manifest" href="/manifest.json" />
<link rel="apple-touch-icon" href="/icons/icon-180.png" />
```

### Icon design

- **Source:** `Documentation/bis_cropped2.png` (BIS corporate-logo globe, 932×830, transparent background).
- **Composition:**
  - Background: radial gradient from `#1f3c5a` (centered at 45% 42%) to `#111` (75% radius).
  - Globe: source image scaled to fill ~78% of the icon frame, centered.
  - Badge: floating green `$` glyph at bottom-right corner. Georgia serif, bold. Color `#b8d62a` (the green from the underline beneath "bis" in the corporate logo). Subtle drop shadow `0 1px 3px rgba(0,0,0,0.6)`.
- **Sizes emitted:** 180×180, 192×192, 512×512, plus a 512×512 "maskable" variant (extra padding so Android adaptive-icon masks don't crop the globe).

### Icon generation script

`scripts/generate-icons.ts` (new) — one-off, run manually during implementation; PNGs are committed to the repo afterward.

- Reads `Documentation/bis_cropped2.png`.
- Uses `sharp` (devDependency only) to:
  - Resize the globe to the target inset size.
  - Composite onto a generated radial-gradient background tile of the target size (rendered via `sharp`'s `composite` with a pre-built gradient PNG, or via an SVG that sharp rasterizes).
  - Add the floating `$` glyph (rendered from SVG text via sharp).
- Writes PNGs to `src/report/app/public/icons/`.

`sharp` is added as a **devDependency only**; it never ships at runtime.

## Static-asset serving

The C# API already serves `wwwroot/` contents at the corresponding URL paths. The Vite build copies `src/report/app/public/*` into the build output, which `npm run build:api` then bundles into `wwwroot/`. So `/manifest.json` and `/icons/icon-*.png` are served at the right paths automatically — **no API change needed**.

## Local development

The Vite dev server serves `public/*` at the root by default, so `http://localhost:5173/manifest.json` and `http://localhost:5173/icons/*` work in dev exactly as they do in production. The existing Vite-to-API proxy for `/api/*` is unaffected.

## Testing strategy

Following the convention from `CLAUDE.md` ("The CLI orchestrator, narratives, and React UI are built without unit tests — verify them manually"), this phase keeps that posture. No unit tests for layout changes.

### Manual verification checklist

To be run before merging:

- Desktop ≥ 768px: every section visually unchanged from current `main`. Side-by-side comparison or screenshot diff.
- Mobile (375px and 414px widths — iPhone SE and iPhone 14 Pro): every section renders. No horizontal overflow. No scrollbars anywhere.
- Tablet (768px exactly): renders as desktop.
- Bottom-sheet chat: opens via TopBar 💬, closes via ✕ or backdrop, locks body scroll while open, restores on close.
- Tool-proposal cards render correctly inside the bottom sheet (full-width inside the sheet).
- ProfileDrawer: full-screen on mobile, side drawer on desktop. Save + Log out both work in both modes.
- DimensionScorecard: collapsed-row layout on mobile; rows expand/collapse independently; rating dot visible on the title row.
- Radar chart and allocation pie don't overflow at narrow widths.
- TopBar: icons-only on mobile; account label truncates with ellipsis.

### PWA verification

- Lighthouse PWA audit: passes "Installable" criteria.
- Chrome DevTools → Application → Manifest: renders the name, icons, theme color.
- "Add to Home Screen" prompt appears on Android Chrome.
- iOS Safari: `Share → Add to Home Screen` shows the icon and adds the app.
- Installed app launches in standalone mode (no browser chrome) with theme color `#111`.

### TypeScript verification

Per `CLAUDE.md`'s two-tsconfig convention:

```sh
npx tsc --noEmit
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Both must be clean.

## Edge cases

- **No service worker** ⇒ no SW lifecycle, no update prompts, no caching surprises. By design.
- **Orientation in landscape:** the manifest hints `portrait-primary`, but browsers may ignore. In landscape, phone widths are usually ≥ 668px and land in desktop layout (≥ 768px). Phones at exactly 667 (iPhone SE landscape) land in mobile layout — accepted as good-enough.
- **iOS Safari viewport-height jumps** as the URL bar shows/hides: the bottom sheet uses `dvh` (dynamic viewport height) with a `vh` fallback. Older browsers see a sheet that's slightly short — acceptable.
- **PWA + Google OAuth:** the existing Google OAuth cookie session is preserved across PWA standalone-mode launches by the browser. No code change required.
- **PWA + dev login bypass:** `DevAuthEndpoints.cs` is dev-only and isn't shipped to production, so this is a non-issue on the deployed site.
- **Older iOS (< 14):** PWA `display: standalone` still works via the `apple-mobile-web-app-capable` meta tag. Manifest features that older Safari ignores are graceful no-ops.

## Risks

- **Hook-triggered re-renders on rotation.** Components reading `useIsMobile()` re-render when the boundary is crossed. Chart-heavy sections could flicker. Mitigation: keep the hook narrowly used at layout decisions only; add `React.memo` on chart components if flicker is observed in testing.
- **Bottom sheet on iOS Safari** has historical viewport-height quirks. Using `dvh` with a `vh` fallback covers the common case; we verify in manual testing.
- **Icon-generation script complexity.** Compositing a transparent PNG onto a radial-gradient background with a glyph adds some code. Mitigation: the script is one-off; we commit the output PNGs and don't run it at build time. The implementation can use a pre-built SVG template (with the gradient, globe placeholder, and `$` glyph) that `sharp` rasterizes to PNGs at each size — avoids reimplementing gradients in `sharp` ops.

## Rollback

All work happens in a feature branch off `main`. The C# API is untouched, so reverting is `git revert <merge-sha>` — no DB migrations, no API contract changes, no schema changes.

## Suggested implementation phasing (single PR or two)

The architecture is committed as a whole; this is only a suggested build order.

1. **Mobile layout pass (no PWA yet).** `useIsMobile()` hook, App.tsx grid switch, bottom-sheet sidebar, ProfileDrawer mobile, TopBar mobile, DimensionScorecard collapsed-row layout, per-section tweaks. Manual verification on phone widths.
2. **PWA installability.** Manifest, icons (generated and committed), `index.html` head tags. Lighthouse + iOS/Android install verification.

These can ship together in one PR or split into two — there are no inter-dependencies. The plan that follows this design will lay out the tasks.
