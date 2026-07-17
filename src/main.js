import { CheerioCrawler, log } from 'crawlee';
import { Actor } from 'apify';

await Actor.init();

const input = await Actor.getInput() || {};
const maxItems = input.maxItems || 500;
const maxRunTimeMinutes = input.maxRunTimeMinutes || 5;

// StreetDirectory.com category IDs for dental-related listings
const CATEGORY_URLS = [
    'https://www.streetdirectory.com/businessfinder/company/751/Dental_Surgeon/',
    'https://www.streetdirectory.com/businessfinder/company/3527/Periodontist/',
    'https://www.streetdirectory.com/businessfinder/company/3529/Orthodontist/',
    'https://www.streetdirectory.com/businessfinder/company/3521/Endodontist/',
];

let totalItems = 0;

const crawler = new CheerioCrawler({
    maxRequestRetries: 2,
    maxConcurrency: 3,
    async requestHandler({ $, request, enqueueLinks }) {
        if (totalItems >= maxItems) return;

        log.info(`Processing: ${request.url}`);

        const results = [];

        // Each listing row is a numbered table row or div with business info
        // StreetDirectory uses numbered lists (1. Name, Address, Category, Tel)
        const listingBlocks = $('table tr, .company_listing, div').filter(function () {
            const text = $(this).text();
            return text.includes('Address :') && text.includes('Category :');
        });

        listingBlocks.each((i, el) => {
            if (totalItems + results.length >= maxItems) return false;

            const block = $(el);
            const text = block.text();

            // Name: usually the first bold/strong text or link text
            let name = block.find('b, strong').first().text().trim()
                || block.find('a[href*="/businessfinder/"]').first().text().trim()
                || block.find('a').first().text().trim();

            // Clean up name — remove "Photos" suffix
            name = name.replace(/\s*Photos?\s*$/, '').trim();

            // Address: text after "Address :"
            const addrMatch = text.match(/Address\s*:\s*([^]*?)(?:Branches|Category|Tel|Email)/);
            let address = addrMatch ? addrMatch[1].trim() : '';
            // Clean up whitespace
            address = address.replace(/\s+/g, ' ').trim();

            // Category tags
            const catMatch = text.match(/Category\s*:\s*([^]*?)(?:Tel|Email|More Info|$)/);
            let categories = catMatch ? catMatch[1].trim() : '';
            categories = categories.replace(/,\s*more\.\.\.\s*$/, '').replace(/\s+/g, ' ').trim();

            // Phone: text after "Tel :"
            const telMatch = text.match(/Tel\s*:\s*([^]*?)(?:Email|More Info|$)/);
            let phone = telMatch ? telMatch[1].trim() : '';
            phone = phone.replace(/Call now/i, '').replace(/\s+/g, ' ').trim();
            // Try to extract phone number pattern from block links
            if (!phone || phone === '') {
                const telLink = block.find('a[href^="tel:"]');
                if (telLink.length) phone = telLink.text().trim() || telLink.attr('href').replace('tel:', '');
            }

            // Website: look for external links
            let website = '';
            block.find('a[href^="http"]').each((_, a) => {
                const href = $(a).attr('href') || '';
                if (!href.includes('streetdirectory.com') && !href.includes('facebook') && !href.includes('google')) {
                    website = href;
                    return false;
                }
            });

            // Branch count
            const branchMatch = text.match(/View all (\d+) outlets/i);
            const branches = branchMatch ? parseInt(branchMatch[1], 10) : 1;

            if (name && name.length > 2 && (address || phone)) {
                results.push({
                    name,
                    phone: phone || 'Not Found',
                    address: address || 'Not Found',
                    website: website || 'Not Found',
                    categories: categories || 'Dental',
                    branches,
                    sourceUrl: request.url,
                });
            }
        });

        if (results.length > 0) {
            await Actor.pushData(results);
            totalItems += results.length;
            log.info(`✅ Extracted ${results.length} dentists from ${request.url} (total: ${totalItems})`);
        } else {
            log.warning(`⚠️ No listings found on ${request.url}`);
        }

        // Enqueue pagination links
        if (totalItems < maxItems) {
            await enqueueLinks({
                selector: 'a[href*="/businessfinder/company/751/"], a[href*="/businessfinder/company/3527/"], a[href*="/businessfinder/company/3529/"], a[href*="/businessfinder/company/3521/"]',
                globs: ['**/businessfinder/company/*/All/*'],
            });
        }
    },
});

// Kill switch
setTimeout(() => {
    log.warning(`Maximum run time of ${maxRunTimeMinutes} minutes reached. Tearing down.`);
    crawler.teardown();
}, maxRunTimeMinutes * 60 * 1000);

log.info('Starting Singapore Dentists Scraper (StreetDirectory.com)...');
await crawler.run(CATEGORY_URLS);

log.info(`🎉 Done. Total dentists extracted: ${totalItems}`);
await Actor.exit();
