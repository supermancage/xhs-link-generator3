/**
 * LinkGenCore \u2014 \u94fe\u63a5\u751f\u6210\u6838\u5fc3\u903b\u8f91\u6a21\u5757
 * \u5bfc\u51fa\u5168\u5c40 LinkGenCore \u5bf9\u8c61
 * \u4f9d\u8d56\uff1aLinkGenConfig\uff08\u9700\u5148\u52a0\u8f7d js/config.js\uff09
 */
(function (global) {
    "use strict";

    var cfg = global.LinkGenConfig.config;
    var withPlaceholders = global.LinkGenConfig.withPlaceholders;

    /**
     * \u6784\u5efa\u56db\u79cd\u94fe\u63a5\uff1aDP\u94fe\u63a5\u3001Universal Link\u3001\u515c\u5e95\u94fe\u63a5\u3001\u76d1\u6d4b\u94fe\u63a5
     * @param {Object} payload
     * @param {string} payload.appLink - \u6295\u653e\u94fe\u63a5\uff08\u5df2 trim\uff09
     * @param {string} payload.refid - refid\uff08\u5df2 trim\uff09
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
     * \u6821\u9a8c\u5fc5\u586b\u5b57\u6bb5
     * @param {Object} payload
     * @param {string} payload.appLink - \u6295\u653e\u94fe\u63a5
     * @param {string} payload.refid - refid
     * @param {string} [payload.noteId=""] - \u7b14\u8bb0 ID
     * @param {string} lineLabel - \u7528\u4e8e\u9519\u8bef\u63d0\u793a\u7684\u884c\u6807\u8bc6\uff08\u5982 "\u7b2c5\u884c" \u6216 "\u5f53\u524d\u8f93\u5165"\uff09
     * @throws {Error} \u6821\u9a8c\u4e0d\u901a\u8fc7\u65f6\u629b\u51fa
     */
    function validateRequiredFields(payload, lineLabel) {
        // \u524d\u540e\u7a7a\u683c\u68c0\u67e5
        if (payload.appLink !== payload.appLink.trim() ||
            payload.refid !== payload.refid.trim() ||
            (payload.noteId && payload.noteId !== payload.noteId.trim())) {
            throw new Error(lineLabel + " \u5b58\u5728\u524d\u540e\u7a7a\u683c\uff0c\u8bf7\u5220\u9664\u540e\u91cd\u8bd5");
        }

        // \u7a7a\u503c\u68c0\u67e5
        if (!payload.appLink.trim() || !payload.refid.trim()) {
            throw new Error(lineLabel + " \u7684\u6295\u653e\u94fe\u63a5\u548c refid \u4e0d\u80fd\u4e3a\u7a7a");
        }

        // appLink URL \u5408\u6cd5\u6027\u6821\u9a8c \u2014\u2014 \u5fc5\u987b\u4ee5 http:// \u6216 https:// \u5f00\u5934
        var trimmed = payload.appLink.trim();
        if (trimmed.indexOf("http://") !== 0 && trimmed.indexOf("https://") !== 0) {
            throw new Error(lineLabel + " \u7684\u6295\u653e\u94fe\u63a5\u5fc5\u987b\u4ee5 http:// \u6216 https:// \u5f00\u5934");
        }
    }

    /**
     * CSV \u503c\u8f6c\u4e49
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
     * \u89e3\u6790\u5355\u884c CSV\uff08\u652f\u6301\u5f15\u53f7\u5305\u88f9\u7684\u5b57\u6bb5\uff09
     * @param {string} line - CSV \u884c\u6587\u672c
     * @returns {string[]} \u5b57\u6bb5\u6570\u7ec4\uff08\u5df2 trim\uff09
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
     * \u89e3\u6790\u6279\u91cf\u8f93\u5165\u7684\u5355\u884c\uff08\u652f\u6301 CSV \u6216\u7a7a\u683c\u5206\u9694\u683c\u5f0f\uff09
     * @param {string} line - \u884c\u6587\u672c
     * @param {number} index - \u884c\u7d22\u5f15
     * @returns {{ noteId: string, appLink: string, refid: string, lineLabel: string }}
     * @throws {Error} \u683c\u5f0f\u4e0d\u6b63\u786e\u65f6\u629b\u51fa
     */
    function parseBatchLine(line, index) {
        var lineLabel = "\u7b2c " + (index + 1) + " \u884c";

        // CSV \u683c\u5f0f\uff08\u542b\u9017\u53f7\uff09
        if (line.includes(",")) {
            var parts = parseCsvLine(line);
            if (parts.length < 3) {
                throw new Error(lineLabel + " \u683c\u5f0f\u4e0d\u6b63\u786e\uff0c\u9700\u8981 `\u7b14\u8bb0ID,\u6295\u653e\u94fe\u63a5,refid` \u4e09\u5217");
            }
            return {
                noteId: parts[0],
                appLink: parts[1],
                refid: parts[2],
                lineLabel: lineLabel
            };
        }

        // \u7a7a\u683c\u5206\u9694\u683c\u5f0f
        var parts = line.split(/\s+/).filter(Boolean);
        if (parts.length === 3) {
            return {
                noteId: parts[0],
                appLink: parts[1],
                refid: parts[2],
                lineLabel: lineLabel
            };
        }

        if (parts.length === 2) {
            return {
                noteId: "",
                appLink: parts[0],
                refid: parts[1],
                lineLabel: lineLabel
            };
        }

        throw new Error(lineLabel + " \u683c\u5f0f\u4e0d\u6b63\u786e\uff0c\u9700\u8981 `\u7b14\u8bb0ID \u6295\u653e\u94fe\u63a5 refid` \u6216 `\u6295\u653e\u94fe\u63a5 refid`");
    }

    /**
     * \u5904\u7406\u6279\u91cf\u8f93\u5165\u6587\u672c\uff0c\u9010\u884c\u5bb9\u9519
     * @param {string} inputText - \u6279\u91cf\u8f93\u5165\u7684\u539f\u59cb\u6587\u672c
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
            throw new Error("\u6587\u4ef6\u5185\u5bb9\u4e3a\u7a7a\uff0c\u8bf7\u68c0\u67e5\u540e\u91cd\u8bd5");
        }

        var previewRows = [];
        var results = [];
        var errors = [];
        var headers = ["\u7b14\u8bb0ID", "\u6295\u653e\u94fe\u63a5", "refid", "DP\u94fe\u63a5", "Universal Link", "\u515c\u5e95\u94fe\u63a5", "\u76d1\u6d4b\u94fe\u63a5"];
        results.push(headers.join(","));
        previewRows.push(headers);

        var firstLine = lines[0].toLowerCase();
        var startIndex = (firstLine.includes("\u7b14\u8bb0id") || firstLine.includes("noteid")) ? 1 : 0;

        for (var i = startIndex; i < lines.length; i += 1) {
            try {
                var item = parseBatchLine(lines[i].trim(), i);
                validateRequiredFields(item, item.lineLabel);
                var built = buildLinks({
                    appLink: item.appLink.trim(),
                    refid: item.refid.trim()
                });

                results.push([
                    escapeCsv(item.noteId.trim()),
                    escapeCsv(item.appLink.trim()),
                    escapeCsv(item.refid.trim()),
                    escapeCsv(built.dpLink),
                    escapeCsv(built.ulLink),
                    escapeCsv(built.fallbackLink),
                    escapeCsv(built.trackLink)
                ].join(","));

                previewRows.push([
                    item.noteId.trim(),
                    item.appLink.trim(),
                    item.refid.trim(),
                    built.dpLink,
                    built.ulLink,
                    built.fallbackLink,
                    built.trackLink
                ]);
            } catch (lineErr) {
                // \u9010\u884c\u5bb9\u9519\uff1a\u8bb0\u5f55\u9519\u8bef\uff0c\u7ee7\u7eed\u5904\u7406\u540e\u7eed\u884c
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
