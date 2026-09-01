# -*- coding: utf-8 -*-
"""HTML 渲染层：ECharts K线图（仿交易软件）。

生成自包含 HTML，包含:
  - 主图: 蜡烛图(K线) + 均线(MA) + 布林线(BOLL)
  - 副图1: 成交量柱状图 (红涨绿跌)
  - 副图2: MACD/RSI 指标(可选)
  - 买卖点标记: 买入↑向上箭头(红), 卖出↓向下箭头(绿) — 叠加在K线上

ECharts 通过 CDN 引入；若本地 assets/echarts.min.js 存在则优先离线嵌入。
"""
import base64
import os
from datetime import datetime

import pandas as pd

ECHARTS_CDN = "https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"
ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")


def _load_echarts_script():
    """优先加载本地 echarts.min.js（离线可用），否则用 CDN 地址。"""
    local = os.path.abspath(os.path.join(ASSETS_DIR, "echarts.min.js"))
    if os.path.exists(local):
        try:
            with open(local, "r", encoding="utf-8") as f:
                js = f.read()
            return f"<script>{js}</script>"
        except Exception:  # noqa: BLE001
            pass
    return f'<script src="{ECHARTS_CDN}"></script>'


def _build_ohlc_data(df):
    """转成 ECharts candlestick 需要的 [open, close, low, high] 序列。"""
    return [[round(r["open"], 2), round(r["close"], 2), round(r["low"], 2), round(r["high"], 2)]
            for _, r in df.iterrows()]


def _build_markers(df, trades):
    """生成买卖点标记数据 (markPoint data)。买入↑红，卖出↓绿。"""
    buy_map, sell_map = {}, {}
    for _, t in trades.iterrows():
        if t["type"] == "buy":
            buy_map[t["date"]] = t["price"]
        elif t["type"] == "sell":
            sell_map[t["date"]] = t["price"]
    data = []
    for _, r in df.iterrows():
        d = r["date"].strftime("%Y-%m-%d")
        if d in buy_map:
            data.append({"name": "买入", "coord": [d, r["high"] * 1.01],
                         "value": round(buy_map[d], 2), "tradeType": "buy"})
        if d in sell_map:
            data.append({"name": "卖出", "coord": [d, r["low"] * 0.99],
                         "value": round(sell_map[d], 2), "tradeType": "sell"})
    return data


def _build_series(df, ma_list, use_boll, use_vol, vol_ma_list=(5, 10)):
    """构建主图 series + 副图 series 的 ECharts option 数据。"""
    dates = [r["date"].strftime("%Y-%m-%d") for _, r in df.iterrows()]
    candlestick = {
        "name": "K线", "type": "candlestick",
        "data": _build_ohlc_data(df),
        "itemStyle": {"color": "#ef232a", "color0": "#14b143",
                      "borderColor": "#ef232a", "borderColor0": "#14b143"},
    }
    series = [candlestick]

    # 均线
    for n in ma_list:
        ma_col = f"ma{n}"
        if ma_col not in df.columns:
            df[ma_col] = df["close"].rolling(n).mean()
        series.append({"name": f"MA{n}", "type": "line", "data": df[ma_col].round(2).tolist(),
                       "smooth": True, "showSymbol": False, "lineStyle": {"width": 1}})

    # 布林线
    if use_boll:
        for col, color, width in [("boll_upper", "#e6a23c", 1), ("boll_mid", "#909399", 1), ("boll_lower", "#e6a23c", 1)]:
            if col not in df.columns:
                mid = df["close"].rolling(20).mean()
                std = df["close"].rolling(20).std()
                if col == "boll_mid":
                    df[col] = mid
                elif col == "boll_upper":
                    df[col] = mid + 2 * std
                else:
                    df[col] = mid - 2 * std
            series.append({"name": col, "type": "line", "data": df[col].round(2).tolist(),
                           "showSymbol": False, "lineStyle": {"color": color, "width": width}})

    # 成交量柱（副图1）及其均线
    vol_data = [[r["date"].strftime("%Y-%m-%d"), round(r["volume"], 0),
                 1 if r["close"] >= r["open"] else -1] for _, r in df.iterrows()]
    vol_series = {
        "name": "成交量", "type": "bar", "xAxisIndex": 1, "yAxisIndex": 1,
        "data": vol_data,
        "itemStyle": {"color": "__FUNC_VOL_COLOR__"},
        "barMaxWidth": 5,
    }
    # 成交量均线（副图1，叠加在成交量上）
    vol_ma_series = []
    for n in vol_ma_list:
        vma_col = f"vma{n}"
        if vma_col not in df.columns:
            df[vma_col] = df["volume"].rolling(n).mean()
        vol_ma_series.append({"name": f"成交量MA{n}", "type": "line", "xAxisIndex": 1, "yAxisIndex": 1,
                              "data": df[vma_col].round(0).tolist(),
                              "smooth": True, "showSymbol": False, "lineStyle": {"width": 1}})

    # 净值曲线（副图2）
    equity_series = []
    if "equity" in df.columns:
        equity_series.append({"name": "净值", "type": "line", "xAxisIndex": 2, "yAxisIndex": 2,
                              "data": df["equity"].round(2).tolist(),
                              "smooth": True, "showSymbol": False,
                              "lineStyle": {"width": 2, "color": "#409eff"},
                              "areaStyle": {"opacity": 0.15, "color": "#409eff"}})

    return series, vol_series, vol_ma_series, equity_series, dates


def render_html(df, trades, metrics, symbol_full, strategy, params, ma_list=(5, 10, 20),
                use_boll=False, use_vol=True, show_equity=True, rules=None, stock_info=None):
    """生成自包含 HTML 报告。

    df 需包含列: date/open/high/low/close/volume(, equity 可选 — 净值曲线)
    rules: 可选 dict，含 overview/buy_rule/sell_rule，用于显示"策略说明"。
           （通常是 strategy.get_rules() 的返回值；自定义策略也能自动展示。）
    stock_info: 可选 dict，含 name/industry/region/concepts/pe，显示个股基本信息。
    """
    import json as _json
    dates = [r["date"].strftime("%Y-%m-%d") for _, r in df.iterrows()]
    series, vol_series, vol_ma_series, equity_series, _ = _build_series(
        df, ma_list, use_boll, use_vol)
    markers = _build_markers(df, trades)

    candles = series[0].copy()
    candles["markPoint"] = {
        "symbol": "arrow", "symbolSize": 18,
        "label": {"show": True, "fontSize": 10, "formatter": "{b}\n{c}", "backgroundColor": "rgba(0,0,0,0.5)", "color": "#fff"},
        "data": markers,
        "itemStyle": {"color": "__FUNC_MP_COLOR__"},
    }
    plot_series = [candles] + series[1:]
    if use_vol:
        plot_series += [vol_series] + vol_ma_series
    title_legend = ['K线'] + [f'MA{n}' for n in ma_list]
    if use_boll:
        title_legend += ['boll_upper', 'boll_mid', 'boll_lower']
    if show_equity and equity_series:
        plot_series += equity_series
        title_legend += ['净值']

    # ---- 布局：3 个 grid ----
    grid = [
        {"left": 60, "right": 20, "top": 30, "height": "48%"},                      # 主图
    ]
    xax = [{"type": "category", "data": dates, "boundaryGap": True}]
    yax = [{"scale": True}]
    if use_vol:
        grid.append({"left": 60, "right": 20, "top": "55%", "height": "16%"})        # 成交量
        xax.append({"type": "category", "gridIndex": 1, "data": dates, "axisLabel": {"show": False}, "boundaryGap": True})
        yax.append({"gridIndex": 1, "scale": True})
    if show_equity and equity_series:
        grid.append({"left": 60, "right": 20, "top": "74%", "height": "18%"})        # 净值
        xax.append({"type": "category", "gridIndex": 2, "data": dates, "axisLabel": {"show": False}, "boundaryGap": True})
        yax.append({"gridIndex": 2, "scale": True})

    # ---- 缩放聚焦交易区间 ----
    # 根据第一笔/最后一笔交易计算 start/end 百分比
    start_pct, end_pct = 20, 100
    if not trades.empty and len(dates) > 1:
        t_dates = trades["date"].tolist()
        if t_dates:
            first_t, last_t = t_dates[0], t_dates[-1]
            if first_t in dates and last_t in dates:
                i_first = dates.index(first_t)
                i_last = dates.index(last_t)
                n = len(dates)
                start_pct = max(0, int((i_first / n) * 100))
                end_pct = max(30, min(100, int(((i_last + 1) / n) * 100)))

    # ---- 指标卡片 ----
    card = (f"<div class='grid'>"
            f"<div class='metric'><div class='v'>{metrics['total_return']}%</div><div class='l'>总收益率</div></div>"
            f"<div class='metric'><div class='v'>{metrics['cagr']}%</div><div class='l'>年化收益</div></div>"
            f"<div class='metric'><div class='v'>{metrics['max_drawdown']}%</div><div class='l'>最大回撤</div></div>"
            f"<div class='metric'><div class='v'>{metrics['sharpe']}</div><div class='l'>夏普比率</div></div>"
            f"<div class='metric'><div class='v'>{metrics['win_rate']}%</div><div class='l'>胜率</div></div>"
            f"<div class='metric'><div class='v'>{metrics['profit_factor']}</div><div class='l'>盈亏比</div></div>"
            f"</div>")

    warn = '<div class="warn">⚠️ 回测区间不足 3 年，参考价值有限。</div>' if metrics.get("short_window_warning") else ""
    param_str = f"策略 {strategy} · {params} · 区间 {metrics['start']}~{metrics['end']} · 初始 {metrics['initial_capital']:,} 元 · 交易 {metrics['num_trades']} 笔 · 期末 {metrics['final_equity']:,} 元"

    # ---- 策略说明区块（买入/卖出逻辑中文说明）----
    rules_section = ""
    if rules:
        ov = rules.get("overview", "")
        buy = rules.get("buy_rule", "")
        sell = rules.get("sell_rule", "")
        if ov or buy or sell:
            parts = []
            if ov:
                parts.append(f"<div class='rule'><b>策略简介</b><p>{ov}</p></div>")
            if buy:
                parts.append(f"<div class='rule buy'><b>🔴 买入条件</b><p>{buy}</p></div>")
            if sell:
                parts.append(f"<div class='rule sell'><b>🟢 卖出条件</b><p>{sell}</p></div>")
            rules_section = (
                "<h2>策略说明</h2>"
                "<div class='rules'>" + "".join(parts) + "</div>"
            )

    # ---- 个股基本信息（名称/最新价/行业等）----
    stock_info_str = ""
    title_display = symbol_full
    if stock_info:
        name = stock_info.get("name")
        if name:
            title_display = f"{name}（{symbol_full}）"
        items = []
        if name:
            items.append(f"<span><b>名称</b>：{name}</span>")
        if stock_info.get("price"):
            price = stock_info["price"]
            chg = stock_info.get("change_pct")
            if chg is not None:
                color = "#ef232a" if chg >= 0 else "#14b143"
                arrow = "▲" if chg >= 0 else "▼"
                items.append(f"<span><b>最新价</b>：{price} "
                             f"<span style='color:{color}'>{arrow} {chg:+.2f}%</span></span>")
            else:
                items.append(f"<span><b>最新价</b>：{price}</span>")
        if stock_info.get("industry"):
            items.append(f"<span><b>行业</b>：{stock_info['industry']}</span>")
        if stock_info.get("region"):
            items.append(f"<span><b>地域</b>：{stock_info['region']}</span>")
        if stock_info.get("pe"):
            items.append(f"<span><b>市盈率(PE)</b>：{stock_info['pe']}</span>")
        if stock_info.get("concepts"):
            items.append(f"<span class='concepts'><b>概念</b>：{stock_info['concepts']}</span>")
        if items:
            stock_info_str = "<div class='stock-info'>" + " · ".join(items) + "</div>"

    # ---- 逐笔交易明细表 ----
    trades_table = ""
    if not trades.empty:
        rows = []
        for _, t in trades.iterrows():
            pnl = t.get("pnl")
            pnl_pct = t.get("pnl_pct")
            if pnl is None:
                pnl_str = '<span style="color:#409eff">—</span>'
                pnl_pct_str = ""
            else:
                color = "#ef232a" if pnl >= 0 else "#14b143"  # 中国习惯：红涨绿跌
                arrow = "▲" if pnl >= 0 else "▼"
                pnl_str = f'<span style="color:{color}">{arrow} {pnl:,.2f}</span>'
                pnl_pct_str = f'<span style="color:{color}">({pnl_pct:+.2f}%)</span>'
            rows.append(
                f"<tr><td>{t['date']}</td>"
                f"<td>{'买入' if t['type']=='buy' else '卖出'}</td>"
                f"<td>{t['price']:,.2f}</td>"
                f"<td>{t['shares']:,}</td>"
                f"<td>{pnl_str}</td><td>{pnl_pct_str}</td></tr>"
            )
        buys = len(trades[trades["type"] == "buy"])
        sells = len(trades[trades["type"] == "sell"])
        trades_table = (
            "<h2>逐笔交易明细</h2>"
            f"<div class='info'>共 {buys} 次买入 / {sells} 次卖出</div>"
            "<table class='trades'><thead><tr>"
            "<th>日期</th><th>方向</th><th>价格</th><th>股数</th><th>盈亏</th><th>盈亏%</th>"
            "</tr></thead><tbody>" + "".join(rows) + "</tbody></table>"
        )

    tooltip_js = (
        "function(params) {"
        "var out = '<b>' + params[0].axisValue + '</b>';"
        "for (var i = 0; i < params.length; i++) {"
        "var p = params[i], v = p.value;"
        "if (p.seriesType === 'candlestick') {"
        "out += '<br/>开&nbsp;&nbsp;盘：' + v[0] + '<br/>收&nbsp;&nbsp;盘：' + v[1]"
        "+ '<br/>最&nbsp;&nbsp;低：' + v[2] + '<br/>最&nbsp;&nbsp;高：' + v[3];"
        "} else if (Array.isArray(v)) {"
        "var val = (v.length >= 2) ? v[1] : v[0];"
        "out += '<br/>' + p.seriesName + '：' + (typeof val === 'number' ? val.toFixed(2) : val);"
        "} else {"
        "var dv = (typeof v === 'number') ? v.toFixed(2) : v;"
        "out += '<br/>' + p.seriesName + '：' + dv;"
        "}"
        "}"
        "return out;"
        "}"
    )
    option = {
        "backgroundColor": "#fff",
        "axisPointer": {"link": [{"xAxisIndex": "all"}], "lineStyle": {"color": "#999", "type": "dashed", "width": 1}, "crossStyle": {"color": "#999"}, "snap": True, "z": 100},
        "tooltip": {"trigger": "axis", "axisPointer": {"type": "cross"}, "formatter": "__FUNC_TOOLTIP__"},
        "legend": {"data": title_legend, "top": 0},
        "grid": grid,
        "xAxis": xax,
        "yAxis": yax,
        "dataZoom": [
            {"type": "inside", "xAxisIndex": [0, 1, 2], "start": start_pct, "end": end_pct},
            {"type": "slider", "xAxisIndex": [0, 1, 2], "bottom": 0, "start": start_pct, "end": end_pct}
        ],
        "series": plot_series
    }
    _option_json = _json.dumps(option, ensure_ascii=False)
    n_days = len(dates)

    html = f"""<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>回测报告 · {symbol_full} {strategy}</title>
<style>
body{{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:20px;color:#1f2328;background:#fff}}
h1{{font-size:22px}} h2{{font-size:16px;border-bottom:1px solid #ddd;padding-bottom:6px}}
.grid{{display:flex;flex-wrap:wrap;gap:12px;margin:14px 0}}
.metric{{flex:1 1 130px;background:#f6f8fa;border:1px solid #e1e4e8;border-radius:8px;padding:12px;text-align:center}}
.metric .v{{font-size:20px;font-weight:700}} .metric .l{{font-size:12px;color:#57606a;margin-top:4px}}
.warn{{background:#fff8e1;border:1px solid #f0c36d;padding:10px;border-radius:8px;margin:10px 0}}
.disc{{background:#f1f1f1;font-size:12px;color:#57606a;padding:10px;border-radius:8px;margin-top:16px}}
.info{{font-size:13px;color:#57606a;margin:8px 0}}
table.trades{{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0}}
table.trades th,table.trades td{{border:1px solid #e1e4e8;padding:6px 10px;text-align:right}}
table.trades th{{background:#f6f8fa}}
table.trades td:nth-child(1),table.trades th:nth-child(1){{text-align:left}}
.rules{{margin:12px 0;display:flex;flex-wrap:wrap;gap:10px}}
.rule{{flex:1 1 280px;border:1px solid #e1e4e8;border-radius:8px;padding:10px 12px;background:#fafbfc}}
.rule b{{font-size:13px;display:block;margin-bottom:4px}}
.rule p{{font-size:13px;color:#24292f;margin:0;line-height:1.5}}
.rule.buy{{border-left:3px solid #ef232a;background:#fff5f5}}
.rule.sell{{border-left:3px solid #14b143;background:#f5fff7}}
.stock-info{{margin:10px 0;padding:10px 12px;background:#f0f7ff;border:1px solid #d6e9ff;border-radius:8px;font-size:13px;color:#1f2328;line-height:1.6}}
.stock-info span{{margin-right:14px}}
.stock-info .concepts{{color:#57606a;word-break:break-all}}
.stock-info b{{color:#0366d6}}
#chart{{width:100%;height:820px}}
.btn-print{{position:fixed;top:16px;right:16px;z-index:999;background:#409eff;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,0.2)}}
.btn-print:hover{{background:#337ecc}}
@media print{{
  .btn-print{{display:none}}
  body{{margin:0}}
  #chart{{height:60vh}}
  h1{{margin-top:0}}
  .no-print{{display:none}}
}}
</style>
{_load_echarts_script()}
</head><body>
<button class="btn-print" onclick="window.print()">🖨️ 导出 PDF</button>
<h1>回测报告 · {title_display}</h1>
{stock_info_str}
{warn}
{card}
<div class="info"><b>参数</b>：{param_str}</div>
<div class="info"><b>数据来源</b>：{metrics['data_source']} · <b>获取时间</b>：{metrics['fetched_at']}</div>
{rules_section}
<div id="chart"></div>
{trades_table}
<h2>免责声明</h2>
<div class="disc">本报告为历史回测模拟，已计入佣金/印花税并处理 T+1。回测含生存偏差与过拟合风险，<b>不构成任何投资建议，过去表现不代表未来收益</b>。</div>
<script>
var chart = echarts.init(document.getElementById('chart'));
var option = {_option_json};
chart.setOption(option);
window.addEventListener('resize', function() {{ chart.resize(); }});
// —— 键盘交互：上下键缩放，左右键移动K线，多图联动 ——
(function() {{
    var total = {n_days};   // 总K线数
    var winSize = total;    // 当前窗口大小(K线数)
    var winStart = 0;       // 当前窗口起点
    function apply() {{
        var start = Math.round(winStart / total * 100);
        var end = Math.round((winStart + winSize) / total * 100);
        chart.dispatchAction({{type: 'dataZoom', start: start, end: end}});
    }}
    window.addEventListener('keydown', function(e) {{
        var step = Math.max(1, Math.round(winSize * 0.1));  // 每次移动/缩放 10%
        if (e.key === 'ArrowUp') {{          // 上键：放大(窗口变小)
            winSize = Math.max(5, winSize - step);
            apply();
        }} else if (e.key === 'ArrowDown') {{ // 下键：缩小(窗口变大)
            winSize = Math.min(total, winSize + step);
            apply();
        }} else if (e.key === 'ArrowRight') {{ // 右键：移后一个K线
            winStart = Math.min(total - winSize, winStart + step);
            apply();
        }} else if (e.key === 'ArrowLeft') {{  // 左键：移前一个K线
            winStart = Math.max(0, winStart - step);
            apply();
        }}
    }});
}})();
</script>
</body></html>"""

    # 把占位符替换成真正的 JS 函数（必须用真实函数，不能是字符串）
    html = html.replace(
        '"__FUNC_TOOLTIP__"',
        tooltip_js
    ).replace(
        '"__FUNC_VOL_COLOR__"',
        "function(params){return params.data[2]>0?'#ef232a':'#14b143';}"
    ).replace(
        '"__FUNC_MP_COLOR__"',
        "function(p){return p.data.name==='买入'?'#ef232a':'#14b143';}"
    )
    return html
