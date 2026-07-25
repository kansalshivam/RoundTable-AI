import { useRef, useState } from "react";

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
  glowSize?: number;
}

export function SpotlightCard({ 
  children, 
  className = "", 
  glowColor = "rgba(150, 120, 227, 0.15)",
  glowSize = 400 
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const div = divRef.current;
    const rect = div.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseEnter = () => setOpacity(1);
  const handleMouseLeave = () => setOpacity(0);

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden rounded-xl border border-[var(--border)] bg-[rgba(27,17,64,0.65)] shadow-[var(--shadow)] backdrop-blur-[12px] ${className}`}
    >
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 z-10"
        style={{
          opacity,
          background: `radial-gradient(${glowSize}px circle at ${position.x}px ${position.y}px, ${glowColor}, transparent 40%)`,
        }}
      />
      <div className="relative z-20">
        {children}
      </div>
    </div>
  );
}

export function GradientBorderCard({
  children,
  className = "",
  glowColor = "rgba(61, 224, 192, 0.35)", // default to mint/cyan neon for high contrast border
  glowSize = 250
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const div = divRef.current;
    const rect = div.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseEnter = () => setOpacity(1);
  const handleMouseLeave = () => setOpacity(0);

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative rounded-xl p-[1px] overflow-hidden ${className}`}
      style={{
        background: "rgba(46, 33, 88, 0.45)",
        boxShadow: "var(--shadow)"
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 z-10"
        style={{
          opacity,
          background: `radial-gradient(${glowSize}px circle at ${position.x}px ${position.y}px, ${glowColor}, transparent 60%)`,
        }}
      />
      <div 
        className="relative z-20 w-full h-full rounded-[11px] bg-[rgba(27,17,64,0.85)] p-5 backdrop-blur-[12px]"
      >
        {children}
      </div>
    </div>
  );
}
