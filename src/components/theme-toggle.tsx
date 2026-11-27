"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const read = (): Theme =>
  document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
const subscribe = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
};

function setTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem("theme", t);
  } catch {
    /* private mode: theme still applies for this visit */
  }
}

const OPTIONS: { value: Theme; label: string; swatch: string }[] = [
  { value: "light", label: "Light theme", swatch: "linear-gradient(180deg,#ffffff 50%,#0f5e5a 50%)" },
  { value: "dark", label: "Dark theme", swatch: "linear-gradient(180deg,#eef0ff 50%,#141a42 50%)" },
];

/** Round swatches, like the colour dots in the reference portal header. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);

  return (
    <div role="radiogroup" aria-label="Colour theme" className="flex items-center gap-2">
      {OPTIONS.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => setTheme(o.value)}
            className={`h-7 w-7 rounded-full border-2 transition ${
              active ? "border-white ring-2 ring-white/40" : "border-white/30 hover:border-white/70"
            }`}
            style={{ background: o.swatch }}
          />
        );
      })}
    </div>
  );
}
