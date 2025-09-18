import puppeteer from 'puppeteer';
import { Cluster } from 'puppeteer-cluster';
import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Puppeteer Cluster
let cluster;

const initCluster = async () => {
  cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 5,
    puppeteerOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1280,800'
      ]
    }
  });

  await cluster.task(async ({ page, data: imageUrl }) => {
    try {
      // Navigate to Google Lens
      const lensUrl = 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(imageUrl);
      await page.goto(lensUrl, { 
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Wait for results to load
      await page.waitForSelector('.kRdUPb, .Kg0xqe, .I9S4yc', { timeout: 30000 });
      
      // Scroll to load more results
      await autoScroll(page);
      
      // Extract related searches
      const relatedSearches = await extractRelatedSearches(page);
      
      // Extract main image
      const mainImage = await extractMainImage(page);
      
      // Extract search URL
      const searchUrl = page.url();
      
      return {
        searchUrl,
        mainImage,
        relatedSearches
      };
    } catch (error) {
      console.error('Error in cluster task:', error);
      throw error;
    }
  });
};

// Auto scroll to load more content
const autoScroll = async (page) => {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        
        if (totalHeight >= scrollHeight || totalHeight > 2000) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
};

// Extract related searches
const extractRelatedSearches = async (page) => {
  return await page.evaluate(() => {
    const relatedSearches = [];
    
    // Method 1: Look for search result cards
    const searchCards = document.querySelectorAll('.Kg0xqe.sjVJQd, .g, .tF2Cxc');
    
    searchCards.forEach((card, index) => {
      try {
        // Extract title
        const titleElement = card.querySelector('.I9S4yc, .UAiK1e, .DKV0Md, h3');
        const title = titleElement ? titleElement.textContent.trim() : null;
        
        // Extract image
        const imageElement = card.querySelector('img');
        const image = imageElement ? imageElement.src : null;
        
        // Extract link
        let linkElement = card.querySelector('a');
        let href = linkElement ? linkElement.getAttribute('href') : null;
        
        // Extract actual URL from Google redirect
        let actualUrl = null;
        if (href && href.includes('/url?')) {
          try {
            const urlParams = new URLSearchParams(href.split('/url?')[1]);
            actualUrl = urlParams.get('url');
          } catch (e) {
            console.error('Error parsing URL:', e);
          }
        }
        
        if (title) {
          relatedSearches.push({
            position: index + 1,
            title,
            image,
            url: actualUrl || href
          });
        }
      } catch (error) {
        console.error('Error processing search card:', error);
      }
    });
    
    // Method 2: Look for individual elements if first method didn't work
    if (relatedSearches.length === 0) {
      const titleElements = document.querySelectorAll('.I9S4yc, .Yt787, .UAiK1e');
      titleElements.forEach((titleElement, index) => {
        const title = titleElement.textContent.trim();
        
        // Find the closest link
        let linkElement = titleElement.closest('a');
        if (!linkElement) {
          const parentCard = titleElement.closest('.Kg0xqe, .g, .tF2Cxc');
          linkElement = parentCard ? parentCard.querySelector('a') : null;
        }
        
        let href = linkElement ? linkElement.getAttribute('href') : null;
        let actualUrl = null;
        
        if (href && href.includes('/url?')) {
          try {
            const urlParams = new URLSearchParams(href.split('/url?')[1]);
            actualUrl = urlParams.get('url');
          } catch (e) {
            console.error('Error parsing URL:', e);
          }
        }
        
        // Find image
        let image = null;
        const imageElement = linkElement ? linkElement.querySelector('img') : null;
        if (imageElement) {
          image = imageElement.src;
        }
        
        relatedSearches.push({
          position: index + 1,
          title,
          image,
          url: actualUrl || href
        });
      });
    }
    
    return relatedSearches;
  });
};

// Extract main image
const extractMainImage = async (page) => {
  return await page.evaluate(() => {
    const mainImageElement = document.querySelector('.VeBrne, .J9sbhc img, img[alt*="Image result"]');
    return mainImageElement ? mainImageElement.src : null;
  });
};

// API endpoint
app.get('/api/lens', async (req, res) => {
  try {
    const { imageUrl } = req.query;
    
    if (!imageUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'Parameter imageUrl diperlukan' 
      });
    }
    
    // Validate URL
    try {
      new URL(imageUrl);
    } catch (error) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL tidak valid' 
      });
    }
    
    if (!cluster) {
      return res.status(500).json({ 
        success: false, 
        error: 'Cluster belum diinisialisasi' 
      });
    }
    
    const result = await cluster.execute(imageUrl);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari Google Lens',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    clusterInitialized: !!cluster 
  });
});

// Initialize and start server
const startServer = async () => {
  try {
    await initCluster();
    console.log('Puppeteer cluster initialized');
    
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to initialize cluster:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (cluster) {
    await cluster.close();
  }
  process.exit(0);
});

startServer();
