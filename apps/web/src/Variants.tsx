import { useQuery } from "@tanstack/react-query";
import { useState, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import { api } from "./api";
export function Variants({
  organizationId,
  variantId,
  revision,
  disabled,
  pending,
}: {
  organizationId: string;
  variantId: string;
  revision: number;
  disabled: boolean;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<
      { id: string; name: string; revision: number }[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef<{
      variantId: string;
      name: string;
      baseRevision: number;
    } | null>(null),
    navigate = useNavigate();
  const load = async () => {
    setError("");
    try {
      setRows(
        await api("/variants/" + variantId + "/alternatives", organizationId),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const copy = async () => {
    if (!request.current) return;
    setBusy(true);
    try {
      const result = await api<{ variantId: string }>(
        "/variants/" + variantId + "/copies",
        organizationId,
        request.current,
      );
      request.current = null;
      setOpen(false);
      await navigate({
        to: "/ontwerp/$variantId",
        params: { variantId: result.variantId },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (busy) return;
        setOpen(value);
        if (value) void load();
      }}
    >
      <Dialog.Trigger asChild>
        <button disabled={pending}>Ontwerpvarianten</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title>Ontwerpvarianten</Dialog.Title>
          <Dialog.Description>
            Werk een alternatief uit als zelfstandige kopie van het opgeslagen
            ontwerp. De geschiedenis blijft bij het oorspronkelijke ontwerp.
          </Dialog.Description>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {rows.map((row) => (
              <li key={row.id} style={{ margin: "10px 0" }}>
                <button
                  disabled={busy || pending || row.id === variantId}
                  onClick={() => {
                    setOpen(false);
                    void navigate({
                      to: "/ontwerp/$variantId",
                      params: { variantId: row.id },
                    });
                  }}
                >
                  {row.name}
                  {row.id === variantId ? " · huidig" : ""}
                </button>
              </li>
            ))}
          </ul>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!request.current) {
                const name = String(
                  new FormData(event.currentTarget).get("name") ?? "",
                ).trim();
                if (!name) return;
                request.current = {
                  variantId: crypto.randomUUID(),
                  name,
                  baseRevision: revision,
                };
              }
              void copy();
            }}
          >
            <label>
              Naam alternatief
              <input
                name="name"
                aria-label="Naam alternatief"
                required
                maxLength={120}
                disabled={busy || disabled || !!request.current}
              />
            </label>
            <button className="primary" disabled={busy || disabled}>
              {request.current ? "Kopiëren opnieuw proberen" : "Variant maken"}
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
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

export function VariantName({
  organizationId,
  variantId,
}: {
  organizationId: string;
  variantId: string;
}) {
  const query = useQuery({
    queryKey: ["variant-names", organizationId, variantId],
    queryFn: () =>
      api<{ id: string; name: string }[]>(
        "/variants/" + variantId + "/alternatives",
        organizationId,
      ),
  });
  return (
    <span aria-label="Huidige ontwerpvariant">
      {query.data?.find((v) => v.id === variantId)?.name ?? "Ontwerp"}
    </span>
  );
}
