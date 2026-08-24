/**
 * LinkGenCore — 链接生成核心逻辑模块
 * 导出全局 LinkGenCore 对象
 * 依赖：LinkGenConfig（需先加载 js/config.js）
 */
(function (global) {
    "use strict";

    var cfg = global.LinkGenConfig.config;
    var withPlaceholders = global.LinkGenConfig.withPlaceholders;

    /**
     * 构建四种链接：DP链接、Universal Link、兜底链接、监测链接
     * @param {Object} payload
     * @param {string} payload.appLink - 投放链接（已 trim）
     * @param {string} payload.refid - refid（已 trim）
     * @returns {{ dpLink: string, ulLink: string, fallbackLink: string, trackLink: string }}
     */
    function buildLinks(payload) {
        var encodedAppLink = encodeURIComponent(payload.appLink);
        var commonParams = withPlaceholders(cfg.commonParams);

        return {
            dpLink: cfg.dpPrefix + encodedAppLink + commonParams + payload.refid,
            ulLink: cfg.ulPrefix + encodedAppLink + commonParams + payload.refid,
            fallbackLink: cfg.ulPrefix + encodedAppLink + cfg.fallbackParams + payload.refid,
            trackLink: cfg.trackBase + payload.refid
        };
    }

    /**
     * 校验必填字段
     * @param {Object} payload
     * @param {string} payload.appLink - 投放链接
     * @param {string} payload.refid - refid
     * @param {string} [payload.noteId=""] - 笔记 ID
     * @param {string} lineLabel - 用于错误提示的行标识（如 "第5行" 或 "当前输入"）
     * @throws {Error} 校验不通过时抛出
     */
    function validateRequiredFields(payload, lineLabel) {
        // 前后空格检查
        if (payload.appLink !== payload.appLink.trim() ||
            payload.refid !== payload.refid.trim() ||
            (payload.noteId && payload.noteId !== payload.noteId.trim())) {
            throw new Error(lineLabel + " 存在前后空格，请删除后重试");
        }

        // 空值检查
        if (!payload.appLink.trim() || !payload.refid.trim()) {
            throw new Error(lineLabel + " 的投放链接和 refid 不能为空");
        }

        // appLink URL 合法性校验 —— 必须以 http:// 或 https:// 开头
        var trimmed = payload.appLink.trim();
        if (trimmed.indexOf("http://") !== 0 && trimmed.indexOf("https://") !== 0) {
            throw new Error(lineLabel + " 的投放链接必须以 http:// 或 https:// 开头");
        }
    }

    /**
     * CSV 值转义
     * @param {*} value
     * @returns {string}
     */
    function escapeCsv(value) {
        var text = String(value != null ? value : "");
        if (text.includes(",") || text.includes('"') || text.includes("\n")) {
            return '"' + text.replace(/"/g, '""') + '"';
        }
        return text;
    }

    /**
     * 解析单行 CSV（支持引号包裹的字段）
     * @param {string} line - CSV 行文本
     * @returns {string[]} 字段数组（已 trim）
     */
    function parseCsvLine(line) {
        var fields = [];
        var current = "";
        var inQuotes = false;

        for (var i = 0; i < line.length; i += 1) {
            var char = line[i];
            var nextChar = line[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    current += '"';
                    i += 1;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === "," && !inQuotes) {
                fields.push(current);
                current = "";
            } else {
                current += char;
            }
        }

        fields.push(current);
        return fields.map(function (field) {
            return field.trim();
        });
    }

    /**
     * 解析批量输入的单行（支持 CSV 或空格分隔格式）
     * @param {string} line - 行文本
     * @param {number} index - 行索引
     * @returns {{ noteId: string, appLink: string, refid: string, lineLabel: string }}
     * @throws {Error} 格式不正确时抛出
     */
    function parseBatchLine(line, index) {
        var lineLabel = "第 " + (index + 1) + " 行";

        // CSV 格式（含逗号）
        if (line.includes(",")) {
            var parts = parseCsvLine(line);

            // URL参数含逗号时自动合并
            if (parts.length > 1 && (parts[1].indexOf("http://") === 0 || parts[1].indexOf("https://") === 0)) {
                var expectedCols = (parts.length >= 10) ? 10 : 3;
                if (parts.length > expectedCols) {
                    var extra = parts.length - expectedCols;
                    var mergedUrl = parts.slice(1, 1 + extra + 1).join(",");
                    parts.splice(1, extra + 1, mergedUrl);
                }
            }

            // 新格式：含命名字段（\u226510列）
            if (parts.length >= 10) {
                return {
                    noteId: parts[0],
                    appLink: parts[1],
                    refid: parts[2],
                    materialType: parts[3] || "",
                    bizLine: parts[4] || "",
                    contentType: parts[5] || "",
                    city: parts[6] || "",
                    hotelName: parts[7] || "",
                    activity: parts[8] || "",
                    targeting: parts[9] || "",
                    lineLabel: lineLabel
                };
            }

            // 旧格式：仅链接（\u22653列）
            if (parts.length >= 3) {
                return {
                    noteId: parts[0],
                    appLink: parts[1],
                    refid: parts[2],
                    materialType: "",
                    bizLine: "",
                    contentType: "",
                    city: "",
                    hotelName: "",
                    activity: "",
                    targeting: "",
                    lineLabel: lineLabel
                };
            }

            throw new Error(lineLabel + " 格式不正确，需要 `笔记ID,投放链接,refid` 或含命名字段的完整格式");
        }

        // 空格分隔格式（保持旧有逻辑）
        var spaceParts = line.split(/\s+/).filter(Boolean);
        if (spaceParts.length === 3) {
            return {
                noteId: spaceParts[0],
                appLink: spaceParts[1],
                refid: spaceParts[2],
                materialType: "",
                bizLine: "",
                contentType: "",
                city: "",
                hotelName: "",
                activity: "",
                targeting: "",
                lineLabel: lineLabel
            };
        }

        if (spaceParts.length === 2) {
            return {
                noteId: "",
                appLink: spaceParts[0],
                refid: spaceParts[1],
                materialType: "",
                bizLine: "",
                contentType: "",
                city: "",
                hotelName: "",
                activity: "",
                targeting: "",
                lineLabel: lineLabel
            };
        }

        throw new Error(lineLabel + " 格式不正确，需要 `笔记ID 投放链接 refid` 或 `投放链接 refid`");
    }

    /**
     * 处理批量输入文本，逐行容错
     * @param {string} inputText - 批量输入的原始文本
     * @returns {{
     *   csvText: string,
     *   previewRows: string[][],
     *   errors: { line: number, message: string }[],
     *   resultCount: number
     * }}
     */
    function processBatchInput(inputText) {
        var lines = inputText.split(/\r?\n/).filter(function (line) {
            return line.trim();
        });

        if (!lines.length) {
            throw new Error("文件内容为空，请检查后重试");
        }

        var previewRows = [];
        var results = [];
        var errors = [];
        var headers = ["笔记ID", "投放链接", "refid",
            "素材类型", "业务线", "内容类型",
            "酒店城市", "酒店名称", "投放活动", "定向",
            "广告计划命名",
            "DP链接", "Universal Link", "兜底链接", "监测链接"];
        results.push(headers.join(","));
        previewRows.push(headers);

        var firstLine = lines[0].toLowerCase();
        var startIndex = (firstLine.includes("笔记id") || firstLine.includes("noteid")) ? 1 : 0;

        for (var i = startIndex; i < lines.length; i += 1) {
            try {
                var item = parseBatchLine(lines[i].trim(), i);
                validateRequiredFields(item, item.lineLabel);
                var built = buildLinks({
                    appLink: item.appLink.trim(),
                    refid: item.refid.trim()
                });

                // 生成命名
                var naming = "";
                if (item.materialType) {
                    naming = global.LinkGenNaming.buildNaming({
                        materialType: item.materialType,
                        bizLine: item.bizLine,
                        contentType: item.contentType,
                        city: item.city,
                        hotelName: item.hotelName,
                        noteId: item.noteId,
                        activity: item.activity,
                        targeting: item.targeting
                    });
                }

                results.push([
                    escapeCsv(item.noteId.trim()),
                    escapeCsv(item.appLink.trim()),
                    escapeCsv(item.refid.trim()),
                    escapeCsv(item.materialType),
                    escapeCsv(item.bizLine),
                    escapeCsv(item.contentType),
                    escapeCsv(item.city),
                    escapeCsv(item.hotelName),
                    escapeCsv(item.activity),
                    escapeCsv(item.targeting),
                    escapeCsv(naming),
                    escapeCsv(built.dpLink),
                    escapeCsv(built.ulLink),
                    escapeCsv(built.fallbackLink),
                    escapeCsv(built.trackLink)
                ].join(","));

                previewRows.push([
                    item.noteId.trim(),
                    item.appLink.trim(),
                    item.refid.trim(),
                    item.materialType,
                    item.bizLine,
                    item.contentType,
                    item.city,
                    item.hotelName,
                    item.activity,
                    item.targeting,
                    naming,
                    built.dpLink,
                    built.ulLink,
                    built.fallbackLink,
                    built.trackLink
                ]);
            } catch (lineErr) {
                // 逐行容错：记录错误，继续处理后续行
                errors.push({
                    line: i + 1,
                    message: lineErr.message
                });
            }
        }

        return {
            csvText: results.join("\n"),
            previewRows: previewRows,
            errors: errors,
            resultCount: previewRows.length - 1
        };
    }

    global.LinkGenCore = {
        buildLinks: buildLinks,
        validateRequiredFields: validateRequiredFields,
        escapeCsv: escapeCsv,
        parseCsvLine: parseCsvLine,
        parseBatchLine: parseBatchLine,
        processBatchInput: processBatchInput
    };
})(window);
