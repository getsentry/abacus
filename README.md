# Abacus

Track and analyze AI coding tool usage across your team. Supports multiple providers with a modular architecture.

## Supported Providers

| Provider | Data Source | Features |
|----------|-------------|----------|
| **Claude Code** | Anthropic Admin API | Token usage, costs, model breakdown, API key mapping |
| **Cursor** | Cursor Admin API or CSV | Token usage, costs, model breakdown |

Each provider is **optional** - configure only the ones you use.

## Features

- **Dashboard**: Token consumption, costs, model breakdown, top users
- **User Analytics**: Per-user usage history, model preferences, trends
- **Pivot Table**: Sortable/filterable view of all users with detailed metrics
- **Multi-Provider**: Mix and match Claude Code, Cursor, or add your own
- **Automated Sync**: Cron jobs for continuous data fetching
- **CSV Import**: Manual import when APIs are unavailable or for backfills

## Quick Start

### 1. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/getsentry/abacus)

### 2. Create Postgres Database

```bash
vercel storage create postgres
```

### 3. Configure Required Variables

Set these in Vercel project settings (Settings → Environment Variables):

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_URL` | Yes | Auto-set when creating Vercel Postgres |
| `BETTER_AUTH_SECRET` | Yes | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `NEXT_PUBLIC_DOMAIN` | Yes | Email domain to restrict access (e.g., `sentry.io`) |
| `CRON_SECRET` | Yes | `openssl rand -hex 32` - required for cron jobs |

### 4. Configure Providers (Optional)

Add credentials for the providers you want to use:

| Variable | Provider | Description |
|----------|----------|-------------|
| `ANTHROPIC_ADMIN_KEY` | Claude Code | Anthropic Admin API key |
| `CURSOR_ADMIN_KEY` | Cursor | Cursor Admin API key |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry | Sentry DSN for error tracking (optional) |

See [Provider Setup](#provider-setup) for detailed instructions.

---

## Provider Setup

### Claude Code (Anthropic)

Claude Code usage is tracked via the Anthropic Admin API.

#### Getting the API Key

1. Go to the [Anthropic Console](https://console.anthropic.com/)
2. Navigate to **Settings → Admin API keys** (requires org admin access)
3. Click **Create Key** and name it "Abacus Usage Sync"
4. Copy the key (starts with `sk-admin-`)

#### Environment Variables

```bash
ANTHROPIC_ADMIN_KEY=sk-admin-...
```

#### How It Works

- **Sync Frequency**: Daily at 6 AM UTC via cron
- **Data Collected**: Token counts (input, output, cache), model, API key ID
- **User Identification**: API keys are mapped to emails via the Anthropic API or manual mapping

#### API Key Mapping

Claude Code API keys need to be mapped to user emails. This happens automatically during sync by querying the Anthropic API for key metadata. Keys without associated emails appear in the "Unmapped API Keys" section for manual assignment.

#### Manual Sync

```bash
# Sync last 7 days
npm run cli sync anthropic --days 7

# Backfill historical data
npm run cli backfill anthropic --from 2025-01-01 --to 2025-06-01
```

---

### Cursor

Cursor usage can be imported via API or CSV export.

#### Option A: API Sync (Recommended for ongoing sync)

##### Getting the API Key

1. Go to your [Cursor Team Settings](https://cursor.com/settings/team)
2. Navigate to the API section or contact Cursor support
3. Request admin API access for usage analytics
4. You'll receive a `CURSOR_ADMIN_KEY`

##### Environment Variables

```bash
CURSOR_ADMIN_KEY=your-admin-key
```

##### How It Works

- **Sync Frequency**: Hourly via cron
- **Data Collected**: Token counts, model, user email, cost
- **Rate Limits**: 20 requests/minute, 3-second delays between pages

##### Manual Sync

```bash
# Sync last 7 days
npm run cli sync cursor --days 7

# Check sync status
npm run cli cursor:status
```

#### Option B: CSV Import (Recommended for backfills)

The API can be slow for large historical imports. CSV export is much faster.

##### Exporting from Cursor

1. Log into your Cursor team dashboard
2. Navigate to Usage/Analytics
3. Export usage data as CSV for your desired date range

Or use the direct URL (adjust dates as epoch milliseconds):
```
https://cursor.com/api/dashboard/export-usage-events-csv?teamId=YOUR_TEAM_ID&startDate=START_MS&endDate=END_MS&strategy=tokens
```

##### Importing the CSV

```bash
npm run cli import:cursor-csv /path/to/cursor-export.csv
```

The import:
- Aggregates events by date/email/model
- Skips duplicates automatically
- Shows progress per day

##### CSV Format

The CSV should have these columns:
```
Date,User,Kind,Model,Max Mode,Input (w/ Cache Write),Input (w/o Cache Write),Cache Read,Output Tokens,Total Tokens,Cost
```

---

## CLI Reference

```bash
# Database
npm run cli db:migrate              # Run pending migrations

# Sync (API-based)
npm run cli sync                    # Sync all providers (last 7 days)
npm run cli sync anthropic --days 30
npm run cli sync cursor --days 7

# Backfill (API-based, with progress tracking)
npm run cli backfill anthropic --from 2025-01-01 --to 2025-06-01
npm run cli backfill cursor --from 2025-01-01 --to 2025-06-01

# CSV Import
npm run cli import:cursor-csv <file>

# API Key Mappings (Claude Code)
npm run cli mappings               # List current mappings
npm run cli mappings:sync          # Sync from Anthropic API
npm run cli mappings:fix           # Interactive unmapped key assignment

# Status
npm run cli anthropic:status       # Show Claude Code sync state
npm run cli cursor:status          # Show Cursor sync state
npm run cli stats                  # Database statistics
```

---

## Automated Sync (Cron Jobs)

Vercel cron jobs keep data up-to-date automatically:

| Job | Schedule | Description |
|-----|----------|-------------|
| `/api/cron/sync-anthropic` | Daily 6 AM UTC | Sync Claude Code usage |
| `/api/cron/sync-cursor` | Hourly | Sync Cursor usage |
| `/api/cron/backfill-anthropic` | Every 6 hours | Backfill historical Claude Code data |
| `/api/cron/backfill-cursor` | Every 6 hours | Backfill historical Cursor data |

Cron jobs require `CRON_SECRET` to be set. Vercel automatically sends the secret in the Authorization header.

---

## Local Development

```bash
# Install dependencies
npm install

# Create .env.local
cat > .env.local << 'EOF'
POSTGRES_URL=postgres://...
BETTER_AUTH_SECRET=generate-with-openssl-rand-base64-32
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXT_PUBLIC_DOMAIN=yourcompany.com
CRON_SECRET=generate-with-openssl-rand-hex-32

# Optional: Add providers you want to use
ANTHROPIC_ADMIN_KEY=sk-admin-...
CURSOR_ADMIN_KEY=...

# Optional: Error tracking
# NEXT_PUBLIC_SENTRY_DSN=https://...@....ingest.sentry.io/...
EOF

# Run migrations
npm run cli db:migrate

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note**: Add `http://localhost:3000/api/auth/callback/google` to your Google OAuth redirect URIs.

---

## Obtaining Credentials

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select a project
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth client ID**
5. Configure OAuth consent screen (Internal for org-only access)
6. Create Web application credentials with redirect URIs:
   - `https://your-app.vercel.app/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (for local dev)

### BETTER_AUTH_SECRET

```bash
openssl rand -base64 32
```

### CRON_SECRET

```bash
openssl rand -hex 32
```

---

## Architecture

```
src/
├── app/
│   ├── page.tsx              # Main dashboard
│   ├── users/                # Users pivot table
│   ├── status/               # Sync status page
│   └── api/
│       ├── auth/             # Authentication
│       ├── cron/             # Cron job endpoints
│       │   ├── sync-anthropic/
│       │   ├── sync-cursor/
│       │   ├── backfill-anthropic/
│       │   └── backfill-cursor/
│       └── ...
├── lib/
│   ├── queries.ts            # Database queries
│   ├── sync/                 # Provider sync modules
│   │   ├── anthropic.ts      # Claude Code sync
│   │   ├── cursor.ts         # Cursor sync
│   │   └── index.ts          # Unified sync interface
│   └── utils.ts              # Shared utilities
└── scripts/
    └── cli.ts                # CLI tool
```

---

## Adding New Providers

The system is designed to be extensible. To add a new provider:

1. Create a sync module in `src/lib/sync/your-provider.ts`
2. Implement the standard sync interface (see `anthropic.ts` or `cursor.ts`)
3. Add cron routes in `src/app/api/cron/`
4. Add CLI commands in `scripts/cli.ts`
5. Update the status page to show the new provider

Each provider should:
- Store data in `usage_records` with a unique `tool` identifier
- Aggregate by date/email/model before inserting
- Handle deduplication via the existing upsert logic

---

## License

MIT
