const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool({ connectionString: config.connectionString });

async function seed() {
  const client = await pool.connect();
  try {
    const hash = await bcrypt.hash("password123", 10);

    await client.query(
      `
      INSERT INTO users (email, password_hash, name, role, skills)
      VALUES 
        ('employer@talentx.com', $1, 'John Employer', 'employer', NULL),
        ('talent@talentx.com', $1, 'Jane Candidate', 'talent', 'React, Node.js, TypeScript'),
        ('talent2@talentx.com', $1, 'Bob Developer', 'talent', 'Python, Django, PostgreSQL')
      ON CONFLICT (email) DO NOTHING
    `,
      [hash]
    );

    const { rows: users } = await client.query(
      "SELECT id FROM users WHERE role = $1",
      ["employer"]
    );
    const empId = users[0]?.id;

    if (empId) {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 14);
      await client.query(
        `
        INSERT INTO jobs (title, company, tech_stack, application_deadline, location, description, requirements, salary_min, salary_max, posted_by, status)
        VALUES 
          ('Senior React Developer', 'TechCorp', 'React, TypeScript, Node.js', $2, 'Remote', 'Build scalable web applications.', '5+ years React, TypeScript', 120000, 160000, $1, 'active'),
          ('Backend Engineer', 'DataFlow Inc', 'Node.js, PostgreSQL', $2, 'New York', 'Design and maintain APIs.', 'Node.js, PostgreSQL', 100000, 140000, $1, 'active'),
          ('Full Stack Developer', 'StartupXYZ', 'React, Node.js, SQL', $2, 'San Francisco', 'End-to-end product development.', 'React, Node.js, SQL', 90000, 130000, $1, 'active')
        `,
        [empId, deadline]
      );
    }

    console.log("Seed data inserted.");
  } catch (err) {
    console.error("Seed error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
