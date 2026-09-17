import type { FilterConfig, TableColumn } from '../types/table'
import { createEmptyCondition, uid } from './filter'

/** 字段别名：真实 TikTok 素材表 → 业务语义 */
const FIELD_ALIASES: Record<string, string[]> = {
  roi: ['ROI', 'roi'],
  orders: ['SKU 订单数', '订单数', 'SKU订单数', 'Orders', 'conversions'],
  cost: ['成本', 'Cost', 'Spend', '花费'],
  age: ['素材天数', '投放天数'],
  impressions: ['Product ad impressions', '曝光', '曝光数量', 'Impressions', '展示'],
  ctr: ['Product ad click rate', '点击率', 'CTR', 'Click rate'],
}

function findField(columns: TableColumn[], aliases: string[]): string | null {
  const lowerMap = new Map(columns.map((c) => [c.key.toLowerCase(), c.key]))
  const titleMap = new Map(columns.map((c) => [c.title.toLowerCase(), c.key]))
  for (const alias of aliases) {
    const hit = lowerMap.get(alias.toLowerCase()) || titleMap.get(alias.toLowerCase())
    if (hit) return hit
  }
  // 模糊包含
  for (const col of columns) {
    const blob = `${col.key} ${col.title}`.toLowerCase()
    if (aliases.some((a) => blob.includes(a.toLowerCase()))) return col.key
  }
  return null
}

export function resolveCreativeFields(columns: TableColumn[]) {
  return {
    roi: findField(columns, FIELD_ALIASES.roi),
    orders: findField(columns, FIELD_ALIASES.orders),
    cost: findField(columns, FIELD_ALIASES.cost),
    age: findField(columns, FIELD_ALIASES.age),
    impressions: findField(columns, FIELD_ALIASES.impressions),
    ctr: findField(columns, FIELD_ALIASES.ctr),
  }
}

/**
 * 最低支持条件（关停候选）— 组间 OR，组内 AND：
 * 1) ROI < 2 且 仅转化 1 单
 * 2) 成本 > 8 且 无订单
 * 3) 素材天数 > 5 且 成本 > 5 且 无订单
 * 4) 素材天数 > 2 且 成本 > 3 且 无订单 且 曝光 < 300 且 点击率 < 3%
 *
 * 点击率按百分数比较（导入时已将 0.05 → 5）。
 */
export function buildLowSupportPreset(columns: TableColumn[]): {
  filters: FilterConfig
  missing: string[]
  labels: string[]
} {
  const f = resolveCreativeFields(columns)
  const missing: string[] = []
  const need = [
    ['ROI', f.roi],
    ['SKU 订单数', f.orders],
    ['成本', f.cost],
    ['素材天数', f.age],
    ['曝光', f.impressions],
    ['点击率', f.ctr],
  ] as const
  need.forEach(([label, key]) => {
    if (!key) missing.push(label)
  })

  const cond = (
    field: string | null,
    operator: FilterConfig['groups'][0]['conditions'][0]['operator'],
    value?: unknown,
    value2?: unknown,
  ) => ({
    ...createEmptyCondition(),
    id: uid('c'),
    field: field ?? '',
    operator,
    value,
    value2,
  })

  const labels = [
    'ROI低于2 且 仅转化1单',
    '成本大于8 且 无订单转化',
    '素材超过5天 且 成本大于5 且 无订单',
    '素材超过2天 且 成本大于3 且 无订单 且 曝光<300 且 点击率<3%',
  ]

  const filters: FilterConfig = {
    groupLogic: 'OR',
    groups: [
      {
        id: uid('g'),
        conditions: [
          cond(f.roi, 'lessThan', 2),
          cond(f.orders, 'equals', 1),
        ],
      },
      {
        id: uid('g'),
        conditions: [
          cond(f.cost, 'greaterThan', 8),
          cond(f.orders, 'equals', 0),
        ],
      },
      {
        id: uid('g'),
        conditions: [
          cond(f.age, 'greaterThan', 5),
          cond(f.cost, 'greaterThan', 5),
          cond(f.orders, 'equals', 0),
        ],
      },
      {
        id: uid('g'),
        conditions: [
          cond(f.age, 'greaterThan', 2),
          cond(f.cost, 'greaterThan', 3),
          cond(f.orders, 'equals', 0),
          cond(f.impressions, 'lessThan', 300),
          cond(f.ctr, 'lessThan', 3),
        ],
      },
    ],
  }

  return { filters, missing, labels }
}

export const BUILTIN_PRESET_NAME = '最低支持条件（关停候选）'

export const LOW_SUPPORT_RULE_TEXT = [
  'ROI低于2，且只转化了1单',
  '成本大于8，且无订单转化',
  '素材时间超过5天，成本大于5，且无订单转化',
  '素材时间超过2天，成本大于3，且无订单转化，且曝光数量小于300，且点击率小于3%',
]
