import React, { useRef, useEffect, useState, useMemo } from 'react';
import './HighlightSection.css';

const HighlightSection = ({ 
  items, 
  videoFolder,
  imageFolder,
  highlightedVideo, 
  lockedVideo, 
  onClearHighlight 
}) => {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isDragging, setIsDragging] = useState(false);

  const currentIndex = lockedVideo !== null ? lockedVideo : highlightedVideo;
  const currentItem = useMemo(() => {
    if (!items || !Array.isArray(items)) return null;
    if (currentIndex == null || currentIndex < 0 || currentIndex >= items.length) return null;
    return items[currentIndex];
  }, [items, currentIndex]);

  const isVideo = currentItem && (currentItem.type === 'video' || currentItem.mime?.startsWith('video/'));
  const isImage = currentItem && (currentItem.type === 'image' || currentItem.mime?.startsWith('image/'));

  // Get display title from video object (server now provides clean titles)
  const getDisplayTitle = (item) => {
    if (!item) return '';
    return item.title || item.filename || '';
  };

  useEffect(() => {
    // Only set up when current item is a video
    if (!isVideo || !currentItem || !videoRef.current) return;

    const baseFolder = videoFolder || '/videos/';
    const videoUrl = baseFolder + currentItem.filename;

    const el = videoRef.current;
    el.src = videoUrl;
    el.currentTime = 0;
    el.muted = isMuted;
    el.volume = volume;

    const handleTimeUpdate = () => {
      if (!isDragging) setCurrentTime(el.currentTime);
    };
    const handleLoadedMetadata = () => setDuration(el.duration);
    const handleVolumeChange = () => {
      setVolume(el.volume);
      setIsMuted(el.muted);
    };

    el.addEventListener('timeupdate', handleTimeUpdate);
    el.addEventListener('loadedmetadata', handleLoadedMetadata);
    el.addEventListener('volumechange', handleVolumeChange);

    el.play().then(() => setIsPlaying(true)).catch(e => {
      console.log('Highlight video autoplay failed:', e);
      setIsPlaying(false);
    });

    return () => {
      el.removeEventListener('timeupdate', handleTimeUpdate);
      el.removeEventListener('loadedmetadata', handleLoadedMetadata);
      el.removeEventListener('volumechange', handleVolumeChange);
    };
  }, [currentItem, isVideo, videoFolder, isMuted, volume, isDragging]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(e => console.log('Play failed:', e));
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    
    const newMuted = !videoRef.current.muted;
    videoRef.current.muted = newMuted;
    setIsMuted(newMuted);
  };

  const handleSeek = (e) => {
    if (!videoRef.current || !duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = pos * duration;
    
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleSeekStart = (e) => {
    setIsDragging(true);
    handleSeek(e);
  };

  const handleSeekEnd = () => {
    setIsDragging(false);
  };

  const handleVolumeChange = (e) => {
    if (!videoRef.current) return;
    
    const newVolume = parseFloat(e.target.value);
    videoRef.current.volume = newVolume;
    setVolume(newVolume);
    
    // Unmute if volume is increased from 0
    if (newVolume > 0 && isMuted) {
      videoRef.current.muted = false;
      setIsMuted(false);
    }
  };

  const formatTime = (time) => {
    if (!time || !isFinite(time)) return '0:00';
    
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleMediaClick = (e) => {
    // Prevent unlocking if clicking on controls
    if (e.target.closest('.video-controls') || e.target.closest('.highlight-controls')) {
      return;
    }
    
    // If video is locked, clicking it should unlock it
    if (lockedVideo !== null) {
      onClearHighlight();
    }
  };

  if (!currentItem) {
    return (
      <div className="highlight-section">
        <div className="highlight-header">
          <h3>🎯 Preview</h3>
          <button onClick={onClearHighlight} className="close-btn">✖️</button>
        </div>
        <div className="highlight-content">
          <div className="highlight-placeholder">
            Hover over a video or image to preview
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="highlight-section">
      <div className="highlight-header">
        <h3>{getDisplayTitle(currentItem)}</h3>
        <div className="highlight-controls">
          {isVideo && (
            <>
              <button onClick={togglePlay} className="control-btn">
                {isPlaying ? '⏸️' : '▶️'}
              </button>
              <button onClick={toggleMute} className="control-btn">
                {isMuted ? '🔇' : '🔊'}
              </button>
            </>
          )}
          <button onClick={onClearHighlight} className="close-btn">✖️</button>
        </div>
      </div>
      
      <div className="highlight-content">
        {lockedVideo !== null && (
          <div className="locked-indicator">
            🔒 Locked (click preview to unlock)
          </div>
        )}
        
        <div className="highlight-video-container">
          {isVideo ? (
            <video
              ref={videoRef}
              className="highlight-video"
              playsInline
              loop
              controls={false}
              onClick={handleMediaClick}
              style={{ cursor: lockedVideo !== null ? 'pointer' : 'default' }}
            />
          ) : (
            <img
              src={(imageFolder || '/images/') + currentItem.filename}
              alt={getDisplayTitle(currentItem)}
              className="highlight-image"
              onClick={handleMediaClick}
              style={{ cursor: lockedVideo !== null ? 'pointer' : 'default' }}
              loading="eager"
            />
          )}
        </div>
        
        {/* Controls only for video */}
        {isVideo && (
          <div className="video-controls" onClick={(e) => e.stopPropagation()}>
            <div className="seek-bar-container">
              <button onClick={togglePlay} className="play-pause-btn">
                {isPlaying ? '⏸️' : '▶️'}
              </button>
              
              <div 
                className="seek-bar"
                onClick={handleSeek}
                onMouseDown={handleSeekStart}
                onMouseUp={handleSeekEnd}
                onMouseLeave={handleSeekEnd}
              >
                <div className="seek-bar-background">
                  <div 
                    className="seek-bar-progress"
                    style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                  />
                  <div 
                    className="seek-bar-handle"
                    style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
            
            <div className="bottom-controls">
              <div className="time-display">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
              
              <div className="volume-control">
                <button onClick={toggleMute} className="volume-btn">
                  {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
                </button>
                <input
                  type="range"
                  className="volume-slider"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={handleVolumeChange}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HighlightSection;
