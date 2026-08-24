/**
 * LinkGenNaming — 广告计划命名模块
 * 导出全局 LinkGenNaming 对象
 */
(function (global) {
    "use strict";

    /**
     * 获取当天日期 YYYYMMDD
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
     * 获取笔记ID后4位
     * 不足4位时用实际位数
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
     * 构建广告计划命名
     * 格式：上线时间-素材类型-业务线-内容类型-酒店城市/目的地[-酒店名称]-投放活动-笔记ID后4位[-定向]
     * 仅当内容类型=非标种草时拼接酒店名称
     * 定向为空时不拼接
     * @param {Object} params
     * @param {string} params.materialType - 素材类型
     * @param {string} params.bizLine - 业务线
     * @param {string} params.contentType - 内容类型
     * @param {string} params.city - 酒店城市/目的地
     * @param {string} params.hotelName - 酒店名称
     * @param {string} params.noteId - 笔记ID
     * @param {string} params.activity - 投放活动
     * @param {string} params.targeting - 定向（可选）
     * @returns {string} 拼接后的命名
     */
    function buildNaming(params) {
        var segments = [];

        // 1. 上线时间
        segments.push(getTodayDate());

        // 2. 素材类型
        segments.push(params.materialType || "");

        // 3. 业务线
        segments.push(params.bizLine || "");

        // 4. 内容类型
        segments.push(params.contentType || "");

        // 5. 酒店城市/目的地
        segments.push(params.city || "");

        // 6. 酒店名称（仅非标种草时拼接）
        if (params.contentType === "非标种草" && params.hotelName && params.hotelName.trim()) {
            segments.push(params.hotelName.trim());
        }

        // 7. 投放活动
        segments.push(params.activity || "");

        // 8. 笔记ID后4位
        segments.push(getNoteIdLast4(params.noteId));

        // 9. 定向（可选，为空时不拼接）
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
