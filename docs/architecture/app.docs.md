# NovaPilot

**A unified USDC balance for every major AI model.** Deposit once, use Claude, GPT, Gemini, and more — pay only for what you use. No subscriptions, no separate provider accounts, no juggling API keys across five different platforms.

Built on Circle's Arc network — Testnet-first, Mainnet-ready.

---

## Table of Contents

1. [What is NovaPilot?](#what-is-novapilot)
2. [Problem & Vision](#problem--vision)
3. [How It Works](#how-it-works)
4. [Features](#features)
5. [Getting Started](#getting-started)
6. [Environment Variables](#environment-variables)
7. [Architecture](#architecture)
8. [Tech Stack](#tech-stack)
9. [Database Schema](#database-schema)
10. [API Reference](#api-reference)
11. [Authentication & Security](#authentication--security)
12. [Billing Engine](#billing-engine)
13. [Public API (API Keys)](#public-api-api-keys)
14. [Network Strategy](#network-strategy)
15. [Design System](#design-system)
16. [Deployment](#deployment)
17. [Known Limitations & Pending Work](#known-limitations--pending-work)
18. [Testing Strategy](#testing-strategy)
19. [Roadmap](#roadmap)
20. [Business Model](#business-model)
21. [Target Users](#target-users)

---

## What is NovaPilot?

Every AI provider today requires its own account, its own payment method, often its own subscription. NovaPilot removes that friction with a single Web3-native billing layer:

```
Sign In → USDC Deposit → Pick Any Model → Chat
   → Backend Routes to the Right Provider
   → Token Usage Metered → Cost Deducted from Balance
```

Think of it as **Stripe for AI usage** — a payment and metering layer that sits between a wallet and every AI provider, so providers can change underneath without the user experience changing.

NovaPilot also exposes a **public API**, so developers can build their own products — bots, extensions, internal tools — on top of the same billing infrastructure, without writing a single line of token-counting or payment code themselves.

---

## Problem & Vision

### Problems being solved

1. **Fragmented payments** — managing separate billing relationships with OpenAI, Anthropic, Google, etc.
2. **Subscription lock-in** — committing to a monthly plan for occasional usage
3. **Web3-native friction** — crypto users have no direct, wallet-native way to pay for AI services
4. **Developer complexity** — building token-counting, billing, and multi-provider routing from scratch for every new project

### Long-term goal

NovaPilot isn't just an AI chat app — the goal is a **Web3 AI Billing Infrastructure Layer**, the same role Stripe plays for online payments. Providers change underneath; the user and developer experience stays constant.

---

## How It Works

### End-user flow

```
Sign In (Privy)
   → Wallet Auto-Created (Circle Developer-Controlled Wallet)
   → Deposit USDC (Testnet or Mainnet)
   → Balance Updates (via Circle webhook)
   → Select AI Model
   → Send Prompt
   → Backend Routes to Correct Provider (Anthropic / OpenAI / Google / OpenRouter)
   → Response Streams Back to User
   → Token Usage Calculated → Cost Deducted from USDC Balance
   → Usage Logged (model, tokens, cost, timestamp)
```

### Developer (API Key) flow

```
User Creates API Key (from Dashboard)
   → Key Shown Once (raw key), Only Hash Stored Thereafter
   → External App Calls POST /v1/chat with "Authorization: Bearer npk_..."
   → Backend Resolves Key → Owner's Account → Balance
   → Same Billing Engine Deducts Cost from Owner's Balance
   → Response Returned to External App
```

A single NovaPilot balance can power a dashboard chat session **and** a Discord bot **and** a VS Code extension simultaneously — all billed from the same place.

---

## Features

### Shipped

| Feature                       | Description                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| **Wallet Authentication**     | Privy login (email, Google, Discord) — no seed phrases, no wallet-connect friction   |
| **Auto-Provisioned Wallet**   | Circle Developer-Controlled Wallet created server-side on first login                |
| **USDC Deposit**              | Users deposit any amount; balance updates via Circle webhook                         |
| **Unified Balance**           | One balance across every supported model                                             |
| **AI Model Router**           | User selects a model; backend resolves the correct provider and streams the response |
| **Automatic Billing**         | Per-request token counting → USDC deduction, race-condition-safe                     |
| **Usage History**             | Paginated log of every request: model, tokens, cost, timestamp                       |
| **Usage Summary**             | Dashboard stat cards: total requests, tokens consumed, USDC spent                    |
| **Streaming Chat**            | Real-time token-by-token response streaming                                          |
| **API Key System**            | Developers issue their own keys to call NovaPilot from external apps                 |
| **Rate Limiting**             | Redis-backed, per-API-key request throttling                                         |
| **Spending Limits**           | Optional per-key USDC spending cap                                                   |
| **Toast Notification System** | Consistent, user-friendly error handling across the entire app                       |
| **Route & API Protection**    | Middleware-level auth gating for both pages and API routes                           |

### Planned (reference only — not yet built)

| Feature                        | Description                                                               |
| ------------------------------ | ------------------------------------------------------------------------- |
| **Team Wallets**               | Shared balance across a team/organization                                 |
| **AI Agents**                  | Memory, tools, MCP, RAG-backed agent workflows                            |
| **Smart Model Selection**      | "Best model" auto-routing based on cost/speed/quality                     |
| **Advanced Analytics**         | Deeper usage insights, cost forecasting                                   |
| **VS Code Extension**          | Native in-editor chat using the public API                                |
| **Streaming Public API**       | SSE/chunked responses for `/v1/chat`                                      |
| **OpenAI-Compatible Endpoint** | `/v1/chat/completions` for drop-in compatibility with existing AI tooling |

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm (workspaces monorepo — do not use yarn/pnpm across packages)
- PostgreSQL database (Supabase for dev, Neon for prod)
- Redis instance (Upstash)
- Circle Developer account (Sandbox/Testnet API access)
- Privy account (App ID + secret)

### Local setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd novapilot

# 2. Install dependencies (npm workspaces — installs both frontend and backend)
npm install

# 3. Set up environment variables
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
# Fill in real values — see "Environment Variables" section below

# 4. Run database migrations
cd backend
npx prisma migrate dev

# 5. Seed AI provider/model pricing data (if a seed script exists)
npx prisma db seed

# 6. Start the backend (Express, default port 4000)
npm run dev

# 7. In a separate terminal, start the frontend (Next.js, default port 3000)
cd ../frontend
npm run dev
```

### Verifying the setup

1. Visit `http://localhost:3000` — you should see the chat landing page
2. Sign in via Privy (email/Google/Discord)
3. Confirm a wallet was created — check the `Wallet` table or the dashboard's wallet section
4. Send a test message in the chat — confirms the AI router, streaming, and billing pipeline all work end-to-end

### Testing the public API locally (without a full client)

Use a REST client (e.g., the VS Code "REST Client" extension) to hit the backend directly:

```http
POST http://localhost:4000/v1/chat
Content-Type: application/json
Authorization: Bearer npk_test_<your-generated-key>

{
  "model": "claude-3-5-sonnet",
  "message": "hello, this is a test"
}
```

Generate a key first from the dashboard's **API Keys** page.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable                       | Purpose                                                     | Example                               |
| ------------------------------ | ----------------------------------------------------------- | ------------------------------------- |
| `PORT`                         | Port the Express server listens on                          | `4000`                                |
| `DATABASE_URL`                 | Postgres connection string (Prisma)                         | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL`                    | Upstash Redis connection string                             | `redis://default:pass@host:port`      |
| `CHAIN_ENV`                    | Active network: `testnet` or `mainnet`                      | `testnet`                             |
| `CIRCLE_API_KEY`               | Circle Developer-Controlled Wallets API key                 | `SAND_API_KEY:...`                    |
| `CIRCLE_WALLET_SET_ID`         | Circle Wallet Set ID (created in Circle Console)            | `uuid`                                |
| `CIRCLE_ENTITY_SECRET`         | Circle entity secret for wallet operations                  | `hex string`                          |
| `PRIVY_APP_ID`                 | Privy application ID                                        | `clxxxx...`                           |
| `PRIVY_APP_SECRET`             | Privy application secret (server-side verification)         | `secret`                              |
| `ANTHROPIC_API_KEY`            | Anthropic provider key (platform pays providers, not users) | `sk-ant-...`                          |
| `OPENAI_API_KEY`               | OpenAI provider key                                         | `sk-...`                              |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google Gemini provider key                                  | `...`                                 |
| `OPENROUTER_API_KEY`           | OpenRouter provider key                                     | `sk-or-...`                           |
| `SWEEP_THRESHOLD_USDC`         | Balance threshold that triggers an on-chain sweep           | `100`                                 |
| `SENTRY_DSN`                   | Error monitoring (if wired up)                              | `https://...`                         |

### Frontend (`frontend/.env.local`)

| Variable                   | Purpose                                                     | Example                 |
| -------------------------- | ----------------------------------------------------------- | ----------------------- |
| `NEXT_PUBLIC_API_URL`      | Backend base URL (server-side only, read by `api-proxy.ts`) | `http://localhost:4000` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy App ID (client-side, safe to expose)                  | `clxxxx...`             |

> **Security note:** `NEXT_PUBLIC_API_URL` is prefixed `NEXT_PUBLIC_` for local dev convenience, but the actual backend calls only ever happen server-side inside Next.js route handlers (`api-proxy.ts`) — it is never fetched directly from client-side JS in production.

---

## Architecture

### High-level system diagram

```
┌─────────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│   Next.js 15     │  HTTP   │   Next.js API Routes  │  HTTP   │  Express Backend │
│   (Frontend)     │ ──────► │   (BFF Proxy Layer)   │ ──────► │   (TypeScript)   │
└─────────────────┘         └──────────────────────┘         └────────┬────────┘
                                                                        │
                              ┌─────────────────────────────────────────┼─────────────────────┐
                              │                                         │                     │
                        ┌─────▼─────┐                            ┌─────▼─────┐         ┌──────▼──────┐
                        │ PostgreSQL │                            │   Redis    │         │ AI Providers │
                        │ (Supabase) │                            │ (Upstash)  │         │ Anthropic/   │
                        │  + Prisma  │                            │ Rate-limit │         │ OpenAI/      │
                        └───────────┘                            │  + Cache   │         │ Google/      │
                                                                  └───────────┘         │ OpenRouter   │
                                                                                          └─────────────┘
                                                                                                 │
                                                                                          ┌──────▼──────┐
                                                                                          │Circle Wallet │
                                                                                          │  API (USDC)  │
                                                                                          └─────────────┘
```

### Backend-For-Frontend (BFF) proxy pattern

The frontend **never** talks to the Express backend directly. Every request flows through Next.js API routes, which:

1. Read the Privy `privy-token` httpOnly cookie server-side
2. Attach it as a `Bearer` token when calling the Express backend
3. Return the backend's response unmodified (including streamed responses)

This means:

- The backend URL is never exposed to client-side JavaScript
- Auth tokens never touch browser-accessible JS
- CORS complexity is eliminated (same-origin from the browser's perspective)

```typescript
// Every Next.js route handler follows this shape:
export async function POST(req: NextRequest) {
  return proxyToBackend({
    method: "POST",
    path: "/api/chat/conversations",
    body: await req.text(),
  });
}
```

### Module structure

**Backend** (`src/modules/<module>/`):

```
modules/
├── auth/          → Privy JWT verification, wallet creation
├── billing/        → deductUsage, creditDeposit, usage history/summary
├── chat/            → conversation management, AI streaming
├── api-keys/        → key generation, auth middleware, rate limiting
├── public-api/       → external-facing /v1/* routes
└── usage/            → HTTP layer for usage history/summary endpoints
```

**Frontend** (`features/<module>/`):

```
features/
├── auth/            → useAuth, useApiClient, login UI
├── chat/             → ChatInterface, useChat, streaming logic
├── usage/            → useUsageHistory, useUsageSummary, UsageLogs UI
└── api-keys/         → useApiKeys, key management UI
```

Each module owns its `api/` (fetch functions), `hooks/` (state logic), and `components/` (UI), following the [bulletproof-react](https://github.com/alan2207/bulletproof-react) pattern.

---

## Tech Stack

| Layer                     | Choice                                                        | Rationale                                                                                     |
| ------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Frontend**              | Next.js 15 (App Router) + TypeScript + Tailwind CSS + daisyUI | Production-tested, fast iteration, class-based theming                                        |
| **Wallet Auth**           | Privy                                                         | Identity-only (email/Google/Discord) — no wallet-connect friction for non-crypto-native users |
| **Wallet Infra**          | Circle Developer-Controlled Wallets                           | Server-created wallets; users never manage private keys                                       |
| **Backend**               | Express 5 + TypeScript                                        | Fully decoupled from frontend, reusable by future clients (mobile, CLI)                       |
| **Database**              | PostgreSQL (Neon prod / Supabase dev) + Prisma ORM            | Type-safe schema, migration-driven                                                            |
| **Concurrency Control**   | Postgres `SELECT FOR UPDATE`                                  | Row-level locking prevents race conditions on balance mutations                               |
| **Cache / Rate Limiting** | Redis (Upstash)                                               | Sub-millisecond rate-limit checks; billing itself stays on Postgres locks                     |
| **AI Integration**        | Vercel AI SDK                                                 | Unified interface across Anthropic, OpenAI, Google, and OpenRouter                            |
| **Validation**            | Zod                                                           | Runtime safety for all API input/output and environment variables                             |
| **Auth Middleware**       | Custom (Privy JWT + API-key hash lookup)                      | Two independent auth paths converging on the same billing engine                              |

---

## Database Schema

### Core models

```prisma
model User {
  id        String   @id @default(uuid())
  // ... Privy-linked identity fields
  wallets   Wallet[]
  apiKeys   ApiKey[]
}

model Wallet {
  id             String     @id @default(uuid())
  userId         String
  network        NetworkEnv
  circleWalletId String
  address        String

  @@unique([userId, network])
}

model Balance {
  userId  String
  network NetworkEnv
  amount  Decimal    @db.Decimal(18, 6)

  @@unique([userId, network])
}

model Transaction {
  id             String            @id @default(uuid())
  userId         String
  network        NetworkEnv
  type           TransactionStatus // CREDIT | DEBIT
  amountUsdc     Decimal           @db.Decimal(18, 6)
  balanceAfter   Decimal           @db.Decimal(18, 6)
  idempotencyKey String            @unique
  usageLog       UsageLog?
}

model UsageLog {
  id             String     @id @default(uuid())
  userId         String
  network        NetworkEnv
  modelPricingId String
  inputTokens    Int
  outputTokens   Int
  costUsdc       Decimal    @db.Decimal(18, 6)
  apiKeyId       String?    // set only when the request came via a public API key
  createdAt      DateTime   @default(now())

  modelPricing ModelPricing @relation(fields: [modelPricingId], references: [id])
  apiKey       ApiKey?      @relation(fields: [apiKeyId], references: [id])

  @@index([userId])
  @@index([createdAt])
}

model ApiKey {
  id                 String     @id @default(uuid())
  userId             String
  keyHash            String     @unique  // SHA-256, raw key never stored
  keyPrefix          String              // first 12 chars, plaintext, for display
  name               String
  network            NetworkEnv
  spendingLimitUsdc  Decimal?   @db.Decimal(18, 6)
  spentUsdc          Decimal    @default(0) @db.Decimal(18, 6)
  rateLimitPerMinute Int?
  lastUsedAt         DateTime?
  revokedAt          DateTime?  // null = active; single source of truth
  expiresAt          DateTime?
  createdAt          DateTime   @default(now())

  usageLogs UsageLog[]

  @@unique([userId, name])
  @@index([userId])
}
```

### Supporting models (pricing & catalog)

```prisma
enum NetworkEnv {
  TESTNET
  MAINNET
}

enum TransactionStatus {
  CREDIT
  DEBIT
}

model AiProvider {
  id       String    @id @default(uuid())
  name     String    @unique // "anthropic" | "openai" | "google" | "openrouter"
  aiModels AiModel[]
}

model AiModel {
  id           String   @id @default(uuid())
  aiProviderId String
  modelName    String   // provider's own model slug, e.g. "claude-3-5-sonnet-20241022"
  displayName  String   // human-friendly name shown in the UI
  isActive     Boolean  @default(true)

  aiProvider     AiProvider     @relation(fields: [aiProviderId], references: [id])
  modelPricings  ModelPricing[]

  @@unique([aiProviderId, modelName])
}

model ModelPricing {
  id              String    @id @default(uuid())
  aiModelId       String
  inputPricePerM  Decimal   @db.Decimal(18, 6) // USDC per 1M input tokens
  outputPricePerM Decimal   @db.Decimal(18, 6) // USDC per 1M output tokens
  effectiveFrom   DateTime  @default(now())
  effectiveTo     DateTime? // null = current/active pricing snapshot

  aiModel   AiModel    @relation(fields: [aiModelId], references: [id])
  usageLogs UsageLog[]
}
```

> **Why pricing is a separate model from `AiModel`:** provider prices change over time. Storing pricing as time-bound snapshots (`effectiveFrom` / `effectiveTo`) means historical `UsageLog` rows always reference the price that was actually in effect at the time of the request — critical for accurate billing audits and never re-computing historical costs at today's price.

### Design principles

- **`Decimal(18,6)`** everywhere USDC amounts are stored — never `Float`, to avoid floating-point rounding errors in financial data
- **`network`** field on every network-dependent table — the same schema serves both Testnet and Mainnet, switched purely by config
- **Soft-delete over hard-delete** — `revokedAt` timestamps preserve audit trails; nothing related to billing is ever physically deleted
- **Single source of truth for state** — e.g., `ApiKey.revokedAt` alone determines active/inactive, deliberately avoiding a parallel `isActive` boolean that could drift out of sync
- **Pricing snapshots over live lookups** — billing always reads the `ModelPricing` row valid at request time, not the provider's current price, so past invoices never silently change

---

## API Reference

All internal routes are prefixed `/api` and require a valid Privy session (via the Next.js BFF proxy). The public route is prefixed `/v1` and requires an API key instead.

### Auth

| Method | Path           | Description                                               |
| ------ | -------------- | --------------------------------------------------------- |
| `GET`  | `/api/auth/me` | Returns the authenticated user's profile + wallet address |

### Chat

| Method   | Path                                   | Description                                    |
| -------- | -------------------------------------- | ---------------------------------------------- |
| `POST`   | `/api/chat/conversations`              | Create a new conversation                      |
| `GET`    | `/api/chat/conversations`              | List conversations (paginated, network-scoped) |
| `GET`    | `/api/chat/conversations/:id`          | Get a single conversation's metadata           |
| `PATCH`  | `/api/chat/conversations/:id`          | Rename a conversation                          |
| `DELETE` | `/api/chat/conversations/:id`          | Delete a conversation (cascades to messages)   |
| `GET`    | `/api/chat/conversations/:id/messages` | Fetch messages (paginated)                     |
| `POST`   | `/api/chat/conversations/:id/messages` | Send a message, streams the AI response        |

### Usage

| Method | Path                       | Description                                         |
| ------ | -------------------------- | --------------------------------------------------- |
| `GET`  | `/api/usage/usage-history` | Paginated usage log (`?network=&page=&limit=`)      |
| `GET`  | `/api/usage/usage-summary` | Aggregate stats: total requests, tokens, USDC spent |

### API Keys

| Method   | Path                | Description                                  |
| -------- | ------------------- | -------------------------------------------- |
| `POST`   | `/api/api-keys`     | Create a new API key (raw key returned once) |
| `GET`    | `/api/api-keys`     | List the user's API keys (`?network=`)       |
| `DELETE` | `/api/api-keys/:id` | Revoke an API key (soft-delete)              |

### Public API (external, API-key-authenticated)

| Method | Path       | Description                                                      |
| ------ | ---------- | ---------------------------------------------------------------- |
| `POST` | `/v1/chat` | Non-streaming chat completion, billed to the key owner's balance |

### Standard response shape

```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "message": "Human-readable error message" }
```

### Standard HTTP status codes used

| Code  | Meaning in this system                                                     |
| ----- | -------------------------------------------------------------------------- |
| `200` | Success                                                                    |
| `201` | Resource created (e.g., new API key)                                       |
| `400` | Validation error / malformed request                                       |
| `401` | Missing, invalid, or expired auth (session or API key)                     |
| `402` | Insufficient balance / API key spending limit reached                      |
| `403` | Authenticated but not authorized (e.g., accessing another user's resource) |
| `404` | Resource not found                                                         |
| `429` | Rate limit exceeded                                                        |
| `500` | Unhandled server error                                                     |

---

## Authentication & Security

NovaPilot has **two independent authentication paths**, both converging on the same billing engine.

### 1. Dashboard session auth (Privy)

```
Browser → Privy httpOnly cookie → Next.js BFF reads cookie server-side
        → Attaches as Bearer token → Express validates Privy JWT
        → req.user populated (userId, wallet, network)
```

- The frontend never sees or handles the raw token
- `middleware.ts` gates protected page routes (`/wallet`, `/usage-logs`, `/settings`, etc.) at the edge, before any page code runs
- Protected **API routes** are similarly gated to avoid unnecessary round-trips to the backend for unauthenticated requests

### 2. Public API key auth

```
External App → Authorization: Bearer npk_live_<64-hex-chars>
             → Format validation (regex, cheap short-circuit)
             → SHA-256 hash → indexed DB lookup
             → Checks: revoked? expired? spending limit reached?
             → Redis rate-limit check (per-key, sliding window)
             → req.apiKeyContext populated (userId, network, spendingLimitUsdc)
```

### Key security properties

| Property                     | Implementation                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Raw key never stored         | Only SHA-256 hash persisted; key shown once at creation                                                                              |
| No salt needed               | Raw key is 256 bits of cryptographic randomness — rainbow-table attacks are infeasible without a salt, unlike human-chosen passwords |
| Prefix-only display          | First 12 characters shown in UI so users can identify keys without re-exposing secrets                                               |
| Ownership-checked revocation | A user can never revoke another user's key, even by guessing IDs                                                                     |
| Idempotent revocation        | Double-clicking "Revoke" is a no-op, not an error                                                                                    |

---

## Billing Engine

### Core guarantee: atomicity

Every balance mutation happens inside a single Postgres transaction using `SELECT FOR UPDATE` row locking — this prevents two concurrent requests from double-spending the same balance.

```typescript
return prisma.$transaction(async (tx) => {
  // Idempotency check — prevents double-billing on retry
  const existing = await tx.transaction.findUnique({ where: { idempotencyKey } });
  if (existing) return existing.result;

  // Row lock — blocks concurrent writes to this user's balance
  const balance = await tx.$queryRaw`
    SELECT * FROM "Balance" WHERE "userId" = ${userId} FOR UPDATE
  `;

  if (balance.amount.lessThan(totalCost)) {
    throw new InsufficientBalanceError(...); // 402 Payment Required
  }

  // Deduct, log, and (if via API key) update key spend — all atomic
});
```

### Two independent money flows

1. **User → Platform** — USDC deposited by the user stays in the platform treasury (Circle Wallet)
2. **Platform → AI Providers** — the platform owner pays Anthropic/OpenAI/Google separately via card

Per-request billing is a **ledger entry**, not an on-chain transfer — this makes microtransaction-level billing (fractions of a cent per request) economically viable, since on-chain gas costs would otherwise dominate.

### Pre-flight balance check

Before any AI provider call is made, `assertHasBalance()` fails fast on zero/negative balance — preventing a full AI response from streaming to a user who can never be billed for it. A second, atomic check happens again at billing time to catch race conditions.

---

## Public API (API Keys)

### Why it exists

NovaPilot's core billing/routing infrastructure is valuable beyond the dashboard itself. The API Key system lets external developers build on top of it — a Discord bot, a VS Code extension, an internal tool — without building their own AI billing stack.

### Example use cases

| Category         | Example                                              |
| ---------------- | ---------------------------------------------------- |
| Developer Tools  | AI code-review bot on GitHub PRs                     |
| Education        | Homework-helper app, auto quiz generator             |
| Customer Support | E-commerce chatbot, WhatsApp auto-reply              |
| Web3-native      | On-chain data explainer, smart contract audit helper |
| Productivity     | Meeting-notes summarizer, journal analyzer           |

### Endpoint

```http
POST /v1/chat
Authorization: Bearer npk_live_<key>
Content-Type: application/json

{
  "model": "claude-3-5-sonnet",
  "message": "Explain quantum computing simply"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "reply": "Quantum computing uses...",
    "model": "claude-3-5-sonnet",
    "usage": {
      "inputTokens": 7,
      "outputTokens": 42,
      "costUsdc": "0.0000396"
    }
  }
}
```

### Key lifecycle

```
Create (dashboard, Privy-authenticated)
   → Raw key shown once
   → Used externally via Bearer header
   → lastUsedAt updated on each request (fire-and-forget)
   → Owner can revoke anytime (soft-delete, immediate effect)
```

### Dynamic authorization model

Every key carries policy that can be changed **at any time**, without redeploying code:

| Control              | Effect                                     |
| -------------------- | ------------------------------------------ |
| `revokedAt`          | Instantly disables the key                 |
| `expiresAt`          | Automatic expiry without manual action     |
| `spendingLimitUsdc`  | Caps total spend through this specific key |
| `rateLimitPerMinute` | Per-key request throttling override        |

This is the same pattern used by Stripe, GitHub, and OpenAI: **identity resolution + live policy evaluation**, re-checked on every single request.

---

## Network Strategy

NovaPilot is built **Testnet-first, Mainnet-ready** — network is a runtime parameter throughout the codebase, never a code branch.

```
CHAIN_ENV=testnet   →  config/network.ts loads testnet RPC, contract address, chain ID
CHAIN_ENV=mainnet   →  same code, different config object
```

**Principles:**

- No chain ID, RPC URL, or contract address is ever hardcoded
- Every network-dependent table has a `network` column — Testnet and Mainnet data coexist in the same schema
- Business logic (billing, routing, balance math) is **100% network-independent**
- The UI displays a persistent "Testnet" badge until Mainnet migration

---

## Design System

**Theme:** Circle.com-inspired deep-navy.

| Token          | Value     |
| -------------- | --------- |
| `bg-base`      | `#0A1730` |
| `bg-surface`   | `#0F2043` |
| `border`       | `#22335C` |
| `text-primary` | `#F4F6FB` |
| `text-muted`   | `#8B9BC4` |
| `accent-blue`  | `#3B82F6` |
| `accent-green` | `#22C55E` |

**Typography:** Geist Sans (headings/UI), Geist Mono (data labels, wallet addresses, tabular values).

**Card pattern:** Dark-navy `bg-surface` with a subtle border for every dashboard card, top-left line icon + bold title. **One deliberate exception:** the USDC balance card is high-contrast/light — a signature visual anchor.

**Toast system:** Centralized `ToastProvider` + `useToast()` hook. Every API error path — auth expiry, insufficient balance, network failure — surfaces as an actionable toast (e.g., "Insufficient balance → Deposit" button) rather than a silent console log or raw error state.

---

## Deployment

| Component | Platform                                |
| --------- | --------------------------------------- |
| Frontend  | Vercel                                  |
| Backend   | Render (Docker)                         |
| Database  | Supabase (dev) / Neon (prod)            |
| Redis     | Upstash                                 |
| Wallets   | Circle Developer-Controlled Wallets API |

> **Note on backend hosting:** Render's free tier allocates 750 compute hours/month **shared across the entire account**, not per service. Running multiple services concurrently divides that pool. Mitigation: suspend unused services; keep only the active backend running continuously.

---

## Known Limitations & Pending Work

These are deliberate, currently-known gaps — not oversights. Tracked here so they aren't rediscovered mid-incident.

| Item                                                | Status                        | Impact                                                                                                                                                             |
| --------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `initializeBalance()` wiring into `ensureWallet()`  | Pending                       | New wallets may not get an initial `Balance` row without this — verify before onboarding real users                                                                |
| Automated tests (unit/integration/e2e)              | Deferred by explicit decision | No regression safety net; every change to billing/auth code must be manually verified                                                                              |
| Public `/v1/chat` streaming                         | Not implemented               | External API consumers wait for the full response; acceptable for v1, a UX gap for larger responses                                                                |
| OpenAI-compatible endpoint (`/v1/chat/completions`) | Not implemented               | Third-party tools (Continue.dev, Cline, etc.) can't be pointed at NovaPilot directly yet                                                                           |
| `onFinish`-time billing failure handling            | Logged only                   | If billing fails _after_ a response has already streamed to the client, it's currently only logged (`logger.error`) — no automatic reconciliation/retry exists yet |
| Sentry / error monitoring                           | Planned, not wired up         | No centralized error visibility in production yet                                                                                                                  |
| API key audit log (who revoked, when)               | Not implemented               | `revokedAt` timestamp exists, but no actor/reason is recorded                                                                                                      |
| Docker Compose for local dev                        | Deferred                      | Local dev currently requires manually running Postgres/Redis or using hosted dev instances (Supabase/Upstash)                                                      |
| CI/CD (GitHub Actions)                              | Planned, not implemented      | No automated lint/typecheck/test gate on PRs yet                                                                                                                   |

---

## Testing Strategy

> **Current state:** Automated tests are explicitly deferred (a conscious trade-off to prioritize shipping core features). This section documents the _intended_ strategy for when testing is picked back up — not what currently exists.

| Layer                 | Tool       | Priority when implemented                                                                         |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| Unit tests            | Vitest     | Billing math (`deductUsage`, `creditDeposit`) first — this is the highest-risk code in the system |
| API integration tests | Supertest  | Auth middleware, API key middleware, rate limiting                                                |
| End-to-end tests      | Playwright | Full deposit → chat → billing → usage-history flow                                                |

**Recommended first tests to write, in priority order:**

1. `deductUsage()` — concurrent request race condition (two simultaneous requests against the same balance should never double-spend)
2. `InsufficientBalanceError` — confirm it's thrown _before_ any provider/streaming call, not after
3. API key middleware — revoked/expired/spending-limit-exceeded keys must all return `401`/`402`, never fall through to a successful request
4. Idempotency — replaying the same `idempotencyKey` must never bill twice

---

## Roadmap

- [ ] Streaming support for the public `/v1/chat` API
- [ ] OpenAI-compatible `/v1/chat/completions` endpoint (broad tool compatibility)
- [ ] VS Code extension (native chat participant, powered by the public API)
- [ ] Team wallets (shared balance across an organization)
- [ ] Smart model selection ("best model" auto-routing)
- [ ] Advanced analytics dashboard
- [ ] AI agent workflows (memory, tools, MCP, RAG)
- [ ] Mainnet migration

---

## Business Model

| Stream                   | Description                                      |
| ------------------------ | ------------------------------------------------ |
| Per-request platform fee | Small margin on top of provider cost             |
| Premium analytics        | Deeper usage/cost insights for power users       |
| Team workspaces          | Shared billing and access control                |
| Enterprise API           | Higher rate limits, dedicated support            |
| AI Gateway SDK           | Drop-in SDK for developers building on NovaPilot |
| White-label              | Rebrandable instance for other platforms         |

---

## Target Users

Web3 users, crypto-native communities, AI developers, startups, SaaS teams, AI agent builders, hackathon participants, and blockchain developers.

---

## Project Context

NovaPilot is built on Circle's **Arc network**, with the goal of achieving Builder/Architect status in the Arc community and eligibility for future Arc ecosystem rewards. The project is intentionally broad in scope — not tied to a single vertical — designed to be useful across the entire crypto/blockchain community.

---

_This document reflects the current architecture as of the latest development cycle. Every core system — billing, routing, authentication — is designed to be network-agnostic and Mainnet-ready without code changes._
