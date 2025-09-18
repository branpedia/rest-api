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

    // Validate CapCut URL
    if (!url.includes('capcut.com') || !url.includes('/tv2/')) {
        return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL dari CapCut dan berisi /tv2/' });
    }

    let html = '';
    let browser;

    try {
        console.log(`[TRY ${parseInt(retry) + 1}] Fetching with cloudscraper...`);
        html = await new Promise((resolve, reject) => {
            cloudscraper.get({
                url,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
                },
                timeout: 10000
            }, (err, res, body) => {
                if (err) reject(err);
                else if (res.statusCode !== 200) reject(new Error(`Status ${res.statusCode}`));
                else resolve(body);
            });
        });
    } catch (error) {
        console.log('☁️ Cloudscraper failed, trying with Puppeteer...');
        
        try {
            browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            });

            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36');
            await page.setViewport({ width: 390, height: 844 }); // Mobile viewport

            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Tunggu sampai elemen penting muncul
            await page.waitForSelector('p.desc-detail, span.detail-extra-span, h1.template-title', {
                timeout: 10000
            });

            html = await page.content();
            await browser.close();
            browser = null;

        } catch (puppeteerError) {
            if (browser) await browser.close();
            throw puppeteerError;
        }
    }

    try {
        const dom = new JSDOM(html, { runScripts: "dangerously" });
        const doc = dom.window.document;

        // 1. Creator
        const creatorEl = doc.querySelector('span.author-name');
        const creator = creatorEl ? creatorEl.textContent.trim() : "Not found";

        // 2. Title
        const titleEl = doc.querySelector('h1.template-title');
        const title = titleEl ? titleEl.textContent.trim() : "Not found";

        // 3. Info (actions-detail)
        const infoEl = doc.querySelector('p.actions-detail');
        const info = infoEl ? infoEl.textContent.trim() : "Not found";

        // 4. Video URL
        const videoEl = doc.querySelector('video.player');
        const videoSrc = videoEl ? videoEl.getAttribute('src') : "Not found";

        // 5. Hashtags (desc-detail)
        const hashtagEl = doc.querySelector('p.desc-detail');
        const hashtags = hashtagEl ? hashtagEl.textContent.trim() : "#NotFound";

        // 6. Clip Info (detail-extra-span)
        const clipEl = doc.querySelector('span.detail-extra-span');
        const clipInfo = clipEl ? clipEl.textContent.trim() : "Clip info not found";

        return response.status(200).json({
            success: true,
            data: {
                creator,
                title,
                info,
                videoUrl: videoSrc,
                hashtags,
                clipInfo
            }
        });

    } catch (parseError) {
        console.error('❌ Parsing error:', parseError.message);
        throw parseError;
    }
} catch (error) {
    console.error('🔥 Fatal error:', error);

    // Cleanup browser if exists
    if (browser) {
        try { await browser.close(); } catch {}
    }

    // Retry logic — max 2 retries
    if (retry < 2) {
        console.log(`🔁 Retrying... (${parseInt(retry) + 1}/2)`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Tunggu 2 detik
        return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }

    return response.status(500).json({
        success: false,
        error: 'Gagal mengambil data dari CapCut. Server mungkin overload atau URL tidak valid. Coba lagi nanti.'
    });
}
