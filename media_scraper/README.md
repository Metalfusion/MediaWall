# Media Scraper Tools

A complete toolkit for downloading media (images and videos) from Imgur with unified indexing, persistent history, auto-scanning, and bulk operations.

## Overview

This toolkit consists of two main components:
1. **Unified Tampermonkey Script** (`downloader.js`) - Browser-based unified media indexing with persistent history
2. **Python Downloader** (`media_downloader.py`) - Bulk media downloading

## 🚀 Quick Start

### 1. Install Tampermonkey Script
- Install the Tampermonkey browser extension
- Add the `downloader.js` script to Tampermonkey
- Navigate to any Imgur page (gallery, user profile, etc.)

### 2. Generate Unified Index Files
The Tampermonkey script adds a streamlined control panel to Imgur pages with **unified media scanning**:

**Main Features:**
1. **🔍 Scan Current Page** - Finds all videos AND images in one scan
2. **⚡ Auto Toggle** - Automatically scans every 5 seconds for dynamic content
3. **📥 Download Index** - Saves unified `unified_media_index_YYYYMMDDTHHMMSS.json`
4. **🗑️ Clear Index History** - Resets persistent media history

**Persistent History:**
- All discovered media is permanently stored across page loads
- Counts never decrease unless manually cleared
- Perfect for infinite scroll and dynamic loading sites
- Deduplication ensures unique items only

### 3. Download Media Files
```bash
# Install Python dependencies
pip install aiohttp aiofiles

# Download from unified index (contains both videos and images)
python media_downloader.py unified_media_index_20250812T143022.json

# Custom options
python media_downloader.py --folder my_media --concurrent 10 unified_media_index.json
```

## 📋 Features

### Unified Tampermonkey Script Features
- ✅ **Unified Scanning**: Finds both videos and images in one operation
- ✅ **Auto-Scan Mode**: Automatically scans every 5 seconds for dynamic content
- ✅ **Persistent History**: Permanently stores all discovered media across sessions
- ✅ **True Deduplication**: Map-based storage ensures unique items only
- ✅ **Comprehensive Metadata**: Extracts title, score, dimensions, timestamps, etc.
- ✅ **Dynamic Content Support**: Perfect for infinite scroll and AJAX-loaded content
- ✅ **Single Index Export**: Unified JSON with both media types and mediaType tags
- ✅ **Configurable Output**: Single folder setting for streamlined organization
- ✅ **Real-time Stats**: Shows total accumulated videos, images, and history size
- ✅ **Browser Persistence**: History survives page refreshes and navigation

### Python Downloader Features  
- ✅ Downloads both videos and images from unified index files
- ✅ Automatic media type detection via `mediaType` field
- ✅ Async/parallel downloading for maximum speed
- ✅ Content-based deduplication using MD5 hashes
- ✅ Automatic retry on network failures
- ✅ Preserves original metadata in JSON files
- ✅ Progress tracking and detailed statistics
- ✅ Uses browser cookies and headers for authentication
- ✅ Smart filename generation with conflict resolution

## 📖 Usage Examples

### Basic Usage
```bash
# Auto-detect and use most recent unified index file
python media_downloader.py

# Specify unified index file explicitly
python media_downloader.py path/to/unified_media_index_20250812.json

# Show help
python media_downloader.py --help
```

### Advanced Options
```bash
# Custom download folder (for both videos and images)
python media_downloader.py --folder my_media_collection unified_index.json

# Increase concurrent downloads (faster but more resource intensive)
python media_downloader.py --concurrent 15 unified_index.json

# Add delay between requests (slower but more polite)
python media_downloader.py --delay 0.2 unified_index.json

# Reduce retry attempts
python media_downloader.py --retries 3 unified_index.json
```

### Auto-Scanning Workflow
1. **Enable Auto-Scan**: Click "⚡ Auto" button (turns orange when active)
2. **Browse Imgur**: Scroll, navigate, let content load dynamically
3. **Monitor Stats**: Watch real-time counts grow in the UI panel
4. **Download Anytime**: Export unified index with all accumulated media
5. **Disable When Done**: Click "⚡ ON" to stop auto-scanning

## 📁 File Structure

After running the tools, you'll have:

```
MediaWall/                    # Parent directory
├── media/                   # Unified media downloads (default folder)
│   ├── video1.mp4          # Videos with mediaType: 'video'
│   ├── video1.mp4_metadata.json
│   ├── image1.jpg          # Images with mediaType: 'image'  
│   ├── image1.jpg_metadata.json
│   └── .hash_index.json    # Deduplication tracking
└── media_scraper/          # Script directory
    ├── downloader.js              # Unified Tampermonkey script
    ├── media_downloader.py        # Python downloader
    └── README.md                 # This file
```

**Unified Index Structure:**
```json
{
  "generator": "Media Index Generator (Unified)",
  "version": "3.0",
  "stats": {
    "totalVideos": 45,
    "totalImages": 128,
    "totalMedia": 173,
    "historySize": 173
  },
  "media": [
    {"id": "abc123", "mediaType": "video", "videoUrl": "...", ...},
    {"id": "def456", "mediaType": "image", "imageUrl": "...", ...}
  ]
}
```

**Default Download Location:**
- Unified: `../media/` (parent directory of script)
- Custom: Use `--folder` parameter to override

## ⚙️ Configuration

### Unified Tampermonkey Script Settings
- **Output Folder**: Single folder configuration for all media types
- **Auto-Scan Toggle**: Enable/disable automatic scanning every 5 seconds  
- **Persistent History**: Automatically maintained across browser sessions
- **Clear History**: Reset accumulated media history when needed

### Python Downloader Settings
- **Concurrent Downloads**: Balance speed vs server load (default: 5, recommended: 10-15 for unified indices)
- **Retry Logic**: Handle temporary network issues (default: 5 retries)
- **Delay**: Add politeness delay between requests (default: 0.05s)

## 🔄 Deduplication

The system uses multiple advanced deduplication strategies:

1. **Browser-side Persistent History**: Map-based storage with media IDs prevents duplicate indexing across sessions
2. **Auto-scan Deduplication**: Same media seen multiple times only stored once in history
3. **Content-based**: Uses MD5 hashes to detect identical downloaded files
4. **Filename-based**: Automatically renames files to avoid overwrites

**History Behavior:**
- ✅ Media counts only increase when genuinely new items are found
- ✅ Rescanning the same page doesn't inflate counts
- ✅ History survives page navigation and browser restarts
- ✅ Perfect for dynamic sites with infinite scroll

## 📊 Statistics & Monitoring

The Python downloader provides detailed progress information:
- Real-time download progress
- Success/failure rates  
- Duplicate detection stats
- Error reporting and retry attempts
- Final summary with timing information

## 🛠️ Troubleshooting

### Common Issues

**"No index file found"**
- Ensure you've run the Tampermonkey script first and used "Download Index"
- Look for files named `unified_media_index_*.json`
- Check the file path and extension (.json)

**"Missing required packages"**
- Run: `pip install aiohttp aiofiles`

**Downloads failing**
- Try reducing `--concurrent` parameter (start with 5)
- Increase `--delay` between requests  
- Check your internet connection

**Tampermonkey script not appearing**
- Ensure Tampermonkey is enabled
- Refresh the Imgur page
- Check browser console for errors

**Auto-scan not working**
- Check if "⚡ Auto" button turns orange when clicked
- Look for timestamped status updates in the panel
- Verify jQuery is loaded (script requires it)

**History counts seem wrong**
- Use "Clear Index History" to reset if needed
- Remember: counts show total accumulated media, not current page
- Auto-scan may find the same items multiple times (this is normal)

### Performance Tips

**For large collections (using auto-scan):**
- Enable auto-scan and let it run while browsing
- Use higher `--concurrent` values (15-25) for unified downloads
- Ensure sufficient disk space for mixed media types
- Consider running downloads during off-peak hours

**For dynamic content sites:**
- Use auto-scan feature for infinite scroll pages
- Let the script run for several minutes to catch all loaded content
- Monitor the "History Items" count to see accumulation
- Export index when count stabilizes

**For rate-limited sites:**
- Disable auto-scan and use manual scanning
- Reduce `--concurrent` to 3-5 for downloads
- Increase `--delay` to 0.5-1.0 seconds
- Monitor for 429/rate limit errors

## 🧪 Testing

Test the unified setup with a small Imgur page first:
1. Find a page with mixed content (5-10 videos and images)
2. Click "🔍 Scan Current Page" to test basic functionality
3. Try "⚡ Auto" mode for 30 seconds to test auto-scanning
4. Generate unified index file with "📥 Download Index"
5. Run Python downloader with default settings
6. Verify both video and image files are downloaded correctly
7. Check that metadata files contain proper `mediaType` fields

**Testing Auto-Scan:**
- Navigate to an infinite scroll Imgur page
- Enable auto-scan and scroll slowly
- Watch the "Total Media" count increase
- Try page navigation while auto-scan is active
- Verify history persists across page changes

## 📝 License

This project is for educational and personal use. Respect Imgur's terms of service and rate limits.
