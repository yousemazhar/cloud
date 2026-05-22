import { useRef, useState } from "react";
import type { Comment, TaskDetail, TaskStatus, User } from "@mini-jira/shared";
import { PRIORITY_LABELS, STATUS_LABELS } from "@mini-jira/shared";
import { api, type AppData } from "../api/client";
import { ApiError, asApiError } from "../api/errors";
import { useToast } from "../contexts/ToastContext";
import { useConfig } from "../contexts/ConfigContext";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/Avatar";
import { StatusMenu, STATUS_CLASS } from "../components/StatusMenu";
import { PriorityChip } from "../components/PriorityChip";
import { colorFor } from "../utils/colors";
import { Button } from "../components/ui/Button";
import { Textarea } from "../components/ui/Textarea";

interface Props {
  task: TaskDetail;
  currentUser: User;
  data: AppData;
  isManager: boolean;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}

export function TaskDetailModal(p: Props) {
  const { task, currentUser, data, isManager, onClose, onChanged, onDeleted } = p;
  const { show } = useToast();
  const { config } = useConfig();

  const [tab, setTab] = useState<"comments" | "history">("comments");
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [editingError, setEditingError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const assignee = data.users.find((u) => u.id === task.assigneeId);
  const team = data.teams.find((t) => t.id === task.teamId);
  const project = data.projects.find((pr) => pr.id === task.projectId);
  const active = task.attachments.find((a) => a.active);
  const olderVersions = task.attachments.filter((a) => !a.active);

  async function changeStatus(s: TaskStatus) {
    try {
      await api.updateTask(task.id, { status: s });
      onChanged();
    } catch (err) {
      show(asApiError(err).message, "error");
    }
  }

  async function addComment() {
    if (!draft.trim()) { setDraftError("Comment can't be empty."); return; }
    setBusy(true);
    setDraftError("");
    try {
      await api.addComment(task.id, draft);
      setDraft("");
      onChanged();
    } catch (err) {
      const e = asApiError(err);
      setDraftError(e.get("body") ?? e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(commentId: string) {
    if (!editingDraft.trim()) { setEditingError("Comment can't be empty."); return; }
    try {
      await api.updateComment(commentId, editingDraft);
      setEditingId(null);
      onChanged();
    } catch (err) {
      const e = asApiError(err);
      setEditingError(e.get("body") ?? e.message);
    }
  }

  async function deleteComment(commentId: string) {
    if (!confirm("Delete this comment?")) return;
    try {
      await api.deleteComment(commentId);
      onChanged();
    } catch (err) {
      show(asApiError(err).message, "error");
    }
  }

  async function uploadImage(file: File) {
    if (!config) { show("Still loading server config — try again in a second.", "error"); return; }
    setBusy(true);
    try {
      await api.uploadAttachment(task.id, file, config.uploadMode);
      show("Image uploaded.", "success");
      onChanged();
    } catch (err) {
      const e = asApiError(err);
      // Surface the validation message verbatim — server says e.g. "Only image uploads are allowed".
      show(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAttachment(attachmentId: string) {
    if (!confirm("Delete this attachment? Older versions stay retained in S3.")) return;
    try {
      await api.deleteAttachment(task.id, attachmentId);
      onChanged();
    } catch (err) {
      show(asApiError(err).message, "error");
    }
  }

  async function deleteTask() {
    if (!confirm("Delete this task? This can't be undone.")) return;
    try {
      await api.deleteTask(task.id);
      show("Task deleted.", "success");
      onDeleted();
    } catch (err) {
      show(asApiError(err).message, "error");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="card-id-mark"><Icon name="check" size={9} strokeWidth={3}/></span>
            <span style={{ color: "var(--text-3)" }}>{project?.name ?? "—"} /</span>
            <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{task.id.slice(0, 12)}</span>
          </span>
          <span style={{ flex: 1 }}/>
          {isManager && (
            <Button variant="ghost" size="sm" title="Delete task" onClick={deleteTask}>
              <Icon name="trash" size={14}/>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} title="Close"><Icon name="x" size={16}/></Button>
        </div>

        <div className="modal-body">
          <div className="modal-main">
            <h2 className="modal-task-title">{task.title}</h2>

            <div className="section-label">Description</div>
            <div style={{ color: "var(--text-2)", lineHeight: 1.55 }}>
              {task.description || <span style={{ color: "var(--text-4)" }}>No description.</span>}
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
                  <Button variant="ghost" size="sm" onClick={() => deleteAttachment(active.id)} title="Delete">
                    <Icon name="trash" size={14}/>
                  </Button>
                </div>
              </>
            )}

            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={busy || !config}>
                <Icon name="upload" size={14}/> {active ? "Replace image" : "Upload image"}
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
                     onChange={(e) => {
                       const file = e.target.files?.[0];
                       if (file) uploadImage(file);
                       e.target.value = "";
                     }}/>
              <div className="field-hint" style={{ marginTop: 6 }}>
                JPEG/PNG only, max 5 MB. Older versions are retained in S3.
              </div>
            </div>

            <div style={{ marginTop: 20, borderBottom: "1px solid var(--border)", display: "flex", gap: 4 }}>
              <button className={`tab ${tab === "comments" ? "is-active" : ""}`} onClick={() => setTab("comments")}>Comments</button>
              <button className={`tab ${tab === "history" ? "is-active" : ""}`} onClick={() => setTab("history")}>History</button>
            </div>

            {tab === "comments" ? (
              <div style={{ padding: "12px 0" }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                  <Avatar user={currentUser}/>
                  <div style={{ flex: 1 }}>
                    <Textarea
                      rows={2}
                      value={draft}
                      onChange={(e) => { setDraft(e.target.value); if (draftError) setDraftError(""); }}
                      placeholder="Add a comment…"
                      aria-invalid={!!draftError}
                      className={draftError ? "border-priority-high" : ""}
                    />
                    {draftError && <div className="field-error" role="alert">{draftError}</div>}
                    <div className="mt-1.5">
                      <Button size="sm" onClick={addComment} disabled={busy}>Comment</Button>
                    </div>
                  </div>
                </div>
                {task.comments.length === 0 && (
                  <div style={{ color: "var(--text-4)", padding: "12px 0", fontSize: 13 }}>No comments yet.</div>
                )}
                {task.comments.map((c: Comment) => {
                  const author = data.users.find((u) => u.id === c.authorId);
                  const canEdit = c.authorId === currentUser.id || isManager;
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
                              <Button variant="ghost" size="sm"
                                      onClick={() => { setEditingId(c.id); setEditingDraft(c.body); setEditingError(""); }}>
                                Edit
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => deleteComment(c.id)}>Delete</Button>
                            </>
                          )}
                        </div>
                        {editingId === c.id ? (
                          <>
                            <Textarea
                              rows={2}
                              value={editingDraft}
                              onChange={(e) => { setEditingDraft(e.target.value); if (editingError) setEditingError(""); }}
                              className={editingError ? "border-priority-high" : ""}
                            />
                            {editingError && <div className="field-error" role="alert">{editingError}</div>}
                            <div className="mt-1.5 flex gap-2">
                              <Button size="sm" onClick={() => saveEdit(c.id)}>Save</Button>
                              <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
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
                {task.auditLogs.length === 0 && (
                  <div style={{ color: "var(--text-4)", padding: "12px 0", fontSize: 13 }}>No history yet.</div>
                )}
                {task.auditLogs.map((entry) => {
                  const actor = data.users.find((u) => u.id === entry.actorId);
                  // Persisted actorName takes precedence so renamed/deleted users
                  // still render correctly. The actorId lookup is the fallback for
                  // pre-fix entries in the audit log.
                  const actorName = entry.actorName ?? actor?.name ?? "Unknown user";
                  return (
                    <div key={entry.id} style={{ display: "flex", gap: 12, padding: "8px 0", fontSize: 13 }}>
                      <Avatar user={actor ?? { id: entry.actorId, name: actorName }} size="sm"/>
                      <div style={{ color: "var(--text-2)" }}>
                        <b style={{ color: "var(--text)" }}>{actorName}</b>{" "}
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
              <StatusMenu value={task.status} onChange={changeStatus}/>
            </div>
            <div className="section-label" style={{ margin: "0 0 4px" }}>Details</div>
            <Row label="Assignee">
              <Avatar user={assignee} size="sm"/><span>{assignee?.name ?? "—"}</span>
            </Row>
            <Row label="Team">
              <span className="label-chip" style={{
                background: (team ? colorFor(team.id) : "#666") + "26",
                color: team ? colorFor(team.id) : "var(--text)"
              }}>{team?.name ?? "—"}</span>
            </Row>
            <Row label="Priority">
              <PriorityChip priority={task.priority}/>
              <span style={{ textTransform: "capitalize" }}>{PRIORITY_LABELS[task.priority]}</span>
            </Row>
            <Row label="Deadline">
              <Icon name="calendar" size={14}/>
              <span>{new Date(task.deadline).toLocaleDateString()}</span>
            </Row>
            <Row label="Project"><span>{project?.name ?? "—"}</span></Row>
            <Row label={`Status pill ${STATUS_CLASS[task.status]}`} hide>{null}</Row>
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div className="section-label" style={{ marginTop: 0 }}>Created</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                {new Date(task.createdAt).toLocaleString()}<br/>
                Updated {new Date(task.updatedAt).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, hide, children }: { label: string; hide?: boolean; children: React.ReactNode }) {
  if (hide) return null;
  return (
    <div className="field-row">
      <div className="field-label">{label}</div>
      <div className="field-value">{children}</div>
    </div>
  );
}
