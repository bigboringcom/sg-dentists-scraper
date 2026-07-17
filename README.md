# Singapore Dentists & Dental Clinics Scraper

Extract dental clinics, dental surgeons, orthodontists, and periodontists in Singapore. Get business name, phone number, address, website, categories, and branch count.

## What does this scraper do?

This Actor extracts Singapore-based dental professionals and clinics from local business directories. Perfect for:
- Dental marketing agencies building prospect lists
- Healthcare recruiters finding dental practices
- Market research on Singapore's dental industry
- Lead generation for dental supply companies

## Why scrape Singapore dentists?

Singapore has 1,200+ registered dental clinics. This data helps:
- Build targeted B2B outreach lists
- Analyze geographic distribution of dental services
- Find multi-branch dental chains for partnership opportunities
- Research competitive landscape for new clinic openings

## Input

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `maxItems` | Integer | Maximum number of dental clinics to extract | 100 |
| `maxRunTimeMinutes` | Integer | Auto-stop after N minutes | 5 |

## Output

```json
{
    "name": "Q&M Dental Group",
    "phone": "+65 6345 1234",
    "address": "Raffles Place, #01-01, 1 Raffles Place, 048616",
    "website": "https://www.qandm.com.sg",
    "categories": "Dental Surgeon, Orthodontist, Dental Clinic",
    "branches": 67,
    "sourceUrl": "https://www.streetdirectory.com/businessfinder/company/751/Dental_Surgeon/"
}
```

## Pricing

Pay Per Result at **$0.005 per dental clinic** extracted.

| Records | Cost |
|---------|------|
| 100 | $0.50 |
| 500 | $2.50 |
| 1,200 (all) | $6.00 |

## Data Sources

This actor scrapes publicly available business listings from Singapore local directories including StreetDirectory.com (138,000+ businesses, 3,500 categories).
