import React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface AcceptingProgressProps {
  progress: number;
  statusText: string;
}

const AcceptingProgress: React.FC<AcceptingProgressProps> = ({ progress, statusText }) => {
  return (
    <div className="accepting-progress-overlay">
      <div className="accepting-progress-card glass">
        <div className="accepting-header">
          <div className="loading-icon-wrapper">
             {progress < 100 ? (
               <Loader2 className="animate-spin" size={32} color="var(--gold)" />
             ) : (
               <CheckCircle2 size={32} color="#10b981" />
             )}
          </div>
          <h2>{progress < 100 ? 'Accepting Job Request' : 'Job Accepted!'}</h2>
          <p>{statusText}</p>
        </div>

        <div className="progress-container">
          <div className="progress-bar-bg">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <div className="progress-percentage">{Math.round(progress)}%</div>
        </div>

        <div className="steps-indicator">
          <div className={`step ${progress >= 20 ? 'completed' : ''}`}>
             <div className="step-dot"></div>
             <span>Data</span>
          </div>
          <div className={`step ${progress >= 50 ? 'completed' : ''}`}>
             <div className="step-dot"></div>
             <span>Processing</span>
          </div>
          <div className={`step ${progress >= 80 ? 'completed' : ''}`}>
             <div className="step-dot"></div>
             <span>Syncing</span>
          </div>
          <div className={`step ${progress >= 100 ? 'completed' : ''}`}>
             <div className="step-dot"></div>
             <span>Done</span>
          </div>
        </div>
      </div>
      
      <style>{`
        .accepting-progress-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 253, 246, 0.85);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: fadeIn 0.3s ease-out;
        }

        .accepting-progress-card {
          width: 100%;
          max-width: 450px;
          padding: 40px;
          border-radius: 32px;
          background: white;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.08);
          text-align: center;
        }

        .accepting-header h2 {
          margin: 16px 0 8px;
          font-family: var(--font-headings);
          color: var(--ink);
        }

        .accepting-header p {
          font-size: 0.9rem;
          color: var(--ink-soft);
          opacity: 0.7;
          margin-bottom: 32px;
          min-height: 1.2em;
        }

        .loading-icon-wrapper {
          display: flex;
          justify-content: center;
          margin-bottom: 8px;
        }

        .animate-spin {
          animation: spin 1.5s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .progress-container {
          margin-bottom: 24px;
        }

        .progress-bar-bg {
          height: 8px;
          background: rgba(26, 61, 51, 0.05);
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .progress-bar-fill {
          height: 100%;
          background: var(--gold);
          border-radius: 10px;
          transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .progress-percentage {
          font-family: var(--font-ui);
          font-size: 0.75rem;
          color: var(--gold);
          font-weight: 600;
        }

        .steps-indicator {
          display: flex;
          justify-content: space-between;
          padding: 0 10px;
        }

        .step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          opacity: 0.3;
          transition: all 0.3s ease;
        }

        .step.completed {
          opacity: 1;
        }

        .step-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--ink-soft);
        }

        .step.completed .step-dot {
          background: var(--gold);
          box-shadow: 0 0 8px var(--gold);
        }

        .step span {
          font-size: 0.65rem;
          font-family: var(--font-ui);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default AcceptingProgress;
