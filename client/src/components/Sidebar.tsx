import type { Project } from "@mini-jira/shared";
import { Icon, type IconName } from "./Icon";
import { colorFor, initials } from "../utils/colors";
import type { Screen } from "../routes";

export function Sidebar({
  project,
  screen,
  onNav
}: { project: Project | null; screen: Screen; onNav: (s: Screen) => void }) {
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
        Deployed on AWS<br/>
        <span className="sb-footer-link">EC2 · DynamoDB · S3 · SNS · CloudFront</span>
      </div>
    </aside>
  );
}

function SbItem({
  icon,
  label,
  active,
  onClick
}: { icon: IconName; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button className={`sb-item ${active ? "is-active" : ""}`} onClick={onClick}>
      <span className="sb-item-icon"><Icon name={icon} size={16}/></span>
      {label}
    </button>
  );
}
