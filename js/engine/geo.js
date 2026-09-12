/* engine/geo.js —— 新闻地理编码：标题关键词 → ISO2 国家 + 代表坐标
   纯查表，无 NER 依赖（规则优先原则）。词表是 engine 内独立维护的契约数据，
   与采集脚本 _scripts/collect-events.mjs 的 PLACES 职责不同（那边是采集端
   正则流水线，这边是引擎的结构化编码），词表内容允许重叠。 */

const Geo = (() => {
  /* [正则, ISO2, 国家中文名, lat, lng]  顺序=优先级（具体地名在前；中英文同条规则） */
  const COUNTRY_RULES = [
    [/日本|东京|大阪|日銀|日本央行|日元|日经|japan|tokyo|osaka|\bbank of japan\b|\bboj\b|yen|nikkei/i, 'JP', '日本', 35.68, 139.69],
    [/韩国|首尔|韩元|KOSPI|south korea|seoul|won\b|kospi/i, 'KR', '韩国', 37.57, 126.98],
    [/朝鲜|平壤|north korea|pyongyang/i, 'KP', '朝鲜', 39.03, 125.75],
    [/印度(?!尼西亚)|新德里|孟买|卢比|印度央行|NIFTY|india(?!nesia)|delhi|mumbai|rupee|nifty/i, 'IN', '印度', 28.61, 77.21],
    [/印度尼西亚|雅加达|印尼|indonesia|jakarta/i, 'ID', '印度尼西亚', -6.21, 106.85],
    [/中国大陆|中国|北京|上海|深圳|人民币|中国人民银行|A股|证监会|国家统计局|国务院|沪深|china|beijing|shanghai|shenzhen|yuan\b|renminbi|PBOC/i, 'CN', '中国', 39.90, 116.41],
    [/香港|港币|恒生|hong kong|hkd|hang seng/i, 'HK', '香港', 22.32, 114.17],
    [/台湾|台北|新台币|台积电|taiwan|taipei|tsmc/i, 'TW', '台湾', 25.03, 121.57],
    [/乌克兰|基辅|俄乌|ukraine|kyiv/i, 'UA', '乌克兰', 50.45, 30.52],
    [/俄罗斯|莫斯科|卢布|普京|russia|moscow|rouble|putin/i, 'RU', '俄罗斯', 55.76, 37.62],
    [/德国|柏林|法兰克福|DAX|德国央行|germany|berlin|frankfurt|bundesbank/i, 'DE', '德国', 50.11, 8.68],
    [/法国|巴黎|CAC|france|paris/i, 'FR', '法国', 48.86, 2.35],
    [/英国|伦敦|英格兰银行|英镑|富时|\bUK\b|britain|london|sterling|ftse|pound/i, 'GB', '英国', 51.51, -0.13],
    [/意大利|罗马|米兰|italy|rome|milan/i, 'IT', '意大利', 41.90, 12.50],
    [/西班牙|马德里|spain|madrid/i, 'ES', '西班牙', 40.42, -3.70],
    [/瑞士|苏黎世|瑞士央行|瑞郎|switzerland|zurich|franc/i, 'CH', '瑞士', 46.95, 7.45],
    [/荷兰|阿姆斯特丹|netherlands|amsterdam/i, 'NL', '荷兰', 52.37, 4.90],
    [/土耳其|里拉|伊斯坦布尔|turkey|lira|istanbul/i, 'TR', '土耳其', 39.93, 32.86],
    [/以色列|特拉维夫|谢克尔|内塔尼亚胡|israel|tel aviv|shekel|netanyahu/i, 'IL', '以色列', 32.08, 34.78],
    [/加沙|约旦河西岸|gaza|west bank/i, 'PS', '巴勒斯坦', 31.50, 34.47],
    [/伊朗|德黑兰|里亚尔|iran|tehran|rial/i, 'IR', '伊朗', 35.69, 51.39],
    [/伊拉克|巴格达|iraq|baghdad/i, 'IQ', '伊拉克', 33.31, 44.36],
    [/沙特|利雅得|saudi|riyadh/i, 'SA', '沙特', 24.71, 46.68],
    [/阿联酋|迪拜|阿布扎比|\bUAE\b|dubai|abu dhabi/i, 'AE', '阿联酋', 24.47, 54.37],
    [/卡塔尔|多哈|qatar|doha/i, 'QA', '卡塔尔', 25.29, 51.53],
    [/埃及|开罗|egypt|cairo/i, 'EG', '埃及', 30.04, 31.24],
    [/南非|约翰内斯堡|兰特|south africa|johannesburg|rand\b/i, 'ZA', '南非', -26.20, 28.05],
    [/尼日利亚|拉各斯|nigeria|lagos/i, 'NG', '尼日利亚', 6.52, 3.38],
    [/巴西|圣保罗|雷亚尔|巴西利亚|brazil|sao paulo|real\b/i, 'BR', '巴西', -15.79, -47.88],
    [/阿根廷|布宜诺斯艾利斯|比索|argentina/i, 'AR', '阿根廷', -34.60, -58.38],
    [/墨西哥|比索|mexico|peso/i, 'MX', '墨西哥', 19.43, -99.13],
    [/加拿大|渥太华|加元|多伦多|canada|ottawa|toronto|loonie/i, 'CA', '加拿大', 45.42, -75.70],
    [/澳大利亚|悉尼|澳元|澳洲联储|australia|sydney|aussie|RBA/i, 'AU', '澳大利亚', -35.28, 149.13],
    [/新西兰|惠灵顿|纽元|new zealand|wellington/i, 'NZ', '新西兰', -41.29, 174.78],
    [/新加坡|海峡时报|singapore/i, 'SG', '新加坡', 1.35, 103.82],
    [/泰国|曼谷|泰铢|thailand|baht/i, 'TH', '泰国', 13.76, 100.50],
    [/越南|河内|越南盾|vietnam|dong\b/i, 'VN', '越南', 21.03, 105.85],
    [/菲律宾|马尼拉|比索|philippines|peso/i, 'PH', '菲律宾', 14.60, 120.98],
    [/马来西亚|吉隆坡|林吉特|malaysia|ringgit/i, 'MY', '马来西亚', 3.14, 101.69],
    [/巴基斯坦|卡拉奇|卢比|pakistan|karachi/i, 'PK', '巴基斯坦', 33.69, 73.05],
    [/波兰|华沙|兹罗提|poland|warsaw|zloty/i, 'PL', '波兰', 52.23, 21.01],
    [/瑞典|斯德哥尔摩|克朗|sweden|stockholm|krona/i, 'SE', '瑞典', 59.33, 18.07],
    [/挪威|奥斯陆|克朗|norway|oslo/i, 'NO', '挪威', 59.91, 10.75],
    [/美国|华盛顿|白宫|美联储|纽约|华尔街|美元|纳斯达克|标普|道琼斯|\bUS\b|\bUSA\b|united states|washington|white house|federal reserve|fed\b|wall street|dollar|nasdaq|\bs&p\b|dow/i, 'US', '美国', 38.90, -77.04],
    [/欧元区|欧盟|欧洲央行|欧央行|布鲁塞尔|eurozone|euro area|\bEU\b|european union|\bECB\b|brussels/i, 'EU', '欧元区', 50.11, 8.68],
    [/联合国|安理会|united nations|security council/i, 'UN', '联合国', 40.75, -73.97],
  ];

  /**
   * 标题 → 地理归属
   * @param {string} title
   * @returns {{country:string, name:string, lat:number, lng:number}|null}
   */
  function resolveCountry(title) {
    const t = String(title || '');
    for (const [re, iso2, name, lat, lng] of COUNTRY_RULES) {
      if (re.test(t)) return { country: iso2, name, lat, lng };
    }
    return null;
  }

  /** ISO2 → 中文名（timeline/详情用） */
  const ISO2_NAME = (() => {
    const m = {};
    for (const [, iso2, name] of COUNTRY_RULES) m[iso2] = name;
    return m;
  })();

  return { resolveCountry, ISO2_NAME };
})();

if (typeof window !== 'undefined') window.EngineGeo = Geo;
if (typeof module !== 'undefined' && module.exports) module.exports = Geo;
