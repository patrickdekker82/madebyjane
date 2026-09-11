import { MaterialService } from "../../../packages/domain/src/materials";
import { QuoteService } from "../../../packages/domain/src/quotes";
import { ProjectAccessService } from "../../../packages/domain/src/project-access";
import { QuoteResources } from "../../../packages/domain/src/quote-resources";
import { QuoteDelivery } from "../../../packages/domain/src/quote-delivery";
import { ModelAssetService } from "../../../packages/domain/src/model-assets";
import { UnderlayAssetService } from "../../../packages/domain/src/underlay-assets";
import { libraryQuerySchema } from "../../../packages/contracts/src/index";
import { LibraryService } from "../../../packages/domain/src/library";
import Fastify, { type FastifyReply } from "fastify";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import { fromNodeHeaders } from "better-auth/node";
import type { Pool } from "pg";
import { z } from "zod";
import { createAuth } from "../../../packages/auth/src/index";
import { InvitationService } from "../../../packages/auth/src/invitations";
import { RecoveryService } from "../../../packages/auth/src/recovery";
import {
  ProjectService,
  type Context,
} from "../../../packages/domain/src/projects";
import {
  DomainError,
  canWrite,
  requirePermission,
} from "../../../packages/domain/src/index";
import {
  id,
  projectInput,
  commandSchema,
} from "../../../packages/contracts/src/index";
import { planSvg } from "../../../packages/documents/src/plan";
import {
  LocalStorage,
  type StorageProvider,
} from "../../../packages/storage/src/index";
import { resolve } from "node:path";
import { PresentationService } from "../../../packages/domain/src/presentations";
import { presentationHtml } from "../../../packages/documents/src/presentation";
import { ExportJobs } from "../../../packages/domain/src/export-jobs";
import { drainExports } from "../../../packages/domain/src/export-worker";
export function createServer(config: {
  runtime: Pool;
  identity: Pool;
  baseURL: string;
  secret: string;
  /** Waar assetbytes heen gaan. Zonder opgave: een private map naast de app. */
  storage?: StorageProvider;
}) {
  const storage = config.storage ?? new LocalStorage(resolve("work/assets"));
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
  const recovery = new RecoveryService(
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
  const access = new ProjectAccessService(config.runtime);
  /**
   * Contexten voor projectgebonden routes. De rol die de services zien is de
   * rol voor dít project, zodat elke route organisatie én project controleert.
   */
  const projectContext = async (
    headers: Parameters<typeof context>[0],
    project: string,
  ) => access.forProject(await context(headers), project);
  const variantContext = async (
    headers: Parameters<typeof context>[0],
    variantId: string,
  ) => access.forVariant(await context(headers), variantId);
  const presentationContext = async (
    headers: Parameters<typeof context>[0],
    presentationId: string,
  ) => access.forPresentation(await context(headers), presentationId);
  const exportJobContext = async (
    headers: Parameters<typeof context>[0],
    jobId: string,
  ) => access.forExportJob(await context(headers), jobId);
  const presentationShareContext = async (
    headers: Parameters<typeof context>[0],
    shareId: string,
  ) => access.forPresentationShare(await context(headers), shareId);
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
  // Accountherstel. De beheerder geeft de link persoonlijk door; er wordt geen
  // e-mail verstuurd en dat staat ook zo in het scherm.
  app.post(
    "/api/v1/members/:userId/recovery",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const ctx = await context(req.headers);
      const p = z
        .object({ userId: z.string().min(1).max(255) })
        .parse(req.params);
      return recovery.create(ctx.userId, ctx.organizationId, p.userId);
    },
  );
  app.post("/api/v1/members/:userId/recovery/revoke", async (req) => {
    const ctx = await context(req.headers);
    const p = z
      .object({ userId: z.string().min(1).max(255) })
      .parse(req.params);
    return recovery.revoke(ctx.userId, ctx.organizationId, p.userId);
  });
  app.post(
    "/api/v1/recovery/accept",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => recovery.accept(req.body),
  );
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
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body),
  );
  app.post(
    "/api/v1/model-assets/:id",
    {
      bodyLimit: 10485760,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      onRequest: async (req) => {
        const ctx = await context(req.headers);
        if (!canWrite(ctx.role))
          throw new DomainError(
            "FORBIDDEN",
            "Je hebt alleen leestoegang.",
            403,
          );
        z.object({ id }).parse(req.params);
      },
    },
    async (req) => {
      const assetId = z.object({ id }).parse(req.params).id;
      if (!Buffer.isBuffer(req.body))
        throw new DomainError(
          "INVALID_MODEL",
          "Upload het GLB-bestand als binair bestand.",
          415,
        );
      return models.upload(await context(req.headers), assetId, req.body);
    },
  );
  app.get("/api/v1/model-assets/:id", async (req, reply) => {
    const assetId = z.object({ id }).parse(req.params).id;
    const model = await models.get(await context(req.headers), assetId);
    return reply
      .type("application/octet-stream")
      .header("Content-Disposition", 'attachment; filename="geometry.bin"')
      .send(model.positions);
  });
  const underlays = new UnderlayAssetService(config.runtime, storage);
  app.post(
    "/api/v1/underlay-assets/:id",
    {
      bodyLimit: 16777216,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      onRequest: async (req) => {
        const ctx = await context(req.headers);
        if (!canWrite(ctx.role))
          throw new DomainError(
            "FORBIDDEN",
            "Je hebt alleen leestoegang.",
            403,
          );
        z.object({ id }).parse(req.params);
      },
    },
    async (req) => {
      const assetId = z.object({ id }).parse(req.params).id;
      if (!Buffer.isBuffer(req.body))
        throw new DomainError(
          "INVALID_IMAGE",
          "Upload de afbeelding als binair bestand.",
          415,
        );
      return underlays.upload(await context(req.headers), assetId, req.body);
    },
  );
  /*
   * De beeldbank. Onderleggers en moodboardbeelden komen uit dezelfde opslag,
   * dus dit is één lijst met alles wat er in de werkruimte staat.
   */
  app.get("/api/v1/images", async (req) =>
    underlays.list(await context(req.headers)),
  );
  app.get("/api/v1/underlay-assets/:id", async (req, reply) => {
    const assetId = z.object({ id }).parse(req.params).id;
    const image = await underlays.get(await context(req.headers), assetId);
    // Vast content-type uit de gelezen bestandskop, nooit uit de invoer van de
    // client; met nosniff kan de browser er niets anders van maken.
    return reply
      .type(image.mime)
      .header("Content-Security-Policy", "default-src 'none'")
      .send(image.bytes);
  });
  const materials = new MaterialService(config.runtime);
  const quotes = new QuoteService(config.runtime);
  const resources = new QuoteResources(config.runtime),
    delivery = new QuoteDelivery(config.runtime, config.secret, storage);
  const versionParams = (params: unknown) =>
    z
      .object({
        id,
        quoteId: id,
        version: z.coerce.number().int().min(1).max(500),
      })
      .parse(params);
  app.get("/api/v1/projects/:id/quote-resources", async (req) =>
    resources.list(
      await projectContext(req.headers, z.object({ id }).parse(req.params).id),
      z.object({ id }).parse(req.params).id,
    ),
  );
  app.post("/api/v1/projects/:id/quote-prices", async (req) =>
    resources.price(
      await projectContext(req.headers, z.object({ id }).parse(req.params).id),
      z.object({ id }).parse(req.params).id,
      req.body,
    ),
  );
  app.post("/api/v1/projects/:id/quote-attachments", async (req) =>
    resources.attachment(
      await projectContext(req.headers, z.object({ id }).parse(req.params).id),
      z.object({ id }).parse(req.params).id,
      req.body,
    ),
  );
  app.get("/api/v1/projects/:id/quote-design/:revisionId", async (req) => {
    const p = z.object({ id, revisionId: id }).parse(req.params);
    return resources.design(
      await projectContext(req.headers, p.id),
      p.id,
      p.revisionId,
    );
  });
  const quoteParams = (params: unknown) =>
    z.object({ id, quoteId: id }).parse(params);
  app.get("/api/v1/projects/:id/quotes", async (req) =>
    quotes.list(
      await projectContext(req.headers, z.object({ id }).parse(req.params).id),
      z.object({ id }).parse(req.params).id,
    ),
  );
  app.post("/api/v1/projects/:id/quotes", async (req) =>
    quotes.save(
      await projectContext(req.headers, z.object({ id }).parse(req.params).id),
      z.object({ id }).parse(req.params).id,
      req.body,
    ),
  );
  app.get("/api/v1/projects/:id/quotes/:quoteId/differences", async (req) => {
    const p = quoteParams(req.params);
    return quotes.differences(
      await projectContext(req.headers, p.id),
      p.id,
      p.quoteId,
    );
  });
  app.post("/api/v1/projects/:id/quotes/:quoteId/finalize", async (req) => {
    const p = quoteParams(req.params);
    return quotes.finalize(
      await projectContext(req.headers, p.id),
      p.id,
      p.quoteId,
      req.body,
    );
  });
  // Namen horen bij identity; de runtimeverbinding mag die tabel niet lezen.
  async function withActors<T extends { user_id: string }>(rows: T[]) {
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const users = ids.length
      ? (
          await config.identity.query(
            'SELECT id,name,email FROM identity."user" WHERE id = ANY($1)',
            [ids],
          )
        ).rows
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      ...r,
      user_name: byId.get(r.user_id)?.name ?? null,
      user_email: byId.get(r.user_id)?.email ?? null,
    }));
  }
  app.get("/api/v1/projects/:id/quotes/:quoteId/audit", async (req) => {
    const p = quoteParams(req.params);
    const r = await quotes.audit(
      await projectContext(req.headers, p.id),
      p.id,
      p.quoteId,
    );
    return { items: await withActors(r.items) };
  });
  app.get("/api/v1/projects/:id/quotes/:quoteId/history", async (req) => {
    const p = quoteParams(req.params);
    return quotes.history(
      await projectContext(req.headers, p.id),
      p.id,
      p.quoteId,
    );
  });
  app.get(
    "/api/v1/projects/:id/quotes/:quoteId/versions/:version",
    async (req) => {
      const p = versionParams(req.params);
      return quotes.get(
        await projectContext(req.headers, p.id),
        p.id,
        p.quoteId,
        p.version,
      );
    },
  );
  app.post("/api/v1/projects/:id/quotes/:quoteId/revise", async (req) => {
    const p = quoteParams(req.params);
    return quotes.revise(
      await projectContext(req.headers, p.id),
      p.id,
      p.quoteId,
      req.body,
    );
  });
  app.get(
    "/api/v1/projects/:id/quotes/:quoteId/versions/:version/events",
    async (req) => {
      const p = versionParams(req.params);
      return quotes.events(
        await projectContext(req.headers, p.id),
        p.id,
        p.quoteId,
        p.version,
      );
    },
  );
  app.post(
    "/api/v1/projects/:id/quotes/:quoteId/versions/:version/events",
    async (req) => {
      const p = versionParams(req.params);
      return quotes.transition(
        await projectContext(req.headers, p.id),
        p.id,
        p.quoteId,
        p.version,
        req.body,
      );
    },
  );
  app.get(
    "/api/v1/projects/:id/quotes/:quoteId/versions/:version/pdf",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const p = versionParams(req.params),
        r = await delivery.export(
          await projectContext(req.headers, p.id),
          p.id,
          p.quoteId,
          p.version,
        );
      return reply
        .type("application/pdf")
        .header(
          "Content-Disposition",
          `attachment; filename="offerte-v${p.version}.pdf"`,
        )
        .header("X-Content-SHA256", r.pdf_hash)
        .send(r.pdf);
    },
  );
  app.get(
    "/api/v1/projects/:id/quotes/:quoteId/versions/:version/shares",
    async (req) => {
      const p = versionParams(req.params);
      return delivery.shares(
        await projectContext(req.headers, p.id),
        p.id,
        p.quoteId,
        p.version,
      );
    },
  );
  app.post(
    "/api/v1/projects/:id/quotes/:quoteId/versions/:version/shares",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const p = versionParams(req.params);
      return delivery.share(
        await projectContext(req.headers, p.id),
        p.id,
        p.quoteId,
        p.version,
        req.body,
      );
    },
  );
  app.post("/api/v1/quote-shares/:id/revoke", async (req) =>
    delivery.revoke(
      await context(req.headers),
      z.object({ id }).parse(req.params).id,
    ),
  );
  app.get(
    "/api/v1/quote-shares/:organization/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const p = z
          .object({
            organization: id,
            token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
          })
          .parse(req.params),
        r = await delivery.publicPdf(p.organization, p.token);
      return reply
        .type("application/pdf")
        .header("Content-Disposition", 'attachment; filename="offerte.pdf"')
        .send(r.pdf);
    },
  );
  app.get("/api/v1/projects/:id/materials", async (req) =>
    materials.list(
      await projectContext(req.headers, z.object({ id }).parse(req.params).id),
      z.object({ id }).parse(req.params).id,
    ),
  );
  app.get("/api/v1/projects/:id/quantities", async (req) => {
    const { variantId } = z.object({ variantId: id }).parse(req.query);
    return materials.quantities(
      await projectContext(req.headers, z.object({ id }).parse(req.params).id),
      z.object({ id }).parse(req.params).id,
      variantId,
    );
  });
  app.post("/api/v1/projects/:id/materials", async (req) =>
    materials.publish(
      await projectContext(req.headers, z.object({ id }).parse(req.params).id),
      z.object({ id }).parse(req.params).id,
      req.body,
    ),
  );
  const presentations = new PresentationService(
    config.runtime,
    config.secret,
    storage,
  );
  const exports = new ExportJobs(config.runtime, storage);
  const presentationVersionParams = (params: unknown) =>
    z
      .object({
        presentationId: id,
        version: z.coerce.number().int().min(1).max(10000),
      })
      .parse(params);
  app.get("/api/v1/projects/:id/presentations", async (req) => {
    const project = z.object({ id }).parse(req.params).id;
    return presentations.list(
      await projectContext(req.headers, project),
      project,
    );
  });
  app.post("/api/v1/projects/:id/presentations", async (req) => {
    const project = z.object({ id }).parse(req.params).id;
    return presentations.create(
      await projectContext(req.headers, project),
      project,
      req.body,
    );
  });
  app.get("/api/v1/presentations/:presentationId", async (req) =>
    presentations.get(
      await presentationContext(
        req.headers,
        z.object({ presentationId: id }).parse(req.params).presentationId,
      ),
      z.object({ presentationId: id }).parse(req.params).presentationId,
    ),
  );
  app.put("/api/v1/presentations/:presentationId", async (req) =>
    presentations.save(
      await presentationContext(
        req.headers,
        z.object({ presentationId: id }).parse(req.params).presentationId,
      ),
      z.object({ presentationId: id }).parse(req.params).presentationId,
      req.body,
    ),
  );
  app.get("/api/v1/presentations/:presentationId/versions", async (req) =>
    presentations.versions(
      await presentationContext(
        req.headers,
        z.object({ presentationId: id }).parse(req.params).presentationId,
      ),
      z.object({ presentationId: id }).parse(req.params).presentationId,
    ),
  );
  app.get("/api/v1/presentations/:presentationId/outdated", async (req) =>
    presentations.outdated(
      await presentationContext(
        req.headers,
        z.object({ presentationId: id }).parse(req.params).presentationId,
      ),
      z.object({ presentationId: id }).parse(req.params).presentationId,
    ),
  );
  app.post(
    "/api/v1/presentations/:presentationId/versions",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req) =>
      presentations.publish(
        await presentationContext(
          req.headers,
          z.object({ presentationId: id }).parse(req.params).presentationId,
        ),
        z.object({ presentationId: id }).parse(req.params).presentationId,
        req.body,
      ),
  );
  app.get(
    "/api/v1/presentations/:presentationId/versions/:version/pdf",
    { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const p = presentationVersionParams(req.params);
      const r = await presentations.pdf(
        await presentationContext(req.headers, p.presentationId),
        p.presentationId,
        p.version,
      );
      return reply
        .type("application/pdf")
        .header(
          "Content-Disposition",
          `attachment; filename="presentatie-v${p.version}.pdf"`,
        )
        .header("X-Content-SHA256", r.pdf_hash)
        .send(r.pdf);
    },
  );
  app.post(
    "/api/v1/presentations/:presentationId/versions/:version/exports",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req) => {
      const p = presentationVersionParams(req.params);
      const ctx = await presentationContext(req.headers, p.presentationId);
      const format = z
        .object({ id, format: z.enum(["pdf", "pptx"]) })
        .strict()
        .parse(req.body);
      const job = await exports.request(ctx, {
        ...format,
        presentationId: p.presentationId,
        version: p.version,
      });
      /*
       * De werker draait hier in hetzelfde proces. Dat is genoeg voor twee
       * gebruikers en houdt de installatie eenvoudig; de taken staan wel al in
       * de database, dus een aparte werker kan ze later zonder wijziging
       * oppakken. Het verzoek wacht er niet op.
       */
      void drainExports(config.runtime, ctx.organizationId, storage).catch(
        () => {},
      );
      return job;
    },
  );
  app.get("/api/v1/presentations/:presentationId/exports", async (req) =>
    exports.list(
      await presentationContext(
        req.headers,
        z.object({ presentationId: id }).parse(req.params).presentationId,
      ),
      z.object({ presentationId: id }).parse(req.params).presentationId,
    ),
  );
  app.get("/api/v1/export-jobs/:id", async (req) => {
    const job = z.object({ id }).parse(req.params).id;
    return exports.get(await exportJobContext(req.headers, job), job);
  });
  app.get(
    "/api/v1/presentations/:presentationId/versions/:version/pptx",
    async (req, reply) => {
      const p = presentationVersionParams(req.params);
      const r = await presentations.deck(
        await presentationContext(req.headers, p.presentationId),
        p.presentationId,
        p.version,
      );
      return reply
        .type(
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )
        .header(
          "Content-Disposition",
          `attachment; filename="presentatie-v${p.version}.pptx"`,
        )
        .header("X-Content-SHA256", r.pptx_hash)
        .send(r.pptx);
    },
  );
  /**
   * Presentatie-HTML uitleveren. Het document laadt niets van buiten: de eigen
   * regel staat al in de pagina en dezelfde regel gaat als kopregel mee, zodat
   * een browser die de meta negeert er ook niets bij haalt.
   */
  const sendHtml = (reply: FastifyReply, body: string) =>
    reply
      .type("text/html; charset=utf-8")
      .header(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
      )
      .send(body);
  app.get(
    "/api/v1/presentations/:presentationId/versions/:version/view",
    async (req, reply) => {
      const p = presentationVersionParams(req.params);
      const v = await presentations.version(
        await presentationContext(req.headers, p.presentationId),
        p.presentationId,
        p.version,
      );
      return sendHtml(
        reply,
        presentationHtml(v.definition, v.content, {
          subtitle: `Versie ${p.version}`,
        }),
      );
    },
  );
  app.get(
    "/api/v1/presentations/:presentationId/versions/:version/shares",
    async (req) => {
      const presentation = presentationVersionParams(req.params).presentationId;
      return presentations.shares(
        await presentationContext(req.headers, presentation),
        presentation,
      );
    },
  );
  app.post(
    "/api/v1/presentations/:presentationId/versions/:version/shares",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const p = presentationVersionParams(req.params);
      return presentations.share(
        await presentationContext(req.headers, p.presentationId),
        p.presentationId,
        p.version,
        req.body,
      );
    },
  );
  app.post("/api/v1/presentation-shares/:id/revoke", async (req) => {
    const share = z.object({ id }).parse(req.params).id;
    return presentations.revoke(
      await presentationShareContext(req.headers, share),
      share,
    );
  });
  app.get(
    "/api/v1/presentation-shares/:organization/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const p = z
          .object({
            organization: id,
            token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
          })
          .parse(req.params),
        r = await presentations.publicPdf(p.organization, p.token);
      return reply
        .type("application/pdf")
        .header("Content-Disposition", 'attachment; filename="presentatie.pdf"')
        .send(r.pdf);
    },
  );
  /**
   * Dezelfde deellink, maar dan om te lezen in plaats van te downloaden. De
   * klant krijgt de presentatie in de browser te zien met een knop naar de
   * maatvaste PDF ernaast.
   */
  app.get(
    "/api/v1/presentation-shares/:organization/:token/view",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const p = z
        .object({
          organization: id,
          token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        })
        .parse(req.params);
      const v = await presentations.publicView(p.organization, p.token);
      return sendHtml(
        reply,
        presentationHtml(v.definition, v.content, {
          subtitle: `Versie ${v.version}`,
          pdfHref: `/api/v1/presentation-shares/${p.organization}/${p.token}`,
        }),
      );
    },
  );
  const library = new LibraryService(config.runtime);
  app.get("/api/v1/library", async (req) => {
    return library.list(
      await context(req.headers),
      libraryQuerySchema.parse(req.query),
    );
  });
  app.post("/api/v1/library", async (req) =>
    library.publish(await context(req.headers), req.body),
  );
  // Ledenbeheer per project. De keuzelijst komt uit identity, omdat de
  // runtimeverbinding die tabel niet mag lezen.
  app.get("/api/v1/organization/members", async (req) => {
    const ctx = await context(req.headers);
    requirePermission(ctx.role, "members.manage");
    const r = await config.identity.query(
      'SELECT u.id,u.name,u.email,m.role FROM identity.membership m JOIN identity."user" u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY u.name,u.id',
      [ctx.organizationId],
    );
    return { items: r.rows };
  });
  app.get("/api/v1/projects/:id/members", async (req) => {
    const project = z.object({ id }).parse(req.params).id;
    const r = await access.list(await context(req.headers), project);
    return { access: r.access, items: await withActors(r.items) };
  });
  app.post("/api/v1/projects/:id/access", async (req) =>
    access.setAccess(
      await context(req.headers),
      z.object({ id }).parse(req.params).id,
      req.body,
    ),
  );
  app.post("/api/v1/projects/:id/members", async (req) =>
    access.addMember(
      await context(req.headers),
      z.object({ id }).parse(req.params).id,
      req.body,
    ),
  );
  app.post("/api/v1/projects/:id/members/:userId/remove", async (req) => {
    const p = z
      .object({ id, userId: z.string().min(1).max(255) })
      .parse(req.params);
    return access.removeMember(await context(req.headers), p.id, p.userId);
  });
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
    service.variants(
      await variantContext(req.headers, variant(req.params)),
      variant(req.params),
    ),
  );
  app.post("/api/v1/variants/:variantId/copies", async (req) =>
    service.copyVariant(
      await variantContext(req.headers, variant(req.params)),
      variant(req.params),
      req.body,
    ),
  );
  /*
   * Lokaal werk dat niet meer op de server past, naast het bestaande ontwerp
   * zetten. Het document komt hier van de client en kan dus groter zijn dan een
   * gewone opdracht; het contract begrenst het aantal objecten al.
   */
  app.post("/api/v1/variants/:variantId/rescues", async (req) =>
    service.rescueVariant(
      await variantContext(req.headers, variant(req.params)),
      variant(req.params),
      req.body,
    ),
  );
  app.get("/api/v1/variants/:variantId/document", async (req) =>
    service.document(
      await variantContext(req.headers, variant(req.params)),
      variant(req.params),
    ),
  );
  app.post("/api/v1/variants/:variantId/lease", async (req) =>
    service.lease(
      await variantContext(req.headers, variant(req.params)),
      variant(req.params),
      z.object({ leaseId: id }).strict().parse(req.body).leaseId,
    ),
  );
  app.post(
    "/api/v1/variants/:variantId/commands",
    { schema: { body: z.toJSONSchema(commandSchema, { target: "draft-7" }) } },
    async (req) =>
      service.command(
        await variantContext(req.headers, variant(req.params)),
        variant(req.params),
        req.body,
      ),
  );
  app.get("/api/v1/variants/:variantId/revisions", async (req) =>
    service.revisions(
      await variantContext(req.headers, variant(req.params)),
      variant(req.params),
    ),
  );
  app.post("/api/v1/variants/:variantId/revisions", async (req) =>
    service.revision(
      await variantContext(req.headers, variant(req.params)),
      variant(req.params),
      z
        .object({ name: z.string().trim().min(1).max(120) })
        .strict()
        .parse(req.body).name,
    ),
  );
  app.get("/api/v1/variants/:variantId/plan.svg", async (req, reply) => {
    const scene = await service.document(
      await variantContext(req.headers, variant(req.params)),
      variant(req.params),
    );
    const options = z
      .object({
        scale: z.enum(["20", "50", "100"]).default("50"),
        // De bundels zijn een weergavekeuze in de editor; het blad volgt wat
        // daar aan staat, zodat wat je ziet is wat er op papier komt.
        beams: z.enum(["0", "1"]).default("0"),
      })
      .parse(req.query);
    try {
      return reply
        .type("image/svg+xml")
        .header("Content-Disposition", 'attachment; filename="ontwerpblad.svg"')
        .send(
          planSvg(scene, Number(options.scale) as 20 | 50 | 100, {
            beams: options.beams === "1",
          }),
        );
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
