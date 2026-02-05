const express = require("express");
const pool = require("../db/pool");
const { authenticate, authorize } = require("../middleware/auth");
const { generateJobDescription } = require("../services/ai");

const router = express.Router();

// Public: list/search jobs
router.get("/", async (req, res) => {
  try {
    const { q, company, location, limit = 20, offset = 0 } = req.query;
    let query =
      "SELECT j.*, u.name as posted_by_name FROM jobs j LEFT JOIN users u ON j.posted_by = u.id WHERE j.status = $1";
    const params = ["active"];
    let idx = 2;

    if (q) {
      query += ` AND (j.title ILIKE $${idx} OR j.company ILIKE $${idx} OR j.description ILIKE $${idx})`;
      params.push(`%${q}%`);
      idx++;
    }
    if (company) {
      query += ` AND j.company ILIKE $${idx}`;
      params.push(`%${company}%`);
      idx++;
    }
    if (location) {
      query += ` AND j.location ILIKE $${idx}`;
      params.push(`%${location}%`);
      idx++;
    }

    query += ` ORDER BY j.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const { rows } = await pool.query(query, params);
    const { rows: countRows } = await pool.query(
      "SELECT COUNT(*) FROM jobs WHERE status = $1",
      ["active"]
    );
    res.json({ jobs: rows, total: parseInt(countRows[0].count, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public: get single job
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT j.*, u.name as posted_by_name FROM jobs j LEFT JOIN users u ON j.posted_by = u.id WHERE j.id = $1 AND j.status = $2",
      [req.params.id, "active"]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Job not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Employer: create job (title, tech_stack, application_deadline, AI-generated description)
router.post("/", authenticate, authorize("employer"), async (req, res) => {
  try {
    const {
      title,
      company,
      tech_stack,
      application_deadline,
      location,
      description,
      requirements,
      salary_min,
      salary_max,
    } = req.body;
    if (!title || !company)
      return res.status(400).json({ error: "Title and company required" });
    const { rows } = await pool.query(
      `INSERT INTO jobs (title, company, tech_stack, application_deadline, location, description, requirements, salary_min, salary_max, posted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        title,
        company || "",
        tech_stack || null,
        application_deadline || null,
        location || "",
        description || "",
        requirements || "",
        salary_min || null,
        salary_max || null,
        req.user.id,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI: generate job description (must be before /:id)
router.post(
  "/generate-description",
  authenticate,
  authorize("employer"),
  async (req, res) => {
    try {
      const { title, tech_stack } = req.body;
      if (!title) return res.status(400).json({ error: "Title required" });
      const description = await generateJobDescription(title, tech_stack);
      res.json({ description });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Employer: update own job
router.put("/:id", authenticate, authorize("employer"), async (req, res) => {
  try {
    const { rows: existing } = await pool.query(
      "SELECT posted_by FROM jobs WHERE id = $1",
      [req.params.id]
    );
    if (existing.length === 0)
      return res.status(404).json({ error: "Job not found" });
    if (existing[0].posted_by !== req.user.id)
      return res.status(403).json({ error: "Not your job" });

    const {
      title,
      company,
      tech_stack,
      application_deadline,
      location,
      description,
      requirements,
      salary_min,
      salary_max,
      status,
    } = req.body;
    const { rows } = await pool.query(
      `UPDATE jobs SET title = COALESCE($1, title), company = COALESCE($2, company), tech_stack = COALESCE($3, tech_stack),
       application_deadline = COALESCE($4, application_deadline), location = COALESCE($5, location),
       description = COALESCE($6, description), requirements = COALESCE($7, requirements),
       salary_min = COALESCE($8, salary_min), salary_max = COALESCE($9, salary_max), status = COALESCE($10, status),
       updated_at = CURRENT_TIMESTAMP WHERE id = $11 RETURNING *`,
      [
        title,
        company,
        tech_stack,
        application_deadline,
        location,
        description,
        requirements,
        salary_min,
        salary_max,
        status,
        req.params.id,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Employer: delete own job
router.delete("/:id", authenticate, authorize("employer"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "DELETE FROM jobs WHERE id = $1 AND posted_by = $2 RETURNING id",
      [req.params.id, req.user.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Job not found" });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Talent: apply to job (manual source). Deadline enforced.
router.post(
  "/:id/apply",
  authenticate,
  authorize("talent"),
  async (req, res) => {
    try {
      const { rows: jobRows } = await pool.query(
        "SELECT application_deadline FROM jobs WHERE id = $1 AND status = $2",
        [req.params.id, "active"]
      );
      if (jobRows.length === 0)
        return res.status(404).json({ error: "Job not found" });
      const deadline = jobRows[0].application_deadline;
      if (deadline && new Date(deadline) < new Date())
        return res
          .status(400)
          .json({ error: "Application deadline has passed" });

      const { cover_letter } = req.body;
      const { rows } = await pool.query(
        "INSERT INTO applications (job_id, talent_id, cover_letter, source) VALUES ($1, $2, $3, $4) RETURNING *",
        [req.params.id, req.user.id, cover_letter || "", "manual"]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === "23503")
        return res.status(404).json({ error: "Job not found" });
      if (err.code === "23505")
        return res.status(400).json({ error: "Already applied" });
      res.status(500).json({ error: err.message });
    }
  }
);

// Employer: list applications with source (manual/invitation)
router.get(
  "/:id/applications",
  authenticate,
  authorize("employer"),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT a.*, u.name as talent_name, u.email as talent_email FROM applications a
       JOIN users u ON a.talent_id = u.id
       JOIN jobs j ON a.job_id = j.id
       WHERE j.id = $1 AND j.posted_by = $2`,
        [req.params.id, req.user.id]
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Employer: invite talent
router.post(
  "/:id/invite",
  authenticate,
  authorize("employer"),
  async (req, res) => {
    try {
      const { talent_email, message } = req.body;
      if (!talent_email)
        return res.status(400).json({ error: "talent_email required" });

      const { rows: jobRows } = await pool.query(
        "SELECT id, application_deadline FROM jobs WHERE id = $1 AND posted_by = $2",
        [req.params.id, req.user.id]
      );
      if (jobRows.length === 0)
        return res.status(404).json({ error: "Job not found" });
      const deadline = jobRows[0].application_deadline;
      if (deadline && new Date(deadline) < new Date())
        return res.status(400).json({ error: "Job deadline has passed" });

      const { rows: talentRows } = await pool.query(
        "SELECT id FROM users WHERE email = $1 AND role = $2",
        [talent_email, "talent"]
      );
      if (talentRows.length === 0)
        return res
          .status(404)
          .json({ error: "Talent not found with that email" });

      const talentId = talentRows[0].id;
      const { rows } = await pool.query(
        `INSERT INTO invitations (job_id, talent_id, employer_id, message)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.params.id, talentId, req.user.id, message || ""]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === "23505")
        return res.status(400).json({ error: "Already invited" });
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
