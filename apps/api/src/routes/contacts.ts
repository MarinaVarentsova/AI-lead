import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, aiContacts, aiConversations } from "@workspace/db";

const router: IRouter = Router();
const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const CHANNEL_FIELDS = { call: "phone", whatsapp: "phone", max: "phone", telegram: "telegram", email: "email" } as const;

function databaseFailure(error: unknown): { errorCode: string; constraint?: string } {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const value = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (typeof value.code === "string" && /^[0-9A-Z]{5}$/.test(value.code)) {
      return { errorCode: value.code, ...(typeof value.constraint_name === "string" &&
        /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(value.constraint_name) ? { constraint: value.constraint_name } : {}) };
    }
    current = value.cause;
  }
  return { errorCode: "UNKNOWN" };
}

router.post("/contacts", async (req, res): Promise<void> => {
  const requestId = randomUUID();
  let stage = "validation";
  let errorCode: string | null = null;
  const record = () => req.log.info({ requestId, stage, errorCode, httpStatus: res.statusCode }, "CONTACT_STAGE");
  const reject = (status: number, code: string, message: string) => {
    errorCode = code;
    res.status(status).json({ error: message, code, requestId });
    record();
  };
  record();
  try {
    const body: unknown = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      reject(400, "CONTACT_REQUEST_INVALID", "Invalid contact request."); return;
    }
    const input = body as Record<string, unknown>;
    const { conversationId, contactChannel } = input;
    if (typeof conversationId !== "string" || !UUID_RE.test(conversationId) ||
      typeof contactChannel !== "string" || !Object.hasOwn(CHANNEL_FIELDS, contactChannel)) {
      reject(400, "CONTACT_REQUEST_INVALID", "Invalid conversationId or contactChannel."); return;
    }
    const field = CHANNEL_FIELDS[contactChannel as keyof typeof CHANNEL_FIELDS];
    if (typeof input[field] !== "string" || !input[field].trim() || input[field].length > 320) {
      reject(400, "CONTACT_VALUE_REQUIRED", "A contact value is required for the selected channel."); return;
    }
    const text = (key: string) => typeof input[key] === "string" ? input[key].trim() || null : null;
    stage = "conversation_lookup";
    record();
    const [conversation] = await db.select({ id: aiConversations.id }).from(aiConversations)
      .where(eq(aiConversations.id, conversationId)).limit(1);
    if (!conversation) {
      reject(404, "CONVERSATION_NOT_FOUND", "Conversation not found."); return;
    }
    stage = "insert";
    record();
    const [contact] = await db.insert(aiContacts).values({
      conversationId, contactChannel,
      phone: text("phone"), telegram: text("telegram"), email: text("email"),
      name: text("name"), preferredTime: text("preferredTime"), comment: text("comment"),
    }).returning({ contactId: aiContacts.id, conversationId: aiContacts.conversationId });
    if (!contact) throw new Error("Contact insert returned no row");
    stage = "response";
    res.status(201).json(contact);
    record();
  } catch (error) {
    const failure = databaseFailure(error);
    errorCode = failure.errorCode;
    const status = errorCode === "23503" ? 404 : 500;
    // No SQL, bound parameters or raw error messages: those may contain contacts.
    req.log.error({ requestId, stage, ...failure, httpStatus: status }, "CONTACT_REQUEST_FAILED");
    res.status(status).json({ error: status === 404 ? "Conversation not found." : "Unable to save contact.",
      code: status === 404 ? "CONVERSATION_NOT_FOUND" : "CONTACT_SAVE_FAILED", requestId });
  }
});

export default router;
