# Curator Fees Calculator

A web application for calculating and reporting curator fees in the Decentraland ecosystem. This tool helps track curator activities and generate payment reports for the curation program.

## Features

- **Date Range Selection**: Choose specific months or custom date ranges for fee calculation
- **Curation Tracking**: View individual curator activities in chronological order
- **Fee Calculation**: Automatically calculates curator fees (1/3 of creation fees) from GraphQL data
- **Detailed Reports**: Expandable curator details showing individual curations with timestamps
- **Multisig Integration**: Create a Safe transaction batch for curator payments
- **Blockchain Links**: Direct links to Polygonscan transactions and Decentraland marketplace items
- **Item ID Extraction**: Workaround for GraphQL bug by parsing transaction logs to extract item IDs
- **Duplicate Curation Handling**: Automatically identifies and excludes duplicate curations from fee calculations

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Cloudflare Runtime**: Cloudflare Pages with Pages Functions
- **Styling**: CSS with dark theme
- **Data Source**: Decentraland GraphQL subgraph, proxied through the app's Pages Function API
- **Blockchain**: Polygon network (MANA token)
- **Libraries**:
  - `date-fns` for date manipulation
  - `viem` for wei conversions and blockchain interaction
  - `@safe-global/safe-apps-sdk` for Safe transaction creation
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

3. Build and start the local Cloudflare Pages development server:

```bash
npm run dev
```

4. Open [http://localhost:5173](http://localhost:5173) in your browser

`npm run dev` builds the React app and runs it with the Pages Function API locally. The browser calls the same-origin `/api/graphql` endpoint, and the Pages Function forwards the request to Decentraland's subgraph. This replaces the old `corsproxy.io` workaround.

### Building for Production

```bash
npm run build
```

The built browser assets will be in the `dist` directory. Pages Functions are defined in the root `functions` directory.

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

This repository now deploys to Cloudflare Pages with a Pages Function API route. Vercel is no longer required.

For Git-based Cloudflare deployments, create a Pages project connected to this repository with:

- **Project name**: `dao-council`
- **Production branch**: `main`
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Root directory**: `/`

The production URL will be `https://dao-council.pages.dev`.

## How It Works

### Data Flow

1. **GraphQL Query**: The frontend requests `/api/graphql`; the Cloudflare Pages Function forwards the query to Decentraland's subgraph endpoint
2. **Transaction Log Extraction**: For each unique transaction, fetches receipt and extracts item IDs from curation events
3. **Item Matching**: Matches item IDs with collection items to get names and metadata
4. **Duplicate Detection**: Tracks items that have already been curated to identify duplicates
5. **Fee Calculation**: For each curation, calculates `creationFee ÷ 3` as curator payment (only for first curation per item)
6. **Data Processing**: Groups curations by curator and aggregates totals (excluding 0-fee duplicates)
7. **Report Generation**: Displays results with expandable details and export options

### Fee Calculation Logic

- Each curation represents one item being reviewed by a curator
- Curator fee = `creationFee ÷ 3` (curator gets 1/3 of the creation fee)
- **Duplicate Curation Handling**: Only the first curation of an item generates fees. Subsequent curations of the same item (edits/updates) show 0 fees and are excluded from payment calculations
- Amounts are converted from wei (BigNumber) to MANA for display
- Safe transaction creation converts curator totals back to wei and creates one MANA ERC20 `transfer` call per curator

### Item ID Extraction

Due to a bug in the GraphQL indexer where the `item` field always returns `null`, the application uses a workaround to extract item IDs from transaction logs:

1. **Transaction Log Parsing**: For each curation transaction, the app fetches the transaction receipt from Polygon
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
- **Upstream GraphQL Endpoint**: `https://subgraph.decentraland.org/collections-matic-mainnet`
- **Filter**: Only collections created after timestamp `1658153853`
- **Blockchain**: Polygon network transactions
- **Token**: MANA (contract: `0x0F5D2fB29fb7d3CFeE444a200298f468908cC942`)

## Configuration

### Curator Data

The application includes a mapping of curator addresses to names and payment addresses in `src/curatorData.ts`. Update this file to add new curators or modify payment addresses.

### Date Restrictions

- Maximum date is current date (no future dates allowed)
- If current month is selected and not complete, end date defaults to today
- All dates are handled in local timezone to avoid date shifting issues

## Usage

### Generating Reports

1. **Select Date Range**: Use the month picker for quick selection or custom from/to dates
2. **View Results**: See summary statistics and curator list
3. **Expand Details**: Click on any curator row to see individual curations
4. **Create Safe Transaction**: Open the deployed app from Safe Apps and click "Create Safe Transaction" to create a batched MANA payment transaction

### Safe Transaction Creation

To create the multisig transaction:

1. Open the Safe web app for the DAO Council multisig
2. Add `https://dao-council.pages.dev` as a custom Safe App if it is not already listed
3. Open the app inside Safe Apps
4. Generate the report and click "Create Safe Transaction"

The button creates a Safe transaction batch with one MANA ERC20 `transfer` call per curator payment address. Safe will only allow transaction creation when the app is opened in Safe by an account with the required permissions.
