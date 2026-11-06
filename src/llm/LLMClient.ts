import { z } from "zod";

export interface LogForAnalysis {
  timestamp: string;
  service: string;
  level: string;
  message: string;
}

export const analysisResultSchema = z.object({
  summary: z.string().min(1),
  categories: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string(),
    }),
  ),
  suggestions: z.array(z.string()),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export interface LLMClient {
  readonly name: string;
  analyze(logs: LogForAnalysis[]): Promise<unknown>;
}
