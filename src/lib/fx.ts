// Client-only celebratory particle burst, e.g. on Pay or AI-insight clicks.
const COLORS = ["#8b7bff", "#6d8bff", "#22d3ee", "#c4b5fd", "#ffffff"];

export function burst(x: number, y: number, count = 18) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    const size = 4 + Math.random() * 5;
    p.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:${
      Math.random() > 0.5 ? "9999px" : "2px"
    };background:${COLORS[i % COLORS.length]};pointer-events:none;z-index:100`;
    document.body.appendChild(p);

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 40 + Math.random() * 70;
    p.animate(
      [
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
        {
          transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist + 20}px)) scale(0.3) rotate(${
            Math.random() * 360
          }deg)`,
          opacity: 0,
        },
      ],
      { duration: 700 + Math.random() * 400, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    ).onfinish = () => p.remove();
  }
}

export function burstFromEvent(e: React.MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2);
}
