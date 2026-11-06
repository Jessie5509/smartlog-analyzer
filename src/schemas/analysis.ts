import { z } from "zod";

export const analyzeBodySchema = z.object({
  logIds: z
    .array(z.string().regex(/^\d{1,18}$/, "must be a numeric id"))
    .min(1),
});

export const analysisIdSchema = z.guid();
