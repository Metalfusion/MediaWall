# MediaWall - Interactive Media Display Application

A full-screen media wall application that displays an auto-scrolling grid of videos and images with background music support. Perfect for creating dynamic visual displays, digital art installations, or simply enjoying your video and image collections in a unique way.

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

### Quick Start

#### Option 1: Development Mode (Hot Reload)
```bash
# Terminal 1: Start the Python backend
python react_video_server.py ./videos

# Terminal 2: Start the frontend dev server
npm run dev
```
Then open http://localhost:5173

#### Option 2: Production Mode
```bash
# Build the frontend
npm run build

# Start with Hypercorn (HTTP/2, better performance)
python hypercorn_video_server.py ./videos
```
Then open http://localhost:8000

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

### Getting Videos and Images

The application displays videos and images that require metadata JSON files for proper functionality. Here are the recommended approaches:

### Adding Music (Simple)

For background music, simply copy your music files (MP3, FLAC, etc.) into the `music/` directory. No additional setup or metadata generation is required - the music player will automatically discover and play them.

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

## 🛠️ Configuration

### Backend Configuration
The Python server can be configured via command-line arguments:
```bash
python react_video_server.py ./videos --port 8000 --host 0.0.0.0
```

### Frontend Settings
Use the settings panel in the web interface to customize:
- Auto-scroll speed and behavior
- Media filtering and display options
- Grid layout and sizing
- Music playback settings

## 🔧 Development

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


## 🔍 Troubleshooting

### Common Issues

**Videos not playing**: Ensure your browser supports the video formats. MP4 with H.264 encoding works best.

**CORS errors in development**: Make sure both the Python backend and npm dev server are running.

**Videos/images not showing**: Ensure you've run the indexing script to generate metadata JSON files for your video and image files.

**Music not playing**: Simply copy music files directly to the `music/` directory - no indexing required.

---

**Enjoy your dynamic media wall experience! 🎨**
