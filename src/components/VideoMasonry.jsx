import React, { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import { usePositioner, useResizeObserver, useMasonry } from 'masonic';
import VideoItem from './VideoItem';
import ImageItem from './ImageItem';
import { useAutoScroll } from '../hooks/useAutoScroll';
import './VideoMasonry.css';

const VideoMasonry = ({
  videos,
  images = [],
  mode = 'videos', // 'videos' | 'images' | 'mixed'
  videoFolder,
  imageFolder = '/images/',
  settings,
  highlightModeEnabled,
  controlsCollapsed,
  onHighlightVideo,
  totalVideosCount = 0,
  totalImagesCount = 0
}) => {
  // ALL HOOKS MUST BE DECLARED AT THE TOP - NO CONDITIONAL HOOKS OR EARLY RETURNS BEFORE THIS POINT
  const containerRef = useRef(null);

  // Container dimensions and scroll state
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [scrollState, setScrollState] = useState({ scrollTop: 0, isScrolling: false });
  const scrollTimeoutRef = useRef(null);
  const lastScrollTopRef = useRef(0); // Track last scroll position for comparison

  // Auto-scroll hook
  const getScrollableElement = useCallback(() => {
    // The video-masonry-container itself is the scrollable element
    const element = containerRef.current;
    return element || null;
  }, []); // Empty dependency array to prevent recreation

  const { autoScrollActive, handleMouseMove } = useAutoScroll({
    enabled: settings.autoScroll,
    scrollSpeed: settings.scrollSpeed,
    idleDelay: 5000,
    getScrollableElement
  });

  // Memoize calculated widths to prevent unnecessary re-renders
  const effectiveWidth = useMemo(() => {
    const containerWidth = containerDimensions.width;
    if (containerWidth > 0) {
      return containerWidth;
    }

    // Fallback calculation based on window size and highlight mode
    const baseWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const availableWidth = highlightModeEnabled ? baseWidth * 0.7 : baseWidth; // 70% if highlight mode (30% for highlight panel)
    return availableWidth;
  }, [containerDimensions.width, highlightModeEnabled]);

  // Memoize positioner configuration to prevent re-creation
  const positioner = usePositioner({
    width: effectiveWidth,
    columnWidth: settings.gridSize,
    columnGutter: 0 // Remove gaps for gapless layout
  });

  const masonicResizeObserver = useResizeObserver(positioner);

  // Reset positioner on mode change to clear internal caches and avoid stale WeakMap keys
  useEffect(() => {
    try {
      if (positioner && typeof positioner.reset === 'function') {
        positioner.reset(0);
      }
    } catch (e) {
      // no-op
    }
  }, [mode, positioner]);

  // Container resize observer effect
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerDimensions({ width, height });
      }
    });

    containerResizeObserver.observe(container);

    // Initial measurement with retry logic
    const measureContainer = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerDimensions({ width: rect.width, height: rect.height });
      } else {
        // Retry measurement after a brief delay
        setTimeout(measureContainer, 100);
      }
    };

    measureContainer();

    return () => {
      containerResizeObserver.disconnect();
    };
  }, []);

  // Additional effect to handle highlight mode changes and other layout changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Trigger remeasurement when highlight mode changes or other layout changes occur
    const remeasure = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerDimensions({ width: rect.width, height: rect.height });
      }
    };

    // Small delay to allow CSS transitions to complete
    const timeout = setTimeout(remeasure, 350); // Slightly longer than the 0.3s CSS transition

    return () => clearTimeout(timeout);
  }, [highlightModeEnabled, controlsCollapsed]); // Trigger when highlight mode OR controls collapse state changes

  // Scroll event handler - listen to the actual scrollable element (robust + quiet)
  useEffect(() => {
    let cancelled = false;
    let retryTimeout = null;
    let el = null;

    const handleScroll = () => {
      if (!el) return;
      try {
        const newScrollTop = el.scrollTop;
        const containerHeight = el.clientHeight;
        const scrollHeight = el.scrollHeight;
        setScrollState({ scrollTop: newScrollTop, isScrolling: true });
        lastScrollTopRef.current = newScrollTop;
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
          setScrollState(prev => ({ ...prev, isScrolling: false }));
        }, 150);
      } catch (_) { /* ignore */ }
    };

    const windowScrollHandler = () => handleScroll();

    const attach = () => {
      if (cancelled) return;
      el = containerRef.current;
      if (!el) {
        // bounded retry to avoid noise; try for ~5s
        retryTimeout = setTimeout(attach, 200);
        return;
      }
      el.addEventListener('scroll', handleScroll, { passive: true });
      window.addEventListener('scroll', windowScrollHandler, { passive: true });
      handleScroll();
    };

    attach();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (el) el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', windowScrollHandler);
      clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // // Add a periodic check to ensure scroll handling is working
  // useEffect(() => {
  //   const checkInterval = setInterval(() => {
  //     const element = containerRef.current;
  //     if (element) {
  //       const now = Date.now();
  //       console.log('🔍 Scroll health check:', {
  //         timestamp: now,
  //         scrollTop: element.scrollTop,
  //         scrollHeight: element.scrollHeight,
  //         clientHeight: element.clientHeight,
  //         hasScrollListener: element.onscroll !== null
  //       });
  //     }
  //   }, 10000); // Check every 10 seconds

  //   return () => clearInterval(checkInterval);
  // }, []);

  // Memoize callback functions to prevent recreation (simplified - no state tracking)
  const memoizedCallbacks = useMemo(() => ({
    onHighlightVideo
  }), [onHighlightVideo]);

  // Create stable video items data - simplified without state tracking
  const itemsData = useMemo(() => {
    if (mode === 'images') {
      return images.map((image, index) => ({ type: 'image', image, index }));
    }
    if (mode === 'mixed') {
      const merged = [];
      const maxLen = Math.max(videos.length, images.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < videos.length) merged.push({ type: 'video', video: videos[i], index: merged.length });
        if (i < images.length) merged.push({ type: 'image', image: images[i], index: merged.length });
      }
      return merged;
    }
    return videos.map((video, index) => ({ type: 'video', video, index }));
  }, [videos, images, mode]);

  // (removed here; redefined after safeItems)

  // Overscan control: shared overscan multiplier and per-type preload margins
  const overscanMultiplier = settings?.overscanMultiplier ?? 1.5;
  const imagePreloadMultiplier = settings?.imagePreloadMultiplier ?? overscanMultiplier;
  const videoPreloadMultiplier = settings?.videoPreloadMultiplier ?? overscanMultiplier;
  const { imagePreloadMarginPx, videoPreloadMarginPx } = useMemo(() => {
    const h = containerDimensions.height || (typeof window !== 'undefined' ? window.innerHeight : 600);
    return {
      imagePreloadMarginPx: Math.max(0, Math.round(h * imagePreloadMultiplier)),
      videoPreloadMarginPx: Math.max(0, Math.round(h * videoPreloadMultiplier))
    };
  }, [containerDimensions.height, imagePreloadMultiplier, videoPreloadMultiplier]);

  // Memoized render function for Masonic using provided item data
  const renderItem = useCallback(({ index, width, data }) => {
    const itemData = data;
    if (!itemData) {
      console.log(`❌ No itemData for index ${index}`);
      return (
        <div style={{
          width,
          height: 200,
          backgroundColor: '#e74c3c',
          color: 'white',
          padding: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          Error: No item {index}
        </div>
      );
    }

    if (itemData.type === 'placeholder') {
      return (
        <div style={{ width, height: 100, background: 'transparent' }} />
      );
    }

    if (itemData.type === 'image') {
      return (
        <ImageItem
          image={itemData.image}
          imageFolder={imageFolder}
          index={itemData.index}
          width={width}
          settings={settings}
          highlightModeEnabled={highlightModeEnabled}
          scrollRoot={getScrollableElement}
          preloadMarginPx={imagePreloadMarginPx}
          onHighlight={(itemIndex, isLocked) => memoizedCallbacks.onHighlightVideo(itemIndex, isLocked)}
        />
      );
    }
    return (
      <VideoItem
        video={itemData.video}
        videoFolder={videoFolder}
        index={itemData.index}
        width={width}
        settings={settings}
        highlightModeEnabled={highlightModeEnabled}
        scrollRoot={getScrollableElement}
        preloadMarginPx={videoPreloadMarginPx}
        onHighlight={(itemIndex, isLocked) => memoizedCallbacks.onHighlightVideo(itemIndex, isLocked)}
      />
    );
  }, [imageFolder, videoFolder, settings, highlightModeEnabled, memoizedCallbacks, getScrollableElement, imagePreloadMarginPx, videoPreloadMarginPx]);

  // Height calculation function for Masonic - must accept the item object
  const getItemHeight = useCallback((itemData, width) => {
    if (!itemData || itemData.type === 'placeholder') return 100;
    if (itemData.type === 'image') {
      const image = itemData.image;
      if (image.metadata && image.metadata.dimensions && image.metadata.dimensions.width && image.metadata.dimensions.height) {
        const w = parseInt(image.metadata.dimensions.width);
        const h = parseInt(image.metadata.dimensions.height);
        if (w > 0 && h > 0) return width / (w / h);
      }
      if (image.width && image.height && image.width > 0 && image.height > 0) {
        return width / (image.width / image.height);
      }
      if (image.aspect_ratio && image.aspect_ratio > 0) {
        return width / image.aspect_ratio;
      }
      return width / (4 / 3);
    }
    if (itemData && itemData.video) {
      const { video } = itemData;

      // Priority 1: Use actual video dimensions from metadata (most accurate)
      if (video.metadata && video.metadata.dimensions &&
        video.metadata.dimensions.width && video.metadata.dimensions.height) {
        const metaWidth = parseInt(video.metadata.dimensions.width);
        const metaHeight = parseInt(video.metadata.dimensions.height);
        if (metaWidth > 0 && metaHeight > 0) {
          const aspectRatio = metaWidth / metaHeight;
          const videoHeight = width / aspectRatio;
          return videoHeight;
        }
      }

      // Priority 2: Use top-level dimensions
      if (video.width && video.height && video.width > 0 && video.height > 0) {
        const aspectRatio = video.width / video.height;
        const videoHeight = width / aspectRatio;
        return videoHeight;
      }

      // Priority 3: Use provided aspect_ratio (normalized)
      if (video.aspect_ratio && video.aspect_ratio > 0) {
        const videoHeight = width / video.aspect_ratio;
        return videoHeight;
      }
    }

    // Final fallback to 16:9 aspect ratio
    const videoHeight = width / (16 / 9);
    return videoHeight;
  }, []);

  // Calculate average aspect ratio from available video metadata for better height estimation
  const averageAspectRatio = useMemo(() => {
    const list = mode === 'images' ? images : (mode === 'mixed' ? [...videos, ...images] : videos);
    if (!list || list.length === 0) return 16 / 9;

    let totalAspectRatio = 0;
    let validAspectRatios = 0;
    let aspectRatioSources = { metadata: 0, calculated: 0, fallback: 0 };

    list.forEach(video => {
      // Priority 1: Use actual video dimensions from metadata (most accurate)
      if (video.metadata && video.metadata.dimensions &&
        video.metadata.dimensions.width && video.metadata.dimensions.height) {
        const metaWidth = parseInt(video.metadata.dimensions.width);
        const metaHeight = parseInt(video.metadata.dimensions.height);
        if (metaWidth > 0 && metaHeight > 0) {
          totalAspectRatio += (metaWidth / metaHeight);
          validAspectRatios++;
          aspectRatioSources.calculated++;
          return;
        }
      }

      // Priority 2: Use top-level dimensions if available
      if (video.width && video.height && video.width > 0 && video.height > 0) {
        totalAspectRatio += (video.width / video.height);
        validAspectRatios++;
        aspectRatioSources.calculated++;
        return;
      }

      // Priority 3: Use provided aspect_ratio (appears to be normalized to 16:9)
      if (video.aspect_ratio && video.aspect_ratio > 0) {
        totalAspectRatio += video.aspect_ratio;
        validAspectRatios++;
        aspectRatioSources.metadata++;
        return;
      }

      // No usable dimensions found
      aspectRatioSources.fallback++;
    });

    const avgRatio = validAspectRatios > 0 ? totalAspectRatio / validAspectRatios : 16 / 9;

    // Analyze aspect ratio distribution to understand horizontal vs vertical videos
    let horizontal = 0, vertical = 0, square = 0;
    const aspectRatioDistribution = {};

    // If we're analyzing images only, adapt field names accordingly
    const analyze = (entry) => {
      let ratio = null;
      const metaDims = entry?.metadata?.dimensions;
      if (metaDims?.width && metaDims?.height) {
        const w = parseInt(metaDims.width);
        const h = parseInt(metaDims.height);
        if (w > 0 && h > 0) ratio = w / h;
      }
      if (!ratio && entry?.width && entry?.height && entry.width > 0 && entry.height > 0) {
        ratio = entry.width / entry.height;
      }
      if (!ratio && entry?.aspect_ratio && entry.aspect_ratio > 0) {
        ratio = entry.aspect_ratio;
      }
      if (ratio) {
        if (ratio > 1.1) horizontal++;
        else if (ratio < 0.9) vertical++;
        else square++;
        const roundedRatio = Math.round(ratio * 1000) / 1000;
        aspectRatioDistribution[roundedRatio] = (aspectRatioDistribution[roundedRatio] || 0) + 1;
      }
    };

    list.forEach(analyze);

    // Get the most common aspect ratios
    const sortedRatios = Object.entries(aspectRatioDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Log aspect ratio analysis with orientation breakdown (simplified)
    console.log('📐 Item aspect ratio analysis:', {
      totalItems: list.length,
      averageAspectRatio: avgRatio.toFixed(3),
      orientation: { horizontal, vertical, square },
      sources: `${aspectRatioSources.calculated} from metadata, ${aspectRatioSources.metadata} normalized, ${aspectRatioSources.fallback} fallback`,
      topRatios: `${sortedRatios[0]?.[1] || 0} videos at ${sortedRatios[0]?.[0] || 'N/A'}, ${sortedRatios[1]?.[1] || 0} videos at ${sortedRatios[1]?.[0] || 'N/A'}`
    });

    return avgRatio;
  }, [videos, images, mode]);

  // Create safe items for masonic to avoid WeakMap key errors when list is empty
  const safeItems = useMemo(() => {
    if (Array.isArray(itemsData) && itemsData.length > 0) return itemsData;
    // Provide a placeholder object so masonic never receives primitives/undefined
    return [{ type: 'placeholder' }];
  }, [itemsData]);

  // We rely on default item identity; no custom itemKey to avoid WeakMap string keys

  // MASONRY HOOK - MUST BE CALLED EVERY RENDER
  const masonryElements = useMasonry({
    positioner,
    resizeObserver: masonicResizeObserver,
    items: safeItems,
    height: containerDimensions.height || (typeof window !== 'undefined' ? window.innerHeight : 600),
    scrollTop: scrollState.scrollTop,
    isScrolling: scrollState.isScrolling,
    overscanBy: overscanMultiplier, // Increase overscanning to load more items ahead
    itemHeightEstimate: settings.gridSize / averageAspectRatio, // Use calculated average aspect ratio
    render: renderItem,
    getItemHeight, // Provide the height calculation function
    onRender: (startIndex, stopIndex, items) => {
      // Debug what range is being rendered
      if (startIndex !== undefined && stopIndex !== undefined) {
        //console.log(`🎬 Rendering items ${startIndex} to ${stopIndex} (${stopIndex - startIndex + 1} items)`);
      }
    }
  });

  // EARLY RETURNS AFTER ALL HOOKS
  const noVideosLoaded = totalVideosCount === 0;
  const noImagesLoaded = totalImagesCount === 0;
  const noAnyMediaLoaded = noVideosLoaded && noImagesLoaded;

  const isEmptyForMode = (mode === 'videos' && videos.length === 0)
    || (mode === 'images' && images.length === 0)
    || (mode === 'mixed' && itemsData.length === 0);

  if (isEmptyForMode) {
    let message = 'No items available.';
    if (mode === 'videos') {
      message = noVideosLoaded
        ? 'No videos loaded. Please start the media server.'
        : 'No videos match the selected tags.';
    } else if (mode === 'images') {
      message = noImagesLoaded
        ? 'No images loaded. Please start the media server.'
        : 'No images match the selected tags.';
    } else {
      // mixed
      message = noAnyMediaLoaded
        ? 'No media loaded. Please start the media server.'
        : 'No media match the selected tags.';
    }
    return (
      <div className="video-masonry-empty">
        <p>{message}</p>
      </div>
    );
  }
  // Don't render Masonry until we have a valid width (allow height to be fallback)
  if (effectiveWidth === 0) {
    return (
      <div
        ref={containerRef}
        className="video-masonry-container"
        style={{
          width: '100%',
          height: '100%',
          overflow: 'auto', // Revert back to 'auto' for scrolling
          padding: '20px'
        }}
      >
        <div className="video-masonry-empty">
          <p>📏 Measuring container dimensions... (width: {effectiveWidth}, height: {containerDimensions.height})</p>
        </div>
      </div>
    );
  }

  return (
    <div
      key={`masonry-${mode}`}
      ref={containerRef}
      className="video-masonry-container"
      onMouseMove={handleMouseMove}
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: 0,
        margin: 0,
        background: '#000',
        // Ensure the container has minimum dimensions for measurement
        minWidth: '300px',
        minHeight: '200px'
      }}
    >
      {masonryElements}

      {autoScrollActive && (
        <div className="auto-scroll-indicator">
          🔄 Auto-scrolling...
        </div>
      )}
    </div>
  );
};

// Custom comparison function for memo to prevent unnecessary re-renders
const arePropsEqual = (prevProps, nextProps) => {
  // Check if videos array changed (shallow comparison should be sufficient)
  if (prevProps.videos !== nextProps.videos) {
    console.log('🔄 VideoMasonry re-render: videos changed');
    return false;
  }

  // Check if images array changed
  if (prevProps.images !== nextProps.images) {
    console.log('🔄 VideoMasonry re-render: images changed');
    return false;
  }

  // Check if mode changed
  if (prevProps.mode !== nextProps.mode) {
    console.log('🔄 VideoMasonry re-render: mode changed');
    return false;
  }

  // Check if folders changed
  if (prevProps.videoFolder !== nextProps.videoFolder) {
    console.log('🔄 VideoMasonry re-render: videoFolder changed');
    return false;
  }
  if (prevProps.imageFolder !== nextProps.imageFolder) {
    console.log('🔄 VideoMasonry re-render: imageFolder changed');
    return false;
  }

  // Check if settings changed (deep comparison for settings object)
  if (JSON.stringify(prevProps.settings) !== JSON.stringify(nextProps.settings)) {
    console.log('🔄 VideoMasonry re-render: settings changed');
    return false;
  }

  // Check if UI state changed
  if (prevProps.highlightModeEnabled !== nextProps.highlightModeEnabled) {
    console.log('🔄 VideoMasonry re-render: highlightModeEnabled changed');
    return false;
  }

  if (prevProps.controlsCollapsed !== nextProps.controlsCollapsed) {
    console.log('🔄 VideoMasonry re-render: controlsCollapsed changed');
    return false;
  }

  // Check if callback changed - this is the critical one
  if (prevProps.onHighlightVideo !== nextProps.onHighlightVideo) {
    console.log('🔄 VideoMasonry re-render: onHighlightVideo callback changed');
    return false;
  }

  console.debug('✅ VideoMasonry props unchanged - preventing re-render');
  return true;
};

VideoMasonry.displayName = 'VideoMasonry';

export default memo(VideoMasonry, arePropsEqual);
