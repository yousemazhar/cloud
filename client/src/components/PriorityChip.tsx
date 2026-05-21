import type { Priority } from "@mini-jira/shared";
import { PRIORITY_LABELS } from "@mini-jira/shared";
import { Icon, type IconName } from "./Icon";

const PRIORITY_COLOR: Record<Priority, string> = {
  low: "#4bce97",
  medium: "#e2a000",
  high: "#f15b50",
  urgent: "#ca3521"
};

const PRIORITY_ICON: Record<Priority, IconName> = {
  low: "trend-up",      // visually rotated by CSS in the future; using trend-up as filler
  medium: "alert",
  high: "trend-up",
  urgent: "alert"
};

export { PRIORITY_COLOR };

export function PriorityChip({ priority }: { priority: Priority }) {
  return (
    <span className="prio" title={PRIORITY_LABELS[priority]} style={{ color: PRIORITY_COLOR[priority] }}>
      <Icon name={PRIORITY_ICON[priority]} size={14} strokeWidth={2.4}/>
    </span>
  );
}
