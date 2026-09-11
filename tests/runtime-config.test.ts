import { describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "../apps/api/src/config";

const valid = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://studio_runtime:password@postgres/interieurstudio",
  AUTH_DATABASE_URL: "postgresql://studio_auth:password@postgres/interieurstudio",
  AUTH_SECRET: "a".repeat(32),
  PUBLIC_BASE_URL: "https://studio.example.com",
};

describe("runtimeconfiguratie", () => {
  it("accepteert een complete productieconfiguratie", () => {
    expect(loadRuntimeConfig(valid)).toMatchObject({
      API_HOST: "127.0.0.1",
      API_PORT: 4311,
      PUBLIC_BASE_URL: "https://studio.example.com",
    });
  });

  it("weigert HTTP en lekt geen secret in de fout", () => {
    expect(() =>
      loadRuntimeConfig({ ...valid, PUBLIC_BASE_URL: "http://studio.example.com" }),
    ).toThrow("HTTPS");
    try {
      loadRuntimeConfig({ ...valid, AUTH_SECRET: "niet-lang-genoeg" });
    } catch (error) {
      expect(String(error)).not.toContain("niet-lang-genoeg");
    }
  });
});
