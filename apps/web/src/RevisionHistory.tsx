import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { api } from "./api";
type Revision = {
  id: string;
  name: string;
  revision: number;
  created_at: string;
};
export function RevisionHistory({
  organizationId,
  variantId,
  revision,
  disabled,
  onRestore,
}: {
  organizationId: string;
  variantId: string;
  revision: number;
  disabled: boolean;
  onRestore: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<Revision[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [chosen, setChosen] = useState<Revision | null>(null);
  const load = async () => {
    setLoading(true);
    setError("");
    setChosen(null);
    try {
      setRows(
        await api<Revision[]>(
          "/variants/" + variantId + "/revisions",
          organizationId,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) void load();
      }}
    >
      <Dialog.Trigger asChild>
        <button>Versiegeschiedenis</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title>Versiegeschiedenis</Dialog.Title>
          <Dialog.Description>
            Huidige revisie: {revision}. De laatste 100 bewaarde versies. Bij
            herstel bewaren we eerst het huidige ontwerp; herstel wordt een
            nieuwe revisie.
          </Dialog.Description>
          {loading ? (
            <p>Versies ophalen…</p>
          ) : error ? (
            <p role="alert" className="error">
              {error}
            </p>
          ) : rows.length === 0 ? (
            <p>
              Nog geen revisies bewaard. Gebruik ‘Revisie bewaren’ in het
              ontwerp.
            </p>
          ) : (
            <ul style={{ padding: 0, listStyle: "none" }}>
              {rows.map((row) => (
                <li
                  key={row.id}
                  style={{ padding: "12px 0", borderBottom: "1px solid #ddd" }}
                >
                  <strong>{row.name}</strong>
                  <p className="small">
                    Revisie {row.revision} ·{" "}
                    {new Date(row.created_at).toLocaleString("nl-NL")}
                  </p>
                  <button disabled={disabled} onClick={() => setChosen(row)}>
                    Herstel revisie {row.revision}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {chosen && (
            <div role="region" aria-label="Herstel bevestigen">
              <p>
                Herstel ‘{chosen.name}’? Het huidige ontwerp blijft als bewaarde
                versie beschikbaar.
              </p>
              <button
                className="primary"
                disabled={disabled}
                onClick={() => {
                  onRestore(chosen.id);
                  setOpen(false);
                }}
              >
                Deze versie herstellen
              </button>
              <button onClick={() => setChosen(null)}>Annuleren</button>
            </div>
          )}
          <Dialog.Close asChild>
            <button>Sluiten</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
