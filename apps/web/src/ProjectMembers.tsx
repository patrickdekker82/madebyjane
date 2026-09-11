import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { api } from "./api";
import { can, type Role } from "../../../packages/domain/src/permissions";
import { projectRoles } from "../../../packages/contracts/src/index";

type Member = {
  user_id: string;
  role: string;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
};
type OrgMember = { id: string; name: string; email: string; role: Role };

const roleLabels: Record<string, string> = {
  designer: "Ontwerper",
  finance: "Offertes en kosten",
  viewer: "Alleen lezen",
};

/**
 * Wie mag bij dit project? Alleen owner en admin zien dit paneel; de server
 * weigert de routes voor andere rollen ook zonder dat de knop verborgen is.
 */
export function ProjectMembers({
  organizationId,
  projectId,
  role,
}: {
  organizationId: string;
  projectId: string;
  role: Role;
}) {
  const [open, setOpen] = useState(false),
    [access, setAccess] = useState<"organization" | "restricted">(
      "organization",
    ),
    [members, setMembers] = useState<Member[]>([]),
    [candidates, setCandidates] = useState<OrgMember[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const root = `/projects/${projectId}`;
  if (!can(role, "members.manage")) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    const r = await api<{ access: typeof access; items: Member[] }>(
      root + "/members",
      organizationId,
    );
    setAccess(r.access);
    setMembers(r.items);
    setCandidates(
      (
        await api<{ items: OrgMember[] }>(
          "/organization/members",
          organizationId,
        )
      ).items,
    );
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        setOpen(v);
        if (v) void run(refresh);
      }}
    >
      <Dialog.Trigger asChild>
        <button className="subtle">Projecttoegang</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog" style={{ width: "min(700px,94vw)" }}>
          <Dialog.Title>Projecttoegang</Dialog.Title>
          <Dialog.Description>
            {access === "organization"
              ? "Iedereen in deze werkruimte kan dit project openen, met de rechten van zijn eigen rol."
              : "Alleen de leden hieronder kunnen dit project openen. Voor anderen bestaat het project niet."}
          </Dialog.Description>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api(root + "/access", organizationId, {
                  access:
                    access === "organization" ? "restricted" : "organization",
                });
                await refresh();
              })
            }
          >
            {access === "organization"
              ? "Beperken tot gekozen leden"
              : "Openstellen voor de hele werkruimte"}
          </button>
          <h3>Leden van dit project</h3>
          {members.length === 0 && <p>Nog geen expliciete leden.</p>}
          {members.map((m) => (
            <p key={m.user_id}>
              {m.user_name ?? m.user_id}
              {m.user_email ? ` (${m.user_email})` : ""} ·{" "}
              {roleLabels[m.role] ?? m.role}{" "}
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api(
                      `${root}/members/${encodeURIComponent(m.user_id)}/remove`,
                      organizationId,
                      {},
                    );
                    await refresh();
                  })
                }
              >
                Lidmaatschap intrekken
              </button>
            </p>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void run(async () => {
                await api(root + "/members", organizationId, {
                  userId: String(data.get("userId")),
                  role: String(data.get("role")),
                });
                await refresh();
              });
            }}
          >
            <label>
              Collega
              <select name="userId" required>
                {candidates
                  .filter((c) => !["owner", "admin"].includes(c.role))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.email})
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Rol binnen dit project
              <select name="role" defaultValue="designer">
                {projectRoles.map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </select>
            </label>
            <p>
              De projectrol geldt alleen hier en vervangt de werkruimterol voor
              dit project. Owner en admin houden altijd toegang.
            </p>
            <button className="primary" type="submit" disabled={busy}>
              Lid toevoegen
            </button>
          </form>
          {busy && <p role="status">Bezig…</p>}
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
