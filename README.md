# AI Usage Tracker

Track and analyze AI coding tool usage (Claude Code and Cursor) across your company.

## Features

- **Dashboard**: Token consumption, costs, model breakdown, top users
- **User Analytics**: Per-user usage history, model preferences, trends
- **Pivot Table**: Sortable/filterable view of all users with detailed metrics
- **API Sync**: Automated data fetching from Anthropic and Cursor APIs
- **CSV Import**: Manual import of usage CSV exports
- **API Key Mapping**: Map Claude Code API keys to user emails

## Deployment

### 1. Prerequisites

- [Vercel account](https://vercel.com)
- [Vercel Postgres database](https://vercel.com/docs/storage/vercel-postgres)
- Anthropic Admin API key (from [Console → Settings → Admin API Keys](https://console.anthropic.com))
- Cursor Admin API key (contact Cursor support)

### 2. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-org/ai-usage-tracker)

Or deploy manually:

```bash
# Install Vercel CLI
npm i -g vercel

# Link to your Vercel project
vercel link

# Deploy
vercel --prod
```

### 3. Configure Environment Variables

Set these in your Vercel project settings (Settings → Environment Variables):

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_URL` | Yes | Vercel Postgres connection URL (auto-set when you create a Postgres DB) |
| `ANTHROPIC_ADMIN_KEY` | Yes | Anthropic Admin API key for fetching Claude Code usage |
| `CURSOR_TEAM_SLUG` | Yes | Your Cursor team slug |
| `CURSOR_ADMIN_KEY` | Yes | Cursor Admin API key |
| `ADMIN_PASSWORD` | No | Password to protect settings/import pages (leave empty for no auth) |
| `CRON_SECRET` | No | Secret for authenticating cron jobs |

### 4. Create Vercel Postgres Database

```bash
vercel storage create postgres
```

The `POSTGRES_URL` will be automatically set.

### 5. Initial Data Import

#### Option A: Backfill from APIs (Recommended)

Run the backfill script to import historical data:

```bash
# Clone and setup locally
git clone <your-repo>
cd ai-usage-tracker
npm install

# Create .env.local with your credentials
cat > .env.local << EOF
POSTGRES_URL=your-postgres-url
ANTHROPIC_ADMIN_KEY=sk-admin-...
CURSOR_TEAM_SLUG=your-team
CURSOR_ADMIN_KEY=...
EOF

# Run backfill (default: last 30 days)
npx tsx scripts/backfill.ts

# Or specify date range
npx tsx scripts/backfill.ts --from 2024-01-01 --to 2025-01-06

# Or specify days
npx tsx scripts/backfill.ts --days 90
```

#### Option B: CSV Import

1. Export CSV from [Claude Console](https://console.anthropic.com) or Cursor admin
2. Open your deployed app
3. Click "Import CSV"
4. Upload the file

## Data Sources

### Anthropic (Claude Code)

**Endpoint**: `GET https://api.anthropic.com/v1/organizations/usage_report/messages`

The sync fetches:
- Token counts (input, output, cache read/write)
- Model used
- API key ID (mapped to user email)

User identification: Extracts email from API key pattern `claude_code_key_{firstname.lastname}_{suffix}` → `firstname.lastname@sentry.io`

### Cursor

**Endpoint**: `POST https://www.cursor.com/api/dashboard/teams/filtered-usage-events`

The sync fetches:
- User email (direct)
- Token counts
- Model used
- Cost

## API Key Mapping

Claude Code API keys that don't match the standard pattern need manual mapping:

1. Go to Settings
2. See "Unmapped API Keys" section
3. Assign each key to a user email

Mappings are applied retroactively to existing records.

## Automated Sync

A Vercel Cron job runs daily at 6:00 AM UTC to sync the latest data.

To manually trigger a sync:

```bash
curl -X POST https://your-app.vercel.app/api/sync \
  -H "Cookie: ai_tracker_auth=..." \
  -H "Content-Type: application/json" \
  -d '{"startDate": "2025-01-01", "endDate": "2025-01-06"}'
```

## Local Development

```bash
# Install dependencies
npm install

# Create .env.local with your credentials
cp .env.example .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

```
src/
├── app/
│   ├── page.tsx           # Main dashboard
│   ├── settings/          # Settings page (protected)
│   ├── users/             # Users pivot table
│   └── api/
│       ├── auth/          # Authentication
│       ├── import/        # CSV import
│       ├── mappings/      # API key mappings
│       ├── sync/          # Manual sync trigger
│       ├── cron/sync/     # Cron endpoint
│       └── ...            # Data endpoints
├── components/            # React components
├── lib/
│   ├── db.ts              # Database connection
│   ├── queries.ts         # Database queries
│   ├── sync/              # API sync modules
│   │   ├── anthropic.ts   # Anthropic API sync
│   │   └── cursor.ts      # Cursor API sync
│   └── importers/         # CSV importers
└── middleware.ts          # Auth middleware
```

## Environment Variables Reference

```bash
# Required
POSTGRES_URL=postgres://...

# API Sync (required for automated sync)
ANTHROPIC_ADMIN_KEY=sk-admin-...
CURSOR_TEAM_SLUG=your-team
CURSOR_ADMIN_KEY=...

# Optional
ADMIN_PASSWORD=secret123      # Protects settings/import
CRON_SECRET=random-string     # Authenticates cron jobs
```

## License

MIT
