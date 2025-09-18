const lens = {
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
        return 'https://serpapi.com'
    },
    
    get apiKey() {
        // Ganti dengan API key SerpAPI Anda
        return '99a605260e609bb3b58fbe12792cc316686cb7e10e447a38f6bd6360e6b68dbf'
    },

    async searchByImage(imageUrl) {
        const pathname = '/search.json'
        const url = new URL(pathname, this.baseUrl)
        
        const params = {
            engine: 'google_lens',
            url: imageUrl,
            api_key: this.apiKey
        }
        
        url.search = new URLSearchParams(params)
        
        const headers = {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
        }
        
        const { data } = await this.tools.hit('google lens search', url, { headers }, 'json')
        return data
    },

    async processResults(rawData) {
        if (!rawData.visual_matches) {
            return {
                success: false,
                error: 'Tidak ada hasil yang ditemukan',
                results: []
            }
        }

        const results = rawData.visual_matches.map(item => ({
            position: item.position,
            title: item.title,
            source: item.source,
            sourceIcon: item.source_icon,
            link: item.link,
            thumbnail: item.thumbnail,
            image: item.image,
            imageWidth: item.image_width,
            imageHeight: item.image_height
        }))

        const relatedContent = rawData.related_content ? rawData.related_content.map(item => ({
            query: item.query,
            link: item.link,
            thumbnail: item.thumbnail
        })) : []

        return {
            success: true,
            metadata: {
                searchId: rawData.search_metadata?.id,
                status: rawData.search_metadata?.status,
                processedAt: rawData.search_metadata?.processed_at,
                totalTime: rawData.search_metadata?.total_time_taken,
                googleLensUrl: rawData.search_metadata?.google_lens_url
            },
            results: results,
            relatedContent: relatedContent,
            totalResults: results.length
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

    const { url, imageUrl, retry = 0 } = request.query;

    // Menerima parameter url atau imageUrl
    const imageUrlParam = url || imageUrl;

    if (!imageUrlParam) {
        return response.status(400).json({ 
            success: false, 
            error: 'Parameter URL diperlukan. Gunakan parameter "url" atau "imageUrl".' 
        });
    }

    try {
        // Validate image URL
        if (!imageUrlParam.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)) {
            return response.status(400).json({ 
                success: false, 
                error: 'URL tidak valid. Pastikan URL mengarah ke gambar (jpg, png, gif, webp, bmp).' 
            });
        }

        // Search image using Google Lens
        const rawData = await lens.searchByImage(imageUrlParam);
        const processedData = await lens.processResults(rawData);

        return response.status(200).json(processedData);

    } catch (error) {
        console.error('Error fetching Google Lens data:', error);
        
        // Retry logic
        if (retry < 2) {
            // Wait for 1 second before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
            return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
        }
        
        return response.status(500).json({ 
            success: false, 
            error: 'Gagal mengambil data dari Google Lens. Pastikan URL gambar valid dan coba lagi.' 
        });
    }
}
