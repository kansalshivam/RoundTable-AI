import { motion } from "framer-motion";

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
      <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-slate-800 -z-10" />
      
      {/* Active Line */}
      <motion.div 
        className="absolute left-4 top-4 w-0.5 bg-teal-500 -z-10"
        initial={{ height: 0 }}
        animate={{ height: `${(currentIndex / (steps.length - 1)) * 100}%` }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
      />

      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isActive = index === currentIndex;

        return (
          <div key={step.id} className="flex items-center space-x-4">
            <motion.div 
              initial={false}
              animate={{
                backgroundColor: isCompleted ? "#14b8a6" : isActive ? "#0f766e" : "#1e293b",
                borderColor: isActive || isCompleted ? "#14b8a6" : "#334155",
                scale: isActive ? 1.1 : 1
              }}
              className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0"
            >
              {isCompleted ? (
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className={`text-xs font-bold ${isActive ? "text-white" : "text-slate-400"}`}>
                  {index + 1}
                </span>
              )}
            </motion.div>
            <span className={`text-sm font-medium transition-colors ${
              isActive ? "text-white" : isCompleted ? "text-slate-300" : "text-slate-500"
            }`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
