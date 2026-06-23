(function (ns) {
  "use strict";

  const URL_PATTERN = /(https?:\/\/[^\s<>"')]+)/g;
  const MARKDOWN_LINK_PATTERN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/gi;

  function $(id) {
    return document.getElementById(id);
  }

  function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function textToHtml(value) {
    const text = String(value == null ? "" : value);
    let html = "";
    let lastIndex = 0;
    let match;

    MARKDOWN_LINK_PATTERN.lastIndex = 0;
    while ((match = MARKDOWN_LINK_PATTERN.exec(text)) !== null) {
      html += autoLinkHtml(text.slice(lastIndex, match.index));
      html += linkToHtml(match[1], match[2]);
      lastIndex = match.index + match[0].length;
    }

    html += autoLinkHtml(text.slice(lastIndex));
    return html.replace(/\n/g, "<br>");
  }

  function autoLinkHtml(value) {
    return escapeHtml(value).replace(URL_PATTERN, function (url) {
      const href = url.replace(/&amp;/g, "&");
      return '<a href="' + escapeAttribute(href) + '" target="_blank" rel="noopener noreferrer">' + url + "</a>";
    });
  }

  function linkToHtml(label, url) {
    const href = safeLinkUrl(url);
    if (!href) return escapeHtml(label);
    return '<a href="' + escapeAttribute(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + "</a>";
  }

  function normalizeLinkUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return safeLinkUrl(url);
    return safeLinkUrl("https://" + url);
  }

  function safeLinkUrl(value) {
    const url = String(value || "").trim();
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
    return "";
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function timestamp(date) {
    const d = date || new Date();
    const pad = function (value) {
      return String(value).padStart(2, "0");
    };
    return [
      d.getFullYear(),
      pad(d.getMonth() + 1),
      pad(d.getDate())
    ].join("") + "_" + [
      pad(d.getHours()),
      pad(d.getMinutes()),
      pad(d.getSeconds())
    ].join("");
  }

  function uid(prefix) {
    const random = Math.random().toString(36).slice(2, 8);
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + random;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value) || 0, min), max);
  }

  function sanitizeFileName(value, fallback) {
    const name = String(value || fallback || "procedure")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/^_+|_+$/g, "");
    return name || fallback || "procedure";
  }

  function downloadText(fileName, content, type) {
    const blob = new Blob([content], { type: type || "text/plain;charset=utf-8" });
    downloadBlob(fileName, blob);
  }

  function downloadBlob(fileName, blob) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error("ファイルを読めませんでした。")); };
      reader.readAsText(file);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !String(file.type || "").startsWith("image/")) {
        reject(new Error("画像ファイルを選択してください。"));
        return;
      }
      const reader = new FileReader();
      reader.onload = function () { resolve({ dataUrl: reader.result, name: file.name || "screenshot.png" }); };
      reader.onerror = function () { reject(reader.error || new Error("画像を読めませんでした。")); };
      reader.readAsDataURL(file);
    });
  }

  function firstImageFileFromClipboard(event) {
    const items = Array.from((event.clipboardData && event.clipboardData.items) || []);
    for (const item of items) {
      if (String(item.type || "").startsWith("image/")) {
        return item.getAsFile();
      }
    }
    return null;
  }

  function lowerText(value) {
    return String(value || "").toLocaleLowerCase();
  }

  function toast(message) {
    const node = $("toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(node._toastTimer);
    node._toastTimer = setTimeout(function () {
      node.classList.remove("show");
    }, 2200);
  }

  ns.utils = {
    $,
    $$,
    escapeHtml,
    escapeAttribute,
    textToHtml,
    normalizeLinkUrl,
    todayIso,
    timestamp,
    uid,
    clamp,
    sanitizeFileName,
    downloadText,
    downloadBlob,
    readFileAsText,
    readFileAsDataUrl,
    firstImageFileFromClipboard,
    lowerText,
    toast
  };
})(window.ProcedureEditor = window.ProcedureEditor || {});
