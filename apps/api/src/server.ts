import { MaterialService } from "../../../packages/domain/src/materials";
import { QuoteService } from "../../../packages/domain/src/quotes";
import { ModelAssetService } from "../../../packages/domain/src/model-assets";
import { UnderlayAssetService } from "../../../packages/domain/src/underlay-assets";
import { libraryQuerySchema } from "../../../packages/contracts/src/index";
import { LibraryService } from "../../../packages/domain/src/library";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import { fromNodeHeaders } from "better-auth/node";
import type { Pool } from "pg";
import { z } from "zod";
import { createAuth } from "../../../packages/auth/src/index";
import { InvitationService } from "../../../packages/auth/src/invitations";
import {
  ProjectService,
  type Context,
} from "../../../packages/domain/src/projects";
import { DomainError, canWrite } from "../../../packages/domain/src/index";
import {
  id,
  projectInput,
  commandSchema,
} from "../../../packages/contracts/src/index";
import { planSvg } from "../../../packages/documents/src/plan";
export function createServer(config: {
  runtime: Pool;
  identity: Pool;
  baseURL: string;
  secret: string;
}) {
  const app = Fastify({
    logger: false,
    bodyLimit: 2_000_000,
    trustProxy: false,
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: false,
      },
    },
  });
  const auth = createAuth(config.identity, config.baseURL, config.secret);
  const service = new ProjectService(config.runtime);
  const invitations = new InvitationService(
    config.identity,
    config.baseURL,
    config.secret,
  );
  app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  app.register(swagger, {
    openapi: { info: { title: "Interieurstudio API", version: "0.0.1" } },
  });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== config.baseURL
    )
      throw new DomainError(
        "ORIGIN_REJECTED",
        "Deze oorsprong is niet toegestaan.",
        403,
      );
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        code: "VALIDATION_ERROR",
        message: "Controleer de ingevulde waarden.",
        requestId: request.id,
      });
    if (error instanceof DomainError)
      return reply.code(error.status).send({
        code: error.code,
        message: error.message,
        requestId: request.id,
      });
    const status =
      error instanceof Error &&
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      error.statusCode < 500
        ? error.statusCode
        : 500;
    return reply.code(status).send({
      code: status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
      message:
        status === 500
          ? "Er ging iets mis. Probeer opnieuw."
          : "De aanvraag kon niet worden verwerkt.",
      requestId: request.id,
    });
  });
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    handler: async (req, reply) => {
      req.headers["x-studio-client-ip"] = req.ip;
      const response = await auth.handler(
        new Request(new URL(req.url, config.baseURL), {
          method: req.method,
          headers: fromNodeHeaders(req.headers),
          ...(req.body ? { body: JSON.stringify(req.body) } : {}),
        }),
      );
      reply.code(response.status);
      response.headers.forEach((v, k) => {
        if (k !== "set-cookie") reply.header(k, v);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header("set-cookie", cookies);
      return reply.send(await response.text());
    },
  });
  async function session(headers: Parameters<typeof fromNodeHeaders>[0]) {
    const s = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!s) throw new DomainError("UNAUTHENTICATED", "Log opnieuw in.", 401);
    return s;
  }
  async function context(
    headers: Parameters<typeof fromNodeHeaders>[0],
  ): Promise<Context> {
    const s = await session(headers);
    const org = id.parse(headers["x-organization-id"]);
    const r = await config.identity.query(
      "SELECT role FROM identity.membership WHERE user_id=$1 AND organization_id=$2",
      [s.user.id, org],
    );
    if (!r.rowCount)
      throw new DomainError("NOT_FOUND", "Werkruimte niet gevonden.", 404);
    if (config.baseURL.startsWith("https:") && !s.user.twoFactorEnabled)
      throw new DomainError(
        "MFA_REQUIRED",
        "Stel eerst tweestapsverificatie in via Beveiliging.",
        403,
      );
    return { userId: s.user.id, organizationId: org, role: r.rows[0].role };
  }
  app.get("/api/v1/health", async () => ({ status: "ok", version: "0.0.1" }));
  app.get("/api/v1/me", async (req) => {
    const s = await session(req.headers);
    const r = await config.identity.query(
      "SELECT o.id,o.name,m.role FROM identity.organization o JOIN identity.membership m ON m.organization_id=o.id WHERE m.user_id=$1",
      [s.user.id],
    );
    return {
      user: {
        id: s.user.id,
        name: s.user.name,
        email: s.user.email,
        twoFactorEnabled: !!s.user.twoFactorEnabled,
      },
      organizations: r.rows,
    };
  });
  app.get("/api/v1/invitations", async (req) => {
    const ctx = await context(req.headers);
    return { items: await invitations.list(ctx.userId, ctx.organizationId) };
  });
  app.post("/api/v1/invitations", async (req) => {
    const ctx = await context(req.headers);
    return invitations.create(ctx.userId, ctx.organizationId, req.body);
  });
  app.post("/api/v1/invitations/:invitationId/revoke", async (req) => {
    const ctx = await context(req.headers);
    return invitations.revoke(
      ctx.userId,
      ctx.organizationId,
      z.object({ invitationId: id }).parse(req.params).invitationId,
    );
  });
  app.post(
    "/api/v1/invitations/accept",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const current = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      return invitations.accept(req.body, current?.user.id);
    },
  );
  const models = new ModelAssetService(config.runtime);
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
  app.post("/api/v1/model-assets/:id", {
    bodyLimit: 10485760,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    onRequest: async req => {
      const ctx = await context(req.headers);
      if (!canWrite(ctx.role)) throw new DomainError("FORBIDDEN", "Je hebt alleen leestoegang.", 403);
      z.object({ id }).parse(req.params);
    },
  }, async req => {
    const assetId = z.object({ id }).parse(req.params).id;
    if (!Buffer.isBuffer(req.body)) throw new DomainError("INVALID_MODEL", "Upload het GLB-bestand als binair bestand.", 415);
    return models.upload(await context(req.headers), assetId, req.body);
  });
  app.get("/api/v1/model-assets/:id", async (req, reply) => {
    const assetId = z.object({ id }).parse(req.params).id;
    const model = await models.get(await context(req.headers), assetId);
    return reply.type("application/octet-stream").header("Content-Disposition", 'attachment; filename="geometry.bin"').send(model.positions);
  });
  const underlays = new UnderlayAssetService(config.runtime);
  app.post("/api/v1/underlay-assets/:id", {
    bodyLimit: 16777216,
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    onRequest: async req => {
      const ctx = await context(req.headers);
      if (!canWrite(ctx.role)) throw new DomainError("FORBIDDEN", "Je hebt alleen leestoegang.", 403);
      z.object({ id }).parse(req.params);
    },
  }, async req => {
    const assetId = z.object({ id }).parse(req.params).id;
    if (!Buffer.isBuffer(req.body)) throw new DomainError("INVALID_IMAGE", "Upload de afbeelding als binair bestand.", 415);
    return underlays.upload(await context(req.headers), assetId, req.body);
  });
  app.get("/api/v1/underlay-assets/:id", async (req, reply) => {
    const assetId = z.object({ id }).parse(req.params).id;
    const image = await underlays.get(await context(req.headers), assetId);
    // Vast content-type uit de gelezen bestandskop, nooit uit de invoer van de
    // client; met nosniff kan de browser er niets anders van maken.
    return reply.type(image.mime).header("Content-Security-Policy", "default-src 'none'").send(image.bytes);
  });
  const materials = new MaterialService(config.runtime);
  const quotes = new QuoteService(config.runtime);
  const quoteParams = (params:unknown) => z.object({id, quoteId:id}).parse(params);
  app.get("/api/v1/projects/:id/quotes", async req => quotes.list(await context(req.headers), z.object({id}).parse(req.params).id));
  app.post("/api/v1/projects/:id/quotes", async req => quotes.save(await context(req.headers), z.object({id}).parse(req.params).id, req.body));
  app.get("/api/v1/projects/:id/quotes/:quoteId/differences", async req => {
    const p=quoteParams(req.params); return quotes.differences(await context(req.headers),p.id,p.quoteId);
  });
  app.post("/api/v1/projects/:id/quotes/:quoteId/finalize", async req => {
    const p=quoteParams(req.params); return quotes.finalize(await context(req.headers),p.id,p.quoteId,req.body);
  });
  app.get("/api/v1/projects/:id/materials", async req => materials.list(await context(req.headers), z.object({ id }).parse(req.params).id));
  app.get("/api/v1/projects/:id/quantities", async req => {
    const { variantId } = z.object({ variantId: id }).parse(req.query);
    return materials.quantities(await context(req.headers), z.object({ id }).parse(req.params).id, variantId);
  });
  app.post("/api/v1/projects/:id/materials", async req => materials.publish(await context(req.headers), z.object({ id }).parse(req.params).id, req.body));
  const library = new LibraryService(config.runtime);
  app.get("/api/v1/library", async (req) => {
    return library.list(await context(req.headers), libraryQuerySchema.parse(req.query));
  });
  app.post("/api/v1/library", async (req) =>
    library.publish(await context(req.headers), req.body),
  );
  app.get("/api/v1/projects", async (req) => {
    const { offset } = z
      .object({ offset: z.coerce.number().int().min(0).max(100000).default(0) })
      .parse(req.query);
    return { items: await service.list(await context(req.headers), offset) };
  });
  app.post(
    "/api/v1/projects",
    { schema: { body: z.toJSONSchema(projectInput, { target: "draft-7" }) } },
    async (req, reply) =>
      reply
        .code(201)
        .send(await service.create(await context(req.headers), req.body)),
  );
  const variant = (params: unknown) =>
    z.object({ variantId: id }).parse(params).variantId;
  app.get("/api/v1/variants/:variantId/alternatives", async (req) =>
    service.variants(await context(req.headers), variant(req.params)),
  );
  app.post("/api/v1/variants/:variantId/copies", async (req) =>
    service.copyVariant(
      await context(req.headers),
      variant(req.params),
      req.body,
    ),
  );
  app.get("/api/v1/variants/:variantId/document", async (req) =>
    service.document(await context(req.headers), variant(req.params)),
  );
  app.post("/api/v1/variants/:variantId/lease", async (req) =>
    service.lease(
      await context(req.headers),
      variant(req.params),
      z.object({ leaseId: id }).strict().parse(req.body).leaseId,
    ),
  );
  app.post(
    "/api/v1/variants/:variantId/commands",
    { schema: { body: z.toJSONSchema(commandSchema, { target: "draft-7" }) } },
    async (req) =>
      service.command(
        await context(req.headers),
        variant(req.params),
        req.body,
      ),
  );
  app.get("/api/v1/variants/:variantId/revisions", async (req) =>
    service.revisions(await context(req.headers), variant(req.params)),
  );
  app.post("/api/v1/variants/:variantId/revisions", async (req) =>
    service.revision(
      await context(req.headers),
      variant(req.params),
      z
        .object({ name: z.string().trim().min(1).max(120) })
        .strict()
        .parse(req.body).name,
    ),
  );
  app.get("/api/v1/variants/:variantId/plan.svg", async (req, reply) => {
    const scene = await service.document(
      await context(req.headers),
      variant(req.params),
    );
    const scale = z
      .object({ scale: z.enum(["20", "50", "100"]).default("50") })
      .parse(req.query).scale;
    try {
      return reply
        .type("image/svg+xml")
        .header("Content-Disposition", 'attachment; filename="ontwerpblad.svg"')
        .send(planSvg(scene, Number(scale) as 20 | 50 | 100));
    } catch (e) {
      throw new DomainError(
        "PLAN_DOES_NOT_FIT",
        e instanceof Error ? e.message : "Plan past niet.",
      );
    }
  });
  app.get("/api/v1/openapi.json", async (req) => {
    await session(req.headers);
    return app.swagger();
  });
  return { app, auth, service };
}
