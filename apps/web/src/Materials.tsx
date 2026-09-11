import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  materialPublishSchema, materialStatuses, sampleStatuses, withDefaults,
  quantityBasisLabels, quantityBasisUnits,
  type Alternative, type MaterialDefinition, type MaterialVersion, type QuantityRequest,
} from "../../../packages/contracts/src/materials";
import { computeQuantity } from "../../../packages/domain/src/quantities";
import { estimatedAmount } from "../../../packages/domain/src/pricing";
import type { RoomQuantities } from "../../../packages/geometry/src/quantities";
import { api, ApiError } from "./api";
const categories = ["Vloer", "Wand", "Plafond", "Gordijn", "Rail", "Verf", "Behang", "Plint", "Meubelbekleding"];
type Quantities = { variantId: string; revision: number; rooms: RoomQuantities[]; issues: string[] };
const decimals = (value: string) => value.replace(".", ",");
const euro = (value: string) => Number(value).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
const emptyAlternative = (): Alternative => ({
  id: crypto.randomUUID(), name: "", supplier: "", collection: "", sku: "", colorCode: "",
  priceSource: "", priceDate: null, unitPrice: null, displayColor: null, notes: "",
});
const productOf = (d: MaterialDefinition) => ({
  supplier: d.supplier, collection: d.collection, sku: d.sku, colorCode: d.colorCode,
  priceSource: d.priceSource, priceDate: d.priceDate, unitPrice: d.unitPrice,
});
const roomLabel = (room: RoomQuantities, index: number) =>
  `Ruimte ${index + 1} · ${(room.grossFloorAreaMm2 / 1e6).toFixed(2).replace(".", ",")} m² bruto`;
export function Materials({ organizationId, projectId, variantId, canEdit }: { organizationId: string; projectId: string; variantId: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState<MaterialVersion[]>([]), [editing, setEditing] = useState<MaterialVersion | null | undefined>(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [status, setStatus] = useState<MaterialDefinition["status"]>("undecided"), [search, setSearch] = useState("");
  const [sample, setSample] = useState<MaterialDefinition["sampleStatus"]>("none");
  const [quantities, setQuantities] = useState<Quantities | null>(null);
  const [calc, setCalc] = useState<Omit<QuantityRequest, "variantId"> | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
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
  /** Neemt een bestaande versie ongewijzigd over als basis voor een nieuwe versie. */
  const carry = (row: MaterialVersion) => {
    const { calculation, ...definition } = withDefaults(row.definition);
    const overridden = !!calculation && definition.quantity !== calculation.orderQuantity;
    return {
      entryId: row.entry_id, versionId: crypto.randomUUID(), baseVersion: row.version,
      definition: { ...definition, chosenFrom: null, ...(calculation && !overridden ? { quantity: null } : {}) },
      calculation: calculation && {
        variantId: calculation.variantId, roomId: calculation.roomId, basis: calculation.basis,
        wastePercent: calculation.wastePercent, orderStep: calculation.orderStep,
      },
    };
  };
  /** Een alternatief kiezen: het eerder gekozen product schuift naar de alternatieven. */
  const promote = (row: MaterialVersion, alternative: Alternative) => {
    const value = withDefaults(row.definition), base = carry(row);
    const { id: _id, name, notes: _notes, ...product } = alternative;
    void publish({
      ...base,
      definition: {
        ...base.definition, name, ...product,
        alternatives: [
          ...value.alternatives.filter(a => a.id !== alternative.id),
          { ...emptyAlternative(), name: value.name, ...productOf(value) },
        ],
        chosenFrom: { id: alternative.id, name: alternative.name },
      },
    });
  };
  // De invoervelden tonen Nederlandse decimalen; pas bij het rekenen normaliseren we.
  const decimalPoint = (value: string) => value.replace(",", ".");
  const request = calc ? { ...calc, wastePercent: decimalPoint(calc.wastePercent), orderStep: calc.orderStep === null ? null : decimalPoint(calc.orderStep) } : null;
  const draft = editing ? withDefaults(editing.definition) : null;
  const preview = request && quantities?.rooms.find(r => r.id === request.roomId && !r.issues.length);
  let previewResult: ReturnType<typeof computeQuantity> | null = null;
  try {
    previewResult = preview && request ? computeQuantity(preview, request.basis, request.wastePercent, request.orderStep) : null;
  } catch { previewResult = null; }
  const searchText = (row: MaterialVersion) => {
    const d = withDefaults(row.definition);
    return [d.name, d.category, d.room, d.supplier, d.sku, d.collection, d.colorCode, d.priceSource,
      ...d.alternatives.flatMap(a => [a.name, a.supplier, a.sku, a.collection, a.colorCode])]
      .join(" ").toLocaleLowerCase("nl-NL");
  };
  const filtered = rows.filter(row => searchText(row).includes(search.trim().toLocaleLowerCase("nl-NL")));
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
        <label>Zoeken<input aria-label="Materialen zoeken" value={search} onChange={e => setSearch(e.target.value)} placeholder="Materiaal, ruimte, leverancier, artikelnummer, collectie, kleurcode of alternatief" /></label>
        {canEdit && <button className="primary" disabled={busy || rows.length >= 200} onClick={() => edit(null)}>Materiaal toevoegen</button>}
        {filtered.some(row => estimatedAmount(withDefaults(row.definition).quantity, withDefaults(row.definition).unitPrice)) &&
          <p className="small">Indicatiebedragen zijn hoeveelheid maal eenheidsprijs. Het zijn geen offerteregels: zonder korting, belasting of prijsbevriezing.</p>}
        {busy && <p role="status">Materialen laden…</p>}
        {!busy && !filtered.length && <p>{search ? "Geen passende materiaalkeuzes." : "Nog geen materiaalkeuzes vastgelegd."}</p>}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {filtered.map(row => {
            const d = withDefaults(row.definition), source = d.calculation, now = current(row);
            const overridden = !!source && d.quantity !== source.orderQuantity;
            const stale = !!source && !!now && (now.missing || now.orderQuantity !== source.orderQuantity);
            const amount = estimatedAmount(d.quantity, d.unitPrice);
            return <li key={row.entry_id} style={{ padding: "16px 0", borderBottom: "1px solid #ddd" }}>
              <h3>{d.name}</h3>
              <p className="small">{[d.category, d.room, d.supplier, d.sku].filter(Boolean).join(" · ")}</p>
              {(d.collection || d.colorCode) && <p className="small">
                {[d.collection && `Collectie: ${d.collection}`, d.colorCode && `Kleurcode: ${d.colorCode}`].filter(Boolean).join(" · ")}
              </p>}
              <p><strong>{materialStatuses[d.status]}</strong> · {d.quantity === null ? "Hoeveelheid onbekend"
                : `${decimals(d.quantity)} ${d.unit} · ${source ? (overridden ? "handmatig aangepast" : "berekend uit het ontwerp") : "handmatig"}`}</p>
              {d.sampleStatus !== "none" && <p className="small">{sampleStatuses[d.sampleStatus]} op {d.sampleDate}</p>}
              {d.unitPrice !== null && <p className="small">
                {euro(d.unitPrice)} per {d.unit} · bron: {d.priceSource} · prijsdatum {d.priceDate}
                {amount ? ` · indicatie ${euro(amount)} bij ${decimals(d.quantity!)} ${d.unit}` : ""}
              </p>}
              {d.chosenFrom && <p className="small">Gekozen uit het alternatief “{d.chosenFrom.name}”.</p>}
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
              {d.quantityReason && <p className="small">Onderbouwing: {d.quantityReason}</p>}
              {d.status === "client_confirmed" && <p className="small">Klantakkoord handmatig vastgelegd op {d.confirmationDate}: {d.confirmationNote}</p>}
              {d.notes && <p className="small">{d.notes}</p>}
              {!!d.alternatives.length && <div style={{ margin: "8px 0 8px 16px", borderLeft: "3px solid #ddd", paddingLeft: 12 }}>
                <p className="small"><strong>Alternatieven</strong> · nog niet gekozen</p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {d.alternatives.map(alternative => <li key={alternative.id} style={{ marginBottom: 8 }}>
                    <p className="small">{[alternative.name, alternative.supplier, alternative.sku, alternative.collection, alternative.colorCode].filter(Boolean).join(" · ")}
                      {alternative.unitPrice !== null ? ` · ${euro(alternative.unitPrice)} per ${d.unit} (${alternative.priceSource}, ${alternative.priceDate})` : ""}</p>
                    {alternative.notes && <p className="small">{alternative.notes}</p>}
                    {canEdit && <button disabled={busy} onClick={() => promote(row, alternative)}>Kies {alternative.name}</button>}
                  </li>)}
                </ul>
              </div>}
              <p className="small">Versie {row.version} · vastgelegd {new Date(row.created_at).toLocaleString("nl-NL")}</p>
              {canEdit && <button disabled={busy} onClick={() => edit(row)}>Wijzig {d.name}</button>}
              {canEdit && stale && !now.missing && !overridden && <button disabled={busy} onClick={() => void publish(carry(row))}>Herbereken {d.name}</button>}
            </li>;
          })}
        </ul>
        {error && <p className="error" role="alert">{error}</p>}
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
                priceSource: text("priceSource"), priceDate: text("priceDate") || null,
                /* Leeg laten is een geldige uitkomst: dan blijft het vlak in 3D neutraal. */
                displayColor: text("showColor") === "on" ? text("displayColor") : null,
                unitPrice: text("unitPrice").trim() ? text("unitPrice").trim().replace(",", ".") : null,
                sampleStatus: sample, sampleDate: sample === "none" ? null : text("sampleDate") || null,
                alternatives: alternatives.map(a => ({ ...a, unitPrice: a.unitPrice === null ? null : a.unitPrice.trim().replace(",", ".") || null })),
                chosenFrom: null,
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
                list={key === "category" ? "material-categories" : undefined} defaultValue={draft ? draft[key] : key === "category" ? "Vloer" : ""} />
            </label>)}
            <datalist id="material-categories">{categories.map(value => <option key={value} value={value} />)}</datalist>
            {/*
              Twee velden en niet een. De kleurcode is van de leverancier en
              blijft tekst; de weergavekleur is wat jij op het monster ziet en is
              alleen voor het beeld. Een RAL-code omrekenen naar een schermkleur
              kan niet betrouwbaar, en een gegokte tint in een klantbeeld is
              erger dan een neutraal vlak. Vandaar ook het vinkje: geen kleur is
              een geldige uitkomst, en geen kleurkiezer die stilzwijgend zwart
              invult.
            */}
            <label>Weergavekleur voor 3D
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="showColor" aria-label="Materiaal weergavekleur gebruiken" defaultChecked={!!draft?.displayColor} />
                <input type="color" name="displayColor" aria-label="Materiaal weergavekleur" defaultValue={draft?.displayColor ?? "#d6c7af"} />
              </span>
            </label>
            {!calc && <label>Eenheid<select name="unit" aria-label="Materiaal eenheid" defaultValue={draft?.unit ?? "m²"}>{["m²", "m", "stuk", "liter", "kg", "rol"].map(value => <option key={value}>{value}</option>)}</select></label>}
            <label>{calc ? "Hoeveelheid (leeg = berekende bestelhoeveelheid)" : "Hoeveelheid (leeg = onbekend)"}<input name="quantity" aria-label="Materiaal hoeveelheid" inputMode="decimal" maxLength={11} defaultValue={draft?.quantity?.replace(".", ",") ?? ""} /></label>
            <label>Keuzestatus<select aria-label="Materiaal status" value={status} onChange={event => setStatus(event.target.value as MaterialDefinition["status"])}>{Object.entries(materialStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <fieldset style={{ marginTop: 16 }}>
            <legend>Prijsbron en monster</legend>
            <p className="small">Een prijs zonder bron en datum wordt niet bewaard. Het bedrag hieronder is een indicatie, geen offerteregel.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <label>Prijsbron<input name="priceSource" aria-label="Prijsbron" maxLength={160} defaultValue={draft?.priceSource ?? ""} placeholder="Offerte, prijslijst of webshop" /></label>
              <label>Prijsdatum<input type="date" name="priceDate" aria-label="Prijsdatum" defaultValue={draft?.priceDate ?? ""} /></label>
              <label>Eenheidsprijs (EUR)<input name="unitPrice" aria-label="Eenheidsprijs" inputMode="decimal" maxLength={10} defaultValue={draft?.unitPrice?.replace(".", ",") ?? ""} /></label>
              <label>Monsterstatus<select aria-label="Monsterstatus" value={sample} onChange={event => setSample(event.target.value as MaterialDefinition["sampleStatus"])}>
                {Object.entries(sampleStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              {sample !== "none" && <label>Monsterdatum<input type="date" name="sampleDate" aria-label="Monsterdatum" required defaultValue={draft?.sampleDate ?? ""} /></label>}
            </div>
          </fieldset>
          <fieldset style={{ marginTop: 16 }}>
            <legend>Alternatieven</legend>
            <p className="small">Voorstellen die nog niet gekozen zijn. Kiezen doe je in de lijst; dat legt vast uit welk alternatief de keuze komt.</p>
            {!alternatives.length && <p className="small">Nog geen alternatieven vastgelegd.</p>}
            {alternatives.map((alternative, index) => <div key={alternative.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 12, marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                {([["name", "Naam", 120], ["supplier", "Leverancier", 120], ["collection", "Collectie", 120], ["sku", "Artikelnummer", 120], ["colorCode", "Kleurcode", 80], ["priceSource", "Prijsbron", 160]] as const)
                  .map(([key, label, maxLength]) => <label key={key}>{label}
                    <input aria-label={`Alternatief ${index + 1} ${label.toLocaleLowerCase("nl-NL")}`} maxLength={maxLength} value={alternative[key]}
                      onChange={event => setAlternatives(alternatives.map((a, i) => i === index ? { ...a, [key]: event.target.value } : a))} />
                  </label>)}
                <label>Prijsdatum<input type="date" aria-label={`Alternatief ${index + 1} prijsdatum`} value={alternative.priceDate ?? ""}
                  onChange={event => setAlternatives(alternatives.map((a, i) => i === index ? { ...a, priceDate: event.target.value || null } : a))} /></label>
                <label>Eenheidsprijs (EUR)<input aria-label={`Alternatief ${index + 1} eenheidsprijs`} inputMode="decimal" maxLength={10} value={alternative.unitPrice ?? ""}
                  onChange={event => setAlternatives(alternatives.map((a, i) => i === index ? { ...a, unitPrice: event.target.value.trim() || null } : a))} /></label>
              </div>
              <label>Notitie<textarea aria-label={`Alternatief ${index + 1} notitie`} maxLength={1000} value={alternative.notes}
                onChange={event => setAlternatives(alternatives.map((a, i) => i === index ? { ...a, notes: event.target.value } : a))} /></label>
              <button type="button" onClick={() => setAlternatives(alternatives.filter((_, i) => i !== index))}>Verwijder alternatief {index + 1}</button>
            </div>)}
            <button type="button" disabled={alternatives.length >= 10} onClick={() => setAlternatives([...alternatives, emptyAlternative()])}>Alternatief toevoegen</button>
          </fieldset>
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
          <label>{calc ? "Onderbouwing bij afwijkende hoeveelheid" : "Onderbouwing handmatige hoeveelheid"}<textarea name="quantityReason" aria-label="Materiaal onderbouwing" maxLength={1000} defaultValue={draft?.quantityReason ?? ""} placeholder="Bijvoorbeeld: ingemeten door leverancier op 7 september." /></label>
          {status === "client_confirmed" && <>
            <p className="small">Registreer wie akkoord gaf en via welke bron. Dit is jouw registratie, geen digitaal klantakkoord in deze app.</p>
            <label>Datum klantakkoord<input type="date" name="confirmationDate" aria-label="Datum klantakkoord" required defaultValue={draft?.confirmationDate ?? ""} /></label>
            <label>Bron klantakkoord<textarea name="confirmationNote" aria-label="Bron klantakkoord" maxLength={1000} required defaultValue={draft?.confirmationNote ?? ""} /></label>
          </>}
          <label>Notities<textarea name="notes" aria-label="Materiaal notities" maxLength={2000} defaultValue={draft?.notes ?? ""} /></label>
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        {pending.current && <p className="small">Bij verbindingsproblemen kan de wijziging al zijn bewaard. Opnieuw proberen gebruikt dezelfde versie.</p>}
        <button className="primary" disabled={busy}>{pending.current ? "Bewaren opnieuw proberen" : "Materiaal bewaren"}</button>
        <button type="button" disabled={busy} onClick={() => { pending.current = null; setEditing(undefined); void load(); }}>Annuleren en terug</button>
      </form>}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
