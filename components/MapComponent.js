'use client';

import { GoogleMap, Marker, useJsApiLoader, InfoWindow } from '@react-google-maps/api';
import { useCallback, useState, useMemo } from 'react';

const containerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 39.7684,
  lng: -86.1581 // Indianapolis, IN - Drive & Shine territory
};

const libraries = ['places'];

// Dynamic marker icon based on zoom level - thinner pin design
const getMarkerIcon = (zoom, isPreview = false) => {
  // Base size that scales with zoom
  // Zoom 5-6: very small, Zoom 7-9: small, Zoom 10-12: medium, Zoom 13+: large
  let scale;
  if (isPreview) {
    scale = 0.6; // Fixed smaller size for preview
  } else if (zoom <= 6) {
    scale = 0.4;
  } else if (zoom <= 8) {
    scale = 0.5;
  } else if (zoom <= 10) {
    scale = 0.65;
  } else if (zoom <= 12) {
    scale = 0.8;
  } else if (zoom <= 14) {
    scale = 0.9;
  } else {
    scale = 1.0;
  }

  const baseWidth = 28; // Thinner pin
  const baseHeight = 42;
  const width = Math.round(baseWidth * scale);
  const height = Math.round(baseHeight * scale);

  // Thinner, more elegant pin SVG
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 28 42">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.3"/>
          </filter>
        </defs>
        <path filter="url(#shadow)" fill="#DC2626" d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 28 14 28s14-17.5 14-28C28 6.268 21.732 0 14 0z"/>
        <circle fill="#fff" cx="14" cy="12" r="5"/>
      </svg>
    `),
    scaledSize: typeof window !== 'undefined' ? new window.google.maps.Size(width, height) : null,
    anchor: typeof window !== 'undefined' ? new window.google.maps.Point(width / 2, height) : null,
  };
};

export default function MapComponent({ markers = [] }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

  const [map, setMap] = useState(null);
  const [previewMap, setPreviewMap] = useState(null);
  const [currentZoom, setCurrentZoom] = useState(10);
  const [previewZoom, setPreviewZoom] = useState(10);
  const [previewState, setPreviewState] = useState({
    visible: false,
    position: { x: 0, y: 0 },
    hoveredMarker: null,
  });
  const [tooltipMarker, setTooltipMarker] = useState(null);
  const [previewTooltip, setPreviewTooltip] = useState(null);

  // Calculate bounds that fit all markers
  const markersBounds = useMemo(() => {
    if (markers.length === 0 || typeof window === 'undefined' || !window.google) return null;
    
    const bounds = new window.google.maps.LatLngBounds();
    markers.forEach(marker => {
      bounds.extend({ lat: marker.lat, lng: marker.lng });
    });
    return bounds;
  }, [markers]);

  // Calculate center of all markers
  const markersCenter = useMemo(() => {
    if (markers.length === 0) return defaultCenter;
    const avgLat = markers.reduce((sum, loc) => sum + loc.lat, 0) / markers.length;
    const avgLng = markers.reduce((sum, loc) => sum + loc.lng, 0) / markers.length;
    return { lat: avgLat, lng: avgLng };
  }, [markers]);

  const onLoad = useCallback((map) => {
    setMap(map);
    setCurrentZoom(map.getZoom());
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Preview map handlers
  const onPreviewLoad = useCallback((previewMap) => {
    setPreviewMap(previewMap);
    // Fit bounds to show all markers
    if (markersBounds && markers.length > 1) {
      previewMap.fitBounds(markersBounds, { top: 20, right: 20, bottom: 20, left: 20 });
    }
  }, [markersBounds, markers.length]);

  const onPreviewZoomChanged = useCallback(() => {
    if (previewMap) {
      setPreviewZoom(previewMap.getZoom());
    }
  }, [previewMap]);

  // Track zoom changes
  const onZoomChanged = useCallback(() => {
    if (map) {
      const newZoom = map.getZoom();
      setCurrentZoom(newZoom);
      // Hide preview when zooming main map
      if (previewState.visible) {
        setPreviewState(prev => ({ ...prev, visible: false }));
      }
    }
  }, [map, previewState.visible]);

  // Hide preview on map drag/pan
  const onDragStart = useCallback(() => {
    if (previewState.visible) {
      setPreviewState(prev => ({ ...prev, visible: false }));
    }
  }, [previewState.visible]);

  // Handle marker hover on main map
  const handleMarkerMouseOver = useCallback((marker, event) => {
    if (currentZoom <= 8 && markers.length > 0) {
      // Get mouse position from the DOM event
      const mouseX = event.domEvent?.clientX || event.pixel?.x || 0;
      const mouseY = event.domEvent?.clientY || event.pixel?.y || 0;
      
      // Calculate position, keeping preview on screen
      let left = mouseX + 20;
      let top = mouseY - 150;
      
      if (left + 370 > window.innerWidth) {
        left = mouseX - 370;
      }
      if (top < 10) {
        top = 10;
      }
      if (top + 320 > window.innerHeight) {
        top = window.innerHeight - 320;
      }

      setPreviewState({
        visible: true,
        position: { x: left, y: top },
        hoveredMarker: marker,
      });
    } else {
      // Show simple tooltip when zoomed in
      setTooltipMarker(marker);
    }
  }, [currentZoom, markers.length]);

  const handleMarkerMouseOut = useCallback(() => {
    // Don't hide if mouse is moving to preview
    setTooltipMarker(null);
  }, []);

  // Handle clicking marker on main map
  const handleMarkerClick = useCallback((marker) => {
    setTooltipMarker(marker);
  }, []);

  // Handle clicking marker in preview
  const handlePreviewMarkerClick = useCallback((marker) => {
    setPreviewTooltip(marker);
  }, []);

  // Close preview when clicking outside
  const closePreview = useCallback(() => {
    setPreviewState(prev => ({ ...prev, visible: false }));
    setPreviewTooltip(null);
  }, []);

  // Center map on latest marker
  const center = markers.length > 0 
    ? { lat: markers[markers.length - 1].lat, lng: markers[markers.length - 1].lng }
    : defaultCenter;

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-center p-8">
          <p className="text-red-600 font-medium">Error loading Google Maps</p>
          <p className="text-gray-500 text-sm mt-2">Please check your API key configuration</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
          <span className="text-gray-600">Loading map...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={markers.length > 0 ? 15 : 10}
        onLoad={onLoad}
        onUnmount={onUnmount}
        onZoomChanged={onZoomChanged}
        onDragStart={onDragStart}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          zoomControl: true,
        }}
      >
        {markers.map((marker, index) => (
          <Marker
            key={index}
            position={{ lat: marker.lat, lng: marker.lng }}
            title={marker.address}
            icon={getMarkerIcon(currentZoom, false)}
            onMouseOver={(e) => handleMarkerMouseOver(marker, e)}
            onMouseOut={handleMarkerMouseOut}
            onClick={() => handleMarkerClick(marker)}
          />
        ))}

        {/* Tooltip when zoomed in */}
        {tooltipMarker && currentZoom > 8 && (
          <InfoWindow
            position={{ lat: tooltipMarker.lat, lng: tooltipMarker.lng }}
            options={{
              pixelOffset: new window.google.maps.Size(0, -35),
              disableAutoPan: true,
            }}
            onCloseClick={() => setTooltipMarker(null)}
          >
            <div className="p-2 max-w-xs">
              <p className="text-sm font-medium text-gray-900">{tooltipMarker.address}</p>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Zoom Preview Popup - Interactive */}
      {previewState.visible && markers.length > 0 && (
        <div
          className="fixed z-50 rounded-lg overflow-hidden shadow-2xl border border-gray-200"
          style={{
            left: previewState.position.x,
            top: previewState.position.y,
            width: '350px',
          }}
        >
          {/* Header */}
          <div 
            className="px-4 py-2 flex items-center justify-between"
            style={{ backgroundColor: '#1a1a6e' }}
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
              <span className="text-white text-sm font-medium">Locations Preview</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-white/70 text-xs">Zoom: {previewZoom}</span>
              <button 
                onClick={closePreview}
                className="text-white/70 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Interactive Mini Map */}
          <div style={{ height: '260px' }}>
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={markersCenter}
              zoom={10}
              onLoad={onPreviewLoad}
              onZoomChanged={onPreviewZoomChanged}
              options={{
                streetViewControl: false,
                mapTypeControl: false,
                fullscreenControl: false,
                zoomControl: true,
                draggable: true,
                scrollwheel: true,
                disableDoubleClickZoom: false,
                gestureHandling: 'greedy',
              }}
            >
              {markers.map((marker, index) => (
                <Marker
                  key={`preview-${index}`}
                  position={{ lat: marker.lat, lng: marker.lng }}
                  title={marker.address}
                  icon={getMarkerIcon(previewZoom, true)}
                  onClick={() => handlePreviewMarkerClick(marker)}
                />
              ))}

              {/* Info window for clicked marker in preview */}
              {previewTooltip && (
                <InfoWindow
                  position={{ lat: previewTooltip.lat, lng: previewTooltip.lng }}
                  options={{
                    pixelOffset: new window.google.maps.Size(0, -25),
                  }}
                  onCloseClick={() => setPreviewTooltip(null)}
                >
                  <div className="p-2 max-w-[200px]">
                    <p className="text-sm font-medium text-gray-900 leading-tight">{previewTooltip.address}</p>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          </div>

          {/* Footer */}
          <div className="bg-gray-100 px-3 py-2 text-xs text-gray-600 flex items-center justify-between">
            <span className="font-medium">{markers.length} location{markers.length !== 1 ? 's' : ''}</span>
            <span className="text-gray-400">Click pins for details • Scroll to zoom</span>
          </div>
        </div>
      )}

      {/* Zoom indicator */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md text-sm text-gray-700">
        Zoom: {currentZoom}
      </div>
    </div>
  );
}
