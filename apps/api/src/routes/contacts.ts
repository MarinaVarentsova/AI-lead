import { Router, type IRouter } from "express";
import { db, aiContacts } from "@workspace/db";

const router: IRouter = Router();
const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const CHANNEL_FIELDS = { call: "phone", whatsapp: "phone", max: "phone", telegram: "telegram", email: "email" } as const;

function databaseCode(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const value = current as { code?: unknown; cause?: unknown };
    if (typeof value.code === "string" && /^[0-9A-Z]{5}$/.test(value.code)) return value.code;
    current = value.cause;
  }
  return undefined;
}

router.post("/contacts", async (req, res): Promise<void> => {
  const body: unknown = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "Invalid contact request." }); return;
  }
  const input = body as Record<string, unknown>;
  const { conversationId, contactChannel } = input;
  if (typeof conversationId !== "string" || !UUID_RE.test(conversationId) ||
    typeof contactChannel !== "string" || !Object.hasOwn(CHANNEL_FIELDS, contactChannel)) {
    res.status(400).json({ error: "Invalid conversationId or contactChannel." }); return;
  }
  const field = CHANNEL_FIELDS[contactChannel as keyof typeof CHANNEL_FIELDS];
  if (typeof input[field] !== "string" || !input[field].trim() || input[field].length > 320) {
    res.status(400).json({ error: "A contact value is required for the selected channel." }); return;
  }
  const text = (key: string) => typeof input[key] === "string" ? input[key].trim() || null : null;
  try {
    const [contact] = await db.insert(aiContacts).values({
      conversationId, contactChannel,
      phone: text("phone"), telegram: text("telegram"), email: text("email"),
      name: text("name"), preferredTime: text("preferredTime"), comment: text("comment"),
    }).returning({ contactId: aiContacts.id, conversationId: aiContacts.conversationId });
    if (!contact) throw new Error("Contact insert returned no row");
    req.log.info({ contactId: contact.contactId }, "CONTACT_CREATED");
    res.status(201).json(contact);
  } catch (error) {
    const code = databaseCode(error);
    // No SQL, bound parameters or raw error messages: those may contain contacts.
    req.log.error({ code: code ?? "UNKNOWN" }, "CONTACT_INSERT_FAILED");
    if (code === "23503") {
      res.status(404).json({ error: "Conversation not found." }); return;
    }
    res.status(500).json({ error: "Unable to save contact." });
  }
});

export default router;
