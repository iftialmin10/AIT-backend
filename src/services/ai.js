const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

async function generateJobDescription(title, techStack) {
  if (!process.env.OPENAI_API_KEY) {
    return generateFallbackJD(title, techStack);
  }
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a professional HR writer. Generate concise job descriptions in 2-3 paragraphs.",
        },
        {
          role: "user",
          content: `Generate a job description for: ${title}. Tech stack: ${
            techStack || "Not specified"
          }.`,
        },
      ],
      max_tokens: 400,
    });
    return (
      completion.choices[0]?.message?.content?.trim() ||
      generateFallbackJD(title, techStack)
    );
  } catch (err) {
    return generateFallbackJD(title, techStack);
  }
}

function generateFallbackJD(title, techStack) {
  const stack = techStack
    ? techStack
        .split(",")
        .map((s) => s.trim())
        .join(", ")
    : "various technologies";
  return `${title}\n\nWe are looking for a talented professional to join our team. The ideal candidate will have experience with ${stack} and a strong track record of delivering high-quality work.\n\nResponsibilities include collaborating with the team, contributing to project goals, and maintaining best practices. You will work in a dynamic environment and have opportunities for growth.`;
}

function computeMatchScore(jobTechStack, talentSkills) {
  if (!jobTechStack || !talentSkills)
    return Math.floor(Math.random() * 31) + 70;
  const jobSkills = new Set(
    jobTechStack
      .toLowerCase()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const talentSet = new Set(
    talentSkills
      .toLowerCase()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  let matches = 0;
  for (const s of talentSet) {
    if (jobSkills.has(s)) matches++;
  }
  const overlap = jobSkills.size > 0 ? matches / jobSkills.size : 0;
  const base = Math.min(100, 50 + overlap * 50);
  return Math.round(base + (Math.random() * 10 - 5));
}

module.exports = { generateJobDescription, computeMatchScore };
