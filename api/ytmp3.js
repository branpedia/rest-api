// api/youtube-download.js
import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { url, format = 'audio', retry = 0 } = req.query;

  if (!url) {
    return res.status(400).json({ success: false, error: 'URL parameter is required' });
  }

  try {
    // Validate YouTube URL
    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({ success: false, error: 'Invalid YouTube URL' });
    }

    let result;
    
    // Try multiple methods with fallback
    try {
      console.log('Trying first method (ytmp3.wf)...');
      result = await downloadWithFirstMethod(url, format);
    } catch (error1) {
      console.log('First method failed:', error1.message);
      
      // If first method fails, try second method (savetube)
      try {
        console.log('Trying second method (savetube.me)...');
        result = await downloadWithSecondMethod(url);
      } catch (error2) {
        console.log('Second method failed:', error2.message);
        
        // If second method fails, try third method (cloudscraper)
        try {
          console.log('Trying third method (cloudscraper)...');
          result = await convertWithCloudscraper(url);
        } catch (error3) {
          console.log('Third method failed:', error3.message);
          
          // If third method fails, try fourth method (puppeteer)
          try {
            console.log('Trying fourth method (puppeteer)...');
            result = await convertWithPuppeteer(url);
          } catch (error4) {
            console.log('Fourth method failed:', error4.message);
            throw new Error('All download methods failed');
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error:', error.message);
    
    // Retry logic
    if (retry < 3) {
      // Wait for 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...req, query: { ...req.query, retry: parseInt(retry) + 1 } }, res);
    }
    
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to download audio' 
    });
  }
}

// Validate YouTube URL
function isValidYouTubeUrl(url) {
  const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]+/;
  return pattern.test(url);
}

// First download method (ytmp3.wf)
async function downloadWithFirstMethod(youtubeUrl, userFormat = 'audio') {
  const yt = {
    get url() {
      return {
        origin: 'https://convert.ytmp3.wf',
      }
    },

    get randomCookie() {
      const length = 26
      const charset = '0123456789abcdefghijklmnopqrstuvwxyz'
      const charsetArray = charset.split("")
      const pickRandom = (array) => array[Math.floor(Math.random() * array.length)]
      const result = Array.from({ length }, _ => pickRandom(charsetArray)).join("")
      return result
    },

    formatHandling(userFormat) {
      const validFormat = ['audio', 'best_video', '144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p']
      if (!validFormat.includes(userFormat)) throw Error(`invalid format!. available format: ${validFormat.join(', ')}`)
      let isVideo = false, quality = null
      if (userFormat != 'audio') {
        isVideo = true
        if (userFormat == 'best_video') {
          quality = '10000'
        } else {
          quality = userFormat.match(/\d+/)[0]
        }
      }
      return { isVideo, quality }
    },

    async download(youtubeUrl, userFormat = 'audio') {
      // format handling
      const f = this.formatHandling(userFormat)

      // path decision
      const pathButton = f.isVideo ? '/vidbutton/' : '/button/'
      const pathConvert = f.isVideo ? '/vidconvert/' : '/convert/'

      // generate random cookiie
      const cookie = `PHPSESSID=${this.randomCookie}`
      console.log('generate random cookie')

      // client hit mirip axios :v 
      const headers = {
        "accept-encoding": "gzip, deflate, br, zstd",
        "cookie": cookie,
        "referer": this.url.origin
      }
      
      const hit = async (method, path, body, returnType = 'text') => {
        try {
          const url = `${this.url.origin}${path}`
          const opts = { method, body, headers }
          const r = await fetch(url, opts)
          if (!r.ok) throw Error(`${r.status} ${r.statusText}\n${await r.text()}`)
          const res = returnType == "json" ? await r.json() : await r.text()
          return res
        } catch (e) {
          throw Error(`gagal hit ${path}. karena ${e.message}`)
        }
      }

      // first hit
      const html = await hit('get', `${pathButton}?url=${youtubeUrl}`)
      console.log(`button hit`)
      let m1 = html.match(/data: (.+?)\n\t\t\t\tsuccess/ms)?.[1].replace('},', '}').trim()
      if (f.isVideo) {
        m1 = m1.replace(`$('#height').val()`, f.quality)
      }
      const payload = eval("(" + m1 + ")")

      // second hit
      headers.referer = `${this.url.origin}${pathButton}?url=${youtubeUrl}`
      headers.origin = this.url.origin,
      headers["x-requested-with"] = "XMLHttpRequest"
      const j2 = await hit('post', pathConvert, new URLSearchParams(payload), 'json')
      console.log(`convert hit`)

      // progress checking
      let j3, fetchCount = 0
      const MAX_FETCH_ATTEMPT = 60

      do {
        fetchCount++
        j3 = await hit('get', `${pathConvert}?jobid=${j2.jobid}&time=${Date.now()}`, null, 'json')
        if (j3.dlurl) {
          return j3
        } else if (j3.error) {
          throw Error(`oops.. ada kesalahan nih raw jsonnya i have no idea. mungkin video gak di support.\n${JSON.stringify(j3, null, 2)}`)
        }
        let print
        if (/^Downloading audio data/.test(j3.retry)) {
          const match = j3.retry.match(/^(.+?)<(?:.+?)valuenow="(.+?)" /)
          print = `${match[1]} ${match[2]}%`
        } else {
          print = j3.retry.match(/^(.+?)</)?.[1] || `unknown status`
        }
        console.log(print)
        await new Promise(re => setTimeout(re, 3000))

      } while (fetchCount < MAX_FETCH_ATTEMPT)
      throw Error(`mencapai maksimal limit fetch`)
    }
  }

  const result = await yt.download(youtubeUrl, userFormat);
  
  // Extract title from URL if possible
  let title = "YouTube Audio";
  try {
    const titleMatch = result.dlurl.match(/title=([^&]+)/);
    if (titleMatch) {
      title = decodeURIComponent(titleMatch[1]);
    }
  } catch (e) {
    console.log('Could not extract title from URL');
  }
  
  return {
    title: title,
    downloadUrl: result.dlurl,
    format: userFormat === 'audio' ? 'mp3' : 'mp4',
    quality: userFormat === 'audio' ? '128kbps' : userFormat
  };
}

// Second download method (savetube.me) - Modified without crypto
async function downloadWithSecondMethod(youtubeUrl) {
  try {
    // Get random CDN
    let cdn = '';
    let retries = 5;
    
    while (retries--) {
      try {
        const res = await fetch("https://media.savetube.me/api/random-cdn");
        const data = await res.json();
        if (data?.cdn) {
          cdn = data.cdn;
          break;
        }
      } catch (error) {
        if (retries === 0) throw new Error("Gagal ambil CDN setelah 5 percobaan");
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!cdn) {
      throw new Error("Tidak dapat mendapatkan CDN");
    }

    // Get video info using cloudscraper to bypass protection
    let infoResponse;
    try {
      infoResponse = await cloudscraper.post({
        uri: `https://${cdn}/v2/info`,
        form: { url: youtubeUrl },
        headers: {
          'Content-Type': 'application/json',
          'Origin': `https://${cdn}`,
          'Referer': `https://${cdn}/`
        }
      });
    } catch (error) {
      // Fallback to regular fetch if cloudscraper fails
      infoResponse = await fetch(`https://${cdn}/v2/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl }),
      }).then(r => r.text());
    }

    const infoData = typeof infoResponse === 'string' ? JSON.parse(infoResponse) : infoResponse;
    
    if (!infoData.status) {
      throw new Error(infoData.message || "Gagal ambil data video");
    }

    // Extract video key from response (no decryption needed)
    const videoKey = infoData.data?.key;
    if (!videoKey) {
      throw new Error("Kunci video tidak ditemukan");
    }

    // Get download link
    let downloadResponse;
    try {
      downloadResponse = await cloudscraper.post({
        uri: `https://${cdn}/download`,
        form: {
          downloadType: 'audio',
          quality: '128',
          key: videoKey,
        },
        headers: {
          'Content-Type': 'application/json',
          'Origin': `https://${cdn}`,
          'Referer': `https://${cdn}/`
        }
      });
    } catch (error) {
      // Fallback to regular fetch
      downloadResponse = await fetch(`https://${cdn}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          downloadType: 'audio',
          quality: '128',
          key: videoKey,
        }),
      }).then(r => r.text());
    }

    const downloadData = typeof downloadResponse === 'string' ? JSON.parse(downloadResponse) : downloadResponse;
    
    if (!downloadData.status || !downloadData.data?.downloadUrl) {
      throw new Error(downloadData.message || "Gagal mendapatkan link download");
    }

    return {
      title: infoData.data?.title || "YouTube Audio",
      downloadUrl: downloadData.data.downloadUrl,
      format: 'mp3',
      quality: '128kbps'
    };
    
  } catch (error) {
    console.error('Savetube error:', error);
    throw new Error(`Savetube method failed: ${error.message}`);
  }
}

// Third download method (cloudscraper)
async function convertWithCloudscraper(url) {
  try {
    // STEP 1: SEARCH - Get video info
    const searchResponse = await cloudscraper.post({
      uri: 'https://ssvid.net/api/ajaxSearch/index',
      form: { query: url },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/'
      }
    });

    const searchData = JSON.parse(searchResponse);

    if (!searchData || !searchData.vid) {
      throw new Error('Video tidak ditemukan di ssvid.net');
    }

    // Get token for m4a (fallback to mp3 if not available)
    let format = "m4a";
    let token = searchData?.links?.m4a?.["140"]?.k;

    if (!token) {
      format = "mp3";
      token = searchData?.links?.mp3?.mp3128?.k;
    }

    if (!token) {
      throw new Error("Token konversi untuk M4A/MP3 tidak ditemukan.");
    }

    const vid = searchData.vid;

    // STEP 2: CONVERT - Get download link
    const convertResponse = await cloudscraper.post({
      uri: 'https://ssvid.net/api/ajaxConvert/convert',
      form: { vid, k: token },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/'
      }
    });

    const convertData = JSON.parse(convertResponse);
    
    if (!convertData || !convertData.dlink) {
      throw new Error("Download link tidak ditemukan.");
    }

    return {
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

// Fourth download method (puppeteer)
async function convertWithPuppeteer(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
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
