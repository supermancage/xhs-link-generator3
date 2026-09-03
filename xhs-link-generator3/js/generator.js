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
     * 生成结果状态文案（批量输出「生成结果」列 / 预览徽章）
     * @param {string} status - normalizeAppLink 返回的机器状态码
     * @returns {string} 用户可读文案
     */
    function statusText(status) {
        var map = {
            "unsupported": "活动activity不支持城市添加",
            "no-city": "活动activity支持城市添加，未填城市",
            "city-ok": "活动activity支持城市添加，城市匹配成功",
            "city-fail": "活动activity支持城市添加，城市匹配不成功",
            "already-has": "投放链接已含 oCityID，未重复追加"
        };
        return map[status] || "";
    }

    /**
     * 按需为投放链接追加 oCityID 参数
     * 规则：
     * - activitycode 命中白名单 + 提供城市名 → 查表追加 &oCityID=城市ID（status=city-ok）
     * - activitycode 命中白名单 + 未提供城市 → 原样返回（status=no-city，城市选填）
     * - activitycode 未命中/缺失 + 提供城市 → 原样返回并忽略城市（status=unsupported）
     * - 城市名在对照表中查不到 → 不阻断，原样返回并提示（status=city-fail，批量仍生成该行并告知）
     * - 链接已包含 oCityID → 不重复追加（status=already-has，幂等）
     * @param {string} appLink - 投放链接
     * @param {string} cityInput - 城市名（选填）
     * @returns {{ appLink: string, warning: string, status: string }}
     *   warning 非空时为提示文案；status 为机器状态码（配合 statusText 转展示文案）
     */
    function normalizeAppLink(appLink, cityInput) {
        var cityData = global.LinkGenCityData || {};
        var whitelist = cityData.activityCodes || [];

        var trimmed = String(appLink || "").trim();
        var city = String(cityInput || "").trim();

        // 解析 activitycode（参数名大小写不敏感）
        var match = trimmed.match(/[?&]activitycode=([^&#]+)/i);
        var code = match ? match[1] : "";
        var isWhitelisted = !!code && whitelist.some(function (item) {
            return item.toLowerCase() === code.toLowerCase();
        });

        // 提供了城市但活动不支持 oCityID → 忽略城市，提示
        if (city && !isWhitelisted) {
            return {
                appLink: trimmed,
                status: "unsupported",
                warning: "该投放链接的 activitycode 不在 oCityID 支持列表中，已忽略城市「" + city + "」，按原逻辑生成"
            };
        }

        // 命中白名单但未提供城市 → 按原逻辑生成，提示（城市为选填）
        if (!city && isWhitelisted) {
            return {
                appLink: trimmed,
                status: "no-city",
                warning: "该活动支持 oCityID 参数（activitycode=" + code.slice(0, 8) + "…），未提供城市，已按原逻辑生成"
            };
        }

        if (!city) {
            return { appLink: trimmed, status: "unsupported", warning: "" };
        }

        // 城市名 → ID 查表（支持官方全称/带后缀/裸名/县级，见 LinkGenCityData.lookupCity）
        var cityHit = global.LinkGenCityData.lookupCity
            ? global.LinkGenCityData.lookupCity(city)
            : null;
        if (!cityHit) {
            // 匹配不成功 → 不阻断，降级为原链接生成并明确告知
            return {
                appLink: trimmed,
                status: "city-fail",
                warning: "该活动支持 oCityID 参数，但城市「" + city + "」匹配不成功（城市ID对照表中未找到），已忽略城市按原逻辑生成"
            };
        }

        // 已包含 oCityID 时不重复追加（幂等）
        if (/[?&]oCityID=/i.test(trimmed)) {
            return {
                appLink: trimmed,
                status: "already-has",
                warning: "投放链接已包含 oCityID 参数，未重复追加"
            };
        }

        var separator = trimmed.indexOf("?") === -1 ? "?" : "&";
        return { appLink: trimmed + separator + "oCityID=" + cityHit.id, status: "city-ok", warning: "" };
    }

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
     * @param {number} [headerCols] - 表头列数（用于 URL 含逗号时的字段合并判断；0/缺省则按列数启发式推断）
     * @returns {{ noteId: string, appLink: string, refid: string, lineLabel: string }}
     * @throws {Error} 格式不正确时抛出
     */
    function parseBatchLine(line, index, headerCols) {
        var lineLabel = "第 " + (index + 1) + " 行";

        // CSV 格式（含逗号）
        if (line.includes(",")) {
            var parts = parseCsvLine(line);

            // URL参数含逗号时自动合并（预期列数优先取表头列数）
            if (parts.length > 1 && (parts[1].indexOf("http://") === 0 || parts[1].indexOf("https://") === 0)) {
                var expectedCols;
                if (headerCols) {
                    expectedCols = headerCols;
                } else if (parts.length >= 11) {
                    expectedCols = 10;
                } else if (parts.length === 10) {
                    // 无表头时 10 列有歧义（10列真实数据 vs 9列+URL含逗号），按 refid 特征判断：
                    // refid 通常为纯字母数字，URL 残段会带 = & ? 等符号
                    expectedCols = /^[A-Za-z0-9_-]+$/.test(parts[2]) ? 10 : 9;
                } else if (parts.length >= 9) {
                    expectedCols = 9;
                } else {
                    expectedCols = 3;
                }
                if (parts.length > expectedCols) {
                    var extra = parts.length - expectedCols;
                    var mergedUrl = parts.slice(1, 1 + extra + 1).join(",");
                    parts.splice(1, extra + 1, mergedUrl);
                }
            }

            // 新格式：含命名字段（≥9列，第10列「定向」可选）
            if (parts.length >= 9) {
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
        var warnings = [];
        var headers = ["笔记ID", "投放链接", "refid",
            "素材类型", "业务线", "内容类型",
            "酒店城市", "酒店名称", "投放活动", "定向",
            "广告计划命名",
            "DP链接", "Universal Link", "兜底链接", "监测链接",
            "生成结果"];
        results.push(headers.join(","));
        previewRows.push(headers);

        var firstLine = lines[0].toLowerCase();
        var hasHeader = firstLine.includes("笔记id") || firstLine.includes("noteid");
        var startIndex = hasHeader ? 1 : 0;
        var headerCols = hasHeader ? parseCsvLine(lines[0]).length : 0;

        for (var i = startIndex; i < lines.length; i += 1) {
            try {
                var item = parseBatchLine(lines[i].trim(), i, headerCols);
                validateRequiredFields(item, item.lineLabel);

                // oCityID 注入：命中白名单 activitycode 且提供城市时追加
                var normalized = normalizeAppLink(item.appLink, item.city);
                if (normalized.warning) {
                    warnings.push({ line: i + 1, message: normalized.warning });
                }

                var built = buildLinks({
                    appLink: normalized.appLink,
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

                // 生成结果状态：随行输出（CSV 尾列文字，预览尾元素为 {code, text}）
                var status = normalized.status || (item.city ? "city-fail" : "unsupported");
                var statusLabel = statusText(status);

                results.push([
                    escapeCsv(item.noteId.trim()),
                    escapeCsv(normalized.appLink),
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
                    escapeCsv(built.trackLink),
                    escapeCsv(statusLabel)
                ].join(","));

                previewRows.push([
                    item.noteId.trim(),
                    normalized.appLink,
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
                    built.trackLink,
                    { code: status, text: statusLabel }
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
            warnings: warnings,
            resultCount: previewRows.length - 1
        };
    }

    global.LinkGenCore = {
        buildLinks: buildLinks,
        normalizeAppLink: normalizeAppLink,
        statusText: statusText,
        validateRequiredFields: validateRequiredFields,
        escapeCsv: escapeCsv,
        parseCsvLine: parseCsvLine,
        parseBatchLine: parseBatchLine,
        processBatchInput: processBatchInput
    };
})(window);
