import { InboxIcon, SparkleIcon, FileTextIcon } from "./Icons";

export type Tab = "queue" | "ticket" | "copilot";

/** The phone layout's bottom bar (56px plus the safe-area inset): one pane at a time, the selected ticket persists. */
export function TabBar({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  const items: { id: Tab; label: string; Icon: typeof InboxIcon }[] = [
    { id: "queue", label: "Queue", Icon: InboxIcon },
    { id: "ticket", label: "Ticket", Icon: FileTextIcon },
    { id: "copilot", label: "Copilot", Icon: SparkleIcon },
  ];
  return (
    <nav className="tabbar" aria-label="Sections">
      {items.map(({ id, label, Icon }) => (
        <button key={id} type="button" className="tab" aria-current={tab === id ? "page" : undefined} onClick={() => onTab(id)}>
          <Icon size={20} weight={tab === id ? "fill" : "regular"} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
