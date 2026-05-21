import { Component, useEffect, useState, type ReactNode } from "react";
import type { TaskDetail } from "@mini-jira/shared";
import { api } from "./api/client";
import { asApiError } from "./api/errors";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ConfigProvider } from "./contexts/ConfigContext";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import { AppDataProvider, useAppData } from "./contexts/AppDataContext";
import { LoginPage } from "./pages/LoginPage";
import { BoardPage } from "./pages/BoardPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { AdminPage } from "./pages/AdminPage";
import { TopNav } from "./components/TopNav";
import { Sidebar } from "./components/Sidebar";
import { Toast } from "./components/Toast";
import { TaskDetailModal } from "./modals/TaskDetailModal";
import { CreateTaskModal } from "./modals/CreateTaskModal";
import type { Screen } from "./routes";

/** Root mounts all providers around the inner Shell. */
export function Root() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ConfigProvider>
          <AuthProvider>
            <AppDataProvider>
              <Shell/>
            </AppDataProvider>
          </AuthProvider>
        </ConfigProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

function Shell() {
  const { user, loading: authLoading, logout } = useAuth();
  const { data, refresh } = useAppData();
  const { toast, show } = useToast();
  const [screen, setScreen] = useState<Screen>("board");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<TaskDetail | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // First project becomes the default once data loads.
  useEffect(() => {
    if (!currentProjectId && data.projects.length) setCurrentProjectId(data.projects[0]!.id);
  }, [data.projects, currentProjectId]);

  if (authLoading) return <FullPageLoader/>;
  if (!user) return <LoginPage/>;

  const currentProject = data.projects.find((p) => p.id === currentProjectId) ?? data.projects[0] ?? null;

  async function openTask(taskId: string) {
    try {
      const res = await api.getTask(taskId);
      setSelected(res.task);
    } catch (err) {
      show(asApiError(err).message, "error");
    }
  }

  let content: ReactNode = null;
  if (screen === "board") {
    content = <BoardPage project={currentProject} onOpenTask={openTask}/>;
  } else if (screen === "dashboard") {
    content = <DashboardPage onOpenTask={openTask} onGoBoard={() => setScreen("board")}/>;
  } else if (screen === "projects") {
    content = (
      <ProjectsPage onOpenProject={(p) => { setCurrentProjectId(p.id); setScreen("board"); }}/>
    );
  } else {
    content = <AdminPage/>;
  }

  const isManager = user.role === "manager" || user.role === "admin";

  return (
    <div className="app">
      <TopNav user={user} screen={screen} onNav={setScreen}
              onCreate={() => setCreating(true)} onLogout={logout}/>
      <div className="app-body">
        <Sidebar project={currentProject} screen={screen} onNav={setScreen}/>
        <main className="main">{content}</main>
      </div>

      {selected && (
        <TaskDetailModal
          task={selected}
          currentUser={user}
          data={data}
          isManager={isManager}
          onClose={() => setSelected(null)}
          onChanged={async () => { await refresh(); await openTask(selected.id); }}
          onDeleted={async () => { setSelected(null); await refresh(); }}
        />
      )}

      {creating && (
        <CreateTaskModal
          data={data}
          onClose={() => setCreating(false)}
          onCreated={async () => { setCreating(false); await refresh(); }}
        />
      )}

      <Toast message={toast.message} variant={toast.variant}/>
    </div>
  );
}

function FullPageLoader() {
  return (
    <div className="login">
      <div className="login-card" style={{ textAlign: "center" }}>
        <div className="login-sub">Loading…</div>
      </div>
    </div>
  );
}

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
