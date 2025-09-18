import cloudscraper from 'cloudscraper';
import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';

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

  const { imageUrl, retry = 0 } = request.query;

  if (!imageUrl) {
    return response.status(400).json({ success: false, error: 'Parameter imageUrl diperlukan' });
  }

  try {
    // Validate URL
    try {
      new URL(imageUrl);
    } catch (error) {
      return response.status(400).json({ success: false, error: 'URL tidak valid' });
    }

    let html;
    let browser;

    try {
      // Use direct approach with Cloudscraper first
      const encodedImageUrl = encodeURIComponent(imageUrl);
      const searchUrl = `https://www.google.com/searchbyimage?image_url=${encodedImageUrl}`;
      
      html = await cloudscraper.get({
        url: searchUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });
    } catch (error) {
      console.log('Cloudscraper failed, trying with Puppeteer...');
      
      // If cloudscraper fails, use Puppeteer
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 800 });
      
      // Navigate directly to searchbyimage
      const encodedImageUrl = encodeURIComponent(imageUrl);
      await page.goto(`https://www.google.com/searchbyimage?image_url=${encodedImageUrl}`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      // Wait for results to load
      await page.waitForTimeout(5000);
      
      html = await page.content();
      if (browser) await browser.close();
    }

    // Parse the HTML with JSDOM
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract related searches
    const relatedSearches = [];
    
    // Method 1: Look for search result links
    const searchResultElements = document.querySelectorAll('a[href*="/search"]');
    for (const element of searchResultElements) {
      const titleElement = element.querySelector('.I9S4yc, .Yt787, .UAiK1e, h3, .DKV0Md');
      if (titleElement) {
        const title = titleElement.textContent.trim();
        const href = element.getAttribute('href');
        
        // Extract the actual URL from Google's redirect
        let actualUrl = null;
        if (href && href.includes('/url?')) {
          const urlParams = new URLSearchParams(href.split('/url?')[1]);
          actualUrl = urlParams.get('url');
        }
        
        relatedSearches.push({
          title,
          url: actualUrl || href
        });
      }
    }
    
    // Method 2: Look for image result links (alternative approach)
    if (relatedSearches.length === 0) {
      const imageResultElements = document.querySelectorAll('.Kg0xqe.sjVJQd, .g, .rc, .tF2Cxc');
      for (const element of imageResultElements) {
        const titleElement = element.querySelector('.I9S4yc, .Yt787, .UAiK1e, h3, .DKV0Md, .LC20lb');
        const linkElement = element.querySelector('a');
        
        if (titleElement && linkElement) {
          const title = titleElement.textContent.trim();
          const href = linkElement.getAttribute('href');
          
          // Extract the actual URL from Google's redirect
          let actualUrl = null;
          if (href && href.includes('/url?')) {
            const urlParams = new URLSearchParams(href.split('/url?')[1]);
            actualUrl = urlParams.get('url');
          }
          
          relatedSearches.push({
            title,
            url: actualUrl || href
          });
        }
      }
    }
    
    // Method 3: Look for "Buka" links specifically
    const openLinks = document.querySelectorAll('a[class*="umNKYc"], a[href*="/url"]');
    for (const element of openLinks) {
      const titleElement = element.closest('.g, .tF2Cxc, .MjjYud')?.querySelector('.LC20lb, .DKV0Md, h3');
      if (titleElement) {
        const title = titleElement.textContent.trim();
        const href = element.getAttribute('href');
        
        // Extract the actual URL from Google's redirect
        let actualUrl = null;
        if (href && href.includes('/url?')) {
          const urlParams = new URLSearchParams(href.split('/url?')[1]);
          actualUrl = urlParams.get('url');
        }
        
        relatedSearches.push({
          title,
          url: actualUrl || href
        });
      }
    }
    
    // Remove duplicates
    const uniqueSearches = relatedSearches.filter((search, index, self) =>
      index === self.findIndex(s => s.title === search.title && s.url === search.url)
    );

    // Extract main image
    const mainImageElement = document.querySelector('.VeBrne, img[alt*="Image result"], .J9sbhc img');
    const mainImage = mainImageElement ? mainImageElement.src : null;

    // Extract search URL
    const searchUrl = dom.window.location.href;

    return response.status(200).json({
      success: true,
      data: {
        searchUrl,
        mainImage,
        relatedSearches: uniqueSearches.slice(0, 10) // Limit to 10 results
      }
    });

  } catch (error) {
    console.error('Error fetching Google Lens data:', error);
    
    // Retry logic
    if (retry < 2) {
      console.log(`Retrying... Attempt ${parseInt(retry) + 1}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari Google Lens. Pastikan URL gambar valid dan coba lagi.',
      details: error.message
    });
  }
}
