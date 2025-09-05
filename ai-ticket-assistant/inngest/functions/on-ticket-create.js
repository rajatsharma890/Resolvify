import { inngest } from "../client.js";
import Ticket from "../../models/ticket.js";
import User from "../../models/user.js";
import { NonRetriableError } from "inngest";
import { sendMail } from "../../utils/mailer.js";
import analyzeTicket from "../../utils/ai.js";

export const onTicketCreated = inngest.createFunction(
  { id: "on-ticket-created", retries: 2 },
  { event: "ticket/created" },
  async ({ event, step }) => {
    try {
      const { ticketId } = event.data;

      // Step 1: Fetch ticket from DB
      const ticket = await step.run("fetch-ticket", async () => {
        const ticketObject = await Ticket.findById(ticketId);
        if (!ticketObject) {
          throw new NonRetriableError("Ticket not found");
        }
        return ticketObject;
      });

      // Step 2: Update ticket status to TODO
      await step.run("update-ticket-status", async () => {
        await Ticket.findByIdAndUpdate(ticket._id, { status: "TODO" });
      });

      // Step 3: Analyze ticket with AI
      const aiResponse = await analyzeTicket(ticket);
      console.log("AI Response:", aiResponse); // Debug log

      // Step 4: AI processing (priority, helpful notes, skills, etc.)
      const relatedskills = await step.run("ai-processing", async () => {
        const { priority, helpfulNotes, relatedSkills } = aiResponse || {};
        const cleanSkills = Array.isArray(relatedSkills) ? relatedSkills : [];

        await Ticket.findByIdAndUpdate(ticket._id, {
          priority: ["low", "medium", "high"].includes(priority)
            ? priority
            : "medium",
          helpfulNotes: helpfulNotes || "",
          status: "IN_PROGRESS",
          relatedSkills: cleanSkills,
        });

        return cleanSkills;
      });

      // Step 5: Assign moderator based on skills
      const moderator = await step.run("assign-moderator", async () => {
        const skillsRegex = Array.isArray(relatedskills)
          ? relatedskills.join("|")
          : "";

        let user = null;

        if (skillsRegex) {
          user = await User.findOne({
            role: "moderator",
            skills: {
              $elemMatch: {
                $regex: skillsRegex,
                $options: "i",
              },
            },
          });
        }

        if (!user) {
          user = await User.findOne({ role: "admin" });
        }

        await Ticket.findByIdAndUpdate(ticket._id, {
          assignedTo: user?._id || null,
        });

        return user;
      });

      // Step 6: Send email notification to moderator
      await step.run("send-email-notification", async () => {
        if (moderator) {
          const finalTicket = await Ticket.findById(ticket._id);
          await sendMail(
            moderator.email,
            "Ticket Assigned",
            `A new ticket is assigned to you: ${finalTicket.title}`
          );
        }
      });

      return { success: true };
    } catch (err) {
      console.error("❌ Error running the step:", err.message);
      return { success: false };
    }
  }
);
