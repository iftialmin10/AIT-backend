const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool({ connectionString: config.connectionString });

const initSQL = `
-- Users table: Employer or Talent only (no guest)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('employer', 'talent')),
  skills TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  company VARCHAR(255) NOT NULL,
  tech_stack VARCHAR(500),
  application_deadline TIMESTAMP,
  location VARCHAR(255),
  description TEXT,
  requirements TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  posted_by INTEGER REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'draft')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Applications: source = manual or invitation
CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  talent_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  source VARCHAR(50) DEFAULT 'manual' CHECK (source IN ('manual', 'invitation')),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'accepted', 'rejected')),
  cover_letter TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, talent_id)
);

-- Invitations
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

CREATE INDEX IF NOT EXISTS idx_jobs_title ON jobs(title);
CREATE INDEX IF NOT EXISTS idx_jobs_deadline ON jobs(application_deadline);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_invitations_talent ON invitations(talent_id);
`;

async function init() {
  const client = await pool.connect();
  try {
    await client.query(initSQL);
    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Database init error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

init();
