const filters = require('./filters')

const LIST = [
  '[Adblock Plus 2.0]',
  '! Comentario',
  '||doubleclick.net^',
  '||googlesyndication.com^',
  '@@||example.com/exempt^',
  '||example.com/ads/banner.js',
  '@@||example.com/ads/important.js',
  '/banner_[0-9]+\\.gif/',
  '||analytics.google.com^$script,third-party',
  '||tracker.local^$script,domain=example.com',
  '||sponsored.frame^$subdocument',
  '##.ad-banner',
  '##[data-ad-slot]',
  'example.com##.inline-ad',
  '#@#.ad-banner',
].join('\n')

filters.parseList(LIST)
filters.activate()

function expect(desc, actual, wanted) {
  const ok = actual === wanted
  if (!ok) console.log('FAIL:', desc, 'got', actual, 'wanted', wanted)
  return ok
}

const checks = [
  ['host rule', filters.matches('https://www.doubleclick.net/pagead', 'script', 'news.com'), true],
  ['host rule subdomain', filters.matches('https://ad.googlesyndication.com/ads', 'image', 'news.com'), true],
  ['host rule main_frame', filters.matches('https://doubleclick.net/', 'main_frame', 'doubleclick.net'), true],
  ['exception allows', filters.matches('https://example.com/exempt/x.js', 'script', 'example.com'), false],
  ['hostPath block', filters.matches('https://cdn.example.com/ads/banner.js', 'script', 'example.com'), true],
  ['hostPath exception', filters.matches('https://cdn.example.com/ads/important.js', 'script', 'example.com'), false],
  ['regex block', filters.matches('https://cdn.example.com/x/banner_42.gif', 'image', 'example.com'), true],
  ['type+party block', filters.matches('https://analytics.google.com/collect', 'script', 'news.com'), true],
  ['type-only xhr not blocked', filters.matches('https://analytics.google.com/collect', 'xhr', 'news.com'), false],
  ['first-party not blocked', filters.matches('https://analytics.google.com/collect', 'script', 'analytics.google.com'), false],
  ['domain= match', filters.matches('https://tracker.local/t.js', 'script', 'example.com'), true],
  ['domain= mismatch', filters.matches('https://tracker.local/t.js', 'script', 'other.com'), false],
  ['subdocument block', filters.matches('https://sponsored.frame/ad', 'sub_frame', 'news.com'), true],
  ['other type not blocked', filters.matches('https://sponsored.frame/ad', 'image', 'news.com'), false],
]

let allOk = true
for (const [desc, got, want] of checks) {
  if (!expect(desc, got, want)) allOk = false
}

const cos = filters.cosmeticFor('www.example.com')
const cosGen = filters.cosmeticFor('news.com')
if (!cos.includes('.inline-ad')) { console.log('FAIL: cosmetic per-host'); allOk = false }
if (cos.includes('.ad-banner')) { console.log('FAIL: cosmetic global exception deberia quitar .ad-banner'); allOk = false }
if (!cosGen.includes('[data-ad-slot]')) { console.log('FAIL: cosmetic general attr'); allOk = false }
if (cosGen.includes('.ad-banner')) { console.log('FAIL: cosmetic exception global'); allOk = false }

console.log('FILTER_STATS:', JSON.stringify(filters.stats()))
console.log('RESULT:', allOk ? 'FILTERS_OK' : 'FILTERS_FAIL')
process.exit(allOk ? 0 : 1)
