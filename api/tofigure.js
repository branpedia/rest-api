import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

const APIKEY = 'AIzaSyCebxtx7AdHqfZKYx0JLimlJrKOPwGbZIQ';
const PROMPT = 'Using the nano-banana model, a commercial 1/7 scale figurine of the character in the picture was created, depicting a realistic style and a realistic environment. The figurine is placed on a computer desk with a round transparent acrylic base. There is no text on the base. The computer screen shows the Zbrush modeling process of the figurine. Next to the computer screen is a BANDAI-style toy box with the original painting printed on it.';

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

// Upload function untuk qu.ax menggunakan Puppeteer (lebih reliable)
async function uploadToQuax(buffer) {
  let browser;
  try {
    const { ext, mime } = await getFileTypeFromBuffer(buffer);
    const filename = `tofigure_${Date.now()}.${ext}`;
    
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Pergi ke halaman utama qu.ax
    await page.goto('https://qu.ax', { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Tunggu sampai input file tersedia
    await page.waitForSelector('input[type="file"]', { timeout: 10000 });
    
    // Simpan file ke temporary location untuk diupload
    const fs = require('fs');
    const path = require('path');
    const tempDir = '/tmp';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFilePath = path.join(tempDir, filename);
    fs.writeFileSync(tempFilePath, buffer);
    
    // Upload file
    const inputElement = await page.$('input[type="file"]');
    await inputElement.uploadFile(tempFilePath);
    
    // Tunggu sampai upload selesai (tunggu munculnya link)
    await page.waitForFunction(() => {
      const links = document.querySelectorAll('a');
      for (let link of links) {
        if (link.href && link.href.includes('qu.ax/') && link.href.length > 20) {
          return link.href;
        }
      }
      return null;
    }, { timeout: 30000 });
    
    // Dapatkan URL dari page
    const downloadUrl = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      for (let link of links) {
        if (link.href && link.href.includes('qu.ax/') && link.href.length > 20) {
          return link.href;
        }
      }
      // Alternative: cari di text content
      const pageText = document.body.textContent;
      const urlMatch = pageText.match(/https:\/\/qu\.ax\/[a-zA-Z0-9]+\.(png|jpg|jpeg|gif|webp)/);
      return urlMatch ? urlMatch[0] : null;
    });
    
    // Bersihkan file temporary
    try {
      fs.unlinkSync(tempFilePath);
    } catch (e) {
      console.log('Error deleting temp file:', e);
    }
    
    await browser.close();
    
    if (!downloadUrl) {
      throw new Error('Tidak dapat menemukan URL download di halaman qu.ax');
    }
    
    return downloadUrl;
  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Error closing browser:', e);
      }
    }
    console.error('Qu.ax upload error:', error);
    throw new Error('Gagal mengupload gambar ke qu.ax: ' + error.message);
  }
}

// Alternative upload function menggunakan API langsung
async function uploadToQuaxDirect(buffer) {
  try {
    const { ext, mime } = await getFileTypeFromBuffer(buffer);
    
    // Buat form data manual
    const boundary = '----WebKitFormBoundary' + Math.random().toString(16).substring(2);
    const filename = `tofigure_${Date.now()}.${ext}`;
    
    let formData = `--${boundary}\r\n`;
    formData += `Content-Disposition: form-data; name="files[]"; filename="${filename}"\r\n`;
    formData += `Content-Type: ${mime}\r\n\r\n`;
    
    // Gabungkan form data dengan buffer
    const formDataBuffer = Buffer.from(formData, 'utf8');
    const endData = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    
    const fullBody = Buffer.concat([formDataBuffer, buffer, endData]);
    
    const response = await cloudscraper.post({
      uri: 'https://qu.ax/upload.php',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Length': fullBody.length
      },
      body: fullBody,
      encoding: null,
      timeout: 30000
    });

    // Parse response
    let responseData;
    try {
      responseData = JSON.parse(response.toString());
    } catch (e) {
      // Jika JSON parse gagal, coba ekstrak URL dari response text
      const textResponse = response.toString();
      const urlMatch = textResponse.match(/https:\/\/qu\.ax\/[a-zA-Z0-9]+\.(png|jpg|jpeg|gif|webp)/);
      if (urlMatch) {
        return urlMatch[0];
      }
      throw new Error('Response bukan JSON yang valid: ' + textResponse.substring(0, 100));
    }
    
    return responseData.files?.[0]?.url || null;
  } catch (error) {
    console.error('Qu.ax direct upload error:', error);
    throw error;
  }
}

// Fungsi untuk memendekkan URL menggunakan TinyURL
async function shortenUrl(longUrl) {
  try {
    const response = await cloudscraper.get({
      uri: `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`,
      timeout: 10000
    });
    return response;
  } catch (error) {
    console.error('URL shortening error:', error);
    return longUrl; // Return original URL jika shortening gagal
  }
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

    // Upload generated image to qu.ax
    let downloadUrl;
    let shortUrl;
    let fileName;
    let fileType;
    
    try {
      fileType = await getFileTypeFromBuffer(generatedImageBuffer);
      const timestamp = new Date().getTime();
      fileName = `tofigure_${timestamp}.${fileType.ext}`;
      
      // Coba method direct upload pertama
      downloadUrl = await uploadToQuaxDirect(generatedImageBuffer);
      
      // Jika method direct gagal, coba method Puppeteer
      if (!downloadUrl) {
        downloadUrl = await uploadToQuax(generatedImageBuffer);
      }
      
      if (!downloadUrl) {
        throw new Error('Semua metode upload ke qu.ax gagal');
      }
      
      // Shorten URL
      shortUrl = await shortenUrl(downloadUrl);
      
      console.log('Successfully uploaded to qu.ax:', downloadUrl);
      console.log('Short URL:', shortUrl);
    } catch (uploadError) {
      console.log('qu.ax upload failed:', uploadError);
      // Jika upload gagal, return error
      return response.status(500).json({ 
        success: false, 
        error: 'Gagal mengupload gambar ke qu.ax: ' + uploadError.message
      });
    }

    // Get file info
    const fileSize = generatedImageBuffer.length;
    
    // Format file size
    const formatSize = (bytes) => {
      if (!bytes) return '0 Bytes';
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    };

    return response.status(200).json({
      success: true,
      data: {
        name: fileName,
        size: formatSize(fileSize),
        extension: fileType.ext,
        uploaded: new Date().toISOString(),
        downloadUrl: downloadUrl,
        shortUrl: shortUrl,
        details: {
          platform: 'Google Gemini AI',
          model: 'nano-banana 1/7 scale',
          quality: 'HD',
          hosting: 'qu.ax CDN',
          expired: 'No Expiry Date'
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
