import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { equipmentSchema, maintenanceSchema, presentEquipment } from './domain.js';

const selectEquipment = 'SELECT e.*, t.interval_hours FROM equipment e JOIN equipment_types t ON t.code=e.type';
const idSchema = z.uuid();
export function createApp(pool, { frontendUrl = process.env.FRONTEND_URL, revision = process.env.RENDER_GIT_COMMIT || 'local' } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: frontendUrl || 'http://localhost:5173' }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/', (_req, res) => res.json({ name: 'MineTrack API', health: '/health', equipment: '/api/equipment' }));
  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1 FROM schema_migrations LIMIT 1');
      await pool.query('SELECT id FROM equipment LIMIT 1');
      res.json({ status: 'ok', database: 'ok', revision });
    } catch { res.status(503).json({ status: 'error', database: 'unavailable' }); }
  });
  app.get('/api/types', async (_req, res) => {
    const { rows } = await pool.query('SELECT code,label,interval_hours FROM equipment_types ORDER BY interval_hours');
    res.json(rows.map(r => ({ code: r.code, label: r.label, intervalHours: Number(r.interval_hours) })));
  });
  app.get('/api/equipment', async (_req, res) => {
    const { rows } = await pool.query(`${selectEquipment} ORDER BY e.created_at DESC,e.id`);
    res.json(rows.map(presentEquipment));
  });
  app.post('/api/equipment', async (req, res) => {
    const data = equipmentSchema.parse(req.body);
    const id = randomUUID();
    await pool.query('INSERT INTO equipment(id,code,type,hourmeter) VALUES($1,$2,$3,$4)', [id, data.code, data.type, data.hourmeter]);
    const { rows } = await pool.query(`${selectEquipment} WHERE e.id=$1`, [id]);
    res.status(201).json(presentEquipment(rows[0]));
  });
  app.put('/api/equipment/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id), data = equipmentSchema.parse(req.body);
    const result = await pool.query('UPDATE equipment SET code=$2,type=$3,hourmeter=$4 WHERE id=$1 AND hourmeter <= $4 RETURNING id', [id, data.code, data.type, data.hourmeter]);
    if (!result.rowCount) {
      const exists = await pool.query('SELECT id FROM equipment WHERE id=$1', [id]);
      return res.status(exists.rowCount ? 409 : 404).json({ error: exists.rowCount ? 'El horómetro no puede disminuir.' : 'Equipo no encontrado.' });
    }
    const { rows } = await pool.query(`${selectEquipment} WHERE e.id=$1`, [id]);
    res.json(presentEquipment(rows[0]));
  });
  app.delete('/api/equipment/:id', async (req, res) => {
    const result = await pool.query('DELETE FROM equipment WHERE id=$1', [idSchema.parse(req.params.id)]);
    if (!result.rowCount) return res.status(404).json({ error: 'Equipo no encontrado.' });
    res.status(204).end();
  });
  app.get('/api/equipment/:id/maintenance', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    if (!(await pool.query('SELECT id FROM equipment WHERE id=$1', [id])).rowCount) return res.status(404).json({ error: 'Equipo no encontrado.' });
    const { rows } = await pool.query('SELECT * FROM maintenance WHERE equipment_id=$1 ORDER BY performed_at DESC,id', [id]);
    res.json(rows.map(r => ({ id: r.id, hourmeter: Number(r.hourmeter), cycleHours: Number(r.cycle_hours), notes: r.notes, performedAt: r.performed_at })));
  });
  app.post('/api/equipment/:id/maintenance', async (req, res) => {
    const id = idSchema.parse(req.params.id), { notes } = maintenanceSchema.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT * FROM equipment WHERE id=$1 FOR UPDATE', [id]);
      if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Equipo no encontrado.' }); }
      const row = rows[0], cycleHours = Number(row.hourmeter) - Number(row.last_maintenance_hourmeter);
      if (cycleHours <= 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'No hay nuevas horas desde el último mantenimiento.' }); }
      await client.query('INSERT INTO maintenance(id,equipment_id,hourmeter,cycle_hours,notes) VALUES($1,$2,$3,$4,$5)', [randomUUID(), id, row.hourmeter, cycleHours, notes]);
      await client.query('UPDATE equipment SET last_maintenance_hourmeter=hourmeter WHERE id=$1', [id]);
      await client.query('COMMIT');
      const current = await pool.query(`${selectEquipment} WHERE e.id=$1`, [id]);
      res.status(201).json(presentEquipment(current.rows[0]));
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Revisa los datos del formulario.', details: error.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un equipo con ese código.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Solicitud demasiado grande.' });
    console.error('API error:', error.code || error.name);
    res.status(500).json({ error: 'No pudimos completar la operación. Intenta nuevamente.' });
  });
  return app;
}
