# DCL DAO Council

A web application for Decentraland DAO Council workflows. The Curators tab calculates and reports curator fees, and the Council tab prepares monthly DAO Council stipend payments.

## Features

- **Date Range Selection**: Choose specific months or custom date ranges for fee calculation
- **Curation Tracking**: View individual curator activities in chronological order
- **Fee Calculation**: Automatically calculates curator fees (1/3 of creation fees) from GraphQL data
- **Detailed Reports**: Expandable curator details showing individual curations with timestamps
- **Council Stipends**: Calculate monthly Council member stipend payments from a USD amount and the live MANA/USD price
- **Editable Payment Details**: Adjust Council stipend amounts and member payment addresses before creating a transaction
- **Gas Tank Monitoring**: Track the Polygon Gas Tank balance and open a preconfigured CowSwap refill flow from Safe
- **Multisig Integration**: Create a Safe transaction batch for payments, or copy a multisig CSV outside Safe
- **Automation Worker**: Optionally propose monthly curator and council Safe transactions, plus daily low Gas Tank alerts, through Cloudflare Worker cron jobs and Discord
- **Blockchain Links**: Direct links to Polygonscan transactions and Decentraland marketplace items
- **Item ID Extraction**: Workaround for GraphQL bug by parsing transaction logs to extract item IDs
- **Duplicate Curation Handling**: Automatically identifies and excludes duplicate curations from fee calculations

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Cloudflare Runtime**: Cloudflare Pages with Pages Functions
- **Automation Runtime**: Cloudflare Workers Cron Triggers with KV idempotency
- **Styling**: CSS with dark theme and `decentraland-ui` tabs
- **Data Sources**: Decentraland GraphQL subgraph, Polygon transaction receipts, and live MANA/USD price data proxied through the app's Pages Function API
- **Blockchain**: Polygon curation data; Ethereum mainnet MANA payments
- **Libraries**:
  - `date-fns` for date manipulation
  - `viem` for wei conversions and blockchain interaction
  - `@safe-global/safe-apps-sdk` for Safe transaction creation
  - `@safe-global/api-kit` and `@safe-global/protocol-kit` for automated Safe Transaction Service proposals
  - `decentraland-ui` for navigation tabs
  - `wrangler` for local Cloudflare Pages development and deployment
  - Native fetch for GraphQL queries

## Getting Started

### Prerequisites

- Node.js v20.19 or higher
- npm
- A Cloudflare account for deployment

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd dao-council
```

2. Install dependencies:

```bash
npm install
```

3. Build and start the local Cloudflare Pages development server plus automation Worker:

```bash
npm run dev
```

4. Open [http://localhost:5173](http://localhost:5173) in your browser. The automation Worker runs at [http://localhost:8787](http://localhost:8787).

`npm run dev` builds the React app, runs it with the Pages Function API locally, and starts the automation Worker. Use `npm run dev:web` or `npm run dev:automation` to run only one side. The browser calls the same-origin `/api/curations` endpoint for processed curator fee data, and `/api/graphql` remains available as a raw Decentraland subgraph proxy. This replaces the old `corsproxy.io` workaround.

The app routes are `/curators`, `/council`, and `/gas-tank`. The curator report range is shareable through date query params, for example `/curators?from=2026-06-01&to=2026-06-30`.

### Building for Production

```bash
npm run build
```

The built browser assets will be in the `dist` directory. Pages Functions are defined in the root `functions` directory. The automation Worker entrypoint is `worker/automation-worker.ts`.

### Previewing Production Locally

```bash
npm run preview
```

This previews the built app locally with the Cloudflare Pages runtime.

### Deploying to Cloudflare

Authenticate Wrangler once if needed:

```bash
npm exec wrangler login
```

Then deploy:

```bash
npm run deploy
```

This repository now deploys to Cloudflare Pages with a Pages Function API route, plus an optional separate automation Worker. Vercel is no longer required.

For Git-based Cloudflare deployments, create a Pages project connected to this repository with:

- **Project name**: `dao-council`
- **Production branch**: `main`
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Root directory**: `/`

The production URL will be `https://dao-council.pages.dev`.

Deploy the automation Worker after creating its KV namespace and secrets:

```bash
npm run deploy:automation
```

`npm run deploy` builds the app and deploys both Pages and the automation Worker. Do not enable live automation until `AUTOMATION_DRY_RUN=true` has been tested in production. After the dry run is verified, set `AUTOMATION_DRY_RUN=false` and deploy the automation Worker again.

## How It Works

### Data Flow

1. **Processed Curations Query**: The frontend requests `/api/curations?from={unixTimestamp}&to={unixTimestamp}`; the Cloudflare Pages Function fetches the report window first, then fetches curation history only for collections that appear in that report
2. **MANA Price Query**: The Council tab requests `/api/mana-price`; the Pages Function fetches the current MANA/USD price from Coinbase with CoinGecko as a fallback
3. **Transaction Log Extraction**: For each unique historical curation transaction up to the report end date, the `/api/curations` function fetches the Polygon receipt and extracts item IDs from curation events
4. **Item Matching**: Matches item IDs with collection items to get names and metadata
5. **Duplicate Detection**: Tracks items that have already been curated to identify duplicates
6. **Fee Calculation**: For each curation, calculates `creationFee ÷ 3` as curator payment (only for first curation per item)
7. **Data Processing**: The Pages Function groups curations by curator and aggregates totals (excluding 0-fee duplicates)
8. **Report Generation**: Displays results with expandable details and export options

### Automation Worker Flow

1. The monthly payment cron runs on the 1st day of each month at `15:00 UTC`
2. It calculates the previous UTC calendar month
3. It calls the same shared curation report logic used by `/api/curations`
4. It blocks curator automation if unresolved Polygon receipt warnings exist
5. It fetches the MANA/USD price and calculates council stipend payments from `COUNCIL_STIPEND_USD`
6. It creates separate Safe Transaction Service proposals for curators and council stipends
7. It stores per-period status in `AUTOMATION_RUNS_KV` to avoid duplicate proposals
8. It posts a summary with Safe links to Discord
9. A separate daily cron runs at `14:00 UTC`, checks the Polygon Gas Tank POL balance, and posts Discord refill alerts using two configurable thresholds:
   - Low alert: below `GAS_TANK_LOW_POL_BALANCE`, defaults to `1000` POL. This posts once and will not post again until the tank is refilled above the low threshold and later drops below it again.
   - Urgent alert: below `GAS_TANK_URGENT_POL_BALANCE`, defaults to `100` POL. This posts every daily check while the balance remains urgent.

The monthly automation creates two separate Safe proposals, not one combined transaction. Curator proposals use `origin` metadata like `dao-council:auto:curators:YYYY-MM`, and Council proposals use `dao-council:auto:council:YYYY-MM`.

### Fee Calculation Logic

- Each payable curation represents the first review of one published item
- Curator fee = the matched item's `creationFee ÷ 3` (curator gets 1/3 of that publication fee)
- **Duplicate Curation Handling**: Only the first curation of an item generates fees. The backend checks curation history from the collection cutoff through the report end date, so later edit/update approvals are not paid again even if the original curation happened before the selected report range.
- If a historical Polygon receipt cannot be loaded, later curations in the same collection are excluded from payable totals and the UI shows a warning. This avoids overpaying when public RPC data is incomplete.
- Amounts are converted from wei (BigNumber) to MANA for display
- Safe transaction creation converts curator totals back to wei and creates one Ethereum mainnet MANA ERC20 `transfer` call per curator

### Item ID Extraction

Due to a bug in the GraphQL indexer where the `item` field always returns `null`, the application uses a workaround to extract item IDs from transaction logs:

1. **Transaction Log Parsing**: For each curation transaction, `/api/curations` fetches the transaction receipt through the shared Polygon RPC helper
2. **Event Detection**: Identifies curation events (signature: `0x87a972ab2db2d47a0bbefe72cefc4fe5a38b1b9d2bc4b9f366b59fdb6dbd9581`) emitted by collection contracts
3. **Item ID Extraction**: Extracts the item ID from the event topics or data field
4. **Item Matching**: Matches extracted item IDs with collection items by `blockchainId` to get item names
5. **Link Generation**: Creates direct links to items in the Decentraland marketplace using the format: `https://decentraland.org/marketplace/contracts/{collectionId}/items/{itemId}`

This workaround ensures that:
- Item links point directly to specific items rather than collections
- Item names are displayed in the UI
- Duplicate curations can be properly identified and handled

### Data Sources

- **App GraphQL API**: `/api/graphql`
- **App Processed Curations API**: `/api/curations`
- **App MANA Price API**: `/api/mana-price`
- **App Polygon RPC API**: `/api/polygon-rpc`
- **Upstream GraphQL Endpoint**: `https://subgraph.decentraland.org/collections-matic-mainnet`
- **Upstream Price Endpoints**: Coinbase `MANA-USD` spot price, with CoinGecko simple price API for `decentraland` as fallback
- **Upstream Polygon RPC Endpoints**: `POLYGON_RPC_URL` when configured, then PublicNode Polygon RPC and LlamaRPC as fallbacks
- **Filter**: Only collections created after timestamp `1658153853`
- **Curation Blockchain**: Polygon network transactions
- **Payment Token**: Ethereum mainnet MANA (`0x0F5D2fB29fb7d3CFeE444a200298f468908cC942`)

## Configuration

### Polygon RPC

The app uses Polygon transaction receipts to recover item IDs for curation rows. By default, the Pages Functions use public Polygon RPC endpoints. To use your own provider, set this Cloudflare Pages environment variable:

```bash
POLYGON_RPC_URL=https://your-polygon-rpc.example
```

Locally, `npm run dev` passes `.env` to Wrangler, so put the variable there or copy `.env.example` to `.env`. If `POLYGON_RPC_URL` is not set, the app falls back to the public RPC endpoints. `POLYGON_RPC_ENDPOINT` is also accepted as a backwards-compatible alias.

Receipt lookups are batched through JSON-RPC because item IDs have to be recovered from transaction receipts. `POLYGON_RPC_BATCH_SIZE` defaults to `10`; lower it if your provider rate-limits batched requests, or raise it if your provider supports larger batches. Failed internal-error batches are retried in smaller chunks. `POLYGON_RPC_BATCH_DELAY_MS` defaults to `0`.

### Automation Worker

Copy `.env.example` to `.env` for local development and fill in the automation values when testing the Worker:

```bash
AUTOMATION_DRY_RUN=true
AUTOMATION_ADMIN_TOKEN=local-test-token
AUTOMATION_PROPOSER_PRIVATE_KEY=0x...
SAFE_API_KEY=...
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/...
SAFE_ADDRESS=0x...
SAFE_CHAIN_ID=1
COUNCIL_STIPEND_USD=1000
GAS_TANK_LOW_POL_BALANCE=1000
GAS_TANK_URGENT_POL_BALANCE=100
DISCORD_BOT_TOKEN=...
DISCORD_CHANNEL_ID=...
```

`AUTOMATION_DRY_RUN=true` computes payments and Discord text but does not create Safe proposals or write completed KV idempotency records. Keep it enabled for the first Cloudflare deployment.

The daily Gas Tank cron checks the balance every day. `GAS_TANK_LOW_POL_BALANCE` defaults to `1000` POL and sends one “refill on next monthly sync” message per depletion cycle. The low alert state is stored in `AUTOMATION_RUNS_KV` and resets after the balance is refilled back above the low threshold. `GAS_TANK_URGENT_POL_BALANCE` defaults to `100` POL and sends an urgent message every day while the balance stays below that value. Both alerts include the same Safe App CowSwap refill link used by the **Gas Tank** tab's **Refill** button.

Manual local run:

```bash
curl -X POST "http://localhost:8787/run" \
  -H "Authorization: Bearer $AUTOMATION_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"dryRun":true,"notifyDiscord":false}'
```

Health check:

```bash
curl "http://localhost:8787/health"
```

Temporary live smoke test payload. This ignores dry-run, creates a 1 MANA Safe proposal to the Safe itself, and sends `Test` plus the Safe transaction link to Discord:

```bash
curl -X POST "http://localhost:8787/run" \
  -H "Authorization: Bearer $AUTOMATION_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"test":true}'
```

Manual Gas Tank alert check:

```bash
curl -X POST "http://localhost:8787/run" \
  -H "Authorization: Bearer $AUTOMATION_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"gasTank":true}'
```

Local monthly scheduled test:

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+15+1+*+*"
```

Local Gas Tank scheduled test:

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+14+*+*+*"
```

Cloudflare setup:

1. Create a KV namespace named `dao-council-automation-runs`
2. Replace the placeholder `kv_namespaces[0].id` in `wrangler.automation.jsonc`
3. Add Worker secrets with `npm exec -- wrangler secret put <NAME> -c wrangler.automation.jsonc`:
   - `AUTOMATION_PROPOSER_PRIVATE_KEY`
   - `AUTOMATION_ADMIN_TOKEN`
   - `SAFE_API_KEY`
   - `ETHEREUM_RPC_URL`
   - `POLYGON_RPC_URL`
   - `DISCORD_BOT_TOKEN`
4. Add Worker vars in Cloudflare or `wrangler.automation.jsonc`:
   - `SAFE_ADDRESS`
   - `DISCORD_CHANNEL_ID`
   - `COUNCIL_STIPEND_USD=1000`
   - `GAS_TANK_LOW_POL_BALANCE=1000`
   - `GAS_TANK_URGENT_POL_BALANCE=100`
   - `SAFE_CHAIN_ID=1`
   - `AUTOMATION_DRY_RUN=true` for the first deployment

Safe setup:

1. Generate a new Ethereum private key dedicated to automation
2. Derive its address
3. Add that address as a Safe Transaction Service delegate/proposer for the Council Safe; do not add it as an on-chain Safe owner
4. Generate a Safe API key
5. Keep the automation account without ETH, MANA, or owner permissions
6. Confirm proposals from that address appear in Safe with zero owner confirmations

Discord setup:

1. Create a Discord application and bot
2. Add the bot to the Council server
3. Create `#multisig`
4. Give the bot only `View Channel` and `Send Messages` in that channel
5. Do not give the bot Administrator, Manage Messages, Mention Everyone, or Manage Webhooks permissions
6. Copy the bot token and channel ID into Cloudflare Worker secrets/vars

Discord messages are sent with `allowed_mentions: { "parse": [] }` so automation output cannot broadly mention roles or users.

### Curator Data

The application includes a mapping of curator addresses to names and payment addresses in `src/curatorData.ts`. Update this file to add new curators or modify payment addresses.

### Date Restrictions

- Maximum date is current date (no future dates allowed)
- If current month is selected and not complete, end date defaults to today
- All dates are handled in local timezone to avoid date shifting issues

## Usage

The app currently has three top-level tabs:

- **Curators**: Shows the curator fees report workflow.
- **Council**: Shows monthly DAO Council stipend payments.
- **Gas Tank**: Shows the Polygon Gas Tank POL balance and opens the Safe CowSwap refill flow.

### Generating Reports

1. **Select Date Range**: Use the month picker for quick selection or custom from/to dates
2. **View Results**: See summary statistics and curator list
3. **Expand Details**: Click on any curator row to see individual curations
4. **Create Payment Transaction**: Open the deployed app from Safe Apps and click "Create Transaction" to create a batched MANA payment transaction. Outside Safe, the same action copies a multisig CSV.

### Safe Transaction Creation

To create the multisig transaction:

1. Open the Safe web app for the DAO Council multisig
2. Add `https://dao-council.pages.dev` as a custom Safe App if it is not already listed
3. Open the app inside Safe Apps
4. Generate the report and click "Create Transaction"

The button creates a Safe transaction batch with one Ethereum mainnet MANA ERC20 `transfer` call per payment address. Safe will only allow transaction creation when the app is opened in Safe by an account with the required permissions. The app blocks Safe transaction creation if the connected Safe is not on Ethereum mainnet.

If the app is opened outside Safe, the payment action becomes "Copy CSV" and copies the same payment data in CSV format for manual import.

### Council Stipends

1. Open the **Council** tab
2. Review the current MANA/USD price
3. Adjust the monthly USD stipend if needed; it defaults to `$1000`
4. Edit any Council member payment address if needed
5. Click "Create Transaction" inside Safe, or "Copy CSV" outside Safe

The Council tab calculates `stipend USD ÷ MANA/USD price` for each member and creates one Ethereum mainnet MANA transfer per Council member.
