import React from 'react';

interface Step {
  id: string;
  name: string;
}

interface StepperProps {
  currentStep: number;
  steps: Step[];
}

const Stepper: React.FC<StepperProps> = ({ currentStep, steps }) => {
  return (
    <div className="stepper-container">
      <div className="stepper-track">
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <div className={`step-item ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}>
              <div className="step-number">
                {index < currentStep ? '✓' : step.id}
              </div>
              <div className="step-name">{step.name}</div>
            </div>
            {index < steps.length - 1 && (
              <div className={`step-connector ${index < currentStep ? 'completed' : ''}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      <style>{`
        .stepper-container {
          width: 100%;
          padding: 20px 0;
        }

        .stepper-track {
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: relative;
        }

        .step-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          z-index: 1;
          flex: 1;
        }

        .step-number {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--cream-warm);
          border: 2px solid var(--cream-warm);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-ui);
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--ink-soft);
          margin-bottom: 8px;
          transition: all 0.3s ease;
        }

        .step-name {
          font-family: var(--font-ui);
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--ink-soft);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          text-align: center;
        }

        .step-item.active .step-number {
          background: white;
          border-color: var(--yellow);
          color: var(--ink);
          box-shadow: 0 0 0 4px rgba(234, 240, 68, 0.2);
        }

        .step-item.active .step-name {
          color: var(--ink);
        }

        .step-item.completed .step-number {
          background: var(--yellow);
          border-color: var(--yellow);
          color: var(--ink);
        }

        .step-connector {
          flex: 1;
          height: 2px;
          background: var(--cream-warm);
          margin-top: -24px;
          position: relative;
          z-index: 0;
        }

        .step-connector.completed {
          background: var(--yellow);
        }
      `}</style>
    </div>
  );
};

export default Stepper;
