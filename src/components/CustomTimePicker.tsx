import React, { useState, useRef, useEffect } from 'react';
import { Clock, Check, ChevronDown } from 'lucide-react';

interface CustomTimePickerProps {
  value: string | undefined; // HH:mm
  onChange: (value: string) => void;
  placeholder?: string;
}

const CustomTimePicker: React.FC<CustomTimePickerProps> = ({ value, onChange, placeholder }) => {
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

  const generateTimeOptions = () => {
    const times = [];
    for (let hour = 7; hour <= 19; hour++) {
      for (let min of ['00', '30']) {
        const time = `${String(hour).padStart(2, '0')}:${min}`;
        times.push(time);
      }
    }
    return times;
  };

  const formatDisplayTime = (timeStr: string) => {
    if (!timeStr) return '';
    const [hour, min] = timeStr.split(':');
    const h = parseInt(hour);
    if (isNaN(h)) return '';
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${min} ${ampm}`;
  };

  const timeOptions = generateTimeOptions();

  return (
    <div className="custom-time-picker-container" ref={containerRef}>
      <div 
        className={`time-trigger glass ${isOpen ? 'open' : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="trigger-content">
          <Clock size={16} />
          <span className={value ? 'selected-time' : 'placeholder'}>
            {value ? formatDisplayTime(value) : (placeholder || 'Select time')}
          </span>
        </div>
        <ChevronDown size={14} className={`chevron ${isOpen ? 'rotate' : ''}`} />
      </div>

      {isOpen && (
        <div className="time-dropdown glass fade-in">
          <div className="time-grid">
            {timeOptions.map((time) => (
              <button 
                key={time} 
                className={`time-option ${time === value ? 'selected' : ''}`}
                onClick={() => {
                  onChange(time);
                  setIsOpen(false);
                }}
              >
                {formatDisplayTime(time)}
                {time === value && <Check size={12} />}
              </button>
            ))}
          </div>
          <div className="custom-time-input-row">
            <label>Manual Entry</label>
            <input 
              type="time" 
              value={value || ''} 
              onChange={(e) => onChange(e.target.value)} 
              className="native-time-fallback"
            />
          </div>
        </div>
      )}

      <style>{`
        .custom-time-picker-container {
          position: relative;
          width: 100%;
        }

        .time-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: white;
          border: 1px solid var(--cream-warm);
          border-radius: 18px;
          cursor: pointer;
          transition: all 0.2s;
          color: var(--ink);
          font-weight: 600;
          font-size: 0.95rem;
        }

        .time-trigger:hover {
          border-color: var(--ink);
          box-shadow: 0 4px 12px rgba(26, 61, 51, 0.05);
        }

        .time-trigger.open {
          border-color: var(--ink);
        }

        .trigger-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .placeholder {
          color: var(--ink-soft);
          opacity: 0.5;
        }

        .chevron {
          transition: transform 0.3s ease;
          opacity: 0.5;
        }

        .chevron.rotate {
          transform: rotate(180deg);
        }

        .time-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          z-index: 1100;
          background: rgba(255, 255, 255, 0.98);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.5);
          border-radius: 24px;
          padding: 16px;
          box-shadow: 0 20px 50px rgba(26, 61, 51, 0.15);
        }

        .time-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          max-height: 240px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .time-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid transparent;
          background: var(--paper);
          color: var(--ink-soft);
          font-weight: 700;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .time-option:hover {
          background: var(--cream-warm);
          color: var(--ink);
        }

        .time-option.selected {
          background: var(--ink);
          color: white;
        }

        .custom-time-input-row {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid var(--cream-warm);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .custom-time-input-row label {
          font-size: 0.7rem;
          font-weight: 800;
          text-transform: uppercase;
          color: var(--ink-soft);
          opacity: 0.6;
        }

        .native-time-fallback {
          border: 1px solid var(--cream-warm);
          border-radius: 8px;
          padding: 4px 8px;
          font-family: inherit;
          font-weight: 700;
          color: var(--ink);
        }

        .fade-in {
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .time-grid::-webkit-scrollbar {
          width: 4px;
        }
        .time-grid::-webkit-scrollbar-thumb {
          background: var(--cream-warm);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};

export default CustomTimePicker;
