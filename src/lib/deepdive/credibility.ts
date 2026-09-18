// Static domain classification maps
const TLD_SCORES: Record<string, { score: number; type: string }> = {
  '.gov': { score: 0.9, type: 'government' },
  '.gov.uk': { score: 0.9, type: 'government' },
  '.gov.au': { score: 0.9, type: 'government' },
  '.edu': { score: 0.85, type: 'academic' },
  '.ac.uk': { score: 0.85, type: 'academic' },
  '.edu.au': { score: 0.85, type: 'academic' },
};

const DOMAIN_SCORES: Record<string, { score: number; type: string }> = {
  // Major news
  'reuters.com': { score: 0.85, type: 'major_news' },
  'apnews.com': { score: 0.85, type: 'major_news' },
  'bbc.co.uk': { score: 0.8, type: 'major_news' },
  'bbc.com': { score: 0.8, type: 'major_news' },
  'nytimes.com': { score: 0.8, type: 'major_news' },
  'theguardian.com': { score: 0.75, type: 'major_news' },
  'washingtonpost.com': { score: 0.75, type: 'major_news' },
  'ft.com': { score: 0.8, type: 'major_news' },
  'economist.com': { score: 0.8, type: 'major_news' },
  'bloomberg.com': { score: 0.8, type: 'major_news' },
  'aljazeera.com': { score: 0.75, type: 'major_news' },

  // Academic publishers
  'nature.com': { score: 0.9, type: 'academic' },
  'science.org': { score: 0.9, type: 'academic' },
  'sciencedirect.com': { score: 0.85, type: 'academic' },
  'springer.com': { score: 0.85, type: 'academic' },
  'pubmed.ncbi.nlm.nih.gov': { score: 0.9, type: 'academic' },
  'scholar.google.com': { score: 0.8, type: 'academic' },
  'arxiv.org': { score: 0.8, type: 'academic' },
  'jstor.org': { score: 0.85, type: 'academic' },
  'researchgate.net': { score: 0.7, type: 'academic' },

  // Wiki
  'en.wikipedia.org': { score: 0.6, type: 'wiki' },
  'wikipedia.org': { score: 0.6, type: 'wiki' },

  // Social media
  'twitter.com': { score: 0.3, type: 'social' },
  'x.com': { score: 0.3, type: 'social' },
  'reddit.com': { score: 0.35, type: 'social' },
  'facebook.com': { score: 0.25, type: 'social' },
  'instagram.com': { score: 0.25, type: 'social' },
  'tiktok.com': { score: 0.2, type: 'social' },
  'youtube.com': { score: 0.4, type: 'social' },
  'linkedin.com': { score: 0.5, type: 'social' },

  // Blogs / content platforms
  'medium.com': { score: 0.4, type: 'blog' },
  'substack.com': { score: 0.45, type: 'blog' },
  'wordpress.com': { score: 0.35, type: 'blog' },
  'blogspot.com': { score: 0.3, type: 'blog' },
};

export function classifyDomain(domain: string): { score: number; type: string } {
  const lower = domain.toLowerCase();

  // Check exact domain match first
  if (DOMAIN_SCORES[lower]) return DOMAIN_SCORES[lower];

  // Check parent domains (e.g. news.bbc.co.uk → bbc.co.uk)
  const parts = lower.split('.');
  for (let i = 1; i < parts.length; i++) {
    const parent = parts.slice(i).join('.');
    if (DOMAIN_SCORES[parent]) return DOMAIN_SCORES[parent];
  }

  // Check TLD patterns
  for (const [tld, result] of Object.entries(TLD_SCORES)) {
    if (lower.endsWith(tld)) return result;
  }

  // Default: moderate score, classify as 'other'
  // News-like domains get a slight bump
  if (lower.includes('news') || lower.includes('journal') || lower.includes('times') || lower.includes('post')) {
    return { score: 0.55, type: 'news' };
  }

  return { score: 0.5, type: 'other' };
}

