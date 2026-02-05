const express = require("express");
const pool = require("../db/pool");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// Talent: list own invitations
router.get("/", authenticate, authorize("talent"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, j.title as job_title, j.company, j.application_deadline, u.name as employer_name
         FROM invitations i
         JOIN jobs j ON i.job_id = j.id
         JOIN users u ON i.employer_id = u.id
         WHERE i.talent_id = $1
         ORDER BY i.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Talent: accept invitation (creates application with source=invitation)
router.post(
  "/:id/accept",
  authenticate,
  authorize("talent"),
  async (req, res) => {
    try {
      const { rows: invRows } = await pool.query(
        "SELECT * FROM invitations WHERE id = $1 AND talent_id = $2 AND status = $3",
        [req.params.id, req.user.id, "pending"]
      );
      if (invRows.length === 0)
        return res
          .status(404)
          .json({ error: "Invitation not found or already responded" });

      const inv = invRows[0];
      const { rows: jobRows } = await pool.query(
        "SELECT application_deadline FROM jobs WHERE id = $1",
        [inv.job_id]
      );
      if (jobRows.length > 0) {
        const deadline = jobRows[0].application_deadline;
        if (deadline && new Date(deadline) < new Date())
          return res
            .status(400)
            .json({ error: "Application deadline has passed" });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("UPDATE invitations SET status = $1 WHERE id = $2", [
          "accepted",
          req.params.id,
        ]);
        const { rows: appRows } = await client.query(
          `INSERT INTO applications (job_id, talent_id, cover_letter, source)
           VALUES ($1, $2, $3, $4) ON CONFLICT (job_id, talent_id) DO NOTHING RETURNING *`,
          [inv.job_id, req.user.id, "Accepted invitation", "invitation"]
        );
        await client.query("COMMIT");
        res.json({
          invitation: inv,
          application: appRows[0] || "already_applied",
        });
      } catch (e) {
        await client.query("ROLLBACK");
        if (e.code === "23505")
          return res.status(400).json({ error: "Already applied to this job" });
        throw e;
      } finally {
        client.release();
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Talent: decline invitation
router.post(
  "/:id/decline",
  authenticate,
  authorize("talent"),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        "UPDATE invitations SET status = $1 WHERE id = $2 AND talent_id = $3 AND status = $4 RETURNING *",
        ["declined", req.params.id, req.user.id, "pending"]
      );
      if (rows.length === 0)
        return res
          .status(404)
          .json({ error: "Invitation not found or already responded" });
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
