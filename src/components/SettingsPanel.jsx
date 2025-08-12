import React, { useMemo, useState } from 'react';
import './SettingsPanel.css';

// A compact, modern settings panel with tabs
const SettingsPanel = ({
  settings,
  onUpdateSetting,
  onPlayAll,
  onPauseAll,
  onToggleMuteAll,
  onReloadVideos,
  highlightModeEnabled,
  onToggleHighlightMode,
  availableTags = [],
  musicTracks = [],
  currentTrackIndex = 0,
  musicEnabled = false,
  musicPlaying = false,
  musicTime = 0,
  musicDuration = 0,
  onSeek,
  onToggleMusic,
  onToggleMusicPlayPause,
  onNextTrack,
  onPreviousTrack,
  onResetDefaults,
  status,
  videoCount,
  imageCount
}) => {
  const [activeTab, setActiveTab] = useState('basic'); // basic | filters | music | advanced
  const [tagQuery, setTagQuery] = useState('');

  const filteredTags = useMemo(() => {
    if (!tagQuery.trim()) return availableTags;
    const q = tagQuery.toLowerCase();
    return availableTags.filter(t => t.toLowerCase().includes(q));
  }, [availableTags, tagQuery]);

  const toggleTag = (tag) => {
    const current = new Set(settings.selectedTags || []);
    if (current.has(tag)) current.delete(tag); else current.add(tag);
    onUpdateSetting('selectedTags', Array.from(current));
  };

  const allTagsSelected = (settings.selectedTags || []).length === availableTags.length && availableTags.length > 0;

  const toolbar = (
    <div className="sp-toolbar">
      <div className="brand" title="Video Grid Viewer">📹 <span>Video Wall</span></div>
      <button className="icon-btn" title="Play all" onClick={onPlayAll}>▶️</button>
      <button className="icon-btn" title="Pause all" onClick={onPauseAll}>⏸️</button>
      <button className="icon-btn" title="Toggle mute" onClick={onToggleMuteAll}>{settings.isMuted ? '🔇' : '🔊'}</button>
      <span className="sp-divider" />
      <button className="icon-btn" title="Reload media" onClick={onReloadVideos}>🔄</button>

      <div className="sp-grow" />

      <nav className="sp-tabs" role="tablist" aria-label="Settings Tabs">
        {['basic','filters','music','advanced'].map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={activeTab === t}
            className={`sp-tab ${activeTab === t ? 'active' : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {t === 'basic' && 'Basics'}
            {t === 'filters' && 'Filters'}
            {t === 'music' && 'Music'}
            {t === 'advanced' && 'Advanced'}
          </button>
        ))}
      </nav>

      <div className="sp-grow" />
      <div className="counts" aria-label="Media counts">
        {typeof videoCount === 'number' && <span className="badge">Videos: {videoCount}</span>}
        {typeof imageCount === 'number' && <span className="badge">Images: {imageCount}</span>}
      </div>
      {status && (
        <div className={`status-pill ${status.type || 'loading'}`} title={status.message}>{status.message}</div>
      )}
    </div>
  );

  return (
    <div className="settings-panel">
      {toolbar}

      {activeTab === 'basic' && (
        <section className="sp-section">
          <div className="row">
            <div className="field">
              <label>Grid & scroll</label>
              <div className="range-row">
                <span className="mini">Grid</span>
                <input type="range" min="120" max="1500" value={settings.gridSize}
                  onChange={(e) => onUpdateSetting('gridSize', parseInt(e.target.value))} />
                <span className="value">{settings.gridSize}px</span>
              </div>
              <div className="range-row">
                <span className="mini">Speed</span>
                <input type="range" min="0.2" max="10" step="0.2" value={settings.scrollSpeed}
                  onChange={(e) => onUpdateSetting('scrollSpeed', parseFloat(e.target.value))} />
                <span className="value">{settings.scrollSpeed}x</span>
              </div>
            </div>

            <div className="field">
              <label>Display</label>
              <div className="segmented">
                {['videos','images','mixed'].map(mode => (
                  <button
                    key={mode}
                    className={`seg ${settings.displayMode === mode ? 'active' : ''}`}
                    onClick={() => onUpdateSetting('displayMode', mode)}
                  >{mode[0].toUpperCase()+mode.slice(1)}</button>
                ))}
              </div>
            </div>

            <div className="field switches">
              <label>Behavior</label>
              <div className="switch-row">
                <label className="switch"><input type="checkbox" checked={settings.autoplay} onChange={(e)=>onUpdateSetting('autoplay', e.target.checked)} /><span>Autoplay new</span></label>
                <label className="switch"><input type="checkbox" checked={settings.autoScroll} onChange={(e)=>onUpdateSetting('autoScroll', e.target.checked)} /><span>Auto-scroll</span></label>
                <label className="switch"><input type="checkbox" checked={highlightModeEnabled} onChange={(e)=>onToggleHighlightMode(e.target.checked)} /><span>Highlight mode</span></label>
              </div>
            </div>

            {/* Scroll speed merged with grid size above */}
          </div>
        </section>
      )}

      {activeTab === 'filters' && (
        <section className="sp-section">
          <div className="row">
            <div className="field">
              <label>Search tags</label>
              <input className="text" placeholder="Type to filter tags…" value={tagQuery} onChange={(e)=>setTagQuery(e.target.value)} />
            </div>
            <div className="field">
              <div className="chips" role="group" aria-label="Tag filters">
                {filteredTags.length === 0 && <div className="empty">No tags</div>}
                {filteredTags.map(tag => {
                  const active = (settings.selectedTags || []).includes(tag);
                  return (
                    <button key={tag} className={`chip ${active ? 'active' : ''}`} onClick={() => toggleTag(tag)}>{tag}</button>
                  );
                })}
              </div>
              {availableTags.length > 0 && (
                <div className="chip-actions">
                  <button className="ghost" onClick={() => onUpdateSetting('selectedTags', [])}>Clear</button>
                  <button className="ghost" disabled={allTagsSelected} onClick={() => onUpdateSetting('selectedTags', availableTags)}>Select all</button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'music' && musicTracks.length > 0 && (
        <section className="sp-section">
          <div className="row">
            <div className="field switches">
              <label>Music</label>
              <div className="switch-row">
                <label className="switch"><input type="checkbox" checked={musicEnabled} onChange={onToggleMusic} /><span>Enabled</span></label>
              </div>
            </div>

            {musicEnabled && (
              <div className="field full">
                <div className="music-row">
                  <div className="track">{musicTracks[currentTrackIndex]?.filename || 'No track'}</div>
                  <div className="controls">
                    <button className="icon-btn" title="Previous" onClick={onPreviousTrack}>⏮️</button>
                    <button className="icon-btn" title="Play/Pause" onClick={onToggleMusicPlayPause}>{musicPlaying ? '⏸️' : '▶️'}</button>
                    <button className="icon-btn" title="Next" onClick={onNextTrack}>⏭️</button>
                    <div className="count">{currentTrackIndex + 1} / {musicTracks.length}</div>
                  </div>
                </div>
                <div className="music-seek">
                  <input
                    type="range"
                    min="0"
                    max={Math.max(1, Math.floor((Number.isFinite(musicDuration) && musicDuration > 0)
                      ? musicDuration
                      : ((Number.isFinite(musicTime) && musicTime > 0) ? musicTime : 1)))}
                    step="1"
                    value={(() => {
                      const maxVal = Math.max(1, Math.floor((Number.isFinite(musicDuration) && musicDuration > 0)
                        ? musicDuration
                        : ((Number.isFinite(musicTime) && musicTime > 0) ? musicTime : 1)));
                      const cur = Math.floor(Number.isFinite(musicTime) ? musicTime : 0);
                      return Math.max(0, Math.min(cur, maxVal));
                    })()}
                    onInput={(e) => onSeek && onSeek(parseInt(e.target.value, 10))}
                  />
                  <div className="time-readout">
                    <span>{formatTime(musicTime)}</span>
                    <span> / </span>
                    <span>{(Number.isFinite(musicDuration) && musicDuration > 0) ? formatTime(musicDuration) : formatTime(musicTime)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'advanced' && (
        <section className="sp-section">
          <div className="row">
            <div className="field">
              <label>Overscan</label>
              <div className="range-row">
                <input type="range" min="0.5" max="4" step="0.1" value={settings.overScanMultiplier || 1.5}
                  onChange={(e) => onUpdateSetting('overScanMultiplier', parseFloat(e.target.value))} />
                <span className="value">{(settings.overScanMultiplier || 1.5)}x</span>
              </div>
            </div>
            {onResetDefaults && (
              <div className="field">
                <label> </label>
                <button className="danger" onClick={onResetDefaults}>Reset settings</button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default SettingsPanel;

// helpers
function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  const m = Math.floor(sec / 60);
  return `${m}:${s}`;
}
