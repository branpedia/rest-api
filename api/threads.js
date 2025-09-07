import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';
import axios from 'axios';
import sharp from 'sharp';

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
    // Validate Threads URL
    if (!url.includes('threads.net') || !url.includes('/post/')) {
      return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL berasal dari Threads.' });
    }

    let html;
    let browser;

    try {
      // First try with cloudscraper
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
      await page.goto(url, { waitUntil: 'networkidle2' });
      
      html = await page.content();
      if (browser) await browser.close();
    }

    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract Threads data using multiple selectors
    const usernameElem = document.querySelector('a[href*="/@"]') || 
                         document.querySelector('span[dir="auto"]') ||
                         document.querySelector('h3');
    const username = usernameElem ? usernameElem.textContent.trim() : 'Unknown';

    const captionElem = document.querySelector('div[dir="auto"]') || 
                        document.querySelector('span[data-testid="post-text"]') ||
                        document.querySelector('h1, h2, h3, h4, h5, h6').nextElementSibling;
    const caption = captionElem ? captionElem.textContent.trim() : 'No caption available';

    // Try to find media elements
    const imageElements = document.querySelectorAll('img, image, [data-testid="post-image"]');
    const videoElements = document.querySelectorAll('video, [data-testid="post-video"]');
    
    const media = [];
    
    // Process images
    for (const img of imageElements) {
      let src = img.src || img.getAttribute('data-src') || img.getAttribute('srcset');
      if (src && !src.startsWith('data:') && !media.some(m => m.url === src)) {
        media.push({
          type: 'image',
          url: src,
          format: 'jpg'
        });
      }
    }
    
    // Process videos
    for (const video of videoElements) {
      let src = video.src || video.getAttribute('data-src');
      if (src && !src.startsWith('data:') && !media.some(m => m.url === src)) {
        media.push({
          type: 'video',
          url: src,
          format: 'mp4'
        });
      }
    }

    // If no media found with direct scraping, try to extract from meta tags
    if (media.length === 0) {
      const metaTags = document.querySelectorAll('meta[property="og:image"], meta[property="og:video"]');
      for (const meta of metaTags) {
        const content = meta.getAttribute('content');
        if (content && !media.some(m => m.url === content)) {
          media.push({
            type: meta.getAttribute('property').includes('image') ? 'image' : 'video',
            url: content,
            format: meta.getAttribute('property').includes('image') ? 'jpg' : 'mp4'
          });
        }
      }
    }

    // Try to get like count
    const likeCountElem = document.querySelector('[aria-label*="like" i], [aria-label*="suka" i], [data-testid="like-count"]');
    let likeCount = 0;
    if (likeCountElem) {
      const likeText = likeCountElem.textContent.trim();
      likeCount = parseInt(likeText.replace(/\D/g, '')) || 0;
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
        media: media
      }
    });

  } catch (error) {
    console.error('Error fetching Threads data:', error);
    
    // Retry logic
    if (retry < 3) {
      // Wait for 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    // Fallback to API approach if scraping fails
    try {
      console.log('Scraping failed, trying API approach...');
      let threadId = url.match(/\/post\/([a-zA-Z0-9]+)/)?.[1];
      if (!threadId) {
        throw new Error('Gagal mengambil ID post dari URL');
      }

      const apiResponse = await axios.get(
        `https://www.dolphinradar.com/api/threads/post_detail/${threadId}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
            Accept: "application/json",
          },
          timeout: 15000
        }
      );

      const raw = apiResponse.data;
      const data = raw?.data || raw;
      const post = data?.post_detail || data;
      const user = data?.user || {};

      if (!post) {
        throw new Error('Data post tidak ditemukan');
      }

      const mediaList = post.media_list || [];
      const processedMedia = [];
      
      for (const item of mediaList) {
        if (item.media_type === 1) { // Image
          processedMedia.push({
            type: 'image',
            url: item.url,
            format: 'jpg'
          });
        } else if (item.media_type === 2) { // Video
          processedMedia.push({
            type: 'video',
            url: item.url,
            format: 'mp4'
          });
        }
      }

      return response.status(200).json({
        success: true,
        data: {
          user: {
            full_name: user.full_name || "-",
            username: user.username || "-",
            verified: user.verified || false,
            follower_count: user.follower_count || 0
          },
          post: {
            caption: post.caption_text || "-",
            like_count: post.like_count || 0,
          },
          media: processedMedia
        }
      });
    } catch (apiError) {
      console.error('API approach also failed:', apiError);
      return response.status(500).json({ 
        success: false, 
        error: 'Gagal mengambil data dari Threads. Pastikan URL valid dan coba lagi.' 
      });
    }
  }
}

// Helper function to download and convert images
async function downloadAndConvert(url, format = "jpg") {
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    let buffer = Buffer.from(res.data);

    const contentType = res.headers["content-type"] || "";
    if (contentType.includes("webp") || url.match(/\.webp$/i) || contentType.includes("image")) {
      try {
        buffer = format === "png"
          ? await sharp(buffer).png().toBuffer()
          : await sharp(buffer).jpeg().toBuffer();
      } catch {
        // fallback ke PNG kalau JPG gagal
        buffer = await sharp(buffer).png().toBuffer();
      }
    }

    return buffer;
  } catch (e) {
    console.error("❌ Gagal download/convert:", e.message, url);
    return null;
  }
}
