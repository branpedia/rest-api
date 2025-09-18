import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

const scribd = {
    debug: true, // Set to true untuk mode debug
    tools: {
        async cloudscraperRequest(url, options = {}) {
            try {
                if (this.debug) console.log(`🌐 Cloudscraper request to: ${url}`);
                const response = await cloudscraper({ url, ...options });
                if (this.debug) console.log(`✅ Cloudscraper success: ${url}`);
                return response;
            } catch (error) {
                if (this.debug) console.log(`❌ Cloudscraper failed: ${url} - ${error.message}`);
                throw new Error(`Cloudscraper request failed: ${error.message}`);
            }
        },

        async delay(ms) {
            if (this.debug) console.log(`⏳ Waiting for ${ms}ms`);
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        logDebug(message, data = null) {
            if (this.debug) {
                console.log(`🔍 ${message}`);
                if (data) console.log('📊 Data:', JSON.stringify(data, null, 2));
            }
        },

        saveDebugHTML(html, filename) {
            if (this.debug && html) {
                // Simpan HTML untuk debugging (opsional)
                console.log(`💾 Saving HTML debug: ${filename} (${html.length} chars)`);
            }
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
        };
    },

    async getDocumentInfo(scribdUrl) {
        this.tools.logDebug(`Getting document info for: ${scribdUrl}`);
        
        try {
            const html = await this.tools.cloudscraperRequest(scribdUrl, {
                headers: this.baseHeaders
            });

            this.tools.saveDebugHTML(html, 'scribd_page.html');

            const dom = new JSDOM(html);
            const document = dom.window.document;

            // Extract document ID from URL
            const docIdMatch = scribdUrl.match(/document\/(\d+)/);
            if (!docIdMatch) {
                throw new Error('URL Scribd tidak valid. Pastikan URL mengandung ID dokumen.');
            }
            const docId = docIdMatch[1];

            // Extract title
            const titleElement = document.querySelector('title');
            const title = titleElement ? titleElement.textContent.replace(' | Scribd', '').trim() : 'Unknown Document';

            this.tools.logDebug(`Document title: ${title}`);

            // Extract description
            const descriptionMeta = document.querySelector('meta[name="description"]');
            const description = descriptionMeta ? descriptionMeta.getAttribute('content') : '';

            // Extract page count from JSON-LD or scripts
            let pageCount = 0;
            const jsonLd = document.querySelector('script[type="application/ld+json"]');
            if (jsonLd) {
                try {
                    const data = JSON.parse(jsonLd.textContent);
                    if (data.numberOfPages) pageCount = data.numberOfPages;
                } catch (e) {}
            }

            // Fallback: search in scripts
            if (pageCount === 0) {
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    if (script.textContent.includes('page_count')) {
                        const match = script.textContent.match(/"page_count":(\d+)/);
                        if (match) {
                            pageCount = parseInt(match[1]);
                            break;
                        }
                    }
                }
            }

            this.tools.logDebug(`Document info extracted`, { docId, title, pageCount });

            return {
                docId,
                title,
                description,
                pageCount,
                url: scribdUrl
            };
        } catch (error) {
            this.tools.logDebug(`Failed to get document info: ${error.message}`);
            throw new Error(`Failed to get document info: ${error.message}`);
        }
    },

    async analyzePageStructure(html, url) {
        this.tools.logDebug(`Analyzing page structure for: ${url}`);
        
        const dom = new JSDOM(html);
        const document = dom.window.document;

        // Debug semua forms
        const forms = document.querySelectorAll('form');
        this.tools.logDebug(`Found ${forms.length} forms on the page`);

        forms.forEach((form, index) => {
            const action = form.getAttribute('action') || 'No action';
            const method = form.getAttribute('method') || 'GET';
            const inputs = form.querySelectorAll('input, select, textarea');
            
            this.tools.logDebug(`Form ${index + 1}: ${method} ${action}`);
            
            inputs.forEach(input => {
                const name = input.getAttribute('name') || 'no-name';
                const type = input.getAttribute('type') || 'text';
                const value = input.getAttribute('value') || '';
                this.tools.logDebug(`  Input: ${name} (${type}) = "${value}"`);
            });
        });

        // Debug semua links
        const links = document.querySelectorAll('a');
        const downloadLinks = [];
        
        links.forEach(link => {
            const href = link.getAttribute('href');
            const text = link.textContent.trim();
            if (href && href.includes('download')) {
                downloadLinks.push({ href, text });
            }
        });

        this.tools.logDebug(`Found ${downloadLinks.length} download links`, downloadLinks);

        // Debug important elements
        const importantSelectors = [
            'input[name="url"]',
            'input[name="platform"]',
            'input[name="cf-turnstile-response"]',
            '.cf-turnstile',
            '#downloadButton',
            '.download-btn',
            'button[type="submit"]'
        ];

        importantSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            this.tools.logDebug(`Selector "${selector}": ${elements.length} elements found`);
        });

        return {
            forms: Array.from(forms).map(form => ({
                action: form.getAttribute('action'),
                method: form.getAttribute('method'),
                inputs: Array.from(form.querySelectorAll('input, select, textarea')).map(input => ({
                    name: input.getAttribute('name'),
                    type: input.getAttribute('type'),
                    value: input.getAttribute('value')
                }))
            })),
            downloadLinks,
            hasTurnstile: document.querySelector('.cf-turnstile') !== null
        };
    },

    async getDownloadLinkFromScribDownloads(scribdUrl) {
        this.tools.logDebug(`Starting download process for: ${scribdUrl}`);
        
        try {
            // Step 1: Get homepage to understand structure
            this.tools.logDebug(`Step 1: Getting homepage`);
            const homepageHtml = await this.tools.cloudscraperRequest(this.scribDownloadsUrl, {
                headers: this.baseHeaders
            });

            const homepageAnalysis = await this.analyzePageStructure(homepageHtml, this.scribDownloadsUrl);
            this.tools.saveDebugHTML(homepageHtml, 'homepage.html');

            // Step 2: Try to find the correct form endpoint
            let processUrl = `${this.scribDownloadsUrl}/process-url.php`;
            const formAction = homepageAnalysis.forms.find(form => 
                form.action && form.action.includes('process-url')
            );

            if (formAction) {
                processUrl = formAction.action.startsWith('http') 
                    ? formAction.action 
                    : `${this.scribDownloadsUrl}${formAction.action}`;
            }

            this.tools.logDebug(`Using process URL: ${processUrl}`);

            // Step 3: Submit Scribd URL
            this.tools.logDebug(`Step 2: Submitting Scribd URL`);
            let downloadPageHtml;
            
            try {
                downloadPageHtml = await this.tools.cloudscraperRequest(processUrl, {
                    method: 'GET',
                    headers: {
                        ...this.baseHeaders,
                        'Referer': this.scribDownloadsUrl
                    },
                    qs: { url: scribdUrl }
                });
            } catch (error) {
                this.tools.logDebug(`GET request failed, trying POST`);
                
                // Try POST instead
                downloadPageHtml = await this.tools.cloudscraperRequest(processUrl, {
                    method: 'POST',
                    headers: {
                        ...this.baseHeaders,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': this.scribDownloadsUrl
                    },
                    form: { url: scribdUrl }
                });
            }

            this.tools.saveDebugHTML(downloadPageHtml, 'download_page.html');
            const downloadAnalysis = await this.analyzePageStructure(downloadPageHtml, processUrl);

            // Step 4: Analyze the download page
            this.tools.logDebug(`Step 3: Analyzing download page`);

            // Check if we already have download links
            if (downloadAnalysis.downloadLinks.length > 0) {
                this.tools.logDebug(`Found direct download links`);
                return downloadAnalysis.downloadLinks[0].href;
            }

            // Check if we need to handle Turnstile
            if (downloadAnalysis.hasTurnstile) {
                this.tools.logDebug(`Turnstile CAPTCHA detected, using Puppeteer`);
                return await this.handleWithPuppeteer(scribdUrl);
            }

            // Look for download forms
            const downloadForm = downloadAnalysis.forms.find(form => 
                form.action && form.action.includes('generate_pdf')
            );

            if (downloadForm) {
                this.tools.logDebug(`Found download form: ${downloadForm.action}`);
                return await this.submitDownloadForm(downloadForm, downloadPageHtml, scribdUrl);
            }

            throw new Error('Tidak dapat menemukan form download atau link download di halaman');

        } catch (error) {
            this.tools.logDebug(`Error in getDownloadLinkFromScribDownloads: ${error.message}`);
            throw new Error(`Failed to get download link: ${error.message}`);
        }
    },

    async handleWithPuppeteer(scribdUrl) {
        this.tools.logDebug(`Starting Puppeteer handling for: ${scribdUrl}`);
        
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();
            await page.setUserAgent(this.baseHeaders['User-Agent']);
            await page.setViewport({ width: 1280, height: 800 });

            // Navigate to process URL
            const processUrl = `${this.scribDownloadsUrl}/process-url.php?url=${encodeURIComponent(scribdUrl)}`;
            this.tools.logDebug(`Puppeteer navigating to: ${processUrl}`);

            await page.goto(processUrl, { 
                waitUntil: 'networkidle2', 
                timeout: 60000 
            });

            // Check if we're already on a download page
            const currentUrl = page.url();
            if (currentUrl.includes('download')) {
                this.tools.logDebug(`Already on download page: ${currentUrl}`);
                return currentUrl;
            }

            // Wait for and handle Turnstile if present
            try {
                await page.waitForSelector('.cf-turnstile', { timeout: 10000 });
                this.tools.logDebug(`Turnstile found, waiting for auto-resolution...`);
                
                // Wait for Turnstile to be solved (Cloudflare usually solves it automatically)
                await this.tools.delay(10000);
                
            } catch (error) {
                this.tools.logDebug(`No Turnstile found or already solved`);
            }

            // Look for download buttons or forms
            const downloadUrl = await page.evaluate(() => {
                // Look for download links
                const downloadLink = document.querySelector('a[href*="download"]');
                if (downloadLink) return downloadLink.href;

                // Look for download buttons
                const downloadButton = document.querySelector('button, input[type="submit"]');
                if (downloadButton) {
                    downloadButton.click();
                    return null;
                }

                return null;
            });

            if (downloadUrl) {
                this.tools.logDebug(`Found download URL via Puppeteer: ${downloadUrl}`);
                await browser.close();
                return downloadUrl;
            }

            // Wait for navigation after click
            await this.tools.delay(3000);
            const finalUrl = page.url();
            
            this.tools.logDebug(`Final URL after Puppeteer handling: ${finalUrl}`);
            await browser.close();

            if (finalUrl.includes('download')) {
                return finalUrl;
            }

            throw new Error('Puppeteer tidak dapat mendapatkan link download');

        } catch (error) {
            if (browser) await browser.close();
            this.tools.logDebug(`Puppeteer error: ${error.message}`);
            throw new Error(`Puppeteer failed: ${error.message}`);
        }
    },

    async submitDownloadForm(formInfo, html, scribdUrl) {
        this.tools.logDebug(`Submitting download form: ${formInfo.action}`);
        
        try {
            const dom = new JSDOM(html);
            const document = dom.window.document;

            const formData = {};
            formInfo.inputs.forEach(input => {
                if (input.name) {
                    // Cari nilai current dari element
                    const element = document.querySelector(`[name="${input.name}"]`);
                    formData[input.name] = element ? element.value || '' : input.value || '';
                }
            });

            // Pastikan URL ada dalam form data
            formData.url = formData.url || scribdUrl;

            this.tools.logDebug(`Form data:`, formData);

            const formUrl = formInfo.action.startsWith('http') 
                ? formInfo.action 
                : `${this.scribDownloadsUrl}${formInfo.action}`;

            const response = await this.tools.cloudscraperRequest(formUrl, {
                method: formInfo.method || 'POST',
                headers: {
                    ...this.baseHeaders,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': `${this.scribDownloadsUrl}/process-url.php?url=${encodeURIComponent(scribdUrl)}`
                },
                form: formData,
                followAllRedirects: true
            });

            this.tools.saveDebugHTML(response, 'form_submission_response.html');

            // Parse response untuk mencari link download
            const responseDom = new JSDOM(response);
            const responseDoc = responseDom.window.document;

            const downloadLink = responseDoc.querySelector('a[href*="download"]');
            if (downloadLink) {
                return downloadLink.href;
            }

            // Check if we're on a direct download page
            if (response.includes('download') || response.includes('PDF')) {
                // Coba extract URL dari JavaScript atau meta redirect
                const metaRefresh = responseDoc.querySelector('meta[http-equiv="refresh"]');
                if (metaRefresh) {
                    const content = metaRefresh.getAttribute('content');
                    const urlMatch = content.match(/url=(.*)/i);
                    if (urlMatch) return urlMatch[1];
                }
            }

            throw new Error('Form submission successful but no download link found');

        } catch (error) {
            this.tools.logDebug(`Form submission error: ${error.message}`);
            throw new Error(`Failed to submit form: ${error.message}`);
        }
    },

    async download(scribdUrl) {
        this.tools.logDebug(`Starting download process`);
        
        try {
            // Get document information
            const docInfo = await this.getDocumentInfo(scribdUrl);
            
            // Get download link
            const downloadUrl = await this.getDownloadLinkFromScribDownloads(scribdUrl);
            
            this.tools.logDebug(`Download process completed successfully`);
            
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
                },
                debug: this.debug ? { 
                    documentInfo: docInfo,
                    finalDownloadUrl: downloadUrl 
                } : undefined
            };
        } catch (error) {
            this.tools.logDebug(`Download process failed: ${error.message}`);
            
            return {
                success: false,
                error: error.message,
                debug: this.debug ? { 
                    errorStack: error.stack,
                    timestamp: new Date().toISOString()
                } : undefined
            };
        }
    }
};

// Export handler function
export default async function handler(request, response) {
    // Enable debug mode based on query parameter
    scribd.debug = request.query.debug === 'true';

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

        scribd.tools.logDebug(`API Request received: ${url}, retry: ${retry}`);

        // Get download information
        const result = await scribd.download(url);

        if (!result.success) {
            return response.status(400).json(result);
        }

        return response.status(200).json(result);

    } catch (error) {
        scribd.tools.logDebug(`API Handler error: ${error.message}`);
        
        // Retry logic
        if (retry < 2) {
            await scribd.tools.delay(1000);
            return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
        }
        
        return response.status(500).json({ 
            success: false, 
            error: 'Gagal memproses dokumen Scribd. Pastikan URL valid dan coba lagi.',
            debug: scribd.debug ? { error: error.message } : undefined
        });
    }
}
