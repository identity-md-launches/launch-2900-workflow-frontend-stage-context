# SqueekMatch design system

## Overview

SqueekMatch is a working tool for Squeek holders who need a merge partner. The interface uses warm paper, forest-green text and a simple pair of hamster illustrations. Utility comes first: wallet connection, address lookup and the active task precede explanatory content. This visual direction was inferred for this assignment, not presented as requester-approved branding.

The source of truth is `web/src/styles.css`. `web/src/components.tsx` defines the shared field, dialog, address, notice and empty-state patterns. The application has a single light theme with no theme switch. Safety states use explicit words and symbols alongside color.

## Colors

CSS uses a small hex palette with semantic aliases; components use role tokens rather than reaching into primitives.

| Role token | Final value | Use |
| --- | --- | --- |
| `--page` | `#f7f7f0` | Canvas |
| `--surface` | `#fffef9` | Forms, order lists, dialogs |
| `--subtle` | `#eeefe4` | Quiet group backgrounds, level icons |
| `--line` | `#dedfd2` | Structural separators and surface borders |
| `--control-line` | `#7e8b77` | Input and button boundaries; stronger than separators |
| `--text` | `#203c31` | Main text and headings |
| `--muted` | `#607065` | Supporting text and table headers |
| `--action` | `#234738` | Primary action background, links |
| `--action-text` | `#fffef9` | Text on primary actions |
| `--selected` | `#e5edb0` | Current navigation, successful steps, merge result |
| `--focus` | `#315f9a` | Two-pixel keyboard outline, four-pixel offset |
| `--warning-bg` / `--warning-text` | `#fcf2dc` / `#755016` | Paused or unverified transactions |
| `--error-bg` / `--error-text` | `#fcebe5` / `#913c29` | Recoverable form, RPC and wallet errors |

Successful identity checks use the neutral surface/text roles; the amber verification panel is reserved for checking/paused states. Selected navigation and segmented controls also have a two-pixel underline, so selection does not depend on their light fill.

The final probe measured rendered text against resolved backgrounds and passed its 4.5:1 normal / 3:1 large text checks. Explicit measured pairs include main text/page 11.14:1, muted/surface 5.20:1, warning text/background 6.47:1, error text/background 6.30:1 and focus/surface 6.43:1. Exact measurements and limits are in `frontend/VALIDATION.md`; these are identified pairs, not a claim that every possible state has been manually measured.

## Typography

The self-hosted variable DM Sans font comes from `@fontsource-variable/dm-sans`; WOFF2 files are bundled by Vite. The fallback is DM Sans, then system UI and sans-serif. Only normal style is used; requested weights are 400, 500 and 700, within the variable font's range.

| Token | Size | Role |
| --- | --- | --- |
| `--text-sm` | 0.875rem / 14px | Navigation, labels, hints, data rows, notices |
| `--text-base` | 1rem / 16px | Body, fields, h3 |
| `--text-lg` | 1.125rem / 18px | h2 and empty-state headings |
| `--text-xl` | 1.5rem / 24px | Brand on desktop, modal headings, balances |
| `--text-display` | 2rem / 32px | Mobile h1 and portfolio numbers |
| `--text-title` | 2.5rem / 40px | Desktop h1 |

The h1 is the heaviest text, weight 700 and line-height 1.1. Its tracking is -0.045em on desktop and -0.04em on phones. h2 is weight 500, line-height 1.4 and -0.02em tracking; h3 is weight 500 and line-height 1.5. Body copy uses line-height 1.5 and a 70ch maximum. Headings balance; prose wraps prettily where supported. Fallback wrapping still works without those CSS features.

Inputs remain 16px to avoid automatic iOS input zoom. Amounts, positions and order prices use tabular numbers. Addresses use `bdi`, wrap in full views and retain a complete explorer label and copy control when shown short. Token amounts preserve every decimal base unit, including values smaller than 0.0001 SQK. Critical values are never clipped with ellipsis or hidden overflow. Root font smoothing is applied once.

## Layout

`App.tsx` owns the shared shell and task navigation. The shell is at most 1320px wide, centered, with 40px desktop inline padding. The normal workspace has a flexible primary column, a 312px aside and a 28px gap. Spacing generally uses multiples of four with two-pixel optical/density adjustments: 8–12px within controls, 18–20px within forms, and 24–32px between groups.

Actual breakpoints in `styles.css`:

- At 70rem and below, shell padding becomes 28px, aside 280px, workspace gap 22px and surfaces 22px.
- At 56rem and below, the workspace becomes one column, the aside becomes two columns and shell padding is 24px. Navigation icons yield room to text.
- At 40rem and below, shell padding is 16px, navigation is a three-column grid across two rows, surfaces use 20px padding and a 16px radius, forms use one column, and the aside stacks at full width. The wallet sheet docks to the bottom and respects the bottom safe area.

Order and holder rows wrap rather than scroll sideways. The planner's inventory uses five columns on large screens and three on phones. Fields and columns have zero minimum inline size where shrinking is required. The price summary is a native table; when no orders exist, it is behind the visible “View all levels” disclosure so the identity state moves upward. This is progressive disclosure, not removal of market data.

Rendered checks cover 320, 390, 820 and 1440 CSS-pixel widths, all five views, full addresses and a very large SQK value. The default main action is above the fold at 390 × 844. Text enlargement to 200% was checked separately from native browser zoom.

## Elevation & Depth

The interface is deliberately flat. Surface borders communicate structure; there are no shadows on cards and no cards nested inside cards. The native dialog alone uses `0 20px 80px #1f382d35` elevation and no border. Its backdrop is `#1c30246b`. No sticky or floating action covers the page.

## Shapes

Desktop surfaces use an 18px radius, mobile surfaces 16px, buttons 10px, inputs 9px, tags 6px and dialogs 20px. Level icons are compact rounded squares; step counters are circles. Form controls are inset from the viewport and card edges. The brand mark and original decorative partner SVG are local assets at `web/public/favicon.svg` and `web/public/partners.svg`.

## Components

| Source / pattern | Use and states |
| --- | --- |
| `components.tsx` · `Field` | Visible label bound to the native input/select, separate described hint, retained validation description. Used across all forms. |
| `components.tsx` · `Modal` | Native dialog: background inertness, focus containment, Escape/backdrop/close, opener focus restoration. Busy prompts block dismissal. |
| `components.tsx` · `AddressLink` | Checksummed display, full explorer name, copy feedback in a polite status region; `full` exposes the whole wrapping address. |
| `components.tsx` · `Notice` | Info, warning, error and success roles. Errors are persistent alerts; notices never silently auto-dismiss. |
| `components.tsx` · `Empty` | Identifies the missing data and offers the next task; decorative art has empty alt text. It never seeds fake holdings or orders. |
| `Wallet.tsx` · wallet sheet | One header control, discovered provider marks/names, Coinbase and phone app links; per-row opening state, rejection recovery, connected address/disconnect and wrong-chain switch. |
| `Transactions.tsx` · transaction review | One exact step at a time, explicit approval amounts, simulation/signing/receipt/refresh states, persistent errors and explorer receipts. An unconfirmed submitted hash offers confirmation lookup instead of resubmission. |
| `Trade.tsx` · order forms and rows | Shared segmented selection, SQK units, explicit escrow/custody/expiry copy, stale/expired/fillable/closed states and seller reward acknowledgment. |
| `Merge.tsx` · merge preview | Survivor/donor facts, current and future power, cooldown, separate claim action and explicit permanent-burn acknowledgment. |
| `App.tsx` · identity panel / market table | Text and symbols for verification; expected/observed details with wrapping addresses; semantic level/floor/bid table and empty-book disclosure. |

Controls have rest, hover, active, disabled and visible focus states. Main touch actions are at least 44px high; wallet rows are 52–56px. Smaller copy utilities and inline links meet the probe's minimum/spacing rule. Hover styles are gated to hover-capable pointers. Motion is limited to 120ms background/press feedback and a loading icon, with named transition properties and `prefers-reduced-motion` support. There are no page-load entrances or auto-playing decorative animations.

## Do's and don'ts

Start a new task view inside `primary-column` with `surface`, `section-head`, `Field`, `stack` and the existing action styles. Keep one filled primary task action; the header wallet control stays a quiet outline. Reuse semantic roles rather than inventing a nearby color. Add explanatory copy beside the action whose consequence it describes.

Preserve the distinction between an indexed possible partner, a fillable order and a verified transaction target. Keep unavailable data explicit; never replace it with zero, a synthetic market or an estimated dollar price. Keep wallet/network/identity gates and dry-run handling in front of signing. Do not introduce a second address/chain map or a second font/theme system for a new page.

Design guidance is adapted from Better Interface and the Impeccable documentation method; notices and licenses are in `frontend/licenses/`. This document lives under `docs/` because the assignment's overriding write scope forbids creating root `DESIGN.md`.
