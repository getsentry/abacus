// Local development only.
//
// The app queries Postgres through Neon's serverless driver
// (@vercel/postgres + @neondatabase/serverless), which speaks Neon's WebSocket
// and HTTP "/sql" protocol instead of a plain TCP Postgres connection. To run
// against a local Postgres (docker-compose), we point that driver at the local
// "neon_proxy" container, which serves both protocols on port 4444.
//
// This is a no-op in production and whenever POSTGRES_URL is not a localhost
// connection, so importing it from the data-access modules is safe everywhere.
import { neonConfig } from '@neondatabase/serverless';

const url = process.env.POSTGRES_URL ?? '';
const isLocal =
  process.env.NODE_ENV !== 'production' && /@(localhost|127\.0\.0\.1)[:/]/.test(url);

if (isLocal) {
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineConnect = false;
  neonConfig.wsProxy = (host) => `${host}:4444/v1`;
  neonConfig.fetchEndpoint = (host) => `http://${host}:4444/sql`;
}
