# Curator Fees Calculator

A web application for calculating and reporting curator fees in the Decentraland ecosystem. This tool helps track curator activities and generate payment reports for the curation program.

## Features

- **Date Range Selection**: Choose specific months or custom date ranges for fee calculation
- **Curation Tracking**: View individual curator activities in chronological order
- **Fee Calculation**: Automatically calculates curator fees (1/3 of creation fees) from GraphQL data
- **Detailed Reports**: Expandable curator details showing individual curations with timestamps
- **Multisig Integration**: Export payment data as CSV format for multisig wallet transactions
- **Blockchain Links**: Direct links to Polygonscan transactions and Decentraland marketplace items
- **Item ID Extraction**: Workaround for GraphQL bug by parsing transaction logs to extract item IDs
- **Duplicate Curation Handling**: Automatically identifies and excludes duplicate curations from fee calculations

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Cloudflare Runtime**: Cloudflare Worker with static assets via the Cloudflare Vite plugin
- **Styling**: CSS with dark theme
- **Data Source**: Decentraland GraphQL subgraph, proxied through the app's Worker API
- **Blockchain**: Polygon network (MANA token)
- **Libraries**:
  - `date-fns` for date manipulation
  - `viem` for wei conversions and blockchain interaction
  - `wrangler` and `@cloudflare/vite-plugin` for local Cloudflare development and deployment
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

3. Start the local Cloudflare/Vite development server:

```bash
npm run dev
```

4. Open [http://localhost:5173](http://localhost:5173) in your browser

`npm run dev` runs the React app and the Worker API together. The browser calls the same-origin `/api/graphql` endpoint, and the Worker forwards the request to Decentraland's subgraph. This replaces the old `corsproxy.io` workaround.

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory:

- `dist/client` contains the browser assets
- `dist/curator_fees` contains the Worker bundle and generated Wrangler config

### Previewing Production Locally

```bash
npm run preview
```

This previews the built app locally in the Cloudflare Workers runtime.

### Deploying to Cloudflare

Authenticate Wrangler once if needed:

```bash
npm exec wrangler login
```

Then deploy:

```bash
npm run deploy
```

This repository now deploys to Cloudflare as a Worker with static assets and an API route. Vercel is no longer required.

## How It Works

### Data Flow

1. **GraphQL Query**: The frontend requests `/api/graphql`; the Cloudflare Worker forwards the query to Decentraland's subgraph endpoint
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
- CSV export converts back to wei for blockchain transactions

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
4. **Export Data**: Click "Copy Multisig CSV" to get payment data for multisig wallets

### CSV Export Format

The exported CSV follows this structure for multisig wallet imports:

```csv
token_type,token_address,receiver,amount
erc20,0x0F5D2fB29fb7d3CFeE444a200298f468908cC942,{curator_address},{amount_in_wei}
```
