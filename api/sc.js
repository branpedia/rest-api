const scribd = {
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
        return 'https://www.scribd.com'
    },
    
    get docDownloaderUrl() {
        return 'https://docdownloader.com'
    },

    get baseHeaders() {
        return {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'en-US,en;q=0.9',
            'sec-ch-ua': '"Microsoft Edge";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'none',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1'
        }
    },

    async getDocumentInfo(scribdUrl) {
        const headers = this.baseHeaders;
        const { data } = await this.tools.hit('get document info', scribdUrl, { headers });
        
        // Extract document ID from URL
        const docIdMatch = scribdUrl.match(/document\/(\d+)/);
        if (!docIdMatch) {
            throw new Error('URL Scribd tidak valid. Pastikan URL mengandung ID dokumen.');
        }
        const docId = docIdMatch[1];
        
        // Extract title from HTML
        const titleMatch = data.match(/<title>(.*?)<\/title>/);
        const title = titleMatch ? titleMatch[1].replace(' | Scribd', '').trim() : 'Unknown Document';
        
        // Try to extract additional info
        let pageCount = 0;
        const pageCountMatch = data.match(/"page_count":(\d+)/);
        if (pageCountMatch) {
            pageCount = parseInt(pageCountMatch[1]);
        }
        
        // Extract description if available
        let description = '';
        const descMatch = data.match(/<meta name="description" content="(.*?)"/);
        if (descMatch) {
            description = descMatch[1];
        }
        
        return {
            docId,
            title,
            description,
            pageCount,
            url: scribdUrl
        };
    },

    async getDownloadInfoFromDocDownloader(scribdUrl) {
        const headers = {
            ...this.baseHeaders,
            'origin': this.docDownloaderUrl,
            'referer': `${this.docDownloaderUrl}/`
        };
        
        // First, get the initial page to extract CSRF token and form details
        const { data: homepageData } = await this.tools.hit('doc downloader homepage', this.docDownloaderUrl, { headers });
        
        // Extract CSRF token
        const csrfTokenMatch = homepageData.match(/name="csrf_token" value="(.*?)"/);
        const csrfToken = csrfTokenMatch ? csrfTokenMatch[1] : '';
        
        // Extract form action URL
        const formActionMatch = homepageData.match(/<form.*?action="(.*?)".*?method="post"/);
        const formAction = formActionMatch ? formActionMatch[1] : '/download';
        
        // Submit the form with the Scribd URL
        const formHeaders = {
            ...headers,
            'content-type': 'application/x-www-form-urlencoded',
            'referer': `${this.docDownloaderUrl}/`
        };
        
        const formBody = new URLSearchParams({
            url: scribdUrl,
            format: 'pdf',
            csrf_token: csrfToken
        });
        
        const formUrl = `${this.docDownloaderUrl}${formAction}`;
        const { data: formResponse, response: formHttpResponse } = await this.tools.hit(
            'doc downloader form submit', 
            formUrl, 
            {
                method: 'POST',
                headers: formHeaders,
                body: formBody,
                redirect: 'manual' // Don't automatically follow redirects
            }
        );
        
        // Check if we got a redirect
        if (formHttpResponse.status >= 300 && formHttpResponse.status < 400) {
            const location = formHttpResponse.headers.get('location');
            if (location) {
                // Follow the redirect
                const redirectUrl = location.startsWith('http') ? location : `${this.docDownloaderUrl}${location}`;
                const { data: redirectData } = await this.tools.hit('doc downloader redirect', redirectUrl, { headers });
                
                // Extract download information from the redirect page
                return this.extractDownloadInfoFromPage(redirectData, redirectUrl);
            }
        }
        
        // If no redirect, try to extract from the form response
        return this.extractDownloadInfoFromPage(formResponse, formUrl);
    },

    extractDownloadInfoFromPage(html, pageUrl) {
        // Check if we're on a waiting page
        if (html.includes('We are processing your document')) {
            const positionMatch = html.match(/Position:\s*#(\d+)/);
            const etaMatch = html.match(/ETA:\s*([^<]+)</);
            
            return {
                status: 'processing',
                message: 'Document is being processed',
                position: positionMatch ? parseInt(positionMatch[1]) : null,
                eta: etaMatch ? etaMatch[1].trim() : null,
                pageUrl: pageUrl
            };
        }
        
        // Check if we're on a download page with direct links
        const pdfLinkMatch = html.match(/<a[^>]*href="([^"]*compress-pdf[^"]*)"[^>]*DOWNLOAD as PDF/);
        const docxLinkMatch = html.match(/<a[^>]*href="([^"]*pdf-to-word[^"]*)"[^>]*DOWNLOAD as DOCX/);
        const pptxLinkMatch = html.match(/<a[^>]*href="([^"]*pdf-to-powerpoint[^"]*)"[^>]*DOWNLOAD as PPTX/);
        
        if (pdfLinkMatch || docxLinkMatch || pptxLinkMatch) {
            return {
                status: 'ready',
                downloadLinks: {
                    pdf: pdfLinkMatch ? pdfLinkMatch[1] : null,
                    docx: docxLinkMatch ? docxLinkMatch[1] : null,
                    pptx: pptxLinkMatch ? pptxLinkMatch[1] : null
                },
                pageUrl: pageUrl
            };
        }
        
        // Check if we need to solve captcha
        if (html.includes('h-captcha') || html.includes('g-recaptcha')) {
            return {
                status: 'captcha_required',
                message: 'Captcha needs to be solved manually',
                pageUrl: pageUrl
            };
        }
        
        // Default case - unknown page state
        return {
            status: 'unknown',
            message: 'Unable to determine download status',
            pageUrl: pageUrl
        };
    },

    async getFinalDownloadLink(intermediateUrl) {
        const headers = this.baseHeaders;
        
        // Follow the intermediate URL (like compress-pdf.lesv.info)
        const { data: intermediateData, response: intermediateResponse } = await this.tools.hit(
            'intermediate service', 
            intermediateUrl, 
            { headers, redirect: 'manual' }
        );
        
        // Check if we got a redirect to the final download
        if (intermediateResponse.status >= 300 && intermediateResponse.status < 400) {
            const location = intermediateResponse.headers.get('location');
            if (location && location.includes('/download/')) {
                return {
                    finalUrl: location,
                    needsWait: false
                };
            }
        }
        
        // Check if we're on a waiting page
        if (intermediateData.includes('We are processing your document')) {
            const etaMatch = intermediateData.match(/ETA:\s*([^<]+)</);
            const idMatch = intermediateData.match(/id:\s*'([^']+)'/);
            
            return {
                status: 'processing',
                eta: etaMatch ? etaMatch[1].trim() : 'unknown',
                processId: idMatch ? idMatch[1] : null,
                needsWait: true
            };
        }
        
        // Check for final download link
        const downloadLinkMatch = intermediateData.match(/<a[^>]*href="([^"]*\/download\/[^"]*)"[^>]*DOWNLOAD/);
        if (downloadLinkMatch) {
            return {
                finalUrl: downloadLinkMatch[1],
                needsWait: false
            };
        }
        
        throw new Error('Could not extract final download link from intermediate service');
    },

    async download(scribdUrl) {
        try {
            // Get document information
            const docInfo = await this.getDocumentInfo(scribdUrl);
            
            // Get download information from DocDownloader
            const downloadInfo = await this.getDownloadInfoFromDocDownloader(scribdUrl);
            
            let finalDownloadUrl = null;
            let status = downloadInfo.status;
            
            // If download links are available, try to get the final URL
            if (downloadInfo.status === 'ready' && downloadInfo.downloadLinks && downloadInfo.downloadLinks.pdf) {
                try {
                    const finalLinkInfo = await this.getFinalDownloadLink(downloadInfo.downloadLinks.pdf);
                    if (finalLinkInfo.finalUrl) {
                        finalDownloadUrl = finalLinkInfo.finalUrl;
                        status = 'ready';
                    } else if (finalLinkInfo.needsWait) {
                        status = 'processing';
                    }
                } catch (error) {
                    console.warn('Could not get final download link:', error.message);
                    // Keep the intermediate link as fallback
                    finalDownloadUrl = downloadInfo.downloadLinks.pdf;
                }
            }
            
            return {
                success: true,
                data: {
                    documentId: docInfo.docId,
                    title: docInfo.title,
                    description: docInfo.description,
                    pageCount: docInfo.pageCount,
                    originalUrl: scribdUrl,
                    status: status,
                    downloadInfo: downloadInfo,
                    downloadUrl: finalDownloadUrl,
                    intermediateUrl: downloadInfo.downloadLinks ? downloadInfo.downloadLinks.pdf : null,
                    format: 'PDF',
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
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
