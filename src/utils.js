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
        const results = await getLatestNews(cacheKey);
        if (results) {
            results.articles = results.articles.map(a => `[${a.title}](${a.url})`);
            newsCache[cacheKey] = results;
            return results;
        }
        return newsCache[cacheKey] || {};
    } else {
        return newsCache[cacheKey];
    }
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
    if (!statsCache[cacheKey]) statsCache[cacheKey] = [];
    const countryApiPath = (country) ? `/countries/${country}` : '';
    if (checkCacheExpiry(statsCache[cacheKey])) {
        const result = await getLatestStats(countryApiPath);
        if (result) {
            const data = [
                process.env.JOINER,
                `**${cacheKey}**`,
                process.env.JOINER,
                `Confirmed - ${_.get(result, 'confirmed.value', 'NA')} | Recovered - ${_.get(result, 'recovered.value', 'NA')} | Deaths - ${_.get(result, 'deaths.value', 'NA')}`,
            ];
            statsCache[cacheKey] = data;
            return data;
        }
        return statsCache[cacheKey] || [];
    } else {
        return statsCache[cacheKey];
    }
};

const getIndiaStats = async () => {
    const cacheKey = 'IndiaStats';
    if (!statsCache[cacheKey]) statsCache[cacheKey] = [];
    if (checkCacheExpiry(statsCache[cacheKey])) {
        const stateWiseData = [];
        try {
            const html = await request(process.env.STATS_INDIA_BASE_API);
            const $ = cheerio.load(html);
            const tableBody = $('div.content div.table-responsive table tbody');
            const rows = tableBody.children();

            rows.each((i, el) => {
                const dataEL = $(el).find('td');
                if (rows.length - 1 === i) {
                    stateWiseData.push(`**${dataEL.eq(0).text()}**`);
                } else if (rows.length - 2 === i) {
                    stateWiseData.push(`**${dataEL.eq(0).text()}**`);
                    stateWiseData.push(`⚠ - ${dataEL.eq(1).text()} | ✓ - ${dataEL.eq(2).text()} | ☠ - ${dataEL.eq(3).text()}`);
                } else {
                    stateWiseData.push(`**${dataEL.eq(1).text()}**`);
                    stateWiseData.push(`⚠ - ${dataEL.eq(2).text()} | ✓ - ${dataEL.eq(3).text()} | ☠ - ${dataEL.eq(4).text()}`);
                }
                stateWiseData.push('\n\n');

            });
        } catch (e) {
            console.log(e);
        }
        if (stateWiseData.length) {
            const info = '⚠ - Active cases, ✓ - Recovered, ☠ -Deaths ';
            stateWiseData.unshift(process.env.JOINER,'**Stats From Ministry of Health & Family Welfare India**', info ,process.env.JOINER,);
            statsCache[cacheKey] = stateWiseData;
            return stateWiseData;
        }
        return statsCache[cacheKey] || stateWiseData;
    } else {
        return statsCache[cacheKey];
    }
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
};
