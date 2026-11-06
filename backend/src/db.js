import pg from 'pg';
export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('Falta DATABASE_URL. Copia .env.example a .env y configura PostgreSQL.');
  return new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 10000, query_timeout: 15000 });
}
