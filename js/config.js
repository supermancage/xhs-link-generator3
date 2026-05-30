/**
 * LinkGenConfig \u2014 \u914d\u7f6e\u4e0e\u5e38\u91cf\u6a21\u5757
 * \u5bfc\u51fa\u5168\u5c40 LinkGenConfig \u5bf9\u8c61
 */
(function (global) {
    "use strict";

    /** \u94fe\u63a5\u524d\u7f00\u4e0e\u516c\u5171\u53c2\u6570\u914d\u7f6e */
    var config = {
        dpPrefix: "tctclient://web/main?url=",
        ulPrefix: "https://m.17u.cn/app/links/web/main?url=",
        commonParams:
            "&btn_from=xhs&clickid=CLICK_ID&backXHS=XHS_BACK_URL&noteid=XHS_NOTE_ID&oaidmd5=OAID_MD5&caid=CAID&idfa=IDFA&ts=TS&creativeid=CREATIVITY_ID&unitid=UNIT_ID&campaignid=CAMPAIGN_ID&wakeRefid=",
        fallbackParams: "&wakeDM=xhs&wakeRefid=",
        trackBase:
            "https://appnew.ly.com/addap/attribution?aaid=53&os=__OS__&oaidmd5=__OAID_MD5__&caid=__CAID__&caidmd5=__CAID_MD5__&idfamd5=__IDFA__&imeimd5=__IMEI__&ts=__TS__&clickid=__CLICK_ID__&advertiserid=__ADVERTISER_ID__&creativeid=__CREATIVITY_ID__&unitid=__UNIT_ID__&campaignid=__CAMPAIGN_ID__&paid=__PAID__&keyword=__KEYWORD_ID__&noteid=__NOTE_ID__&wakeRefid="
    };

    /** \u94fe\u63a5\u6a21\u677f\u4e2d\u7684\u5360\u4f4d\u7b26\u6620\u5c04 */
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
     * \u5c06\u6a21\u677f\u5b57\u7b26\u4e32\u4e2d\u7684\u5360\u4f4d\u7b26\u66ff\u6362\u4e3a\u5b9e\u9645\u503c
     * @param {string} template - \u542b\u5360\u4f4d\u7b26\u7684\u6a21\u677f\u5b57\u7b26\u4e32
     * @returns {string} \u66ff\u6362\u540e\u7684\u5b57\u7b26\u4e32
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
