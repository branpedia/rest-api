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
    // Validate Videy URL
    if (!url.includes('videy.co') || !url.includes('id=')) {
      return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL berasal dari Videy.co dan mengandung parameter id.' });
    }

    // Extract video ID from URL
    const videoIdMatch = url.match(/[?&]id=([^&]+)/i);
    if (!videoIdMatch) {
      return response.status(400).json({ success: false, error: 'Format URL salah! Pastikan URL mengandung parameter id.' });
    }

    const videoId = videoIdMatch[1];
    const directVideoUrl = `https://cdn.videy.co/${videoId}.mp4`;

    let fileSize = null;
    let contentType = null;
    let browser;

    try {
      // First try with cloudscraper to get video headers
      const headResponse = await cloudscraper.head(directVideoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
      });

      // Get headers from cloudscraper response
      fileSize = headResponse.request.headers['content-length'];
      contentType = headResponse.request.headers['content-type'];

    } catch (error) {
      console.log('Cloudscraper HEAD failed, trying with axios...');
      
      // Fallback to axios for HEAD request
      try {
        const axios = await import('axios');
        const headRes = await axios.default.head(directVideoUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 10000
        });
        
        fileSize = headRes.headers['content-length'];
        contentType = headRes.headers['content-type'];
        
      } catch (axiosError) {
        console.log('Axios HEAD also failed, trying Puppeteer...');
        
        // Final fallback: use Puppeteer to get video info
        try {
          browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          });
          
          const page = await browser.newPage();
          await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
          
          // Use abort() for non-essential requests to speed up loading
          await page.setRequestInterception(true);
          page.on('request', request => {
            if (request.resourceType() !== 'document') {
              request.abort();
            } else {
              request.continue();
            }
          });
          
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          
          // Try to get page title for filename
          const pageTitle = await page.title();
          const cleanTitle = pageTitle.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || `Videy_${videoId}`;
          
          await browser.close();
          
          return response.status(200).json({
            success: true,
            data: {
              name: `${cleanTitle}.mp4`,
              size: 'Unknown',
              extension: 'mp4',
              uploaded: 'Unknown',
              downloadUrl: directVideoUrl,
              videoId: videoId,
              details: {
                platform: 'Videy.co',
                quality: 'Original',
                note: 'Ukuran file tidak dapat ditentukan'
              }
            }
          });
          
        } catch (puppeteerError) {
          console.error('Puppeteer failed:', puppeteerError);
          // Continue to return basic info even if all methods fail
        }
      }
    }

    // Format file size
    const formatSize = (bytes) => {
      if (!bytes) return 'Unknown';
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
    };

    // Get clean filename from URL or use videoId
    let fileName = `Videy_${videoId}.mp4`;
    try {
      // Try to get page title for better filename
      const pageResponse = await cloudscraper.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 5000
      });
      
      const dom = new JSDOM(pageResponse);
      const document = dom.window.document;
      const pageTitle = document.querySelector('title');
      if (pageTitle) {
        fileName = `${pageTitle.textContent.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim()}.mp4`;
      }
    } catch (titleError) {
      console.log('Failed to get page title, using default filename');
    }

    return response.status(200).json({
      success: true,
      data: {
        name: fileName,
        size: formatSize(fileSize),
        extension: 'mp4',
        uploaded: 'Unknown',
        downloadUrl: directVideoUrl,
        videoId: videoId,
        details: {
          platform: 'Videy.co',
          quality: 'Original',
          contentType: contentType || 'video/mp4',
          fileSizeBytes: fileSize || 'Unknown'
        }
      }
    });

  } catch (error) {
    console.error('Error fetching Videy data:', error);
    
    // Clean up browser if it's still open
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Error closing browser:', e);
      }
    }
    
    // Retry logic
    if (retry < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari Videy.co. Pastikan URL valid dan coba lagi.' 
    });
  }
}
