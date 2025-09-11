import cloudscraper from 'cloudscraper'
import puppeteer from 'puppeteer'
import { JSDOM } from 'jsdom'

const BASE_URL = 'https://ai-apps.codergautam.dev'
const PROMPT = 'a commercial 1/7 scale figurine of the character in the picture was created, depicting a realistic style and a realistic environment. The figurine is placed on a computer desk with a round transparent acrylic base. There is no text on the base. The computer screen shows the Zbrush modeling process of the figurine. Next to the computer screen is a BANDAI-style toy box with the original painting printed on it.'

// === Helper ===
function randomString(len = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

async function autoregist() {
  const uid = randomString(24)
  const email = `gienetic${Date.now()}@nyahoo.com`

  const payload = JSON.stringify({
    uid,
    email,
    displayName: randomString(8),
    photoURL: 'https://i.pravatar.cc/150',
    appId: 'photogpt'
  })

  const res = await cloudscraper.post({
    uri: `${BASE_URL}/photogpt/create-user`,
    body: payload,
    headers: { 'content-type': 'application/json', 'accept': 'application/json' }
  })

  const json = JSON.parse(res)
  if (json.success) return uid
  throw new Error('Register gagal: ' + res)
}

async function img2img(imageBuffer, prompt) {
  const uid = await autoregist()
  const boundary = '----WebKitFormBoundary' + randomString(16)

  const bodyStart =
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="input.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
  const bodyMiddle =
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}\r\n--${boundary}\r\nContent-Disposition: form-data; name="userId"\r\n\r\n${uid}\r\n--${boundary}--\r\n`

  const body = Buffer.concat([
    Buffer.from(bodyStart),
    imageBuffer,
    Buffer.from(bodyMiddle)
  ])

  const res = await cloudscraper.post({
    uri: `${BASE_URL}/photogpt/generate-image`,
    body,
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }
  })

  const json = JSON.parse(res)
  if (!json.success) throw new Error(res)

  const { pollingUrl } = json
  let status = 'pending'
  let resultUrl = null

  while (status !== 'Ready') {
    const pollRes = await cloudscraper.get(pollingUrl, { headers: { accept: 'application/json' } })
    const data = JSON.parse(pollRes)
    status = data.status
    if (status === 'Ready') {
      resultUrl = data.result.url
      break
    }
    await new Promise(r => setTimeout(r, 3000))
  }

  if (!resultUrl) throw new Error('Gagal dapat hasil gambar')
  return await cloudscraper.get({ uri: resultUrl, encoding: null }) // return buffer
}

async function uploadToQuaxDirect(buffer) {
  const boundary = '----WebKitFormBoundary' + randomString(16)
  const filename = `tofigure_${Date.now()}.png`

  const bodyStart =
    `--${boundary}\r\nContent-Disposition: form-data; name="files[]"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`
  const bodyEnd = `\r\n--${boundary}--\r\n`

  const fullBody = Buffer.concat([Buffer.from(bodyStart), buffer, Buffer.from(bodyEnd)])

  const res = await cloudscraper.post({
    uri: 'https://qu.ax/upload.php',
    body: fullBody,
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }
  })

  try {
    const json = JSON.parse(res.toString())
    return json.files?.[0]?.url || null
  } catch {
    const dom = new JSDOM(res.toString())
    const a = [...dom.window.document.querySelectorAll('a')].map(el => el.href)
    return a.find(href => href.includes('qu.ax/')) || null
  }
}

async function uploadToQuaxPuppeteer(buffer) {
  const fs = await import('fs')
  const temp = `/tmp/tofigure_${Date.now()}.png`
  fs.writeFileSync(temp, buffer)

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.goto('https://qu.ax', { waitUntil: 'networkidle2' })

  const input = await page.$('input[type="file"]')
  await input.uploadFile(temp)

  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('a')).some(a => a.href.includes('qu.ax/'))
  )

  const url = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a'))
      .map(a => a.href)
      .find(href => href.includes('qu.ax/'))
  )

  await browser.close()
  fs.unlinkSync(temp)
  return url
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Only GET allowed' })

  const { url } = req.query
  if (!url) return res.status(400).json({ success: false, error: 'URL diperlukan' })

  try {
    const imgBuffer = await cloudscraper.get({ uri: url, encoding: null })
    const hasil = await img2img(imgBuffer, PROMPT)

    let downloadUrl = await uploadToQuaxDirect(hasil)
    if (!downloadUrl) downloadUrl = await uploadToQuaxPuppeteer(hasil)

    if (!downloadUrl) throw new Error('Upload gagal')

    return res.status(200).json({
      success: true,
      data: {
        name: `tofigure_${Date.now()}.png`,
        size: (hasil.length / 1024).toFixed(2) + ' KB',
        extension: 'png',
        downloadUrl,
        uploaded: new Date().toISOString(),
        details: {
          platform: 'Photogpt API',
          hosting: 'qu.ax',
          expired: 'No Expiry'
        }
      }
    })
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message })
  }
}
