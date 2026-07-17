import { CheerioCrawler, log } from 'crawlee';
import { Actor } from 'apify';

await Actor.init();

const input = await Actor.getInput() || {};
const maxItems = input.maxItems || 500;
const maxRunTimeMinutes = input.maxRunTimeMinutes || 5;

// singapore-directory.com categories for healthcare/doctors
const START_URLS = [
    'https://singapore-directory.com/doctors',
    'https://singapore-directory.com/healthcare',
    'https://singapore-directory.com/doctors/cardiology',
    'https://singapore-directory.com/doctors/orthopedics',
    'https://singapore-directory.com/doctors/primary-care',
    'https://singapore-directory.com/doctors/psychiatry',
    'https://singapore-directory.com/healthcare/clinics',
    'https://singapore-directory.com/healthcare/hospitals',
    'https://singapore-directory.com/healthcare/specialized-doctors',
];

let totalItems = 0;

const crawler = new CheerioCrawler({
    maxRequestRetries: 2,
    maxConcurrency: 3,
    async requestHandler({ $, request, enqueueLinks }) {
        if (totalItems >= maxItems) return;

        log.info(`Processing: ${request.url}`);
        const results = [];

        // singapore-directory.com lists businesses as cards/items with:
        // - h4 or h3 with link to detail page
        // - address text below the title
        // Each listing card has a link with the business name and address visible

        // Try finding listing items (the site uses standard listing structure)
        $('a[href*="/singapore-directory.com/"]').each((i, el) => {
            // Skip navigation/category links
            const href = $(el).attr('href') || '';
            if (!href.match(/\/\d+$/)) return; // Listing URLs end with /ID number
        });

        // Look for listing blocks — they contain title + address
        const listingSelectors = [
            '.listing-item, .item, .card, article',
            'div[class*="listing"], div[class*="item"]',
            'h4 a, h3 a',
        ];

        // Strategy 1: Find cards/articles that have both a link and address text
        $('article, .item, .listing-item, .card, div[class*="list"]').each((i, el) => {
            if (totalItems + results.length >= maxItems) return false;
            const block = $(el);

            // Name from heading link
            let name = block.find('h3 a, h4 a, h2 a, .title a').first().text().trim();
            if (!name) name = block.find('a').first().text().trim();
            if (!name || name.length < 3) return;

            // Link to detail page
            const detailLink = block.find('a[href*="/"]').first().attr('href') || '';

            // Address — look for text that contains Singapore postal code pattern or "Singapore"
            let address = '';
            const blockText = block.text();
            const addrMatch = blockText.match(/(\d+[^,]*(?:Road|Street|Avenue|Drive|Lane|Way|Boulevard|Crescent|Place|Close|Walk|Terrace|Link|Gateway|Square)[^,]*,?\s*(?:Singapore)?\s*\d{6})/i);
            if (addrMatch) {
                address = addrMatch[1].trim();
            } else {
                // Look for "Singapore" followed by postal code
                const sgMatch = blockText.match(/([^.]*Singapore\s*\d{6})/i);
                if (sgMatch) address = sgMatch[1].trim();
            }

            // Also try just getting any text after the name that looks like an address
            if (!address) {
                const allText = block.find('p, span, div').not('h1,h2,h3,h4,h5,a').text().trim();
                if (allText && allText.includes('Singapore')) {
                    address = allText.replace(/\s+/g, ' ').slice(0, 200);
                }
            }

            // Category from breadcrumb or category link
            let category = '';
            block.find('a[href*="singapore-directory.com/"]').each((_, a) => {
                const catText = $(a).text().trim();
                if (catText && catText !== name && catText.length > 2 && catText.length < 50) {
                    category = catText;
                }
            });

            if (name && name.length > 2) {
                results.push({
                    name: name.replace(/\s+/g, ' ').trim(),
                    address: address || 'Not Found',
                    category: category || 'Healthcare',
                    website: detailLink || 'Not Found',
                    sourceUrl: request.url,
                });
            }
        });

        // Strategy 2: If no cards found, look for any links that point to detail pages (ending in /number)
        if (results.length === 0) {
            $('a').each((i, el) => {
                if (totalItems + results.length >= maxItems) return false;
                const href = $(el).attr('href') || '';
                const text = $(el).text().trim();

                // Detail pages end with /number (e.g. /business-name/2800)
                if (href.match(/\/\d{3,5}$/) && text.length > 3 && text.length < 100) {
                    // Get surrounding text for address
                    const parent = $(el).parent();
                    const parentText = parent.text().replace(text, '').trim();
                    let address = '';
                    const addrMatch = parentText.match(/([^.]*(?:\d{6}|Singapore)[^.]*)/i);
                    if (addrMatch) address = addrMatch[1].trim().replace(/\s+/g, ' ');

                    results.push({
                        name: text.replace(/\s+/g, ' ').trim(),
                        address: address || 'Not Found',
                        category: 'Healthcare',
                        website: href.startsWith('http') ? href : `https://singapore-directory.com${href}`,
                        sourceUrl: request.url,
                    });
                }
            });
        }

        // Dedupe by name
        const seen = new Set();
        const unique = results.filter(r => {
            if (seen.has(r.name)) return false;
            seen.add(r.name);
            return true;
        });

        if (unique.length > 0) {
            await Actor.pushData(unique);
            totalItems += unique.length;
            log.info(`✅ Extracted ${unique.length} listings from ${request.url} (total: ${totalItems})`);
        } else {
            log.warning(`⚠️ No listings found on ${request.url}`);
        }

        // Enqueue pagination and subcategory links
        if (totalItems < maxItems) {
            await enqueueLinks({
                globs: [
                    'https://singapore-directory.com/doctors/**',
                    'https://singapore-directory.com/healthcare/**',
                ],
                exclude: ['**/user/**', '**/login**', '**/register**', '**/item/new**'],
            });
        }
    },
});

// Kill switch
setTimeout(() => {
    log.warning(`Maximum run time of ${maxRunTimeMinutes} minutes reached. Tearing down.`);
    crawler.teardown();
}, maxRunTimeMinutes * 60 * 1000);

log.info('Starting Singapore Doctors & Healthcare Scraper (singapore-directory.com)...');
await crawler.run(START_URLS);

log.info(`🎉 Done. Total listings extracted: ${totalItems}`);
await Actor.exit();
