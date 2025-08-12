import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import { useInView } from 'react-intersection-observer';
import './VideoItem.css';

const ImageItem = memo(({ image, imageFolder, index, width, settings, highlightModeEnabled, onHighlight, scrollRoot, preloadMarginPx }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Persist whether we've ever decided to load this image to avoid toggling src
  const [shouldLoad, setShouldLoad] = useState(false);
  // Keep a stable ref to know if load was already requested
  const hasRequestedLoadRef = useRef(false);
  const srcRef = useRef('');

  const baseFolder = imageFolder || '/images/';
  const imageUrl = baseFolder + (image.filename || `image_${index}.jpg`);

  // Calculate height based on provided metadata
  const calcHeight = useCallback(() => {
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
  }, [image, width]);

  const height = calcHeight();

  // Lazy load the image when near viewport
  const { ref: containerRef, inView } = useInView({
    threshold: 0,
    root: scrollRoot ? scrollRoot() : undefined,
    rootMargin: `${Math.max(0, preloadMarginPx ?? 400)}px 0px`,
  });

  // Once in view the first time, mark as shouldLoad and never unset
  useEffect(() => {
    if (inView && !hasRequestedLoadRef.current) {
      hasRequestedLoadRef.current = true;
      setShouldLoad(true);
    }
  }, [inView]);

  // When the image source changes (shuffle), reset state so the new image can load/display
  useEffect(() => {
    if (srcRef.current && srcRef.current !== imageUrl) {
      setIsLoaded(false);
      setIsFailed(false);
      setShouldLoad(false);
      hasRequestedLoadRef.current = false;
    }
    srcRef.current = imageUrl;
  }, [imageUrl]);

  const handleClick = useCallback(() => {
    if (highlightModeEnabled) {
      onHighlight(index, true);
    }
  }, [highlightModeEnabled, onHighlight, index]);

  const handleMouseEnter = useCallback(() => {
    setHovered(true);
    if (highlightModeEnabled && onHighlight) {
      onHighlight(index, false);
    }
  }, [highlightModeEnabled, onHighlight, index]);

  const handleMouseLeave = useCallback(() => setHovered(false), []);

  return (
    <div
      ref={containerRef}
      className={`video-item ${isLoaded ? 'loaded' : ''} ${isFailed ? 'failed' : ''} ${hovered ? 'hovered' : ''}`}
      style={{ width, height, marginBottom: 0 }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="video-wrapper" style={{ width, height }}>
  {!isLoaded && !isFailed && !shouldLoad && (
          <div className="video-placeholder">
            <div className="loading-spinner">🖼️</div>
            <div className="loading-text">Ready to load...</div>
          </div>
        )}

        {/* Always keep the <img> mounted to prevent flicker; set src only once */}
    {!isFailed && (
          <img
      src={shouldLoad ? imageUrl : undefined}
            alt={image.title || image.filename || `Image ${index}`}
            style={{ width, height, objectFit: 'cover', opacity: isLoaded ? 1 : 0, transition: 'opacity 200ms ease' }}
      onLoad={() => setIsLoaded(true)}
            onError={() => setIsFailed(true)}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        )}

        {!isFailed && !isLoaded && shouldLoad && (
          <div className="video-placeholder">
            <div className="loading-spinner">⏳</div>
            <div className="loading-text">Loading...</div>
          </div>
        )}

        {isFailed && (
          <div className="video-error">
            <div className="error-icon">❌</div>
            <div className="error-text">Failed to load</div>
          </div>
        )}
      </div>
    </div>
  );
});

ImageItem.displayName = 'ImageItem';

export default ImageItem;
