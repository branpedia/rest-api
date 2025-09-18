import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

// Fungsi utama untuk download video YouTube (MP4, MP3, M4A)
export default async function handler(request, response) {
  // Set CORS headers
  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request
  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  // Only allow GET requests
  if (request.method !== 'GET') {
    return response.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { url, quality = '360', format = 'mp4', retry = 0 } = request.query;

  if (!url) {
    return response.status(400).json({ success: false, error: 'Parameter URL diperlukan' });
  }

  try {
    // Validasi URL YouTube
    if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
      return response.status(400).json({
        success: false,
        error: 'URL tidak valid. Pastikan URL berasal dari YouTube.'
      });
    }

    let result;
    
    // Tentukan format yang diminta (mp3, m4a, atau mp4)
    if (format === 'mp3') {
      // Konversi ke MP3
      try {
        result = await convertToMp3(url);
      } catch (error) {
        console.log('MP3 conversion failed, trying alternative method...');
        result = await convertToMp3Alternative(url);
      }
    } else if (format === 'm4a') {
      // Konversi ke M4A
      try {
        result = await convertToM4a(url);
      } catch (error) {
        console.log('M4A conversion failed, trying alternative method...');
        result = await convertToM4aAlternative(url);
      }
    } else {
      // Konversi ke MP4
      try {
        result = await convertWithCloudscraper(url, quality);
      } catch (error) {
        console.log('Cloudscraper failed, trying with Puppeteer...');
        result = await convertWithPuppeteer(url, quality);
      }
    }

    return response.status(200).json({
      success: true,
      data: {
        title: result.title,
        downloadUrl: result.downloadUrl,
        quality: result.quality,
        duration: result.duration,
        thumbnail: result.thumbnail,
        filesize: result.filesize,
        format: format
      }
    });

  } catch (error) {
    console.error('Error:', error);
    
    // Retry logic
    if (retry < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({
      success: false,
      error: error.message || 'Gagal mengambil video dari YouTube'
    });
  }
}

// Convert menggunakan Cloudscraper (MP4)
async function convertWithCloudscraper(url, quality) {
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

    // Get token for the requested quality (default to auto)
    let token;
    let selectedQuality = quality;
    
    // Quality mapping
    const qualityMap = {
      'auto': searchData?.links?.mp4?.auto?.k,
      '360': searchData?.links?.mp4?.["360"]?.k,
      '480': searchData?.links?.mp4?.["480"]?.k,
      '720': searchData?.links?.mp4?.["720"]?.k,
      '1080': searchData?.links?.mp4?.["1080"]?.k
    };

    // If requested quality not available, try auto
    token = qualityMap[quality] || qualityMap['auto'];
    
    // If auto not available, try any available quality
    if (!token) {
      for (const q in qualityMap) {
        if (qualityMap[q]) {
          token = qualityMap[q];
          selectedQuality = q;
          break;
        }
      }
    }

    if (!token) {
      throw new Error("Token konversi untuk MP4 tidak ditemukan.");
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
      title: searchData.title || "YouTube Video",
      downloadUrl: convertData.dlink,
      quality: selectedQuality + 'p',
      duration: searchData.duration,
      thumbnail: searchData.image,
      filesize: searchData?.links?.mp4?.[selectedQuality === 'auto' ? 'auto' : selectedQuality]?.size
    };
    
  } catch (error) {
    console.error('Cloudscraper conversion error:', error);
    throw error;
  }
}

// Convert menggunakan Puppeteer (fallback MP4)
async function convertWithPuppeteer(url, quality) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to y2mate.com
    await page.goto('https://www.y2mate.com/youtube-mp4', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Input the URL
    await page.type('#txt-url', url);
    
    // Click the convert button
    await page.click('#btn-submit');
    
    // Wait for conversion options to appear
    await page.waitForSelector('.mp4-table', { timeout: 60000 });
    
    // Extract available qualities
    const qualities = await page.$$eval('.mp4-table .table-bordered tbody tr', rows => {
      return rows.map(row => {
        const qualityCell = row.querySelector('td:first-child');
        const sizeCell = row.querySelector('td:nth-child(2)');
        const button = row.querySelector('a');
        return {
          quality: qualityCell ? qualityCell.textContent.trim() : '',
          size: sizeCell ? sizeCell.textContent.trim() : '',
          onClick: button ? button.getAttribute('onclick') : ''
        };
      });
    });
    
    // Find the requested quality or the best available
    let selectedQuality = quality;
    let selectedOnClick = '';
    
    // Try to find exact match first
    const exactMatch = qualities.find(q => q.quality.includes(quality + 'p'));
    if (exactMatch) {
      selectedOnClick = exactMatch.onClick;
    } else {
      // If exact match not found, try to find the best available quality
      const qualityOrder = ['1080', '720', '480', '360'];
      for (const q of qualityOrder) {
        const match = qualities.find(item => item.quality.includes(q + 'p'));
        if (match) {
          selectedQuality = q;
          selectedOnClick = match.onClick;
          break;
        }
      }
      
      // If still not found, use the first available
      if (!selectedOnClick && qualities.length > 0) {
        selectedOnClick = qualities[0].onClick;
        selectedQuality = qualities[0].quality.match(/\d+/)?.[0] || '360';
      }
    }
    
    if (!selectedOnClick) {
      throw new Error('Tidak dapat menemukan kualitas video yang sesuai');
    }
    
    // Extract the function call from onClick
    const match = selectedOnClick.match(/\(\'([^']+)\',\'([^']+)\',\'([^']+)\'\)/);
    if (!match) {
      throw new Error('Format onClick tidak dikenali');
    }
    
    const [, k, vid, type] = match;
    
    // Click the download button
    await page.evaluate((k, vid, type) => {
      const event = new Event('click');
      const element = document.querySelector(`a[onclick*="${k}"]`);
      if (element) {
        element.dispatchEvent(event);
      }
    }, k, vid, type);
    
    // Wait for download link to appear
    await page.waitForSelector('#process-result .btn-file', { timeout: 120000 });
    
    // Get download link and title
    const downloadUrl = await page.$eval('#process-result .btn-file', el => el.href);
    const title = await page.$eval('.caption-text', el => el.textContent.trim());
    
    await browser.close();
    
    return {
      title: title,
      downloadUrl: downloadUrl,
      quality: selectedQuality + 'p',
      duration: null,
      thumbnail: null,
      filesize: null
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Puppeteer conversion error:', error);
    throw error;
  }
}

// Convert to MP3 (Primary Method)
async function convertToMp3(youtubeUrl) {
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

    async download(youtubeUrl) {
      // generate random cookie
      const cookie = `PHPSESSID=${this.randomCookie}`
      console.log('generate random cookie')

      // client hit mirip axios
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
      const html = await hit('get', `/button/?url=${youtubeUrl}`)
      console.log(`button hit`)
      let m1 = html.match(/data: (.+?)\n\t\t\t\tsuccess/ms)?.[1].replace('},', '}').trim()
      const payload = eval("(" + m1 + ")")

      // second hit
      headers.referer = `${this.url.origin}/button/?url=${youtubeUrl}`
      headers.origin = this.url.origin,
      headers["x-requested-with"] = "XMLHttpRequest"
      const j2 = await hit('post', '/convert/', new URLSearchParams(payload), 'json')
      console.log(`convert hit`)

      // progress checking
      let j3, fetchCount = 0
      const MAX_FETCH_ATTEMPT = 60

      do {
        fetchCount++
        j3 = await hit('get', `/convert/?jobid=${j2.jobid}&time=${Date.now()}`, null, 'json')
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

  const result = await yt.download(youtubeUrl);
  
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
  
  // Get video info for thumbnail and duration
  let thumbnail = null;
  let duration = null;
  try {
    const videoInfo = await getVideoInfo(youtubeUrl);
    if (videoInfo.success) {
      thumbnail = videoInfo.data.thumbnail;
      duration = videoInfo.data.duration;
    }
  } catch (e) {
    console.log('Could not get video info');
  }
  
  return {
    title: title,
    downloadUrl: result.dlurl,
    quality: '128kbps',
    duration: duration,
    thumbnail: thumbnail,
    filesize: null
  };
}

// Convert to M4A (Primary Method)
async function convertToM4a(youtubeUrl) {
  // Using the same method as MP3 but with different parameters
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

    async download(youtubeUrl, format = 'm4a') {
      // generate random cookie
      const cookie = `PHPSESSID=${this.randomCookie}`
      console.log('generate random cookie')

      // client hit mirip axios
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
      const html = await hit('get', `/button/?url=${youtubeUrl}`)
      console.log(`button hit`)
      
      // Modify the payload to request M4A format
      let m1 = html.match(/data: (.+?)\n\t\t\t\tsuccess/ms)?.[1].replace('},', '}').trim()
      const payload = eval("(" + m1 + ")")
      
      // Change format to M4A
      payload.f = 'm4a';

      // second hit
      headers.referer = `${this.url.origin}/button/?url=${youtubeUrl}`
      headers.origin = this.url.origin,
      headers["x-requested-with"] = "XMLHttpRequest"
      const j2 = await hit('post', '/convert/', new URLSearchParams(payload), 'json')
      console.log(`convert hit`)

      // progress checking
      let j3, fetchCount = 0
      const MAX_FETCH_ATTEMPT = 60

      do {
        fetchCount++
        j3 = await hit('get', `/convert/?jobid=${j2.jobid}&time=${Date.now()}`, null, 'json')
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

  const result = await yt.download(youtubeUrl, 'm4a');
  
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
  
  // Get video info for thumbnail and duration
  let thumbnail = null;
  let duration = null;
  try {
    const videoInfo = await getVideoInfo(youtubeUrl);
    if (videoInfo.success) {
      thumbnail = videoInfo.data.thumbnail;
      duration = videoInfo.data.duration;
    }
  } catch (e) {
    console.log('Could not get video info');
  }
  
  return {
    title: title,
    downloadUrl: result.dlurl,
    quality: '128kbps',
    duration: duration,
    thumbnail: thumbnail,
    filesize: null
  };
}

// Convert to M4A (Alternative Method)
async function convertToM4aAlternative(youtubeUrl) {
  // Using the same method as MP3 alternative but with M4A format
  class Youtubers {
    constructor() {
      this.hex = "C5D58EF67A7584E4A29F6C35BBC4EB12";
    }

    async uint8(hex) {
      const pecahan = hex.match(/[\dA-F]{2}/gi);
      if (!pecahan) throw new Error("Format tidak valid");
      return new Uint8Array(pecahan.map(h => parseInt(h, 16)));
    }

    b64Byte(b64) {
      const bersih = b64.replace(/\s/g, "");
      const biner = Buffer.from(bersih, 'base64');
      return new Uint8Array(biner);
    }

    async key() {
      const raw = await this.uint8(this.hex);
      return await crypto.subtle.importKey("raw", raw, { name: "AES-CBC" }, false, ["decrypt"]);
    }

    async Data(base64Terenkripsi) {
      const byteData = this.b64Byte(base64Terenkripsi);
      if (byteData.length < 16) throw new Error("Data terlalu pendek");

      const iv = byteData.slice(0, 16);
      const data = byteData.slice(16);

      const kunci = await this.key();
      const hasil = await crypto.subtle.decrypt(
        { name: "AES-CBC", iv },
        kunci,
        data
      );

      const teks = new TextDecoder().decode(new Uint8Array(hasil));
      return JSON.parse(teks);
    }

    async getCDN() {
      let retries = 5
      while (retries--) {
        try {
          const res = await fetch("https://media.savetube.me/api/random-cdn")
          const data = await res.json()
          if (data?.cdn) return data.cdn
        } catch {}
      }
      throw new Error("Gagal ambil CDN setelah 5 percobaan")
    }

    async infoVideo(linkYoutube) {
      const cdn = await this.getCDN();
      const res = await fetch(`https://${cdn}/v2/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: linkYoutube }),
      });

      const hasil = await res.json();
      if (!hasil.status) throw new Error(hasil.message||"Gagal ambil data video");

      const isi = await this.Data(hasil.data);
      return {
        judul: isi.title,
        durasi: isi.durationLabel,
        thumbnail: isi.thumbnail,
        kode: isi.key
      };
    }

    async getDownloadLink(kodeVideo, kualitas, format = 'mp3') {
      let retries = 5
      while (retries--) {
        try {
          const cdn = await this.getCDN()
          const res = await fetch(`https://${cdn}/download`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              downloadType: 'audio',
              quality: kualitas,
              key: kodeVideo,
              format: format
            }),
          })

          const json = await res.json()
          if (json?.status && json?.data?.downloadUrl) {
            return json.data.downloadUrl
          }
        } catch {}
      }
      throw new Error("Gagal ambil link unduh setelah 5 percobaan")
    }

    async downloadAudio(linkYoutube, kualitas = '128', format = 'm4a') {
      try {
        const data = await this.infoVideo(linkYoutube);
        const linkUnduh = await this.getDownloadLink(data.kode, kualitas, format);
        return {
          status: true,
          judul: data.judul,
          durasi: data.durasi,
          thumbnail: data.thumbnail,
          url: linkUnduh,
        };
      } catch (err) {
        return {
          status: false,
          pesan: err.message
        };
      }
    }
  }

  const yt = new Youtubers();
  const result = await yt.downloadAudio(youtubeUrl, '128', 'm4a');
  
  if (!result.status) {
    throw new Error(result.pesan);
  }
  
  return {
    title: result.judul,
    downloadUrl: result.url,
    quality: '128kbps',
    duration: result.durasi,
    thumbnail: result.thumbnail,
    filesize: null
  };
}

// Convert to MP3 (Alternative Method)
async function convertToMp3Alternative(youtubeUrl) {
  class Youtubers {
    constructor() {
      this.hex = "C5D58EF67A7584E4A29F6C35BBC4EB12";
    }

    async uint8(hex) {
      const pecahan = hex.match(/[\dA-F]{2}/gi);
      if (!pecahan) throw new Error("Format tidak valid");
      return new Uint8Array(pecahan.map(h => parseInt(h, 16)));
    }

    b64Byte(b64) {
      const bersih = b64.replace(/\s/g, "");
      const biner = Buffer.from(bersih, 'base64');
      return new Uint8Array(biner);
    }

    async key() {
      const raw = await this.uint8(this.hex);
      return await crypto.subtle.importKey("raw", raw, { name: "AES-CBC" }, false, ["decrypt"]);
    }

    async Data(base64Terenkripsi) {
      const byteData = this.b64Byte(base64Terenkripsi);
      if (byteData.length < 16) throw new Error("Data terlalu pendek");

      const iv = byteData.slice(0, 16);
      const data = byteData.slice(16);

      const kunci = await this.key();
      const hasil = await crypto.subtle.decrypt(
        { name: "AES-CBC", iv },
        kunci,
        data
      );

      const teks = new TextDecoder().decode(new Uint8Array(hasil));
      return JSON.parse(teks);
    }

    async getCDN() {
      let retries = 5
      while (retries--) {
        try {
          const res = await fetch("https://media.savetube.me/api/random-cdn")
          const data = await res.json()
          if (data?.cdn) return data.cdn
        } catch {}
      }
      throw new Error("Gagal ambil CDN setelah 5 percobaan")
    }

    async infoVideo(linkYoutube) {
      const cdn = await this.getCDN();
      const res = await fetch(`https://${cdn}/v2/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: linkYoutube }),
      });

      const hasil = await res.json();
      if (!hasil.status) throw new Error(hasil.message||"Gagal ambil data video");

      const isi = await this.Data(hasil.data);
      return {
        judul: isi.title,
        durasi: isi.durationLabel,
        thumbnail: isi.thumbnail,
        kode: isi.key
      };
    }

    async getDownloadLink(kodeVideo, kualitas) {
      let retries = 5
      while (retries--) {
        try {
          const cdn = await this.getCDN()
          const res = await fetch(`https://${cdn}/download`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              downloadType: 'audio',
              quality: kualitas,
              key: kodeVideo,
            }),
          })

          const json = await res.json()
          if (json?.status && json?.data?.downloadUrl) {
            return json.data.downloadUrl
          }
        } catch {}
      }
      throw new Error("Gagal ambil link unduh setelah 5 percobaan")
    }

    async downloadAudio(linkYoutube, kualitas = '128') {
      try {
        const data = await this.infoVideo(linkYoutube);
        const linkUnduh = await this.getDownloadLink(data.kode, kualitas);
        return {
          status: true,
          judul: data.judul,
          durasi: data.durasi,
          thumbnail: data.thumbnail,
          url: linkUnduh,
        };
      } catch (err) {
        return {
          status: false,
          pesan: err.message
        };
      }
    }
  }

  const yt = new Youtubers();
  const result = await yt.downloadAudio(youtubeUrl, '128');
  
  if (!result.status) {
    throw new Error(result.pesan);
  }
  
  return {
    title: result.judul,
    downloadUrl: result.url,
    quality: '128kbps',
    duration: result.durasi,
    thumbnail: result.thumbnail,
    filesize: null
  };
}

// Fungsi untuk mendapatkan info video menggunakan JSDOM
async function getVideoInfo(url) {
  try {
    // Gunakan JSDOM untuk parsing HTML
    const response = await cloudscraper.get(url);
    const dom = new JSDOM(response);
    const document = dom.window.document;
    
    // Extract video info
    const title = document.querySelector('meta[property="og:title"]')?.content || 'YouTube Video';
    const duration = document.querySelector('meta[property="video:duration"]')?.content || null;
    const thumbnail = document.querySelector('meta[property="og:image"]')?.content || null;
    
    return {
      success: true,
      data: {
        title,
        duration,
        thumbnail,
        url
      }
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      success: false,
      error: 'Gagal mengambil info video'
    };
  }
}
