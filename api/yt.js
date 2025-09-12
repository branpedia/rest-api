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
    // Validate YouTube URL
    if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
      return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL berasal dari YouTube.' });
    }

    // Extract video ID from URL
    const videoId = extractVideoId(url);
    if (!videoId) {
      return response.status(400).json({ success: false, error: 'Could not extract video ID from URL' });
    }

    let downloadLinks;

    try {
      // First try with cloudscraper
      downloadLinks = await getDownloadLinksWithCloudscraper(videoId);
    } catch (error) {
      console.log('Cloudscraper failed, trying with Puppeteer...');
      
      // If cloudscraper fails, use Puppeteer as fallback
      downloadLinks = await getDownloadLinksWithPuppeteer(videoId);
    }

    if (!downloadLinks || downloadLinks.audios.length === 0) {
      return response.status(404).json({ success: false, error: 'No download links found' });
    }

    return response.status(200).json({
      success: true,
      data: {
        videoId,
        title: downloadLinks.title || 'Unknown Title',
        duration: downloadLinks.duration || '0:00',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        downloads: downloadLinks.audios,
        videos: downloadLinks.videos || []
      }
    });

  } catch (error) {
    console.error('Error fetching YouTube data:', error);
    
    // Retry logic
    if (retry < 2) {
      // Wait for 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari YouTube. Pastikan URL valid dan coba lagi.' 
    });
  }
}

// Function to extract video ID from YouTube URL
function extractVideoId(url) {
  try {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/,
      /(?:youtube\.com\/embed\/)([^?]+)/,
      /(?:youtube\.com\/v\/)([^?]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  } catch (error) {
    console.error('Error extracting video ID:', error);
    return null;
  }
}

// Function to get download links using Cloudscraper
async function getDownloadLinksWithCloudscraper(videoId) {
  try {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const saveFromUrl = 'https://id.savefrom.net/21-youtube-to-mp4-9eA.html';

    // Use cloudscraper to bypass protection
    const response = await cloudscraper.post(saveFromUrl, {
      form: {
        sf_url: youtubeUrl,
        sf_submit: ''
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        'Origin': 'https://id.savefrom.net',
        'Referer': 'https://id.savefrom.net/21-youtube-to-mp4-9eA.html',
        'Connection': 'keep-alive'
      },
      timeout: 30000
    });

    return parseDownloadLinks(response);

  } catch (error) {
    console.error('Cloudscraper error:', error);
    throw error;
  }
}

// Function to get download links using Puppeteer
async function getDownloadLinksWithPuppeteer(videoId) {
  let browser = null;
  try {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const saveFromUrl = 'https://id.savefrom.net/21-youtube-to-mp4-9eA.html';

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--window-size=1920,1080'
      ],
      timeout: 30000
    });

    const page = await browser.newPage();
    
    // Set user agent and viewport
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // Set request timeout
    page.setDefaultTimeout(30000);

    // Navigate to SaveFrom.net
    await page.goto(saveFromUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Fill the form and submit
    await page.type('#sf_url', youtubeUrl);
    await page.click('#sf_submit');

    // Wait for results to load with timeout
    try {
      await page.waitForSelector('.media-result', { timeout: 20000 });
    } catch (e) {
      console.log('Media result not found, continuing anyway');
    }

    // Wait a bit more for dynamic content to load
    await page.waitForTimeout(5000);

    // Get the page content
    const html = await page.content();
    
    return parseDownloadLinks(html);

  } catch (error) {
    console.error('Puppeteer error:', error);
    throw error;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
  }
}

// Improved function to parse download links from HTML
function parseDownloadLinks(html) {
  const result = {
    title: '',
    duration: '',
    audios: [],
    videos: []
  };

  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract title - improved selector
    const titleElement = document.querySelector('.row.title') || 
                         document.querySelector('[data-e2e="video-title"]') ||
                         document.querySelector('h1') ||
                         document.querySelector('title');
    if (titleElement) {
      result.title = titleElement.textContent.trim() || titleElement.getAttribute('title') || '';
      // Clean up title
      result.title = result.title.replace(' - YouTube', '').replace('YouTube', '').trim();
    }

    // Extract duration - improved selector
    const durationElement = document.querySelector('.row.duration') || 
                           document.querySelector('[data-e2e="video-duration"]');
    if (durationElement) {
      result.duration = durationElement.textContent.trim() || durationElement.getAttribute('title') || '';
    }

    // Improved audio link extraction
    const allLinks = document.querySelectorAll('a');
    
    allLinks.forEach(link => {
      try {
        const href = link.getAttribute('href') || '';
        const text = link.textContent.trim();
        const className = link.getAttribute('class') || '';
        const dataType = link.getAttribute('data-type') || '';
        const dataQuality = link.getAttribute('data-quality') || '';
        const title = link.getAttribute('title') || '';

        // Check for audio links
        if ((href.includes('googlevideo.com/videoplayback') || href.includes('videoplayback')) &&
            (href.includes('mime=audio') || href.includes('itag=251') || href.includes('itag=250') || href.includes('itag=249') || href.includes('itag=140'))) {
          
          const cleanUrl = cleanDownloadUrl(href);
          
          // Determine audio type and quality
          let audioType = 'opus';
          let quality = dataQuality || '128';
          
          if (href.includes('itag=140') || href.includes('mime=audio%2Fmp4')) {
            audioType = 'm4a';
          }
          
          if (title.includes('kb/s')) {
            quality = title.match(/(\d+)\s*kb\/s/)?.[1] || quality;
          } else if (dataQuality) {
            quality = dataQuality;
          }

          result.audios.push({
            url: cleanUrl,
            quality: quality + ' kb/s',
            type: audioType,
            label: text || `Audio ${audioType.toUpperCase()} ${quality}`,
            originalUrl: href
          });
        }

        // Check for video links
        if ((href.includes('googlevideo.com/videoplayback') || href.includes('videoplayback')) &&
            (href.includes('mime=video') || href.includes('itag=18') || href.includes('itag=22'))) {
          
          const cleanUrl = cleanDownloadUrl(href);
          
          // Determine video quality
          let quality = dataQuality || '720';
          if (title.includes('p')) {
            quality = title.match(/(\d+)\s*p/)?.[1] || quality;
          } else if (dataQuality) {
            quality = dataQuality;
          }

          result.videos.push({
            url: cleanUrl,
            quality: quality + 'p',
            type: 'mp4',
            label: text || `MP4 ${quality}p`,
            originalUrl: href
          });
        }

      } catch (linkError) {
        console.error('Error processing link:', linkError);
      }
    });

    // Alternative parsing using regex for audio links
    if (result.audios.length === 0) {
      const audioRegex = /<a[^>]*href="([^"]*videoplayback[^"]*)"[^>]*data-type="[^"]*audio[^"]*"[^>]*data-quality="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
      let match;
      
      while ((match = audioRegex.exec(html)) !== null) {
        try {
          const cleanUrl = cleanDownloadUrl(match[1]);
          result.audios.push({
            url: cleanUrl,
            quality: match[2] + ' kb/s',
            type: match[1].includes('m4a') ? 'm4a' : 'opus',
            label: match[3].trim(),
            originalUrl: match[1]
          });
        } catch (e) {
          console.error('Error with regex audio parsing:', e);
        }
      }
    }

    // Alternative parsing using regex for video links
    if (result.videos.length === 0) {
      const videoRegex = /<a[^>]*href="([^"]*videoplayback[^"]*)"[^>]*data-type="[^"]*mp4[^"]*"[^>]*data-quality="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
      let match;
      
      while ((match = videoRegex.exec(html)) !== null) {
        try {
          const cleanUrl = cleanDownloadUrl(match[1]);
          result.videos.push({
            url: cleanUrl,
            quality: match[2] + 'p',
            type: 'mp4',
            label: match[3].trim(),
            originalUrl: match[1]
          });
        } catch (e) {
          console.error('Error with regex video parsing:', e);
        }
      }
    }

    // If still no audio links, try to find any audio URLs in the page
    if (result.audios.length === 0) {
      const audioUrlRegex = /https:\/\/[^"']*googlevideo\.com[^"']*videoplayback[^"']*(itag=25[01]|mime=audio[^"']*)/gi;
      const audioMatches = html.match(audioUrlRegex);
      
      if (audioMatches) {
        audioMatches.forEach(url => {
          const cleanUrl = cleanDownloadUrl(url);
          result.audios.push({
            url: cleanUrl,
            quality: '128 kb/s',
            type: url.includes('m4a') ? 'm4a' : 'opus',
            label: 'Audio Download',
            originalUrl: url
          });
        });
      }
    }

  } catch (error) {
    console.error('Error parsing download links:', error);
  }

  return result;
}

// Function to clean download URL
function cleanDownloadUrl(url) {
  if (!url) return '';

  try {
    // Handle URL encoding
    let cleanUrl = decodeURIComponent(url);
    
    // Remove tracking parameters but keep essential ones
    const urlObj = new URL(cleanUrl);
    
    // Essential parameters for video/audio playback
    const essentialParams = [
      'expire', 'ei', 'ip', 'id', 'itag', 'source', 'requiressl',
      'mime', 'clen', 'dur', 'lmt', 'gir', 'ratebypass'
    ];
    
    const newParams = new URLSearchParams();
    
    for (const param of essentialParams) {
      const value = urlObj.searchParams.get(param);
      if (value) {
        newParams.set(param, value);
      }
    }
    
    // Rebuild URL with essential parameters only
    return `${urlObj.origin}${urlObj.pathname}?${newParams.toString()}`;
    
  } catch (error) {
    console.error('Error cleaning URL:', error);
    return url;
  }
}
