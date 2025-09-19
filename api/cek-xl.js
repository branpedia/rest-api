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

  // Validasi nomor telepon Indonesia (lebih fleksibel)
  const nomorRegex = /^(\+62|62|0)(8(1[3-9]|5[7-9]|7[8-9]|8[1-9]))[0-9]{6,9}$/;
  const cleanedNumber = nomor.replace(/\D/g, ''); // Hapus karakter non-digit
  
  if (!nomorRegex.test(cleanedNumber)) {
    return response.status(400).json({ 
      success: false, 
      error: 'Nomor tidak valid. Pastikan nomor XL/AXIS yang dimasukkan.' 
    });
  }

  try {
    const url = 'https://sidompul.violetvpn.biz.id/';
    let html;
    let browser;

    try {
      // First try with cloudscraper
      html = await cloudscraper.post(url, {
        form: { nomor: nomor },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      });
    } catch (error) {
      console.log('Cloudscraper failed, trying with Puppeteer...');
      
      // If cloudscraper fails, use Puppeteer as fallback
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      await page.goto(url, { waitUntil: 'networkidle2' });
      
      // Isi form dengan nomor
      await page.type('input[type="number"]', nomor);
      
      // Klik tombol cek
      await page.click('button[type="submit"]');
      
      // Tunggu hasil muncul
      await page.waitForSelector('.mt-6.bg-gray-700', { timeout: 10000 });
      
      html = await page.content();
      await browser.close();
    }

    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Cek apakah ada hasil
    const hasilSection = document.querySelector('.mt-6.bg-gray-700');
    if (!hasilSection) {
      return response.status(404).json({ 
        success: false, 
        error: 'Tidak dapat menemukan informasi untuk nomor ini.' 
      });
    }

    // Extract informasi
    const operatorElem = hasilSection.querySelector('p:first-child');
    const status4GElem = hasilSection.querySelector('p:nth-child(2)');
    const dukcapilElem = hasilSection.querySelector('p:nth-child(3)');
    const umurKartuElem = hasilSection.querySelector('p:nth-child(4)');
    const masaAktifElem = hasilSection.querySelector('p:nth-child(5)');
    const masaTenggangElem = hasilSection.querySelector('p:nth-child(6)');
    
    // Extract informasi kuota
    const kuotaSection = hasilSection.querySelector('.mt-3.p-3.bg-gray-800');
    const namaPaketElem = kuotaSection ? kuotaSection.querySelector('.font-semibold') : null;
    const hinggaElem = kuotaSection ? kuotaSection.querySelector('.text-sm.text-gray-400') : null;
    const detailKuotaElem = kuotaSection ? kuotaSection.querySelector('.mt-2.p-2.bg-gray-900') : null;

    // Format data response
    const result = {
      operator: operatorElem ? operatorElem.textContent.replace('📡 Operator:', '').trim() : 'Tidak diketahui',
      status4G: status4GElem ? status4GElem.textContent.replace('⚡ Status 4G:', '').trim() : 'Tidak diketahui',
      dukcapil: dukcapilElem ? dukcapilElem.textContent.replace('🆔 Dukcapil:', '').trim() : 'Tidak diketahui',
      umurKartu: umurKartuElem ? umurKartuElem.textContent.replace('📅 Umur Kartu:', '').trim() : 'Tidak diketahui',
      masaAktif: masaAktifElem ? masaAktifElem.textContent.replace('📆 Masa Aktif:', '').trim() : 'Tidak diketahui',
      masaTenggang: masaTenggangElem ? masaTenggangElem.textContent.replace('⏳ Masa Tenggang:', '').trim() : 'Tidak diketahui',
      kuota: {
        namaPaket: namaPaketElem ? namaPaketElem.textContent.trim() : 'Tidak diketahui',
        hingga: hinggaElem ? hinggaElem.textContent.replace('🕒 Hingga:', '').trim() : 'Tidak diketahui',
        detail: detailKuotaElem ? detailKuotaElem.textContent.trim() : 'Tidak diketahui'
      }
    };

    return response.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error fetching data:', error);
    
    // Retry logic
    if (retry < 3) {
      // Wait for 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data. Pastikan nomor valid dan coba lagi.' 
    });
  }
}
