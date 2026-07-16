import { motion } from "framer-motion";

interface AnimatedCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function AnimatedCheckbox({ checked, onChange, label }: AnimatedCheckboxProps) {
  return (
    <label className="flex items-center space-x-3 cursor-pointer group">
      <div className="relative flex items-center justify-center w-6 h-6 border-2 rounded border-slate-600 bg-slate-900 group-hover:border-teal-500 transition-colors">
        <motion.svg
          initial={false}
          animate={{ opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.1 }}
          className="absolute inset-0 w-full h-full text-teal-400 p-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <motion.path
            initial={{ pathLength: 0 }}
            animate={{ pathLength: checked ? 1 : 0 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
              opacity: { duration: 0.1 }
            }}
            d="M5 12l5 5L20 7"
          />
        </motion.svg>
      </div>
      <input
        type="checkbox"
        className="hidden"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm font-medium text-slate-300 group-hover:text-slate-100 transition-colors">
        {label}
      </span>
    </label>
  );
}
