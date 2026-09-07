import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  materialPublishSchema, materialStatuses, quantityBasisLabels, quantityBasisUnits,
  type MaterialDefinition, type MaterialVersion, type QuantityRequest,
} from "../../../packages/contracts/src/materials";
import { computeQuantity } from "../../../packages/domain/src/quantities";
import type { RoomQuantities } from "../../../packages/geometry/src/quantities";
import { api, ApiError } from "./api";
const categories = ["Vloer", "Wand", "Plafond", "Gordijn", "Rail", "Verf", "Behang", "Plint", "Meubelbekleding"];
type Quantities = { variantId: string; revision: number; rooms: RoomQuantities[]; issues: string[] };
const decimals = (value: string) => value.replace(".", ",");
const roomLabel = (room: RoomQuantities, index: number) =>
  `Ruimte ${index + 1} · ${(room.grossFloorAreaMm2 / 1e6).toFixed(2).replace(".", ",")} m² bruto`;
export function Materials({ organizationId, projectId, variantId, canEdit }: { organizationId: string; projectId: string; variantId: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState<MaterialVersion[]>([]), [editing, setEditing] = useState<MaterialVersion | null | undefined>(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [status, setStatus] = useState<MaterialDefinition["status"]>("undecided"), [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Quantities | null>(null);
  const [calc, setCalc] = useState<Omit<QuantityRequest, "variantId"> | null>(null);
  const pending = useRef<ReturnType<typeof materialPublishSchema.parse> | null>(null);
  const endpoint = `/projects/${projectId}/materials`;
  const load = async () => {
    setBusy(true); setError("");
    try {
      const [list, measured] = await Promise.all([
        api<{ items: MaterialVersion[] }>(endpoint, organizationId),
        api<Quantities>(`/projects/${projectId}/quantities?variantId=${variantId}`, organizationId).catch(() => null),
      ]);
      setRows(list.items); setQuantities(measured);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  /** Herberekening met dezelfde bron; laat zien of een ontwerpwijziging de hoeveelheid raakt. */
  const current = (row: MaterialVersion) => {
    const source = row.definition.calculation;
    if (!source || !quantities || source.variantId !== quantities.variantId) return null;
    const room = quantities.rooms.find(r => r.id === source.roomId);
    if (!room || room.issues.length) return { missing: true as const };
    return { missing: false as const, revision: quantities.revision, ...computeQuantity(room, source.basis, source.wastePercent, source.orderStep) };
  };
  const edit = (row: MaterialVersion | null) => {
    pending.current = null; setError(""); setStatus(row?.definition.status ?? "undecided");
    const source = row?.definition.calculation;
    setCalc(source && source.variantId === variantId
      ? { roomId: source.roomId, basis: source.basis, wastePercent: source.wastePercent.replace(".", ","), orderStep: source.orderStep === null ? null : source.orderStep.replace(".", ",") }
      : null);
    setEditing(row);
  };
  const publish = async (input: unknown) => {
    setBusy(true); setError("");
    try { await api(endpoint, organizationId, input); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  // De invoervelden tonen Nederlandse decimalen; pas bij het rekenen normaliseren we.
  const decimalPoint = (value: string) => value.replace(",", ".");
  const request = calc ? { ...calc, wastePercent: decimalPoint(calc.wastePercent), orderStep: calc.orderStep === null ? null : decimalPoint(calc.orderStep) } : null;
  const preview = request && quantities?.rooms.find(r => r.id === request.roomId && !r.issues.length);
  let previewResult: ReturnType<typeof computeQuantity> | null = null;
  try {
    previewResult = preview && request ? computeQuantity(preview, request.basis, request.wastePercent, request.orderStep) : null;
  } catch { previewResult = null; }
  const filtered = rows.filter(row => [row.definition.name, row.definition.category, row.definition.room, row.definition.supplier, row.definition.sku, row.definition.collection, row.definition.colorCode].join(" ").toLocaleLowerCase("nl-NL").includes(search.trim().toLocaleLowerCase("nl-NL")));
  return <Dialog.Root open={open} onOpenChange={value => {
    if (busy || (editing !== undefined && !value)) return;
    setOpen(value);
    if (value) { setSearch(""); setEditing(undefined); void load(); }
  }}>
    <Dialog.Trigger asChild><button className="subtle">Materiaalkeuzes</button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="overlay" /><Dialog.Content className="dialog" style={{ width: "min(840px, 94vw)" }}>
      <Dialog.Title>Materiaalkeuzes</Dialog.Title>
      <Dialog.Description>Keuzes voor dit project, gedeeld door alle ontwerpvarianten. Een berekende hoeveelheid komt uit de ontwerpgeometrie; een interne keuze is geen klantakkoord.</Dialog.Description>
      {editing === undefined ? <>
        <label>Zoeken<input aria-label="Materialen zoeken" value={search} onChange={e => setSearch(e.target.value)} placeholder="Materiaal, ruimte, leverancier, artikelnummer, collectie of kleurcode" /></label>
        {canEdit && <button className="primary" disabled={busy || rows.length >= 200} onClick={() => edit(null)}>Materiaal toevoegen</button>}
        {busy && <p role="status">Materialen laden…</p>}
        {!busy && !filtered.length && <p>{search ? "Geen passende materiaalkeuzes." : "Nog geen materiaalkeuzes vastgelegd."}</p>}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {filtered.map(row => {
            const source = row.definition.calculation, now = current(row);
            const overridden = !!source && row.definition.quantity !== source.orderQuantity;
            const stale = !!source && !!now && (now.missing || now.orderQuantity !== source.orderQuantity);
            return <li key={row.entry_id} style={{ padding: "16px 0", borderBottom: "1px solid #ddd" }}>
              <h3>{row.definition.name}</h3>
              <p className="small">{[row.definition.category, row.definition.room, row.definition.supplier, row.definition.sku].filter(Boolean).join(" · ")}</p>
              {(row.definition.collection || row.definition.colorCode) && <p className="small">
                {[row.definition.collection && `Collectie: ${row.definition.collection}`, row.definition.colorCode && `Kleurcode: ${row.definition.colorCode}`].filter(Boolean).join(" · ")}
              </p>}
              <p><strong>{materialStatuses[row.definition.status]}</strong> · {row.definition.quantity === null ? "Hoeveelheid onbekend"
                : `${decimals(row.definition.quantity)} ${row.definition.unit} · ${source ? (overridden ? "handmatig aangepast" : "berekend uit het ontwerp") : "handmatig"}`}</p>
              {source && <p className="small">
                {quantityBasisLabels[source.basis]} · netto {decimals(source.netQuantity)} {source.unit} + {decimals(source.wastePercent)}% snijverlies
                {source.orderStep ? ` · bestelstap ${decimals(source.orderStep)} ${source.unit}` : ""} = {decimals(source.orderQuantity)} {source.unit}
                {" · "}ontwerpversie {source.sourceRevision}
              </p>}
              {stale && <p className="small" role="status" style={{ fontWeight: 600 }}>
                {now.missing
                  ? "Verouderd: de gekozen ruimte is niet meer meetbaar in het huidige ontwerp. Kies de bron opnieuw."
                  : `Verouderd: het ontwerp (versie ${now.revision}) geeft nu ${decimals(now.orderQuantity)} ${source!.unit} in plaats van ${decimals(source!.orderQuantity)} ${source!.unit}.`}
              </p>}
              {row.definition.quantityReason && <p className="small">Onderbouwing: {row.definition.quantityReason}</p>}
              {row.definition.status === "client_confirmed" && <p className="small">Klantakkoord handmatig vastgelegd op {row.definition.confirmationDate}: {row.definition.confirmationNote}</p>}
              {row.definition.notes && <p className="small">{row.definition.notes}</p>}
              <p className="small">Versie {row.version} · vastgelegd {new Date(row.created_at).toLocaleString("nl-NL")}</p>
              {canEdit && <button disabled={busy} onClick={() => edit(row)}>Wijzig {row.definition.name}</button>}
              {canEdit && stale && !now.missing && !overridden && <button disabled={busy} onClick={() => {
                const { calculation, ...definition } = row.definition;
                void publish({
                  entryId: row.entry_id, versionId: crypto.randomUUID(), baseVersion: row.version,
                  definition: { ...definition, quantity: null },
                  calculation: { variantId: calculation!.variantId, roomId: calculation!.roomId, basis: calculation!.basis, wastePercent: calculation!.wastePercent, orderStep: calculation!.orderStep },
                });
              }}>Herbereken {row.definition.name}</button>}
            </li>;
          })}
        </ul>
        <Dialog.Close asChild><button disabled={busy}>Sluiten</button></Dialog.Close>
      </> : <form key={editing?.id ?? "new"} onSubmit={async event => {
        event.preventDefault();
        try {
          if (!pending.current) {
            const data = new FormData(event.currentTarget), text = (key: string) => String(data.get(key) ?? "");
            const result = materialPublishSchema.safeParse({
              entryId: editing?.entry_id ?? crypto.randomUUID(), versionId: crypto.randomUUID(), baseVersion: editing?.version ?? 0,
              definition: {
                name: text("name"), category: text("category"), room: text("room"), supplier: text("supplier"), collection: text("collection"), sku: text("sku"), colorCode: text("colorCode"),
                unit: request ? quantityBasisUnits[request.basis] : text("unit"),
                quantity: text("quantity").trim() ? text("quantity").trim().replace(",", ".") : null,
                quantityReason: text("quantityReason"), status,
                confirmationDate: status === "client_confirmed" ? text("confirmationDate") || null : null,
                confirmationNote: status === "client_confirmed" ? text("confirmationNote") : "", notes: text("notes"),
              },
              calculation: request ? { ...request, variantId } : null,
            });
            if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Controleer de materiaalgegevens.");
            pending.current = result.data;
          }
          setBusy(true); setError("");
          await api(endpoint, organizationId, pending.current);
          pending.current = null; setEditing(undefined); await load();
        } catch (e) {
          if (e instanceof ApiError && e.status < 500) pending.current = null;
          setError((e as Error).message);
        } finally { setBusy(false); }
      }}>
        <h3>{editing ? "Materiaal bijwerken" : "Nieuw materiaal"}</h3>
        <fieldset disabled={busy || !!pending.current} style={{ border: 0, padding: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {([
              ["name", "Naam", 120], ["category", "Categorie", 80], ["room", "Ruimte / oppervlak", 120],
              ["supplier", "Leverancier", 120], ["collection", "Collectie", 120], ["sku", "Artikelnummer", 120], ["colorCode", "Kleurcode", 80],
            ] as const).map(([key, label, maxLength]) => <label key={key}>{label}
              <input name={key} aria-label={"Materiaal " + key} maxLength={maxLength} required={key === "name" || key === "category"}
                list={key === "category" ? "material-categories" : undefined} defaultValue={editing?.definition[key] ?? (key === "category" ? "Vloer" : "")} />
            </label>)}
            <datalist id="material-categories">{categories.map(value => <option key={value} value={value} />)}</datalist>
            {!calc && <label>Eenheid<select name="unit" aria-label="Materiaal eenheid" defaultValue={editing?.definition.unit ?? "m²"}>{["m²", "m", "stuk", "liter", "kg", "rol"].map(value => <option key={value}>{value}</option>)}</select></label>}
            <label>{calc ? "Hoeveelheid (leeg = berekende bestelhoeveelheid)" : "Hoeveelheid (leeg = onbekend)"}<input name="quantity" aria-label="Materiaal hoeveelheid" inputMode="decimal" maxLength={11} defaultValue={editing?.definition.quantity?.replace(".", ",") ?? ""} /></label>
            <label>Keuzestatus<select aria-label="Materiaal status" value={status} onChange={event => setStatus(event.target.value as MaterialDefinition["status"])}>{Object.entries(materialStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <fieldset style={{ marginTop: 16 }}>
            <legend>Hoeveelheid berekenen uit het ontwerp</legend>
            {!quantities && <p className="small">De hoeveelheden van dit ontwerp konden niet worden geladen. Vul de hoeveelheid handmatig in.</p>}
            {quantities && !quantities.rooms.length && <p className="small">{quantities.issues[0] ?? "Dit ontwerp bevat nog geen gesloten ruimte om uit te rekenen."}</p>}
            {quantities && !!quantities.rooms.length && <>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" aria-label="Bereken uit ontwerp" style={{ width: "auto", margin: 0 }} checked={!!calc} onChange={event => setCalc(event.target.checked
                  ? { roomId: quantities.rooms[0]!.id, basis: "floor_area", wastePercent: "10", orderStep: null } : null)} />
                Bereken uit de ontwerpgeometrie
              </label>
              {calc && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                <label>Ruimte<select aria-label="Bronruimte" value={calc.roomId} onChange={e => setCalc({ ...calc, roomId: e.target.value })}>
                  {quantities.rooms.map((room, index) => <option key={room.id} value={room.id} disabled={!!room.issues.length}>{roomLabel(room, index)}{room.issues.length ? " · niet meetbaar" : ""}</option>)}
                </select></label>
                <label>Bron<select aria-label="Bronmaat" value={calc.basis} onChange={e => setCalc({ ...calc, basis: e.target.value as QuantityRequest["basis"] })}>
                  {Object.entries(quantityBasisLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select></label>
                <label>Snijverlies (%)<input aria-label="Snijverlies" inputMode="decimal" maxLength={5} value={calc.wastePercent} onChange={e => setCalc({ ...calc, wastePercent: e.target.value })} /></label>
                <label>Bestelstap (leeg = geen)<input aria-label="Bestelstap" inputMode="decimal" maxLength={9} value={calc.orderStep ?? ""} onChange={e => setCalc({ ...calc, orderStep: e.target.value.trim() ? e.target.value : null })} /></label>
              </div>}
              {calc && !preview && <p className="small">Deze ruimte levert geen bruikbare bronmaat. Kies een andere ruimte.</p>}
              {previewResult && <p className="small" role="status">
                Netto {decimals(previewResult.netQuantity)} {previewResult.unit} + snijverlies {decimals(previewResult.wasteQuantity)} {previewResult.unit} = bruto {decimals(previewResult.grossQuantity)} {previewResult.unit}.
                Bestelhoeveelheid {decimals(previewResult.orderQuantity)} {previewResult.unit} uit ontwerpversie {quantities.revision}. De server berekent dit bij het bewaren opnieuw.
              </p>}
            </>}
          </fieldset>
          <label>{calc ? "Onderbouwing bij afwijkende hoeveelheid" : "Onderbouwing handmatige hoeveelheid"}<textarea name="quantityReason" aria-label="Materiaal onderbouwing" maxLength={1000} defaultValue={editing?.definition.quantityReason ?? ""} placeholder="Bijvoorbeeld: ingemeten door leverancier op 7 september." /></label>
          {status === "client_confirmed" && <>
            <p className="small">Registreer wie akkoord gaf en via welke bron. Dit is jouw registratie, geen digitaal klantakkoord in deze app.</p>
            <label>Datum klantakkoord<input type="date" name="confirmationDate" aria-label="Datum klantakkoord" required defaultValue={editing?.definition.confirmationDate ?? ""} /></label>
            <label>Bron klantakkoord<textarea name="confirmationNote" aria-label="Bron klantakkoord" maxLength={1000} required defaultValue={editing?.definition.confirmationNote ?? ""} /></label>
          </>}
          <label>Notities<textarea name="notes" aria-label="Materiaal notities" maxLength={2000} defaultValue={editing?.definition.notes ?? ""} /></label>
        </fieldset>
        {pending.current && <p className="small">Bij verbindingsproblemen kan de wijziging al zijn bewaard. Opnieuw proberen gebruikt dezelfde versie.</p>}
        <button className="primary" disabled={busy}>{pending.current ? "Bewaren opnieuw proberen" : "Materiaal bewaren"}</button>
        <button type="button" disabled={busy} onClick={() => { pending.current = null; setEditing(undefined); void load(); }}>Annuleren en terug</button>
      </form>}
      {error && <p className="error" role="alert">{error}</p>}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
