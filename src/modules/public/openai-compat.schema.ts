import { z } from "zod";

const modelSlug = z
  .string()
  .min(1)
  .transform((s) => s.toLowerCase().trim());

export const openAiMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(20_000).trim(),
});

export const openAiCompatRequestSchema = z
  .object({
    model: modelSlug,
    messages: z.array(openAiMessageSchema).min(1).max(1000),
    stream: z.boolean().optional().default(true),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().positive().max(100_000).optional(),

    // Feature 3 — Budget-aware routing (required when model === "auto")
    budget_usdc: z
      .string()
      .regex(
        /^\d+(\.\d{1,6})?$/,
        "budget_usdc must be a numeric string e.g. '0.005'",
      )
      .optional(),
    quality: z.enum(["best", "fast", "cheap"]).optional().default("best"),

    // Cost estimation mode
    dry_run: z.boolean().optional().default(false),

    // Benchmark mode
    benchmark: z.boolean().optional().default(false),
    benchmark_models: z.array(modelSlug).min(2).max(5).optional(),

    // Consensus mode
    consensus: z.boolean().optional().default(false),
    consensus_models: z.array(modelSlug).min(2).max(3).optional(),
    consensus_strategy: z
      .enum(["majority", "judge"])
      .optional()
      .default("majority"),
  })
  .superRefine((data, ctx) => {
    if (data.model === "auto" && !data.budget_usdc) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "budget_usdc is required when model is 'auto'",
        path: ["budget_usdc"],
      });
    }

    if (
      data.benchmark &&
      (!data.benchmark_models || data.benchmark_models.length < 2)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "benchmark_models (min 2) required when benchmark is true",
        path: ["benchmark_models"],
      });
    }

    if (
      data.consensus &&
      (!data.consensus_models || data.consensus_models.length < 2)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "consensus_models (min 2) required when consensus is true",
        path: ["consensus_models"],
      });
    }

    // Mutually exclusive modes
    const modes = [data.dry_run, data.benchmark, data.consensus].filter(
      Boolean,
    );
    if (modes.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dry_run, benchmark, and consensus are mutually exclusive",
        path: ["dry_run"],
      });
    }
  });

export type OpenAiCompatRequest = z.infer<typeof openAiCompatRequestSchema>;
