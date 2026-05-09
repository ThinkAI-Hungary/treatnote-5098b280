import { randomUUID } from 'crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../db/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(express.static(path.join(__dirname, 'public')));

// ─── API: Telephely list ───
app.get('/api/telephelyek', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT DISTINCT telephely_id FROM v2_clinic_mappings ORDER BY telephely_id`
  ).all() as any[];
  res.json(rows.map(r => r.telephely_id));
});

// ─── API: All mappings for a telephely ───
app.get('/api/mappings/:telephelyId', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, atomic_action_slug, szotar_kezeles_id, szotar_kezeles_name, conditions, confidence, reviewed
     FROM v2_clinic_mappings WHERE telephely_id = ? ORDER BY atomic_action_slug, conditions`
  ).all(req.params.telephelyId);
  res.json(rows);
});

// ─── API: Szótár items for a telephely (from Supabase cache or live) ───
app.get('/api/szotar/:telephelyId', async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bpjzgapmoyhtgryglcke.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'sb_secret_gRiwdPwnR3BcA6zo1a8XXQ_Z7bJr8Vn';
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/szotar_kezelesek?telephely_id=eq.${req.params.telephelyId}&select=id,name,category&order=name`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Range: '0-999',
        },
      }
    );
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── API: Update a mapping ───
app.put('/api/mappings/:id', (req, res) => {
  const db = getDb();
  const { szotar_kezeles_id, szotar_kezeles_name, confidence, reviewed } = req.body;
  db.prepare(
    `UPDATE v2_clinic_mappings SET szotar_kezeles_id = ?, szotar_kezeles_name = ?, confidence = ?, reviewed = ? WHERE id = ?`
  ).run(szotar_kezeles_id, szotar_kezeles_name, confidence ?? 1.0, reviewed ?? 1, req.params.id);
  res.json({ ok: true });
});

// ─── API: Protocol templates (from SQLite) ───
app.get('/api/templates', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, slug, name_hu, category, triggers, atomic_actions, visits, description, updated_at
     FROM v2_protocol_templates ORDER BY category, name_hu`
  ).all();
  res.json(rows);
});

// ─── API: Create protocol template ───
app.post('/api/templates', (req, res) => {
  const db = getDb();
  const { slug, name_hu, category, triggers, visits, description } = req.body;
  const id = randomUUID();
  // Derive flat atomic_actions from visits
  const allActions = (visits || []).flatMap((v: any) => v.actions || []);
  db.prepare(
    `INSERT INTO v2_protocol_templates (id, slug, name_hu, category, triggers, atomic_actions, visits, description, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(id, slug, name_hu, category || 'egyeb', JSON.stringify(triggers || []), JSON.stringify(allActions), JSON.stringify(visits || []), description || null);
  res.json({ ok: true, id });
});

// ─── API: Update protocol template ───
app.put('/api/templates/:id', (req, res) => {
  const db = getDb();
  const { name_hu, category, triggers, visits, description } = req.body;
  const allActions = (visits || []).flatMap((v: any) => v.actions || []);
  db.prepare(
    `UPDATE v2_protocol_templates SET name_hu = ?, category = ?, triggers = ?, atomic_actions = ?, visits = ?, description = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name_hu, category || 'egyeb', JSON.stringify(triggers || []), JSON.stringify(allActions), JSON.stringify(visits || []), description || null, req.params.id);
  res.json({ ok: true });
});

// ─── API: Delete protocol template ───
app.delete('/api/templates/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM v2_protocol_templates WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── API: Atomic actions catalog ───
app.get('/api/actions', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT slug, name_hu, category, parameter_schema FROM v2_atomic_actions ORDER BY category, name_hu`
  ).all();
  res.json(rows);
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`\n🦷 TreatNote Dashboard → http://localhost:${PORT}\n`);
});

