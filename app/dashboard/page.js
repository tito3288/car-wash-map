'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import AddressInput from '@/components/AddressInput';
import PinnedAddressList from '@/components/PinnedAddressList';

// Dynamically import map component to avoid SSR issues
const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-100">
      <div className="flex items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
        <span className="text-gray-600">Loading map...</span>
      </div>
    </div>
  ),
});

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [markers, setMarkers] = useState([]);
  const [markersLoading, setMarkersLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const router = useRouter();
  
  // Touch handling for swipe
  const sidebarRef = useRef(null);
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);
  const isDragging = useRef(false);

  // Auth check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        router.push('/');
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // Load markers from Firestore when user is authenticated
  useEffect(() => {
    if (!user) return;

    const markersRef = collection(db, 'users', user.uid, 'markers');
    
    // Real-time listener for markers
    const unsubscribe = onSnapshot(markersRef, (snapshot) => {
      const loadedMarkers = [];
      snapshot.forEach((doc) => {
        loadedMarkers.push({ id: doc.id, ...doc.data() });
      });
      // Sort by createdAt timestamp
      loadedMarkers.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setMarkers(loadedMarkers);
      setMarkersLoading(false);
    }, (error) => {
      console.error('Error loading markers:', error);
      setMarkersLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const geocodeAddress = async (address) => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new Error('Google Maps API key not configured');
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
    );
    const data = await response.json();

    if (data.status === 'OK' && data.results[0]) {
      const location = data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng,
        address: data.results[0].formatted_address,
      };
    } else {
      throw new Error('Address not found. Please try a different address.');
    }
  };

  const handleAddressSubmit = async (address) => {
    if (!user) return;
    
    setGeocoding(true);
    setError('');

    try {
      const result = await geocodeAddress(address);
      
      // Save to Firestore
      const markersRef = collection(db, 'users', user.uid, 'markers');
      const newMarkerRef = doc(markersRef);
      await setDoc(newMarkerRef, {
        ...result,
        createdAt: Date.now(),
      });
      
      // Close sidebar on mobile after adding location
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGeocoding(false);
    }
  };

  const handleRemoveMarker = async (index) => {
    if (!user) return;
    
    const markerToRemove = markers[index];
    if (markerToRemove?.id) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'markers', markerToRemove.id));
      } catch (err) {
        console.error('Error removing marker:', err);
        setError('Failed to remove pin. Please try again.');
      }
    }
  };

  const handleDeleteAllPins = () => {
    setShowDeleteModal(true);
  };

  const confirmDeleteAll = async () => {
    if (!user) return;
    
    try {
      // Batch delete all markers
      const batch = writeBatch(db);
      markers.forEach((marker) => {
        if (marker.id) {
          const markerRef = doc(db, 'users', user.uid, 'markers', marker.id);
          batch.delete(markerRef);
        }
      });
      await batch.commit();
      setShowDeleteModal(false);
    } catch (err) {
      console.error('Error deleting all markers:', err);
      setError('Failed to delete all pins. Please try again.');
      setShowDeleteModal(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Touch handlers for swipe gesture
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
    isDragging.current = true;
  };

  const handleTouchMove = (e) => {
    if (!isDragging.current) return;
    touchCurrentX.current = e.touches[0].clientX;
    
    const diff = touchCurrentX.current - touchStartX.current;
    const sidebar = sidebarRef.current;
    
    if (sidebar) {
      if (sidebarOpen) {
        // Dragging to close (left)
        const translateX = Math.min(0, diff);
        sidebar.style.transform = `translateX(${translateX}px)`;
      } else {
        // Only allow opening swipe from left edge
        if (touchStartX.current < 30) {
          const translateX = Math.min(0, diff - sidebar.offsetWidth);
          sidebar.style.transform = `translateX(${Math.max(translateX, -sidebar.offsetWidth)}px)`;
        }
      }
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    
    const diff = touchCurrentX.current - touchStartX.current;
    const sidebar = sidebarRef.current;
    
    if (sidebar) {
      sidebar.style.transform = '';
      
      if (sidebarOpen) {
        // Close if swiped left more than 100px
        if (diff < -100) {
          setSidebarOpen(false);
        }
      } else {
        // Open if swiped right more than 100px from left edge
        if (diff > 100 && touchStartX.current < 30) {
          setSidebarOpen(true);
        }
      }
    }
  };

  // Add touch listeners for swipe from edge
  useEffect(() => {
    const handleGlobalTouchStart = (e) => {
      if (!sidebarOpen && e.touches[0].clientX < 30) {
        touchStartX.current = e.touches[0].clientX;
        isDragging.current = true;
      }
    };

    const handleGlobalTouchMove = (e) => {
      if (!sidebarOpen && isDragging.current && touchStartX.current < 30) {
        touchCurrentX.current = e.touches[0].clientX;
      }
    };

    const handleGlobalTouchEnd = () => {
      if (!sidebarOpen && isDragging.current && touchStartX.current < 30) {
        const diff = touchCurrentX.current - touchStartX.current;
        if (diff > 100) {
          setSidebarOpen(true);
        }
        isDragging.current = false;
      }
    };

    document.addEventListener('touchstart', handleGlobalTouchStart);
    document.addEventListener('touchmove', handleGlobalTouchMove);
    document.addEventListener('touchend', handleGlobalTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleGlobalTouchStart);
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [sidebarOpen]);

  // Loading state
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600"></div>
          <span className="text-gray-600">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div 
        ref={sidebarRef}
        className={`
          fixed md:relative inset-y-0 left-0 z-40
          w-80 md:w-96 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col
          transform transition-transform duration-300 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header with logo */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <Image
              src="/logo.png"
              alt="Drive & Shine"
              width={120}
              height={60}
              className="object-contain"
            />
            <div className="flex items-center gap-2">
              {/* Clear all button - only visible on mobile in sidebar */}
              {markers.length > 0 && (
                <button
                  onClick={handleDeleteAllPins}
                  className="md:hidden text-xs text-gray-500 hover:text-red-600 active:text-red-700 transition-colors flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-gray-100"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Delete All Pins</span>
                </button>
              )}
              {/* Close button for mobile */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="md:hidden p-2 -mr-2 text-gray-500 hover:text-gray-700"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="p-4 md:p-6 border-b border-gray-100">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Add Location</h1>
          <p className="text-sm text-gray-500 mt-1">
            Enter an address to drop a pin on the map
          </p>
        </div>

        {/* Address Input */}
        <div className="p-4 md:p-6 flex-1 overflow-y-auto">
          <AddressInput onAddressSubmit={handleAddressSubmit} loading={geocoding} />

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {markersLoading ? (
            <div className="mt-6 flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-gray-500">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600"></div>
                <span className="text-sm">Loading saved locations...</span>
              </div>
            </div>
          ) : (
            <PinnedAddressList markers={markers} onRemoveMarker={handleRemoveMarker} />
          )}
        </div>

        {/* User info and logout */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 truncate flex-1 mr-2">
              {user?.email}
            </p>
            <button
              onClick={() => setShowLogoutModal(true)}
              className="text-xs text-gray-500 hover:text-red-600 transition-colors flex items-center gap-1"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapComponent markers={markers} />
        
        {/* Mobile menu button */}
        <button
          onClick={() => setSidebarOpen(true)}
          className={`
            md:hidden fixed top-4 left-4 z-20
            bg-white p-3 rounded-lg shadow-lg
            transition-opacity duration-200
            ${sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}
          `}
        >
          <svg className="h-6 w-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Location count badge on mobile */}
        {markers.length > 0 && !sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden fixed top-4 left-16 z-20 bg-red-600 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            {markers.length}
          </button>
        )}
        
        {/* Desktop clear button */}
        <div className="hidden md:flex absolute top-4 right-4 flex-col gap-2">
          {markers.length > 0 && (
            <button
              onClick={handleDeleteAllPins}
              className="bg-white px-4 py-2 rounded-lg shadow-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete All Pins
            </button>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowDeleteModal(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
            {/* Warning Icon */}
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            {/* Content */}
            <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
              Delete All Pins?
            </h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              Are you sure you want to delete all {markers.length} pinned location{markers.length !== 1 ? 's' : ''}? This action cannot be undone.
            </p>
            
            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAll}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowLogoutModal(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
            {/* Icon */}
            <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg className="h-6 w-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            
            {/* Content */}
            <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
              Log Out?
            </h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              Are you sure you want to log out of your account?
            </p>
            
            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
