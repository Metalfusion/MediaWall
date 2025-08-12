import os
import json
from pathlib import Path
from datetime import datetime
from PIL import Image, ExifTags
import subprocess

ROOT_FOLDER = "c:\\Temp\\images"
FFPROBE_PATH = 'ffprobe.exe'  # Adjust path if necessary


def extract_image_metadata(image_path):
    metadata = {}
    try:
        with Image.open(image_path) as img:
            metadata['filename'] = image_path.name
            metadata['dimensions'] = {
                'width': img.width,
                'height': img.height
            }
            metadata['format'] = img.format
            metadata['mode'] = img.mode
            # Extract EXIF if available (use public API)
            exif_data = img.getexif()
            if exif_data:
                exif = {}
                for k, v in exif_data.items():
                    tag = ExifTags.TAGS.get(k, k)
                    exif[tag] = v
                metadata['exif'] = exif
                # Try to get title from EXIF
                title = exif.get('ImageDescription') or exif.get('XPTitle')
                if title:
                    metadata['exif_title'] = title
    except Exception as e:
        metadata['error'] = str(e)
    
    metadata['extractedDate'] = datetime.utcnow().isoformat() + 'Z'
    return metadata

def extract_video_metadata(video_path, ffprobe_path='ffprobe.exe'):
    metadata = {'filename': video_path.name}
    try:
        cmd = [
            ffprobe_path,
            '-v', 'error',
            '-show_entries', 'format:stream',
            '-of', 'json',
            str(video_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            info = json.loads(result.stdout)
            metadata.update(info)
        else:
            metadata['error'] = result.stderr
    except Exception as e:
        metadata['error'] = str(e)
    metadata['extractedDate'] = datetime.utcnow().isoformat() + 'Z'
    return metadata

def index_folder(root_folder):
    image_exts = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'}
    video_exts = {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv'}
    for dirpath, _, filenames in os.walk(root_folder):
        for fname in filenames:
            fpath = Path(dirpath) / fname
            ext = fpath.suffix.lower()
            if ext in image_exts:
                meta = extract_image_metadata(fpath)
                out_path = fpath.with_suffix(fpath.suffix + '_metadata.json')
                with open(out_path, 'w', encoding='utf-8') as f:
                    json.dump(meta, f, indent=2, ensure_ascii=False)
            elif ext in video_exts:
                meta = extract_video_metadata(fpath, ffprobe_path=FFPROBE_PATH)
                out_path = fpath.with_suffix(fpath.suffix + '_metadata.json')
                with open(out_path, 'w', encoding='utf-8') as f:
                    json.dump(meta, f, indent=2, ensure_ascii=False)

if __name__ == '__main__':
    # Use constants for configuration
    index_folder(ROOT_FOLDER)
