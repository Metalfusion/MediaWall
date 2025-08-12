import React, { useRef, useEffect, useState, useCallback } from 'react';
import './MusicPlayer.css';

const MusicPlayer = ({
  tracks,
  currentTrackIndex,
  enabled,
  playing,
  onTrackChange,
  onPlayingChange,
  onTimeUpdate, // (seconds)
  onDurationChange, // (seconds)
  musicRef,
  hidden = false
}) => {
  const [status, setStatus] = useState('Ready');
  const autoPlayNextRef = useRef(false); // when true, auto-play after loading next track
  const endingRef = useRef(false); // used to ignore pause events caused by natural end
  // Refs to avoid stale closures in event listeners
  const currentIndexRef = useRef(currentTrackIndex);
  const tracksRef = useRef(tracks);
  const onTrackChangeRef = useRef(onTrackChange);
  const enabledRef = useRef(enabled);
  const playingRef = useRef(playing);
  const triedDurationFixRef = useRef(false);
  const lastEmitMsRef = useRef(0);

  // Debug: log when currentTrackIndex changes
  useEffect(() => {
    console.log(`🎵 MusicPlayer received currentTrackIndex: ${currentTrackIndex} (tracks: ${tracks.length})`);
  }, [currentTrackIndex, tracks.length]);

  // Keep refs up to date with latest props
  useEffect(() => { currentIndexRef.current = currentTrackIndex; }, [currentTrackIndex]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { onTrackChangeRef.current = onTrackChange; }, [onTrackChange]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  // Define track control functions first with useCallback for stable references
  const nextTrack = useCallback(() => {
    if (tracks.length === 0) return;
    const nextIndex = (currentTrackIndex + 1) % tracks.length;
    console.log(`Moving to next track: ${nextIndex}`);
    onTrackChange(nextIndex);
  }, [tracks.length, currentTrackIndex, onTrackChange]);

  const previousTrack = useCallback(() => {
    if (tracks.length === 0) return;
    const prevIndex = currentTrackIndex === 0 ? tracks.length - 1 : currentTrackIndex - 1;
    onTrackChange(prevIndex);
  }, [tracks.length, currentTrackIndex, onTrackChange]);

  useEffect(() => {
    // Wait for the <audio> element to mount
    if (!musicRef.current) {
      return;
    }
    musicRef.current.volume = 0.3;
    musicRef.current.preload = 'auto';

    const handleEnded = () => {
      console.log('Track ended, computing next track');
      // Mark that we should keep playing on the next track
      endingRef.current = true;
      autoPlayNextRef.current = true;
      const total = tracksRef.current.length;
      if (total > 0) {
        const nextIndex = (currentIndexRef.current + 1) % total;
        console.log(`Advancing to next track index: ${nextIndex}`);
        onTrackChangeRef.current(nextIndex);
      }
    };

    const handleError = (e) => {
      console.error('Music playback error', e);
      setStatus('Error');
      autoPlayNextRef.current = true;
      const total = tracksRef.current.length;
      if (total > 0) {
        const nextIndex = (currentIndexRef.current + 1) % total;
        console.log(`Error encountered, skipping to track index: ${nextIndex}`);
        onTrackChangeRef.current(nextIndex);
      }
    };

    const handleLoadStart = () => {
      setStatus('Loading...');
    };

    const handleCanPlay = () => {
      setStatus('Ready');
      // Emit latest duration/time so UI updates immediately
      if (onDurationChange && musicRef.current) {
        let d = Number.isFinite(musicRef.current.duration) ? musicRef.current.duration : 0;
        onDurationChange(d);
      }
      if (onTimeUpdate && musicRef.current) {
        onTimeUpdate(musicRef.current.currentTime || 0);
      }
      // Attempt duration resolution fallback if needed
      if (musicRef.current && (!Number.isFinite(musicRef.current.duration) || musicRef.current.duration <= 0)) {
        tryResolveDurationFallback();
      }
      if ((enabledRef.current && (autoPlayNextRef.current || playingRef.current)) && musicRef.current) {
        const el = musicRef.current;
        el.play().then(() => {
          autoPlayNextRef.current = false;
          console.log('Auto-play started after canplay');
        }).catch(e => {
          console.warn('Autoplay after canplay failed:', e?.message || e);
        });
      }
    };

    const handleCanPlayThrough = () => {
      // Similar to canplay but often fires when enough data is buffered
      if (onDurationChange && musicRef.current) {
        let d = Number.isFinite(musicRef.current.duration) ? musicRef.current.duration : 0;
        onDurationChange(d);
      }
      if (onTimeUpdate && musicRef.current) {
        onTimeUpdate(musicRef.current.currentTime || 0);
      }
      if (musicRef.current && (!Number.isFinite(musicRef.current.duration) || musicRef.current.duration <= 0)) {
        tryResolveDurationFallback();
      }
    };

    const handlePlaying = () => {
      onPlayingChange(true);
      setStatus('Playing');
    };

    const handlePause = () => {
      if (endingRef.current) {
        // Clear the flag so subsequent pauses are handled normally
        endingRef.current = false;
        return;
      }
      onPlayingChange(false);
      setStatus('Paused');
    };

    const handleTimeUpdate = () => {
      if (onTimeUpdate && musicRef.current) {
        const now = Date.now();
        if (now - lastEmitMsRef.current > 250) {
          lastEmitMsRef.current = now;
          onTimeUpdate(musicRef.current.currentTime || 0);
        }
      }
    };

    const handleDurationChange = () => {
      if (onDurationChange && musicRef.current) {
        let d = Number.isFinite(musicRef.current.duration) ? musicRef.current.duration : 0;
        if ((!Number.isFinite(d) || d <= 0) && musicRef.current.seekable && musicRef.current.seekable.length > 0) {
          try {
            d = musicRef.current.seekable.end(musicRef.current.seekable.length - 1);
          } catch { }
        }
        onDurationChange(d);
      }
    };
    const handleLoadedMetadata = () => {
      if (onDurationChange && musicRef.current) {
        let d = Number.isFinite(musicRef.current.duration) ? musicRef.current.duration : 0;
        if ((!Number.isFinite(d) || d <= 0) && musicRef.current.seekable && musicRef.current.seekable.length > 0) {
          try {
            d = musicRef.current.seekable.end(musicRef.current.seekable.length - 1);
          } catch { }
        }
        onDurationChange(d);
        if (!Number.isFinite(musicRef.current.duration) || musicRef.current.duration <= 0) {
          tryResolveDurationFallback();
        }
      }
    };

    // Duration fallback: seek to a large timestamp to coerce browsers to compute duration for MP3 streams
    const tryResolveDurationFallback = () => {
      const el = musicRef.current;
      if (!el || triedDurationFixRef.current) return;
      triedDurationFixRef.current = true;
      const prev = el.currentTime || 0;
      const onSeeked = () => {
        // Determine a reasonable duration value
        let d = Number.isFinite(el.duration) ? el.duration : 0;
        if ((!Number.isFinite(d) || d <= 0) && el.seekable && el.seekable.length > 0) {
          try {
            d = el.seekable.end(el.seekable.length - 1);
          } catch { }
        }
        if (onDurationChange) onDurationChange(d);
        // Restore previous position
        try {
          el.currentTime = prev;
        } catch { }
        el.removeEventListener('seeked', onSeeked);
      };
      try {
        el.addEventListener('seeked', onSeeked);
        el.currentTime = 1e9; // large time; browser clamps to duration
      } catch (e) {
        // If seeking not allowed yet, clear flag so we can retry later upon canplaythrough
        triedDurationFixRef.current = false;
      }
    };

    // Set up event listeners once
    musicRef.current.addEventListener('ended', handleEnded);
    musicRef.current.addEventListener('error', handleError);
    musicRef.current.addEventListener('loadstart', handleLoadStart);
    musicRef.current.addEventListener('canplay', handleCanPlay);
    musicRef.current.addEventListener('canplaythrough', handleCanPlayThrough);
    musicRef.current.addEventListener('playing', handlePlaying);
    musicRef.current.addEventListener('pause', handlePause);
    musicRef.current.addEventListener('timeupdate', handleTimeUpdate);
    musicRef.current.addEventListener('durationchange', handleDurationChange);
    musicRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);

    // Cleanup on unmount
    return () => {
      if (!musicRef.current) return;
      musicRef.current.removeEventListener('ended', handleEnded);
      musicRef.current.removeEventListener('error', handleError);
      musicRef.current.removeEventListener('loadstart', handleLoadStart);
      musicRef.current.removeEventListener('canplay', handleCanPlay);
      musicRef.current.removeEventListener('canplaythrough', handleCanPlayThrough);
      musicRef.current.removeEventListener('playing', handlePlaying);
      musicRef.current.removeEventListener('pause', handlePause);
      musicRef.current.removeEventListener('timeupdate', handleTimeUpdate);
      musicRef.current.removeEventListener('durationchange', handleDurationChange);
      musicRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicRef.current]);

  // Poll currentTime while playing as a fallback in case 'timeupdate' doesn't fire for detached Audio
  useEffect(() => {
    if (!playing || !musicRef.current) return;
    const id = setInterval(() => {
      if (onTimeUpdate && musicRef.current) {
        const now = Date.now();
        if (now - lastEmitMsRef.current > 250) {
          lastEmitMsRef.current = now;
          onTimeUpdate(musicRef.current.currentTime || 0);
        }
        // Manual end-of-track detection in case 'ended' doesn't fire
        const dur = musicRef.current.duration;
        const cur = musicRef.current.currentTime;
        if (enabledRef.current && playingRef.current && Number.isFinite(dur) && dur > 0 && cur >= dur - 0.25) {
          console.log('Manual end detected, advancing track');
          endingRef.current = true;
          autoPlayNextRef.current = true;
          const total = tracksRef.current.length;
          if (total > 0) {
            const nextIndex = (currentIndexRef.current + 1) % total;
            onTrackChangeRef.current(nextIndex);
          }
        }
      }
    }, 300);
    return () => clearInterval(id);
  }, [playing, onTimeUpdate, musicRef]);

  useEffect(() => {
    if (enabled && tracks.length > 0) {
      console.log('Detected track/index change, preparing current track');
      playCurrentTrack();
    } else if (!enabled && musicRef.current) {
      musicRef.current.pause();
      onPlayingChange(false);
      setStatus('Stopped');
    }
  }, [enabled, currentTrackIndex, tracks.length, musicRef, onPlayingChange]);

  // Handle external play/pause changes
  useEffect(() => {
    if (!musicRef.current) return;

    if (playing && musicRef.current.paused) {
      musicRef.current.play().catch(e => {
        console.error('Failed to play music:', e);
        setStatus('Failed to play');
        onPlayingChange(false);
      });
    } else if (!playing && !musicRef.current.paused) {
      musicRef.current.pause();
    }
  }, [playing, musicRef, onPlayingChange]);

  const playCurrentTrack = () => {
    if (!tracks.length || !musicRef.current) return;

    const track = tracks[currentTrackIndex];
    const baseFolder = track.folder || '/music/';
    const trackUrl = baseFolder + track.filename;

    console.log(`🎵 Preparing track ${currentTrackIndex}: ${track.filename}`);

    musicRef.current.pause();
    musicRef.current.src = trackUrl;
    musicRef.current.currentTime = 0;

    triedDurationFixRef.current = false;
    musicRef.current.load();
    // Emit initial zeroed time and known duration (if provided by API) to prime UI
    if (onTimeUpdate) onTimeUpdate(0);
    if (onDurationChange) {
      const known = typeof track.duration === 'number' ? track.duration : undefined;
      const d = Number.isFinite(musicRef.current.duration) ? musicRef.current.duration : (known || 0);
      onDurationChange(d);
    }

    // Auto-play if appropriate: when the global playing flag is true or we're continuing after end/error
    if (enabled && (playing || autoPlayNextRef.current)) {
      musicRef.current.play().then(() => {
        autoPlayNextRef.current = false;
        console.log('Auto-play started on track switch');
      }).catch(e => {
        console.warn('Autoplay on track switch failed:', e?.message || e);
      });
    } else {
      setStatus('Ready');
    }
  };

  // Always render a hidden audio element so events/duration work even when UI is hidden
  const audioEl = (
    <audio ref={musicRef} style={{ display: 'none' }} preload="auto" />
  );

  // Don't render UI if no tracks or if hidden, but keep audio mounted
  if (tracks.length === 0 || hidden) return audioEl;

  const currentTrack = tracks[currentTrackIndex];

  return (
    <div className={`music-player-widget ${enabled ? 'enabled' : 'disabled'}`}>
      {audioEl}
      <div className="music-info">
        <div className="track-name">
          🎵 {currentTrack?.filename || 'No track'}
        </div>
        <div className="music-status">
          {status}
        </div>
      </div>

      <div className="music-controls">
        <button onClick={previousTrack} disabled={!enabled}>⏮️</button>
        <button onClick={nextTrack} disabled={!enabled}>⏭️</button>
        <div className="track-counter">
          {currentTrackIndex + 1} / {tracks.length}
        </div>
      </div>
    </div>
  );
};

export default MusicPlayer;
