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

    let browser;
    let page;
    let finalUrl;

    try {
      // Use Puppeteer for better handling of Google's protections
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
      
      page = await browser.newPage();
      
      // Set realistic user agent and viewport
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 800 });
      
      // Navigate to Google Lens
      await page.goto('https://lens.google.com', { 
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      // Wait for page to load
      await page.waitForTimeout(3000);
      
      // Check if we need to accept cookies
      try {
        const acceptButton = await page.$('button:not([disabled]):has-text("Accept all"), button:not([disabled]):has-text("I agree")');
        if (acceptButton) {
          await acceptButton.click();
          await page.waitForTimeout(2000);
        }
      } catch (e) {
        console.log('No cookie consent button found or could not click it');
      }
      
      // Click the upload by URL option
      const uploadButton = await page.$('div[jsname="v5jqRd"], div[aria-label="Search by image"], button[aria-label="Search by image"]');
      if (uploadButton) {
        await uploadButton.click();
        await page.waitForTimeout(2000);
      } else {
        // Alternative approach - try to find the camera icon
        const cameraIcon = await page.$('svg[viewBox="0 -960 960 960"]');
        if (cameraIcon) {
          await cameraIcon.click();
          await page.waitForTimeout(2000);
        }
      }
      
      // Find the URL input field and enter the image URL
      const urlInput = await page.$('input[placeholder*="link"], input[placeholder*="Tempelkan"], input[type="text"]');
      if (urlInput) {
        await urlInput.click();
        await page.waitForTimeout(1000);
        await urlInput.type(imageUrl, { delay: 100 });
        await page.waitForTimeout(1000);
        
        // Find and click the search button
        const searchButton = await page.$('div[jsname="ZtOxCb"], button[type="submit"], div:has-text("Telusuri")');
        if (searchButton) {
          await searchButton.click();
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        } else {
          // Try pressing Enter if no button found
          await urlInput.press('Enter');
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        }
      } else {
        throw new Error('Could not find URL input field');
      }
      
      // Wait for results to load
      await page.waitForTimeout(5000);
      
      // Get the final URL after redirection
      finalUrl = page.url();
      
      // Get the page content
      const html = await page.content();
      
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Extract related searches
      const relatedSearches = [];
      const relatedSearchElements = document.querySelectorAll('.Kg0xqe.sjVJQd, a[href*="/search"]');
      
      for (const element of relatedSearchElements) {
        const titleElement = element.querySelector('.I9S4yc, .UAiK1e');
        const imageElement = element.querySelector('.vzRSI.uhHOwf.BYbUcd img, img');
        
        if (titleElement) {
          const title = titleElement.textContent.trim();
          const image = imageElement ? imageElement.src : null;
          const href = element.getAttribute('href');
          
          relatedSearches.push({
            title,
            image,
            href: href ? new URL(href, 'https://www.google.com').href : null
          });
        }
      }

      // Extract main image
      const mainImageElement = document.querySelector('.VeBrne, img[alt*="Image result"]');
      const mainImage = mainImageElement ? mainImageElement.src : null;

      // Extract search URL
      const searchUrl = finalUrl;

      return response.status(200).json({
        success: true,
        data: {
          searchUrl,
          mainImage,
          relatedSearches
        }
      });

    } catch (error) {
      console.error('Error with Puppeteer:', error);
      
      // If Puppeteer fails, try with cloudscraper as fallback
      try {
        console.log('Puppeteer failed, trying with Cloudscraper...');
        
        const googleLensUrl = 'https://lens.google.com/uploadbyurl';
        const formData = {
          url: imageUrl
        };

        const html = await cloudscraper.post(googleLensUrl, {
          form: formData,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Origin': 'https://lens.google.com',
            'Referer': 'https://lens.google.com/'
          }
        });

        const dom = new JSDOM(html);
        const document = dom.window.document;

        // Extract related searches
        const relatedSearches = [];
        const relatedSearchElements = document.querySelectorAll('.Kg0xqe.sjVJQd, a[href*="/search"]');
        
        for (const element of relatedSearchElements) {
          const titleElement = element.querySelector('.I9S4yc, .UAiK1e');
          const imageElement = element.querySelector('.vzRSI.uhHOwf.BYbUcd img, img');
          
          if (titleElement) {
            const title = titleElement.textContent.trim();
            const image = imageElement ? imageElement.src : null;
            const href = element.getAttribute('href');
            
            relatedSearches.push({
              title,
              image,
              href: href ? new URL(href, 'https://www.google.com').href : null
            });
          }
        }

        // Extract main image
        const mainImageElement = document.querySelector('.VeBrne, img[alt*="Image result"]');
        const mainImage = mainImageElement ? mainImageElement.src : null;

        // Try to get the redirect URL from the page
        let searchUrl = null;
        const urlMeta = document.querySelector('meta[property="og:url"], meta[name="twitter:url"]');
        if (urlMeta) {
          searchUrl = urlMeta.getAttribute('content');
        }

        return response.status(200).json({
          success: true,
          data: {
            searchUrl,
            mainImage,
            relatedSearches
          }
        });

      } catch (cloudError) {
        console.error('Error with Cloudscraper:', cloudError);
        throw new Error('Both Puppeteer and Cloudscraper failed');
      }
    } finally {
      if (browser) await browser.close();
    }

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
