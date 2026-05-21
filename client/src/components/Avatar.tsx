import { colorFor, initials } from "../utils/colors";

export function Avatar({
  user,
  size = ""
}: {
  user?: { id: string; name: string } | null;
  size?: "" | "sm";
}) {
  if (!user) {
    return (
      <div className={`avatar ${size}`} style={{ background: "var(--surface-3)", color: "var(--text-3)" }}>
        ?
      </div>
    );
  }
  return (
    <div className={`avatar ${size}`} style={{ background: colorFor(user.id) }}>
      {initials(user.name)}
    </div>
  );
}
