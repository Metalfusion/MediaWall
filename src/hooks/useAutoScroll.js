import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Custom hook for managing auto scroll functionality
 * @param {Object} options - Configuration options
 * @param {boolean} options.enabled - Whether auto scroll is enabled
 * @param {number} options.scrollSpeed - Speed of auto scrolling
 * @param {number} options.idleDelay - Delay before starting auto scroll after mouse idle (ms)
 * @param {Function} options.getScrollableElement - Function that returns the scrollable element
 * @returns {Object} Auto scroll state and controls
 */
export const useAutoScroll = ({ enabled = false, scrollSpeed = 2, idleDelay = 5000, getScrollableElement }) => {
  // Auto-scroll state
  const [autoScrollActive, setAutoScrollActive] = useState(false);
  const autoScrollIntervalRef = useRef(null);
  const mouseIdleTimeoutRef = useRef(null);
  const lastMouseMove = useRef(Date.now());
  const isAutoScrolling = useRef(false); // Flag to track if we're currently auto-scrolling

  const stopAutoScroll = useCallback(() => {
    if (!isAutoScrolling.current) return; // Use ref instead of stale state
    
    setAutoScrollActive(false);
    isAutoScrolling.current = false; // Clear the flag
    clearInterval(autoScrollIntervalRef.current);
    clearTimeout(mouseIdleTimeoutRef.current);
    autoScrollIntervalRef.current = null;
    console.log('⏹️ Auto-scroll stopped');
  }, []); // Remove autoScrollActive dependency

  const startAutoScroll = useCallback(() => {
    if (isAutoScrolling.current || !enabled) return; // Use ref instead of stale state
    
    const scrollableElement = getScrollableElement && getScrollableElement();
    if (!scrollableElement) {
      console.warn('⚠️ Cannot start auto-scroll: No scrollable element found');
      return;
    }
    
    console.log('🔄 Auto-scroll started');
    
    setAutoScrollActive(true);
    isAutoScrolling.current = true; // Set the flag
    
    autoScrollIntervalRef.current = setInterval(() => {
      const currentScrollableElement = getScrollableElement && getScrollableElement();
      
      if (currentScrollableElement && isAutoScrolling.current) { // Only check the ref flag, not stale state
        const oldScrollTop = currentScrollableElement.scrollTop;
        
        currentScrollableElement.scrollTop += scrollSpeed;
        
        // Fallback: try different scroll methods if scrollTop doesn't change
        if (currentScrollableElement.scrollTop === oldScrollTop) {
          // Try scrollBy method
          try {
            currentScrollableElement.scrollBy(0, scrollSpeed);
          } catch (e) {
            console.warn('⚠️ scrollBy method failed:', e);
          }
        }
        
        const newScrollTop = currentScrollableElement.scrollTop;
        
        // Stop if we've reached the bottom
        if (currentScrollableElement.scrollTop + currentScrollableElement.clientHeight >= 
            currentScrollableElement.scrollHeight) {
          console.log('🏁 Auto-scroll reached bottom, stopping');
          stopAutoScroll();
        }
      } else if (!isAutoScrolling.current) {
        // Auto-scroll was stopped, clear interval
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }
    }, 50);
  }, [enabled, scrollSpeed, stopAutoScroll, getScrollableElement]); // Remove autoScrollActive dependency

  const startMouseIdleTimer = useCallback(() => {
    if (!enabled) return;
    
    clearTimeout(mouseIdleTimeoutRef.current);
    mouseIdleTimeoutRef.current = setTimeout(() => {
      // Double-check the setting before starting auto-scroll
      if (enabled) {
        startAutoScroll();
      }
    }, idleDelay);
  }, [enabled, startAutoScroll, idleDelay]);

  // Mouse movement detection for auto-scroll
  const handleMouseMove = useCallback((e) => {
    const currentTime = Date.now();
    const deltaX = Math.abs(e.clientX - (e.target.lastMouseX || 0));
    const deltaY = Math.abs(e.clientY - (e.target.lastMouseY || 0));
    
    // Only consider significant mouse movement
    if (deltaX > 10 || deltaY > 10) { // Increased threshold to reduce sensitivity
      const timeSinceLastMove = currentTime - lastMouseMove.current;
      
      // Only stop auto-scroll if there was significant movement and some time has passed
      if (timeSinceLastMove > 100) { // Debounce mouse movement
        lastMouseMove.current = currentTime;
        stopAutoScroll();
        startMouseIdleTimer();
      }
    }
    
    e.target.lastMouseX = e.clientX;
    e.target.lastMouseY = e.clientY;
  }, [stopAutoScroll, startMouseIdleTimer]);

  // Immediately stop auto-scroll when the setting is disabled
  useEffect(() => {
    if (!enabled && isAutoScrolling.current) { // Use ref instead of stale state
      setAutoScrollActive(false);
      isAutoScrolling.current = false;
      clearInterval(autoScrollIntervalRef.current);
      clearTimeout(mouseIdleTimeoutRef.current);
      autoScrollIntervalRef.current = null;
    }
  }, [enabled]); // Remove autoScrollActive dependency

  // Stop auto-scroll on user interactions
  const handleUserInteraction = useCallback(() => {
    // Only stop if auto-scroll has been running for at least 1 second
    if (isAutoScrolling.current) { // Use ref instead of stale state
      stopAutoScroll();
      startMouseIdleTimer();
    }
  }, [stopAutoScroll, startMouseIdleTimer]); // Remove autoScrollActive dependency

  // Setup event listeners for user interactions (quiet + bounded retry with window fallback)
  useEffect(() => {
    let cancelled = false;
    let retryTimeout = null;
    let target = null;

    // Only stop auto-scroll on genuine user wheel events (not programmatic ones)
    let lastWheelTime = 0;
    const onWheel = (e) => {
      const now = Date.now();
      if (isAutoScrolling.current && (now - lastWheelTime < 200)) return;
      lastWheelTime = now;
      if (Math.abs(e.deltaY) > 5) handleUserInteraction();
    };
    const onTouchStart = (e) => { if (e.isTrusted) handleUserInteraction(); };
    const onClick = (e) => { if (e.isTrusted) handleUserInteraction(); };

    const attach = () => {
      if (cancelled) return;
      const el = getScrollableElement && getScrollableElement();
      target = el || window; // fallback to window quietly
      target.addEventListener('wheel', onWheel, { passive: true });
      target.addEventListener('touchstart', onTouchStart, { passive: true });
      target.addEventListener('click', onClick);

      // If we attached to window due to missing element, retry a few times to upgrade to element
      if (!el) {
        let attempts = 0;
        const maxAttempts = 25; // ~5s at 200ms
        const tryUpgrade = () => {
          if (cancelled) return;
          const next = getScrollableElement && getScrollableElement();
          if (next) {
            // swap listeners from window to element
            window.removeEventListener('wheel', onWheel);
            window.removeEventListener('touchstart', onTouchStart);
            window.removeEventListener('click', onClick);
            target = next;
            target.addEventListener('wheel', onWheel, { passive: true });
            target.addEventListener('touchstart', onTouchStart, { passive: true });
            target.addEventListener('click', onClick);
            return;
          }
          if (++attempts < maxAttempts) {
            retryTimeout = setTimeout(tryUpgrade, 200);
          }
        };
        retryTimeout = setTimeout(tryUpgrade, 200);
      }
    };

    attach();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (target) {
        target.removeEventListener('wheel', onWheel);
        target.removeEventListener('touchstart', onTouchStart);
        target.removeEventListener('click', onClick);
      }
    };
  }, [handleUserInteraction, getScrollableElement]);

  // Start idle timer on mount if auto-scroll is enabled and stop when disabled
  useEffect(() => {
    if (enabled) {
      startMouseIdleTimer();
    } else {
      // Immediately stop auto-scroll when setting is disabled
      if (isAutoScrolling.current) { // Use ref instead of stale state
        setAutoScrollActive(false);
        isAutoScrolling.current = false;
        clearInterval(autoScrollIntervalRef.current);
        clearTimeout(mouseIdleTimeoutRef.current);
        autoScrollIntervalRef.current = null;
      }
    }
    return () => {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
      }
      if (mouseIdleTimeoutRef.current) {
        clearTimeout(mouseIdleTimeoutRef.current);
      }
    };
  }, [enabled, startMouseIdleTimer]); // Remove autoScrollActive dependency

  return {
    autoScrollActive,
    handleMouseMove,
    startAutoScroll,
    stopAutoScroll,
    startMouseIdleTimer
  };
};

export default useAutoScroll;
