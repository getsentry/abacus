# Abacus

Track and analyze AI coding tool usage across your team. Supports multiple providers with a modular architecture.

## Features

- **Dashboard**: Token consumption, costs, model breakdown, top users
- **User Analytics**: Per-user usage history, model preferences, trends
- **Pivot Table**: Sortable/filterable view of all users with detailed metrics
- **Multi-Provider**: Mix and match Claude Code, Cursor, or add your own
- **Automated Sync**: Cron jobs for continuous data fetching
- **CSV Import**: Manual import when APIs are unavailable or for backfills

### Supported Providers

| Provider | Data Source | Features |
|----------|-------------|----------|
| **Claude Code** | Anthropic Admin API | Token usage, costs, model breakdown, API key mapping |
| **Cursor** | Cursor Admin API or CSV | Token usage, costs, model breakdown |

Each provider is optional—configure only the ones you use.

---

## Quick Start

### 1. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/getsentry/abacus)

### 2. Create Postgres Database

```bash
vercel storage create postgres
```

This automatically sets `POSTGRES_URL` in your environment.

### 3. Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**
2. Create an OAuth 2.0 Client ID (Web application)
3. Add redirect URI: `https://your-app.vercel.app/api/auth/callback/google`
4. Copy the Client ID and Client Secret

### 4. Configure Environment Variables

Set these in Vercel project settings (**Settings → Environment Variables**):

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | From step 3 |
| `GOOGLE_CLIENT_SECRET` | From step 3 |
| `NEXT_PUBLIC_DOMAIN` | Email domain to restrict access (e.g., `sentry.io`) |
| `BETTER_AUTH_SECRET` | Run: `openssl rand -base64 32` |
| `CRON_SECRET` | Run: `openssl rand -hex 32` |

### 5. Configure Providers

Add credentials for the providers you want to use:

| Variable | Provider |
|----------|----------|
| `ANTHROPIC_ADMIN_KEY` | Claude Code ([how to get](#claude-code)) |
| `CURSOR_ADMIN_KEY` | Cursor ([how to get](#cursor)) |

### 6. Deploy

Redeploy to apply environment variables. Migrations run automatically on build.

---

## Local Development

```bash
npm install

# Create .env.local with your credentials
cat > .env.local << 'EOF'
POSTGRES_URL=postgres://...
BETTER_AUTH_SECRET=your-secret-here
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_DOMAIN=yourcompany.com
CRON_SECRET=your-cron-secret

# Providers (optional)
ANTHROPIC_ADMIN_KEY=sk-admin-...
CURSOR_ADMIN_KEY=...
EOF

npm run cli db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> Add `http://localhost:3000/api/auth/callback/google` to your Google OAuth redirect URIs.

---

## Provider Setup

### Claude Code

Claude Code usage is tracked via the Anthropic Admin API.

#### Getting the API Key

1. Go to [Anthropic Console](https://console.anthropic.com/) → **Settings → Admin API keys**
2. Click **Create Key** (requires org admin access)
3. Copy the key (starts with `sk-admin-`)

#### Sync Behavior

- **Schedule**: Daily at 6 AM UTC
- **Data**: Token counts, model, cost, API key ID
- **User Mapping**: API keys are mapped to emails via the Anthropic API. Unmapped keys appear in the UI for manual assignment.

#### Manual Sync

```bash
npm run cli sync anthropic --days 7
npm run cli backfill anthropic --from 2025-01-01 --to 2025-06-01
```

---

### Cursor

Cursor usage can be imported via API or CSV.

#### Option A: API Sync

1. Go to [Cursor Team Settings](https://cursor.com/settings/team)
2. Request admin API access from Cursor support
3. Set `CURSOR_ADMIN_KEY` in your environment

**Sync Behavior**:
- **Schedule**: Hourly
- **Data**: Token counts, model, user email, cost

```bash
npm run cli sync cursor --days 7
```

#### Option B: CSV Import

Faster for large historical imports.

1. Export from Cursor team dashboard → Usage/Analytics → Export CSV
2. Import:

```bash
npm run cli import:cursor-csv /path/to/export.csv
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

# Backfill (historical data)
npm run cli backfill anthropic --from 2025-01-01 --to 2025-06-01
npm run cli backfill cursor --from 2025-01-01 --to 2025-06-01
npm run cli backfill:complete anthropic  # Mark backfill as complete
npm run cli backfill:reset cursor        # Reset backfill status

# CSV Import
npm run cli import:cursor-csv <file>

# API Key Mappings (Claude Code)
npm run cli mappings               # List current mappings
npm run cli mappings:sync          # Sync from Anthropic API
npm run cli mappings:fix           # Interactive unmapped key assignment

# Data Analysis
npm run cli gaps                   # Check for gaps in usage data
npm run cli gaps anthropic
npm run cli gaps cursor

# Status
npm run cli anthropic:status       # Show Claude Code sync state
npm run cli cursor:status          # Show Cursor sync state
npm run cli stats                  # Database statistics
```

---

## Automated Sync

Vercel cron jobs keep data current:

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/sync-anthropic` | Daily 6 AM UTC | Sync recent Claude Code usage |
| `/api/cron/sync-cursor` | Hourly | Sync recent Cursor usage |
| `/api/cron/backfill-anthropic` | Every 6 hours | Backfill historical data |
| `/api/cron/backfill-cursor` | Every 6 hours | Backfill historical data |

Requires `CRON_SECRET` to be set.

---

## Architecture

```
src/
├── app/
│   ├── page.tsx              # Main dashboard
│   ├── users/                # Users list and profiles
│   ├── status/               # Sync status page
│   └── api/
│       ├── auth/             # Authentication (better-auth)
│       └── cron/             # Cron job endpoints
├── lib/
│   ├── queries.ts            # Database queries
│   ├── sync/                 # Provider sync modules
│   │   ├── anthropic.ts
│   │   ├── cursor.ts
│   │   └── index.ts
│   └── utils.ts
└── scripts/
    └── cli.ts                # CLI tool
```

---

## Adding New Providers

1. Create `src/lib/sync/your-provider.ts` implementing the sync interface
2. Add cron routes in `src/app/api/cron/`
3. Add CLI commands in `scripts/cli.ts`
4. Update the status page

Each provider should:
- Store data in `usage_records` with a unique `tool` identifier
- Aggregate by date/email/model before inserting
- Handle deduplication via the existing upsert logic

---

## Optional Configuration

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for error tracking |

---

## License

Apache 2.0 - see [LICENSE](LICENSE)
