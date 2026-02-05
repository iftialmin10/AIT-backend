require("dotenv").config();

module.exports = {
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:password@localhost:5432/talentx",
};
