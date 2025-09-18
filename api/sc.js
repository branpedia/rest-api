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
    
    get apiBaseUrl() {
        return 'https://www.scribd.com'
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
        
        return {
            docId,
            title,
            pageCount,
            url: scribdUrl
        };
    },

    async getDownloadUrl(docInfo) {
        // This is a simplified approach - in a real implementation, you might need
        // to use a service that can handle Scribd's anti-scraping measures
        
        // For demonstration purposes, we'll return a mock response
        // In a real implementation, you would use a service like:
        // https://scribddownload.com/ or similar services
        
        return {
            success: true,
            downloadUrl: `https://scribddownload.com/download/${docInfo.docId}`,
            info: docInfo,
            message: "In a real implementation, this would be the actual download URL. You might need to use a third-party service for actual Scribd downloads."
        };
    },

    async download(scribdUrl) {
        try {
            // Get document information
            const docInfo = await this.getDocumentInfo(scribdUrl);
            
            // Get download URL (this would be handled by a service in real implementation)
            const downloadInfo = await this.getDownloadUrl(docInfo);
            
            return {
                success: true,
                data: {
                    documentId: docInfo.docId,
                    title: docInfo.title,
                    pageCount: docInfo.pageCount,
                    originalUrl: scribdUrl,
                    downloadUrl: downloadInfo.downloadUrl,
                    format: 'PDF',
                    message: downloadInfo.message
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
