#!/usr/bin/env python3
"""
返货余额监控 - 数据处理脚本（含转入/转出建议 + 边缘账户处理）
用法: python3 update_data.py <Excel文件路径> [--days 10]
输出: account_data.json（供 HTML 仪表盘使用）

边缘账户处理规则：
- 有消耗但返货消耗为0 → 按日均消耗×10% 估算返货需求
- 近期无消耗但返货余额>0 → 余额闲置，建议全额转出

调拨天数（--days）默认 10 天，可手动指定；仪表盘页面内也可随时调整。
"""
import sys, json
import pandas as pd
import numpy as np

DEFAULT_TARGET_DAYS = 10
FALLBACK_RATIO = 0.10  # 返货消耗为0时，按总消耗的10%估算


def process(file_path, target_days=DEFAULT_TARGET_DAYS):
    df = pd.read_excel(file_path, sheet_name=0)

    accounts = []
    for (acc_name, acc_id), group in df.groupby(['账户名称', '账户ID']):
        spend_days = group[group['账户总消耗'] > 0]

        if len(spend_days) == 0:
            # 完全无消耗：如果返货余额>0，标记为闲置余额可转出
            latest_date = str(group['日期'].max())
            latest_row = group[group['日期'] == latest_date].iloc[-1]
            rebate_balance = float(latest_row['普通返货余额'])
            if rebate_balance > 0:
                accounts.append({
                    'name': str(acc_name), 'id': str(acc_id),
                    'type': str(latest_row['账户类型']),
                    'entity': str(latest_row['主体名称']),
                    'agent': str(latest_row['所属代理商']) if pd.notna(latest_row['所属代理商']) else '',
                    'statsDays': 0, 'totalSpend': 0, 'dailyAvgSpend': 0,
                    'dailyRebateSpend': 0, 'totalRebateSpend': 0,
                    'rebateBalance': round(rebate_balance, 2),
                    'daysSupported': 999999, 'latestDate': latest_date,
                    'alert': False, 'edgeCase': 'idle'
                })
            continue

        num_days = int(spend_days['日期'].nunique())
        total_spend = float(spend_days['账户总消耗'].sum())
        daily_avg = total_spend / num_days
        total_rebate_spend = float(spend_days['账户消耗-普通返货'].sum())
        daily_rebate = total_rebate_spend / num_days

        latest_date = str(group['日期'].max())
        latest_row = group[group['日期'] == latest_date].iloc[-1]
        rebate_balance = float(latest_row['普通返货余额'])

        edge_case = None
        if daily_rebate == 0 and total_spend > 0:
            daily_rebate = daily_avg * FALLBACK_RATIO
            edge_case = 'estimated'

        days_supported = rebate_balance / daily_rebate if daily_rebate > 0 else float('inf')

        accounts.append({
            'name': str(acc_name), 'id': str(acc_id),
            'type': str(latest_row['账户类型']),
            'entity': str(latest_row['主体名称']),
            'agent': str(latest_row['所属代理商']) if pd.notna(latest_row['所属代理商']) else '',
            'statsDays': num_days,
            'totalSpend': round(total_spend, 2),
            'dailyAvgSpend': round(daily_avg, 2),
            'dailyRebateSpend': round(daily_rebate, 2),
            'totalRebateSpend': round(total_rebate_spend, 2),
            'rebateBalance': round(rebate_balance, 2),
            'daysSupported': round(float(days_supported), 1) if days_supported != float('inf') else 999999,
            'latestDate': latest_date,
            'alert': bool(days_supported < target_days),
            'edgeCase': edge_case
        })

    accounts.sort(key=lambda x: x['daysSupported'])

    # 转入/转出分析（含边缘账户）
    insufficient, sufficient = [], []
    for a in accounts:
        dr = a['dailyRebateSpend']
        bal = a['rebateBalance']
        edge = a.get('edgeCase')

        if edge == 'idle':
            if bal > 0:
                sufficient.append({**a, 'targetBalance': 0, 'transferAmount': -bal})
            continue

        if edge == 'estimated':
            target = dr * target_days
            diff = round(target - bal, 2)
            entry = {**a, 'targetBalance': round(target, 2), 'transferAmount': diff}
            (insufficient if diff > 0 else sufficient).append(entry)
            continue

        if dr <= 0 or a['daysSupported'] >= 999999:
            continue

        target = dr * target_days
        diff = round(target - bal, 2)
        entry = {**a, 'targetBalance': round(target, 2), 'transferAmount': diff}
        (insufficient if diff > 0 else sufficient).append(entry)

    insufficient.sort(key=lambda x: x['transferAmount'], reverse=True)
    # 闲置余额优先转出，其次是正常盈余
    idle_suf = [a for a in sufficient if a.get('edgeCase') == 'idle']
    normal_suf = [a for a in sufficient if a.get('edgeCase') != 'idle']
    idle_suf.sort(key=lambda x: x['rebateBalance'], reverse=True)
    normal_suf.sort(key=lambda x: x['transferAmount'])
    sufficient = idle_suf + normal_suf

    total_need = round(sum(a['transferAmount'] for a in insufficient), 2)
    total_can = round(abs(sum(a['transferAmount'] for a in sufficient)), 2)

    total = len(accounts)
    alert_cnt = sum(1 for a in accounts if a['alert'])
    zero_cnt = sum(1 for a in accounts if a['rebateBalance'] == 0)
    idle_cnt = sum(1 for a in accounts if a.get('edgeCase') == 'idle')

    summary = {
        'totalAccounts': total,
        'alertAccounts': alert_cnt,
        'safeAccounts': total - alert_cnt,
        'zeroBalanceAccounts': zero_cnt,
        'idleAccounts': idle_cnt,
        'reportDate': str(df['日期'].max()),
        'dateRange': f"{df['日期'].min()} ~ {df['日期'].max()}",
        'dataDays': int(df['日期'].nunique())
    }

    return {
        'summary': summary,
        'accounts': accounts,
        'transferAnalysis': {
            'targetDays': target_days,
            'insufficient': insufficient,
            'sufficient': sufficient,
            'totalNeedIn': total_need,
            'totalCanOut': total_can,
            'gap': round(max(total_need - total_can, 0), 2),
            'surplus': round(max(total_can - total_need, 0), 2),
        }
    }


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='返货余额监控 - 数据处理')
    parser.add_argument('file', help='Excel 日结报表路径')
    parser.add_argument('--days', type=int, default=DEFAULT_TARGET_DAYS,
                        help=f'目标调拨天数（默认 {DEFAULT_TARGET_DAYS}），转入/转出按此天数计算')
    args = parser.parse_args()

    result = process(args.file, args.days)

    with open('account_data.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2, default=str)

    s = result['summary']
    t = result['transferAnalysis']
    idle = sum(1 for a in result['accounts'] if a.get('edgeCase') == 'idle')
    est = sum(1 for a in result['accounts'] if a.get('edgeCase') == 'estimated')

    print(f"✅ 处理完成: {s['totalAccounts']} 个账户（在投+闲置）")
    print(f"   ⚠️  不足{args.days}天: {s['alertAccounts']}")
    print(f"   ✅ 充足: {s['safeAccounts']}")
    print(f"   🪫 余额为0: {s['zeroBalanceAccounts']}")
    print(f"   🔶 按10%估算（返货消耗=0）: {est}")
    print(f"   💤 闲置余额（无消耗）: {idle}")
    print()
    print(f"💰 资金调拨建议:")
    print(f"   📥 需转入: ¥{t['totalNeedIn']:,.2f} ({len(t['insufficient'])}个)")
    print(f"   📤 可转出: ¥{t['totalCanOut']:,.2f} ({len(t['sufficient'])}个)")
    if t['gap'] > 0:
        print(f"   ⚠️ 资金缺口: ¥{t['gap']:,.2f}")
    else:
        print(f"   ✅ 净盈余: ¥{t['surplus']:,.2f}")
    print()
    print(f"   数据日期: {s['dateRange']} (共{s['dataDays']}天)")
    print(f"   输出: account_data.json")
