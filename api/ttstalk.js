import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

// API TikTok Profile Fetcher
// Endpoint: GET /api/ttstalk?username=[username]

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: 'Username parameter is required' });
  }

  try {
    // Try cloudscraper first (faster)
    let profileData = await scrapeWithCloudscraper(username);
    
    // If cloudscraper fails, use puppeteer (slower but more reliable)
    if (!profileData) {
      profileData = await scrapeWithPuppeteer(username);
    }

    if (!profileData) {
      return res.status(404).json({ error: 'Profile not found or private' });
    }

    // Return successful response
    return res.status(200).json({
      success: true,
      data: profileData
    });

  } catch (error) {
    console.error('TikTok Profile API Error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch TikTok profile data',
      message: error.message 
    });
  }
}

// Function to scrape with Cloudscraper (faster)
async function scrapeWithCloudscraper(username) {
  try {
    const url = `https://www.tiktok.com/@${username}`;
    
    const html = await cloudscraper.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    return extractProfileData(document, username);

  } catch (error) {
    console.error('Cloudscraper error:', error);
    return null;
  }
}

// Function to scrape with Puppeteer (for bypassing challenges)
async function scrapeWithPuppeteer(username) {
  let browser = null;
  try {
    const url = `https://www.tiktok.com/@${username}`;
    
    // Launch puppeteer with stealth settings
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();
    
    // Set user agent and viewport
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Block unnecessary resources to speed up
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Navigate to page
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Check for challenge popups and close them
    await handlePopupChallenges(page);

    // Wait for profile data to load
    await page.waitForSelector('[data-e2e="followers-count"], [data-e2e="following-count"], [data-e2e="likes-count"]', { 
      timeout: 10000 
    }).catch(() => {
      console.log('Profile stats not found, continuing anyway');
    });

    // Get the page content
    const html = await page.content();
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    return extractProfileData(document, username);

  } catch (error) {
    console.error('Puppeteer error:', error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Function to handle popup challenges (cookie consent, login modals, etc.)
async function handlePopupChallenges(page) {
  try {
    // Wait a bit for popups to appear
    await page.waitForTimeout(2000);

    // Try to close various types of popups
    const popupSelectors = [
      'button[aria-label="Close"]',
      'div[aria-label="Close"]',
      '.close-button',
      '.modal-close',
      '.cookie-banner-close',
      'button:has(svg.close)',
      '[data-e2e="modal-close-button"]',
      '.tiktok-dialog-close',
      'div[class*="close"]',
      'button[class*="close"]'
    ];

    for (const selector of popupSelectors) {
      try {
        const closeButton = await page.$(selector);
        if (closeButton) {
          await closeButton.click();
          console.log(`Closed popup with selector: ${selector}`);
          await page.waitForTimeout(1000);
        }
      } catch (e) {
        // Continue with next selector
      }
    }

    // Handle specific TikTok challenges
    await handleTikTokSpecificChallenges(page);

  } catch (error) {
    console.error('Error handling popups:', error);
  }
}

// Function to handle TikTok-specific challenges
async function handleTikTokSpecificChallenges(page) {
  try {
    // Check for age verification
    const ageVerify = await page.$('[data-e2e="age-verification-button"]');
    if (ageVerify) {
      await ageVerify.click();
      await page.waitForTimeout(1000);
    }

    // Check for login modal
    const loginModal = await page.$('[data-e2e="login-modal"]');
    if (loginModal) {
      const closeLogin = await page.$('[data-e2e="login-modal-close-btn"]');
      if (closeLogin) {
        await closeLogin.click();
        await page.waitForTimeout(1000);
      }
    }

  } catch (error) {
    console.error('Error handling TikTok challenges:', error);
  }
}

// Function to extract profile data from DOM
function extractProfileData(document, username) {
  // Extract following count
  const followingElem = document.querySelector('[data-e2e="following-count"]');
  const following = followingElem ? followingElem.textContent.trim() : '0';

  // Extract followers count
  const followersElem = document.querySelector('[data-e2e="followers-count"]');
  const followers = followersElem ? followersElem.textContent.trim() : '0';

  // Extract likes count
  const likesElem = document.querySelector('[data-e2e="likes-count"]');
  const likes = likesElem ? likesElem.textContent.trim() : '0';

  // Extract bio/description
  const bioElem = document.querySelector('[data-e2e="user-bio"]');
  const bio = bioElem ? bioElem.textContent.trim() : '';

  // Extract profile link
  const linkElem = document.querySelector('[data-e2e="user-link"]');
  const link = linkElem ? linkElem.href : '';

  // Extract display name
  const displayNameElem = document.querySelector('[data-e2e="user-title"]');
  const displayName = displayNameElem ? displayNameElem.textContent.trim() : '';

  // Extract avatar
  const avatarElem = document.querySelector('[data-e2e="user-avatar"]');
  const avatar = avatarElem ? avatarElem.src : '';

  // Extract verified status
  const verifiedElem = document.querySelector('[data-e2e="verified-icon"]');
  const isVerified = !!verifiedElem;

  return {
    username,
    displayName,
    following: formatCount(following),
    followers: formatCount(followers),
    likes: formatCount(likes),
    bio,
    link,
    avatar,
    isVerified,
    profileUrl: `https://www.tiktok.com/@${username}`
  };
}

// Helper function to format count (convert K/M to numbers)
function formatCount(count) {
  if (!count) return 0;
  
  const cleanCount = count.replace(/\./g, '');
  
  if (cleanCount.includes('K')) {
    return parseFloat(cleanCount.replace('K', '')) * 1000;
  }
  if (cleanCount.includes('M')) {
    return parseFloat(cleanCount.replace('M', '')) * 1000000;
  }
  return parseInt(cleanCount) || 0;
}
