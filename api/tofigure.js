import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import FormData from 'form-data';
import { fileTypeFromBuffer } from 'file-type';
import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

const APIKEY = 'AIzaSyCViCU51ps2_XVNBGz4LbktGYgy0yuU1Io';
const PROMPT = 'Using the nano-banana model, a commercial 1/7 scale figurine of the character in the picture was created, depicting a realistic style and a realistic environment. The figurine is placed on a computer desk with a round transparent acrylic base. There is no text on the base. The computer screen shows the Zbrush modeling process of the figurine. Next to the computer screen is a BANDAI-style toy box with the original painting printed on it.';

// Upload function untuk qu.ax
async function uploadToQuax(buffer) {
  const { ext, mime } = (await fileTypeFromBuffer(buffer)) || { ext: 'png', mime: 'image/png' };
  const form = new FormData();
  form.append('files[]', buffer, { filename: `tofigure.${ext}`, contentType: mime });

  const { data } = await axios.post('https://qu.ax/upload.php', form, { 
    headers: form.getHeaders(),
    timeout: 30000
  });
  
  return data.files?.[0]?.url || null;
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

  try {
    // Validate URL
    if (!url.startsWith('http')) {
      return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL dimulai dengan http/https.' });
    }

    let imageBuffer;
    let browser;

    try {
      // First try with cloudscraper to download image
      const imageResponse = await cloudscraper.get(url, {
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
      
      // Go to the URL and take screenshot if it's an image page
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Try to find image element on the page
      const imageElement = await page.$('img');
      if (imageElement) {
        imageBuffer = await imageElement.screenshot();
      } else {
        // If no image found, take full page screenshot
        imageBuffer = await page.screenshot({ fullPage: false });
      }
      
      await browser.close();
    }

    // Convert to base64
    const base64Image = imageBuffer.toString('base64');
    const mimeType = (await fileTypeFromBuffer(imageBuffer))?.mime || 'image/jpeg';

    // Initialize Google GenAI
    const ai = new GoogleGenAI({ apiKey: APIKEY });

    const contents = [
      { text: PROMPT },
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Image
        }
      }
    ];

    // Generate content with Gemini
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents,
      timeout: 60000
    });

    const parts = result?.candidates?.[0]?.content?.parts || [];

    // Find the generated image in the response
    let generatedImageBuffer = null;
    for (const part of parts) {
      if (part.inlineData?.data) {
        generatedImageBuffer = Buffer.from(part.inlineData.data, 'base64');
        break;
      }
    }

    if (!generatedImageBuffer) {
      return response.status(500).json({ 
        success: false, 
        error: 'Tidak dapat menghasilkan gambar. Silakan coba dengan gambar yang berbeda.' 
      });
    }

    // Upload generated image to qu.ax
    let downloadUrl;
    try {
      downloadUrl = await uploadToQuax(generatedImageBuffer);
      
      if (!downloadUrl) {
        throw new Error('Upload ke qu.ax gagal');
      }
    } catch (uploadError) {
      console.log('qu.ax upload failed, trying alternative methods...');
      
      // Fallback upload methods can be added here if needed
      throw new Error('Gagal mengupload gambar hasil generate');
    }

    // Get file info
    const fileType = await fileTypeFromBuffer(generatedImageBuffer);
    const fileSize = generatedImageBuffer.length;
    
    // Format file size
    const formatSize = (bytes) => {
      if (!bytes) return 'Unknown';
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
    };

    // Generate filename
    const timestamp = new Date().getTime();
    const fileName = `tofigure_${timestamp}.${fileType?.ext || 'png'}`;

    return response.status(200).json({
      success: true,
      data: {
        name: fileName,
        size: formatSize(fileSize),
        extension: fileType?.ext || 'png',
        uploaded: new Date().toISOString(),
        downloadUrl: downloadUrl,
        details: {
          platform: 'Google Gemini AI',
          model: 'nano-banana 1/7 scale',
          quality: 'HD',
          hosting: 'qu.ax'
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
      error: 'Gagal memproses gambar. Pastikan URL valid dan coba lagi.' 
    });
  }
}
