import json
import os
from pathlib import Path
from typing import Dict, Any, Optional, List, Union
import re
import shutil
import subprocess
from datetime import datetime


class ImageMetadataIndex:
    """
    Persistent, incremental index for image metadata.
    Minimal interface:
      - update(): scan folder and refresh cache on disk
      - get_entry(filename): get cached metadata entry for a file
      - get_dimensions(filename): width/height if available
    """

    def __init__(self, images_folder: Path):
        self.images_folder = Path(images_folder)
        self.index_path = self.images_folder / '.image_index_cache.json'
        self._index: Dict[str, Any] = {}
        self._loaded = False

    def _safe_write_json(self, path: Path, data: Dict[str, Any]) -> None:
        try:
            tmp = path.with_suffix(path.suffix + '.tmp')
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False)
            tmp.replace(path)
        except Exception as e:
            print(f"⚠️ Failed to write index {path}: {e}")

    def _load(self) -> None:
        if self._loaded:
            return
        if self.index_path.exists():
            try:
                with open(self.index_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    self._index = data
            except Exception as e:
                print(f"⚠️ Failed to load image index: {e}")
        self._loaded = True

    def _extract_image_essentials(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        title = None
        essential: Dict[str, Any] = {}
        if isinstance(metadata, dict):
            title = metadata.get('title') or metadata.get('image_title')
            for field in ['id', 'source', 'pageUrl', 'referer', 'extractedDate']:
                if field in metadata:
                    essential[field] = metadata[field]
            if 'dimensions' in metadata and isinstance(metadata['dimensions'], dict):
                essential['dimensions'] = metadata['dimensions']
            tags: List[str] = []
            meta_tags = metadata.get('tags') or metadata.get('image_tags')
            if isinstance(meta_tags, list):
                tags = [str(t) for t in meta_tags]
            elif isinstance(meta_tags, str):
                tags = [meta_tags]
            if tags:
                essential['tags'] = tags
        result: Dict[str, Any] = {}
        if title:
            result['title'] = title
        if essential:
            result['metadata'] = essential
        dims = essential.get('dimensions') if isinstance(essential, dict) else None
        if isinstance(dims, dict):
            w = dims.get('width')
            h = dims.get('height')
            try:
                if w and h:
                    result['width'] = int(w)
                    result['height'] = int(h)
            except Exception:
                pass
        return result

    def update(self) -> None:
        if not self.images_folder.exists():
            return
        self._load()
        index = self._index if isinstance(self._index, dict) else {}
        seen = set()
        changed = False
        for file_path in self.images_folder.rglob('*'):
            if not (file_path.is_file() and file_path.suffix.lower() in {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'}):
                continue
            try:
                stat = file_path.stat()
                filename = file_path.name
                seen.add(filename)
                meta_path = file_path.with_suffix(file_path.suffix + '_metadata.json')
                meta_mtime = 0
                if meta_path.exists() and meta_path.is_file():
                    try:
                        meta_mtime = int(meta_path.stat().st_mtime)
                    except Exception:
                        meta_mtime = 0
                file_mtime = int(stat.st_mtime)
                entry = index.get(filename) if isinstance(index, dict) else None
                if isinstance(entry, dict) and entry.get('file_mtime') == file_mtime and entry.get('metadata_mtime') == meta_mtime:
                    continue
                data: Dict[str, Any] = {
                    'file_mtime': file_mtime,
                    'metadata_mtime': meta_mtime,
                }
                if meta_mtime > 0:
                    try:
                        with open(meta_path, 'r', encoding='utf-8') as f:
                            metadata = json.load(f)
                        essentials = self._extract_image_essentials(metadata)
                        data.update(essentials)
                    except Exception as e:
                        print(f"⚠️ Failed to read image metadata for {filename}: {e}")
                index[filename] = data
                changed = True
            except Exception as e:
                print(f"⚠️ Index update error for {file_path}: {e}")
                continue
        # cleanup
        to_delete: List[str] = []
        for fname in list(index.keys()):
            if fname.startswith('__'):
                continue
            if fname not in seen:
                to_delete.append(fname)
        if to_delete:
            for fname in to_delete:
                index.pop(fname, None)
            changed = True
        if changed:
            try:
                self._safe_write_json(self.index_path, index)
            except Exception:
                pass
        self._index = index

    def get_entry(self, filename: str) -> Optional[Dict[str, Any]]:
        self._load()
        entry = self._index.get(filename)
        return entry if isinstance(entry, dict) else None

    def get_dimensions(self, filename: str) -> Optional[Dict[str, int]]:
        entry = self.get_entry(filename)
        if isinstance(entry, dict):
            w = entry.get('width')
            h = entry.get('height')
            try:
                if w and h:
                    return {'width': int(w), 'height': int(h)}
            except Exception:
                pass
        return None


def read_video_metadata(video_path: Path) -> Dict[str, Any]:
    metadata_path = video_path.with_suffix(video_path.suffix + '_metadata.json')
    if metadata_path.exists():
        try:
            with open(metadata_path, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
            title = None
            essential: Dict[str, Any] = {}
            if isinstance(metadata, dict):
                title = (metadata.get('video_title') or metadata.get('title') or metadata.get('video_data-title'))
                if not title and 'allAttributes' in metadata:
                    attrs = metadata['allAttributes']
                    title = (attrs.get('video_title') or attrs.get('video_data-title') or attrs.get('title')) if isinstance(attrs, dict) else None
                for field in ['id', 'contentId', 'category', 'score', 'poster', 'pageUrl', 'referer', 'extractedDate', 'videoUrl']:
                    if field in metadata:
                        essential[field] = metadata[field]
                if 'dimensions' in metadata:
                    essential['dimensions'] = metadata['dimensions']
                tags: List[str] = []
                meta_tags = metadata.get('tags') or metadata.get('video_tags')
                if isinstance(meta_tags, list):
                    tags = [str(t) for t in meta_tags]
                elif isinstance(meta_tags, str):
                    tags = [meta_tags]
                if tags:
                    essential['tags'] = tags
            if title:
                return {'title': title, 'metadata': essential}
            elif essential:
                return {'metadata': essential}
        except Exception as e:
            print(f"⚠️ Failed to read metadata for {video_path.name}: {e}")
    return {}


def get_video_dimensions(video_path: Path, metadata_info: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    metadata = None
    if metadata_info and 'metadata' in metadata_info:
        metadata = metadata_info['metadata']
    else:
        info = read_video_metadata(video_path)
        metadata = info.get('metadata') if isinstance(info, dict) else None
    if isinstance(metadata, dict):
        width = metadata.get('width') or metadata.get('video_width')
        height = metadata.get('height') or metadata.get('video_height')
        # Also support nested dimensions object
        dims = metadata.get('dimensions') if isinstance(metadata.get('dimensions'), dict) else None
        if dims and (not width or not height):
            width = width or dims.get('width')
            height = height or dims.get('height')
        try:
            if width and height:
                return {'width': int(width), 'height': int(height)}
        except Exception:
            pass
    return {'width': 1920, 'height': 1080}


# -------------------- Tag Helpers and Generators --------------------

def _dget(d: Any, key: str, default: Any = None) -> Any:
    return d.get(key, default) if isinstance(d, dict) else default


def orientation_tag(w: Optional[int], h: Optional[int]) -> Optional[str]:
    try:
        if not w or not h:
            return None
        if w == h:
            return "square"
        return "horizontal" if w > h else "vertical"
    except Exception:
        return None


def rough_res_bucket(w: Optional[int], h: Optional[int]) -> Optional[str]:
    try:
        if not w or not h:
            return None
        pixels = int(w) * int(h)
        if pixels >= 3840 * 2160:
            return "4K"
        if pixels >= 1920 * 1080:
            return "1080+"
        if pixels >= 1280 * 720:
            return "720+"
        return None
    except Exception:
        return None


def score_bucket(score_value: Optional[Union[str, int]]) -> Optional[str]:
    if score_value is None:
        return None
    try:
        if isinstance(score_value, str):
            m = re.search(r"\d+", score_value)
            val = int(m.group(0)) if m else None
        else:
            val = int(score_value)
        if val is None:
            return None
        if val >= 10000:
            return "score/ultra"
        if val >= 1000:
            return "score/high"
        if val >= 100:
            return "score/med"
        return "score/low"
    except Exception:
        return None


def parse_duration_seconds(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        if isinstance(value, (int, float)):
            sec = float(value)
            if sec > 10_000:
                sec = sec / 1000.0
            return sec if sec > 0 else None
        if isinstance(value, str):
            s = value.strip()
            if re.match(r"^\d{1,2}:\d{2}(:\d{2})?$", s):
                parts = [int(p) for p in s.split(":")]
                if len(parts) == 2:
                    return parts[0] * 60 + parts[1]
                if len(parts) == 3:
                    return parts[0] * 3600 + parts[1] * 60 + parts[2]
            m = re.match(r"^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds)?$", s, re.IGNORECASE)
            if m:
                return float(m.group(1))
            m = re.match(r"^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)$", s, re.IGNORECASE)
            if m:
                h = int(m.group(1)) if m.group(1) else 0
                m_ = int(m.group(2)) if m.group(2) else 0
                sec = float(m.group(3)) if m.group(3) else 0.0
                return h * 3600 + m_ * 60 + sec
    except Exception:
        return None
    return None


# -------- ffprobe helpers (shared) --------

_FFPROBE_EXE: Optional[str] = None
_FFPROBE_USE_COMPACT_ENV = None


def _get_ffprobe_exe() -> Optional[str]:
    """Locate ffprobe executable once and cache the path.
    Tries PATH, then common Windows names in the current working directory.
    """
    global _FFPROBE_EXE
    if _FFPROBE_EXE:
        return _FFPROBE_EXE
    cand = shutil.which("ffprobe") or shutil.which("ffprobe.exe")
    if not cand:
        try:
            cwd = Path.cwd()
            for name in ("ffprobe.exe", "ffprobe"):
                p = cwd / name
                if p.exists():
                    cand = str(p)
                    break
        except Exception:
            cand = None
    _FFPROBE_EXE = cand
    return cand


def _ffprobe_run(args: List[str], timeout: int = 8) -> Optional[subprocess.CompletedProcess]:
    """Run ffprobe with provided args; returns CompletedProcess or None if not available/fails to launch."""
    exe = _get_ffprobe_exe()
    if not exe:
        return None
    try:
        return subprocess.run([exe, *args], capture_output=True, text=True, timeout=timeout)
    except Exception:
        return None


def probe_duration_seconds(file_path: Path) -> Optional[float]:
    try:
        ffprobe = _get_ffprobe_exe()
        if not ffprobe:
            return None
        abs_path = str(Path(file_path).resolve())
        # First attempt: plain json output (broad compatibility)
        cmd_plain = [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json",
            abs_path
        ]
        res_plain = _ffprobe_run(cmd_plain, timeout=8)
        if res_plain is not None and res_plain.returncode == 0:
            try:
                data = json.loads(res_plain.stdout or "{}")
                fmt = data.get("format") if isinstance(data, dict) else None
                dur = fmt.get("duration") if isinstance(fmt, dict) else data.get("duration")
                if dur is not None:
                    return float(dur)
            except Exception:
                pass
        elif res_plain is not None:
            if res_plain.stderr:
                print(f"⚠️ ffprobe error (format duration plain): {res_plain.stderr.strip()}")

        # Fallback: try stream duration of the first video stream
        cmd_stream = [
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=duration",
            "-of", "json",
            abs_path
        ]
        res_stream = _ffprobe_run(cmd_stream, timeout=8)
        if res_stream is not None and res_stream.returncode == 0:
            try:
                data = json.loads(res_stream.stdout or "{}")
                streams = data.get("streams") if isinstance(data, dict) else None
                if isinstance(streams, list) and streams:
                    sd = streams[0].get("duration") if isinstance(streams[0], dict) else None
                    if sd is not None:
                        return float(sd)
            except Exception:
                pass
        elif res_stream is not None:
            if res_stream.stderr:
                print(f"⚠️ ffprobe error (stream duration): {res_stream.stderr.strip()}")

        # Optional: compact JSON attempt only if explicitly enabled via env var
        global _FFPROBE_USE_COMPACT_ENV
        if _FFPROBE_USE_COMPACT_ENV is None:
            try:
                _FFPROBE_USE_COMPACT_ENV = os.environ.get("FFPROBE_USE_COMPACT") in {"1", "true", "yes", "on", "True"}
            except Exception:
                _FFPROBE_USE_COMPACT_ENV = False
        if _FFPROBE_USE_COMPACT_ENV:
            cmd_compact = [
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "json=compact=1:nomulti=1",
                abs_path
            ]
            res_c = _ffprobe_run(cmd_compact, timeout=8)
            if res_c is not None and res_c.returncode == 0:
                try:
                    data = json.loads(res_c.stdout or "{}")
                    fmt = data.get("format") if isinstance(data, dict) else None
                    dur = fmt.get("duration") if isinstance(fmt, dict) else data.get("duration")
                    if dur is not None:
                        return float(dur)
                except Exception:
                    pass
            elif res_c is not None and res_c.stderr:
                print(f"⚠️ ffprobe error (format duration compact): {res_c.stderr.strip()}")
        return None
    except Exception:
        return None


def length_bucket(seconds: Optional[float]) -> Optional[str]:
    if seconds is None:
        return None
    try:
        s = float(seconds)
        if s < 10:
            return "len/<10s"
        if s < 30:
            return "len/10-30s"
        if s < 60:
            return "len/30-60s"
        return "len/60s+"
    except Exception:
        return None


def gen_video_tags(file_path: Path, dims: Dict[str, int], meta: Dict[str, Any], do_probe: bool = True) -> List[str]:
    tags: List[str] = ["video"]
    raw_m = meta.get('metadata') if isinstance(meta, dict) else None
    m = raw_m if isinstance(raw_m, dict) else {}
    
    # First, collect any existing tags from metadata
    existing_tags = []
    meta_tags = _dget(m, 'tags') or _dget(m, 'video_tags') or _dget(meta, 'tags') or _dget(meta, 'video_tags')
    if isinstance(meta_tags, list):
        existing_tags = [str(t) for t in meta_tags]
    elif isinstance(meta_tags, str):
        existing_tags = [meta_tags]
    
    # Add existing tags to our collection
    tags.extend(existing_tags)
    
    # Generate auto tags based on file properties
    w, h = dims.get('width'), dims.get('height')
    o = orientation_tag(w, h)
    if o:
        tags.append(o)
    rb = rough_res_bucket(w, h)
    if rb:
        tags.append(rb)
    sb = score_bucket(_dget(m, 'score') or _dget(meta, 'score'))
    if sb:
        tags.append(sb)
    dur = (
        parse_duration_seconds(_dget(m, 'duration') or _dget(m, 'video_duration') or _dget(m, 'length') or _dget(meta, 'duration') or _dget(meta, 'video_duration') or _dget(meta, 'length'))
    )
    if dur is None and do_probe:
        dur = probe_duration_seconds(file_path)
    lb = length_bucket(dur)
    if lb:
        tags.append(lb)
    # Audio presence tag
    has_audio = _dget(m, 'has_audio')
    if has_audio is None and do_probe:
        pa = probe_has_audio(file_path)
        if pa is not None:
            has_audio = pa
    if has_audio is True:
        tags.append("audio/yes")
    elif has_audio is False:
        tags.append("audio/no")
    return sorted(list({str(t) for t in tags}))


class VideoMetadataIndex:
    """
    Persistent, incremental index for video metadata to avoid per-file JSON reads and probes.
    Minimal interface:
      - update(): scan folder and refresh cache on disk
      - get_entry(filename): get cached metadata entry for a file
      - get_dimensions(filename): width/height if available
      - get_duration(filename): seconds if available
    """

    VIDEO_EXTENSIONS = {'.mp4', '.webm', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v', '.3gp'}

    def __init__(self, videos_folder: Path):
        self.videos_folder = Path(videos_folder)
        self.index_path = self.videos_folder / '.video_index_cache.json'
        self._index: Dict[str, Any] = {}
        self._loaded = False

    def _safe_write_json(self, path: Path, data: Dict[str, Any]) -> None:
        try:
            tmp = path.with_suffix(path.suffix + '.tmp')
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False)
            tmp.replace(path)
        except Exception as e:
            print(f"⚠️ Failed to write index {path}: {e}")

    def _load(self) -> None:
        if self._loaded:
            return
        if self.index_path.exists():
            try:
                with open(self.index_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    self._index = data
            except Exception as e:
                print(f"⚠️ Failed to load video index: {e}")
        self._loaded = True

    def _extract_video_essentials(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        title = None
        essential: Dict[str, Any] = {}
        if isinstance(metadata, dict):
            title = (metadata.get('video_title') or metadata.get('title') or metadata.get('video_data-title'))
            if not title and 'allAttributes' in metadata and isinstance(metadata['allAttributes'], dict):
                attrs = metadata['allAttributes']
                title = (attrs.get('video_title') or attrs.get('video_data-title') or attrs.get('title'))
            for field in ['id', 'contentId', 'category', 'score', 'poster', 'pageUrl', 'referer', 'extractedDate', 'videoUrl']:
                if field in metadata:
                    essential[field] = metadata[field]
            if 'dimensions' in metadata and isinstance(metadata['dimensions'], dict):
                essential['dimensions'] = metadata['dimensions']
            # Carry tags if present
            meta_tags = metadata.get('tags') or metadata.get('video_tags')
            if isinstance(meta_tags, list):
                essential['tags'] = [str(t) for t in meta_tags]
            elif isinstance(meta_tags, str):
                essential['tags'] = [meta_tags]
            # Duration normalization if present
            dur = parse_duration_seconds(metadata.get('duration') or metadata.get('video_duration') or metadata.get('length'))
            if dur and dur > 0:
                # Store numeric seconds in canonical key 'duration'
                essential['duration'] = float(dur)
            # Audio presence from metadata
            ha = has_audio_from_metadata_obj(metadata)
            if ha is not None:
                essential['has_audio'] = ha
        result: Dict[str, Any] = {}
        if title:
            result['title'] = title
        if essential:
            result['metadata'] = essential
        # Extract width/height to top-level
        dims = essential.get('dimensions') if isinstance(essential, dict) else None
        if isinstance(dims, dict):
            w = dims.get('width')
            h = dims.get('height')
            try:
                if w and h:
                    result['width'] = int(w)
                    result['height'] = int(h)
            except Exception:
                pass
        return result

    def update(self) -> None:
        if not self.videos_folder.exists():
            return
        self._load()
        index = self._index if isinstance(self._index, dict) else {}
        seen = set()
        changed = False
        for file_path in self.videos_folder.rglob('*'):
            if not (file_path.is_file() and file_path.suffix.lower() in self.VIDEO_EXTENSIONS):
                continue
            try:
                stat = file_path.stat()
                filename = file_path.name
                seen.add(filename)
                meta_path = file_path.with_suffix(file_path.suffix + '_metadata.json')
                meta_mtime = 0
                if meta_path.exists() and meta_path.is_file():
                    try:
                        meta_mtime = int(meta_path.stat().st_mtime)
                    except Exception:
                        meta_mtime = 0
                file_mtime = int(stat.st_mtime)
                entry = index.get(filename) if isinstance(index, dict) else None
                if isinstance(entry, dict) and entry.get('file_mtime') == file_mtime and entry.get('metadata_mtime') == meta_mtime:
                    continue
                data: Dict[str, Any] = {
                    'file_mtime': file_mtime,
                    'metadata_mtime': meta_mtime,
                }
                if meta_mtime > 0:
                    try:
                        with open(meta_path, 'r', encoding='utf-8') as f:
                            metadata = json.load(f)
                        essentials = self._extract_video_essentials(metadata)
                        data.update(essentials)
                    except Exception as e:
                        print(f"⚠️ Failed to read video metadata for {filename}: {e}")
                index[filename] = data
                changed = True
            except Exception as e:
                print(f"⚠️ Video index update error for {file_path}: {e}")
                continue
        # cleanup
        to_delete: List[str] = []
        for fname in list(index.keys()):
            if fname.startswith('__'):
                continue
            if fname not in seen:
                to_delete.append(fname)
        if to_delete:
            for fname in to_delete:
                index.pop(fname, None)
            changed = True
        if changed:
            try:
                self._safe_write_json(self.index_path, index)
            except Exception:
                pass
        self._index = index

    def get_entry(self, filename: str) -> Optional[Dict[str, Any]]:
        self._load()
        entry = self._index.get(filename)
        return entry if isinstance(entry, dict) else None

    def get_dimensions(self, filename: str) -> Optional[Dict[str, int]]:
        entry = self.get_entry(filename)
        if isinstance(entry, dict):
            w = entry.get('width')
            h = entry.get('height')
            try:
                if w and h:
                    return {'width': int(w), 'height': int(h)}
            except Exception:
                pass
        return None

    def get_duration(self, filename: str) -> Optional[float]:
        entry = self.get_entry(filename)
        if isinstance(entry, dict):
            m = entry.get('metadata') if isinstance(entry.get('metadata'), dict) else None
            if m and 'duration' in m:
                try:
                    return float(m['duration'])
                except Exception:
                    return None
        return None

    def get_has_audio(self, filename: str) -> Optional[bool]:
        entry = self.get_entry(filename)
        if isinstance(entry, dict):
            m = entry.get('metadata') if isinstance(entry.get('metadata'), dict) else None
            if isinstance(m, dict) and 'has_audio' in m:
                v = m['has_audio']
                if isinstance(v, bool):
                    return v
                return _normalize_bool(v)
        return None


def gen_image_tags(file_path: Path, dims: Dict[str, int], meta: Dict[str, Any]) -> List[str]:
    tags: List[str] = ["image"]
    raw_m = meta.get('metadata') if isinstance(meta, dict) else None
    m = raw_m if isinstance(raw_m, dict) else {}
    
    # First, collect any existing tags from metadata
    existing_tags = []
    meta_tags = _dget(m, 'tags') or _dget(m, 'image_tags') or _dget(meta, 'tags') or _dget(meta, 'image_tags')
    if isinstance(meta_tags, list):
        existing_tags = [str(t) for t in meta_tags]
    elif isinstance(meta_tags, str):
        existing_tags = [meta_tags]
    
    # Add existing tags to our collection
    tags.extend(existing_tags)
    
    # Generate auto tags based on file properties
    w, h = dims.get('width'), dims.get('height')
    o = orientation_tag(w, h)
    if o:
        tags.append(o)
    rb = rough_res_bucket(w, h)
    if rb:
        tags.append(rb)
    sb = score_bucket(_dget(m, 'score') or _dget(meta, 'score'))
    if sb:
        tags.append(sb)
    return sorted(list({str(t) for t in tags}))


# -------- Audio detection helpers --------

def _normalize_bool(v: Any) -> Optional[bool]:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    if isinstance(v, str):
        s = v.strip().lower()
        if s in {"true", "yes", "y", "1"}:
            return True
        if s in {"false", "no", "n", "0"}:
            return False
    return None


def has_audio_from_metadata_obj(metadata: Dict[str, Any]) -> Optional[bool]:
    try:
        if not isinstance(metadata, dict):
            return None
        # Direct boolean flags
        for key in ("has_audio", "hasAudio", "audio", "sound", "hasSound"):
            if key in metadata:
                nb = _normalize_bool(metadata.get(key))
                if nb is not None:
                    return nb
        if "muted" in metadata:
            nb = _normalize_bool(metadata.get("muted"))
            if nb is True:
                return False
        # Numeric hints
        for key in ("audio_channels", "audioChannels"):
            v = metadata.get(key)
            try:
                if v is not None and int(v) > 0:
                    return True
            except Exception:
                pass
        if metadata.get("audio_bitrate") or metadata.get("audioBitrate"):
            return True
        # Streams list
        streams = metadata.get("streams")
        if isinstance(streams, list):
            for s in streams:
                if isinstance(s, dict) and (s.get("codec_type") == "audio" or s.get("type") == "audio"):
                    return True
            return False  # streams present but no audio listed
        # Nested allAttributes
        attrs = metadata.get("allAttributes")
        if isinstance(attrs, dict):
            ha = has_audio_from_metadata_obj(attrs)
            if ha is not None:
                return ha
    except Exception:
        return None
    return None


def probe_has_audio(file_path: Path) -> Optional[bool]:
    try:
        ffprobe = _get_ffprobe_exe()
        if not ffprobe:
            return None
        cmd = [
            "-v", "error",
            "-select_streams", "a",
            "-show_entries", "stream=codec_type",
            "-of", "csv=p=0",
            str(Path(file_path).resolve())
        ]
        res = _ffprobe_run(cmd, timeout=6)
        if res is None:
            return None
        if res.returncode != 0:
            if res.stderr:
                print(f"⚠️ ffprobe error (audio detect): {res.stderr.strip()}")
            return None
        out = (res.stdout or "").strip()
        if out:
            return True
        return False
    except Exception:
        return None
