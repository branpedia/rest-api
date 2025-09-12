import cloudscraper from 'cloudscraper';
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
      return response.status(400).json({ success: false, error: 'Tidak dapat mengekstrak ID video dari URL' });
    }

    // Try multiple conversion services
    let result;
    try {
      // First try with ssvid.net
      result = await convertWithSSVid(url);
    } catch (error) {
      console.log('SSVid failed, trying with y2mate...');
      
      // If ssvid fails, try y2mate as fallback
      result = await convertWithY2Mate(videoId);
    }

    return response.status(200).json({
      success: true,
      data: {
        title: result.title,
        downloadUrl: result.downloadUrl,
        format: result.format,
        quality: result.quality || '128kbps'
      }
    });

  } catch (error) {
    console.error('Error in YouTube to MP3 converter:', error);
    
    // Retry logic
    if (retry < 3) {
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

// Extract video ID from YouTube URL
function extractVideoId(url) {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}

// Convert using SSVid (original method)
async function convertWithSSVid(url) {
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
    console.error('SSVid conversion error:', error);
    throw error;
  }
}

// Convert using Y2Mate API (alternative to Puppeteer)
async function convertWithY2Mate(videoId) {
  try {
    // Step 1: Get video info and conversion tokens
    const infoResponse = await cloudscraper.get({
      uri: `https://www.y2mate.com/mates/analyzeV2/ajax`,
      method: 'POST',
      formData: {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        q_auto: 0,
        ajax: 1
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://www.y2mate.com',
        'Referer': 'https://www.y2mate.com/'
      }
    });

    const infoData = JSON.parse(infoResponse);
    
    if (!infoData || !infoData.result) {
      throw new Error("Tidak dapat mendapatkan info video dari Y2Mate");
    }

    // Extract title
    const title = infoData.result.title || "YouTube Audio";
    
    // Find MP3 conversion options
    const mp3Options = infoData.result.links?.mp3;
    if (!mp3Options) {
      throw new Error("Tidak ada opsi MP3 yang tersedia");
    }

    // Get the first available MP3 option
    const firstKey = Object.keys(mp3Options)[0];
    const k = mp3Options[firstKey].k;
    const quality = mp3Options[firstKey].q;

    if (!k) {
      throw new Error("Token konversi MP3 tidak ditemukan");
    }

    // Step 2: Convert and get download link
    const convertResponse = await cloudscraper.post({
      uri: 'https://www.y2mate.com/mates/convertV2/index',
      formData: {
        vid: videoId,
        k: k
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://www.y2mate.com',
        'Referer': `https://www.y2mate.com/youtube/${videoId}`
      }
    });

    const convertData = JSON.parse(convertResponse);
    
    if (!convertData || !convertData.result || !convertData.result.dlink) {
      throw new Error("Link download tidak ditemukan dari Y2Mate");
    }

    return {
      title: title,
      downloadUrl: convertData.result.dlink,
      format: "mp3",
      quality: quality || "128kbps"
    };
    
  } catch (error) {
    console.error('Y2Mate conversion error:', error);
    
    // If Y2Mate fails, try another service
    return await convertWithOnlineConverter(videoId);
  }
}

// Alternative converter as backup
async function convertWithOnlineConverter(videoId) {
  try {
    // Use another converter service as backup
    const response = await cloudscraper.get({
      uri: `https://onlinevideoconverter.pro/api/button/mp3/${videoId}`,
      headers: {
        'Referer': 'https://onlinevideoconverter.pro/'
      }
    });

    const data = JSON.parse(response);
    
    if (!data || !data.url) {
      throw new Error("Tidak dapat mendapatkan link download dari online converter");
    }

    // Get video title from YouTube API or generic name
    const titleResponse = await cloudscraper.get(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    
    let title = "YouTube Audio";
    try {
      const titleData = JSON.parse(titleResponse);
      title = titleData.title || title;
    } catch (e) {
      console.error("Error getting video title:", e);
    }

    return {
      title: title,
      downloadUrl: data.url,
      format: "mp3",
      quality: "128kbps"
    };
    
  } catch (error) {
    console.error('Online converter error:', error);
    throw new Error("Semua layanan konversi gagal");
  }
}
