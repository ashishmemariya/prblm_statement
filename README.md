# StockSense ERP

Enterprise logistics & inventory system built from the StockSense wireframes.
React 18 + Vite front end, Express back end, JSON-file persistence.

The point of the build is that **every number on screen comes from the server**.
The browser never mutates stock; it asks the API to post a document and then
re-reads the snapshot.

---

## Run it

```bash
npm install
npm run dev
```

- Web  → http://localhost:5173
- API  → http://localhost:4000/api/health

Production build (API serves the built client on a single port):

```bash
npm run build
npm start        # → http://localhost:4000
```

### Other scripts

| Command | What it does |
| --- | --- |
| `npm run smoke` | 76 assertions against a running API (auth, roles, seed integrity, drill, guardrails, FIFO, hierarchy, ledger) |
| `npm run browser` | 36 assertions driving real Chrome over CDP (sign-in gate, palette, KPIs, every route, sign-out) |
| `npm run verify` | typecheck → smoke → browser |
| `npm run typecheck` | `tsc --noEmit` across both workspaces |
| `npm run reset` | Delete and reseed `server/data/db.json` |

> On Windows the `node_modules/.bin` shims may not be created, so every script
> invokes its tool through `node <entry-point>` instead of a bare binary name.

---

## Signing in

Authentication is real: passwords are stored as **scrypt** hashes with a
per-user salt and compared in constant time, and every mutation is attributed to
the session user rather than to anything the browser sends.

| Account | Role | Password |
| --- | --- | --- |
| `demo@stocksense.app` | Inventory Manager | `Demo@1234` |
| `priya@stocksense.app` | Warehouse Staff | `Demo@1234` |
| `arjun@stocksense.app` | Floor Supervisor | `Demo@1234` |
| `admin@stocksense.app` | Admin | `Admin@1234` |

The sign-in screen lists these accounts and signs you in with one click.

**Roles are enforced on the server**, not just hidden in the UI. `ROLE_PERMISSIONS`
in `server/src/auth.ts` maps each role to a capability list, and every mutating
route is wrapped in `requirePermission(...)`. A Warehouse Staff account calling
the adjustment-approval endpoint gets a **403** naming their role. Client-side
hiding is a convenience; the server is the boundary.

Password material lives in a separate `credentials` map, never on the `User`
record, so any code path that serialises users — the snapshot, `/api/users`, the
sign-in directory — cannot leak a hash by forgetting a projection. The smoke
suite asserts this.

`GET /api/diagnostics` is the only place backend guardrails are described in
technical terms, and it requires the Admin role.

---

## The seeded system

The database is not a hand-typed fixture. `seed.ts` declares a set of **moves**
(opening balances plus the posted documents) and then *derives* both the ledger
and every product's on-hand map by replaying them. A quantity can therefore
never disagree with the history that produced it.

It ships in the **live** state — a 2026 operational snapshot, not an empty
system:

| | |
| --- | --- |
| Catalogue | 10 SKUs |
| On hand | 331 across mixed units (kg, units, rolls) |
| Valuation | ₹9,96,950 |
| Low stock | 4 (`MON-DEL-24`, `ACC-LOG-M18`, `CAB-CAT6-305`, `LBL-THM-406`) |
| Out of stock | 0 — the dashboard says so rather than showing a fake count |

`STL-ROD-12` opens at **77 kg**, sitting in `WH-Production`, with its whole story
already in the ledger:

```
ADJUSTMENT  ADJ-4001     Δ  -3   bal=77   by Rahul Sharma
DELIVERY    WH/OUT/0001  Δ -20   bal=80   by Rahul Sharma
TRANSFER    TR-2001      Δ   0   bal=100  by Priya Patel
RECEIPT     RC-1001      Δ+100   bal=100  by Rahul Sharma
```

Note the transfer carries `Δ 0`. A transfer relocates stock, so it must not move
the enterprise-wide balance — the seed tracks the physical `qty` and the global
`delta` as separate fields for exactly that reason.

---

## The 4-step lifecycle drill

Because the seed is a *finished* system, there is a separate control to rewind
it: **Start the lifecycle drill** (`POST /api/scenario/start-drill`).

| Step | Mutation | Stock effect |
| --- | --- | --- |
| 1 | Receive 100 kg into `RC-1001` | `+100` on `STL-ROD-12` |
| 2 | Execute `TR-2001` → `WH-Production` | `±0` (relocation) |
| 3 | Validate dispatch `WH/OUT/0001` | `−20` |
| 4 | Post count variance `ADJ-4001` | `−3` |

After the rewind `STL-ROD-12` is genuinely **0**, so the dispatch in step 3 is
unsatisfiable and the app says so: `/#/deliveries/WH/OUT/0001` shows a red *Stock
deficit* banner, a 20 kg per-line shortfall, and a disabled validate button.
After step 1 the same page clears and validates, and the drill lands back on
**77 kg**.

**The rewind does not delete anything.** The ledger is append-only, so unwinding
writes five counter-moving `REVERSAL` rows and reopens the documents. The
original `RECEIPT` row is still there underneath, which is the honest way to
express "we undid this" and keeps *"the ledger explains every balance"* true
after a rewind. Re-running the drill is idempotent — it always lands on 77.

`npm run reset` restores the canonical seeded system. Note that the seed arrays
are `structuredClone`d on the way out: the engine mutates documents in place, so
handing out the module-level arrays by reference would let a drill write through
into the seed and every later reset would "restore" corrupted data. The smoke
suite asserts this specifically.

---

## Business rules, and where they live

| Rule | Implementation |
| --- | --- |
| Zero-floor guardrail | `server/src/engine.ts` → `postDelivery()` throws **422** and writes nothing |
| Net-zero transfers | `postTransfer()` asserts the global balance is identical before/after, refuses to commit if it drifted |
| FIFO draining | `drainFifo()` walks the source subtree in bin order, then other leaves deepest-first, never below zero |
| Hierarchical balances | `stockAt()` sums a location *and every descendant* |
| Append-only ledger | `postLedger()` only unshifts; even a rewind writes a `REVERSAL` row. There is no update or delete route anywhere |
| Ledger-derived stock | `seed.ts` replays every move to produce both the ledger and the on-hand map, so they cannot drift |
| Attribution | Every row records the acting **session** user and a verbatim note |
| Dual sign-off | `requiresDualSignoff()` fires on absolute impact **or** variance % |
| Role enforcement | `requirePermission()` guards every mutating route; 403 on a capability the role lacks |

### The location hierarchy

This was the one genuinely non-obvious modelling decision. `WH/Stock` is a
*container* over `WH/Stock/Heavy-Rack-01` and `WH/Stock/Bay-04`, but stock is
stored on the leaves. So the receipt posts 100 kg into a bin, and a transfer that
names `WH/Stock` has to find it by roll-up. An earlier version read the
container's own key, found zero, and rejected a transfer that was fully covered —
which is what drove the hierarchy in.

```
WH/Stock                      (container)
├── WH/Stock/Heavy-Rack-01   (leaf)   ← receipt RC-1001 lands here
└── WH/Stock/Bay-04           (leaf)
```

A product's `stock` map only ever lists bins that actually hold something —
emptied bins are dropped rather than left behind as `0` — so the map reads as
"where is it" instead of "everywhere it has ever been".

---

## API

`GET /api/snapshot` is the single call the app makes on load; every mutation
returns and the client re-snapshots. Refs contain slashes, so documents are
addressed by query param — `/api/delivery?ref=WH/OUT/0001`, not a path segment.

```
GET    /api/snapshot              the one call the app makes on load
POST   /api/auth/login            → { token, user, permissions }
POST   /api/auth/logout
GET    /api/auth/session          requires a token
GET    /api/auth/directory        public demo account list (no secrets)
GET    /api/diagnostics           Admin only

POST   /api/reset                 requires demo.reset
GET    /api/products?q&category&status
GET    /api/products/:sku
GET    /api/receipts · /api/receipt?ref=
POST   /api/receipt/validate?ref=      requires receipt.post
GET    /api/deliveries · /api/delivery?ref=
POST   /api/delivery/validate?ref=     requires delivery.post
GET    /api/transfers
POST   /api/transfers                   requires transfer.create
POST   /api/transfer/execute?ref=       requires transfer.post
GET    /api/adjustments
POST   /api/adjustments          open a count sheet   (adjustment.create)
POST   /api/adjustment/post?ref= approve + write the ledger row (adjustment.approve)
GET    /api/ledger?type&sku
GET    /api/warehouses · /api/locations
GET    /api/settings            PATCH /api/settings (settings.manage)
GET    /api/scenario
POST   /api/scenario/run           next outstanding drill step  (transfer.post)
POST   /api/scenario/start-drill   rewind to an empty rack        (demo.reset)
POST   /api/scenario/reset         restore the canonical seed     (demo.reset)
```

---

## Layout

```
server/src/
  types.ts      domain model
  seed.ts       the wireframe data, transcribed
  store.ts      JSON persistence + doc/ledger sequences + version-gated migration
  auth.ts       scrypt hashing, sessions, role→permission matrix, Express guards
  engine.ts     all inventory invariants live here
  password.ts   scrypt hashing (leaf module, breaks the seed/auth import cycle)
  scenario.ts   the 4-step lifecycle drill + rewind
  routes.ts     REST surface
  index.ts      express app

client/src/
  api.ts        typed fetch wrapper, bearer token injection, ApiError carries blockers
  store.tsx     session + snapshot + toasts; every mutation funnels through run()
  components/   ui.tsx (tokens, badges) · shell.tsx (role-aware nav) ·
                chrome.tsx (toasts, scenario bar) · CommandPalette.tsx (Ctrl+K)
  pages/        one file per wireframe + Login.tsx

scripts/
  browser-check.mjs   dependency-free Chrome DevTools Protocol checks
```

`run()` in `store.tsx` is the single mutation path: it calls the API, re-reads
the snapshot, and toasts the server's own error text on a 422 — so the UI can
never drift from the engine.

There is deliberately **one** state model. An earlier parallel `frontend/`
workspace held a second 44 KB in-memory `mockDb` copy of the domain; its
command palette and sign-in screen were ported into `client/` and the workspace
was removed, rather than leaving two sources of truth in the repo.

---

## Notes / limits

- Persistence is a JSON file (`server/data/db.json`), not a database. Fine for
  a demo; swap `store.ts` for a real driver without touching `engine.ts`. A
  `version` bump reseeds rather than booting into a half-migrated file.
- Sessions are held **in memory**, so restarting the API signs everyone out.
  Tokens are never written to disk.
- The dual sign-off threshold is *flagged* but a single user can still approve.
  A production rollout would capture a second approver identity on the ledger
  row.
