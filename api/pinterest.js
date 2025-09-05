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
    // Validate Pinterest URL
    if (!url.includes('pinterest.com') && !url.includes('pin.it')) {
      return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL berasal dari Pinterest.' });
    }

    let finalUrl = url;
    let browser;

    // Function to resolve short URLs
    const resolveShortUrl = async (url) => {
      try {
        const response = await cloudscraper.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        return response;
      } catch (error) {
        console.log('Cloudscraper failed for URL resolution, trying with Puppeteer...');
        
        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Enable request interception to capture redirects
        await page.setRequestInterception(true);
        let resolvedUrl = url;
        
        page.on('request', request => {
          if (request.isNavigationRequest() && request.redirectChain().length > 0) {
            resolvedUrl = request.url();
          }
          request.continue();
        });
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await browser.close();
        
        return resolvedUrl;
      }
    };

    // Resolve short URLs first
    if (url.includes('pin.it')) {
      try {
        finalUrl = await resolveShortUrl(url);
      } catch (error) {
        console.log('URL resolution failed, using original URL');
      }
    }

    let html;
    let mediaData = {};

    try {
      // First try with cloudscraper to get savepin page
      const savepinUrl = `https://www.savepin.app/download.php?url=${encodeURIComponent(finalUrl)}&lang=en&type=redirect`;
      html = await cloudscraper.get(savepinUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
    } catch (error) {
      console.log('Cloudscraper failed, trying with Puppeteer...');
      
      // If cloudscraper fails, use Puppeteer as fallback
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      const savepinUrl = `https://www.savepin.app/download.php?url=${encodeURIComponent(finalUrl)}&lang=en&type=redirect`;
      await page.goto(savepinUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      html = await page.content();
      await browser.close();
    }

    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract media URLs
    const extractMediaUrl = (element) => {
      const href = element.getAttribute('href');
      if (!href) return null;
      const match = href.match(/url=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    };

    // Find video elements
    const videoElements = document.querySelectorAll('a[href*="force-save.php?url="][href*=".mp4"]');
    const imageElements = document.querySelectorAll('a[href*="force-save.php?url="][href*=".jpg"], a[href*="force-save.php?url="][href*=".png"], a[href*="force-save.php?url="][href*=".jpeg"]');

    const videoUrl = videoElements.length > 0 ? extractMediaUrl(videoElements[0]) : null;
    const imageUrl = imageElements.length > 0 ? extractMediaUrl(imageElements[0]) : null;

    if (!videoUrl && !imageUrl) {
      return response.status(404).json({ 
        success: false, 
        error: 'Tidak dapat menemukan media yang bisa diunduh' 
      });
    }

    return response.status(200).json({
      success: true,
      data: {
        originalUrl: url,
        resolvedUrl: finalUrl,
        media: {
          video: videoUrl,
          image: imageUrl
        },
        type: videoUrl ? 'video' : 'image',
        downloadUrl: videoUrl || imageUrl
      }
    });

  } catch (error) {
    console.error('Error fetching Pinterest data:', error);
    
    // Retry logic
    if (retry < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari Pinterest. Pastikan URL valid dan coba lagi.' 
    });
  }
}
