# Automated Safe Payment Proposals And Discord Announcements

## Summary

Create a separate Cloudflare Worker alongside the existing Cloudflare Pages app. The Worker runs monthly on the 1st at `15:00 UTC`, computes the previous calendar month's curator fees and council stipends, proposes two Safe transactions, and posts the Safe links to `#multisig-ops` in Discord.

The existing webapp remains available for manual review and manual Safe App creation. The automation uses an Ethereum private key only as a Safe Transaction Service proposer/delegate, not as a Safe owner or signer.

## Key Changes

- Add a dedicated Worker entrypoint with:
  - `scheduled()` handler for cron.
  - `GET /health`.
  - Protected `POST /run` manual trigger requiring `Authorization: Bearer $AUTOMATION_ADMIN_TOKEN`.
  - Local cron testing through Wrangler's `/cdn-cgi/handler/scheduled` route.
- Add a separate Worker config:
  - `name`: `dao-council-automation`
  - `main`: `worker/automation-worker.ts`
  - `triggers.crons`: `["0 15 1 * *"]`
  - KV binding: `AUTOMATION_RUNS_KV`
- Refactor shared backend logic:
  - Move curator report generation out of `functions/api/curations.ts` into a reusable server function.
  - Move MANA price fetching out of `functions/api/mana-price.ts` into a reusable server function.
  - Keep `/api/curations` and `/api/mana-price` working by calling the shared functions.
  - Share payment transaction building between Safe App SDK and server-side Safe proposals.
- Add Safe server-side proposal support:
  - Use `@safe-global/api-kit`, `@safe-global/protocol-kit`, and `@safe-global/types-kit`.
  - Use `ETHEREUM_RPC_URL`, `SAFE_API_KEY`, `SAFE_ADDRESS`, and `AUTOMATION_PROPOSER_PRIVATE_KEY`.
  - Create two Safe proposals per monthly run:
    - Curators: previous month curator fees, one MANA transfer per payable curator.
    - Council: previous month council stipend, one MANA transfer per council member.
  - Use the Safe Transaction Service next nonce and increment for each proposal created in that run.
  - Include `origin` metadata such as `dao-council:auto:curators:YYYY-MM` and `dao-council:auto:council:YYYY-MM`.
- Add idempotency and failure behavior:
  - Store per-period/per-payment-type state in KV keys like `2026-06:curators` and `2026-06:council`.
  - Skip already completed keys unless the manual `/run` request uses `force: true`.
  - If curator report has unresolved receipt warnings, do not create the curator proposal; post a Discord warning instead.
  - If MANA price fetch fails, do not create the council proposal.
  - If one proposal succeeds and the other fails, store/report them independently.

## External Setup

- Safe:
  - Generate a new Ethereum private key for automation.
  - Derive its address and add that address as a Safe Transaction Service delegate/proposer, not as an owner.
  - The key should hold no ETH, MANA, or owner permissions.
  - Validate that proposals created by this address appear in Safe with zero owner confirmations.
  - Generate a Safe API key at the Safe developer dashboard.
- Discord:
  - Create a Discord application and bot.
  - Add the bot to the council server using OAuth2 bot flow.
  - Create `#multisig-ops`.
  - Give the bot only `View Channel` and `Send Messages` in that channel.
  - Copy the bot token and channel ID.
- Cloudflare:
  - Create KV namespace `dao-council-automation-runs`.
  - Add Worker secrets:
    - `AUTOMATION_PROPOSER_PRIVATE_KEY`
    - `AUTOMATION_ADMIN_TOKEN`
    - `SAFE_API_KEY`
    - `ETHEREUM_RPC_URL`
    - `POLYGON_RPC_URL`
    - `DISCORD_BOT_TOKEN`
  - Add Worker vars:
    - `SAFE_ADDRESS`
    - `DISCORD_CHANNEL_ID`
    - `COUNCIL_STIPEND_USD=1000`
    - `SAFE_CHAIN_ID=1`
    - `AUTOMATION_DRY_RUN=true` for first deployment, then `false` after verification.

## Local And Deployment Flow

- `npm run dev:web`: runs the Cloudflare Pages app locally on port `5173`.
- `npm run dev:automation`: runs the automation Worker locally on port `8787`.
- `npm run dev`: runs both.
- `npm run deploy:pages`: deploys the Pages app.
- `npm run deploy:automation`: deploys the automation Worker.
- `npm run deploy`: builds, then deploys Pages and the Worker.

Local scheduled test command:

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+15+1+*+*"
```

Protected manual run:

```bash
curl -X POST "http://localhost:8787/run" \
  -H "Authorization: Bearer $AUTOMATION_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"dryRun":true,"notifyDiscord":false}'
```

## Test Plan

- Unit tests:
  - Previous-month UTC range calculation.
  - Curator warning blocks curator proposal.
  - Empty curator payments skip proposal.
  - Council stipend MANA calculation from env stipend and fetched price.
  - Payment transaction calldata uses Ethereum mainnet MANA address.
  - KV idempotency skips completed runs.
  - Discord message formatting disables mentions.
- Local integration:
  - Run `npm run dev`.
  - Trigger scheduled handler locally.
  - Test dry-run mode first: no Safe proposal, Discord message marks dry run.
  - Test manual protected `/run` with invalid and valid admin token.
- Production rollout:
  - Deploy Worker with `AUTOMATION_DRY_RUN=true`.
  - Trigger manual dry run and confirm Discord output.
  - Switch to `AUTOMATION_DRY_RUN=false`.
  - Trigger one manual run for a test period or wait for cron.
  - Confirm Safe shows pending proposals with zero confirmations from the automation proposer.

## Assumptions And Defaults

- Monthly automation runs on the 1st at `15:00 UTC` and pays the previous UTC calendar month.
- Council stipend defaults to `$1000` per member from env.
- The automation creates two separate Safe proposals, not one combined transaction.
- Curator data warnings block curator automation to avoid silently creating an incomplete payment proposal.
- The proposer key is registered as a Safe Transaction Service delegate/proposer, not an on-chain Safe owner.
