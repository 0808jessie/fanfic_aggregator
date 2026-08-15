export type TropeMapping = {
  key: string;
  label: string;
  aliases: string[];
  ao3Query: string;
  localQuery: string;
  cxcQuery: string;
};

// Display-only mirror of the server's default worldbuilding/trope index.
// User-created CP mappings remain local and are deliberately not mixed into
// this immutable reference catalogue.
export const DEFAULT_TROPE_MAPPINGS: TropeMapping[] = [
  { key: "ABO", label: "ABO / 歐米茄", aliases: ["ABO", "歐米茄"], ao3Query: "Alpha/Beta/Omega Dynamics", localQuery: "ABO", cxcQuery: "ABO" },
  { key: "哨嚮", label: "哨嚮 / 哨兵嚮導", aliases: ["哨嚮", "哨兵嚮導"], ao3Query: "Sentinel/Guide Dynamics", localQuery: "哨嚮 哨兵嚮導", cxcQuery: "哨嚮" },
  { key: "現代Paro", label: "現代 Paro / 現背", aliases: ["現代Paro", "現背"], ao3Query: "Alternate Universe - Modern Setting", localQuery: "現代Paro 現背", cxcQuery: "現代Paro" },
  { key: "學園Paro", label: "學園 Paro / 校園", aliases: ["學園Paro", "校園"], ao3Query: "Alternate Universe - High School", localQuery: "學園Paro 校園", cxcQuery: "學園Paro" },
  { key: "原著向", label: "原著向", aliases: ["原著向"], ao3Query: "Canon Compliant", localQuery: "原著向", cxcQuery: "原著向" },
  { key: "破鏡重圓", label: "破鏡重圓", aliases: ["破鏡重圓"], ao3Query: "Reconciliation", localQuery: "破鏡重圓", cxcQuery: "破鏡重圓" },
  { key: "雙向暗戀", label: "雙向暗戀", aliases: ["雙向暗戀"], ao3Query: "Mutual Pining", localQuery: "雙向暗戀", cxcQuery: "雙向暗戀" },
];
