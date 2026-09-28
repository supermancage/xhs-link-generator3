#!/usr/bin/env python3
"""
返货余额监控 - 数据处理脚本（含转入/转出建议 + 边缘账户处理 + 赔付返货腾挪）
用法: python3 update_data.py <Excel文件路径> [--days 10]
输出: account_data.json（供 HTML 仪表盘使用）

边缘账户处理规则：
- 有消耗但返货消耗为0 → 按日均消耗×10% 估算返货需求
- 近期无消耗但（普通/赔付）返货余额>0 → 余额闲置，建议全额转出

赔付返货规则（2026-09-28 新增）：
- 赔付返货不可抵扣消耗，只能转账/提现
  ⇒ 赔付返货余额【全额】计入「可转出」侧
  ⇒ 不参与「需转入」计算，也不参与缺口/盈余净额判断（净额只看普通返货盈余）
- 日结报表赔付维度列：账户充值-赔付返货 / 账户转账-赔付返货 /
  账户消耗-赔付返货 / 赔付返货余额（旧报表若无这些列则全部按 0 处理）

调拨天数（--days）默认 10 天，可手动指定；仪表盘页面内也可随时调整。
"""
import sys, json
import pandas as pd
import numpy as np

DEFAULT_TARGET_DAYS = 10
FALLBACK_RATIO = 0.10  # 返货消耗为0时，按总消耗的10%估算

COL_PAYOUT_BALANCE = '赔付返货余额'
COL_PAYOUT_SPEND = '账户消耗-赔付返货'


def _num(row, col):
    """安全取数值列：列不存在或值为 NaN 时返回 0.0"""
    if col not in row or pd.isna(row[col]):
        return 0.0
    try:
        return float(row[col])
    except (TypeError, ValueError):
        return 0.0


def process(file_path, target_days=DEFAULT_TARGET_DAYS):
    df = pd.read_excel(file_path, sheet_name=0)

    has_payout_bal = COL_PAYOUT_BALANCE in df.columns
    has_payout_spend = COL_PAYOUT_SPEND in df.columns

    accounts = []
    for (acc_name, acc_id), group in df.groupby(['账户名称', '账户ID']):
        spend_days = group[group['账户总消耗'] > 0]

        latest_date = str(group['日期'].max())
        latest_row = group[group['日期'] == latest_date].iloc[-1]
        rebate_balance = _num(latest_row, '普通返货余额')
        payout_balance = _num(latest_row, COL_PAYOUT_BALANCE) if has_payout_bal else 0.0

        if len(spend_days) == 0:
            # 完全无消耗：普通或赔付任一余额>0 → 闲置，全额可转出
            if rebate_balance > 0 or payout_balance > 0:
                accounts.append({
                    'name': str(acc_name), 'id': str(acc_id),
                    'type': str(latest_row['账户类型']),
                    'entity': str(latest_row['主体名称']),
                    'agent': str(latest_row['所属代理商']) if pd.notna(latest_row['所属代理商']) else '',
                    'statsDays': 0, 'totalSpend': 0, 'dailyAvgSpend': 0,
                    'dailyRebateSpend': 0, 'totalRebateSpend': 0,
                    'totalPayoutSpend': 0, 'dailyPayoutSpend': 0,
                    'rebateBalance': round(rebate_balance, 2),
                    'payoutBalance': round(payout_balance, 2),
                    'totalBalance': round(rebate_balance + payout_balance, 2),
                    'daysSupported': 999999, 'latestDate': latest_date,
                    'alert': False, 'edgeCase': 'idle'
                })
            continue

        num_days = int(spend_days['日期'].nunique())
        total_spend = float(spend_days['账户总消耗'].sum())
        daily_avg = total_spend / num_days
        total_rebate_spend = float(spend_days['账户消耗-普通返货'].sum())
        daily_rebate = total_rebate_spend / num_days
        total_payout_spend = float(spend_days[COL_PAYOUT_SPEND].sum()) if has_payout_spend else 0.0
        daily_payout = total_payout_spend / num_days

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
            'totalPayoutSpend': round(total_payout_spend, 2),
            'dailyPayoutSpend': round(daily_payout, 2),
            'rebateBalance': round(rebate_balance, 2),
            'payoutBalance': round(payout_balance, 2),
            'totalBalance': round(rebate_balance + payout_balance, 2),
            'daysSupported': round(float(days_supported), 1) if days_supported != float('inf') else 999999,
            'latestDate': latest_date,
            'alert': bool(days_supported < target_days),
            'edgeCase': edge_case
        })

    accounts.sort(key=lambda x: x['daysSupported'])

    # ---------------------------------------------------------------
    # 转入/转出分析
    #   needIn    只按普通返货缺口算（赔付返货不可抵扣消耗，不参与）
    #   normalOut 普通返货盈余（= 普通余额 - 目标水位）
    #   payoutOut 赔付返货余额（全额，因不可抵扣消耗 ⇒ 不留水位）
    #   同一账户可同时出现在「需转入」与「可转出」两侧（两笔钱性质不同）
    # ---------------------------------------------------------------
    insufficient, sufficient = [], []
    for a in accounts:
        dr = a['dailyRebateSpend']
        bal = a['rebateBalance']
        pbal = a.get('payoutBalance', 0) or 0
        edge = a.get('edgeCase')

        if edge == 'idle':
            normal_out = bal
            payout_out = pbal
            if normal_out + payout_out > 0:
                sufficient.append({**a, 'targetBalance': 0,
                                   'normalOut': round(normal_out, 2),
                                   'payoutOut': round(payout_out, 2),
                                   'transferAmount': -round(normal_out + payout_out, 2)})
            continue

        # 目标水位只针对普通返货（estimated 的 dr 已是估算值）
        target = dr * target_days if dr > 0 else 0
        need_in = round(target - bal, 2)
        normal_out = round(max(bal - target, 0), 2)
        payout_out = round(pbal, 2)

        if need_in > 0:
            insufficient.append({**a, 'targetBalance': round(target, 2),
                                 'normalOut': 0, 'payoutOut': payout_out,
                                 'transferAmount': need_in,
                                 'outTotal': payout_out})
        if normal_out + payout_out > 0:
            sufficient.append({**a, 'targetBalance': round(target, 2),
                               'normalOut': normal_out, 'payoutOut': payout_out,
                               'transferAmount': -round(normal_out + payout_out, 2)})

    insufficient.sort(key=lambda x: x['transferAmount'], reverse=True)
    # 闲置余额优先转出，其次是正常盈余；同类内按金额降序
    idle_suf = [a for a in sufficient if a.get('edgeCase') == 'idle']
    normal_suf = [a for a in sufficient if a.get('edgeCase') != 'idle']
    idle_suf.sort(key=lambda x: x['rebateBalance'] + x.get('payoutBalance', 0), reverse=True)
    normal_suf.sort(key=lambda x: x['normalOut'] + x['payoutOut'], reverse=True)
    sufficient = idle_suf + normal_suf

    total_need = round(sum(a['transferAmount'] for a in insufficient), 2)
    total_normal_out = round(sum(a['normalOut'] for a in sufficient), 2)
    total_payout_out = round(sum(a['payoutOut'] for a in sufficient), 2)
    total_can = round(total_normal_out + total_payout_out, 2)

    total = len(accounts)
    alert_cnt = sum(1 for a in accounts if a['alert'])
    zero_cnt = sum(1 for a in accounts if a['rebateBalance'] == 0)
    idle_cnt = sum(1 for a in accounts if a.get('edgeCase') == 'idle')
    payout_accounts = [a for a in accounts if (a.get('payoutBalance') or 0) > 0]

    summary = {
        'totalAccounts': total,
        'alertAccounts': alert_cnt,
        'safeAccounts': total - alert_cnt,
        'zeroBalanceAccounts': zero_cnt,
        'idleAccounts': idle_cnt,
        'payoutBalanceAccounts': len(payout_accounts),
        'totalPayoutBalance': round(sum(a['payoutBalance'] for a in payout_accounts), 2),
        'totalRebateBalance': round(sum(a['rebateBalance'] for a in accounts), 2),
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
            'totalNormalOut': total_normal_out,
            'totalPayoutOut': total_payout_out,
            'totalCanOut': total_can,
            # 净额判断只用普通返货盈余（赔付返货不可抵扣消耗，不能覆盖缺口）
            'gap': round(max(total_need - total_normal_out, 0), 2),
            'surplus': round(max(total_normal_out - total_need, 0), 2),
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
    print(f"   🪫 普通返货余额为0: {s['zeroBalanceAccounts']}")
    print(f"   🔶 按10%估算（返货消耗=0）: {est}")
    print(f"   💤 闲置余额（无消耗）: {idle}")
    print(f"   💸 有赔付返货余额: {s['payoutBalanceAccounts']} 个账户，合计 ¥{s['totalPayoutBalance']:,.2f}")
    print()
    print(f"💰 资金调拨建议（净额只看普通返货）:")
    print(f"   📥 需转入: ¥{t['totalNeedIn']:,.2f} ({len(t['insufficient'])}个)")
    print(f"   📤 可转出: ¥{t['totalCanOut']:,.2f} ({len(t['sufficient'])}个)")
    print(f"        ├ 普通返货盈余: ¥{t['totalNormalOut']:,.2f}")
    print(f"        └ 赔付返货余额: ¥{t['totalPayoutOut']:,.2f}")
    if t['gap'] > 0:
        print(f"   ⚠️ 资金缺口（普通返货口径）: ¥{t['gap']:,.2f}")
    else:
        print(f"   ✅ 净盈余（普通返货口径）: ¥{t['surplus']:,.2f}")
    print()
    print(f"   数据日期: {s['dateRange']} (共{s['dataDays']}天)")
    print(f"   输出: account_data.json")
