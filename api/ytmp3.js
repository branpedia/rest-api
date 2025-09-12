import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

class YouTubeDownloader {
  constructor() {
    this.sources = {
      ytmp3wf: 'https://convert.ytmp3.wf',
      ssvid: 'https://ssvid.net'
    };
  }

  // ========== UTILITY METHODS ==========
  getRandomCookie() {
    const length = 26;
    const charset = '0123456789abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  }

  formatHandling(userFormat) {
    const validFormat = ['audio', 'best_video', '144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p'];
    if (!validFormat.includes(userFormat)) {
      throw Error(`Invalid format! Available formats: ${validFormat.join(', ')}`);
    }
    
    let isVideo = false, quality = null;
    if (userFormat !== 'audio') {
      isVideo = true;
      if (userFormat === 'best_video') {
        quality = '10000';
      } else {
        quality = userFormat.match(/\d+/)[0];
      }
    }
    return { isVideo, quality };
  }

  // ========== DOWNLOAD METHODS ==========
  
  // Method 1: convert.ytmp3.wf
  async downloadWithYTMP3WF(youtubeUrl, userFormat = 'audio') {
    try {
      const f = this.formatHandling(userFormat);
      const pathButton = f.isVideo ? '/vidbutton/' : '/button/';
      const pathConvert = f.isVideo ? '/vidconvert/' : '/convert/';
      const cookie = `PHPSESSID=${this.getRandomCookie()}`;
      
      const headers = {
        "accept-encoding": "gzip, deflate, br, zstd",
        "cookie": cookie,
        "referer": this.sources.ytmp3wf
      };

      const hit = async (method, path, body, returnType = 'text') => {
        try {
          const url = `${this.sources.ytmp3wf}${path}`;
          const options = {
            method,
            headers,
            ...(method === 'POST' && body ? { form: body } : {})
          };
          
          const response = await cloudscraper({ uri: url, ...options });
          
          if (returnType === 'json') {
            return typeof response === 'string' ? JSON.parse(response) : response;
          }
          return response;
        } catch (e) {
          throw Error(`Failed to request ${path}. Reason: ${e.message}`);
        }
      };

      // First request
      const html = await hit('GET', `${pathButton}?url=${encodeURIComponent(youtubeUrl)}`);
      let m1 = html.match(/data: (.+?)\n\t\t\t\tsuccess/ms)?.[1].replace('},', '}').trim();
      
      if (f.isVideo) {
        m1 = m1.replace(`$('#height').val()`, f.quality);
      }
      
      const payload = eval("(" + m1 + ")");

      // Second request
      headers.referer = `${this.sources.ytmp3wf}${pathButton}?url=${encodeURIComponent(youtubeUrl)}`;
      headers.origin = this.sources.ytmp3wf;
      headers["x-requested-with"] = "XMLHttpRequest";
      
      const j2 = await hit('POST', pathConvert, payload, 'json');

      // Progress checking
      let j3, fetchCount = 0;
      const MAX_FETCH_ATTEMPT = 60;
      
      do {
        fetchCount++;
        j3 = await hit('GET', `${pathConvert}?jobid=${j2.jobid}&time=${Date.now()}`, null, 'json');
        
        if (j3.dlurl) {
          return {
            success: true,
            source: 'ytmp3wf',
            title: j3.title || "YouTube Content",
            downloadUrl: j3.dlurl,
            format: f.isVideo ? 'video' : 'audio',
            quality: userFormat
          };
        } else if (j3.error) {
          throw new Error(`Error: ${j3.error}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000));
      } while (fetchCount < MAX_FETCH_ATTEMPT);
      
      throw new Error(`Reached maximum fetch limit`);
    } catch (error) {
      console.error('YTMP3.WF Error:', error.message);
      throw error;
    }
  }

  // Method 2: ssvid.net dengan cloudscraper
  async downloadWithSSVID(youtubeUrl) {
    try {
      // First try with cloudscraper
      return await this.convertWithCloudscraper(youtubeUrl);
    } catch (error) {
      console.log('Cloudscraper failed, trying with Puppeteer...');
      // If cloudscraper fails, use Puppeteer as fallback
      return await this.convertWithPuppeteer(youtubeUrl);
    }
  }

  async convertWithCloudscraper(url) {
    try {
      // STEP 1: SEARCH - Get video info
      const searchResponse = await cloudscraper.post({
        uri: `${this.sources.ssvid}/api/ajaxSearch/index`,
        form: { query: url },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': this.sources.ssvid,
          'Referer': `${this.sources.ssvid}/`
        }
      });

      const searchData = typeof searchResponse === 'string' ? JSON.parse(searchResponse) : searchResponse;

      if (!searchData || !searchData.vid) {
        throw new Error('Video not found on ssvid.net');
      }

      // Get token for m4a (fallback to mp3 if not available)
      let format = "m4a";
      let token = searchData?.links?.m4a?.["140"]?.k;

      if (!token) {
        format = "mp3";
        token = searchData?.links?.mp3?.mp3128?.k;
      }

      if (!token) {
        throw new Error("Conversion token for M4A/MP3 not found.");
      }

      const vid = searchData.vid;

      // STEP 2: CONVERT - Get download link
      const convertResponse = await cloudscraper.post({
        uri: `${this.sources.ssvid}/api/ajaxConvert/convert`,
        form: { vid, k: token },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': this.sources.ssvid,
          'Referer': `${this.sources.ssvid}/`
        }
      });

      const convertData = typeof convertResponse === 'string' ? JSON.parse(convertResponse) : convertResponse;
      
      if (!convertData || !convertData.dlink) {
        throw new Error("Download link not found.");
      }

      return {
        success: true,
        source: 'ssvid',
        title: searchData.title || "YouTube Audio",
        downloadUrl: convertData.dlink,
        format: format,
        quality: format === "mp3" ? "128kbps" : "140kbps"
      };
      
    } catch (error) {
      console.error('Cloudscraper conversion error:', error);
      throw error;
    }
  }

  async convertWithPuppeteer(url) {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Navigate to ytmp3.cc
      await page.goto('https://ytmp3.cc/en13/', { 
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      // Input the URL
      await page.type('#input', url);
      
      // Click the convert button
      await page.click('#submit');
      
      // Wait for conversion to complete
      await page.waitForSelector('#download', { timeout: 60000 });
      
      // Get download link and title
      const downloadUrl = await page.$eval('#download', el => el.href);
      const title = await page.$eval('#title', el => el.value);
      
      await browser.close();
      
      return {
        success: true,
        source: 'puppeteer',
        title: title,
        downloadUrl: downloadUrl,
        format: "mp3",
        quality: "128kbps"
      };
      
    } catch (error) {
      if (browser) await browser.close();
      console.error('Puppeteer conversion error:', error);
      throw error;
    }
  }

  // ========== MAIN DOWNLOAD METHOD WITH FALLBACK ==========
  async download(youtubeUrl, format = 'audio', options = {}) {
    const { maxRetries = 3, fallbackOrder = ['ytmp3wf', 'ssvid'] } = options;
    
    // For audio-only requests, we can use all methods
    if (format === 'audio') {
      for (let i = 0; i < maxRetries; i++) {
        const method = fallbackOrder[i % fallbackOrder.length];
        
        try {
          console.log(`Attempting download with method: ${method}`);
          
          switch(method) {
            case 'ytmp3wf':
              return await this.downloadWithYTMP3WF(youtubeUrl, 'audio');
            case 'ssvid':
              return await this.downloadWithSSVID(youtubeUrl);
            default:
              continue;
          }
        } catch (error) {
          console.error(`Method ${method} failed:`, error.message);
          if (i === maxRetries - 1) throw error;
        }
      }
    } 
    // For video requests, only ytmp3wf supports it
    else {
      try {
        return await this.downloadWithYTMP3WF(youtubeUrl, format);
      } catch (error) {
        console.error('Video download failed:', error.message);
        throw new Error(`Video download not supported by fallback methods. Error: ${error.message}`);
      }
    }
    
    throw new Error('All download methods failed');
  }
}

// API Handler
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

  const { url, format = 'audio', retry = 0 } = request.query;

  if (!url) {
    return response.status(400).json({ success: false, error: 'URL parameter is required' });
  }

  try {
    // Validate YouTube URL
    if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
      return response.status(400).json({ success: false, error: 'Invalid URL. Please provide a valid YouTube URL.' });
    }

    const yt = new YouTubeDownloader();
    const result = await yt.download(url, format);

    return response.status(200).json(result);

  } catch (error) {
    console.error('Error in YouTube downloader:', error);
    
    // Retry logic
    if (retry < 3) {
      // Wait for 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      const newQuery = new URLSearchParams(request.query);
      newQuery.set('retry', parseInt(retry) + 1);
      return handler({ ...request, query: Object.fromEntries(newQuery) }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Failed to fetch data from YouTube. Please ensure the URL is valid and try again.' 
    });
  }
}
