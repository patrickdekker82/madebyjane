import { SymbolEditor } from "./SymbolEditor";
import type { SymbolShape } from "../../../packages/contracts/src/index";
import { libraryPublishSchema } from "../../../packages/contracts/src/index";
import { useState, useRef, lazy, Suspense } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type {
  LibraryVersion,
  LibraryDefinition,
} from "../../../packages/contracts/src/index";
import { parseDutchNumber } from "../../../packages/geometry/src/index";
import { api } from "./api";
const GlbInspector = lazy(() => import("./GlbInspector"));
export function LibraryPanel({
  organizationId,
  canEdit,
  disabled,
  onPlace,
}: {
  organizationId: string;
  canEdit: boolean;
  disabled: boolean;
  onPlace: (versionId: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<LibraryVersion[]>([]),
    [next, setNext] = useState<number | null>(null),
    [editing, setEditing] = useState<LibraryVersion | null | undefined>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [model, setModel] = useState<LibraryDefinition["model"]>();
  const [shapes, setShapes] = useState<SymbolShape[]>([]);
  const [footprint, setFootprint] = useState({ width: 2400, depth: 950 });
  const pending = useRef<{
    entryId: string;
    versionId: string;
    baseVersion: number;
    definition: LibraryDefinition;
  } | null>(null);
  const [filters, setFilters] = useState({ q: "", category: "" });
  const load = async (offset = 0, selectedFilters = filters) => {
    setBusy(true);
    if (offset === 0) { setRows([]); setNext(null); }
    try {
      const result = await api<{
        items: LibraryVersion[];
        nextOffset: number | null;
      }>("/library?" + new URLSearchParams({
        offset: String(offset), ...selectedFilters,
      }), organizationId);
      setRows((old) => (offset ? [...old, ...result.items] : result.items));
      setNext(result.nextOffset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const edit = (row: LibraryVersion | null) => {
    setShapes(row?.definition.symbol ?? []);
    setModel(row?.definition.model);
    setFootprint({
      width: row?.definition.width ?? 2400,
      depth: row?.definition.depth ?? 950,
    });
    pending.current = null;
    setError("");
    setEditing(row);
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (busy) return;
        setOpen(value);
        if (value) {
          setError("");
          setEditing(undefined);
          setFilters({ q: "", category: "" });
          void load(0, { q: "", category: "" });
        }
      }}
    >
      <Dialog.Trigger asChild>
        <button className="subtle full">Eigen bibliotheek</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title>Eigen meubelbibliotheek</Dialog.Title>
          <Dialog.Description>
            Bewaar vaste maten als eigen meubel of lichtpunt. Een nieuwe versie
            verandert geen bestaande plaatsingen. Gebruik eigen 2D-symbolen of koppel een ondersteund GLB-model.
          </Dialog.Description>
          {editing === undefined ? (
            <>
              {canEdit && <details>
                <summary>3D-model controleren (GLB)</summary>
                <Suspense fallback={<p>Modelcontrole laden…</p>}><GlbInspector organizationId={organizationId} onSaved={asset => {
                  edit(null);
                  setModel({ assetId: asset.id, width: asset.width, depth: asset.depth, height: asset.height });
                  setFootprint({ width: asset.width, depth: asset.depth });
                }} /></Suspense>
              </details>}
              <form className="library-search" onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const nextFilters = {
                  q: String(data.get("q") ?? "").trim(),
                  category: String(data.get("category") ?? "").trim(),
                };
                setFilters(nextFilters);
                setError("");
                void load(0, nextFilters);
              }}>
                <label>Zoeken
                  <input name="q" defaultValue={filters.q} aria-label="Bibliotheek zoeken" maxLength={120}
                    placeholder="Naam, zoekterm, leverancier of artikelnummer" disabled={busy} />
                </label>
                <label>Categorie
                  <input name="category" defaultValue={filters.category} aria-label="Bibliotheekcategorie filter" maxLength={80}
                    placeholder="Exacte categorie · leeg voor alle" disabled={busy} />
                </label>
                <button type="submit" disabled={busy}>Zoeken in bibliotheek</button>
              </form>
              {canEdit && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => edit(null)}
                >
                  Bibliotheekitem maken
                </button>
              )}
              {busy && <p role="status">Bibliotheek laden…</p>}
              {!busy && rows.length === 0 && <p>{filters.q || filters.category ? "Geen items gevonden voor deze zoekopdracht." : "Nog geen eigen items."}</p>}
              <ul style={{ listStyle: "none", padding: 0 }}>
                {rows.map((row) => (
                  <li
                    key={row.id}
                    style={{
                      borderBottom: "1px solid #ddd",
                      padding: "14px 0",
                    }}
                  >
                    <strong>{row.definition.name}</strong>
                    {row.definition.catalog && <p className="small">
                      {[row.definition.catalog.category, row.definition.catalog.supplier,
                        row.definition.catalog.sku].filter(Boolean).join(" · ")}
                    </p>}
                    <p>
                      {row.definition.width} × {row.definition.depth} ×{" "}
                      {row.definition.height} mm · versie {row.version}
                    </p>
                    <button
                      disabled={disabled || busy}
                      onClick={() => {
                        onPlace(row.id);
                        setOpen(false);
                      }}
                    >
                      Plaats {row.definition.name}
                    </button>
                    {canEdit && (
                      <button disabled={busy} onClick={() => edit(row)}>
                        Nieuwe versie van {row.definition.name}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {next !== null && (
                <button disabled={busy} onClick={() => void load(next)}>
                  Meer items laden
                </button>
              )}
            </>
          ) : (
            <form
              key={editing?.id ?? "new"}
              onSubmit={async (event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                try {
                  if (!pending.current) {
                    const number = (name: string) =>
                      Math.round(parseDutchNumber(String(data.get(name))));
                    pending.current = {
                      entryId: editing?.entry_id ?? crypto.randomUUID(),
                      versionId: crypto.randomUUID(),
                      baseVersion: editing?.version ?? 0,
                      definition: {
                        ...(shapes.length ? { symbol: shapes } : {}),
                        ...(model ? { model } : {}),
                        catalog: {
                          category: String(data.get("category") ?? ""),
                          description: String(data.get("description") ?? ""),
                          keywords: String(data.get("keywords") ?? "").split(",").map(v => v.trim()).filter(Boolean),
                          supplier: String(data.get("supplier") ?? ""),
                          sku: String(data.get("sku") ?? ""),
                        },
                        name: String(data.get("name")),
                        kind: String(
                          data.get("kind"),
                        ) as LibraryDefinition["kind"],
                        width: number("width"),
                        depth: number("depth"),
                        height: number("height"),
                        color: String(data.get("color")),
                      },
                    };
                  }
                  if (
                    !libraryPublishSchema.safeParse(pending.current).success
                  ) {
                    pending.current = null;
                    throw new Error(
                      "Vul een naam en geldige maten van 1 tot 100.000 mm in. Gebruik maximaal 20 zoektermen van elk 80 tekens.",
                    );
                  }
                  setBusy(true);
                  await api("/library", organizationId, pending.current);
                  pending.current = null;
                  setEditing(undefined);
                  setError("");
                  setFilters({ q: "", category: "" });
                  await load(0, { q: "", category: "" });
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h3>{editing ? "Nieuwe versie" : "Nieuw item"}</h3>
              {model && <p className="small">Eigen 3D-model gekoppeld. De weergave volgt de meubelmaten hieronder.</p>}
              <fieldset
                disabled={busy || !!pending.current}
                style={{ border: 0, padding: 0, margin: 0 }}
              >
                <label>
                  Naam
                  <input
                    name="name"
                    aria-label="Bibliotheeknaam"
                    required
                    maxLength={120}
                    defaultValue={editing?.definition.name ?? ""}
                  />
                </label>
                {([
                  ["category", "Categorie", 80],
                  ["supplier", "Leverancier", 120],
                  ["sku", "Artikelnummer", 120],
                ] as const).map(([field, label, maxLength]) => (
                  <label key={field}>{label}
                    <input name={field} aria-label={"Item " + label.toLowerCase()}
                      maxLength={maxLength} defaultValue={editing?.definition.catalog?.[field] ?? ""} />
                  </label>
                ))}
                <label>Omschrijving
                  <textarea name="description" aria-label="Item omschrijving" maxLength={2000}
                    rows={3} defaultValue={editing?.definition.catalog?.description ?? ""} />
                </label>
                <label>Zoektermen (gescheiden door komma’s, maximaal 20)
                  <input name="keywords" aria-label="Item zoektermen" maxLength={1619}
                    defaultValue={editing?.definition.catalog?.keywords.join(", ") ?? ""} />
                </label>
                <label>
                  Type
                  <select
                    name="kind"
                    aria-label="Bibliotheektype"
                    defaultValue={editing?.definition.kind ?? "sofa"}
                  >
                    <option value="sofa">Bank</option>
                    <option value="table">Tafel</option>
                    <option value="cabinet">Kast</option>
                    <option value="light">Lichtpunt</option>
                  </select>
                </label>
                {(["width", "depth", "height"] as const).map((field, i) => (
                  <label key={field}>
                    {["Breedte", "Diepte", "Hoogte"][i]} (mm)
                    <input
                      name={field}
                      onChange={(e) => {
                        const value = Number(e.target.value.replace(",", "."));
                        if (
                          (field === "width" || field === "depth") &&
                          value > 0 &&
                          value <= 100000
                        )
                          setFootprint((old) => ({ ...old, [field]: value }));
                      }}
                      aria-label={
                        [
                          "Bibliotheekbreedte",
                          "Bibliotheekdiepte",
                          "Bibliotheekhoogte",
                        ][i]
                      }
                      required
                      inputMode="decimal"
                      defaultValue={
                        editing?.definition[field] ?? [footprint.width, footprint.depth, model?.height ?? 780][i]
                      }
                    />
                  </label>
                ))}
                <label>
                  Kleur
                  <input
                    type="color"
                    name="color"
                    aria-label="Bibliotheekkleur"
                    defaultValue={editing?.definition.color ?? "#c4b39d"}
                  />
                </label>
              </fieldset>
              <SymbolEditor
                shapes={shapes}
                onChange={setShapes}
                width={footprint.width}
                depth={footprint.depth}
                disabled={busy || !!pending.current}
              />
              <button className="primary" disabled={busy}>
                {pending.current
                  ? "Bewaren opnieuw proberen"
                  : "Versie bewaren"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  pending.current = null;
                  setEditing(undefined);
                  setError("");
                }}
              >
                Terug naar bibliotheek
              </button>
            </form>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <Dialog.Close asChild>
            <button disabled={busy}>Sluiten</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
