import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';

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

    const { url } = request.query;

    if (!url) {
        return response.status(400).json({ success: false, error: 'Parameter URL diperlukan' });
    }

    try {
        // Validate YouTube URL
        if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
            return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL berasal dari YouTube.' });
        }

        const result = await convertYouTubeVideo(url);
        return response.status(200).json({ success: true, ...result });
        
    } catch (error) {
        console.error('Error in YouTube to MP3 converter:', error);
        return response.status(500).json({ 
            success: false, 
            error: error.message || 'Gagal mengambil data dari YouTube. Pastikan URL valid dan coba lagi.' 
        });
    }
}

// Convert using Cloudscraper only
async function convertYouTubeVideo(youtubeUrl) {
    try {
        // STEP 1: SEARCH - Get video info
        const searchResponse = await cloudscraper.post({
            uri: 'https://ssvid.net/api/ajaxSearch/index',
            form: { 
                q: youtubeUrl,
                type: 'T1_SINGLE_VIDEO'  // Based on the console log you provided
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://ssvid.net',
                'Referer': 'https://ssvid.net/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        console.log('Search response:', searchResponse);

        const searchData = JSON.parse(searchResponse);
        
        if (!searchData.success) {
            throw new Error('Failed to search video: ' + (searchData.message || 'Unknown error'));
        }

        // Parse HTML response to get video info
        const dom = new JSDOM(searchData.data);
        const document = dom.window.document;
        
        // Extract video title
        const titleElement = document.querySelector('.title');
        const title = titleElement ? titleElement.textContent.trim() : 'YouTube Video';
        
        // Find audio formats (M4A first, then MP3)
        let audioFormat = null;
        const m4aButton = document.querySelector('button[onclick*="m4a"]');
        const mp3Button = document.querySelector('button[onclick*="mp3"]');
        
        if (m4aButton) {
            const onclickAttr = m4aButton.getAttribute('onclick');
            const match = onclickAttr.match(/startConvert\('(\w+)','([^']+)'\)/);
            if (match) {
                audioFormat = {
                    type: match[1],
                    token: match[2]
                };
            }
        } 
        
        // If M4A not found, try MP3
        if (!audioFormat && mp3Button) {
            const onclickAttr = mp3Button.getAttribute('onclick');
            const match = onclickAttr.match(/startConvert\('(\w+)','([^']+)'\)/);
            if (match) {
                audioFormat = {
                    type: match[1],
                    token: match[2]
                };
            }
        }
        
        if (!audioFormat) {
            throw new Error('Tidak dapat menemukan format audio yang tersedia');
        }
        
        // STEP 2: CONVERT - Get download URL
        const convertResponse = await cloudscraper.post({
            uri: 'https://ssvid.net/api/ajaxConvert/convert',
            form: {
                mediaType: audioFormat.type,
                token: audioFormat.token
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://ssvid.net',
                'Referer': 'https://ssvid.net/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        console.log('Convert response:', convertResponse);
        
        const convertData = JSON.parse(convertResponse);
        
        if (!convertData.success) {
            throw new Error('Failed to convert video: ' + (convertData.message || 'Unknown error'));
        }
        
        // Parse the conversion response to get download URL
        const convertDom = new JSDOM(convertData.data);
        const convertDocument = convertDom.window.document;
        
        const downloadLink = convertDocument.querySelector('a[href*="https://"]');
        if (!downloadLink) {
            throw new Error('Tidak dapat menemukan link download');
        }
        
        const downloadUrl = downloadLink.getAttribute('href');
        
        return {
            title: title,
            url: downloadUrl,
            format: audioFormat.type
        };
        
    } catch (error) {
        console.error('YouTube conversion error:', error);
        throw error;
    }
}
