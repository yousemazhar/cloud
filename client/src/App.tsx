import { Component, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, ClipboardList, Filter, LogOut, MessageSquare, Paperclip, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import type { Priority, Project, Task, TaskDetail, TaskStatus, Team, User } from "@mini-jira/shared";
import { PRIORITY_LABELS, STATUS_LABELS, TASK_STATUSES } from "@mini-jira/shared";
import { api, type AppData, type CreateTaskPayload, type TaskFilters } from "./api";

const demoUsers = [
  { id: "user-ali", label: "Ali", helper: "Manager - all teams" },
  { id: "user-sara", label: "Sara", helper: "Frontend employee" },
  { id: "user-omar", label: "Omar", helper: "Backend employee" }
];

const emptyData: AppData = { teams: [], users: [], projects: [], tasks: [], summaries: [] };
const defaultTask: CreateTaskPayload = {
  title: "",
  description: "",
  priority: "medium",
  deadline: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  teamId: "",
  assigneeId: "",
  projectId: ""
};

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <main className="error-boundary" role="alert">
          <h1>Something went wrong</h1>
          <p>{this.state.error.message}</p>
          <button className="primary-button" onClick={() => window.location.reload()}>Reload</button>
        </main>
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

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<AppData>(emptyData);
  const [filters, setFilters] = useState<TaskFilters>({});
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [draggingTask, setDraggingTask] = useState<string | null>(null);

  const isManager = user?.role === "manager" || user?.role === "admin";

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      setUser(null);
      setData(emptyData);
      setSelectedTask(null);
      setToast("Your session has expired. Please sign in again.");
    });
  }, []);

  async function load(filtersOverride: TaskFilters = filters) {
    setLoading(true);
    try {
      const next = await api.loadAppData(filtersOverride);
      setData(next);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not load app data");
    } finally {
      setLoading(false);
    }
  }

  async function openTask(taskId: string) {
    try {
      const response = await api.getTask(taskId);
      setSelectedTask(response.task);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not open task");
    }
  }

  useEffect(() => {
    if (!api.token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((response) => {
        setUser(response.user);
        return load({});
      })
      .catch(() => {
        api.clearToken();
        setLoading(false);
      });
  }, []);

  async function login(userId: string) {
    setLoading(true);
    try {
      const response = await api.demoLogin(userId);
      api.setToken(response.token);
      setUser(response.user);
      setFilters({});
      await load({});
      setToast(`Signed in as ${response.user.name}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    api.clearToken();
    setUser(null);
    setData(emptyData);
    setSelectedTask(null);
  }

  async function moveTask(taskId: string, status: TaskStatus) {
    const original = data.tasks;
    setData((current) => ({ ...current, tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, status } : task)) }));
    try {
      await api.updateTask(taskId, { status });
      await load();
      if (selectedTask?.id === taskId) await openTask(taskId);
      setToast(`Moved task to ${STATUS_LABELS[status]}`);
    } catch (error) {
      setData((current) => ({ ...current, tasks: original }));
      setToast(error instanceof Error ? error.message : "Could not move task");
    }
  }

  function updateFilters(next: TaskFilters) {
    setFilters(next);
    void load(next);
  }

  if (!user) return <LoginScreen loading={loading} onLogin={login} toast={toast} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-row">
            <ClipboardList size={28} />
            <div>
              <h1>Mini-Jira</h1>
              <p>Local AWS-ready demo</p>
            </div>
          </div>
          <div className="profile-block">
            <strong>{user.name}</strong>
            <span>{isManager ? "Manager" : teamName(data.teams, user.teamId)}</span>
          </div>
        </div>
        <nav>
          <a href="#board">Board</a>
          <a href="#dashboard">Dashboard</a>
          <a href="#projects">Projects</a>
        </nav>
        <button className="ghost-button" onClick={logout} aria-label="Sign out">
          <LogOut size={16} /> Sign out
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{isManager ? "Company workspace" : `${teamName(data.teams, user.teamId)} workspace`}</p>
            <h2>Task board</h2>
          </div>
          <div className="topbar-actions">
            {isManager && <TaskComposer data={data} onCreated={() => load()} />}
          </div>
        </header>

        {toast && (
          <button className="toast" onClick={() => setToast("")}>
            {toast}
          </button>
        )}

        <section id="dashboard" className="summary-strip">
          {data.summaries.map((summary) => (
            <div className="summary-item" key={summary.teamId}>
              <span>{teamName(data.teams, summary.teamId)}</span>
              <strong>{summary.total}</strong>
              <small>
                {summary.done} done / {summary.inProgress + summary.inReview} active
              </small>
            </div>
          ))}
        </section>

        <section className="filters-row">
          <Filter size={18} />
          {isManager && <Select label="Team" value={filters.teamId ?? ""} onChange={(teamId) => updateFilters({ ...filters, teamId })} options={data.teams.map(optionPair)} />}
          <Select label="Assignee" value={filters.assigneeId ?? ""} onChange={(assigneeId) => updateFilters({ ...filters, assigneeId })} options={data.users.filter((candidate) => candidate.role === "employee").map(optionPair)} />
          <Select label="Project" value={filters.projectId ?? ""} onChange={(projectId) => updateFilters({ ...filters, projectId })} options={data.projects.map(optionPair)} />
          <Select label="Priority" value={filters.priority ?? ""} onChange={(priority) => updateFilters({ ...filters, priority: priority as Priority | "" })} options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))} />
          <Select label="Status" value={filters.status ?? ""} onChange={(status) => updateFilters({ ...filters, status: status as TaskStatus | "" })} options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
        </section>

        {loading ? (
          <div className="loading-state">Loading workspace...</div>
        ) : (
          <section id="board" className="kanban-grid">
            {TASK_STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                tasks={data.tasks.filter((task) => task.status === status)}
                data={data}
                draggingTask={draggingTask}
                onDragStart={setDraggingTask}
                onDrop={(taskId) => {
                  setDraggingTask(null);
                  void moveTask(taskId, status);
                }}
                onOpen={openTask}
              />
            ))}
          </section>
        )}

        <section id="projects" className="project-section">
          <ProjectPanel data={data} isManager={isManager} onChanged={() => load()} onToast={setToast} />
        </section>
      </main>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          data={data}
          currentUser={user}
          onClose={() => setSelectedTask(null)}
          onRefresh={async () => {
            await load();
            await openTask(selectedTask.id);
          }}
          onToast={setToast}
        />
      )}
    </div>
  );
}

function LoginScreen({ loading, onLogin, toast }: { loading: boolean; onLogin: (userId: string) => void; toast: string }) {
  return (
    <main className="login-screen">
      <section className="login-panel">
        <p className="eyebrow">Cloud Computing 2026</p>
        <h1>Mini-Jira</h1>
        <p className="login-copy">Choose a seeded user to run the required demo scenario without Cognito deployment.</p>
        <div className="login-users">
          {demoUsers.map((demoUser) => (
            <button key={demoUser.id} disabled={loading} onClick={() => onLogin(demoUser.id)}>
              <strong>{demoUser.label}</strong>
              <span>{demoUser.helper}</span>
            </button>
          ))}
        </div>
        {toast && <p className="inline-error">{toast}</p>}
      </section>
    </main>
  );
}

function KanbanColumn({
  status,
  tasks,
  data,
  draggingTask,
  onDragStart,
  onDrop,
  onOpen
}: {
  status: TaskStatus;
  tasks: Task[];
  data: AppData;
  draggingTask: string | null;
  onDragStart: (taskId: string) => void;
  onDrop: (taskId: string) => void;
  onOpen: (taskId: string) => void;
}) {
  return (
    <div
      className={`kanban-column ${draggingTask ? "drop-ready" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const taskId = event.dataTransfer.getData("text/task-id");
        if (taskId) onDrop(taskId);
      }}
    >
      <div className="column-title">
        <h3>{STATUS_LABELS[status]}</h3>
        <span>{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <div className="empty-state">No tasks</div>
      ) : (
        tasks.map((task) => (
          <article
            className="task-card"
            key={task.id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("text/task-id", task.id);
              onDragStart(task.id);
            }}
            onClick={() => onOpen(task.id)}
          >
            <div className="task-card-head">
              <span className={`priority ${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>
              {task.attachments.some((attachment) => attachment.active) && <Paperclip size={15} />}
            </div>
            <h4>{task.title}</h4>
            <p>{task.description}</p>
            <footer>
              <span>{userName(data.users, task.assigneeId)}</span>
              <span>{new Date(task.deadline).toLocaleDateString()}</span>
            </footer>
          </article>
        ))
      )}
    </div>
  );
}

function TaskComposer({ data, onCreated }: { data: AppData; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultTask);
  const assignees = data.users.filter((user) => user.role === "employee" && (!form.teamId || user.teamId === form.teamId));

  useEffect(() => {
    if (!form.teamId && data.teams[0]) setForm((current) => ({ ...current, teamId: data.teams[0].id }));
    if (!form.projectId && data.projects[0]) setForm((current) => ({ ...current, projectId: data.projects[0].id }));
  }, [data.teams, data.projects, form.teamId, form.projectId]);

  useEffect(() => {
    if (assignees.length && !assignees.some((user) => user.id === form.assigneeId)) {
      setForm((current) => ({ ...current, assigneeId: assignees[0].id }));
    }
  }, [assignees, form.assigneeId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await api.createTask(form);
    setOpen(false);
    setForm(defaultTask);
    onCreated();
  }

  return (
    <>
      <button className="primary-button" onClick={() => setOpen(true)}>
        <Plus size={16} /> New task
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form className="modal form-modal" role="dialog" aria-modal="true" aria-labelledby="composer-title" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
            <header>
              <h3 id="composer-title">Create task</h3>
              <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close create task dialog">
                <X size={16} />
              </button>
            </header>
            <input placeholder="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
            <textarea placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
            <div className="form-grid">
              <label>
                Team
                <select value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value, assigneeId: "" })}>
                  {data.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assignee
                <select value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Project
                <select value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
                  {data.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })}>
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Deadline
                <input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} />
              </label>
            </div>
            <button className="primary-button" type="submit">
              Create task
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function TaskModal({
  task,
  data,
  currentUser,
  onClose,
  onRefresh,
  onToast
}: {
  task: TaskDetail;
  data: AppData;
  currentUser: User;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onToast: (message: string) => void;
}) {
  const [comment, setComment] = useState("");
  const active = task.attachments.find((attachment) => attachment.active);

  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    await api.addComment(task.id, comment);
    setComment("");
    await onRefresh();
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    await api.uploadAttachment(task.id, file);
    onToast("Attachment uploaded");
    await onRefresh();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal task-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className={`priority ${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>
            <h3 id="task-modal-title">{task.title}</h3>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close task details">
            <X size={16} />
          </button>
        </header>
        <div className="task-detail-grid">
          <div>
            <p className="task-description">{task.description}</p>
            <div className="meta-grid">
              <span>Team: {teamName(data.teams, task.teamId)}</span>
              <span>Assignee: {userName(data.users, task.assigneeId)}</span>
              <span>Project: {projectName(data.projects, task.projectId)}</span>
              <span>Deadline: {new Date(task.deadline).toLocaleDateString()}</span>
            </div>
            <div className="status-actions">
              {TASK_STATUSES.map((status) => (
                <button key={status} className={task.status === status ? "active-status" : ""} onClick={() => api.updateTask(task.id, { status }).then(onRefresh)}>
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
            <section className="attachment-box">
              <h4>
                <Paperclip size={16} /> Attachment
              </h4>
              {active ? (
                <div className="attachment-preview">
                  {active.mimeType.startsWith("image/") && <img src={active.url} alt={active.fileName} />}
                  <span>{active.fileName}</span>
                  <button className="ghost-button" onClick={() => api.deleteAttachment(task.id, active.id).then(onRefresh)}>
                    <Trash2 size={15} /> Remove active
                  </button>
                </div>
              ) : (
                <p className="muted">No active attachment.</p>
              )}
              <label className="upload-button">
                <Upload size={16} /> Upload or replace
                <input type="file" accept="image/*" onChange={(event) => upload(event.target.files?.[0])} />
              </label>
              {task.attachments.length > 1 && <small>{task.attachments.length - 1} older version(s) retained.</small>}
            </section>
          </div>
          <div>
            <section className="comments-box">
              <h4>
                <MessageSquare size={16} /> Comments
              </h4>
              <div className="comment-list">
                {task.comments.length === 0 ? (
                  <p className="muted">No comments yet.</p>
                ) : (
                  task.comments.map((item) => (
                    <div className="comment" key={item.id}>
                      <strong>{userName(data.users, item.authorId)}</strong>
                      <p>{item.body}</p>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={addComment}>
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment" required />
                <button className="primary-button" type="submit">
                  Comment
                </button>
              </form>
            </section>
            <section className="audit-box">
              <h4>
                <CheckCircle2 size={16} /> Audit log
              </h4>
              {task.auditLogs.length === 0 ? (
                <p className="muted">No status changes yet.</p>
              ) : (
                task.auditLogs.map((entry) => (
                  <div className="audit-entry" key={entry.id}>
                    {userName(data.users, entry.actorId)} moved this from {STATUS_LABELS[entry.fromStatus]} to {STATUS_LABELS[entry.toStatus]}
                  </div>
                ))
              )}
            </section>
            <p className="muted">Viewing as {currentUser.name}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProjectPanel({ data, isManager, onChanged, onToast }: { data: AppData; isManager: boolean; onChanged: () => void; onToast: (message: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  async function create(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.createProject({ name, description });
      setName("");
      setDescription("");
      onChanged();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Could not create project");
    }
  }

  function startEdit(project: Project) {
    setEditingId(project.id);
    setEditName(project.name);
    setEditDescription(project.description);
  }

  async function saveEdit(projectId: string) {
    try {
      await api.updateProject(projectId, { name: editName, description: editDescription });
      setEditingId(null);
      onChanged();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Could not update project");
    }
  }

  async function remove(projectId: string) {
    try {
      await api.deleteProject(projectId);
      onChanged();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Could not delete project");
    }
  }

  return (
    <div className="project-panel">
      <header>
        <div>
          <p className="eyebrow">Project CRUD</p>
          <h3>Projects</h3>
        </div>
      </header>
      {isManager && (
        <form className="project-form" onSubmit={create}>
          <input placeholder="Project name" value={name} onChange={(event) => setName(event.target.value)} required />
          <input placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} required />
          <button className="primary-button" type="submit">
            <Plus size={16} /> Add
          </button>
        </form>
      )}
      <div className="project-list">
        {data.projects.map((project) => (
          <div className="project-row" key={project.id}>
            {editingId === project.id ? (
              <>
                <div>
                  <input value={editName} onChange={(event) => setEditName(event.target.value)} aria-label="Project name" />
                  <input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} aria-label="Project description" />
                </div>
                <div className="project-row-actions">
                  <button className="primary-button" onClick={() => saveEdit(project.id)}>Save</button>
                  <button className="ghost-button" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <strong>{project.name}</strong>
                  <span>{project.description}</span>
                </div>
                {isManager && (
                  <div className="project-row-actions">
                    <button className="icon-button" onClick={() => startEdit(project)} aria-label={`Edit project ${project.name}`}>
                      <Pencil size={16} />
                    </button>
                    <button className="icon-button" onClick={() => remove(project.id)} aria-label={`Delete project ${project.name}`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <label className="filter-control">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function optionPair(item: Team | User | Project) {
  return { value: item.id, label: item.name };
}

function teamName(teams: Team[], teamId?: string) {
  return teams.find((team) => team.id === teamId)?.name ?? "All teams";
}

function userName(users: User[], userId: string) {
  return users.find((user) => user.id === userId)?.name ?? "Unknown";
}

function projectName(projects: Project[], projectId: string) {
  return projects.find((project) => project.id === projectId)?.name ?? "Unknown";
}
