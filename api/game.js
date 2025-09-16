import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

const s = {
    tools: {
        async hit(description, url, options, returnType = 'text') {
            try {
                const response = await fetch(url, options);
                if (!response.ok) throw Error(`${response.status} ${response.statusText}\n${await response.text() || '(response body kosong)'}`);
                
                if (returnType === 'text') {
                    const data = await response.text();
                    return { data, response };
                } else if (returnType === 'json') {
                    const data = await response.json();
                    return { data, response };
                } else {
                    throw Error(`invalid returnType param.`);
                }
            } catch (e) {
                throw Error(`hit ${description} failed. ${e.message}`);
            }
        }
    },

    // Free Fire Stalk
    async freeFireStalk(userId) {
        try {
            const url = `https://ceknickname.com/api/free-fire-region?id=${userId}`;
            const { data } = await this.tools.hit('Free Fire stalk', url, {}, 'json');
            
            if (!data.status || !data.result) throw Error('Data tidak ditemukan. Periksa kembali ID-nya.');
            
            const { username, user_id, region } = data.result;
            
            const resultData = {
                username,
                user_id,
                game: 'Free Fire'
            };
            
            if (region) {
                resultData.region = region;
            }
            
            return {
                success: true,
                data: resultData
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Arena of Valor Stalk
    async aovStalk(userId) {
        try {
            const url = `https://ceknickname.com/api/game/arena-of-valor?id=${userId}`;
            const { data } = await this.tools.hit('AOV stalk', url, {}, 'json');
            
            if (!data.status || !data.data) throw Error('ID tidak ditemukan atau salah format.');
            
            const { username, user_id } = data.data;
            return {
                success: true,
                data: {
                    username,
                    user_id,
                    game: 'Arena of Valor'
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Mobile Legends Adventure Stalk
    async mlaStalk(userId, zoneId = '') {
        try {
            let url;
            if (zoneId) {
                url = `https://ceknickname.com/api/game/mobile-legends-adventure?id=${userId}&zone=${zoneId}`;
            } else {
                url = `https://ceknickname.com/api/game/mobile-legends-adventure?id=${userId}`;
            }
            
            const { data } = await this.tools.hit('MLA stalk', url, {}, 'json');
            
            if (!data.status || data.code !== 200) throw Error('ID tidak ditemukan atau salah format.');
            
            const { username, user_id, zone } = data.data;
            
            const resultData = {
                username,
                user_id,
                game: 'Mobile Legends Adventure'
            };
            
            if (zone) {
                resultData.zone = zone;
            }
            
            return {
                success: true,
                data: resultData
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    },

    // PUBG Mobile Stalk
    async pubgStalk(userId) {
        try {
            const url = `https://ceknickname.com/api/game/pubg-mobile-tp?id=${userId}`;
            const { data } = await this.tools.hit('PUBG stalk', url, {}, 'json');
            
            if (!data.status || data.code !== 200) throw Error('ID tidak ditemukan atau salah format.');
            
            const { username, user_id } = data.data;
            return {
                success: true,
                data: {
                    username,
                    user_id,
                    game: 'PUBG Mobile'
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Eggy Party Stalk with auto zone detection
    async eggyStalk(userId) {
        try {
            const zoneUrl = 'https://ceknickname.com/api/game/get-zone/eggy-party';
            const { data: zoneData } = await this.tools.hit('Eggy Party zones', zoneUrl, {}, 'json');
            
            if (!zoneData.status || !zoneData.data || zoneData.data.length === 0) {
                throw Error('Gagal mengambil daftar zone Eggy Party.');
            }
            
            const zones = zoneData.data;
            let userData = null;
            let foundZone = null;
            
            for (const zone of zones) {
                try {
                    const userUrl = `https://ceknickname.com/api/game/eggy-party?id=${userId}&zone=${zone.zoneId}`;
                    const { data: userResponse } = await this.tools.hit(`Eggy Party stalk zone ${zone.zoneId}`, userUrl, {}, 'json');
                    
                    if (userResponse.status && userResponse.code === 200) {
                        userData = userResponse.data;
                        foundZone = zone;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!userData) {
                throw Error(`Player dengan ID ${userId} tidak ditemukan di semua zone yang tersedia.`);
            }
            
            const resultData = {
                username: userData.username,
                user_id: userData.user_id,
                game: 'Eggy Party'
            };
            
            if (userData.zone || foundZone.zoneId) {
                resultData.zone = userData.zone || foundZone.zoneId;
            }
            
            if (foundZone.name) {
                resultData.zone_name = foundZone.name;
            }
            
            return {
                success: true,
                data: resultData
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Honor of Kings Stalk
    async hokStalk(userId) {
        try {
            const url = `https://ceknickname.com/api/game/honor-of-kings-tp?id=${userId}`;
            const { data } = await this.tools.hit('HOK stalk', url, {}, 'json');
            
            if (!data.status || data.code !== 200) {
                throw Error('Player tidak ditemukan atau ID salah.');
            }
            
            const { username, user_id } = data.data;
            return {
                success: true,
                data: {
                    username,
                    user_id,
                    game: 'Honor of Kings'
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Undawn Stalk
    async undawnStalk(userId) {
        try {
            const url = `https://ceknickname.com/api/game/undawn?id=${userId}`;
            const { data } = await this.tools.hit('Undawn stalk', url, {}, 'json');
            
            if (!data.status || data.code !== 200) {
                throw Error('Player tidak ditemukan atau ID salah.');
            }
            
            const { username, user_id, zone } = data.data;
            
            const resultData = {
                username,
                user_id,
                game: 'Undawn'
            };
            
            if (zone) {
                resultData.zone = zone;
            }
            
            return {
                success: true,
                data: resultData
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Dragon Raja Stalk
    async dragonRajaStalk(userId) {
        try {
            const url = `https://ceknickname.com/api/game/dragon-raja?id=${userId}`;
            const { data } = await this.tools.hit('Dragon Raja stalk', url, {}, 'json');
            
            if (!data.status || data.code !== 200) {
                throw Error('Player tidak ditemukan atau ID salah.');
            }
            
            const { username, user_id, zone } = data.data;
            
            const resultData = {
                username,
                user_id,
                game: 'Dragon Raja'
            };
            
            if (zone) {
                resultData.zone = zone;
            }
            
            return {
                success: true,
                data: resultData
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Call of Duty Mobile Stalk
    async codStalk(userId) {
        try {
            const url = `https://ceknickname.com/api/game/call-of-duty-mobile?id=${userId}`;
            const { data } = await this.tools.hit('COD Mobile stalk', url, {}, 'json');
            
            if (!data.status || data.code !== 200) {
                throw Error('Player tidak ditemukan atau ID salah.');
            }
            
            const { username, user_id, zone } = data.data;
            
            const resultData = {
                username,
                user_id,
                game: 'Call of Duty Mobile'
            };
            
            if (zone) {
                resultData.zone = zone;
            }
            
            return {
                success: true,
                data: resultData
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    },

    // EA Sports FC Mobile Stalk
    async eaSportsStalk(userId) {
        try {
            const url = `https://ceknickname.com/api/game/ea-sports-fc-mobile?id=${userId}`;
            const { data } = await this.tools.hit('EA Sports FC Mobile stalk', url, {}, 'json');
            
            if (!data.status || data.code !== 200) {
                throw Error('Player tidak ditemukan atau ID salah.');
            }
            
            const { username, user_id, zone } = data.data;
            
            const resultData = {
                username,
                user_id,
                game: 'EA Sports FC Mobile'
            };
            
            if (zone) {
                resultData.zone = zone;
            }
            
            return {
                success: true,
                data: resultData
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Super Sus Stalk
    async superSusStalk(userId) {
        try {
            const url = `https://ceknickname.com/api/game/super-sus?id=${userId}`;
            const { data } = await this.tools.hit('Super Sus stalk', url, {}, 'json');
            
            if (!data.status || data.code !== 200) {
                throw Error('Player tidak ditemukan atau ID salah.');
            }
            
            const { username, user_id, zone } = data.data;
            
            const resultData = {
                username,
                user_id,
                game: 'Super Sus'
            };
            
            if (zone) {
                resultData.zone = zone;
            }
            
            return {
                success: true,
                data: resultData
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Tom and Jerry Chase Stalk with auto zone detection
    async tomJerryStalk(userId) {
        try {
            const zoneUrl = 'https://ceknickname.com/api/game/get-zone/tom-and-jerry-chase';
            const { data: zoneData } = await this.tools.hit('Tom and Jerry zones', zoneUrl, {}, 'json');
            
            if (!zoneData.status || !zoneData.data || zoneData.data.length === 0) {
                throw Error('Gagal mengambil daftar zone Tom and Jerry Chase.');
            }
            
            const zones = zoneData.data;
            let userData = null;
            let foundZone = null;
            
            for (const zone of zones) {
                try {
                    const userUrl = `https://ceknickname.com/api/game/tom-and-jerry-chase?id=${userId}&zone=${zone.zoneId}`;
                    const { data: userResponse } = await this.tools.hit(`Tom and Jerry stalk zone ${zone.zoneId}`, userUrl, {}, 'json');
                    
                    if (userResponse.status && userResponse.code === 200) {
                        userData = userResponse.data;
                        foundZone = zone;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!userData) {
                throw Error(`Player dengan ID ${userId} tidak ditemukan di semua zone yang tersedia.`);
            }
            
            const resultData = {
                username: userData.username,
                user_id: userData.user_id,
                game: 'Tom and Jerry Chase'
            };
            
            if (userData.zone || foundZone.zoneId) {
                resultData.zone = userData.zone || foundZone.zoneId;
            }
            
            if (foundZone.name) {
                resultData.zone_name = foundZone.name;
            }
            
            return {
                success: true,
                data: resultData
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Genshin Impact Stalk (Menggunakan Cloudscraper dan JSDOM)
    async genshinStalk(userId) {
        let browser;
        try {
            let html;
            try {
                html = await cloudscraper.get(`https://enka.network/u/${userId}/`);
            } catch (error) {
                console.log('Cloudscraper failed, trying with Puppeteer...');
                
                browser = await puppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });
                
                const page = await browser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
                await page.goto(`https://enka.network/u/${userId}/`, { waitUntil: 'networkidle2' });
                
                html = await page.content();
                if (browser) await browser.close();
            }

            const dom = new JSDOM(html);
            const document = dom.window.document;

            const imgElement = document.querySelector('figure.avatar-icon img');
            const characterImage = imgElement ? `https://enka.network${imgElement.getAttribute('src')}` : null;

            const apiUrl = `https://enka.network/api/uid/${userId}`;
            let apiData;
            
            try {
                const apiResponse = await cloudscraper.get(apiUrl, { json: true });
                apiData = apiResponse;
            } catch (apiError) {
                console.log('API request failed, trying with fetch...');
                const { data } = await this.tools.hit('Genshin API', apiUrl, {}, 'json');
                apiData = data;
            }

            if (!apiData.playerInfo) {
                throw Error('Player tidak ditemukan atau UID salah.');
            }

            const { nickname, level, worldLevel, signature, nameCardId, finishAchievementNum } = apiData.playerInfo;
            
            const resultData = {
                nickname: nickname || 'Tidak diketahui',
                level: level || '-',
                world_level: worldLevel || '-',
                signature: signature || 'Tidak ada',
                name_card_id: nameCardId || '-',
                achievements: finishAchievementNum || '-',
                uid: userId,
                character_image: characterImage,
                game: 'Genshin Impact'
            };
            
            return {
                success: true,
                data: resultData
            };
        } catch (error) {
            if (browser) await browser.close();
            return {
                success: false,
                error: error.message || 'Gagal mengambil data Genshin Impact'
            };
        }
    },

    // Honkai: Star Rail Stalk (Menggunakan Cloudscraper, Puppeteer, dan JSDOM)
    async hsrStalk(userId) {
        let browser;
        try {
            const url = `https://enka.network/hsr/${userId}/`;
            let html;
            
            try {
                html = await cloudscraper.get(url);
            } catch (error) {
                console.log('Cloudscraper failed, trying with Puppeteer...');
                
                browser = await puppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });
                
                const page = await browser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
                await page.goto(url, { waitUntil: 'networkidle2' });
                
                html = await page.content();
                if (browser) await browser.close();
            }

            const dom = new JSDOM(html);
            const document = dom.window.document;

            let nickname = document.querySelector('.details h1')?.textContent.trim();
            let arText = document.querySelector('.ar')?.textContent.trim() || '';
            let trailblaze = arText.match(/TL\s*(\d+)/)?.[1] || 'N/A';
            let eq = arText.match(/EQ\s*(\d+)/)?.[1] || 'N/A';

            let tdList = [...document.querySelectorAll('td.svelte-1dtsens')];
            let totalAchievement = 'N/A';
            let simUniverse = 'N/A';

            for (let i = 0; i < tdList.length; i++) {
                let text = tdList[i].textContent.trim();
                let nextText = tdList[i + 1]?.textContent.trim() || '';
                if (/Total Achievement/i.test(text)) totalAchievement = nextText;
                if (/Simulated Universe/i.test(text)) simUniverse = nextText;
            }

            let characterName = document.querySelector('.name')?.textContent.trim() || 'N/A';
            let charLevel = document.querySelector('.level')?.textContent.trim() || 'N/A';

            const resultData = {
                nickname: nickname || 'N/A',
                trailblaze_level: trailblaze,
                equilibrium_level: eq,
                total_achievement: totalAchievement,
                simulated_universe: simUniverse,
                main_character: characterName,
                main_character_level: charLevel,
                uid: userId,
                game: 'Honkai: Star Rail'
            };
            
            return {
                success: true,
                data: resultData
            };
        } catch (error) {
            if (browser) await browser.close();
            return {
                success: false,
                error: error.message || 'Gagal mengambil data Honkai: Star Rail'
            };
        }
    },

    // Zenless Zone Zero Stalk (Menggunakan Cloudscraper, Puppeteer, dan JSDOM)
    async zzzStalk(userId) {
        let browser;
        try {
            const url = `https://enka.network/zzz/${userId}/`;
            let html;
            
            try {
                html = await cloudscraper.get(url);
            } catch (error) {
                console.log('Cloudscraper failed, trying with Puppeteer...');
                
                browser = await puppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });
                
                const page = await browser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
                await page.goto(url, { waitUntil: 'networkidle2' });
                
                html = await page.content();
                if (browser) await browser.close();
            }

            const dom = new JSDOM(html);
            const document = dom.window.document;

            let nickname = document.querySelector('.details h1')?.textContent.trim() || 'N/A';
            let levelText = document.querySelector('.ar')?.textContent.trim() || '';
            let agentLevel = levelText.match(/IL\s*(\d+)/)?.[1] || 'N/A';

            let modeElements = [...document.querySelectorAll('.svelte-1dtsens')];
            let combinedModes = [];
            let lastNumber = null;

            for (let el of modeElements) {
                let text = el.textContent.trim();
                if (/^\d+$/.test(text)) {
                    lastNumber = text;
                } else if (lastNumber && /(Shiyu|Endless|Deadly|Pemanjatan|Serbuan|Jalan Mulus|Line Breaker)/i.test(text)) {
                    let combined = `${lastNumber}  ${text}`;
                    if (!combinedModes.some(m => m.includes(text))) {
                        combinedModes.push(combined);
                    }
                    lastNumber = null;
                }
            }

            let characterName = document.querySelector('.name')?.textContent.trim() || 'N/A';
            let charLevel = document.querySelector('.level')?.textContent.trim() || 'N/A';

            const resultData = {
                nickname,
                agent_level: agentLevel,
                main_character: characterName,
                main_character_level: charLevel,
                game_modes: combinedModes.length > 0 ? combinedModes : ['N/A'],
                uid: userId,
                game: 'Zenless Zone Zero'
            };
            
            return {
                success: true,
                data: resultData
            };
        } catch (error) {
            if (browser) await browser.close();
            return {
                success: false,
                error: error.message || 'Gagal mengambil data Zenless Zone Zero'
            };
        }
    }
};

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

    const { game, id, zone, retry = 0 } = request.query;

    if (!game || !id) {
        return response.status(400).json({ 
            success: false, 
            error: 'Parameter game dan id diperlukan. Contoh: ?game=ff&id=4022442566' 
        });
    }

    try {
        let result;
        const gameType = game.toLowerCase();

        switch (gameType) {
            case 'ff':
            case 'freefire':
                result = await s.freeFireStalk(id);
                break;
            case 'aov':
            case 'arenaofvalor':
                result = await s.aovStalk(id);
                break;
            case 'mla':
            case 'mladventure':
                result = await s.mlaStalk(id, zone);
                break;
            case 'pubg':
            case 'pubgm':
                result = await s.pubgStalk(id);
                break;
            case 'eggy':
            case 'eggyparty':
                result = await s.eggyStalk(id);
                break;
            case 'hok':
            case 'honorofkings':
                result = await s.hokStalk(id);
                break;
            case 'undawn':
                result = await s.undawnStalk(id);
                break;
            case 'dragonraja':
            case 'dr':
                result = await s.dragonRajaStalk(id);
                break;
            case 'cod':
            case 'codm':
            case 'callofduty':
                result = await s.codStalk(id);
                break;
            case 'easports':
            case 'fcmobile':
            case 'fc':
                result = await s.eaSportsStalk(id);
                break;
            case 'supersus':
            case 'sus':
                result = await s.superSusStalk(id);
                break;
            case 'tomjerry':
            case 'tomandjerry':
            case 'tj':
                result = await s.tomJerryStalk(id);
                break;
            case 'genshin':
            case 'gi':
                result = await s.genshinStalk(id);
                break;
            case 'hsr':
            case 'honkaistarrail':
                result = await s.hsrStalk(id);
                break;
            case 'zzz':
            case 'zenlesszonezero':
                result = await s.zzzStalk(id);
                break;
            default:
                return response.status(400).json({ 
                    success: false, 
                    error: 'Game tidak didukung. Pilihan: ff, aov, mla, pubg, eggy, hok, undawn, dragonraja, cod, easports, supersus, tomjerry, genshin, hsr, zzz' 
                });
        }

        if (!result.success) {
            throw new Error(result.error);
        }

        return response.status(200).json(result);

    } catch (error) {
        console.error('Error fetching game data:', error);
        
        if (retry < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
        }
        
        return response.status(500).json({ 
            success: false, 
            error: error.message || 'Gagal mengambil data game. Pastikan ID valid dan coba lagi.' 
        });
    }
}
