# StockSense — Phase 1 Project Audit

Scope: `client/` (React 18 + Vite + Tailwind v4) and `server/` (Express + TypeScript JSON store).
Baseline verified before any change: `tsc -p client` ✅, `tsc -p server` ✅.

## A. Architecture as found

```
server/src  types.ts store.ts seed.ts engine.ts routes.ts auth.ts scenario.ts index.ts
client/src   App.tsx store.tsx api.ts types.ts index.css
             components/ ui.tsx shell.tsx chrome.tsx overlays.tsx CommandPalette.tsx ErrorBoundary.tsx
             pages/      Dashboard Receipts Deliveries Transfers PhysicalCounts Ledger Products Warehouses Settings Login
```

The existing skeleton is sound: a real engine with a zero-floor guardrail, a net-zero transfer
invariant, a hierarchical roll-up, an append-only ledger, scrypt auth with per-role permissions and a
snapshot-driven React store. The gaps are almost entirely in the **domain model**, **breadth of
workflow**, and **information architecture** — not in the plumbing.

## B. Defect register

Severity: **S1** = wrong numbers / breaks a required workflow · **S2** = spec gap or dead UI ·
**S3** = polish, consistency, accessibility.

| # | Sev | File / component | Current behaviour | Expected behaviour | Root cause | Required change | Regression risk |
|---|-----|------------------|-------------------|--------------------|------------|-----------------|-----------------|
| 1 | S1 | `server/src/seed.ts` `products[].stock` | Quantities seeded on **container** keys (`WH/Stock1: 50`) while leaf bins also exist, so `stockAt()` roll-up semantics are load-bearing and easy to double count | Quantities only on leaf locations; containers roll up | Storage layer conflated "balance" with "bucket" | Re-seed to leaf-only balances; add a startup invariant check | Seed rewrite invalidates `db.json` → bump `SEED_VERSION` |
| 2 | S1 | `engine.ts` `postAdjustment` | `p.stock[doc.location] = counted` — **overwrites** a container key, double counting vs its children | Apply the delta to leaves so containers and leaves always agree | Assignment instead of delta | Convert to delta-driven reconciliation across leaves | Changes every count path |
| 3 | S1 | `engine.ts` `postAdjustment` | `state` jumps straight to `Posted`; `requiresDualSignoff()` is computed, returned to the UI, and never enforced | `Draft → Pending Approval → Approved → Posted`; stock moves only on `Posted` | Approval workflow was cosmetic | Add real approval states + `adjustment.approve` enforcement | Adjustments page + product quick-adjust |
| 4 | S1 | `routes.ts` `POST /adjustments` | Trusts client-supplied `recorded` (book quantity) | `recorded` recomputed server-side from live stock | Business logic in the UI | Delete the client field, derive on the server | `Products.tsx` quick-adjust |
| 5 | S1 | `types.ts` `Product.reserved` | Stored counter seeded to 20 kg reserved against 0 kg on hand → dashboard "Reserved 28" has no backing document | Reserved = Σ qty of deliveries in `Ready/Picking/Packed` | Reservation modelled as a mutable counter | Derive reservations from open deliveries | Dashboard, products, delivery posting |
| 6 | S1 | `engine.ts` `postTransfer` | No check that source and destination are in separate branches — transferring a parent into its own child silently double counts | Reject nested from/to pairs | Missing topological guard | Add `isNested()` guard | Transfer form |
| 7 | S1 | `engine.ts` `postReceipt` / `postDelivery` | A `Draft` or `Canceled` document can be posted; a `Picked` delivery cannot | Status machine enforced on every transition | Only terminal states guarded | Add transition tables per document type | All four operation pages |
| 8 | S1 | `seed.ts` ledger | `balanceAfter` does not reconcile with `products[].stock` (COP-WIR-50 ledger says 10, stock is 12); every date is `2024-11-04` | Ledger running balance must land exactly on current on-hand, 2026 dates | Seed written by hand, not derived | Generate history so the running balance is computed, not typed | Seed only |
| 9 | S1 | `types.ts` `LocationCode` | Declares `WH/Output/Dock-01`, which does not exist in `seed.locations` → orphan reference | Every referenced location exists | Hand-maintained union | Replace the closed union with `string` + runtime validation | Type-level only |
| 10 | S1 | `seed.ts` units | `spools` and `packs` are not valid UOM; `LBL-THM-406` is `Units` although a label roll is `Rolls` | Only `kg/Units/Boxes/Rolls/Litres/Metres/Pieces`, every product explicit | No UOM registry | Add a UOM module and a controlled `Units` fallback | Everywhere a unit renders |
| 11 | S1 | `seed.ts` SKUs / warehouses / locations | `CAB-CAT6-305`, `COP-WIR-50`, `LBL-THM-406`, `THM-PAD-99`, `DESK-CHR-01`; 3 warehouses incl. "Cold Storage Zone A"; `WH/Stock1`-style codes | The 10 canonical SKUs, 4 canonical warehouses, 9 canonical locations | Seed predates the requirement | Replace the seed with the canonical dataset | Whole demo narrative |
| 12 | S1 | `client/src/pages/Products.tsx` `QuickAdjustDrawer` | Creates **and approves** an adjustment in one click, bypassing the approval workflow | Create → Pending Approval; a manager approves separately | Prototype shortcut | Route through the real approval flow | Quick adjust button |
| 13 | S1 | `App.tsx` routes | `/receipts?new=1` and `/deliveries?new=1` (linked from the dashboard) match no route → **dead links** | `/receipts/new`, `/deliveries/new` | Query-string hack | Real routes | Dashboard actions |
| 14 | S1 | `App.tsx` routes | 12 of the 31 required routes missing: `/login`, `/products/:id`(id form), `/inventory`, `/inventory/location/:id`, `/low-stock`, `/reorder-rules`, `/receipts/new`, `/deliveries/new`, `/transfers/:id`, `/adjustments`, `/adjustments/:id`, `/counts/:id`, `/moves`, `/locations`, `/locations/:id`, `/reports`, `/notifications`, `/profile`, `/admin/diagnostics` | Full route table (Phase 44) | Prototype scope | Build all routes | Nav, links, search targets |
| 15 | S1 | `store.tsx` / `api.ts` | No notification store, no activity feed, no report service, no search endpoint — "dashboard / notification / report" reactivity does not exist | One shared state that every page reads | Not implemented | Add entities + endpoints + snapshot slices | Every page |
| 16 | S2 | `server/src/scenario.ts` + `chrome.tsx` `ScenarioBar` | A "guided walkthrough" that silently rewrites receipt lines and posts documents behind the user's back, requiring `transfer.post` | Real user-driven workflows; a demo **reset**, not a scripted mutation | Scripted demo replaced real flows | Remove; keep the canonical dataset + Reset Demo Data | Dashboard chrome |
| 17 | S2 | `Deliveries.tsx` | No picking or packing state; validation is a single button | `Waiting → Ready → Picking → Packed → Done` with per-line picked qty | Only a `Done` flag existed | Add line picking + packing checklist | Delivery detail |
| 18 | S2 | `PhysicalCounts.tsx` | Adjustment list wearing a "count" label; no count session, assignee, due date or count mode | Count document (warehouse, location, category, assignee, due) + count mode with large inputs | Counts were modelled as adjustments | Add the `Count` entity | Counts pages |
| 19 | S2 | `Transfers.tsx` | Flat table + a text "net-zero guarantee" list; no visual, no detail route, no before/after | Visual source ↓ destination, remaining, invariant proof, detail route | No transfer detail | Rebuild | Transfer pages |
| 20 | S2 | `Dashboard.tsx` | 4 KPIs, a moves table, a control-settings card. No attention centre, no timeline, no live indicator, no "what next" | 8 KPIs, Needs Attention, Operations Timeline, ● LIVE, next actions | Card collection | Rebuild per Phase 6 | Dashboard |
| 21 | S2 | `shell.tsx` `TopNav` search | Search box says "SKU, name, document ref…" but only matches product name/SKU; result uses `<a href="#/…">`; the bell fires a toast instead of opening a centre | Grouped cross-entity search; real notification centre | Search was a shortcut to one table | Real `/api/search` + drawer | Shell |
| 22 | S2 | `shell.tsx` `MobileNav` | Horizontal scrolling strip of 7 links | Bottom nav: Tasks, Scan, Stock, Transfers, More; large touch targets | No mobile mode | Rebuild | Mobile |
| 23 | S2 | `Settings.tsx` | Leaks `postDelivery()`, `postTransfer()`, `drainFifo()`, `postLedger()`, `stockAt()`, "HTTP 422", "rolled back", "API" to **all** users | Business language; technical detail only in Admin → Developer Diagnostics | Prototype doc dumped into UI | Rewrite in business language; move internals to diagnostics | Settings, Dashboard |
| 24 | S2 | `Deliveries.tsx` detail | `FIFO` chip + "deepest other holding bin" shown to warehouse staff | Plain language; internals in diagnostics | Same as above | Rewrite copy | Delivery detail |
| 25 | S2 | `server/src/auth.ts` `ROLE_PERMISSIONS` | Roles are Admin / Inventory Manager / Floor Supervisor / Warehouse Staff; there is **no Viewer**; UI hides buttons but handlers are unguarded on `Products.tsx`, `ProductDetail`, `Transfers` | 4 spec roles; permission checks inside action handlers, not only in JSX | Only some buttons were role-gated | Add Viewer, add handler-level guards | All mutating UI |
| 26 | S2 | — | No CSV export anywhere | CSV export for products, inventory, moves, receipts, deliveries, transfers | Not implemented | Shared `toCsv()` + `downloadCsv()` | Reports + lists |
| 27 | S2 | — | No Coming-Soon system; no `VITE_GITHUB_REPOSITORY_URL`; no Developer & Integrations section | One `ComingSoon` component, repo URL from env, disabled + tooltip when empty | Not implemented | Add component + integrations section | Settings, scan, integrations |
| 28 | S2 | `Dashboard.tsx` KPI `overdueDeliveries` | Counts a manually seeded `Overdue` status that nothing ever computes — a permanently stale number | `Overdue` derived from the scheduled date vs today | Status used as a static label | Compute lateness from dates | Dashboard, deliveries |
| 29 | S2 | — | No demo-mode indicator, no `Reset Demo Data` in Settings → Developer | Indicator in the top bar + reset in Settings | Not implemented | Add | Shell, Settings |
| 30 | S2 | `Login.tsx` | No `/login` route, no forgot-password, no OTP step | All three (QA checklist) | Not implemented | Add 3-step auth screen | Login |
| 31 | S3 | `ui.tsx` `TONES` | `Reconciled`, `Packed`, `Overdue`, `Blocked`/`Allowed` statuses fall through to the grey `Draft` tone | Every document state has a defined colour | Badge map out of sync with the status union | Rebuild tone map from the status model | Every badge |
| 32 | S3 | `index.css` | No `btn-ghost`, no `:focus-visible` ring, no skeleton shimmer, no `prefers-reduced-motion`, buttons below the 44px touch target on mobile | Phase 27/28/47 | Incomplete design system | Extend the design system | Global |
| 33 | S3 | `Products.tsx`, `Transfers.tsx` | Icon-only buttons with `title` but no `aria-label`; `<select>` without labels in several places | ARIA labels, semantic forms | Inconsistent | Add | A11y sweep |
| 34 | S3 | `App.tsx`, pages | Failure renders a bare `Empty`; no `Retry`, no skeletons for tables/cards/charts | ErrorState + Retry, skeletons everywhere | Not implemented | Add | Global |
| 35 | S3 | `store.ts` | `docSeq` fallbacks hardcoded (`receipt: 7`) while `load()` recomputes from refs — the two can disagree after a partial seed | One source of truth for sequence numbers | Duplicated logic | Derive from data only | New document refs |
| 36 | S3 | `Warehouses.tsx` | Technical topology page (location tree, roll-up explanation) | Operational warehouse page with stock value, products, utilisation, incoming, outgoing, health; detail with 8 tabs | Built from the data model, not the job | Rebuild | Warehouses |
| 37 | S3 | `api.ts` | `validateReceipt(ref, _user)` / `executeTransfer(ref, _user)` keep an unused `user` parameter "so existing call sites compile" | Remove dead parameters | Dead signature | Clean | api layer |

## C. Root causes (not symptoms)

1. **Balances were stored, not derived.** `Product.stock` mixed container and leaf keys and
   `Product.reserved` was a hand-maintained counter. Any read that forgot the roll-up produced a
   different number from any other read. → One rule: *quantities live on leaves; everything else
   (on hand, reserved, available, container roll-up, valuation) is derived.*
2. **Document status was a label, not a state machine.** Only `Done` was guarded, so drafts could be
   posted, approvals were cosmetic, and `Overdue` was typed in by hand.
3. **The demo was scripted instead of operable.** `scenario.ts` reached into documents and rewrote
   lines to force the arithmetic. Real workflows were therefore never exercised.
4. **Business logic lived in components.** Book quantity, FIFO language and approval thresholds were
   computed in the browser, so the UI could promise things the server would refuse.

## D. Repair strategy

Repair the layer that owns the rule, then let every page read it:

- `server/src/domain/*` becomes the only place stock, availability, status transitions and the ledger
  are written.
- `server/src/services/*` exposes one service per entity so components never compute business logic.
- `client/src/services/*` is a thin typed API surface; the React store keeps a single snapshot that
  every page derives from — no page owns a number.
- `client/src/components/design/*` is the single design system; a page that needs a button imports
  the same button as every other page.
