# Abacus

Track and analyze AI coding tool usage across your team. Supports multiple providers with a modular architecture.

![Abacus Dashboard](docs/src/assets/screenshot.png)

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
| **GitHub Commits** | GitHub App webhook + API | AI Attributed commit tracking (Co-Authored-By detection) |

Each provider is optional—configure only the ones you use.

---

## Quick Start

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/getsentry/abacus)

See the **[Quick Start Guide](https://getsentry.github.io/abacus/getting-started/quick-start/)** for full deployment instructions.

---

## Documentation

Full documentation is available at **[getsentry.github.io/abacus](https://getsentry.github.io/abacus/)**

- [Quick Start](https://getsentry.github.io/abacus/getting-started/quick-start/) - Deploy to Vercel in minutes
- [Environment Variables](https://getsentry.github.io/abacus/getting-started/environment-variables/) - Configuration reference
- [Providers](https://getsentry.github.io/abacus/providers/) - Set up Claude Code, Cursor, GitHub
- [CLI Reference](https://getsentry.github.io/abacus/cli/) - Command-line tools for sync and backfill
- [Deployment](https://getsentry.github.io/abacus/deployment/vercel/) - Vercel cron jobs and monitoring

---

## Local Development

```bash
pnpm install

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

pnpm cli db:migrate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

**Note:** Add `http://localhost:3000/api/auth/callback/google` to your Google OAuth redirect URIs for local development.

---

## License

Apache 2.0 - see [LICENSE](LICENSE)
