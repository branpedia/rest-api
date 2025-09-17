// api/youtube-download.js
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

  const { url, format = 'audio' } = req.query;

  if (!url) {
    return res.status(400).json({ success: false, error: 'URL parameter is required' });
  }

  try {
    // Validate YouTube URL
    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({ success: false, error: 'Invalid YouTube URL' });
    }

    let result;
    
    // Try first method (ytmp3.wf)
    try {
      console.log('Trying first method (ytmp3.wf)...');
      result = await downloadWithFirstMethod(url, format);
    } catch (error1) {
      console.log('First method failed:', error1.message);
      
      // If first method fails, try second method
      try {
        console.log('Trying second method (savetube.me)...');
        result = await downloadWithSecondMethod(url);
      } catch (error2) {
        console.log('Second method failed:', error2.message);
        throw new Error('All download methods failed');
      }
    }

    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error:', error.message);
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

// Second download method (savetube.me)
async function downloadWithSecondMethod(youtubeUrl) {
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
    format: 'mp3',
    quality: '128kbps'
  };
}
