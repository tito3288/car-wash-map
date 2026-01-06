'use client';

import { useState, useRef, useEffect } from 'react';
import { Autocomplete, useJsApiLoader } from '@react-google-maps/api';

const libraries = ['places'];

// Pin types - keep in sync with MapComponent
const PIN_TYPES = {
  open: { color: '#22C55E', label: 'Open', icon: '✓' },
  coming_soon: { color: '#F59E0B', label: 'Coming Soon', icon: '◷' },
  closed: { color: '#6B7280', label: 'Closed', icon: '✕' },
  prospect: { color: '#3B82F6', label: 'Prospect', icon: '?' },
};

export default function AddressInput({ onAddressSubmit, loading }) {
  const [address, setAddress] = useState('');
  const [pinType, setPinType] = useState('open');
  const autocompleteRef = useRef(null);
  const inputRef = useRef(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (address.trim()) {
      onAddressSubmit(address.trim(), pinType);
      setAddress('');
    }
  };

  const onLoad = (autocomplete) => {
    autocompleteRef.current = autocomplete;
  };

  const onPlaceChanged = () => {
    if (autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace();
      if (place.formatted_address) {
        setAddress(place.formatted_address);
      } else if (place.name) {
        setAddress(place.name);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="mb-4">
        <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
          Enter Address
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          {isLoaded ? (
            <Autocomplete
              onLoad={onLoad}
              onPlaceChanged={onPlaceChanged}
              options={{
                types: ['address'],
                componentRestrictions: { country: 'us' },
              }}
            >
              <input
                ref={inputRef}
                id="address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Start typing an address..."
                className="w-full pl-10 pr-4 py-3.5 md:py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-gray-900 text-base"
                autoComplete="off"
              />
            </Autocomplete>
          ) : (
            <input
              id="address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Loading address search..."
              disabled
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
            />
          )}
        </div>
      </div>

      {/* Pin Type Selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Location Type
        </label>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(PIN_TYPES).map(([key, { color, label }]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPinType(key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-sm font-medium ${
                pinType === key
                  ? 'border-gray-800 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-gray-700">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !address.trim()}
        className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold py-3 px-4 rounded-full transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
            Finding location...
          </span>
        ) : (
          'Drop Pin'
        )}
      </button>
    </form>
  );
}
