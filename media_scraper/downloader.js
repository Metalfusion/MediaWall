// ==UserScript==
// @name         Media Index Generator (Imgur) - Unified
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Generate downloadable unified index of all visible videos and images from imgur.com with persistent history
// @author       You
// @match        https://imgur.com/*
// @match        https://www.imgur.com/*
// @match        https://i.imgur.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.log('Media Index Generator (Imgur) loaded');

    // Configuration - unified for all media
    const CONFIG = {
        videoFolderName: 'media',
        imageFolderName: 'media' // Same folder for both
    };

    // Tracking - unified for all media types with full metadata storage
    let mediaHistory = new Map(); // Map of ID -> full media metadata
    let currentScanResults = { videos: [], images: [] };
    let totalFound = 0;
    let autoScanInterval = null;
    let isAutoScanning = false;

    // Load media history with full metadata
    function loadMediaHistory() {
        const saved = GM_getValue('mediaHistory', '{}');
        try {
            const parsedHistory = JSON.parse(saved);
            mediaHistory = new Map(Object.entries(parsedHistory));
            console.log(`Loaded ${mediaHistory.size} media items from history`);
        } catch (e) {
            console.warn('Failed to load media history:', e);
            mediaHistory = new Map();
        }
    }

    // Save media history with full metadata
    function saveMediaHistory() {
        const historyObject = Object.fromEntries(mediaHistory);
        GM_setValue('mediaHistory', JSON.stringify(historyObject));
    }

    // Create index generator UI - simplified
    function createIndexUI() {
        const ui = document.createElement('div');
        ui.id = 'index-ui';
        ui.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #2c3e50;
            color: white;
            padding: 15px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 12px;
            z-index: 10000;
            min-width: 280px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        `;
        
        ui.innerHTML = `
            <div style="margin-bottom: 10px; font-weight: bold; color: #3498db;">📋 Media Index Generator</div>
            <div style="margin-bottom: 10px;">
                <label style="display: block; margin-bottom: 5px;">Output Folder:</label>
                <input type="text" id="media-folder-name" value="${CONFIG.videoFolderName}" style="width: 100%; padding: 4px; border: 1px solid #7f8c8d; border-radius: 3px; background: #34495e; color: white;">
            </div>
            <div id="stats" style="margin-bottom: 10px; background: #34495e; padding: 8px; border-radius: 5px;">
                <div>Total Videos: <span id="videos-count">0</span></div>
                <div>Total Images: <span id="images-count">0</span></div>
                <div>Total Media: <span id="total-count">0</span></div>
                <div>History Items: <span id="history-count">${mediaHistory.size}</span></div>
            </div>
            <div style="margin-bottom: 10px; display: flex; gap: 5px;">
                <button id="scan-media" style="background: #3498db; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; width: 70%;">🔍 Scan Current Page</button>
                <button id="auto-scan-toggle" style="background: #95a5a6; color: white; border: none; padding: 8px 10px; border-radius: 4px; cursor: pointer; width: 30%; font-size: 11px;">⚡ Auto</button>
            </div>
            <div style="margin-bottom: 10px;">
                <button id="download-index" style="background: #27ae60; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; width: 100%;" disabled>📥 Download Index</button>
            </div>
            <div style="margin-bottom: 10px;">
                <button id="clear-index" style="background: #e74c3c; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; width: 100%;">�️ Clear Index History</button>
            </div>
            <div id="status" style="margin-top: 10px; font-size: 11px; color: #bdc3c7;">Ready to scan media...</div>
        `;
        
        document.body.appendChild(ui);
        
        // Add event listeners
        document.getElementById('scan-media').onclick = scanMedia;
        document.getElementById('download-index').onclick = downloadIndex;
        document.getElementById('clear-index').onclick = clearIndex;
        document.getElementById('auto-scan-toggle').onclick = toggleAutoScan;
        document.getElementById('media-folder-name').onchange = saveSettings;
        
        return ui;
    }

    // Save user settings - simplified
    function saveSettings() {
        CONFIG.videoFolderName = document.getElementById('media-folder-name').value || 'media';
        CONFIG.imageFolderName = CONFIG.videoFolderName; // Use same folder for both
        
        GM_setValue('indexSettings', JSON.stringify(CONFIG));
        console.log('Settings saved:', CONFIG);
    }

    // Load user settings
    function loadSettings() {
        const saved = GM_getValue('indexSettings', '{}');
        const savedConfig = JSON.parse(saved);
        
        Object.assign(CONFIG, savedConfig);
        console.log('Settings loaded:', CONFIG);
    }

    // Update UI stats - shows accumulated history totals
    function updateUI() {
        // Count total accumulated videos and images from history
        let totalVideos = 0;
        let totalImages = 0;
        
        for (const [id, media] of mediaHistory) {
            if (media.mediaType === 'video') totalVideos++;
            else if (media.mediaType === 'image') totalImages++;
        }
        
        const totalCount = totalVideos + totalImages;
        
        document.getElementById('videos-count').textContent = totalVideos;
        document.getElementById('images-count').textContent = totalImages;
        document.getElementById('total-count').textContent = totalCount;
        document.getElementById('history-count').textContent = mediaHistory.size;
        
        // Enable/disable download button
        const downloadBtn = document.getElementById('download-index');
        if (totalCount > 0) {
            downloadBtn.disabled = false;
            downloadBtn.style.opacity = '1';
        } else {
            downloadBtn.disabled = true;
            downloadBtn.style.opacity = '0.5';
        }
    }

    // Toggle auto-scanning feature
    function toggleAutoScan() {
        if (isAutoScanning) {
            stopAutoScan();
        } else {
            startAutoScan();
        }
    }

    // Start auto-scanning every 5 seconds
    function startAutoScan() {
        if (autoScanInterval) return; // Already running
        
        isAutoScanning = true;
        const toggleBtn = document.getElementById('auto-scan-toggle');
        toggleBtn.style.background = '#e67e22';
        toggleBtn.innerHTML = '⚡ ON';
        
        // Run initial scan
        scanMedia(true);
        
        // Set up interval to scan every 5 seconds
        autoScanInterval = setInterval(() => {
            scanMedia(true);
        }, 5000);
        
        console.log('Auto-scan started (every 5 seconds)');
        document.getElementById('status').textContent = 'Auto-scan enabled - scanning every 5 seconds...';
    }

    // Stop auto-scanning
    function stopAutoScan() {
        if (autoScanInterval) {
            clearInterval(autoScanInterval);
            autoScanInterval = null;
        }
        
        isAutoScanning = false;
        const toggleBtn = document.getElementById('auto-scan-toggle');
        toggleBtn.style.background = '#95a5a6';
        toggleBtn.innerHTML = '⚡ Auto';
        
        console.log('Auto-scan stopped');
        document.getElementById('status').textContent = 'Auto-scan disabled. Click "Scan Current Page" for manual scanning.';
    }

    // Generate unique filename to avoid conflicts
    function generateUniqueFilename(metadata) {
        const timestamp = new Date().toISOString().replace(/[:.-]/g, '').substring(0, 15);
        const safeTitle = metadata.title.replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 30);
        const safeCategory = metadata.category && metadata.category !== 'unknown' 
            ? metadata.category.replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 20)
            : '';
        const mediaUrl = metadata.videoUrl || metadata.imageUrl || metadata.thumbUrl || '';
        const extension = mediaUrl ? getFileExtension(mediaUrl) : (metadata.videoUrl ? 'mp4' : 'jpg');
        
        let filename = `${timestamp}_${metadata.id}`;
        if (safeCategory) filename += `_${safeCategory}`;
        if (safeTitle && safeTitle !== 'Untitled') filename += `_${safeTitle}`;
        filename += `.${extension}`;
        
        return filename;
    }

    // Extract comprehensive video metadata
    function extractVideoMetadata(container) {
        const $container = $(container);
        const $video = $container.find('video').first();

        // Prefer title in the Imgur tile
        const titleFromTile = $container.find('.Post-item-title span').first().text().trim();

        // Get the first source URL
        let src = null;
        const $source = $video.find('source').first();
        if ($source.length) src = $source.attr('src') || $source.attr('data-src');
        if (!src && $video.attr('src')) src = $video.attr('src');

        // Derive a stable id from the Imgur file name, e.g. aqTLEC1_lq.mp4 -> aqTLEC1
        let id = $container.attr('data-video-id') || null;
        if (!id && src) {
            try {
                const u = new URL(src);
                const base = u.pathname.split('/').pop() || '';
                id = base.replace(/_[a-z]+(?=\.[^.]+$)/i, '').replace(/\.[^.]+$/, '');
            } catch (e) { /* ignore */ }
        }

        // Attempt to get HQ mp4 by removing _lq
        let videoUrl = src || null;
        if (videoUrl && /_lq\.mp4$/i.test(videoUrl)) {
            videoUrl = videoUrl.replace(/_lq\.mp4$/i, '.mp4');
        }

        const metadata = {
            id: id,
            contentId: id,
            title: titleFromTile || $video.attr('title') || 'Untitled',
            poster: $video.attr('poster') || null,
            dimensions: {
                width: $video.attr('width') || $video.css('width') || 'unknown',
                height: $video.attr('height') || $video.css('height') || 'unknown'
            },
            category: 'unknown',
            score: $container.find('.Post-item-vote-points').first().text().trim() || 'unknown',
            pageUrl: window.location.href,
            extractedDate: new Date().toISOString(),
            videoUrl: videoUrl,
            filename: null,
            containerHtml: $container.prop('outerHTML').substring(0, 1000),
            allAttributes: {},
            cookies: document.cookie,
            userAgent: navigator.userAgent,
            referer: document.referrer || window.location.href
        };

        // Collect attributes
        if ($container[0]) {
            Array.from($container[0].attributes).forEach(attr => {
                metadata.allAttributes[`container_${attr.name}`] = attr.value;
            });
        }
        if ($video[0]) {
            Array.from($video[0].attributes).forEach(attr => {
                metadata.allAttributes[`video_${attr.name}`] = attr.value;
            });
        }

        if (metadata.videoUrl) {
            metadata.filename = generateUniqueFilename(metadata);
        }

        return metadata;
    }

    // Get file extension from URL
    function getFileExtension(url) {
        try {
            // Prefer original image extension from query param if present
            const u = new URL(url, window.location.origin);
            const imageParam = u.searchParams.get('image');
            if (imageParam) {
                const m = imageParam.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
                if (m) return m[1].toLowerCase();
            }
        } catch (e) { /* ignore */ }
        const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
        return match ? match[1].toLowerCase() : 'bin';
    }

    // Unified scan for both videos and images
    function scanMedia(isAutoScan = false) {
        if (!isAutoScan) {
            document.getElementById('status').textContent = 'Scanning Imgur page for videos and images...';
        }

        const videos = [];
        const images = [];
        let scannedCount = 0;

        $('.Post-item-container').each(function() {
            scannedCount++;
            const $container = $(this);
            const hasVideo = $container.find('video').length > 0;
            const $img = $container.find('.imageContainer img, img').first();
            const hasImage = $img.length > 0 && !hasVideo;

            if (hasVideo) {
                const meta = extractVideoMetadata(this);
                if (meta.videoUrl && meta.id) {
                    // Add mediaType for proper categorization
                    meta.mediaType = 'video';
                    videos.push(meta);
                    // Store full metadata in history
                    mediaHistory.set(meta.id, meta);
                    if (!$(this).attr('data-video-id') && meta.id) $(this).attr('data-video-id', meta.id);
                    console.log('Found video:', meta.filename);
                } else {
                    console.warn('Incomplete metadata for video container', meta);
                }
            } else if (hasImage) {
                const meta = extractImageMetadata(this);
                if (meta.imageUrl && meta.id) {
                    // Add mediaType for proper categorization
                    meta.mediaType = 'image';
                    images.push(meta);
                    // Store full metadata in history
                    mediaHistory.set(meta.id, meta);
                    console.log('Found image:', meta.filename);
                } else {
                    console.warn('Incomplete metadata for image:', meta);
                }
            }
        });

        // Fallback: single-post pages without tile wrapper
        if (videos.length === 0 && images.length === 0) {
            $('video').each(function() {
                const meta = extractVideoMetadata(this);
                if (meta.videoUrl && meta.id) {
                    meta.mediaType = 'video';
                    videos.push(meta);
                    mediaHistory.set(meta.id, meta);
                }
            });

            $('.imageContainer img, img[src*="i.imgur.com"]').each(function() {
                // Skip if part of a video poster
                if ($(this).closest('video').length) return;
                const meta = extractImageMetadata($(this).closest('.Post-item-container')[0] || this);
                if (meta.imageUrl && meta.id) {
                    meta.mediaType = 'image';
                    images.push(meta);
                    mediaHistory.set(meta.id, meta);
                }
            });
        }

        // Store results and save history
        currentScanResults = { videos, images };
        saveMediaHistory();
        updateUI();

        const totalFound = videos.length + images.length;
        
        if (!isAutoScan) {
            document.getElementById('status').textContent = 
                `Scan complete: Found ${videos.length} videos, ${images.length} images (${totalFound} total, scanned ${scannedCount} containers)`;
            
            if (totalFound === 0) {
                document.getElementById('status').textContent = 'No media found. Scroll to load more content and scan again.';
            }
        } else if (isAutoScanning) {
            // Update status for auto-scan with timestamp
            const now = new Date().toLocaleTimeString();
            document.getElementById('status').textContent = 
                `Auto-scan [${now}]: ${totalFound} media items (${videos.length}V, ${images.length}I)`;
        }

        console.log('Scan results:', { 
            scannedContainers: scannedCount, 
            foundVideos: videos.length, 
            foundImages: images.length,
            totalFound,
            videos, 
            images,
            isAutoScan
        });
    }

    // Extract comprehensive image metadata
    function extractImageMetadata(container) {
        const $container = $(container);
        const $img = $container.find('.imageContainer img, img').first();

        const src = $img.attr('src') || $img.attr('data-src') || '';
        // Derive stable id from filename (strip size suffix and extension)
        let id = null;
        if (src) {
            try {
                const u = new URL(src, window.location.origin);
                const base = u.pathname.split('/').pop() || '';
                id = base.replace(/_[a-z]+(?=\.[^.]+$)/i, '').replace(/\.[^.]+$/, '');
            } catch (e) { /* ignore */ }
        }

        // Title from tile if present
        const titleFromTile = $container.find('.Post-item-title span').first().text().trim();

        const metadata = {
            id: id,
            contentId: id,
            title: titleFromTile || $img.attr('title') || $img.attr('alt') || 'Untitled',
            thumbUrl: src || null,
            imageUrl: src || null,
            dimensions: {
                width: $img.attr('width') || $img.css('width') || 'unknown',
                height: $img.attr('height') || $img.css('height') || 'unknown'
            },
            category: 'unknown',
            score: $container.find('.Post-item-vote-points').first().text().trim() || 'unknown',
            pageUrl: window.location.href,
            extractedDate: new Date().toISOString(),
            filename: null,
            containerHtml: $container.prop('outerHTML').substring(0, 1000),
            allAttributes: {},
            cookies: document.cookie,
            userAgent: navigator.userAgent,
            referer: document.referrer || window.location.href
        };

        // Collect attributes
        if ($container[0]) {
            Array.from($container[0].attributes).forEach(attr => {
                metadata.allAttributes[`container_${attr.name}`] = attr.value;
            });
        }
        if ($img[0]) {
            Array.from($img[0].attributes).forEach(attr => {
                metadata.allAttributes[`img_${attr.name}`] = attr.value;
            });
        }

        if (metadata.imageUrl) {
            metadata.filename = generateUniqueFilename(metadata);
        }

        return metadata;
    }

    // Generate and download unified media index
    function downloadIndex() {
        if (mediaHistory.size === 0) {
            document.getElementById('status').textContent = 'No media to export. Run scan first.';
            return;
        }
        
        document.getElementById('status').textContent = 'Generating unified media index file...';
        
        const timestamp = new Date().toISOString();
        const timestampFilename = timestamp.replace(/[:.-]/g, '').substring(0, 15);
        
        // Separate all media from history by type
        const allVideos = [];
        const allImages = [];
        
        for (const [id, media] of mediaHistory) {
            if (media.mediaType === 'video') {
                allVideos.push(media);
            } else if (media.mediaType === 'image') {
                allImages.push(media);
            }
        }
        
        // Create comprehensive unified index
        const index = {
            // Header information
            generator: 'Media Index Generator (Unified)',
            version: '3.0',
            generated: timestamp,
            pageUrl: window.location.href,
            folderName: CONFIG.videoFolderName,
            
            // Statistics
            stats: {
                totalVideos: allVideos.length,
                totalImages: allImages.length,
                totalMedia: allVideos.length + allImages.length,
                historySize: mediaHistory.size,
                pageTitle: document.title,
                domain: window.location.hostname
            },
            
            // Download configuration for Python script
            downloadConfig: {
                folderName: CONFIG.videoFolderName,
                userAgent: navigator.userAgent,
                cookies: document.cookie,
                referer: window.location.href,
                headers: {
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            },
            
            // Unified media array with all accumulated media from history
            media: [...allVideos, ...allImages]
        };
        
        // Create and download JSON file
        const jsonString = JSON.stringify(index, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const filename = `unified_media_index_${timestampFilename}.json`;
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        document.getElementById('status').textContent = 
            `Index downloaded: ${filename} (${allVideos.length} videos, ${allImages.length} images)`;
        
        console.log('Generated unified index:', index);
    }

    // Clear media history
    function clearIndex() {
        if (confirm('Clear media index history? This will remove all stored media IDs from history.')) {
            // Stop auto-scan if running
            if (isAutoScanning) {
                stopAutoScan();
            }
            
            mediaHistory.clear();
            currentScanResults = { videos: [], images: [] };
            saveMediaHistory();
            updateUI();
            document.getElementById('status').textContent = 'Media index history cleared';
        }
    }

    // Wait for page to load
    function waitForPageLoad() {
        return new Promise((resolve) => {
            const checkReady = () => {
                // Imgur tiles
                if (typeof $ !== 'undefined' && ($('.Post-item-container').length > 0 || document.querySelector('video, .imageContainer img'))) {
                    resolve();
                } else {
                    setTimeout(checkReady, 500);
                }
            };
            checkReady();
        });
    }

    // Initialize the index generator
    async function init() {
        console.log('Initializing unified media index generator for Imgur...');
        
        // Wait for page to load
        await waitForPageLoad();
        
        // Load settings and media history
        loadSettings();
        loadMediaHistory();
        
        // Create UI
        createIndexUI();
        
        // Initialize scan results
        currentScanResults = { videos: [], images: [] };
        updateUI();
        
        console.log('Unified media index generator initialized');
        console.log('Ready to scan all media types for unified index generation');
        
        // Show initial instructions
        document.getElementById('status').textContent = 'Click "Scan Current Page" or "Auto" for continuous scanning. Use "Download Index" for unified JSON.';
    }

    // Start when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
