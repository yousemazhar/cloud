import { Component, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type {
  Comment,
  Priority,
  Project,
  Task,
  TaskDetail,
  TaskStatus,
  Team,
  User
} from "@mini-jira/shared";
import { PRIORITY_LABELS, STATUS_LABELS, TASK_STATUSES } from "@mini-jira/shared";
import { api, type AppData, type CreateTaskPayload, type TaskFilters } from "./api";

/* ---------- mappings between backend shapes and the Atlassian-style UI ---------- */

const STATUS_CLASS: Record<TaskStatus, string> = {
  todo: "status-todo",
  in_progress: "status-prog",
  in_review: "status-review",
  done: "status-done"
};

const PRIORITY_COLOR: Record<Priority, string> = {
  low: "#4bce97",
  medium: "#e2a000",
  high: "#f15b50",
  urgent: "#ca3521"
};

const AVATAR_PALETTE = ["#4c9aff", "#85b8ff", "#2bb3a3", "#e774bb", "#fea362", "#8270db", "#22a06b", "#f15b50"];

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const STATUS_ORDER: TaskStatus[] = TASK_STATUSES;

const emptyData: AppData = { teams: [], users: [], projects: [], tasks: [], summaries: [] };
const defaultCreateForm: CreateTaskPayload = {
  title: "",
  description: "",
  priority: "medium",
  deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  teamId: "",
  assigneeId: "",
  projectId: ""
};

/* ---------- error boundary ---------- */

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="login">
          <div className="login-card">
            <h1 className="login-title">Something went wrong</h1>
            <div className="login-sub">{this.state.error.message}</div>
            <button className="login-btn" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

/* ---------- icon library (subset of the design's icons.jsx) ---------- */

type IconName =
  | "search" | "bell" | "help" | "settings" | "apps"
  | "chevron-down" | "chevron-right" | "plus" | "x" | "more"
  | "star" | "share" | "filter" | "calendar" | "user" | "users"
  | "board" | "timeline" | "backlog" | "reports" | "issues"
  | "code" | "rocket" | "page" | "link" | "attach" | "image"
  | "upload" | "check" | "eye" | "trend-up" | "logout" | "alert" | "trash";

interface IconProps { name: IconName; size?: number; strokeWidth?: number; className?: string; style?: CSSProperties }

function Icon({ name, size = 16, strokeWidth = 1.7, className, style }: IconProps) {
  const p = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    className, style
  };
  switch (name) {
    case "search": return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
    case "bell": return <svg {...p}><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/></svg>;
    case "help": return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 2.5-3 4.5"/></svg>;
    case "settings": return <svg {...p}><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/></svg>;
    case "apps": return <svg {...p}><circle cx="5" cy="5" r="1.2" fill="currentColor"/><circle cx="12" cy="5" r="1.2" fill="currentColor"/><circle cx="19" cy="5" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/><circle cx="5" cy="19" r="1.2" fill="currentColor"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/><circle cx="19" cy="19" r="1.2" fill="currentColor"/></svg>;
    case "chevron-down": return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
    case "chevron-right": return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>;
    case "plus": return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case "x": return <svg {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case "more": return <svg {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/></svg>;
    case "star": return <svg {...p}><polygon points="12,2 14.6,9 22,9 16,13.5 18.2,21 12,16.8 5.8,21 8,13.5 2,9 9.4,9"/></svg>;
    case "share": return <svg {...p}><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7"/><polyline points="16 6 12 2 8 6"/><path d="M12 2v14"/></svg>;
    case "filter": return <svg {...p}><path d="M3 4h18M6 12h12M10 20h4"/></svg>;
    case "calendar": return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>;
    case "user": return <svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>;
    case "users": return <svg {...p}><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><circle cx="17" cy="8" r="3"/><path d="M22 19c0-3-2-5-5-5"/></svg>;
    case "board": return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/></svg>;
    case "timeline": return <svg {...p}><path d="M3 6h12M3 12h18M3 18h8"/></svg>;
    case "backlog": return <svg {...p}><path d="M3 6h18M3 12h18M3 18h18"/></svg>;
    case "reports": return <svg {...p}><path d="M3 20h18"/><path d="M6 20V10M11 20V4M16 20v-7M21 20v-4"/></svg>;
    case "issues": return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16v.01"/></svg>;
    case "code": return <svg {...p}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
    case "rocket": return <svg {...p}><path d="M5 19l3-3M9 11l4 4m-3.5-7.5L14 12l4-1c2-1 3-3 3-6 0-1-1-2-2-2-3 0-5 1-6 3l-1 4-2-1.5z"/></svg>;
    case "page": return <svg {...p}><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="14 3 14 9 20 9"/></svg>;
    case "link": return <svg {...p}><path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1.5-1.5"/></svg>;
    case "attach": return <svg {...p}><path d="M21 11l-9 9a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8.5-8.5"/></svg>;
    case "image": return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5L8 19"/></svg>;
    case "upload": return <svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><path d="M12 3v12"/></svg>;
    case "check": return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>;
    case "eye": return <svg {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "trend-up": return <svg {...p}><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>;
    case "logout": return <svg {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><path d="M21 12H9"/></svg>;
    case "alert": return <svg {...p}><path d="M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17v.01"/></svg>;
    case "trash": return <svg {...p}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14"/></svg>;
    default: return <svg {...p}/>;
  }
}

function MJLogo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="mj-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#85b8ff"/>
          <stop offset="100%" stopColor="#2684ff"/>
        </linearGradient>
      </defs>
      <path d="M16 2 L30 16 L16 30 L2 16 Z" fill="url(#mj-grad)"/>
      <path d="M9 12 L9 20 L12 20 L12 15 L14 18 L16 15 L16 20 L19 20 L19 12 L16 12 L14 14.5 L12 12 Z" fill="white"/>
    </svg>
  );
}

function Avatar({ user, size = "" }: { user?: { id: string; name: string } | null; size?: "" | "sm" }) {
  if (!user) {
    return <div className={`avatar ${size}`} style={{ background: "var(--surface-3)", color: "var(--text-3)" }}>?</div>;
  }
  return (
    <div className={`avatar ${size}`} style={{ background: colorFor(user.id) }}>{initials(user.name)}</div>
  );
}

/* ---------- top-level App ---------- */

type Screen = "board" | "dashboard" | "projects" | "admin";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<AppData>(emptyData);
  const [filters, setFilters] = useState<TaskFilters>({});
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [screen, setScreen] = useState<Screen>("board");
  const [creating, setCreating] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  const isManager = user?.role === "manager" || user?.role === "admin";
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      setUser(null);
      setData(emptyData);
      setSelectedTask(null);
      setToast("Your session expired. Please sign in again.");
    });
  }, []);

  useEffect(() => {
    if (!api.token) { setLoading(false); return; }
    api.me()
      .then((res) => { setUser(res.user); return load(); })
      .catch((error) => { setToast(error instanceof Error ? error.message : "Sign-in failed"); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  async function load(filtersOverride: TaskFilters = filters) {
    setLoading(true);
    try {
      const next = await api.loadAppData(filtersOverride);
      setData(next);
      if (!currentProjectId && next.projects.length) setCurrentProjectId(next.projects[0]!.id);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not load data");
    } finally {
      setLoading(false);
    }
  }

  async function openTask(taskId: string) {
    try {
      const res = await api.getTask(taskId);
      setSelectedTask(res.task);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not open task");
    }
  }

  async function refreshTaskDetail(taskId: string) {
    try {
      const res = await api.getTask(taskId);
      setSelectedTask(res.task);
    } catch {/* ignore — close the modal if it was deleted */ }
  }

  async function handleStatusChange(taskId: string, status: TaskStatus) {
    try {
      await api.updateTask(taskId, { status });
      await load();
      await refreshTaskDetail(taskId);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not update status");
    }
  }

  async function handleAddComment(taskId: string, body: string) {
    if (!body.trim()) return;
    try {
      await api.addComment(taskId, body);
      await refreshTaskDetail(taskId);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not add comment");
    }
  }

  async function handleEditComment(commentId: string, body: string, taskId: string) {
    try {
      await api.updateComment(commentId, body);
      await refreshTaskDetail(taskId);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not edit comment");
    }
  }

  async function handleDeleteComment(commentId: string, taskId: string) {
    try {
      await api.deleteComment(commentId);
      await refreshTaskDetail(taskId);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not delete comment");
    }
  }

  async function handleUploadImage(taskId: string, file: File) {
    try {
      await api.uploadAttachment(taskId, file);
      await refreshTaskDetail(taskId);
      await load();
      setToast("Image uploaded.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Upload failed");
    }
  }

  async function handleDeleteAttachment(taskId: string, attachmentId: string) {
    try {
      await api.deleteAttachment(taskId, attachmentId);
      await refreshTaskDetail(taskId);
      await load();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not delete attachment");
    }
  }

  async function handleCreateTask(payload: CreateTaskPayload) {
    try {
      await api.createTask(payload);
      setCreating(false);
      await load();
      setToast("Task created.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not create task");
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm("Delete this task? This can't be undone.")) return;
    try {
      await api.deleteTask(taskId);
      setSelectedTask(null);
      await load();
      setToast("Task deleted.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not delete task");
    }
  }

  function logout() {
    api.clearToken();
    setUser(null);
    setData(emptyData);
    setSelectedTask(null);
  }

  /* --- login screen --- */
  if (!user) {
    return (
      <Login
        onLoggedIn={(loggedIn) => { setUser(loggedIn); load(); }}
        onToast={setToast}
        toast={toast}
      />
    );
  }

  /* --- main shell --- */
  const visibleTasks = data.tasks;
  const currentProject = data.projects.find((p) => p.id === currentProjectId) ?? data.projects[0] ?? null;
  const projectTasks = currentProject ? visibleTasks.filter((t) => t.projectId === currentProject.id) : visibleTasks;

  let content: ReactNode;
  if (screen === "board") {
    content = (
      <BoardScreen
        project={currentProject}
        tasks={projectTasks}
        users={data.users}
        teams={data.teams}
        filters={filters}
        onFilterChange={(next) => { setFilters(next); load(next); }}
        isManager={!!isManager}
        onOpen={(t) => openTask(t.id)}
        onMove={handleStatusChange}
      />
    );
  } else if (screen === "dashboard") {
    content = (
      <DashboardScreen
        user={user}
        data={data}
        onOpenTask={(t) => openTask(t.id)}
        onGoBoard={() => setScreen("board")}
      />
    );
  } else if (screen === "projects") {
    content = (
      <ProjectsScreen
        data={data}
        isManager={!!isManager}
        onOpenProject={(p) => { setCurrentProjectId(p.id); setScreen("board"); }}
        onRefresh={load}
        onToast={setToast}
      />
    );
  } else {
    content = (
      <AdminScreen
        data={data}
        canCreateTeam={!!isManager}
        canManageUsers={!!isAdmin}
        onRefresh={load}
        onToast={setToast}
      />
    );
  }

  return (
    <div className="app">
      <TopNav
        user={user}
        screen={screen}
        onNav={setScreen}
        onCreate={() => setCreating(true)}
        onLogout={logout}
      />
      <div className="app-body">
        <Sidebar project={currentProject} screen={screen} onNav={setScreen} />
        <main className="main">{content}</main>
      </div>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          currentUser={user}
          data={data}
          isManager={!!isManager}
          onClose={() => setSelectedTask(null)}
          onChangeStatus={handleStatusChange}
          onAddComment={handleAddComment}
          onEditComment={handleEditComment}
          onDeleteComment={handleDeleteComment}
          onUploadImage={handleUploadImage}
          onDeleteAttachment={handleDeleteAttachment}
          onDeleteTask={handleDeleteTask}
        />
      )}

      {creating && (
        <CreateTaskModal
          data={data}
          onClose={() => setCreating(false)}
          onCreate={handleCreateTask}
        />
      )}

      {loading && <div className="toast" style={{ background: "var(--surface-3)" }}>Loading…</div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ---------- TopNav ---------- */

interface TopNavProps {
  user: User;
  screen: Screen;
  onNav: (s: Screen) => void;
  onCreate: () => void;
  onLogout: () => void;
}

function TopNav({ user, screen, onNav, onCreate, onLogout }: TopNavProps) {
  return (
    <header className="topnav">
      <button className="topnav-apps" title="Apps"><Icon name="apps" size={20}/></button>
      <div className="topnav-brand">
        <span className="topnav-brand-mark"><MJLogo size={24}/></span>
        Mini-Jira
      </div>
      <nav className="topnav-tabs">
        <TopTab label="Your work" active={screen === "dashboard"} onClick={() => onNav("dashboard")}/>
        <TopTab label="Projects" active={screen === "projects" || screen === "board"} onClick={() => onNav("projects")}/>
        <TopTab label="Board" active={screen === "board"} onClick={() => onNav("board")}/>
        <TopTab label="Teams &amp; users" active={screen === "admin"} onClick={() => onNav("admin")}/>
        <button className="topnav-create" onClick={onCreate}>Create</button>
      </nav>
      <div className="topnav-right">
        <div className="topnav-search">
          <Icon name="search" size={14}/>
          <input placeholder="Search"/>
        </div>
        <button className="topnav-iconbtn" title="Help"><Icon name="help" size={18}/></button>
        <button className="topnav-iconbtn" title="Sign out" onClick={onLogout}><Icon name="logout" size={18}/></button>
        <button className="topnav-avatar" title={user.name} style={{ background: colorFor(user.id) }}>
          {initials(user.name)}
        </button>
      </div>
    </header>
  );
}

function TopTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`topnav-tab ${active ? "is-active" : ""}`} onClick={onClick}>
      {label}<Icon name="chevron-down" size={14} strokeWidth={2.2}/>
    </button>
  );
}

/* ---------- Sidebar ---------- */

function Sidebar({ project, screen, onNav }: { project: Project | null; screen: Screen; onNav: (s: Screen) => void }) {
  return (
    <aside className="sidebar">
      <div className="sb-project">
        <div className="sb-project-mark" style={{ background: project ? colorFor(project.id) : "#4c9aff" }}>
          {project ? initials(project.name) : "MJ"}
        </div>
        <div className="sb-project-info">
          <div className="sb-project-name">{project?.name ?? "Mini-Jira"}</div>
          <div className="sb-project-type">Software project</div>
        </div>
      </div>
      <div className="sb-section">
        <div className="sb-section-title">Planning</div>
        <SbItem icon="board" label="Board" active={screen === "board"} onClick={() => onNav("board")}/>
        <SbItem icon="reports" label="Dashboard" active={screen === "dashboard"} onClick={() => onNav("dashboard")}/>
        <SbItem icon="backlog" label="Projects" active={screen === "projects"} onClick={() => onNav("projects")}/>
        <SbItem icon="users" label="Teams &amp; users" active={screen === "admin"} onClick={() => onNav("admin")}/>
      </div>
      <div className="sb-divider"/>
      <div className="sb-footer">
        Demo deployment on AWS<br/>
        <span className="sb-footer-link">EC2 · DynamoDB · S3 · SNS · CloudFront</span>
      </div>
    </aside>
  );
}

function SbItem({ icon, label, active, onClick }: { icon: IconName; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button className={`sb-item ${active ? "is-active" : ""}`} onClick={onClick}>
      <span className="sb-item-icon"><Icon name={icon} size={16}/></span>
      {label}
    </button>
  );
}

/* ---------- Login ---------- */

interface LoginProps {
  onLoggedIn: (user: User) => void;
  onToast: (msg: string) => void;
  toast: string;
}

function Login({ onLoggedIn, onToast, toast }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const isAws = (import.meta as unknown as { env: { VITE_BACKEND?: string } }).env.VITE_BACKEND === "aws";

  async function demo(userId: string) {
    setBusy(true);
    try {
      const res = await api.demoLogin(userId);
      api.setToken(res.token);
      onLoggedIn(res.user);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Demo login failed");
    } finally {
      setBusy(false);
    }
  }

  async function cognito() {
    if (!email.trim() || !password) { onToast("Email and password are required."); return; }
    setBusy(true);
    try {
      const res = await api.cognitoLogin(email.trim(), password);
      api.setToken(res.token);
      onLoggedIn(res.user);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-mark"><MJLogo size={44}/></div>
        <h1 className="login-title">Sign in to Mini-Jira</h1>
        <div className="login-sub">Sign in with AWS Cognito to continue.</div>

        <div className="field-stack">
          <label>Email</label>
          <input className="input" type="email" placeholder="you@minijira.io" value={email}
                 onChange={(e) => setEmail(e.target.value)} disabled={busy}/>
        </div>
        <div className="field-stack">
          <label>Password</label>
          <input className="input" type="password" placeholder="••••••••" value={password}
                 onChange={(e) => setPassword(e.target.value)} disabled={busy}/>
        </div>
        <button className="login-btn" onClick={cognito} disabled={busy}>
          {isAws ? "Continue" : "Cognito sign-in (AWS mode)"}
        </button>

        <div className="login-personas">
          <div className="login-personas-title">— or use a demo persona —</div>
          {[
            { id: "user-ali", name: "Ali Hassan", role: "Manager · all teams" },
            { id: "user-sara", name: "Sara Mostafa", role: "Employee · Frontend" },
            { id: "user-omar", name: "Omar Khaled", role: "Employee · Backend" },
            { id: "user-jess", name: "Jess Admin", role: "Admin" }
          ].map((u) => (
            <div key={u.id} className="persona-row" onClick={() => demo(u.id)}>
              <Avatar user={u}/>
              <div className="persona-info">
                <div className="persona-name">{u.name}</div>
                <div className="persona-meta">{u.role}</div>
              </div>
              <Icon name="chevron-right" size={14}/>
            </div>
          ))}
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ---------- Board ---------- */

interface BoardProps {
  project: Project | null;
  tasks: Task[];
  users: User[];
  teams: Team[];
  filters: TaskFilters;
  isManager: boolean;
  onFilterChange: (filters: TaskFilters) => void;
  onOpen: (task: Task) => void;
  onMove: (taskId: string, status: TaskStatus) => void;
}

function BoardScreen(props: BoardProps) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);

  function onDragStart(taskId: string) { setDrag(taskId); }
  function onDragEnd() { setDrag(null); setOver(null); }
  function onDragOver(status: TaskStatus) {
    return (e: React.DragEvent) => { e.preventDefault(); setOver(status); };
  }
  function onDrop(status: TaskStatus) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      if (drag) props.onMove(drag, status);
      setDrag(null); setOver(null);
    };
  }

  const f = props.filters;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><a>Projects</a>{props.project && <><span style={{ color: "var(--text-4)" }}>/</span><span style={{ color: "var(--text-2)" }}>{props.project.name}</span></>}</div>
          <h1 className="page-title">Board</h1>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost"><Icon name="share" size={14}/> Share</button>
        </div>
      </div>

      <div className="filters">
        <div className="filter-search">
          <Icon name="search" size={14}/>
          <input placeholder="Search"/>
        </div>
        {props.isManager && (
          <select className="dropdown" value={f.teamId ?? ""}
                  onChange={(e) => props.onFilterChange({ ...f, teamId: e.target.value || undefined })}>
            <option value="">All teams</option>
            {props.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <select className="dropdown" value={f.assigneeId ?? ""}
                onChange={(e) => props.onFilterChange({ ...f, assigneeId: e.target.value || undefined })}>
          <option value="">All assignees</option>
          {props.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="dropdown" value={f.priority ?? ""}
                onChange={(e) => props.onFilterChange({ ...f, priority: (e.target.value || undefined) as Priority | undefined })}>
          <option value="">Any priority</option>
          {(["urgent", "high", "medium", "low"] as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
        </select>
        <span className="spacer"/>
      </div>

      <div className="board-wrap">
        <div className="board">
          {STATUS_ORDER.map((s) => {
            const colTasks = props.tasks.filter((t) => t.status === s);
            return (
              <div key={s} className="col">
                <div className="col-head">
                  <span>{STATUS_LABELS[s]}</span>
                  <span className="count">{colTasks.length}</span>
                  <span className="col-head-spacer"/>
                  <button className="topnav-iconbtn" style={{ width: 24, height: 24 }} title="Column actions">
                    <Icon name="more" size={16}/>
                  </button>
                </div>
                <div className={`col-body ${over === s ? "drop-over" : ""}`}
                     onDragOver={onDragOver(s)} onDrop={onDrop(s)}>
                  {colTasks.length === 0 && <div className="col-empty">Drop tasks here</div>}
                  {colTasks.map((t) => (
                    <KanbanCard key={t.id} task={t} users={props.users}
                                onOpen={() => props.onOpen(t)}
                                onDragStart={() => onDragStart(t.id)}
                                onDragEnd={onDragEnd}
                                dragging={drag === t.id}/>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function KanbanCard({ task, users, onOpen, onDragStart, onDragEnd, dragging }: {
  task: Task; users: User[]; onOpen: () => void; onDragStart: () => void; onDragEnd: () => void; dragging: boolean;
}) {
  const assignee = users.find((u) => u.id === task.assigneeId);
  const active = task.attachments.find((a) => a.active);
  return (
    <div className={`card ${dragging ? "dragging" : ""}`} draggable
         onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen}>
      {active && <div className="card-image" style={{ backgroundImage: `url(${active.url})` }}/>}
      <div className="card-title">{task.title}</div>
      <div className="card-meta">
        <span className="card-id">
          <span className="card-id-mark"><Icon name="check" size={9} strokeWidth={3}/></span>
          {task.id.slice(0, 8)}
        </span>
        <span className="card-spacer"/>
        <PriorityChip priority={task.priority}/>
        <Avatar user={assignee} size="sm"/>
      </div>
    </div>
  );
}

function PriorityChip({ priority }: { priority: Priority }) {
  return (
    <span className="prio" title={PRIORITY_LABELS[priority]} style={{ color: PRIORITY_COLOR[priority] }}>
      <Icon name={priority === "urgent" || priority === "high" ? "trend-up" : priority === "medium" ? "alert" : "trend-up"} size={14} strokeWidth={2.4}/>
    </span>
  );
}

/* ---------- Task detail modal ---------- */

interface TaskDetailModalProps {
  task: TaskDetail;
  currentUser: User;
  data: AppData;
  isManager: boolean;
  onClose: () => void;
  onChangeStatus: (taskId: string, status: TaskStatus) => void;
  onAddComment: (taskId: string, body: string) => void;
  onEditComment: (commentId: string, body: string, taskId: string) => void;
  onDeleteComment: (commentId: string, taskId: string) => void;
  onUploadImage: (taskId: string, file: File) => void;
  onDeleteAttachment: (taskId: string, attachmentId: string) => void;
  onDeleteTask: (taskId: string) => void;
}

function TaskDetailModal(p: TaskDetailModalProps) {
  const [tab, setTab] = useState<"comments" | "history">("comments");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const assignee = p.data.users.find((u) => u.id === p.task.assigneeId);
  const team = p.data.teams.find((t) => t.id === p.task.teamId);
  const project = p.data.projects.find((pr) => pr.id === p.task.projectId);
  const active = p.task.attachments.find((a) => a.active);
  const olderVersions = p.task.attachments.filter((a) => !a.active);

  return (
    <div className="modal-backdrop" onClick={p.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="card-id-mark"><Icon name="check" size={9} strokeWidth={3}/></span>
            <span style={{ color: "var(--text-3)" }}>{project?.name ?? "—"} /</span>
            <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{p.task.id.slice(0, 12)}</span>
          </span>
          <span style={{ flex: 1 }}/>
          {p.isManager && (
            <button className="btn btn-ghost sm" title="Delete task" onClick={() => p.onDeleteTask(p.task.id)}>
              <Icon name="trash" size={14}/>
            </button>
          )}
          <button className="btn btn-ghost sm" onClick={p.onClose} title="Close"><Icon name="x" size={16}/></button>
        </div>

        <div className="modal-body">
          <div className="modal-main">
            <h2 className="modal-task-title">{p.task.title}</h2>

            <div className="section-label">Description</div>
            <div style={{ color: "var(--text-2)", lineHeight: 1.55 }}>
              {p.task.description || <span style={{ color: "var(--text-4)" }}>No description.</span>}
            </div>

            {active && (
              <>
                <div className="section-label">
                  Attachments{" "}
                  <span style={{ color: "var(--text-4)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                    (1 active{olderVersions.length ? `, ${olderVersions.length} older` : ""})
                  </span>
                </div>
                <div className="attachment">
                  <div className="attachment-img" style={{ backgroundImage: `url(${active.url})` }}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "var(--text)", fontWeight: 500 }}>{active.fileName}</div>
                    <div style={{ color: "var(--text-3)", fontSize: 12 }}>
                      {(active.size / 1024).toFixed(0)} KB · uploaded {new Date(active.uploadedAt).toLocaleDateString()}
                      {olderVersions.length > 0 && " · prior versions retained in S3"}
                    </div>
                  </div>
                  <button className="btn btn-ghost sm" onClick={() => p.onDeleteAttachment(p.task.id, active.id)} title="Delete">
                    <Icon name="trash" size={14}/>
                  </button>
                </div>
              </>
            )}

            <div style={{ marginTop: 12 }}>
              <button className="btn sm" onClick={() => fileInputRef.current?.click()}>
                <Icon name="upload" size={14}/> {active ? "Replace image" : "Upload image"}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
                     onChange={(e) => {
                       const file = e.target.files?.[0];
                       if (file) p.onUploadImage(p.task.id, file);
                       e.target.value = "";
                     }}/>
            </div>

            <div style={{ marginTop: 20, borderBottom: "1px solid var(--border)", display: "flex", gap: 4 }}>
              <button className={`tab ${tab === "comments" ? "is-active" : ""}`} onClick={() => setTab("comments")}>Comments</button>
              <button className={`tab ${tab === "history" ? "is-active" : ""}`} onClick={() => setTab("history")}>History</button>
            </div>

            {tab === "comments" ? (
              <div style={{ padding: "12px 0" }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                  <Avatar user={p.currentUser}/>
                  <div style={{ flex: 1 }}>
                    <textarea className="comment-input" rows={2} value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              placeholder="Add a comment…"/>
                    <div style={{ marginTop: 6 }}>
                      <button className="btn btn-primary sm"
                              onClick={() => { p.onAddComment(p.task.id, draft); setDraft(""); }}
                              disabled={!draft.trim()}>Comment</button>
                    </div>
                  </div>
                </div>
                {p.task.comments.length === 0 && (
                  <div style={{ color: "var(--text-4)", padding: "12px 0", fontSize: 13 }}>No comments yet.</div>
                )}
                {p.task.comments.map((c: Comment) => {
                  const author = p.data.users.find((u) => u.id === c.authorId);
                  const canEdit = c.authorId === p.currentUser.id || p.isManager;
                  return (
                    <div key={c.id} className="comment">
                      <Avatar user={author}/>
                      <div className="comment-body">
                        <div className="comment-head">
                          <span className="comment-name">{author?.name ?? "Unknown"}</span>
                          <span className="comment-time">{new Date(c.createdAt).toLocaleString()}</span>
                          {c.updatedAt && <span className="comment-time">(edited)</span>}
                          <span style={{ flex: 1 }}/>
                          {canEdit && editingId !== c.id && (
                            <>
                              <button className="btn btn-ghost sm" onClick={() => { setEditingId(c.id); setEditingDraft(c.body); }}>Edit</button>
                              <button className="btn btn-ghost sm" onClick={() => p.onDeleteComment(c.id, p.task.id)}>Delete</button>
                            </>
                          )}
                        </div>
                        {editingId === c.id ? (
                          <>
                            <textarea className="comment-input" rows={2} value={editingDraft}
                                      onChange={(e) => setEditingDraft(e.target.value)}/>
                            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                              <button className="btn btn-primary sm" onClick={() => { p.onEditComment(c.id, editingDraft, p.task.id); setEditingId(null); }}>Save</button>
                              <button className="btn btn-ghost sm" onClick={() => setEditingId(null)}>Cancel</button>
                            </div>
                          </>
                        ) : (
                          <div className="comment-text">{c.body}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: "12px 0" }}>
                {p.task.auditLogs.length === 0 && (
                  <div style={{ color: "var(--text-4)", padding: "12px 0", fontSize: 13 }}>No history yet.</div>
                )}
                {p.task.auditLogs.map((entry) => {
                  const actor = p.data.users.find((u) => u.id === entry.actorId);
                  return (
                    <div key={entry.id} style={{ display: "flex", gap: 12, padding: "8px 0", fontSize: 13 }}>
                      <Avatar user={actor} size="sm"/>
                      <div style={{ color: "var(--text-2)" }}>
                        <b style={{ color: "var(--text)" }}>{actor?.name ?? "?"}</b>{" "}
                        changed status from <b>{STATUS_LABELS[entry.fromStatus]}</b> to <b>{STATUS_LABELS[entry.toStatus]}</b>
                        <span style={{ color: "var(--text-3)", marginLeft: 8 }}>· {new Date(entry.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="modal-side">
            <div style={{ marginBottom: 12 }}>
              <StatusMenu value={p.task.status} onChange={(s) => p.onChangeStatus(p.task.id, s)}/>
            </div>
            <div className="section-label" style={{ margin: "0 0 4px" }}>Details</div>
            <div className="field-row">
              <div className="field-label">Assignee</div>
              <div className="field-value"><Avatar user={assignee} size="sm"/><span>{assignee?.name ?? "—"}</span></div>
            </div>
            <div className="field-row">
              <div className="field-label">Team</div>
              <div className="field-value">
                <span className="label-chip" style={{ background: (team ? colorFor(team.id) : "#666") + "26", color: team ? colorFor(team.id) : "var(--text)" }}>{team?.name ?? "—"}</span>
              </div>
            </div>
            <div className="field-row">
              <div className="field-label">Priority</div>
              <div className="field-value"><PriorityChip priority={p.task.priority}/><span style={{ textTransform: "capitalize" }}>{PRIORITY_LABELS[p.task.priority]}</span></div>
            </div>
            <div className="field-row">
              <div className="field-label">Deadline</div>
              <div className="field-value"><Icon name="calendar" size={14}/><span>{new Date(p.task.deadline).toLocaleDateString()}</span></div>
            </div>
            <div className="field-row">
              <div className="field-label">Project</div>
              <div className="field-value"><span>{project?.name ?? "—"}</span></div>
            </div>
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div className="section-label" style={{ marginTop: 0 }}>Created</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                {new Date(p.task.createdAt).toLocaleString()}<br/>
                Updated {new Date(p.task.updatedAt).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusMenu({ value, onChange }: { value: TaskStatus; onChange: (s: TaskStatus) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <span className={`status-pill ${STATUS_CLASS[value]}`} onClick={() => setOpen((o) => !o)} style={{ cursor: "pointer" }}>
        {STATUS_LABELS[value]}<Icon name="chevron-down" size={12} strokeWidth={2.2}/>
      </span>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 200 }} onClick={() => setOpen(false)}/>
          <div style={{
            position: "absolute", top: "100%", left: 0, marginTop: 4,
            background: "var(--surface)", border: "1px solid var(--border-strong)",
            borderRadius: 6, padding: 4, boxShadow: "var(--shadow-2)", zIndex: 201, minWidth: 160
          }}>
            {STATUS_ORDER.map((s) => (
              <div key={s} style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 4 }}
                   onClick={(e) => { e.stopPropagation(); onChange(s); setOpen(false); }}>
                <span className={`status-pill ${STATUS_CLASS[s]}`}>{STATUS_LABELS[s]}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Dashboard ---------- */

function DashboardScreen({ user, data, onOpenTask, onGoBoard }: {
  user: User; data: AppData; onOpenTask: (t: Task) => void; onGoBoard: () => void;
}) {
  const tasks = data.tasks;
  const counts = useMemo(() => ({
    todo: tasks.filter((t) => t.status === "todo").length,
    progress: tasks.filter((t) => t.status === "in_progress").length,
    review: tasks.filter((t) => t.status === "in_review").length,
    done: tasks.filter((t) => t.status === "done").length
  }), [tasks]);
  const myTasks = tasks.filter((t) => t.assigneeId === user.id);
  const isManager = user.role === "manager" || user.role === "admin";

  return (
    <div className="dash">
      <div>
        <div className="crumbs"><a>Your work</a></div>
        <h1 className="page-title" style={{ marginTop: 4 }}>
          {isManager ? "Manager overview" : `Welcome back, ${user.name.split(" ")[0]}`}
        </h1>
        <div style={{ color: "var(--text-3)", marginTop: 4 }}>
          {isManager
            ? `${data.teams.length} teams · ${data.projects.length} projects · ${tasks.length} tasks`
            : `${data.teams.find((t) => t.id === user.teamId)?.name ?? "No team"} · ${myTasks.length} assigned to you`}
        </div>
      </div>
      <div className="dash-grid">
        <Stat label="To Do" value={counts.todo} hint="across visible teams"/>
        <Stat label="In Progress" value={counts.progress} color="var(--brand-2)" hint="active work"/>
        <Stat label="In Review" value={counts.review} color="var(--status-review-fg)" hint="awaiting sign-off"/>
        <Stat label="Done" value={counts.done} color="var(--status-done-fg)" hint="closed"/>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">{isManager ? "All tasks" : "Assigned to you"}</div>
              <div className="panel-sub">Most recent activity</div>
            </div>
            <button className="btn sm" onClick={onGoBoard}>Open board <Icon name="chevron-right" size={14}/></button>
          </div>
          {(isManager ? tasks : myTasks).slice(0, 7).map((t) => {
            const assignee = data.users.find((u) => u.id === t.assigneeId);
            return (
              <div key={t.id} className="list-row" onClick={() => onOpenTask(t)}>
                <span className="card-id-mark"><Icon name="check" size={9} strokeWidth={3}/></span>
                <span className="row-id">{t.id.slice(0, 8)}</span>
                <span style={{ color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                <span className={`status-pill ${STATUS_CLASS[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                <Avatar user={assignee} size="sm"/>
              </div>
            );
          })}
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Team summary</div>
              <div className="panel-sub">Tasks by status</div>
            </div>
          </div>
          {data.summaries.map((s) => {
            const team = data.teams.find((t) => t.id === s.teamId);
            return (
              <div key={s.teamId} style={{ padding: "10px 4px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 500 }}>{team?.name ?? s.teamId}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {s.total} total · {s.todo} todo · {s.inProgress} in progress · {s.inReview} in review · {s.done} done
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, color }: { label: string; value: number; hint: string; color?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
      <div className="stat-trend" style={{ color: "var(--text-3)" }}>{hint}</div>
    </div>
  );
}

/* ---------- Projects ---------- */

function ProjectsScreen({ data, isManager, onOpenProject, onRefresh, onToast }: {
  data: AppData; isManager: boolean;
  onOpenProject: (p: Project) => void;
  onRefresh: () => void; onToast: (msg: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState("");

  async function submit() {
    if (!name.trim() || !description.trim()) { onToast("Name and description are required."); return; }
    try {
      await api.createProject({ name: name.trim(), description: description.trim(), teamId: teamId || undefined });
      setCreating(false); setName(""); setDescription(""); setTeamId("");
      onRefresh();
      onToast("Project created.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Could not create project");
    }
  }

  async function remove(p: Project) {
    if (!confirm(`Delete project "${p.name}"?`)) return;
    try {
      await api.deleteProject(p.id);
      onRefresh();
      onToast("Project deleted.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Delete failed");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><a>Projects</a></div>
          <h1 className="page-title">Projects</h1>
        </div>
        <div className="page-head-actions">
          {isManager && (
            <button className="btn btn-primary" onClick={() => setCreating((c) => !c)}>
              <Icon name="plus" size={14}/> {creating ? "Cancel" : "Create project"}
            </button>
          )}
        </div>
      </div>

      {creating && (
        <div style={{ padding: "0 28px 16px" }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">New project</div>
                <div className="panel-sub">Visible to all if you don't pick a team.</div>
              </div>
            </div>
            <div className="field-stack"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)}/></div>
            <div className="field-stack"><label>Description</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)}/></div>
            <div className="field-stack">
              <label>Team (optional)</label>
              <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">All teams</option>
                {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={submit}>Create</button>
          </div>
        </div>
      )}

      <div className="proj-grid">
        {data.projects.length === 0 && <div style={{ padding: 28, color: "var(--text-3)" }}>No projects yet.</div>}
        {data.projects.map((p) => {
          const team = data.teams.find((t) => t.id === p.teamId);
          const pTasks = data.tasks.filter((t) => t.projectId === p.id);
          const done = pTasks.filter((t) => t.status === "done").length;
          const pct = pTasks.length ? Math.round((done / pTasks.length) * 100) : 0;
          return (
            <div key={p.id} className="proj-card">
              <div className="proj-card-head" onClick={() => onOpenProject(p)}>
                <div className="proj-card-mark" style={{ background: colorFor(p.id) }}>{initials(p.name)}</div>
                <div>
                  <div className="proj-card-name">{p.name}</div>
                  <div className="proj-card-team">{team?.name ?? "All teams"}</div>
                </div>
              </div>
              <div style={{ color: "var(--text-2)", fontSize: 13, margin: "8px 0", minHeight: 36 }}>{p.description}</div>
              <div className="progress"><div className="progress-fill" style={{ width: `${pct}%` }}/></div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <span style={{ color: "var(--text-3)", fontSize: 12 }}>{done}/{pTasks.length} done</span>
                {isManager && (
                  <button className="btn btn-ghost sm" onClick={() => remove(p)} title="Delete"><Icon name="trash" size={14}/></button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------- Admin ---------- */

function AdminScreen({ data, canCreateTeam, canManageUsers, onRefresh, onToast }: {
  data: AppData; canCreateTeam: boolean; canManageUsers: boolean;
  onRefresh: () => void; onToast: (msg: string) => void;
}) {
  const [teamName, setTeamName] = useState("");
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "employee" as User["role"], teamId: "" });

  async function createTeam() {
    if (!teamName.trim()) { onToast("Team name is required."); return; }
    try {
      await api.createTeam(teamName.trim());
      setTeamName(""); onRefresh(); onToast("Team created.");
    } catch (error) { onToast(error instanceof Error ? error.message : "Could not create team"); }
  }

  async function createUser() {
    if (!newUser.name.trim() || !newUser.email.trim()) { onToast("Name and email are required."); return; }
    try {
      await api.createUser({
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        role: newUser.role,
        teamId: newUser.teamId || undefined
      });
      setNewUser({ name: "", email: "", role: "employee", teamId: "" });
      onRefresh(); onToast("User created.");
    } catch (error) { onToast(error instanceof Error ? error.message : "Could not create user"); }
  }

  async function moveUser(userId: string, teamId: string) {
    try {
      await api.updateUserTeam(userId, teamId || null);
      onRefresh(); onToast("User team updated.");
    } catch (error) { onToast(error instanceof Error ? error.message : "Could not move user"); }
  }

  return (
    <div style={{ padding: "16px 28px 32px", overflowY: "auto" }}>
      <div className="page-head" style={{ padding: 0, marginBottom: 16 }}>
        <div>
          <div className="crumbs"><a>Admin</a></div>
          <h1 className="page-title">Teams &amp; users</h1>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="panel">
          <div className="panel-head">
            <div><div className="panel-title">Teams</div><div className="panel-sub">{data.teams.length} total</div></div>
          </div>
          {data.teams.map((t) => {
            const members = data.users.filter((u) => u.teamId === t.id);
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div className="proj-card-mark" style={{ background: colorFor(t.id), width: 28, height: 28, fontSize: 12 }}>{initials(t.name)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>{members.length} members</div>
                </div>
              </div>
            );
          })}
          {canCreateTeam && (
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <input className="input" placeholder="New team name" value={teamName}
                     onChange={(e) => setTeamName(e.target.value)} style={{ flex: 1 }}/>
              <button className="btn btn-primary sm" onClick={createTeam}><Icon name="plus" size={14}/> Add</button>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div><div className="panel-title">Users</div><div className="panel-sub">{data.users.length} total</div></div>
          </div>
          {data.users.map((u) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <Avatar user={u} size="sm"/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{u.email} · {u.role}</div>
              </div>
              {canManageUsers ? (
                <select className="dropdown" value={u.teamId ?? ""} onChange={(e) => moveUser(u.id, e.target.value)}>
                  <option value="">No team</option>
                  {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              ) : (
                <span className="label-chip">{data.teams.find((t) => t.id === u.teamId)?.name ?? "—"}</span>
              )}
            </div>
          ))}
          {canManageUsers && (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="input" placeholder="Name" value={newUser.name}
                       onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} style={{ flex: 1 }}/>
                <input className="input" placeholder="Email" value={newUser.email}
                       onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} style={{ flex: 1 }}/>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <select className="input" value={newUser.role}
                        onChange={(e) => setNewUser({ ...newUser, role: e.target.value as User["role"] })}>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
                <select className="input" value={newUser.teamId}
                        onChange={(e) => setNewUser({ ...newUser, teamId: e.target.value })}>
                  <option value="">No team</option>
                  {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button className="btn btn-primary" onClick={createUser}><Icon name="plus" size={14}/> Add user</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Create-task modal ---------- */

function CreateTaskModal({ data, onClose, onCreate }: {
  data: AppData; onClose: () => void; onCreate: (payload: CreateTaskPayload) => void;
}) {
  const [form, setForm] = useState<CreateTaskPayload>(defaultCreateForm);
  const teamUsers = data.users.filter((u) => u.teamId === form.teamId);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: "min(620px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ color: "var(--text-2)", fontWeight: 600 }}>Create task</span>
          <span style={{ flex: 1 }}/>
          <button className="btn btn-ghost sm" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>
        <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
          <div className="modal-main">
            <div className="field-stack"><label>Title</label>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}/>
            </div>
            <div className="field-stack"><label>Description</label>
              <textarea className="comment-input" rows={3} value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}/>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field-stack"><label>Priority</label>
                <select className="input" value={form.priority}
                        onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
                  {(["urgent", "high", "medium", "low"] as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
              </div>
              <div className="field-stack"><label>Deadline</label>
                <input className="input" type="date" value={form.deadline}
                       onChange={(e) => setForm({ ...form, deadline: e.target.value })}/>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div className="field-stack"><label>Project</label>
                <select className="input" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                  <option value="">Pick a project</option>
                  {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="field-stack"><label>Team</label>
                <select className="input" value={form.teamId}
                        onChange={(e) => setForm({ ...form, teamId: e.target.value, assigneeId: "" })}>
                  <option value="">Pick a team</option>
                  {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="field-stack"><label>Assignee</label>
                <select className="input" value={form.assigneeId}
                        onChange={(e) => setForm({ ...form, assigneeId: e.target.value })} disabled={!form.teamId}>
                  <option value="">{form.teamId ? "Pick an employee" : "Pick a team first"}</option>
                  {teamUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={() => onCreate(form)}
                      disabled={!form.title || !form.description || !form.teamId || !form.assigneeId || !form.projectId}>
                Create
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
