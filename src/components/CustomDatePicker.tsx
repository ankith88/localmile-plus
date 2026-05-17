import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface CustomDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  min?: string;
}

const CustomDatePicker: React.FC<CustomDatePickerProps> = ({ value, onChange, placeholder, min }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : new Date());
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

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const daysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun
    
    const days = [];
    // Padding
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    // Days
    for (let i = 1; i <= lastDay; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const handleDateSelect = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    onChange(`${year}-${month}-${day}`);
    setIsOpen(false);
  };

  const navigateMonth = (direction: number) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(currentMonth.getMonth() + direction);
    setCurrentMonth(newMonth);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const isSelected = (date: Date) => {
    if (!value) return false;
    const selected = new Date(value);
    return date.getDate() === selected.getDate() &&
           date.getMonth() === selected.getMonth() &&
           date.getFullYear() === selected.getFullYear();
  };

  const isDisabled = (date: Date) => {
    if (!min) return false;
    const minDate = new Date(min);
    minDate.setHours(0,0,0,0);
    return date < minDate;
  };

  return (
    <div className="custom-datepicker-container" ref={containerRef}>
      <div className="datepicker-trigger" onClick={() => setIsOpen(!isOpen)}>
        <CalendarIcon size={16} />
        <span className={value ? 'selected-value' : 'placeholder'}>
          {value ? formatDate(value) : (placeholder || 'Select date')}
        </span>
        {value && (
          <button 
            className="clear-btn" 
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="datepicker-popup glass fade-in">
          <div className="popup-header">
            <button onClick={() => navigateMonth(-1)}><ChevronLeft size={16} /></button>
            <span className="current-month-label">
              {currentMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={() => navigateMonth(1)}><ChevronRight size={16} /></button>
          </div>
          
          <div className="calendar-grid">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
              <div key={d} className="weekday-label">{d}</div>
            ))}
            {daysInMonth(currentMonth).map((date, idx) => (
              <div key={idx} className="day-cell-wrapper">
                {date ? (
                  <button
                    className={`day-btn ${isToday(date) ? 'today' : ''} ${isSelected(date) ? 'selected' : ''}`}
                    onClick={() => handleDateSelect(date)}
                    disabled={isDisabled(date)}
                  >
                    {date.getDate()}
                  </button>
                ) : <div className="day-empty" />}
              </div>
            ))}
          </div>
          
          <div className="popup-footer">
            <button className="today-btn" onClick={() => handleDateSelect(new Date())}>Today</button>
          </div>
        </div>
      )}

      <style>{`
        .custom-datepicker-container {
          position: relative;
          display: inline-block;
          width: 100%;
        }

        .datepicker-trigger {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.5);
          padding: 10px 16px;
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s;
          color: var(--ink);
          font-weight: 600;
          font-size: 0.9rem;
          min-width: 160px;
        }

        .datepicker-trigger:hover {
          background: white;
          box-shadow: 0 4px 12px rgba(26, 61, 51, 0.05);
          border-color: var(--ink);
        }

        .datepicker-trigger .placeholder {
          color: var(--ink-soft);
          opacity: 0.5;
        }

        .clear-btn {
          margin-left: auto;
          background: rgba(0, 0, 0, 0.05);
          border: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--ink-soft);
          transition: all 0.2s;
        }

        .clear-btn:hover {
          background: #ff4757;
          color: white;
        }

        .datepicker-popup {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          z-index: 1000;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.5);
          border-radius: 20px;
          padding: 20px;
          width: 280px;
          box-shadow: 0 20px 50px rgba(26, 61, 51, 0.15);
        }

        .popup-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .popup-header button {
          background: var(--offwhite);
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--ink);
          transition: all 0.2s;
        }

        .popup-header button:hover {
          background: var(--cream-warm);
        }

        .current-month-label {
          font-weight: 800;
          font-size: 0.9rem;
          color: var(--ink);
        }

        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }

        .weekday-label {
          text-align: center;
          font-size: 0.65rem;
          font-weight: 800;
          color: var(--ink-soft);
          opacity: 0.5;
          padding-bottom: 8px;
        }

        .day-cell-wrapper {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .day-btn {
          width: 100%;
          height: 100%;
          border: none;
          background: transparent;
          border-radius: 10px;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--ink);
          cursor: pointer;
          transition: all 0.2s;
        }

        .day-btn:hover:not(:disabled) {
          background: var(--cream-warm);
          color: var(--ink);
        }

        .day-btn.today {
          color: var(--gold);
          font-weight: 800;
          text-decoration: underline;
        }

        .day-btn.selected {
          background: var(--ink) !important;
          color: white !important;
          box-shadow: 0 4px 10px rgba(26, 61, 51, 0.2);
        }

        .day-btn:disabled {
          opacity: 0.2;
          cursor: not-allowed;
        }

        .popup-footer {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid rgba(0, 0, 0, 0.05);
          display: flex;
          justify-content: center;
        }

        .today-btn {
          background: transparent;
          border: none;
          color: var(--ink);
          font-weight: 700;
          font-size: 0.8rem;
          cursor: pointer;
          padding: 4px 12px;
          border-radius: 8px;
        }

        .today-btn:hover {
          background: var(--offwhite);
        }

        .fade-in {
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default CustomDatePicker;
