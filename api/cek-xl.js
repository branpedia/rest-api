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

  const { nomor, retry = 0 } = request.query;

  if (!nomor) {
    return response.status(400).json({ success: false, error: 'Parameter nomor diperlukan' });
  }

  try {
    const url = 'https://sidompul.violetvpn.biz.id/';
    let browser;
    let html;

    try {
      // Gunakan Puppeteer karena website menggunakan JavaScript untuk form handling
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
      
      const page = await browser.newPage();
      
      // Set user agent untuk meniru browser asli
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Navigasi ke halaman
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Tunggu sampai form muncul
      await page.waitForSelector('input[type="number"]', { timeout: 10000 });
      
      // Bersihkan input yang ada dan isi dengan nomor baru
      await page.click('input[type="number"]', { clickCount: 3 }); // Select all text
      await page.type('input[type="number"]', nomor);
      
      // Klik tombol cek
      await page.click('button[type="submit"]');
      
      // Tunggu hasil muncul - dengan timeout yang lebih panjang
      try {
        await page.waitForSelector('.mt-6.bg-gray-700', { timeout: 15000 });
      } catch (waitError) {
        // Coba alternatif selector jika yang pertama tidak bekerja
        await page.waitForSelector('div.mt-6', { timeout: 5000 });
      }
      
      // Tunggu sebentar untuk memastikan semua konten terload
      await page.waitForTimeout(2000);
      
      html = await page.content();
      await browser.close();

    } catch (puppeteerError) {
      console.log('Puppeteer failed:', puppeteerError);
      
      // Fallback ke cloudscraper dengan pendekatan berbeda
      try {
        const scraper = cloudscraper.createScraper({
          method: 'GET',
          url: url,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        html = await scraper;
      } catch (cloudError) {
        throw new Error('Both Puppeteer and Cloudscraper failed');
      }
    }

    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Cek apakah ada hasil
    const hasilSection = document.querySelector('.mt-6.bg-gray-700') || document.querySelector('div.mt-6');
    if (!hasilSection) {
      return response.status(404).json({ 
        success: false, 
        error: 'Tidak dapat menemukan informasi untuk nomor ini. Pastikan nomor valid.' 
      });
    }

    // Extract informasi
    const allParagraphs = hasilSection.querySelectorAll('p');
    
    // Format data response
    const result = {
      operator: allParagraphs[0] ? allParagraphs[0].textContent.replace('📡 Operator:', '').trim() : 'Tidak diketahui',
      status4G: allParagraphs[1] ? allParagraphs[1].textContent.replace('⚡ Status 4G:', '').trim() : 'Tidak diketahui',
      dukcapil: allParagraphs[2] ? allParagraphs[2].textContent.replace('🆔 Dukcapil:', '').trim() : 'Tidak diketahui',
      umurKartu: allParagraphs[3] ? allParagraphs[3].textContent.replace('📅 Umur Kartu:', '').trim() : 'Tidak diketahui',
      masaAktif: allParagraphs[4] ? allParagraphs[4].textContent.replace('📆 Masa Aktif:', '').trim() : 'Tidak diketahui',
      masaTenggang: allParagraphs[5] ? allParagraphs[5].textContent.replace('⏳ Masa Tenggang:', '').trim() : 'Tidak diketahui',
    };

    // Extract informasi kuota jika ada
    const kuotaSection = hasilSection.querySelector('.mt-3.p-3.bg-gray-800') || hasilSection.querySelector('.bg-gray-800');
    if (kuotaSection) {
      const namaPaketElem = kuotaSection.querySelector('.font-semibold');
      const hinggaElem = kuotaSection.querySelector('.text-sm.text-gray-400');
      const detailKuotaElem = kuotaSection.querySelector('.mt-2.p-2.bg-gray-900') || kuotaSection.querySelector('.bg-gray-900');
      
      result.kuota = {
        namaPaket: namaPaketElem ? namaPaketElem.textContent.trim() : 'Tidak diketahui',
        hingga: hinggaElem ? hinggaElem.textContent.replace('🕒 Hingga:', '').trim() : 'Tidak diketahui',
        detail: detailKuotaElem ? detailKuotaElem.textContent.trim() : 'Tidak diketahui'
      };
    }

    return response.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error fetching data:', error);
    
    // Retry logic
    if (retry < 2) {
      // Wait for 2 second before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data. Pastikan nomor valid dan coba lagi.' 
    });
  }
}
