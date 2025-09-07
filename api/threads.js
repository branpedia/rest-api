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
    // Validate Threads URL (accept both threads.net and threads.com)
    if ((!url.includes('threads.net') && !url.includes('threads.com')) || !url.includes('/post/')) {
      return response.status(400).json({ 
        success: false, 
        error: 'URL tidak valid. Pastikan URL berasal dari Threads (threads.net atau threads.com).' 
      });
    }

    // Extract thread ID from URL
    let threadId = url.match(/\/post\/([a-zA-Z0-9_-]+)/)?.[1];
    if (!threadId) {
      return response.status(400).json({ success: false, error: 'Gagal mengambil ID post dari URL' });
    }

    // Clean thread ID (remove query parameters if any)
    threadId = threadId.split('?')[0];

    console.log('Extracted thread ID:', threadId);

    let apiData;
    
    try {
      // First try to get data from dolphinradar API
      console.log('Trying dolphinradar API...');
      const apiUrl = `https://www.dolphinradar.com/api/threads/post_detail/${threadId}`;
      
      // Try with cloudscraper first
      try {
        const apiResponse = await cloudscraper.get(apiUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
            "Accept": "application/json",
          }
        });
        apiData = JSON.parse(apiResponse);
      } catch (apiError) {
        console.log('Cloudscraper failed for API, trying direct fetch...');
        
        // If cloudscraper fails, try with Puppeteer
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Linux; Android 10)');
        await page.setExtraHTTPHeaders({
          'Accept': 'application/json'
        });
        
        await page.goto(apiUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Get the API response
        const content = await page.content();
        const dom = new JSDOM(content);
        const preElement = dom.window.document.querySelector('pre');
        
        if (preElement) {
          apiData = JSON.parse(preElement.textContent);
        }
        
        await browser.close();
      }

      if (!apiData) {
        throw new Error('Failed to get data from API');
      }

    } catch (apiError) {
      console.log('API approach failed, falling back to web scraping...', apiError);
      
      // Fallback to web scraping if API fails
      let html;
      let browser;
      
      try {
        // Try with cloudscraper
        html = await cloudscraper.get(url);
      } catch (scraperError) {
        console.log('Cloudscraper failed, trying with Puppeteer...');
        
        // If cloudscraper fails, use Puppeteer as fallback
        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait for potential dynamic content
        await page.waitForTimeout(3000);
        
        html = await page.content();
        if (browser) await browser.close();
      }

      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Extract basic info from page
      const usernameElem = document.querySelector('a[href*="/@"]') || 
                          document.querySelector('span[dir="auto"]') ||
                          document.querySelector('h1, h2, h3, h4, h5, h6');
      const username = usernameElem ? usernameElem.textContent.trim() : 'Unknown';

      // Try multiple selectors for caption
      const captionSelectors = [
        'div[dir="auto']",
        'span[data-testid="post-text"]',
        'h1 + div, h2 + div, h3 + div, h4 + div, h5 + div, h6 + div'
      ];
      
      let caption = 'No caption available';
      for (const selector of captionSelectors) {
        const elem = document.querySelector(selector);
        if (elem && elem.textContent.trim()) {
          caption = elem.textContent.trim();
          break;
        }
      }

      // Create fallback response
      apiData = {
        code: 0,
        data: {
          post_detail: {
            caption_text: caption,
            like_count: 0
          },
          user: {
            username: username,
            full_name: username,
            follower_count: 0,
            verified: false
          }
        }
      };
    }

    // Process the API response
    const raw = apiData;
    const data = raw?.data || raw;
    const post = data?.post_detail || data;
    const user = data?.user || {};

    if (!post) {
      throw new Error('Data post tidak ditemukan');
    }

    const media = post.media_list || [];
    const totalImages = media.filter((m) => m.media_type === 1).length;
    const totalVideos = media.filter((m) => m.media_type === 2).length;

    // Process media for response - ensure correct file extensions
    const processedMedia = [];
    
    for (const item of media) {
      if (item.media_type === 1) { // Image
        // Ensure URL has .jpg extension
        let mediaUrl = item.url;
        if (!mediaUrl.includes('.jpg') && !mediaUrl.includes('.jpeg') && 
            !mediaUrl.includes('.png') && !mediaUrl.includes('.webp')) {
          // Remove any existing query parameters and add .jpg
          mediaUrl = mediaUrl.split('?')[0] + '.jpg';
        }
        
        processedMedia.push({
          type: 'image',
          url: mediaUrl,
          format: 'jpg',
          width: item.width,
          height: item.height
        });
      } else if (item.media_type === 2) { // Video
        // Ensure URL has .mp4 extension
        let mediaUrl = item.url;
        if (!mediaUrl.includes('.mp4') && !mediaUrl.includes('.mov') && 
            !mediaUrl.includes('.avi') && !mediaUrl.includes('.webm')) {
          // Remove any existing query parameters and add .mp4
          mediaUrl = mediaUrl.split('?')[0] + '.mp4';
        }
        
        processedMedia.push({
          type: 'video',
          url: mediaUrl,
          format: 'mp4',
          width: item.width,
          height: item.height
        });
      }
    }

    // Prepare response
    const responseData = {
      success: true,
      data: {
        user: {
          full_name: user.full_name || "-",
          username: user.username || "-",
          verified: user.verified || user.is_verified || false,
          follower_count: user.follower_count || 0,
          avatar: user.avatar || null
        },
        post: {
          caption: post.caption_text || "-",
          like_count: post.like_count || 0,
          media_count: {
            images: totalImages,
            videos: totalVideos,
            total: media.length
          }
        },
        media: processedMedia
      }
    };

    return response.status(200).json(responseData);

  } catch (error) {
    console.error('Error fetching Threads data:', error);
    
    // Retry logic
    if (retry < 2) {
      console.log(`Retrying... (${parseInt(retry) + 1}/2)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari Threads. Pastikan URL valid dan coba lagi.',
      details: error.message 
    });
  }
}
