'use client';

import { GoogleMap, Marker, useJsApiLoader, InfoWindow, Polygon, Polyline } from '@react-google-maps/api';
import { useCallback, useState, useMemo, useRef, useEffect } from 'react';

const containerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 39.7684,
  lng: -86.1581 // Indianapolis, IN - Drive & Shine territory
};

const libraries = ['places'];

// Pin types with colors and labels
export const PIN_TYPES = {
  open: { color: '#22C55E', label: 'Open', icon: '✓' },
  coming_soon: { color: '#F59E0B', label: 'Coming Soon', icon: '◷' },
  closed: { color: '#6B7280', label: 'Closed', icon: '✕' },
  prospect: { color: '#3B82F6', label: 'Prospect', icon: '?' },
};

// Dynamic marker icon based on zoom level and pin type
const getMarkerIcon = (zoom, pinType = 'open', isPreview = false) => {
  let scale;
  if (isPreview) {
    scale = 0.6;
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

  const baseWidth = 28;
  const baseHeight = 42;
  const width = Math.round(baseWidth * scale);
  const height = Math.round(baseHeight * scale);
  
  // Get color based on pin type
  const color = PIN_TYPES[pinType]?.color || PIN_TYPES.open.color;

  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 28 42">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.3"/>
          </filter>
        </defs>
        <path filter="url(#shadow)" fill="${color}" d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 28 14 28s14-17.5 14-28C28 6.268 21.732 0 14 0z"/>
        <circle fill="#fff" cx="14" cy="12" r="5"/>
      </svg>
    `),
    scaledSize: typeof window !== 'undefined' ? new window.google.maps.Size(width, height) : null,
    anchor: typeof window !== 'undefined' ? new window.google.maps.Point(width / 2, height) : null,
  };
};

// Shape colors
const SHAPE_COLORS = {
  red: '#DC2626',
  blue: '#3B82F6',
  green: '#22C55E',
  purple: '#8B5CF6',
  orange: '#F97316',
};

// Shape recognition utilities
const getBoundingBox = (path) => {
  const lats = path.map(p => p.lat);
  const lngs = path.map(p => p.lng);
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
};

const getCenter = (path) => {
  const avgLat = path.reduce((sum, p) => sum + p.lat, 0) / path.length;
  const avgLng = path.reduce((sum, p) => sum + p.lng, 0) / path.length;
  return { lat: avgLat, lng: avgLng };
};

const distance = (p1, p2) => {
  return Math.sqrt(Math.pow(p1.lat - p2.lat, 2) + Math.pow(p1.lng - p2.lng, 2));
};

// Check if path resembles a circle
const isCircleLike = (path) => {
  if (path.length < 10) return null;
  
  const center = getCenter(path);
  const distances = path.map(p => distance(p, center));
  const avgRadius = distances.reduce((a, b) => a + b, 0) / distances.length;
  
  // Check if all points are roughly the same distance from center
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgRadius, 2), 0) / distances.length;
  const stdDev = Math.sqrt(variance);
  const coefficient = stdDev / avgRadius;
  
  // If coefficient of variation is low, it's circle-like
  if (coefficient < 0.25) {
    return { center, radius: avgRadius };
  }
  return null;
};

// Check if path resembles a rectangle
const isRectangleLike = (path) => {
  if (path.length < 4) return null;
  
  const box = getBoundingBox(path);
  const width = box.east - box.west;
  const height = box.north - box.south;
  
  // Create ideal rectangle path
  const idealRect = [
    { lat: box.north, lng: box.west },
    { lat: box.north, lng: box.east },
    { lat: box.south, lng: box.east },
    { lat: box.south, lng: box.west },
  ];
  
  // Calculate how well the drawn path covers the bounding box
  // Check if points are mostly along the edges
  let edgePoints = 0;
  const tolerance = Math.max(width, height) * 0.15;
  
  path.forEach(p => {
    const nearTop = Math.abs(p.lat - box.north) < tolerance;
    const nearBottom = Math.abs(p.lat - box.south) < tolerance;
    const nearLeft = Math.abs(p.lng - box.west) < tolerance;
    const nearRight = Math.abs(p.lng - box.east) < tolerance;
    
    if (nearTop || nearBottom || nearLeft || nearRight) {
      edgePoints++;
    }
  });
  
  const edgeRatio = edgePoints / path.length;
  
  // If most points are near edges, it's rectangle-like
  if (edgeRatio > 0.7) {
    return idealRect;
  }
  return null;
};

// Check if path resembles a triangle
const isTriangleLike = (path) => {
  if (path.length < 3) return null;
  
  const box = getBoundingBox(path);
  const center = getCenter(path);
  
  // Find the 3 most extreme points (corners)
  const corners = [];
  
  // Top point
  const topPoint = path.reduce((best, p) => p.lat > best.lat ? p : best, path[0]);
  corners.push(topPoint);
  
  // Bottom-left point
  const bottomLeft = path.reduce((best, p) => {
    const score = -p.lat - p.lng;
    const bestScore = -best.lat - best.lng;
    return score > bestScore ? p : best;
  }, path[0]);
  corners.push(bottomLeft);
  
  // Bottom-right point
  const bottomRight = path.reduce((best, p) => {
    const score = -p.lat + p.lng;
    const bestScore = -best.lat + best.lng;
    return score > bestScore ? p : best;
  }, path[0]);
  corners.push(bottomRight);
  
  // Check if the triangle is reasonably shaped
  const d1 = distance(corners[0], corners[1]);
  const d2 = distance(corners[1], corners[2]);
  const d3 = distance(corners[2], corners[0]);
  
  const minDist = Math.min(d1, d2, d3);
  const maxDist = Math.max(d1, d2, d3);
  
  // Check if it's a reasonable triangle (not too flat)
  if (minDist / maxDist > 0.2) {
    // Check if points are roughly along the triangle edges
    let edgePoints = 0;
    const tolerance = maxDist * 0.2;
    
    path.forEach(p => {
      // Check distance to each edge
      for (let i = 0; i < 3; i++) {
        const c1 = corners[i];
        const c2 = corners[(i + 1) % 3];
        
        // Point-to-line distance approximation
        const lineLen = distance(c1, c2);
        const d1 = distance(p, c1);
        const d2 = distance(p, c2);
        
        if (d1 + d2 < lineLen * 1.3) {
          edgePoints++;
          break;
        }
      }
    });
    
    const edgeRatio = edgePoints / path.length;
    
    if (edgeRatio > 0.6) {
      return corners;
    }
  }
  return null;
};

// Recognize and convert shape
const recognizeShape = (path) => {
  // Try circle first
  const circle = isCircleLike(path);
  if (circle) {
    // Generate circle path (32 points)
    const circlePoints = [];
    for (let i = 0; i < 32; i++) {
      const angle = (i / 32) * 2 * Math.PI;
      circlePoints.push({
        lat: circle.center.lat + circle.radius * Math.cos(angle),
        lng: circle.center.lng + circle.radius * Math.sin(angle),
      });
    }
    return { type: 'circle', path: circlePoints };
  }
  
  // Try rectangle
  const rect = isRectangleLike(path);
  if (rect) {
    return { type: 'rectangle', path: rect };
  }
  
  // Try triangle
  const triangle = isTriangleLike(path);
  if (triangle) {
    return { type: 'triangle', path: triangle };
  }
  
  // Keep as freehand
  return { type: 'freehand', path };
};

export default function MapComponent({ markers = [], shapes = [], onShapesChange }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

  const [map, setMap] = useState(null);
  const [currentZoom, setCurrentZoom] = useState(10);
  const [tooltipMarker, setTooltipMarker] = useState(null);
  
  // Drawing state
  const [isPencilMode, setIsPencilMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);
  const [selectedShape, setSelectedShape] = useState(null);
  const [selectedColor, setSelectedColor] = useState('red');
  
  // Shape refs for editing
  const shapeRefs = useRef({});

  const onLoad = useCallback((map) => {
    setMap(map);
    setCurrentZoom(map.getZoom());
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  const onZoomChanged = useCallback(() => {
    if (map) {
      setCurrentZoom(map.getZoom());
    }
  }, [map]);

  // Handle marker hover
  const handleMarkerMouseOver = useCallback((marker) => {
    if (!isPencilMode) {
      setTooltipMarker(marker);
    }
  }, [isPencilMode]);

  const handleMarkerMouseOut = useCallback(() => {
    setTooltipMarker(null);
  }, []);

  const handleMarkerClick = useCallback((marker) => {
    setTooltipMarker(marker);
  }, []);

  // Pencil drawing handlers
  const handleMapMouseDown = useCallback((e) => {
    if (!isPencilMode || !map) return;
    
    setIsDrawing(true);
    setSelectedShape(null);
    const latLng = e.latLng;
    setCurrentPath([{ lat: latLng.lat(), lng: latLng.lng() }]);
    
    // Disable map dragging while drawing
    map.setOptions({ draggable: false });
  }, [isPencilMode, map]);

  const handleMapMouseMove = useCallback((e) => {
    if (!isDrawing || !isPencilMode) return;
    
    const latLng = e.latLng;
    setCurrentPath(prev => [...prev, { lat: latLng.lat(), lng: latLng.lng() }]);
  }, [isDrawing, isPencilMode]);

  const handleMapMouseUp = useCallback(() => {
    if (!isDrawing || !map) return;
    
    // Re-enable map dragging
    map.setOptions({ draggable: true });
    
    // Only save if we have enough points
    if (currentPath.length > 2) {
      // Try to recognize the shape
      const recognized = recognizeShape(currentPath);
      
      const newShape = {
        id: Date.now().toString(),
        type: 'polygon',
        shapeType: recognized.type, // 'circle', 'rectangle', 'triangle', or 'freehand'
        path: recognized.path,
        color: selectedColor,
        createdAt: Date.now(),
      };
      
      if (onShapesChange) {
        onShapesChange([...shapes, newShape]);
        // Auto-select the new shape so user can immediately edit it
        setSelectedShape(shapes.length); // Will be the index of the new shape
      }
    }
    
    // Exit pencil mode and reset
    setIsDrawing(false);
    setCurrentPath([]);
    setIsPencilMode(false);
  }, [isDrawing, map, currentPath, selectedColor, shapes, onShapesChange]);

  // Toggle pencil mode
  const togglePencilMode = () => {
    if (isPencilMode) {
      // Exit pencil mode
      setIsPencilMode(false);
      setIsDrawing(false);
      setCurrentPath([]);
      if (map) {
        map.setOptions({ draggable: true });
      }
    } else {
      // Enter pencil mode
      setIsPencilMode(true);
      setSelectedShape(null);
    }
  };

  // Shape click handler
  const handleShapeClick = (index) => {
    if (isPencilMode) return;
    setSelectedShape(selectedShape === index ? null : index);
  };

  // Delete selected shape
  const deleteSelectedShape = () => {
    if (selectedShape !== null && onShapesChange) {
      const newShapes = shapes.filter((_, i) => i !== selectedShape);
      onShapesChange(newShapes);
      setSelectedShape(null);
    }
  };

  // Delete all shapes
  const deleteAllShapes = () => {
    if (onShapesChange) {
      onShapesChange([]);
      setSelectedShape(null);
    }
  };

  // Shape drag end handler (for moving the shape)
  const handleShapeDragEnd = useCallback((shapeId) => {
    const polygon = shapeRefs.current[shapeId];
    if (!polygon || !onShapesChange) return;

    const path = polygon.getPath().getArray().map(latLng => ({
      lat: latLng.lat(),
      lng: latLng.lng(),
    }));

    const updatedShapes = shapes.map(s => 
      s.id === shapeId ? { ...s, path } : s
    );
    onShapesChange(updatedShapes);
  }, [shapes, onShapesChange]);

  // Resize shape with +/- buttons (scale uniformly from center)
  const resizeShape = useCallback((scaleFactor) => {
    if (selectedShape === null || !onShapesChange) return;
    
    const shape = shapes[selectedShape];
    if (!shape) return;
    
    const center = getCenter(shape.path);
    
    // Scale all points from center
    const newPath = shape.path.map(p => ({
      lat: center.lat + (p.lat - center.lat) * scaleFactor,
      lng: center.lng + (p.lng - center.lng) * scaleFactor,
    }));
    
    const updatedShapes = shapes.map((s, i) => 
      i === selectedShape ? { ...s, path: newPath } : s
    );
    
    onShapesChange(updatedShapes);
  }, [selectedShape, shapes, onShapesChange]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isPencilMode) {
          setIsPencilMode(false);
          setIsDrawing(false);
          setCurrentPath([]);
          if (map) {
            map.setOptions({ draggable: true });
          }
        }
        if (selectedShape !== null) {
          setSelectedShape(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPencilMode, selectedShape, map]);

  // Mouse up listener for when mouse leaves map
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDrawing) {
        handleMapMouseUp();
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDrawing, handleMapMouseUp]);

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
        onMouseDown={handleMapMouseDown}
        onMouseMove={handleMapMouseMove}
        onMouseUp={handleMapMouseUp}
        onClick={() => {
          if (!isPencilMode && !isDrawing) {
            setSelectedShape(null);
          }
        }}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          zoomControl: true,
          draggableCursor: isPencilMode ? 'crosshair' : null,
          draggingCursor: isPencilMode ? 'crosshair' : null,
        }}
      >
        {/* Current drawing path */}
        {isDrawing && currentPath.length > 0 && (
          <Polyline
            path={currentPath}
            options={{
              strokeColor: SHAPE_COLORS[selectedColor],
              strokeWeight: 3,
              strokeOpacity: 1,
            }}
          />
        )}

        {/* Saved shapes */}
        {shapes.map((shape, index) => {
          const isSelected = selectedShape === index;
          const color = SHAPE_COLORS[shape.color] || SHAPE_COLORS.red;
          
          return (
            <Polygon
              key={shape.id}
              path={shape.path}
              onLoad={(polygon) => { shapeRefs.current[shape.id] = polygon; }}
              onUnmount={() => { delete shapeRefs.current[shape.id]; }}
              onDragEnd={() => isSelected && handleShapeDragEnd(shape.id)}
              options={{
                fillColor: color,
                fillOpacity: isSelected ? 0.4 : 0.2,
                strokeColor: color,
                strokeWeight: isSelected ? 3 : 2,
                strokeOpacity: 1,
                editable: false, // No dots - using +/- buttons instead
                draggable: isSelected,
                clickable: true,
                zIndex: isSelected ? 2 : 1,
              }}
              onClick={() => handleShapeClick(index)}
            />
          );
        })}

        {/* Markers */}
        {markers.map((marker, index) => (
          <Marker
            key={marker.id || index}
            position={{ lat: marker.lat, lng: marker.lng }}
            title={`${marker.address} (${PIN_TYPES[marker.pinType]?.label || 'Open'})`}
            icon={getMarkerIcon(currentZoom, marker.pinType || 'open', false)}
            onMouseOver={() => handleMarkerMouseOver(marker)}
            onMouseOut={handleMarkerMouseOut}
            onClick={() => handleMarkerClick(marker)}
          />
        ))}

        {/* Tooltip */}
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
              <span 
                className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full text-white"
                style={{ backgroundColor: PIN_TYPES[tooltipMarker.pinType]?.color || PIN_TYPES.open.color }}
              >
                {PIN_TYPES[tooltipMarker.pinType]?.label || 'Open'}
              </span>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Drawing Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <div className="bg-white rounded-lg shadow-lg p-2 flex items-center gap-2">
          {/* Pencil tool */}
          <button
            onClick={togglePencilMode}
            className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${
              isPencilMode 
                ? 'bg-blue-100 text-blue-700' 
                : 'hover:bg-gray-100 text-gray-700'
            }`}
            title={isPencilMode ? 'Exit drawing mode' : 'Draw shape'}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            {isPencilMode && <span className="text-sm font-medium">Drawing...</span>}
          </button>

          {/* Color selector - only show when in pencil mode */}
          {isPencilMode && (
            <>
              <div className="w-px h-6 bg-gray-300" />
              {Object.entries(SHAPE_COLORS).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => setSelectedColor(key)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    selectedColor === key 
                      ? 'scale-110 border-gray-400 ring-2 ring-offset-1 ring-gray-300' 
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: value }}
                  title={key}
                />
              ))}
            </>
          )}
          
          {/* Delete all button */}
          {shapes.length > 0 && !isPencilMode && (
            <>
              <div className="w-px h-6 bg-gray-300 mx-1" />
              <button
                onClick={deleteAllShapes}
                className="p-2 hover:bg-red-50 rounded-lg transition-colors text-gray-500 hover:text-red-600"
                title="Delete All Shapes"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Instructions when in pencil mode */}
        {isPencilMode && !isDrawing && (
          <div className="mt-2 bg-white rounded-lg shadow-lg px-3 py-2 text-center">
            <p className="text-xs text-gray-600">Click and drag to draw a shape</p>
            <p className="text-xs text-gray-400">Press <kbd className="px-1 py-0.5 bg-gray-100 rounded font-mono">Esc</kbd> to cancel</p>
          </div>
        )}
      </div>

      {/* Selected shape actions */}
      {selectedShape !== null && !isPencilMode && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 bg-white rounded-lg shadow-lg p-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700">Shape selected</span>
            
            {/* Size controls */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  resizeShape(0.9);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white transition-colors text-gray-700 font-bold text-lg"
                title="Make smaller"
              >
                −
              </button>
              <span className="text-xs text-gray-500 px-1">Size</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  resizeShape(1.1);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white transition-colors text-gray-700 font-bold text-lg"
                title="Make larger"
              >
                +
              </button>
            </div>
            
            <button
              onClick={deleteSelectedShape}
              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
            <button
              onClick={() => setSelectedShape(null)}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
            >
              Done
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">Drag to move • Use +/− to resize</p>
        </div>
      )}

      {/* Zoom indicator */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md text-sm text-gray-700">
        Zoom: {currentZoom}
      </div>

      {/* Shapes count */}
      {shapes.length > 0 && (
        <div className="absolute bottom-4 left-28 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md text-sm text-gray-700">
          {shapes.length} shape{shapes.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
