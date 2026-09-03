/**
 * LinkGenUI — 界面交互模块
 * 导出全局 LinkGenUI 对象
 * 依赖：LinkGenConfig、LinkGenCore（需先加载 js/config.js 和 js/generator.js）
 */
(function (global) {
    "use strict";

    var Core = global.LinkGenCore;

    /* ========== Toast 通知 ========== */

    /** @type {HTMLElement|null} toast 容器 */
    var toastContainer = null;

    /**
     * 获取或创建 toast 容器
     * @returns {HTMLElement}
     */
    function getToastContainer() {
        if (!toastContainer) {
            toastContainer = document.createElement("div");
            toastContainer.className = "toast-container";
            document.body.appendChild(toastContainer);
        }
        return toastContainer;
    }

    /**
     * 显示 toast 通知
     * @param {string} message - 通知文本
     * @param {"error"|"success"} [type="success"] - 通知类型
     */
    function showToast(message, type) {
        var container = getToastContainer();
        var toast = document.createElement("div");
        toast.className = "toast " + (type === "error" ? "toast-error" : "toast-success");
        toast.textContent = message;

        container.appendChild(toast);

        // 3 秒后自动移除
        setTimeout(function () {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }

    /* ========== QR Code ========== */

    /**
     * 切换 QR 码显示
     * @param {string} qrContainerId - QR 容器 ID
     * @param {string} textareaId - 对应链接文本框 ID
     * @param {HTMLButtonElement} button - QR 按钮
     */
    function toggleQrCode(qrContainerId, textareaId, button) {
        var container = document.getElementById(qrContainerId);
        if (!container) return;

        if (container.style.display === "block") {
            container.style.display = "none";
            button.classList.remove("active");
            return;
        }

        var text = document.getElementById(textareaId).value;
        if (!text) {
            showToast("无链接可生成 QR 码", "error");
            return;
        }

        try {
            // 纠错级别 M（15% 容错，扫得更稳）；cellSize 6（65×65 模块时约 480px+，SVG 矢量自适应容器宽度）
            var qr = qrcode(0, "M");
            qr.addData(text);
            qr.make();
            container.innerHTML = qr.createSvgTag(6, 8);

            // 新增「下载 PNG」按钮（参考草料二维码体验，仅插入 QR 容器内部）
            var downloadBtn = document.createElement("button");
            downloadBtn.type = "button";
            downloadBtn.className = "copy-btn qr-download-btn";
            downloadBtn.textContent = "\u2b07 下载二维码";
            downloadBtn.addEventListener("click", function () {
                downloadQrAsPng(qr);
            });
            container.appendChild(downloadBtn);

            container.style.display = "block";
            button.classList.add("active");
        } catch (e) {
            showToast("QR 码生成失败", "error");
        }
    }

    /**
     * 将 QR 渲染为 PNG 并触发下载（参考草料二维码体验）
     * 每个模块 10px、四周留 8 模块白色边距，canvas 尺寸 500px+
     * @param {object} qr - qrcode-generator 实例
     */
    function downloadQrAsPng(qr) {
        var moduleCount = qr.getModuleCount();
        var cellSize = 10;
        var margin = 8;
        var size = moduleCount * cellSize + margin * 2 * cellSize;

        var canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext("2d");

        // 先铺白色背景，再画黑色模块
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = "#000000";
        for (var row = 0; row < moduleCount; row += 1) {
            for (var col = 0; col < moduleCount; col += 1) {
                if (qr.isDark(row, col)) {
                    ctx.fillRect(
                        margin * cellSize + col * cellSize,
                        margin * cellSize + row * cellSize,
                        cellSize,
                        cellSize
                    );
                }
            }
        }

        var fileName = "qr-" + Date.now() + ".png";

        if (canvas.toBlob) {
            canvas.toBlob(function (blob) {
                if (!blob) {
                    showToast("二维码下载失败", "error");
                    return;
                }
                var url = URL.createObjectURL(blob);
                triggerFileDownload(url, fileName);
                URL.revokeObjectURL(url);
                showToast("二维码下载已开始", "success");
            }, "image/png");
        } else {
            triggerFileDownload(canvas.toDataURL("image/png"), fileName);
            showToast("二维码下载已开始", "success");
        }
    }

    /**
     * 触发浏览器下载
     * @param {string} url - blob URL 或 data URL
     * @param {string} fileName - 下载文件名
     */
    function triggerFileDownload(url, fileName) {
        var anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    }

    /* ========== 批量结果存储 ========== */

    /** @type {string} 批量生成的 CSV 文本 */
    var batchResults = "";

    /* ========== Tab 切换 ========== */

    /**
     * 切换标签页（单个 / 批量）
     * 只切换表单区域的显示，不隐藏已有的结果面板
     * @param {string} tabName - "single" 或 "batch"
     */
    function switchTab(tabName) {
        // 更新 tab 按钮状态
        document.querySelectorAll(".tab-btn").forEach(function (button) {
            button.classList.toggle("active", button.dataset.tab === tabName);
        });

        // 切换表单区域
        document.getElementById("singleTab").style.display = tabName === "single" ? "block" : "none";
        document.getElementById("batchTab").style.display = tabName === "batch" ? "block" : "none";

        // 切 tab 时隐藏对方的结果面板，切回时自己的仍在
        if (tabName === "batch") {
            document.getElementById("resultCard").style.display = "none";
        }
        if (tabName === "single") {
            document.getElementById("batchResult").style.display = "none";
        }
    }

    /* ========== 单个生成 ========== */

    /**
     * 渲染单个生成的结果到结果卡片
     * @param {{ dpLink: string, ulLink: string, fallbackLink: string, trackLink: string }} result
     */
    function renderSingleResult(result) {
        document.getElementById("namingResult").value = result.naming || "";
        document.getElementById("dpResult").value = result.dpLink;
        document.getElementById("ulResult").value = result.ulLink;
        document.getElementById("fallbackResult").value = result.fallbackLink;
        document.getElementById("trackResult").value = result.trackLink;
        document.getElementById("resultCard").style.display = "block";
        document.getElementById("resultCard").scrollIntoView({ behavior: "smooth" });
    }

    /**
     * 单个生成按钮点击处理
     */
    function generateSingleLinks() {
        try {
            var payload = {
                appLink: document.getElementById("appLink").value,
                refid: document.getElementById("refid").value,
                noteId: document.getElementById("noteid").value
            };

            Core.validateRequiredFields(payload, "当前输入");

            // oCityID 注入：命中白名单 activitycode 且选择城市时追加
            var cityInput = document.getElementById("ocityidCity").value;
            var normalized = Core.normalizeAppLink(payload.appLink, cityInput);
            if (normalized.warning) {
                // 提示但不阻断：用户可选择继续
                if (!global.confirm(normalized.warning + "\n\n确定继续生成吗？")) {
                    return;
                }
            }

            var result = Core.buildLinks({
                appLink: normalized.appLink,
                refid: payload.refid.trim()
            });

            var naming = global.LinkGenNaming.buildNaming({
                materialType: document.getElementById("namingMaterialType").value,
                bizLine: document.getElementById("namingBizLine").value,
                contentType: document.getElementById("namingContentType").value,
                city: document.getElementById("namingCity").value,
                hotelName: document.getElementById("namingHotelName").value,
                noteId: payload.noteId,
                activity: document.getElementById("namingActivity").value,
                targeting: document.getElementById("namingTargeting").value
            });

            renderSingleResult({
                naming: naming,
                dpLink: result.dpLink,
                ulLink: result.ulLink,
                fallbackLink: result.fallbackLink,
                trackLink: result.trackLink
            });
            showToast("链接生成成功", "success");
        } catch (error) {
            showToast(error.message, "error");
        }
    }

    /* ========== 批量生成 ========== */

    /**
     * 构建批量结果预览表格
     * @param {string[][]} rows - 预览数据（第一行为表头）
     */
    function buildBatchPreview(rows) {
        var head = document.getElementById("batchPreviewHead");
        var body = document.getElementById("batchPreviewBody");

        head.innerHTML = "";
        body.innerHTML = "";

        if (!rows.length) {
            body.innerHTML = '<tr><td class="preview-empty">生成后会在这里显示预览</td></tr>';
            return;
        }

        var headers = ["笔记ID", "投放链接", "refid", "生成结果"];
        headers.forEach(function (header) {
            var th = document.createElement("th");
            th.textContent = header;
            head.appendChild(th);
        });

        // 跳过表头行，最多显示前 10 条
        var previewRows = rows.slice(1, 11);
        previewRows.forEach(function (row) {
            var tr = document.createElement("tr");

            var noteTd = document.createElement("td");
            noteTd.textContent = row[0] || "-";
            tr.appendChild(noteTd);

            var appTd = document.createElement("td");
            appTd.textContent = row[1] || "";
            tr.appendChild(appTd);

            var refidTd = document.createElement("td");
            refidTd.textContent = row[2] || "";
            tr.appendChild(refidTd);

            var statusTd = document.createElement("td");
            var badge = document.createElement("span");
            badge.className = "status-badge";
            badge.textContent = "4 个链接已生成";
            statusTd.appendChild(badge);
            tr.appendChild(statusTd);

            body.appendChild(tr);
        });

        if (!previewRows.length) {
            body.innerHTML = '<tr><td class="preview-empty" colspan="' + headers.length + '">没有可预览的数据</td></tr>';
        }
    }

    /**
     * 渲染错误汇总区域
     * @param {{ line: number, message: string }[]} errors
     * @returns {string} HTML 字符串
     */
    function renderErrorSummary(errors) {
        if (!errors.length) {
            return "";
        }
        var html = '<div class="error-summary">';
        html += '<div class="error-title">\u26a0 以下行处理失败，已跳过：</div><ul>';
        errors.forEach(function (err) {
            html += '<li>第 ' + err.line + ' 行：' + err.message + '</li>';
        });
        html += '</ul></div>';
        return html;
    }

    /**
     * 渲染提示汇总区域（oCityID 非阻断提示）
     * @param {{ line: number, message: string }[]} warnings
     * @returns {string} HTML 字符串
     */
    function renderWarningSummary(warnings) {
        if (!warnings || !warnings.length) {
            return "";
        }
        var html = '<div class="error-summary">';
        html += '<div class="error-title">\u2139 以下行有提示（未阻断，已正常生成）：</div><ul>';
        warnings.forEach(function (warn) {
            html += '<li>第 ' + warn.line + ' 行：' + warn.message + '</li>';
        });
        html += '</ul></div>';
        return html;
    }

    /**
     * 设置批量生成按钮的 loading 状态
     * @param {boolean} isLoading
     */
    function setBatchLoading(isLoading) {
        var btn = document.getElementById("generateBatchBtn");
        if (isLoading) {
            btn.disabled = true;
            btn.innerHTML = '<span class="btn-spinner"></span>生成中...';
        } else {
            btn.disabled = false;
            btn.textContent = "批量生成";
        }
    }

    /**
     * 处理批量生成的文件内容
     * @param {string} content - 文件文本内容
     */
    function handleBatchFileContent(content) {
        var output;
        try {
            output = Core.processBatchInput(content);
        } catch (error) {
            setBatchLoading(false);
            showToast(error.message, "error");
            return;
        }

        batchResults = output.csvText;
        document.getElementById("batchResultText").value = batchResults;
        document.getElementById("batchRowCount").textContent = output.resultCount + " 条结果";
        document.getElementById("batchColumnCount").textContent = "4 个链接输出";

        // 渲染错误汇总（如果有）及 oCityID 提示
        var errorContainer = document.getElementById("batchErrorSummary");
        errorContainer.innerHTML = renderErrorSummary(output.errors) + renderWarningSummary(output.warnings);

        buildBatchPreview(output.previewRows);
        document.getElementById("batchResult").style.display = "block";
        document.getElementById("batchResult").scrollIntoView({ behavior: "smooth" });

        setBatchLoading(false);

        if (output.errors.length > 0) {
            showToast(
                "生成完成：" + output.resultCount + " 条成功，" + output.errors.length + " 条失败",
                output.resultCount > 0 ? "success" : "error"
            );
        } else {
            showToast("批量生成完成，共 " + output.resultCount + " 条", "success");
        }
    }

    /**
     * 处理 Excel 行数据（绕过 CSV 转换，避免 URL 中逗号问题）
     * @param {string[][]} rows - sheet_to_json返回的二维数组
     */
    function handleXlsxData(rows) {
        if (!rows.length) {
            setBatchLoading(false);
            showToast("文件内容为空，请检查后重试", "error");
            return;
        }

        var previewRows = [];
        var results = [];
        var errors = [];
        var warnings = [];
        var headers = ["笔记ID", "投放链接", "refid",
            "素材类型", "业务线", "内容类型",
            "酒店城市", "酒店名称", "投放活动", "定向",
            "广告计划命名",
            "DP链接", "Universal Link", "兜底链接", "监测链接"];
        results.push(headers.join(","));
        previewRows.push(headers);

        // 检测表头行
        var firstRow = rows[0];
        var firstCell = String(firstRow[0] || "").toLowerCase();
        var hasNamingCols = firstRow.length >= 9;
        var startIndex = (firstCell.includes("笔记id") || firstCell.includes("noteid")) ? 1 : 0;

        for (var i = startIndex; i < rows.length; i++) {
            var row = rows[i];
            var cells = row.map(function (v) { return String(v || "").trim(); });

            // 跳过完全空行
            if (cells.every(function (c) { return !c; })) continue;

            try {
                var noteId = cells[0] || "";
                var appLink = cells[1] || "";
                var refid = cells[2] || "";

                if (!appLink || !refid) {
                    throw new Error("第 " + (i + 1) + " 行 的投放链接和 refid 不能为空");
                }

                var trimmedUrl = appLink.trim();
                if (trimmedUrl.indexOf("http://") !== 0 && trimmedUrl.indexOf("https://") !== 0) {
                    throw new Error("第 " + (i + 1) + " 行 的投放链接必须以 http:// 或 https:// 开头");
                }

                var materialType = hasNamingCols ? (cells[3] || "") : "";
                var bizLine = hasNamingCols ? (cells[4] || "") : "";
                var contentType = hasNamingCols ? (cells[5] || "") : "";
                var city = hasNamingCols ? (cells[6] || "") : "";
                var hotelName = hasNamingCols ? (cells[7] || "") : "";
                var activity = hasNamingCols ? (cells[8] || "") : "";
                var targeting = hasNamingCols ? (cells[9] || "") : "";

                // oCityID 注入：命中白名单 activitycode 且「酒店城市」列有值时追加
                var normalized = Core.normalizeAppLink(trimmedUrl, city);
                if (normalized.warning) {
                    warnings.push({ line: i + 1, message: normalized.warning });
                }

                var linkResult = Core.buildLinks({ appLink: normalized.appLink, refid: refid.trim() });

                var naming = "";
                if (materialType) {
                    naming = global.LinkGenNaming.buildNaming({
                        materialType: materialType,
                        bizLine: bizLine,
                        contentType: contentType,
                        city: city,
                        hotelName: hotelName,
                        noteId: noteId,
                        activity: activity,
                        targeting: targeting
                    });
                }

                results.push([
                    Core.escapeCsv(noteId), Core.escapeCsv(normalized.appLink), Core.escapeCsv(refid),
                    Core.escapeCsv(materialType), Core.escapeCsv(bizLine), Core.escapeCsv(contentType),
                    Core.escapeCsv(city), Core.escapeCsv(hotelName), Core.escapeCsv(activity), Core.escapeCsv(targeting),
                    Core.escapeCsv(naming),
                    Core.escapeCsv(linkResult.dpLink), Core.escapeCsv(linkResult.ulLink),
                    Core.escapeCsv(linkResult.fallbackLink), Core.escapeCsv(linkResult.trackLink)
                ].join(","));

                previewRows.push([
                    noteId, normalized.appLink, refid,
                    materialType, bizLine, contentType,
                    city, hotelName, activity, targeting,
                    naming,
                    linkResult.dpLink, linkResult.ulLink, linkResult.fallbackLink, linkResult.trackLink
                ]);
            } catch (lineErr) {
                errors.push({ line: i + 1, message: lineErr.message });
            }
        }

        batchResults = results.join("\n");
        document.getElementById("batchResultText").value = batchResults;
        document.getElementById("batchRowCount").textContent = (previewRows.length - 1) + " 条结果";
        document.getElementById("batchColumnCount").textContent = "4 个链接输出";

        var errorContainer = document.getElementById("batchErrorSummary");
        errorContainer.innerHTML = renderErrorSummary(errors) + renderWarningSummary(warnings);

        buildBatchPreview(previewRows);
        document.getElementById("batchResult").style.display = "block";
        document.getElementById("batchResult").scrollIntoView({ behavior: "smooth" });

        setBatchLoading(false);

        if (errors.length > 0) {
            showToast(
                "生成完成：" + (previewRows.length - 1) + " 条成功，" + errors.length + " 条失败",
                (previewRows.length - 1) > 0 ? "success" : "error"
            );
        } else {
            showToast("批量生成完成，共 " + (previewRows.length - 1) + " 条", "success");
        }
    }

    /**
     * 批量生成按钮点击处理
     */
    function generateBatchLinks() {
        var fileInput = document.getElementById("batchFile");
        if (!fileInput.files.length) {
            showToast("请先上传文件，可以先下载 Excel 模板填写后再上传", "error");
            return;
        }

        setBatchLoading(true);
        var file = fileInput.files[0];
        var ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'xlsx') {
            var reader = new FileReader();
            reader.onload = function (event) {
                try {
                    var data = new Uint8Array(event.target.result);
                    var workbook = XLSX.read(data, { type: 'array' });
                    var firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    var rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
                    handleXlsxData(rows);
                } catch (error) {
                    setBatchLoading(false);
                    showToast("Excel 文件解析失败，请检查文件格式", "error");
                }
            };
            reader.onerror = function () {
                setBatchLoading(false);
                showToast("文件读取失败，请重试", "error");
            };
            reader.readAsArrayBuffer(file);
        } else {
            var reader = new FileReader();
            reader.onload = function (event) {
                handleBatchFileContent(event.target.result);
            };
            reader.onerror = function () {
                setBatchLoading(false);
                showToast("文件读取失败，请重试", "error");
            };
            reader.readAsText(file, "utf-8");
        }
    }

    /* ========== CSV 下载 ========== */

    /**
     * 下载批量生成的 CSV
     */
    function downloadBatchCsv() {
        if (!batchResults) {
            showToast("还没有批量结果可下载", "error");
            return;
        }

        var blob = new Blob(["\uFEFF" + batchResults], { type: "text/csv;charset=utf-8;" });
        var url = URL.createObjectURL(blob);
        var anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "xhs-links-" + Date.now() + ".csv";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        showToast("CSV 下载已开始", "success");
    }

    /**
     * 下载批量生成的 Excel
     */
    function downloadBatchXlsx() {
        if (typeof XLSX === "undefined") {
            showToast("Excel 库加载失败，请刷新页面后重试", "error");
            return;
        }
        if (!batchResults) {
            showToast("还没有批量结果可下载", "error");
            return;
        }

        var rows = batchResults.split('\n').map(function (line) {
            return Core.parseCsvLine(line);
        });

        var ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
            {wch: 16}, {wch: 55}, {wch: 10}, {wch: 12},
            {wch: 12}, {wch: 14}, {wch: 18}, {wch: 24},
            {wch: 16}, {wch: 18}, {wch: 50},
            {wch: 85}, {wch: 70}, {wch: 70}, {wch: 95}
        ];

        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Results");
        XLSX.writeFile(wb, "xhs-links-" + Date.now() + ".xlsx");
        showToast("Excel 下载已开始", "success");
    }

    /**
     * 下载 Excel 模板文件
     */
    function downloadXlsxTemplate() {
        if (typeof XLSX === "undefined") {
            showToast("Excel 库加载失败，请刷新页面后重试", "error");
            return;
        }
        try {
        var data = [
            ["笔记ID", "投放链接", "refid",
             "素材类型", "业务线", "内容类型",
             "酒店城市", "酒店名称", "投放活动", "定向"],
            ["6123456789", "https://mp.elong.com/tenthousandaura/?activitycode=xxx", "123456",
             "图文", "酒店", "非标种草",
             "珠海", "珠海青竹书院酒店", "酒店内部价", "旅游高意向人群"],
            ["6987654321", "https://mp.elong.com/another-activity/", "789012",
             "视频", "酒店", "羊毛帖",
             "珠海", "", "酒店内部价", ""]
        ];

        var ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [
            {wch: 16}, {wch: 55}, {wch: 10},
            {wch: 12}, {wch: 12}, {wch: 14},
            {wch: 18}, {wch: 24}, {wch: 16}, {wch: 18}
        ];

        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "xhs-link-template.xlsx");
        showToast("Excel 模板下载已开始", "success");
        } catch (e) {
            showToast("Excel 下载失败：" + e.message, "error");
        }
    }

    /* ========== 复制到剪贴板 ========== */

    /**
     * 复制文本到剪贴板
     * @param {string} targetId - 目标 textarea 元素 ID
     * @param {HTMLButtonElement} button - 触发按钮
     */
    function copyToClipboard(targetId, button) {
        var element = document.getElementById(targetId);
        var text = element.value;

        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            // 降级方案
            element.select();
            try {
                document.execCommand("copy");
                showToast("已复制到剪贴板", "success");
            } catch (e) {
                showToast("复制失败，请手动复制", "error");
            }
            return;
        }

        navigator.clipboard.writeText(text).then(function () {
            var originalText = button.textContent;
            button.textContent = "已复制";
            setTimeout(function () {
                button.textContent = originalText;
            }, 1500);
        }).catch(function () {
            showToast("复制失败，请手动复制", "error");
        });
    }

    /* ========== 初始化 ========== */

    /**
     * 绑定所有事件监听器
     */
    function bindEvents() {
        // Tab 切换
        document.querySelectorAll(".tab-btn").forEach(function (button) {
            button.addEventListener("click", function () {
                switchTab(button.dataset.tab);
            });
        });

        // 单个生成
        document.getElementById("generateSingleBtn").addEventListener("click", generateSingleLinks);

        // 批量生成
        document.getElementById("generateBatchBtn").addEventListener("click", generateBatchLinks);

        // Excel 模板下载
        document.getElementById("downloadXlsxTemplateBtn").addEventListener("click", downloadXlsxTemplate);

        // 下载批量 CSV
        document.getElementById("downloadBatchCsvBtn").addEventListener("click", downloadBatchCsv);

        // 下载批量 Excel
        document.getElementById("downloadBatchXlsxBtn").addEventListener("click", downloadBatchXlsx);

        // 文件选择变化
        document.getElementById("batchFile").addEventListener("change", function (event) {
            var file = event.target.files[0];
            document.getElementById("selectedFileText").textContent = file ? "已选择文件：" + file.name : "未选择文件";
        });

        // 复制按钮（通过 data-copy-target 属性绑定）
        document.querySelectorAll("[data-copy-target]").forEach(function (button) {
            button.addEventListener("click", function () {
                copyToClipboard(button.dataset.copyTarget, button);
            });
        });

        // QR 码按钮
        document.querySelectorAll(".qr-toggle").forEach(function (button) {
            button.addEventListener("click", function () {
                var qrId = button.dataset.qrTarget;
                var textareaId = qrId.replace("Qr", "Result");
                toggleQrCode(qrId, textareaId, button);
            });
        });

        // 单个生成表单中按 Enter 直接生成
        document.querySelectorAll("#singleTab input").forEach(function (input) {
            input.addEventListener("keypress", function (event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    generateSingleLinks();
                }
            });
        });

        // 酒店名称条件显示：仅内容类型=非标种草时显示
        var ctSelect = document.getElementById("namingContentType");
        var hotelGroup = document.getElementById("hotelNameGroup");
        var updateHotelVisibility = function () {
            hotelGroup.style.display = ctSelect.value === "非标种草" ? "block" : "none";
        };
        ctSelect.addEventListener("change", updateHotelVisibility);
        updateHotelVisibility();

        // 广告计划命名折叠面板：默认收起，记忆用户展开/收起状态
        var namingPanel = document.getElementById("namingPanel");
        if (namingPanel && localStorage.getItem("namingPanelOpen") === "1") {
            namingPanel.open = true;
        }
        if (namingPanel) {
            namingPanel.addEventListener("toggle", function () {
                localStorage.setItem("namingPanelOpen", namingPanel.open ? "1" : "0");
            });
        }
    }

    /**
     * 初始化 oCityID 城市下拉选项（来自 LinkGenCityData）
     */
    function initCityDatalist() {
        var datalist = document.getElementById("ocityidCityList");
        if (!datalist || !global.LinkGenCityData) return;
        Object.keys(global.LinkGenCityData.cityIds).forEach(function (name) {
            var option = document.createElement("option");
            option.value = name;
            datalist.appendChild(option);
        });
    }

    /**
     * 初始化整个 UI
     */
    function init() {
        initCityDatalist();
        bindEvents();
    }

    global.LinkGenUI = {
        showToast: showToast,
        switchTab: switchTab,
        init: init
    };
})(window);
