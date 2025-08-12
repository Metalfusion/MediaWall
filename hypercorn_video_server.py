"""
Hypercorn + Quart Video Server
Static files served by Hypercorn, Python handles only video streaming and APIs
"""

import asyncio
import os
import sys
import mimetypes
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any

try:
    from quart import Quart, request, Response, jsonify, send_file
    from quart.helpers import make_response
    from hypercorn.config import Config
    from hypercorn.asyncio import serve
except ImportError:
    print("❌ Missing dependencies. Install with:")
    print("   pip install hypercorn quart")
    sys.exit(1)

# Import our video scanning logic
from react_video_server import IntegratedVideoServer

def create_video_api_app(videos_folder: Path, react_build_folder: Optional[Path] = None) -> Quart:
    """Create Quart app that only handles video APIs and streaming"""
    app = Quart(__name__)
    
    # Create server instance for video scanning (captured in closures)
    server = IntegratedVideoServer(videos_folder)
    
    # Store whether we have static files (not strictly needed here)
    has_static_files = react_build_folder and react_build_folder.exists()
    
    @app.route('/api/videos')
    async def api_videos():
        """Get list of videos"""
        force = request.args.get('refresh') in ('1', 'true', 'yes')
        data = server.scan_videos(force_refresh=force)
        resp = await make_response(jsonify(data))
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Cache-Control'] = 'public, max-age=300'
        if server.cache_timestamp:
            resp.headers['Last-Modified'] = server.cache_timestamp.strftime('%a, %d %b %Y %H:%M:%S GMT')
        return resp
    
    @app.route('/api/music')
    async def api_music():
        """Get list of music tracks"""
        music_data = server.scan_music()
        
        response = await make_response(jsonify(music_data))
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Cache-Control'] = 'public, max-age=300'
        return response

    @app.route('/api/images')
    async def api_images():
        """Get list of images"""
        force = request.args.get('refresh') in ('1', 'true', 'yes')
        data = server.scan_images(force_refresh=force)
        resp = await make_response(jsonify(data))
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Cache-Control'] = 'public, max-age=300'
        return resp
    
    @app.route('/api/refresh', methods=['POST'])
    async def api_refresh():
        """Force cache refresh"""
        server.cache_timestamp = None
        server.music_cache_timestamp = None
        server.video_cache = {}
        server.image_cache = {}
        server.music_cache = {}
        # Clear persistent API caches on disk
        try:
            server.clear_api_cache()
        except Exception:
            pass
        
        video_data = server.scan_videos(force_refresh=True)
        music_data = server.scan_music()
        
        return jsonify({
            "status": "refreshed",
            "videos": len(video_data.get("videos", [])),
            "music": len(music_data.get("tracks", [])),
            "timestamp": datetime.now().isoformat()
        })
    
    @app.route('/videos/<filename>')
    async def serve_video(filename: str):
        """Serve video files with optimized streaming"""
        file_path = server.videos_folder / filename
        
        if not file_path.exists() or not file_path.is_file():
            return "Video not found", 404
        
        # Get file stats
        stat = file_path.stat()
        file_size = stat.st_size
        last_modified = datetime.fromtimestamp(stat.st_mtime)
        
        # Handle conditional requests
        if_modified_since = request.headers.get('If-Modified-Since')
        if if_modified_since:
            try:
                client_time = datetime.strptime(if_modified_since, '%a, %d %b %Y %H:%M:%S GMT')
                if last_modified.replace(microsecond=0) <= client_time:
                    return "", 304
            except ValueError:
                pass
        
        # Handle range requests for video streaming
        range_header = request.headers.get('Range')
        
        if range_header:
            # Parse range
            try:
                ranges = range_header.replace('bytes=', '').split('-')
                start = int(ranges[0]) if ranges[0] else 0
                end = int(ranges[1]) if ranges[1] else file_size - 1
                
                start = max(0, min(start, file_size - 1))
                end = max(start, min(end, file_size - 1))
                content_length = end - start + 1
                
                # Create streaming response
                async def generate_chunks():
                    with open(file_path, 'rb') as f:
                        f.seek(start)
                        remaining = content_length
                        chunk_size = 64 * 1024  # 64KB chunks
                        
                        while remaining > 0:
                            to_read = min(chunk_size, remaining)
                            chunk = f.read(to_read)
                            if not chunk:
                                break
                            remaining -= len(chunk)
                            yield chunk
                
                mime_type = mimetypes.guess_type(str(file_path))[0] or 'video/mp4'
                
                response = Response(
                    generate_chunks(),
                    206,  # Partial Content
                    headers={
                        'Content-Type': mime_type,
                        'Content-Length': str(content_length),
                        'Content-Range': f'bytes {start}-{end}/{file_size}',
                        'Accept-Ranges': 'bytes',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'public, max-age=86400',
                        'Last-Modified': last_modified.strftime('%a, %d %b %Y %H:%M:%S GMT'),
                        'Connection': 'keep-alive'
                    }
                )
                return response
                
            except (ValueError, IndexError):
                pass  # Fall through to full file
        
        # Serve full file
        try:
            response = await send_file(file_path, conditional=True)
            response.headers['Accept-Ranges'] = 'bytes'
            response.headers['Access-Control-Allow-Origin'] = '*'
            response.headers['Cache-Control'] = 'public, max-age=86400'
            response.headers['Connection'] = 'keep-alive'
            return response
        except Exception as e:
            print(f"❌ Error serving video {filename}: {e}")
            return "Internal server error", 500
    
    @app.route('/music/<filename>')
    async def serve_music(filename: str):
        """Serve music files"""
        if not server.music_folder:
            return "Music folder not found", 404
            
        file_path = server.music_folder / filename
        
        if not file_path.exists():
            return "Music file not found", 404
        
        try:
            response = await send_file(file_path, conditional=True)
            # Explicit audio content type helps some browsers compute duration
            mime = mimetypes.guess_type(str(file_path))[0] or 'audio/mpeg'
            response.headers['Content-Type'] = mime
            response.headers['Accept-Ranges'] = 'bytes'
            response.headers['Access-Control-Allow-Origin'] = '*'
            response.headers['Cache-Control'] = 'public, max-age=86400'
            try:
                response.headers['Content-Length'] = str(file_path.stat().st_size)
            except Exception:
                pass
            return response
        except Exception as e:
            print(f"❌ Error serving music {filename}: {e}")
            return "Internal server error", 500

    @app.route('/images/<filename>')
    async def serve_image(filename: str):
        """Serve image files"""
        if not hasattr(server, 'images_folder') or not server.images_folder:
            return "Images folder not found", 404
        file_path = server.images_folder / filename
        if not file_path.exists():
            return "Image not found", 404
        try:
            response = await send_file(file_path, conditional=True)
            response.headers['Accept-Ranges'] = 'bytes'
            response.headers['Access-Control-Allow-Origin'] = '*'
            response.headers['Cache-Control'] = 'public, max-age=86400'
            return response
        except Exception as e:
            print(f"❌ Error serving image {filename}: {e}")
            return "Internal server error", 500
    
    @app.route('/')
    async def index():
        """Serve index page or React app"""
        if has_static_files and react_build_folder is not None:
            # Serve React app's index.html
            index_file = react_build_folder / 'index.html'
            if index_file.exists():
                try:
                    return await send_file(index_file)
                except Exception as e:
                    print(f"❌ Error serving index.html: {e}")
                    return "Error loading React app", 500
            else:
                return "React build index.html not found", 404
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Video Viewer Server</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }}
                .container {{ max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }}
                .status {{ padding: 15px; border-radius: 5px; margin: 10px 0; }}
                .success {{ background: #d4edda; color: #155724; }}
                .warning {{ background: #fff3cd; color: #856404; }}
                .error {{ background: #f8d7da; color: #721c24; }}
                pre {{ background: #f8f9fa; padding: 15px; border-radius: 5px; }}
                a {{ color: #007bff; text-decoration: none; }}
                a:hover {{ text-decoration: underline; }}
                .endpoint {{ background: #e9ecef; padding: 10px; margin: 5px 0; border-radius: 3px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎬 Video Viewer Server</h1>
                
                <div class="status warning">
                    <strong>⚠️ Development Mode</strong><br>
                    Static React files not found. The server is running in API-only mode.
                </div>
                
                <h2>📡 Available Endpoints:</h2>
                <div class="endpoint">
                    <strong>📺 Videos API:</strong> <a href="/api/videos">/api/videos</a>
                </div>
                <div class="endpoint">
                    <strong>🎵 Music API:</strong> <a href="/api/music">/api/music</a>
                </div>
                <div class="endpoint">
                    <strong>🔄 Refresh Cache:</strong> POST /api/refresh
                </div>
                
                <h2>🚀 Setup Instructions:</h2>
                
                <h3>For Development:</h3>
                <pre>npm run dev</pre>
                <p>Then browse to: <a href="http://localhost:3000">http://localhost:3000</a></p>
                
                <h3>For Production:</h3>
                <pre>npm run build
 python hypercorn_video_server.py videos dist</pre>
                <p>Then browse to: <a href="http://localhost:8000">http://localhost:8000</a></p>
                
                <h2>📊 Server Status:</h2>
                <div class="status success">
                    <strong>✅ Server Running:</strong> Hypercorn with HTTP/2<br>
                    <strong>📁 Videos Folder:</strong> {server.videos_folder}<br>
                    <strong>🎵 Music Folder:</strong> {server.music_folder or 'Not found'}<br>
                </div>
            </div>
        </body>
        </html>
        """
        resp = await make_response(html)
        resp.headers['Content-Type'] = 'text/html; charset=utf-8'
        return resp
    
    # Handle static assets (JS, CSS, etc.)
    @app.route('/assets/<path:filename>')
    async def serve_assets(filename: str):
        """Serve static assets from React build"""
        if has_static_files and react_build_folder:
            asset_file = react_build_folder / 'assets' / filename
            if asset_file.exists():
                return await send_file(asset_file)
        return "Asset not found", 404
    
    # Catch-all route for React routing (when build folder exists)
    @app.route('/<path:path>')
    async def catch_all_or_react_routing(path: str):
        """Handle React routing or show 404"""
        if has_static_files and react_build_folder:
            # For React SPA routing, always serve index.html for non-API routes
            index_file = react_build_folder / 'index.html'
            if index_file.exists():
                try:
                    return await send_file(index_file)
                except Exception as e:
                    print(f"❌ Error serving index.html for route /{path}: {e}")
                    return "Error loading React app", 500
            else:
                return "React build index.html not found", 404
        else:
            # No static files - show 404
            return f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Page Not Found</title>
                <style>
                    body {{ font-family: Arial, sans-serif; margin: 40px; text-align: center; }}
                    .error {{ color: #dc3545; }}
                </style>
            </head>
            <body>
                <h1 class="error">404 - Page Not Found</h1>
                <p>The page "/{path}" was not found.</p>
                <p><a href="/">← Go to Home</a></p>
                
                <hr>
                <p><small>Hypercorn Video Server - API Mode</small></p>
            </body>
            </html>
            """, 404
    
    return app

def create_hypercorn_config(
    static_dir: Optional[Path] = None,
    port: int = 8000,
    enable_http2: bool = True
) -> Config:
    """Create optimized Hypercorn configuration"""
    config = Config()
    
    # Basic server settings
    config.bind = [f"0.0.0.0:{port}"]
    config.workers = 1  # Single worker for development
    
    # Enable HTTP/2 for better performance (if supported)
    if enable_http2:
        try:
            config.alpn_protocols = ['h2', 'http/1.1']
        except AttributeError:
            pass  # Older hypercorn version
    
    # TLS (HTTPS) auto-configuration: use a single .pem in CWD or script dir if present
    try:
        cwd = Path.cwd()
        script_dir = Path(__file__).parent
        pem_candidates = list(cwd.glob("*.pem"))
        if not pem_candidates:
            pem_candidates = list(script_dir.glob("*.pem"))
        chosen: Optional[Path] = None
        if len(pem_candidates) == 1:
            chosen = pem_candidates[0]
        elif len(pem_candidates) > 1:
            localhost_pems = [p for p in pem_candidates if "localhost" in p.name.lower()]
            if len(localhost_pems) == 1:
                chosen = localhost_pems[0]
        if chosen and chosen.exists():
            config.certfile = str(chosen)
            # Try to infer a separate key file named "<stem>-key.pem" next to the cert
            inferred_key = chosen.with_name(chosen.stem + "-key.pem")
            if inferred_key.exists():
                config.keyfile = str(inferred_key)
                print(f"🔐 TLS enabled (cert: {chosen.name}, key: {inferred_key.name})")
            else:
                print(f"🔐 TLS enabled (cert: {chosen.name})")
        elif pem_candidates:
            names = ", ".join(p.name for p in pem_candidates)
            print(f"ℹ️  Multiple .pem files found (no unique choice): {names}. Skipping TLS auto-config.")
    except Exception as e:
        print(f"⚠️  TLS auto-config failed: {e}")

    # Note: Static files are handled by Quart routes, not Hypercorn static_files
    if static_dir and static_dir.exists():
        print(f"📁 Static files handled by Quart: {static_dir}")
    else:
        print(f"⚠️  No static files - API-only mode")
    
    # Performance optimizations (with fallbacks for older versions)
    try:
        config.keep_alive_timeout = 65
    except AttributeError:
        pass
    
    try:
        config.read_timeout = 60
    # Note: Some Hypercorn versions don't expose write_timeout; omit to avoid attribute errors
    except AttributeError:
        pass
    
    # Logging
    try:
        config.access_log_format = '%(h)s "%(r)s" %(s)s %(b)s %(D)sms'
        config.accesslog = "-"  # stdout
    except AttributeError:
        pass
    
    return config

async def main():
    """Main function to run Hypercorn server"""
    if len(sys.argv) < 2:
        print("Usage: python hypercorn_video_server.py <videos_folder> [react_build_folder]")
        print("Example: python hypercorn_video_server.py ./videos ./dist")
        sys.exit(1)
    
    videos_folder = Path(sys.argv[1])
    react_build_folder = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    
    if not videos_folder.exists():
        print(f"❌ Videos folder does not exist: {videos_folder}")
        sys.exit(1)
    
    # Create the Quart app for APIs and video streaming
    app = create_video_api_app(videos_folder, react_build_folder)
    
    # Create Hypercorn config with static file serving
    enable_http2 = True
    config = create_hypercorn_config(
        static_dir=react_build_folder,
        port=8000,
        enable_http2=enable_http2
    )
    
    print(f"🚀 Starting Hypercorn Video Server...")
    print(f"   📁 Videos: {videos_folder.absolute()}")
    scheme = "https" if getattr(config, 'certfile', None) else "http"
    print(f"   🌐 Server: {scheme}://localhost:8000")
    print(f"   📺 API: {scheme}://localhost:8000/api/videos")
    print(f"   📷 Image API: {scheme}://localhost:8000/api/images")
    print(f"   🎵 Music API: {scheme}://localhost:8000/api/music")
    print(f"   ⚡ HTTP/2: {'Enabled' if enable_http2 else 'Disabled'}")
    
    if react_build_folder and react_build_folder.exists():
        print(f"   ⚛️  React app: Serving from {react_build_folder}")
        print(f"   📄 React routes: All non-API paths serve React SPA")
    else:
        print(f"   ⚠️  No React build folder - only API endpoints available")
        print(f"      Run 'npm run build' and restart with build folder path")
    
    try:
        await serve(app, config)
    except Exception as e:
        print(f"❌ Server error: {e}")

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Hypercorn server stopped")
    except Exception as e:
        print(f"❌ Failed to start server: {e}")
        sys.exit(1)
