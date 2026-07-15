import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

interface StepItem {
  title: string;
  description?: string;
}

interface StepsProps {
  steps: StepItem[];
  currentStep: number;
  className?: string;
}

export function Steps({ steps, currentStep, className }: StepsProps) {
  return (
    <div className={cn("flex items-center", className)}>
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;
        const isUpcoming = stepNumber > currentStep;

        return (
          <div key={index} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300",
                  isCompleted && "border-primary bg-primary text-primary-foreground",
                  isCurrent && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/10",
                  isUpcoming && "border-border bg-card text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="size-4" /> : stepNumber}
              </div>
              <div className="mt-2 text-center">
                <p
                  className={cn(
                    "text-xs font-medium whitespace-nowrap",
                    isCurrent ? "text-foreground" : isCompleted ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.title}
                </p>
              </div>
            </div>
            {index < steps.length - 1 ? (
              <div
                className={cn(
                  "mx-3 h-0.5 w-12 rounded-full transition-colors duration-300 sm:w-20",
                  isCompleted ? "bg-primary" : "bg-border",
                )}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
