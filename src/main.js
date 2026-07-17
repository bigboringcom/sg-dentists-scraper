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

// Noise words to filter out (UI elements, not real listings)
const NOISE = ['show filters', 'login', 'register', 'list your business', 'see all', 'search', 'browse', 'select a category'];

let totalItems = 0;

const crawler = new CheerioCrawler({
    maxRequestRetries: 2,
    maxConcurrency: 3,
    async requestHandler({ $, request, enqueueLinks }) {
        if (totalItems >= maxItems) return;

        const isDetailPage = request.userData.type === 'detail';

        if (isDetailPage) {
            // DETAIL PAGE: extract full contact info
            log.info(`Detail: ${request.url}`);

            const name = $('h1, h2').first().text().trim() || request.userData.name || '';
            if (!name || name.length < 3) return;

            // Phone
            let phone = '';
            $('a[href^="tel:"]').each((_, el) => {
                phone = $(el).text().trim() || $(el).attr('href').replace('tel:', '');
                return false;
            });
            if (!phone) {
                const bodyText = $('body').text();
                const phoneMatch = bodyText.match(/(?:\+65\s?)?[689]\d{3}\s?\d{4}/);
                if (phoneMatch) phone = phoneMatch[0].trim();
            }

            // Email
            let email = '';
            $('a[href^="mailto:"]').each((_, el) => {
                email = $(el).text().trim() || $(el).attr('href').replace('mailto:', '');
                return false;
            });

            // Website (external link)
            let website = '';
            $('a[href^="http"]').each((_, el) => {
                const href = $(el).attr('href') || '';
                if (!href.includes('singapore-directory.com') && !href.includes('facebook.com') && !href.includes('google.com') && !href.includes('twitter.com')) {
                    website = href;
                    return false;
                }
            });

            // Address
            let address = '';
            const bodyText = $('body').text();
            const addrMatch = bodyText.match(/(\d+[^.]*?Singapore\s*\d{6})/i);
            if (addrMatch) address = addrMatch[1].replace(/\s+/g, ' ').trim().slice(0, 200);

            // Category
            const category = request.userData.category || 'Healthcare';

            await Actor.pushData([{
                name,
                phone: phone || 'Not Found',
                email: email || 'Not Found',
                address: address || request.userData.address || 'Not Found',
                website: website || 'Not Found',
                category,
                sourceUrl: request.url,
            }]);
            totalItems++;
            log.info(`✅ ${name} — phone: ${phone || 'N/A'}, addr: ${address.slice(0, 50)}...`);
            return;
        }

        // LISTING PAGE: find business cards and enqueue detail pages
        log.info(`Listing: ${request.url}`);
        let enqueued = 0;

        // Find all links that point to detail pages (URLs ending with /number)
        $('a').each((i, el) => {
            if (totalItems + enqueued >= maxItems) return false;

            const href = $(el).attr('href') || '';
            const text = $(el).text().trim().replace(/\s+/g, ' ');

            // Detail pages match: /street-name/category/subcategory/business-name/ID
            if (!href.match(/\/\d{3,5}$/)) return;
            if (text.length < 4 || text.length > 120) return;

            // Filter noise
            if (NOISE.some(n => text.toLowerCase().includes(n))) return;

            // Get address context from parent
            const parent = $(el).closest('div, article, li, td');
            const parentText = parent.text().replace(text, '').replace(/\s+/g, ' ').trim();
            let address = '';
            const sgMatch = parentText.match(/([^.]{5,}Singapore\s*\d{6})/i);
            if (sgMatch) address = sgMatch[1].trim().slice(0, 200);
            if (!address) {
                const addrPart = parentText.match(/(\d+[^.]{5,}\d{6})/);
                if (addrPart) address = addrPart[1].trim().slice(0, 200);
            }

            const fullUrl = href.startsWith('http') ? href : `https://singapore-directory.com${href}`;

            crawler.addRequests([{
                url: fullUrl,
                userData: {
                    type: 'detail',
                    name: text,
                    address,
                    category: 'Healthcare',
                },
            }]);
            enqueued++;
        });

        log.info(`Enqueued ${enqueued} detail pages from ${request.url}`);

        // Also enqueue subcategory/pagination links
        if (totalItems + enqueued < maxItems) {
            await enqueueLinks({
                globs: [
                    'https://singapore-directory.com/doctors/**',
                    'https://singapore-directory.com/healthcare/**',
                ],
                exclude: ['**/user/**', '**/login**', '**/register**', '**/item/new**', '**/contact**'],
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
