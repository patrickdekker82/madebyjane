import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  AUTH_DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  PUBLIC_BASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4311),
  API_HOST: z.string().min(1).default("127.0.0.1"),
});

export type RuntimeConfig = z.infer<typeof schema>;

/** Validates deployment settings without echoing credentials or secret values. */
export function loadRuntimeConfig(environment: NodeJS.ProcessEnv): RuntimeConfig {
  const parsed = schema.safeParse(environment);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path[0]))]
      .filter((field): field is string => typeof field === "string")
      .join(", ");
    throw new Error(`Ongeldige of ontbrekende runtimeconfiguratie: ${fields}.`);
  }
  const config = parsed.data;
  const publicUrl = new URL(config.PUBLIC_BASE_URL);
  if (publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash)
    throw new Error("PUBLIC_BASE_URL moet uitsluitend een origin zijn.");
  if (config.NODE_ENV === "production" && publicUrl.protocol !== "https:")
    throw new Error("PUBLIC_BASE_URL moet in productie HTTPS gebruiken.");
  return config;
}
