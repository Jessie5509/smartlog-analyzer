import { z } from "zod";

export const LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"] as const;
const levelSchema = z.enum(LEVELS);
const isoDate = z.iso.datetime({ offset: true });

export const createLogSchema = z.object({
  timestamp: isoDate,
  service: z.string().trim().min(1).max(100),
  level: levelSchema,
  message: z.string().min(1).max(10000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const listLogsQuerySchema = z
  .object({
    service: z.string().min(1).optional(),
    level: levelSchema.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((q) => !q.from || !q.to || new Date(q.from) <= new Date(q.to), {
    message: "from must be earlier than or equal to to",
    path: ["from"],
  });

export type CreateLogInput = z.infer<typeof createLogSchema>;
export type ListLogsQuery = z.infer<typeof listLogsQuerySchema>;