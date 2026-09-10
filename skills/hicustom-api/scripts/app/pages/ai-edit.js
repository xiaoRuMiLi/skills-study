/* ai-edit.js — 通用「选中 → 右键 → AI 改写」挂件（零依赖）
 * ------------------------------------------------------------------
 * 用法：页面引入一行即可启用
 *     <script src="/ai-edit.js"></script>
 * 生效范围：所有 textarea / 可编辑区([contenteditable]) / 带 [data-ai-edit] 的元素
 * 交互：选中文字 → 右键 → 「✨ AI 改写」→ 对话框输入要求 → 直接原地替换
 * 撤销：走浏览器原生 Ctrl+Z（替换用 execCommand('insertText')，保留编辑历史）
 * 后端：POST /api/ai/run { type:'text.rewrite', payload:{ text, instruction, context? } } → { result:{ text } }
 *
 * 说明：指令与文本无关（任何字段都能用）；将来要支持"任意可选文字"，
 * 只需给那些元素加 data-ai-edit，或把下方 TARGET 选择器放宽即可。
 */
(function () {
  'use strict';
  if (window.__aiEdit) return;
  window.__aiEdit = true;

  var TARGET = 'textarea, [contenteditable=""], [contenteditable="true"], [data-ai-edit]';
  var CHIPS = ['改写', '缩短', '扩写', '更专业', '更口语', '更醒目', '换个说法'];
  var API = '/api/ai/run';

  // ---------- 样式 ----------
  var css = ''
    + '.aie-menu{position:fixed;z-index:2147483000;background:#fff;border:1px solid #e3e6e6;border-radius:8px;'
    + 'box-shadow:0 6px 24px rgba(0,0,0,.16);padding:4px;font:13px/1.4 "Microsoft YaHei",Arial,sans-serif;min-width:132px}'
    + '.aie-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:8px 12px;border-radius:6px;cursor:pointer;font:inherit;color:#0f1111}'
    + '.aie-menu button:hover{background:#f2f3f5}'
    + '.aie-dlg{position:fixed;z-index:2147483001;width:380px;max-width:92vw;background:#fff;border:1px solid #e3e6e6;'
    + 'border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.22);padding:14px;font:13px/1.5 "Microsoft YaHei",Arial,sans-serif;color:#0f1111}'
    + '.aie-dlg h4{margin:0 0 8px;font-size:13px;color:#565959;font-weight:600}'
    + '.aie-snip{background:#f7f7f8;border:1px solid #ececec;border-radius:8px;padding:8px 10px;max-height:96px;overflow:auto;'
    + 'color:#565959;white-space:pre-wrap;word-break:break-word;margin-bottom:8px}'
    + '.aie-dlg textarea{width:100%;box-sizing:border-box;min-height:52px;resize:vertical;padding:8px 10px;border:1px solid #e3e6e6;border-radius:8px;font:inherit;margin-bottom:8px}'
    + '.aie-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}'
    + '.aie-chips span{border:1px solid #e3e6e6;border-radius:20px;padding:3px 10px;cursor:pointer;font-size:12px;color:#007185;background:#fff}'
    + '.aie-chips span:hover{border-color:#e8590c;color:#e8590c}'
    + '.aie-acts{display:flex;gap:10px;justify-content:flex-end;align-items:center}'
    + '.aie-acts .sp{color:#b91c1c;font-size:12px;margin-right:auto}'
    + '.aie-acts button{font:inherit;padding:7px 14px;border:1px solid #e3e6e6;background:#fff;border-radius:8px;cursor:pointer}'
    + '.aie-acts button.primary{background:#e8590c;border-color:#e8590c;color:#fff}'
    + '.aie-acts button:disabled{opacity:.5;cursor:not-allowed}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ---------- 记录最近一次有效选区（只有非空选区才覆盖，右键不会清掉） ----------
  var last = null; // { el, start, end, text, range }
  function inTarget(node) { try { return node && node.closest && node.closest(TARGET); } catch (e) { return null; } }

  function capture() {
    var el = document.activeElement, t = el && inTarget(el);
    if (t && t.tagName === 'TEXTAREA') {
      var s = t.selectionStart, e = t.selectionEnd;
      if (s != null && e != null && e > s) { last = { el: t, start: s, end: e, text: t.value.slice(s, e), range: null }; }
      return;
    }
    var sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) {
      var r = sel.getRangeAt(0);
      var host = r.startContainer && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement);
      var tgt = host && inTarget(host);
      if (tgt && (tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) {
        last = { el: tgt, start: null, end: null, text: r.toString(), range: r.cloneRange() };
      }
    }
  }
  document.addEventListener('mouseup', function () { setTimeout(capture, 0); }, true);
  document.addEventListener('keyup', function () { setTimeout(capture, 0); }, true);

  // ---------- 右键菜单 ----------
  var menu = null, dlg = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  function closeDlg() { if (dlg) { dlg.remove(); dlg = null; } }
  document.addEventListener('mousedown', function (e) { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeMenu(); closeDlg(); } }, true);

  document.addEventListener('contextmenu', function (e) {
    var t = inTarget(e.target); if (!t) return;
    if (!last || !last.text || !(last.el === t || (last.el && last.el.contains && last.el.contains(e.target)))) {
      // 兜底：此刻 textarea 有实时选区就用它
      if (t.tagName === 'TEXTAREA' && t.selectionEnd > t.selectionStart) {
        last = { el: t, start: t.selectionStart, end: t.selectionEnd, text: t.value.slice(t.selectionStart, t.selectionEnd), range: null };
      } else { return; }
    }
    e.preventDefault(); closeMenu(); closeDlg();
    menu = document.createElement('div'); menu.className = 'aie-menu';
    var b = document.createElement('button'); b.textContent = '✨ AI 改写';
    b.onclick = function () { closeMenu(); openDlg(e.clientX, e.clientY); };
    menu.appendChild(b);
    document.body.appendChild(menu);
    var w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.min(e.clientX, window.innerWidth - w - 8) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - h - 8) + 'px';
  }, true);

  // ---------- 对话框（单次改写） ----------
  function apply(newText) {
    if (!last) return;
    var el = last.el;
    try {
      if (el.tagName === 'TEXTAREA') {
        el.focus();
        el.setSelectionRange(last.start, last.end);
        var ok = document.execCommand('insertText', false, newText); // 保留原生撤销
        if (!ok) el.setRangeText(newText, last.start, last.end, 'end');
      } else {
        el.focus();
        var sel = window.getSelection(); sel.removeAllRanges();
        if (last.range) sel.addRange(last.range);
        if (!document.execCommand('insertText', false, newText)) {
          if (last.range) { last.range.deleteContents(); last.range.insertNode(document.createTextNode(newText)); }
        }
      }
      el.dispatchEvent(new Event('input', { bubbles: true })); // 触发 autoGrow 等
    } catch (err) { alert('替换失败: ' + err.message); }
  }

  function openDlg(x, y) {
    closeDlg();
    var snippet = last.text.length > 160 ? last.text.slice(0, 160) + '…' : last.text;
    dlg = document.createElement('div'); dlg.className = 'aie-dlg';
    dlg.innerHTML = '<h4>✨ AI 改写（选中 ' + last.text.length + ' 字）</h4>'
      + '<div class="aie-snip"></div>'
      + '<textarea placeholder="想让 AI 怎么改？例如：改这一段 / 更明亮 / 缩短一半 / 换专业语气"></textarea>'
      + '<div class="aie-chips">' + CHIPS.map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</div>'
      + '<div class="aie-acts"><span class="sp"></span>'
      + '<button class="cancel">取消</button><button class="primary go">改写</button></div>';
    dlg.querySelector('.aie-snip').textContent = snippet;
    document.body.appendChild(dlg);
    var w = dlg.offsetWidth, h = dlg.offsetHeight;
    dlg.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
    dlg.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';

    var ta = dlg.querySelector('textarea'), go = dlg.querySelector('.go'), sp = dlg.querySelector('.sp');
    ta.focus();
    dlg.querySelectorAll('.aie-chips span').forEach(function (c) {
      c.onclick = function () { ta.value = c.textContent; ta.focus(); };
    });
    dlg.querySelector('.cancel').onclick = closeDlg;

    function run() {
      var instruction = (ta.value || '').trim();
      go.disabled = true; go.textContent = '改写中…'; sp.textContent = '';
      fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text.rewrite', payload: { text: last.text, instruction: instruction } }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok) throw new Error(j.err || '失败');
          apply(j.result.text); closeDlg();
        })
        .catch(function (e) { sp.textContent = '失败: ' + e.message; go.disabled = false; go.textContent = '改写'; });
    }
    go.onclick = run;
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } });
  }
})();
