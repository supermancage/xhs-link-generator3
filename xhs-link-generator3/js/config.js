/**
 * LinkGenConfig — 配置与常量模块
 * 导出全局 LinkGenConfig 对象
 */
(function (global) {
    "use strict";

    /** 链接前缀与公共参数配置 */
    var config = {
        dpPrefix: "tctclient://web/main?url=",
        ulPrefix: "https://m.17u.cn/app/links/web/main?url=",
        commonParams:
            "&btn_from=xhs&clickid=CLICK_ID&backXHS=XHS_BACK_URL&noteid=XHS_NOTE_ID&oaidmd5=OAID_MD5&caid=CAID&idfa=IDFA&ts=TS&creativeid=CREATIVITY_ID&unitid=UNIT_ID&campaignid=CAMPAIGN_ID&wakeRefid=",
        fallbackParams: "&wakeDM=xhs&wakeRefid=",
        trackBase:
            "https://appnew.ly.com/addap/attribution?aaid=53&os=__OS__&oaidmd5=__OAID_MD5__&caid=__CAID__&caidmd5=__CAID_MD5__&idfamd5=__IDFA__&imeimd5=__IMEI__&ts=__TS__&clickid=__CLICK_ID__&advertiserid=__ADVERTISER_ID__&creativeid=__CREATIVITY_ID__&unitid=__UNIT_ID__&campaignid=__CAMPAIGN_ID__&paid=__PAID__&keyword=__KEYWORD_ID__&noteid=__NOTE_ID__&refid="
    };

    /** 链接模板中的占位符映射 */
    var placeholderParams = {
        CLICK_ID: "__CLICK_ID__",
        XHS_BACK_URL: "__XHS_BACK_URL__",
        XHS_NOTE_ID: "__XHS_NOTE_ID__",
        OAID_MD5: "__OAID_MD5__",
        CAID: "__CAID__",
        IDFA: "__IDFA__",
        TS: "__TS__",
        CREATIVITY_ID: "__CREATIVITY_ID__",
        UNIT_ID: "__UNIT_ID__",
        CAMPAIGN_ID: "__CAMPAIGN_ID__"
    };

    /**
     * 将模板字符串中的占位符替换为实际值
     * @param {string} template - 含占位符的模板字符串
     * @returns {string} 替换后的字符串
     */
    function withPlaceholders(template) {
        return Object.keys(placeholderParams).reduce(function (result, key) {
            return result.replaceAll(key, placeholderParams[key]);
        }, template);
    }

    global.LinkGenConfig = {
        config: config,
        placeholderParams: placeholderParams,
        withPlaceholders: withPlaceholders
    };
})(window);
