import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

export interface Option {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface CustomSelectProps {
  value: string | string[];
  onChange: (value: any) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  isMulti?: boolean;
  searchable?: boolean;
  allLabel?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ 
  value, 
  onChange, 
  options, 
  placeholder = 'Select option', 
  className,
  isMulti = false,
  searchable = false,
  allLabel
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && (searchable || isMulti)) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen, searchable, isMulti]);

  const nonAllOptions = useMemo(() => options.filter(opt => opt.value !== 'all'), [options]);

  const selectedValues = useMemo<string[]>(() => {
    if (!isMulti) return [];
    if (Array.isArray(value)) return value;
    if (value === 'all' || !value) return ['all'];
    return [value];
  }, [value, isMulti]);

  const isAllSelected = useMemo(() => {
    if (!isMulti) return value === 'all';
    return selectedValues.includes('all') || selectedValues.length === 0 || selectedValues.length === nonAllOptions.length;
  }, [isMulti, value, selectedValues, nonAllOptions]);

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase();
    return options.filter(opt => opt.label.toLowerCase().includes(query) || opt.value.toLowerCase().includes(query));
  }, [options, searchQuery]);

  const triggerLabel = useMemo(() => {
    if (!isMulti) {
      const selectedOption = options.find(opt => opt.value === value);
      return selectedOption ? selectedOption.label : placeholder;
    }

    if (isAllSelected) {
      const allOpt = options.find(opt => opt.value === 'all');
      return allOpt ? allOpt.label : (allLabel || `All (${nonAllOptions.length})`);
    }

    if (selectedValues.length === 1) {
      const opt = options.find(o => o.value === selectedValues[0]);
      return opt ? opt.label : placeholder;
    }

    return `${selectedValues.length} Selected`;
  }, [isMulti, isAllSelected, value, selectedValues, options, placeholder, allLabel, nonAllOptions]);

  const triggerIcon = useMemo(() => {
    if (!isMulti) {
      const selectedOption = options.find(opt => opt.value === value);
      return selectedOption?.icon;
    }
    return undefined;
  }, [isMulti, options, value]);

  const handleOptionClick = (optValue: string) => {
    if (!isMulti) {
      onChange(optValue);
      setIsOpen(false);
      return;
    }

    if (optValue === 'all') {
      onChange('all');
      return;
    }

    let nextValues: string[];
    const current = selectedValues.filter(v => v !== 'all');

    if (current.includes(optValue)) {
      nextValues = current.filter(v => v !== optValue);
    } else {
      nextValues = [...current, optValue];
    }

    if (nextValues.length === 0 || nextValues.length === nonAllOptions.length) {
      onChange('all');
    } else {
      onChange(nextValues);
    }
  };

  return (
    <div className={`custom-select-container ${className || ''}`} ref={containerRef}>
      <div 
        className={`select-trigger glass ${isOpen ? 'open' : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="trigger-content">
          {triggerIcon && <span className="option-icon">{triggerIcon}</span>}
          <span className="selected-label">
            {triggerLabel}
          </span>
        </div>
        <ChevronDown size={16} className={`chevron ${isOpen ? 'rotate' : ''}`} />
      </div>

      {isOpen && (
        <div className="select-dropdown glass fade-in">
          {(searchable || isMulti || options.length > 5) && (
            <div className="dropdown-search-container" onClick={(e) => e.stopPropagation()}>
              <Search size={14} className="search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="dropdown-search-input"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <X size={14} className="clear-search-icon" onClick={() => setSearchQuery('')} />
              )}
            </div>
          )}

          <div className="options-scroll-area">
            {filteredOptions.length === 0 ? (
              <div className="no-options">No matches found</div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = isMulti 
                  ? (option.value === 'all' ? isAllSelected : (!isAllSelected && selectedValues.includes(option.value)))
                  : option.value === value;

                return (
                  <div 
                    key={option.value} 
                    className={`select-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleOptionClick(option.value)}
                  >
                    <div className="option-info">
                      {isMulti && (
                        <div className={`checkbox-box ${isSelected ? 'checked' : ''}`}>
                          {isSelected && <Check size={12} className="checkbox-check" />}
                        </div>
                      )}
                      {option.icon && <span className="option-icon">{option.icon}</span>}
                      <span className="option-label">{option.label}</span>
                    </div>
                    {!isMulti && isSelected && <Check size={14} className="check-icon" />}
                  </div>
                );
              })
            )}
          </div>
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
          max-height: 320px;
          display: flex;
          flex-direction: column;
        }

        .dropdown-search-container {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          margin-bottom: 6px;
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 12px;
        }

        .search-icon {
          color: var(--ink-soft);
          opacity: 0.6;
          flex-shrink: 0;
        }

        .clear-search-icon {
          color: var(--ink-soft);
          opacity: 0.6;
          cursor: pointer;
          flex-shrink: 0;
        }

        .clear-search-icon:hover {
          opacity: 1;
        }

        .dropdown-search-input {
          border: none;
          outline: none;
          background: transparent;
          width: 100%;
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--ink);
        }

        .options-scroll-area {
          overflow-y: auto;
          max-height: 250px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .no-options {
          padding: 12px;
          text-align: center;
          font-size: 0.85rem;
          color: var(--ink-soft);
          opacity: 0.7;
        }

        .select-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.15s;
          color: var(--ink-soft);
          font-weight: 600;
          font-size: 0.88rem;
        }

        .select-option:hover {
          background: rgba(26, 61, 51, 0.05);
          color: var(--ink);
        }

        .select-option.selected {
          background: var(--paper);
          color: var(--ink);
        }

        .option-info {
          display: flex;
          align-items: center;
          gap: 10px;
          overflow: hidden;
        }

        .option-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .checkbox-box {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          border: 1.5px solid rgba(0, 0, 0, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s ease;
          background: white;
        }

        .checkbox-box.checked {
          background: var(--ink);
          border-color: var(--ink);
        }

        .checkbox-check {
          color: white;
        }

        .check-icon {
          color: var(--gold);
        }

        .fade-in {
          animation: fadeIn 0.15s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Custom Scrollbar */
        .options-scroll-area::-webkit-scrollbar {
          width: 6px;
        }
        .options-scroll-area::-webkit-scrollbar-track {
          background: transparent;
        }
        .options-scroll-area::-webkit-scrollbar-thumb {
          background: rgba(26, 61, 51, 0.1);
          border-radius: 10px;
        }
        .options-scroll-area::-webkit-scrollbar-thumb:hover {
          background: rgba(26, 61, 51, 0.2);
        }
      `}</style>
    </div>
  );
};

export default CustomSelect;

