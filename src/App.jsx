import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import VideoMasonry from './components/VideoMasonry';
// Header removed from layout; info moved into SettingsPanel toolbar
import SettingsPanel from './components/SettingsPanel';
import FloatingToggle from './components/FloatingToggle';
import FloatingMusicButton from './components/FloatingMusicButton';
import FloatingShuffleButton from './components/FloatingShuffleButton';
import HighlightSection from './components/HighlightSection';
import MusicPlayer from './components/MusicPlayer';
import './App.css';

const App = () => {
  // Video state
  const [videos, setVideos] = useState([]);
  const [images, setImages] = useState([]);
  const [videoFolder, setVideoFolder] = useState('/videos/');
  const [imageFolder, setImageFolder] = useState('/images/');

  // UI state
  const [controlsCollapsed, setControlsCollapsed] = useState(true);
  const [highlightModeEnabled, setHighlightModeEnabled] = useState(false);
  const [highlightedVideo, setHighlightedVideo] = useState(null);
  const [lockedVideo, setLockedVideo] = useState(null);

  // Settings state
  const [settings, setSettings] = useState({
    gridSize: 260,
    autoplay: true,
    autoScroll: true,
    highlightMode: false,
    scrollSpeed: 3,
    isMuted: true,
    displayMode: 'videos', // 'videos' | 'images' | 'mixed'
    overScanMultiplier: 2,
    selectedTags: []
  });

  // Status state
  const [status, setStatus] = useState({ message: 'Ready to load videos...', type: 'loading' });

  // Auto-scroll state
  const [autoScrollActive, setAutoScrollActive] = useState(false);
  const autoScrollIntervalRef = useRef(null);
  const mouseIdleTimeoutRef = useRef(null);

  // Music state
  const [musicTracks, setMusicTracks] = useState([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const musicRef = useRef(null);
  const [musicTime, setMusicTime] = useState(0);
  const [musicDuration, setMusicDuration] = useState(0);

  // Settings management constants
  const SETTINGS_KEY = 'videoViewerSettings';
  const defaultSettings = {
    gridSize: 260,
    autoplay: true,
    autoScroll: true,
    volume: 0.7,
    playbackRate: 1.0,
    musicEnabled: true,
    displayMode: 'videos',
    selectedTags: []
  };

  // Restore the saved track index after tracks are loaded
  const restoreTrackIndex = useCallback((tracks) => {
    if (tracks.length === 0) return;

    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.currentTrackIndex !== undefined) {
          const savedIndex = parseInt(parsed.currentTrackIndex);
          if (savedIndex >= 0 && savedIndex < tracks.length) {
            console.log(`Restoring valid track index: ${savedIndex} (of ${tracks.length} tracks) - saved track: ${tracks[savedIndex]?.filename}`);
            setCurrentTrackIndex(savedIndex);
            return;
          } else {
            console.log(`Invalid saved track index ${savedIndex}, resetting to 0`);
          }
        }
      }
      console.log('No valid saved track index found, using default: 0');
      setCurrentTrackIndex(0);
    } catch (error) {
      console.error('Error parsing saved track index:', error);
      setCurrentTrackIndex(0);
    }
  }, []);

  // Auto-load videos on component mount
  useEffect(() => {
    autoLoadVideos();
    autoLoadImages();
    loadSettings();
    loadMusicTracks(); // This will now handle track restoration internally
  }, []);

  // Additional effect to restore track index when musicTracks changes (fallback)
  useEffect(() => {
    if (musicTracks.length > 0) {
      // Check if we need to restore from localStorage 
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const savedIndex = parseInt(parsed.currentTrackIndex);
          // Only restore if current index is 0 and saved index is different and valid
          if (currentTrackIndex === 0 && savedIndex > 0 && savedIndex < musicTracks.length) {
            console.log('Fallback restoration of track index:', savedIndex);
            setCurrentTrackIndex(savedIndex);
          }
        } catch (error) {
          console.error('Error in fallback track restoration:', error);
        }
      }
    }
  }, [musicTracks]);

  // Ensure track index is restored when music becomes enabled  
  useEffect(() => {
    if (musicEnabled && musicTracks.length > 0 && currentTrackIndex === 0) {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const savedIndex = parseInt(parsed.currentTrackIndex);
          if (!isNaN(savedIndex) && savedIndex > 0 && savedIndex < musicTracks.length) {
            console.log('Restoring track index when music enabled:', savedIndex);
            setCurrentTrackIndex(savedIndex);
          }
        } catch (error) {
          console.error('Error restoring track index when music enabled:', error);
        }
      }
    }
  }, [musicEnabled, musicTracks.length, currentTrackIndex]);

  // Helper function to save settings with current state values
  const saveCurrentSettings = useCallback((overrides = {}) => {
    const settingsToSave = {
      ...settings,
      controlsCollapsed,
      highlightMode: highlightModeEnabled,
      musicEnabled,
      currentTrackIndex,
      ...overrides // Allow specific overrides
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsToSave));
    console.log('💾 Settings saved with track index:', settingsToSave.currentTrackIndex);
    return settingsToSave;
  }, [settings, controlsCollapsed, highlightModeEnabled, musicEnabled, currentTrackIndex]);

  const saveSettings = useCallback(() => {
    return saveCurrentSettings();
  }, [saveCurrentSettings]);

  const loadSettings = useCallback(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      console.log('Loading settings from localStorage:', saved);
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('Parsed settings:', parsed);
        setSettings(prev => ({ ...prev, ...parsed }));

        // Always default to collapsed unless explicitly set to false
        if (parsed.controlsCollapsed === false) {
          console.log('Setting controlsCollapsed to false (from saved settings)');
          setControlsCollapsed(false);
        } else {
          console.log('Setting controlsCollapsed to true (default)');
          setControlsCollapsed(true);
        }

        setHighlightModeEnabled(parsed.highlightMode || false);
        setMusicEnabled(parsed.musicEnabled !== undefined ? parsed.musicEnabled : true);
      } else {
        console.log('No saved settings found, using defaults');
        setControlsCollapsed(true);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      setControlsCollapsed(true); // Default to collapsed on error
    }
  }, []);

  // Auto-load videos from server API
  const autoLoadVideos = async () => {
    try {
      setStatus({ message: '🔍 Auto-loading videos from server...', type: 'loading' });
      console.log('Attempting to fetch videos from /api/videos');

      const response = await fetch('/api/videos');
      console.log('Fetch response:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        //console.log('Received video data:', data);
        console.log('Number of videos:', data.videos?.length || 0);

        await testVideoConnectivity(data);
        loadVideosFromData(data);
        return true;
      } else {
        console.log('Server not available or no videos endpoint. Status:', response.status);
        setStatus({
          message: '⚠️ No video server detected. Please start the video server.',
          type: 'warning'
        });
      }
    } catch (error) {
      console.error('Failed to auto-load videos:', error);
      setStatus({
        message: `⚠️ Failed to load videos: ${error.message}`,
        type: 'warning'
      });
    }
    return false;
  };

  // Auto-load images from server API
  const autoLoadImages = async () => {
    try {
      const response = await fetch('/api/images');
      if (response.ok) {
        const data = await response.json();
        loadImagesFromData(data);
        return true;
      }
    } catch (e) {
      console.log('Failed to load images:', e.message);
    }
    return false;
  };

  // Test connectivity to video files
  const testVideoConnectivity = async (data) => {
    if (!data.videos || data.videos.length === 0) return;

    const baseFolder = data.folder || (data.folderName ? `/${data.folderName}/` : '/videos/');
    const testVideo = data.videos[0];
    const testUrl = baseFolder + testVideo.filename;

    // console.log('🔗 Testing video connectivity...');
    // console.log('   Test URL:', testUrl);

    try {
      const response = await fetch(testUrl, { method: 'HEAD' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      //console.log('✅ Video connectivity test passed');
    } catch (error) {
      console.warn('⚠️ Video connectivity test failed:', error.message);
      console.warn('   This may indicate server issues or missing video files');
    }
  };

  // Load videos from API data
  const loadVideosFromData = (data) => {
    //console.log('Loading videos from data:', data);

    if (!data.videos || !Array.isArray(data.videos)) {
      console.error('Invalid data format. Expected {videos: [...]}');
      setStatus({ message: '❌ Invalid API response format. Expected {videos: [...]}', type: 'error' });
      return;
    }

    //console.log('Setting videos state with', data.videos.length, 'videos');
    setVideos(data.videos);

    const folder = data.folder || (data.folderName ? `/${data.folderName}/` : '/videos/');
    setVideoFolder(folder);
    const generated = data.generated ? new Date(data.generated).toLocaleString() : 'unknown';
    const scanPath = data.scan_path ? ` (from ${data.scan_path})` : '';

    setStatus({
      message: `✅ Loaded ${data.videos.length} videos${scanPath}`,
      type: 'success'
    });

    //console.log(`📺 Loaded ${data.videos.length} videos from ${folder} (generated: ${generated})`);
  };

  // Load images from API data
  const loadImagesFromData = (data) => {
    if (!data.images || !Array.isArray(data.images)) {
      console.warn('No images found in API response');
      return;
    }
    setImages(data.images);
    const folder = data.folder || '/images/';
    setImageFolder(folder);
  };

  // Load music tracks
  const loadMusicTracks = async () => {
    try {
      const response = await fetch('/api/music');
      if (response.ok) {
        const data = await response.json();
        const tracks = data.tracks || [];
        setMusicTracks(tracks);
        console.log(`🎵 Loaded ${tracks.length} music tracks`);

        // Immediately restore track index after setting tracks
        if (tracks.length > 0) {
          restoreTrackIndex(tracks);
        }

        return tracks;
      }
    } catch (error) {
      console.log('No music tracks available:', error.message);
    }
    return [];
  };

  // Video control functions (simplified - no state tracking)
  const updateSetting = useCallback((key, value) => {
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value };
      // Save settings immediately when changed using current state
      setTimeout(() => {
        saveCurrentSettings({ [key]: value });
      }, 0);
      return newSettings;
    });
  }, [saveCurrentSettings]);

  // Control functions
  const playAll = () => {
    document.querySelectorAll('video').forEach(video => {
      video.play().catch(e => console.log('Play failed:', e));
    });
  };

  const pauseAll = () => {
    document.querySelectorAll('video').forEach(video => video.pause());
  };

  const toggleMuteAll = () => {
    const newMuted = !settings.isMuted;
    updateSetting('isMuted', newMuted);
    document.querySelectorAll('video').forEach(video => {
      video.muted = newMuted;
    });
  };

  const reloadVideos = () => {
    autoLoadVideos();
    autoLoadImages();
  };

  // Highlight functions
  const highlightVideo = useCallback((videoIndex, isLocked = false) => {
    if (isLocked) {
      // Handle click/lock logic - use functional state updates to avoid dependency on lockedVideo
      setLockedVideo(currentLocked => {
        if (currentLocked === videoIndex) {
          // Clicking on already locked video - unlock it
          setHighlightedVideo(null);
          return null;
        } else {
          // Lock this video
          setHighlightedVideo(videoIndex);
          return videoIndex;
        }
      });
    } else {
      // Handle hover logic - only update if no video is locked
      setLockedVideo(currentLocked => {
        if (currentLocked === null) {
          setHighlightedVideo(videoIndex);
        }
        return currentLocked; // Don't change locked state
      });
    }
  }, []); // Remove lockedVideo dependency to prevent re-creation

  const clearHighlight = useCallback(() => {
    setHighlightedVideo(null);
    setLockedVideo(null);
  }, []);

  // Music control functions
  const toggleMusicPlayPause = useCallback(() => {
    if (!musicRef.current) return;

    if (musicPlaying) {
      musicRef.current.pause();
      setMusicPlaying(false);
    } else {
      // Try to play, handle autoplay restrictions
      musicRef.current.play().then(() => {
        setMusicPlaying(true);
        // Save the current track index when music starts playing
        setTimeout(() => {
          saveCurrentSettings();
        }, 0);
      }).catch(e => {
        console.warn('Music autoplay blocked:', e.message);
        setMusicPlaying(false);
      });
    }
  }, [musicPlaying, settings, controlsCollapsed, highlightModeEnabled, musicEnabled, currentTrackIndex]);

  const handleMusicTrackChange = useCallback((newIndex) => {
    console.log(`🎵 Track change: ${currentTrackIndex} → ${newIndex}`);
    setCurrentTrackIndex(newIndex);
    // Save the track change to localStorage with the new index
    setTimeout(() => {
      saveCurrentSettings({ currentTrackIndex: newIndex });
    }, 0);
  }, [saveCurrentSettings]);

  const handleSeek = useCallback((newTimeSec) => {
    const el = musicRef.current;
    if (!el || !Number.isFinite(newTimeSec)) return;
    try {
      el.currentTime = Math.max(0, Math.min(newTimeSec, isFinite(el.duration) ? el.duration : newTimeSec));
      setMusicTime(el.currentTime);
    } catch (e) {
      console.warn('Seek failed:', e?.message || e);
    }
  }, []);

  // Function to clear localStorage and reset to defaults
  const resetToDefaults = useCallback(() => {
    localStorage.removeItem(SETTINGS_KEY);
    setSettings(defaultSettings);
    setControlsCollapsed(true);
    setHighlightModeEnabled(false);
    setMusicEnabled(true);
    console.log('Settings reset to defaults');
  }, []);

  // Function to toggle controls and save settings
  const toggleControls = useCallback(() => {
    const newCollapsedState = !controlsCollapsed;
    setControlsCollapsed(newCollapsedState);

    console.log('Controls toggled to:', newCollapsedState ? 'collapsed' : 'expanded');

    // Save settings immediately with the new collapsed state
    setTimeout(() => {
      saveCurrentSettings({ controlsCollapsed: newCollapsedState });
    }, 0);
  }, [controlsCollapsed, saveCurrentSettings]);

  // Function to shuffle media arrays based on current display mode
  const shuffleMedia = useCallback(() => {
    const shuffle = (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    if (settings.displayMode === 'images') {
      if (images.length <= 1) return;
      setImages(prev => shuffle(prev));
      console.log('Images shuffled!', images.length);
    } else if (settings.displayMode === 'videos') {
      if (videos.length <= 1) return;
      setVideos(prev => shuffle(prev));
      console.log('Videos shuffled!', videos.length);
    } else {
      // mixed: shuffle both independently to keep the interleave logic simple
      if (videos.length > 1) setVideos(prev => shuffle(prev));
      if (images.length > 1) setImages(prev => shuffle(prev));
      console.log('Media shuffled! videos:', videos.length, 'images:', images.length);
    }

    // Clear any locked/highlighted video since indices will change
    setHighlightedVideo(null);
    setLockedVideo(null);
  }, [settings.displayMode, videos.length, images.length]);

  // Build the list of currently displayed items for highlight panel
  const displayItems = useMemo(() => {
    const vids = filterByTags(videos, settings.selectedTags).map(v => ({ ...v, type: 'video' }));
    const imgs = filterByTags(images, settings.selectedTags).map(i => ({ ...i, type: 'image' }));
    if (settings.displayMode === 'images') return imgs;
    if (settings.displayMode === 'mixed') {
      const merged = [];
      const maxLen = Math.max(vids.length, imgs.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < vids.length) merged.push(vids[i]);
        if (i < imgs.length) merged.push(imgs[i]);
      }
      return merged;
    }
    return vids;
  }, [videos, images, settings.displayMode, settings.selectedTags]);

  // Derive filtered lists once for render decisions
  const filteredVideos = useMemo(() => filterByTags(videos, settings.selectedTags), [videos, settings.selectedTags]);
  const filteredImages = useMemo(() => filterByTags(images, settings.selectedTags), [images, settings.selectedTags]);
  const shuffleVisibleCount = useMemo(() => {
    if (settings.displayMode === 'images') return filteredImages.length;
    if (settings.displayMode === 'videos') return filteredVideos.length;
    return filteredImages.length + filteredVideos.length;
  }, [settings.displayMode, filteredImages.length, filteredVideos.length]);

  return (
    <div className="app">
      <FloatingToggle
        collapsed={controlsCollapsed}
        onToggle={toggleControls}
      />

      <FloatingMusicButton
        visible={musicEnabled && !musicPlaying && musicTracks.length > 0}
        onPlay={toggleMusicPlayPause}
      />

      <FloatingShuffleButton
        visible={shuffleVisibleCount > 1}
        onShuffle={shuffleMedia}
      />

      <div className={`header-controls-area ${controlsCollapsed ? 'collapsed' : ''}`}>
        <SettingsPanel
          settings={settings}
          onUpdateSetting={updateSetting}
          onPlayAll={playAll}
          onPauseAll={pauseAll}
          onToggleMuteAll={toggleMuteAll}
          onReloadVideos={reloadVideos}
          highlightModeEnabled={highlightModeEnabled}
          onToggleHighlightMode={(enabled) => {
            setHighlightModeEnabled(enabled);
            if (!enabled) clearHighlight();
          }}
          // Media mode and tags
          availableTags={Array.from(new Set([
            ...videos.flatMap(v => (v.tags || [])),
            ...images.flatMap(i => (i.tags || []))
          ])).sort()}
          musicTracks={musicTracks}
          currentTrackIndex={currentTrackIndex}
          musicEnabled={musicEnabled}
          musicPlaying={musicPlaying}
          musicTime={musicTime}
          musicDuration={musicDuration}
          onSeek={handleSeek}
          onToggleMusic={() => {
            setMusicEnabled(!musicEnabled);
            // Save settings when toggling music
            setTimeout(() => saveSettings(), 0);
          }}
          onToggleMusicPlayPause={toggleMusicPlayPause}
          onNextTrack={() => handleMusicTrackChange((currentTrackIndex + 1) % musicTracks.length)}
          onPreviousTrack={() => handleMusicTrackChange(currentTrackIndex === 0 ? musicTracks.length - 1 : currentTrackIndex - 1)}
          onResetDefaults={resetToDefaults}
          status={status}
          videoCount={videos.length}
          imageCount={images.length}
        />
      </div>

      <div className={`scrollable-content ${controlsCollapsed ? 'fullscreen' : ''}`}>
        <div className={`main-video-area ${highlightModeEnabled ? 'with-highlight' : ''}`}>
          {settings.displayMode === 'images' && filterByTags(images, settings.selectedTags).length === 0 ? (
            <div className="video-masonry-empty" style={{ padding: 20, color: '#9aa' }}>
              No images match the current filters.
            </div>
          ) : (
            <VideoMasonry
              key={`vm-${settings.displayMode}-${settings.selectedTags.join(',')}-${videos.length}-${images.length}`}
              videos={filteredVideos}
              images={filteredImages}
              mode={settings.displayMode}
              videoFolder={videoFolder}
              imageFolder={imageFolder}
              settings={settings}
              highlightModeEnabled={highlightModeEnabled}
              controlsCollapsed={controlsCollapsed}
              onHighlightVideo={highlightVideo}
              totalVideosCount={videos.length}
              totalImagesCount={images.length}
            />
          )}
        </div>

        {highlightModeEnabled && (
          <div className="highlight-side-area">
            <HighlightSection
              items={displayItems}
              videoFolder={videoFolder}
              imageFolder={imageFolder}
              highlightedVideo={highlightedVideo}
              lockedVideo={lockedVideo}
              onClearHighlight={clearHighlight}
            />
          </div>
        )}
      </div>

      <MusicPlayer
        tracks={musicTracks}
        currentTrackIndex={currentTrackIndex}
        enabled={musicEnabled}
        playing={musicPlaying}
        onTrackChange={handleMusicTrackChange}
        onPlayingChange={setMusicPlaying}
        onTimeUpdate={setMusicTime}
        onDurationChange={setMusicDuration}
        musicRef={musicRef}
        hidden={true}
      />
    </div>
  );
};

// Simple tag filtering helper
function filterByTags(items, selectedTags) {
  if (!selectedTags || selectedTags.length === 0) return items;
  return (items || []).filter(item => {
    const tags = new Set([...(item.tags || []), ...((item.metadata && item.metadata.tags) || [])]);
    // OR logic: include item if it has any of the selected tags
    return selectedTags.some(t => tags.has(t));
  });
}

export default App;
