import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';

const c = {
    tools: {
        async cloudscraperRequest(options) {
            try {
                return new Promise((resolve, reject) => {
                    cloudscraper(options, (error, response, body) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve({ response, data: body });
                        }
                    });
                });
            } catch (e) {
                throw Error(`Cloudscraper request failed: ${e.message}`);
            }
        }
    },

    get baseUrl() {
        return 'https://vidburner.com';
    },

    async getToken() {
        const url = `${this.baseUrl}/capcut-video-downloader/`;
        
        try {
            const { data } = await this.tools.cloudscraperRequest({
                uri: url,
                method: 'GET'
            });

            const dom = new JSDOM(data);
            const document = dom.window.document;
            const tokenInput = document.querySelector('input#token');
            
            if (!tokenInput) {
                throw new Error('Token input not found');
            }
            
            return tokenInput.value;
        } catch (error) {
            console.error('Error getting token:', error);
            throw new Error('Failed to get token from vidburner');
        }
    },

    async getDownloadInfo(capcutUrl, token) {
        const url = `${this.baseUrl}/wp-admin/admin-ajax.php`;
        
        const formData = {
            action: 'aio_download_video',
            url: capcutUrl,
            token: token,
            source: 'capcut'
        };

        try {
            const { data } = await this.tools.cloudscraperRequest({
                uri: url,
                method: 'POST',
                form: formData,
                headers: {
                    'Referer': `${this.baseUrl}/capcut-video-downloader/`,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            return JSON.parse(data);
        } catch (error) {
            console.error('Error getting download info:', error);
            throw new Error('Failed to get download information');
        }
    },

    async getDownloadLink(sid, media) {
        const url = `${this.baseUrl}/wp-content/plugins/aio-video-downloader/download.php?source=capcut&media=${media}&sid=${sid}&start=1`;
        
        try {
            // We need to follow redirects manually with cloudscraper
            const { response } = await this.tools.cloudscraperRequest({
                uri: url,
                method: 'GET',
                followAllRedirects: false,
                headers: {
                    'Referer': `${this.baseUrl}/capcut-video-downloader/`
                }
            });

            // Check for redirect
            if (response.statusCode >= 300 && response.statusCode < 400) {
                return response.headers.location;
            }
            
            throw new Error('No redirect location found');
        } catch (error) {
            console.error('Error getting download link:', error);
            throw new Error('Failed to get download link');
        }
    },

    async getFinalDownloadUrl(downloadUrl) {
        try {
            const { response } = await this.tools.cloudscraperRequest({
                uri: downloadUrl,
                method: 'GET',
                followAllRedirects: false
            });

            // Follow redirects until we get the final URL
            if (response.statusCode >= 300 && response.statusCode < 400) {
                return response.headers.location;
            }
            
            return downloadUrl;
        } catch (error) {
            console.error('Error getting final download URL:', error);
            return downloadUrl; // Return original URL as fallback
        }
    },

    async download(capcutUrl) {
        // Step 1: Get token from the page
        const token = await this.getToken();
        
        // Step 2: Get download info (SID and media)
        const downloadInfo = await this.getDownloadInfo(capcutUrl, token);
        
        if (!downloadInfo || !downloadInfo.success) {
            throw Error(downloadInfo?.message || 'Gagal mendapatkan informasi download');
        }
        
        // Step 3: Get the actual download link
        const downloadLink = await this.getDownloadLink(downloadInfo.sid, downloadInfo.media);
        
        // Step 4: Get final download URL after waiting period
        const finalDownloadUrl = await this.getFinalDownloadUrl(downloadLink);
        
        return {
            success: true,
            sid: downloadInfo.sid,
            media: downloadInfo.media,
            downloadUrl: finalDownloadUrl,
            filename: downloadInfo.filename || 'capcut_video.mp4',
            title: downloadInfo.title || 'CapCut Video'
        };
    }
}

export default async function handler(request, response) {
    // Set CORS headers
    response.setHeader('Access-Control-Allow-Credentials', true);
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    response.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Handle OPTIONS request for CORS
    if (request.method === 'OPTIONS') {
        response.status(200).end();
        return;
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
        return response.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { url, retry = 0 } = request.query;

    if (!url) {
        return response.status(400).json({ success: false, error: 'Parameter URL diperlukan' });
    }

    try {
        // Validate CapCut URL
        if (!url.includes('capcut.com') || (!url.includes('/tv/') && !url.includes('/tv2/'))) {
            return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL berasal dari CapCut.' });
        }

        // Download video data
        const result = await c.download(url);

        // Get file size information
        let fileSize = 'Unknown';
        try {
            const { response } = await c.tools.cloudscraperRequest({
                uri: result.downloadUrl,
                method: 'HEAD'
            });
            
            const contentLength = response.headers['content-length'];
            if (contentLength) {
                const sizeInMB = parseInt(contentLength) / (1024 * 1024);
                fileSize = `${sizeInMB.toFixed(2)} MB`;
            }
        } catch (sizeError) {
            console.log('Could not determine file size:', sizeError);
        }

        return response.status(200).json({
            success: true,
            data: {
                title: result.title,
                downloadUrl: result.downloadUrl,
                filename: result.filename,
                size: fileSize,
                extension: 'mp4'
            }
        });

    } catch (error) {
        console.error('Error fetching CapCut data:', error);
        
        // Retry logic
        if (retry < 2) {
            // Wait for 1 second before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
            return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
        }
        
        return response.status(500).json({ 
            success: false, 
            error: error.message || 'Gagal mengambil data dari CapCut. Pastikan URL valid dan coba lagi.' 
        });
    }
}
