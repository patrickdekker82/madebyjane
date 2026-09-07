import { useState } from "react";
import { authRequest } from "./api";
export function SecurityPanel({
  enabled,
  onChanged,
}: {
  enabled: boolean;
  onChanged: () => void;
}) {
  const [enrollment, setEnrollment] = useState<{
      totpURI: string;
      backupCodes: string[];
    } | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="invitation-page">
      <span className="eyebrow">JE PERSOONLIJKE ACCOUNT</span>
      <h1>Een extra slot op je studio.</h1>
      <p>
        Tweestapsverificatie:{" "}
        <strong>{enabled ? "ingeschakeld" : "nog niet ingesteld"}</strong>. Bij
        externe HTTPS-toegang is deze extra stap verplicht.
      </p>
      {!enabled && !enrollment && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              const result = await authRequest<{
                totpURI: string;
                backupCodes: string[];
              }>("/two-factor/enable", {
                password: f.get("password"),
                method: "totp",
              });
              setEnrollment(result);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Je huidige wachtwoord
            <input
              required
              name="password"
              type="password"
              autoComplete="current-password"
            />
          </label>
          <button className="primary" disabled={busy}>
            Tweestapsverificatie instellen
          </button>
        </form>
      )}
      {enrollment && (
        <>
          <p>
            Voeg een account toe in je authenticator-app. Kies handmatig
            invoeren, tijdgebonden code, en gebruik deze sleutel:
          </p>
          <label>
            Authenticator-sleutel
            <input
              readOnly
              value={
                new URL(enrollment.totpURI).searchParams.get("secret") ?? ""
              }
            />
          </label>
          <p>
            Bewaar deze eenmalige herstelcodes buiten de app. Hiermee kun je
            inloggen als je je authenticator verliest.
          </p>
          <div className="backup-codes">
            {enrollment.backupCodes.map((c) => (
              <code key={c}>{c}</code>
            ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                await authRequest("/two-factor/verify-totp", {
                  code: f.get("code"),
                });
                setEnrollment(null);
                setNotice("Tweestapsverificatie is ingeschakeld.");
                onChanged();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="check-label">
              <input type="checkbox" required />
              Ik heb de herstelcodes veilig bewaard
            </label>
            <label>
              Code uit je authenticator
              <input
                required
                name="code"
                pattern="[0-9]{6}"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </label>
            <button className="primary" disabled={busy}>
              Controleren en inschakelen
            </button>
          </form>
        </>
      )}
      {enabled && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              await authRequest("/two-factor/disable", {
                password: f.get("password"),
              });
              setNotice(
                "Tweestapsverificatie is uitgeschakeld. Externe projecttoegang vereist opnieuw instellen.",
              );
              onChanged();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="small">
            Vervang je authenticator? Schakel de oude configuratie uit en stel
            daarna direct de nieuwe in.
          </p>
          <label>
            Huidig wachtwoord
            <input
              required
              name="password"
              type="password"
              autoComplete="current-password"
            />
          </label>
          <button disabled={busy}>Huidige authenticator loskoppelen</button>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </main>
  );
}
