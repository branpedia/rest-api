import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

const scribd = {
    tools: {
        async cloudscraperRequest(url, options = {}) {
            try {
                return await cloudscraper({ url, ...options });
            } catch (error) {
                throw new Error(`Cloudscraper request failed: ${error.message}`);
            }
        },

        async delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    },

    get scribDownloadsUrl() {
        return 'https://scribdownloads.com';
    },

    get baseHeaders() {
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
        };
    },

    async getDocumentInfo(scribdUrl) {
        try {
            const html = await this.tools.cloudscraperRequest(scribdUrl, {
                headers: this.baseHeaders
            });

            const dom = new JSDOM(html);
            const document = dom.window.document;

            // Extract document ID from URL
            const docIdMatch = scribdUrl.match(/document\/(\d+)/);
            if (!docIdMatch) {
                throw new Error('URL Scribd tidak valid. Pastikan URL mengandung ID dokumen.');
            }
            const docId = docIdMatch[1];

            // Extract title
            const title = document.querySelector('title')?.textContent
                .replace(' | Scribd', '')
                .trim() || 'Unknown Document';

            // Extract description
            const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

            // Extract page count
            let pageCount = 0;
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const text = script.textContent;
                if (text.includes('page_count')) {
                    const match = text.match(/"page_count":(\d+)/);
                    if (match) {
                        pageCount = parseInt(match[1]);
                        break;
                    }
                }
            }

            return {
                docId,
                title,
                description,
                pageCount,
                url: scribdUrl
            };
        } catch (error) {
            throw new Error(`Failed to get document info: ${error.message}`);
        }
    },

    async solveTurnstileWithPuppeteer(pageUrl) {
        let browser;
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
                    '--single-process',
                    '--disable-gpu'
                ]
            });

            const page = await browser.newPage();
            await page.setUserAgent(this.baseHeaders['User-Agent']);
            await page.setViewport({ width: 1280, height: 800 });

            // Navigate to the page
            await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });

            // Wait for Cloudflare Turnstile to load
            await page.waitForSelector('.cf-turnstile iframe', { timeout: 10000 });

            // Switch to the Turnstile iframe
            const turnstileFrame = await page.frames().find(frame => frame.url().includes('challenges.cloudflare.com'));
            
            if (!turnstileFrame) {
                throw new Error('Turnstile iframe not found');
            }

            // Wait for the checkbox to appear
            await turnstileFrame.waitForSelector('input[type="checkbox"]', { timeout: 10000 });

            // Click the checkbox
            await turnstileFrame.click('input[type="checkbox"]');

            // Wait for verification to complete (up to 30 seconds)
            await page.waitForFunction(() => {
                const responseInput = document.querySelector('input[name="cf-turnstile-response"]');
                return responseInput && responseInput.value.length > 0;
            }, { timeout: 30000 });

            // Get the verified token
            const token = await page.evaluate(() => {
                return document.querySelector('input[name="cf-turnstile-response"]').value;
            });

            // Get the final HTML after verification
            const html = await page.content();

            await browser.close();
            return { html, token };

        } catch (error) {
            if (browser) await browser.close();
            throw new Error(`Failed to solve Turnstile: ${error.message}`);
        }
    },

    async getDownloadLinkFromScribDownloads(scribdUrl) {
        try {
            // Step 1: Get the homepage to understand the structure
            const homepageHtml = await this.tools.cloudscraperRequest(this.scribDownloadsUrl, {
                headers: this.baseHeaders
            });

            const homepageDom = new JSDOM(homepageHtml);
            const homepageDoc = homepageDom.window.document;

            // Step 2: Submit the Scribd URL to get download page
            const formData = {
                url: scribdUrl
            };

            let downloadPageHtml;
            try {
                // First try with cloudscraper
                downloadPageHtml = await this.tools.cloudscraperRequest(`${this.scribDownloadsUrl}/process-url.php`, {
                    method: 'GET',
                    headers: {
                        ...this.baseHeaders,
                        'Referer': this.scribDownloadsUrl
                    },
                    qs: formData
                });
            } catch (error) {
                console.log('Cloudscraper failed for download page, might need Turnstile solving...');
                
                // If cloudscraper fails, use Puppeteer to solve Turnstile
                const downloadPageUrl = `${this.scribDownloadsUrl}/process-url.php?url=${encodeURIComponent(scribdUrl)}`;
                const result = await this.solveTurnstileWithPuppeteer(downloadPageUrl);
                downloadPageHtml = result.html;
            }

            const downloadDom = new JSDOM(downloadPageHtml);
            const downloadDoc = downloadDom.window.document;

            // Check if we're on a download page with the form
            const downloadForm = downloadDoc.querySelector('form[action*="generate_pdf.php"]');
            if (!downloadForm) {
                throw new Error('Download form not found on the page');
            }

            // Extract form data
            const platformInput = downloadForm.querySelector('input[name="platform"]');
            const turnstileResponseInput = downloadForm.querySelector('input[name="cf-turnstile-response"]');

            if (!platformInput || !turnstileResponseInput) {
                throw new Error('Required form fields not found');
            }

            // Step 3: Submit the download form
            const postData = {
                platform: platformInput.value,
                'cf-turnstile-response': turnstileResponseInput.value,
                url: scribdUrl
            };

            let finalResponse;
            try {
                finalResponse = await this.tools.cloudscraperRequest(`${this.scribDownloadsUrl}/templates/getpdf/generate_pdf.php`, {
                    method: 'POST',
                    headers: {
                        ...this.baseHeaders,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': `${this.scribDownloadsUrl}/process-url.php?url=${encodeURIComponent(scribdUrl)}`
                    },
                    form: postData,
                    followAllRedirects: true
                });
            } catch (error) {
                console.log('Cloudscraper failed for final submission, using Puppeteer...');
                
                // Use Puppeteer for the final submission
                const browser = await puppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });

                const page = await browser.newPage();
                await page.setUserAgent(this.baseHeaders['User-Agent']);
                
                // Go to the download page first
                await page.goto(`${this.scribDownloadsUrl}/process-url.php?url=${encodeURIComponent(scribdUrl)}`, {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });

                // Wait for and submit the form
                await page.waitForSelector('form[action*="generate_pdf.php"]', { timeout: 10000 });
                await page.click('button[type="submit"]');

                // Wait for download to start or get the final page
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
                
                finalResponse = await page.content();
                await browser.close();
            }

            // Parse the final response to extract download link
            const finalDom = new JSDOM(finalResponse);
            const finalDoc = finalDom.window.document;

            // Look for download links
            const downloadLink = finalDoc.querySelector('a[href*="download"]');
            if (downloadLink) {
                return downloadLink.href;
            }

            // Check if file is being processed
            const processingText = finalDoc.querySelector('*:contains("processing")');
            if (processingText) {
                throw new Error('Document is being processed. Please try again later.');
            }

            throw new Error('Download link not found on the final page');

        } catch (error) {
            throw new Error(`Failed to get download link from ScribDownloads: ${error.message}`);
        }
    },

    async download(scribdUrl) {
        try {
            // Get document information
            const docInfo = await this.getDocumentInfo(scribdUrl);
            
            // Get download link from ScribDownloads
            const downloadUrl = await this.getDownloadLinkFromScribDownloads(scribdUrl);
            
            return {
                success: true,
                data: {
                    documentId: docInfo.docId,
                    title: docInfo.title,
                    description: docInfo.description,
                    pageCount: docInfo.pageCount,
                    originalUrl: scribdUrl,
                    downloadUrl: downloadUrl,
                    format: 'PDF',
                    timestamp: new Date().toISOString(),
                    source: 'scribdownloads.com'
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
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

    const { url, retry = 0 } = request.query;

    if (!url) {
        return response.status(400).json({ success: false, error: 'Parameter URL diperlukan' });
    }

    try {
        // Validate Scribd URL
        if (!url.includes('scribd.com') || !url.includes('/document/')) {
            return response.status(400).json({ 
                success: false, 
                error: 'URL tidak valid. Pastikan URL berasal dari Scribd dan berupa dokumen.' 
            });
        }

        // Get download information
        const result = await scribd.download(url);

        if (!result.success) {
            return response.status(400).json(result);
        }

        return response.status(200).json(result);

    } catch (error) {
        console.error('Error processing Scribd URL:', error);
        
        // Retry logic
        if (retry < 2) {
            // Wait for 1 second before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
            return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
        }
        
        return response.status(500).json({ 
            success: false, 
            error: 'Gagal memproses dokumen Scribd. Pastikan URL valid dan coba lagi.' 
        });
    }
}
