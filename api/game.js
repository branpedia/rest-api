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
            return {
                success: true,
                data: {
                    username,
                    user_id,
                    region,
                    game: 'Free Fire'
                }
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
            return {
                success: true,
                data: {
                    username,
                    user_id,
                    zone: zone || 'Tidak diketahui',
                    game: 'Mobile Legends Adventure'
                }
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
            
            return {
                success: true,
                data: {
                    username: userData.username,
                    user_id: userData.user_id,
                    zone: userData.zone || foundZone.zoneId,
                    zone_name: foundZone.name,
                    game: 'Eggy Party'
                }
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
            default:
                return response.status(400).json({ 
                    success: false, 
                    error: 'Game tidak didukung. Pilihan: ff, aov, mla, pubg, eggy, hok' 
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
