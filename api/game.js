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
            
            // Hanya tampilkan region jika ada nilainya
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
            
            // Hanya tampilkan zone jika ada nilainya
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
            // First, get available zones
            const zoneUrl = 'https://ceknickname.com/api/game/get-zone/eggy-party';
            const { data: zoneData } = await this.tools.hit('Eggy Party zones', zoneUrl, {}, 'json');
            
            if (!zoneData.status || !zoneData.data || zoneData.data.length === 0) {
                throw Error('Gagal mengambil daftar zone Eggy Party.');
            }
            
            const zones = zoneData.data;
            let userData = null;
            let foundZone = null;
            
            // Try each zone until successful
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
                    // Continue to next zone if failed
                    continue;
                }
            }
            
            if (!userData) {
                throw Error(`Player dengan ID ${userId} tidak ditemukan di semua zone yang tersedia.`);
            }
            
            // Hanya tampilkan zone dan zone_name jika ada nilainya
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
            
            // Hanya tampilkan zone jika ada nilainya
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

    // Genshin Impact Stalk
    async genshinStalk(userId) {
        try {
            const url = `https://enka.network/api/uid/${userId}`;
            const { data } = await this.tools.hit('Genshin stalk', url, {}, 'json');
            
            if (!data.playerInfo) {
                throw Error('Player tidak ditemukan atau UID salah.');
            }
            
            const { nickname, level, worldLevel, signature, nameCardId, finishAchievementNum } = data.playerInfo;
            
            const resultData = {
                nickname: nickname || 'Tidak diketahui',
                level: level || '-',
                world_level: worldLevel || '-',
                signature: signature || 'Tidak ada',
                name_card_id: nameCardId || '-',
                achievements: finishAchievementNum || '-',
                uid: userId,
                game: 'Genshin Impact'
            };
            
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

    // Honkai: Star Rail Stalk
    async hsrStalk(userId) {
        try {
            const url = `https://enka.network/hsr/${userId}/`;
            const { data: html } = await this.tools.hit('HSR stalk', url, {}, 'text');
            
            // Parse HTML menggunakan regex (tanpa JSDOM)
            const nicknameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
            const arTextMatch = html.match(/<div[^>]*class="[^"]*ar[^"]*"[^>]*>([^<]+)<\/div>/);
            const characterNameMatch = html.match(/<div[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/div>/);
            const charLevelMatch = html.match(/<div[^>]*class="[^"]*level[^"]*"[^>]*>([^<]+)<\/div>/);
            
            let nickname = nicknameMatch ? nicknameMatch[1].trim() : 'N/A';
            let arText = arTextMatch ? arTextMatch[1].trim() : '';
            let characterName = characterNameMatch ? characterNameMatch[1].trim() : 'N/A';
            let charLevel = charLevelMatch ? charLevelMatch[1].trim() : 'N/A';
            
            let trailblaze = arText.match(/TL\s*(\d+)/)?.[1] || 'N/A';
            let eq = arText.match(/EQ\s*(\d+)/)?.[1] || 'N/A';
            
            // Extract data from tables using regex
            let totalAchievement = 'N/A';
            let simUniverse = 'N/A';
            
            const achievementMatch = html.match(/Total Achievement[^<]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
            const universeMatch = html.match(/Simulated Universe[^<]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
            
            if (achievementMatch) totalAchievement = achievementMatch[1].trim();
            if (universeMatch) simUniverse = universeMatch[1].trim();
            
            const resultData = {
                nickname,
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
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Zenless Zone Zero Stalk
    async zzzStalk(userId) {
        try {
            const url = `https://enka.network/zzz/${userId}/`;
            const { data: html } = await this.tools.hit('ZZZ stalk', url, {}, 'text');
            
            // Parse HTML menggunakan regex (tanpa JSDOM)
            const nicknameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
            const levelTextMatch = html.match(/<div[^>]*class="[^"]*ar[^"]*"[^>]*>([^<]+)<\/div>/);
            const characterNameMatch = html.match(/<div[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/div>/);
            const charLevelMatch = html.match(/<div[^>]*class="[^"]*level[^"]*"[^>]*>([^<]+)<\/div>/);
            
            let nickname = nicknameMatch ? nicknameMatch[1].trim() : 'N/A';
            let levelText = levelTextMatch ? levelTextMatch[1].trim() : '';
            let characterName = characterNameMatch ? characterNameMatch[1].trim() : 'N/A';
            let charLevel = charLevelMatch ? charLevelMatch[1].trim() : 'N/A';
            
            let agentLevel = levelText.match(/IL\s*(\d+)/)?.[1] || 'N/A';
            
            // Extract game modes using regex
            let gameModes = [];
            const modeRegex = /<td[^>]*>(\d+)<\/td>\s*<td[^>]*>([^<]+)<\/td>/g;
            let match;
            
            while ((match = modeRegex.exec(html)) !== null) {
                const number = match[1];
                const mode = match[2].trim();
                
                if (/(Shiyu|Endless|Deadly|Pemanjatan|Serbuan|Jalan Mulus|Line Breaker)/i.test(mode)) {
                    gameModes.push(`${number} ${mode}`);
                }
            }
            
            const resultData = {
                nickname,
                agent_level: agentLevel,
                main_character: characterName,
                main_character_level: charLevel,
                game_modes: gameModes.length > 0 ? gameModes : ['N/A'],
                uid: userId,
                game: 'Zenless Zone Zero'
            };
            
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
                    error: 'Game tidak didukung. Pilihan: ff, aov, mla, pubg, eggy, hok, undawn, genshin, hsr, zzz' 
                });
        }

        // If the result has an error, throw it
        if (!result.success) {
            throw new Error(result.error);
        }

        return response.status(200).json(result);

    } catch (error) {
        console.error('Error fetching game data:', error);
        
        // Retry logic
        if (retry < 2) {
            // Wait for 1 second before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
            return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
        }
        
        return response.status(500).json({ 
            success: false, 
            error: error.message || 'Gagal mengambil data game. Pastikan ID valid dan coba lagi.' 
        });
    }
}
