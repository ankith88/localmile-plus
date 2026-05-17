import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options, placeholder, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={`custom-select-container ${className || ''}`} ref={containerRef}>
      <div 
        className={`select-trigger glass ${isOpen ? 'open' : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="trigger-content">
          {selectedOption?.icon && <span className="option-icon">{selectedOption.icon}</span>}
          <span className={selectedOption ? 'selected-label' : 'placeholder'}>
            {selectedOption ? selectedOption.label : (placeholder || 'Select option')}
          </span>
        </div>
        <ChevronDown size={16} className={`chevron ${isOpen ? 'rotate' : ''}`} />
      </div>

      {isOpen && (
        <div className="select-dropdown glass fade-in">
          {options.map((option) => (
            <div 
              key={option.value} 
              className={`select-option ${option.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              <div className="option-info">
                {option.icon && <span className="option-icon">{option.icon}</span>}
                <span className="option-label">{option.label}</span>
              </div>
              {option.value === value && <Check size={14} className="check-icon" />}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .custom-select-container {
          position: relative;
          min-width: 180px;
          user-select: none;
        }

        .select-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.5);
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s;
          color: var(--ink);
          font-weight: 600;
          font-size: 0.9rem;
        }

        .select-trigger:hover {
          background: white;
          box-shadow: 0 4px 12px rgba(26, 61, 51, 0.05);
          border-color: var(--ink);
        }

        .select-trigger.open {
          border-color: var(--ink);
          box-shadow: 0 0 0 4px rgba(26, 61, 51, 0.05);
        }

        .trigger-content {
          display: flex;
          align-items: center;
          gap: 10px;
          overflow: hidden;
        }

        .selected-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .placeholder {
          color: var(--ink-soft);
          opacity: 0.5;
        }

        .chevron {
          transition: transform 0.3s ease;
          opacity: 0.6;
          flex-shrink: 0;
          margin-left: 8px;
        }

        .chevron.rotate {
          transform: rotate(180deg);
        }

        .select-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          z-index: 1100;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.5);
          border-radius: 18px;
          padding: 6px;
          box-shadow: 0 20px 50px rgba(26, 61, 51, 0.15);
          max-height: 300px;
          overflow-y: auto;
        }

        .select-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          color: var(--ink-soft);
          font-weight: 600;
          font-size: 0.9rem;
        }

        .select-option:hover {
          background: rgba(26, 61, 51, 0.05);
          color: var(--ink);
          transform: translateX(4px);
        }

        .select-option.selected {
          background: var(--paper);
          color: var(--ink);
        }

        .option-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .check-icon {
          color: var(--gold);
        }

        .fade-in {
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Custom Scrollbar */
        .select-dropdown::-webkit-scrollbar {
          width: 6px;
        }
        .select-dropdown::-webkit-scrollbar-track {
          background: transparent;
        }
        .select-dropdown::-webkit-scrollbar-thumb {
          background: rgba(26, 61, 51, 0.1);
          border-radius: 10px;
        }
        .select-dropdown::-webkit-scrollbar-thumb:hover {
          background: rgba(26, 61, 51, 0.2);
        }
      `}</style>
    </div>
  );
};

export default CustomSelect;
