const express = require("express");
const pool = require("../db/pool");
const { authenticate, authorize } = require("../middleware/auth");
const { computeMatchScore } = require("../services/ai");

const router = express.Router();

// Employer: Top Matched Talents for a job (AI match score 0-100)
router.get(
  "/matched",
  authenticate,
  authorize("employer"),
  async (req, res) => {
    try {
      const { job_id } = req.query;
      if (!job_id) return res.status(400).json({ error: "job_id required" });

      const { rows: jobRows } = await pool.query(
        "SELECT tech_stack, posted_by FROM jobs WHERE id = $1",
        [job_id]
      );
      if (jobRows.length === 0)
        return res.status(404).json({ error: "Job not found" });
      if (jobRows[0].posted_by !== req.user.id)
        return res.status(403).json({ error: "Not your job" });

      const jobTechStack = jobRows[0].tech_stack;
      const { rows: talents } = await pool.query(
        "SELECT id, name, email, skills FROM users WHERE role = $1",
        ["talent"]
      );

      const matched = talents.map((t) => ({
        id: t.id,
        name: t.name,
        email: t.email,
        match_score: Math.min(
          100,
          Math.max(0, computeMatchScore(jobTechStack, t.skills))
        ),
      }));

      matched.sort((a, b) => b.match_score - a.match_score);
      res.json({ talents: matched.slice(0, 20) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
