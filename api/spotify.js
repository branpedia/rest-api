const s = {
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
        return 'https://spotisongdownloader.to'
    },
    get baseHeaders() {
        return {
            'accept-encoding': 'gzip, deflate, br, zstd',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0'
        }
    },

    async getCookie() {
        const url = this.baseUrl
        const headers = this.baseHeaders
        const { response } = await this.tools.hit('homepage', url, { headers })

        // auto deteksi node-fetch v2 / v3
        let cookie
        if (typeof response.headers.raw === 'function') {
            // node-fetch v2
            let rawCookies = response.headers.raw()['set-cookie'] || []
            cookie = rawCookies[0]?.split('; ')?.[0]
        } else {
            // undici / node-fetch v3
            cookie = response.headers.get('set-cookie')?.split('; ')?.[0]
        }

        if (!cookie?.length) throw Error(`gagal mendapatkan kuki`)
        cookie += '; _ga=GA1.1.2675401.1754827078'
        return { cookie }
    },

    async ifCaptcha(gcObject) {
        const pathname = '/ifCaptcha.php'
        const url = new URL(pathname, this.baseUrl)
        const headers = {
            referer: new URL(this.baseUrl).href,
            ...gcObject,
            ...this.baseHeaders
        }
        await this.tools.hit('ifCaptcha', url, { headers })
        return headers
    },

    async singleTrack(spotifyTrackUrl, icObject) {
        const pathname = '/api/composer/spotify/xsingle_track.php'
        const url = new URL(pathname, this.baseUrl)
        url.search = new URLSearchParams({ url: spotifyTrackUrl })
        const headers = icObject
        const { data } = await this.tools.hit('single track', url, { headers }, 'json')
        return data
    },

    async singleTrackHtml(stObject, icObj) {
        const payload = [
            stObject.song_name,
            stObject.duration,
            stObject.img,
            stObject.artist,
            stObject.url,
            stObject.album_name,
            stObject.released
        ]
        const pathname = '/track.php'
        const url = new URL(pathname, this.baseUrl)
        const headers = icObj
        const body = new URLSearchParams({ data: JSON.stringify(payload) })
        await this.tools.hit('track html', url, { headers, body, method: 'post' })
        return true
    },

    async downloadUrl(spotifyTrackUrl, icObj, stObj) {
        const pathname = '/api/composer/spotify/ssdw23456ytrfds.php'
        const url = new URL(pathname, this.baseUrl)
        const headers = icObj
        const body = new URLSearchParams({
            song_name: stObj.song_name || '',
            artist_name: stObj.artist || '',
            url: spotifyTrackUrl,
            zip_download: 'false',
            quality: 'm4a'
        })
        const { data } = await this.tools.hit('get download url', url, { headers, body, method: 'post' }, 'json')
        return { ...data, ...stObj }
    },

    async download(spotifyTrackUrl) {
        const gcObj = await this.getCookie()
        const icObj = await this.ifCaptcha(gcObj)
        const stObj = await this.singleTrack(spotifyTrackUrl, icObj)
        await this.singleTrackHtml(stObj, icObj)
        const dlObj = await this.downloadUrl(spotifyTrackUrl, icObj, stObj)
        return dlObj
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
        // Validate Spotify URL
        if (!url.includes('spotify.com') || !url.includes('/track/')) {
            return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL berasal dari Spotify dan berupa track.' });
        }

        // Download track data
        const dl = await s.download(url);

        // Get file size information
        let fileSize = 'Unknown';
        let encodedDownloadUrl = dl.dlink;
        
        try {
            // Encode URL yang mengandung spasi
            if (dl.dlink.includes(' ')) {
                // Pisahkan base URL dan parameter
                const urlObj = new URL(dl.dlink);
                const baseUrl = `${urlObj.origin}${urlObj.pathname}`;
                const searchParams = new URLSearchParams(urlObj.search);
                
                // Encode nilai parameter yang mengandung spasi
                for (let [key, value] of searchParams.entries()) {
                    if (value.includes(' ')) {
                        searchParams.set(key, encodeURIComponent(value));
                    }
                }
                
                encodedDownloadUrl = `${baseUrl}?${searchParams.toString()}`;
            }

            const headResponse = await fetch(encodedDownloadUrl, { method: 'HEAD' });
            const contentLength = headResponse.headers.get('content-length');
            if (contentLength) {
                const sizeInMB = parseInt(contentLength) / (1024 * 1024);
                fileSize = `${sizeInMB.toFixed(2)} MB`;
            }
        } catch (sizeError) {
            console.log('Could not determine file size:', sizeError);
            
            // Fallback: coba URL asli jika encoded URL gagal
            if (encodedDownloadUrl !== dl.dlink) {
                try {
                    const headResponseFallback = await fetch(dl.dlink, { method: 'HEAD' });
                    const contentLength = headResponseFallback.headers.get('content-length');
                    if (contentLength) {
                        const sizeInMB = parseInt(contentLength) / (1024 * 1024);
                        fileSize = `${sizeInMB.toFixed(2)} MB`;
                    }
                    encodedDownloadUrl = dl.dlink; // Kembali ke URL asli
                } catch (fallbackError) {
                    console.log('Fallback also failed:', fallbackError);
                }
            }
        }

        return response.status(200).json({
            success: true,
            data: {
                title: dl.song_name,
                artist: dl.artist,
                duration: dl.duration,
                album: dl.album_name,
                released: dl.released,
                size: fileSize,
                extension: 'm4a',
                coverUrl: dl.img,
                downloadUrl: encodedDownloadUrl,
                fileName: `${dl.song_name.replace(/ /g, '_')}-${dl.artist.replace(/ /g, '_')}.m4a`
            }
        });

    } catch (error) {
        console.error('Error fetching Spotify data:', error);
        
        // Retry logic
        if (retry < 2) {
            // Wait for 1 second before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
            return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
        }
        
        return response.status(500).json({ 
            success: false, 
            error: 'Gagal mengambil data dari Spotify. Pastikan URL valid dan coba lagi.' 
        });
    }
}
