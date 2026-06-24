const db = require('../services/db');

const UPDATABLE_COLUMNS = new Set(['domain', 'template_id', 'content', 'published']);

async function findByClient(clientId) {
  const { rows } = await db.query(
    `SELECT id, client_id, domain, template_id, content, published, published_url,
            last_published_at, created_at, updated_at
     FROM websites
     WHERE client_id = $1`,
    [clientId]
  );
  return rows[0] || null;
}

async function update(clientId, fields) {
  const sets = [];
  const values = [clientId];
  for (const [key, value] of Object.entries(fields)) {
    if (!UPDATABLE_COLUMNS.has(key) || value === undefined) continue;
    values.push(key === 'content' ? JSON.stringify(value) : value);
    sets.push(`${key} = $${values.length}`);
  }
  if (sets.length === 0) return null;
  const { rows } = await db.query(
    `UPDATE websites SET ${sets.join(', ')} WHERE client_id = $1 RETURNING *`,
    values
  );
  return rows[0] || null;
}

async function setPublished(clientId, { published, publishedUrl }) {
  const { rows } = await db.query(
    `UPDATE websites
     SET published = $2,
         published_url = $3,
         last_published_at = CASE WHEN $2 THEN now() ELSE last_published_at END
     WHERE client_id = $1
     RETURNING *`,
    [clientId, published, publishedUrl]
  );
  return rows[0] || null;
}

// Stores AI-generated content under content.generated_draft without clobbering
// the rest of the customizations, creating the site row if needed.
async function saveGeneratedDraft(clientId, draft) {
  const { rows } = await db.query(
    `INSERT INTO websites (client_id, content)
     VALUES ($1, jsonb_build_object('generated_draft', $2::jsonb))
     ON CONFLICT (client_id) DO UPDATE SET
       content = jsonb_set(COALESCE(websites.content, '{}'::jsonb), '{generated_draft}', $2::jsonb, true)
     RETURNING *`,
    [clientId, JSON.stringify(draft)]
  );
  return rows[0];
}

module.exports = { findByClient, update, setPublished, saveGeneratedDraft };
