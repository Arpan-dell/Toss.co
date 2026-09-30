// Splits a heading into words that rise into view one after another on scroll.
export function RevealText({ text, className = "", gradient = false }: { text: string; className?: string; gradient?: boolean }) {
  return (
    <span className={className}>
      {text.split(" ").map((word, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <span
            data-reveal="word"
            data-reveal-delay={i * 60}
            className={`inline-block ${gradient ? "text-gradient" : ""}`}
          >
            {word}
            {" "}
          </span>
        </span>
      ))}
    </span>
  );
}
