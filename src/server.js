require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const jobsRoutes = require("./routes/jobs");
const invitationsRoutes = require("./routes/invitations");
const talentsRoutes = require("./routes/talents");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: true }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/invitations", invitationsRoutes);
app.use("/api/talents", talentsRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () =>
  console.log(`TalentX API running on http://localhost:${PORT}`)
);
