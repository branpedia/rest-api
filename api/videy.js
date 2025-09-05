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

    let html;
    let browser;

    // Extract video ID from URL
    const videoIdMatch = url.match(/[?&]id=([^&]+)/i);
    if (!videoIdMatch) {
      return response.status(400).json({ success: false, error: 'Format URL salah! Pastikan URL mengandung parameter id.' });
    }

    const videoId = videoIdMatch[1];
    const directVideoUrl = `https://cdn.videy.co/${videoId}.mp4`;

    try {
      // First try with cloudscraper to check if video exists
      const headResponse = await cloudscraper.head(directVideoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      const fileSize = headResponse.request.headers['content-length'];
      const contentType = headResponse.request.headers['content-type'];

      if (!contentType.includes('video')) {
        throw new Error('URL tidak mengarah ke video yang valid');
      }

      // Format file size
      const formatSize = (bytes) => {
        if (!bytes) return '0 KB';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
      };

      return response.status(200).json({
        success: true,
        data: {
          name: `${videoId}.mp4`,
          size: formatSize(fileSize),
          extension: 'mp4',
          uploaded: 'Unknown', // Videy tidak menyediakan info upload time
          downloadUrl: directVideoUrl,
          videoId: videoId,
          details: {
            platform: 'Videy.co',
            quality: 'Original',
            contentLength: fileSize,
            contentType: contentType
          }
        }
      });

    } catch (error) {
      console.log('Direct video check failed, trying to scrape Videy page...');

      // If direct check fails, try to scrape the Videy page
      try {
        // First try with cloudscraper
        html = await cloudscraper.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
      } catch (cloudError) {
        console.log('Cloudscraper failed, trying with Puppeteer...');
        
        // If cloudscraper fails, use Puppeteer as fallback
        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(url, { waitUntil: 'networkidle2' });
        
        html = await page.content();
        await browser.close();
      }

      // Parse HTML to extract information
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Try to find video information from the page
      const titleElement = document.querySelector('title');
      const pageTitle = titleElement ? titleElement.textContent.trim() : `Videy_${videoId}`;

      // Look for video elements or metadata
      const videoElements = document.querySelectorAll('video');
      let videoSource = '';

      if (videoElements.length > 0) {
        const sourceElement = videoElements[0].querySelector('source');
        if (sourceElement) {
          videoSource = sourceElement.getAttribute('src');
        }
      }

      // If no video source found in page, use the direct CDN URL
      const finalDownloadUrl = videoSource || directVideoUrl;

      return response.status(200).json({
        success: true,
        data: {
          name: `${pageTitle.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`,
          size: 'Unknown', // Size tidak bisa didapatkan dari halaman
          extension: 'mp4',
          uploaded: 'Unknown',
          downloadUrl: finalDownloadUrl,
          videoId: videoId,
          details: {
            platform: 'Videy.co',
            quality: 'Original',
            note: videoSource ? 'Video source ditemukan di halaman' : 'Menggunakan CDN langsung'
          }
        }
      });
    }

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
