"""
Integrated Video Server for React App
Serves both the React build and the video/music APIs
"""

import os
import sys
import json
import time
import asyncio
import threading
import re
import subprocess
import shutil
from pathlib import Path
import webbrowser
import mimetypes
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Union, List
from media_metadata import (
    ImageMetadataIndex,
    VideoMetadataIndex,
    read_video_metadata,
    get_video_dimensions,
    gen_video_tags,
    gen_image_tags,
    parse_duration_seconds,
    probe_duration_seconds,
)

try:
    import aiohttp
    from aiohttp import web
    from aiohttp.web import Request, Response, FileResponse
except ImportError:
    print("[ERROR] Error: aiohttp not installed. Install with:")
    print("   pip install aiohttp")
    sys.exit(1)

# Supported media extensions
VIDEO_EXTENSIONS = {'.mp4', '.webm', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v', '.3gp'}
AUDIO_EXTENSIONS = {'.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'}
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'}

class IntegratedVideoServer:
    def __init__(self, react_build_folder: Optional[Path] = None, database_file: Optional[Path] = None):
        # Use default folders in current directory
        self.videos_folder = Path('videos')
        self.images_folder = Path('images')
        self.music_folder = Path('music')
        self.react_build_folder = Path(react_build_folder) if react_build_folder else None
        
        # Database mode configuration
        self.database_file = Path(database_file) if database_file else None
        self.database_mode = self.database_file is not None
        self.database_data: List[Dict[str, Any]] = []
        self.database_base_path: Optional[Path] = None

        # Caches and TTLs
        self.video_cache: Dict[str, Any] = {}
        self.image_cache: Dict[str, Any] = {}
        self.music_cache: Dict[str, Any] = {}
        self.cache_timestamp: Optional[datetime] = None
        self.image_cache_timestamp: Optional[datetime] = None
        self.music_cache_timestamp: Optional[datetime] = None
        self.cache_ttl = timedelta(minutes=5)

        # Ensure attributes exist regardless of folder detection
        self.image_indexer = None
        self.video_indexer = None

        # Initialize database mode if specified
        if self.database_mode:
            self._load_database()
            print(f"📊 Database mode enabled: {self.database_file}")
            print(f"📊 Database base path: {self.database_base_path}")
            print(f"📊 Loaded {len(self.database_data)} media entries from database")
        else:
            print("[FOLDER] Folder scan mode enabled")

        # Check if folders exist (only in folder mode)
        if not self.database_mode:
            # Check videos folder
            if not self.videos_folder.exists():
                print(f"📁 Videos folder not found: {self.videos_folder} (will be created if needed)")
            else:
                print(f"📁 Videos folder: {self.videos_folder}")

            # Check images folder  
            if not self.images_folder.exists():
                print(f"📁 Images folder not found: {self.images_folder} (will be created if needed)")
            else:
                print(f"🖼️ Images folder: {self.images_folder}")

            # Check music folder
            if not self.music_folder.exists():
                print(f"� Music folder not found: {self.music_folder} (will be created if needed)")
            else:
                print(f"🎵 Music folder: {self.music_folder}")

        # Tags cache
        self.tags_cache = None
        self.tags_cache_timestamp = None

        # Index caches (persistent on disk) delegated to module (only in folder mode)
        if not self.database_mode:
            self.image_indexer = ImageMetadataIndex(self.images_folder) if self.images_folder else None
            self.video_indexer = VideoMetadataIndex(self.videos_folder) if self.videos_folder else None

    def _load_database(self) -> None:
        """Load media database from JSON file"""
        if not self.database_file or not self.database_file.exists():
            print(f"❌ Database file not found: {self.database_file}")
            self.database_data = []
            return
        
        try:
            with open(self.database_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if not isinstance(data, list):
                print(f"❌ Database file must contain a JSON array, got {type(data)}")
                self.database_data = []
                return
                
            self.database_data = data
            self.database_base_path = self.database_file.parent
            
            # Validate database entries
            valid_entries = []
            for i, entry in enumerate(self.database_data):
                if not isinstance(entry, dict):
                    print(f"⚠️ Skipping invalid entry {i}: not a dictionary")
                    continue
                
                # Check if it has required fields
                if 'filename' not in entry and 'path' not in entry:
                    print(f"⚠️ Skipping entry {i}: missing 'filename' or 'path' field")
                    continue
                
                # Ensure we have a filename
                if 'filename' not in entry and 'path' in entry:
                    entry['filename'] = Path(entry['path']).name
                
                # Determine media type from filename or explicit field
                filename = entry['filename']
                file_ext = Path(filename).suffix.lower()
                
                if 'mediaType' in entry:
                    media_type = entry['mediaType'].lower()
                elif file_ext in VIDEO_EXTENSIONS:
                    media_type = 'video'
                elif file_ext in IMAGE_EXTENSIONS:
                    media_type = 'image'
                else:
                    print(f"⚠️ Skipping entry {i}: unknown media type for {filename}")
                    continue
                
                entry['mediaType'] = media_type
                valid_entries.append(entry)
            
            self.database_data = valid_entries
            print(f"✅ Successfully loaded {len(valid_entries)} valid entries from database")
            
        except Exception as e:
            print(f"❌ Failed to load database file {self.database_file}: {e}")
            self.database_data = []

    def _get_file_path_from_database_entry(self, entry: Dict[str, Any]) -> Path:
        """Get the absolute file path from a database entry"""
        if 'path' in entry:
            rel_path = Path(entry['path'])
        else:
            rel_path = Path(entry['filename'])
        
        if rel_path.is_absolute():
            return rel_path
        else:
            if self.database_base_path is None:
                raise ValueError("Database base path is None, cannot resolve relative path")
            return self.database_base_path / rel_path

    # ---- API-level persistent cache helpers (store final JSON payload) ----
    def _api_cache_path(self, kind: str) -> Path:
        """Return cache file path for kind in {videos, images}."""
        if kind == 'videos':
            base = self.videos_folder if self.videos_folder else Path('.')
            return base / '.videos_api_cache.json'
        if kind == 'images':
            # Prefer images folder; fallback to videos folder as colocated cache
            base = self.images_folder or self.videos_folder or Path('.')
            return base / '.images_api_cache.json'
        raise ValueError(f"Unknown api cache kind: {kind}")

    def _load_api_cache(self, kind: str) -> Optional[Dict[str, Any]]:
        p = self._api_cache_path(kind)
        if p.exists():
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                # Basic shape validation
                if kind == 'videos' and isinstance(data, dict) and 'videos' in data:
                    return data
                if kind == 'images' and isinstance(data, dict) and 'images' in data:
                    return data
            except Exception as e:
                print(f"⚠️ Failed to read {kind} API cache {p}: {e}")
        return None

    def _save_api_cache(self, kind: str, data: Dict[str, Any]) -> None:
        p = self._api_cache_path(kind)
        try:
            # Ensure parent exists
            p.parent.mkdir(parents=True, exist_ok=True)
            tmp = p.with_suffix(p.suffix + '.tmp')
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False)
            os.replace(tmp, p)
        except Exception as e:
            print(f"⚠️ Failed to write {kind} API cache {p}: {e}")

    def clear_api_cache(self, kind: Optional[str] = None) -> None:
        """Delete persistent API cache file(s). kind in {videos, images} or None for both."""
        kinds = [kind] if kind in ('videos', 'images') else ['videos', 'images']
        for k in kinds:
            try:
                p = self._api_cache_path(k)
                if p.exists():
                    p.unlink()
                    print(f"🧹 Cleared {k} API cache: {p}")
            except Exception as e:
                print(f"⚠️ Failed clearing {k} API cache: {e}")

    def _dget(self, d: Any, key: str, default: Any = None) -> Any:
        """Safe dict.get that returns default if d is not a dict."""
        return d.get(key, default) if isinstance(d, dict) else default
    
    def format_display_title(self, filename: str) -> str:
        """Format and clean the display title from various filename patterns"""
        # Remove file extension
        title = filename.rsplit('.', 1)[0]
        
        # Pattern 1: "20250808T163938_36228936_collection_Actual_Title_Here"
        match = re.match(r'^\d{8}T\d{6}_\d+_[^_]+_(.+)$', title)
        if match:
            display_title = match.group(1)
            # Replace underscores with spaces and clean up
            display_title = display_title.replace('_', ' ').strip()
            return display_title
        
        # Pattern 2: "20250808T163938 36228936 Collection Words Actual Title"
        # Extract title after timestamp, ID, and collection words
        match = re.match(r'^\d{8}T\d{6}\s+\d+\s+\w+\s+\w+\s+(.+)$', title, re.IGNORECASE)
        if match:
            display_title = match.group(1).strip()
            return display_title
        
        # Pattern 3: More flexible - remove timestamp and ID at start
        display_title = re.sub(r'^\d{8}T\d{6}[_\s]+\d+[_\s]+', '', title)
      
        # Clean up underscores and spaces
        display_title = display_title.replace('_', ' ')
        display_title = re.sub(r'\s+', ' ', display_title).strip()
        
        # Capitalize words properly
        display_title = ' '.join(word.capitalize() for word in display_title.split())
        
        return display_title if display_title else title
    
    def read_video_metadata(self, video_path: Path) -> Dict[str, Any]:
        # Prefer cached index entry to avoid per-file JSON reads
        if self.video_indexer:
            entry = self.video_indexer.get_entry(video_path.name)
            if isinstance(entry, dict):
                m = entry.get('metadata') if isinstance(entry.get('metadata'), dict) else None
                result: Dict[str, Any] = {}
                if 'title' in entry:
                    result['title'] = entry['title']
                if m:
                    result['metadata'] = m
                return result
        return read_video_metadata(video_path)

    # Tag generation now lives in media_metadata
    
    def get_video_dimensions(self, video_path: Path) -> Dict[str, Any]:
        """Try to get video dimensions from metadata or use defaults"""
        # Check if there's dimension info in metadata
        metadata_info = self.read_video_metadata(video_path)
        if metadata_info and 'metadata' in metadata_info:
            metadata = metadata_info['metadata']
            
            # Try to find dimensions in metadata
            width = metadata.get('width') or metadata.get('video_width')
            height = metadata.get('height') or metadata.get('video_height')
            
            if width and height:
                try:
                    return {'width': int(width), 'height': int(height)}
                except (ValueError, TypeError):
                    pass
        
        # Default dimensions (common video aspect ratios)
        return {'width': 1920, 'height': 1080}  # Default to 1080p
    
    def scan_videos(self, force_refresh: bool = False) -> Dict[str, Any]:
        """Scan for videos with intelligent caching"""
        current_time = datetime.now()
        
        # Persistent API cache short-circuit
        if not force_refresh:
            cached = self._load_api_cache('videos')
            if cached:
                self.video_cache = cached
                self.cache_timestamp = current_time
                return cached

        # Check if cache is still valid
        if (self.cache_timestamp and 
            current_time - self.cache_timestamp < self.cache_ttl and 
            self.video_cache):
            return self.video_cache
        
        if self.database_mode:
            return self._scan_videos_from_database(current_time)
        else:
            return self._scan_videos_from_folder(current_time)

    def _scan_videos_from_database(self, current_time: datetime) -> Dict[str, Any]:
        """Scan videos from database entries"""
        print(f"📺 Scanning videos from database: {self.database_file}")
        
        if not self.database_data:
            return {"error": f"No database data loaded from: {self.database_file}"}
        
        videos = []
        for entry in self.database_data:
            if entry.get('mediaType') != 'video':
                continue
            
            try:
                file_path = self._get_file_path_from_database_entry(entry)
                
                # Check if file exists
                if not file_path.exists() or not file_path.is_file():
                    print(f"⚠️ File not found: {file_path}")
                    continue
                
                stat = file_path.stat()
                
                # Extract metadata from database entry
                title = entry.get('title', self.format_display_title(entry['filename']))
                
                # Get dimensions from database or extract from metadata
                dimensions = {'width': 1920, 'height': 1080}  # default
                if 'dimensions' in entry:
                    dims = entry['dimensions']
                    if isinstance(dims, dict):
                        try:
                            if 'width' in dims and 'height' in dims:
                                dimensions = {
                                    'width': int(dims['width']),
                                    'height': int(dims['height'])
                                }
                        except (ValueError, TypeError):
                            pass
                
                video_info = {
                    "type": "video",
                    "tags": [],
                    "filename": entry['filename'],
                    "size": stat.st_size,
                    "title": title,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "width": dimensions['width'],
                    "height": dimensions['height'],
                    "aspect_ratio": round(dimensions['width'] / dimensions['height'], 3)
                }
                
                # Add database metadata
                db_metadata = {k: v for k, v in entry.items() 
                             if k not in ['filename', 'path', 'mediaType', 'title', 'dimensions']}
                if db_metadata:
                    video_info['metadata'] = db_metadata

                # Compute duration if available in database
                dur = None
                if 'duration' in entry:
                    dur = parse_duration_seconds(entry['duration'])
                # Try to probe if no duration in database
                if dur is None:
                    dur = probe_duration_seconds(file_path)
                if dur is not None:
                    video_info['duration_seconds'] = round(float(dur), 3)

                # Generate tags
                meta_for_tags = {'metadata': db_metadata}
                if dur is not None:
                    meta_for_tags['metadata']['duration'] = float(dur)
                video_info['tags'] = gen_video_tags(file_path, dimensions, meta_for_tags, do_probe=True)
                
                videos.append(video_info)
                
            except Exception as e:
                print(f"⚠️ Error processing database entry {entry.get('filename', 'unknown')}: {e}")
                continue
        
        # Sort videos by name for consistent ordering
        videos.sort(key=lambda v: v["filename"])
        
        self.video_cache = {
            "folder": "/videos/",
            "generated": current_time.isoformat(),
            "scan_path": f"database:{self.database_file}",
            "total_size": sum(v["size"] for v in videos),
            "total_videos": len(videos),
            "videos": videos
        }
        
        self.cache_timestamp = current_time
        self._save_api_cache('videos', self.video_cache)
        
        print(f"✅ Found {len(videos)} videos from database")
        return self.video_cache

    def _scan_videos_from_folder(self, current_time: datetime) -> Dict[str, Any]:
        """Scan videos from folder structure (original implementation)"""
        print(f"📺 Scanning videos in: {self.videos_folder}")
        
        if not self.videos_folder.exists():
            print(f"📺 Videos folder doesn't exist yet: {self.videos_folder}")
            return {
                "folder": "/videos/",
                "generated": current_time.isoformat(),
                "scan_path": str(self.videos_folder),
                "total_size": 0,
                "total_videos": 0,
                "videos": []
            }
        
        # Ensure video index is up to date to minimize disk reads
        if self.video_indexer:
            self.video_indexer.update()

        videos = []
        for file_path in self.videos_folder.rglob('*'):
            if file_path.is_file() and file_path.suffix.lower() in VIDEO_EXTENSIONS:
                try:
                    stat = file_path.stat()
                    
                    # Prefer cached index entry for metadata
                    index_entry = self.video_indexer.get_entry(file_path.name) if self.video_indexer else None
                    metadata_info = self.read_video_metadata(file_path)
                    if metadata_info and 'title' in metadata_info:
                        clean_title = metadata_info['title']
                    else:
                        # Extract clean title from filename
                        clean_title = self.format_display_title(file_path.name)
                    
                    # Get video dimensions (prefer index if available)
                    if isinstance(index_entry, dict) and index_entry.get('width') and index_entry.get('height'):
                        dimensions = {
                            'width': int(index_entry['width']),
                            'height': int(index_entry['height'])
                        }
                    else:
                        dimensions = get_video_dimensions(file_path, metadata_info)
                    
                    video_info = {
                        "type": "video",
                        "tags": [],
                        "filename": file_path.name,
                        "size": stat.st_size,
                        "title": clean_title,
                        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "width": dimensions['width'],
                        "height": dimensions['height'],
                        "aspect_ratio": round(dimensions['width'] / dimensions['height'], 3)
                    }
                    
                    # Add essential metadata if available (no tag merging)
                    if metadata_info and 'metadata' in metadata_info and metadata_info['metadata']:
                        video_info['metadata'] = metadata_info['metadata']

                    # Compute duration first to avoid duplicate probes in tag generation
                    dur = None
                    if self.video_indexer:
                        dur = self.video_indexer.get_duration(file_path.name)
                    if dur is None:
                        dur = probe_duration_seconds(file_path)
                    if dur is None:
                        dur = parse_duration_seconds(
                            (video_info.get('metadata', {}) or {}).get('duration') or
                            (video_info.get('metadata', {}) or {}).get('video_duration') or
                            (video_info.get('metadata', {}) or {}).get('length')
                        )
                    if dur is not None:
                        video_info['duration_seconds'] = round(float(dur), 3)

                    # Prepare meta for tag generation: inject computed duration to prevent a second probe
                    meta_for_tags = dict(metadata_info or {})
                    inner_m = dict((meta_for_tags.get('metadata') or {}))
                    if dur is not None:
                        inner_m['duration'] = float(dur)
                    if inner_m:
                        meta_for_tags['metadata'] = inner_m

                    # Generate tags via shared helpers; probing enabled (audio detection will still run)
                    video_info['tags'] = gen_video_tags(file_path, dimensions, meta_for_tags, do_probe=True)
                    
                    videos.append(video_info)
                except (OSError, ValueError) as e:
                    print(f"⚠️ Error processing {file_path}: {e}")
                    continue
        
        # Sort videos by name for consistent ordering
        videos.sort(key=lambda v: v["filename"])
        
        self.video_cache = {
            "folder": "/videos/",
            "generated": current_time.isoformat(),
            "scan_path": str(self.videos_folder),
            "total_size": sum(v["size"] for v in videos),
            "total_videos": len(videos),
            "videos": videos
        }
        
        self.cache_timestamp = current_time

        # Save persistent API cache with final JSON payload
        self._save_api_cache('videos', self.video_cache)
        
        print(f"✅ Found {len(videos)} videos with enhanced metadata")
        return self.video_cache

    # ---- Persistent image index helpers ----
    # Image index now delegated to media_metadata.ImageMetadataIndex

    def get_image_dimensions(self, image_path: Path) -> Dict[str, Any]:
        """Try to get image dimensions using index if available, else defaults"""
        if self.image_indexer:
            dims = self.image_indexer.get_dimensions(image_path.name)
            if dims:
                return dims
        # Default to 1080p landscape
        return {'width': 1920, 'height': 1080}

    def scan_images(self, force_refresh: bool = False) -> Dict[str, Any]:
        """Scan for images with caching"""
        current_time = datetime.now()
        # Persistent API cache short-circuit
        if not force_refresh:
            cached = self._load_api_cache('images')
            if cached:
                self.image_cache = cached
                self.image_cache_timestamp = current_time
                return cached
        if (self.image_cache_timestamp and
            current_time - self.image_cache_timestamp < self.cache_ttl and
            self.image_cache):
            return self.image_cache

        if self.database_mode:
            return self._scan_images_from_database(current_time)
        else:
            return self._scan_images_from_folder(current_time)

    def _scan_images_from_database(self, current_time: datetime) -> Dict[str, Any]:
        """Scan images from database entries"""
        print(f"🖼️ Scanning images from database: {self.database_file}")
        
        if not self.database_data:
            return {"folder": "/images/", "images": []}
        
        images: List[Dict[str, Any]] = []
        for entry in self.database_data:
            if entry.get('mediaType') != 'image':
                continue
            
            try:
                file_path = self._get_file_path_from_database_entry(entry)
                
                # Check if file exists
                if not file_path.exists() or not file_path.is_file():
                    print(f"⚠️ Image file not found: {file_path}")
                    continue
                
                stat = file_path.stat()
                
                # Extract metadata from database entry
                title = entry.get('title', self.format_display_title(entry['filename']))
                
                # Get dimensions from database
                dims = {'width': 1920, 'height': 1080}  # default
                if 'dimensions' in entry:
                    db_dims = entry['dimensions']
                    if isinstance(db_dims, dict):
                        try:
                            if 'width' in db_dims and 'height' in db_dims:
                                dims = {
                                    'width': int(db_dims['width']),
                                    'height': int(db_dims['height'])
                                }
                        except (ValueError, TypeError):
                            pass
                
                item = {
                    "type": "image",
                    "tags": [],
                    "filename": entry['filename'],
                    "size": stat.st_size,
                    "title": title,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "width": dims['width'],
                    "height": dims['height'],
                    "aspect_ratio": round(dims['width'] / dims['height'], 3)
                }
                
                # Add database metadata
                db_metadata = {k: v for k, v in entry.items() 
                             if k not in ['filename', 'path', 'mediaType', 'title', 'dimensions']}
                if db_metadata:
                    item['metadata'] = db_metadata

                # Generate tags
                meta_for_tags = {'metadata': db_metadata}
                item['tags'] = gen_image_tags(file_path, dims, meta_for_tags)
                
                images.append(item)
                
            except Exception as e:
                print(f"⚠️ Error processing database entry {entry.get('filename', 'unknown')}: {e}")
                continue

        images.sort(key=lambda i: i["filename"])
        self.image_cache = {
            "folder": "/images/",
            "generated": current_time.isoformat(),
            "scan_path": f"database:{self.database_file}",
            "total_size": sum(i["size"] for i in images),
            "total_images": len(images),
            "images": images
        }
        self.image_cache_timestamp = current_time
        self._save_api_cache('images', self.image_cache)
        print(f"✅ Found {len(images)} images from database")
        return self.image_cache

    def _scan_images_from_folder(self, current_time: datetime) -> Dict[str, Any]:
        """Scan images from folder structure (original implementation)"""
        if not self.images_folder.exists():
            print(f"🖼️ Images folder doesn't exist yet: {self.images_folder}")
            self.image_cache = {
                "folder": "/images/",
                "generated": current_time.isoformat(),
                "scan_path": str(self.images_folder),
                "total_size": 0,
                "total_images": 0,
                "images": []
            }
            return self.image_cache

        print(f"🖼️ Scanning images in: {self.images_folder}")
        # Ensure index is loaded and up to date; this avoids per-file JSON reads
        if self.image_indexer:
            self.image_indexer.update()
        images: List[Dict[str, Any]] = []
        for file_path in self.images_folder.rglob('*'):
            if file_path.is_file() and file_path.suffix.lower() in IMAGE_EXTENSIONS:
                try:
                    stat = file_path.stat()
                    entry = self.image_indexer.get_entry(file_path.name) if self.image_indexer else None
                    title = (entry.get('title') if isinstance(entry, dict) else None) or self.format_display_title(file_path.name)
                    dims = self.get_image_dimensions(file_path)
                    item = {
                        "type": "image",
                        "tags": [],
                        "filename": file_path.name,
                        "size": stat.st_size,
                        "title": title,
                        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "width": dims['width'],
                        "height": dims['height'],
                        "aspect_ratio": round(dims['width'] / dims['height'], 3)
                    }
                    if isinstance(entry, dict) and entry.get('metadata'):
                        item['metadata'] = entry['metadata']

                    # Generate tags via shared helpers
                    item['tags'] = gen_image_tags(file_path, dims, entry or {})
                    images.append(item)
                except (OSError, ValueError) as e:
                    print(f"⚠️ Error processing {file_path}: {e}")
                    continue

        images.sort(key=lambda i: i["filename"])
        self.image_cache = {
            "folder": "/images/",
            "generated": current_time.isoformat(),
            "scan_path": str(self.images_folder),
            "total_size": sum(i["size"] for i in images),
            "total_images": len(images),
            "images": images
        }
        self.image_cache_timestamp = current_time
        # Save persistent API cache with final JSON payload
        self._save_api_cache('images', self.image_cache)
        print(f"✅ Found {len(images)} images")
        return self.image_cache
    
    def scan_music(self) -> Dict[str, Any]:
        """Scan for music tracks with caching"""
        current_time = datetime.now()
        
        # Check if cache is still valid
        if (self.music_cache_timestamp and 
            current_time - self.music_cache_timestamp < self.cache_ttl and 
            self.music_cache):
            return self.music_cache
        
        if not self.music_folder.exists():
            print(f"🎵 Music folder doesn't exist yet: {self.music_folder}")
            self.music_cache = {
                "folder": "/music/",
                "generated": current_time.isoformat(),
                "scan_path": str(self.music_folder),
                "tracks": []
            }
            return self.music_cache
        
        print(f"🎵 Scanning music in: {self.music_folder}")
        
        tracks = []
        for file_path in self.music_folder.rglob('*'):
            if file_path.is_file() and file_path.suffix.lower() in AUDIO_EXTENSIONS:
                try:
                    stat = file_path.stat()
                    track_info = {
                        "filename": file_path.name,
                        "size": stat.st_size,
                        "title": file_path.stem.replace('_', ' ').title()
                    }
                    tracks.append(track_info)
                except (OSError, ValueError) as e:
                    print(f"⚠️ Error processing {file_path}: {e}")
                    continue
        
        tracks.sort(key=lambda t: t["filename"])
        
        self.music_cache = {
            "folder": "/music/",
            "generated": current_time.isoformat(),
            "scan_path": str(self.music_folder),
            "tracks": tracks
        }
        
        self.music_cache_timestamp = current_time
        print(f"✅ Found {len(tracks)} music tracks")
        return self.music_cache

    def get_file_path_for_serving(self, filename: str, media_type: str) -> Optional[Path]:
        """Get the actual file path for serving a file, handling both database and folder modes"""
        if self.database_mode:
            # Find the file in database entries
            for entry in self.database_data:
                if (entry.get('filename') == filename and 
                    entry.get('mediaType') == media_type):
                    try:
                        return self._get_file_path_from_database_entry(entry)
                    except Exception as e:
                        print(f"⚠️ Error resolving path for {filename}: {e}")
                        return None
            return None
        else:
            # Traditional folder-based serving
            if media_type == 'video':
                return self.videos_folder / filename
            elif media_type == 'image':
                return self.images_folder / filename
            elif media_type == 'music':
                return self.music_folder / filename
            return None

    def _aggregate_tags(self) -> Dict[str, Any]:
        now = datetime.now()
        if self.tags_cache and self.tags_cache_timestamp and (now - self.tags_cache_timestamp < self.cache_ttl):
            return self.tags_cache
        vids = self.scan_videos().get('videos', [])
        imgs = self.scan_images().get('images', [])
        def count_tags(items: List[Dict[str, Any]]):
            counts: Dict[str, int] = {}
            for it in items:
                for t in it.get('tags', []) or []:
                    counts[t] = counts.get(t, 0) + 1
            return [{'name': k, 'count': v} for k, v in sorted(counts.items(), key=lambda x: x[0].lower())]
        data = {
            'generated': now.isoformat(),
            'videos': count_tags(vids),
            'images': count_tags(imgs),
        }
        self.tags_cache = data
        self.tags_cache_timestamp = now
        return data

async def handle_api_videos(request: Request) -> Response:
    """Handle /api/videos endpoint"""
    server = request.app['server']
    force = request.rel_url.query.get('refresh') in ('1', 'true', 'yes')
    video_data = server.scan_videos(force_refresh=force)
    
    return web.json_response(video_data, headers={
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'  # Cache for 5 minutes
    })

async def handle_api_music(request: Request) -> Response:
    """Handle /api/music endpoint"""
    server = request.app['server']
    music_data = server.scan_music()
    
    return web.json_response(music_data, headers={
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
    })

async def handle_api_images(request: Request) -> Response:
    """Handle /api/images endpoint"""
    server = request.app['server']
    force = request.rel_url.query.get('refresh') in ('1', 'true', 'yes')
    image_data = server.scan_images(force_refresh=force)
    return web.json_response(image_data, headers={
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
    })

async def handle_api_tags(request: Request) -> Response:
    server = request.app['server']
    tags = server._aggregate_tags()
    return web.json_response(tags, headers={
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
    })

async def handle_video_file(request: Request) -> Union[Response, FileResponse]:
    """Handle video file serving with range support"""
    filename = request.match_info['filename']
    server = request.app['server']
    
    file_path = server.get_file_path_for_serving(filename, 'video')
    if not file_path or not file_path.exists() or not file_path.is_file():
        return web.Response(status=404, text="Video not found")
    
    ct = mimetypes.guess_type(str(file_path))[0] or 'video/mp4'
    headers = {'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400', 'Accept-Ranges': 'bytes', 'Content-Type': ct}
    try:
        headers['Content-Length'] = str(file_path.stat().st_size)
    except Exception:
        pass
    return FileResponse(
        path=file_path,
        headers=headers
    )

async def handle_music_file(request: Request) -> Union[Response, FileResponse]:
    """Handle music file serving"""
    filename = request.match_info['filename']
    server = request.app['server']
    
    if not server.music_folder:
        return web.Response(status=404, text="Music folder not found")
    
    file_path = server.music_folder / filename
    
    if not file_path.exists() or not file_path.is_file():
        return web.Response(status=404, text="Music file not found")
    
    # Determine content type (default to audio/mpeg for mp3)
    ct = mimetypes.guess_type(str(file_path))[0] or 'audio/mpeg'
    try:
        size = file_path.stat().st_size
    except Exception:
        size = None
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
        'Accept-Ranges': 'bytes',
    }
    if size is not None:
        headers['Content-Length'] = str(size)

    headers['Content-Type'] = ct
    return FileResponse(
        path=file_path,
        headers=headers
    )

async def handle_image_file(request: Request) -> Union[Response, FileResponse]:
    """Handle image file serving"""
    filename = request.match_info['filename']
    server = request.app['server']
    
    file_path = server.get_file_path_for_serving(filename, 'image')
    if not file_path or not file_path.exists() or not file_path.is_file():
        return web.Response(status=404, text="Image not found")
    
    return FileResponse(
        path=file_path,
        headers={'Access-Control-Allow-Origin': '*'}
    )

async def handle_react_app(request: Request) -> Union[Response, FileResponse]:
    """Serve React app files"""
    server = request.app['server']
    
    if not server.react_build_folder or not server.react_build_folder.exists():
        # Fallback to development message
        return web.Response(
            text="""
            <!DOCTYPE html>
            <html>
            <head><title>Video Viewer</title></head>
            <body>
                <h1>Video Viewer - Development Mode</h1>
                <p>React build folder not found. Please build the React app first:</p>
                <pre>npm run build</pre>
                <p>Or run the development server:</p>
                <pre>npm run dev</pre>
            </body>
            </html>
            """,
            content_type='text/html'
        )
    
    # Serve React build files
    path = request.path.lstrip('/')
    
    # Default to index.html for React routing
    if not path or path == '/':
        path = 'index.html'
    
    file_path = server.react_build_folder / path
    
    # Fallback to index.html for client-side routing
    if not file_path.exists() and path != 'index.html':
        file_path = server.react_build_folder / 'index.html'
    
    if not file_path.exists():
        return web.Response(status=404, text="File not found")
    
    return FileResponse(path=file_path)

def create_app(react_build_folder: Optional[Path] = None, database_file: Optional[Path] = None) -> web.Application:
    """Create the aiohttp application"""
    app = web.Application()
    
    # Create server instance
    server = IntegratedVideoServer(react_build_folder, database_file)
    app['server'] = server
    
    # API routes
    app.router.add_get('/api/videos', handle_api_videos)
    app.router.add_get('/api/music', handle_api_music)
    app.router.add_get('/api/images', handle_api_images)
    app.router.add_get('/api/tags', handle_api_tags)
    
    # File serving routes
    app.router.add_get('/videos/{filename}', handle_video_file)
    app.router.add_get('/music/{filename}', handle_music_file)
    app.router.add_get('/images/{filename}', handle_image_file)
    
    # React app routes (catch-all)
    app.router.add_get('/{path:.*}', handle_react_app)
    
    return app

async def main():
    """Main server function"""
    # Parse command line arguments
    if len(sys.argv) >= 2 and ('--help' in sys.argv or '-h' in sys.argv):
        print("Usage: python react_video_server.py [react_build_folder] [--database <database_file>]")
        print("Example: python react_video_server.py")
        print("Example: python react_video_server.py ./dist")
        print("Example (database mode): python react_video_server.py --database ./media_database.json")
        print("Example (with build): python react_video_server.py ./dist --database ./media_database.json")
        print("")
        print("Arguments:")
        print("  react_build_folder  Path to React build folder (optional)")
        print("  --database FILE     Path to media database JSON file (optional)")
        print("")
        print("Default folders:")
        print("  videos/   - Video files")
        print("  images/   - Image files") 
        print("  music/    - Music files")
        print("")
        print("Database mode:")
        print("  When --database is specified, media metadata is loaded from a single JSON file")
        print("  instead of scanning folder structure for individual metadata files.")
        print("  The database file should contain an array of media objects with metadata.")
        sys.exit(0)
    
    react_build_folder = None
    database_file = None
    
    # Parse arguments
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == '--database' and i + 1 < len(sys.argv):
            database_file = Path(sys.argv[i + 1])
            i += 2
        else:
            # Assume it's the react build folder if no flag
            if react_build_folder is None:
                react_build_folder = Path(sys.argv[i])
            i += 1
    
    if database_file and not database_file.exists():
        print(f"❌ Database file does not exist: {database_file}")
        sys.exit(1)
    
    app = create_app(react_build_folder, database_file)
    
    # Start server
    host = '0.0.0.0'
    port = 8000
    
    print(f"🚀 Starting Integrated Video Server...")
    print(f"   📁 Working directory: {Path.cwd().absolute()}")
    if database_file:
        print(f"   📊 Database mode: {database_file.absolute()}")
    else:
        print(f"   📁 Folder scan mode")
    if react_build_folder:
        print(f"   ⚛️  React: {react_build_folder.absolute()}")
    print(f"   🌐 Server: http://{host}:{port}")
    print(f"   📺 API: http://{host}:{port}/api/videos")
    print(f"   📷 Image API: http://{host}:{port}/api/images")
    print(f"   🎵 Music API: http://{host}:{port}/api/music")
    
    # Open browser after a short delay
    def open_browser():
        time.sleep(2)
        webbrowser.open(f'http://localhost:{port}')
    
    threading.Thread(target=open_browser, daemon=True).start()
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    
    print("✅ Server started successfully!")
    print("   Press Ctrl+C to stop")
    
    try:
        await asyncio.Event().wait()
    except KeyboardInterrupt:
        print("\n👋 Shutting down server...")
        await runner.cleanup()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Server stopped")
    except Exception as e:
        print(f"❌ Server error: {e}")
        sys.exit(1)
