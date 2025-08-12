import React from 'react';
import './Controls.css';

const Controls = ({
  settings,
  onUpdateSetting,
  onPlayAll,
  onPauseAll,
  onToggleMuteAll,
  onReloadVideos,
  highlightModeEnabled,
  onToggleHighlightMode,
  availableTags = [],
  musicTracks,
  currentTrackIndex,
  musicEnabled,
  musicPlaying,
  onToggleMusic,
  onToggleMusicPlayPause,
  onNextTrack,
  onPreviousTrack
}) => {
  return (
    <div className="controls">
      <div className="controls-content">
        <div className="control-group">
          <button onClick={onPlayAll}>▶️ Play All</button>
          <button onClick={onPauseAll}>⏸️ Pause All</button>
          <button onClick={onToggleMuteAll}>
            {settings.isMuted ? '🔇' : '🔊'} Toggle Mute
          </button>
          <button onClick={onReloadVideos}>🔄 Reload</button>
        </div>

        <div className="control-group">
          <label>
            Grid Size:
            <input 
              type="range"
              min="120" 
              max="1500"
              value={settings.gridSize}
              onChange={(e) => onUpdateSetting('gridSize', parseInt(e.target.value))}
            />
            <span>{settings.gridSize}px</span>
          </label>
        </div>

        <div className="control-group">
          <label>
            <input 
              type="checkbox" 
              checked={settings.autoplay}
              onChange={(e) => onUpdateSetting('autoplay', e.target.checked)}
            />
            Auto-play new videos
          </label>

          <label>
            <input 
              type="checkbox" 
              checked={settings.autoScroll}
              onChange={(e) => onUpdateSetting('autoScroll', e.target.checked)}
            />
            Auto-scroll when idle
          </label>

          <label>
            <input 
              type="checkbox" 
              checked={highlightModeEnabled}
              onChange={(e) => onToggleHighlightMode(e.target.checked)}
            />
            Highlight Mode (hover preview)
          </label>
        </div>

        <div className="control-group">
          <label>
            Display:
            <select
              value={settings.displayMode || 'videos'}
              onChange={(e) => onUpdateSetting('displayMode', e.target.value)}
              style={{ marginLeft: 8 }}
            >
              <option value="videos">Videos</option>
              <option value="images">Images</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
        </div>

        {availableTags.length > 0 && (
          <div className="control-group" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ marginRight: 8 }}>Tags:</span>
            {availableTags.map(tag => (
              <label key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={(settings.selectedTags || []).includes(tag)}
                  onChange={(e) => {
                    const current = new Set(settings.selectedTags || []);
                    if (e.target.checked) current.add(tag); else current.delete(tag);
                    onUpdateSetting('selectedTags', Array.from(current));
                  }}
                />
                <span>{tag}</span>
              </label>
            ))}
            {availableTags.length === 0 && <span style={{ opacity: 0.7 }}>No tags</span>}
          </div>
        )}

        <div className="control-group">
          <label>
            Scroll Speed:
            <input 
              type="range" 
              min="1" 
              max="10" 
              value={settings.scrollSpeed}
              onChange={(e) => onUpdateSetting('scrollSpeed', parseInt(e.target.value))}
            />
            <span>{settings.scrollSpeed}x</span>
          </label>
        </div>

        {musicTracks.length > 0 && (
          <div className="music-player control-group">
            <button onClick={onToggleMusic}>
              {musicEnabled ? '🔇 Stop Music' : '🎵 Music'}
            </button>
            {musicEnabled && (
              <>
                <button onClick={onPreviousTrack}>⏮️</button>
                <button onClick={onToggleMusicPlayPause}>
                  {musicPlaying ? '⏸️ Pause' : '▶️ Play'}
                </button>
                <button onClick={onNextTrack}>⏭️</button>
                <span className="music-status">
                  {musicTracks[currentTrackIndex]?.filename || 'No track'}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Controls;
