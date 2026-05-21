import type { Task, User } from "@mini-jira/shared";
import { Icon } from "./Icon";
import { Avatar } from "./Avatar";
import { PriorityChip } from "./PriorityChip";

export function KanbanCard({
  task, users, onOpen, onDragStart, onDragEnd, dragging
}: {
  task: Task;
  users: User[];
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const assignee = users.find((u) => u.id === task.assigneeId);
  const active = task.attachments.find((a) => a.active);
  return (
    <div
      className={`card ${dragging ? "dragging" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
    >
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
