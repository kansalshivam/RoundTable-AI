import { Check, CircleNotch } from "@phosphor-icons/react";
import { motion } from "motion/react";

interface Step {
  id: string;
  label: string;
}

interface StepTrackerProps {
  steps: Step[];
  currentStepId: string;
}

export function StepTracker({ steps, currentStepId }: StepTrackerProps) {
  const currentIndex = steps.findIndex(s => s.id === currentStepId);

  return (
    <div className="flex flex-col space-y-4 relative w-full">
      {/* Background Line */}
      <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-[var(--border)] -z-10" />
      
      {/* Active Line */}
      <motion.div 
        className="absolute left-4 top-4 w-0.5 bg-[var(--color-lavender-500)] -z-10"
        initial={{ height: 0 }}
        animate={{ height: `${(currentIndex / (steps.length - 1)) * 100}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
        style={{ boxShadow: '0 0 8px rgba(150,120,227,0.4)' }}
      />

      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isActive = index === currentIndex;

        return (
          <div key={step.id} className="flex items-center space-x-4">
            <motion.div 
              initial={false}
              animate={{
                backgroundColor: isCompleted ? "#9678E3" : isActive ? "#1B1140" : "#241947",
                borderColor: isActive || isCompleted ? "#9678E3" : "#2E2158",
                scale: isActive ? 1.1 : 1,
                boxShadow: isActive ? '0 0 16px rgba(150,120,227,0.4)' : isCompleted ? '0 0 8px rgba(150,120,227,0.2)' : 'none'
              }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0"
            >
              {isCompleted ? (
                <Check size={16} weight="bold" color="white" />
              ) : isActive ? (
                <CircleNotch size={16} weight="bold" color="#B49BEE" />
              ) : (
                <span className="text-xs font-bold text-[var(--muted)]">
                  {index + 1}
                </span>
              )}
            </motion.div>
            <span className={`text-sm font-medium transition-colors ${
              isActive ? "text-[var(--text)]" : isCompleted ? "text-[var(--color-lavender-600)]" : "text-[var(--muted)]"
            }`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
