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
      // First try with cloudscraper
      const googleLensUrl = 'https://lens.google.com/uploadbyurl';
      const formData = {
        url: imageUrl
      };

      html = await cloudscraper.post(googleLensUrl, {
        form: formData,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
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
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Navigate to Google Lens
      await page.goto('https://lens.google.com', { waitUntil: 'networkidle2' });
      
      // Find and click the upload by URL option
      await page.click('div[jsname="v5jqRd"]');
      await page.waitForTimeout(1000);
      
      // Find the URL input field and enter the image URL
      const urlInput = await page.$('input[placeholder="Tempelkan link gambar"]');
      if (urlInput) {
        await urlInput.type(imageUrl);
        await page.waitForTimeout(1000);
        
        // Find and click the search button
        const searchButton = await page.$('div[jsname="ZtOxCb"]');
        if (searchButton) {
          await searchButton.click();
          await page.waitForNavigation({ waitUntil: 'networkidle2' });
        }
      }
      
      html = await page.content();
      if (browser) await browser.close();
    }

    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract related searches
    const relatedSearches = [];
    const relatedSearchElements = document.querySelectorAll('.Kg0xqe.sjVJQd');
    
    for (const element of relatedSearchElements) {
      const titleElement = element.querySelector('.I9S4yc');
      const imageElement = element.querySelector('.vzRSI.uhHOwf.BYbUcd img');
      
      if (titleElement) {
        const title = titleElement.textContent.trim();
        const image = imageElement ? imageElement.src : null;
        
        relatedSearches.push({
          title,
          image
        });
      }
    }

    // Extract main image
    const mainImageElement = document.querySelector('.VeBrne');
    const mainImage = mainImageElement ? mainImageElement.src : null;

    return response.status(200).json({
      success: true,
      data: {
        mainImage,
        relatedSearches
      }
    });

  } catch (error) {
    console.error('Error fetching Google Lens data:', error);
    
    // Retry logic
    if (retry < 3) {
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
