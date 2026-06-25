// filters.js — Job filtering and deduplication

const VALID_TITLE_KEYWORDS = [
  'product analyst', 'data analyst', 'business analyst', 'product manager',
  'growth analyst', 'analytics engineer', 'wfm analyst', 'workforce management',
  'resource planning analyst', 'business intelligence', 'bi analyst',
  'decision scientist', 'product operations', 'product data analyst',
  'consumer insights', 'customer analytics', 'quantitative analyst',
  'product insights', 'product intelligence', 'product metrics',
  'product performance', 'digital product analyst', 'user analytics',
  'product analytics', 'associate product manager', 'assistant product manager',
  'apm', 'data steward analyst'
];

const VALID_LOCATIONS = [
  'ahmedabad', 'surat', 'vadodara', 'rajkot', 'gandhinagar', 'baroda',
  'mumbai', 'pune', 'delhi', 'new delhi', 'noida', 'gurugram', 'gurgaon',
  'bangalore', 'bengaluru', 'hyderabad', 'jaipur', 'indore', 'faridabad',
  'remote', 'work from home', 'wfh', 'pan india', 'india', 'anywhere in india',
  'chennai', 'kolkata', 'chandigarh', 'bhopal', 'lucknow', 'kochi', 'thrissur',
  'coimbatore', 'nagpur', 'patna', 'agra', 'thane', 'navi mumbai',
  'pimpri', 'malad', 'worli', 'mohali', 'budaun', 'hybrid', 'kolkata'
];

const EXCLUDED_LOCATIONS = [
  'usa', 'united states', 'uk', 'united kingdom', 'canada', 'australia',
  'singapore', 'dubai', 'uae', 'germany', 'france', 'netherlands',
  'london', 'new york', 'toronto', 'sydney', 'berlin', 'amsterdam',
  'qatar', 'saudi arabia', 'bahrain', 'oman', 'kuwait', 'malaysia'
];

const MAX_EXP_YEARS = 3;
const MAX_DAYS_OLD = 60; // Include up to 60 days; post-filter by user preference

function isTitleValid(title) {
  if (!title) return false;
  const t = title.toLowerCase();
  return VALID_TITLE_KEYWORDS.some(kw => t.includes(kw));
}

function isLocationValid(loc) {
  if (!loc || loc === 'Not mentioned') return true; // Don't reject unknowns
  const l = loc.toLowerCase();

  // Check exclusions first
  for (const excl of EXCLUDED_LOCATIONS) {
    if (l.includes(excl)) return false;
  }

  // Check if it contains a valid India location
  for (const valid of VALID_LOCATIONS) {
    if (l.includes(valid)) return true;
  }

  // If no match, still include (might be a lesser-known Indian city)
  return true;
}

function isExperienceValid(exp) {
  if (!exp || exp === 'Not mentioned' || exp === '0 Yrs') return true;
  const s = exp.toLowerCase();

  if (s.includes('fresher') || s.includes('entry') || s.includes('intern')) return true;

  // Range like "0-3 Yrs" or "2-5 Yrs"
  const rangeMatch = s.match(/(\d+)\s*[-–to\s]+\s*(\d+)/);
  if (rangeMatch) {
    const minExp = parseInt(rangeMatch[1]);
    return minExp <= MAX_EXP_YEARS;
  }

  // Single value like "3 Yrs"
  const singleMatch = s.match(/^(\d+)/);
  if (singleMatch) {
    return parseInt(singleMatch[1]) <= MAX_EXP_YEARS;
  }

  return true;
}

function isDateValid(dateStr) {
  if (!dateStr || dateStr === 'Not mentioned') return true;
  const s = dateStr.toLowerCase();

  // Reject very old postings
  if (s.includes('month') || s.includes('30+ day')) return false;
  if (s.match(/(\d+)\s*week/) && parseInt(s.match(/(\d+)\s*week/)[1]) > 4) return false;

  return true;
}

function matchJobTitle(jobTitle, selectedRole) {
  if (!selectedRole) return true;
  const title = (jobTitle || '').toLowerCase();
  const role = selectedRole.toLowerCase();

  if (title.includes(role)) return true;

  switch (role) {
    case 'software engineer': {
      const positive = ['software', 'sde', 'developer', 'programmer', 'frontend', 'backend', 'full stack', 'fullstack', 'ios', 'android', 'java', 'python', 'c++', 'golang', 'net', 'node', 'react', 'app engineer', 'application engineer', 'web engineer', 'mtech fresher'];
      const negative = ['data', 'ml', 'machine learning', 'ai', 'cloud', 'devops', 'sre', 'security', 'cyber', 'qa', 'test', 'civil', 'mechanical', 'electrical', 'network', 'system admin', 'support', 'analytics'];
      
      let hasPos = positive.some(p => title.includes(p));
      if (title.includes('engineer') && !hasPos) {
        hasPos = true;
      }
      if (!hasPos) return false;
      return !negative.some(n => title.includes(n));
    }
    case 'full stack developer': {
      const positive = ['full stack', 'fullstack', 'mern', 'mean', 'full-stack'];
      return positive.some(p => title.includes(p));
    }
    case 'data scientist': {
      const positive = ['data scientist', 'data science', 'machine learning scientist', 'ai scientist', 'applied scientist'];
      return positive.some(p => title.includes(p));
    }
    case 'data analyst': {
      const positive = ['data analyst', 'data analytics', 'analytics analyst', 'decision scientist', 'product analyst', 'growth analyst', 'operations analyst', 'business intelligence analyst'];
      return positive.some(p => title.includes(p));
    }
    case 'bi analyst': {
      const positive = ['bi analyst', 'business intelligence', 'power bi', 'tableau', 'looker', 'qlik', 'bi engineer'];
      return positive.some(p => title.includes(p));
    }
    case 'machine learning engineer': {
      const positive = ['machine learning', 'ml engineer', 'ml developer', 'computer vision', 'nlp', 'ai engineer', 'deep learning', 'artificial intelligence engineer', 'mlops'];
      return positive.some(p => title.includes(p));
    }
    case 'data engineer': {
      const positive = ['data engineer', 'etl', 'big data', 'data pipeline', 'spark', 'hadoop', 'data warehouse'];
      return positive.some(p => title.includes(p));
    }
    case 'cloud engineer': {
      const positive = ['cloud engineer', 'aws engineer', 'azure engineer', 'gcp engineer', 'cloud architect', 'cloud developer', 'cloud platform'];
      return positive.some(p => title.includes(p));
    }
    case 'devops engineer': {
      const positive = ['devops', 'site reliability', 'sre', 'platform engineer', 'ci/cd', 'release engineer', 'systems engineer'];
      return positive.some(p => title.includes(p));
    }
    case 'cybersecurity analyst': {
      const positive = ['cybersecurity', 'cyber security', 'information security', 'security analyst', 'soc analyst', 'pentester', 'ethical hacker', 'security engineer', 'secops'];
      return positive.some(p => title.includes(p));
    }
    case 'marketing analyst': {
      const positive = ['marketing analyst', 'digital marketing', 'seo analyst', 'sem analyst', 'growth marketing', 'marketing coordinator'];
      return positive.some(p => title.includes(p));
    }
    case 'bda': {
      const positive = ['bda', 'business development', 'inside sales', 'sales development', 'sdr', 'bde', 'client relation', 'sales associate'];
      return positive.some(p => title.includes(p));
    }
    case 'human resources officer': {
      const positive = ['human resources', 'hr ', ' recruiter', 'talent acquisition', 'hr officer', 'hr generalist', 'hr executive', 'people operations'];
      return positive.some(p => title.includes(p));
    }
    case 'sales representative': {
      const positive = ['sales', 'account executive', 'business development', 'sales rep', 'sales executive', 'sales agent'];
      return positive.some(p => title.includes(p));
    }
    case 'business analyst': {
      const positive = ['business analyst', 'ba ', 'business analysis', 'functional analyst', 'system analyst', 'systems analyst', 'product analyst'];
      return positive.some(p => title.includes(p));
    }
    default:
      return title.includes(role);
  }
}

function applyFilters(jobs, selectedTitle, selectedLocation, selectedExperience) {
  const seenKeys = new Set();
  const filtered = [];

  for (const job of jobs) {
    if (!job) continue;

    // 1. Job Title Match
    if (selectedTitle) {
      if (!matchJobTitle(job.jobTitle, selectedTitle)) continue;
    } else {
      if (!isTitleValid(job.jobTitle)) continue;
    }

    // 2. Location Match
    if (selectedLocation) {
      const loc = (job.location || '').toLowerCase();
      const selLoc = selectedLocation.toLowerCase();
      if (selLoc === 'bengaluru') {
        if (!loc.includes('bengaluru') && !loc.includes('bangalore')) continue;
      } else {
        if (!loc.includes(selLoc)) continue;
      }
    } else {
      if (!isLocationValid(job.location)) continue;
    }

    // 3. Experience Match
    if (selectedExperience) {
      const expStr = (job.experience || '').toLowerCase();
      let matchExp = true;
      const parts = selectedExperience.split('-');
      if (parts.length === 2) {
        const selMin = parseInt(parts[0], 10);
        const selMax = parseInt(parts[1], 10);

        if (expStr && expStr !== 'not mentioned') {
          let jobMin = 0;
          let jobMax = 0;

          if (expStr.includes('fresher') || expStr.includes('entry') || expStr.includes('intern')) {
            jobMin = 0;
            jobMax = 0;
          } else {
            const rangeMatch = expStr.match(/(\d+)\s*[-–to\s]+\s*(\d+)/);
            if (rangeMatch) {
              jobMin = parseInt(rangeMatch[1], 10);
              jobMax = parseInt(rangeMatch[2], 10);
            } else {
              const singleMatch = expStr.match(/^(\d+)/);
              if (singleMatch) {
                jobMin = parseInt(singleMatch[1], 10);
                jobMax = jobMin;
              }
            }
          }

          if (!(jobMin <= selMax && jobMax >= selMin)) {
            matchExp = false;
          }
        }
      }
      if (!matchExp) continue;
    } else {
      if (!isExperienceValid(job.experience)) continue;
    }

    // 4. Date filter
    if (!isDateValid(job.datePosted)) continue;

    // 5. Deduplication
    const key = `${(job.jobTitle || '').toLowerCase().trim()}|${(job.companyName || '').toLowerCase().trim()}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    filtered.push(job);
  }

  return filtered;
}

// Get today's date string
function getTodayDate() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

module.exports = { applyFilters, isTitleValid, isLocationValid, isExperienceValid, getTodayDate };
