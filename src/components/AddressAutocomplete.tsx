import React, { useEffect, useState, useRef } from 'react';
import usePlacesAutocomplete from 'use-places-autocomplete';
import { MapPin, Search } from 'lucide-react';

type AddressAutocompleteProps = {
  onSelectAddress: (address: string) => void;
  disabled?: boolean;
  defaultValue?: string;
};

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  onSelectAddress,
  disabled,
  defaultValue = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      componentRestrictions: { country: 'au' },
    },
    debounce: 300,
    defaultValue,
  });

  const handleSelect = (description: string) => () => {
    setValue(description, false);
    clearSuggestions();
    setIsOpen(false);
    onSelectAddress(description);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setIsOpen(true);
    if (!e.target.value) {
      onSelectAddress("");
    }
  };

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
    if (defaultValue) {
      setValue(defaultValue, false);
    }
  }, [defaultValue, setValue]);

  return (
    <div className="address-autocomplete" ref={containerRef}>
      <div className="input-wrapper">
        <Search size={18} />
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          disabled={!ready || disabled}
          placeholder="Search for your address..."
          className="address-input"
        />
      </div>

      {isOpen && status === "OK" && (
        <ul className="suggestions-list">
          {data.map((suggestion) => (
            <li
              key={suggestion.place_id}
              onClick={handleSelect(suggestion.description)}
              className="suggestion-item"
            >
              <MapPin size={14} />
              <span>{suggestion.description}</span>
            </li>
          ))}
        </ul>
      )}

      <style>{`
        .address-autocomplete {
          position: relative;
          width: 100%;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-wrapper svg {
          position: absolute;
          left: 12px;
          color: var(--ink-soft);
          pointer-events: none;
        }

        .address-input {
          width: 100%;
          padding: 12px 12px 12px 40px;
          border: 1.5px solid var(--cream-warm);
          border-radius: 12px;
          background: white;
          font-family: var(--font-ui);
          font-size: 0.95rem;
          color: var(--ink);
          transition: all 0.2s ease;
        }

        .address-input:focus {
          outline: none;
          border-color: var(--yellow);
          box-shadow: 0 0 0 4px rgba(234, 240, 68, 0.1);
        }

        .suggestions-list {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          border: 1px solid var(--cream-warm);
          max-height: 250px;
          overflow-y: auto;
          z-index: 1000;
          padding: 8px;
          margin: 0;
          list-style: none;
        }

        .suggestion-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          cursor: pointer;
          border-radius: 8px;
          font-family: var(--font-ui);
          font-size: 0.9rem;
          color: var(--ink);
          transition: background 0.2s;
        }

        .suggestion-item:hover {
          background: var(--offwhite);
        }

        .suggestion-item svg {
          color: var(--ink-soft);
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
};

export default AddressAutocomplete;
