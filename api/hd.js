const s = {
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
        return 'https://get1.imglarger.com'
    },
    get baseHeaders() {
        return {
            'accept-encoding': 'gzip, deflate, br, zstd',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
            'origin': 'https://imgupscaler.com',
            'referer': 'https://imgupscaler.com/'
        }
    },

    // Fungsi baru untuk mendownload gambar dari URL
    async downloadImageFromUrl(imageUrl) {
        try {
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (error) {
            throw new Error(`Download image failed: ${error.message}`);
        }
    },

    async uploadImage(imageBuffer, scaleRatio) {
        const pathname = '/api/UpscalerNew/UploadNew'
        const url = new URL(pathname, this.baseUrl)
        
        const formData = new FormData()
        const blob = new Blob([imageBuffer], { type: 'image/jpeg' })
        formData.append('myfile', blob, 'image.jpg')
        formData.append('scaleRadio', scaleRatio.toString())

        const headers = {
            ...this.baseHeaders,
            ...formData.getHeaders ? formData.getHeaders() : {}
        }

        const { data } = await this.tools.hit('upload image', url, { 
            method: 'POST',
            headers,
            body: formData
        }, 'json')
        
        return data
    },

    async checkStatus(code, scaleRatio) {
        const pathname = '/api/UpscalerNew/CheckStatusNew'
        const url = new URL(pathname, this.baseUrl)
        
        const headers = {
            ...this.baseHeaders,
            'content-type': 'application/json'
        }

        const body = JSON.stringify({ code, scaleRadio: scaleRatio })

        const { data } = await this.tools.hit('check status', url, { 
            method: 'POST',
            headers,
            body
        }, 'json')
        
        return data
    },

    async upscale(imageBuffer, scaleRatio, maxRetries = 30, retryDelay = 2000) {
        // Upload image
        const uploadResult = await this.uploadImage(imageBuffer, scaleRatio)
        if (uploadResult.code !== 200) {
            throw new Error(`Upload failed: ${uploadResult.msg}`)
        }

        const { code } = uploadResult.data
        
        // Check status with retries
        for (let i = 0; i < maxRetries; i++) {
            const statusResult = await this.checkStatus(code, scaleRatio)

            if (statusResult.code === 200 && statusResult.data.status === 'success') {
                return {
                    success: true,
                    downloadUrls: statusResult.data.downloadUrls,
                    filesize: statusResult.data.filesize,
                    originalfilename: statusResult.data.originalfilename
                }
            }

            if (statusResult.data.status === 'error') {
                throw new Error('Processing failed on server')
            }

            await new Promise(resolve => setTimeout(resolve, retryDelay))
        }

        throw new Error('Processing timeout - maximum retries exceeded')
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

    // Allow both GET and POST requests
    if (request.method !== 'GET' && request.method !== 'POST') {
        return response.status(405).json({ success: false, error: 'Method not allowed' });
    }

    let imageBuffer, scaleNum, retryCount;
    const availableScaleRatio = [2, 4];

    // Handle GET request with URL parameter
    if (request.method === 'GET') {
        const { url: imageUrl, scale = 2, retry = 0 } = request.query;

        if (!imageUrl) {
            return response.status(400).json({ success: false, error: 'Parameter url diperlukan' });
        }

        // Validate URL
        try {
            new URL(imageUrl);
        } catch (e) {
            return response.status(400).json({ success: false, error: 'URL tidak valid' });
        }

        // Validate scale parameter
        scaleNum = parseInt(scale);
        if (!availableScaleRatio.includes(scaleNum)) {
            return response.status(400).json({ success: false, error: 'Scale harus 2 atau 4' });
        }

        retryCount = parseInt(retry);

        try {
            // Download image from URL
            imageBuffer = await s.downloadImageFromUrl(imageUrl);
        } catch (error) {
            console.error('Error downloading image:', error);
            return response.status(400).json({ success: false, error: 'Gagal mengunduh gambar dari URL' });
        }
    } 
    // Handle POST request with base64 image
    else if (request.method === 'POST') {
        const { image, scale = 2, retry = 0 } = request.body;

        if (!image) {
            return response.status(400).json({ success: false, error: 'Parameter image diperlukan (base64 encoded)' });
        }

        // Validate scale parameter
        scaleNum = parseInt(scale);
        if (!availableScaleRatio.includes(scaleNum)) {
            return response.status(400).json({ success: false, error: 'Scale harus 2 atau 4' });
        }

        retryCount = parseInt(retry);

        try {
            // Convert base64 to buffer
            const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
        } catch (error) {
            console.error('Error processing base64 image:', error);
            return response.status(400).json({ success: false, error: 'Format base64 tidak valid' });
        }
    }

    try {
        // Process image
        const result = await s.upscale(imageBuffer, scaleNum);

        return response.status(200).json({
            success: true,
            data: {
                scale: scaleNum,
                downloadUrls: result.downloadUrls,
                filesize: result.filesize,
                originalfilename: result.originalfilename
            }
        });

    } catch (error) {
        console.error('Error processing image:', error);
        
        // Retry logic
        if (retryCount < 2) {
            // Wait for 1 second before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (request.method === 'GET') {
                // For GET requests, we need to reconstruct the query
                const newQuery = new URLSearchParams(request.query);
                newQuery.set('retry', retryCount + 1);
                
                // Create a new request object with updated query
                const newRequest = {
                    ...request,
                    query: Object.fromEntries(newQuery)
                };
                return handler(newRequest, response);
            } else {
                // For POST requests
                return handler({ 
                    ...request, 
                    body: { ...request.body, retry: retryCount + 1 } 
                }, response);
            }
        }
        
        return response.status(500).json({ 
            success: false, 
            error: error.message || 'Gagal memproses gambar. Pastikan gambar valid dan coba lagi.' 
        });
    }
}
