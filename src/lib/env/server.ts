import { z } from "zod";

const serverEnvSchema = z.object({
  DEEPSEEK_API_KEY: z.string().trim().min(1),
});

export function readServerEnv(env: Record<string, string | undefined>) {
  const result = serverEnvSchema.safeParse(env);

  if (!result.success) {
    throw new Error("本地服务未配置 DeepSeek Key。");
  }

  return { deepseekApiKey: result.data.DEEPSEEK_API_KEY };
}
