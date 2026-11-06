import { createApp } from './app.js';
import { createPool } from './db.js';
const pool = createPool();
const server = createApp(pool).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('MineTrack API lista.'));
async function shutdown() { server.close(async () => { await pool.end(); process.exit(0); }); setTimeout(() => process.exit(1), 10000).unref(); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
