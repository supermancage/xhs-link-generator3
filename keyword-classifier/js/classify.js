// ═══════════════════════════════════════════════════
// 智词引擎 · 分类引擎 + 预编译正则 + Benchmark
// ═══════════════════════════════════════════════════

var KC = window.KC || {};

// ── 预编译正则引擎 ──
KC.RegexEngine = {};
(function(R) {
  // ═══════════════════════════════════════════════════
  // 性能优化：预编译正则引擎（工具函数）
  // ═══════════════════════════════════════════════════

  // 转义正则特殊字符
  function _escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // 预编译正则缓存（Key: 数组引用, Value: RegExp）
  const reCache = new Map();

  // 为词组构建预编译正则（按长度降序排列，确保长词优先匹配）
  function buildRe(group) {
  if (reCache.has(group)) return reCache.get(group);
  const sorted = [...group].sort((a, b) => b.length - a.length);
  const re = new RegExp(sorted.map(_escRe).join('|'));
  reCache.set(group, re);
  return re;
  }

  // 构建 matchAll 用全局正则（带 g 标志）
  function buildReG(group) {
  const key = group + '__g';
  if (reCache.has(key)) return reCache.get(key);
  const sorted = [...group].sort((a, b) => b.length - a.length);
  const re = new RegExp(sorted.map(_escRe).join('|'), 'g');
  reCache.set(key, re);
  return re;
  }
  R.escRe = _escRe;
  R.cache = reCache;
  R.buildRe = buildRe;
  R.buildReG = buildReG;

})(KC.RegexEngine);

// ── 分类核心引擎 ──
KC.Classifier = {};
(function(C, L1, L2, Ent, Re, Poi) {
  const buildRe = Re.buildRe;
  const buildReG = Re.buildReG;
  const reCache = Re.cache;

  // ═══════════════════════════════════════════════════
  // 分类函数
  // ═══════════════════════════════════════════════════

  function hasAny(kw, group) {
  // 预编译正则路径：O(kw长度) 代替 O(group长度 × kw长度)
  const re = reCache.get(group);
  if (re) return re.test(kw);
  // 小词组（<8词）直接遍历，避免正则编译开销
  if (group.length < 8) return group.some(w => kw.includes(w));
  // 未预编译的词组：构建并缓存
  return buildRe(group).test(kw);
  }

  function isInternational(kw) {
  // 排除连锁酒店品牌误判（维也纳/香格里拉等同时也是国际城市名）
  if (hasAny(kw, L1.HOTEL_CHAINS)) {
  const intlIntent = ['免签','出境','境外','国外','海外','国际航班'];
  if (!hasAny(kw, intlIntent)) return false;
  }
  // POI 缩写映射到国际城市（如"港迪"→香港）
  const reIntl = reCache.get(L1.INTERNATIONAL_KEYWORDS);
  const rePoi = reCache.get(Ent.POI_ABBR_KEYS);
  const poiIntl = rePoi.test(kw) && (() => {
  const m = kw.match(rePoi);
  return m && L1.INTERNATIONAL_KEYWORDS.includes(Ent.POI_ABBR_MAP[m[0]]);
  })();
  return reIntl.test(kw) || hasAny(kw, Ent.INTL_CITIES_JS) || poiIntl;
  }

  function hasCity(kw) {
  return hasAny(kw, L1.CITIES);
  }

  // POI 景点/地标名识别：关键词本身不含城市名，但通过 POI 缩写映射或 POI-城市映射能定位城市
  function hasPoiCity(kw) {
  if (_firstMatch(kw, _rePoiAbbrG, Ent.POI_ABBR_MAP)) return true;
  if (_firstMatch(kw, _rePoiCityG, Poi.POI_CITY_MAP_JS)) return true;
  return false;
  }

  // 泛意图词（非地名），不应被识别为"包含国际城市/地名"——已在 DictL1 中定义

  function hasIntlCity(kw) {
  // 只匹配真实地名：过滤掉泛意图词，避免"出国机票""国外买机票"误归目的地词
  // 用预编译正则替代 filter+some 链式遍历
  const reIntl = reCache.get(L1.INTERNATIONAL_KEYWORDS);
  const hasRealGeoWord = (() => {
  const reG = buildReG(L1.INTERNATIONAL_KEYWORDS);
  reG.lastIndex = 0;
  let m;
  while ((m = reG.exec(kw)) !== null) {
  const w = m[0];
  if (w.length >= 2 && !INTL_GENERIC_WORDS_SET.has(w)) return true;
  }
  return false;
  })();
  // POI 缩写映射（如"港迪"→香港）
  const hasPoiGeoWord = hasAny(kw, Ent.POI_ABBR_KEYS);
  return hasRealGeoWord || hasAny(kw, Ent.INTL_CITIES_JS) || hasPoiGeoWord;
  }

  const FLIGHT_ROUTE_RE = /(\S{2,6})(飞|到|→|－|-|—)(\S{2,6})机票|从(\S{2,6})到(\S{2,6}).*机票|(\S{2,6})到(\S{2,6}).*飞机|(\S{2,6})(飞|到)(\S{2,6})航班/;

  function isFlightRoute(kw) {
  return FLIGHT_ROUTE_RE.test(kw);
  }

  function hasScenicFeature(kw) {
  return hasAny(kw, L1.SCENIC_FEATURE_WORDS);
  }

  function _firstMatch(kw, reG, map) {
  reG.lastIndex = 0;
  const m = kw.match(reG);
  return m && map[m[0]] ? m[0] : null;
  }

  // 预编译 extractCity/extractCountry 用的全局正则
  const _reIntlCitiesG = buildReG(Ent.INTL_CITIES_JS);
  const _reCountryNamesG = buildReG(Ent.COUNTRY_NAMES_JS);
  const _reCitiesG = buildReG(L1.CITIES);
  const _rePoiAbbrG = buildReG(Ent.POI_ABBR_KEYS);
  const _poiCityKeys = Object.keys(Poi.POI_CITY_MAP_JS).sort((a, b) => b.length - a.length);
  const _rePoiCityG = buildReG(_poiCityKeys);
  const INTL_GENERIC_WORDS_SET = new Set(L1.INTL_GENERIC_WORDS);

  function extractCountry(kw, l1) {
  if (['国内酒店','国内机票','火车票'].includes(l1)) return '中国';
  // POI 缩写映射（如"港迪"→香港→中国），用映射值查找而非匹配键
  const poiAbbr = _firstMatch(kw, _rePoiAbbrG, Ent.POI_ABBR_MAP);
  if (poiAbbr) {
  const mappedCity = Ent.POI_ABBR_MAP[poiAbbr];
  if (Ent.COUNTRY_MAP_JS[mappedCity]) return Ent.COUNTRY_MAP_JS[mappedCity];
  if (Ent.INTL_CITY_COUNTRY_JS[mappedCity]) return Ent.INTL_CITY_COUNTRY_JS[mappedCity];
  }
  // 国际城市 → 国家
  const intlCity = _firstMatch(kw, _reIntlCitiesG, Ent.INTL_CITY_COUNTRY_JS);
  if (intlCity && Ent.INTL_CITY_COUNTRY_JS[intlCity]) return Ent.INTL_CITY_COUNTRY_JS[intlCity];
  // 国家名直接匹配
  const countryName = _firstMatch(kw, _reCountryNamesG, Ent.COUNTRY_MAP_JS);
  if (countryName) return Ent.COUNTRY_MAP_JS[countryName];
  // 景区兜底
  if (l1 === '景区') return '中国';
  return '';
  }

  function extractCity(kw, l1) {
  // 先通过 POI 缩写映射查找城市（如"港迪"→香港），返回映射值而非匹配键
  const poiAbbr = _firstMatch(kw, _rePoiAbbrG, Ent.POI_ABBR_MAP);
  if (poiAbbr) return Ent.POI_ABBR_MAP[poiAbbr];
  // 通过 POI-城市映射查找（如"鸟巢"→北京、"迪士尼"→上海）
  const poiMatch = _firstMatch(kw, _rePoiCityG, Poi.POI_CITY_MAP_JS);
  if (poiMatch) return Poi.POI_CITY_MAP_JS[poiMatch];

  if (['国际酒店','国际机票'].includes(l1)) {
  const intlCity = _firstMatch(kw, _reIntlCitiesG, Ent.INTL_CITY_COUNTRY_JS);
  if (intlCity) return intlCity;
  // 国家名不是城市，不再作为城市返回（国家信息由 extractCountry 处理）
  return '';
  }
  if (l1 === '景区') {
  const intlCity = _firstMatch(kw, _reIntlCitiesG, Ent.INTL_CITY_COUNTRY_JS);
  if (intlCity) return intlCity;
  const city = _firstMatch(kw, _reCitiesG, L1.CITIES.reduce((m, c) => { m[c] = c; return m; }, {}));
  if (city) return city;
  return '';
  }
  // 国内酒店/机票/火车票：双城市取目的地（出现位置靠后的）
  const found = [];
  _reCitiesG.lastIndex = 0;
  for (const m of kw.matchAll(_reCitiesG)) {
  found.push({ idx: m.index, city: m[0] });
  }
  if (found.length >= 2) {
  found.sort((a, b) => a.idx - b.idx);
  return found[found.length - 1].city;  // 目的地
  }
  if (found.length === 1) return found[0].city;
  
  return '';
  }

  function extractZone(city, l1) {
  if (!city) return '';
  // 国际业务线：港澳台城市查分区映射，其他国际城市不分区
  if (['国际酒店','国际机票'].includes(l1)) {
  if (['香港','澳门','台北','高雄','台南','台中','花莲','九份'].includes(city)) {
  return Ent.CITY_ZONE_JS[city] || '';
  }
  return '';
  }
  return Ent.CITY_ZONE_JS[city] || '';
  }

  function extractTier(city, l1) {
  if (!city) return '';
  // 国际业务线：港澳台城市查等级映射，其他国际城市不分级
  if (['国际酒店','国际机票'].includes(l1)) {
  if (['香港','澳门','台北','高雄','台南','台中','花莲','九份'].includes(city)) {
  return Ent.CITY_TIER_JS[city] || '';
  }
  return '';
  }
  return Ent.CITY_TIER_JS[city] || '';
  }

  function classify(kw) {
  kw = String(kw).trim();
  if (!kw) return { kw, l1: '', l2: '', country: '', city: '', zone: '', tier: '' };
  const isIntl = isInternational(kw);
  let l1, l2;

  // 规则0：公共业务线词（跨业务线产品/工具/平台词） → 公共
  if (hasAny(kw, L1.PUBLIC_KEYWORDS)) {
  l1 = '公共'; l2 = _l2_public(kw);
  }
  else if (hasAny(kw, L1.TRAIN_KEYWORDS) && hasAny(kw, L1.HOTEL_INTENT_IN_TRAIN)) {
  l1 = isIntl ? '国际酒店' : '国内酒店'; l2 = _l2_hotel(kw, isIntl);
  }
  // 规则2：场站词 + 酒店词 → 酒店
  else if (hasAny(kw, L1.STATION_KEYWORDS) && hasAny(kw, L1.HOTEL_KEYWORDS)) {
  l1 = isIntl ? '国际酒店' : '国内酒店'; l2 = _l2_hotel(kw, isIntl);
  }
  // 规则5b：连锁酒店品牌 → 国内酒店
  // （优先于机票/火车票规则，避免 如家会员 等被 FLIGHT_BUSINESS_TERMS 误归机票）
  // TODO(业务确认): 连锁品牌需结合 isIntl 判断国际酒店
  else if (hasAny(kw, L1.HOTEL_CHAINS)) {
  l1 = '国内酒店'; l2 = '连锁酒店词';
  }
  // 规则3：航班/机票/航司词/机票业务词 → 机票
  // 但如果同时包含火车票/酒店信号，优先归对应业务线
  else if (!hasAny(kw, L1.TRAIN_KEYWORDS) && !hasAny(kw, L1.HOTEL_KEYWORDS) && (hasAny(kw, L1.FLIGHT_KEYWORDS) || hasAny(kw, L1.AIRLINE_BRANDS) || hasAny(kw, L1.FLIGHT_BUSINESS_TERMS))) {
  l1 = isIntl ? '国际机票' : '国内机票'; l2 = _l2_flight(kw, isIntl);
  }
  // 规则4：火车票特征词 → 火车票
  else if (hasAny(kw, L1.TRAIN_KEYWORDS)) {
  l1 = '火车票'; l2 = _l2_train(kw);
  }
  // 规则5：酒店词 → 酒店
  else if (hasAny(kw, L1.HOTEL_KEYWORDS)) {
  l1 = isIntl ? '国际酒店' : '国内酒店'; l2 = _l2_hotel(kw, isIntl);
  }
  // 规则5c：娱乐演出词 → 娱乐演出（新一级业务线）
  else if (hasAny(kw, L1.ENTERTAINMENT_KEYWORDS)) {
  l1 = '娱乐演出'; l2 = '演出词';
  }
  // 规则5d：护照/签证类词 → 国际机票（出境准备词）
  else if (hasAny(kw, L1.PASSPORT_VISA_KEYWORDS)) {
  l1 = '国际机票'; l2 = '出境准备词';
  }
  // 规则6：景点特征词 → 景区
  else if (hasScenicFeature(kw)) {
  l1 = '景区'; l2 = _l2_scenic(kw);
  }
  // 规则8：同程/竞品品牌 → 根据上下文判断业务线（品牌词本身不决定业务线）
  // 注：品牌词应结合其他业务信号判断，不应直接归类为景区
  // 热门目的地/度假区名（阿那亚、金町湾等）→ 对应业务线
  else if (hasAny(kw, L1.DESTINATION_NAMES)) {
  l1 = isIntl ? '国际酒店' : '国内酒店'; l2 = isIntl ? '目的地词' : '城市酒店词';
  }
  // 泛旅游意图词（去哪玩、适合去哪旅游等）→ 酒店
  else if (hasAny(kw, L1.GENERIC_TRAVEL_INTENT)) {
  l1 = isIntl ? '国际酒店' : '国内酒店';
  if (isIntl) {
  l2 = _l2_hotel(kw, true);
  } else {
  l2 = '通用词';
  }
  }
  // 规则：POI 景点/地标名（能定位城市，且非场站/交通枢纽）→ 景区
  else if (hasPoiCity(kw) && !hasAny(kw, L1.STATION_KEYWORDS)) {
  l1 = '景区'; l2 = _l2_scenic(kw);
  }
  // 规则9：品牌词 + 业务信号 → 对应业务线
  else if (hasAny(kw, L1.TC_BRANDS) || hasAny(kw, L1.COMPETITOR_BRANDS)) {
  if (hasAny(kw, L1.HOTEL_KEYWORDS) || hasAny(kw, L1.HOTEL_CHAINS)) {
  l1 = isIntl ? '国际酒店' : '国内酒店'; l2 = hasAny(kw, L1.TC_BRANDS) ? '品牌词（同程）' : '竞品词';
  } else if (hasAny(kw, L1.FLIGHT_KEYWORDS) || hasAny(kw, L1.AIRLINE_BRANDS) || hasAny(kw, L1.FLIGHT_BUSINESS_TERMS)) {
  l1 = isIntl ? '国际机票' : '国内机票'; l2 = hasAny(kw, L1.TC_BRANDS) ? '品牌词（同程）' : '竞品词';
  } else if (hasAny(kw, L1.TRAIN_KEYWORDS)) {
  l1 = '火车票'; l2 = hasAny(kw, L1.TC_BRANDS) ? '品牌词（同程）' : '竞品词';
  } else if (hasScenicFeature(kw)) {
  l1 = '景区'; l2 = hasAny(kw, L1.TC_BRANDS) ? '品牌词（同程）' : '竞品词';
  } else {
  l1 = isIntl ? '国际酒店' : '国内酒店'; l2 = hasAny(kw, L1.TC_BRANDS) ? '品牌词（同程）' : '竞品词';
  }
  }
  // 规则10：待确认词优化
  else {
  // 包含住宿/旅游意图 → 酒店业务线，但词包走 _l2_hotel() 完整判断
  if (hasAny(kw, ['住','住宿','酒店','民宿','客栈','公寓','别墅','度假村','入住','退房','住哪','住店','过夜','住宿推荐','附近住宿','周边住宿']) ||
  hasAny(kw, ['旅游','旅行','度假','出游','游玩','攻略','行程','路线','导游','自由行','跟团','旅行社'])) {
  l1 = isIntl ? '国际酒店' : '国内酒店';
  // 国际酒店：走 _l2_hotel 完整分类，确保目的地词等词包正确识别
  if (isIntl) {
  l2 = _l2_hotel(kw, true);
  } else {
  l2 = _l2_hotel(kw, false);
  }
  }
  // 机票相关业务词 → 国内机票（已移至规则3，此处保留兜底）
  else if (hasAny(kw, L1.FLIGHT_BUSINESS_TERMS)) {
  l1 = '国内机票'; l2 = '通用词';
  }
  // 兜底——无核心业务信号则标待确认
  else {
  const hasCore = hasAny(kw, L2.ALL_CORE_SIGNALS) || hasCity(kw) || hasIntlCity(kw);
  if (!hasCore) {
  l1 = '待确认'; l2 = '通用词';
  } else {
  l1 = isIntl ? '国际酒店' : '国内酒店'; l2 = _l2_hotel(kw, isIntl);
  }
  }
  }

  const country = extractCountry(kw, l1);
  const city = extractCity(kw, l1);
  const zone = extractZone(city, l1);
  const tier = extractTier(city, l1);
  return { kw, l1, l2, country, city, zone, tier };
  }

  function _l2_hotel(kw, isIntl) {
  if (hasAny(kw, L1.TC_BRANDS)) return '品牌词（同程）';
  if (hasAny(kw, L1.COMPETITOR_BRANDS)) return '竞品词';
  if (isIntl) {
  if (hasAny(kw, L2.TRIP_CROWD)) return '人群场景词';
  if (hasAny(kw, L2.TRIP_MODE)) return '出行方式词';
  // 目的地识别前置：含真实地名 → 目的地词（避免被场景词/景点词中的泛词阻断）
  if (hasIntlCity(kw)) return '目的地词';
  if (hasAny(kw, L1.INTL_SCENE_WORDS)) return '场景词';
  if (hasAny(kw, L1.INTL_SCENIC_WORDS)) return '景点词';
  return '通用词';
  } else {
  if (hasAny(kw, L1.HOTEL_CHAINS)) return '连锁酒店词';
  if (hasAny(kw, L2.URGENT_NEED)) return '即时需求词';
  if (hasAny(kw, L2.PRICE_SENSITIVE)) return '价格敏感词';
  if (hasAny(kw, L2.PREMIUM_QUALITY)) return '品质高端词';
  if (hasAny(kw, L2.GEO_LOCATION)) return '地理位置词';
  if (hasAny(kw, L1.DESTINATION_NAMES)) return '城市酒店词';
  if (hasAny(kw, L1.FESTIVAL_KEYWORDS)) return '节点词';
  if (hasAny(kw, L2.TRAVEL_GUIDE)) return '长尾攻略词';
  if (hasAny(kw, L1.GENERIC_TRAVEL_INTENT)) return '通用词';
  if (hasCity(kw))
  return hasAny(kw, L1.HOTEL_KEYWORDS) ? '城市酒店词' : '城市攻略词';
  return '通用词';
  }
  }

  function _l2_flight(kw, isIntl) {
  if (hasAny(kw, L1.TC_BRANDS)) return '品牌词（同程）';
  if (hasAny(kw, L1.COMPETITOR_BRANDS)) return '竞品词';
  if (hasAny(kw, L1.FESTIVAL_KEYWORDS)) return '节点词';
  if (hasAny(kw, L2.URGENT_FLIGHT)) return '紧急出行词';
  if (hasAny(kw, L2.PRICE_COMPARE)) return '比价决策词';
  if (hasAny(kw, L2.CROWD_FLIGHT)) return '人群词';
  if (isFlightRoute(kw)) return '航段词';
  if (hasAny(kw, L1.FLIGHT_PRODUCTS)) return '产品词';
  if (hasAny(kw, L1.AIRLINE_BRANDS)) return '航司词';
  if (hasAny(kw, L1.FLIGHT_SCENARIOS)) return '业务场景词';
  if (hasAny(kw, L2.QUERY_NAV)) return '查询导航词';
  if (hasAny(kw, L1.FLIGHT_BUSINESS_TERMS)) return '业务费用词';
  // 国际机票：只有包含具体城市/国家才归为目的地词，否则为通用词
  if (isIntl) {
  if (hasIntlCity(kw)) return '目的地词';
  return '通用词';
  }
  if (hasCity(kw)) return '目的地词';
  return '通用词';
  }

  function _l2_train(kw) {
  if (hasAny(kw, L1.TC_BRANDS)) return '品牌词（同程）';
  if (hasAny(kw, L1.COMPETITOR_BRANDS)) return '竞品词';
  if (hasAny(kw, L1.FESTIVAL_KEYWORDS)) return '节点词';
  if (hasAny(kw, L2.TRAIN_GRAB)) return '抢票候补词';
  if (hasAny(kw, L2.TRAIN_COMMUTE)) return '通勤词';
  if (hasAny(kw, L2.TRAIN_TRAVEL)) return '旅游出行词';
  if (hasAny(kw, L1.PLATFORM_12306)) return '平台词';
  if (hasAny(kw, L1.STATION_KEYWORDS)) return '场站词';
  return '通用词';
  }

  function _l2_scenic(kw) {
  if (hasAny(kw, L1.TC_BRANDS)) return '品牌词（同程）';
  if (hasAny(kw, L1.COMPETITOR_BRANDS)) return '竞品词';
  if (hasAny(kw, L1.FESTIVAL_KEYWORDS)) return '节点词';
  if (hasAny(kw, L2.SCENIC_TICKET)) return '票务意图词';
  if (hasAny(kw, L2.SCENIC_REVIEW)) return '评价攻略词';
  if (hasAny(kw, L2.SCENIC_THEME_PARK)) return '主题乐园';
  if (hasAny(kw, L2.SCENIC_NATURE)) return '自然风光';
  if (hasAny(kw, L2.SCENIC_CULTURE)) return '人文历史';
  return '景点词';
  }

  function _l2_public(kw) {
  if (hasAny(kw, L1.TC_BRANDS)) return '品牌词（同程）';
  if (hasAny(kw, L1.COMPETITOR_BRANDS)) return '竞品词';
  return '通用词';
  }

  // ── 公共 API ──
  C.classify = classify;
  C.hasAny = hasAny;
  C.isInternational = isInternational;
  C.hasCity = hasCity;
  C.hasIntlCity = hasIntlCity;
  C.extractCountry = extractCountry;
  C.extractCity = extractCity;
  C.extractZone = extractZone;
  C.extractTier = extractTier;
})(KC.Classifier, KC.DictL1, KC.DictL2, KC.DictEntity, KC.RegexEngine, KC.PoiCityMap);

// ── 预编译所有词组正则（必须在所有词库定义之后执行） ──
(function(Re, L1, L2, Ent) {
  const buildRe = Re.buildRe;
  const buildReG = Re.buildReG;

  [
  L1.TC_BRANDS, L1.COMPETITOR_BRANDS, L1.HOTEL_CHAINS, L1.AIRLINE_BRANDS,
  L1.FLIGHT_PRODUCTS, L1.FLIGHT_SCENARIOS, L1.STATION_KEYWORDS, L1.HOTEL_KEYWORDS,
  L1.FLIGHT_KEYWORDS, L1.FLIGHT_BUSINESS_TERMS, L1.TRAIN_KEYWORDS, L1.SCENIC_FEATURE_WORDS,
  L1.FESTIVAL_KEYWORDS, L1.HOTEL_INTENT_IN_TRAIN, L1.INTL_SCENE_WORDS,
  L1.INTL_SCENIC_WORDS, L1.DESTINATION_NAMES, L1.GENERIC_TRAVEL_INTENT,
  L1.PUBLIC_KEYWORDS, L1.ENTERTAINMENT_KEYWORDS, L1.PASSPORT_VISA_KEYWORDS,
  L1.INTERNATIONAL_KEYWORDS, Ent.INTL_CITIES_JS, L1.CITIES,
  L2.PRICE_SENSITIVE, L2.PREMIUM_QUALITY, L2.GEO_LOCATION, L2.URGENT_NEED, L2.TRAVEL_GUIDE,
  L2.ALL_CORE_SIGNALS, L2.PRICE_COMPARE, L2.QUERY_NAV, L2.URGENT_FLIGHT, L2.CROWD_FLIGHT,
  L2.TRIP_CROWD, L2.TRIP_MODE, L2.SCENIC_THEME_PARK, L2.SCENIC_NATURE, L2.SCENIC_CULTURE,
  L2.SCENIC_TICKET, L2.SCENIC_REVIEW, L2.TRAIN_GRAB, L2.TRAIN_COMMUTE, L2.TRAIN_TRAVEL,
  Ent.POI_ABBR_KEYS, Ent.COUNTRY_NAMES_JS
  ].forEach(g => { buildRe(g); buildReG(g); });

})(KC.RegexEngine, KC.DictL1, KC.DictL2, KC.DictEntity);

// ── 性能基准测试 ──
KC.runBenchmark = function() {
  const testKws = [
  '北京酒店','三亚民宿','上海迪士尼酒店','东京机票','普吉岛度假村',
  '广州到北京机票','高铁抢票','九寨沟门票','曼谷酒店','港迪亲子游',
  '成都到重庆火车票','马尔代夫自由行','张家界民宿','长隆欢乐世界门票',
  '西安钟楼附近酒店','首尔免税店购物','丽江古城客栈','黄山风景区门票',
  '巴厘岛蜜月旅行','深圳机场附近住宿','乌鲁木齐到成都机票','鼓浪屿门票',
  '西湖周边酒店','迪士尼亲子房','香格里拉酒店','维也纳国际酒店',
  '峨眉山金顶','西安回民街美食','北京环球影城','青岛海边民宿',
  '西双版纳度假酒店','三亚湾海景房','大连到上海机票','桂林阳朔西街',
  '如家商旅酒店','长白山天池','大理洱海边民宿','武汉到广州高铁',
  '澳门塔门票','澳门巴黎人酒店','厦门鼓浪屿民宿','重庆洪崖洞',
  ];
  const N = 1000;  // 每个关键词重复1000次
  const batch = [];
  for (let i = 0; i < N; i++) batch.push(...testKws);
  console.log(`📊 基准测试：${batch.length} 条关键词 × KC.Classifier.classify()`);
  
  const t0 = performance.now();
  for (const kw of batch) KC.Classifier.classify(kw);
  const t1 = performance.now();
  const totalMs = (t1 - t0).toFixed(1);
  const perKw = ((t1 - t0) / batch.length * 1000).toFixed(2);
  console.log(`✅ 完成：${batch.length} 条耗时 ${totalMs}ms，平均 ${perKw}μs/条`);
  console.log(`📈 吞吐量：${(batch.length / (t1 - t0) * 1000).toFixed(0)} 条/秒`);
  return { total: totalMs + 'ms', perKw: perKw + 'μs', throughput: (batch.length / (t1 - t0) * 1000).toFixed(0) + ' 条/秒' };
};
