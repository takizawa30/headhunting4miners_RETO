CREATE TABLE equipment_types (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  interval_hours NUMERIC(10,1) NOT NULL CHECK (interval_hours > 0)
);
INSERT INTO equipment_types VALUES ('camion','Camión',250),('excavadora','Excavadora',500),('perforadora','Perforadora',200);

CREATE TABLE equipment (
  id UUID PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  type TEXT NOT NULL REFERENCES equipment_types(code),
  hourmeter NUMERIC(10,1) NOT NULL CHECK (hourmeter >= 0),
  last_maintenance_hourmeter NUMERIC(10,1) NOT NULL DEFAULT 0 CHECK (last_maintenance_hourmeter >= 0 AND last_maintenance_hourmeter <= hourmeter),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE maintenance (
  id UUID PRIMARY KEY,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  hourmeter NUMERIC(10,1) NOT NULL CHECK (hourmeter >= 0),
  cycle_hours NUMERIC(10,1) NOT NULL CHECK (cycle_hours >= 0),
  notes TEXT NOT NULL DEFAULT '',
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX maintenance_equipment_date ON maintenance(equipment_id, performed_at DESC);
