'use client';

import { useState } from 'react';

// Pin types - keep in sync with MapComponent
const PIN_TYPES = {
  open: { color: '#22C55E', label: 'Open' },
  coming_soon: { color: '#F59E0B', label: 'Coming Soon' },
  closed: { color: '#6B7280', label: 'Closed' },
  prospect: { color: '#3B82F6', label: 'Prospect' },
};

export default function PinnedAddressList({ markers, onRemoveMarker, onUpdateMarker }) {
  const [editingIndex, setEditingIndex] = useState(null);

  if (markers.length === 0) {
    return null;
  }

  const handleTypeChange = (index, newType) => {
    if (onUpdateMarker) {
      onUpdateMarker(index, { ...markers[index], pinType: newType });
    }
    setEditingIndex(null);
  };

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <svg className="h-4 w-4 text-red-600" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
        Pinned Locations ({markers.length})
      </h3>
      <div className="space-y-2 max-h-48 md:max-h-64 overflow-y-auto">
        {markers.map((marker, index) => {
          const pinType = PIN_TYPES[marker.pinType] || PIN_TYPES.open;
          const isEditing = editingIndex === index;
          
          return (
            <div
              key={marker.id || index}
              className="p-3 bg-gray-50 rounded-lg border border-gray-200 group hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span 
                    className="flex-shrink-0 w-6 h-6 text-white text-xs font-bold rounded-full flex items-center justify-center"
                    style={{ backgroundColor: pinType.color }}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 truncate">{marker.address}</p>
                  </div>
                </div>
                <button
                  onClick={() => onRemoveMarker(index)}
                  className="ml-2 p-2 -mr-1 text-gray-400 hover:text-red-600 active:text-red-700 transition-colors md:opacity-0 md:group-hover:opacity-100"
                  title="Remove pin"
                >
                  <svg className="h-5 w-5 md:h-4 md:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* Type selector */}
              <div className="mt-2 flex items-center gap-2">
                {isEditing ? (
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(PIN_TYPES).map(([key, { color, label }]) => (
                      <button
                        key={key}
                        onClick={() => handleTypeChange(index, key)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                          marker.pinType === key || (!marker.pinType && key === 'open')
                            ? 'ring-2 ring-gray-400'
                            : 'hover:bg-gray-100'
                        }`}
                        style={{ 
                          backgroundColor: marker.pinType === key || (!marker.pinType && key === 'open') ? `${color}20` : 'transparent',
                          color: color 
                        }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingIndex(index)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium hover:bg-gray-100 transition-colors"
                    style={{ color: pinType.color }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: pinType.color }} />
                    {pinType.label}
                    <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <p className="text-xs text-gray-500 mb-2">Legend:</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PIN_TYPES).map(([key, { color, label }]) => (
            <span key={key} className="flex items-center gap-1 text-xs text-gray-600">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
