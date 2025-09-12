import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: 'Username parameter is required' });
  }

  try {
    // Try multiple times with refresh mechanism
    let profileData = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && !profileData) {
      attempts++;
      console.log(`Attempt ${attempts} for username: ${username}`);
      
      // First try with cloudscraper
      profileData = await scrapeWithCloudscraper(username);
      
      // If still empty, try with puppeteer and refresh
      if (!profileData || isEmptyProfile(profileData)) {
        profileData = await scrapeWithPuppeteerWithRefresh(username);
      }
      
      // Wait before next attempt
      if (attempts < maxAttempts && (!profileData || isEmptyProfile(profileData))) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (!profileData || isEmptyProfile(profileData)) {
      return res.status(404).json({ error: 'Profile not found or could not be loaded' });
    }

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

// Check if profile data is empty
function isEmptyProfile(profileData) {
  return (
    profileData.following === 0 &&
    profileData.followers === 0 &&
    profileData.likes === 0 &&
    profileData.displayName === '' &&
    profileData.bio === ''
  );
}

// Function to scrape with Cloudscraper
async function scrapeWithCloudscraper(username) {
  try {
    const url = `https://www.tiktok.com/@${username}`;
    
    const html = await cloudscraper.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
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

// Function to scrape with Puppeteer with refresh mechanism
async function scrapeWithPuppeteerWithRefresh(username) {
  let browser = null;
  try {
    const url = `https://www.tiktok.com/@${username}`;
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // First visit - handle popups and close them
    console.log('First visit to handle popups...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await handleTikTokPopups(page);
    await page.waitForTimeout(3000);
    
    // Refresh the page after handling popups
    console.log('Refreshing page after popup handling...');
    await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(5000); // Wait longer after refresh

    // Try to extract data
    let html = await page.content();
    let dom = new JSDOM(html);
    let document = dom.window.document;
    
    let profileData = extractProfileData(document, username);
    
    // If still empty after refresh, try one more time
    if (isEmptyProfile(profileData)) {
      console.log('Profile still empty, trying second refresh...');
      await page.waitForTimeout(2000);
      await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForTimeout(5000);
      
      html = await page.content();
      dom = new JSDOM(html);
      document = dom.window.document;
      profileData = extractProfileData(document, username);
    }

    return profileData;

  } catch (error) {
    console.error('Puppeteer with refresh error:', error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Improved popup handling function
async function handleTikTokPopups(page) {
  try {
    await page.waitForTimeout(3000);

    // 1. Try to click "Nanti saja" button
    try {
      const nantiSajaButton = await page.waitForSelector('[data-e2e="alt-middle-cta-cancel-btn"]', { timeout: 2000 });
      if (nantiSajaButton) {
        await nantiSajaButton.click();
        console.log('Clicked "Nanti saja" button');
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      // Button not found, continue
    }

    // 2. Try to click close buttons (X)
    try {
      const closeButtons = await page.$$('button, div, span');
      for (const button of closeButtons) {
        try {
          const text = await page.evaluate(el => el.textContent, button);
          const ariaLabel = await page.evaluate(el => el.getAttribute('aria-label'), button);
          const className = await page.evaluate(el => el.className, button);
          
          if (
            (text && (text.includes('×') || text === 'X' || text === 'x')) ||
            (ariaLabel && (ariaLabel.includes('Close') || ariaLabel.includes('Tutup'))) ||
            (className && (className.includes('close') || className.includes('modal-close')))
          ) {
            await button.click();
            console.log('Clicked close button');
            await page.waitForTimeout(1000);
            break;
          }
        } catch (e) {
          // Continue to next button
        }
      }
    } catch (e) {
      // Continue
    }

    // 3. Try pressing Escape key
    try {
      await page.keyboard.press('Escape');
      console.log('Pressed Escape key');
      await page.waitForTimeout(1000);
    } catch (e) {
      // Continue
    }

    // 4. Click on empty area to dismiss modals
    try {
      await page.mouse.click(100, 100);
      console.log('Clicked empty area');
      await page.waitForTimeout(1000);
    } catch (e) {
      // Continue
    }

  } catch (error) {
    console.error('Error in popup handling:', error);
  }
}

// Function to extract profile data from DOM
function extractProfileData(document, username) {
  try {
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
  } catch (error) {
    console.error('Error extracting profile data:', error);
    return {
      username,
      displayName: '',
      following: 0,
      followers: 0,
      likes: 0,
      bio: '',
      link: '',
      avatar: '',
      isVerified: false,
      profileUrl: `https://www.tiktok.com/@${username}`
    };
  }
}

// Helper function to format count
function formatCount(count) {
  if (!count) return 0;
  
  const cleanCount = count.replace(/\./g, '');
  
  if (cleanCount.includes('K')) {
    return parseFloat(cleanCount.replace('K', '')) * 1000;
  }
  if (cleanCount.includes('M')) {
    return parseFloat(cleanCount.replace('M', '')) * 1000000;
  }
  if (cleanCount.includes('B')) {
    return parseFloat(cleanCount.replace('B', '')) * 1000000000;
  }
  return parseInt(cleanCount.replace(/,/g, '')) || 0;
}
