import type { User } from "@mini-jira/shared";
import { Icon } from "./Icon";
import { MJLogo } from "./MJLogo";
import { colorFor, initials } from "../utils/colors";
import type { Screen } from "../routes";

interface TopNavProps {
  user: User;
  screen: Screen;
  onNav: (s: Screen) => void;
  onCreate: () => void;
  onLogout: () => void;
}

export function TopNav({ user, screen, onNav, onCreate, onLogout }: TopNavProps) {
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
          <input placeholder="Search" readOnly/>
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
