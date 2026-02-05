const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool({ connectionString: config.connectionString });

const migrateSQL = `
-- Remove guest from roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('employer', 'talent'));
UPDATE users SET role = 'employer' WHERE role = 'guest';

-- Add new job columns if not exist
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tech_stack VARCHAR(500);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS application_deadline TIMESTAMP;

-- Add source to applications
ALTER TABLE applications ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual';
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_source_check;
ALTER TABLE applications ADD CONSTRAINT applications_source_check CHECK (source IN ('manual', 'invitation'));

-- Add skills to users for talent matching
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT;

-- Invitations table
CREATE TABLE IF NOT EXISTS invitations (
  id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  talent_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  employer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, talent_id)
);
CREATE INDEX IF NOT EXISTS idx_invitations_talent ON invitations(talent_id);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(migrateSQL);
    console.log("Migration completed.");
  } catch (err) {
    console.error("Migration error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
