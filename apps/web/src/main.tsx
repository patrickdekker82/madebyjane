import { LibraryPanel } from "./LibraryPanel";
import { Variants, VariantName } from "./Variants";
import { RoomSummary } from "./RoomSummary";
import { RevisionHistory } from "./RevisionHistory";
import { StructureProperties } from "./StructureProperties";
import React, {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
  Outlet,
  useNavigate,
  useBlocker,
} from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  MousePointer2,
  BrickWall,
  DoorOpen,
  AppWindow,
  Sofa,
  Undo2,
  Redo2,
  Download,
  Box,
  Layers,
  LogOut,
  Search,
  ChevronRight,
  Check,
  Trash2,
  RotateCw,
  Save,
  Grid2X2,
  Copy,
  X,
  Armchair,
} from "lucide-react";
import { api, login, logout, authRequest, ApiError } from "./api";
import { PlanCanvas } from "../../../packages/editor-2d/src/Canvas";
import { useEditor } from "../../../packages/editor-2d/src/store";
import {
  applyOperations,
  contentOf,
  canWrite,
  type Role,
} from "../../../packages/domain/src/index";
import type {
  Scene,
  Item,
  Operation,
} from "../../../packages/contracts/src/index";
import { parseDutchNumber } from "../../../packages/geometry/src/index";
import "./style.css";
import { Probe } from "./Probe";
import { AccessPanel, InvitationPage } from "./Access";
import { SecurityPanel } from "./Security";
const Viewer = lazy(() => import("../../../packages/viewer-3d/src/Viewer"));
type Me = {
  user: { id: string; name: string; email: string; twoFactorEnabled: boolean };
  organizations: { id: string; name: string; role: Role }[];
};
type Project = {
  id: string;
  name: string;
  customer: string;
  description: string;
  variant_id: string;
  updated_at: string;
};
const WorkspaceContext = createContext<Me["organizations"][number] | null>(
  null,
);
const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">s.</span>
      <span>
        studio<span className="brand-dot">.</span>
      </span>
    </span>
  );
}
function Login({ onDone }: { onDone: () => void }) {
  const [secondFactor, setSecondFactor] = useState(false),
    [recovery, setRecovery] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <section className="login-intro">
        <Brand />
        <div>
          <span className="eyebrow">RUIMTE VOOR IDEEËN</span>
          <h1>
            Van eerste lijn
            <br />
            tot een thuis.
          </h1>
          <p>
            Jouw werkplek voor doordachte interieurs.
            <br />
            Precies getekend. Met aandacht gemaakt.
          </p>
        </div>
        <span className="login-foot">
          INTERIEURONTWERP · WERKPLEK IN ONTWIKKELING
        </span>
      </section>
      <section className="login-form">
        <span className="eyebrow">WELKOM TERUG</span>
        <h2>Open je studio</h2>
        <p>Log in met je persoonlijke account.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              if (secondFactor) {
                await authRequest(
                  recovery
                    ? "/two-factor/verify-backup-code"
                    : "/two-factor/verify-totp",
                  { code: f.get("code") },
                );
                onDone();
              } else {
                const result = await login(
                  String(f.get("email")),
                  String(f.get("password")),
                );
                if (result.twoFactorRedirect) setSecondFactor(true);
                else onDone();
              }
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <>
            {secondFactor ? (
              <>
                <label>
                  {recovery
                    ? "Eenmalige herstelcode"
                    : "Code uit je authenticator"}
                  <input required name="code" autoComplete="one-time-code" />
                </label>
                <button type="button" onClick={() => setRecovery(!recovery)}>
                  {recovery
                    ? "Authenticator gebruiken"
                    : "Herstelcode gebruiken"}
                </button>
              </>
            ) : (
              <>
                <label>
                  E-mailadres
                  <input
                    required
                    name="email"
                    type="email"
                    autoComplete="username"
                    placeholder="naam@jouwstudio.nl"
                  />
                </label>
                <label>
                  Wachtwoord
                  <input
                    required
                    name="password"
                    type="password"
                    autoComplete="current-password"
                  />
                </label>
              </>
            )}
          </>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Even geduld…" : "Inloggen"}
            <ArrowRight size={17} />
          </button>
        </form>
        <p className="small">
          Je account wordt door de beheerder aangemaakt.
          <br />
          Eerste installatie? Volg de lokale snelstart.
        </p>
      </section>
    </main>
  );
}
function App() {
  const probe = ["/proef", "/uitnodiging"].includes(location.pathname);
  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/me"),
    enabled: !probe,
  });
  const navigate = useNavigate();
  const [orgId, setOrgId] = useState("");
  if (probe) return <Outlet />;
  if (query.isPending) return <div className="center">Studio openen…</div>;
  if (query.isError)
    return query.error instanceof ApiError && query.error.status === 401 ? (
      <Login onDone={() => void query.refetch()} />
    ) : (
      <div className="center">
        <h2>De studio is niet bereikbaar</h2>
        <p>Controleer of de lokale server draait.</p>
        <button onClick={() => void query.refetch()}>Opnieuw proberen</button>
      </div>
    );
  const me = query.data,
    org = me.organizations.find((o) => o.id === orgId) ?? me.organizations[0];
  if (!org)
    return (
      <div className="center">
        Je account heeft nog geen werkruimte. Neem contact op met de beheerder.
      </div>
    );
  return (
    <div className="app">
      <header className="topbar">
        <button
          className="brand-button"
          onClick={() => void navigate({ to: "/" })}
        >
          <Brand />
        </button>
        <div className="workspace">
          <span className="tiny-square" /> {org.name}
          {me.organizations.length > 1 && (
            <select
              aria-label="Werkruimte"
              value={org.id}
              onChange={(e) => {
                setOrgId(e.target.value);
                void navigate({ to: "/" });
              }}
            >
              {me.organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          className="subtle"
          onClick={() => void navigate({ to: "/toegang" })}
        >
          Toegang
        </button>
        <button
          className="subtle"
          onClick={() => void navigate({ to: "/beveiliging" })}
        >
          Beveiliging
        </button>
        <span className="stage-badge">ONTWIKKELVERSIE</span>
        <div className="user">
          <span className="avatar">
            {me.user.name.slice(0, 1).toUpperCase()}
          </span>
          <span>{me.user.name}</span>
          <button
            title="Afmelden"
            aria-label="Afmelden"
            onClick={async () => {
              try {
                if (useEditor.getState().hasPending) {
                  alert(
                    "Bewaar eerst je lokale herstelbestand of rond het opslaan af.",
                  );
                  return;
                }
                await logout();
                qc.clear();
                await navigate({ to: "/" });
                location.reload();
              } catch (e) {
                alert((e as Error).message);
              }
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <WorkspaceContext.Provider value={org}>
        <Outlet />
      </WorkspaceContext.Provider>
    </div>
  );
}
function useWorkspace() {
  // Root data is reused from the authenticated query; selected organization is provided through route context below.
  const me = qc.getQueryData<Me>(["me"])!;
  return me;
}
// Keep workspace selection scoped to the current authenticated root. The first release uses the first membership in product navigation.
function Projects() {
  const org = useContext(WorkspaceContext)!;
  const [search, setSearch] = useState(""),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const projects = useQuery({
    queryKey: ["projects", org.id],
    queryFn: () => api<{ items: Project[] }>("/projects", org.id),
  });
  return (
    <main className="projects-page">
      <aside className="project-nav">
        <span className="eyebrow">WERKPLEK</span>
        <div className="nav-active">
          <Layers size={18} /> Projecten{" "}
          <span>{projects.data?.items.length ?? 0}</span>
        </div>
        <div className="sidebar-bottom">
          <span className="eyebrow">MET AANDACHT ONTWORPEN</span>
          <p>
            Een goed interieur
            <br />
            begint met ruimte.
          </p>
          <div className="monogram">s.</div>
        </div>
      </aside>
      <section className="project-content">
        <div className="breadcrumb">
          Werkplek <ChevronRight size={13} /> Projecten
        </div>
        <div className="page-heading">
          <div>
            <span className="eyebrow">JOUW ONTWERPSTUDIO</span>
            <h1>Ruimte voor het volgende.</h1>
            <p>Van eerste schets tot zorgvuldig uitgewerkt ontwerp.</p>
          </div>
          {canWrite(org.role) && (
            <button className="primary" onClick={() => setOpen(true)}>
              <Plus size={17} />
              Nieuw project
            </button>
          )}
        </div>
        <div className="list-heading">
          <h2>
            Projecten <span>{projects.data?.items.length ?? 0}</span>
          </h2>
          <label className="search">
            <Search size={16} />
            <input
              aria-label="Projecten zoeken"
              placeholder="Zoek een project of klant"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {projects.isPending ? (
          <p>Projecten laden…</p>
        ) : projects.isError ? (
          <div role="alert" className="error">
            Laden mislukt.{" "}
            <button onClick={() => void projects.refetch()}>
              Opnieuw proberen
            </button>
          </div>
        ) : (
          <div className="project-grid">
            {projects.data.items
              .filter((p) =>
                (p.name + " " + p.customer)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((p, i) => (
                <button
                  key={p.id}
                  className="project-card"
                  onClick={() =>
                    void navigate({
                      to: "/ontwerp/$variantId",
                      params: { variantId: p.variant_id },
                    })
                  }
                >
                  <div className={"project-cover cover-" + (i % 3)}>
                    <span className="project-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="cover-label">INTERIEURPLAN</span>
                    <span className="cover-title">{p.name}</span>
                    <span className="cover-line" />
                    <span className="cover-customer">
                      {p.customer || "Nieuwe ruimte"}
                    </span>
                  </div>
                  <div className="project-details">
                    <span className="project-tag">IN ONTWERP</span>
                    <h3>
                      {p.name}
                      <ArrowRight size={18} />
                    </h3>
                    <p>
                      {p.customer || "Nog geen klantnaam"}
                      <span>
                        {new Date(p.updated_at).toLocaleDateString("nl-NL", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </p>
                  </div>
                </button>
              ))}
            {!projects.data.items.length && (
              <div className="empty">
                <Armchair size={40} />
                <h2>Je eerste ruimte begint hier</h2>
                <p>Maak een leeg project of verken een fictieve woonkamer.</p>
                {canWrite(org.role) && (
                  <button className="primary" onClick={() => setOpen(true)}>
                    Maak je eerste project
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <p className="release-note">
          Deze ontwikkelbasis ondersteunt projecten, 2D-ontwerpen, een 3D-proef
          en vectorplanexport. Keuzes, presentaties en offertes volgen in de
          volgende bouwfasen.
        </p>
      </section>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>Een nieuw begin</Dialog.Title>
            <Dialog.Description>
              Geef je project een naam. Je kunt met een lege ruimte of fictief
              voorbeeld beginnen.
            </Dialog.Description>
            <Dialog.Close className="dialog-close" aria-label="Sluiten">
              <X size={18} />
            </Dialog.Close>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const f = new FormData(e.currentTarget);
                try {
                  const p = await api<{ variantId: string }>(
                    "/projects",
                    org.id,
                    {
                      name: String(f.get("name")),
                      customer: String(f.get("customer")),
                      description: String(f.get("description")),
                      demo: f.get("demo") === "on",
                    },
                  );
                  await qc.invalidateQueries({ queryKey: ["projects"] });
                  setOpen(false);
                  await navigate({
                    to: "/ontwerp/$variantId",
                    params: { variantId: p.variantId },
                  });
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Projectnaam
                <input
                  autoFocus
                  required
                  name="name"
                  maxLength={120}
                  placeholder="Bijvoorbeeld: Woonkamer aan het park"
                />
              </label>
              <label>
                Klantnaam
                <input
                  name="customer"
                  maxLength={160}
                  placeholder="Naam van de klant"
                />
              </label>
              <label>
                Ontwerpnotitie
                <textarea
                  name="description"
                  maxLength={2000}
                  placeholder="Wat maakt deze ruimte bijzonder?"
                />
              </label>
              <label className="check-label">
                <input type="checkbox" name="demo" />
                Start met de fictieve woonkamer
              </label>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {busy ? "Aanmaken…" : "Project aanmaken"}
                <ArrowRight size={17} />
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
class ViewError extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="center">
        <h2>3D is hier niet beschikbaar</h2>
        <p>Je kunt verder werken in de plattegrond.</p>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Editor() {
  const { variantId } = editorRoute.useParams();
  const org = useContext(WorkspaceContext)!;
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["scene", org.id, variantId],
    queryFn: () => api<Scene>("/variants/" + variantId + "/document", org.id),
  });
  const [scene, setScene] = useState<Scene | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [lease, setLease] = useState(false),
    [leaseError, setLeaseError] = useState(""),
    [view, setView] = useState<"2d" | "3d">("2d");
  const [undo, setUndo] = useState<Scene[]>([]),
    [redo, setRedo] = useState<Scene[]>([]);
  const pending = useRef<{
    commandId: string;
    baseRevision: number;
    leaseId: string;
    operations: Operation[];
  } | null>(null);
  useBlocker({
    enableBeforeUnload: () => pending.current !== null,
    shouldBlockFn: () => {
      if (pending.current) {
        setError(
          "Bewaar eerst je lokale herstelbestand of rond het opslaan af.",
        );
        return true;
      }
      return false;
    },
  });
  const leaseId = useRef<string>(crypto.randomUUID());
  const { tool, setTool, selected, select, zoom, setZoom, grid, toggleGrid } =
    useEditor();
  useEffect(() => {
    if (query.data) {
      setScene(query.data);
      setUndo([]);
      setRedo([]);
      select(null);
    }
  }, [query.data, select]);
  useEffect(() => {
    if (!canWrite(org.role)) return;
    let alive = true;
    let releaseLock: (() => void) | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    setLease(false);
    // sessionStorage survives reload but can be copied when a tab is duplicated.
    // A browser lock prevents both copies from using the same server lease ID.
    const lockManager = navigator.locks;
    const key = `studio.lease:${org.id}:${variantId}`;
    if (lockManager) {
      try {
        const saved = sessionStorage.getItem(key);
        leaseId.current =
          saved &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            saved,
          )
            ? saved
            : crypto.randomUUID();
        sessionStorage.setItem(key, leaseId.current);
      } catch {
        leaseId.current = crypto.randomUUID();
      }
    } else {
      leaseId.current = crypto.randomUUID();
    }
    const heartbeat = async () => {
      try {
        await api("/variants/" + variantId + "/lease", org.id, {
          leaseId: leaseId.current,
        });
        if (alive) {
          setLease(true);
          setLeaseError("");
        }
      } catch (e) {
        if (alive) {
          setLease(false);
          setLeaseError((e as Error).message);
        }
      }
    };
    const startHeartbeat = () => {
      if (!alive) return;
      void heartbeat();
      timer = setInterval(() => void heartbeat(), 15000);
    };
    const acquire = async () => {
      if (!alive) return;
      if (!lockManager) {
        startHeartbeat();
        return;
      }
      try {
        await lockManager.request(
          `studio-edit:${leaseId.current}`,
          { ifAvailable: true },
          async (lock) => {
            if (!alive) return;
            if (!lock) {
              setLease(false);
              setLeaseError(
                "Dit ontwerp is al geopend in een andere tab. Sluit die tab om hier verder te werken.",
              );
              timer = setTimeout(() => void acquire(), 15000);
              return;
            }
            await new Promise<void>((resolve) => {
              releaseLock = resolve;
              startHeartbeat();
            });
          },
        );
      } catch {
        if (alive) {
          setLease(false);
          setLeaseError(
            "De browser kan dit ontwerp niet exclusief openen. Herlaad de pagina.",
          );
        }
      }
    };
    void acquire();
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      releaseLock?.();
    };
  }, [variantId, org.id, org.role]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);
  const send = async (cmd: NonNullable<typeof pending.current>) => {
    setBusy(true);
    try {
      const result = await api<{ scene: Scene }>(
        "/variants/" + variantId + "/commands",
        org.id,
        cmd,
      );
      pending.current = null;
      useEditor.getState().setPending(false);
      setScene(result.scene);
      setError("");
      setNotice("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const command = (ops: Operation[], history = true) => {
    if (!scene || busy || pending.current || !lease) return;
    try {
      const next =
        ops.length === 1 &&
        (ops[0]?.type === "RestoreRevision" ||
          ops[0]?.type === "PlaceLibraryItem")
          ? scene
          : applyOperations(scene, ops);
      const cmd = {
        commandId: crypto.randomUUID(),
        baseRevision: scene.revision,
        leaseId: leaseId.current,
        operations: ops,
      };
      if (history) {
        setUndo((h) => [...h.slice(-49), scene]);
        setRedo([]);
      }
      setScene(next);
      pending.current = cmd;
      useEditor.getState().setPending(true);
      void send(cmd);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const history = (direction: "undo" | "redo") => {
    if (!scene || pending.current) return;
    const stack = direction === "undo" ? undo : redo,
      target = stack.at(-1);
    if (!target) return;
    if (direction === "undo") {
      setUndo((h) => h.slice(0, -1));
      setRedo((h) => [...h, scene]);
    } else {
      setRedo((h) => h.slice(0, -1));
      setUndo((h) => [...h, scene]);
    }
    command([{ type: "RestoreContent", content: contentOf(target) }], false);
  };
  const add = (kind: Item["kind"]) => {
    const defaults = {
      sofa: {
        name: "Bank · nieuw",
        width: 2400,
        depth: 950,
        height: 780,
        color: "#c4b39d",
      },
      table: {
        name: "Tafel · nieuw",
        width: 1600,
        depth: 900,
        height: 750,
        color: "#ae8961",
      },
      cabinet: {
        name: "Kast · nieuw",
        width: 1200,
        depth: 450,
        height: 1800,
        color: "#72806b",
      },
      light: {
        name: "Lichtpunt",
        width: 150,
        depth: 150,
        height: 2400,
        color: "#dfb85e",
      },
    }[kind];
    const item = {
      ...defaults,
      id: crypto.randomUUID(),
      kind,
      x: 3000,
      y: 2400,
      rotation: 0,
      custom: false,
    };
    command([{ type: "PlaceItem", item }]);
    select(item.id);
  };
  const download = async () => {
    setError("");
    try {
      const r = await fetch("/api/v1/variants/" + variantId + "/plan.svg", {
        headers: { "x-organization-id": org.id },
      });
      if (!r.ok) throw new Error((await r.json()).message);
      saveBlob(await r.blob(), "ontwerpblad-1-50.svg");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (query.isPending || (!scene && !query.isError))
    return <div className="center">Ontwerp laden…</div>;
  if (query.isError || !scene)
    return (
      <div className="center">
        <h2>Ontwerp niet beschikbaar</h2>
        <p>{query.error?.message}</p>
        <button onClick={() => void navigate({ to: "/" })}>
          Terug naar projecten
        </button>
      </div>
    );
  const item = scene.items.find((i) => i.id === selected);
  const disabled = busy || !!pending.current || !lease || !canWrite(org.role);
  return (
    <main className="editor">
      <div className="editor-heading">
        <button
          className="back"
          aria-label="Terug naar projecten"
          onClick={() => {
            if (pending.current) {
              setError(
                "Bewaar eerst je lokale herstelbestand of rond het opslaan af.",
              );
              return;
            }
            void navigate({ to: "/" });
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="breadcrumb">
            Project <ChevronRight size={12} />{" "}
            <VariantName organizationId={org.id} variantId={variantId} />
          </div>
          <h1>De ruimte vormgeven</h1>
        </div>
        <div className="view-switch">
          <button
            className={view === "2d" ? "active" : ""}
            onClick={() => setView("2d")}
          >
            <Layers size={15} />
            Plattegrond
          </button>
          <button
            className={view === "3d" ? "active" : ""}
            onClick={() => setView("3d")}
          >
            <Box size={15} />
            3D bekijken
          </button>
        </div>
        <button
          className="subtle"
          onClick={() => void download()}
          disabled={!!pending.current}
        >
          <Download size={16} />
          Planblad SVG
        </button>
      </div>
      <div className="tools">
        <div className="toolset">
          {(
            [
              { id: "select", icon: MousePointer2, label: "Selecteren" },
              { id: "wall", icon: BrickWall, label: "Muur" },
              { id: "door", icon: DoorOpen, label: "Deur" },
              { id: "window", icon: AppWindow, label: "Raam" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              className={tool === t.id ? "active" : ""}
              disabled={disabled || view === "3d"}
              onClick={() => setTool(t.id)}
            >
              <t.icon size={17} />
              {t.label}
            </button>
          ))}
        </div>
        <div className="toolset">
          <button
            disabled={disabled || !undo.length}
            aria-label="Ongedaan maken"
            onClick={() => history("undo")}
          >
            <Undo2 size={17} />
          </button>
          <button
            disabled={disabled || !redo.length}
            aria-label="Opnieuw uitvoeren"
            onClick={() => history("redo")}
          >
            <Redo2 size={17} />
          </button>
        </div>
        <span className="tools-spacer" />
        <Variants
          organizationId={org.id}
          variantId={variantId}
          revision={scene.revision}
          disabled={disabled}
          pending={!!pending.current}
        />
        <RevisionHistory
          organizationId={org.id}
          variantId={variantId}
          revision={scene.revision}
          disabled={disabled}
          onRestore={(id) =>
            command([{ type: "RestoreRevision", revisionId: id }])
          }
        />
        <button
          disabled={disabled}
          onClick={async () => {
            try {
              await api("/variants/" + variantId + "/revisions", org.id, {
                name: "Bewaard ontwerp · revisie " + scene.revision,
              });
              setNotice(
                "Benoemde revisie " +
                  scene.revision +
                  " is onveranderlijk bewaard.",
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Save size={16} />
          Revisie bewaren
        </button>
      </div>
      {(error || leaseError || notice) && (
        <div
          className={
            error || leaseError ? "editor-message error" : "editor-message"
          }
          role={error || leaseError ? "alert" : "status"}
        >
          {error || leaseError || notice}
          {pending.current && (
            <>
              <button
                disabled={busy}
                onClick={() => pending.current && void send(pending.current)}
              >
                Opnieuw opslaan
              </button>
              <button
                onClick={() =>
                  saveBlob(
                    new Blob([JSON.stringify(scene, null, 2)], {
                      type: "application/json",
                    }),
                    "lokaal-herstel.json",
                  )
                }
              >
                Herstelbestand downloaden
              </button>
              <button
                onClick={() => {
                  pending.current = null;
                  useEditor.getState().setPending(false);
                  void query.refetch();
                  setError("");
                }}
              >
                Lokale wijzigingen verwerpen en herladen
              </button>
            </>
          )}
        </div>
      )}
      <div className="editor-body">
        <aside className="library">
          <div className="panel-heading">
            <h2>Je ontwerp</h2>
            <Layers size={16} />
          </div>
          <div className="floor-label">
            <span className="tiny-square" />
            Begane grond<span>00</span>
          </div>
          <RoomSummary scene={scene} />
          <LibraryPanel
            organizationId={org.id}
            canEdit={canWrite(org.role)}
            disabled={disabled}
            onPlace={(versionId) => {
              const id = crypto.randomUUID();
              command([
                {
                  type: "PlaceLibraryItem",
                  id,
                  versionId,
                  x: 2000,
                  y: 2000,
                  rotation: 0,
                },
              ]);
              select(id);
            }}
          />
          <span className="eyebrow">MEUBELS TOEVOEGEN</span>
          <div className="library-grid">
            {(
              [
                { kind: "sofa", label: "Bank", icon: Sofa },
                { kind: "table", label: "Tafel", icon: Grid2X2 },
                { kind: "cabinet", label: "Kast", icon: Layers },
                { kind: "light", label: "Lichtpunt", icon: Plus },
              ] as const
            ).map((x) => (
              <button
                key={x.kind}
                disabled={disabled}
                onClick={() => add(x.kind)}
              >
                <x.icon size={26} strokeWidth={1.2} />
                <span>{x.label}</span>
                <small>
                  {x.kind === "sofa" ? "2.400 × 950 mm" : "Vaste basismaat"}
                </small>
              </button>
            ))}
          </div>
          <div className="objects-heading">
            <span className="eyebrow">OBJECTEN</span>
            <span>
              {scene.walls.length + scene.items.length + scene.openings.length}
            </span>
          </div>
          <div className="object-list">
            {scene.items.map((i) => (
              <button
                className={selected === i.id ? "selected" : ""}
                key={i.id}
                onClick={() => select(i.id)}
              >
                <span className="color-dot" style={{ background: i.color }} />
                {i.name}
              </button>
            ))}
            {scene.walls.map((w, i) => (
              <button
                key={w.id}
                className={selected === w.id ? "selected" : ""}
                onClick={() => select(w.id)}
              >
                <BrickWall size={14} />
                Muur {i + 1}
              </button>
            ))}
            {scene.openings.map((o, i) => (
              <button
                key={o.id}
                className={selected === o.id ? "selected" : ""}
                onClick={() => select(o.id)}
              >
                <DoorOpen size={14} />
                {o.kind === "door" ? "Deur" : "Raam"} {i + 1}
              </button>
            ))}
          </div>
        </aside>
        <section className="drawing">
          {view === "2d" ? (
            <PlanCanvas scene={scene} onCommand={command} disabled={disabled} />
          ) : (
            <ViewError>
              <Suspense
                fallback={<div className="center">3D-weergave openen…</div>}
              >
                <Viewer scene={scene} />
              </Suspense>
            </ViewError>
          )}
        </section>
        <aside className="properties">
          <div className="panel-heading">
            <h2>Eigenschappen</h2>
            <MousePointer2 size={15} />
          </div>
          {item ? (
            <ItemProperties
              key={
                item.id +
                ":" +
                item.width +
                ":" +
                item.rotation +
                ":" +
                item.x +
                ":" +
                item.y
              }
              item={item}
              disabled={disabled}
              onCommand={command}
            />
          ) : selected &&
            (scene.walls.some((w) => w.id === selected) ||
              scene.openings.some((o) => o.id === selected)) ? (
            <StructureProperties
              key={selected + ":" + scene.revision}
              scene={scene}
              selected={selected}
              disabled={disabled}
              onCommand={command}
            />
          ) : (
            <div className="property-empty">
              <MousePointer2 size={27} strokeWidth={1} />
              <h3>{selected ? "Object geselecteerd" : "Elk detail telt."}</h3>
              <p>
                {selected
                  ? "Dit object kun je verwijderen via de knop hieronder."
                  : "Selecteer een meubel in je plattegrond of objectlijst om de exacte maten aan te passen."}
              </p>
            </div>
          )}
          {selected && (
            <button
              className="delete"
              disabled={disabled}
              onClick={() => {
                command([{ type: "DeleteSelection", ids: [selected] }]);
                select(null);
              }}
            >
              <Trash2 size={15} />
              Object verwijderen
            </button>
          )}
          <div className="property-tip">
            <span className="eyebrow">PRECIES OP MAAT</span>
            <p>
              Alle ontwerpafmetingen worden in millimeters bewaard. Inzoomen
              verandert de fysieke maat niet.
            </p>
          </div>
        </aside>
      </div>
      <footer className="statusbar">
        <span>
          <span className={"status-dot " + (disabled ? "muted" : "")} />
          {busy
            ? "Synchroniseren…"
            : pending.current
              ? "Niet opgeslagen · lokaal werk in dit venster"
              : lease
                ? "Server opgeslagen"
                : "Leesmodus"}
          <span className="status-revision">Revisie {scene.revision}</span>
        </span>
        <div>
          <button className={grid ? "active" : ""} onClick={toggleGrid}>
            <Grid2X2 size={13} />
            {grid ? "Raster snap · 100 mm" : "Vrij plaatsen"}
          </button>
          <span>mm</span>
          <button aria-label="Uitzoomen" onClick={() => setZoom(zoom / 1.2)}>
            −
          </button>
          <span>{Math.round((zoom / 0.09) * 100)}%</span>
          <button aria-label="Inzoomen" onClick={() => setZoom(zoom * 1.2)}>
            +
          </button>
        </div>
      </footer>
    </main>
  );
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ItemProperties({
  item,
  disabled,
  onCommand,
}: {
  item: Item;
  disabled: boolean;
  onCommand: (ops: Operation[]) => void;
}) {
  const [error, setError] = useState("");
  return (
    <div className="item-properties">
      <span className="eyebrow">MEUBEL</span>
      <h3>{item.name}</h3>
      {item.libraryRef && (
        <p className="small">
          Bibliotheek · versie {item.libraryRef.version}. Deze plaatsing houdt
          haar opgeslagen maten.
        </p>
      )}
      {item.catalog && <div className="small" aria-label="Opgeslagen productgegevens">
        {item.catalog.category && <p>Categorie: {item.catalog.category}</p>}
        {item.catalog.supplier && <p>Leverancier: {item.catalog.supplier}</p>}
        {item.catalog.sku && <p>Artikelnummer: {item.catalog.sku}</p>}
        {item.catalog.description && <p>{item.catalog.description}</p>}
      </div>}
      <div className="material-chip">
        <span style={{ background: item.color }} />
        Basismateriaal
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const value = (name: string) =>
              Math.round(parseDutchNumber(String(f.get(name))));
            onCommand([
              {
                type: "TransformItem",
                id: item.id,
                x: value("x"),
                y: value("y"),
                width: value("width"),
                depth: value("depth"),
                rotation: parseDutchNumber(String(f.get("rotation"))),
                custom: f.get("custom") === "on",
              },
            ]);
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="property-row">
          <label>
            Breedte <span>mm</span>
            <input
              name="width"
              aria-label="Breedte"
              defaultValue={item.width}
              inputMode="decimal"
            />
          </label>
          <label>
            Diepte <span>mm</span>
            <input
              name="depth"
              aria-label="Diepte"
              defaultValue={item.depth}
              inputMode="decimal"
            />
          </label>
        </div>
        <div className="property-row">
          <label>
            Positie X <span>mm</span>
            <input
              name="x"
              aria-label="Positie X"
              defaultValue={item.x}
              inputMode="decimal"
            />
          </label>
          <label>
            Positie Y <span>mm</span>
            <input
              name="y"
              aria-label="Positie Y"
              defaultValue={item.y}
              inputMode="decimal"
            />
          </label>
        </div>
        <label>
          Rotatie <span>°</span>
          <input
            name="rotation"
            aria-label="Rotatie"
            defaultValue={item.rotation}
            inputMode="decimal"
          />
        </label>
        <label className="check-label">
          <input type="checkbox" name="custom" defaultChecked={item.custom} />
          Maatwerk toestaan
        </label>
        <p className="small">Afwijken van de handelsmaat vereist maatwerk.</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button disabled={disabled} className="primary">
          <Check size={15} />
          Toepassen
        </button>
      </form>
      <button
        className="subtle full"
        disabled={disabled}
        onClick={() =>
          onCommand([
            {
              type: "PlaceItem",
              item: {
                ...item,
                id: crypto.randomUUID(),
                x: item.x + 300,
                y: item.y + 300,
              },
            },
          ])
        }
      >
        <Copy size={14} />
        Dupliceren
      </button>
      <button
        className="subtle full"
        disabled={disabled}
        onClick={() =>
          onCommand([
            {
              type: "TransformItem",
              id: item.id,
              x: item.x,
              y: item.y,
              width: item.width,
              depth: item.depth,
              rotation: (item.rotation + 90) % 360,
              custom: item.custom,
            },
          ])
        }
      >
        <RotateCw size={14} />
        90° draaien
      </button>
    </div>
  );
}
function Security() {
  const me = qc.getQueryData<Me>(["me"])!;
  return (
    <SecurityPanel
      enabled={me.user.twoFactorEnabled}
      onChanged={() => void qc.invalidateQueries({ queryKey: ["me"] })}
    />
  );
}
function Access() {
  const org = useContext(WorkspaceContext)!;
  return <AccessPanel organizationId={org.id} role={org.role} />;
}
const rootRoute = createRootRoute({ component: App });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Projects,
});
const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ontwerp/$variantId",
  component: () => {
    const { variantId } = editorRoute.useParams();
    return <Editor key={variantId} />;
  },
});
const probeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proef",
  component: Probe,
});
const accessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/toegang",
  component: Access,
});
const invitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/uitnodiging",
  component: InvitationPage,
});
const securityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/beveiliging",
  component: Security,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    editorRoute,
    probeRoute,
    accessRoute,
    invitationRoute,
    securityRoute,
  ]),
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
