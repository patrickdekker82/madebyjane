import { useState } from "react";
import { api } from "./api";
import type {
  QuoteDefinition,
  QuoteLine,
} from "../../../packages/contracts/src/quotes";
import type { Item } from "../../../packages/contracts/src/index";
import type { MaterialVersion } from "../../../packages/contracts/src/materials";
type Resources = {
  prices: {
    id: string;
    entry_id: string;
    version: number;
    definition: {
      sourceType: string;
      sourceId: string;
      unitPrice: string;
      unit: string;
      taxCategory: string;
      taxRate: string;
      date: string;
      note: string;
    };
  }[];
  attachments: { id: string; title: string; kind: string }[];
  revisions: {
    id: string;
    variant_id: string;
    name: string;
    revision: number;
  }[];
};
export function QuoteResources({
  organizationId,
  projectId,
  value,
  onChange,
  disabled,
  onBusy,
}: {
  organizationId: string;
  projectId: string;
  value: QuoteDefinition;
  onChange: (d: QuoteDefinition) => void;
  disabled: boolean;
  onBusy: (b: boolean) => void;
}) {
  const [open, setOpen] = useState(false),
    [resources, setResources] = useState<Resources>({
      prices: [],
      attachments: [],
      revisions: [],
    }),
    [materials, setMaterials] = useState<MaterialVersion[]>([]),
    [design, setDesign] = useState<{
      revisionId: string;
      variantId: string;
      items: Item[];
    } | null>(null),
    [revision, setRevision] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [title, setTitle] = useState("Ontwerpbijlage"),
    [text, setText] = useState(""),
    [scale, setScale] = useState(50),
    [selected, setSelected] = useState<string[]>([]);
  const endpoint = `/projects/${projectId}`;
  const load = async () => {
    setResources(await api(endpoint + "/quote-resources", organizationId));
    setMaterials(
      (
        await api<{ items: MaterialVersion[] }>(
          endpoint + "/materials",
          organizationId,
        )
      ).items,
    );
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  const attach = async (input: unknown) => {
    const a = await api<{ id: string }>(
      endpoint + "/quote-attachments",
      organizationId,
      input,
    );
    onChange({ ...value, attachments: [...(value.attachments ?? []), a.id] });
    await load();
  };
  const priceFor = (l: QuoteLine) =>
    resources.prices.find((p) =>
      l.source
        ? p.definition.sourceType === "material" &&
          p.definition.sourceId === l.source.entryId
        : l.designSource && design?.revisionId === l.designSource.revisionId
          ? p.definition.sourceType === "library" &&
            p.definition.sourceId ===
              design.items.find((i) => i.id === l.designSource!.itemId)
                ?.libraryRef?.entryId
          : false,
    );
  const applyPrice = (lineId: string, p: Resources["prices"][number]) =>
    onChange({
      ...value,
      lines: value.lines.map((l) =>
        l.id === lineId
          ? {
              ...l,
              unitPrice: p.definition.unitPrice,
              unit: p.definition.unit,
              taxCategory: p.definition.taxCategory,
              taxRate: p.definition.taxRate,
              priceNote: `${p.definition.date} · ${p.definition.note}`.slice(
                0,
                300,
              ),
              priceRef: { id: p.id },
            }
          : l,
      ),
    });
  return (
    <section
      style={{ border: "1px solid #d7ded4", padding: 16, margin: "16px 0" }}
    >
      <button
        disabled={disabled || busy}
        onClick={() => {
          setOpen(!open);
          if (!open) void run(load);
        }}
      >
        Prijsbronnen en presentatiebijlagen
      </button>
      {open && (
        <fieldset disabled={disabled || busy} style={{ border: 0, padding: 0 }}>
          <h3>Ontwerpobjecten uit een vaste revisie</h3>
          <p>
            Bewaar eerst een ontwerprevisie in Versiegeschiedenis. Een gekoppeld
            object telt één keer; extra aantallen zijn handmatige posten.
          </p>
          <label>
            Ontwerprevisie
            <select
              value={revision}
              onChange={(e) => {
                setRevision(e.target.value);
                setDesign(null);
              }}
            >
              <option value="">Kies een revisie</option>
              {resources.revisions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · revisie {r.revision}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!revision}
            onClick={() =>
              void run(async () =>
                setDesign(
                  await api(
                    endpoint + `/quote-design/${revision}`,
                    organizationId,
                  ),
                ),
              )
            }
          >
            Objecten uit revisie ophalen
          </button>
          {design?.items.map((item) => (
            <button
              key={item.id}
              disabled={
                value.lines.length >= 200 ||
                value.lines.some(
                  (l) =>
                    l.designSource?.variantId === design.variantId &&
                    l.designSource.itemId === item.id,
                )
              }
              onClick={() =>
                onChange({
                  ...value,
                  lines: [
                    ...value.lines,
                    {
                      id: crypto.randomUUID(),
                      description: item.name,
                      quantity: "1",
                      unit: "stuk",
                      unitPrice: "0",
                      discount: "0",
                      taxCategory: "Algemeen",
                      taxRate: "21",
                      priceNote: "Handmatig vastgesteld",
                      source: null,
                      designSource: {
                        variantId: design.variantId,
                        revisionId: design.revisionId,
                        itemId: item.id,
                      },
                    },
                  ],
                })
              }
            >
              Voeg {item.name} uit ontwerp toe
            </button>
          ))}
          <h3>Catalogusprijzen voor dit project</h3>
          <p>
            Bewaar een verkoopprijsversie bij een materiaal of
            bibliotheekproduct. Prijswijzigingen worden nooit vanzelf in een
            offerte overgenomen.
          </p>
          {value.lines
            .filter((l) => l.source || l.designSource)
            .map((l) => {
              const p = priceFor(l),
                libraryId =
                  l.designSource &&
                  design?.revisionId === l.designSource.revisionId
                    ? design.items.find((i) => i.id === l.designSource!.itemId)
                        ?.libraryRef?.entryId
                    : undefined;
              return (
                <div key={l.id} style={{ padding: "8px 0" }}>
                  <strong>{l.description}</strong>{" "}
                  {p
                    ? `· prijsversie ${p.version}: ${p.definition.unitPrice.replace(".", ",")} EUR`
                    : "· nog geen prijsversie geladen"}
                  {p && (
                    <button onClick={() => applyPrice(l.id, p)}>
                      Prijsversie overnemen voor {l.description}
                    </button>
                  )}
                  {(l.source || libraryId) && (
                    <button
                      onClick={() =>
                        void run(async () => {
                          if (
                            !window.confirm(
                              "De huidige prijs, eenheid, belasting en prijsnotitie als nieuwe catalogusprijs bewaren?",
                            )
                          )
                            return;
                          const saved = await api<Resources["prices"][number]>(
                            endpoint + "/quote-prices",
                            organizationId,
                            {
                              id: crypto.randomUUID(),
                              entryId: p?.entry_id ?? crypto.randomUUID(),
                              baseVersion: p?.version ?? 0,
                              sourceType: l.source ? "material" : "library",
                              sourceId: l.source?.entryId ?? libraryId,
                              unitPrice: l.unitPrice,
                              unit: l.unit,
                              taxCategory: l.taxCategory,
                              taxRate: l.taxRate,
                              date: value.date,
                              note: l.priceNote,
                            },
                          );
                          applyPrice(l.id, saved);
                          await load();
                        })
                      }
                    >
                      Huidige prijs als catalogusversie bewaren
                    </button>
                  )}
                  {l.priceRef && (
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            "De vaste prijsreferentie losmaken? Onderbouw je handmatige prijs daarna bij Prijsbron / datum.",
                          )
                        ) {
                          const { priceRef, ...manual } = l;
                          onChange({
                            ...value,
                            lines: value.lines.map((x) =>
                              x.id === l.id ? { ...manual, priceNote: "" } : x,
                            ),
                          });
                        }
                      }}
                    >
                      Handmatige prijs kiezen
                    </button>
                  )}
                </div>
              );
            })}
          <h3>Vaste presentatiebijlagen</h3>
          <p>
            Elke bijlage is een apart bewaard presentatieblok. Tekst,
            materiaalbladen en schaalplannen komen achter de offerte in dezelfde
            PDF. Gebruik dezelfde bronversies als in de posten.
          </p>
          {resources.attachments.map((a) => (
            <label key={a.id} style={{ display: "block" }}>
              <input
                type="checkbox"
                style={{ width: "auto", marginRight: 8 }}
                checked={(value.attachments ?? []).includes(a.id)}
                onChange={(e) =>
                  onChange({
                    ...value,
                    attachments: e.target.checked
                      ? [...(value.attachments ?? []), a.id]
                      : (value.attachments ?? []).filter((id) => id !== a.id),
                  })
                }
              />
              {a.title} · {a.kind}
            </label>
          ))}
          <label>
            Bijlagetitel
            <input
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Presentatietekst
            <textarea
              maxLength={10000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <button
            disabled={
              !text.trim() ||
              !title.trim() ||
              (value.attachments?.length ?? 0) >= 12
            }
            onClick={() =>
              void run(() =>
                attach({ id: crypto.randomUUID(), kind: "text", title, text }),
              )
            }
          >
            Tekstblok bewaren en bijvoegen
          </button>
          <label>
            Planschaal
            <select
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
            >
              <option value={20}>1:20</option>
              <option value={50}>1:50</option>
              <option value={100}>1:100</option>
            </select>
          </label>
          <button
            disabled={
              !revision ||
              !title.trim() ||
              (value.attachments?.length ?? 0) >= 12
            }
            onClick={() =>
              void run(() =>
                attach({
                  id: crypto.randomUUID(),
                  kind: "plan",
                  title,
                  revisionId: revision,
                  scale,
                }),
              )
            }
          >
            Planblad bewaren en bijvoegen
          </button>
          <h4>Materiaalblad samenstellen</h4>
          {materials.map((m) => (
            <label key={m.id} style={{ display: "block" }}>
              <input
                type="checkbox"
                style={{ width: "auto", marginRight: 8 }}
                checked={selected.includes(m.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, m.id]
                      : selected.filter((id) => id !== m.id),
                  )
                }
              />
              {m.definition.name} · versie {m.version}
            </label>
          ))}
          <button
            disabled={
              !selected.length ||
              !title.trim() ||
              (value.attachments?.length ?? 0) >= 12
            }
            onClick={() =>
              void run(() =>
                attach({
                  id: crypto.randomUUID(),
                  kind: "materials",
                  title,
                  versionIds: selected,
                }),
              )
            }
          >
            Materiaalblad bewaren en bijvoegen
          </button>
        </fieldset>
      )}
      {busy && <p role="status">Bezig…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
