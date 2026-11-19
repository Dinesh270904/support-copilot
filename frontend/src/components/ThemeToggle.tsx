import { MoonIcon, SunIcon } from "./Icons";
import type { Theme } from "../hooks/useTheme";

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className="icon-btn" onClick={onToggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme · T`}>
      {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
    </button>
  );
}
