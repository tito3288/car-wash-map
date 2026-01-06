'use client';

export default function PinnedAddressList({ markers, onRemoveMarker }) {
  if (markers.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <svg className="h-4 w-4 text-red-600" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
        Pinned Locations ({markers.length})
      </h3>
      <div className="space-y-2 max-h-48 md:max-h-64 overflow-y-auto">
        {markers.map((marker, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 group hover:border-red-200 active:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="flex-shrink-0 w-6 h-6 bg-red-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {index + 1}
              </span>
              <p className="text-sm text-gray-700 truncate">{marker.address}</p>
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
        ))}
      </div>
    </div>
  );
}
