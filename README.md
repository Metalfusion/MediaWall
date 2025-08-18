# MediaWall - Interactive Media Display Application

A full-screen media wall web application that displays an auto-scrolling grid of videos and images with background music support.
The media is loaded and served with metadata from local folders using a simple Python server.

## ✨ Features

### 🎬 **Media Display**
- **Auto-playing video wall**: Short video clips play automatically in a masonry grid layout
- **Image gallery**: Display images alongside videos in the same grid
- **Seamless looping**: Videos loop continuously for uninterrupted viewing
- **Responsive design**: Adapts to different screen sizes and orientations

### 🎵 **Audio Support**
- **Background music**: Simply place MP3 files in the music folder - no setup required
- **Music controls**: Play, pause, skip tracks, and adjust volume
- **Floating music player**: Unobtrusive controls that don't interfere with the visual experience

### ⚙️ **Customizable Settings**
- **Display options**: Control what video and image types are shown
- **Playback settings**: Adjust auto-scroll behavior and timing
- **Visual controls**: Modify grid layout and spacing
- **Filtering**: Show/hide specific categories or types of content

### 🏗️ **Technical Features**
- **High-performance rendering**: Virtualized grid for smooth performance with large video/image collections
- **Smart loading**: Only loads visible videos and images to optimize memory usage
- **Metadata support**: Automatic extraction of video/image dimensions and properties
- **Smart tag merging**: Preserves existing tags from metadata while adding auto-generated tags
- **RESTful API**: Clean API for video/image management and control

## 🚀 Getting Started

### Prerequisites
- Python 3.8 or higher
- Node.js and npm (for frontend development)
- A modern web browser

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd MediaWall
   ```

2. **Set up Python environment**
   ```bash
   python -m venv .venv
   
   # On Windows
   .\.venv\Scripts\activate
   
   # On macOS/Linux
   source .venv/bin/activate
   
   pip install -r requirements.txt
   ```

3. **Install frontend dependencies**
   ```bash
   npm install
   ```

4. **Create media directories**
   ```bash
   mkdir videos images music
   ```

### Smart Auto-Detection

MediaWall features intelligent auto-detection to minimize setup:

**🔍 Automatic React Build Detection:**
- If a `dist/` folder exists, it will be used automatically for serving the React app
- No need to specify the build folder path manually
- Build with `npm run build` and simply run `python react_video_server.py`

**🔍 Automatic Database Detection:**
- If `media_database.json` exists in the current directory, database mode is enabled automatically
- No need to specify `--database` flag manually
- Place your database file as `media_database.json` and run the server normally

**💡 Benefits:**
- Zero-config startup for most common scenarios
- Faster development workflow
- Less chance of command-line errors
- Manual arguments still override auto-detection when needed

### Quick Start

#### Option 1: Development Mode (Hot Reload)
```bash
# Terminal 1: Start the Python backend
python react_video_server.py

# Terminal 2: Start the frontend dev server
npm run dev
```
Then open http://localhost:5173

#### Option 2: Production Mode
```bash
# Build the frontend
npm run build

# Start with auto-detection (recommended)
python hypercorn_video_server.py

# Or explicitly specify build folder
python hypercorn_video_server.py dist
```
Then open http://localhost:8000

#### Option 3: Database Mode
For using a single JSON database instead of folder scanning:
```bash
# Auto-detection (if media_database.json exists in current directory)
python react_video_server.py

# Explicitly specify database file
python react_video_server.py --database ./media_database.json

# Production mode with auto-detection
python hypercorn_video_server.py

# Production mode with explicit database
python hypercorn_video_server.py --database ./media_database.json
```

## 📁 Directory Structure

```
MediaWall/
├── videos/          # Place your video files here
├── images/          # Place your image files here  
├── music/           # Place your music files here
├── src/             # React frontend source code
├── media_scraper/   # Tools for content indexing and downloading
├── dist/            # Built frontend (generated)
└── .venv/           # Python virtual environment
```

## 🎯 Content Management

### Adding Music (Simple)

For background music, simply copy your music files (MP3, FLAC, etc.) into the `music/` directory. No additional setup or metadata generation is required - the music player will automatically discover and play them.

### Getting Videos and Images

MediaWall supports two modes for managing video and image content:

#### Mode 1: Folder Scanning
The application displays videos and images that require metadata JSON files for proper functionality. This is the default mode.

#### Mode 2: Database Mode
Load all media metadata from a single JSON database file instead of scanning folders for individual metadata files. This mode is useful for:
- Managing large collections efficiently
- Centralizing metadata management
- Working with media files stored in various locations
- Easier backup and synchronization of metadata

### Database Mode Setup

When using database mode, create a JSON file containing an array of media objects. Each object should include:

- `filename`: The media file name
- `path`: Path to the file relative to the database JSON location (or absolute path)
- `mediaType`: Either "video" or "image" 
- `title`: Display title for the media
- `tags`: Array of custom tags (optional - will be merged with auto-generated tags)
- `dimensions`: Object with `width` and `height` properties
- Additional metadata fields (score, category, URLs, etc.)

**Example database file:**
```json
[
  {
    "filename": "my_video.mp4",
    "path": "videos/my_video.mp4",
    "mediaType": "video",
    "title": "My Amazing Video",
    "tags": ["entertainment", "comedy", "viral"],
    "dimensions": {
      "width": "1920",
      "height": "1080"
    },
    "category": "entertainment",
    "score": "95",
    "duration": "120.5"
  },
  {
    "filename": "my_image.jpg", 
    "path": "images/my_image.jpg",
    "mediaType": "image",
    "title": "Beautiful Landscape",
    "tags": ["nature", "scenic", "mountains"],
    "dimensions": {
      "width": "2048",
      "height": "1536"
    },
    "category": "nature",
    "score": "88"
  }
]
```

**Converting existing metadata files:**
If you already have individual metadata JSON files, you can convert them to database format using the included converter:
```bash
# Convert from default folders (videos and images)
python convert_to_database.py -o media_database.json

# Convert from specific folders
python convert_to_database.py videos images music -o media_database.json
```

### Traditional Folder Mode Setup

#### Method 1: Manual Addition (Existing Local Files)
If you already have video and image files you want to display:

1. **Copy your files** into the respective `videos/` and `images/` directories
2. **Generate metadata** using the local file indexing script:
   ```bash
   cd media_scraper
   python local_files_indexer.py
   ```
   
This script will:
- Scan your video and image files
- Extract metadata (dimensions, duration, etc.)
- Create the required JSON metadata files next to each video/image file
- Generate the index files needed by the application

**Adding custom tags**: You can manually edit the generated metadata JSON files to add custom tags using the `tags` field (or `video_tags`/`image_tags`). These will be automatically merged with system-generated tags.

**Note**: The application requires metadata JSON files for all videos and images to function properly.

#### Method 3: Using Index Scripts (Advanced)
For bulk content collection from websites:

1. **Create a content index** using the provided Tampermonkey script:
   - Install the Tampermonkey browser extension
   - Use `media_scraper/downloader.js` as a starting point
   - Customize it for your target website (AI tools can help adapt the script)
   - Run the script to generate JSON index files

2. **Download indexed content**:
   ```bash
   cd media_scraper
   python media_downloader.py path/to/your/index.json
   ```

#### Method 2: Local File Indexing (Alternative)
If you have existing files but prefer to use the dedicated indexing script directly:
```bash
cd media_scraper
python local_files_indexer.py
```
This approach gives you more control over the indexing process and metadata generation.

### Supported File Formats

- **Videos**: `.mp4`, `.webm`, `.avi`, `.mov`, `.mkv`, `.flv`, `.wmv`, `.m4v`, `.3gp`
- **Images**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.avif`
- **Audio**: `.mp3`, `.wav`, `.flac`, `.aac`, `.ogg`, `.m4a`, `.wma`

## Configuration

### Backend Configuration
The Python server can be configured via command-line arguments, but features smart auto-detection for common scenarios:

**Auto-detection (simplest):**
```bash
# Automatically detects dist folder and media_database.json if they exist
python react_video_server.py
python hypercorn_video_server.py
```

**Basic usage:**
```bash
python react_video_server.py
```

**With React build folder:**
```bash
python react_video_server.py dist
```

**Database mode:**
```bash
python react_video_server.py --database ./media_database.json
```

**Auto-detection features:**
- If `dist/` folder exists, it will be used automatically for React build
- If `media_database.json` exists, database mode will be enabled automatically
- Manual arguments override auto-detection

**Command-line options:**
- `react_build_folder`: Path to React build folder (optional, defaults to 'dist' if it exists)
- `--database FILE`: Path to media database JSON file (optional, defaults to 'media_database.json' if it exists)

**Default folders (created automatically if they don't exist):**
- `videos/` - Video files
- `images/` - Image files  
- `music/` - Music files

### Frontend Settings
Use the settings panel in the web interface to customize:
- Auto-scroll speed and behavior
- Media filtering and display options
- Grid layout and sizing
- Music playback settings

## Development

### Frontend Development
```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Backend Development
The backend uses Python with aiohttp for high-performance async serving:
- `react_video_server.py` - Main integrated server
- `hypercorn_video_server.py` - High-performance Hypercorn variant
- `media_metadata.py` - Media processing and indexing

### API Endpoints
- `GET /api/videos` - List all videos with metadata
- `GET /api/images` - List all images with metadata  
- `GET /api/music` - List all music files
- `GET /stream/video/<filename>` - Stream video files
- `GET /stream/image/<filename>` - Serve image files
- `GET /stream/music/<filename>` - Stream music files


## Troubleshooting

### Common Issues

**Videos not playing**: Ensure your browser supports the video formats. MP4 with H.264 encoding works best.

**Videos/images not showing**: Ensure you've run the indexing script to generate metadata JSON files for your video and image files.

**Music not playing**: Simply copy music files directly to the `music/` directory - no indexing required.

**Database mode not loading media**: Ensure file paths in the database JSON are correct relative to the database file location, and that the media files exist.

## Database Mode

### Creating a Database

Create a JSON file with an array of media objects:
```bash
# View help for database mode
python react_video_server.py --help

# Convert existing metadata files to database format
python convert_to_database.py -o media_database.json

# Start server (auto-detects media_database.json)
python react_video_server.py

# Or explicitly specify database
python react_video_server.py --database my_database.json
```

### Database Schema

Each media object should include:
- `filename`: Media file name
- `path`: Relative or absolute path to file
- `mediaType`: "video" or "image"
- `title`: Display title
- `tags`: Array of custom tags (optional, merged with auto-generated tags)
- `dimensions`: Object with width/height
- Additional metadata fields as needed

---

**Enjoy your dynamic media wall experience! 🎨**
