import { createAgent, gemini } from "@inngest/agent-kit";
const analyzeTicket = async (ticket) => {
  const supportAgent = createAgent({
    model: gemini({
      model: "gemini-2.0-flash-lite",
      apiKey: process.env.GEMINI_API_KEY,
    }),
    name: "AI Ticket Triage Assistant",
    system: `You are an expert AI assistant that processes technical support tickets.

Respond ONLY with raw JSON like:
{
  "summary": "...",
  "priority": "low" | "medium" | "high",
  "helpfulNotes": "...",
  "relatedSkills": [...]
}

DO NOT use markdown, comments, or wrap output in \`\`\`.`,
  });

  const response = await supportAgent.run(`
Analyze the support ticket:

- Title: ${ticket.title}
- Description: ${ticket.description}

Return ONLY a valid JSON object:
{
  "summary": "...",
  "priority": "low" | "medium" | "high",
  "helpfulNotes": "...",
  "relatedSkills": [...]
}
`);

  const rawOutput = response?.output?.[0]?.content;

  if (!rawOutput || typeof rawOutput !== "string") {
    console.error("❌ AI response missing or invalid:", response);
    return null;
  }

  console.log("✅ Raw AI Response:", rawOutput);

  try {
    // ✅ Extract the first { ... } block using regex
    const jsonMatch = rawOutput.match(/{[\s\S]*}/);
    if (!jsonMatch) throw new Error("No valid JSON object found");

    const jsonString = jsonMatch[0];
    return JSON.parse(jsonString);
  } catch (err) {
    console.error("❌ Failed to parse cleaned JSON:", err.message);
    return null;
  }
};
export default analyzeTicket;
