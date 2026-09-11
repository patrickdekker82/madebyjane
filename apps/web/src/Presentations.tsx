import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Presentation as PresentationIcon,
  X,
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
  Download,
  Share2,
  Upload,
  Eye,
  Plus,
} from "lucide-react";
import {
  moodboardImageLimit,
  planScaleSchema,
  presentationTemplates,
  type Presentation,
  type PresentationBlock,
  type PresentationTemplate,
} from "../../../packages/contracts/src/presentations";
import { api, ApiError } from "./api";
import { StoredImage, uploadImage, type StoredImageInfo } from "./Images";

type Summary = {
  id: string;
  title: string;
  template: PresentationTemplate;
  published_version: number | null;
  latest_version: number | null;
  updated_at: string;
};
type Row = {
  id: string;
  definition: Presentation;
  published_version: number | null;
};
type Version = {
  version: number;
  content_hash: string;
  template_version: string;
  created_at: string;
};
type Share = {
  id: string;
  version: number;
  expires_at: string;
  revoked_at: string | null;
};

const today = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

/**
 * Presentaties samenstellen, publiceren en delen.
 *
 * Het concept is vrij te bewerken; publiceren maakt een versie die daarna nooit
 * meer verandert. Een deellink wijst altijd naar één zo'n versie, dus wat de
 * klant ziet blijft staan ook als het ontwerp verder gaat. Verandert het
 * ontwerp na publiceren, dan meldt dit paneel dat — het publiceert niet vanzelf.
 */
export function Presentations({
  organizationId,
  organizationName,
  projectId,
  variantId,
  disabled,
}: {
  organizationId: string;
  organizationName: string;
  projectId: string;
  variantId: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<Summary[]>([]),
    [row, setRow] = useState<Row | null>(null),
    [versions, setVersions] = useState<Version[]>([]),
    [shares, setShares] = useState<Share[]>([]),
    [changed, setChanged] = useState<{ was: number; now: number }[]>([]),
    [link, setLink] = useState(""),
    [library, setLibrary] = useState<StoredImageInfo[]>([]),
    [preview, setPreview] = useState<{ version: number; html: string } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);

  /** De beeldbank, voor de moodboardblokken. */
  const loadLibrary = async () => {
    try {
      setLibrary(
        (await api<{ items: StoredImageInfo[] }>("/images", organizationId))
          .items,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const load = async () => {
    setError("");
    try {
      setRows(
        (
          await api<{ items: Summary[] }>(
            `/projects/${projectId}/presentations`,
            organizationId,
          )
        ).items,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const openRow = async (id: string) => {
    setError("");
    setLink("");
    try {
      const detail = await api<Row>(`/presentations/${id}`, organizationId);
      latest.current = detail.definition;
      setRow(detail);
      setVersions(
        (
          await api<{ items: Version[] }>(
            `/presentations/${id}/versions`,
            organizationId,
          )
        ).items,
      );
      setChanged(
        (
          await api<{ changed: { was: number; now: number }[] }>(
            `/presentations/${id}/outdated`,
            organizationId,
          )
        ).changed,
      );
      setShares([]);
      await loadLibrary();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  /**
   * Het concept bijwerken.
   *
   * Elke wijziging gaat door `apply`, dat van de laatst bekende definitie
   * uitgaat en niet van wat er bij het renderen in de closure zat. Zonder dat
   * verdwijnt een wijziging zodra er twee in dezelfde tel gebeuren: het verlaten
   * van een tekstveld en het klikken op een pijltje horen bij één handeling van
   * de gebruiker, en de tweede overschreef dan de eerste.
   *
   * De verzoeken lopen achter elkaar aan, zodat de server ze in dezelfde
   * volgorde ziet als de gebruiker ze heeft gedaan.
   */
  const latest = useRef<Presentation | null>(null);
  const queue = useRef(Promise.resolve());
  const apply = (change: (current: Presentation) => Presentation) => {
    const current = latest.current;
    if (!row || !current) return;
    const definition = change(current);
    latest.current = definition;
    setRow({ ...row, definition });
    setBusy(true);
    queue.current = queue.current
      .then(() =>
        api(`/presentations/${row.id}`, organizationId, definition, "PUT"),
      )
      .then(
        () => setError(""),
        (e: Error) => setError(e.message),
      )
      .finally(() => setBusy(false));
  };
  /** Verplaatsen op blok-ID, niet op plaats: de plaats kan intussen verschoven zijn. */
  const move = (blockId: string, by: number) =>
    apply((current) => {
      const blocks = [...current.blocks];
      const index = blocks.findIndex((b) => b.id === blockId);
      const target = index + by;
      if (index < 0 || target < 0 || target >= blocks.length) return current;
      [blocks[index], blocks[target]] = [blocks[target]!, blocks[index]!];
      return { ...current, blocks };
    });
  const update = (blockId: string, patch: Partial<PresentationBlock>) =>
    apply((current) => ({
      ...current,
      blocks: current.blocks.map((b) =>
        b.id === blockId ? ({ ...b, ...patch } as PresentationBlock) : b,
      ),
    }));

  return (
    <>
      <button
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          void load();
          // Staat er nog een presentatie open, dan wordt die opnieuw opgehaald.
          // Anders zou het paneel melden dat er geen ontwerpwijzigingen zijn
          // terwijl er sinds het sluiten van alles is gebeurd.
          if (row) void openRow(row.id);
        }}
      >
        <PresentationIcon size={16} />
        Presentaties
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="dialog wide">
            <Dialog.Title>Presentaties</Dialog.Title>
            <Dialog.Description>
              Stel een presentatie samen uit het ontwerp. Publiceren legt een
              versie vast die niet meer verandert; een deellink wijst altijd
              naar die ene versie.
            </Dialog.Description>
            <Dialog.Close className="dialog-close" aria-label="Sluiten">
              <X size={18} />
            </Dialog.Close>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {!row ? (
              <>
                <div className="presentation-new">
                  {(
                    Object.keys(presentationTemplates) as PresentationTemplate[]
                  ).map((template) => (
                    <button
                      key={template}
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const created = await api<Row>(
                            `/projects/${projectId}/presentations`,
                            organizationId,
                            {
                              id: crypto.randomUUID(),
                              template,
                              title: presentationTemplates[template],
                              customer: "",
                              date: today(),
                              variantId,
                              companyName: organizationName,
                            },
                          );
                          await load();
                          await openRow(created.id);
                        } catch (e) {
                          setError(
                            e instanceof ApiError
                              ? e.message
                              : (e as Error).message,
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {presentationTemplates[template]}
                    </button>
                  ))}
                </div>
                <ul className="presentation-list">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => void openRow(r.id)}>
                        <strong>{r.title}</strong>
                        <small>
                          {presentationTemplates[r.template]} ·{" "}
                          {r.published_version
                            ? `versie ${r.published_version} gepubliceerd`
                            : "nog niet gepubliceerd"}
                        </small>
                      </button>
                    </li>
                  ))}
                  {!rows.length && (
                    <li className="empty">Nog geen presentaties.</li>
                  )}
                </ul>
              </>
            ) : (
              <>
                <button className="subtle" onClick={() => setRow(null)}>
                  Terug naar de lijst
                </button>
                {changed.length > 0 && (
                  <p className="notice" role="status">
                    Er zijn nieuwe ontwerpwijzigingen beschikbaar (revisie{" "}
                    {changed[0]!.was} → {changed[0]!.now}). De gepubliceerde
                    versie blijft zoals hij is; publiceer opnieuw om ze mee te
                    nemen.
                  </p>
                )}
                <div className="pair">
                  <label>
                    Titel
                    <input
                      aria-label="Presentatietitel"
                      defaultValue={row.definition.title}
                      onBlur={(e) =>
                        apply((current) => ({
                          ...current,
                          title: e.target.value.trim() || current.title,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Klant
                    <input
                      aria-label="Presentatieklant"
                      defaultValue={row.definition.customer}
                      onBlur={(e) =>
                        apply((current) => ({
                          ...current,
                          customer: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                {/* Deze knoppen blijven bruikbaar terwijl er wordt opgeslagen.
                    Zetten we ze uit zodra er een verzoek loopt, dan slikt de app
                    de klik op een pijltje vlak na het typen in: het verlaten van
                    het tekstveld schakelt de knop dan uit voordat de klik
                    aankomt. De wijzigingen gaan toch achter elkaar naar de
                    server. */}
                <ol className="block-list">
                  {row.definition.blocks.map((block, index) => (
                    <li key={block.id}>
                      <div className="block-head">
                        <strong>{blockName(block)}</strong>
                        <button
                          aria-label={`Blok ${index + 1} omhoog`}
                          disabled={index === 0}
                          onClick={() => move(block.id, -1)}
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          aria-label={`Blok ${index + 1} omlaag`}
                          disabled={index === row.definition.blocks.length - 1}
                          onClick={() => move(block.id, 1)}
                        >
                          <ChevronDown size={13} />
                        </button>
                        <button
                          aria-label={`Blok ${index + 1} dupliceren`}
                          onClick={() =>
                            apply((current) => {
                              const at = current.blocks.findIndex(
                                (b) => b.id === block.id,
                              );
                              if (at < 0) return current;
                              return {
                                ...current,
                                blocks: [
                                  ...current.blocks.slice(0, at + 1),
                                  {
                                    ...current.blocks[at]!,
                                    id: crypto.randomUUID(),
                                  },
                                  ...current.blocks.slice(at + 1),
                                ],
                              };
                            })
                          }
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          aria-label={`Blok ${index + 1} verwijderen`}
                          disabled={row.definition.blocks.length === 1}
                          onClick={() =>
                            apply((current) => ({
                              ...current,
                              blocks: current.blocks.filter(
                                (b) => b.id !== block.id,
                              ),
                            }))
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {"heading" in block && (
                        <input
                          aria-label={`Kop blok ${index + 1}`}
                          defaultValue={block.heading}
                          onBlur={(e) =>
                            update(block.id, {
                              heading: e.target.value,
                            } as Partial<PresentationBlock>)
                          }
                        />
                      )}
                      {"body" in block && (
                        <textarea
                          aria-label={`Tekst blok ${index + 1}`}
                          rows={3}
                          defaultValue={block.body}
                          onBlur={(e) =>
                            update(block.id, {
                              body: e.target.value,
                            } as Partial<PresentationBlock>)
                          }
                        />
                      )}
                      {block.type === "plan" && (
                        <div className="pair">
                          <label>
                            Schaal
                            <select
                              aria-label={`Schaal blok ${index + 1}`}
                              value={block.scale}
                              onChange={(e) =>
                                update(block.id, {
                                  scale: planScaleSchema.parse(
                                    Number(e.target.value),
                                  ),
                                } as Partial<PresentationBlock>)
                              }
                            >
                              {[20, 50, 100].map((s) => (
                                <option key={s} value={s}>
                                  1:{s}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Papier
                            <select
                              aria-label={`Papier blok ${index + 1}`}
                              value={`${block.paper} ${block.orientation}`}
                              onChange={(e) => {
                                const [paper, orientation] =
                                  e.target.value.split(" ");
                                update(block.id, {
                                  paper,
                                  orientation,
                                } as Partial<PresentationBlock>);
                              }}
                            >
                              {[
                                "A4 landscape",
                                "A4 portrait",
                                "A3 landscape",
                                "A3 portrait",
                              ].map((v) => (
                                <option key={v} value={v}>
                                  {v
                                    .replace("landscape", "liggend")
                                    .replace("portrait", "staand")}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}
                      {block.type === "moodboard" && (
                        <MoodboardEditor
                          index={index}
                          organizationId={organizationId}
                          images={block.images}
                          library={library}
                          onUploaded={loadLibrary}
                          onChange={(images) =>
                            update(block.id, {
                              images,
                            } as Partial<PresentationBlock>)
                          }
                        />
                      )}
                    </li>
                  ))}
                </ol>
                <div className="dialog-actions">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api(
                          `/presentations/${row.id}/versions`,
                          organizationId,
                          { requestId: crypto.randomUUID() },
                        );
                        await openRow(row.id);
                        await load();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Upload size={15} />
                    Publiceren
                  </button>
                </div>
                <ul className="presentation-list">
                  {versions.map((v) => (
                    <li key={v.version}>
                      <span>
                        <strong>Versie {v.version}</strong>
                        <small>
                          {new Date(v.created_at).toLocaleString("nl-NL")} ·{" "}
                          {v.content_hash.slice(0, 12)}
                        </small>
                      </span>
                      <button
                        onClick={async () => {
                          setError("");
                          const r = await fetch(
                            `/api/v1/presentations/${row.id}/versions/${v.version}/view`,
                            {
                              headers: { "x-organization-id": organizationId },
                            },
                          );
                          if (!r.ok) {
                            setError((await r.json()).message);
                            return;
                          }
                          setPreview({
                            version: v.version,
                            html: await r.text(),
                          });
                        }}
                      >
                        <Eye size={13} />
                        Bekijken
                      </button>
                      <button
                        onClick={async () => {
                          const r = await fetch(
                            `/api/v1/presentations/${row.id}/versions/${v.version}/pdf`,
                            {
                              headers: { "x-organization-id": organizationId },
                            },
                          );
                          if (!r.ok) {
                            setError((await r.json()).message);
                            return;
                          }
                          const url = URL.createObjectURL(await r.blob()),
                            a = document.createElement("a");
                          a.href = url;
                          a.download = `presentatie-v${v.version}.pdf`;
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}
                      >
                        <Download size={13} />
                        PDF
                      </button>
                      <button
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            /*
                             * De PowerPoint wordt door de exportwerker gemaakt,
                             * want het planblad moet er eerst als afbeelding uit.
                             * Zolang hij niet klaar is, is er niets te
                             * downloaden; er verschijnt dus geen knop die een
                             * half bestand oplevert.
                             */
                            let job = await api<{
                              id: string;
                              status: string;
                              error: string | null;
                            }>(
                              `/presentations/${row.id}/versions/${v.version}/exports`,
                              organizationId,
                              { id: crypto.randomUUID(), format: "pptx" },
                            );
                            for (
                              let i = 0;
                              i < 40 && job.status !== "done";
                              i++
                            ) {
                              if (job.status === "failed")
                                throw new Error(
                                  job.error ?? "De export is niet gelukt.",
                                );
                              await new Promise((r) => setTimeout(r, 750));
                              job = await api(
                                `/export-jobs/${job.id}`,
                                organizationId,
                              );
                            }
                            if (job.status !== "done")
                              throw new Error(
                                "De export duurt langer dan verwacht. Probeer het zo opnieuw.",
                              );
                            const r = await fetch(
                              `/api/v1/presentations/${row.id}/versions/${v.version}/pptx`,
                              {
                                headers: {
                                  "x-organization-id": organizationId,
                                },
                              },
                            );
                            if (!r.ok)
                              throw new Error((await r.json()).message);
                            const url = URL.createObjectURL(await r.blob()),
                              a = document.createElement("a");
                            a.href = url;
                            a.download = `presentatie-v${v.version}.pptx`;
                            a.click();
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Download size={13} />
                        PowerPoint
                      </button>
                      <button
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const s = await api<{ token: string; id: string }>(
                              `/presentations/${row.id}/versions/${v.version}/shares`,
                              organizationId,
                              { id: crypto.randomUUID(), days: 30 },
                            );
                            // De link opent de presentatie in de browser; de
                            // maatvaste PDF staat als knop in die pagina.
                            setLink(
                              `${location.origin}/api/v1/presentation-shares/${organizationId}/${s.token}/view`,
                            );
                            setShares(
                              (
                                await api<{ items: Share[] }>(
                                  `/presentations/${row.id}/versions/${v.version}/shares`,
                                  organizationId,
                                )
                              ).items,
                            );
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Share2 size={13} />
                        Deellink
                      </button>
                    </li>
                  ))}
                  {!versions.length && (
                    <li className="empty">Nog niets gepubliceerd.</li>
                  )}
                </ul>
                {link && (
                  <label>
                    Deellink voor deze presentatie
                    <input
                      aria-label="Deellink presentatie"
                      readOnly
                      value={link}
                    />
                  </label>
                )}
                {shares
                  .filter((s) => !s.revoked_at)
                  .map((s) => (
                    <button
                      key={s.id}
                      className="subtle"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api(
                            `/presentation-shares/${s.id}/revoke`,
                            organizationId,
                            {},
                          );
                          setShares(
                            shares.map((x) =>
                              x.id === s.id
                                ? { ...x, revoked_at: new Date().toISOString() }
                                : x,
                            ),
                          );
                          setLink("");
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Link intrekken
                    </button>
                  ))}
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {/*
       * De presentatie zoals de klant hem in de browser ziet. De pagina komt
       * uit dezelfde bron als de PDF en draait in een afgeschermd venster
       * zonder scripts; er staat bij dat alleen de PDF maatvast is.
       */}
      <Dialog.Root open={!!preview} onOpenChange={() => setPreview(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="dialog presentation-viewer">
            <Dialog.Title>
              Presentatie bekijken
              {preview ? ` · versie ${preview.version}` : ""}
            </Dialog.Title>
            <Dialog.Description>
              Dit is de weergave achter een deellink. De tekening is hier op het
              scherm geschaald; alleen de PDF is maatvast.
            </Dialog.Description>
            <Dialog.Close className="dialog-close" aria-label="Sluiten">
              <X size={18} />
            </Dialog.Close>
            {preview && (
              <iframe
                className="viewer-frame"
                title="Presentatie"
                sandbox=""
                srcDoc={preview.html}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

/**
 * Een moodboard vullen.
 *
 * De beelden komen uit de beeldbank van de werkruimte, dezelfde opslag als de
 * onderleggers. Je kunt er iets nieuws in zetten of iets kiezen dat er al
 * staat; het onderschrift hoort bij het blok, niet bij de afbeelding, zodat
 * hetzelfde beeld in twee presentaties anders benoemd kan worden.
 */
function MoodboardEditor({
  index,
  organizationId,
  images,
  library,
  onUploaded,
  onChange,
}: {
  index: number;
  organizationId: string;
  images: { assetId: string; caption: string }[];
  library: StoredImageInfo[];
  onUploaded: () => Promise<void>;
  onChange: (images: { assetId: string; caption: string }[]) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const full = images.length >= moodboardImageLimit;
  const unused = library.filter(
    (item) => !images.some((chosen) => chosen.assetId === item.id),
  );
  const add = (assetId: string) =>
    onChange([...images, { assetId, caption: "" }]);
  return (
    <div className="moodboard-editor">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul>
        {images.map((image, position) => (
          <li key={image.assetId + position}>
            <StoredImage
              assetId={image.assetId}
              organizationId={organizationId}
              alt={image.caption || "Moodboardafbeelding"}
            />
            <input
              aria-label={`Onderschrift afbeelding ${position + 1} blok ${index + 1}`}
              placeholder="Onderschrift"
              defaultValue={image.caption}
              onBlur={(e) =>
                onChange(
                  images.map((other, at) =>
                    at === position
                      ? { ...other, caption: e.target.value.trim() }
                      : other,
                  ),
                )
              }
            />
            <div className="moodboard-buttons">
              <button
                aria-label={`Afbeelding ${position + 1} naar voren blok ${index + 1}`}
                disabled={position === 0}
                onClick={() => {
                  const next = [...images];
                  [next[position - 1], next[position]] = [
                    next[position]!,
                    next[position - 1]!,
                  ];
                  onChange(next);
                }}
              >
                <ChevronUp size={13} />
              </button>
              <button
                aria-label={`Afbeelding ${position + 1} naar achteren blok ${index + 1}`}
                disabled={position === images.length - 1}
                onClick={() => {
                  const next = [...images];
                  [next[position], next[position + 1]] = [
                    next[position + 1]!,
                    next[position]!,
                  ];
                  onChange(next);
                }}
              >
                <ChevronDown size={13} />
              </button>
              <button
                aria-label={`Afbeelding ${position + 1} verwijderen blok ${index + 1}`}
                onClick={() =>
                  onChange(images.filter((_, at) => at !== position))
                }
              >
                <Trash2 size={13} />
              </button>
            </div>
          </li>
        ))}
        {!images.length && (
          <li className="empty">
            Nog geen beelden. Een leeg moodboard blijft in de presentatie ook
            leeg.
          </li>
        )}
      </ul>
      {full ? (
        <p className="small">
          Er passen {moodboardImageLimit} beelden op een moodboard. Verwijder er
          eerst een.
        </p>
      ) : (
        <div className="moodboard-add">
          <button
            disabled={busy}
            onClick={() => file.current?.click()}
            aria-label={`Afbeelding uploaden blok ${index + 1}`}
          >
            <Upload size={13} />
            {busy ? "Bezig…" : "Uploaden"}
          </button>
          <input
            ref={file}
            type="file"
            hidden
            aria-label={`Moodboardafbeelding kiezen blok ${index + 1}`}
            accept="image/png,image/jpeg"
            onChange={async (event) => {
              const chosen = event.target.files?.[0];
              if (!chosen) return;
              setBusy(true);
              setError("");
              try {
                const uploaded = await uploadImage(chosen, organizationId);
                add(uploaded.id);
                await onUploaded();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
                if (file.current) file.current.value = "";
              }
            }}
          />
          <button
            onClick={() => setPicking(!picking)}
            aria-label={`Uit beeldbank kiezen blok ${index + 1}`}
          >
            <Plus size={13} />
            Uit beeldbank
          </button>
        </div>
      )}
      {picking && !full && (
        <div className="image-picker">
          {unused.map((item) => (
            <div key={item.id} className="image-choice">
              <button
                title={`${item.widthPx} × ${item.heightPx} px`}
                onClick={() => {
                  add(item.id);
                  setPicking(false);
                }}
              >
                <StoredImage
                  assetId={item.id}
                  organizationId={organizationId}
                  alt={`Afbeelding van ${new Date(item.createdAt).toLocaleDateString("nl-NL")}`}
                />
              </button>
              {/*
               * Zonder dit loopt een werkruimte vol zonder uitweg: 50 beelden
               * of 200 MiB, en geen manier om er een weg te halen. De server
               * weigert een beeld dat nog ergens in gebruik is en zegt waar;
               * die melding komt hier terecht.
               */}
              <button
                className="subtle danger"
                disabled={busy}
                aria-label={`Afbeelding uit de beeldbank verwijderen (${item.widthPx} × ${item.heightPx} px)`}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void (async () => {
                    try {
                      await api(
                        "/underlay-assets/" + item.id,
                        organizationId,
                        undefined,
                        "DELETE",
                      );
                      await onUploaded();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {!unused.length && (
            <p className="small">
              De beeldbank is leeg of alles staat er al op. Upload een PNG of
              JPEG van maximaal 16 MiB.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const names: Record<PresentationBlock["type"], string> = {
  cover: "Omslag",
  text: "Tekst",
  plan: "Planblad",
  moodboard: "Moodboard",
  materials: "Materiaalstaat",
  lighting: "Lichtplan",
  products: "Productlijst",
  price: "Prijsblok",
  closing: "Afsluiting",
};
const blockName = (block: PresentationBlock) => names[block.type];
