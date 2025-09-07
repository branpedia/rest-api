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

    let html;
    let browser;

    try {
      // First try with cloudscraper
      console.log('Trying with CloudScraper...');
      html = await cloudscraper.get(url);
    } catch (error) {
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

    // Extract Threads data
    const usernameElem = document.querySelector('a[href*="/@"]') || 
                         document.querySelector('span[dir="auto"]') ||
                         document.querySelector('h1, h2, h3, h4, h5, h6');
    const username = usernameElem ? usernameElem.textContent.trim() : 'Unknown';

    // Try multiple selectors for caption
    const captionSelectors = [
      'div[dir="auto"]',
      'span[data-testid="post-text"]',
      'h1 + div, h2 + div, h3 + div, h4 + div, h5 + div, h6 + div',
      '[data-ad-comet-preview="message"]',
      '.x1yztbdb.x1n2onr6.xh8yej3.x1ja2u2z'
    ];
    
    let caption = 'No caption available';
    for (const selector of captionSelectors) {
      const elem = document.querySelector(selector);
      if (elem && elem.textContent.trim()) {
        caption = elem.textContent.trim();
        break;
      }
    }

    // Extract media (images and videos)
    const media = [];
    
    // Find images
    const imageSelectors = [
      'img[src*=".jpg"], img[src*=".jpeg"], img[src*=".png"], img[src*=".webp"]',
      'img[data-src*=".jpg"], img[data-src*=".jpeg"], img[data-src*=".png"], img[data-src*=".webp"]',
      'image[href*=".jpg"], image[href*=".jpeg"], image[href*=".png"], image[href*=".webp"]',
      '[data-testid="post-image"] img'
    ];
    
    for (const selector of imageSelectors) {
      const images = document.querySelectorAll(selector);
      for (const img of images) {
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('href') || img.getAttribute('xlink:href');
        if (src && !src.startsWith('data:') && !media.some(m => m.url === src)) {
          media.push({
            type: 'image',
            url: src,
            format: src.split('.').pop() || 'jpg'
          });
        }
      }
    }
    
    // Find videos
    const videoSelectors = [
      'video source',
      'video',
      '[data-testid="post-video"] source',
      'meta[property="og:video"]'
    ];
    
    for (const selector of videoSelectors) {
      const videos = document.querySelectorAll(selector);
      for (const video of videos) {
        const src = video.src || video.getAttribute('content') || video.getAttribute('data-src');
        if (src && !src.startsWith('data:') && !media.some(m => m.url === src)) {
          media.push({
            type: 'video',
            url: src,
            format: 'mp4'
          });
        }
      }
    }
    
    // Fallback: check meta tags for media
    if (media.length === 0) {
      const metaImages = document.querySelectorAll('meta[property="og:image"]');
      for (const meta of metaImages) {
        const content = meta.getAttribute('content');
        if (content && !media.some(m => m.url === content)) {
          media.push({
            type: 'image',
            url: content,
            format: content.split('.').pop() || 'jpg'
          });
        }
      }
    }

    // Try to get like count
    const likeSelectors = [
      '[aria-label*="like" i]',
      '[aria-label*="suka" i]',
      '[data-testid="like-count"]',
      'span:contains("likes"), span:contains("suka")',
      '.x1lliihq.x1plvlek.xryxfnj.x1n2onr6.x193iq5w.xeuugli.x1fj9vlw.x13faqbe.x1vvkbs.x1s928wv.xhkezso.x1gmr53x.x1cpjm7i.x1fgarty.x1943h6x.x1i0vuye.x1ms8i2q.x5n08af.x10wh9bi.x1wdrske.x8viiok.x18hxmgj'
    ];
    
    let likeCount = 0;
    for (const selector of likeSelectors) {
      const elem = document.querySelector(selector);
      if (elem) {
        const likeText = elem.textContent.trim();
        const match = likeText.match(/\d+/);
        if (match) {
          likeCount = parseInt(match[0]);
          break;
        }
      }
    }

    return response.status(200).json({
      success: true,
      data: {
        user: {
          username: username,
        },
        post: {
          caption: caption,
          like_count: likeCount,
        },
        media: media,
        source: 'web-scraping'
      }
    });

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
