const c = {
    tools: {
        async hit(description, url, options, returnType = 'text') {
            try {
                const response = await fetch(url, options)
                if (!response.ok) throw Error(`${response.status} ${response.statusText}\n${await response.text() || '(response body kosong)'}`)
                if (returnType === 'text') {
                    const data = await response.text()
                    return { data, response }
                } else if (returnType === 'json') {
                    const data = await response.json()
                    return { data, response }
                } else {
                    throw Error(`invalid returnType param.`)
                }
            } catch (e) {
                throw Error(`hit ${description} failed. ${e.message}`)
            }
        }
    },

    get baseUrl() {
        return 'https://vidburner.com'
    },
    get baseHeaders() {
        return {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-encoding': 'gzip, deflate, br, zstd',
            'accept-language': 'en-US,en;q=0.9',
            'cache-control': 'no-cache',
            'pragma': 'no-cache',
            'sec-ch-ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-origin',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        }
    },

    async getToken() {
        const pathname = '/capcut-video-downloader/'
        const url = new URL(pathname, this.baseUrl)
        const headers = this.baseHeaders
        
        const { data } = await this.tools.hit('get token', url, { headers })
        
        // Extract token from HTML
        const tokenMatch = data.match(/<input id="token" type="hidden" name="token" value="([^"]+)">/)
        if (!tokenMatch || !tokenMatch[1]) {
            throw Error('Token tidak ditemukan di halaman')
        }
        
        return tokenMatch[1]
    },

    async getDownloadInfo(capcutUrl, token) {
        const pathname = '/wp-admin/admin-ajax.php'
        const url = new URL(pathname, this.baseUrl)
        
        const headers = {
            ...this.baseHeaders,
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'origin': this.baseUrl,
            'referer': `${this.baseUrl}/capcut-video-downloader/`,
            'x-requested-with': 'XMLHttpRequest'
        }
        
        const body = new URLSearchParams({
            'action': 'aio_download_video',
            'url': capcutUrl,
            'token': token,
            'source': 'capcut'
        })
        
        const { data } = await this.tools.hit('get download info', url, { 
            headers, 
            body, 
            method: 'POST' 
        }, 'json')
        
        return data
    },

    async getDownloadLink(sid, media) {
        const pathname = '/wp-content/plugins/aio-video-downloader/download.php'
        const url = new URL(pathname, this.baseUrl)
        url.search = new URLSearchParams({
            'source': 'capcut',
            'media': media,
            'sid': sid,
            'start': '1'
        })
        
        const headers = {
            ...this.baseHeaders,
            'referer': `${this.baseUrl}/capcut-video-downloader/`
        }
        
        // We need to follow redirects to get the final download URL
        const { response } = await this.tools.hit('get download link', url, { 
            headers,
            redirect: 'manual'  // We'll handle redirects manually
        })
        
        // Check for redirect
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location')
            if (location) {
                return location
            }
        }
        
        throw Error('Tidak dapat mendapatkan link download')
    },

    async download(capcutUrl) {
        // Step 1: Get token from the page
        const token = await this.getToken()
        
        // Step 2: Get download info (SID and media)
        const downloadInfo = await this.getDownloadInfo(capcutUrl, token)
        
        if (!downloadInfo.success) {
            throw Error(downloadInfo.message || 'Gagal mendapatkan informasi download')
        }
        
        // Step 3: Get the actual download link
        const downloadLink = await this.getDownloadLink(downloadInfo.sid, downloadInfo.media)
        
        return {
            success: true,
            sid: downloadInfo.sid,
            media: downloadInfo.media,
            downloadUrl: downloadLink,
            filename: downloadInfo.filename || 'capcut_video.mp4'
        }
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
        if (!url.includes('capcut.com') || !url.includes('/tv/') && !url.includes('/tv2/')) {
            return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL berasal dari CapCut.' });
        }

        // Download video data
        const result = await c.download(url);

        // Get file size information
        let fileSize = 'Unknown';
        try {
            const headResponse = await fetch(result.downloadUrl, { method: 'HEAD' });
            const contentLength = headResponse.headers.get('content-length');
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
            error: 'Gagal mengambil data dari CapCut. Pastikan URL valid dan coba lagi.' 
        });
    }
}
