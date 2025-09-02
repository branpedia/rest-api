const express = require('express');
const cloudscraper = require('cloudscraper');
const { JSDOM } = require('jsdom');
const puppeteer = require('puppeteer');

const router = express.Router();

// Cache untuk menyimpan hasil sementara (dalam production, gunakan Redis)
const cache = new Map();

router.get('/', async (req, res) => {
  const { url, retry = 0, nocache = false } = req.query;

  if (!url) {
    return res.status(400).json({ success: false, error: 'Parameter URL diperlukan' });
  }

  // Cek cache jika ada
  if (!nocache && cache.has(url)) {
    const cachedData = cache.get(url);
    // Jika data cache masih valid (kurang dari 5 menit)
    if (Date.now() - cachedData.timestamp < 5 * 60 * 1000) {
      return res.json(cachedData.data);
    }
  }

  try {
    // Validate MediaFire URL
    if (!url.includes('mediafire.com') || (!url.includes('/file/') && !url.includes('/download/'))) {
      return res.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL berasal dari MediaFire.' });
    }

    let html;
    let browser;

    try {
      // First try with cloudscraper
      const response = await cloudscraper.get({
        uri: url,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      html = response;
    } catch (error) {
      console.log('Cloudscraper failed, trying with Puppeteer...');
      
      // If cloudscraper fails, use Puppeteer as fallback
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
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      html = await page.content();
      await browser.close();
    }

    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract file information
    const fileNameElem = document.querySelector('.dl-btn-label');
    const fileName = fileNameElem ? fileNameElem.textContent.trim() : 'Unknown';

    const fileSizeElem = document.querySelector('.details li:first-child span');
    const fileSize = fileSizeElem ? fileSizeElem.textContent.trim() : 'Unknown';

    const uploadedElem = document.querySelector('.details li:nth-child(2) span');
    const uploaded = uploadedElem ? uploadedElem.textContent.trim() : 'Unknown';

    // Extract download URL
    const downloadButton = document.querySelector('#downloadButton');
    let downloadUrl = '';

    if (downloadButton) {
      const scrambledUrl = downloadButton.getAttribute('data-scrambled-url');
      if (scrambledUrl) {
        // Decode base64 to get the actual URL
        downloadUrl = Buffer.from(scrambledUrl, 'base64').toString('utf8');
      } else {
        // Alternative method to extract download URL
        const onClickAttr = downloadButton.getAttribute('onclick');
        if (onClickAttr && onClickAttr.includes('http')) {
          const urlMatch = onClickAttr.match(/(https?:\/\/[^\s'"]+)/);
          if (urlMatch) downloadUrl = urlMatch[0];
        }
      }
    }

    // Get file extension from filename
    const fileExtension = fileName.split('.').pop() || 'Unknown';

    const responseData = {
      success: true,
      data: {
        name: fileName,
        size: fileSize,
        extension: fileExtension,
        uploaded: uploaded,
        downloadUrl: downloadUrl,
        sourceUrl: url
      }
    };

    // Simpan ke cache
    cache.set(url, {
      data: responseData,
      timestamp: Date.now()
    });

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('Error fetching MediaFire data:', error);
    
    // Retry logic
    if (retry < 3) {
      // Wait for 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      return res.redirect(`/api/mediafire?url=${encodeURIComponent(url)}&retry=${parseInt(retry) + 1}`);
    }
    
    return res.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari MediaFire. Pastikan URL valid dan coba lagi.',
      details: error.message 
    });
  }
});

module.exports = router;
