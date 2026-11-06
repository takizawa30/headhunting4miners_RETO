import { z } from 'zod';

export const equipmentSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,29}$/, 'Usa entre 2 y 30 letras, numeros, guiones o guion bajo.'),
  type: z.enum(['camion', 'excavadora', 'perforadora']),
  hourmeter: z.number().finite().min(0).max(9999999).refine(n => Math.abs(n * 10 - Math.round(n * 10)) < 0.00001, 'Usa como maximo un decimal.')
}).strict();
export const maintenanceSchema = z.object({ notes: z.string().trim().max(1000).default('') }).strict();
export function presentEquipment(row) {
  const hourmeter = Number(row.hourmeter);
  const baseline = Number(row.last_maintenance_hourmeter);
  const interval = Number(row.interval_hours);
  const cycleHours = Math.round((hourmeter - baseline) * 10) / 10;
  return { id: row.id, code: row.code, type: row.type, hourmeter, lastMaintenanceHourmeter: baseline,
    intervalHours: interval, cycleHours, remainingHours: Math.max(0, Math.round((interval - cycleHours) * 10) / 10),
    requiresMaintenance: cycleHours >= interval, createdAt: row.created_at };
}
