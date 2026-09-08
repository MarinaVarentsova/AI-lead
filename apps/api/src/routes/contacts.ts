/**
 * POST /api/contacts
 *
 * Creates a contact record in ai_contacts linked to a conversation.
 * ai_contacts does NOT have leadId — the lead references the contact via contact_id.
 */
import { Router, type IRouter } from "express";
import { db, aiContacts } from "@workspace/db";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post("/contacts", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const { conversationId } = body;

  if (typeof conversationId !== "string" || !UUID_RE.test(conversationId)) {
    res.status(400).json({ error: "conversationId must be a valid UUID" });
    return;
  }

  try {
    const [contact] = await db
      .insert(aiContacts)
      .values({
        conversationId,
        name: typeof body.name === "string" ? body.name : null,
        phone: typeof body.phone === "string" ? body.phone : null,
        email: typeof body.email === "string" ? body.email : null,
        telegram: typeof body.telegram === "string" ? body.telegram : null,
        contactChannel: typeof body.contactChannel === "string" ? body.contactChannel : null,
        preferredTime: typeof body.preferredTime === "string" ? body.preferredTime : null,
        comment: typeof body.comment === "string" ? body.comment : null,
      })
      .returning();

    req.log.info({ contactId: contact.id, conversationId }, "Contact created");
    res.status(201).json({
      contactId: contact.id,
      conversationId: contact.conversationId,
    });
  } catch (err: unknown) {
    const e = err as Error & { cause?: Error & { code?: string; message?: string } };
    req.log.error({ msg: e.message }, "Contact insert failed");
    res.status(500).json({ error: e.message });
  }
});

export default router;
