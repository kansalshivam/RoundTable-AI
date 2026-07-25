import { Check } from "@phosphor-icons/react";
import { motion } from "motion/react";

interface AnimatedCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function AnimatedCheckbox({ checked, onChange, label }: AnimatedCheckboxProps) {
  return (
    <label className="flex items-center space-x-3 cursor-pointer group">
      <motion.div
        animate={{
          backgroundColor: checked ? "#9678E3" : "#1B1140",
          borderColor: checked ? "#9678E3" : "#2E2158",
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative flex items-center justify-center w-6 h-6 border-2 rounded-md"
        style={{ boxShadow: checked ? '0 0 12px rgba(150,120,227,0.35)' : 'none' }}
      >
        <motion.span initial={false} animate={{ scale: checked ? 1 : 0, opacity: checked ? 1 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
          <Check size={15} weight="bold" color="white" />
        </motion.span>
      </motion.div>
      <input
        type="checkbox"
        className="hidden"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm font-medium text-[var(--text)] group-hover:text-[var(--color-lavender-600)] transition-colors">
        {label}
      </span>
    </label>
  );
}
