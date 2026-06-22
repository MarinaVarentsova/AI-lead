/**
 * POST /api/contacts
 *
 * Creates a contact record in ai_contacts and attaches it to the lead.
 */
import { Router, type IRouter } from "express";
import { db, aiContacts, aiLeads } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.post("/contacts", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;

  const conversationId = body.conversationId;
  if (typeof conversationId !== "number" || !Number.isInteger(conversationId) || conversationId <= 0) {
    res.status(400).json({ error: "conversationId must be a positive integer" });
    return;
  }

  const leadId = typeof body.leadId === "number" ? body.leadId : undefined;

  const [contact] = await db
    .insert(aiContacts)
    .values({
      conversationId,
      leadId: leadId ?? null,
      name: typeof body.name === "string" ? body.name : null,
      phone: typeof body.phone === "string" ? body.phone : null,
      email: typeof body.email === "string" ? body.email : null,
      telegram: typeof body.telegram === "string" ? body.telegram : null,
      contactChannel: typeof body.contactChannel === "string" ? body.contactChannel : null,
      preferredTime: typeof body.preferredTime === "string" ? body.preferredTime : null,
      comment: typeof body.comment === "string" ? body.comment : null,
    })
    .returning();

  // Attach contact to lead if leadId provided
  if (leadId) {
    await db
      .update(aiLeads)
      .set({ contactId: contact.id, updatedAt: new Date() })
      .where(eq(aiLeads.id, leadId));
  }

  res.status(201).json({
    contactId: contact.id,
    conversationId: contact.conversationId,
  });
});

export default router;
