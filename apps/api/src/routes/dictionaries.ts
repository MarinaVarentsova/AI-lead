import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  aiDictExperienceArea,
  aiDictExperienceYears,
  aiDictEducation,
  aiDictGoals,
} from "@workspace/db";

const router: IRouter = Router();

const DICT_MAP = {
  experience_area: aiDictExperienceArea,
  experience_years: aiDictExperienceYears,
  education: aiDictEducation,
  goals: aiDictGoals,
} as const;

type DictType = keyof typeof DICT_MAP;
const DICT_TYPES = Object.keys(DICT_MAP) as DictType[];

router.get("/dictionaries", async (req, res): Promise<void> => {
  const type = req.query.type as string | undefined;
  if (!type || !DICT_TYPES.includes(type as DictType)) {
    res.status(400).json({
      error: "Invalid dictionary type. Must be one of: experience_area, experience_years, education, goals",
    });
    return;
  }

  const table = DICT_MAP[type as DictType];

  try {
    const rows = await db
      .select()
      .from(table)
      .where(eq(table.isActive, true));

    res.json(rows.map((r) => ({ code: r.code, name: r.name })));
  } catch (err: unknown) {
    const e = err as Error;
    req.log.error({ msg: e.message }, "Dictionary fetch failed");
    res.status(500).json({ error: e.message });
  }
});

export default router;
