/**
 * LinkGenUI \u2014 \u754c\u9762\u4ea4\u4e92\u6a21\u5757
 * \u5bfc\u51fa\u5168\u5c40 LinkGenUI \u5bf9\u8c61
 * \u4f9d\u8d56\uff1aLinkGenConfig\u3001LinkGenCore\uff08\u9700\u5148\u52a0\u8f7d js/config.js \u548c js/generator.js\uff09
 */
(function (global) {
    "use strict";

    var Core = global.LinkGenCore;

    /* ========== Toast \u901a\u77e5 ========== */

    /** @type {HTMLElement|null} toast \u5bb9\u5668 */
    var toastContainer = null;

    /**
     * \u83b7\u53d6\u6216\u521b\u5efa toast \u5bb9\u5668
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
     * \u663e\u793a toast \u901a\u77e5
     * @param {string} message - \u901a\u77e5\u6587\u672c
     * @param {"error"|"success"} [type="success"] - \u901a\u77e5\u7c7b\u578b
     */
    function showToast(message, type) {
        var container = getToastContainer();
        var toast = document.createElement("div");
        toast.className = "toast " + (type === "error" ? "toast-error" : "toast-success");
        toast.textContent = message;

        container.appendChild(toast);

        // 3 \u79d2\u540e\u81ea\u52a8\u79fb\u9664
        setTimeout(function () {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }

    /* ========== \u6279\u91cf\u7ed3\u679c\u5b58\u50a8 ========== */

    /** @type {string} \u6279\u91cf\u751f\u6210\u7684 CSV \u6587\u672c */
    var batchResults = "";

    /* ========== Tab \u5207\u6362 ========== */

    /**
     * \u5207\u6362\u6807\u7b7e\u9875\uff08\u5355\u4e2a / \u6279\u91cf\uff09
     * \u53ea\u5207\u6362\u8868\u5355\u533a\u57df\u7684\u663e\u793a\uff0c\u4e0d\u9690\u85cf\u5df2\u6709\u7684\u7ed3\u679c\u9762\u677f
     * @param {string} tabName - "single" \u6216 "batch"
     */
    function switchTab(tabName) {
        // \u66f4\u65b0 tab \u6309\u94ae\u72b6\u6001
        document.querySelectorAll(".tab-btn").forEach(function (button) {
            button.classList.toggle("active", button.dataset.tab === tabName);
        });

        // \u5207\u6362\u8868\u5355\u533a\u57df
        document.getElementById("singleTab").style.display = tabName === "single" ? "block" : "none";
        document.getElementById("batchTab").style.display = tabName === "batch" ? "block" : "none";

        // \u5207 tab \u65f6\u9690\u85cf\u5bf9\u65b9\u7684\u7ed3\u679c\u9762\u677f\uff0c\u5207\u56de\u65f6\u81ea\u5df1\u7684\u4ecd\u5728
        if (tabName === "batch") {
            document.getElementById("resultCard").style.display = "none";
        }
        if (tabName === "single") {
            document.getElementById("batchResult").style.display = "none";
        }
    }

    /* ========== \u5355\u4e2a\u751f\u6210 ========== */

    /**
     * \u6e32\u67d3\u5355\u4e2a\u751f\u6210\u7684\u7ed3\u679c\u5230\u7ed3\u679c\u5361\u7247
     * @param {{ dpLink: string, ulLink: string, fallbackLink: string, trackLink: string }} result
     */
    function renderSingleResult(result) {
        document.getElementById("dpResult").value = result.dpLink;
        document.getElementById("ulResult").value = result.ulLink;
        document.getElementById("fallbackResult").value = result.fallbackLink;
        document.getElementById("trackResult").value = result.trackLink;
        document.getElementById("resultCard").style.display = "block";
        document.getElementById("resultCard").scrollIntoView({ behavior: "smooth" });
    }

    /**
     * \u5355\u4e2a\u751f\u6210\u6309\u94ae\u70b9\u51fb\u5904\u7406
     */
    function generateSingleLinks() {
        try {
            var payload = {
                appLink: document.getElementById("appLink").value,
                refid: document.getElementById("refid").value,
                noteId: document.getElementById("noteid").value
            };

            Core.validateRequiredFields(payload, "\u5f53\u524d\u8f93\u5165");
            var result = Core.buildLinks({
                appLink: payload.appLink.trim(),
                refid: payload.refid.trim()
            });
            renderSingleResult(result);
            showToast("\u94fe\u63a5\u751f\u6210\u6210\u529f", "success");
        } catch (error) {
            showToast(error.message, "error");
        }
    }

    /* ========== \u6279\u91cf\u751f\u6210 ========== */

    /**
     * \u6784\u5efa\u6279\u91cf\u7ed3\u679c\u9884\u89c8\u8868\u683c
     * @param {string[][]} rows - \u9884\u89c8\u6570\u636e\uff08\u7b2c\u4e00\u884c\u4e3a\u8868\u5934\uff09
     */
    function buildBatchPreview(rows) {
        var head = document.getElementById("batchPreviewHead");
        var body = document.getElementById("batchPreviewBody");

        head.innerHTML = "";
        body.innerHTML = "";

        if (!rows.length) {
            body.innerHTML = '<tr><td class="preview-empty">\u751f\u6210\u540e\u4f1a\u5728\u8fd9\u91cc\u663e\u793a\u9884\u89c8</td></tr>';
            return;
        }

        var headers = ["\u7b14\u8bb0ID", "\u6295\u653e\u94fe\u63a5", "refid", "\u751f\u6210\u7ed3\u679c"];
        headers.forEach(function (header) {
            var th = document.createElement("th");
            th.textContent = header;
            head.appendChild(th);
        });

        // \u8df3\u8fc7\u8868\u5934\u884c\uff0c\u6700\u591a\u663e\u793a\u524d 10 \u6761
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
            badge.textContent = "4 \u4e2a\u94fe\u63a5\u5df2\u751f\u6210";
            statusTd.appendChild(badge);
            tr.appendChild(statusTd);

            body.appendChild(tr);
        });

        if (!previewRows.length) {
            body.innerHTML = '<tr><td class="preview-empty" colspan="' + headers.length + '">\u6ca1\u6709\u53ef\u9884\u89c8\u7684\u6570\u636e</td></tr>';
        }
    }

    /**
     * \u6e32\u67d3\u9519\u8bef\u6c47\u603b\u533a\u57df
     * @param {{ line: number, message: string }[]} errors
     * @returns {string} HTML \u5b57\u7b26\u4e32
     */
    function renderErrorSummary(errors) {
        if (!errors.length) {
            return "";
        }
        var html = '<div class="error-summary">';
        html += '<div class="error-title">\u26a0 \u4ee5\u4e0b\u884c\u5904\u7406\u5931\u8d25\uff0c\u5df2\u8df3\u8fc7\uff1a</div><ul>';
        errors.forEach(function (err) {
            html += '<li>\u7b2c ' + err.line + ' \u884c\uff1a' + err.message + '</li>';
        });
        html += '</ul></div>';
        return html;
    }

    /**
     * \u8bbe\u7f6e\u6279\u91cf\u751f\u6210\u6309\u94ae\u7684 loading \u72b6\u6001
     * @param {boolean} isLoading
     */
    function setBatchLoading(isLoading) {
        var btn = document.getElementById("generateBatchBtn");
        if (isLoading) {
            btn.disabled = true;
            btn.innerHTML = '<span class="btn-spinner"></span>\u751f\u6210\u4e2d...';
        } else {
            btn.disabled = false;
            btn.textContent = "\u6279\u91cf\u751f\u6210";
        }
    }

    /**
     * \u5904\u7406\u6279\u91cf\u751f\u6210\u7684\u6587\u4ef6\u5185\u5bb9
     * @param {string} content - \u6587\u4ef6\u6587\u672c\u5185\u5bb9
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
        document.getElementById("batchRowCount").textContent = output.resultCount + " \u6761\u7ed3\u679c";
        document.getElementById("batchColumnCount").textContent = "4 \u4e2a\u94fe\u63a5\u8f93\u51fa";

        // \u6e32\u67d3\u9519\u8bef\u6c47\u603b\uff08\u5982\u679c\u6709\uff09
        var errorContainer = document.getElementById("batchErrorSummary");
        errorContainer.innerHTML = renderErrorSummary(output.errors);

        buildBatchPreview(output.previewRows);
        document.getElementById("batchResult").style.display = "block";
        document.getElementById("batchResult").scrollIntoView({ behavior: "smooth" });

        setBatchLoading(false);

        if (output.errors.length > 0) {
            showToast(
                "\u751f\u6210\u5b8c\u6210\uff1a" + output.resultCount + " \u6761\u6210\u529f\uff0c" + output.errors.length + " \u6761\u5931\u8d25",
                output.resultCount > 0 ? "success" : "error"
            );
        } else {
            showToast("\u6279\u91cf\u751f\u6210\u5b8c\u6210\uff0c\u5171 " + output.resultCount + " \u6761", "success");
        }
    }

    /**
     * \u6279\u91cf\u751f\u6210\u6309\u94ae\u70b9\u51fb\u5904\u7406
     */
    function generateBatchLinks() {
        var fileInput = document.getElementById("batchFile");
        if (!fileInput.files.length) {
            showToast("\u8bf7\u5148\u4e0a\u4f20\u6587\u4ef6\uff0c\u53ef\u4ee5\u5148\u4e0b\u8f7d Excel \u6a21\u677f\u586b\u5199\u540e\u518d\u4e0a\u4f20", "error");
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
                    var csvText = XLSX.utils.sheet_to_csv(firstSheet);
                    handleBatchFileContent(csvText);
                } catch (error) {
                    setBatchLoading(false);
                    showToast("Excel \u6587\u4ef6\u89e3\u6790\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u6587\u4ef6\u683c\u5f0f", "error");
                }
            };
            reader.onerror = function () {
                setBatchLoading(false);
                showToast("\u6587\u4ef6\u8bfb\u53d6\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5", "error");
            };
            reader.readAsArrayBuffer(file);
        } else {
            var reader = new FileReader();
            reader.onload = function (event) {
                handleBatchFileContent(event.target.result);
            };
            reader.onerror = function () {
                setBatchLoading(false);
                showToast("\u6587\u4ef6\u8bfb\u53d6\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5", "error");
            };
            reader.readAsText(file, "utf-8");
        }
    }

    /* ========== CSV \u4e0b\u8f7d ========== */

    /**
     * \u4e0b\u8f7d\u6279\u91cf\u751f\u6210\u7684 CSV
     */
    function downloadBatchCsv() {
        if (!batchResults) {
            showToast("\u8fd8\u6ca1\u6709\u6279\u91cf\u7ed3\u679c\u53ef\u4e0b\u8f7d", "error");
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
        showToast("CSV \u4e0b\u8f7d\u5df2\u5f00\u59cb", "success");
    }

    /**
     * \u4e0b\u8f7d\u6279\u91cf\u751f\u6210\u7684 Excel
     */
    function downloadBatchXlsx() {
        if (typeof XLSX === "undefined") {
            showToast("Excel \u5e93\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u540e\u91cd\u8bd5", "error");
            return;
        }
        if (!batchResults) {
            showToast("\u8fd8\u6ca1\u6709\u6279\u91cf\u7ed3\u679c\u53ef\u4e0b\u8f7d", "error");
            return;
        }

        var rows = batchResults.split('\n').map(function (line) {
            return line.split(',').map(function (cell) {
                return cell.replace(/^"|"$/g, '').replace(/""/g, '"');
            });
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
        showToast("Excel \u4e0b\u8f7d\u5df2\u5f00\u59cb", "success");
    }

    /**
     * \u4e0b\u8f7d Excel \u6a21\u677f\u6587\u4ef6
     */
    function downloadXlsxTemplate() {
        if (typeof XLSX === "undefined") {
            showToast("Excel \u5e93\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u540e\u91cd\u8bd5", "error");
            return;
        }
        try {
        var data = [
            ["\u7b14\u8bb0ID", "\u6295\u653e\u94fe\u63a5", "refid",
             "\u7d20\u6750\u7c7b\u578b", "\u4e1a\u52a1\u7ebf", "\u5185\u5bb9\u7c7b\u578b",
             "\u9152\u5e97\u57ce\u5e02", "\u9152\u5e97\u540d\u79f0", "\u6295\u653e\u6d3b\u52a8", "\u5b9a\u5411"],
            ["6123456789", "https://mp.elong.com/tenthousandaura/?activitycode=xxx", "123456",
             "\u56fe\u6587", "\u9152\u5e97", "\u975e\u6807\u79cd\u8349",
             "\u73e0\u6d77", "\u73e0\u6d77\u9752\u7af9\u4e66\u9662\u9152\u5e97", "\u9152\u5e97\u5185\u90e8\u4ef7", "\u65c5\u6e38\u9ad8\u610f\u5411\u4eba\u7fa4"],
            ["6987654321", "https://mp.elong.com/another-activity/", "789012",
             "\u89c6\u9891", "\u9152\u5e97", "\u7f8a\u6bdb\u5e16",
             "\u73e0\u6d77", "", "\u9152\u5e97\u5185\u90e8\u4ef7", ""]
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
        showToast("Excel \u6a21\u677f\u4e0b\u8f7d\u5df2\u5f00\u59cb", "success");
        } catch (e) {
            showToast("Excel \u4e0b\u8f7d\u5931\u8d25\uff1a" + e.message, "error");
        }
    }

    /* ========== \u590d\u5236\u5230\u526a\u8d34\u677f ========== */

    /**
     * \u590d\u5236\u6587\u672c\u5230\u526a\u8d34\u677f
     * @param {string} targetId - \u76ee\u6807 textarea \u5143\u7d20 ID
     * @param {HTMLButtonElement} button - \u89e6\u53d1\u6309\u94ae
     */
    function copyToClipboard(targetId, button) {
        var element = document.getElementById(targetId);
        var text = element.value;

        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            // \u964d\u7ea7\u65b9\u6848
            element.select();
            try {
                document.execCommand("copy");
                showToast("\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f", "success");
            } catch (e) {
                showToast("\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u590d\u5236", "error");
            }
            return;
        }

        navigator.clipboard.writeText(text).then(function () {
            var originalText = button.textContent;
            button.textContent = "\u5df2\u590d\u5236";
            setTimeout(function () {
                button.textContent = originalText;
            }, 1500);
        }).catch(function () {
            showToast("\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u590d\u5236", "error");
        });
    }

    /* ========== \u521d\u59cb\u5316 ========== */

    /**
     * \u7ed1\u5b9a\u6240\u6709\u4e8b\u4ef6\u76d1\u542c\u5668
     */
    function bindEvents() {
        // Tab \u5207\u6362
        document.querySelectorAll(".tab-btn").forEach(function (button) {
            button.addEventListener("click", function () {
                switchTab(button.dataset.tab);
            });
        });

        // \u5355\u4e2a\u751f\u6210
        document.getElementById("generateSingleBtn").addEventListener("click", generateSingleLinks);

        // \u6279\u91cf\u751f\u6210
        document.getElementById("generateBatchBtn").addEventListener("click", generateBatchLinks);

        // Excel \u6a21\u677f\u4e0b\u8f7d
        document.getElementById("downloadXlsxTemplateBtn").addEventListener("click", downloadXlsxTemplate);

        // \u4e0b\u8f7d\u6279\u91cf CSV
        document.getElementById("downloadBatchCsvBtn").addEventListener("click", downloadBatchCsv);

        // \u4e0b\u8f7d\u6279\u91cf Excel
        document.getElementById("downloadBatchXlsxBtn").addEventListener("click", downloadBatchXlsx);

        // \u6587\u4ef6\u9009\u62e9\u53d8\u5316
        document.getElementById("batchFile").addEventListener("change", function (event) {
            var file = event.target.files[0];
            document.getElementById("selectedFileText").textContent = file ? "\u5df2\u9009\u62e9\u6587\u4ef6\uff1a" + file.name : "\u672a\u9009\u62e9\u6587\u4ef6";
        });

        // \u590d\u5236\u6309\u94ae\uff08\u901a\u8fc7 data-copy-target \u5c5e\u6027\u7ed1\u5b9a\uff09
        document.querySelectorAll("[data-copy-target]").forEach(function (button) {
            button.addEventListener("click", function () {
                copyToClipboard(button.dataset.copyTarget, button);
            });
        });

        // \u5355\u4e2a\u751f\u6210\u8868\u5355\u4e2d\u6309 Enter \u76f4\u63a5\u751f\u6210
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
     * \u521d\u59cb\u5316\u6574\u4e2a UI
     */
    function init() {
        bindEvents();
    }

    global.LinkGenUI = {
        showToast: showToast,
        switchTab: switchTab,
        init: init
    };
})(window);
