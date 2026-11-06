import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createPool } from './db.js';

export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(724103)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const directory = new URL('../migrations/', import.meta.url);
    for (const name of (await readdir(directory)).filter(n => n.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const { rows } = await client.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name]);
      if (rows.length) {
        if (rows[0].checksum !== checksum) throw new Error(`Migracion modificada despues de aplicarse: ${name}. Crea una nueva migracion.`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, checksum]);
      console.log(`Migracion aplicada: ${name}`);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let pool;
  try { pool = createPool(); await migrate(pool); console.log('Base de datos actualizada.'); }
  catch (error) { console.error(`ERROR de migracion: ${error.code || 'comprueba conexion y migraciones'}`); process.exitCode = 1; }
  finally { await pool?.end(); }
}
