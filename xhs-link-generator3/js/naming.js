/**
 * LinkGenNaming \u2014 \u5e7f\u544a\u8ba1\u5212\u547d\u540d\u6a21\u5757
 * \u5bfc\u51fa\u5168\u5c40 LinkGenNaming \u5bf9\u8c61
 */
(function (global) {
    "use strict";

    /**
     * \u83b7\u53d6\u5f53\u5929\u65e5\u671f YYYYMMDD
     * @returns {string}
     */
    function getTodayDate() {
        var now = new Date();
        var y = now.getFullYear();
        var m = String(now.getMonth() + 1).padStart(2, "0");
        var d = String(now.getDate()).padStart(2, "0");
        return "" + y + m + d;
    }

    /**
     * \u83b7\u53d6\u7b14\u8bb0ID\u540e4\u4f4d
     * \u4e0d\u8db34\u4f4d\u65f6\u7528\u5b9e\u9645\u4f4d\u6570
     * @param {string} noteId
     * @returns {string}
     */
    function getNoteIdLast4(noteId) {
        if (!noteId) {
            return "";
        }
        var trimmed = noteId.trim();
        if (trimmed.length >= 4) {
            return trimmed.slice(-4);
        }
        return trimmed;
    }

    /**
     * \u6784\u5efa\u5e7f\u544a\u8ba1\u5212\u547d\u540d
     * \u683c\u5f0f\uff1a\u4e0a\u7ebf\u65f6\u95f4-\u7d20\u6750\u7c7b\u578b-\u4e1a\u52a1\u7ebf-\u5185\u5bb9\u7c7b\u578b-\u9152\u5e97\u57ce\u5e02/\u76ee\u7684\u5730[-\u9152\u5e97\u540d\u79f0]-\u6295\u653e\u6d3b\u52a8-\u7b14\u8bb0ID\u540e4\u4f4d[-\u5b9a\u5411]
     * \u4ec5\u5f53\u5185\u5bb9\u7c7b\u578b=\u975e\u6807\u79cd\u8349\u65f6\u62fc\u63a5\u9152\u5e97\u540d\u79f0
     * \u5b9a\u5411\u4e3a\u7a7a\u65f6\u4e0d\u62fc\u63a5
     * @param {Object} params
     * @param {string} params.materialType - \u7d20\u6750\u7c7b\u578b
     * @param {string} params.bizLine - \u4e1a\u52a1\u7ebf
     * @param {string} params.contentType - \u5185\u5bb9\u7c7b\u578b
     * @param {string} params.city - \u9152\u5e97\u57ce\u5e02/\u76ee\u7684\u5730
     * @param {string} params.hotelName - \u9152\u5e97\u540d\u79f0
     * @param {string} params.noteId - \u7b14\u8bb0ID
     * @param {string} params.activity - \u6295\u653e\u6d3b\u52a8
     * @param {string} params.targeting - \u5b9a\u5411\uff08\u53ef\u9009\uff09
     * @returns {string} \u62fc\u63a5\u540e\u7684\u547d\u540d
     */
    function buildNaming(params) {
        var segments = [];

        // 1. \u4e0a\u7ebf\u65f6\u95f4
        segments.push(getTodayDate());

        // 2. \u7d20\u6750\u7c7b\u578b
        segments.push(params.materialType || "");

        // 3. \u4e1a\u52a1\u7ebf
        segments.push(params.bizLine || "");

        // 4. \u5185\u5bb9\u7c7b\u578b
        segments.push(params.contentType || "");

        // 5. \u9152\u5e97\u57ce\u5e02/\u76ee\u7684\u5730
        segments.push(params.city || "");

        // 6. \u9152\u5e97\u540d\u79f0\uff08\u4ec5\u975e\u6807\u79cd\u8349\u65f6\u62fc\u63a5\uff09
        if (params.contentType === "\u975e\u6807\u79cd\u8349" && params.hotelName && params.hotelName.trim()) {
            segments.push(params.hotelName.trim());
        }

        // 7. \u6295\u653e\u6d3b\u52a8
        segments.push(params.activity || "");

        // 8. \u7b14\u8bb0ID\u540e4\u4f4d
        segments.push(getNoteIdLast4(params.noteId));

        // 9. \u5b9a\u5411\uff08\u53ef\u9009\uff0c\u4e3a\u7a7a\u65f6\u4e0d\u62fc\u63a5\uff09
        if (params.targeting && params.targeting.trim()) {
            segments.push(params.targeting.trim());
        }

        return segments.join("-");
    }

    global.LinkGenNaming = {
        getTodayDate: getTodayDate,
        getNoteIdLast4: getNoteIdLast4,
        buildNaming: buildNaming
    };
})(window);
