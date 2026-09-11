import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Role } from "../../../packages/domain/src/index";
type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
};
type Invitation = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};
export function AccessPanel({
  organizationId,
  role,
}: {
  organizationId: string;
  role: Role;
}) {
  const [link, setLink] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const allowed = ["owner", "admin"].includes(role);
  const query = useQuery({
    queryKey: ["invitations", organizationId],
    queryFn: () => api<{ items: Invitation[] }>("/invitations", organizationId),
    enabled: allowed,
  });
  const members = useQuery({
    queryKey: ["organization-members", organizationId],
    queryFn: () =>
      api<{ items: Member[] }>("/organization/members", organizationId),
    enabled: allowed,
  });
  const [recovery, setRecovery] = useState<{ email: string; url: string }>();
  if (!allowed)
    return (
      <main className="center">
        <h2>Toegang wordt door je beheerder geregeld</h2>
        <p>Je kunt hier geen uitnodigingen beheren.</p>
      </main>
    );
  return (
    <main className="access-page">
      <span className="eyebrow">SAMEN ONTWERPEN</span>
      <h1>Jouw studio, jullie werkplek.</h1>
      <p>
        Nodig een collega uit. De link is 48 uur geldig en kan één keer worden
        gebruikt.
      </p>
      <div className="access-columns">
        <section>
          <h2>Collega uitnodigen</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              setLink("");
              const f = new FormData(e.currentTarget);
              try {
                const result = await api<{ url: string }>(
                  "/invitations",
                  organizationId,
                  { email: f.get("email"), role: f.get("role") },
                );
                setLink(result.url);
                await qc.invalidateQueries({
                  queryKey: ["invitations", organizationId],
                });
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              E-mailadres collega
              <input required name="email" type="email" maxLength={254} />
            </label>
            <label>
              Toegang
              <select aria-label="Toegang" name="role" defaultValue="designer">
                <option value="designer">
                  Ontwerper · projecten lezen en bewerken
                </option>
                <option value="viewer">Kijker · alleen lezen</option>
                <option value="finance">Financiën · projecten lezen</option>
                <option value="admin">
                  Beheerder · projecten en toegang beheren
                </option>
              </select>
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Aanmaken…" : "Uitnodigingslink maken"}
            </button>
          </form>
          {link && (
            <div className="invite-result">
              <label>
                Eenmalige uitnodigingslink
                <input
                  readOnly
                  value={link}
                  aria-label="Eenmalige uitnodigingslink"
                />
              </label>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setMessage(
                      "Link gekopieerd. Deel hem zelf met je collega.",
                    );
                  } catch {
                    setMessage("Selecteer en kopieer de link handmatig.");
                  }
                }}
              >
                Link kopiëren
              </button>
              <p className="small">
                Er is geen e-mail verstuurd. Bewaar de link alleen zolang nodig.
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
        </section>
        <section>
          <h2>Accountherstel</h2>
          <p className="small">
            Kan een collega niet meer inloggen? Maak een eenmalige herstellink
            en geef die persoonlijk door. De link vervalt na twee uur, werkt één
            keer, en het instellen van een nieuw wachtwoord logt alle bestaande
            sessies van die collega uit. Er wordt geen e-mail verstuurd.
          </p>
          {members.isError ? (
            <p className="error" role="alert">
              {members.error.message}
            </p>
          ) : (
            <ul className="invite-list">
              {(members.data?.items ?? [])
                .filter((m) => m.id !== undefined)
                .map((m) => (
                  <li key={m.id}>
                    <div>
                      <strong>{m.name}</strong>
                      <span className="small"> {m.email}</span>
                    </div>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        setMessage("");
                        try {
                          const r = await api<{ email: string; url: string }>(
                            `/members/${encodeURIComponent(m.id)}/recovery`,
                            organizationId,
                            {},
                          );
                          setRecovery(r);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Herstellink maken
                    </button>
                  </li>
                ))}
            </ul>
          )}
          {recovery && (
            <div className="invite-result">
              <label>
                Eenmalige herstellink voor {recovery.email}
                <input
                  readOnly
                  value={recovery.url}
                  aria-label="Eenmalige herstellink"
                />
              </label>
              <p className="small">
                Geef deze link persoonlijk door en bewaar hem niet. Een nieuwe
                link maken maakt deze meteen ongeldig.
              </p>
            </div>
          )}
        </section>
        <section>
          <h2>Uitnodigingen</h2>
          {query.isPending ? (
            <p>Laden…</p>
          ) : query.isError ? (
            <p className="error" role="alert">
              {query.error.message}
            </p>
          ) : !query.data.items.length ? (
            <p className="small">Er zijn nog geen uitnodigingen.</p>
          ) : (
            <ul className="invite-list">
              {query.data.items.map((i) => (
                <li key={i.id}>
                  <div>
                    <strong>{i.email}</strong>
                    <p>
                      {i.role} ·{" "}
                      {i.accepted_at
                        ? "Geaccepteerd"
                        : i.revoked_at
                          ? "Ingetrokken"
                          : new Date(i.expires_at) < new Date()
                            ? "Verlopen"
                            : "Open"}
                    </p>
                  </div>
                  {!i.accepted_at && !i.revoked_at && (
                    <button
                      onClick={async () => {
                        try {
                          await api(
                            "/invitations/" + i.id + "/revoke",
                            organizationId,
                            {},
                          );
                          setLink("");
                          await qc.invalidateQueries({
                            queryKey: ["invitations", organizationId],
                          });
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Intrekken
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="small">
            Offerte- en financefuncties zijn nog in ontwikkeling. Een financiële
            rol heeft nu alleen projectleestoegang.
          </p>
        </section>
      </div>
    </main>
  );
}
export function InvitationPage() {
  const [token] = useState(() => location.hash.slice(1)),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <main className="invitation-page">
      <span className="brand">
        <span className="brand-mark">s.</span>studio.
      </span>
      <h1>
        {done ? "Welkom in de studio." : "Er staat een werkplek voor je klaar."}
      </h1>
      {done ? (
        <>
          <p>
            Je toegang is aangemaakt. Log in met je e-mailadres en wachtwoord.
          </p>
          <a href="/">Naar inloggen →</a>
        </>
      ) : (
        <>
          <p>
            Maak je persoonlijke account aan. Heb je al een account, log dan
            eerst in en open deze uitnodigingslink opnieuw.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                await api("/invitations/accept", undefined, {
                  token,
                  ...(f.get("name") ? { name: f.get("name") } : {}),
                  ...(f.get("password") ? { password: f.get("password") } : {}),
                });
                setDone(true);
                history.replaceState(null, "", "/uitnodiging");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Je naam
              <input name="name" autoComplete="name" maxLength={120} />
            </label>
            <label>
              Kies een wachtwoord
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <p className="small">
              Voor een nieuw account: minimaal 12 tekens. Bij een bestaande
              ingelogde gebruiker mogen beide velden leeg blijven.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy || !token}>
              {busy ? "Even geduld…" : "Uitnodiging accepteren"}
            </button>
          </form>
          <a href="/">Ik heb al een account →</a>
        </>
      )}
    </main>
  );
}

/** De pagina achter een herstellink. Zet alleen een nieuw wachtwoord. */
export function RecoveryPage() {
  const [token] = useState(() => location.hash.slice(1)),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <main className="invitation-page">
      <span className="brand">
        <span className="brand-mark">s.</span>studio.
      </span>
      <h1>{done ? "Je kunt weer inloggen." : "Kies een nieuw wachtwoord."}</h1>
      {done ? (
        <>
          <p>
            Je wachtwoord is gewijzigd. Je bent op alle apparaten uitgelogd, dus
            log opnieuw in met je nieuwe wachtwoord.
          </p>
          <a href="/">Naar inloggen →</a>
        </>
      ) : (
        <>
          <p>
            Deze link werkt één keer en vervalt na twee uur. Vraag je beheerder
            om een nieuwe als hij niet meer werkt.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                await api("/recovery/accept", undefined, {
                  token,
                  password: f.get("password"),
                });
                setDone(true);
                history.replaceState(null, "", "/herstel");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Nieuw wachtwoord
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <p className="small">Minimaal 12 tekens.</p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy || !token}>
              {busy ? "Even geduld…" : "Wachtwoord instellen"}
            </button>
          </form>
          <a href="/">Terug naar inloggen →</a>
        </>
      )}
    </main>
  );
}
