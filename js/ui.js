/**
 * LinkGenUI — 界面交互模块
 * 导出全局 LinkGenUI 对象
 * 依赖：LinkGenConfig、LinkGenCore、LinkGenNaming
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

    /* ========== 批量结果存储 ========== */

    /** @type {string} 批量生成的 CSV 文本 */
    var batchResults = "";

    /* ========== Tab 切换 ========== */

    /**
     * 切换标签页（单个 / 批量）
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

        // 切 tab 时隐藏其他 tab 的结果面板
        if (tabName !== "single") {
            document.getElementById("resultCard").style.display = "none";
        }
        if (tabName !== "batch") {
            document.getElementById("batchResult").style.display = "none";
        }
    }

    /* ========== 单个生成 ========== */

    /**
     * 渲染单个生成的结果到结果卡片
     * @param {{ naming: string, dpLink: string, ulLink: string, fallbackLink: string, trackLink: string }} result
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
            var linkResult = Core.buildLinks({
                appLink: payload.appLink.trim(),
                refid: payload.refid.trim()
            });

            // 生成命名
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
                dpLink: linkResult.dpLink,
                ulLink: linkResult.ulLink,
                fallbackLink: linkResult.fallbackLink,
                trackLink: linkResult.trackLink
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

        var headers = ["笔记ID", "投放链接", "refid", "广告计划命名", "生成结果"];
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

            var namingTd = document.createElement("td");
            namingTd.textContent = row[10] || "-";
            tr.appendChild(namingTd);

            var statusTd = document.createElement("td");
            var badge = document.createElement("span");
            badge.className = "status-badge";
            badge.textContent = "4个链接已生成";
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
        html += '<div class="error-title">⚠ 以下行处理失败，已跳过：</div><ul>';
        errors.forEach(function (err) {
            html += '<li>第 ' + err.line + ' 行：' + err.message + '</li>';
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

        // 渲染错误汇总（如果有）
        var errorContainer = document.getElementById("batchErrorSummary");
        errorContainer.innerHTML = renderErrorSummary(output.errors);

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
     * 批量生成按钮点击处理
     */
    function generateBatchLinks() {
        var fileInput = document.getElementById("batchFile");
        if (!fileInput.files.length) {
            showToast("请先上传文件，可以先下载 CSV 模板填写后再上传", "error");
            return;
        }

        setBatchLoading(true);

        var reader = new FileReader();
        reader.onload = function (event) {
            handleBatchFileContent(event.target.result);
        };
        reader.onerror = function () {
            setBatchLoading(false);
            showToast("文件读取失败，请重试", "error");
        };
        reader.readAsText(fileInput.files[0], "utf-8");
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
     * 下载 CSV 模板文件
     */
    function downloadTemplate() {
        var templateContent = [
            "笔记ID,投放链接,refid,素材类型,业务线,内容类型,酒店城市,酒店名称,投放活动,定向",
            "6123456789,https://mp.elong.com/tenthousandaura/?activitycode=xxx,123456,图文,酒店,非标种草,珠海,珠海青竹书院酒店,酒店内部价,旅游高意向人群",
            "6987654321,https://mp.elong.com/another-activity/,789012,视频,酒店,羊毛帖,珠海,,酒店内部价,"
        ].join("\n");

        var blob = new Blob(["\uFEFF" + templateContent], { type: "text/csv;charset=utf-8;" });
        var url = URL.createObjectURL(blob);
        var anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "xhs-link-template.csv";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        showToast("模板下载已开始", "success");
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

        // 下载模板
        document.getElementById("downloadTemplateBtn").addEventListener("click", downloadTemplate);

        // 下载批量 CSV
        document.getElementById("downloadBatchCsvBtn").addEventListener("click", downloadBatchCsv);

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

        // 单个生成表单中按 Enter 直接生成
        document.querySelectorAll("#singleTab input").forEach(function (input) {
            input.addEventListener("keypress", function (event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    generateSingleLinks();
                }
            });
        });
    }

    /**
     * 初始化整个 UI
     */
    function init() {
        bindEvents();

        // 酒店名称条件显示
        var ctSelect = document.getElementById("namingContentType");
        if (ctSelect) {
            ctSelect.addEventListener("change", function () {
                var hotelGroup = document.getElementById("hotelNameGroup");
                if (hotelGroup) {
                    hotelGroup.style.display = this.value === "非标种草" ? "block" : "none";
                }
            });
            // 初始状态
            var hotelGroup = document.getElementById("hotelNameGroup");
            if (hotelGroup) {
                hotelGroup.style.display = ctSelect.value === "非标种草" ? "block" : "none";
            }
        }
    }

    global.LinkGenUI = {
        showToast: showToast,
        switchTab: switchTab,
        init: init
    };
})(window);
