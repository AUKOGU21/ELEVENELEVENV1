import { motion } from "framer-motion";
import { FIT_CATEGORIES } from "./OnboardingData";

interface FitStepProps {
  fitAnswers: Record<string, string>;
  onSelect: (category: string, value: string) => void;
}

const FitStep = ({ fitAnswers, onSelect }: FitStepProps) => {
  return (
    <motion.div
      key="fit"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
    >
      <h2 className="font-sans text-3xl md:text-4xl font-light text-foreground mb-2">
        Dial in your fit
      </h2>
      <p className="text-muted-foreground text-sm mb-8">
        Quick details that make your matches way more accurate.
      </p>

      <div className="space-y-5">
        {FIT_CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <p className="text-sm font-medium text-foreground mb-2">{cat.label}</p>
            <div className="flex flex-wrap gap-2">
              {cat.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => onSelect(cat.label, opt)}
                  className={`pill-button ${fitAnswers[cat.label] === opt ? "active" : ""}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default FitStep;
