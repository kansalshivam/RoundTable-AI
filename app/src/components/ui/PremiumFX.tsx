import { useEffect, useMemo, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import {
  ChartLineUp,
  Command,
  Gauge,
  MicrophoneStage,
  Sparkle,
  Waveform,
} from "@phosphor-icons/react";

export function AuroraMesh() {
  return (
    <div className="aurora-mesh" aria-hidden="true">
      <motion.div
        className="aurora-orb orb-one"
        animate={{ x: [0, 24, -10, 0], y: [0, -18, 18, 0], scale: [1, 1.08, 0.98, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="aurora-orb orb-two"
        animate={{ x: [0, -20, 16, 0], y: [0, 22, -12, 0], scale: [1, 0.94, 1.08, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="aurora-grid" />
    </div>
  );
}

export function NoiseOverlay() {
  return <div className="noise-overlay" aria-hidden="true" />;
}

export function CursorHalo() {
  const x = useMotionValue(-120);
  const y = useMotionValue(-120);
  const smoothX = useSpring(x, { stiffness: 280, damping: 30 });
  const smoothY = useSpring(y, { stiffness: 280, damping: 30 });
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const update = (event: PointerEvent) => {
      x.set(event.clientX - 18);
      y.set(event.clientY - 18);
    };
    
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      if (
        target.tagName === "BUTTON" ||
        target.tagName === "A" ||
        target.tagName === "SELECT" ||
        target.closest("button") ||
        target.closest("a") ||
        target.classList.contains("interactive") ||
        target.classList.contains("session-card") ||
        target.classList.contains("transcript-item") ||
        target.classList.contains("dock-button") ||
        window.getComputedStyle(target).cursor === "pointer"
      ) {
        setIsHovering(true);
      } else {
        setIsHovering(false);
      }
    };

    window.addEventListener("pointermove", update);
    window.addEventListener("mouseover", handleMouseOver);
    return () => {
      window.removeEventListener("pointermove", update);
      window.removeEventListener("mouseover", handleMouseOver);
    };
  }, [x, y]);

  return (
    <motion.div 
      className="cursor-halo" 
      style={{ x: smoothX, y: smoothY }} 
      animate={{
        scale: isHovering ? 1.4 : 1,
        borderColor: isHovering ? "var(--color-accent-mint)" : "rgba(150,120,227,0.35)",
        boxShadow: isHovering ? "0 0 20px rgba(61,224,192,0.4)" : "0 0 28px rgba(150,120,227,0.28)"
      }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      aria-hidden="true"
    >
      {isHovering && (
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            background: 'var(--color-accent-mint)',
            transform: 'translate(-50%, -50%)'
          }}
        />
      )}
    </motion.div>
  );
}

export function CommandDock({
  onNewSession,
  onDashboard,
  onCohort,
}: {
  onNewSession: () => void;
  onDashboard: () => void;
  onCohort: () => void;
}) {
  const actions = useMemo(
    () => [
      { label: "Sessions", icon: Gauge, action: onDashboard },
      { label: "New", icon: MicrophoneStage, action: onNewSession },
      { label: "Cohort", icon: ChartLineUp, action: onCohort },
    ],
    [onCohort, onDashboard, onNewSession],
  );

  return (
    <nav className="command-dock" aria-label="Primary actions">
      <span className="dock-command"><Command size={16} weight="bold" /> Ctrl K</span>
      {actions.map((item) => {
        const Icon = item.icon;
        return (
          <motion.button
            key={item.label}
            type="button"
            whileHover={{ y: -2, scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={item.action}
            className="dock-button"
          >
            <Icon size={18} weight="duotone" />
            {item.label}
          </motion.button>
        );
      })}
    </nav>
  );
}

export function InsightRibbon({ items }: { items: Array<{ label: string; value: string; tone?: "mock" | "live" | "neutral" }> }) {
  return (
    <div className="insight-ribbon">
      {items.map((item, index) => (
        <motion.div
          key={`${item.label}-${item.value}`}
          className={`insight-chip ${item.tone || "neutral"}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: index * 0.06 }}
        >
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </motion.div>
      ))}
    </div>
  );
}

export function SignalLattice({ active = false }: { active?: boolean }) {
  return (
    <div className="signal-lattice" aria-hidden="true">
      {Array.from({ length: 18 }).map((_, index) => (
        <motion.span
          key={index}
          animate={{ height: active ? [18, 42 + (index % 5) * 7, 24] : [18, 24, 18] }}
          transition={{ duration: 1.2 + index * 0.03, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      <Waveform size={28} weight="duotone" />
    </div>
  );
}

export function FloatingSparkles() {
  return (
    <div className="floating-sparkles" aria-hidden="true">
      {Array.from({ length: 10 }).map((_, index) => (
        <motion.span
          key={index}
          style={{ left: `${8 + index * 9}%`, top: `${12 + (index % 4) * 18}%` }}
          animate={{ y: [0, -12, 0], opacity: [0.22, 0.82, 0.22], rotate: [0, 12, 0] }}
          transition={{ duration: 4 + index * 0.35, repeat: Infinity, ease: "easeInOut" }}
        >
          <Sparkle size={12 + (index % 3) * 3} weight="fill" />
        </motion.span>
      ))}
    </div>
  );
}
