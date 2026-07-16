import { useRef, useState } from "react";

interface InteractiveGridProps {
  className?: string;
}

export function InteractiveGrid({ className = "" }: InteractiveGridProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: -1000, y: -1000 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setMousePosition({ x: -1000, y: -1000 })}
      className={`absolute inset-0 z-0 overflow-hidden bg-slate-950 ${className}`}
    >
      <div 
        className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f40_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f40_1px,transparent_1px)] bg-[size:40px_40px] transition-all duration-300 ease-out"
        style={{
          WebkitMaskImage: `radial-gradient(circle 300px at ${mousePosition.x}px ${mousePosition.y}px, black, transparent)`,
          maskImage: `radial-gradient(circle 300px at ${mousePosition.x}px ${mousePosition.y}px, black, transparent)`
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,rgba(36,92,103,0.15),transparent)] pointer-events-none" />
    </div>
  );
}
