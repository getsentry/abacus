# Abacus

Track and analyze AI coding tool usage (Claude Code and Cursor) across your team.

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
| `BETTER_AUTH_SECRET` | Yes | Random secret for session encryption (generate with `openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `DOMAIN` | Yes | Email domain to restrict access (e.g., `sentry.io`) |
| `ANTHROPIC_ADMIN_KEY` | Yes | Anthropic Admin API key for fetching Claude Code usage |
| `CURSOR_TEAM_SLUG` | Yes | Your Cursor team slug |
| `CURSOR_ADMIN_KEY` | Yes | Cursor Admin API key |
| `CRON_SECRET` | No | Secret for authenticating cron jobs |

See [Obtaining API Keys](#obtaining-api-keys) below for detailed instructions on getting each credential.

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

# Create .env.local with your credentials (see Obtaining API Keys section)
cat > .env.local << 'EOF'
POSTGRES_URL=your-postgres-url
BETTER_AUTH_SECRET=generate-with-openssl-rand-base64-32
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
DOMAIN=yourcompany.com
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

# Create .env.local with your credentials (see Obtaining API Keys section)
cat > .env.local << 'EOF'
POSTGRES_URL=postgres://...
BETTER_AUTH_SECRET=generate-with-openssl-rand-base64-32
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
DOMAIN=yourcompany.com
ANTHROPIC_ADMIN_KEY=sk-admin-...
CURSOR_TEAM_SLUG=your-team
CURSOR_ADMIN_KEY=...
EOF

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note**: For local development, add `http://localhost:3000/api/auth/callback/google` to your Google OAuth redirect URIs.

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

## Obtaining API Keys

### Google OAuth Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth client ID**
5. If prompted, configure the OAuth consent screen:
   - User Type: **Internal** (for organization-only access)
   - App name: "Abacus" (or your preferred name)
   - Support email: Your email
   - Authorized domains: Your production domain (e.g., `your-app.vercel.app`)
6. Create the OAuth client:
   - Application type: **Web application**
   - Name: "Abacus" (or your preferred name)
   - Authorized redirect URIs:
     - Production: `https://your-app.vercel.app/api/auth/callback/google`
     - Local dev: `http://localhost:3000/api/auth/callback/google`
7. Copy the **Client ID** and **Client Secret**

### Anthropic Admin API Key

1. Go to the [Anthropic Console](https://console.anthropic.com/)
2. Navigate to **Settings → Admin API keys** (requires organization admin access)
3. Click **Create Key**
4. Name it something like "Abacus Usage Sync"
5. Copy the key (starts with `sk-admin-`)

> **Note**: Admin API keys are different from regular API keys. They provide read access to organization usage data. You need organization admin permissions to create one.

### Cursor Admin API Key

1. Contact Cursor support or your Cursor account manager
2. Request admin API access for usage analytics
3. They will provide:
   - `CURSOR_TEAM_SLUG`: Your team's URL slug (e.g., `your-company`)
   - `CURSOR_ADMIN_KEY`: The admin API key

> **Note**: Cursor admin API access may require an enterprise plan. Contact cursor.com/contact for more information.

### BETTER_AUTH_SECRET

Generate a secure random secret:

```bash
openssl rand -base64 32
```

This secret is used to encrypt session cookies. Keep it secure and don't share it.

### CRON_SECRET (Optional)

Generate another random secret for authenticating cron job requests:

```bash
openssl rand -base64 32
```

This prevents unauthorized triggering of sync jobs.

## Environment Variables Reference

```bash
# Database
POSTGRES_URL=postgres://...

# Authentication
BETTER_AUTH_SECRET=your-random-secret
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
DOMAIN=yourcompany.com

# API Sync
ANTHROPIC_ADMIN_KEY=sk-admin-...
CURSOR_TEAM_SLUG=your-team
CURSOR_ADMIN_KEY=...

# Optional
CRON_SECRET=random-string
```

## License

MIT
