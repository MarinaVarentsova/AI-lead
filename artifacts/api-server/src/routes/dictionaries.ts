import { Router, type IRouter } from "express";
import { asc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  aiDictExperienceArea,
  aiDictExperienceYears,
  aiDictEducation,
  aiDictGoals,
} from "@workspace/db";
import { GetDictionaryQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

const DICT_MAP = {
  experience_area: aiDictExperienceArea,
  experience_years: aiDictExperienceYears,
  education: aiDictEducation,
  goals: aiDictGoals,
} as const;

type DictType = keyof typeof DICT_MAP;

router.get("/dictionaries", async (req, res): Promise<void> => {
  const parsed = GetDictionaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error:
        "Invalid dictionary type. Must be one of: experience_area, experience_years, education, goals",
    });
    return;
  }

  const table = DICT_MAP[parsed.data.type as DictType];
  const rows = await db
    .select()
    .from(table)
    .orderBy(asc(table.sortOrder));

  res.json(
    rows.map((r) => ({ id: r.id, label: r.label, sortOrder: r.sortOrder }))
  );
});

export default router;
