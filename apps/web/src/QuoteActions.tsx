import { useState, useRef } from "react";
import { api, ApiError } from "./api";
import {
  quoteStatuses,
  type QuoteRecord,
  type QuoteSummary,
  type QuoteStatus,
} from "../../../packages/contracts/src/quotes";
export function QuoteActions({
  organizationId,
  projectId,
  row,
  disabled,
  latestVersion,
  onOpen,
  onBusy,
}: {
  organizationId: string;
  projectId: string;
  row: QuoteRecord;
  disabled: boolean;
  latestVersion: number;
  onOpen: (q: { id: string; version: number }) => Promise<void>;
  onBusy: (b: boolean) => void;
}) {
  const [history, setHistory] = useState<QuoteSummary[]>([]),
    [events, setEvents] = useState<
      {
        event_version: number;
        status: QuoteStatus;
        occurred_on: string;
        actor: string;
        evidence: string;
        created_at: string;
      }[]
    >([]),
    [shares, setShares] = useState<
      { id: string; expires_at: string; revoked_at: string | null }[]
    >([]),
    [link, setLink] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [status, setStatus] = useState("sent");
  const pending = useRef<{ path: string; body: unknown } | null>(null);
  const root = `/projects/${projectId}/quotes/${row.id}`,
    version = `${root}/versions/${row.version}`;
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
  const mutate = async <T,>(path: string, body: unknown) => {
    pending.current ??= { path, body };
    try {
      const r = await api<T>(
        pending.current.path,
        organizationId,
        pending.current.body,
      );
      pending.current = null;
      return r;
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) pending.current = null;
      throw e;
    }
  };
  const refresh = async () => {
    const h = (
      await api<{ items: QuoteSummary[] }>(root + "/history", organizationId)
    ).items;
    setHistory(h);
    const r = h.find((q) => q.version === row.version);
    if (r) await onOpen(r);
  };
  const current = row.status ?? (row.number ? "final" : "draft");
  const transitions =
    current === "final"
      ? ["sent", "rejected", "expired"]
      : current === "sent"
        ? ["accepted", "rejected", "expired"]
        : [];
  return (
    <section
      style={{ borderTop: "1px solid #d7ded4", marginTop: 20, paddingTop: 12 }}
    >
      <p>
        <strong>{quoteStatuses[current]}</strong> · versie {row.version}
      </p>
      {row.definition.validUntil <
        new Date().toLocaleDateString("sv-SE", {
          timeZone: "Europe/Amsterdam",
        }) &&
        !["accepted", "rejected", "expired", "replaced"].includes(current) && (
          <p>
            De geldigheidsdatum is verstreken. Registreer de uitkomst of maak
            een nieuw voorstel.
          </p>
        )}
      {!!row.frozen?.attachments.length && (
        <p>
          Bijgevoegd: {row.frozen.attachments.map((a) => a.title).join(" · ")}
        </p>
      )}
      <button
        disabled={disabled || busy}
        onClick={() =>
          void run(async () =>
            setHistory(
              (
                await api<{ items: QuoteSummary[] }>(
                  root + "/history",
                  organizationId,
                )
              ).items,
            ),
          )
        }
      >
        Versies bekijken
      </button>
      {history.map((h) => (
        <button
          disabled={disabled || busy || !!pending.current}
          key={h.version}
          onClick={() => void run(() => onOpen(h))}
        >
          {h.number ?? "Concept"} · versie {h.version} ·{" "}
          {quoteStatuses[h.status ?? (h.number ? "final" : "draft")]}
        </button>
      ))}
      {row.number && (
        <>
          <button
            disabled={disabled || busy}
            onClick={() =>
              void run(async () => {
                const r = await fetch("/api/v1" + version + "/pdf", {
                  headers: { "x-organization-id": organizationId },
                  credentials: "same-origin",
                });
                if (!r.ok) {
                  const e = await r.json();
                  throw new Error(e.message ?? "PDF maken is mislukt.");
                }
                const url = URL.createObjectURL(await r.blob()),
                  a = document.createElement("a");
                a.href = url;
                a.download = `offerte-${row.number}-v${row.version}.pdf`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
              })
            }
          >
            Offerte-PDF downloaden
          </button>
          {row.version === latestVersion && (
            <button
              disabled={disabled || busy}
              onClick={() =>
                void run(async () => {
                  if (
                    !pending.current &&
                    !window.confirm(
                      "Een vervolgconcept maken? Deze vaste versie blijft intact. Bij definitief maken krijgt het vervolg een nieuw nummer en wordt de vorige versie als vervangen geregistreerd.",
                    )
                  )
                    return;
                  const q = await mutate<QuoteRecord>(root + "/revise", {
                    requestId: crypto.randomUUID(),
                    baseVersion: row.version,
                  });
                  await onOpen(q);
                })
              }
            >
              Vervolgconcept maken
            </button>
          )}
          {!!transitions.length && (
            <button
              disabled={disabled || busy}
              onClick={() => {
                setStatus(transitions[0]!);
                setRecording(!recording);
              }}
            >
              Verzending of klantreactie registreren
            </button>
          )}
          {recording && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void run(async () => {
                  await mutate(version + "/events", {
                    requestId: crypto.randomUUID(),
                    baseEventVersion: row.event_version ?? 0,
                    status,
                    occurredOn: String(data.get("occurredOn")),
                    actor: String(data.get("actor")),
                    evidence: String(data.get("evidence")),
                  });
                  setRecording(false);
                  await refresh();
                });
              }}
            >
              <p>
                Handmatige registratie van wat buiten deze app is gebeurd. Er
                wordt geen e-mail verstuurd en geen digitale handtekening
                geplaatst.
              </p>
              <fieldset
                disabled={disabled || busy || !!pending.current}
                style={{ border: 0, padding: 0 }}
              >
                <label>
                  Nieuwe status
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {transitions.map((s) => (
                      <option key={s} value={s}>
                        {quoteStatuses[s as QuoteStatus]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Gebeurtenisdatum
                  <input
                    name="occurredOn"
                    type="date"
                    required
                    defaultValue={new Date().toLocaleDateString("sv-SE", {
                      timeZone: "Europe/Amsterdam",
                    })}
                  />
                </label>
                <label>
                  Afzender of reagerende klant
                  <input name="actor" required maxLength={200} />
                </label>
                <label>
                  Onderbouwing / bron
                  <textarea
                    name="evidence"
                    required
                    maxLength={2000}
                    placeholder="Bijvoorbeeld: e-mail van klant op datum, onderwerp en reactie"
                  />
                </label>
              </fieldset>
              <button
                className="primary"
                disabled={disabled || busy}
                type="submit"
              >
                Registratie bewaren
              </button>
            </form>
          )}
          <button
            disabled={disabled || busy}
            onClick={() =>
              void run(async () =>
                setEvents(
                  (
                    await api<{ items: typeof events }>(
                      version + "/events",
                      organizationId,
                    )
                  ).items,
                ),
              )
            }
          >
            Statusgeschiedenis bekijken
          </button>
          {events.map((e) => (
            <p key={e.event_version}>
              {quoteStatuses[e.status]} · {e.occurred_on.slice(0, 10)} ·{" "}
              {e.actor}
              <br />
              {e.evidence}
            </p>
          ))}
          <h4>Alleen deze PDF delen</h4>
          <p>
            Een link geeft uitsluitend toegang tot deze vaste offerteversie en
            haar bijlagen. Geldig voor 7 dagen, direct intrekbaar. De ontvanger
            moet de server kunnen bereiken.
          </p>
          <button
            disabled={disabled || busy}
            onClick={() =>
              void run(async () => {
                const r = await mutate<{ path: string; revoked: boolean }>(
                  version + "/shares",
                  { id: crypto.randomUUID(), days: 7 },
                );
                if (r.revoked)
                  throw new Error(
                    "Deze link is ingetrokken. Maak een nieuwe link.",
                  );
                setLink(new URL(r.path, location.origin).href);
                setShares(
                  (
                    await api<{ items: typeof shares }>(
                      version + "/shares",
                      organizationId,
                    )
                  ).items,
                );
              })
            }
          >
            Deellink maken
          </button>
          {link && (
            <label>
              Deellink voor deze offerte
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
            </label>
          )}
          <button
            disabled={disabled || busy}
            onClick={() =>
              void run(async () =>
                setShares(
                  (
                    await api<{ items: typeof shares }>(
                      version + "/shares",
                      organizationId,
                    )
                  ).items,
                ),
              )
            }
          >
            Bestaande deellinks bekijken
          </button>
          {shares.map((s) => (
            <p key={s.id}>
              {s.revoked_at
                ? "Ingetrokken"
                : `Geldig tot ${new Date(s.expires_at).toLocaleString("nl-NL")}`}{" "}
              {!s.revoked_at && (
                <button
                  disabled={disabled || busy}
                  onClick={() =>
                    void run(async () => {
                      await api(
                        `/quote-shares/${s.id}/revoke`,
                        organizationId,
                        {},
                      );
                      setLink("");
                      setShares(
                        (
                          await api<{ items: typeof shares }>(
                            version + "/shares",
                            organizationId,
                          )
                        ).items,
                      );
                    })
                  }
                >
                  Link intrekken
                </button>
              )}
            </p>
          ))}
        </>
      )}
      {pending.current && !recording && (
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await mutate(pending.current!.path, pending.current!.body);
              await refresh();
            })
          }
        >
          Laatste aanvraag opnieuw proberen
        </button>
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
