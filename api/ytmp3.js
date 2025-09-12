import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

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
        // Validate YouTube URL
        if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
            return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL berasal dari YouTube.' });
        }

        // Try Cloudscraper first
        try {
            const result = await convertWithCloudscraper(url);
            return response.status(200).json({ success: true, ...result });
        } catch (error) {
            console.error('Cloudscraper conversion error:', error);
            
            // If retry is less than 2, try with Puppeteer as fallback
            if (retry < 2) {
                const result = await convertWithPuppeteer(url);
                return response.status(200).json({ success: true, ...result });
            } else {
                throw new Error('Gagal mengambil data dari YouTube. Pastikan URL valid dan coba lagi.');
            }
        }
    } catch (error) {
        console.error('Error in YouTube to MP3 converter:', error);
        return response.status(500).json({ 
            success: false, 
            error: error.message || 'Gagal mengambil data dari YouTube. Pastikan URL valid dan coba lagi.' 
        });
    }
}

// Convert using Cloudscraper
async function convertWithCloudscraper(url) {
    try {
        // STEP 1: SEARCH - Get video info
        const searchResponse = await cloudscraper.post({
            uri: 'https://ssvid.net/api/ajaxSearch/index',
            form: { query: url },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://ssvid.net',
                'Referer': 'https://ssvid.net/'
            }
        });

        const searchData = JSON.parse(searchResponse);
        
        if (!searchData.success) {
            throw new Error('Failed to search video');
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
        } else if (mp3Button) {
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
                'Referer': 'https://ssvid.net/'
            }
        });
        
        const convertData = JSON.parse(convertResponse);
        
        if (!convertData.success) {
            throw new Error('Failed to convert video');
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
        console.error('Cloudscraper conversion error:', error);
        throw error;
    }
}

// Convert using Puppeteer (fallback)
async function convertWithPuppeteer(url) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // Set user agent to avoid detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        // Navigate to ssvid.net
        await page.goto('https://ssvid.net', { waitUntil: 'networkidle2' });
        
        // Enter URL in search input
        await page.type('#search__input', url);
        
        // Click the convert button
        await page.click('#btn-start');
        
        // Wait for results to load
        await page.waitForSelector('.tab-content', { timeout: 10000 });
        
        // Click on Audio tab
        await page.click('a[href="#audio"]');
        
        // Wait for audio formats to load
        await page.waitForSelector('#audio table tr', { timeout: 10000 });
        
        // Try to find M4A format first, then MP3
        let convertFunction = null;
        
        const m4aRow = await page.$x('//tr[contains(., "M4A")]');
        if (m4aRow.length > 0) {
            const convertButton = await m4aRow[0].$('button');
            if (convertButton) {
                convertFunction = await page.evaluate(button => button.getAttribute('onclick'), convertButton);
            }
        }
        
        if (!convertFunction) {
            const mp3Row = await page.$x('//tr[contains(., "MP3")]');
            if (mp3Row.length > 0) {
                const convertButton = await mp3Row[0].$('button');
                if (convertButton) {
                    convertFunction = await page.evaluate(button => button.getAttribute('onclick'), convertButton);
                }
            }
        }
        
        if (!convertFunction) {
            throw new Error('Tidak dapat menemukan format audio yang tersedia');
        }
        
        // Extract token from the convert function
        const match = convertFunction.match(/startConvert\('(\w+)','([^']+)'\)/);
        if (!match) {
            throw new Error('Tidak dapat提取 token konversi');
        }
        
        const type = match[1];
        const token = match[2];
        
        // Get video title
        const title = await page.evaluate(() => {
            const titleEl = document.querySelector('.title');
            return titleEl ? titleEl.textContent.trim() : 'YouTube Video';
        });
        
        // Execute conversion
        const downloadUrl = await page.evaluate(async (type, token) => {
            // This would be executed in the browser context
            const formData = new FormData();
            formData.append('mediaType', type);
            formData.append('token', token);
            
            const response = await fetch('/api/ajaxConvert/convert', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Parse the HTML response to find download link
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.data, 'text/html');
                const downloadLink = doc.querySelector('a[href*="https://"]');
                return downloadLink ? downloadLink.getAttribute('href') : null;
            }
            
            return null;
        }, type, token);
        
        if (!downloadUrl) {
            throw new Error('Gagal mendapatkan URL download');
        }
        
        return {
            title: title,
            url: downloadUrl,
            format: type
        };
        
    } catch (error) {
        console.error('Puppeteer conversion error:', error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
