type Labels = {
  sections: string;
  space: string;
  identical: string;
  healed: string;
  exitCode: (code: number) => string;
  classes: Record<string, string>;
  gates: Record<string, string>;
  statuses: Record<string, string>;
  flowKinds: Record<string, string>;
};

/** Display names only: source code, recorded logs and machine-readable data stay intact. */
export const LABELS: Record<"zh" | "en" | "ko" | "ja", Labels> = {
  zh: {
    sections: "页面导航", space: "空格", identical: "完全相同", healed: "已修复",
    exitCode: (code) => `退出码 ${code}`,
    classes: {
      selector_drift: "选择器变更", accessible_name_drift: "无障碍名称变更", timing: "等待时序",
      ambiguous: "目标不明确", product_regression: "产品功能回归", environment: "环境配置",
    },
    gates: {
      false_green_rate: "错误放行率", refusal_accuracy: "拒绝准确率",
      incorrect_refusal_rate: "错误拒绝率", error_count: "执行错误数",
    },
    statuses: { pass: "通过", fail: "失败", insufficient_sample: "样本不足" },
    flowKinds: { input: "输入", preprocess: "预处理", node: "处理节点", gate: "安全校验", router: "流程路由" },
  },
  en: {
    sections: "Sections", space: "Space", identical: "identical", healed: "healed",
    exitCode: (code) => `exit ${code}`,
    classes: {
      selector_drift: "selector_drift", accessible_name_drift: "accessible_name_drift", timing: "timing",
      ambiguous: "ambiguous", product_regression: "product_regression", environment: "environment",
    },
    gates: {
      false_green_rate: "false_green_rate", refusal_accuracy: "refusal_accuracy",
      incorrect_refusal_rate: "incorrect_refusal_rate", error_count: "error_count",
    },
    statuses: { pass: "pass", fail: "fail", insufficient_sample: "insufficient_sample" },
    flowKinds: { input: "input", preprocess: "preprocess", node: "node", gate: "gate", router: "router" },
  },
  ko: {
    sections: "페이지 탐색", space: "스페이스", identical: "완전히 동일", healed: "복구됨",
    exitCode: (code) => `종료 코드 ${code}`,
    classes: {
      selector_drift: "선택자 변경", accessible_name_drift: "접근성 이름 변경", timing: "대기 시간",
      ambiguous: "대상 불명확", product_regression: "제품 회귀", environment: "환경 설정",
    },
    gates: {
      false_green_rate: "잘못된 통과율", refusal_accuracy: "거부 정확도",
      incorrect_refusal_rate: "잘못된 거부율", error_count: "실행 오류 수",
    },
    statuses: { pass: "통과", fail: "실패", insufficient_sample: "표본 부족" },
    flowKinds: { input: "입력", preprocess: "전처리", node: "처리 노드", gate: "안전 검증", router: "라우터" },
  },
  ja: {
    sections: "ページ内ナビゲーション", space: "スペース", identical: "完全に同一", healed: "修復済み",
    exitCode: (code) => `終了コード ${code}`,
    classes: {
      selector_drift: "セレクター変更", accessible_name_drift: "アクセシブル名の変更", timing: "待機時間",
      ambiguous: "対象が不明確", product_regression: "製品の回帰", environment: "環境設定",
    },
    gates: {
      false_green_rate: "誤通過率", refusal_accuracy: "拒否の正確度",
      incorrect_refusal_rate: "誤拒否率", error_count: "実行エラー数",
    },
    statuses: { pass: "合格", fail: "不合格", insufficient_sample: "サンプル不足" },
    flowKinds: { input: "入力", preprocess: "前処理", node: "処理ノード", gate: "安全検証", router: "ルーター" },
  },
};
