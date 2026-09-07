import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { materialPublishSchema, materialStatuses, type MaterialDefinition, type MaterialVersion } from "../../../packages/contracts/src/materials";
import { api, ApiError } from "./api";
const categories = ["Vloer", "Wand", "Plafond", "Gordijn", "Rail", "Verf", "Behang", "Plint", "Meubelbekleding"];
export function Materials({ organizationId, projectId, canEdit }: { organizationId: string; projectId: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState<MaterialVersion[]>([]), [editing, setEditing] = useState<MaterialVersion | null | undefined>(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [status, setStatus] = useState<MaterialDefinition["status"]>("undecided"), [search, setSearch] = useState("");
  const pending = useRef<ReturnType<typeof materialPublishSchema.parse> | null>(null);
  const endpoint = `/projects/${projectId}/materials`;
  const load = async () => {
    setBusy(true); setError("");
    try { setRows((await api<{ items: MaterialVersion[] }>(endpoint, organizationId)).items); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const edit = (row: MaterialVersion | null) => { pending.current = null; setError(""); setStatus(row?.definition.status ?? "undecided"); setEditing(row); };
  const filtered = rows.filter(row => [row.definition.name, row.definition.category, row.definition.room, row.definition.supplier, row.definition.sku].join(" ").toLocaleLowerCase("nl-NL").includes(search.trim().toLocaleLowerCase("nl-NL")));
  return <Dialog.Root open={open} onOpenChange={value => {
    if (busy || (editing !== undefined && !value)) return;
    setOpen(value);
    if (value) { setSearch(""); setEditing(undefined); void load(); }
  }}>
    <Dialog.Trigger asChild><button className="subtle">Materiaalkeuzes</button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="overlay" /><Dialog.Content className="dialog" style={{ width: "min(840px, 94vw)" }}>
      <Dialog.Title>Materiaalkeuzes</Dialog.Title>
      <Dialog.Description>Keuzes voor dit project, gedeeld door alle ontwerpvarianten. Handmatige hoeveelheden; een interne keuze is geen klantakkoord.</Dialog.Description>
      {editing === undefined ? <>
        <label>Zoeken<input aria-label="Materialen zoeken" value={search} onChange={e => setSearch(e.target.value)} placeholder="Materiaal, ruimte, leverancier of artikelnummer" /></label>
        {canEdit && <button className="primary" disabled={busy || rows.length >= 200} onClick={() => edit(null)}>Materiaal toevoegen</button>}
        {busy && <p role="status">Materialen laden…</p>}
        {!busy && !filtered.length && <p>{search ? "Geen passende materiaalkeuzes." : "Nog geen materiaalkeuzes vastgelegd."}</p>}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {filtered.map(row => <li key={row.entry_id} style={{ padding: "16px 0", borderBottom: "1px solid #ddd" }}>
            <h3>{row.definition.name}</h3>
            <p className="small">{[row.definition.category, row.definition.room, row.definition.supplier, row.definition.sku].filter(Boolean).join(" · ")}</p>
            <p><strong>{materialStatuses[row.definition.status]}</strong> · {row.definition.quantity === null ? "Hoeveelheid onbekend" : `${row.definition.quantity.replace(".", ",")} ${row.definition.unit} · handmatig`}</p>
            {row.definition.quantityReason && <p className="small">Onderbouwing: {row.definition.quantityReason}</p>}
            {row.definition.status === "client_confirmed" && <p className="small">Klantakkoord handmatig vastgelegd op {row.definition.confirmationDate}: {row.definition.confirmationNote}</p>}
            {row.definition.notes && <p className="small">{row.definition.notes}</p>}
            <p className="small">Versie {row.version} · vastgelegd {new Date(row.created_at).toLocaleString("nl-NL")}</p>
            {canEdit && <button disabled={busy} onClick={() => edit(row)}>Wijzig {row.definition.name}</button>}
          </li>)}
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
                name: text("name"), category: text("category"), room: text("room"), supplier: text("supplier"), collection: text("collection"), sku: text("sku"), colorCode: text("colorCode"), unit: text("unit"),
                quantity: text("quantity").trim() ? text("quantity").trim().replace(",", ".") : null,
                quantityReason: text("quantityReason"), status,
                confirmationDate: status === "client_confirmed" ? text("confirmationDate") || null : null,
                confirmationNote: status === "client_confirmed" ? text("confirmationNote") : "", notes: text("notes"),
              },
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
            <label>Eenheid<select name="unit" aria-label="Materiaal eenheid" defaultValue={editing?.definition.unit ?? "m²"}>{["m²", "m", "stuk", "liter", "kg", "rol"].map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Hoeveelheid (leeg = onbekend)<input name="quantity" aria-label="Materiaal hoeveelheid" inputMode="decimal" maxLength={11} defaultValue={editing?.definition.quantity?.replace(".", ",") ?? ""} /></label>
            <label>Keuzestatus<select aria-label="Materiaal status" value={status} onChange={event => setStatus(event.target.value as MaterialDefinition["status"])}>{Object.entries(materialStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <label>Onderbouwing handmatige hoeveelheid<textarea name="quantityReason" aria-label="Materiaal onderbouwing" maxLength={1000} defaultValue={editing?.definition.quantityReason ?? ""} placeholder="Bijvoorbeeld: ingemeten door leverancier op 7 september. Wordt niet automatisch herberekend." /></label>
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
