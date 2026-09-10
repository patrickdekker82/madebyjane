import { useState, useRef } from "react";
import { QuoteResources } from "./QuoteResources";
import { QuoteActions } from "./QuoteActions";
import { quoteStatuses } from "../../../packages/contracts/src/quotes";
import * as Dialog from "@radix-ui/react-dialog";
import { api, ApiError } from "./api";
import {
  quoteDefinitionSchema,
  type QuoteRecord,
  type QuoteSummary,
  type QuoteDefinition,
  type QuoteLine,
} from "../../../packages/contracts/src/quotes";
import type { MaterialVersion } from "../../../packages/contracts/src/materials";
import { calculateQuote } from "../../../packages/domain/src/quote-calculation";
const money = (s: string) => s.replace(".", ",") + " €";
const fresh = (): QuoteDefinition => ({
  customer: "",
  title: "Interieurvoorstel",
  date: new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Amsterdam",
  }),
  validUntil: new Date(Date.now() + 30 * 86400000).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Amsterdam",
  }),
  currency: "EUR",
  terms: "",
  lines: [],
});
const newLine = (): QuoteLine => ({
  id: crypto.randomUUID(),
  description: "",
  unit: "stuk",
  quantity: "1",
  unitPrice: "0",
  discount: "0",
  taxCategory: "Algemeen",
  taxRate: "21",
  source: null,
  priceNote: "Handmatig vastgesteld",
});
export function Quotes({
  organizationId,
  projectId,
  organizationName,
}: {
  organizationId: string;
  projectId: string;
  organizationName?: string;
}) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<QuoteSummary[]>([]),
    [editing, setEditing] = useState(false),
    [row, setRow] = useState<QuoteRecord | null>(null),
    [value, setValue] = useState(fresh),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [materials, setMaterials] = useState<MaterialVersion[]>([]),
    [differences, setDifferences] = useState<
      {
        lineId: string;
        name: string;
        kind?: string;
        latestVersionId: string;
        previous: any;
        current: any;
      }[]
    >([]);
  const pending = useRef<{ path: string; body: unknown } | null>(null),
    newId = useRef(crypto.randomUUID());
  const endpoint = `/projects/${projectId}/quotes`;
  const load = async () => {
    setRows(
      (await api<{ items: QuoteSummary[] }>(endpoint, organizationId)).items,
    );
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const edit = (r: QuoteRecord | null) => {
    setRow(r);
    setValue(
      r
        ? structuredClone(r.definition)
        : { ...fresh(), seller: organizationName ?? "" },
    );
    setEditing(true);
    setDifferences([]);
    setError("");
    newId.current = crypto.randomUUID();
  };
  const openVersion = async (q: { id: string; version: number }) => {
    edit(
      await api<QuoteRecord>(
        `${endpoint}/${q.id}/versions/${q.version}`,
        organizationId,
      ),
    );
    await load();
  };
  const save = async (finalize = false) => {
    if (!pending.current) {
      if (!finalize) {
        const parsed = quoteDefinitionSchema.safeParse(value);
        if (!parsed.success)
          throw new Error(
            parsed.error.issues[0]?.message ?? "Controleer de offerte.",
          );
      }
      pending.current = {
        path: finalize ? `${endpoint}/${row!.id}/finalize` : endpoint,
        body: finalize
          ? { requestId: crypto.randomUUID(), baseVersion: row!.version }
          : {
              id: row?.id ?? newId.current,
              requestId: crypto.randomUUID(),
              baseVersion: row?.version ?? 0,
              definition: value,
            },
      };
    }
    try {
      const saved = await api<QuoteRecord>(
        pending.current.path,
        organizationId,
        pending.current.body,
      );
      pending.current = null;
      setRow(saved);
      setValue(saved.definition);
      setDifferences([]);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) pending.current = null;
      throw e;
    }
  };
  const result = quoteDefinitionSchema.safeParse(value);
  const totals = result.success ? calculateQuote(result.data) : null;
  const latestVersion = Math.max(
    row?.version ?? 0,
    ...rows.filter((r) => r.id === row?.id).map((r) => r.version),
  );
  const historical = !!row && row.version < latestVersion;
  const frozen = !!row?.number || historical;
  const dirty = row
    ? JSON.stringify(value) !== JSON.stringify(row.definition)
    : JSON.stringify(value) !== JSON.stringify(fresh());
  const updateLine = (index: number, key: keyof QuoteLine, text: string) =>
    setValue((v) => ({
      ...v,
      lines: v.lines.map((l, i) =>
        i === index
          ? {
              ...l,
              [key]:
                key === "purchaseUnitPrice" && !text.trim()
                  ? undefined
                  : [
                        "quantity",
                        "unitPrice",
                        "purchaseUnitPrice",
                        "discount",
                        "taxRate",
                      ].includes(key)
                    ? text.replace(",", ".")
                    : text,
            }
          : l,
      ),
    }));
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (busy || editing || pending.current) return;
        setOpen(v);
        if (v) void run(load);
      }}
    >
      <Dialog.Trigger asChild>
        <button className="subtle">Offertes</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className="dialog"
          style={{ width: "min(1000px,94vw)" }}
        >
          <Dialog.Title>Offertes</Dialog.Title>
          <Dialog.Description>
            Concepten en vaste offertes voor dit project. Definitief maken
            verstuurt niets.
          </Dialog.Description>
          {!editing ? (
            <>
              <button
                className="primary"
                disabled={busy}
                onClick={() => edit(null)}
              >
                Nieuw offerteconcept
              </button>
              {!rows.length && (
                <p>
                  Nog geen offertes. Begin met een concept en voeg je posten
                  toe.
                </p>
              )}
              {rows.map((r) => (
                <article
                  key={r.id}
                  style={{ borderBottom: "1px solid #ddd", padding: "12px 0" }}
                >
                  <h3>
                    {r.number ?? "Concept"} · {r.definition.title}
                  </h3>
                  <p>
                    Versie {r.version} · {money(r.totals.total)} ·{" "}
                    {r.status && !["draft", "final"].includes(r.status)
                      ? quoteStatuses[r.status]
                      : r.number
                        ? "Definitief · niet door de app verzonden"
                        : "Bewerkbaar concept"}
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => void run(() => openVersion(r))}
                  >
                    Open offerte
                  </button>
                </article>
              ))}
              <Dialog.Close asChild>
                <button disabled={busy}>Sluiten</button>
              </Dialog.Close>
            </>
          ) : (
            <>
              <h3>
                {row?.number ?? "Concept zonder offertenummer"}
                {row ? ` · versie ${row.version}` : ""}
              </h3>
              <fieldset
                disabled={busy || frozen || !!pending.current}
                style={{ border: 0, padding: 0 }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                    gap: 12,
                  }}
                >
                  <label>
                    Titel
                    <input
                      value={value.title}
                      maxLength={200}
                      onChange={(e) =>
                        setValue({ ...value, title: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Offertedatum
                    <input
                      type="date"
                      value={value.date}
                      onChange={(e) =>
                        setValue({ ...value, date: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Geldig tot
                    <input
                      type="date"
                      value={value.validUntil}
                      onChange={(e) =>
                        setValue({ ...value, validUntil: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Bedrijfsgegevens afzender
                  <textarea
                    maxLength={2000}
                    value={value.seller ?? ""}
                    onChange={(e) =>
                      setValue({ ...value, seller: e.target.value })
                    }
                  />
                </label>
                <label>
                  Klant / bedrijf en adres
                  <textarea
                    value={value.customer}
                    maxLength={2000}
                    onChange={(e) =>
                      setValue({ ...value, customer: e.target.value })
                    }
                  />
                </label>
                <h3>Posten · prijzen exclusief belasting</h3>
                <p className="small">
                  Controleer tarief en categorie per post. Negatieve
                  eenheidsprijzen zijn correcties. Hoeveelheden zijn handmatig.
                </p>
                {value.lines.map((l, i) => (
                  <section
                    key={l.id}
                    style={{
                      padding: "16px 0",
                      borderBottom: "1px solid #ddd",
                    }}
                  >
                    <h4>
                      Post {i + 1}
                      {l.source
                        ? " · gekoppelde materiaalkeuze"
                        : " · handmatig"}
                    </h4>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit,minmax(170px,1fr))",
                        gap: 10,
                      }}
                    >
                      {(
                        [
                          ["description", "Omschrijving"],
                          ["quantity", "Hoeveelheid"],
                          ["unit", "Eenheid"],
                          ["unitPrice", "Eenheidsprijs EUR"],
                          ["purchaseUnitPrice", "Inkoopprijs per eenheid EUR"],
                          ["purchaseNote", "Inkoopbron / datum"],
                          ["discount", "Korting %"],
                          ["taxCategory", "Belastingcategorie"],
                          ["taxRate", "Tarief %"],
                          ["priceNote", "Prijsbron / datum"],
                          [
                            "overlapReason",
                            "Onderbouwing mogelijke dubbeltelling",
                          ],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <input
                            aria-label={`${label} post ${i + 1}`}
                            value={l[key] ?? ""}
                            onChange={(e) => updateLine(i, key, e.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                    {totals && (
                      <p>
                        Netto verkoop: {money(totals.lines[i]!.net)} · Inkoop:{" "}
                        {totals.commercial!.lines[i]!.cost === null
                          ? "nog niet ingevuld"
                          : money(totals.commercial!.lines[i]!.cost!)}
                      </p>
                    )}
                    <button
                      onClick={() =>
                        setValue({
                          ...value,
                          lines: value.lines.filter((_, n) => n !== i),
                        })
                      }
                    >
                      Verwijder post {i + 1}
                    </button>
                  </section>
                ))}
                {value.lines.length < 200 && (
                  <button
                    onClick={() =>
                      setValue({ ...value, lines: [...value.lines, newLine()] })
                    }
                  >
                    Handmatige post toevoegen
                  </button>
                )}
                <button
                  onClick={() =>
                    void run(async () =>
                      setMaterials(
                        (
                          await api<{ items: MaterialVersion[] }>(
                            `/projects/${projectId}/materials`,
                            organizationId,
                          )
                        ).items,
                      ),
                    )
                  }
                >
                  Materiaalkeuzes ophalen
                </button>
                {materials.map((m) => (
                  <button
                    key={m.id}
                    disabled={
                      value.lines.length >= 200 ||
                      value.lines.some((l) => l.source?.entryId === m.entry_id)
                    }
                    onClick={() =>
                      setValue({
                        ...value,
                        lines: [
                          ...value.lines,
                          {
                            ...newLine(),
                            description: m.definition.name,
                            unit: m.definition.unit,
                            quantity: m.definition.quantity ?? "",
                            source: { entryId: m.entry_id, versionId: m.id },
                          },
                        ],
                      })
                    }
                  >
                    Voeg {m.definition.name} toe
                    {m.definition.quantity === null ? " (aantal invullen)" : ""}
                  </button>
                ))}
                <label>
                  Voorwaarden
                  <textarea
                    maxLength={10000}
                    value={value.terms}
                    onChange={(e) =>
                      setValue({ ...value, terms: e.target.value })
                    }
                  />
                </label>
              </fieldset>
              {totals && (
                <section aria-label="Offertetotalen">
                  <p>Subtotaal: {money(totals.net)}</p>
                  {totals.taxes.map((t) => (
                    <p key={t.category}>
                      {t.category} ({t.rate}%): {money(t.tax)}
                    </p>
                  ))}
                  <h3>Totaal: {money(totals.total)}</h3>
                  <p className="small">
                    Netto per post op centen afgerond, daarna belasting per
                    categorie. Halve centen van nul af.
                  </p>
                </section>
              )}
              {totals?.commercial && (
                <section aria-label="Interne calculatie">
                  <h3>Interne calculatie</h3>
                  <p className="small">
                    Deze inkoopgegevens en marge komen niet in de klant-PDF.
                  </p>
                  <p>Bekende inkoop: {money(totals.commercial.knownCost)}</p>
                  {totals.commercial.margin === null ? (
                    <p>
                      Marge nog niet berekend: vul voor alle posten een
                      inkoopprijs en inkoopbron in, ook wanneer de inkoop nul
                      is.
                    </p>
                  ) : (
                    <p>
                      Marge excl. belasting: {money(totals.commercial.margin)} ·{" "}
                      {totals.commercial.marginPercent?.replace(".", ",")}% van
                      netto verkoop
                    </p>
                  )}
                </section>
              )}
              <QuoteResources
                key={`${row?.id ?? newId.current}:${row?.version ?? 0}`}
                organizationId={organizationId}
                projectId={projectId}
                value={value}
                onChange={setValue}
                disabled={busy || frozen || !!pending.current}
                onBusy={setBusy}
              />
              {differences.map((d) => (
                <article key={`${d.lineId}:${d.kind}`}>
                  <h4>Gewijzigd: {d.name}</h4>
                  {d.kind === "price" && (
                    <p>
                      Prijs was {d.previous.unitPrice} EUR, nu{" "}
                      {d.current.unitPrice} EUR. Prijsdatum {d.current.date} ·{" "}
                      {d.current.note}
                    </p>
                  )}
                  {d.kind === "design" && (
                    <p>
                      Het actuele ontwerp is revisie {d.current.revision}; deze
                      post blijft gekoppeld aan revisie {d.previous.revision}.
                      Voor de nieuwste inhoud: bewaar een nieuwe ontwerprevisie
                      en voeg het object en planblad daarvan opnieuw toe.
                    </p>
                  )}
                  <p>
                    Was: {d.previous.name} · {d.previous.quantity ?? "onbekend"}{" "}
                    {d.previous.unit}. Nu: {d.current.name} ·{" "}
                    {d.current.quantity ?? "onbekend"} {d.current.unit}.
                  </p>
                  <p>
                    Controleer ook leverancier, artikel en prijs:{" "}
                    {d.current.supplier} · {d.current.sku} ·{" "}
                    {d.current.colorCode}.
                  </p>
                  {!frozen && d.kind !== "design" && (
                    <button
                      disabled={busy || !!pending.current}
                      onClick={() => {
                        setValue({
                          ...value,
                          lines: value.lines.map((l) =>
                            l.id === d.lineId
                              ? d.kind === "price"
                                ? {
                                    ...l,
                                    unitPrice: d.current.unitPrice,
                                    unit: d.current.unit,
                                    taxCategory: d.current.taxCategory,
                                    taxRate: d.current.taxRate,
                                    priceNote:
                                      `${d.current.date} · ${d.current.note}`.slice(
                                        0,
                                        300,
                                      ),
                                    priceRef: { id: d.latestVersionId },
                                  }
                                : {
                                    ...l,
                                    description: d.current.name,
                                    quantity: d.current.quantity ?? "",
                                    unit: d.current.unit,
                                    source: {
                                      ...l.source!,
                                      versionId: d.latestVersionId,
                                    },
                                  }
                              : l,
                          ),
                        });
                        setDifferences(
                          differences.filter(
                            (x) => x.lineId !== d.lineId || x.kind !== d.kind,
                          ),
                        );
                      }}
                    >
                      {d.kind === "price"
                        ? "Nieuwe prijsversie overnemen"
                        : "Nieuwe materiaalgegevens overnemen; prijs behouden"}
                    </button>
                  )}
                </article>
              ))}
              {!frozen && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void run(() => save())}
                >
                  {pending.current
                    ? "Opslag opnieuw proberen"
                    : "Concept bewaren"}
                </button>
              )}
              {row && !historical && (
                <button
                  disabled={busy || dirty || !!pending.current}
                  onClick={() =>
                    void run(async () =>
                      setDifferences(
                        (
                          await api<{ changes: typeof differences }>(
                            `${endpoint}/${row.id}/differences`,
                            organizationId,
                          )
                        ).changes,
                      ),
                    )
                  }
                >
                  Materiaalverschillen controleren
                </button>
              )}
              {row && !frozen && (
                <button
                  disabled={busy || dirty || !!pending.current}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Deze versie definitief maken? Klantgegevens, posten en prijzen worden vastgezet en krijgen een offertenummer. Er wordt niets verstuurd.",
                      )
                    )
                      void run(() => save(true));
                  }}
                >
                  Definitief maken
                </button>
              )}
              {dirty && (
                <p>
                  Bewaar het concept voordat je bronverschillen controleert of
                  de offerte definitief maakt.
                </p>
              )}
              {frozen && (
                <p>
                  Deze versie is vastgezet. Bekijk de geschiedenis of maak
                  vanuit de nieuwste definitieve versie een vervolgconcept.
                </p>
              )}
              {row && (
                <QuoteActions
                  key={`${row.id}:${row.version}:${row.event_version ?? 0}`}
                  organizationId={organizationId}
                  projectId={projectId}
                  row={row}
                  disabled={busy || dirty || !!pending.current}
                  latestVersion={latestVersion}
                  onOpen={openVersion}
                  onBusy={setBusy}
                />
              )}
              <button
                disabled={busy || !!pending.current}
                onClick={() => {
                  if (
                    !dirty ||
                    window.confirm("Niet opgeslagen wijzigingen verlaten?")
                  ) {
                    setEditing(false);
                    setMaterials([]);
                    setError("");
                  }
                }}
              >
                Terug naar offertes
              </button>
            </>
          )}
          {busy && <p role="status">Bezig…</p>}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
