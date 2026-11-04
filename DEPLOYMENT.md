# Marketplace credential encryption

Set `ENCRYPTION_KEY` in the backend service's environment before publishing an
API that uses authentication. It must contain exactly 64 hexadecimal characters
(32 bytes for AES-256). Redis credentials do not replace this key.

If the service has already stored encrypted API credentials, use the existing
encryption key. Changing it makes those credentials unreadable. Keep the same
key across deployments and instances, and store it as a secret.

For this deployment, a valid `ENCRYPTION_KEY` is already present in the local
`.env`. Copy that value into the backend's Render environment and redeploy.
Do not commit `.env`, print the value in logs, or send it in chat.

For a new installation without an existing key, generate one locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Missing or malformed keys cause credential operations to return HTTP 503 with
`SERVICE_UNAVAILABLE`; they do not fall back to plaintext storage. Unexpected
application errors are logged without request bodies to avoid exposing secrets.

## Marketplace payouts and Playground

The new migration adds network and usage tracking to marketplace
settlement/withdrawal records. Deploy the backend and frontend together after
applying these additive columns.

For an installation with complete Prisma migration history, use
`npx prisma migrate deploy` with the correct `DIRECT_URL`. The currently
configured application database already has its schema but no migration history;
do not replay the initial table-creation migrations against it. Apply only the
reviewed additive SQL instead:

```sh
npx prisma db execute --file prisma/migrations/20261104000000_marketplace_payout_tracking/migration.sql
```

This SQL was applied to the configured application database during this fix.
Do not run it again against that database. Establishing a Prisma baseline for
the older migrations is a separate administrative task.

The existing Circle API key, entity secret, admin wallet address, USDC token
address and `CHAIN_ENV` must describe the same chain. The admin wallet needs
enough gas (or Circle gas sponsorship) to execute withdrawals. No new credentials
are required. Never use a mainnet wallet or token address in a testnet deployment.

Every minute, the backend reconciles marketplace earnings and withdrawals:

- Completed API usage is collected from its consumer wallet into the admin
  wallet. Only Circle `COMPLETE` makes the creator's 98% share withdrawable.
- A terminally failed collection freezes that earning for review.
- Withdrawals reserve available, network-specific settled earnings atomically.
  Circle receives the persisted UUID idempotency key. An ambiguous timeout keeps
  the withdrawal reserved and retries with that same key; terminal failure
  restores the creator's balance once.
- Existing history is retained. Legacy settlement rows without a usage reference
  are not automatically sent. Review their source/network before any backfill;
  historical rows retain an unknown (null) network and are never sent automatically.
- Charges are rounded up to whole micro-USDC because balance columns use six
  decimal places. Refunding returns exactly the amount reserved.

Existing listings return a corrected `/api/v1/marketplace/:slug` endpoint without
requiring production data rewrites. APIs awaiting approval remain unpublished.

Playground uses the signed-in user's own active marketplace key, held only in
page memory. It never stores the key in browser storage or forwards session
cookies to the provider. Requests are billable at the displayed API price.

Regression tests with PostgreSQL and mocked Circle/upstream services:

```powershell
# Use a disposable local database named marketplace_tests on this exact port.
$env:DIRECT_URL = 'postgresql://postgres:marketplace-test-only@127.0.0.1:55439/marketplace_tests'
npx prisma migrate deploy
$env:MARKETPLACE_TEST_DATABASE_URL = $env:DIRECT_URL
npm test
```

The integration suite refuses other hosts/database names and truncates only
that disposable database. Do not point it at production.
