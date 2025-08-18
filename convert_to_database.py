#!/usr/bin/env python3
"""
MediaWall Database Converter
Converts individual metadata JSON files to a single database JSON file.

Usage: python convert_to_database.py [folders...] -o <output_file>

Example:
  python convert_to_database.py -o media_database.json
  python convert_to_database.py videos images -o media_database.json
"""

import json
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional
import argparse


def find_metadata_files(folder: Path) -> List[Path]:
    """Find all metadata JSON files in a folder"""
    metadata_files = []
    for file_path in folder.rglob('*_metadata.json'):
        metadata_files.append(file_path)
    return metadata_files


def load_metadata_file(metadata_path: Path, base_path: Path) -> Optional[Dict[str, Any]]:
    """Load and process a metadata file"""
    try:
        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
        
        # Determine the actual media file path
        # Remove _metadata.json to get the original filename
        filename_with_ext = metadata_path.name
        if filename_with_ext.endswith('_metadata.json'):
            original_filename = filename_with_ext[:-len('_metadata.json')]
            media_file = metadata_path.parent / original_filename
        else:
            print(f"⚠️ Invalid metadata filename format: {metadata_path}")
            return None
            
        if not media_file.exists():
            print(f"⚠️ Media file not found: {media_file} (from {metadata_path})")
            return None
        
        # Determine media type from extension
        ext = media_file.suffix.lower()
        if ext in ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v', '.3gp']:
            media_type = 'video'
        elif ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']:
            media_type = 'image'
        else:
            print(f"⚠️ Unknown media type for {media_file}")
            return None
        
        # Calculate relative path from base
        try:
            rel_path = media_file.relative_to(base_path)
        except ValueError:
            # If not relative, use absolute path
            rel_path = media_file
        
        # Create database entry
        entry = {
            'filename': media_file.name,
            'path': str(rel_path).replace('\\', '/'),  # Use forward slashes
            'mediaType': media_type
        }
        
        # Copy all metadata fields
        if isinstance(metadata, dict):
            for key, value in metadata.items():
                if key not in ['filename', 'path', 'mediaType']:
                    entry[key] = value
        
        return entry
        
    except Exception as e:
        print(f"❌ Error processing {metadata_path}: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description='Convert MediaWall metadata files to database format')
    parser.add_argument('folders', nargs='*', default=['videos', 'images'], help='Folders to scan for metadata files (default: videos images)')
    parser.add_argument('-o', '--output', required=True, help='Output database JSON file')
    parser.add_argument('--base-path', help='Base path for relative file paths (default: current directory)')
    
    args = parser.parse_args()
    
    # Use default folders if none specified
    if not args.folders:
        args.folders = ['videos', 'images']
    
    # Determine base path
    base_path = Path(args.base_path) if args.base_path else Path.cwd()
    output_path = Path(args.output)
    
    print(f"🔄 Converting metadata files to database format...")
    print(f"📁 Base path: {base_path}")
    print(f"📄 Output: {output_path}")
    
    # Collect all metadata files
    all_metadata_files = []
    for folder_str in args.folders:
        folder = Path(folder_str)
        if not folder.exists():
            print(f"⚠️ Folder not found: {folder}")
            continue
        
        metadata_files = find_metadata_files(folder)
        print(f"📁 Found {len(metadata_files)} metadata files in {folder}")
        all_metadata_files.extend(metadata_files)
    
    print(f"📊 Total metadata files: {len(all_metadata_files)}")
    
    # Process all metadata files
    database_entries = []
    for metadata_path in all_metadata_files:
        entry = load_metadata_file(metadata_path, base_path)
        if entry:
            database_entries.append(entry)
    
    # Sort by filename for consistency
    database_entries.sort(key=lambda x: x['filename'])
    
    # Write database file
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(database_entries, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Successfully created database with {len(database_entries)} entries")
        print(f"📄 Database saved to: {output_path}")
        
        # Show summary
        video_count = sum(1 for e in database_entries if e['mediaType'] == 'video')
        image_count = sum(1 for e in database_entries if e['mediaType'] == 'image')
        print(f"📺 Videos: {video_count}")
        print(f"🖼️ Images: {image_count}")
        
        print(f"\n🚀 To use the database, run:")
        print(f"   python react_video_server.py --database {output_path}")
        print(f"   python hypercorn_video_server.py --database {output_path}")
        
    except Exception as e:
        print(f"❌ Error writing database file: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
