import cloudscraper from 'cloudscraper';
import puuter from 'puuter';
import { JSDOM } from 'jsdom';

const s = {
    tools: {
        async hit(description, url, options, returnType = 'text') {
            try {
                const response = await new Promise((resolve, reject) => {
                    cloudscraper.get({
                        url,
                        headers: options.headers || {},
                        gzip: true
                    }, (err, res, body) => {
                        if (err) reject(err);
                        else resolve({ res, body });
                    });
                });

                const { res, body } = response;
                if (res.statusCode !== 200) {
                    throw new Error(`${res.statusCode} ${res.statusMessage}\n${body || '(response body kosong)'}`);
                }

                if (returnType === 'text') {
                    return { data: body, response: res };
                } else if (returnType === 'dom') {
                    const dom = new JSDOM(body, { runScripts: "dangerously", resources: "usable" });
                    await puuter.until(() => {
                        const descDetail = dom.window.document.querySelector('p.desc-detail');
                        const clipSpan = dom.window.document.querySelector('span.detail-extra-span');
                        return descDetail && clipSpan;
                    }, 5000, 500); // Tunggu maks 5 detik, cek tiap 500ms
                    return { dom, response: res };
                } else {
                    throw new Error(`invalid returnType param.`);
                }
            } catch (e) {
                throw new Error(`hit ${description} failed. ${e.message}`);
            }
        }
    },

    get baseUrl() {
        return 'https://www.capcut.com';
    },

    get baseHeaders() {
        return {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.5',
            'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
            'upgrade-insecure-requests': '1',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'none',
            'sec-fetch-user': '?1',
        }
    },

    async scrapePage(url) {
        const { dom } = await this.tools.hit('CapCut page', url, { headers: this.baseHeaders }, 'dom');

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

        return {
            creator,
            title,
            info,
            videoSrc,
            hashtags,
            clipInfo
        };
    },

    async download(url) {
        const data = await this.scrapePage(url);
        return data;
    }
};

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
        // Validate CapCut URL
        if (!url.includes('capcut.com') || !url.includes('/tv2/')) {
            return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL dari CapCut dan berisi /tv2/' });
        }

        // Scrape data
        const result = await s.download(url);

        return response.status(200).json({
            success: true,
            data: {
                creator: result.creator,
                title: result.title,
                info: result.info,
                videoUrl: result.videoSrc,
                hashtags: result.hashtags,
                clipInfo: result.clipInfo
            }
        });

    } catch (error) {
        console.error('Error fetching CapCut data:', error);
        return response.status(500).json({
            success: false,
            error: 'Gagal mengambil data dari CapCut. Coba lagi nanti.'
        });
    }
}
