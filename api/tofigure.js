import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

const APIKEY = 'AIzaSyCViCU51ps2_XVNBGz4LbktGYgy0yuU1Io';
const PROMPT = 'Using the nano-banana model, a commercial 1/7 scale figurine of the character in the picture was created, depicting a realistic style and a realistic environment. The figurine is placed on a computer desk with a round transparent acrylic base. There is no text on the base. The computer screen shows the Zbrush modeling process of the figurine. Next to the computer screen is a BANDAI-style toy box with the original painting printed on it.';

// Konfigurasi GitHub
const GITHUB_TOKEN = "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";
const GITHUB_USER = "kepocodeid";
const GITHUB_REPO = "testeraja";

// Default fallback images (PNG, JPG, WebP)
const DEFAULT_IMAGES = {
  png: "https://raw.githubusercontent.com/kepocodeid/testeraja/main/tofigure/default.png",
  jpg: "https://raw.githubusercontent.com/kepocodeid/testeraja/main/tofigure/default.jpg",
  webp: "https://raw.githubusercontent.com/kepocodeid/testeraja/main/tofigure/default.webp"
};

// Function untuk call Google Gemini API menggunakan cloudscraper
async function generateWithGemini(base64Image, mimeType) {
  try {
    const response = await cloudscraper.post({
      uri: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${APIKEY}`,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Image
                }
              }
            ]
          }
        ]
      }),
      timeout: 60000
    });

    const data = JSON.parse(response);
    const parts = data?.candidates?.[0]?.content?.parts || [];
    
    for (const part of parts) {
      if (part.inlineData?.data) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }
    
    return null;
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw new Error('Failed to generate image with Gemini AI');
  }
}

// Helper function untuk mendapatkan file type dari buffer
async function getFileTypeFromBuffer(buffer) {
  // Deteksi tipe file berdasarkan signature
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' };
  } else if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  } else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { ext: 'gif', mime: 'image/gif' };
  } else if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  // Default ke PNG
  return { ext: 'png', mime: 'image/png' };
}

// Upload function untuk GitHub
async function uploadToGitHub(buffer, filename) {
  try {
    const content = buffer.toString('base64');
    const pathInRepo = `tofigure/${filename}`;
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${pathInRepo}`;

    const response = await cloudscraper.put({
      uri: url,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'ToFigure-App',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Upload ${filename} via ToFigure`,
        content: content
      }),
      timeout: 30000
    });

    const data = JSON.parse(response);
    
    if (data.content && data.content.download_url) {
      // Menggunakan raw.githubusercontent.com untuk CDN
      return `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main/${pathInRepo}`;
    } else {
      console.error('GitHub upload error:', data);
      throw new Error('Upload ke GitHub gagal: ' + (data.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('GitHub upload error:', error);
    throw new Error('Gagal mengupload gambar ke GitHub');
  }
}

// Cek apakah repo ada
async function repoExists() {
  try {
    const response = await cloudscraper.get({
      uri: `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}`,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'ToFigure-App'
      },
      timeout: 10000
    });
    
    return true;
  } catch (error) {
    console.log('Repo does not exist or cannot be accessed:', error);
    return false;
  }
}

// Buat repo kalau belum ada
async function createRepo() {
  try {
    const response = await cloudscraper.post({
      uri: 'https://api.github.com/user/repos',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'ToFigure-App',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: GITHUB_REPO,
        private: false,
        auto_init: true,
        description: 'Repo untuk menyimpan hasil generate ToFigure'
      }),
      timeout: 15000
    });
    
    return true;
  } catch (error) {
    console.error('Failed to create repo:', error);
    return false;
  }
}

// Dapatkan URL default berdasarkan format
function getDefaultImageUrl(format) {
  return DEFAULT_IMAGES[format] || DEFAULT_IMAGES.png;
}

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

  let browser;

  try {
    // Validate URL
    if (!url.startsWith('http')) {
      return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL dimulai dengan http/https.' });
    }

    let imageBuffer;

    try {
      // First try with cloudscraper to download image
      const imageResponse = await cloudscraper.get({
        uri: url,
        encoding: null,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 30000
      });
      
      imageBuffer = Buffer.from(imageResponse);
    } catch (error) {
      console.log('Cloudscraper failed, trying with Puppeteer...');
      
      // If cloudscraper fails, use Puppeteer as fallback
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Try to find image element on the page
      const imageElement = await page.$('img');
      if (imageElement) {
        imageBuffer = await imageElement.screenshot();
      } else {
        imageBuffer = await page.screenshot({ fullPage: false });
      }
      
      await browser.close();
      browser = null;
    }

    // Convert to base64
    const base64Image = imageBuffer.toString('base64');
    const mimeType = (await getFileTypeFromBuffer(imageBuffer)).mime;

    // Generate content with Gemini menggunakan cloudscraper
    const generatedImageBuffer = await generateWithGemini(base64Image, mimeType);

    if (!generatedImageBuffer) {
      return response.status(500).json({ 
        success: false, 
        error: 'Tidak dapat menghasilkan gambar. Silakan coba dengan gambar yang berbeda.' 
      });
    }

    // Upload generated image to GitHub
    let downloadUrl;
    let fileName;
    let fileType;
    
    try {
      fileType = await getFileTypeFromBuffer(generatedImageBuffer);
      const timestamp = new Date().getTime();
      fileName = `tofigure_${timestamp}.${fileType.ext}`;
      
      // Cek dan buat repo jika diperlukan
      const exists = await repoExists();
      if (!exists) {
        console.log('Repo does not exist, creating...');
        const created = await createRepo();
        if (!created) {
          throw new Error('Gagal membuat repo GitHub');
        }
        // Tunggu sebentar agar repo siap
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      downloadUrl = await uploadToGitHub(generatedImageBuffer, fileName);
    } catch (uploadError) {
      console.log('GitHub upload failed, using default image:', uploadError);
      // Gunakan gambar default dari GitHub
      fileType = await getFileTypeFromBuffer(generatedImageBuffer);
      downloadUrl = getDefaultImageUrl(fileType.ext);
      fileName = `default.${fileType.ext}`;
    }

    // Get file info
    const fileSize = generatedImageBuffer.length;
    
    // Format file size
    const formatSize = (bytes) => {
      if (!bytes) return 'Unknown';
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
    };

    return response.status(200).json({
      success: true,
      data: {
        name: fileName,
        size: formatSize(fileSize),
        extension: fileType.ext,
        uploaded: new Date().toISOString(),
        downloadUrl: downloadUrl,
        details: {
          platform: 'Google Gemini AI',
          model: 'nano-banana 1/7 scale',
          quality: 'HD',
          hosting: downloadUrl.includes('default') ? 'GitHub CDN (Default)' : 'GitHub CDN'
        }
      }
    });

  } catch (error) {
    console.error('Error fetching ToFigure data:', error);
    
    // Clean up browser if it's still open
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Error closing browser:', e);
      }
    }
    
    // Retry logic
    if (retry < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: error.message || 'Gagal memproses gambar. Pastikan URL valid dan coba lagi.' 
    });
  }
}
