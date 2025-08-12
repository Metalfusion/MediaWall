import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { useInView } from 'react-intersection-observer';
import './VideoItem.css';

const VideoItem = memo(({
  video,
  videoFolder,
  index,
  width,
  settings,
  highlightModeEnabled,
  onHighlight,
  scrollRoot,
  preloadMarginPx
}) => {
  const videoRef = useRef(null);
  const srcRef = useRef('');
  
  // Calculate dimensions using actual video metadata
  const calculateDimensions = useCallback((providedWidth) => {
    // Priority 1: Use actual video dimensions from metadata (most accurate)
    if (video.metadata && video.metadata.dimensions && 
        video.metadata.dimensions.width && video.metadata.dimensions.height) {
      const metaWidth = parseInt(video.metadata.dimensions.width);
      const metaHeight = parseInt(video.metadata.dimensions.height);
      if (metaWidth > 0 && metaHeight > 0) {
        const aspectRatio = metaWidth / metaHeight;
        return { 
          width: providedWidth, 
          height: providedWidth / aspectRatio 
        };
      }
    }
    
    // Priority 2: Use top-level dimensions
    if (video.width && video.height && video.width > 0 && video.height > 0) {
      const aspectRatio = video.width / video.height;
      return { 
        width: providedWidth, 
        height: providedWidth / aspectRatio 
      };
    }
    
    // Priority 3: Use provided aspect_ratio (normalized)
    if (video.aspect_ratio && video.aspect_ratio > 0) {
      return { 
        width: providedWidth, 
        height: providedWidth / video.aspect_ratio 
      };
    }
    
    // Final fallback to 16:9 aspect ratio
    return { 
      width: providedWidth, 
      height: providedWidth / (16/9) 
    };
  }, [video, index]);
  
  // Use calculated dimensions based on video metadata
  const [dimensions, setDimensions] = useState(() => calculateDimensions(width));
  const [loadingError, setLoadingError] = useState(null);
  const [hovered, setHovered] = useState(false);
  
  // Internal state management (no longer passed down from parent)
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const baseFolder = videoFolder || '/videos/';
  const videoUrl = baseFolder + (video.filename || `video_${index}.mp4`);

  // Get viewport height for dynamic root margin
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  
  // Intersection observer for loading aligned with overscan/preload margin
  const { ref: containerRef, inView: inLoadView } = useInView({
    threshold: 0,
    root: scrollRoot ? scrollRoot() : undefined,
    rootMargin: `${Math.max(0, preloadMarginPx ?? Math.floor(viewportHeight / 2))}px 0px`,
  });

  // Intersection observer for playing (smaller margin - visible area)
  const { ref: playRef, inView: inPlayView, entry } = useInView({
    threshold: 0.1, // Start playing when 10% visible
    root: scrollRoot ? scrollRoot() : undefined,
    rootMargin: '0px', // No extra margin for playing
  });

  const loadVideo = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement || isLoading || isLoaded) return;
    
    setIsLoading(true);
    setIsFailed(false);
    setLoadingError(null);
    
    // Only set src when we actually need to load the video or when source changed
    if (!videoElement.src || srcRef.current !== videoUrl) {
      videoElement.src = videoUrl;
      srcRef.current = videoUrl;
    }
    
    videoElement.muted = settings.isMuted;
    videoElement.preload = 'metadata'; // Change from 'auto' to reduce resource usage
    videoElement.loop = true;
    videoElement.playsInline = true;
    
    const handleError = (event) => {
      // Don't handle errors if video has been unloaded
      if (!videoElement.src) return;
      
      // Clear load timeout
      if (videoElement._loadTimeout) {
        clearTimeout(videoElement._loadTimeout);
        videoElement._loadTimeout = null;
      }
      
      const error = event.target.error;
      const errorDetails = {
        code: error?.code,
        message: error?.message,
        networkState: videoElement.networkState,
        readyState: videoElement.readyState,
        currentSrc: videoElement.currentSrc || videoElement.src
      };
      
      console.error(`❌ Failed to load video ${index + 1}:`, errorDetails);
      console.error(`   URL: ${videoUrl}`);
      console.error(`   Error codes: 1=MEDIA_ERR_ABORTED, 2=MEDIA_ERR_NETWORK, 3=MEDIA_ERR_DECODE, 4=MEDIA_ERR_SRC_NOT_SUPPORTED`);
      
      setLoadingError(error?.message || `Media error code: ${error?.code || 'unknown'}`);
      setIsFailed(true);
      setIsLoading(false);
    };

    const handleLoadedMetadata = () => {
      // Don't handle loaded metadata if video has been unloaded
      if (!videoElement.src) return;
      
      // Clear load timeout - video loaded successfully
      if (videoElement._loadTimeout) {
        clearTimeout(videoElement._loadTimeout);
        videoElement._loadTimeout = null;
      }
      
      // Calculate actual dimensions
      const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
      const height = width / aspectRatio;
      
      setDimensions({ width, height });
      setIsLoaded(true);
      setIsLoading(false);
      setIsFailed(false);
      setLoadingError(null);
    };

    const handleLoadedData = () => {
      // Data loaded, video ready to play
    };

  // Remove existing listeners if previously attached
  if (videoElement._handleError) videoElement.removeEventListener('error', videoElement._handleError);
  if (videoElement._handleLoadedMetadata) videoElement.removeEventListener('loadedmetadata', videoElement._handleLoadedMetadata);
  if (videoElement._handleLoadedData) videoElement.removeEventListener('loadeddata', videoElement._handleLoadedData);
  const oldHandlePlay = videoElement._handlePlay;
  const oldHandlePause = videoElement._handlePause;
  if (oldHandlePlay) videoElement.removeEventListener('play', oldHandlePlay);
  if (oldHandlePause) videoElement.removeEventListener('pause', oldHandlePause);

    // Add event listeners
  videoElement.addEventListener('error', handleError);
  videoElement.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
  videoElement.addEventListener('loadeddata', handleLoadedData, { once: true });
  // store for cleanup
  videoElement._handleError = handleError;
  videoElement._handleLoadedMetadata = handleLoadedMetadata;
  videoElement._handleLoadedData = handleLoadedData;

    // Add play/pause event listeners to sync state
    const handlePlay = () => {
      setIsPlaying(true);
    };
    const handlePause = () => {
      setIsPlaying(false);
    };
    
    // Store references for cleanup
    videoElement._handlePlay = handlePlay;
    videoElement._handlePause = handlePause;
    
    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);

    // Start loading
    videoElement.load();
    
    // Add a timeout to prevent videos from getting stuck in loading state
    const loadTimeout = setTimeout(() => {
      if (isLoading && !isLoaded) {
        console.warn(`⏰ Video ${index + 1} load timeout after 10 seconds`);
        setIsLoading(false);
        setIsFailed(true);
        setLoadingError('Load timeout');
      }
    }, 10000); // 10 second timeout

    // Store timeout reference for cleanup
    videoElement._loadTimeout = loadTimeout;
  }, [index, videoUrl, width, settings.isMuted, isLoading, isLoaded]);

  // Load video when it comes into extended viewport (half screen height)
  useEffect(() => {
    if (inLoadView && !isLoaded && !isFailed && videoRef.current) {
      //console.log(`🎬 Triggering load for video ${index}`);
      loadVideo();
    }
  }, [inLoadView, isLoaded, isFailed, loadVideo, index]);

  // If the video prop (filename) changes due to shuffle, reset state so the new item can load
  useEffect(() => {
    const newUrl = videoUrl;
    if (srcRef.current && srcRef.current !== newUrl) {
      // Reset state to allow re-load
      setIsLoaded(false);
      setIsFailed(false);
      setIsLoading(false);
      setLoadingError(null);
      const el = videoRef.current;
      if (el) {
        try {
          if (!el.paused) el.pause();
        } catch {}
        el.src = '';
        el.removeAttribute('src');
      }
    }
  }, [videoUrl]);

  // Unload video when it goes far out of view (save memory) - with delay to prevent race conditions
  useEffect(() => {
    if (!inLoadView && (isLoaded || isLoading) && videoRef.current) {
      // Add a delay to prevent immediate load/unload cycles
      const unloadTimer = setTimeout(() => {
        if (!inLoadView && videoRef.current) { // Double-check inLoadView after delay
          const videoElement = videoRef.current;
          // Pause if playing
          if (!videoElement.paused) {
            videoElement.pause();
            setIsPlaying(false);
          }
          // Remove src to free up memory and WebMediaPlayer
          videoElement.src = '';
          videoElement.removeAttribute('src');
          setIsLoaded(false);
          setIsFailed(false);
          setLoadingError(null);
          setIsLoading(false);
        }
      }, 1000); // 1 second delay before unloading

      return () => clearTimeout(unloadTimer);
    }
  }, [inLoadView, isLoaded, isLoading]);

  // Handle autoplay when video comes into close view
  useEffect(() => {
    if (!videoRef.current || !isLoaded || isFailed) return;

    const video = videoRef.current;
    const intersectionRatio = entry?.intersectionRatio || 0;

    if (settings.autoplay && inPlayView && intersectionRatio > 0.1 && !isPlaying) {
      video.play().then(() => {
        setIsPlaying(true);
      }).catch(e => {
        console.error(`❌ Video ${index + 1} play failed:`, e.name);
      });
    } else if (!inPlayView && isPlaying) {
      // Pause when out of play view
      video.pause();
      setIsPlaying(false);
    }
  }, [inPlayView, entry?.intersectionRatio, settings.autoplay, isLoaded, isFailed, isPlaying, index]);

  // Handle click for play/pause and highlight
  const handleClick = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isLoaded) return;

    if (highlightModeEnabled) {
      onHighlight(index, true);
    } else {
      // Regular play/pause
      if (video.paused) {
        video.play().then(() => {
          setIsPlaying(true);
        }).catch(e => {
          console.error(`❌ Manual play failed for video ${index + 1}:`, e.name);
        });
      } else {
        video.pause();
        setIsPlaying(false);
      }
    }
  }, [isLoaded, highlightModeEnabled, onHighlight, index]);

  // Handle hover for highlight mode and video expansion
  const handleMouseEnter = useCallback(() => {
    setHovered(true);
    if (highlightModeEnabled && isLoaded && onHighlight) {
      // Show this video in highlight (not locked, just temporary hover)
      onHighlight(index, false); // Pass video index and false for not locked
    }
  }, [highlightModeEnabled, isLoaded, onHighlight, index]);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    // Don't clear highlight on mouse leave - let user keep it visible
    // The highlight will change when they hover over another video
  }, []);

  // Update mute state when settings change
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = settings.isMuted;
    }
  }, [settings.isMuted]);

  // Update dimensions when width prop changes (from Masonic)
  useEffect(() => {
    if (width !== dimensions.width) {
      const newDimensions = calculateDimensions(width);
      setDimensions(newDimensions);
    }
  }, [width, dimensions.width, calculateDimensions]);

  // Combined ref callback to handle both intersection observers
  const combinedRef = useCallback((node) => {
    containerRef(node);
    playRef(node);
  }, [containerRef, playRef]);

  const containerStyle = {
    width: width,
    height: dimensions.height, // Remove +60 for title space
    marginBottom: 0 // Remove margin for minimal layout
  };

  const videoStyle = {
    width: width,
    height: dimensions.height,
    objectFit: 'cover'
  };

  return (
    <div 
      ref={combinedRef}
      className={`video-item ${isLoaded ? 'loaded' : ''} ${isFailed ? 'failed' : ''} ${hovered ? 'hovered' : ''}`}
      style={containerStyle}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="video-wrapper" style={{ width: width, height: dimensions.height }}>
        {!isLoaded && !isFailed && !isLoading && (
          <div className="video-placeholder">
            <div className="loading-spinner">📺</div>
            <div className="loading-text">Ready to load...</div>
          </div>
        )}
        
        {isLoading && (
          <div className="video-placeholder">
            <div className="loading-spinner">⏳</div>
            <div className="loading-text">Loading...</div>
          </div>
        )}
        
        {isFailed && (
          <div className="video-error">
            <div className="error-icon">❌</div>
            <div className="error-text">
              Failed to load
              {loadingError && <div className="error-details">{loadingError}</div>}
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          style={{
            ...videoStyle,
            backgroundColor: '#000',
            objectFit: 'cover'
          }}
          playsInline
          loop
          muted={settings.isMuted}
          preload="none"
          className={`${isPlaying ? 'playing' : ''}`}
        />
      </div>
    </div>
  );
});

VideoItem.displayName = 'VideoItem';

export default VideoItem;
