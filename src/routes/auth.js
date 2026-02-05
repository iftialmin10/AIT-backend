const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { authenticate, authorize, JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { email, password, name, role, skills } = req.body;
    if (!email || !password || !name || !role) {
      return res
        .status(400)
        .json({ error: "Email, password, name, and role are required" });
    }
    const validRoles = ["employer", "talent"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Role must be employer or talent" });
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash, name, role, skills) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role",
      [email, hash, name, role, role === "talent" ? skills || null : null]
    );
    const user = rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    });
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ error: "Email already registered" });
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });
    const { rows } = await pool.query(
      "SELECT id, email, name, role, password_hash FROM users WHERE email = $1",
      [email]
    );
    if (rows.length === 0)
      return res.status(401).json({ error: "Invalid credentials" });
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/me", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, email, name, role FROM users WHERE id = $1",
      [req.user.id]
    );
    if (rows.length === 0)
      return res.status(401).json({ error: "User not found" });
    res.json({ user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
