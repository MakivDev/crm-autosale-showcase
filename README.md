# AutoSale CRM

Internal operations platform for used-car trading: inventory, landed cost, cash, customs, workshop, and sales in one place.

This public repository is a **product showcase**. The UI, configuration, and Prisma schema are included so you can see information architecture and interface quality. Commercial server actions and valuation engines are not published.

---

## What it does

The vehicle card is the system of record. A car moves through a controlled lifecycle — **purchased → in transit → sold** — with optional custom statuses from dictionaries. Purchase, transit, customs, delivery, workshop work, and sale stay attached to that card, together with photos, documents, comments, and an audit trail.

Finance is not a separate spreadsheet. Cash registers, FX rates, customs debt, and workshop spend feed the same vehicle economics that the dashboard and stock views summarize.

---

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js (App Router), React, TypeScript |
| UI | Tailwind CSS, light/dark theme |
| Data | PostgreSQL |
| ORM | Prisma (schema + migrations) |
| Mutations | Next.js Server Actions (no separate REST backend) |
| Uploads | Dedicated media routes for photos and documents |
| Auth | HttpOnly session cookie, hashed passwords, database-backed sessions |
| Access | Granular RBAC with permission presets and per-user overrides |
| Ops | Docker Compose, standalone Next.js output, reverse proxy / TLS |

PostgreSQL is the source of truth. Prisma models money with decimal types. Layouts that depend on the session are rendered dynamically so permissions are not cached across users.

---

## Domain capabilities

### Multi-currency ledgers

Cash registers are currency-aware (typically **USD, EUR, UAH**). Amounts can be entered in the register currency and kept comparable in a USD-anchored operational view. Transfers, income, and expenses are first-class transaction types.

Monthly **USD/EUR → UAH** rates support a deadline and a grace window. The product can warn operators when a rate is overdue so P&amp;L and stock figures are not silently wrong.

### Vehicle economics

Landed cost is assembled from purchase, customs, delivery, and workshop — not from a single “price” field. Customs can be recorded as **debt** and/or paid from a register. Delivery can be batched and paid from cash. Soft-deleted financial rows restore balances instead of leaving the books inconsistent.

Stock valuation and period results are derived from the same ledger, so inventory and profit stay aligned with cash and debt.

### Workshop (STO)

Repairs are posted against a vehicle and a repair type, and they hit a cash register immediately. Workshop spend rolls into vehicle cost without treating finance edits as a second, conflicting repair workflow.

### RBAC and operations

Navigation and server-side routes are gated by permissions (vehicles, finance, repair, dictionaries, users, comments, notifications, dashboard, documents, and related actions). Users without a module land on the first path they are allowed to open.

Supporting operations:

- First-run setup wizard
- Dictionaries (makes/models, statuses, fuel, gearbox, expense categories, repair types)
- Staff administration and permission presets
- Operational alerts (severity levels, dismiss / restore)
- Audit log of material entity changes
- Unified vehicle search (identity fields such as VIN, make, model, year)

---

## Application map

| Area | Role |
| --- | --- |
| Dashboard | Operational snapshot: inventory, activity, financial summaries |
| Vehicles | List, filters, card, lifecycle, files, comments |
| Finance | Registers, journal, rates, transfers, customs-related cash |
| Repair | Workshop entries linked to vehicles and cash |
| Dictionaries | Reference data used across forms |
| Users | Accounts and RBAC |
| Notifications | Operational warnings |
| Settings | Company/finance configuration, statuses, registers |
| Login | Session start |

---

## Architecture (high level)
Browser (React client UI)
│
▼
Next.js App Router
├─ Session + RBAC on layouts / proxy
├─ Server Actions (domain mutations — private in this showcase)
├─ Prisma Client
└─ PostgreSQL


Trust boundary: authenticated Server Actions and database transactions. The UI does not own balances, FX conversion, or permission checks.

---

## Showcase vs. production source

Published here on purpose:

- UI components and app shells
- Project configs (`package.json`, Next.js, TypeScript, Tailwind, etc.)
- `prisma/schema.prisma`

Not published:

- Server actions and API handlers that mutate money or inventory
- Costing, FX, stock, and P&amp;L engines
- Environment secrets (`.env`)
- Dependencies (`node_modules`) and build output

The schema describes the data model; it does not include the rules that keep ledgers consistent.

---

## Local notes (full private tree)

Requires Node.js, PostgreSQL, and a `DATABASE_URL`. Typical flow: install dependencies, generate the Prisma client, apply migrations, configure env (including a session secret), then start the Next.js dev server. A `.env.example` documents variable names without credentials.

The public tree will not run as a complete product without the omitted server modules.

---

## Design principles

- **One card, one history** — the vehicle is the hub; cash and workshop hang off it.
- **Money is typed** — decimals, explicit currencies, frozen rates on legs where needed.
- **Permissions are real** — UI hide and server deny, not UI-only flags.
- **Undo is accounted for** — soft-delete restores cash instead of ghosting balances.
- **Operators get warned** — overdue FX, negative register, customs debt, not silent drift.

---

## License / use

Private commercial product. The public showcase is for portfolio and architecture review, not for reuse of domain logic or production deployment of this tree.