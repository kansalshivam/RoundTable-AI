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
      className={`absolute inset-0 z-0 overflow-hidden bg-[var(--bg)] ${className}`}
    >
      <div 
        className="absolute inset-0 transition-all duration-300 ease-out"
        style={{
          backgroundImage: 'linear-gradient(to right, rgba(150,120,227,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(150,120,227,0.10) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          WebkitMaskImage: `radial-gradient(circle 300px at ${mousePosition.x}px ${mousePosition.y}px, black, transparent)`,
          maskImage: `radial-gradient(circle 300px at ${mousePosition.x}px ${mousePosition.y}px, black, transparent)`
        }}
      />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle 800px at 50% 50%, rgba(100,70,176,0.15), transparent)' }} />
    </div>
  );
}
