import cloudscraper from 'cloudscraper';
import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';

class CapCutDownloader {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    // Method utama untuk mendapatkan data CapCut
    async getCapCutData(url) {
        try {
            // Langkah 1: Dapatkan HTML menggunakan cloudscraper atau puppeteer
            const html = await this.fetchHtml(url);
            
            // Langkah 2: Parse HTML untuk mendapatkan informasi template
            const templateInfo = await this.parseTemplateInfo(html);
            
            // Langkah 3: Dapatkan URL download video dengan watermark
            const videoData = await this.extractVideoData(html);
            
            // Langkah 4: Dapatkan URL download video tanpa watermark
            const noWatermarkData = await this.getNoWatermarkVideo(url);
            
            return {
                success: true,
                data: {
                    ...templateInfo,
                    videoWithWatermark: videoData,
                    videoWithoutWatermark: noWatermarkData
                }
            };
        } catch (error) {
            console.error('Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Method untuk fetch HTML
    async fetchHtml(url) {
        // Coba dengan cloudscraper terlebih dahulu
        try {
            const html = await cloudscraper.get({
                url: url,
                headers: {
                    'User-Agent': this.userAgent
                }
            });
            return html;
        } catch (error) {
            console.log('Cloudscraper failed, trying puppeteer...');
            // Fallback ke puppeteer jika cloudscraper gagal
            return await this.fetchWithPuppeteer(url);
        }
    }

    // Method untuk fetch dengan puppeteer
    async fetchWithPuppeteer(url) {
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            
            const page = await browser.newPage();
            await page.setUserAgent(this.userAgent);
            
            // Navigate to the page
            await page.goto(url, { 
                waitUntil: 'networkidle2', 
                timeout: 30000 
            });
            
            // Tunggu hingga elemen yang diperlukan muncul
            await page.waitForSelector('.desc-detail', { timeout: 10000 });
            
            // Ambil konten halaman
            const html = await page.content();
            
            await browser.close();
            return html;
        } catch (error) {
            if (browser) await browser.close();
            throw new Error(`Puppeteer error: ${error.message}`);
        }
    }

    // Method untuk parse informasi template
    async parseTemplateInfo(html) {
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        // 1. Creator
        const creatorElement = document.querySelector('.author-name');
        const creator = creatorElement ? creatorElement.textContent.trim() : "Not found";
        
        // 2. Title
        const titleElement = document.querySelector('.template-title');
        const title = titleElement ? titleElement.textContent.trim() : "Not found";
        
        // 3. Info
        const infoElement = document.querySelector('.actions-detail');
        const info = infoElement ? infoElement.textContent.trim() : "Not found";
        
        // 4. Hashtags (elemen tambahan)
        const hashtagElement = document.querySelector('.desc-detail');
        const hashtags = hashtagElement ? hashtagElement.textContent.trim() : "Not found";
        
        // 5. Clip requirements (elemen tambahan)
        const clipElement = document.querySelector('.detail-extra-span');
        const clipRequirements = clipElement ? clipElement.textContent.trim() : "Not found";
        
        return { 
            creator, 
            title, 
            info, 
            hashtags, 
            clipRequirements 
        };
    }

    // Method untuk extract data video dengan watermark
    async extractVideoData(html) {
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        // Cari URL video
        const videoElement = document.querySelector('video');
        let videoUrl = "Not found";
        if (videoElement) {
            videoUrl = videoElement.getAttribute('src') || 
                      videoElement.querySelector('source')?.getAttribute('src') || 
                      "Not found";
        }
        
        // Cari thumbnail
        const thumbnailElement = document.querySelector('img');
        const thumbnailUrl = thumbnailElement ? thumbnailElement.getAttribute('src') : "Not found";
        
        return {
            videoUrl,
            thumbnailUrl
        };
    }

    // Method untuk mendapatkan video tanpa watermark dari 3bic.com
    async getNoWatermarkVideo(capcutUrl) {
        try {
            // Gunakan puppeteer untuk mengakses 3bic.com karena memerlukan interaksi
            const browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            
            const page = await browser.newPage();
            await page.setUserAgent(this.userAgent);
            
            // Navigate to 3bic.com
            await page.goto('https://3bic.com', { 
                waitUntil: 'networkidle2', 
                timeout: 30000 
            });
            
            // Isi form dengan URL CapCut
            await page.waitForSelector('input[type="text"]', { timeout: 10000 });
            await page.type('input[type="text"]', capcutUrl);
            
            // Klik tombol download
            await page.click('button[type="submit"]');
            
            // Tunggu hingga hasil muncul
            await page.waitForSelector('a[download]', { timeout: 15000 });
            
            // Dapatkan URL download
            const downloadUrl = await page.$eval('a[download]', a => a.href);
            
            // Dapatkan judul video
            const title = await page.$eval('h4', h4 => h4.textContent.trim()).catch(() => 'Unknown Title');
            
            await browser.close();
            
            return {
                videoUrl: downloadUrl,
                title: title
            };
        } catch (error) {
            console.error('Error getting no watermark video:', error);
            
            // Fallback: Coba dengan cloudscraper untuk API 3bic
            try {
                const response = await cloudscraper.post({
                    url: 'https://3bic.com/api/download',
                    headers: {
                        'Content-Type': 'application/json',
                        'Origin': 'https://3bic.com',
                        'Referer': 'https://3bic.com/',
                        'User-Agent': this.userAgent
                    },
                    json: {
                        url: capcutUrl
                    }
                });
                
                if (response.originalVideoUrl) {
                    return {
                        videoUrl: response.originalVideoUrl.startsWith('/') 
                            ? 'https://3bic.com' + response.originalVideoUrl 
                            : response.originalVideoUrl,
                        title: response.title || 'Unknown Title'
                    };
                }
                
                throw new Error('Failed to get no watermark video');
            } catch (apiError) {
                throw new Error(`No watermark video unavailable: ${apiError.message}`);
            }
        }
    }

    // Method untuk mendapatkan nama creator dari URL CapCut
    async getCreatorName(capcutUrl) {
        try {
            const html = await this.fetchHtml(capcutUrl);
            const dom = new JSDOM(html);
            const document = dom.window.document;
            
            // Cari nama creator
            const creatorElement = document.querySelector('.author-name');
            return creatorElement ? creatorElement.textContent.trim() : 'Unknown Creator';
        } catch (error) {
            console.error('Error fetching creator name:', error);
            return 'Unknown Creator';
        }
    }
}

// Handler untuk API
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
        return response.status(405).json({ 
            success: false, 
            error: 'Method not allowed' 
        });
    }

    const { url } = request.query;

    if (!url) {
        return response.status(400).json({ 
            success: false, 
            error: 'Parameter URL diperlukan' 
        });
    }

    try {
        // Validate CapCut URL
        if (!url.includes('capcut.com')) {
            return response.status(400).json({ 
                success: false, 
                error: 'URL tidak valid. Pastikan URL berasal dari CapCut.' 
            });
        }

        // Download data
        const downloader = new CapCutDownloader();
        const result = await downloader.getCapCutData(url);

        if (!result.success) {
            return response.status(500).json(result);
        }

        return response.status(200).json(result);

    } catch (error) {
        console.error('Error fetching CapCut data:', error);
        
        return response.status(500).json({ 
            success: false, 
            error: 'Gagal mengambil data dari CapCut. Pastikan URL valid dan coba lagi.' 
        });
    }
}

// Contoh penggunaan (untuk testing)
async function test() {
    const downloader = new CapCutDownloader();
    const result = await downloader.getCapCutData('https://www.capcut.com/template-detail/123456789');
    console.log(JSON.stringify(result, null, 2));
}

// test();
