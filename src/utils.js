const request = require('request-promise');
const cheerio = require('cheerio');
const moment = require('moment');
const low = require('lowdb');
const _ = require('lodash');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('./src/db/db.json');
const db = low(adapter);

db.defaults({ users: [], stats: {} }).write();

const expiryTime = 60;
const newsCache = {};
const statsCache = {};

const checkCacheExpiry = (cache) => {
    return (Object.keys(cache).length === 0 || moment().diff(moment(cache['lastUpdatedAt']), 'minutes') > expiryTime);
};

const getLatestNews = async (query = '') => {
    try {
        const options = {
            uri: process.env.NEWS_BASE_API,
            qs: {
                q: 'corona',
                sources: (query === 'India') ? 'google-news-in' : 'google-news',
                apiKey: process.env.NEWS_API_KEY,
            },
            json: true
        };
        const resp = await request(options);
        return { ...resp, lastUpdatedAt: moment().format() };
    } catch (e) {
        console.log(e)
    }
};

const getNews = async (cacheKey) => {
    if (!newsCache[cacheKey]) newsCache[cacheKey] = {};
    if (checkCacheExpiry(newsCache[cacheKey])) {
        console.log(`Fetching News ${cacheKey}`);
        const results = await getLatestNews(cacheKey);
        if (results) {
            results.articles = results.articles.map(a => `[${a.title}](${a.url})`);
            newsCache[cacheKey].data = results;
            newsCache[cacheKey].lastUpdatedAt = new Date();
            return results;
        }
    }
    return newsCache[cacheKey].data || {};
};

const getLatestStats = async (path = '') => {
    try {
        const options = {
            uri: `${process.env.STATS_BASE_API}${path}`,
            json: true
        };
        const resp = await request(options);
        return { ...resp, lastUpdatedAt: moment().format() };
    } catch (e) {
        console.log(e)
    }
};

const getStats = async (cacheKey, country = '') => {
    if (!statsCache[cacheKey]) statsCache[cacheKey] = {};
    const countryApiPath = (country) ? `/countries/${country}` : '';
    if (checkCacheExpiry(statsCache[cacheKey])) {
        console.log(`Fetching Stats ${cacheKey} ${country}`);
        const result = await getLatestStats(countryApiPath);
        if (result) {
            const data = [
                process.env.JOINER,
                `**${cacheKey}**`,
                process.env.JOINER,
                `Confirmed - ${_.get(result, 'confirmed.value', 'NA')} | Recovered - ${_.get(result, 'recovered.value', 'NA')} | Deaths - ${_.get(result, 'deaths.value', 'NA')}`,
            ];
            statsCache[cacheKey].data = data;
            statsCache[cacheKey].lastUpdatedAt = new Date();
            return data;
        }
    }
    return statsCache[cacheKey].data || [];
};

const getIndiaStats = async () => {
    const cacheKey = 'IndiaStats';
    if (!statsCache[cacheKey]) statsCache[cacheKey] = {};
    if (checkCacheExpiry(statsCache[cacheKey])) {
        console.log(`Fetching India Stats ${cacheKey}`);
        let data = [];
        const stateWiseData = [];
        try {
            const options = {
                uri: `${process.env.STATS_DATA_API}`,
                json: true
            };
            data = await request(options);
        } catch (e) {
            console.log(e)
        }
        if (data && data.statewise.length) {
            const info = '⛔ - Total, ⚠ - Active cases, ✓ - Recovered, ☠ -Deaths ';
            stateWiseData.push(process.env.JOINER, '**India - State Wise Data**', info, process.env.JOINER);
            data.statewise.forEach((el) =>{
                if (+el.confirmed !== 0) {
                    stateWiseData.push(`**${el.state}**`);
                    stateWiseData.push(`⛔ - ${el.confirmed} | ⚠ - ${el.active} | ✓ - ${el.recovered}  | ☠ - ${el.deaths} `);
                }
            });
            statsCache[cacheKey].data = stateWiseData;
            statsCache[cacheKey].lastUpdatedAt = new Date();
            return stateWiseData;
        }
    }
    return statsCache[cacheKey].data || [];
};

const getIndiaStatsFromGovtWebsite = async () => {
    const cacheKey = 'IndiaGovtWebsiteStats';
    if (!statsCache[cacheKey]) statsCache[cacheKey] = {};
    if (checkCacheExpiry(statsCache[cacheKey])) {
        console.log(`Fetching India Stats From Govt Website ${cacheKey}`);
        const stateWiseData = [];
        try {
            const html = await request(process.env.STATS_INDIA_BASE_API);
            const $ = cheerio.load(html);
            const tableBody = $('.table-responsive table tbody');
            const rows = tableBody.children();

            const getText = (dataEL, index) => dataEL.eq(index).text().replace('*', '# ');

            rows.each((i, el) => {
                const dataEL = $(el).find('td');
                if (dataEL.length === 1) {
                    stateWiseData.push(`**${getText(dataEL, 0)}**`);
                } else {
                    let j = 1;
                    if (dataEL.length === 4) j = 0;
                    stateWiseData.push(`**${(j === 0) ? 'Total' : getText(dataEL, j) }**`);
                    stateWiseData.push(`⚠ - ${getText(dataEL, j + 1)} | ✓ - ${getText(dataEL, j + 2)}  | ☠ - ${getText(dataEL, j + 3)} `);
                }
                stateWiseData.push('\n\n');

            });
        } catch (e) {
            console.log(e);
        }
        if (stateWiseData.length) {
            const info = '⚠ - Active cases, ✓ - Recovered, ☠ -Deaths ';
            stateWiseData.unshift(process.env.JOINER,'**Stats From Ministry of Health & Family Welfare India**', info ,process.env.JOINER,);
            statsCache[cacheKey].data = stateWiseData;
            statsCache[cacheKey].lastUpdatedAt = new Date();
            return stateWiseData;
        }
    }
    return statsCache[cacheKey].data || [];
};

function upsert(db, collection, where, data) {
    let handle = db.get(collection);
    let status = 'created';

    if (_.isEmpty(handle.find(where).value())) {
        data.createdAt = new Date();
        data.updatedAt = new Date();
        handle = handle.push(data);
    } else {
        data.updatedAt = new Date();
        status = 'updated';
        handle = handle.find(where).assign(data);
    }
    handle.write();
    return status;
}

module.exports = {
    db,
    upsert,
    getNews,
    getStats,
    getIndiaStats,
    getIndiaStatsFromGovtWebsite,
};
